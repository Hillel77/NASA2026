"""
Experiment execution planning for one location.

  * Monthly climate match - the climate parameters are re-scored for every calendar month from
    the NASA POWER monthly climatology at this cell, giving the best testing window.
  * Gap analysis - every enabled parameter with low similarity gets a concrete mitigation.
  * Climate readjustment suggestions - machine-applicable changes to the configuration
    (test season, tolerances, weights), each with the reason computed from the data.
"""
from __future__ import annotations

import math

import numpy as np

from .data.grid import MONTHS, NLON
from .scoring import similarity as sim
from .scoring.engine import Engine, Result
from .scoring.parameters import PARAMS
from .scoring.targets import REGIONS

CLIMATE_KEYS = ["temp_mean", "temp_daily", "solar_irradiance", "daylight", "precipitation", "wind"]

MITIGATION = {
    "temp_mean": "Supplement with a thermal chamber or cold-soak enclosure to reach the target mean temperature; schedule outdoor runs in the coldest/warmest month that is closest.",
    "temp_daily": "No outdoor site reaches the target day-night swing; reproduce the thermal cycle in a thermal(-vacuum) chamber and use the field site for the remaining conditions.",
    "temp_seasonal": "Run tests in two campaigns (warm and cold season) or cover the missing range in a climate chamber.",
    "temp_extremes": "Cover the extreme temperatures in a chamber; record actual site extremes with on-site sensors during the campaign.",
    "solar_irradiance": "Adjust irradiance with shading/neutral-density screens (too bright) or a solar simulator (too dark); log irradiance with a pyranometer.",
    "daylight": "Reproduce the target light/dark cycle with shading or artificial lighting schedules for power-system tests.",
    "solar_energy": "Correct for atmospheric transmittance in power models; compare against pyranometer readings on site.",
    "elevation": "Choose a sub-area with matching relief using the high-resolution DEM in the Terrain tab.",
    "slope": "Select test tracks with the target slope distribution from the 150 m DEM sample; build ramps for steeper cases.",
    "roughness": "Pick a sub-area with matching roughness, or prepare test lanes with placed rocks/obstacles.",
    "composition": "Use an unvegetated part of the cell or bring regolith simulant for the critical tests.",
    "rock": "Survey rock cover on transects; add or remove rocks on test lanes to match the target abundance.",
    "soil": "Sample soil (grain size, cohesion, bearing strength); use a regolith simulant bed (e.g. JSC-1A, LHS-1, MGS-1) where it differs.",
    "dust": "Supplement with a dust chamber using a regolith simulant; measure local aerosol load during tests.",
    "wind": "Use a wind tunnel or fans for higher wind loads; choose a calmer season or shielded area if winds are too strong.",
    "precipitation": "Schedule the campaign in the driest months and protect equipment; precipitation never occurs on the target.",
    "humidity": "Run humidity-sensitive tests in a dry chamber or in the driest months; log humidity on site.",
    "aridity": "Prefer the driest season; dry-store equipment between runs.",
    "water": "Avoid wet periods; soil moisture changes traction and thermal behaviour.",
    "ice_proximity": "Plan transport to the nearest ice/frozen ground, or test ISRU hardware on transported ice samples.",
    "accessibility": "Plan logistics: vehicles, fuel and supplies for the distance to the nearest road.",
    "protection": "Obtain permits or move to a non-protected sub-area.",
}


