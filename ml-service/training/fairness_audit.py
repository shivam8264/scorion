"""
Phase 1, step 5 - Fairness audit with Fairlearn.

Decision used for fairness: an applicant is "flagged" (not auto-approved) when
risk_score > REFER_THRESHOLD. The favourable outcome is auto-approval.

  * MetricFrame by gender, region and gender x region:
      approval rate, true/false positive rate, accuracy, observed default rate
  * demographic parity difference / ratio (four-fifths rule) and
    equalized odds difference
  * Mitigation (fitted on the validation split, evaluated on test):
      - ThresholdOptimizer (demographic parity)
      - ThresholdOptimizer (equalized odds)
      - ExponentiatedGradient (demographic parity) with an XGBoost base learner
  * Before/after comparison table -> models/reports/fairness_report.json

Protected attributes are used ONLY here (and in the live batch audit), never
as model inputs.
"""
from __future__ import annotations

import os
import time
import warnings
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
import xgboost as xgb
from fairlearn.metrics import (
    MetricFrame, demographic_parity_difference, demographic_parity_ratio,
    equalized_odds_difference, false_positive_rate, selection_rate, true_positive_rate,
)
from fairlearn.postprocessing import ThresholdOptimizer
from fairlearn.reductions import DemographicParity, ExponentiatedGradient
from sklearn.base import BaseEstimator, ClassifierMixin
from sklearn.metrics import accuracy_score, balanced_accuracy_score, roc_auc_score

from common import MODELS_DIR, SEED, load_dataset, model_version, save_json, split
from app.features import REFER_THRESHOLD

warnings.filterwarnings("ignore")


class CutoffXGB(BaseEstimator, ClassifierMixin):
    """Small XGBoost learner whose predict() applies the business cutoff.

    Used as the base estimator for ExponentiatedGradient so that mitigated and
    unmitigated models flag applicants under the same rule.
    """

    def __init__(self, cutoff=REFER_THRESHOLD, n_estimators=150, max_depth=4, learning_rate=0.08):
        self.cutoff = cutoff
        self.n_estimators = n_estimators
        self.max_depth = max_depth
        self.learning_rate = learning_rate

    def fit(self, X, y, sample_weight=None):
        self.model_ = xgb.XGBClassifier(
            n_estimators=self.n_estimators, max_depth=self.max_depth,
            learning_rate=self.learning_rate, tree_method="hist", random_state=SEED, n_jobs=-1)
        self.model_.fit(X, y, sample_weight=sample_weight)
        self.classes_ = np.array([0, 1])
        return self

    def predict_proba(self, X):
        return self.model_.predict_proba(X).astype(np.float64)

    def predict(self, X):
        return (self.predict_proba(X)[:, 1] > self.cutoff).astype(int)


class Float64Model(BaseEstimator, ClassifierMixin):
    """Wraps the fitted booster so scores are float64 (Fairlearn assigns into float64 arrays)."""

    def __init__(self, model=None):
        self.model = model

    def fit(self, X, y=None):
        return self

    def __sklearn_is_fitted__(self):
        return True

    @property
    def classes_(self):
        return np.array([0, 1])

    def predict_proba(self, X):
        return self.model.predict_proba(X).astype(np.float64)

    def predict(self, X):
        return (self.predict_proba(X)[:, 1] > REFER_THRESHOLD).astype(int)


def approval_rate(y_true, y_pred):
    return 1.0 - selection_rate(y_true, y_pred)


METRICS = {
    "approval_rate": approval_rate,
    "flag_rate": selection_rate,
    "tpr": true_positive_rate,       # share of real defaulters that were flagged
    "fpr": false_positive_rate,      # share of good payers wrongly flagged
    "accuracy": accuracy_score,
    "count": lambda y, p: len(y),
    "observed_default_rate": lambda y, p: float(np.mean(y)),
}


def frame(y, yhat, sens):
    mf = MetricFrame(metrics=METRICS, y_true=y, y_pred=yhat, sensitive_features=sens)
    rows = []
    for g, r in mf.by_group.iterrows():
        rows.append({"group": g if isinstance(g, str) else " & ".join(map(str, g)),
                     **{k: (int(v) if k == "count" else round(float(v), 4)) for k, v in r.items()}})
    return rows


