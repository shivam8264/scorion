"""
Feature engineering + encoding shared by training and serving.

The fitted `CreditPreprocessor` is saved with joblib (models/preprocessor.pkl)
and re-loaded at service start-up, so the exact same transformation is applied
to a single applicant at inference time as was applied to the training batch.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin

from app.features import (
    BOOLEAN_FEATURES,
    CATEGORICAL_FEATURES,
    ENGINEERED_FEATURES,
    NUMERIC_FEATURES,
    RAW_FEATURES,
)

ANNUAL_INTEREST_RATE = 0.18  # typical small-ticket digital lending APR


def estimate_emi(principal, tenure_months, annual_rate=ANNUAL_INTEREST_RATE):
    r = annual_rate / 12.0
    n = np.maximum(np.asarray(tenure_months, dtype=float), 1.0)
    p = np.asarray(principal, dtype=float)
    factor = (1 + r) ** n
    return p * r * factor / (factor - 1)


def add_engineered_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    income = np.maximum(out["monthly_income_proxy"].astype(float), 1.0)
    out["estimated_emi"] = estimate_emi(out["loan_amount_requested"], out["loan_tenure_months"])
    out["emi_to_income"] = out["estimated_emi"] / income
    out["loan_to_annual_income"] = out["loan_amount_requested"] / (income * 12.0)
    out["balance_to_income"] = out["avg_monthly_balance"] / income
    out["log_income"] = np.log1p(income)
    return out


class CreditPreprocessor(BaseEstimator, TransformerMixin):
    """Engineers ratio features and one-hot encodes categoricals.

    Learned state (fit): numeric clipping bounds (1st/99th percentile) so that
    extreme values at serving time are clipped exactly as in training.
    """

    def __init__(self):
        self.clip_bounds_: dict[str, tuple[float, float]] = {}
        self.feature_names_: list[str] = []

    # --- helpers -------------------------------------------------------------
    @staticmethod
    def _validate(df: pd.DataFrame) -> pd.DataFrame:
        missing = [c for c in RAW_FEATURES if c not in df.columns]
        if missing:
            raise ValueError(f"Missing raw features: {missing}")
        return df[RAW_FEATURES].copy()

    def _encode(self, df: pd.DataFrame) -> pd.DataFrame:
        df = add_engineered_features(df)
        cols = {}
        for c in NUMERIC_FEATURES + ENGINEERED_FEATURES:
            v = df[c].astype(float)
            if c in self.clip_bounds_:
                lo, hi = self.clip_bounds_[c]
                v = v.clip(lo, hi)
            cols[c] = v.values
        for c in BOOLEAN_FEATURES:
            cols[c] = df[c].astype(bool).astype(int).values
        for c, cats in CATEGORICAL_FEATURES.items():
            values = df[c].astype(str).str.lower()
            for cat in cats:
                cols[f"{c}__{cat}"] = (values == cat).astype(int).values
        return pd.DataFrame(cols, index=df.index)

    # --- sklearn API -----------------------------------------------------------
    def fit(self, X: pd.DataFrame, y=None):
        df = add_engineered_features(self._validate(X))
        self.clip_bounds_ = {
            c: (float(df[c].quantile(0.001)), float(df[c].quantile(0.999)))
            for c in NUMERIC_FEATURES + ENGINEERED_FEATURES
        }
        self.feature_names_ = list(self._encode(self._validate(X).head(5)).columns)
        return self

    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        out = self._encode(self._validate(X))
        return out[self.feature_names_]

    def get_feature_names_out(self, input_features=None):
        return np.array(self.feature_names_)


def parent_feature(encoded_name: str) -> str:
    """Map an encoded column back to the raw feature it came from."""
    return encoded_name.split("__")[0]


def compute_sparsity_flag(digital_tenure_months: float, monthly_upi_txn_count: float) -> bool:
    """Business rule used by the data generator AND the API when the flag is not supplied."""
    return bool(digital_tenure_months < 6 or monthly_upi_txn_count < 8)
