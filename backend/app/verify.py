"""
NASA data verification.

After a location is selected, the climate values TerraNova used for scoring (preprocessed grid)
are cross-checked against NASA's official POWER service, in this order:

  1. NASA POWER web API  - https://power.larc.nasa.gov/api/temporal/climatology/point
  2. NASA POWER Analysis-Ready Data on AWS (s3://nasa-power), NASA's official cloud
     distribution of the same product, read live for this one grid cell.

Each variable is compared with an explicit tolerance and reported as match / mismatch /
not available. Nothing is assumed: if neither source can be reached, the result says so.
"""
from __future__ import annotations

import logging
import threading
import time

import numpy as np

from .data import connectors
from .data.grid import Grid

log = logging.getLogger("terranova.verify")

# variable -> (label, our unit, absolute tolerance, relative tolerance)
CHECKS = {
    "T2M": ("Air temperature at 2 m (annual mean)", "°C", 0.6, 0.0),
    "ALLSKY_SFC_SW_DWN": ("All-sky surface solar irradiance (annual mean)", "W/m²", 5.0, 0.05),
    "ALLSKY_KT": ("Clearness index (annual mean)", "–", 0.03, 0.0),
    "WS10M": ("Wind speed at 10 m (annual mean)", "m/s", 0.2, 0.07),
    "PRECTOTCORR": ("Precipitation (annual mean)", "mm/day", 0.15, 0.10),
    "RH2M": ("Relative humidity at 2 m (annual mean)", "%", 3.0, 0.0),
    "PS": ("Surface pressure (annual mean)", "hPa", 5.0, 0.0),
}

_ds_lock = threading.Lock()
_ds: dict[str, object] = {}


def _ours(g: Grid, lat: float, lon: float) -> dict:
    r, c = g.cell(lat, lon)
    vals = {k: g.value(k, r, c) for k in CHECKS}
    vals["T2M_monthly"] = g.monthly_series("T2M", r, c)
    return vals


def _to_our_units(var: str, value, unit: str | None):
    """POWER API units differ by community (e.g. kWh/m²/day, kPa); convert to the grid's units."""
    if value is None:
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    if v <= -998:
        return None
    u = (unit or "").lower().replace(" ", "")
    if var == "ALLSKY_SFC_SW_DWN" and "kw" in u and "day" in u:
        return v * 1000.0 / 24.0
    if var == "ALLSKY_SFC_SW_DWN" and "mj" in u and "day" in u:
        return v * 1e6 / 86400.0
    if var == "PS" and "kpa" in u:
        return v * 10.0
    return v


def _from_api(lat: float, lon: float) -> dict:
    res = connectors.nasa_power_climatology(lat, lon, list(CHECKS))
    if not res.get("available"):
        return res
    params, units = res["parameters"], res.get("units", {})
    vals = {k: _to_our_units(k, (params.get(k) or {}).get("ANN"), units.get(k)) for k in CHECKS}
    t = params.get("T2M") or {}
    vals["T2M_monthly"] = [_to_our_units("T2M", t.get(m), units.get("T2M")) for m in
                           ("JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC")]
    return {"available": True, "source": "NASA POWER API (power.larc.nasa.gov)", "url": res.get("url"),
            "values": vals, "header": res.get("header", {})}


def _from_ard(lat: float, lon: float) -> dict:
    """Read the same cell from NASA POWER Analysis-Ready Data (Zarr on AWS Open Data)."""
    try:
        import fsspec
        import xarray as xr
    except ImportError:
        return {"available": False, "source": "NASA POWER ARD (s3://nasa-power)",
                "error": "xarray/zarr/fsspec not installed on the server (pip install xarray zarr fsspec s3fs)."}
    from .data.grid import PROCESSED  # noqa: F401  (keeps import order explicit)
    urls = {"merra2": "s3://nasa-power/merra2/spatial/power_merra2_climatology_spatial_utc.zarr",
            "syn1deg": "s3://nasa-power/syn1deg/spatial/power_syn1deg_climatology_spatial_utc.zarr"}
    try:
        with _ds_lock:
            for k, u in urls.items():
                if k not in _ds:
                    _ds[k] = xr.open_zarr(fsspec.get_mapper(u, anon=True), consolidated=True)
        m, s = _ds["merra2"], _ds["syn1deg"]
        vals = {}
        for k in CHECKS:
            ds = m if k in m.data_vars else s
            v = float(ds[k].isel(time=12).sel(lat=lat, lon=lon, method="nearest").values)
            vals[k] = None if v <= -998 else v
        mon = m["T2M"].isel(time=slice(0, 12)).sel(lat=lat, lon=lon, method="nearest").values
        vals["T2M_monthly"] = [None if x <= -998 else float(x) for x in mon]
        return {"available": True, "source": "NASA POWER Analysis-Ready Data, AWS Open Data (s3://nasa-power), "
                f"{m.attrs.get('version', '')}", "url": urls["merra2"], "values": vals}
    except Exception as e:  # noqa: BLE001
        return {"available": False, "source": "NASA POWER ARD (s3://nasa-power)", "error": f"{type(e).__name__}: {e}"[:300]}