def summary(y, yhat, sens):
    # Fairlearn's selection rate is on the "flag" (1) label; approval = 1 - flag,
    # so the parity difference is identical for approvals.
    dp_diff = demographic_parity_difference(y, yhat, sensitive_features=sens)
    appr = pd.Series(1 - yhat).groupby(np.asarray(sens)).mean()
    return {
        "demographic_parity_difference": round(float(dp_diff), 4),
        "approval_rate_ratio": round(float(appr.min() / max(appr.max(), 1e-9)), 4),
        "flag_rate_ratio": round(float(demographic_parity_ratio(y, yhat, sensitive_features=sens)), 4),
        "equalized_odds_difference": round(float(equalized_odds_difference(y, yhat, sensitive_features=sens)), 4),
        "accuracy": round(float(accuracy_score(y, yhat)), 4),
        "balanced_accuracy": round(float(balanced_accuracy_score(y, yhat)), 4),
        "approval_rate": round(float(1 - np.mean(yhat)), 4),
        "passes_four_fifths_rule": bool(appr.min() / max(appr.max(), 1e-9) >= 0.8),
    }


def per_attribute(y, yhat, A, score=None):
    """Gender and region evaluated separately for one set of decisions (used for before/after tables)."""
    out = {}
    for attr in ["gender", "region"]:
        sens = A[attr].values
        out[attr] = {
            "summary": summary(y, yhat, sens),
            "approval_by_group": {g: round(float(1 - yhat[sens == g].mean()), 4) for g in sorted(set(sens))},
        }
    if score is not None:
        # For the unmitigated model this is the usual AUC of the risk score. For mitigated
        # (randomised, group-thresholded) classifiers it is the AUC of their near-binary
        # flag probability, so it is NOT comparable with the model's AUC-ROC.
        out["auc_of_output"] = round(float(roc_auc_score(y, score)), 4)
    return out


def mitigated_scores(estimator, X, sens=None):
    """Probability of being flagged under a randomized mitigated classifier (for AUC); None if unavailable."""
    try:
        if sens is None:
            return estimator._pmf_predict(X)[:, 1]
        return estimator._pmf_predict(X, sensitive_features=sens)[:, 1]
    except Exception:  # private API may change between Fairlearn versions
        return None


