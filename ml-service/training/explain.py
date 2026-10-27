"""
Phase 1, step 6 - SHAP explainability for the production XGBoost model.

  * shap.TreeExplainer(model) -> exact TreeSHAP values
  * global feature importance (mean |SHAP|), aggregated back to raw features
  * XGBoost native importance (gain / weight / cover) for comparison
  * beeswarm + dependence-plot data for the UI
  * EXPLANATION STABILITY ACROSS SUBGROUPS (the paper's novel contribution):
      - Spearman rank correlation of each subgroup's importance ranking vs overall
      - Jaccard overlap of each subgroup's top-5 features vs overall
      - Perturbation stability: cosine similarity of an applicant's SHAP vector
        before/after small input noise, and top-3 reason agreement, per subgroup
  * saves models/shap_background.npz (reference sample) and reports/explainability.json
"""
from __future__ import annotations

import os

import joblib
import numpy as np
import pandas as pd
import shap
import xgboost as xgb
from scipy.stats import spearmanr

from common import MODELS_DIR, SEED, load_dataset, save_json, split
from app.features import CATEGORICAL_FEATURES, FEATURE_LABELS, NUMERIC_FEATURES, reason_for
from app.preprocessing import parent_feature

TOP_K = 5


def aggregate(shap_matrix: np.ndarray, columns) -> pd.DataFrame:
    """Sum SHAP contributions of one-hot columns back into their parent feature."""
    df = pd.DataFrame(shap_matrix, columns=columns)
    return df.T.groupby([parent_feature(c) for c in columns]).sum().T


def importance(agg: pd.DataFrame) -> pd.Series:
    return agg.abs().mean().sort_values(ascending=False)


def cosine(a, b):
    na, nb = np.linalg.norm(a, axis=1), np.linalg.norm(b, axis=1)
    return (a * b).sum(axis=1) / np.maximum(na * nb, 1e-12)


