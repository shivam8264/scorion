const Applicant = require("../models/Applicant");
const Decision = require("../models/Decision");
const ApiError = require("../utils/ApiError");
const { scoreApplicant } = require("../services/decisionService");
const audit = require("../services/auditService");

const isStaff = (user) => ["loan_officer", "admin"].includes(user.role);

/** POST /api/applicants -> save applicant -> ML predict + explain -> save Decision -> respond */
async function createApplicant(req, res) {
  const applicant = await Applicant.create({
    ...req.body,
    userId: req.user.role === "applicant" ? req.user._id : undefined,
    submittedBy: req.user._id,
  });
  const decision = await scoreApplicant(applicant, { user: req.user, ip: req.ip });
  res.status(201).json({ applicant, decision });
}

/** POST /api/applicants/:id/rescore - staff can re-run scoring (e.g. after a model upgrade). */
async function rescoreApplicant(req, res) {
  const applicant = await Applicant.findById(req.params.id);
  if (!applicant) throw ApiError.notFound("Applicant not found");
  const decision = await scoreApplicant(applicant, { user: req.user, ip: req.ip });
  res.status(201).json({ applicant, decision });
}

const SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  risk_desc: { "decisionSummary.riskScore": -1 },
  risk_asc: { "decisionSummary.riskScore": 1 },
};

const LIST_FIELDS =
  "fullName age employmentType loanAmountRequested loanTenureMonths monthlyIncomeProxy region status createdAt actualDefault decisionSummary";

/**
 * GET /api/applicants - loan officer dashboard list (filter, search, sort, paginate).
 * Uses the denormalised decisionSummary, so only find() + countDocuments() are needed.
 */
async function listApplicants(req, res) {
  const { page, limit, status, decision, search, sort } = req.validatedQuery;
  const filter = {};
  if (status) filter.status = status;
  if (decision) filter["decisionSummary.decision"] = decision;
  if (search) filter.fullName = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };

  const [docs, total] = await Promise.all([
    Applicant.find(filter).sort(SORTS[sort]).skip((page - 1) * limit).limit(limit).select(LIST_FIELDS).lean(),
    Applicant.countDocuments(filter),
  ]);
  const items = docs.map(({ decisionSummary, ...a }) => ({
    ...a,
    decision: decisionSummary?.decisionId ? { _id: decisionSummary.decisionId, ...decisionSummary } : null,
  }));
  res.json({ items, total, page, limit, pages: Math.ceil(total / limit) });
}

/** GET /api/applicants/mine - an applicant's own applications. */
async function myApplications(req, res) {
  const items = await Applicant.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .populate("latestDecision", "riskScore creditScore decision finalDecision status riskBand createdAt")
    .lean();
  res.json({ items });
}

/** GET /api/applicants/:id */
async function getApplicant(req, res) {
  const applicant = await Applicant.findById(req.params.id).lean();
  if (!applicant) throw ApiError.notFound("Applicant not found");
  if (!isStaff(req.user) && String(applicant.userId) !== String(req.user._id)) throw ApiError.forbidden();
  const decisions = await Decision.find({ applicantId: applicant._id })
    .sort({ createdAt: -1 })
    .select("riskScore creditScore decision finalDecision status modelVersion createdAt")
    .lean();
  if (!isStaff(req.user)) {
    delete applicant.gender; // protected attributes are not echoed back to applicants
    delete applicant.actualDefault;
  }
  res.json({ applicant, decisions });
}

/** PATCH /api/applicants/:id/outcome - record actual repayment outcome (enables equalized-odds audit). */
async function recordOutcome(req, res) {
  const applicant = await Applicant.findById(req.params.id);
  if (!applicant) throw ApiError.notFound("Applicant not found");
  const previous = applicant.actualDefault;
  applicant.actualDefault = req.body.actualDefault;
  applicant.outcomeRecordedAt = new Date();
  await applicant.save();
  await audit.log({
    action: "outcome_recorded",
    applicantId: applicant._id,
    decisionId: applicant.latestDecision,
    user: req.user,
    ip: req.ip,
    snapshot: { previous, actualDefault: applicant.actualDefault },
  });
  res.json({ applicant });
}

/**
 * Sums risk and credit scores by streaming a two-field projection. Numeric $sum/$avg
 * accumulators behave inconsistently on some MongoDB-compatible engines (e.g. FerretDB),
 * so the arithmetic is done here; memory stays constant because a cursor is used.
 */
async function sumScores() {
  let sumRisk = 0;
  let sumCreditScore = 0;
  for await (const d of Decision.find().select("riskScore creditScore -_id").lean().cursor()) {
    sumRisk += d.riskScore || 0;
    sumCreditScore += d.creditScore || 0;
  }
  return { sumRisk, sumCreditScore };
}

/** GET /api/applicants/stats - dashboard KPIs (portable: counts via $group/$sum:1, averages via a streamed projection). */
async function stats(_req, res) {
  const since = new Date(Date.now() - 14 * 864e5);
  const [byStatus, byDecision, totals, n, sparse, recent] = await Promise.all([
    Applicant.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    Decision.aggregate([{ $group: { _id: "$effectiveDecision", n: { $sum: 1 } } }]),
    sumScores(),
    Decision.countDocuments(),
    Decision.countDocuments({ dataSparsityFlag: true }),
    Decision.find({ createdAt: { $gte: since } }).select("createdAt decision").lean(),
  ]);

  const daily = {};
  for (const d of recent) {
    const day = new Date(d.createdAt).toISOString().slice(0, 10);
    const key = `${day}|${d.decision}`;
    daily[key] = (daily[key] || 0) + 1;
  }
  const toObj = (arr) => Object.fromEntries(arr.filter((r) => r._id).map((r) => [r._id, r.n]));
  const t = { ...totals, n };
  res.json({
    byStatus: toObj(byStatus),
    byDecision: toObj(byDecision),
    totals: { n: t.n, avgRisk: t.n ? t.sumRisk / t.n : 0, avgCreditScore: t.n ? t.sumCreditScore / t.n : 0, sparse },
    daily: Object.entries(daily)
      .map(([k, n]) => {
        const [day, decision] = k.split("|");
        return { day, decision, n };
      })
      .sort((a, b) => a.day.localeCompare(b.day)),
  });
}

module.exports = {
  createApplicant,
  rescoreApplicant,
  listApplicants,
  myApplications,
  getApplicant,
  recordOutcome,
  stats,
};
