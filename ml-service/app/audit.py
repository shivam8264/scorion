"""
Live batch fairness audit over recent production decisions.

Fairness metrics need a BATCH of decisions, never a single request, so the
Express backend sends recent decisions (with the protected attributes it stores
separately) to POST /audit on a schedule or when an admin clicks "Run audit".
Ground-truth outcomes are usually unknown for recent loans, so outcome-based
metrics (equalized odds) are computed only for records that include
`actual_default`.
"""
from __future__ import annotations

from datetime import datetime, timezone

import numpy as np
import pandas as pd


def _group_rows(df: pd.DataFrame, col: str, min_n: int):
    rows = []
    for g, d in df.groupby(col):
        if len(d) < min_n:
            continue
        row = {
            "group": str(g),
            "count": int(len(d)),
            "approval_rate": round(float((d["decision"] == "approve").mean()), 4),
            "refer_rate": round(float((d["decision"] == "refer").mean()), 4),
            "decline_rate": round(float((d["decision"] == "decline").mean()), 4),
            "mean_risk_score": round(float(d["risk_score"].mean()), 4),
        }
        lab = d.dropna(subset=["actual_default"])
        if len(lab) >= min_n:
            flagged = lab["decision"] != "approve"
            y = lab["actual_default"].astype(int)
            row["tpr"] = round(float(flagged[y == 1].mean()), 4) if (y == 1).any() else None
            row["fpr"] = round(float(flagged[y == 0].mean()), 4) if (y == 0).any() else None
            row["labelled"] = int(len(lab))
        rows.append(row)
    return rows


def _summary(rows):
    if len(rows) < 2:
        return {"status": "insufficient_data", "groups": len(rows)}
    appr = [r["approval_rate"] for r in rows]
    out = {
        "status": "ok",
        "groups": len(rows),
        "demographic_parity_difference": round(max(appr) - min(appr), 4),
        "approval_rate_ratio": round(min(appr) / max(max(appr), 1e-9), 4),
        "mean_score_gap": round(max(r["mean_risk_score"] for r in rows) -
                                min(r["mean_risk_score"] for r in rows), 4),
    }
    out["passes_four_fifths_rule"] = out["approval_rate_ratio"] >= 0.8
    tprs = [r["tpr"] for r in rows if r.get("tpr") is not None]
    fprs = [r["fpr"] for r in rows if r.get("fpr") is not None]
    if len(tprs) >= 2 and len(fprs) >= 2:
        out["equalized_odds_difference"] = round(max(max(tprs) - min(tprs), max(fprs) - min(fprs)), 4)
    else:
        out["equalized_odds_difference"] = None
    return out


def run_audit(records: list[dict], min_group_size: int = 20) -> dict:
    df = pd.DataFrame(records)
    if "actual_default" not in df:
        df["actual_default"] = np.nan
    df["gender"] = df.get("gender", pd.Series(dtype=str)).fillna("unknown").str.lower()
    df["region"] = df.get("region", pd.Series(dtype=str)).fillna("unknown").str.lower()
    df["gender_x_region"] = df["gender"] + " & " + df["region"]

    by_attribute = {}
    for attr in ["gender", "region", "gender_x_region"]:
        rows = _group_rows(df[~df[attr].str.contains("unknown")], attr, min_group_size)
        by_attribute[attr] = {"summary": _summary(rows), "by_group": rows}

    alerts = []
    for attr, v in by_attribute.items():
        s = v["summary"]
        if s.get("status") != "ok":
            continue
        if s["demographic_parity_difference"] > 0.10:
            alerts.append(f"{attr}: approval-rate gap {s['demographic_parity_difference']:.2f} exceeds 0.10")
        if not s["passes_four_fifths_rule"]:
            alerts.append(f"{attr}: approval-rate ratio {s['approval_rate_ratio']:.2f} below 0.80 (four-fifths rule)")
        if (s.get("equalized_odds_difference") or 0) > 0.10:
            alerts.append(f"{attr}: equalized-odds gap {s['equalized_odds_difference']:.2f} exceeds 0.10")

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "live batch audit",
        "n": int(len(df)),
        "labelled": int(df["actual_default"].notna().sum()),
        "decision_mix": {k: int(v) for k, v in df["decision"].value_counts().items()},
        "by_attribute": by_attribute,
        "alerts": alerts,
        "status": "attention" if alerts else "healthy",
    }