def main():
    print("== SHAP explainability ==")
    rng = np.random.default_rng(SEED)
    s = split(load_dataset())
    pre = joblib.load(os.path.join(MODELS_DIR, "preprocessor.pkl"))
    model = xgb.XGBClassifier()
    model.load_model(os.path.join(MODELS_DIR, "model.json"))

    Xte = pre.transform(s["X_test"])
    A = s["A_test"].reset_index(drop=True)
    raw = s["X_test"].reset_index(drop=True)
    cols = list(Xte.columns)

    explainer = shap.TreeExplainer(model)
    sv = explainer.shap_values(Xte)
    base = float(np.ravel(explainer.expected_value)[0])
    agg = aggregate(sv, cols)
    imp = importance(agg)
    p = model.predict_proba(Xte)[:, 1]

    # sanity: SHAP additivity (log-odds space)
    recon = base + sv.sum(axis=1)
    margin = model.predict(Xte, output_margin=True)
    additivity_err = float(np.max(np.abs(recon - margin)))
    print(f"  SHAP additivity max error: {additivity_err:.2e}")

    # ---- XGBoost native importance ---------------------------------------------
    booster = model.get_booster()
    native = {}
    for kind in ["gain", "weight", "cover", "total_gain"]:
        sc = booster.get_score(importance_type=kind)
        ser = pd.Series(sc).groupby(lambda c: parent_feature(c)).sum()
        native[kind] = (ser / ser.sum()).sort_values(ascending=False)

    feats = list(imp.index)
    global_importance = [{
        "feature": f,
        "label": FEATURE_LABELS.get(f, f),
        "mean_abs_shap": round(float(imp[f]), 5),
        "share": round(float(imp[f] / imp.sum()), 4),
        "direction": "higher value raises risk" if (
            f in raw.columns and pd.api.types.is_numeric_dtype(raw[f]) and
            np.corrcoef(raw[f].astype(float), agg[f])[0, 1] > 0) else (
            "higher value lowers risk" if f in raw.columns and pd.api.types.is_numeric_dtype(raw[f])
            else "categorical"),
        "gain": round(float(native["gain"].get(f, 0.0)), 4),
        "weight": round(float(native["weight"].get(f, 0.0)), 4),
        "cover": round(float(native["cover"].get(f, 0.0)), 4),
    } for f in feats]

    # ---- beeswarm data (top 10) -------------------------------------------------
    sample = rng.choice(len(Xte), size=min(350, len(Xte)), replace=False)
    beeswarm = []
    numeric_like = set(NUMERIC_FEATURES) | {"estimated_emi", "emi_to_income", "loan_to_annual_income",
                                             "balance_to_income", "log_income", "data_sparsity_flag"}
    for f in feats[:10]:
        if f in numeric_like:
            vals = Xte[f].values.astype(float)
            ranks = pd.Series(vals).rank(pct=True).values
        else:  # categorical: colour by category index
            cats = CATEGORICAL_FEATURES.get(f, [])
            vals = raw[f].map({c: i for i, c in enumerate(cats)}).fillna(0).values.astype(float)
            ranks = vals / max(len(cats) - 1, 1)
        beeswarm.append({
            "feature": f, "label": FEATURE_LABELS.get(f, f),
            "points": [{"shap": round(float(agg[f].iloc[i]), 4),
                        "value_pct": round(float(ranks[i]), 3)} for i in sample],
        })

    # ---- dependence data (top 4 numeric) -----------------------------------------
    dependence = []
    for f in [f for f in feats if f in numeric_like and f != "data_sparsity_flag"][:4]:
        idx = rng.choice(len(Xte), size=500, replace=False)
        dependence.append({
            "feature": f, "label": FEATURE_LABELS.get(f, f),
            "points": sorted([{"x": round(float(Xte[f].iloc[i]), 4), "y": round(float(agg[f].iloc[i]), 4)}
                              for i in idx], key=lambda d: d["x"]),
        })

    # ---- subgroup stability --------------------------------------------------------
    numeric_cols = [c for c in raw.columns if c in NUMERIC_FEATURES]
    stds = raw[numeric_cols].std()
    groups = {}
    for attr in ["gender", "region"]:
        for g in sorted(A[attr].unique()):
            groups[f"{attr}={g}"] = (A[attr] == g).values
    for gen in sorted(A["gender"].unique()):
        for reg in sorted(A["region"].unique()):
            groups[f"gender={gen} & region={reg}"] = ((A["gender"] == gen) & (A["region"] == reg)).values

    overall_rank = imp.rank(ascending=False)
    top_overall = set(feats[:TOP_K])
    stability = []
    for name, mask in groups.items():
        g_imp = importance(agg[mask])
        rho = spearmanr(overall_rank[feats], g_imp.rank(ascending=False)[feats]).statistic
        top_g = set(list(g_imp.index[:TOP_K]))
        jacc = len(top_overall & top_g) / len(top_overall | top_g)

        # perturbation stability on up to 400 applicants from this group
        gi = np.where(mask)[0]
        gi = rng.choice(gi, size=min(400, len(gi)), replace=False)
        noisy = raw.iloc[gi].copy()
        for c in numeric_cols:
            noisy[c] = noisy[c] + rng.normal(0, 0.02 * stds[c], len(gi))
            noisy[c] = noisy[c].clip(lower=0)
        for c in ["transaction_regularity", "bill_payment_consistency", "mobile_recharge_regularity"]:
            noisy[c] = noisy[c].clip(0, 1)
        Xn = pre.transform(noisy)
        sv_n = aggregate(explainer.shap_values(Xn), cols)[feats].values
        sv_o = agg.iloc[gi][feats].values
        cos = cosine(sv_o, sv_n)
        top3_o = np.argsort(-np.abs(sv_o), axis=1)[:, :3]
        top3_n = np.argsort(-np.abs(sv_n), axis=1)[:, :3]
        agree = np.mean([len(set(a) & set(b)) / 3 for a, b in zip(top3_o, top3_n)])

        stability.append({
            "group": name,
            "n": int(mask.sum()),
            "mean_risk_score": round(float(p[mask].mean()), 4),
            "spearman_vs_overall": round(float(rho), 4),
            "top5_jaccard_vs_overall": round(float(jacc), 4),
            "top5_features": [FEATURE_LABELS.get(f, f) for f in g_imp.index[:TOP_K]],
            "perturbation_cosine_mean": round(float(np.mean(cos)), 4),
            "perturbation_cosine_p10": round(float(np.percentile(cos, 10)), 4),
            "top3_reason_agreement": round(float(agree), 4),
            "importance": {f: round(float(g_imp.get(f, 0)), 5) for f in feats[:10]},
        })
        print(f"  {name:<32} rho={rho:.3f} jaccard={jacc:.2f} cos={np.mean(cos):.3f} top3={agree:.3f}")

    # ---- worked examples (one per decision band) -----------------------------------
    examples = []
    for band, (lo, hi) in {"approve": (0, 0.3), "refer": (0.3, 0.6), "decline": (0.6, 1.0)}.items():
        cand = np.where((p > lo) & (p <= hi))[0]
        if len(cand) == 0:
            continue
        i = int(rng.choice(cand))
        contrib = agg.iloc[i].sort_values(key=np.abs, ascending=False)
        examples.append({
            "band": band, "risk_score": round(float(p[i]), 4), "base_value": round(base, 4),
            "contributions": [{"feature": f, "label": FEATURE_LABELS.get(f, f),
                               "shap": round(float(v), 4), "reason": reason_for(f, v)}
                              for f, v in contrib.head(8).items()],
        })

    # ---- background sample for serving ---------------------------------------------
    Xtr = pre.transform(s["X_train"])
    bg = Xtr.sample(200, random_state=SEED)
    # Plain NumPy arrays (not a pickled DataFrame) so the file loads under any pandas version.
    np.savez(os.path.join(MODELS_DIR, "shap_background.npz"),
             values=bg.to_numpy(dtype=float), columns=np.array(bg.columns, dtype=str))

    rhos = [g["spearman_vs_overall"] for g in stability]
    save_json({
        "explainer": "shap.TreeExplainer (exact TreeSHAP, tree_path_dependent)",
        "shap_version": shap.__version__,
        "base_value_logodds": round(base, 4),
        "base_value_probability": round(float(1 / (1 + np.exp(-base))), 4),
        "additivity_max_error": additivity_err,
        "n_explained": int(len(Xte)),
        "global_importance": global_importance,
        "beeswarm": beeswarm,
        "dependence": dependence,
        "stability": {
            "summary": {
                "min_spearman": round(float(min(rhos)), 4),
                "mean_spearman": round(float(np.mean(rhos)), 4),
                "min_top5_jaccard": round(float(min(g["top5_jaccard_vs_overall"] for g in stability)), 4),
                "mean_perturbation_cosine": round(float(np.mean([g["perturbation_cosine_mean"] for g in stability])), 4),
                "interpretation": "Rank correlations close to 1 and high top-5 overlap mean the model "
                                  "relies on the same evidence for every subgroup, so explanations are "
                                  "consistent across gender and region.",
            },
            "groups": stability,
        },
        "examples": examples,
    }, "explainability.json")


if __name__ == "__main__":
    main()
