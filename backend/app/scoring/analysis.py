"""
Ranking of candidate locations, per-location comparison tables and data-driven explanations.
Explanations are assembled ONLY from the computed similarities and the Earth/target values,
so every sentence can be traced back to a number in the comparison table.
"""
from __future__ import annotations

import math

import numpy as np

from ..data.grid import LAT_C, LON_C, MONTHS, NLON, RES, SLOPE_BINS
from . import similarity as sim
from .engine import (CONSTRAINT_INFO, ST_EXCLUDED, ST_FLAGGED, ST_NODATA, ST_OK, Engine, Result,
                     haversine_km)
from .parameters import CATEGORIES, PARAMS, REPRO_LABELS, SRC
from .targets import REGIONS


def _title(s: str | None) -> str | None:
    if not s:
        return s
    small = {"de", "del", "la", "el", "of", "the", "and", "da", "do", "des", "du"}
    words = s.lower().split()
    return " ".join(w if (i and w in small) else w.capitalize() for i, w in enumerate(words))


CONTINENTS = {"ASIA", "AFRICA", "EUROPE", "NORTH AMERICA", "SOUTH AMERICA", "ANTARCTICA", "AUSTRALIA", "OCEANIA"}


def place_info(engine: Engine, flat: int) -> dict:
    g = engine.g
    r, c = divmod(flat, NLON)
    L = g.layers
    ci = int(L["country_idx"][r, c]) if "country_idx" in L else -1
    ri = int(L["region_idx"][r, c]) if "region_idx" in L else -1
    pi = int(L["place_idx"][r, c]) if "place_idx" in L else -1
    country = g.labels["countries"][ci] if ci >= 0 else None
    region = g.labels["regions"][ri] if ri >= 0 else None
    place = g.labels["places"][pi] if pi >= 0 else None
    dplace = g.value("dist_place_km", r, c)
    name = None
    if region and region.get("name") and region["name"].upper() not in CONTINENTS:
        name = _title(region["name"])
    elif place:
        name = f"{round(dplace) if dplace else '?'} km from {place['name']}"
    else:
        name = f"{abs(LAT_C[r]):.2f}°{'N' if LAT_C[r] >= 0 else 'S'}, {abs(LON_C[c]):.2f}°{'E' if LON_C[c] >= 0 else 'W'}"
    return {
        "name": name,
        "country": country["name"] if country else "—",
        "iso3": country["iso3"] if country else None,
        "continent": country["continent"] if country else None,
        "nearest_place": place["name"] if place else None,
        "nearest_place_km": round(dplace, 1) if dplace is not None else None,
    }


def rank(engine: Engine, res: Result, top_n: int = 10, min_sep_km: float = 250.0,
         include_flagged: bool = True) -> list[dict]:
    st = res.status
    ok = (st == ST_OK) | ((st == ST_FLAGGED) & include_flagged)
    cand = np.flatnonzero(ok & np.isfinite(res.score))
    if len(cand) == 0:
        return []
    # sort by score, then confidence
    order = cand[np.lexsort((-np.nan_to_num(res.confidence[cand]), -res.score[cand]))]
    picked: list[int] = []
    plat, plon = [], []
    for f in order:
        r, c = divmod(int(f), NLON)
        la, lo = LAT_C[r], LON_C[c]
        if picked and np.min(haversine_km(la, lo, np.array(plat), np.array(plon))) < min_sep_km:
            continue
        picked.append(int(f))
        plat.append(la)
        plon.append(lo)
        if len(picked) >= top_n:
            break
    out = []
    for i, f in enumerate(picked):
        r, c = divmod(f, NLON)
        pos = engine.land_pos(f)
        info = place_info(engine, f)
        out.append({
            "rank": i + 1, "lat": round(float(LAT_C[r]), 3), "lon": round(float(LON_C[c]), 3),
            "cell": f, **info,
            "score": round(float(res.score[f]), 1),
            "confidence": round(float(res.confidence[f]), 1),
            "flagged": bool(res.status[f] == ST_FLAGGED),
            "failed_constraints": constraint_labels(int(res.fails[f])),
            "summary": short_reason(res, pos),
        })
    return out


