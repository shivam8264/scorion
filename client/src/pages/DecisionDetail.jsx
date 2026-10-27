import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { applicantApi, decisionApi, errorMessage } from "../api/client";
import CreditScoreScale from "../components/CreditScoreScale";
import FactorList from "../components/FactorList";
import ShapWaterfallChart from "../components/ShapWaterfallChart";
import StatusBadge from "../components/StatusBadge";
import Button from "../components/ui/Button";
import { Notice, QueryBoundary } from "../components/ui/Feedback";
import { SelectField, TextField } from "../components/ui/Field";
import Modal from "../components/ui/Modal";
import PageHeader from "../components/ui/PageHeader";
import Panel from "../components/ui/Panel";
import { useAuth } from "../context/AuthContext";
import { EDUCATION_OPTIONS, EMPLOYMENT_OPTIONS } from "../utils/constants";
import { formatDate, formatINR, formatPct, titleCase } from "../utils/format";
import styles from "./DecisionDetail.module.css";

const ACTION_LABELS = {
  decision_created: "Decision created by model",
  decision_reviewed: "Reviewed by loan officer",
  outcome_recorded: "Repayment outcome recorded",
};

function ReviewPanel({ decision }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [finalDecision, setFinal] = useState("approve");
  const [notes, setNotes] = useState("");
  const m = useMutation({
    mutationFn: () => decisionApi.review(decision._id, { finalDecision, reviewNotes: notes }),
    onSuccess: () => {
      setOpen(false);
      qc.invalidateQueries();
    },
  });
  return (
    <Panel title="Officer review" description="The model referred this application. Record the final decision and the reason for it.">
      <Button onClick={() => setOpen(true)}>Record final decision</Button>
      <Modal open={open} title="Record final decision" onClose={() => setOpen(false)}
        footer={<>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => m.mutate()} loading={m.isPending} disabled={notes.trim().length < 5}>Save decision</Button>
        </>}>
        <SelectField label="Final decision" value={finalDecision} onChange={(e) => setFinal(e.target.value)}
          options={[{ value: "approve", label: "Approve" }, { value: "decline", label: "Decline" }]} />
        <TextField label="Reason" value={notes} onChange={(e) => setNotes(e.target.value)}
          hint="Saved to the audit trail. At least 5 characters." />
        {m.isError && <Notice tone="danger">{errorMessage(m.error)}</Notice>}
      </Modal>
    </Panel>
  );
}

function OutcomePanel({ applicant }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (v) => applicantApi.recordOutcome(applicant._id, v),
    onSuccess: () => qc.invalidateQueries(),
  });
  const current = applicant.actualDefault;
  return (
    <Panel title="Repayment outcome" description="Recording what actually happened lets the fairness audit measure error rates by group.">
      <p className={styles.outcome}>
        Current: <strong>{current === 1 ? "Defaulted" : current === 0 ? "Repaid" : "Not recorded"}</strong>
      </p>
      <div className={styles.row}>
        <Button variant="secondary" size="sm" onClick={() => m.mutate(0)} loading={m.isPending && m.variables === 0}>Mark repaid</Button>
        <Button variant="secondary" size="sm" onClick={() => m.mutate(1)} loading={m.isPending && m.variables === 1}>Mark defaulted</Button>
      </div>
      {m.isError && <Notice tone="danger">{errorMessage(m.error)}</Notice>}
    </Panel>
  );
}

const optionLabel = (opts, v) => opts.find((o) => o.value === v)?.label || v;

