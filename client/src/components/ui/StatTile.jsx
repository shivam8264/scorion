import styles from "./StatTile.module.css";

/** tone: neutral | approve | refer | decline | primary */
export default function StatTile({ label, value, hint, tone = "neutral" }) {
  return (
    <div className={`${styles.tile} ${styles[tone]}`}>
      <span className={styles.label}>{label}</span>
      <strong className={styles.value}>{value}</strong>
      {hint && <span className={styles.hint}>{hint}</span>}
    </div>
  );
}
