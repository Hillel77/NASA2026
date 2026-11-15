#!/usr/bin/env python3
"""
TerraNova preprocessing pipeline.

Downloads REAL open datasets and reduces them to compact global grids that the
FastAPI scoring engine loads into memory. Nothing in this script invents data:
every layer written to ``data/processed`` is derived from the sources below.

Stages (each is cached under data/cache and can be re-run independently):

  power      NASA POWER v10 monthly climatology (2001-2020), Analysis-Ready Zarr
             on AWS Open Data (s3://nasa-power). MERRA-2 meteorology on the
             native 0.5 x 0.625 deg grid, CERES SYN1deg solar on the 1 x 1 deg grid.
  dem        AWS Terrain Tiles (s3://elevation-tiles-prod, "terrarium" encoding),
             a global DEM mosaic built from SRTM (land 60N-56S), GMTED2010,
             ETOPO1 and others. Zoom 6 (~2.4 km pixels at the equator) aggregated to
             0.25 deg cells: mean/std/min/max elevation, km-scale slope histogram
             and small-scale roughness.
  landcover  ESA WorldCover 10 m v200 (2021), s3://esa-worldcover, read from the
             1:64 COG overview (~640 m) and aggregated to 0.25 deg class fractions.
  vector     Natural Earth 1:10m (countries, populated places, roads, geographic
             regions, US protected lands) -> per-cell country, region name,
             distance to nearest road / populated place.

Usage:
    python backend/scripts/build_grid.py              # all stages
    python backend/scripts/build_grid.py power dem    # selected stages
"""
from __future__ import annotations

import io
import json
import math
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / "cache"
OUT = ROOT / "data" / "processed"
CACHE.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)

RES = 0.25                       # output grid resolution (deg)
NLAT, NLON = int(180 / RES), int(360 / RES)
LAT_C = 90 - RES / 2 - RES * np.arange(NLAT)        # row 0 = northernmost
LON_C = -180 + RES / 2 + RES * np.arange(NLON)
R_EARTH = 6371.0088  # km

POWER_BUCKET = "s3://nasa-power"
MERRA_ZARR = f"{POWER_BUCKET}/merra2/spatial/power_merra2_climatology_spatial_utc.zarr"
SYN_ZARR = f"{POWER_BUCKET}/syn1deg/spatial/power_syn1deg_climatology_spatial_utc.zarr"

# Monthly (13 = 12 months + annual) variables kept for charts; annual-only for the rest.
MERRA_MONTHLY = ["T2M", "T2M_MAX_AVG", "T2M_MIN_AVG", "PRECTOTCORR", "WS10M", "TS_RANGE"]
MERRA_ANNUAL = ["T2M_MAX", "T2M_MIN", "T2M_RANGE", "TS", "TS_MAX", "TS_MIN", "QV2M",
                "RH2M", "GWETTOP", "PS", "FRSNO", "WS10M_MAX"]
SYN_MONTHLY = ["ALLSKY_SFC_SW_DWN", "TOA_SW_DWN", "DAY_HOURS"]
SYN_ANNUAL = ["ALLSKY_KT", "CLRSKY_SFC_SW_DWN", "AOD_55_ADJ", "ALLSKY_SFC_UV_INDEX", "CLOUD_AMT"]

SLOPE_BINS = np.array([0, 1, 2, 4, 6, 10, 15, 20, 30, 90], dtype=np.float32)  # degrees


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


# --------------------------------------------------------------------------------------
# NASA POWER
# --------------------------------------------------------------------------------------
def stage_power():
    import fsspec
    import xarray as xr

    def grab(url, monthly, annual):
        ds = xr.open_zarr(fsspec.get_mapper(url, anon=True), consolidated=True)
        out = {"lat": ds.lat.values.astype(np.float32), "lon": ds.lon.values.astype(np.float32)}
        units = {}
        for v in monthly:
            log("  POWER", v)
            out[v] = ds[v].values.astype(np.float16)               # (13, lat, lon)
            units[v] = ds[v].attrs.get("units", "")
        for v in annual:
            log("  POWER", v, "(annual)")
            out[v] = ds[v].isel(time=12).values.astype(np.float16)  # (lat, lon)
            units[v] = ds[v].attrs.get("units", "")
        meta = {k: ds.attrs.get(k) for k in ("title", "version", "time_coverage_start",
                                            "time_coverage_end", "institution")}
        meta["units"] = units
        meta["url"] = url
        return out, meta

    m, mmeta = grab(MERRA_ZARR, MERRA_MONTHLY, MERRA_ANNUAL)
    np.savez_compressed(OUT / "power_merra2_climatology.npz", **m)
    s, smeta = grab(SYN_ZARR, SYN_MONTHLY, SYN_ANNUAL)
    np.savez_compressed(OUT / "power_syn1deg_climatology.npz", **s)
    json.dump({"merra2": mmeta, "syn1deg": smeta}, open(OUT / "power_meta.json", "w"), indent=1)
    log("POWER done")