def constraint_labels(bits: int) -> list[str]:
    return [lab for bit, (_, lab, _) in CONSTRAINT_INFO.items() if bits & bit]


def short_reason(res: Result, pos: int | None) -> str:
    if pos is None:
        return ""
    items = [(k, res.sims[k][pos], res.weights[k]) for k in res.active]
    good = sorted([x for x in items if np.isfinite(x[1])], key=lambda x: -(x[1] * x[2]))
    strong = [PARAMS[k].label.lower() for k, s, _ in good if s >= 0.7][:3]
    weak = [PARAMS[k].label.lower() for k, s, w in sorted(good, key=lambda x: x[1]) if s < 0.4][:2]
    missing = [PARAMS[k].label.lower() for k, s, _ in items if not np.isfinite(s)]
    parts = []
    if strong:
        parts.append("Close match in " + ", ".join(strong))
    else:
        parts.append("Best available compromise; no parameter matches strongly")
    if weak:
        parts.append("weaker on " + ", ".join(weak))
    if missing:
        parts.append(f"{len(missing)} parameter(s) without data")
    return "; ".join(parts) + "."


def _fmt(v, unit=""):
    if v is None:
        return "—"
    if isinstance(v, str):
        return v
    if isinstance(v, (list, tuple)):
        return " / ".join(_fmt(x) for x in v) + (f" {unit}" if unit else "")
    if isinstance(v, dict):
        return f"median {v['median']}°, p90 {v['p90']}°"
    av = abs(v)
    if av != 0 and (av < 0.01 or av >= 1e5):
        s = f"{v:.2e}"
    elif av < 1:
        s = f"{v:.3f}"
    elif av < 100:
        s = f"{v:.1f}"
    else:
        s = f"{v:.0f}"
    return s + (f" {unit}" if unit else "")


def _num(x):
    if x is None:
        return None
    try:
        xf = float(x)
    except (TypeError, ValueError):
        return None
    return None if not math.isfinite(xf) else round(xf, 4)


