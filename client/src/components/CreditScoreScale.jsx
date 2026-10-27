import styles from "./CreditScoreScale.module.css";

const MIN = 300;
const MAX = 900;
// Same log-odds scaling as the ML service: 600 at even odds, +50 per doubling of odds
const toScore = (p) => Math.round(600 + (50 / Math.log(2)) * Math.log((1 - p) / p));
const pos = (s) => ((Math.min(Math.max(s, MIN), MAX) - MIN) / (MAX - MIN)) * 100;

/**
 * The verdict: the applicant's 300-900 score placed on a scale whose bands are
 * derived from the model's decision thresholds (decline > 0.6 PD, refer > 0.3 PD).
 */
export default function CreditScoreScale({ score, riskScore, decision, thresholds }) {
  const decline = toScore(thresholds?.decline_above ?? 0.6);
  const refer = toScore(thresholds?.refer_above ?? 0.3);
  const verdict = { approve: "Likely approved", refer: "Needs officer review", decline: "Likely declined" }[decision];
  return (
    <figure className={styles.figure} aria-label={`Credit score ${score} out of 900`}>
      <div className={styles.headline}>
        <span className={`${styles.score} ${styles[decision]}`}>{score}</span>
        <div className={styles.meta}>
          <span className={styles.verdict}>{verdict}</span>
          <span className={styles.pd}>{(riskScore * 100).toFixed(1)}% estimated chance of default</span>
        </div>
      </div>
      <div className={styles.track}>
        <span className={`${styles.band} ${styles.bandDecline}`} style={{ width: `${pos(decline)}%` }} />
        <span className={`${styles.band} ${styles.bandRefer}`} style={{ width: `${pos(refer) - pos(decline)}%` }} />
        <span className={`${styles.band} ${styles.bandApprove}`} style={{ width: `${100 - pos(refer)}%` }} />
        <span className={styles.marker} style={{ left: `${pos(score)}%` }} />
      </div>
      <div className={styles.ticks}>
        <span style={{ left: "0%" }}>300</span>
        <span style={{ left: `${pos(decline)}%` }}>{decline}</span>
        <span style={{ left: `${pos(refer)}%` }}>{refer}</span>
        <span style={{ left: "100%" }}>900</span>
      </div>
      <figcaption className={styles.legend}>
        <span><i className={styles.bandDecline} /> Decline</span>
        <span><i className={styles.bandRefer} /> Officer review</span>
        <span><i className={styles.bandApprove} /> Approve</span>
      </figcaption>
    </figure>
  );
}