# --------------------------------------------------------------------------------------
# DEM: AWS Terrain Tiles (terrarium)
# --------------------------------------------------------------------------------------
TERRARIUM_URL = "https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png"


def fetch_tile(z, x, y, session=None):
    import requests
    p = CACHE / "terrarium" / str(z) / str(x) / f"{y}.png"
    if p.exists() and p.stat().st_size > 0:
        return p.read_bytes()
    p.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(4):
        try:
            r = (session or requests).get(TERRARIUM_URL.format(z=z, x=x, y=y), timeout=30)
            r.raise_for_status()
            p.write_bytes(r.content)
            return r.content
        except Exception as e:  # noqa: BLE001
            if attempt == 3:
                raise
            time.sleep(1 + attempt * 2)


def decode_terrarium(png_bytes):
    from PIL import Image
    a = np.asarray(Image.open(io.BytesIO(png_bytes)).convert("RGB")).astype(np.float32)
    return a[..., 0] * 256.0 + a[..., 1] + a[..., 2] / 256.0 - 32768.0


def stage_dem(z=6):
    from global_land_mask import globe
    from scipy.ndimage import uniform_filter
    import requests

    n_t = 2 ** z
    npx = 256 * n_t
    ncell = NLAT * NLON
    cnt = np.zeros(ncell, np.float64)
    s1 = np.zeros(ncell, np.float64)
    s2 = np.zeros(ncell, np.float64)
    emin = np.full(ncell, np.inf)
    emax = np.full(ncell, -np.inf)
    rough = np.zeros(ncell, np.float64)
    slope_sum = np.zeros(ncell, np.float64)
    hist = np.zeros((len(SLOPE_BINS) - 1, ncell), np.float64)
    land_cnt = np.zeros(ncell, np.float64)
    tot_cnt = np.zeros(ncell, np.float64)

    jj, ii = np.mgrid[0:256, 0:256]
    sess = requests.Session()
    tasks = [(x, y) for x in range(n_t) for y in range(n_t)]
    done = 0
    with ThreadPoolExecutor(24) as ex:
        futs = {ex.submit(fetch_tile, z, x, y, sess): (x, y) for x, y in tasks}
        for f in as_completed(futs):
            x, y = futs[f]
            elev = decode_terrarium(f.result())
            gy = y * 256 + jj + 0.5
            gx = x * 256 + ii + 0.5
            lat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * gy / npx))))
            lon = gx / npx * 360.0 - 180.0
            # Web-Mercator is conformal: pixel ground size is identical in x and y.
            px_m = 2 * np.pi * 6378137.0 * np.cos(np.radians(lat[:, 0])) / npx
            dzdy, dzdx = np.gradient(elev)
            g = np.hypot(dzdx, dzdy) / px_m[:, None]
            slope = np.degrees(np.arctan(g))
            # Small-scale roughness: |z - 3x3 local mean| (m), a topographic-position measure.
            r = np.abs(elev - uniform_filter(elev, 3, mode="nearest"))
            is_land = globe.is_land(lat, lon)
            row = np.clip(((90 - lat) / RES).astype(np.int64), 0, NLAT - 1)
            col = np.clip(((lon + 180) / RES).astype(np.int64), 0, NLON - 1)
            idx = (row * NLON + col)
            np.add.at(tot_cnt, idx.ravel(), 1)
            m = is_land
            if m.any():
                ix = idx[m]
                e = elev[m].astype(np.float64)
                np.add.at(cnt, ix, 1)
                np.add.at(land_cnt, ix, 1)
                np.add.at(s1, ix, e)
                np.add.at(s2, ix, e * e)
                np.minimum.at(emin, ix, e)
                np.maximum.at(emax, ix, e)
                np.add.at(rough, ix, r[m])
                np.add.at(slope_sum, ix, slope[m])
                b = np.clip(np.searchsorted(SLOPE_BINS, slope[m], side="right") - 1, 0, len(SLOPE_BINS) - 2)
                np.add.at(hist, (b, ix), 1)
            done += 1
            if done % 256 == 0:
                log(f"  DEM tiles {done}/{len(tasks)}")

    with np.errstate(invalid="ignore", divide="ignore"):
        mean = s1 / cnt
        std = np.sqrt(np.maximum(s2 / cnt - mean ** 2, 0))
        hist_pct = (hist / cnt * 100.0)
        out = dict(
            elev_mean=mean.reshape(NLAT, NLON).astype(np.float32),
            elev_std=std.reshape(NLAT, NLON).astype(np.float32),
            elev_min=np.where(cnt > 0, emin, np.nan).reshape(NLAT, NLON).astype(np.float32),
            elev_max=np.where(cnt > 0, emax, np.nan).reshape(NLAT, NLON).astype(np.float32),
            rough_m=(rough / cnt).reshape(NLAT, NLON).astype(np.float32),
            slope_mean=(slope_sum / cnt).reshape(NLAT, NLON).astype(np.float32),
            slope_hist=np.nan_to_num(hist_pct).reshape(len(SLOPE_BINS) - 1, NLAT, NLON).astype(np.float16),
            dem_land_frac=(land_cnt / np.maximum(tot_cnt, 1)).reshape(NLAT, NLON).astype(np.float16),
            dem_npix=cnt.reshape(NLAT, NLON).astype(np.int32),
            slope_bins=SLOPE_BINS,
        )
    np.savez_compressed(OUT / "dem_terrarium_z6_025deg.npz", **out)
    log("DEM done")