def location_detail(engine: Engine, res: Result, lat: float, lon: float) -> dict:
    g = engine.g
    r, c = g.cell(lat, lon)
    flat = r * NLON + c
    pos = engine.land_pos(flat)
    region = REGIONS[res.config["region"]]
    info = place_info(engine, flat)
    L = engine.layers_for(res.config.get("season_months"))
    rows = []
    for key, p in PARAMS.items():
        pc = res.config["params"].get(key, {})
        enabled = key in res.active
        tgt = region["values"].get(key)
        ev = [None if not np.isfinite(L[l][r, c]) else float(L[l][r, c]) for l in p.layers]
        earth = ev[0] if len(ev) == 1 else ev
        if p.kind == "slope_hist":
            earth = {"median": _num(ev[0]), "p90": _num(ev[1])}
        s = None
        if pos is not None and key in res.sims:
            v = res.sims[key][pos]
            s = None if not np.isfinite(v) else float(v)
        elif pos is not None and (tgt is not None or p.kind in ("pref", "binary_ok")):
            v = engine.param_similarity(key, res.config["region"], pc.get("tolerance"), pc.get("extra"),
                                        res.config.get("season_months"))[pos]
            s = None if not np.isfinite(v) else float(v)
        diff = None
        if tgt is not None and p.kind in ("gaussian", "log_gaussian") and isinstance(earth, float):
            diff = earth - float(tgt["value"])
        elif tgt is not None and p.kind in ("pair", "daylight") and all(x is not None for x in ev):
            diff = [ev[0] - tgt["value"][0], ev[1] - tgt["value"][1]]
        elif tgt is not None and p.kind == "slope_hist" and ev[0] is not None:
            diff = {"median": ev[0] - tgt["value"]["median"], "p90": (ev[1] or 0) - tgt["value"]["p90"]}
        target_disp = None
        if p.kind == "pref":
            ex = {**p.extra, **(pc.get("extra") or {})}
            target_disp = {"value": f"{'≤' if ex.get('mode') != 'remote' else '≥'} {ex.get('ideal_km')} km (preference)",
                           "source": "User preference", "quality": "preference", "note": "Logistics criterion, not a planetary property."}
        elif p.kind == "binary_ok":
            target_disp = {"value": "not protected", "source": "User preference", "quality": "preference", "note": ""}
        rows.append({
            "key": key, "label": p.label, "category": p.category, "unit": p.unit,
            "enabled": enabled, "weight": res.weights.get(key, 0),
            "target": target_disp or tgt, "earth": earth,
            "earth_available": all(x is not None for x in ev),
            "difference": diff, "similarity": s,
            "quality": p.quality, "repro": p.repro, "repro_label": REPRO_LABELS[p.repro],
            "source": SRC[p.source], "method": p.method,
            "not_applicable": key in res.not_applicable or (tgt is None and p.kind not in ("pref", "binary_ok")),
        })

    # monthly series for charts (real POWER climatology at the native grid cell)
    monthly = {
        "months": MONTHS,
        "t2m": g.monthly_series("T2M", r, c), "t2m_max": g.monthly_series("T2M_MAX_AVG", r, c),
        "t2m_min": g.monthly_series("T2M_MIN_AVG", r, c), "ts_range": g.monthly_series("TS_RANGE", r, c),
        "solar": g.monthly_series("ALLSKY_SFC_SW_DWN", r, c), "toa": g.monthly_series("TOA_SW_DWN", r, c),
        "day_hours": g.monthly_series("DAY_HOURS", r, c), "precip": g.monthly_series("PRECTOTCORR", r, c),
        "wind": g.monthly_series("WS10M", r, c),
    }
    hist = g.slope_hist[:, r, c]
    slope = {
        "bins": [f"{int(SLOPE_BINS[i])}–{int(SLOPE_BINS[i+1])}°" for i in range(len(SLOPE_BINS) - 1)],
        "earth_pct": [None if not np.isfinite(x) else round(float(x), 2) for x in hist],
    }
    tslope = region["values"].get("slope")
    if tslope:
        probs = sim.lognormal_bin_probs(tslope["value"]["median"], tslope["value"]["p90"], SLOPE_BINS)
        slope["target_pct"] = [round(float(x) * 100, 2) for x in probs]

    score = _num(res.score[flat])
    conf = _num(res.confidence[flat])
    cats = {}
    if pos is not None:
        for cat, arr in engine.category_scores(res).items():
            cats[cat] = _num(arr[pos])
    status_names = {0: "ocean / outside land mask", ST_OK: "ok", ST_NODATA: "insufficient data",
                    ST_EXCLUDED: "excluded by constraint", ST_FLAGGED: "flagged: violates constraint"}
    detail = {
        "lat": round(float(LAT_C[r]), 3), "lon": round(float(LON_C[c]), 3),
        "cell_bounds": [float(LON_C[c] - RES / 2), float(LAT_C[r] - RES / 2), float(LON_C[c] + RES / 2), float(LAT_C[r] + RES / 2)],
        **info,
        "score": score, "confidence": conf, "status": status_names[int(res.status[flat])],
        "failed_constraints": constraint_labels(int(res.fails[flat])),
        "category_scores": {CATEGORIES[k]: v for k, v in cats.items()},
        "target": {"id": res.config["region"], "name": region["name"], "body": region["body"]},
        "rows": rows, "monthly": monthly, "slope": slope,
        "terrain": {k: _num(g.value(k, r, c)) for k in ("elev_mean", "elev_std", "elev_min", "elev_max", "relief_m",
                                                         "rough_m", "slope_mean", "slope_p50", "slope_p90")},
        "landcover": {k[3:]: _num(g.value(k, r, c)) for k in L if k.startswith("lc_")},
        "logistics": {k: _num(g.value(k, r, c)) for k in ("dist_road_km", "dist_place_km", "dist_city100k_km", "dist_ice_km")},
        "data_mode": g.mode,
    }
    detail["explanation"] = explain(detail, res)
    detail["limitations"] = limitations(detail)
    return detail