def _compare(ours: dict, nasa: dict) -> list[dict]:
    rows = []
    for k, (label, unit, atol, rtol) in CHECKS.items():
        a, b = ours.get(k), nasa.get(k)
        if a is None or b is None:
            rows.append({"variable": k, "label": label, "unit": unit, "terranova": a, "nasa": b, "status": "not_available"})
            continue
        diff = a - b
        tol = max(atol, rtol * abs(b))
        rows.append({"variable": k, "label": label, "unit": unit, "terranova": round(a, 3), "nasa": round(b, 3),
                     "difference": round(diff, 3), "tolerance": round(tol, 3), "status": "match" if abs(diff) <= tol else "mismatch"})
    am, bm = ours.get("T2M_monthly") or [], nasa.get("T2M_monthly") or []
    pairs = [(x, y) for x, y in zip(am, bm) if x is not None and y is not None]
    if pairs:
        md = max(abs(x - y) for x, y in pairs)
        rows.append({"variable": "T2M_monthly", "label": "Monthly air temperature (12 months, max difference)", "unit": "°C",
                     "terranova": None, "nasa": None, "difference": round(md, 3), "tolerance": 0.6,
                     "status": "match" if md <= 0.6 else "mismatch", "months_compared": len(pairs)})
    return rows


_cache: dict[tuple, dict] = {}


def verify_location(g: Grid, lat: float, lon: float) -> dict:
    r, c = g.cell(lat, lon)
    key = (r, c)
    if key in _cache:
        return _cache[key]
    if g.mode != "real":
        return {"status": "unavailable", "summary": "Demo mode uses synthetic data; there is nothing to verify against NASA.",
                "rows": [], "sources_tried": []}
    ours = _ours(g, lat, lon)
    tried = []
    result = None
    for fn in (_from_api, _from_ard):
        t0 = time.time()
        src = fn(lat, lon)
        tried.append({"source": src.get("source"), "available": src.get("available", False),
                      "error": src.get("error"), "url": src.get("url"), "ms": round((time.time() - t0) * 1000)})
        if src.get("available"):
            result = src
            break
    if result is None:
        out = {"status": "unavailable", "rows": [], "sources_tried": tried,
               "summary": "Could not reach any NASA source from the server, so the data could not be verified. "
                          "Check the server's internet access and try again."}
        return out   # not cached: retry later
    rows = _compare(ours, result["values"])
    checked = [x for x in rows if x["status"] != "not_available"]
    bad = [x for x in checked if x["status"] == "mismatch"]
    status = "verified" if checked and not bad else ("discrepancies" if bad else "unavailable")
    summary = (f"All {len(checked)} checked values agree with {result['source'].split(',')[0]} within tolerance."
               if status == "verified" else
               f"{len(bad)} of {len(checked)} values differ from {result['source'].split(',')[0]} beyond tolerance: "
               + ", ".join(x["label"] for x in bad) + "." if bad else "No comparable values were returned.")
    out = {"status": status, "summary": summary, "rows": rows, "source": result["source"], "url": result.get("url"),
           "sources_tried": tried, "checked_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
           "grid_cell": {"lat": round(float(90 - 0.125 - 0.25 * r), 3), "lon": round(float(-180 + 0.125 + 0.25 * c), 3)},
           "note": "Compares the climate values TerraNova used for scoring with NASA's official POWER records for the "
                   "same grid cell. Terrain, land cover and planetary reference values come from other sources and are "
                   "listed with citations in the Sources tab."}
    _cache[key] = out
    return out
