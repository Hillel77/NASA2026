"""
Post-analysis research advisor.

Everything here is computed from the analysis result itself, so every recommendation can be
traced to a number:

  * Parameter review - for each parameter the user enabled (and the ones they did not):
      weight share, data coverage, data quality, reproducibility class, how much the parameter
      varies across eligible sites (discrimination), how well the best-ranked sites match it,
      and whether removing it changes the #1 site (leave-one-out sensitivity).
      -> verdict: keep | review | reduce | lab | remove | consider_adding
  * Constraint review - share of land each constraint removes, and whether it is redundant or
      removes almost everything.
  * Practical research advice - concrete, data-backed recommendations for planning the study.
"""
from __future__ import annotations

import numpy as np

from .data.grid import LAT_C, LON_C, NLON
from .scoring.engine import CONSTRAINT_INFO, ST_OK, Engine, Result
from .scoring.parameters import PARAMS
from .scoring.targets import REGIONS

VERDICT_ORDER = {"remove": 0, "lab": 1, "reduce": 2, "review": 3, "consider_adding": 4, "keep": 5}


def _f(x, d=1):
    return None if x is None or not np.isfinite(x) else round(float(x), d)


def parameter_review(engine: Engine, res: Result, top: list[dict]) -> list[dict]:
    eligible = np.flatnonzero(res.status[engine.land_idx] == ST_OK)       # positions in land vector
    land_pos_top = [engine.land_pos(t["cell"]) for t in top]
    land_pos_top = [p for p in land_pos_top if p is not None]
    total_w = sum(res.weights.values()) or 1.0
    score_land = res.score[engine.land_idx]
    region = REGIONS[res.config["region"]]
    out = []

    # Leave-one-out: does dropping a parameter change the #1 site?
    top1 = top[0]["cell"] if top else None
    loo_changes = {}
    if top1 is not None and len(res.active) > 1 and len(eligible):
        num = np.zeros(len(eligible))
        den = np.zeros(len(eligible))
        parts = {}
        for k in res.active:
            s = res.sims[k][eligible]
            ok = np.isfinite(s)
            a = np.where(ok, res.weights[k] * np.nan_to_num(s), 0.0)
            b = np.where(ok, res.weights[k], 0.0)
            parts[k] = (a, b)
            num += a
            den += b
        cells = engine.land_idx[eligible]
        for k, (a, b) in parts.items():
            with np.errstate(invalid="ignore", divide="ignore"):
                alt = np.where(den - b > 0, (num - a) / (den - b), -1)
            loo_changes[k] = int(cells[int(np.argmax(alt))]) != top1

    for key, p in PARAMS.items():
        enabled = key in res.active
        w = res.weights.get(key, 0.0)
        tgt = region["values"].get(key)
        needs_target = p.kind not in ("pref", "binary_ok")
        item = {"key": key, "label": p.label, "category": p.category, "enabled": enabled, "weight": w,
                "weight_share": _f(100 * w / total_w) if enabled else 0.0, "quality": p.quality, "repro": p.repro,
                "reasons": []}
        if key in res.not_applicable or (needs_target and tgt is None):
            if key in res.not_applicable:
                item.update(verdict="remove", reasons=[f"Not applicable to {region['name']}: the reference region has no value for it, so it was ignored."])
                out.append(item)
            continue
        s_land = res.sims.get(key)
        if s_land is None:
            s_land = engine.param_similarity(key, res.config["region"], (res.config["params"].get(key) or {}).get("tolerance"),
                                             (res.config["params"].get(key) or {}).get("extra"), res.config.get("season_months"))
        cov = float(np.isfinite(s_land).mean() * 100)
        s_el = s_land[eligible] if len(eligible) else s_land
        disc = float(np.nanstd(s_el)) if np.isfinite(s_el).any() else 0.0
        top_vals = [s_land[p_] for p_ in land_pos_top if np.isfinite(s_land[p_])]
        top_mean = float(np.mean(top_vals)) if top_vals else None
        best_earth = float(np.nanpercentile(s_land, 99)) if np.isfinite(s_land).any() else None
        corr = None
        ok = np.isfinite(s_el) & np.isfinite(score_land[eligible] if len(eligible) else s_el)
        if enabled and ok.sum() > 50 and np.nanstd(s_el[ok]) > 1e-6:
            corr = float(np.corrcoef(s_el[ok], score_land[eligible][ok])[0, 1])
        item.update(coverage_pct=_f(cov), discrimination=_f(disc * 100), top_mean_similarity=_f(top_mean * 100 if top_mean is not None else None),
                    best_earth_similarity=_f(best_earth * 100 if best_earth is not None else None),
                    correlation_with_score=_f(corr, 2), changes_top_site_if_removed=loo_changes.get(key))
        R = item["reasons"]

        if enabled:
            share = 100 * w / total_w
            if p.repro in ("laboratory", "impossible"):
                item["verdict"] = "lab"
                R.append(f"{p.label} cannot be reproduced outdoors (best Earth site reaches {item['best_earth_similarity']}% similarity). "
                         f"It lowers every score almost equally, so it carries {share:.0f}% of the weight without improving the ranking. "
                         "Disable it here and plan a laboratory test instead.")
            elif cov < 50:
                item["verdict"] = "review"
                R.append(f"Earth data exist for only {cov:.0f}% of land cells, so it lowers confidence almost everywhere. "
                         "Keep it only if this criterion is essential, or switch to 'Score + confidence' mode.")
            elif best_earth is not None and best_earth < 0.15:
                item["verdict"] = "review"
                R.append(f"No location on Earth comes close: even the best 1% of land reaches only {best_earth*100:.0f}% similarity. "
                         "With this tolerance the parameter cannot tell sites apart. Widen its tolerance (see the Execution tab) "
                         "or cover it with a laboratory test.")
            elif p.quality == "proxy" and share > 15:
                item["verdict"] = "reduce"
                R.append(f"Proxy index (not a direct measurement) holding {share:.0f}% of the total weight. "
                         "Lower its weight or confirm it in the field before relying on the ranking.")
            elif disc < 0.03:
                item["verdict"] = "review"
                R.append(f"Barely varies between eligible sites (spread {disc*100:.1f} similarity points), so it hardly affects the ranking. "
                         "It is relevant to the target but not decisive here; keep a low weight or disable it.")
            else:
                item["verdict"] = "keep"
                R.append(f"Separates candidate sites well (spread {disc*100:.0f} points)"
                         + (f" and the top sites match it at {top_mean*100:.0f}% on average." if top_mean is not None else "."))
            if loo_changes.get(key):
                R.append("Removing it would change the #1 site - the ranking depends on it, so double-check its weight and tolerance.")
            if top_mean is not None and top_mean < 0.4 and item["verdict"] == "keep":
                item["verdict"] = "review"
                R.append(f"The top-ranked sites match it poorly ({top_mean*100:.0f}% on average): they win on other parameters.")
        else:
            if p.repro in ("laboratory", "impossible"):
                continue
            if top_mean is not None and top_mean < 0.35 and cov >= 50 and disc >= 0.05:
                item["verdict"] = "consider_adding"
                R.append(f"Not enabled, but the current top sites match it poorly ({top_mean*100:.0f}% on average). "
                         "If it matters for your test, enable it - the ranking would change.")
            else:
                continue
        out.append(item)
    out.sort(key=lambda x: (VERDICT_ORDER.get(x.get("verdict", "keep"), 9), -x.get("weight", 0)))
    return out


