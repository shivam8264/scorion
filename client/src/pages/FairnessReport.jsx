import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { adminApi, errorMessage } from "../api/client";
import FairnessMetricCard from "../components/FairnessMetricCard";
import StatusBadge from "../components/StatusBadge";
import Button from "../components/ui/Button";
import { EmptyState, Notice, QueryBoundary } from "../components/ui/Feedback";
import PageHeader from "../components/ui/PageHeader";
import Panel from "../components/ui/Panel";
import Tabs from "../components/ui/Tabs";
import { formatDate, formatPct } from "../utils/format";
import styles from "./FairnessReport.module.css";

const ATTRS = [
  { id: "gender", label: "Gender" },
  { id: "region", label: "Region" },
  { id: "gender_x_region", label: "Gender and region" },
];
const LIMITS = { dp: 0.1, eo: 0.1, ratio: 0.8 };
const pretty = (g) => g.replace("|", " & ").replace(/\b\w/g, (c) => c.toUpperCase());

function MetricRow({ summary }) {
  if (!summary || summary.status === "insufficient_data") {
    return <Notice tone="info">Not enough decisions in each group yet (at least 20 per group are needed).</Notice>;
  }
  return (
    <div className={styles.metrics}>
      <FairnessMetricCard title="Demographic parity difference" value={summary.demographic_parity_difference}
        threshold={LIMITS.dp} description="Largest gap in approval rate between groups." />
      <FairnessMetricCard title="Approval-rate ratio" value={summary.approval_rate_ratio} threshold={LIMITS.ratio}
        direction="higher" description="Lowest group approval rate divided by the highest (four-fifths rule)." />
      <FairnessMetricCard title="Equalized odds difference" value={summary.equalized_odds_difference}
        threshold={LIMITS.eo} description="Largest gap in true or false positive rate. Needs recorded outcomes." />
    </div>
  );
}

