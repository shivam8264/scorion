import { useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, ErrorBar, Legend, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart,
  Tooltip, XAxis, YAxis, ZAxis, LabelList,
} from "recharts";
import Panel from "../../components/ui/Panel";
import { SelectField } from "../../components/ui/Field";
import { CHART_COLORS } from "../../utils/constants";
import styles from "./ModelInsights.module.css";

const METRICS = [
  { key: "auc_roc", label: "AUC-ROC", better: "high" },
  { key: "gini", label: "Gini", better: "high" },
  { key: "ks", label: "KS", better: "high" },
  { key: "pr_auc", label: "PR-AUC", better: "high" },
  { key: "f1", label: "F1", better: "high" },
  { key: "precision", label: "Precision", better: "high" },
  { key: "recall", label: "Recall", better: "high" },
  { key: "accuracy", label: "Accuracy @0.5", better: "high" },
  { key: "brier", label: "Brier", better: "low" },
  { key: "log_loss", label: "Log loss", better: "low" },
];

export default function ComparisonTab({ comparison }) {
  const models = comparison.models;
  const colorOf = useMemo(() => Object.fromEntries(models.map((m, i) => [m.name, CHART_COLORS[i % CHART_COLORS.length]])), [models]);
  const [sortKey, setSortKey] = useState("auc_roc");
  const [chartMetric, setChartMetric] = useState("auc_roc");
  const [selected, setSelected] = useState(() => new Set(models.filter((m) =>
    m.is_production || ["Logistic Regression", "Random Forest", "LightGBM", "Decision Tree"].includes(m.name)).map((m) => m.name)));

  const metricDef = METRICS.find((m) => m.key === sortKey);
  const sorted = [...models].sort((a, b) => metricDef.better === "high"
    ? b.metrics[sortKey] - a.metrics[sortKey] : a.metrics[sortKey] - b.metrics[sortKey]);
  const best = Object.fromEntries(METRICS.map((m) => [m.key, (m.better === "high" ? Math.max : Math.min)(...models.map((x) => x.metrics[m.key]))]));

  const toggle = (name) => setSelected((s) => {
    const n = new Set(s);
    n.has(name) ? n.delete(name) : n.add(name);
    return n;
  });

  const cm = METRICS.find((m) => m.key === chartMetric);
  const barData = [...models]
    .sort((a, b) => (cm.better === "high" ? b.metrics[chartMetric] - a.metrics[chartMetric] : a.metrics[chartMetric] - b.metrics[chartMetric]))
    .map((m) => ({
      name: m.name.replace(" (tuned)", ""), full: m.name, value: m.metrics[chartMetric],
      err: chartMetric === "auc_roc" ? [m.metrics.auc_roc - m.metrics.auc_ci95[0], m.metrics.auc_ci95[1] - m.metrics.auc_roc] : undefined,
    }));
  const values = barData.map((d) => d.value);
  const pad = (Math.max(...values) - Math.min(...values)) * 0.25 || 0.01;
  const domain = [Math.max(0, +(Math.min(...values) - pad).toFixed(3)), +(Math.max(...values) + pad).toFixed(3)];

  const rocSeries = models.filter((m) => selected.has(m.name));
  const cvData = [0, 1, 2, 3, 4].map((i) => {
    const row = { fold: `Fold ${i + 1}` };
    models.forEach((m) => { if (m.cv_auc) row[m.name] = m.cv_auc[i]; });
    return row;
  });
  const speed = models.map((m) => ({ name: m.name, x: Math.max(m.train_seconds, 0.01), y: m.metrics.auc_roc, z: 1 }));

  const ModelChips = () => (
    <div className={styles.chips} role="group" aria-label="Models shown in curves">
      {models.map((m) => (
        <button key={m.name} type="button" className={styles.chip} aria-pressed={selected.has(m.name)} onClick={() => toggle(m.name)}>
          <i style={{ background: colorOf[m.name] }} />{m.name}
        </button>
      ))}
    </div>
  );

  return (
    <div className={styles.stack}>
      <p className={styles.lead}>
        Nine algorithms were trained on the same {comparison.dataset_rows.toLocaleString("en-IN")} rows, the same features and the
        same train/test split, and scored on {comparison.test_rows.toLocaleString("en-IN")} held-out applicants.
        Best by AUC: <strong>{comparison.best_model}</strong>. Best on AUC and calibration combined:{" "}
        <strong>{comparison.best_model_composite}</strong>. Statistically tied with the best (overlapping 95% intervals):{" "}
        {comparison.statistically_tied_with_best.join(", ")}.
      </p>

      <Panel title="Leaderboard" description="Click a column heading to rank by that metric. The production model is highlighted; the best value in each column is green."
        padded={false}>
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Model</th><th className={styles.left}>Family</th>
                {METRICS.map((m) => (
                  <th key={m.key} aria-sort={sortKey === m.key ? "descending" : undefined}>
                    <button onClick={() => setSortKey(m.key)}>{m.label}{sortKey === m.key ? " ▾" : ""}</button>
                  </th>
                ))}
                <th>AUC 95% CI</th><th>CV AUC</th><th>Train (s)</th><th>ms / 1k rows</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((m, i) => (
                <tr key={m.name} className={m.is_production ? styles.highlight : undefined}>
                  <td><span className={styles.rankBadge}>{i + 1}</span>{m.name}</td>
                  <td className={styles.left}>{m.family}</td>
                  {METRICS.map((k) => (
                    <td key={k.key} className={m.metrics[k.key] === best[k.key] ? styles.best : undefined}>
                      {m.metrics[k.key].toFixed(4)}
                    </td>
                  ))}
                  <td>{m.metrics.auc_ci95[0].toFixed(3)} to {m.metrics.auc_ci95[1].toFixed(3)}</td>
                  <td>{m.cv_auc_mean ? `${m.cv_auc_mean.toFixed(4)} ± ${m.cv_auc_std.toFixed(4)}` : "-"}</td>
                  <td>{m.train_seconds.toFixed(1)}</td>
                  <td>{m.inference_ms_per_1k.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Compare one metric" actions={
        <SelectField label="Metric" value={chartMetric} onChange={(e) => setChartMetric(e.target.value)}
          options={METRICS.map((m) => ({ value: m.key, label: m.label }))} />}>
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={barData} layout="vertical" margin={{ top: 4, right: 60, left: 8, bottom: 4 }}>
            <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
            <XAxis type="number" domain={domain} tick={{ fontSize: 12 }} />
            <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v) => (Array.isArray(v) ? v : Number(v).toFixed(4))} />
            <Bar dataKey="value" name={cm.label} isAnimationActive={false}>
              {barData.map((d) => <Cell key={d.full} fill={colorOf[d.full]} />)}
              {chartMetric === "auc_roc" && <ErrorBar dataKey="err" width={4} stroke="var(--color-ink)" direction="x" />}
              {chartMetric !== "auc_roc" && (
                <LabelList dataKey="value" position="right" formatter={(v) => v.toFixed(4)} style={{ fontSize: 11 }} />
              )}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className={styles.small}>{cm.better === "high" ? "Higher is better." : "Lower is better."} {chartMetric === "auc_roc" && "Whiskers show the 95% bootstrap interval."}</p>
      </Panel>

      <Panel title="Curves" description="Choose which models to overlay.">
        <ModelChips />
        <div className={styles.grid2} style={{ marginTop: 16 }}>
          <div>
            <h3>ROC curve</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart margin={{ top: 8, right: 12, left: -8, bottom: 16 }}>
                <CartesianGrid stroke="var(--chart-grid)" />
                <XAxis type="number" dataKey="x" domain={[0, 1]} tick={{ fontSize: 12 }} label={{ value: "False positive rate", position: "insideBottom", offset: -8, fontSize: 12 }} />
                <YAxis type="number" dataKey="y" domain={[0, 1]} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => Number(v).toFixed(3)} />
                <Line isAnimationActive={false} data={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} dataKey="y" stroke="var(--color-line-strong)" strokeDasharray="4 4" dot={false} name="Random" />
                {rocSeries.map((m) => (
                  <Line key={m.name} data={m.roc_curve} dataKey="y" name={m.name} stroke={colorOf[m.name]} dot={false}
                    strokeWidth={m.is_production ? 3 : 1.5} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div>
            <h3>Calibration</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart margin={{ top: 8, right: 12, left: -8, bottom: 16 }}>
                <CartesianGrid stroke="var(--chart-grid)" />
                <XAxis type="number" dataKey="predicted" domain={[0, 1]} tick={{ fontSize: 12 }} label={{ value: "Predicted default rate", position: "insideBottom", offset: -8, fontSize: 12 }} />
                <YAxis type="number" dataKey="observed" domain={[0, 1]} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => Number(v).toFixed(3)} />
                <Line isAnimationActive={false} data={[{ predicted: 0, observed: 0 }, { predicted: 1, observed: 1 }]} dataKey="observed" stroke="var(--color-line-strong)" strokeDasharray="4 4" dot={false} name="Perfect" />
                {rocSeries.map((m) => (
                  <Line key={m.name} data={m.calibration} dataKey="observed" name={m.name} stroke={colorOf[m.name]}
                    strokeWidth={m.is_production ? 3 : 1.5} dot={{ r: 2 }} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div>
            <h3>Precision-recall</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart margin={{ top: 8, right: 12, left: -8, bottom: 16 }}>
                <CartesianGrid stroke="var(--chart-grid)" />
                <XAxis type="number" dataKey="x" domain={[0, 1]} tick={{ fontSize: 12 }} label={{ value: "Recall", position: "insideBottom", offset: -8, fontSize: 12 }} />
                <YAxis type="number" dataKey="y" domain={[0, 1]} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => Number(v).toFixed(3)} />
                {rocSeries.map((m) => (
                  <Line key={m.name} data={m.pr_curve} dataKey="y" name={m.name} stroke={colorOf[m.name]} dot={false}
                    strokeWidth={m.is_production ? 3 : 1.5} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div>
            <h3>5-fold cross-validation AUC</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={cvData} margin={{ top: 8, right: 12, left: -8, bottom: 16 }}>
                <CartesianGrid stroke="var(--chart-grid)" />
                <XAxis dataKey="fold" tick={{ fontSize: 12 }} />
                <YAxis domain={["auto", "auto"]} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => Number(v).toFixed(4)} />
                {rocSeries.filter((m) => m.cv_auc).map((m) => (
                  <Line key={m.name} dataKey={m.name} stroke={colorOf[m.name]} strokeWidth={m.is_production ? 3 : 1.5} dot={{ r: 3 }} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Panel>

      <div className={styles.grid2}>
        <Panel title="Accuracy versus training cost" description="Training time is on a log scale.">
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ top: 8, right: 24, left: -8, bottom: 28 }}>
              <CartesianGrid stroke="var(--chart-grid)" />
              <XAxis type="number" dataKey="x" scale="log" domain={["auto", "auto"]} tick={{ fontSize: 12 }}
                label={{ value: "Training seconds", position: "insideBottom", offset: -8, fontSize: 12 }} allowDataOverflow />
              <YAxis type="number" dataKey="y" domain={["auto", "auto"]} tick={{ fontSize: 12 }} />
              <ZAxis dataKey="z" range={[90, 90]} />
              <Tooltip cursor={false} formatter={(v) => Number(v).toFixed(4)} labelFormatter={() => ""} />
              {speed.map((s) => (
                <Scatter key={s.name} data={[s]} name={s.name} fill={colorOf[s.name]} isAnimationActive={false} />
              ))}
              <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11, paddingBottom: 8 }} />
            </ScatterChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Confusion matrices at each model's F1-optimal threshold" padded={false}>
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead><tr><th>Model</th><th>Threshold</th><th>True negatives</th><th>False positives</th><th>False negatives</th><th>True positives</th></tr></thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.name} className={m.is_production ? styles.highlight : undefined}>
                    <td>{m.name}</td><td>{m.metrics.f1_threshold.toFixed(3)}</td>
                    <td>{m.confusion_matrix.tn}</td><td>{m.confusion_matrix.fp}</td><td>{m.confusion_matrix.fn}</td><td>{m.confusion_matrix.tp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