def constraint_review(engine: Engine, res: Result) -> list[dict]:
    land = res.status[engine.land_idx] > 0
    n = int(land.sum()) or 1
    fails = res.fails[engine.land_idx]
    c = res.config.get("constraints") or {}
    out = []
    for bit, (key, label, unit) in CONSTRAINT_INFO.items():
        val = c.get(key)
        if val in (None, False, "", 0) and not (key == "min_area_km2" and val):
            continue
        frac = float(((fails & bit) > 0).sum() / n * 100)
        only = float((fails == bit).sum() / n * 100)
        item = {"key": key, "label": label, "value": val, "unit": unit, "excluded_pct": round(frac, 1),
                "only_reason_pct": round(only, 1)}
        if frac > 95:
            item["verdict"] = "review"
            item["advice"] = f"Removes {frac:.0f}% of all land. Check that this limit is really required; relaxing it slightly may reveal better sites."
        elif frac < 0.5:
            item["verdict"] = "review"
            item["advice"] = "Has almost no effect on the result - harmless, but it does not narrow the search."
        else:
            item["verdict"] = "keep"
            item["advice"] = f"Removes {frac:.0f}% of land ({only:.0f}% for this reason alone)."
        out.append(item)
    return out


def research_advice(engine: Engine, res: Result, top: list[dict], params: list[dict], best_window: dict | None) -> list[dict]:
    adv = []
    region = REGIONS[res.config["region"]]
    if not top:
        return [{"kind": "warning", "title": "No eligible location",
                 "detail": "No cell satisfies every constraint. Relax the strictest constraint (see Constraint review) or switch to 'Flag violators'."}]
    t = top[0]
    adv.append({"kind": "plan", "title": "Shortlist before committing",
                "detail": f"Treat the top {min(3, len(top))} sites ({', '.join(x['name'] for x in top[:3])}) as a shortlist. "
                          f"Scores are on a 0.25° (~28 km) grid: inside each cell, pick the exact test area with a high-resolution DEM and imagery "
                          "(the Terrain tab shows a 150 m sample)."})
    conf = np.mean([x["confidence"] for x in top[:3]])
    if conf < 75:
        adv.append({"kind": "data", "title": "Close the data gaps first",
                    "detail": f"Average data confidence of the top sites is {conf:.0f}%. Parameters without data or with proxy indices "
                              "should be measured on site (soil grain size, rock counts per m², local temperatures) before the campaign."})
    proxies = [p for p in params if p.get("enabled") and p["quality"] == "proxy"]
    if proxies:
        adv.append({"kind": "field", "title": "Field-verify the proxy parameters",
                    "detail": "Rock abundance and soil scores are proxy indices. Plan a reconnaissance visit: transect photos for "
                              "rock cover (%), sieve analysis for grain size, and penetrometer readings for bearing strength."})
    lab = [p["label"] for p in params if p.get("verdict") == "lab"]
    nonrep = ["vacuum / low pressure", "reduced gravity", "space radiation"]
    adv.append({"kind": "lab", "title": "Pair the field site with laboratory tests",
                "detail": f"No outdoor site reproduces {', '.join(nonrep)}"
                          + (f" (you enabled: {', '.join(lab)})" if lab else "")
                          + ". Test those aspects in thermal-vacuum chambers, parabolic flights or offloading rigs, and radiation beam lines."})
    weak = [p for p in params if p.get("enabled") and p.get("top_mean_similarity") is not None and p["top_mean_similarity"] < 40
            and p["repro"] not in ("laboratory", "impossible")]
    if weak:
        adv.append({"kind": "gap", "title": "Known mismatches at the best sites",
                    "detail": "The top sites match these parameters poorly: "
                              + "; ".join(f"{p['label']} ({p['top_mean_similarity']:.0f}%)" for p in weak[:4])
                              + ". Document them as test limitations or supplement them in the lab."})
    if best_window and best_window.get("months"):
        adv.append({"kind": "season", "title": "Schedule the campaign by climate",
                    "detail": f"At {t['name']}, the closest climate match to {region['name']} is in "
                              f"{best_window['label']} (climate match {best_window['score']:.0f}/100 vs. {best_window['annual']:.0f}/100 annual average). "
                              "Use the Execution tab to rescore all sites for that season."})
    robust = [p for p in params if p.get("enabled") and p.get("changes_top_site_if_removed")]
    if robust:
        adv.append({"kind": "robustness", "title": "Ranking sensitivity",
                    "detail": "The #1 site changes if you remove " + ", ".join(p["label"] for p in robust)
                              + ". Make sure these weights reflect your test priorities before choosing a site."})
    else:
        adv.append({"kind": "robustness", "title": "Ranking is robust",
                    "detail": f"{t['name']} stays the #1 site when any single enabled parameter is removed."})
    adv.append({"kind": "permits", "title": "Access and permits",
                "detail": f"{t['name']} ({t['country']}) is {t.get('nearest_place_km') or '?'} km from {t.get('nearest_place') or 'the nearest town'}. "
                          "Check land ownership, protected-area status and research permits locally - TerraNova only knows protected areas in the USA."})
    return adv


def advisor_report(engine: Engine, res: Result, top: list[dict], best_window: dict | None = None) -> dict:
    params = parameter_review(engine, res, top)
    return {
        "parameters": params,
        "constraints": constraint_review(engine, res),
        "advice": research_advice(engine, res, top, params, best_window),
        "summary": {
            "relevant": [p["label"] for p in params if p.get("verdict") == "keep"],
            "review": [p["label"] for p in params if p.get("verdict") in ("review", "reduce")],
            "not_relevant": [p["label"] for p in params if p.get("verdict") in ("remove", "lab")],
            "consider_adding": [p["label"] for p in params if p.get("verdict") == "consider_adding"],
        },
    }
