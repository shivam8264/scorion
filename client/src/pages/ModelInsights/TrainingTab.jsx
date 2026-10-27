import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Panel from "../../components/ui/Panel";
import StatTile from "../../components/ui/StatTile";
import styles from "./ModelInsights.module.css";

export default function TrainingTab({ training, info, publicValidation }) {
  const params = Object.entries(training.best_params).filter(([k]) => !["objective", "eval_metric", "tree_method", "random_state"].includes(k));
  const folds = training.fold_scores.map((v, i) => ({ fold: `Fold ${i + 1}`, auc: v }));
  const pv = publicValidation && publicValidation.status !== "not_run" ? Object.entries(publicValidation) : [];
  return (
    <div className={styles.stack}>
      <div className={styles.kpis}>
        <StatTile label="Search candidates" value={training.n_candidates} tone="primary" hint="Randomized search" />
        <StatTile label="CV folds" value={training.cv_folds} hint="Stratified" />
        <StatTile label="Model fits" value={training.n_candidates * training.cv_folds} />
        <StatTile label="Best CV AUC" value={training.best_cv_auc.toFixed(4)} />
        <StatTile label="Trees (early stopped)" value={training.best_iteration} />
        <StatTile label="Search time" value={`${Math.round(training.search_seconds)} s`} />
      </div>

      <div className={styles.grid2}>
        <Panel title="Learning curve" description="Log loss on the fitting and validation splits as trees are added. The dashed line marks where early stopping chose the tree count.">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={training.learning_curve} margin={{ top: 8, right: 12, left: -4, bottom: 16 }}>
              <CartesianGrid stroke="var(--chart-grid)" />
              <XAxis dataKey="iteration" type="number" tick={{ fontSize: 12 }} label={{ value: "Boosting rounds", position: "insideBottom", offset: -8, fontSize: 12 }} />
              <YAxis domain={["auto", "auto"]} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => Number(v).toFixed(4)} />
              <Legend verticalAlign="top" wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine x={training.best_iteration} stroke="var(--color-refer)" strokeDasharray="4 4" />
              <Line isAnimationActive={false} dataKey="train_logloss" name="Train log loss" stroke="var(--chart-1)" dot={false} strokeWidth={2} />
              <Line isAnimationActive={false} dataKey="val_logloss" name="Validation log loss" stroke="var(--chart-5)" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="AUC while training">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={training.learning_curve} margin={{ top: 8, right: 12, left: -4, bottom: 16 }}>
              <CartesianGrid stroke="var(--chart-grid)" />
              <XAxis dataKey="iteration" type="number" tick={{ fontSize: 12 }} label={{ value: "Boosting rounds", position: "insideBottom", offset: -8, fontSize: 12 }} />
              <YAxis domain={["auto", "auto"]} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => Number(v).toFixed(4)} />
              <Legend verticalAlign="top" wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine x={training.best_iteration} stroke="var(--color-refer)" strokeDasharray="4 4" />
              <Line isAnimationActive={false} dataKey="train_auc" name="Train AUC" stroke="var(--chart-1)" dot={false} strokeWidth={2} />
              <Line isAnimationActive={false} dataKey="val_auc" name="Validation AUC" stroke="var(--chart-2)" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Selected hyperparameters">
          <dl className={styles.dl}>
            {params.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>)}
          </dl>
        </Panel>
        <Panel title="Cross-validation folds" description="AUC of the winning configuration on each of the five folds.">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={folds} margin={{ top: 8, right: 12, left: -4, bottom: 0 }}>
              <CartesianGrid stroke="var(--chart-grid)" />
              <XAxis dataKey="fold" tick={{ fontSize: 12 }} />
              <YAxis domain={["auto", "auto"]} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => Number(v).toFixed(4)} />
              <ReferenceLine y={training.best_cv_auc} stroke="var(--color-ink-muted)" strokeDasharray="4 4" />
              <Line isAnimationActive={false} dataKey="auc" name="AUC" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
          <p className={styles.small}>Test AUC of the final model: {info.test_auc}</p>
        </Panel>
      </div>

      <Panel title="Hyperparameter search results" description="Every candidate tried, ranked by mean cross-validated AUC. A large gap between train and test AUC signals overfitting." padded={false}>
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr><th>Rank</th><th>CV AUC</th><th>± std</th><th>Train AUC</th><th>Fit (s)</th>
                <th>Trees</th><th>Depth</th><th>Learning rate</th><th>Subsample</th><th>Col. sample</th><th>Min child</th><th>Gamma</th><th>Lambda</th><th>Alpha</th></tr>
            </thead>
            <tbody>
              {training.candidates.map((c) => (
                <tr key={c.rank + JSON.stringify(c.params)} className={c.rank === 1 ? styles.highlight : undefined}>
                  <td>{c.rank}</td><td>{c.mean_test_auc.toFixed(4)}</td><td>{c.std_test_auc.toFixed(4)}</td>
                  <td>{c.mean_train_auc.toFixed(4)}</td><td>{c.fit_time_s}</td>
                  <td>{c.params.n_estimators}</td><td>{c.params.max_depth}</td><td>{c.params.learning_rate}</td>
                  <td>{c.params.subsample}</td><td>{c.params.colsample_bytree}</td><td>{c.params.min_child_weight}</td>
                  <td>{c.params.gamma}</td><td>{c.params.reg_lambda}</td><td>{c.params.reg_alpha}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Validation on public datasets" description="Pipeline sanity check on real credit data (German Credit, Home Credit) before trusting synthetic data. Run training/validate_public_datasets.py.">
        {pv.length === 0 ? <p className={styles.lead}>Not run yet in this environment.</p> : (
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead><tr><th>Dataset</th><th>Status</th><th>Rows</th><th>Logistic Regression AUC</th><th>XGBoost AUC</th></tr></thead>
              <tbody>
                {pv.map(([name, r]) => (
                  <tr key={name}>
                    <td>{name}</td><td>{r.status === "ok" ? "Validated" : "Skipped (dataset not available)"}</td>
                    <td>{r.rows?.toLocaleString("en-IN") ?? "-"}</td>
                    <td>{r.models ? `${r.models["Logistic Regression"].cv_auc_mean} ± ${r.models["Logistic Regression"].cv_auc_std}` : "-"}</td>
                    <td>{r.models ? `${r.models.XGBoost.cv_auc_mean} ± ${r.models.XGBoost.cv_auc_std}` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
