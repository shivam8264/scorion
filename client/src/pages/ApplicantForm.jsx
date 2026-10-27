import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { applicantApi, errorMessage } from "../api/client";
import Button from "../components/ui/Button";
import { Notice } from "../components/ui/Feedback";
import { RatioField, SelectField, TextField } from "../components/ui/Field";
import PageHeader from "../components/ui/PageHeader";
import Panel from "../components/ui/Panel";
import { useAuth } from "../context/AuthContext";
import {
  EDUCATION_OPTIONS, EMPLOYMENT_OPTIONS, GENDER_OPTIONS, REGION_OPTIONS, TENURE_OPTIONS,
} from "../utils/constants";
import { formatINR, formatPct } from "../utils/format";
import styles from "./ApplicantForm.module.css";

const EMPTY = {
  fullName: "", phone: "", loanPurpose: "", age: "", dependents: 0, educationLevel: "", employmentType: "",
  gender: "prefer_not_to_say", region: "", loanAmountRequested: "", loanTenureMonths: 12,
  monthlyIncomeProxy: "", avgMonthlyBalance: "", savingsRatio: 0.15, existingLoansCount: 0, debtToIncome: "",
  transactionRegularity: 0.6, monthlyUpiTxnCount: "", billPaymentConsistency: 0.75,
  mobileRechargeRegularity: 0.7, digitalTenureMonths: "",
};

const SAMPLE = {
  fullName: "Meera Kulkarni", phone: "9876543210", loanPurpose: "Working capital", age: 32, dependents: 2,
  educationLevel: "secondary", employmentType: "self_employed", gender: "female", region: "rural",
  loanAmountRequested: 60000, loanTenureMonths: 12, monthlyIncomeProxy: 24000, avgMonthlyBalance: 14000,
  savingsRatio: 0.18, existingLoansCount: 1, debtToIncome: 0.22, transactionRegularity: 0.71,
  monthlyUpiTxnCount: 26, billPaymentConsistency: 0.86, mobileRechargeRegularity: 0.8, digitalTenureMonths: 28,
};

const STEPS = [
  { title: "About you and the loan", fields: ["fullName", "age", "dependents", "educationLevel", "employmentType", "region", "loanAmountRequested", "loanTenureMonths"] },
  { title: "Income and obligations", fields: ["monthlyIncomeProxy", "avgMonthlyBalance", "debtToIncome", "existingLoansCount"] },
  { title: "Digital payment behaviour", fields: ["monthlyUpiTxnCount", "digitalTenureMonths"] },
  { title: "Review and submit", fields: [] },
];

const RULES = {
  fullName: (v) => (String(v).trim().length < 2 ? "Enter the applicant's full name" : null),
  age: (v) => (v === "" || v < 18 || v > 75 ? "Age must be between 18 and 75" : null),
  dependents: (v) => (v < 0 || v > 15 ? "Between 0 and 15" : null),
  educationLevel: (v) => (!v ? "Choose an education level" : null),
  employmentType: (v) => (!v ? "Choose an employment type" : null),
  region: (v) => (!v ? "Choose urban or rural" : null),
  loanAmountRequested: (v) => (v === "" || v <= 0 ? "Enter the amount requested" : v > 10000000 ? "Maximum is 1,00,00,000" : null),
  loanTenureMonths: (v) => (!v ? "Choose a tenure" : null),
  monthlyIncomeProxy: (v) => (v === "" || v < 0 ? "Enter estimated monthly income" : null),
  avgMonthlyBalance: (v) => (v === "" || v < 0 ? "Enter the average balance" : null),
  debtToIncome: (v) => (v === "" || v < 0 || v > 5 ? "Enter a ratio between 0 and 5 (e.g. 0.25)" : null),
  existingLoansCount: (v) => (v === "" || v < 0 || v > 30 ? "Between 0 and 30" : null),
  monthlyUpiTxnCount: (v) => (v === "" || v < 0 ? "Enter the monthly number of UPI payments" : null),
  digitalTenureMonths: (v) => (v === "" || v < 0 || v > 360 ? "Between 0 and 360 months" : null),
};

const NUMERIC = new Set(["age", "dependents", "loanAmountRequested", "loanTenureMonths", "monthlyIncomeProxy",
  "avgMonthlyBalance", "savingsRatio", "existingLoansCount", "debtToIncome", "transactionRegularity",
  "monthlyUpiTxnCount", "billPaymentConsistency", "mobileRechargeRegularity", "digitalTenureMonths"]);

