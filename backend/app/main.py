"""TerraNova FastAPI backend."""
from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any, Literal, Optional

import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import render
from .data import connectors
from .data.grid import NLAT, NLON, RES, get_grid
from .scoring import analysis
from .scoring.engine import (CONSTRAINT_INFO, ST_EXCLUDED, ST_FLAGGED, ST_NODATA, ST_OK, get_engine)
from .scoring.parameters import CATEGORIES, PARAMS, REPRO_LABELS, SRC, param_catalog
from .scoring.presets import preset_list
from .scoring.sites import ANALOG_SITES
from .scoring.targets import REGIONS, region_list

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("terranova")

app = FastAPI(title="TerraNova API", version="1.0.0",
              description="Find Earth locations that best reproduce specific lunar / Martian conditions.")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.add_middleware(GZipMiddleware, minimum_size=2000)

# Raw Earth data layers that can be displayed on the globe
DATA_LAYERS = {
    "TS": ("Surface temperature (annual mean)", "°C", -50, 35, False, "power_merra2"),
    "TS_RANGE": ("Daily surface temperature range", "°C", 0, 30, False, "power_merra2"),
    "T2M_SEASONAL_RANGE": ("Seasonal temperature range", "°C", 0, 60, False, "power_merra2"),
    "ALLSKY_SFC_SW_DWN": ("Solar irradiance (24 h mean)", "W/m²", 50, 300, False, "power_ceres"),
    "ALLSKY_KT": ("Clearness index", "–", 0.3, 0.8, False, "power_ceres"),
    "AOD_55_ADJ": ("Aerosol optical depth 550 nm", "–", 0, 0.8, False, "power_ceres"),
    "WS10M": ("Wind speed 10 m", "m/s", 0, 10, False, "power_merra2"),
    "PRECTOTCORR": ("Precipitation", "mm/day", 0.01, 10, True, "power_merra2"),
    "ARIDITY_INDEX": ("Aridity index P/PET", "–", 0, 1, False, "derived"),
    "elev_mean": ("Elevation (mean)", "m", 0, 5000, False, "dem"),
    "elev_std": ("Elevation std-dev (relief)", "m", 1, 1500, True, "dem"),
    "slope_p90": ("Slope, 90th percentile", "°", 0, 20, False, "dem"),
    "rough_m": ("Terrain roughness", "m", 0.5, 100, True, "dem"),
    "lc_bare": ("Bare / sparse vegetation fraction", "–", 0, 1, False, "worldcover"),
    "dist_road_km": ("Distance to road", "km", 1, 1000, True, "naturalearth"),
}


class ParamCfg(BaseModel):
    enabled: bool = True
    weight: float = Field(50, ge=0, le=100)
    tolerance: Optional[float] = Field(None, gt=0)
    extra: Optional[dict[str, Any]] = None


class Constraints(BaseModel):
    max_slope_p90: Optional[float] = None
    min_solar_wm2: Optional[float] = None
    max_daily_range: Optional[float] = None
    max_seasonal_range: Optional[float] = None
    min_area_km2: Optional[float] = None
    area_score_threshold: float = 50
    max_relief_m: Optional[float] = None
    max_road_km: Optional[float] = None
    exclude_protected: bool = False
    exclude_ice_sheets: bool = False


class AnalyzeRequest(BaseModel):
    region: str
    params: dict[str, ParamCfg]
    constraints: Constraints = Constraints()
    constraint_mode: Literal["exclude", "flag"] = "exclude"
    missing_mode: Literal["partial", "exclude"] = "partial"
    min_confidence: float = Field(0, ge=0, le=100)
    top_n: int = Field(10, ge=1, le=50)
    min_separation_km: float = Field(250, ge=0, le=5000)
    preset_name: Optional[str] = None


def _cfg(req: AnalyzeRequest) -> dict:
    if req.region not in REGIONS:
        raise HTTPException(400, f"Unknown reference region '{req.region}'")
    d = req.model_dump()
    d["params"] = {k: v for k, v in d["params"].items() if k in PARAMS}
    d.pop("top_n")
    d.pop("min_separation_km")
    return d