function LiveAudit({ live, history }) {
  const [attr, setAttr] = useState("gender");
  if (!live) {
    return <EmptyState title="No live audit yet">Run an audit to measure fairness on recent production decisions.</EmptyState>;
  }
  const block = live.byAttribute?.[attr];
  const trend = history.map((h) => ({
    date: formatDate(h.createdAt),
    gender: h.byAttribute?.gender?.summary?.demographic_parity_difference ?? null,
    region: h.byAttribute?.region?.summary?.demographic_parity_difference ?? null,
    intersection: h.byAttribute?.gender_x_region?.summary?.demographic_parity_difference ?? null,
  }));
  return (
    <div className={styles.stack}>
      <div className={styles.liveHead}>
        <StatusBadge value={live.status} label={live.status === "healthy" ? "Healthy" : live.status === "attention" ? "Needs attention" : undefined} />
        <span>
          {live.n} decisions from the last {live.windowDays} days, {live.labelled} with a recorded outcome.
          Audited {formatDate(live.createdAt, true)} ({live.trigger}).
        </span>
      </div>
      {live.alerts?.length > 0 && (
        <Notice tone="warning">
          <ul className={styles.alerts}>{live.alerts.map((a) => <li key={a}>{a}</li>)}</ul>
        </Notice>
      )}
      <Tabs tabs={ATTRS} active={attr} onChange={setAttr} label="Protected attribute" />
      <MetricRow summary={block?.summary} />
      {block?.by_group?.length > 0 && (
        <div className={styles.split}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={block.by_group.map((g) => ({ ...g, group: pretty(g.group) }))} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="group" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={{ fontSize: 12 }} domain={[0, 1]} />
              <Tooltip formatter={(v) => formatPct(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar isAnimationActive={false} dataKey="approval_rate" name="Approved" stackId="d" fill="var(--color-approve)" />
              <Bar isAnimationActive={false} dataKey="refer_rate" name="Referred" stackId="d" fill="var(--color-refer)" />
              <Bar isAnimationActive={false} dataKey="decline_rate" name="Declined" stackId="d" fill="var(--color-decline)" />
            </BarChart>
          </ResponsiveContainer>
          <table className={styles.table}>
            <thead><tr><th>Group</th><th>n</th><th>Approved</th><th>Mean risk</th><th>TPR</th><th>FPR</th></tr></thead>
            <tbody>
              {block.by_group.map((g) => (
                <tr key={g.group}>
                  <td>{pretty(g.group)}</td><td>{g.count}</td><td>{formatPct(g.approval_rate)}</td>
                  <td>{formatPct(g.mean_risk_score)}</td><td>{g.tpr != null ? formatPct(g.tpr) : "-"}</td>
                  <td>{g.fpr != null ? formatPct(g.fpr) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {trend.length > 1 && (
        <Panel title="Approval-rate gap over time" description="Demographic parity difference for each audit run. The dashed line is the 0.10 limit.">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trend} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="var(--chart-grid)" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} domain={[0, "auto"]} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={0.1} stroke="var(--color-decline)" strokeDasharray="4 4" />
              <Line isAnimationActive={false} dataKey="gender" name="Gender" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line isAnimationActive={false} dataKey="region" name="Region" stroke="var(--chart-2)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line isAnimationActive={false} dataKey="intersection" name="Gender and region" stroke="var(--chart-3)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      )}
    </div>
  );
}

function OfflineAudit({ offline }) {
  const [attr, setAttr] = useState("gender_x_region");
  if (!offline || offline.error) return <Notice tone="warning">Offline report unavailable: {offline?.error}</Notice>;
  const block = offline.by_attribute[attr];
  const mit = offline.mitigation;
  const mitChart = mit.map((m) => ({
    method: m.method.replace("ThresholdOptimizer", "Threshold opt.").replace("ExponentiatedGradient", "Exp. gradient"),
    dp: m.summary.demographic_parity_difference,
    eo: m.summary.equalized_odds_difference,
  }));
  const groupNames = mit[0].by_group.map((g) => g.group);
  const groupChart = groupNames.map((g) => {
    const row = { group: pretty(g) };
    mit.forEach((m, i) => { row[`m${i}`] = m.by_group.find((x) => x.group === g)?.approval_rate; });
    return row;
  });
  const colors = ["var(--chart-7)", "var(--chart-1)", "var(--chart-2)", "var(--chart-3)"];
  return (
    <div className={styles.stack}>
      <p className={styles.lead}>
        Measured on {offline.n.toLocaleString("en-IN")} held-out test applicants for model {offline.model_version}.
        Rule: {offline.decision_rule}.
      </p>
      <Tabs tabs={ATTRS} active={attr} onChange={setAttr} label="Protected attribute" />
      <MetricRow summary={block.summary} />
      <table className={styles.table}>
        <thead><tr><th>Group</th><th>n</th><th>Approval rate</th><th>Observed default rate</th><th>TPR (defaulters flagged)</th><th>FPR (good payers flagged)</th><th>Accuracy</th></tr></thead>
        <tbody>
          {block.by_group.map((g) => (
            <tr key={g.group}>
              <td>{pretty(g.group)}</td><td>{g.count.toLocaleString("en-IN")}</td><td>{formatPct(g.approval_rate)}</td>
              <td>{formatPct(g.observed_default_rate)}</td><td>{formatPct(g.tpr)}</td><td>{formatPct(g.fpr)}</td><td>{formatPct(g.accuracy)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Panel title="Mitigation: before and after"
        description="Fairlearn mitigation methods evaluated on gender and region together. Lower parity and odds gaps are fairer; watch the accuracy cost.">
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr><th>Method</th><th>Type</th><th>Parity gap</th><th>Change</th><th>Odds gap</th><th>Change</th>
                <th>Accuracy</th><th>Balanced acc.</th><th>Approval rate</th><th>Four-fifths</th></tr>
            </thead>
            <tbody>
              {mit.map((m) => (
                <tr key={m.method}>
                  <td><strong>{m.method}</strong></td><td>{m.family}</td>
                  <td>{m.summary.demographic_parity_difference.toFixed(3)}</td>
                  <td className={m.dp_reduction_pct > 0 ? styles.good : undefined}>{m.dp_reduction_pct ? `${m.dp_reduction_pct > 0 ? "-" : "+"}${Math.abs(m.dp_reduction_pct)}%` : "-"}</td>
                  <td>{m.summary.equalized_odds_difference.toFixed(3)}</td>
                  <td className={m.eo_reduction_pct > 0 ? styles.good : undefined}>{m.eo_reduction_pct ? `${m.eo_reduction_pct > 0 ? "-" : "+"}${Math.abs(m.eo_reduction_pct)}%` : "-"}</td>
                  <td>{formatPct(m.summary.accuracy)}</td><td>{formatPct(m.summary.balanced_accuracy)}</td>
                  <td>{formatPct(m.summary.approval_rate)}</td><td>{m.summary.passes_four_fifths_rule ? "Pass" : "Fail"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.split}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={mitChart} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="method" tick={{ fontSize: 11 }} interval={0} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => v.toFixed(4)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar isAnimationActive={false} dataKey="dp" name="Parity gap" fill="var(--chart-1)" />
              <Bar isAnimationActive={false} dataKey="eo" name="Equalized odds gap" fill="var(--chart-3)" />
            </BarChart>
          </ResponsiveContainer>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={groupChart} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="group" tick={{ fontSize: 11 }} interval={0} />
              <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => formatPct(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {mit.map((m, i) => <Bar isAnimationActive={false} key={m.method} dataKey={`m${i}`} name={m.method} fill={colors[i]} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
      <ul className={styles.notes}>{offline.notes.map((n) => <li key={n}>{n}</li>)}</ul>
    </div>
  );
}

export default function FairnessReport() {
  const qc = useQueryClient();
  const [view, setView] = useState("live");
  const query = useQuery({ queryKey: ["fairness"], queryFn: adminApi.fairnessReport });
  const run = useMutation({ mutationFn: () => adminApi.runAudit(), onSuccess: () => qc.invalidateQueries({ queryKey: ["fairness"] }) });

  return (
    <>
      <PageHeader title="Fairness report"
        subtitle="Gender and region are never model inputs. This report checks whether outcomes still differ between groups, through proxies such as income or digital history."
        actions={<Button onClick={() => run.mutate()} loading={run.isPending}>Run audit now</Button>} />
      {run.isError && <Notice tone="danger">{errorMessage(run.error)}</Notice>}
      {run.isSuccess && <Notice tone="success">Audit complete: {run.data.audit.status.replace("_", " ")} across {run.data.audit.n} decisions.</Notice>}
      <div className={styles.viewTabs}>
        <Tabs tabs={[{ id: "live", label: "Live decisions" }, { id: "offline", label: "Model validation and mitigation" }]}
          active={view} onChange={setView} label="Report" />
      </div>
      <QueryBoundary query={query}>
        {(d) => (view === "live" ? <LiveAudit live={d.live} history={d.history} /> : <OfflineAudit offline={d.offline} />)}
      </QueryBoundary>
    </>
  );
}
