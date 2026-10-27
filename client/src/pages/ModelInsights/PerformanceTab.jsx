import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import StatusBadge from "../../components/StatusBadge";
import Panel from "../../components/ui/Panel";
import StatTile from "../../components/ui/StatTile";
import { formatNumber, formatPct } from "../../utils/format";
import styles from "./ModelInsights.module.css";

const pctTick = (v) => `${Math.round(v * 100)}%`;

export default function PerformanceTab({ evaluation }) {
  const m = evaluation.metrics;
  const cm = evaluation.confusion_matrix;
  const total = cm.tn + cm.fp + cm.fn + cm.tp;
  const ksPoint = evaluation.roc_curve.reduce((best, p) => (p.y - p.x > best.y - best.x ? p : best), evaluation.roc_curve[0]);

  return (
    <div className={styles.stack}>
      <div className={styles.kpis}>
        <StatTile label="AUC-ROC" value={m.auc_roc.toFixed(4)} tone="primary" />
        <StatTile label="PR-AUC" value={m.pr_auc.toFixed(4)} hint={`Base rate ${formatPct(evaluation.base_default_rate)}`} />
        <StatTile label="Precision" value={m.precision.toFixed(3)} hint="Flagged who truly default" />
        <StatTile label="Recall" value={m.recall.toFixed(3)} hint="Defaulters that were flagged" />
        <StatTile label="Log loss" value={m.log_loss.toFixed(4)} />
        <StatTile label="Accuracy" value={formatPct(m.accuracy)} hint={`At threshold ${m.f1_threshold.toFixed(2)}`} />
      </div>

      <div className={styles.grid2}>
        <Panel title="ROC curve" description={`KS = ${m.ks.toFixed(3)}, the widest gap between true and false positive rates (dashed line).`}>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={evaluation.roc_curve} margin={{ top: 8, right: 12, left: -8, bottom: 16 }}>
              <CartesianGrid stroke="var(--chart-grid)" />
              <XAxis type="number" dataKey="x" domain={[0, 1]} tick={{ fontSize: 12 }} label={{ value: "False positive rate", position: "insideBottom", offset: -8, fontSize: 12 }} />
              <YAxis domain={[0, 1]} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => Number(v).toFixed(3)} labelFormatter={(x) => `FPR ${Number(x).toFixed(3)}`} />
              <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="var(--color-line-strong)" strokeDasharray="4 4" />
              <ReferenceLine segment={[{ x: ksPoint.x, y: ksPoint.x }, { x: ksPoint.x, y: ksPoint.y }]} stroke="var(--color-refer)" strokeDasharray="3 3" />
              <Area type="monotone" dataKey="y" name="TPR" stroke="var(--chart-1)" fill="var(--color-primary-tint)" strokeWidth={2} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Precision-recall curve">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={evaluation.pr_curve} margin={{ top: 8, right: 12, left: -8, bottom: 16 }}>
              <CartesianGrid stroke="var(--chart-grid)" />
              <XAxis type="number" dataKey="x" domain={[0, 1]} tick={{ fontSize: 12 }} label={{ value: "Recall", position: "insideBottom", offset: -8, fontSize: 12 }} />
              <YAxis domain={[0, 1]} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => Number(v).toFixed(3)} />
              <ReferenceLine y={evaluation.base_default_rate} stroke="var(--color-line-strong)" strokeDasharray="4 4" label={{ value: "No-skill", fontSize: 11, position: "insideTopRight" }} />
              <Line dataKey="y" name="Precision" stroke="var(--chart-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Calibration" description={`Brier score ${m.brier.toFixed(4)}. Points on the diagonal mean predicted risk matches observed default rates.`}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={evaluation.calibration} margin={{ top: 8, right: 12, left: -8, bottom: 16 }}>
              <CartesianGrid stroke="var(--chart-grid)" />
              <XAxis type="number" dataKey="predicted" domain={[0, 1]} tick={{ fontSize: 12 }} tickFormatter={pctTick} label={{ value: "Predicted default rate (deciles)", position: "insideBottom", offset: -8, fontSize: 12 }} />
              <YAxis type="number" domain={[0, 1]} tick={{ fontSize: 12 }} tickFormatter={pctTick} />
              <Tooltip formatter={(v) => formatPct(v)} />
              <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="var(--color-line-strong)" strokeDasharray="4 4" />
              <Line dataKey="observed" name="Observed" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Confusion matrix" description={`${formatNumber(total)} test applicants at the F1-optimal threshold of ${m.f1_threshold.toFixed(3)}.`}>
          <div className={styles.cm} role="table" aria-label="Confusion matrix">
            <span />
            <span>Predicted repay</span>
            <span>Predicted default</span>
            <span>Actually repaid</span>
            <div className={`${styles.cmCell} ${styles.cmGood}`}><strong>{formatNumber(cm.tn)}</strong><small>True negatives</small></div>
            <div className={`${styles.cmCell} ${styles.cmBad}`}><strong>{formatNumber(cm.fp)}</strong><small>False positives</small></div>
            <span>Actually defaulted</span>
            <div className={`${styles.cmCell} ${styles.cmBad}`}><strong>{formatNumber(cm.fn)}</strong><small>False negatives</small></div>
            <div className={`${styles.cmCell} ${styles.cmGood}`}><strong>{formatNumber(cm.tp)}</strong><small>True positives</small></div>
          </div>
          <p className={styles.small} style={{ marginTop: 12 }}>
            False positives are good payers wrongly flagged (lost business, fairness risk). False negatives are missed defaulters (credit losses).
          </p>
        </Panel>
      </div>

      <Panel title="Risk score distribution" description="How well the score separates people who repaid from people who defaulted. Dashed lines are the refer and decline thresholds.">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={evaluation.score_distribution} margin={{ top: 8, right: 12, left: 0, bottom: 16 }} barGap={0}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="start" tick={{ fontSize: 12 }} tickFormatter={pctTick} label={{ value: "Predicted probability of default", position: "insideBottom", offset: -8, fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip labelFormatter={(v) => `${pctTick(v)} to ${pctTick(v + 0.05)}`} />
            <Legend verticalAlign="top" wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine x={0.3} stroke="var(--color-refer)" strokeDasharray="4 4" />
            <ReferenceLine x={0.6} stroke="var(--color-decline)" strokeDasharray="4 4" />
            <Bar isAnimationActive={false} dataKey="repaid" name="Repaid" fill="var(--color-risk-down)" />
            <Bar isAnimationActive={false} dataKey="defaulted" name="Defaulted" fill="var(--color-risk-up)" />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <div className={styles.grid2}>
        <Panel title="Approval threshold trade-off" description="Raising the cut-off approves more people but lets more defaulters through.">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={evaluation.threshold_sweep} margin={{ top: 8, right: 12, left: -8, bottom: 16 }}>
              <CartesianGrid stroke="var(--chart-grid)" />
              <XAxis dataKey="threshold" tick={{ fontSize: 12 }} tickFormatter={pctTick} label={{ value: "Approve if risk is at most", position: "insideBottom", offset: -8, fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={pctTick} domain={[0, 1]} />
              <Tooltip formatter={(v) => formatPct(v)} labelFormatter={(v) => `Cut-off ${pctTick(v)}`} />
              <Legend verticalAlign="top" wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine x={0.3} stroke="var(--color-refer)" strokeDasharray="4 4" />
              <Line isAnimationActive={false} dataKey="approval_rate" name="Approval rate" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
              <Line isAnimationActive={false} dataKey="default_rate_approved" name="Default rate among approved" stroke="var(--chart-5)" strokeWidth={2} dot={false} />
              <Line isAnimationActive={false} dataKey="recall_defaulters" name="Defaulters caught" stroke="var(--chart-2)" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Lift by risk decile" description="Applicants sorted by score into ten equal groups; decile 1 is the riskiest.">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={evaluation.lift_table} margin={{ top: 8, right: 12, left: -8, bottom: 16 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="decile" tick={{ fontSize: 12 }} label={{ value: "Risk decile", position: "insideBottom", offset: -8, fontSize: 12 }} />
              <YAxis yAxisId="l" tick={{ fontSize: 12 }} tickFormatter={pctTick} />
              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v, n) => (n === "Lift" ? `${v}x` : formatPct(v))} />
              <Legend verticalAlign="top" wrapperStyle={{ fontSize: 12 }} />
              <Bar isAnimationActive={false} yAxisId="l" dataKey="default_rate" name="Observed default rate" fill="var(--chart-1)" />
              <Line isAnimationActive={false} yAxisId="r" dataKey="lift" name="Lift" stroke="var(--chart-3)" strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <Panel title="Decision bands on the test set" padded={false}>
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead><tr><th>Band</th><th>Rule</th><th>Applicants</th><th>Share</th><th>Mean predicted risk</th><th>Observed default rate</th></tr></thead>
            <tbody>
              {evaluation.decision_bands.map((b) => (
                <tr key={b.band}>
                  <td><StatusBadge value={b.band} /></td>
                  <td>{b.band === "approve" ? "Risk at most 30%" : b.band === "refer" ? "Risk 30% to 60%" : "Risk above 60%"}</td>
                  <td>{formatNumber(b.count)}</td><td>{formatPct(b.share)}</td>
                  <td>{b.mean_risk_score != null ? formatPct(b.mean_risk_score) : "-"}</td>
                  <td>{b.observed_default_rate != null ? formatPct(b.observed_default_rate) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