@app.on_event("startup")
def _startup():
    t = time.time()
    get_engine()
    log.info("Engine ready in %.1fs (mode=%s)", time.time() - t, get_grid().mode)


@app.get("/api/health")
def health():
    g = get_grid()
    return {"status": "ok", "data_mode": g.mode, "land_cells": int(g.land.sum())}


@app.get("/api/meta")
def meta():
    g = get_grid()
    return {
        "data_mode": g.mode,
        "grid": {"resolution_deg": RES, "nlat": NLAT, "nlon": NLON},
        "parameters": param_catalog(),
        "categories": CATEGORIES,
        "repro_labels": REPRO_LABELS,
        "regions": region_list(),
        "presets": preset_list(),
        "sources": SRC,
        "constraints": [{"bit": b, "key": k, "label": l, "unit": u} for b, (k, l, u) in CONSTRAINT_INFO.items()],
        "constraint_colors": {str(k): v for k, v in render.CONSTRAINT_COLORS.items()},
        "data_layers": [{"key": k, "label": v[0], "unit": v[1], "vmin": v[2], "vmax": v[3], "log": v[4],
                         "source": SRC[v[5]]} for k, v in DATA_LAYERS.items()],
        "analog_sites": ANALOG_SITES,
        "power_meta": g.meta.get("power"),
        "built": g.meta.get("manifest", {}).get("built_utc"),
    }


@app.get("/api/regions/{rid}")
def region(rid: str):
    if rid not in REGIONS:
        raise HTTPException(404)
    return REGIONS[rid]


@app.post("/api/analyze")
def analyze(req: AnalyzeRequest):
    eng = get_engine()
    t0 = time.time()
    cfg = _cfg(req)
    res = eng.analyze(cfg)
    top = analysis.rank(eng, res, req.top_n, req.min_separation_km, include_flagged=req.constraint_mode == "flag")
    st = res.status
    sc = res.score[(st == ST_OK) & np.isfinite(res.score)]
    hist, _ = np.histogram(sc, bins=10, range=(0, 100))
    warnings = []
    if not res.active:
        warnings.append("No parameters are enabled with a weight > 0.")
    for k in res.not_applicable:
        warnings.append(f"'{PARAMS[k].label}' is not applicable to {REGIONS[req.region]['name']} and was ignored.")
    if req.missing_mode == "exclude" and "protection" in res.active:
        warnings.append("Protected-area data only cover the USA; with 'exclude missing data' every other country is excluded.")
    if (st == ST_OK).sum() == 0:
        warnings.append("No location satisfies all constraints. Relax constraints or switch to 'flag' mode.")
    return {
        "result_id": res.id, "data_mode": get_grid().mode, "elapsed_ms": round((time.time() - t0) * 1000),
        "active": res.active, "not_applicable": res.not_applicable, "weights": res.weights,
        "stats": {
            "land": int((st > 0).sum()), "ok": int((st == ST_OK).sum()), "no_data": int((st == ST_NODATA).sum()),
            "excluded": int((st == ST_EXCLUDED).sum()), "flagged": int((st == ST_FLAGGED).sum()),
            "score_hist": hist.tolist(),
            "score_p50": float(np.median(sc)) if sc.size else None, "score_max": float(sc.max()) if sc.size else None,
            "mean_confidence": float(np.nanmean(res.confidence[st > 0])) if (st > 0).any() else None,
        },
        "top": top, "warnings": warnings,
    }


