"""
Generates the figures and supporting statistics used in the research report
from the project's own trained artifacts and reports.

Run after the pipeline (train, evaluate, compare, explain, fairness):

    python training/report_figures.py

Outputs
  docs/figures/*.png                 report figures (charts + console-style logs)
  models/reports/report_stats.json   extra statistics quoted in the report
                                     (data profile, label-shuffle test, SHAP direction
                                     checks, pairwise SHAP rank correlations, leakage check)
"""
from __future__ import annotations

import os

import joblib
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import shap  # noqa: E402
import xgboost as xgb  # noqa: E402
from scipy.stats import spearmanr  # noqa: E402
from sklearn.metrics import roc_auc_score  # noqa: E402

from common import MODELS_DIR, ROOT, SEED, load_dataset, load_json, save_json, split  # noqa: E402
from app.features import FEATURE_LABELS, PROTECTED_ATTRIBUTES  # noqa: E402
from app.preprocessing import parent_feature  # noqa: E402

FIG_DIR = os.path.abspath(os.path.join(ROOT, "..", "docs", "figures"))
os.makedirs(FIG_DIR, exist_ok=True)

# Solid colours matching the web app's variables.css
INK = "#17233b"
GREEN = "#0e5e4f"
BLUE = "#2457a6"
AMBER = "#a86a00"
RED = "#c4412b"
GREY = "#6f7a8f"
TEAL = "#1d7a68"
CONSOLE_BG = "#1f2333"
CONSOLE_FG = "#e6e9ef"

plt.rcParams.update({
    "font.family": "serif",
    "font.serif": ["Liberation Serif", "Times New Roman", "DejaVu Serif"],
    "font.size": 11,
    "axes.edgecolor": INK,
    "axes.labelcolor": INK,
    "xtick.color": INK,
    "ytick.color": INK,
    "axes.grid": True,
    "grid.color": "#e3e8e7",
    "grid.linewidth": 0.8,
    "savefig.dpi": 200,
    "savefig.bbox": "tight",
    "savefig.facecolor": "white",
})


def save(fig, name):
    path = os.path.join(FIG_DIR, name)
    fig.savefig(path)
    plt.close(fig)
    print(f"  wrote docs/figures/{name}")


def console(lines, name, width=13.5):
    """Render text lines as a terminal-style image (used for module output figures)."""
    h = 0.28 * len(lines) + 0.5
    fig = plt.figure(figsize=(width, h))
    fig.patch.set_facecolor(CONSOLE_BG)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_facecolor(CONSOLE_BG)
    ax.axis("off")
    for i, line in enumerate(lines):
        color = "#9fd3c7" if line.startswith(">>>") or line.startswith("$") else CONSOLE_FG
        ax.text(0.012, 1 - (i + 0.9) / (len(lines) + 0.6), line, family="DejaVu Sans Mono",
                fontsize=10.5, color=color, va="baseline", transform=ax.transAxes)
    fig.savefig(os.path.join(FIG_DIR, name), facecolor=CONSOLE_BG, dpi=200)
    plt.close(fig)
    print(f"  wrote docs/figures/{name}")


