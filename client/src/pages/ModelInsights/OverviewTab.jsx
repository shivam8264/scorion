import Panel from "../../components/ui/Panel";
import StatTile from "../../components/ui/StatTile";
import { formatDate, formatNumber } from "../../utils/format";
import styles from "./ModelInsights.module.css";

const PIPELINE = [
  { t: "Synthetic data", d: "80,000 applicants calibrated to RBI, NPCI and PLFS distributions" },
  { t: "Feature engineering", d: "Instalment, loan and balance ratios; one-hot categories" },
  { t: "XGBoost", d: "5-fold CV random search, early stopping" },
  { t: "SHAP", d: "Exact TreeSHAP reasons for every applicant" },
  { t: "Fairlearn", d: "Parity and equalized-odds audit with mitigation" },
];

export default function OverviewTab({ info, comparison, evaluation }) {
  const m = evaluation.metrics;
  const xgb = comparison.models.find((x) => x.is_production);
  return (
    <div className={styles.stack}>
      <div className={styles.kpis}>
        <StatTile label="AUC-ROC" value={m.auc_roc.toFixed(3)} tone="primary" hint="Held-out test set" />
        <StatTile label="Gini" value={m.gini.toFixed(3)} hint="2 x AUC - 1" />
        <StatTile label="KS statistic" value={m.ks.toFixed(3)} hint="Max separation of good and bad" />
        <StatTile label="Brier score" value={m.brier.toFixed(4)} hint="Lower is better calibrated" />
        <StatTile label="F1 score" value={m.f1.toFixed(3)} hint={`At threshold ${m.f1_threshold.toFixed(2)}`} />
        <StatTile label="Rank among 9 models" value={`${xgb.rank} of ${comparison.models.length}`}
          hint={`Composite best: ${comparison.best_model_composite}`} />
      </div>

      <Panel title="How the model is built" description="Each stage feeds the next; the same preprocessing code runs in training and in the live API.">
        <ol className={styles.pipeline}>
          {PIPELINE.map((p, i) => (
            <li key={p.t}><span className={styles.stepNo}>{i + 1}</span><strong>{p.t}</strong><span>{p.d}</span></li>
          ))}
        </ol>
      </Panel>

      <div className={styles.grid2}>
        <Panel title="Model card">
          <dl className={styles.dl}>
            <div><dt>Version</dt><dd>{info.model_version}</dd></div>
            <div><dt>Algorithm</dt><dd>XGBoost {info.xgboost_version}</dd></div>
            <div><dt>Trained</dt><dd>{formatDate(info.trained_at, true)}</dd></div>
            <div><dt>Training rows</dt><dd>{formatNumber(info.n_train)}</dd></div>
            <div><dt>Test rows</dt><dd>{formatNumber(info.n_test)}</dd></div>
            <div><dt>Default rate</dt><dd>{(info.default_rate * 100).toFixed(1)}%</dd></div>
            <div><dt>Model inputs</dt><dd>{info.n_features} encoded features</dd></div>
            <div><dt>CV AUC</dt><dd>{info.cv_auc_mean} ± {info.cv_auc_std}</dd></div>
            <div><dt>Refer above</dt><dd>{(info.decision_thresholds.refer_above * 100).toFixed(0)}% risk</dd></div>
            <div><dt>Decline above</dt><dd>{(info.decision_thresholds.decline_above * 100).toFixed(0)}% risk</dd></div>
            <div><dt>Protected attributes as inputs</dt><dd>{info.protected_attributes_used_as_features ? "Yes" : "Never"}</dd></div>
            <div><dt>Base rate (SHAP)</dt><dd>{(100 / (1 + Math.exp(-info.base_value))).toFixed(1)}%</dd></div>
          </dl>
          <p className={styles.small} style={{ marginTop: 12 }}>{info.intended_use}</p>
        </Panel>
        <Panel title="Why XGBoost is the production model">
          <ul className={styles.list}>{comparison.why_xgboost.map((w) => <li key={w}>{w}</li>)}</ul>
          <p className={styles.lead} style={{ marginTop: 16 }}>{comparison.selection_note}</p>
          <p className={styles.small} style={{ marginTop: 8 }}>
            Against the logistic regression baseline: AUC {comparison.xgboost_vs_baseline.auc_lift >= 0 ? "+" : ""}
            {comparison.xgboost_vs_baseline.auc_lift.toFixed(4)}, Brier {comparison.xgboost_vs_baseline.brier_reduction >= 0 ? "-" : "+"}
            {Math.abs(comparison.xgboost_vs_baseline.brier_reduction).toFixed(4)}, F1 {comparison.xgboost_vs_baseline.f1_lift >= 0 ? "+" : ""}
            {comparison.xgboost_vs_baseline.f1_lift.toFixed(4)}.
          </p>
        </Panel>
      </div>

      <Panel title="Model inputs" description="Raw features collected from the application. Gender and region are stored only for fairness audits.">
        <div className={styles.chips}>
          {info.raw_features.map((f) => <span key={f} className={styles.chip}>{info.feature_labels[f] || f}</span>)}
        </div>
      </Panel>
    </div>
  );
}
