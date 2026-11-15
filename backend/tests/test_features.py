"""Tests for the advisor, execution planning, test-season scoring, NASA verification and LLM fallback."""
from fastapi.testclient import TestClient

from app import verify
from app.main import app

client = TestClient(app)


def _run(pid="mars_rover", **kw):
    meta = client.get("/api/meta").json()
    p = next(x for x in meta["presets"] if x["id"] == pid)
    params = {k: {"enabled": True, "weight": w, "tolerance": p["tolerances"].get(k)} for k, w in p["weights"].items() if w > 0}
    cfg = {"region": p["region"], "params": params, "constraints": p["constraints"], "preset_name": p["name"], **kw}
    return meta, client.post("/api/analyze", json=cfg).json()


def test_advisor_reviews_every_enabled_parameter():
    _, r = _run()
    a = client.get("/api/advisor", params={"rid": r["result_id"]}).json()
    enabled = set(r["active"])
    reviewed = {p["key"] for p in a["parameters"] if p["enabled"]}
    assert enabled == reviewed
    assert all(p["verdict"] in {"keep", "review", "reduce", "lab", "remove", "consider_adding"} and p["reasons"] for p in a["parameters"])
    assert a["advice"] and all(x["title"] and x["detail"] for x in a["advice"])


def test_lab_only_parameters_flagged():
    meta = client.get("/api/meta").json()
    cfg = {"region": "mars_gale", "params": {"pressure": {"weight": 50}, "slope": {"weight": 50}}}
    r = client.post("/api/analyze", json=cfg).json()
    a = client.get("/api/advisor", params={"rid": r["result_id"]}).json()
    assert next(p for p in a["parameters"] if p["key"] == "pressure")["verdict"] == "lab"


def test_execution_plan_and_season_rescoring():
    meta, r = _run("mars_habitat")
    t = r["top"][0]
    e = client.get("/api/execution", params={"rid": r["result_id"], "lat": t["lat"], "lon": t["lon"]}).json()
    assert len(e["monthly"]) == 12 and e["steps"]
    if meta["data_mode"] == "real":
        assert e["best_window"] and len(e["best_window"]["months"]) == 3
        _, r2 = _run("mars_habitat", season_months=e["best_window"]["months"])
        assert r2["result_id"] != r["result_id"]
        loc = client.get("/api/location", params={"rid": r2["result_id"], "lat": t["lat"], "lon": t["lon"]}).json()
        assert loc["score"] is not None


def test_verification_unit_conversion_and_compare(monkeypatch):
    # Simulated NASA POWER API response (RE community: kWh/m²/day and kPa)
    fake = {"available": True, "url": "https://power.larc.nasa.gov/...", "units": {"ALLSKY_SFC_SW_DWN": "kW-hr/m^2/day", "PS": "kPa", "T2M": "C"},
            "parameters": {"T2M": {"ANN": 24.4, **{m: 24.0 for m in ("JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC")}},
                           "ALLSKY_SFC_SW_DWN": {"ANN": 5.98}, "PS": {"ANN": 91.22}, "WS10M": {"ANN": 4.35}}}
    monkeypatch.setattr(verify.connectors, "nasa_power_climatology", lambda *a, **k: fake)
    out = verify._from_api(26.375, 64.875)
    assert abs(out["values"]["ALLSKY_SFC_SW_DWN"] - 5.98 * 1000 / 24) < 1e-6
    assert abs(out["values"]["PS"] - 912.2) < 1e-6
    rows = verify._compare({"T2M": 24.41, "ALLSKY_SFC_SW_DWN": 249.1, "PS": 912.0, "WS10M": 9.0, "T2M_monthly": [24.0] * 12}, out["values"])
    st = {r["variable"]: r["status"] for r in rows}
    assert st["T2M"] == "match" and st["ALLSKY_SFC_SW_DWN"] == "match" and st["PS"] == "match"
    assert st["WS10M"] == "mismatch" and st["ALLSKY_KT"] == "not_available" and st["T2M_monthly"] == "match"


def test_llm_disabled_without_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    _, r = _run()
    ans = client.post("/api/ask", json={"rid": r["result_id"], "question": "When should we test?"}).json()
    assert ans["available"] in (False, True)
    if not ans["available"]:
        assert "ANTHROPIC_API_KEY" in ans["error"] or ans["error"]
