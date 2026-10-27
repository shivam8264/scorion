import styles from "./FactorList.module.css";

/** Plain-language list of the factors that raised or lowered the applicant's risk. */
export default function FactorList({ title, factors, tone }) {
  if (!factors?.length) return null;
  const max = Math.max(...factors.map((f) => Math.abs(f.shap)), 1e-6);
  return (
    <div className={styles.group}>
      <h3 className={styles.title}>{title}</h3>
      <ul className={styles.list}>
        {factors.map((f) => (
          <li key={f.feature} className={styles.item}>
            <div className={styles.text}>
              <span className={styles.reason}>{f.reason}</span>
              <span className={styles.label}>
                {f.label}
                {f.value !== null && f.value !== undefined && typeof f.value !== "boolean" && <> : {formatValue(f.value)}</>}
              </span>
            </div>
            <span className={styles.meter} aria-hidden="true">
              <span className={`${styles.bar} ${styles[tone]}`} style={{ width: `${Math.max((Math.abs(f.shap) / max) * 100, 4)}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatValue(v) {
  if (typeof v === "number") {
    if (Math.abs(v) >= 100) return Math.round(v).toLocaleString("en-IN");
    return Number(v.toFixed(3)).toString();
  }
  return String(v).replace(/_/g, " ");
}