const emi = (p, n, rate = 0.18) => {
  const r = rate / 12;
  const f = (1 + r) ** n;
  return (p * r * f) / (f - 1);
};

export default function ApplicantForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(() => (user.role === "applicant" ? { ...EMPTY, fullName: user.name } : EMPTY));
  const [errors, setErrors] = useState({});

  const mutation = useMutation({
    mutationFn: applicantApi.create,
    onSuccess: (data) => {
      qc.invalidateQueries();
      navigate(`/decisions/${data.decision._id}`, { state: { justScored: true } });
    },
  });

  const onChange = (e) => {
    const { name, value } = e.target;
    const v = NUMERIC.has(name) && value !== "" ? Number(value) : value;
    setForm((f) => ({ ...f, [name]: v }));
    setErrors((er) => ({ ...er, [name]: undefined }));
  };

  const validateStep = (i) => {
    const e = {};
    for (const f of STEPS[i].fields) {
      const msg = RULES[f]?.(form[f]);
      if (msg) e[f] = msg;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => validateStep(step) && setStep((s) => s + 1);
  const back = () => setStep((s) => s - 1);

  const submit = () => {
    for (let i = 0; i < STEPS.length - 1; i += 1) {
      if (!validateStep(i)) return setStep(i);
    }
    const payload = { ...form };
    if (!payload.phone) delete payload.phone;
    mutation.mutate(payload);
  };

  const derived = useMemo(() => {
    const p = Number(form.loanAmountRequested) || 0;
    const income = Number(form.monthlyIncomeProxy) || 0;
    const e = p && form.loanTenureMonths ? emi(p, form.loanTenureMonths) : 0;
    const sparse = form.digitalTenureMonths !== "" && form.monthlyUpiTxnCount !== ""
      ? Number(form.digitalTenureMonths) < 6 || Number(form.monthlyUpiTxnCount) < 8 : null;
    return { emi: e, emiShare: income ? e / income : null, sparse };
  }, [form]);

  const field = (name) => ({ name, value: form[name], onChange, error: errors[name] });

  return (
    <>
      <PageHeader
        title="New credit application"
        subtitle="Scoring uses everyday financial behaviour, so applicants without a credit history can still be assessed."
        actions={<Button variant="ghost" onClick={() => { setForm(SAMPLE); setErrors({}); }}>Fill with sample data</Button>}
      />

      <ol className={styles.stepper} aria-label="Application steps">
        {STEPS.map((s, i) => (
          <li key={s.title} className={`${styles.step} ${i === step ? styles.current : ""} ${i < step ? styles.done : ""}`}
            aria-current={i === step ? "step" : undefined}>
            <span className={styles.stepNum}>{i + 1}</span>
            <span className={styles.stepTitle}>{s.title}</span>
          </li>
        ))}
      </ol>

      <div className={styles.layout}>
        <Panel title={STEPS[step].title}>
          {step === 0 && (
            <div className={styles.grid}>
              <TextField label="Full name" {...field("fullName")} autoComplete="name" />
              <TextField label="Phone (optional)" {...field("phone")} inputMode="tel" />
              <TextField label="Age" type="number" min="18" max="75" {...field("age")} />
              <TextField label="Dependents" type="number" min="0" max="15" {...field("dependents")} />
              <SelectField label="Education" placeholder="Select" options={EDUCATION_OPTIONS} {...field("educationLevel")} />
              <SelectField label="Employment" placeholder="Select" options={EMPLOYMENT_OPTIONS} {...field("employmentType")} />
              <TextField label="Loan amount" type="number" prefix="₹" min="1000" {...field("loanAmountRequested")} />
              <SelectField label="Repayment tenure" options={TENURE_OPTIONS} {...field("loanTenureMonths")} />
              <TextField label="Purpose (optional)" {...field("loanPurpose")} />
              <div className={styles.protected}>
                <h3>Fairness monitoring</h3>
                <p>
                  Gender and region are never used to calculate the score. They are stored separately so the
                  lender can check that approval rates stay fair across groups.
                </p>
                <div className={styles.grid}>
                  <SelectField label="Region" placeholder="Select" options={REGION_OPTIONS} {...field("region")} />
                  <SelectField label="Gender" options={GENDER_OPTIONS} {...field("gender")} />
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className={styles.grid}>
              <TextField label="Estimated monthly income" type="number" prefix="₹" {...field("monthlyIncomeProxy")}
                hint="Average monthly inflows into bank and UPI accounts" />
              <TextField label="Average monthly balance" type="number" prefix="₹" {...field("avgMonthlyBalance")} />
              <TextField label="Debt-to-income ratio" type="number" step="0.01" min="0" max="5" {...field("debtToIncome")}
                hint="Existing monthly debt payments divided by income, e.g. 0.25" />
              <TextField label="Existing active loans" type="number" min="0" {...field("existingLoansCount")} />
              <RatioField label="Savings ratio" name="savingsRatio" value={form.savingsRatio} onChange={onChange}
                hint="Share of monthly income that is saved" />
            </div>
          )}

          {step === 2 && (
            <div className={styles.grid}>
              <TextField label="UPI payments per month" type="number" min="0" {...field("monthlyUpiTxnCount")} />
              <TextField label="Months of digital payment history" type="number" min="0" {...field("digitalTenureMonths")} />
              <RatioField label="Transaction regularity" name="transactionRegularity" value={form.transactionRegularity}
                onChange={onChange} hint="How consistent monthly inflows are (100% = same every month)" />
              <RatioField label="Bill-payment consistency" name="billPaymentConsistency" value={form.billPaymentConsistency}
                onChange={onChange} hint="Share of utility bills paid on time" />
              <RatioField label="Mobile recharge regularity" name="mobileRechargeRegularity" value={form.mobileRechargeRegularity}
                onChange={onChange} hint="How regularly prepaid mobile plans are renewed" />
            </div>
          )}

          {step === 3 && (
            <dl className={styles.review}>
              {[
                ["Applicant", form.fullName], ["Age", form.age], ["Employment", EMPLOYMENT_OPTIONS.find((o) => o.value === form.employmentType)?.label],
                ["Education", EDUCATION_OPTIONS.find((o) => o.value === form.educationLevel)?.label],
                ["Loan", `${formatINR(form.loanAmountRequested)} over ${form.loanTenureMonths} months`],
                ["Monthly income", formatINR(form.monthlyIncomeProxy)], ["Average balance", formatINR(form.avgMonthlyBalance)],
                ["Debt-to-income", form.debtToIncome], ["Existing loans", form.existingLoansCount],
                ["Savings ratio", formatPct(form.savingsRatio, 0)], ["UPI payments / month", form.monthlyUpiTxnCount],
                ["Digital history", `${form.digitalTenureMonths} months`], ["Transaction regularity", formatPct(form.transactionRegularity, 0)],
                ["Bill payments on time", formatPct(form.billPaymentConsistency, 0)], ["Recharge regularity", formatPct(form.mobileRechargeRegularity, 0)],
              ].map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd>{v === "" || v == null ? "-" : v}</dd></div>
              ))}
            </dl>
          )}

          {mutation.isError && <Notice tone="danger">{errorMessage(mutation.error)}</Notice>}

          <div className={styles.actions}>
            {step > 0 && <Button variant="secondary" onClick={back}>Back</Button>}
            {step < STEPS.length - 1 && <Button onClick={next}>Continue</Button>}
            {step === STEPS.length - 1 && <Button onClick={submit} loading={mutation.isPending}>Submit for scoring</Button>}
          </div>
        </Panel>

        <aside className={styles.summary} aria-live="polite">
          <h2>Repayment check</h2>
          <div className={styles.metric}>
            <span>Estimated monthly instalment</span>
            <strong>{derived.emi ? formatINR(derived.emi) : "-"}</strong>
            <small>At 18% a year, reducing balance</small>
          </div>
          <div className={styles.metric}>
            <span>Share of monthly income</span>
            <strong className={derived.emiShare > 0.4 ? styles.warn : undefined}>
              {derived.emiShare != null ? formatPct(derived.emiShare) : "-"}
            </strong>
            {derived.emiShare > 0.4 && <small>Instalments above 40% of income raise risk sharply.</small>}
          </div>
          {derived.sparse !== null && (
            <Notice tone={derived.sparse ? "warning" : "success"}>
              {derived.sparse
                ? "Thin digital footprint: under 6 months of history or fewer than 8 UPI payments a month. The model will be less certain."
                : "Enough digital history for a confident assessment."}
            </Notice>
          )}
        </aside>
      </div>
    </>
  );
}
