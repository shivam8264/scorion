import { useEffect, useRef } from "react";
import styles from "./Modal.module.css";

/** Native <dialog> modal: focus trapping and Escape handling come from the browser. */
export default function Modal({ open, title, onClose, children, footer }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close?.();
  }, [open]);
  return (
    <dialog ref={ref} className={styles.dialog} onClose={onClose} aria-labelledby="modal-title">
      <header className={styles.header}>
        <h2 id="modal-title">{title}</h2>
        <button className={styles.close} onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>
      <div className={styles.body}>{children}</div>
      {footer && <footer className={styles.footer}>{footer}</footer>}
    </dialog>
  );
}
