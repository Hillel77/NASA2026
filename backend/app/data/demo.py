"""
SYNTHETIC DEMONSTRATION GRID — used only when the processed real datasets are absent or
TERRANOVA_DEMO=1. All fields are smooth analytic functions of latitude/longitude plus seeded
noise. They have plausible magnitudes so the UI can be exercised, but they are NOT data.
The API exposes ``data_mode = "demo"`` and the UI shows a persistent warning banner.
"""
from __future__ import annotations

import numpy as np

from .grid import LAT_C, LON_C, NLAT, NLON, SLOPE_BINS, Grid


def build_demo_grid() -> Grid:
    rng = np.random.default_rng(42)
    lat, lon = np.meshgrid(LAT_C, LON_C, indexing="ij")
    try:
        from global_land_mask import globe
        land = globe.is_land(lat, lon)
    except Exception:  # noqa: BLE001
        land = (np.sin(np.radians(lon) * 2) + np.cos(np.radians(lat) * 3)) > 0.3
    g = Grid(mode="demo")
    g.land = land

    def noise(scale=1.0):
        from scipy.ndimage import gaussian_filter
        return gaussian_filter(rng.standard_normal((NLAT, NLON)), 8) * 8 * scale

    def put(k, a):
        a = a.astype(np.float32)
        a[~land] = np.nan
        g.layers[k] = a

    alat = np.abs(lat)
    desert = np.exp(-((alat - 25) ** 2) / 120) * (1 + noise(0.3))
    put("TS", 28 - 0.75 * alat + noise(3))
    put("T2M", g.layers["TS"] - 1)
    put("TS_RANGE", 8 + 18 * np.clip(desert, 0, 1) + noise(2))
    put("T2M_SEASONAL_RANGE", 2 + 0.6 * alat + noise(2))
    put("TS_MIN", g.layers["TS"] - 25 - 0.3 * alat)
    put("TS_MAX", g.layers["TS"] + 20 + 10 * np.clip(desert, 0, 1))
    put("ALLSKY_SFC_SW_DWN", 280 * np.cos(np.radians(lat)) * (0.6 + 0.3 * np.clip(desert, 0, 1)))
    put("ALLSKY_KT", 0.45 + 0.25 * np.clip(desert, 0, 1) + noise(0.02))
    dl = np.clip(0.5 + 0.5 * np.clip((alat - 10) / 60, 0, 1), 0, 1)
    put("DAYLIGHT_FRAC_MAX", dl)
    put("DAYLIGHT_FRAC_MIN", 1 - dl)
    put("DAYLIGHT_FRAC_MEAN", np.full_like(lat, 0.5))
    put("SOLAR_SEASONAL_RATIO", 1 - alat / 90)
    elev_std = np.exp(4 + noise(0.15))
    put("elev_std", elev_std)
    put("elev_mean", 500 + noise(80))
    put("relief_m", elev_std * 4)
    put("rough_m", elev_std / 8)
    p50 = np.clip(elev_std / 80, 0.1, 20)
    put("slope_p50", p50)
    put("slope_p90", p50 * 3)
    put("slope_mean", p50 * 1.3)
    from scipy.stats import norm
    e = np.maximum(SLOPE_BINS.astype(float), 1e-6)
    cdf = norm.cdf((np.log(e)[:, None, None] - np.log(p50)[None]) / 0.8)
    cdf[0], cdf[-1] = 0, 1
    sh = np.diff(cdf, axis=0) * 100
    sh[:, ~land] = np.nan
    g.slope_hist = sh.astype(np.float32)
    put("lc_bare", np.clip(desert + noise(0.05), 0, 1))
    put("lc_snow_ice", (alat > 70).astype(float))
    put("ARIDITY_INDEX", np.clip(1.2 - np.clip(desert, 0, 1.1), 0, 3))
    put("AOD_55_ADJ", 0.08 + 0.3 * np.clip(desert, 0, 1))
    put("WS10M", 3 + noise(0.3))
    put("PRECTOTCORR", np.clip(3 - 3 * desert, 0, 10))
    put("QV2M", np.clip(15 - 0.25 * alat - 5 * desert, 0.2, 20))
    put("GWETTOP", np.clip(0.6 - 0.5 * desert, 0.02, 1))
    put("PS", 1000 - g.layers["elev_mean"] / 9)
    put("dist_ice_km", np.clip((70 - alat) * 111, 0, None))
    put("dist_road_km", np.abs(noise(30)))
    put("protected", np.zeros_like(lat))
    put("cell_area_km2", np.cos(np.radians(lat)) * (0.25 * 111.195) ** 2)
    g.layers["cell_area_km2"] = (np.cos(np.radians(lat)) * (0.25 * 111.195) ** 2).astype(np.float32)
    for k in ("country_idx", "region_idx", "place_idx"):
        g.layers[k] = np.full((NLAT, NLON), -1, np.int32)
    g.labels = {"countries": [], "regions": [], "places": [], "protected": []}
    g.meta = {"note": "SYNTHETIC DEMONSTRATION DATA – not measurements"}
    return g
