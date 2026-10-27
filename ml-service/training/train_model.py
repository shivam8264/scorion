"""
Phase 1, step 3 - Train the production XGBoost model.

  * fits the shared CreditPreprocessor on the training split
  * randomized hyperparameter search with 5-fold stratified CV (ROC-AUC)
  * refits the best configuration with early stopping on a validation split
  * saves model.json (XGBoost native format), preprocessor.pkl (joblib),
    model_card.json and training reports used by the Model Insights UI

Usage:
    python training/train_model.py [--n-iter 14]
"""
from __future__ import annotations

import argparse
import time
from datetime import datetime, timezone

import joblib
import numpy as np
import xgboost as xgb
from scipy.stats import loguniform, randint, uniform
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import RandomizedSearchCV, StratifiedKFold

from common import MODELS_DIR, ROOT, SEED, load_dataset, save_json, split
from app.preprocessing import CreditPreprocessor

import os

BASE_PARAMS = dict(
    objective="binary:logistic",
    eval_metric=["logloss", "auc"],
    tree_method="hist",
    random_state=SEED,
    n_jobs=-1,
)

SEARCH_SPACE = {
    "n_estimators": randint(250, 700),
    "max_depth": randint(3, 8),
    "learning_rate": loguniform(0.02, 0.15),
    "subsample": uniform(0.65, 0.35),
    "colsample_bytree": uniform(0.6, 0.4),
    "min_child_weight": randint(1, 12),
    "gamma": uniform(0.0, 2.0),
    "reg_lambda": loguniform(0.5, 10),
    "reg_alpha": loguniform(1e-3, 1.0),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n-iter", type=int, default=14, help="random-search candidates")
    args = ap.parse_args()

    print("== Train XGBoost ==")
    df = load_dataset()
    s = split(df)
    print(f"rows={len(df):,}  train={len(s['X_train']):,}  test={len(s['X_test']):,}  "
          f"default_rate={df['default'].mean():.3f}")

    pre = CreditPreprocessor().fit(s["X_train"])
    Xtr = pre.transform(s["X_train"])
    Xfit, Xval = pre.transform(s["X_fit"]), pre.transform(s["X_val"])
    Xte = pre.transform(s["X_test"])

    # ---- 1. hyperparameter search (5-fold CV) ----------------------------------
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED)
    search = RandomizedSearchCV(
        xgb.XGBClassifier(**{k: v for k, v in BASE_PARAMS.items() if k != "eval_metric"}),
        SEARCH_SPACE,
        n_iter=args.n_iter,
        scoring="roc_auc",
        cv=cv,
        random_state=SEED,
        n_jobs=1,
        verbose=1,
        return_train_score=True,
    )
    t0 = time.time()
    search.fit(Xtr, s["y_train"])
    search_secs = time.time() - t0
    best = search.best_params_
    print(f"best CV AUC={search.best_score_:.4f} in {search_secs:.0f}s  params={best}")

    cvr = search.cv_results_
    candidates = []
    for i in range(len(cvr["params"])):
        candidates.append({
            "rank": int(cvr["rank_test_score"][i]),
            "mean_test_auc": round(float(cvr["mean_test_score"][i]), 4),
            "std_test_auc": round(float(cvr["std_test_score"][i]), 4),
            "mean_train_auc": round(float(cvr["mean_train_score"][i]), 4),
            "fit_time_s": round(float(cvr["mean_fit_time"][i]), 2),
            "params": {k: (round(float(v), 4) if isinstance(v, float) else int(v))
                       for k, v in cvr["params"][i].items()},
        })
    candidates.sort(key=lambda c: c["rank"])
    bi = int(search.best_index_)
    fold_scores = [round(float(cvr[f"split{k}_test_score"][bi]), 4) for k in range(5)]

    # ---- 2. refit with early stopping -------------------------------------------
    params = {**BASE_PARAMS, **best}
    n_max = max(int(best["n_estimators"]) * 2, 600)
    params["n_estimators"] = n_max
    model = xgb.XGBClassifier(**params, early_stopping_rounds=60)
    t0 = time.time()
    model.fit(Xfit, s["y_fit"], eval_set=[(Xfit, s["y_fit"]), (Xval, s["y_val"])], verbose=False)
    fit_secs = time.time() - t0
    best_iter = int(model.best_iteration)
    hist = model.evals_result()
    learning_curve = []
    for i in range(0, len(hist["validation_0"]["logloss"]), 5):
        learning_curve.append({
            "iteration": i,
            "train_logloss": round(hist["validation_0"]["logloss"][i], 5),
            "val_logloss": round(hist["validation_1"]["logloss"][i], 5),
            "train_auc": round(hist["validation_0"]["auc"][i], 5),
            "val_auc": round(hist["validation_1"]["auc"][i], 5),
        })

    # Final model: train on the full training split with the tuned tree count.
    final_params = {**BASE_PARAMS, **best, "n_estimators": best_iter + 1}
    final = xgb.XGBClassifier(**final_params)
    final.fit(Xtr, s["y_train"], verbose=False)
    test_auc = roc_auc_score(s["y_test"], final.predict_proba(Xte)[:, 1])
    print(f"early-stopped at {best_iter + 1} trees; test AUC={test_auc:.4f}")

    # ---- 3. save artifacts ------------------------------------------------------
    final.save_model(os.path.join(MODELS_DIR, "model.json"))
    joblib.dump(pre, os.path.join(MODELS_DIR, "preprocessor.pkl"))
    version = "xgb-" + datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
    card = {
        "model_version": version,
        "algorithm": "XGBoost (gradient boosted decision trees, hist)",
        "xgboost_version": xgb.__version__,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "dataset": "synthetic_applicants.csv (RBI/NPCI/PLFS-calibrated synthetic data)",
        "n_rows": int(len(df)),
        "n_train": int(len(s["X_train"])),
        "n_test": int(len(s["X_test"])),
        "default_rate": round(float(df["default"].mean()), 4),
        "n_features": len(pre.feature_names_),
        "feature_names": pre.feature_names_,
        "hyperparameters": {k: (round(float(v), 5) if isinstance(v, float) else v)
                            for k, v in final_params.items() if k not in ("n_jobs",)},
        "cv_auc_mean": round(float(search.best_score_), 4),
        "cv_auc_std": round(float(np.std(fold_scores)), 4),
        "test_auc": round(float(test_auc), 4),
        "decision_thresholds": {"refer_above": 0.30, "decline_above": 0.60},
        "protected_attributes_used_as_features": False,
        "intended_use": "Research prototype for thin-file credit assessment. Synthetic-data "
                        "metrics are illustrative and are not production performance.",
    }
    save_json(card, "model_card.json", folder=MODELS_DIR)
    save_json({
        "search_seconds": round(search_secs, 1),
        "refit_seconds": round(fit_secs, 1),
        "n_candidates": len(candidates),
        "cv_folds": 5,
        "best_params": card["hyperparameters"],
        "best_cv_auc": round(float(search.best_score_), 4),
        "fold_scores": fold_scores,
        "candidates": candidates,
        "best_iteration": best_iter + 1,
        "learning_curve": learning_curve,
    }, "training_report.json")
    print(f"Model saved -> {os.path.relpath(os.path.join(MODELS_DIR, 'model.json'), ROOT)} ({version})")


if __name__ == "__main__":
    main()