# --------------------------------------------------------------------------------------
# ESA WorldCover 2021 v200
# --------------------------------------------------------------------------------------
WC_CLASSES = {10: "tree", 20: "shrub", 30: "grass", 40: "crop", 50: "built", 60: "bare",
              70: "snow_ice", 80: "water", 90: "wetland", 95: "mangrove", 100: "moss_lichen"}


def list_worldcover():
    import requests
    keys, token = [], None
    while True:
        params = {"list-type": "2", "prefix": "v200/2021/map/"}
        if token:
            params["continuation-token"] = token
        r = requests.get("https://esa-worldcover.s3.amazonaws.com/", params=params, timeout=60)
        txt = r.text
        import re
        keys += re.findall(r"<Key>([^<]+_Map\.tif)</Key>", txt)
        m = re.search(r"<NextContinuationToken>([^<]+)</NextContinuationToken>", txt)
        if not m:
            break
        token = m.group(1)
    return keys


def read_wc_tile(key):
    import rasterio
    cache = CACHE / "worldcover" / (Path(key).stem + "_360.npy")
    if cache.exists():
        return key, np.load(cache)
    cache.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(4):
        try:
            with rasterio.Env(AWS_NO_SIGN_REQUEST="YES", GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR"):
                with rasterio.open(f"/vsis3/esa-worldcover/{key}") as src:
                    a = src.read(1, out_shape=(360, 360))  # nearest from 1:64 overview
                    b = src.bounds
            np.save(cache, a)
            return key, a
        except Exception:  # noqa: BLE001
            if attempt == 3:
                raise
            time.sleep(2)


def stage_landcover():
    keys = list_worldcover()
    log(f"  WorldCover tiles: {len(keys)}")
    classes = list(WC_CLASSES)
    frac = np.zeros((len(classes), NLAT, NLON), np.float32)
    valid = np.zeros((NLAT, NLON), np.float32)
    done = 0
    with ThreadPoolExecutor(16) as ex:
        for f in as_completed([ex.submit(read_wc_tile, k) for k in keys]):
            key, a = f.result()
            name = Path(key).stem.split("_")[-2]  # e.g. N24E006
            lat0 = int(name[1:3]) * (1 if name[0] == "N" else -1)
            lon0 = int(name[4:7]) * (1 if name[3] == "E" else -1)
            # tile covers [lat0, lat0+3] x [lon0, lon0+3]; 360 px -> 12 cells of 30 px
            r0 = int(round((90 - (lat0 + 3)) / RES))
            c0 = int(round((lon0 + 180) / RES))
            blk = a.reshape(12, 30, 12, 30)
            v = (blk > 0).sum(axis=(1, 3)).astype(np.float32)
            rs, cs = slice(r0, r0 + 12), slice(c0, c0 + 12)
            valid[rs, cs] += v
            for k, c in enumerate(classes):
                frac[k, rs, cs] += (blk == c).sum(axis=(1, 3))
            done += 1
            if done % 200 == 0:
                log(f"  WorldCover {done}/{len(keys)}")
    with np.errstate(invalid="ignore", divide="ignore"):
        frac = frac / valid[None]
    out = {f"lc_{WC_CLASSES[c]}": frac[k].astype(np.float16) for k, c in enumerate(classes)}
    out["lc_valid"] = (valid > 0)
    np.savez_compressed(OUT / "landcover_worldcover2021_025deg.npz", **out)
    log("WorldCover done")


# --------------------------------------------------------------------------------------
# Natural Earth vectors
# --------------------------------------------------------------------------------------
NE_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/{}.geojson"


def ne(name):
    import requests
    p = CACHE / "naturalearth" / f"{name}.geojson"
    if not p.exists():
        p.parent.mkdir(parents=True, exist_ok=True)
        log("  downloading", name)
        r = requests.get(NE_URL.format(name), timeout=300)
        r.raise_for_status()
        p.write_bytes(r.content)
    return json.load(open(p, encoding="utf-8"))


def unit_xyz(lat, lon):
    la, lo = np.radians(lat), np.radians(lon)
    return np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], -1)


