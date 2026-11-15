"""
Global grid store.

Loads the preprocessed layers written by ``scripts/build_grid.py`` and exposes them on a
common 0.25 deg equirectangular grid (row 0 = 90N, col 0 = 180W).

Climate layers from NASA POWER keep their *native* resolution information: they are
mapped onto the 0.25 deg grid by nearest-neighbour index lookup (no interpolation), so the
blockiness of the 0.5x0.625 deg (MERRA-2) and 1 deg (CERES SYN1deg) products is preserved
and no spurious detail is introduced.

If the processed files are missing, a clearly labelled SYNTHETIC demonstration grid is
generated instead (``mode == "demo"``). Demo data are never mixed with real data.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

log = logging.getLogger("terranova.grid")

ROOT = Path(__file__).resolve().parents[3]
PROCESSED = ROOT / "data" / "processed"

RES = 0.25
NLAT, NLON = 720, 1440
LAT_C = 90 - RES / 2 - RES * np.arange(NLAT)
LON_C = -180 + RES / 2 + RES * np.arange(NLON)
SLOPE_BINS = np.array([0, 1, 2, 4, 6, 10, 15, 20, 30, 90], dtype=np.float32)
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _nn_index(src_lat: np.ndarray, src_lon: np.ndarray):
    """Row/col index into a source grid for every 0.25 deg cell centre (nearest neighbour)."""
    dlat = float(np.median(np.diff(src_lat)))
    dlon = float(np.median(np.diff(src_lon)))
    ri = np.clip(np.rint((LAT_C - src_lat[0]) / dlat).astype(int), 0, len(src_lat) - 1)
    ci = np.rint((LON_C - src_lon[0]) / dlon).astype(int) % len(src_lon)
    return ri, ci


@dataclass
class Grid:
    mode: str                                   # "real" | "demo"
    layers: dict[str, np.ndarray] = field(default_factory=dict)      # 2-D (NLAT, NLON) float32
    monthly: dict[str, tuple] = field(default_factory=dict)          # name -> (array(13,lat,lon), ri, ci)
    slope_hist: np.ndarray | None = None        # (9, NLAT, NLON) percent
    labels: dict = field(default_factory=dict)
    meta: dict = field(default_factory=dict)
    land: np.ndarray | None = None              # bool (NLAT, NLON)

    # ---- point helpers ---------------------------------------------------------------
    @staticmethod
    def cell(lat: float, lon: float) -> tuple[int, int]:
        r = int(np.clip((90 - lat) / RES, 0, NLAT - 1))
        c = int(np.clip((lon + 180) / RES, 0, NLON - 1))
        return r, c

    def value(self, name: str, r: int, c: int) -> float | None:
        a = self.layers.get(name)
        if a is None:
            return None
        v = float(a[r, c])
        return None if not np.isfinite(v) else v

    def monthly_series(self, name: str, r: int, c: int) -> list[float | None] | None:
        if name not in self.monthly:
            return None
        arr, ri, ci = self.monthly[name]
        s = arr[:12, ri[r], ci[c]].astype(np.float64)
        return [None if not np.isfinite(x) else round(float(x), 3) for x in s]


def _load_real() -> Grid:
    g = Grid(mode="real")
    m = np.load(PROCESSED / "power_merra2_climatology.npz")
    s = np.load(PROCESSED / "power_syn1deg_climatology.npz")
    dem = np.load(PROCESSED / "dem_terrarium_z6_025deg.npz")
    lc = np.load(PROCESSED / "landcover_worldcover2021_025deg.npz")
    vec = np.load(PROCESSED / "vector_naturalearth_025deg.npz")
    g.labels = json.load(open(PROCESSED / "vector_labels.json", encoding="utf-8"))
    g.meta = {"power": json.load(open(PROCESSED / "power_meta.json")),
              "manifest": json.load(open(PROCESSED / "manifest.json"))}

    land = vec["land_any"].astype(bool)
    g.land = land

    def put(name, arr2d):
        a = arr2d.astype(np.float32)
        a[~land] = np.nan
        g.layers[name] = a

    # --- NASA POWER MERRA-2 (native 0.5 x 0.625 deg) ---
    ri, ci = _nn_index(m["lat"], m["lon"])
    for k in m.files:
        if k in ("lat", "lon"):
            continue
        arr = m[k]
        if arr.ndim == 3:
            g.monthly[k] = (arr, ri, ci)
            put(k, arr[12][np.ix_(ri, ci)])           # index 12 = annual climatology
        else:
            put(k, arr[np.ix_(ri, ci)])
    # --- NASA POWER CERES SYN1deg (native 1 deg) ---
    ri2, ci2 = _nn_index(s["lat"], s["lon"])
    for k in s.files:
        if k in ("lat", "lon"):
            continue
        arr = s[k]
        if arr.ndim == 3:
            g.monthly[k] = (arr, ri2, ci2)
            put(k, arr[12][np.ix_(ri2, ci2)])
        else:
            put(k, arr[np.ix_(ri2, ci2)])

    # POWER uses -999 fill values
    for k, a in g.layers.items():
        a[a <= -998] = np.nan

    # --- Derived climate quantities (documented in parameters.py) ---
    t_monthly = g.monthly["T2M"][0][:12][:, ri][:, :, ci].astype(np.float32)
    put("T2M_SEASONAL_RANGE", np.nanmax(t_monthly, 0) - np.nanmin(t_monthly, 0))
    dh = g.monthly["DAY_HOURS"][0][:12][:, ri2][:, :, ci2].astype(np.float32)
    dh[dh < 0] = np.nan
    put("DAYLIGHT_FRAC_MIN", np.nanmin(dh, 0) / 24.0)
    put("DAYLIGHT_FRAC_MAX", np.nanmax(dh, 0) / 24.0)
    put("DAYLIGHT_FRAC_MEAN", np.nanmean(dh, 0) / 24.0)
    sw = g.monthly["ALLSKY_SFC_SW_DWN"][0][:12][:, ri2][:, :, ci2].astype(np.float32)
    sw[sw < 0] = np.nan
    with np.errstate(invalid="ignore", divide="ignore"):
        put("SOLAR_SEASONAL_RATIO", np.nanmin(sw, 0) / np.nanmax(sw, 0))

    # Aridity index AI = P / PET, PET from the Hargreaves-Samani (1985) equation, FAO-56 eq. 52:
    #   ET0 = 0.0023 * Ra * (Tmean + 17.8) * sqrt(Tmax - Tmin)   [mm/day], Ra in mm/day
    # Ra (extraterrestrial radiation) is taken from POWER TOA_SW_DWN (W m-2 -> MJ m-2 d-1 / 2.45).
    toa = g.monthly["TOA_SW_DWN"][0][:12][:, ri2][:, :, ci2].astype(np.float32)
    ra_mm = toa * 0.0864 / 2.45
    tmax = g.monthly["T2M_MAX_AVG"][0][:12][:, ri][:, :, ci].astype(np.float32)
    tmin = g.monthly["T2M_MIN_AVG"][0][:12][:, ri][:, :, ci].astype(np.float32)
    pet = 0.0023 * ra_mm * (t_monthly + 17.8) * np.sqrt(np.clip(tmax - tmin, 0, None))
    pet = np.clip(pet, 0, None)
    pr = g.monthly["PRECTOTCORR"][0][:12][:, ri][:, :, ci].astype(np.float32)
    with np.errstate(invalid="ignore", divide="ignore"):
        ai = np.nansum(pr, 0) / np.maximum(np.nansum(pet, 0), 1e-3)
    put("ARIDITY_INDEX", np.clip(ai, 0, 5))

    # --- DEM (AWS Terrain Tiles, z6 aggregated to 0.25 deg) ---
    npix = dem["dem_npix"]
    for k in ("elev_mean", "elev_std", "elev_min", "elev_max", "rough_m", "slope_mean"):
        a = dem[k].astype(np.float32)
        a[npix < 4] = np.nan
        put(k, a)
    put("relief_m", g.layers["elev_max"] - g.layers["elev_min"])
    sh = dem["slope_hist"].astype(np.float32)
    sh[:, npix < 4] = np.nan
    g.slope_hist = sh
    # 90th-percentile slope from the cumulative histogram (linear interpolation within bins)
    put("slope_p90", _hist_percentile(sh, 90))
    put("slope_p50", _hist_percentile(sh, 50))

    # --- ESA WorldCover 2021 fractions ---
    valid = lc["lc_valid"]
    for k in lc.files:
        if k == "lc_valid":
            continue
        a = lc[k].astype(np.float32)
        a[~valid] = np.nan
        put(k, a)
    veg = sum(np.nan_to_num(g.layers[f"lc_{c}"]) for c in ("tree", "shrub", "grass", "crop", "wetland",
                                                           "mangrove", "moss_lichen"))
    vegf = veg.astype(np.float32)
    vegf[~valid] = np.nan
    put("lc_vegetation", vegf)

    # Water-ice proxy: max(WorldCover permanent snow/ice fraction, MERRA-2 FRSNO annual mean,
    # perennially frozen surface = annual-maximum skin temperature below 0 °C). The last term
    # covers Antarctica, which ESA WorldCover does not map.
    frozen = (np.nan_to_num(g.layers["TS_MAX"], nan=99) < 0).astype(np.float32)
    put("ICE_FRACTION", np.fmax(np.fmax(np.nan_to_num(g.layers["lc_snow_ice"]), np.nan_to_num(g.layers.get("FRSNO", np.zeros_like(vegf)))), frozen))
    put("dist_ice_km", _distance_to(g.layers["ICE_FRACTION"] >= 0.3, land))

    # --- Natural Earth ---
    put("dist_road_km", vec["dist_road_km"])
    put("dist_place_km", vec["dist_place_km"])
    put("dist_city100k_km", vec["dist_city100k_km"])
    g.layers["country_idx"] = vec["country_idx"]
    g.layers["region_idx"] = vec["region_idx"]
    g.layers["place_idx"] = vec["place_idx"]
    # Protected areas: Natural Earth only covers the USA -> elsewhere unknown (NaN).
    prot = np.full((NLAT, NLON), np.nan, np.float32)
    usa = [i for i, c in enumerate(g.labels["countries"]) if c.get("iso3") == "USA"]
    in_usa = np.isin(vec["country_idx"], usa) & land
    prot[in_usa] = 0.0
    prot[(vec["protected_idx"] >= 0) & land] = 1.0
    g.layers["protected"] = prot

    # Cell area (km^2) for the minimum-area constraint
    g.layers["cell_area_km2"] = (np.cos(np.radians(LAT_C))[:, None] * (RES * 111.195) ** 2
                                 * np.ones((1, NLON))).astype(np.float32)
    log.info("Loaded REAL grid: %d land cells", int(land.sum()))
    return g


def _hist_percentile(h: np.ndarray, p: float) -> np.ndarray:
    tot = np.nansum(h, 0)
    cum = np.cumsum(np.nan_to_num(h), 0) / np.maximum(tot, 1e-6)[None] * 100
    out = np.full(h.shape[1:], np.nan, np.float32)
    lo = np.zeros(h.shape[1:], np.float32)
    done = np.zeros(h.shape[1:], bool)
    prev = np.zeros(h.shape[1:], np.float32)
    for b in range(h.shape[0]):
        hit = (~done) & (cum[b] >= p)
        frac = np.where(cum[b] - prev > 0, (p - prev) / np.maximum(cum[b] - prev, 1e-6), 0)
        val = SLOPE_BINS[b] + frac * (SLOPE_BINS[b + 1] - SLOPE_BINS[b])
        out[hit] = val[hit]
        done |= hit
        prev = cum[b]
    out[tot <= 0] = np.nan
    return out


def _distance_to(target: np.ndarray, land: np.ndarray) -> np.ndarray:
    """Great-circle distance (km) from each land cell to the nearest cell where target is True."""
    from scipy.spatial import cKDTree
    lat2d, lon2d = np.meshgrid(LAT_C, LON_C, indexing="ij")

    def xyz(la, lo):
        la, lo = np.radians(la), np.radians(lo)
        return np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], -1)

    out = np.full(target.shape, np.nan, np.float32)
    if not target.any():
        return out
    t = cKDTree(xyz(lat2d[target], lon2d[target]))
    d, _ = t.query(xyz(lat2d[land], lon2d[land]), workers=-1)
    out[land] = 2 * 6371.0 * np.arcsin(np.clip(d / 2, 0, 1))
    return out


def _load_demo() -> Grid:
    """SYNTHETIC demonstration data. Smooth analytic fields; NOT measurements."""
    from .demo import build_demo_grid
    return build_demo_grid()


_GRID: Grid | None = None


def get_grid() -> Grid:
    global _GRID
    if _GRID is None:
        need = ["power_merra2_climatology.npz", "power_syn1deg_climatology.npz",
                "dem_terrarium_z6_025deg.npz", "landcover_worldcover2021_025deg.npz",
                "vector_naturalearth_025deg.npz", "vector_labels.json"]
        import os
        force_demo = os.environ.get("TERRANOVA_DEMO", "").lower() in ("1", "true", "yes")
        if not force_demo and all((PROCESSED / f).exists() for f in need):
            _GRID = _load_real()
        else:
            log.warning("Processed data missing or TERRANOVA_DEMO set -> SYNTHETIC DEMO MODE")
            _GRID = _load_demo()
    return _GRID
