import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import styles from "./ShapWaterfallChart.module.css";

const COLORS = {
  base: "var(--color-ink-muted)",
  total: "var(--color-ink)",
  increase: "var(--color-risk-up)",
  decrease: "var(--color-risk-down)",
};
const toProb = (logit) => 1 / (1 + Math.exp(-logit));

function WaterfallTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className={styles.tooltip}>
      <strong>{d.label}</strong>
      {d.type === "base" && <span>Average applicant: {(toProb(d.end) * 100).toFixed(1)}% risk</span>}
      {d.type === "total" && <span>This applicant: {(toProb(d.end) * 100).toFixed(1)}% risk</span>}
      {(d.type === "increase" || d.type === "decrease") && (
        <span>
          {d.value > 0 ? "+" : ""}
          {d.value.toFixed(3)} log-odds ({d.type === "increase" ? "raises" : "lowers"} risk)
        </span>
      )}
    </div>
  );
}

/**
 * SHAP waterfall: starts at the average applicant's log-odds (base value),
 * each bar adds one feature's contribution, ending at this applicant's score.
 */
export default function ShapWaterfallChart({ waterfall, height }) {
  if (!waterfall?.length) return null;
  const data = waterfall.map((d) => ({
    ...d,
    range: d.type === "base" || d.type === "total" ? [0, d.end] : [Math.min(d.start, d.end), Math.max(d.start, d.end)],
  }));
  return (
    <div className={styles.wrap}>
      <ResponsiveContainer width="100%" height={height || 44 * data.length + 40}>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 8 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
          <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v) => v.toFixed(1)} domain={["auto", "auto"]}
            label={{ value: "Log-odds of default (right = riskier)", position: "insideBottom", offset: -4, fontSize: 12 }} height={40} />
          <YAxis type="category" dataKey="label" width={200} tick={{ fontSize: 12 }} />
          <ReferenceLine x={0} stroke="var(--color-line-strong)" />
          <Tooltip content={<WaterfallTooltip />} cursor={{ fill: "var(--color-surface-alt)" }} />
          <Bar dataKey="range" isAnimationActive={false} radius={2}>
            {data.map((d, i) => (
              <Cell key={i} fill={COLORS[d.type]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className={styles.legend}>
        <span><i style={{ background: COLORS.increase }} /> Raises risk</span>
        <span><i style={{ background: COLORS.decrease }} /> Lowers risk</span>
        <span><i style={{ background: COLORS.base }} /> Average applicant</span>
        <span><i style={{ background: COLORS.total }} /> This applicant</span>
      </div>
    </div>
  );
}
