import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { errorMessage } from "../api/client";
import Button from "../components/ui/Button";
import { Notice } from "../components/ui/Feedback";
import { TextField } from "../components/ui/Field";
import { useAuth } from "../context/AuthContext";
import { homeFor } from "../utils/routing";
import { AuthAside } from "./Login";
import styles from "./AuthPage.module.css";

export default function Register() {
  const { register, user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={homeFor(user)} replace />;

  const validate = () => {
    const e = {};
    if (form.name.trim().length < 2) e.name = "Enter your full name";
    if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = "Enter a valid email address";
    if (form.password.length < 8 || !/[0-9]/.test(form.password) || !/[A-Za-z]/.test(form.password)) {
      e.password = "Use at least 8 characters with a letter and a number";
    }
    if (form.confirm !== form.password) e.confirm = "Passwords do not match";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    setServerError("");
    if (!validate()) return;
    setBusy(true);
    try {
      const u = await register({ name: form.name, email: form.email, password: form.password });
      navigate(homeFor(u), { replace: true });
    } catch (err) {
      setServerError(errorMessage(err));
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
          <h2 className={styles.formTitle}>Create an applicant account</h2>
          {serverError && <Notice tone="danger">{serverError}</Notice>}
          <TextField label="Full name" name="name" value={form.name} onChange={onChange} error={errors.name} autoComplete="name" />
          <TextField label="Email" name="email" type="email" value={form.email} onChange={onChange} error={errors.email} autoComplete="email" />
          <TextField label="Password" name="password" type="password" value={form.password} onChange={onChange}
            error={errors.password} hint="At least 8 characters, with a letter and a number" autoComplete="new-password" />
          <TextField label="Confirm password" name="confirm" type="password" value={form.confirm} onChange={onChange} error={errors.confirm} autoComplete="new-password" />
          <Button type="submit" loading={busy}>Create account</Button>
          <p className={styles.switch}>
            Already registered? <Link to="/login">Sign in</Link>
          </p>
        </form>
      </main>
    </div>
  );
}
