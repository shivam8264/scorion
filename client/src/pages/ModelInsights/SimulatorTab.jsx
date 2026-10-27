import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { errorMessage, modelApi } from "../../api/client";
import CreditScoreScale from "../../components/CreditScoreScale";
import FactorList from "../../components/FactorList";
import ShapWaterfallChart from "../../components/ShapWaterfallChart";
import { Loader, Notice } from "../../components/ui/Feedback";
import { RatioField, SelectField, TextField } from "../../components/ui/Field";
import Panel from "../../components/ui/Panel";
import { EDUCATION_OPTIONS, EMPLOYMENT_OPTIONS, TENURE_OPTIONS } from "../../utils/constants";
import styles from "./ModelInsights.module.css";

const START = {
  age: 29, monthlyIncomeProxy: 18000, transactionRegularity: 0.55, monthlyUpiTxnCount: 14, avgMonthlyBalance: 6000,
  billPaymentConsistency: 0.62, mobileRechargeRegularity: 0.6, digitalTenureMonths: 10, savingsRatio: 0.08,
  existingLoansCount: 2, debtToIncome: 0.38, loanAmountRequested: 70000, loanTenureMonths: 12, dependents: 3,
  employmentType: "gig_worker", educationLevel: "secondary",
};
const NUM = new Set(Object.keys(START).filter((k) => typeof START[k] === "number"));

/** What-if analysis: change an input and see the score and SHAP explanation update. Nothing is saved. */
export default function SimulatorTab() {
  const [form, setForm] = useState(START);
  const sim = useMutation({ mutationFn: modelApi.simulate });
  const { mutate } = sim;

  useEffect(() => {
    const t = setTimeout(() => mutate(form), 350); // debounce while dragging sliders
    return () => clearTimeout(t);
  }, [form, mutate]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: NUM.has(name) ? (value === "" ? "" : Number(value)) : value }));
  };
  const f = (name) => ({ name, value: form[name], onChange });
  const data = sim.data;

  return (
    <div className={styles.simLayout}>
      <Panel title="Applicant profile" description="Starts as a borderline gig worker. Adjust anything.">
        <div className={styles.simForm}>
          <RatioField label="Bill-payment consistency" {...f("billPaymentConsistency")} />
          <RatioField label="Transaction regularity" {...f("transactionRegularity")} />
          <RatioField label="Mobile recharge regularity" {...f("mobileRechargeRegularity")} />
          <RatioField label="Savings ratio" {...f("savingsRatio")} />
          <TextField label="Debt-to-income" type="number" step="0.05" min="0" max="5" {...f("debtToIncome")} />
          <TextField label="Monthly income" type="number" prefix="₹" step="1000" {...f("monthlyIncomeProxy")} />
          <TextField label="Loan amount" type="number" prefix="₹" step="5000" {...f("loanAmountRequested")} />
          <SelectField label="Tenure" options={TENURE_OPTIONS} {...f("loanTenureMonths")} />
          <TextField label="Average balance" type="number" prefix="₹" step="1000" {...f("avgMonthlyBalance")} />
          <TextField label="UPI payments / month" type="number" min="0" {...f("monthlyUpiTxnCount")} />
          <TextField label="Digital history (months)" type="number" min="0" {...f("digitalTenureMonths")} />
          <TextField label="Existing loans" type="number" min="0" {...f("existingLoansCount")} />
          <TextField label="Age" type="number" min="18" max="75" {...f("age")} />
          <TextField label="Dependents" type="number" min="0" {...f("dependents")} />
          <SelectField label="Employment" options={EMPLOYMENT_OPTIONS} {...f("employmentType")} />
          <SelectField label="Education" options={EDUCATION_OPTIONS} {...f("educationLevel")} />
        </div>
      </Panel>
      <div className={styles.simResult} aria-live="polite">
        {sim.isError && <Notice tone="danger">{errorMessage(sim.error)}</Notice>}
        {!data && sim.isPending && <Loader label="Scoring" />}
        {data && (
          <>
            <Panel title="Result">
              <CreditScoreScale score={data.prediction.credit_score} riskScore={data.prediction.risk_score}
                decision={data.prediction.decision} thresholds={data.prediction.thresholds} />
              <p className={styles.lead} style={{ marginTop: 16 }}>{data.explanation.summary}</p>
            </Panel>
            <Panel title="SHAP waterfall">
              <ShapWaterfallChart waterfall={data.explanation.waterfall} />
            </Panel>
            <Panel title="Reasons">
              <div className={styles.grid2}>
                <FactorList title="Raised the risk" tone="up" factors={data.explanation.positive_factors} />
                <FactorList title="Lowered the risk" tone="down" factors={data.explanation.negative_factors} />
              </div>
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}
