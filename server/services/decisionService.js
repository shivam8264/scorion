/**
 * Scores an applicant through the ML service and persists the Decision plus an
 * immutable AuditLog entry (who, when, what inputs, what output).
 */
const Decision = require("../models/Decision");
const ml = require("./mlService");
const audit = require("./auditService");

const STATUS_BY_DECISION = { approve: "approved", refer: "pending_review", decline: "declined" };

function summaryOf(decision) {
  return {
    decisionId: decision._id,
    riskScore: decision.riskScore,
    creditScore: decision.creditScore,
    riskBand: decision.riskBand,
    decision: decision.decision,
    finalDecision: decision.finalDecision,
    status: decision.status,
    modelVersion: decision.modelVersion,
  };
}

function decisionFromML(applicantId, pred, expl) {
  return {
    applicantId,
    riskScore: pred.risk_score,
    creditScore: pred.credit_score,
    riskBand: pred.risk_band,
    decision: pred.decision,
    finalDecision: pred.decision === "refer" ? undefined : pred.decision,
    effectiveDecision: pred.decision,
    status: pred.decision === "refer" ? "pending_review" : "finalized",
    shapValues: pred.shap_values,
    topFactors: pred.top_factors,
    topFactorDetails: pred.top_factor_details,
    positiveFactors: expl?.positive_factors,
    negativeFactors: expl?.negative_factors,
    explanationSummary: expl?.summary,
    waterfall: expl?.waterfall,
    baseValue: pred.base_value,
    baseProbability: expl?.base_probability,
    engineeredFeatures: expl?.engineered_features,
    dataSparsityFlag: pred.data_sparsity_flag,
    thresholds: pred.thresholds,
    modelVersion: pred.model_version,
  };
}

async function persist(applicant, pred, expl, { user, ip } = {}) {
  const decision = await Decision.create(decisionFromML(applicant._id, pred, expl));
  applicant.status = STATUS_BY_DECISION[decision.decision];
  applicant.latestDecision = decision._id;
  applicant.decisionSummary = summaryOf(decision);
  applicant.dataSparsityFlag = pred.data_sparsity_flag;
  await applicant.save();

  await audit.log({
    action: "decision_created",
    decisionId: decision._id,
    applicantId: applicant._id,
    user,
    ip,
    modelVersion: decision.modelVersion,
    snapshot: {
      inputs: ml.toFeatures(applicant), // exactly what the model saw (no protected attributes)
      output: {
        riskScore: decision.riskScore,
        creditScore: decision.creditScore,
        decision: decision.decision,
        topFactors: decision.topFactors,
      },
    },
  });
  return decision;
}

/** Score one applicant: /predict and /explain are called in parallel. */
async function scoreApplicant(applicant, ctx = {}) {
  try {
    const [pred, expl] = await Promise.all([ml.predict(applicant), ml.explain(applicant)]);
    return await persist(applicant, pred, expl, ctx);
  } catch (err) {
    applicant.status = "scoring_failed";
    await applicant.save();
    await audit.log({
      action: "scoring_failed",
      applicantId: applicant._id,
      user: ctx.user,
      ip: ctx.ip,
      snapshot: { error: err.message },
    });
    throw err;
  }
}

module.exports = { scoreApplicant, persist, decisionFromML, summaryOf, STATUS_BY_DECISION };
