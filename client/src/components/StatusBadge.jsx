import { DECISION_LABELS, STATUS_LABELS } from "../utils/constants";
import styles from "./StatusBadge.module.css";

const TONE = {
  approve: "approve", approved: "approve",
  refer: "refer", pending_review: "refer",
  decline: "decline", declined: "decline", scoring_failed: "decline",
  scored: "neutral", finalized: "neutral",
  healthy: "approve", attention: "refer", failed: "decline", insufficient_data: "neutral",
};

/** Coloured pill for decisions (approve/refer/decline), applicant statuses and audit states. */
export default function StatusBadge({ value, label }) {
  if (!value) return <span className={`${styles.badge} ${styles.neutral}`}>-</span>;
  const text = label || DECISION_LABELS[value] || STATUS_LABELS[value] || value.replace(/_/g, " ");
  return <span className={`${styles.badge} ${styles[TONE[value] || "neutral"]}`}>{text}</span>;
}
