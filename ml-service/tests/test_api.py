"""pytest suite for the ML service. Run from ml-service/:  python -m pytest -q"""
from fastapi.testclient import TestClient

from app.main import app
from app.scoring import credit_score, decide

client = TestClient(app)

GOOD = {
    "age": 35, "monthly_income_proxy": 60000, "transaction_regularity": 0.92,
    "monthly_upi_txn_count": 60, "avg_monthly_balance": 90000, "bill_payment_consistency": 0.98,
    "mobile_recharge_regularity": 0.95, "digital_tenure_months": 60, "savings_ratio": 0.35,
    "existing_loans_count": 0, "debt_to_income": 0.05, "loan_amount_requested": 50000,
    "loan_tenure_months": 12, "dependents": 1, "employment_type": "salaried",
    "education_level": "graduate",
}
RISKY = {
    **GOOD, "monthly_income_proxy": 9000, "transaction_regularity": 0.25, "monthly_upi_txn_count": 4,
    "avg_monthly_balance": 600, "bill_payment_consistency": 0.3, "mobile_recharge_regularity": 0.3,
    "digital_tenure_months": 3, "savings_ratio": 0.01, "existing_loans_count": 4, "debt_to_income": 0.9,
    "loan_amount_requested": 150000, "employment_type": "casual_labour", "education_level": "none",
}


def test_health():
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_predict_contract():
    r = client.post("/predict", json=GOOD)
    assert r.status_code == 200
    body = r.json()
    assert 0 <= body["risk_score"] <= 1
    assert body["decision"] in {"approve", "refer", "decline"}
    assert 300 <= body["credit_score"] <= 900
    assert len(body["top_factors"]) == 5
    assert "gender" not in body["shap_values"] and "region" not in body["shap_values"]


def test_risk_ordering():
    good = client.post("/predict", json=GOOD).json()
    risky = client.post("/predict", json=RISKY).json()
    assert good["risk_score"] < risky["risk_score"]
    assert good["decision"] == "approve"
    assert risky["decision"] in {"refer", "decline"}
    assert risky["data_sparsity_flag"] is True


def test_protected_attributes_are_ignored():
    a = client.post("/predict", json={**GOOD, "gender": "female", "region": "rural"}).json()
    b = client.post("/predict", json={**GOOD, "gender": "male", "region": "urban"}).json()
    assert a["risk_score"] == b["risk_score"]


def test_explain_additivity():
    body = client.post("/explain", json=RISKY).json()
    total = body["base_value"] + sum(body["shap_values"].values())
    assert abs(body["waterfall"][-1]["end"] - total) < 1e-3
    assert body["summary"]
    assert body["positive_factors"]


def test_validation_rejects_bad_input():
    r = client.post("/predict", json={**GOOD, "transaction_regularity": 1.7})
    assert r.status_code == 422
    r = client.post("/predict", json={k: v for k, v in GOOD.items() if k != "age"})
    assert r.status_code == 422


def test_batch():
    r = client.post("/predict/batch", json={"applicants": [GOOD, RISKY]})
    assert r.status_code == 200 and r.json()["count"] == 2


def test_audit_batch():
    recs = ([{"risk_score": 0.1, "decision": "approve", "gender": "male", "region": "urban"}] * 30 +
            [{"risk_score": 0.5, "decision": "refer", "gender": "female", "region": "rural"}] * 30)
    body = client.post("/audit", json={"records": recs}).json()
    assert body["by_attribute"]["gender"]["summary"]["demographic_parity_difference"] == 1.0
    assert body["status"] == "attention"


def test_reports_available():
    for path in ["/fairness-report", "/model/info", "/model/evaluation", "/model/explainability",
                 "/model/training"]:
        assert client.get(path).status_code == 200, path


def test_decision_bands_and_score_scale():
    assert decide(0.1) == "approve" and decide(0.45) == "refer" and decide(0.8) == "decline"
    assert credit_score(0.5) == 600 and credit_score(0.01) > credit_score(0.2)