def explain(d: dict, res: Result) -> list[str]:
    """Plain-language explanation built only from the comparison table values."""
    mission = res.config.get("preset_name") or "the configured experiment"
    rows = [r for r in d["rows"] if r["enabled"]]
    scored = [r for r in rows if r["similarity"] is not None]
    if d["score"] is None or not scored:
        return ["No compatibility score could be computed for this cell (insufficient data or outside the land mask)."]
    strong = sorted([r for r in scored if r["similarity"] >= 0.7], key=lambda r: -r["weight"] * r["similarity"])
    weak = sorted([r for r in scored if r["similarity"] < 0.4], key=lambda r: -r["weight"])
    missing = [r for r in rows if r["similarity"] is None]
    lvl = "a strong" if d["score"] >= 70 else "a moderate" if d["score"] >= 50 else "a weak"
    out = []
    head = f"{d['name']} ({d['country']}) is {lvl} candidate for {mission.lower()} against {d['target']['name']} (score {d['score']:.0f}/100, data confidence {d['confidence']:.0f}%)."
    out.append(head)
    if strong:
        bits = []
        for r in strong[:4]:
            bits.append(f"{r['label'].lower()} ({_fmt(r['earth'], r['unit'])} vs. target {_fmt(r['target']['value'] if isinstance(r['target'], dict) else None, r['unit'])})")
        out.append("It matches the reference well in " + "; ".join(bits) + ".")
    if weak:
        bits = []
        for r in weak[:4]:
            bits.append(f"{r['label'].lower()} ({_fmt(r['earth'], r['unit'])} vs. {_fmt(r['target']['value'] if isinstance(r['target'], dict) else None, r['unit'])}, similarity {r['similarity']*100:.0f}%)")
        out.append("However, it differs substantially in " + "; ".join(bits) + ".")
    proxies = [r["label"].lower() for r in scored if r["quality"] == "proxy"]
    if proxies:
        out.append("Scores for " + ", ".join(proxies) + " rely on proxy indices, not direct measurements, and should be verified in the field.")
    if missing:
        out.append("No Earth data were available here for: " + ", ".join(r["label"].lower() for r in missing) + "; the score uses the remaining parameters and the confidence is reduced accordingly.")
    nonrep = [r for r in d["rows"] if r["repro"] in ("laboratory", "impossible")]
    out.append("As for every terrestrial site, " + ", ".join(r["label"].lower() for r in nonrep)
               + " cannot be reproduced outdoors and require laboratory facilities (vacuum chambers, radiation beam lines, parabolic flights).")
    if d["failed_constraints"]:
        out.append("Constraint violations: " + "; ".join(d["failed_constraints"]) + ".")
    return out


def limitations(d: dict) -> list[str]:
    return [
        "Grid resolution is 0.25° (~28 km); climate inputs are coarser (MERRA-2 0.5°×0.625°, CERES 1°). Local microclimates are not resolved.",
        "Slopes are computed from ~2.4 km DEM pixels; rover-scale (metre) slopes are steeper. Planetary slope targets are approximate km-scale values.",
        "Planetary reference values are literature summaries (see sources); entries marked 'estimated' are order-of-magnitude.",
        "Rock abundance and soil are proxy indices from land cover, roughness and aridity, not measurements of rock cover, grain size or chemistry.",
        "Protected-area information is only available for the USA in this build; always check local regulations and permits.",
    ]
