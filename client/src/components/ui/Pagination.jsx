import Button from "./Button";
import styles from "./Pagination.module.css";

export default function Pagination({ page, pages, total, onChange }) {
  if (!pages || pages <= 1) return <p className={styles.meta}>{total ?? 0} records</p>;
  return (
    <nav className={styles.pagination} aria-label="Pagination">
      <p className={styles.meta}>
        Page {page} of {pages}, {total} records
      </p>
      <div className={styles.buttons}>
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Previous
        </Button>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Next
        </Button>
      </div>
    </nav>
  );
}
