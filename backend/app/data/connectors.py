"""
Live point connectors (modular data-integration layer).

Each connector fetches data for ONE location on demand, caches the JSON response on disk,
and fails gracefully: the API reports ``available: false`` with the reason instead of
inventing values. Add a new dataset by writing a function that returns a ``ConnectorResult``
and registering it in ``CONNECTORS``.
"""
from __future__ import annotations

import hashlib
import io
import json
import math
import os
import time
from pathlib import Path

import numpy as np
import requests

from .grid import ROOT, SLOPE_BINS

CACHE = ROOT / "data" / "cache" / "live"
CACHE.mkdir(parents=True, exist_ok=True)
TIMEOUT = float(os.environ.get("TERRANOVA_HTTP_TIMEOUT", "12"))
UA = {"User-Agent": "TerraNova-analog-site-finder/1.0"}


def _cached(key: str, fn, ttl_s: float = 30 * 86400):
    p = CACHE / (hashlib.sha1(key.encode()).hexdigest() + ".json")
    if p.exists() and time.time() - p.stat().st_mtime < ttl_s:
        return json.loads(p.read_text())
    out = fn()
    if out.get("available"):
        p.write_text(json.dumps(out))
    return out


def nasa_power_point(lat: float, lon: float) -> dict:
    """NASA POWER climatology API for a single point (0.5° MERRA-2 / 1° CERES)."""
    url = "https://power.larc.nasa.gov/api/temporal/climatology/point"
    params = {"parameters": "T2M,T2M_MAX,T2M_MIN,ALLSKY_SFC_SW_DWN,WS10M,PRECTOTCORR,RH2M,PS",
              "community": "RE", "latitude": round(lat, 4), "longitude": round(lon, 4), "format": "JSON"}

    def go():
        try:
            r = requests.get(url, params=params, timeout=TIMEOUT, headers=UA)
            r.raise_for_status()
            j = r.json()
            return {"available": True, "source": "NASA POWER API (climatology/point)", "url": r.url,
                    "parameters": j.get("properties", {}).get("parameter", {}),
                    "units": {k: v.get("units") for k, v in j.get("parameters", {}).items()},
                    "header": j.get("header", {})}
        except Exception as e:  # noqa: BLE001
            return {"available": False, "source": "NASA POWER API", "error": f"{type(e).__name__}: {e}"[:300]}
    return _cached(f"power:{lat:.3f}:{lon:.3f}", go)


def soilgrids_point(lat: float, lon: float) -> dict:
    """ISRIC SoilGrids 2.0 REST: sand/silt/clay %, bulk density, organic carbon, 0-5 cm."""
    url = "https://rest.isric.org/soilgrids/v2.0/properties/query"
    params = [("lon", round(lon, 4)), ("lat", round(lat, 4)), ("depth", "0-5cm"), ("value", "mean")]
    params += [("property", p) for p in ("sand", "silt", "clay", "bdod", "soc", "cfvo")]

    def go():
        try:
            r = requests.get(url, params=params, timeout=TIMEOUT, headers=UA)
            r.raise_for_status()
            j = r.json()
            props = {}
            for layer in j.get("properties", {}).get("layers", []):
                d = layer["depths"][0]["values"].get("mean")
                f = layer.get("unit_measure", {}).get("d_factor", 1) or 1
                props[layer["name"]] = {"value": None if d is None else d / f,
                                        "unit": layer.get("unit_measure", {}).get("target_units")}
            return {"available": True, "source": "ISRIC SoilGrids 2.0 (250 m)", "url": r.url, "properties": props}
        except Exception as e:  # noqa: BLE001
            return {"available": False, "source": "ISRIC SoilGrids 2.0", "error": f"{type(e).__name__}: {e}"[:300]}
    return _cached(f"soil:{lat:.3f}:{lon:.3f}", go)


TERRARIUM = "https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png"


def _tile(z, x, y):
    p = ROOT / "data" / "cache" / "terrarium" / str(z) / str(x) / f"{y}.png"
    if p.exists():
        return p.read_bytes()
    r = requests.get(TERRARIUM.format(z=z, x=x, y=y), timeout=TIMEOUT, headers=UA)
    r.raise_for_status()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(r.content)
    return r.content


def terrain_sample(bounds: list[float], z: int = 10) -> dict:
    """High-resolution (~150 m at equator) elevation & slope distribution inside a 0.25° cell,
    computed from AWS Terrain Tiles at zoom 10."""
    from PIL import Image
    w, s, e_, n = bounds

    def go():
        try:
            N = 2 ** z

            def tx(lon):
                return (lon + 180) / 360 * N

            def ty(lat):
                la = math.radians(max(min(lat, 85.05), -85.05))
                return (1 - math.log(math.tan(la) + 1 / math.cos(la)) / math.pi) / 2 * N
            x0, x1 = int(tx(w)), int(tx(e_ - 1e-9))
            y0, y1 = int(ty(n)), int(ty(s + 1e-9))
            if (x1 - x0 + 1) * (y1 - y0 + 1) > 16:
                return {"available": False, "error": "cell too large for sampling"}
            elevs, slopes = [], []
            for x in range(x0, x1 + 1):
                for y in range(y0, y1 + 1):
                    a = np.asarray(Image.open(io.BytesIO(_tile(z, x, y))).convert("RGB")).astype(np.float32)
                    el = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
                    jj, ii = np.mgrid[0:256, 0:256]
                    gy = (y * 256 + jj + 0.5) / (256 * N)
                    gx = (x * 256 + ii + 0.5) / (256 * N)
                    lat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * gy))))
                    lon = gx * 360 - 180
                    px = 2 * np.pi * 6378137 * np.cos(np.radians(lat[:, 0])) / (256 * N)
                    dy, dx = np.gradient(el)
                    sl = np.degrees(np.arctan(np.hypot(dx, dy) / px[:, None]))
                    m = (lat >= s) & (lat <= n) & (lon >= w) & (lon <= e_)
                    elevs.append(el[m])
                    slopes.append(sl[m])
            el = np.concatenate(elevs)
            sl = np.concatenate(slopes)
            land = el > -5   # crude: ignore bathymetry inside coastal cells
            el, sl = el[land], sl[land]
            if el.size < 50:
                return {"available": False, "error": "no land pixels in cell"}
            eh, ee = np.histogram(el, bins=20)
            sh, _ = np.histogram(sl, bins=SLOPE_BINS)
            pix_m = 2 * np.pi * 6378137 * math.cos(math.radians((s + n) / 2)) / (256 * N)
            return {
                "available": True, "source": f"AWS Terrain Tiles zoom {z} (~{pix_m:.0f} m pixels)",
                "n_pixels": int(el.size), "pixel_m": round(pix_m, 1),
                "elev_hist": {"edges": [round(float(x), 1) for x in ee], "counts": [int(x) for x in eh]},
                "slope_hist_pct": [round(float(x) / max(sl.size, 1) * 100, 2) for x in sh],
                "elev_p5": float(np.percentile(el, 5)), "elev_p50": float(np.percentile(el, 50)),
                "elev_p95": float(np.percentile(el, 95)),
                "slope_p50": float(np.percentile(sl, 50)), "slope_p90": float(np.percentile(sl, 90)),
            }
        except Exception as e:  # noqa: BLE001
            return {"available": False, "source": "AWS Terrain Tiles", "error": f"{type(e).__name__}: {e}"[:300]}
    return _cached(f"terrain:{z}:{w:.3f}:{s:.3f}", go)


CONNECTORS = {
    "nasa_power": nasa_power_point,
    "soilgrids": soilgrids_point,
}
