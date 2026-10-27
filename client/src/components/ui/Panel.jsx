import styles from "./Panel.module.css";

/** A bordered surface with an optional header row (title, description, actions). */
export default function Panel({ title, description, actions, children, padded = true, className = "" }) {
  return (
    <section className={`${styles.panel} ${className}`}>
      {(title || actions) && (
        <header className={styles.header}>
          <div>
            {title && <h2 className={styles.title}>{title}</h2>}
            {description && <p className={styles.description}>{description}</p>}
          </div>
          {actions && <div className={styles.actions}>{actions}</div>}
        </header>
      )}
      <div className={padded ? styles.body : undefined}>{children}</div>
    </section>
  );
}
