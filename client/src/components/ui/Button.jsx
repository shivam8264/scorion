import styles from "./Button.module.css";

/** variant: primary | secondary | ghost | danger ; size: md | sm */
export default function Button({ variant = "primary", size = "md", loading = false, className = "", children, ...rest }) {
  return (
    <button
      className={`${styles.button} ${styles[variant]} ${styles[size]} ${className}`}
      disabled={loading || rest.disabled}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className={styles.spinner} aria-hidden="true" />}
      {children}
    </button>
  );
}
