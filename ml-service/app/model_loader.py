"""
Loads every artifact ONCE at service start-up (not per request).

    models/model.json          XGBoost native model
    models/preprocessor.pkl    fitted CreditPreprocessor (joblib)
    models/shap_background.npz reference sample of training rows (NumPy, version independent)
    models/model_card.json     metadata incl. model_version
    models/reports/*.json      offline evaluation / comparison / fairness reports
"""
from __future__ import annotations

import json
import os
from functools import lru_cache

import joblib
import numpy as np
import pandas as pd
import shap
import xgboost as xgb

from app.features import RAW_FEATURES
from app.preprocessing import compute_sparsity_flag

MODELS_DIR = os.environ.get("MODELS_DIR", os.path.join(os.path.dirname(__file__), "..", "models"))
REPORTS_DIR = os.path.join(MODELS_DIR, "reports")


class ModelBundle:
    def __init__(self, models_dir: str = MODELS_DIR):
        self.models_dir = models_dir
        model_path = os.path.join(models_dir, "model.json")
        if not os.path.exists(model_path):
            raise RuntimeError(
                f"No trained model at {model_path}. Run `python training/run_pipeline.py` first.")
        self.model = xgb.XGBClassifier()
        self.model.load_model(model_path)
        self.preprocessor = joblib.load(os.path.join(models_dir, "preprocessor.pkl"))
        self.explainer = shap.TreeExplainer(self.model)
        self.base_value = float(np.ravel(self.explainer.expected_value)[0])
        bg_path = os.path.join(models_dir, "shap_background.npz")
        self.background = None
        if os.path.exists(bg_path):
            with np.load(bg_path, allow_pickle=False) as z:
                self.background = pd.DataFrame(z["values"], columns=[str(c) for c in z["columns"]])
        card_path = os.path.join(models_dir, "model_card.json")
        self.card = json.load(open(card_path)) if os.path.exists(card_path) else {}
        self.version = self.card.get("model_version", "unknown")

    def to_frame(self, applicants: list[dict]) -> pd.DataFrame:
        rows = []
        for a in applicants:
            a = dict(a)
            if a.get("data_sparsity_flag") is None:
                a["data_sparsity_flag"] = compute_sparsity_flag(
                    a["digital_tenure_months"], a["monthly_upi_txn_count"])
            rows.append({k: a[k] for k in RAW_FEATURES})
        return pd.DataFrame(rows)

    def transform(self, raw: pd.DataFrame) -> pd.DataFrame:
        return self.preprocessor.transform(raw)

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        return self.model.predict_proba(X)[:, 1]

    def shap_values(self, X: pd.DataFrame) -> np.ndarray:
        return np.asarray(self.explainer.shap_values(X))


@lru_cache(maxsize=1)
def get_bundle() -> ModelBundle:
    return ModelBundle()


def load_report(name: str):
    path = os.path.join(REPORTS_DIR, name)
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)
