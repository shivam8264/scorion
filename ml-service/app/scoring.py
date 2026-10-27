"""Scoring + explanation logic (kept separate from the HTTP layer for testability)."""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

from app.features import (
    DECLINE_THRESHOLD, ENGINEERED_FEATURES, FEATURE_LABELS, REFER_THRESHOLD, reason_for,
)
from app.model_loader import ModelBundle
from app.preprocessing import add_engineered_features, parent_feature

TOP_N = 5


def decide(risk: float) -> str:
    if risk > DECLINE_THRESHOLD:
        return "decline"
    if risk > REFER_THRESHOLD:
        return "refer"
    return "approve"


def risk_band(risk: float) -> str:
    return "high" if risk > DECLINE_THRESHOLD else "medium" if risk > REFER_THRESHOLD else "low"


def credit_score(risk: float) -> int:
    """Log-odds scaling: 600 points at even odds, +50 points every time good:bad odds double."""
    p = min(max(risk, 1e-6), 1 - 1e-6)
    score = 600 + (50 / math.log(2)) * math.log((1 - p) / p)
    return int(round(min(max(score, 300), 900)))


def _aggregate(row_shap: np.ndarray, columns) -> dict[str, float]:
    out: dict[str, float] = {}
    for c, v in zip(columns, row_shap):
        k = parent_feature(c)
        out[k] = out.get(k, 0.0) + float(v)
    return out


def _value(raw: pd.Series, eng: pd.Series, feature: str):
    if feature in raw.index:
        v = raw[feature]
    elif feature in eng.index:
        v = eng[feature]
    else:
        return None
    if isinstance(v, (np.bool_, bool)):
        return bool(v)
    if isinstance(v, (np.integer, np.floating, int, float)):
        return round(float(v), 4)
    return str(v)


def _details(agg: dict[str, float], raw: pd.Series, eng: pd.Series) -> list[dict]:
    items = sorted(agg.items(), key=lambda kv: abs(kv[1]), reverse=True)
    return [{
        "feature": f,
        "label": FEATURE_LABELS.get(f, f),
        "shap": round(v, 5),
        "value": _value(raw, eng, f),
        "direction": "increases_risk" if v > 0 else "decreases_risk",
        "reason": reason_for(f, v),
    } for f, v in items]


def score_applicants(bundle: ModelBundle, applicants: list[dict]) -> list[dict]:
    raw = bundle.to_frame(applicants)
    X = bundle.transform(raw)
    risks = bundle.predict_proba(X)
    shap_matrix = bundle.shap_values(X)
    eng = add_engineered_features(raw)[ENGINEERED_FEATURES]
    results = []
    for i in range(len(raw)):
        agg = _aggregate(shap_matrix[i], X.columns)
        details = _details(agg, raw.iloc[i], eng.iloc[i])
        r = float(risks[i])
        results.append({
            "risk_score": round(r, 5),
            "credit_score": credit_score(r),
            "decision": decide(r),
            "risk_band": risk_band(r),
            "shap_values": {k: round(v, 5) for k, v in agg.items()},
            "top_factors": [d["reason"] for d in details[:TOP_N]],
            "top_factor_details": details[:TOP_N],
            "base_value": round(bundle.base_value, 5),
            "data_sparsity_flag": bool(raw.iloc[i]["data_sparsity_flag"]),
            "model_version": bundle.version,
            "thresholds": {"refer_above": REFER_THRESHOLD, "decline_above": DECLINE_THRESHOLD},
            "_details": details,
            "_engineered": {k: round(float(v), 5) for k, v in eng.iloc[i].items()},
        })
    return results


def build_summary(decision: str, risk: float, pos: list[dict], neg: list[dict]) -> str:
    """Applicant-facing plain-language explanation."""
    head = {
        "approve": "Your application is likely to be approved.",
        "refer": "Your application needs a manual review by a loan officer.",
        "decline": "Your application is unlikely to be approved at this time.",
    }[decision]
    helped = "; ".join(d["reason"].rstrip(".").lower() for d in neg[:2])
    hurt = "; ".join(d["reason"].rstrip(".").lower() for d in pos[:2])
    parts = [head, f"Estimated risk of default: {risk * 100:.1f}%."]
    if helped:
        parts.append(f"What worked in your favour: {helped}.")
    if hurt:
        parts.append(f"What raised your risk: {hurt}.")
    if decision != "approve" and pos:
        parts.append(f"Improving \"{pos[0]['label'].lower()}\" would have the biggest effect.")
    return " ".join(parts)


def explain_applicant(bundle: ModelBundle, applicant: dict) -> dict:
    res = score_applicants(bundle, [applicant])[0]
    details = res["_details"]
    pos = [d for d in details if d["shap"] > 0]
    neg = [d for d in details if d["shap"] < 0]

    # Waterfall in log-odds space, ending at the model output
    running = bundle.base_value
    waterfall = [{"label": "Average applicant", "start": 0.0, "end": round(running, 5),
                  "value": round(running, 5), "type": "base"}]
    shown = details[:8]
    for d in shown:
        start, running = running, running + d["shap"]
        waterfall.append({"label": d["label"], "feature": d["feature"], "start": round(start, 5),
                          "end": round(running, 5), "value": d["shap"],
                          "type": "increase" if d["shap"] > 0 else "decrease"})
    rest = sum(d["shap"] for d in details[8:])
    if abs(rest) > 1e-9:
        start, running = running, running + rest
        waterfall.append({"label": f"{len(details) - 8} other factors", "start": round(start, 5),
                          "end": round(running, 5), "value": round(rest, 5),
                          "type": "increase" if rest > 0 else "decrease"})
    waterfall.append({"label": "This applicant", "start": 0.0, "end": round(running, 5),
                      "value": round(running, 5), "type": "total",
                      "probability": res["risk_score"]})

    return {
        "risk_score": res["risk_score"],
        "decision": res["decision"],
        "base_value": res["base_value"],
        "base_probability": round(1 / (1 + math.exp(-bundle.base_value)), 5),
        "summary": build_summary(res["decision"], res["risk_score"], pos, neg),
        "positive_factors": pos[:6],
        "negative_factors": neg[:6],
        "waterfall": waterfall,
        "shap_values": res["shap_values"],
        "engineered_features": res["_engineered"],
        "model_version": res["model_version"],
    }


def public(res: dict) -> dict:
    return {k: v for k, v in res.items() if not k.startswith("_")}