export default function DecisionDetail() {
  const { id } = useParams();
  const { isStaff } = useAuth();
  const location = useLocation();
  const query = useQuery({ queryKey: ["decision", id], queryFn: () => decisionApi.get(id) });

  return (
    <QueryBoundary query={query} loadingLabel="Loading decision">
      {({ decision, applicant, history }) => {
        const final = decision.finalDecision || decision.decision;
        return (
          <>
            <PageHeader
              title={applicant.fullName}
              subtitle={`Application of ${formatINR(applicant.loanAmountRequested)} over ${applicant.loanTenureMonths} months, scored ${formatDate(decision.createdAt, true)}`}
              actions={<StatusBadge value={decision.status === "pending_review" ? "pending_review" : final} />}
            />
            {location.state?.justScored && <Notice tone="success">Application scored. The explanation below shows exactly why.</Notice>}

            <div className={styles.verdict}>
              <CreditScoreScale score={decision.creditScore} riskScore={decision.riskScore}
                decision={decision.decision} thresholds={decision.thresholds} />
              <div className={styles.summary}>
                <h2>Why this result</h2>
                <p>{decision.explanationSummary}</p>
                {decision.dataSparsityFlag && (
                  <Notice tone="warning">This applicant has a thin digital footprint, so the estimate is less certain.</Notice>
                )}
                {decision.finalDecision && decision.finalDecision !== decision.decision && (
                  <Notice tone="info">
                    The model suggested “{decision.decision}”; a loan officer finalised it as “{decision.finalDecision}”.
                    {decision.reviewNotes && <> Reason: {decision.reviewNotes}</>}
                  </Notice>
                )}
              </div>
            </div>

            <div className={styles.columns}>
              <Panel title="How each factor moved the score"
                description="SHAP waterfall. It starts from the average applicant and adds each factor's contribution until it reaches this applicant's risk.">
                <ShapWaterfallChart waterfall={decision.waterfall} />
              </Panel>
              <Panel title="Factors in plain language">
                <div className={styles.factors}>
                  <FactorList title="Raised the risk" factors={decision.positiveFactors} tone="up" />
                  <FactorList title="Lowered the risk" factors={decision.negativeFactors} tone="down" />
                </div>
              </Panel>
            </div>

            <div className={styles.columns}>
              <Panel title="Application details">
                <dl className={styles.facts}>
                  {[
                    ["Age", applicant.age],
                    ["Employment", optionLabel(EMPLOYMENT_OPTIONS, applicant.employmentType)],
                    ["Education", optionLabel(EDUCATION_OPTIONS, applicant.educationLevel)],
                    ["Dependents", applicant.dependents],
                    ["Monthly income", formatINR(applicant.monthlyIncomeProxy)],
                    ["Average balance", formatINR(applicant.avgMonthlyBalance)],
                    ["Debt-to-income", applicant.debtToIncome],
                    ["Existing loans", applicant.existingLoansCount],
                    ["Savings ratio", formatPct(applicant.savingsRatio, 0)],
                    ["UPI payments / month", applicant.monthlyUpiTxnCount],
                    ["Digital history", `${applicant.digitalTenureMonths} months`],
                    ["Transaction regularity", formatPct(applicant.transactionRegularity, 0)],
                    ["Bills paid on time", formatPct(applicant.billPaymentConsistency, 0)],
                    ["Recharge regularity", formatPct(applicant.mobileRechargeRegularity, 0)],
                    ...(isStaff ? [["Region (audit only)", titleCase(applicant.region)], ["Gender (audit only)", titleCase(applicant.gender || "-")]] : []),
                  ].map(([k, v]) => (
                    <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
                  ))}
                </dl>
              </Panel>
              <Panel title="Model record">
                <dl className={styles.facts}>
                  <div><dt>Model version</dt><dd>{decision.modelVersion}</dd></div>
                  <div><dt>Probability of default</dt><dd>{formatPct(decision.riskScore, 2)}</dd></div>
                  <div><dt>Average applicant</dt><dd>{formatPct(decision.baseProbability, 2)}</dd></div>
                  <div><dt>Risk band</dt><dd>{titleCase(decision.riskBand)}</dd></div>
                  {decision.engineeredFeatures && <>
                    <div><dt>Estimated instalment</dt><dd>{formatINR(decision.engineeredFeatures.estimated_emi)}</dd></div>
                    <div><dt>Instalment-to-income</dt><dd>{formatPct(decision.engineeredFeatures.emi_to_income)}</dd></div>
                    <div><dt>Loan-to-annual-income</dt><dd>{decision.engineeredFeatures.loan_to_annual_income?.toFixed(2)}</dd></div>
                  </>}
                </dl>
                <p className={styles.note}>
                  Explanations are stored with the decision, so they stay tied to the model version that produced them.
                </p>
              </Panel>
            </div>

            {isStaff && (
              <div className={styles.columns}>
                {decision.status === "pending_review" ? <ReviewPanel decision={decision} /> : <OutcomePanel applicant={applicant} />}
                <Panel title="Audit history" description="Immutable, hash-chained entries for this decision.">
                  <ol className={styles.timeline}>
                    {history.map((h) => (
                      <li key={h._id}>
                        <strong>{ACTION_LABELS[h.action] || titleCase(h.action)}</strong>
                        <span>{formatDate(h.timestamp, true)} by {h.performedBy?.name || "system"}</span>
                        <code title="Entry hash">{h.hash.slice(0, 16)}</code>
                      </li>
                    ))}
                  </ol>
                </Panel>
              </div>
            )}
            {!isStaff && (
              <p className={styles.back}><Link to="/my-applications">Back to my applications</Link></p>
            )}
          </>
        );
      }}
    </QueryBoundary>
  );
}