def main():
    print("== Fairness audit ==")
    s = split(load_dataset())
    pre = joblib.load(os.path.join(MODELS_DIR, "preprocessor.pkl"))
    model = xgb.XGBClassifier()
    model.load_model(os.path.join(MODELS_DIR, "model.json"))

    Xval, yval = pre.transform(s["X_val"]), s["y_val"].values
    Xte, yte = pre.transform(s["X_test"]), s["y_test"].values
    Aval, Ate = s["A_val"].reset_index(drop=True), s["A_test"].reset_index(drop=True)
    combo_val = (Aval["gender"] + "|" + Aval["region"]).values
    combo_te = (Ate["gender"] + "|" + Ate["region"]).values

    p_te = model.predict_proba(Xte)[:, 1]
    yhat = (p_te > REFER_THRESHOLD).astype(int)

    # ---- 1. unmitigated audit per attribute ---------------------------------------
    by_attribute = {}
    for attr, sens in {"gender": Ate["gender"].values, "region": Ate["region"].values,
                       "gender_x_region": combo_te}.items():
        by_attribute[attr] = {"summary": summary(yte, yhat, sens), "by_group": frame(yte, yhat, sens)}
        sm = by_attribute[attr]["summary"]
        print(f"  {attr:<16} DPdiff={sm['demographic_parity_difference']:.4f} "
              f"EOdiff={sm['equalized_odds_difference']:.4f} ratio={sm['approval_rate_ratio']:.3f}")

    mean_scores = pd.DataFrame({"score": p_te, "g": combo_te}).groupby("g")["score"].mean().round(4).to_dict()

    # ---- 2. mitigation --------------------------------------------------------------
    mitigations = [{"method": "Unmitigated XGBoost", "family": "baseline",
                    "summary": summary(yte, yhat, combo_te), "by_group": frame(yte, yhat, combo_te),
                    "per_attribute": per_attribute(yte, yhat, Ate, p_te),
                    "seconds": 0.0}]

    for constraint in ["demographic_parity", "equalized_odds"]:
        t0 = time.time()
        to = ThresholdOptimizer(estimator=Float64Model(model), constraints=constraint, prefit=True,
                                predict_method="predict_proba", objective="balanced_accuracy_score")
        to.fit(Xval, yval, sensitive_features=combo_val)
        yh = to.predict(Xte, sensitive_features=combo_te, random_state=SEED)
        mitigations.append({
            "method": f"ThresholdOptimizer ({constraint.replace('_', ' ')})",
            "family": "post-processing",
            "summary": summary(yte, yh, combo_te), "by_group": frame(yte, yh, combo_te),
            "per_attribute": per_attribute(yte, yh, Ate, mitigated_scores(to, Xte, combo_te)),
            "seconds": round(time.time() - t0, 2),
        })

    t0 = time.time()
    Xfit, yfit = pre.transform(s["X_fit"]), s["y_fit"].values
    Afit = s["A_fit"].reset_index(drop=True)
    combo_fit = (Afit["gender"] + "|" + Afit["region"]).values
    sub = np.random.default_rng(SEED).choice(len(Xfit), size=min(25_000, len(Xfit)), replace=False)
    eg = ExponentiatedGradient(CutoffXGB(), constraints=DemographicParity(difference_bound=0.02),
                               eps=0.02, max_iter=20)
    eg.fit(Xfit.iloc[sub], yfit[sub], sensitive_features=combo_fit[sub])
    yh = eg.predict(Xte, random_state=SEED)
    mitigations.append({
        "method": "ExponentiatedGradient (demographic parity)",
        "family": "in-processing (reduction)",
        "summary": summary(yte, yh, combo_te), "by_group": frame(yte, yh, combo_te),
        "per_attribute": per_attribute(yte, yh, Ate, mitigated_scores(eg, Xte)),
        "seconds": round(time.time() - t0, 2),
    })
    for m in mitigations:
        sm = m["summary"]
        print(f"  {m['method']:<46} DP={sm['demographic_parity_difference']:.4f} "
              f"EO={sm['equalized_odds_difference']:.4f} acc={sm['accuracy']:.4f}")

    base = mitigations[0]["summary"]
    for m in mitigations:
        sm = m["summary"]
        m["dp_reduction_pct"] = round(100 * (1 - sm["demographic_parity_difference"] /
                                             max(base["demographic_parity_difference"], 1e-9)), 1)
        m["eo_reduction_pct"] = round(100 * (1 - sm["equalized_odds_difference"] /
                                             max(base["equalized_odds_difference"], 1e-9)), 1)
        m["accuracy_change"] = round(sm["accuracy"] - base["accuracy"], 4)

    save_json({
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "offline audit on held-out test split",
        "model_version": model_version(),
        "n": int(len(yte)),
        "decision_rule": f"flagged (not auto-approved) when risk_score > {REFER_THRESHOLD}",
        "favourable_outcome": "auto-approval",
        "protected_attributes": ["gender", "region"],
        "thresholds_for_concern": {"demographic_parity_difference": 0.10,
                                   "equalized_odds_difference": 0.10, "approval_rate_ratio": 0.80},
        "by_attribute": by_attribute,
        "mean_risk_score_by_group": mean_scores,
        "mitigation": mitigations,
        "notes": [
            "Protected attributes are never model inputs; disparities arise through proxies "
            "(income, digital tenure, transaction counts).",
            "Post-processing mitigation needs the protected attribute at decision time, which may be "
            "restricted by regulation; the production API therefore reports it as an audit result "
            "and leaves the deployment decision to the institution.",
        ],
    }, "fairness_report.json")


if __name__ == "__main__":
    main()
