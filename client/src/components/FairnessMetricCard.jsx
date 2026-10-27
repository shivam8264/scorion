import styles from "./FairnessMetricCard.module.css";

/**
 * One fairness metric against its threshold of concern.
 * direction "lower": smaller is fairer (parity differences); "higher": bigger is fairer (ratios).
 */
export default function FairnessMetricCard({ title, value, threshold, direction = "lower", description }) {
  const missing = value === null || value === undefined;
  const ok = missing ? null : direction === "lower" ? value <= threshold : value >= threshold;
  const scaleMax = direction === "lower" ? Math.max(threshold * 2, value || 0) : 1;
  const fill = missing ? 0 : Math.min((value / scaleMax) * 100, 100);
  const mark = (threshold / scaleMax) * 100;
  return (
    <div className={`${styles.card} ${ok === null ? "" : ok ? styles.pass : styles.fail}`}>
      <div className={styles.top}>
        <span className={styles.title}>{title}</span>
        <span className={styles.status}>{ok === null ? "Not enough data" : ok ? "Within limit" : "Needs attention"}</span>
      </div>
      <strong className={styles.value}>{missing ? "-" : value.toFixed(3)}</strong>
      <div className={styles.track} aria-hidden="true">
        <span className={styles.fill} style={{ width: `${fill}%` }} />
        <span className={styles.threshold} style={{ left: `${mark}%` }} />
      </div>
      <p className={styles.description}>
        {description} Limit: {direction === "lower" ? "at most" : "at least"} {threshold}.
      </p>
    </div>
  );
}
