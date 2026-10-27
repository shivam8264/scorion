import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { errorMessage } from "../api/client";
import Button from "../components/ui/Button";
import { Notice } from "../components/ui/Feedback";
import { TextField } from "../components/ui/Field";
import { useAuth } from "../context/AuthContext";
import { homeFor } from "../utils/routing";
import styles from "./AuthPage.module.css";

const DEMO = [
  { role: "Administrator", email: "admin@demo.com", password: "Admin@1234" },
  { role: "Loan officer", email: "officer@demo.com", password: "Officer@1234" },
  { role: "Applicant", email: "applicant@demo.com", password: "Applicant@1234" },
];

export function AuthAside() {
  return (
    <aside className={styles.aside}>
      <div className={styles.brand}>
        <span className={styles.mark}>S</span> Scorion
      </div>
      <h1 className={styles.statement}>Credit decisions people can read, question and trust.</h1>
      <p className={styles.lede}>
        Thin-file applicants are scored from everyday digital signals such as UPI regularity and bill
        payments. Every decision comes with the reasons behind it, and every model is audited for
        fairness across gender and region.
      </p>
      <dl className={styles.facts}>
        <div><dt>Model</dt><dd>XGBoost, compared against 8 other algorithms</dd></div>
        <div><dt>Explanations</dt><dd>SHAP values for every applicant</dd></div>
        <div><dt>Fairness</dt><dd>Fairlearn audits with mitigation</dd></div>
      </dl>
    </aside>
  );
}

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={homeFor(user)} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const u = await login(form);
      navigate(location.state?.from || homeFor(u), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  return (
    <div className={styles.page}>
      <AuthAside />
      <main className={styles.formSide}>
        <form className={styles.form} onSubmit={submit} noValidate>
          <h2 className={styles.formTitle}>Sign in</h2>
          {error && <Notice tone="danger">{error}</Notice>}
          <TextField label="Email" name="email" type="email" autoComplete="email" value={form.email} onChange={onChange} required />
          <TextField label="Password" name="password" type="password" autoComplete="current-password" value={form.password} onChange={onChange} required />
          <Button type="submit" loading={busy}>Sign in</Button>
          <p className={styles.switch}>
            New applicant? <Link to="/register">Create an account</Link>
          </p>
          <div className={styles.demo}>
            {/* <p>Demo accounts (after running the seed script)</p> */}
            {DEMO.map((d) => (
              <button type="button" key={d.email} className={styles.demoBtn}
                onClick={() => setForm({ email: d.email, password: d.password })}>
                <strong>{d.role}</strong>
                <span>{d.email}</span>
              </button>
            ))}
          </div>
        </form>
      </main>
    </div>
  );
}
