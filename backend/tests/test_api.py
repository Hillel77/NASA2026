"""End-to-end API tests (run: cd backend && pytest -q). Uses the real processed grid if present,
otherwise the synthetic demo grid."""
import numpy as np
from fastapi.testclient import TestClient

from app.main import app
from app.scoring import similarity as sim

client = TestClient(app)


def preset_cfg(meta, pid, **kw):
    p = next(x for x in meta["presets"] if x["id"] == pid)
    params = {k: {"enabled": True, "weight": w, "tolerance": p["tolerances"].get(k)} for k, w in p["weights"].items() if w > 0}
    return {"region": p["region"], "params": params, "constraints": p["constraints"], **kw}


def test_similarity_functions():
    assert sim.gaussian(np.array([5.0]), 5.0, 2.0)[0] == 1.0
    assert abs(sim.gaussian(np.array([7.0]), 5.0, 2.0)[0] - np.exp(-0.5)) < 1e-9
    assert np.isnan(sim.gaussian(np.array([np.nan]), 5.0, 2.0)[0])   # missing stays missing
    probs = sim.lognormal_bin_probs(2.0, 6.0, np.array([0, 1, 2, 4, 6, 10, 15, 20, 30, 90]))
    assert abs(probs.sum() - 1) < 1e-9
    h = (probs * 100)[:, None]
    assert abs(sim.bhattacharyya(h, probs)[0] - 1) < 1e-6


def test_meta_and_all_presets():
    meta = client.get("/api/meta").json()
    assert len(meta["parameters"]) >= 21 and len(meta["presets"]) == 10
    for p in meta["presets"]:
        r = client.post("/api/analyze", json=preset_cfg(meta, p["id"])).json()
        assert "result_id" in r, r
        for t in r["top"]:
            assert 0 <= t["score"] <= 100 and 0 <= t["confidence"] <= 100
        scores = [t["score"] for t in r["top"]]
        assert scores == sorted(scores, reverse=True)


def test_constraints_exclude_and_flag():
    meta = client.get("/api/meta").json()
    cfg = preset_cfg(meta, "mars_landing")
    cfg["constraints"] = {"max_slope_p90": 2}
    ex = client.post("/api/analyze", json={**cfg, "constraint_mode": "exclude"}).json()
    fl = client.post("/api/analyze", json={**cfg, "constraint_mode": "flag"}).json()
    assert ex["stats"]["excluded"] > 0 and fl["stats"]["flagged"] == ex["stats"]["excluded"]
    assert all(not t["flagged"] for t in ex["top"])
    loc = client.get("/api/location", params={"rid": ex["result_id"], "lat": ex["top"][0]["lat"], "lon": ex["top"][0]["lon"]}).json()
    assert loc["terrain"]["slope_p90"] <= 2 + 1e-6


def test_missing_data_is_not_zero():
    meta = client.get("/api/meta").json()
    if meta["data_mode"] == "demo":
        import pytest
        pytest.skip("data-dependent check (Atacama) only meaningful with real data")
    cfg = {"region": "mars_gale", "params": {"protection": {"weight": 50}, "aridity": {"weight": 50}}}
    r = client.post("/api/analyze", json=cfg).json()
    # Protected-area data exist only for the USA: elsewhere the score must come from aridity alone,
    # with reduced confidence (not a zero score).
    loc = client.get("/api/location", params={"rid": r["result_id"], "lat": -24.1, "lon": -69.9}).json()
    assert loc["score"] is not None and loc["score"] > 80
    assert loc["confidence"] < 60
    ex = client.post("/api/analyze", json={**cfg, "missing_mode": "exclude"}).json()
    assert ex["stats"]["no_data"] > r["stats"]["no_data"]


def test_layers_and_validation():
    meta = client.get("/api/meta").json()
    r = client.post("/api/analyze", json=preset_cfg(meta, "lunar_rover")).json()
    for layer in ["overall", "confidence", "constraints", "param:slope", "cat:terrain", "data:TS"]:
        resp = client.get(f"/api/layer/{r['result_id']}.png", params={"layer": layer})
        assert resp.status_code == 200 and resp.content[:4] == b"\x89PNG", layer
    v = client.get("/api/validation", params={"rid": r["result_id"]}).json()
    assert len(v["sites"]) >= 10
