/**
 * Live batch fairness audit. Fairness needs a batch of decisions (never one
 * request), so recent decisions are joined with the protected attributes that
 * are stored on the Applicant (but never sent to the model) and posted to the
 * ML service's /audit endpoint. Results are persisted as FairnessAudit docs.
 */
const Decision = require("../models/Decision");
const FairnessAudit = require("../models/FairnessAudit");
const env = require("../config/env");
const ml = require("./mlService");
const audit = require("./auditService");

async function collectRecords(windowDays) {
  const since = new Date(Date.now() - windowDays * 24 * 3600 * 1000);
  const decisions = await Decision.find({ createdAt: { $gte: since } })
    .populate("applicantId", "gender region actualDefault")
    .select("riskScore decision finalDecision modelVersion applicantId")
    .lean();

  const records = decisions
    .filter((d) => d.applicantId)
    .map((d) => ({
      risk_score: d.riskScore,
      decision: d.finalDecision || d.decision,
      gender: ["male", "female"].includes(d.applicantId.gender) ? d.applicantId.gender : null,
      region: d.applicantId.region,
      actual_default: d.applicantId.actualDefault ?? null,
    }));
  const versions = [...new Set(decisions.map((d) => d.modelVersion))];
  return { records, versions };
}

async function runFairnessAudit({ trigger = "manual", user, windowDays = env.FAIRNESS_AUDIT_WINDOW_DAYS } = {}) {
  const { records, versions } = await collectRecords(windowDays);
  if (records.length === 0) {
    return FairnessAudit.create({
      trigger,
      triggeredBy: user?._id,
      windowDays,
      n: 0,
      status: "insufficient_data",
      alerts: ["No decisions in the audit window"],
    });
  }
  try {
    const result = await ml.audit(records);
    const doc = await FairnessAudit.create({
      trigger,
      triggeredBy: user?._id,
      windowDays,
      n: result.n,
      labelled: result.labelled,
      status: result.status,
      alerts: result.alerts,
      decisionMix: result.decision_mix,
      byAttribute: result.by_attribute,
      modelVersions: versions,
    });
    await audit.log({
      action: "fairness_audit_run",
      user,
      snapshot: { auditId: doc._id, trigger, n: result.n, status: result.status, alerts: result.alerts },
    });
    return doc;
  } catch (err) {
    return FairnessAudit.create({
      trigger,
      triggeredBy: user?._id,
      windowDays,
      n: records.length,
      status: "failed",
      error: err.message,
    });
  }
}

module.exports = { runFairnessAudit, collectRecords };
