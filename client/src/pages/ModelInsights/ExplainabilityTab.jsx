import { useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from "recharts";
import FactorList from "../../components/FactorList";
import StatusBadge from "../../components/StatusBadge";
import Panel from "../../components/ui/Panel";
import StatTile from "../../components/ui/StatTile";
import { formatPct } from "../../utils/format";
import styles from "./ModelInsights.module.css";

// Five solid colour steps from low feature value (blue) to high (red)
const VALUE_STEPS = ["#2457a6", "#6f8fc4", "#9aa3ad", "#d9846f", "#c4412b"];
const STEP_LABELS = ["Lowest 20%", "20-40%", "40-60%", "60-80%", "Highest 20%"];

function Beeswarm({ beeswarm }) {
  const n = beeswarm.length;
  const series = useMemo(() => {
    const out = VALUE_STEPS.map(() => []);
    beeswarm.forEach((f, i) => {
      const row = n - i; // top feature at the top
      f.points.forEach((p, j) => {
        const step = Math.min(Math.floor(p.value_pct * 5), 4);
        const jitter = (((j * 2654435761) % 1000) / 1000 - 0.5) * 0.6;
        out[step].push({ x: p.shap, y: row + jitter, feature: f.label, pct: p.value_pct });
      });
    });
    return out;
  }, [beeswarm, n]);
  const labels = Object.fromEntries(beeswarm.map((f, i) => [n - i, f.label]));
  return (
    <>
      <ResponsiveContainer width="100%" height={46 * n + 60}>
        <ScatterChart margin={{ top: 8, right: 16, left: 8, bottom: 16 }}>
          <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
          <XAxis type="number" dataKey="x" tick={{ fontSize: 12 }} label={{ value: "SHAP value (impact on log-odds of default)", position: "insideBottom", offset: -8, fontSize: 12 }} />
          <YAxis type="number" dataKey="y" domain={[0.4, n + 0.6]} ticks={Array.from({ length: n }, (_, i) => i + 1)}
            tickFormatter={(v) => labels[v] || ""} width={190} tick={{ fontSize: 12 }} />
          <ZAxis range={[14, 14]} />
          <ReferenceLine x={0} stroke="var(--color-ink-muted)" />
          <Tooltip cursor={false} content={({ payload }) => payload?.[0] ? (
            <div className="recharts-default-tooltip" style={{ background: "#fff", padding: 8 }}>
              <strong>{payload[0].payload.feature}</strong><br />
              SHAP {payload[0].payload.x.toFixed(3)}, value percentile {Math.round(payload[0].payload.pct * 100)}
            </div>) : null} />
          {series.map((pts, i) => <Scatter key={i} data={pts} fill={VALUE_STEPS[i]} isAnimationActive={false} />)}
        </ScatterChart>
      </ResponsiveContainer>
      <div className={styles.legendRow}>
        <span>Feature value:</span>
        {VALUE_STEPS.map((c, i) => <span key={c}><i style={{ background: c }} /> {STEP_LABELS[i]}</span>)}
      </div>
    </>
  );
}

export default function ExplainabilityTab({ explainability }) {
  const gi = explainability.global_importance;
  const st = explainability.stability;
  const [dep, setDep] = useState(0);
  const [example, setExample] = useState(0);
  const importance = gi.slice(0, 14).map((f) => ({ label: f.label, shap: f.share, gain: f.gain }));
  const stabilityChart = st.groups.map((g) => ({
    group: g.group.replace(/gender=|region=/g, "").replace(" & ", " / "),
    spearman: g.spearman_vs_overall, jaccard: g.top5_jaccard_vs_overall,
    cosine: g.perturbation_cosine_mean, top3: g.top3_reason_agreement,
  }));
  const d = explainability.dependence[dep];
  const ex = explainability.examples[example];

  return (
    <div className={styles.stack}>
      <div className={styles.kpis}>
        <StatTile label="Explainer" value="TreeSHAP" tone="primary" hint={`shap ${explainability.shap_version}`} />
        <StatTile label="Applicants explained" value={explainability.n_explained.toLocaleString("en-IN")} />
        <StatTile label="Average applicant risk" value={formatPct(explainability.base_value_probability)} hint="SHAP base value" />
        <StatTile label="Additivity error" value={explainability.additivity_max_error.toExponential(1)} hint="Base + SHAP = model output" />
        <StatTile label="Min rank correlation" value={st.summary.min_spearman.toFixed(3)} tone="approve" hint="Across 8 subgroups" />
        <StatTile label="Explanation stability" value={st.summary.mean_perturbation_cosine.toFixed(3)} tone="approve" hint="Cosine under 2% input noise" />
      </div>

      <div className={styles.grid2}>
        <Panel title="Global feature importance" description="Share of total mean |SHAP| (what drives predictions) compared with XGBoost's own gain importance (where the trees split).">
          <ResponsiveContainer width="100%" height={460}>
            <BarChart data={importance} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
              <XAxis type="number" tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="label" width={180} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => formatPct(v)} />
              <Legend verticalAlign="top" wrapperStyle={{ fontSize: 12 }} />
              <Bar isAnimationActive={false} dataKey="shap" name="Mean |SHAP| share" fill="var(--chart-1)" />
              <Bar isAnimationActive={false} dataKey="gain" name="XGBoost gain share" fill="var(--chart-3)" />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="SHAP summary (beeswarm)" description="Each dot is one test applicant. Right of zero raises risk. Colour shows whether that applicant's feature value was low or high.">
          <Beeswarm beeswarm={explainability.beeswarm} />
        </Panel>
      </div>

      <div className={styles.grid2}>
        <Panel title="Dependence plot" description="How the contribution of one feature changes with its value, capturing the non-linear thresholds the trees learned."
          actions={
            <select aria-label="Feature" value={dep} onChange={(e) => setDep(Number(e.target.value))}>
              {explainability.dependence.map((f, i) => <option key={f.feature} value={i}>{f.label}</option>)}
            </select>}>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ top: 8, right: 16, left: -8, bottom: 16 }}>
              <CartesianGrid stroke="var(--chart-grid)" />
              <XAxis type="number" dataKey="x" domain={["auto", "auto"]} tick={{ fontSize: 12 }} label={{ value: d.label, position: "insideBottom", offset: -8, fontSize: 12 }} />
              <YAxis type="number" dataKey="y" tick={{ fontSize: 12 }} />
              <ZAxis range={[16, 16]} />
              <ReferenceLine y={0} stroke="var(--color-ink-muted)" />
              <Tooltip cursor={false} formatter={(v) => Number(v).toFixed(3)} />
              <Scatter data={d.points} fill="var(--chart-2)" isAnimationActive={false} />
            </ScatterChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Feature directions" padded={false}>
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead><tr><th>Feature</th><th>Mean |SHAP|</th><th>Share</th><th>Gain</th><th>Weight</th><th>Cover</th><th className={styles.left}>Direction</th></tr></thead>
              <tbody>
                {gi.map((f) => (
                  <tr key={f.feature}>
                    <td>{f.label}</td><td>{f.mean_abs_shap.toFixed(4)}</td><td>{formatPct(f.share)}</td>
                    <td>{formatPct(f.gain)}</td><td>{formatPct(f.weight)}</td><td>{formatPct(f.cover)}</td>
                    <td className={styles.left}>{f.direction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel title="Explanation stability across subgroups"
        description="The paper's central check: does the model rely on the same evidence for women and men, rural and urban applicants? Values near 1 mean consistent explanations.">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={stabilityChart} margin={{ top: 8, right: 12, left: -8, bottom: 32 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="group" tick={{ fontSize: 11 }} interval={0} angle={-12} textAnchor="end" />
            <YAxis domain={[0.8, 1]} tick={{ fontSize: 12 }} allowDataOverflow />
            <Tooltip formatter={(v) => Number(v).toFixed(4)} />
            <Legend verticalAlign="top" wrapperStyle={{ fontSize: 12 }} />
            <Bar isAnimationActive={false} dataKey="spearman" name="Rank correlation vs overall" fill="var(--chart-1)" />
            <Bar isAnimationActive={false} dataKey="jaccard" name="Top-5 overlap" fill="var(--chart-2)" />
            <Bar isAnimationActive={false} dataKey="cosine" name="Perturbation cosine" fill="var(--chart-3)" />
            <Bar isAnimationActive={false} dataKey="top3" name="Top-3 reason agreement" fill="var(--chart-4)" />
          </BarChart>
        </ResponsiveContainer>
        <div className={styles.scroll} style={{ marginTop: 16 }}>
          <table className={styles.table}>
            <thead><tr><th>Group</th><th>n</th><th>Mean risk</th><th>Rank corr.</th><th>Top-5 overlap</th><th>Cosine (p10)</th><th className={styles.left}>Top 5 features</th></tr></thead>
            <tbody>
              {st.groups.map((g) => (
                <tr key={g.group}>
                  <td>{g.group}</td><td>{g.n.toLocaleString("en-IN")}</td><td>{formatPct(g.mean_risk_score)}</td>
                  <td>{g.spearman_vs_overall.toFixed(3)}</td><td>{g.top5_jaccard_vs_overall.toFixed(2)}</td>
                  <td>{g.perturbation_cosine_mean.toFixed(3)} ({g.perturbation_cosine_p10.toFixed(3)})</td>
                  <td className={styles.left} style={{ whiteSpace: "normal" }}>{g.top5_features.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.lead} style={{ marginTop: 12 }}>{st.summary.interpretation}</p>
      </Panel>

      <Panel title="Worked examples" description="One test applicant from each decision band, explained the way applicants see it."
        actions={
          <div className={styles.chips}>
            {explainability.examples.map((e, i) => (
              <button key={e.band} className={styles.chip} aria-pressed={example === i} onClick={() => setExample(i)}>{e.band}</button>
            ))}
          </div>}>
        {ex && (
          <div className={styles.example}>
            <p><StatusBadge value={ex.band} /> Predicted risk {formatPct(ex.risk_score)}</p>
            <div className={styles.grid2}>
              <FactorList title="Raised the risk" tone="up" factors={ex.contributions.filter((c) => c.shap > 0)} />
              <FactorList title="Lowered the risk" tone="down" factors={ex.contributions.filter((c) => c.shap < 0)} />
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