@app.get("/api/layer/{rid}.png")
def layer(rid: str, layer: str = Query("overall")):
    eng = get_engine()
    if layer.startswith("data:"):
        key = layer[5:]
        if key not in DATA_LAYERS:
            raise HTTPException(404, "unknown data layer")
        _, _, vmin, vmax, lg, _ = DATA_LAYERS[key]
        return Response(render.render_data(eng.g.layers[key].ravel(), vmin, vmax, lg), media_type="image/png",
                        headers={"Cache-Control": "public, max-age=86400"})
    res = eng.result(rid)
    if res is None:
        raise HTTPException(404, "result expired – re-run analysis")
    if layer == "overall":
        png = render.render_score(res.score, res.status)
    elif layer == "confidence":
        png = render.render_score(res.confidence, np.where(res.status > 0, np.where(np.isfinite(res.confidence), ST_OK, ST_NODATA), 0),
                                  stops=render.CONF)
    elif layer == "constraints":
        png = render.render_constraints(res.fails, res.status)
    elif layer.startswith("param:") or layer.startswith("cat:"):
        if layer.startswith("param:"):
            key = layer[6:]
            if key not in PARAMS:
                raise HTTPException(404)
            pc = res.config["params"].get(key, {})
            vec = res.sims.get(key)
            if vec is None:
                vec = eng.param_similarity(key, res.config["region"], pc.get("tolerance"), pc.get("extra"))
            vec = vec * 100
        else:
            cats = eng.category_scores(res)
            vec = cats.get(layer[4:])
            if vec is None:
                raise HTTPException(404, "category has no active parameters")
        full = np.full(NLAT * NLON, np.nan, np.float32)
        full[eng.land_idx] = vec
        stt = np.zeros(NLAT * NLON, np.uint8)
        stt[eng.land_idx] = np.where(np.isfinite(vec), ST_OK, ST_NODATA)
        png = render.render_score(full, stt)
    else:
        raise HTTPException(400, "unknown layer")
    return Response(png, media_type="image/png", headers={"Cache-Control": "public, max-age=3600"})


@app.get("/api/location")
def location(rid: str, lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180)):
    eng = get_engine()
    res = eng.result(rid)
    if res is None:
        raise HTTPException(404, "result expired – re-run analysis")
    return analysis.location_detail(eng, res, lat, lon)


@app.get("/api/live")
def live(source: Literal["nasa_power", "soilgrids", "terrain"], lat: float, lon: float):
    if source == "terrain":
        r, c = get_grid().cell(lat, lon)
        from .data.grid import LAT_C, LON_C
        b = [float(LON_C[c] - RES / 2), float(LAT_C[r] - RES / 2), float(LON_C[c] + RES / 2), float(LAT_C[r] + RES / 2)]
        return connectors.terrain_sample(b)
    return connectors.CONNECTORS[source](lat, lon)


@app.get("/api/validation")
def validation(rid: str):
    """Score of known analog sites + their percentile among all scored land cells."""
    eng = get_engine()
    res = eng.result(rid)
    if res is None:
        raise HTTPException(404, "result expired – re-run analysis")
    body = REGIONS[res.config["region"]]["body"]
    valid = np.isfinite(res.score) & (res.status > 0)
    allsc = np.sort(res.score[valid])
    out = []
    for s in ANALOG_SITES:
        r, c = eng.g.cell(s["lat"], s["lon"])
        f = r * NLON + c
        v = res.score[f]
        pct = float(np.searchsorted(allsc, v) / len(allsc) * 100) if np.isfinite(v) and len(allsc) else None
        out.append({**s, "score": None if not np.isfinite(v) else round(float(v), 1),
                    "confidence": None if not np.isfinite(res.confidence[f]) else round(float(res.confidence[f]), 1),
                    "percentile": None if pct is None else round(pct, 1), "same_body": s["body"] == body,
                    "status": int(res.status[f])})
    return {"sites": out}


# ---------------------------------------------------------------- static frontend (production)
DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")
    if (DIST / "cesium").exists():
        app.mount("/cesium", StaticFiles(directory=DIST / "cesium"), name="cesium")

    @app.get("/{path:path}")
    def spa(path: str):
        p = DIST / path
        if path and p.is_file():
            return FileResponse(p)
        return FileResponse(DIST / "index.html")
