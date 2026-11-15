"""
TerraNova scoring engine.

For every Earth land cell x:

    S(x) = sum_i w_i * s_i(x) / sum_i w_i          (sum over enabled parameters with data)

    s_i(x) in [0,1]  parameter-specific similarity (see similarity.py / parameters.py)
    w_i              user importance weight (0-100), normalised automatically

Missing data are NOT scored as zero. Instead, a data-confidence score is computed:

    C(x) = sum_{i in available(x)} w_i * q_i  /  sum_{i in enabled} w_i

where q_i is the data-quality factor of parameter i (1 = direct measurement, 0.4 = proxy).
With ``missing_mode = "exclude"`` any cell lacking an enabled parameter is excluded instead.

Hard constraints are evaluated independently of S(x). A violating cell is either excluded
(grey) or flagged, so it can never rank highly by accident.

Per-parameter similarity vectors are cached (keyed by target, tolerance and options), so
moving a weight slider only re-runs the weighted sum over ~360k land cells (~10 ms).
"""
from __future__ import annotations

import hashlib
import json
import math
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass, field

import numpy as np
from scipy import ndimage

from ..data.grid import LAT_C, LON_C, NLAT, NLON, Grid, get_grid
from .parameters import CATEGORIES, PARAMS, add_derived_layers, similarity
from .targets import REGIONS

# Constraint bits
C_SLOPE, C_SOLAR, C_DAILY, C_SEASONAL, C_AREA, C_RELIEF, C_ROAD, C_PROTECTED, C_ICE = (1 << i for i in range(9))
CONSTRAINT_INFO = {
    C_SLOPE: ("max_slope_p90", "Max terrain slope (90th percentile)", "°"),
    C_SOLAR: ("min_solar_wm2", "Min solar irradiation", "W/m²"),
    C_DAILY: ("max_daily_range", "Max daily temperature range", "°C"),
    C_SEASONAL: ("max_seasonal_range", "Max seasonal temperature range", "°C"),
    C_AREA: ("min_area_km2", "Min contiguous suitable area", "km²"),
    C_RELIEF: ("max_relief_m", "Max elevation variation within cell", "m"),
    C_ROAD: ("max_road_km", "Max distance to road", "km"),
    C_PROTECTED: ("exclude_protected", "Excluded: protected area", ""),
    C_ICE: ("exclude_ice_sheets", "Excluded: permanent ice sheet", ""),
}

# Cell status codes
ST_OCEAN, ST_OK, ST_NODATA, ST_EXCLUDED, ST_FLAGGED = 0, 1, 2, 3, 4


@dataclass
class Result:
    id: str
    config: dict
    score: np.ndarray            # (NLAT*NLON,) 0-100, NaN where not computed
    confidence: np.ndarray       # 0-100
    fails: np.ndarray            # uint16 bitmask
    status: np.ndarray           # uint8
    sims: dict[str, np.ndarray]  # key -> (n_land,) similarity 0-1
    active: list[str]            # parameters contributing
    not_applicable: list[str]
    weights: dict[str, float]
    created: float = field(default_factory=time.time)