def _month_sims(engine: Engine, res: Result, r: int, c: int) -> dict[str, list]:
    """Per-month similarity of each climate parameter at this cell (NASA POWER monthly climatology)."""
    g = engine.g
    reg = REGIONS[res.config["region"]]["values"]
    pcs = res.config["params"]
    out = {}

    def series(name):
        if name not in g.monthly:
            return None
        arr, ri, ci = g.monthly[name]
        s = arr[:12, ri[r], ci[c]].astype(np.float64)
        s[s <= -998] = np.nan
        return s

    def tol(k):
        v = (pcs.get(k) or {}).get("tolerance")
        return float(v) if v else PARAMS[k].tolerance

    t2m = series("T2M")
    if t2m is not None and reg.get("temp_mean"):
        off = (g.value("TS", r, c) or 0) - (g.value("T2M", r, c) or 0)
        out["temp_mean"] = (t2m + off, sim.gaussian(t2m + off, reg["temp_mean"]["value"], tol("temp_mean")))
    s = series("TS_RANGE")
    if s is not None and reg.get("temp_daily"):
        out["temp_daily"] = (s, sim.gaussian(s, reg["temp_daily"]["value"], tol("temp_daily")))
    s = series("ALLSKY_SFC_SW_DWN")
    if s is not None and reg.get("solar_irradiance"):
        out["solar_irradiance"] = (s, sim.gaussian(s, reg["solar_irradiance"]["value"], tol("solar_irradiance")))
    s = series("DAY_HOURS")
    if s is not None and reg.get("daylight"):
        frac = np.clip(s, 0, 24) / 24
        lo, hi = reg["daylight"]["value"]
        # a month matches when its daylight fraction lies inside the target's range
        d = np.where(frac < lo, lo - frac, np.where(frac > hi, frac - hi, 0.0))
        out["daylight"] = (frac, np.exp(-(d ** 2) / (2 * tol("daylight") ** 2)))
    s = series("PRECTOTCORR")
    if s is not None and reg.get("precipitation"):
        out["precipitation"] = (s, sim.gaussian(s, reg["precipitation"]["value"], tol("precipitation")))
    s = series("WS10M")
    if s is not None and reg.get("wind"):
        out["wind"] = (s, sim.gaussian(s, reg["wind"]["value"], tol("wind")))
    return out


