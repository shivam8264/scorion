import { errorMessage } from "../../api/client";
import Button from "./Button";
import styles from "./Feedback.module.css";

export function Loader({ label = "Loading" }) {
  return (
    <div className={styles.loader} role="status">
      <span className={styles.spinner} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className={styles.empty}>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className={styles.error} role="alert">
      <h3>Could not load this data</h3>
      <p>{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** Renders loader / error / children for a TanStack Query result. */
export function QueryBoundary({ query, children, loadingLabel }) {
  if (query.isLoading) return <Loader label={loadingLabel} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  return children(query.data);
}

export function Notice({ tone = "info", children }) {
  return <div className={`${styles.notice} ${styles[tone]}`}>{children}</div>;
}
