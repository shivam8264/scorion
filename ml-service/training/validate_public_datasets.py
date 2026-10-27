"""
Phase 1, step 2 - Sanity-check the modelling pipeline on PUBLIC real datasets
before trusting the synthetic data.

  * German Credit (UCI / OpenML "credit-g", 1,000 rows) - downloaded via OpenML
    or read from data/german_credit.csv
  * Home Credit Default Risk (Kaggle) - place application_train.csv in data/
    (requires a Kaggle account: kaggle competitions download -c home-credit-default-risk)

For each available dataset, Logistic Regression and XGBoost are compared with
5-fold stratified CV (ROC-AUC). If XGBoost >= Logistic Regression on real data,
the same pipeline choices are reasonable for the synthetic data.

Results -> models/reports/public_validation.json
"""
from __future__ import annotations

import os

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from common import ROOT, SEED, save_json

DATA = os.path.join(ROOT, "data")


def load_german():
    """German Credit (UCI Statlog). Order of preference:
    1. data/german_credit.csv, 2. OpenML "credit-g" (20 attributes, needs internet),
    3. the copy bundled inside the `dalex` package (9-attribute Kaggle subset, works offline).
    """
    path = os.path.join(DATA, "german_credit.csv")
    if os.path.exists(path):
        df = pd.read_csv(path)
    else:
        try:
            from sklearn.datasets import fetch_openml
            df = fetch_openml("credit-g", version=1, as_frame=True).frame
        except Exception:
            import dalex  # pip install dalex
            d = dalex.datasets.load_german()
            # dalex encodes risk=1 for good credit; convert to the UCI "class" column
            df = d.drop(columns=["risk"]).assign(**{"class": d["risk"].map({1: "good", 0: "bad"})})
        df.to_csv(path, index=False)
    y = (df["class"].astype(str) == "bad").astype(int)
    return df.drop(columns=["class"]), y


def load_home_credit(max_rows=80_000):
    path = os.path.join(DATA, "application_train.csv")
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    df = pd.read_csv(path, nrows=max_rows)
    y = df["TARGET"].astype(int)
    X = df.drop(columns=["TARGET", "SK_ID_CURR"])
    return X, y


def evaluate(X, y):
    cat = [c for c in X.columns if X[c].dtype == "object" or str(X[c].dtype) == "category"]
    num = [c for c in X.columns if c not in cat]
    pre = ColumnTransformer([
        ("num", make_pipeline(SimpleImputer(strategy="median"), StandardScaler()), num),
        ("cat", make_pipeline(SimpleImputer(strategy="most_frequent"),
                              OneHotEncoder(handle_unknown="ignore", min_frequency=0.01)), cat),
    ])
    cv = StratifiedKFold(5, shuffle=True, random_state=SEED)
    out = {}
    for name, clf in {
        "Logistic Regression": LogisticRegression(max_iter=3000),
        "XGBoost": xgb.XGBClassifier(n_estimators=400, max_depth=4, learning_rate=0.05,
                                     subsample=0.9, colsample_bytree=0.8, tree_method="hist",
                                     random_state=SEED),
    }.items():
        s = cross_val_score(make_pipeline(pre, clf), X, y, cv=cv, scoring="roc_auc")
        out[name] = {"cv_auc_mean": round(float(np.mean(s)), 4), "cv_auc_std": round(float(np.std(s)), 4)}
        print(f"    {name:<20} AUC={np.mean(s):.4f} +/- {np.std(s):.4f}")
    return out


def main():
    print("== Public dataset validation ==")
    results = {}
    for name, loader in {"German Credit (UCI)": load_german,
                         "Home Credit Default Risk (Kaggle)": load_home_credit}.items():
        try:
            X, y = loader()
        except Exception as exc:  # dataset unavailable offline
            print(f"  {name}: skipped ({type(exc).__name__}: {exc})")
            results[name] = {"status": "skipped", "reason": str(exc).replace(ROOT + os.sep, "")[:200]}
            continue
        print(f"  {name}: {len(X):,} rows, default rate {y.mean():.3f}")
        results[name] = {"status": "ok", "rows": int(len(X)), "attributes": int(X.shape[1]), "default_rate": round(float(y.mean()), 4),
                         "models": evaluate(X, y)}
    save_json(results, "public_validation.json")


if __name__ == "__main__":
    main()