class Engine:
    def __init__(self, grid: Grid | None = None):
        self.g = grid or get_grid()
        add_derived_layers(self.g.layers)
        self.land_idx = np.flatnonzero(self.g.land.ravel())
        self.slope_hist_flat = self.g.slope_hist.reshape(self.g.slope_hist.shape[0], -1)
        self._sim_cache: OrderedDict[str, np.ndarray] = OrderedDict()
        self._results: OrderedDict[str, Result] = OrderedDict()
        self._lock = threading.Lock()
        lat2d = np.repeat(LAT_C[:, None], NLON, 1).ravel()
        lon2d = np.tile(LON_C, NLAT)
        self.lat_land = lat2d[self.land_idx]
        self.lon_land = lon2d[self.land_idx]

    # ------------------------------------------------------------------ similarity cache
    def param_similarity(self, key: str, region: str, tolerance: float | None, extra: dict | None):
        p = PARAMS[key]
        target = REGIONS[region]["values"].get(key)
        ck = json.dumps([key, region, tolerance, extra or {}], sort_keys=True)
        with self._lock:
            if ck in self._sim_cache:
                self._sim_cache.move_to_end(ck)
                return self._sim_cache[ck]
        s = similarity(p, self.g.layers, self.slope_hist_flat, self.land_idx, target, tolerance, extra)
        s = s.astype(np.float32)
        with self._lock:
            self._sim_cache[ck] = s
            while len(self._sim_cache) > 160:
                self._sim_cache.popitem(last=False)
        return s

    # ------------------------------------------------------------------ main computation
    def analyze(self, cfg: dict) -> Result:
        rid = hashlib.sha1(json.dumps(cfg, sort_keys=True).encode()).hexdigest()[:16]
        with self._lock:
            if rid in self._results:
                self._results.move_to_end(rid)
                return self._results[rid]

        region = cfg["region"]
        reg = REGIONS[region]
        n = len(self.land_idx)
        num = np.zeros(n, np.float64)
        den_avail = np.zeros(n, np.float64)
        conf_num = np.zeros(n, np.float64)
        missing_any = np.zeros(n, bool)
        den_enabled = 0.0
        sims, active, not_app, weights = {}, [], [], {}

        for key, pc in cfg["params"].items():
            if key not in PARAMS or not pc.get("enabled", True):
                continue
            w = float(pc.get("weight", 0))
            if w <= 0:
                continue
            p = PARAMS[key]
            needs_target = p.kind not in ("pref", "binary_ok")
            if needs_target and reg["values"].get(key) is None:
                not_app.append(key)                     # e.g. ice proximity for an ice-free target
                continue
            s = self.param_similarity(key, region, pc.get("tolerance"), pc.get("extra"))
            sims[key] = s
            active.append(key)
            weights[key] = w
            ok = np.isfinite(s)
            num[ok] += w * s[ok]
            den_avail[ok] += w
            conf_num[ok] += w * p.q
            missing_any |= ~ok
            den_enabled += w

        with np.errstate(invalid="ignore", divide="ignore"):
            score_l = np.where(den_avail > 0, 100.0 * num / den_avail, np.nan)
            conf_l = 100.0 * conf_num / den_enabled if den_enabled > 0 else np.full(n, np.nan)

        status_l = np.full(n, ST_OK, np.uint8)
        no_data = ~np.isfinite(score_l)
        if cfg.get("missing_mode") == "exclude":
            no_data |= missing_any
        min_conf = float(cfg.get("min_confidence", 0) or 0)
        if min_conf > 0:
            no_data |= ~(conf_l >= min_conf)
        status_l[no_data] = ST_NODATA

        fails_l = self._constraints(cfg.get("constraints", {}), score_l, status_l)
        failing = (fails_l > 0) & (status_l == ST_OK)
        status_l[failing] = ST_EXCLUDED if cfg.get("constraint_mode", "exclude") == "exclude" else ST_FLAGGED

        N = NLAT * NLON
        score = np.full(N, np.nan, np.float32)
        conf = np.full(N, np.nan, np.float32)
        fails = np.zeros(N, np.uint16)
        status = np.zeros(N, np.uint8)
        score[self.land_idx] = score_l
        conf[self.land_idx] = conf_l
        fails[self.land_idx] = fails_l
        status[self.land_idx] = status_l

        res = Result(rid, cfg, score, conf, fails, status, sims, active, not_app, weights)
        with self._lock:
            self._results[rid] = res
            while len(self._results) > 24:
                self._results.popitem(last=False)
        return res

    def _constraints(self, c: dict, score_l: np.ndarray, status_l: np.ndarray) -> np.ndarray:
        L = self.g.layers
        li = self.land_idx
        f = np.zeros(len(li), np.uint16)

        def lay(name):
            return L[name].ravel()[li]

        def check(bit, values, limit, op):
            if limit is None or limit == "":
                return
            v = values
            bad = ~np.isfinite(v) | (v > float(limit) if op == "max" else v < float(limit))  # unknown -> fail (conservative)
            f[bad] |= bit

        check(C_SLOPE, lay("slope_p90"), c.get("max_slope_p90"), "max")
        check(C_SOLAR, lay("ALLSKY_SFC_SW_DWN"), c.get("min_solar_wm2"), "min")
        check(C_DAILY, lay("TS_RANGE"), c.get("max_daily_range"), "max")
        check(C_SEASONAL, lay("T2M_SEASONAL_RANGE"), c.get("max_seasonal_range"), "max")
        check(C_RELIEF, lay("relief_m"), c.get("max_relief_m"), "max")
        check(C_ROAD, lay("dist_road_km"), c.get("max_road_km"), "max")
        if c.get("exclude_protected"):
            f[lay("protected") == 1] |= C_PROTECTED          # only KNOWN protected areas
        if c.get("exclude_ice_sheets"):
            f[np.nan_to_num(lay("lc_snow_ice")) > 0.5] |= C_ICE

        # Minimum contiguous area: connected components (8-neighbour) of cells that pass every
        # other constraint AND reach the area score threshold. Components smaller than the
        # requested area fail.
        min_area = c.get("min_area_km2")
        if min_area not in (None, "", 0):
            thr = float(c.get("area_score_threshold", 50))
            good_l = (f == 0) & (status_l == ST_OK) & (score_l >= thr)
            good = np.zeros(NLAT * NLON, bool)
            good[li] = good_l
            lab, nlab = ndimage.label(good.reshape(NLAT, NLON), structure=np.ones((3, 3)))
            if nlab:
                area = ndimage.sum(L["cell_area_km2"], lab, index=np.arange(1, nlab + 1))
                small = np.zeros(nlab + 1, bool)
                small[1:] = area < float(min_area)
                lab_l = lab.ravel()[li]
                bad = (lab_l == 0) | small[lab_l]
            else:
                bad = np.ones(len(li), bool)
            f[bad] |= C_AREA
        return f

    def result(self, rid: str) -> Result | None:
        with self._lock:
            return self._results.get(rid)

    # ------------------------------------------------------------------ helpers
    def category_scores(self, res: Result) -> dict[str, np.ndarray]:
        """Weighted score restricted to the parameters of one category (land vector, 0-100)."""
        out = {}
        for cat in CATEGORIES:
            keys = [k for k in res.active if PARAMS[k].category == cat]
            if not keys:
                continue
            num = np.zeros(len(self.land_idx))
            den = np.zeros(len(self.land_idx))
            for k in keys:
                s = res.sims[k]
                ok = np.isfinite(s)
                num[ok] += res.weights[k] * s[ok]
                den[ok] += res.weights[k]
            with np.errstate(invalid="ignore", divide="ignore"):
                out[cat] = np.where(den > 0, 100 * num / den, np.nan)
        return out

    def land_pos(self, flat_index: int) -> int | None:
        j = np.searchsorted(self.land_idx, flat_index)
        if j < len(self.land_idx) and self.land_idx[j] == flat_index:
            return int(j)
        return None


def haversine_km(lat1, lon1, lat2, lon2):
    la1, la2 = np.radians(lat1), np.radians(lat2)
    dla = la2 - la1
    dlo = np.radians(lon2 - lon1)
    a = np.sin(dla / 2) ** 2 + np.cos(la1) * np.cos(la2) * np.sin(dlo / 2) ** 2
    return 2 * 6371.0 * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


_ENGINE: Engine | None = None


def get_engine() -> Engine:
    global _ENGINE
    if _ENGINE is None:
        _ENGINE = Engine()
    return _ENGINE
