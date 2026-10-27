"""
Phase 1, step 4 - Evaluate the production XGBoost model on the held-out test split.

Computes AUC-ROC, F1, Brier score (paper metrics) plus Gini, KS, PR-AUC,
calibration, score distributions, decision-band outcomes and a threshold
sweep. Writes models/reports/evaluation.json.
"""
from __future__ import annotations

import os

import joblib
import numpy as np
import xgboost as xgb
from sklearn.calibration import calibration_curve
from sklearn.metrics import (
    accuracy_score, average_precision_score, brier_score_loss, confusion_matrix,
    f1_score, log_loss, precision_recall_curve, precision_score, recall_score,
    roc_auc_score, roc_curve,
)

from common import MODELS_DIR, downsample_curve, load_dataset, save_json, split
from app.features import DECLINE_THRESHOLD, REFER_THRESHOLD


def decision_band(p):
    return np.where(p > DECLINE_THRESHOLD, "decline", np.where(p > REFER_THRESHOLD, "refer", "approve"))


def main():
    print("== Evaluate XGBoost ==")
    s = split(load_dataset())
    pre = joblib.load(os.path.join(MODELS_DIR, "preprocessor.pkl"))
    model = xgb.XGBClassifier()
    model.load_model(os.path.join(MODELS_DIR, "model.json"))

    Xte, yte = pre.transform(s["X_test"]), s["y_test"].values
    p = model.predict_proba(Xte)[:, 1]

    # F1-optimal threshold chosen on the validation split (no test leakage)
    pv = model.predict_proba(pre.transform(s["X_val"]))[:, 1]
    prec_v, rec_v, thr_v = precision_recall_curve(s["y_val"], pv)
    f1v = 2 * prec_v * rec_v / np.maximum(prec_v + rec_v, 1e-9)
    thr = float(thr_v[int(np.nanargmax(f1v[:-1]))])
    yhat = (p >= thr).astype(int)

    fpr, tpr, roc_thr = roc_curve(yte, p)
    prec, rec, _ = precision_recall_curve(yte, p)
    frac_pos, mean_pred = calibration_curve(yte, p, n_bins=10, strategy="quantile")
    tn, fp, fn, tp = confusion_matrix(yte, yhat).ravel()
    auc = roc_auc_score(yte, p)

    # Decision bands -> what actually happened in each band
    bands = decision_band(p)
    band_stats = []
    for b in ["approve", "refer", "decline"]:
        m = bands == b
        band_stats.append({
            "band": b,
            "count": int(m.sum()),
            "share": round(float(m.mean()), 4),
            "observed_default_rate": round(float(yte[m].mean()), 4) if m.any() else None,
            "mean_risk_score": round(float(p[m].mean()), 4) if m.any() else None,
        })

    # Score distribution histogram for defaulters vs repayers
    bins = np.linspace(0, 1, 21)
    h_good, _ = np.histogram(p[yte == 0], bins=bins)
    h_bad, _ = np.histogram(p[yte == 1], bins=bins)
    score_dist = [{"bin": f"{bins[i]:.2f}-{bins[i+1]:.2f}", "start": round(float(bins[i]), 2),
                   "repaid": int(h_good[i]), "defaulted": int(h_bad[i])} for i in range(20)]

    # Threshold sweep - approval rate vs default rate among approved (business trade-off)
    sweep = []
    for t in np.round(np.arange(0.05, 0.96, 0.05), 2):
        approved = p <= t
        sweep.append({
            "threshold": float(t),
            "approval_rate": round(float(approved.mean()), 4),
            "default_rate_approved": round(float(yte[approved].mean()), 4) if approved.any() else 0.0,
            "recall_defaulters": round(float(((p > t) & (yte == 1)).sum() / max(yte.sum(), 1)), 4),
        })

    # Decile (lift) table
    order = np.argsort(-p)
    deciles = np.array_split(order, 10)
    base_rate = yte.mean()
    lift = [{"decile": i + 1,
             "mean_score": round(float(p[d].mean()), 4),
             "default_rate": round(float(yte[d].mean()), 4),
             "lift": round(float(yte[d].mean() / base_rate), 3)} for i, d in enumerate(deciles)]

    report = {
        "test_rows": int(len(yte)),
        "base_default_rate": round(float(base_rate), 4),
        "metrics": {
            "auc_roc": round(auc, 4),
            "gini": round(2 * auc - 1, 4),
            "ks": round(float(np.max(tpr - fpr)), 4),
            "pr_auc": round(average_precision_score(yte, p), 4),
            "brier": round(brier_score_loss(yte, p), 4),
            "log_loss": round(log_loss(yte, p), 4),
            "f1": round(f1_score(yte, yhat), 4),
            "precision": round(precision_score(yte, yhat), 4),
            "recall": round(recall_score(yte, yhat), 4),
            "accuracy": round(accuracy_score(yte, yhat), 4),
            "f1_threshold": round(thr, 4),
        },
        "confusion_matrix": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
        "roc_curve": downsample_curve(fpr, tpr, 100, extra=roc_thr),
        "pr_curve": downsample_curve(rec[::-1], prec[::-1], 100),
        "calibration": [{"predicted": round(float(a), 4), "observed": round(float(b), 4)}
                        for a, b in zip(mean_pred, frac_pos)],
        "decision_bands": band_stats,
        "decision_thresholds": {"refer_above": REFER_THRESHOLD, "decline_above": DECLINE_THRESHOLD},
        "score_distribution": score_dist,
        "threshold_sweep": sweep,
        "lift_table": lift,
    }
    save_json(report, "evaluation.json")
    m = report["metrics"]
    print(f"AUC={m['auc_roc']}  F1={m['f1']}  Brier={m['brier']}  KS={m['ks']}")


if __name__ == "__main__":
    main()