def execution_plan(engine: Engine, res: Result, lat: float, lon: float) -> dict:
    g = engine.g
    r, c = g.cell(lat, lon)
    flat = r * NLON + c
    pos = engine.land_pos(flat)
    region = REGIONS[res.config["region"]]
    pcs = res.config["params"]

    # ---------------------------------------------------------------- monthly climate match
    ms = _month_sims(engine, res, r, c)
    use = [k for k in ms if k in res.active] or list(ms)
    weights = {k: (res.weights.get(k) or 1.0) for k in use}
    monthly = []
    for i, mname in enumerate(MONTHS):
        vals = {k: float(ms[k][1][i]) for k in use if np.isfinite(ms[k][1][i])}
        wsum = sum(weights[k] for k in vals) or 1
        score = 100 * sum(weights[k] * v for k, v in vals.items()) / wsum if vals else None
        monthly.append({"month": mname, "index": i + 1, "score": None if score is None else round(score, 1),
                        **{k: round(v * 100, 1) for k, v in vals.items()},
                        **{f"{k}_value": round(float(ms[k][0][i]), 3) for k in use if np.isfinite(ms[k][0][i])}})
    valid = [m for m in monthly if m["score"] is not None]
    best_window = None
    if valid:
        sc = np.array([m["score"] if m["score"] is not None else -1 for m in monthly])
        win = [(sum(sc[(i + j) % 12] for j in range(3)) / 3, i) for i in range(12)]
        best, i0 = max(win)
        months = [((i0 + j) % 12) + 1 for j in range(3)]
        annual = float(np.mean([m["score"] for m in valid]))
        best_window = {"months": months, "label": f"{MONTHS[months[0]-1]}–{MONTHS[months[-1]-1]}",
                       "score": round(float(best), 1), "annual": round(annual, 1), "params_used": use}

    # ---------------------------------------------------------------- gaps & mitigations
    gaps = []
    for k in res.active:
        if pos is None:
            break
        s = res.sims[k][pos]
        if not np.isfinite(s) or s >= 0.5:
            continue
        p = PARAMS[k]
        gaps.append({"key": k, "label": p.label, "similarity": round(float(s) * 100, 1), "repro": p.repro,
                     "mitigation": MITIGATION.get(k, "Cover this condition in a laboratory facility.")})
    gaps.sort(key=lambda x: x["similarity"])

    # ---------------------------------------------------------------- execution steps
    t = g.value("dist_road_km", r, c)
    town = g.value("dist_place_km", r, c)
    steps = []
    if best_window:
        steps.append({"phase": "Timing", "text": f"Hold the main campaign in {best_window['label']}: climate match {best_window['score']:.0f}/100 versus {best_window['annual']:.0f}/100 averaged over the year."})
    steps.append({"phase": "Reconnaissance", "text": "Visit the cell first: map candidate test areas with the 150 m DEM sample, photograph rock cover on transects and sample the soil."})
    steps.append({"phase": "Instrumentation", "text": "Deploy a weather station (temperature, irradiance, wind, humidity) for the whole campaign so results can be compared with the target environment, not only with climatology."})
    if gaps:
        steps.append({"phase": "Lab supplements", "text": "Book laboratory tests for the conditions the site cannot provide: " + ", ".join(gp["label"] for gp in gaps[:5]) + "."})
    steps.append({"phase": "Logistics", "text": f"Nearest major road ≈ {t:.0f} km, nearest town ≈ {town:.0f} km. Plan vehicles, power, water and communications accordingly." if t is not None and town is not None else "Plan access, power, water and communications."})
    steps.append({"phase": "Verification", "text": "Before the campaign, confirm the site data against NASA records (NASA verification tab) and against your own on-site measurements."})

    # ---------------------------------------------------------------- readjustment suggestions
    adjustments = []
    if best_window and best_window["score"] - best_window["annual"] >= 3:
        adjustments.append({"type": "season", "months": best_window["months"],
                            "title": f"Score climate parameters for {best_window['label']} only",
                            "reason": f"This site's climate match rises from {best_window['annual']:.0f} to {best_window['score']:.0f}/100 in that window. "
                                      "Rescoring all sites for the same season compares them under your actual test conditions."})
    land_layers = engine.layers_for(res.config.get("season_months"))
    for k in res.active:
        p = PARAMS[k]
        if k not in CLIMATE_KEYS + ["temp_seasonal", "temp_extremes", "humidity", "dust", "solar_energy"]:
            continue
        if p.kind != "gaussian":
            continue
        s_land = res.sims[k]
        best = float(np.nanpercentile(s_land, 99)) if np.isfinite(s_land).any() else 1.0
        if best >= 0.3:
            continue
        x = land_layers[p.layers[0]].ravel()[engine.land_idx]
        tval = region["values"][k]["value"]
        dist = np.abs(x - tval)
        d99 = float(np.nanpercentile(dist, 1))       # gap of the closest 1% of land
        new_tol = max(d99 / math.sqrt(2 * math.log(2)), 1e-3)   # closest 1% of land -> 50% similarity
        new_tol = round(new_tol, 1) if new_tol >= 1 else round(new_tol, 3)
        cur = (pcs.get(k) or {}).get("tolerance") or p.tolerance
        if new_tol > cur * 1.1:
            adjustments.append({"type": "tolerance", "param": k, "label": p.label, "from": cur, "to": new_tol,
                                "title": f"Widen {p.label.lower()} tolerance {cur:g} → {new_tol:g} {p.unit}",
                                "reason": f"No location on Earth is within the current tolerance (best 1% of land: {best*100:.0f}% similarity; "
                                          f"closest values are {d99:.1f} {p.unit} from the target). A wider tolerance ranks the closest partial "
                                          "analogs instead of scoring everything ≈0. The condition stays only partially reproducible."})
    for k in res.active:
        p = PARAMS[k]
        if p.repro in ("laboratory", "impossible") and k in CLIMATE_KEYS + ["pressure", "radiation", "gravity"]:
            adjustments.append({"type": "weight", "param": k, "label": p.label, "from": res.weights[k], "to": 0,
                                "title": f"Disable {p.label.lower()}",
                                "reason": "Cannot be reproduced outdoors; it lowers every site equally and only hides the differences between sites."})
    if res.config.get("season_months"):
        adjustments.append({"type": "season", "months": None, "title": "Return to annual climate scoring",
                            "reason": "Currently scoring climate for a test season; switch back to the full-year climatology."})

    return {
        "lat": float(lat), "lon": float(lon),
        "target": region["name"],
        "monthly": monthly, "monthly_params": [{"key": k, "label": PARAMS[k].label} for k in use],
        "best_window": best_window, "gaps": gaps, "steps": steps, "adjustments": adjustments,
        "season_months": res.config.get("season_months"),
        "source": "NASA POWER v10 monthly climatology 2001–2020 (MERRA-2, CERES SYN1deg)",
    }