def main():
    print("== Report figures ==")
    df = load_dataset()
    s = split(df)
    pre = joblib.load(os.path.join(MODELS_DIR, "preprocessor.pkl"))
    model = xgb.XGBClassifier()
    model.load_model(os.path.join(MODELS_DIR, "model.json"))
    card = load_json("model_card.json", folder=MODELS_DIR)
    training = load_json("training_report.json")
    comparison = load_json("model_comparison.json")
    evaluation = load_json("evaluation.json")
    expl = load_json("explainability.json")
    fair = load_json("fairness_report.json")
    public = load_json("public_validation.json") if os.path.exists(
        os.path.join(MODELS_DIR, "reports", "public_validation.json")) else {}

    Xtr, Xte = pre.transform(s["X_train"]), pre.transform(s["X_test"])
    yte = s["y_test"].values
    Ate = s["A_test"].reset_index(drop=True)
    p_te = model.predict_proba(Xte)[:, 1]
    models = {m["name"]: m for m in comparison["models"]}
    lr, xg = models["Logistic Regression"], models["XGBoost (tuned)"]

    # ---------------------------------------------------------------- statistics
    stats = {
        "rows": int(len(df)),
        "split": {k: int(len(s[f"X_{k}"])) for k in ["train", "fit", "val", "test"]},
        "default_rate": round(float(df["default"].mean()), 4),
        "default_rate_by_gender": df.groupby("gender")["default"].mean().round(4).to_dict(),
        "default_rate_by_region": df.groupby("region")["default"].mean().round(4).to_dict(),
        "sparse_share": round(float(df["data_sparsity_flag"].mean()), 4),
        "gender_mix": df["gender"].value_counts(normalize=True).round(4).to_dict(),
        "region_mix": df["region"].value_counts(normalize=True).round(4).to_dict(),
        "n_encoded_features": int(Xtr.shape[1]),
    }

    # Leakage check: no protected attribute (or anything derived from it) in the model matrix
    leaked = [c for c in Xtr.columns if parent_feature(c) in PROTECTED_ATTRIBUTES]
    stats["leakage_check"] = {"protected_columns_in_features": leaked, "pass": not leaked}

    # Label-shuffle sanity test: same configuration trained on permuted labels
    params = {k: v for k, v in card["hyperparameters"].items() if k not in ("eval_metric",)}
    rng = np.random.default_rng(SEED)
    shuffled = rng.permutation(s["y_train"].values)
    m_shuf = xgb.XGBClassifier(**params)
    m_shuf.fit(Xtr, shuffled)
    stats["label_shuffle_auc"] = round(float(roc_auc_score(yte, m_shuf.predict_proba(Xte)[:, 1])), 4)
    print(f"  label-shuffle AUC = {stats['label_shuffle_auc']}")

    # SHAP: direction checks and pairwise subgroup rank correlations (in probability-free log-odds)
    explainer = shap.TreeExplainer(model)
    sv = explainer.shap_values(Xte)
    agg = pd.DataFrame(sv, columns=Xte.columns).T.groupby(
        [parent_feature(c) for c in Xte.columns]).sum().T
    directional = {}
    for f in ["transaction_regularity", "bill_payment_consistency", "mobile_recharge_regularity",
              "savings_ratio", "debt_to_income", "emi_to_income", "digital_tenure_months"]:
        directional[f] = round(float(np.corrcoef(Xte[f].astype(float), agg[f])[0, 1]), 3)
    stats["shap_direction_correlation"] = directional

    def imp(mask):
        return agg[mask].abs().mean()

    pair = {}
    for attr, (a, b) in {"gender": ("male", "female"), "region": ("urban", "rural")}.items():
        ia, ib = imp((Ate[attr] == a).values), imp((Ate[attr] == b).values)
        pair[attr] = round(float(spearmanr(ia, ib).statistic), 4)
        top_a, top_b = list(ia.sort_values(ascending=False).index[:5]), list(ib.sort_values(ascending=False).index[:5])
        pair[f"{attr}_top5_identical_set"] = set(top_a) == set(top_b)
    stats["shap_pairwise_rank_correlation"] = pair
    save_json(stats, "report_stats.json")

    # ---------------------------------------------------------------- Fig 4.1 pre-processing
    show = ["transaction_regularity", "bill_payment_consistency", "mobile_recharge_regularity",
            "emi_to_income", "debt_to_income", "data_sparsity_flag", "employment_type__gig_worker"]
    short = ["txn_reg", "bill_pay", "recharge", "emi_inc", "dti", "sparse", "emp_gig"]
    head = Xtr[show].head(8).copy()
    head.columns = short
    head["default"] = s["y_train"].head(8).values
    lines = [">>> X = preprocessor.transform(raw)   # CreditPreprocessor (fit on train only)",
             "     " + "".join(f"{c:>10}" for c in head.columns)]
    for i, (_, r) in enumerate(head.iterrows()):
        vals = "".join(f"{(int(v) if c in ('sparse', 'emp_gig', 'default') else round(v, 3)):>10}"
                       for c, v in r.items())
        lines.append(f"{i:<5}{vals}")
    lines += ["",
              f">>> X_train.shape, X_test.shape, protected.shape",
              f"({len(Xtr)}, {Xtr.shape[1]}) ({len(Xte)}, {Xte.shape[1]}) ({len(df)}, 2)",
              f">>> default rate = {stats['default_rate']:.3f} | thin-footprint share = {stats['sparse_share']:.3f}"
              f" | protected columns in X: {len(leaked)}"]
    console(lines, "fig4_1_preprocessing.png")

    # ---------------------------------------------------------------- Fig 4.2 training log
    bp = training["best_params"]
    lines = [f">>> backend: xgboost {card['xgboost_version']} (tree_method='hist')",
             f">>> RandomizedSearchCV(n_iter={training['n_candidates']}, cv=StratifiedKFold(5), scoring='roc_auc')",
             f"    {training['n_candidates'] * 5} fits in {training['search_seconds']:.0f}s",
             f"best CV AUC-ROC : {training['best_cv_auc']:.4f}   folds: "
             + ", ".join(f"{v:.4f}" for v in training["fold_scores"]),
             "best params     :",
             f"    max_depth = {bp['max_depth']}   learning_rate = {bp['learning_rate']}   "
             f"subsample = {bp['subsample']}   colsample_bytree = {bp['colsample_bytree']}",
             f"    min_child_weight = {bp['min_child_weight']}   gamma = {bp['gamma']}   "
             f"reg_lambda = {bp['reg_lambda']}   reg_alpha = {bp['reg_alpha']}",
             f"early stopping  : {training['best_iteration']} trees (patience 60 on validation log loss)",
             "",
             f"Logistic Regression  validation-tuned threshold = {lr['metrics']['f1_threshold']:.3f}",
             f"XGBoost              validation-tuned threshold = {xg['metrics']['f1_threshold']:.3f}",
             f"Test AUC-ROC   LR = {lr['metrics']['auc_roc']:.4f}   XGBoost = {xg['metrics']['auc_roc']:.4f}"
             f"   (n_test = {comparison['test_rows']:,})",
             f"saved models/model.json  version = {card['model_version']}"]
    console(lines, "fig4_2_training_log.png")

    # ---------------------------------------------------------------- Fig 4.3 SHAP beeswarm
    top = list(agg.abs().mean().sort_values(ascending=False).index[:10])
    idx = rng.choice(len(Xte), size=1500, replace=False)
    fig, ax = plt.subplots(figsize=(9.5, 6.2))
    cmap = matplotlib.colors.LinearSegmentedColormap.from_list("v", [BLUE, "#c9ced6", RED])
    for row, f in enumerate(reversed(top)):
        vals = agg[f].values[idx]
        raw = Xte[f].values[idx].astype(float) if f in Xte.columns else np.zeros(len(idx))
        pct = pd.Series(raw).rank(pct=True).values
        jitter = (rng.random(len(idx)) - 0.5) * 0.55
        ax.scatter(vals, row + jitter, c=pct, cmap=cmap, s=7, alpha=0.8, linewidths=0)
    ax.set_yticks(range(len(top)))
    ax.set_yticklabels([FEATURE_LABELS.get(f, f) for f in reversed(top)])
    ax.axvline(0, color=INK, lw=0.9)
    ax.set_xlabel("SHAP value (impact on log-odds of default; right = riskier)")
    ax.grid(axis="y", visible=False)
    sm = matplotlib.cm.ScalarMappable(cmap=cmap)
    cb = fig.colorbar(sm, ax=ax, pad=0.01, aspect=40)
    cb.set_ticks([0, 1])
    cb.set_ticklabels(["Low", "High"])
    cb.set_label("Feature value")
    save(fig, "fig4_3_shap_beeswarm.png")

    # ---------------------------------------------------------------- Fig 4.4 fairness log
    mit = {m["method"]: m for m in fair["mitigation"]}
    before = mit["Unmitigated XGBoost"]["per_attribute"]
    after = mit["ThresholdOptimizer (demographic parity)"]["per_attribute"]
    lines = [">>> audit(y_test, decisions, groups=[gender, region])   # flag = risk > 0.30",
             "Attribute  Metric                 Before    After",
             ]
    for a in ["gender", "region"]:
        for k, lab in [("demographic_parity_difference", "DPD"), ("equalized_odds_difference", "EOD"),
                       ("approval_rate_ratio", "Approval ratio")]:
            lines.append(f"{a:<10} {lab:<20} {before[a]['summary'][k]:>8.4f} {after[a]['summary'][k]:>8.4f}")
    b_s = mit["Unmitigated XGBoost"]["summary"]
    a_s = mit["ThresholdOptimizer (demographic parity)"]["summary"]
    lines += ["",
              f"mitigation: ThresholdOptimizer(constraints='demographic_parity'), fit on validation split",
              f"accuracy {b_s['accuracy']:.4f} -> {a_s['accuracy']:.4f}   balanced accuracy "
              f"{b_s['balanced_accuracy']:.4f} -> {a_s['balanced_accuracy']:.4f}   approval rate "
              f"{b_s['approval_rate']:.3f} -> {a_s['approval_rate']:.3f}",
              f"model AUC-ROC unchanged at {xg['metrics']['auc_roc']:.4f} (scores are not modified, only group thresholds)"]
    console(lines, "fig4_4_fairness_log.png")

    # ---------------------------------------------------------------- Fig 5.1 ROC + calibration
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(11, 4.8))
    for m, color, lw in [(lr, GREY, 2.2), (xg, BLUE, 2.4)]:
        r = pd.DataFrame(m["roc_curve"])
        label = "XGBoost" if m is xg else "Logistic Regression"
        a1.plot(r.x, r.y, color=color, lw=lw, label=f"{label} (AUC = {m['metrics']['auc_roc']:.3f})")
        c = pd.DataFrame(m["calibration"])
        a2.plot(c.predicted, c.observed, marker="o", ms=4, color=color, lw=lw,
                label=f"{label} (Brier = {m['metrics']['brier']:.4f})")
    a1.plot([0, 1], [0, 1], "--", color=INK, lw=1, label="Chance")
    a1.set_xlabel("False positive rate")
    a1.set_ylabel("True positive rate")
    a1.set_title("ROC curve")
    a1.legend(loc="lower right", fontsize=10)
    a2.plot([0, 1], [0, 1], "--", color=INK, lw=1, label="Perfect calibration")
    a2.set_xlabel("Mean predicted default probability (decile)")
    a2.set_ylabel("Observed default rate")
    a2.set_title("Calibration")
    a2.legend(loc="upper left", fontsize=10)
    save(fig, "fig5_1_roc_calibration.png")

    # ---------------------------------------------------------------- Fig 5.2 nine-model comparison
    ms = sorted(comparison["models"], key=lambda m: m["metrics"]["auc_roc"])
    names = [m["name"].replace(" (tuned)", "") for m in ms]
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(11.5, 4.8), gridspec_kw={"wspace": 0.05})
    y = np.arange(len(ms))
    auc = np.array([m["metrics"]["auc_roc"] for m in ms])
    lo = auc - np.array([m["metrics"]["auc_ci95"][0] for m in ms])
    hi = np.array([m["metrics"]["auc_ci95"][1] for m in ms]) - auc
    colors = [BLUE if m.get("is_production") else GREY for m in ms]
    a1.barh(y, auc, color=colors, xerr=[lo, hi], error_kw={"ecolor": INK, "capsize": 3, "lw": 1})
    a1.set_xlim(0.80, 0.888)
    a1.set_yticks(y)
    a1.set_yticklabels(names)
    a1.set_xlabel("Test AUC-ROC with 95% bootstrap interval (higher is better)")
    for i, v in enumerate(auc):
        a1.text(v + hi[i] + 0.001, i, f"{v:.4f}", va="center", fontsize=9)
    a1.grid(axis="y", visible=False)
    brier = np.array([m["metrics"]["brier"] for m in ms])
    a2.barh(y, brier, color=colors)
    a2.set_xlim(0.095, 0.145)
    a2.set_yticks(y)
    a2.set_yticklabels([])
    a2.set_xlabel("Brier score (lower is better)")
    for i, v in enumerate(brier):
        a2.text(v + 0.0006, i, f"{v:.4f}", va="center", fontsize=9)
    a2.grid(axis="y", visible=False)
    save(fig, "fig5_2_model_comparison.png")

    # ---------------------------------------------------------------- Fig 5.3 approval rates
    fig, axes = plt.subplots(1, 2, figsize=(11, 4.6), sharey=True)
    for ax, attr, groups in [(axes[0], "gender", ["male", "female"]), (axes[1], "region", ["urban", "rural"])]:
        b = [before[attr]["approval_by_group"][g] * 100 for g in groups]
        a = [after[attr]["approval_by_group"][g] * 100 for g in groups]
        x = np.arange(len(groups))
        r1 = ax.bar(x - 0.18, b, 0.36, color=RED, label="Before mitigation")
        r2 = ax.bar(x + 0.18, a, 0.36, color=TEAL, label="After mitigation")
        for rects in (r1, r2):
            for rc in rects:
                ax.text(rc.get_x() + rc.get_width() / 2, rc.get_height() + 0.4, f"{rc.get_height():.1f}",
                        ha="center", fontsize=9.5)
        ax.set_xticks(x)
        ax.set_xticklabels([g.title() for g in groups])
        ax.set_title(attr.title())
        ax.set_ylim(55, 85)
        ax.grid(axis="x", visible=False)
    axes[0].set_ylabel("Auto-approval rate (%)")
    axes[0].legend(loc="upper right", fontsize=9.5)
    save(fig, "fig5_3_approval_rates.png")

    # ---------------------------------------------------------------- Fig 5.4 global importance
    gi = expl["global_importance"][:12][::-1]
    fig, ax = plt.subplots(figsize=(9, 5.4))
    ax.barh([g["label"] for g in gi], [g["mean_abs_shap"] for g in gi], color=BLUE)
    for i, g in enumerate(gi):
        ax.text(g["mean_abs_shap"] + 0.005, i, f"{g['mean_abs_shap']:.3f}", va="center", fontsize=9)
    ax.set_xlim(0, max(g["mean_abs_shap"] for g in gi) * 1.12)
    ax.set_xlabel("Mean |SHAP value| (log-odds of default)")
    ax.grid(axis="y", visible=False)
    save(fig, "fig5_4_global_importance.png")

    if public:
        print("  public validation:", {k: v.get("status") for k, v in public.items()})


if __name__ == "__main__":
    main()