def chord_to_km(d):
    return 2 * R_EARTH * np.arcsin(np.clip(d / 2, 0, 1))


def rasterize_polys(features, prop_fn, lat2d, lon2d, mask):
    """Assign each masked cell centre the index of the polygon containing it (-1 if none)."""
    import shapely
    from shapely.geometry import shape
    res = np.full(lat2d.shape, -1, np.int32)
    labels = []
    for f in features:
        try:
            g = shape(f["geometry"])
        except Exception:  # noqa: BLE001
            continue
        if g.is_empty:
            continue
        minx, miny, maxx, maxy = g.bounds
        sel = mask & (lon2d >= minx) & (lon2d <= maxx) & (lat2d >= miny) & (lat2d <= maxy) & (res < 0)
        if not sel.any():
            labels.append(prop_fn(f["properties"]))
            continue
        shapely.prepare(g)
        inside = shapely.contains_xy(g, lon2d[sel], lat2d[sel])
        idx = np.flatnonzero(sel.ravel())[inside]
        res.ravel()[idx] = len(labels)
        labels.append(prop_fn(f["properties"]))
    return res, labels


def stage_vector():
    from global_land_mask import globe
    from scipy.spatial import cKDTree

    lat2d, lon2d = np.meshgrid(LAT_C, LON_C, indexing="ij")
    # cells with any land: use 9 sub-samples per cell so coastal cells are kept
    off = [-RES / 3, 0, RES / 3]
    landany = np.zeros(lat2d.shape, bool)
    for a in off:
        for b in off:
            landany |= globe.is_land(np.clip(lat2d + a, -90, 90), ((lon2d + b + 180) % 360) - 180)
    out = {"land_any": landany}

    # Countries (ISO + name). Cells on coasts whose centre is offshore get nearest-country fill.
    countries = ne("ne_10m_admin_0_countries")["features"]
    cidx, clabels = rasterize_polys(countries, lambda p: {"name": p.get("NAME"), "iso3": p.get("ADM0_A3"),
                                                         "continent": p.get("CONTINENT")}, lat2d, lon2d, landany)
    miss = landany & (cidx < 0)
    have = cidx >= 0
    if miss.any() and have.any():
        t = cKDTree(unit_xyz(lat2d[have], lon2d[have]))
        d, j = t.query(unit_xyz(lat2d[miss], lon2d[miss]))
        fill = cidx[have][j]
        fill[chord_to_km(d) > 60] = -1
        cidx[miss] = fill
    out["country_idx"] = cidx

    # Named geographic regions (deserts, plateaus, ranges ...), smallest area first so that
    # specific names win over broad ones.
    regs = ne("ne_10m_geography_regions_polys")["features"]
    from shapely.geometry import shape
    regs = sorted(regs, key=lambda f: shape(f["geometry"]).area)
    ridx, rlabels = rasterize_polys(regs, lambda p: {"name": p.get("name") or p.get("NAME"),
                                                     "type": p.get("featurecla")}, lat2d, lon2d, landany)
    out["region_idx"] = ridx

    # US protected lands (only coverage Natural Earth offers at 1:10m)
    parks = ne("ne_10m_parks_and_protected_lands_area")["features"]
    pidx, plabels = rasterize_polys(parks, lambda p: {"name": p.get("name") or p.get("Unit_Name"),
                                                      "type": p.get("unit_type")}, lat2d, lon2d, landany)
    out["protected_idx"] = pidx

    # Distance to roads: densify road vertices to <= ~2 km spacing and use a KD-tree on the sphere.
    roads = ne("ne_10m_roads")["features"]
    pts = []
    for f in roads:
        g = f["geometry"]
        lines = g["coordinates"] if g["type"] == "MultiLineString" else [g["coordinates"]]
        for ln in lines:
            a = np.asarray(ln, dtype=np.float64)
            if len(a) < 2:
                continue
            seg = np.hypot(np.diff(a[:, 0]), np.diff(a[:, 1]))
            for k in range(len(a) - 1):
                nseg = max(1, int(seg[k] / 0.02))
                t = np.linspace(0, 1, nseg, endpoint=False)[:, None]
                pts.append(a[k] + t * (a[k + 1] - a[k]))
            pts.append(a[-1:])
    pts = np.concatenate(pts)
    log(f"  road vertices: {len(pts)}")
    tree = cKDTree(unit_xyz(pts[:, 1], pts[:, 0]))
    q = unit_xyz(lat2d[landany], lon2d[landany])
    d, _ = tree.query(q, workers=-1)
    road = np.full(lat2d.shape, np.nan, np.float32)
    road[landany] = chord_to_km(d)
    out["dist_road_km"] = road

    # Populated places (nearest place + nearest place with pop >= 100k)
    places = ne("ne_10m_populated_places_simple")["features"]
    plat = np.array([p["properties"]["latitude"] for p in places])
    plon = np.array([p["properties"]["longitude"] for p in places])
    ppop = np.array([p["properties"].get("pop_max") or 0 for p in places])
    pinfo = [{"name": p["properties"]["name"], "country": p["properties"].get("adm0name"),
              "pop": int(p["properties"].get("pop_max") or 0)} for p in places]
    t_all = cKDTree(unit_xyz(plat, plon))
    d, j = t_all.query(q, workers=-1)
    near = np.full(lat2d.shape, -1, np.int32)
    near[landany] = j
    dnear = np.full(lat2d.shape, np.nan, np.float32)
    dnear[landany] = chord_to_km(d)
    big = ppop >= 100_000
    t_big = cKDTree(unit_xyz(plat[big], plon[big]))
    d2, _ = t_big.query(q, workers=-1)
    dbig = np.full(lat2d.shape, np.nan, np.float32)
    dbig[landany] = chord_to_km(d2)
    out.update(place_idx=near, dist_place_km=dnear, dist_city100k_km=dbig)

    np.savez_compressed(OUT / "vector_naturalearth_025deg.npz", **out)
    json.dump({"countries": clabels, "regions": rlabels, "protected": plabels, "places": pinfo},
              open(OUT / "vector_labels.json", "w", encoding="utf-8"))
    log("Vector done")


def write_manifest():
    man = {
        "grid": {"resolution_deg": RES, "nlat": NLAT, "nlon": NLON, "origin": "north-west, row 0 = 90N"},
        "built_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "files": sorted(p.name for p in OUT.glob("*") if p.name != "manifest.json"),
    }
    json.dump(man, open(OUT / "manifest.json", "w"), indent=1)


if __name__ == "__main__":
    stages = sys.argv[1:] or ["power", "vector", "landcover", "dem"]
    for s in stages:
        log("=== stage", s)
        globals()[f"stage_{s}"]()
    write_manifest()
