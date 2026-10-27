import { useId } from "react";
import styles from "./Field.module.css";

function Wrapper({ id, label, hint, error, children, inline }) {
  return (
    <div className={`${styles.field} ${inline ? styles.inline : ""}`}>
      {label && (
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
      )}
      {children}
      {error ? (
        <span className={styles.error} id={`${id}-err`} role="alert">
          {error}
        </span>
      ) : (
        hint && <span className={styles.hint} id={`${id}-hint`}>{hint}</span>
      )}
    </div>
  );
}

export function TextField({ label, hint, error, prefix, ...rest }) {
  const id = useId();
  return (
    <Wrapper id={id} label={label} hint={hint} error={error}>
      <div className={`${styles.control} ${error ? styles.invalid : ""}`}>
        {prefix && <span className={styles.prefix}>{prefix}</span>}
        <input id={id} className={styles.input} aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined} {...rest} />
      </div>
    </Wrapper>
  );
}

export function SelectField({ label, hint, error, options, placeholder, ...rest }) {
  const id = useId();
  return (
    <Wrapper id={id} label={label} hint={hint} error={error}>
      <div className={`${styles.control} ${error ? styles.invalid : ""}`}>
        <select id={id} className={styles.input} aria-invalid={Boolean(error)} {...rest}>
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </Wrapper>
  );
}

/** Slider for 0-1 behavioural ratios, shown as a percentage. */
export function RatioField({ label, hint, error, value, onChange, name }) {
  const id = useId();
  const pct = Math.round(Number(value || 0) * 100);
  return (
    <Wrapper id={id} label={label} hint={hint} error={error}>
      <div className={styles.range}>
        <input id={id} type="range" min="0" max="100" step="1" name={name} value={pct}
          className={styles.slider}
          onChange={(e) => onChange({ target: { name, value: Number(e.target.value) / 100 } })} />
        <output htmlFor={id} className={styles.output}>{pct}%</output>
      </div>
    </Wrapper>
  );
}
