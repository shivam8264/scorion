"""Shared helpers for the offline training pipeline."""
from __future__ import annotations

import json
import os
import sys

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from app.features import PROTECTED_ATTRIBUTES, RAW_FEATURES, TARGET  # noqa: E402

DATA_PATH = os.path.join(ROOT, "data", "synthetic_applicants.csv")
MODELS_DIR = os.path.join(ROOT, "models")
REPORTS_DIR = os.path.join(MODELS_DIR, "reports")
SEED = 42
TEST_SIZE = 0.20
VAL_SIZE = 0.10  # carved out of train for early stopping / threshold selection

os.makedirs(REPORTS_DIR, exist_ok=True)


def model_version() -> str:
    path = os.path.join(MODELS_DIR, "model_card.json")
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f).get("model_version", "unknown")
    return "unknown"


def load_dataset(path: str = DATA_PATH) -> pd.DataFrame:
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"{path} not found. Run: python training/generate_synthetic_data.py"
        )
    return pd.read_csv(path)


def split(df: pd.DataFrame):
    """Deterministic stratified train / validation / test split.

    Returns dict of DataFrames: X_*, y_*, A_* (protected attributes).
    The same seed is used by every script so splits always line up.
    """
    idx_train, idx_test = train_test_split(
        df.index, test_size=TEST_SIZE, stratify=df[TARGET], random_state=SEED
    )
    idx_fit, idx_val = train_test_split(
        idx_train, test_size=VAL_SIZE, stratify=df.loc[idx_train, TARGET], random_state=SEED
    )
    prot = list(PROTECTED_ATTRIBUTES)

    def part(ix):
        d = df.loc[ix]
        return d[RAW_FEATURES], d[TARGET].astype(int), d[prot]

    out = {}
    for name, ix in [("train", idx_train), ("fit", idx_fit), ("val", idx_val), ("test", idx_test)]:
        out[f"X_{name}"], out[f"y_{name}"], out[f"A_{name}"] = part(ix)
    return out


def save_json(obj, name: str, folder: str = REPORTS_DIR):
    path = os.path.join(folder, name)
    with open(path, "w") as f:
        json.dump(obj, f, indent=2, default=_json_default)
    print(f"  saved {os.path.relpath(path, ROOT)}")
    return path


def load_json(name: str, folder: str = REPORTS_DIR):
    with open(os.path.join(folder, name)) as f:
        return json.load(f)


def _json_default(o):
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return float(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    if isinstance(o, (np.bool_,)):
        return bool(o)
    raise TypeError(type(o))


def downsample_curve(x, y, points: int = 120, extra=None):
    """Reduce a ROC/PR curve to ~`points` evenly spaced samples for the UI."""
    x = np.asarray(x)
    y = np.asarray(y)
    if len(x) <= points:
        idx = np.arange(len(x))
    else:
        idx = np.unique(np.linspace(0, len(x) - 1, points).round().astype(int))
    res = [{"x": round(float(x[i]), 4), "y": round(float(y[i]), 4)} for i in idx]
    if extra is not None:
        for r, i in zip(res, idx):
            r["threshold"] = round(float(np.clip(extra[min(i, len(extra) - 1)], 0, 1)), 4)
    return res
