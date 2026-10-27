const Decision = require("../models/Decision");
const Applicant = require("../models/Applicant");
const AuditLog = require("../models/AuditLog");
const ApiError = require("../utils/ApiError");
const audit = require("../services/auditService");
const { summaryOf } = require("../services/decisionService");

const isStaff = (user) => ["loan_officer", "admin"].includes(user.role);

/** GET /api/decisions/:id - decision + its full stored SHAP explanation. */
async function getDecision(req, res) {
  const decision = await Decision.findById(req.params.id)
    .populate("reviewedBy", "name role")
    .lean();
  if (!decision) throw ApiError.notFound("Decision not found");

  const applicant = await Applicant.findById(decision.applicantId).lean();
  if (!applicant) throw ApiError.notFound("Applicant not found");
  if (!isStaff(req.user) && String(applicant.userId) !== String(req.user._id)) throw ApiError.forbidden();

  if (!isStaff(req.user)) {
    delete applicant.gender;
    delete applicant.actualDefault;
  }
  const history = isStaff(req.user)
    ? await AuditLog.find({ decisionId: decision._id })
        .sort({ sequence: 1 })
        .populate("performedBy", "name role")
        .select("action performedBy performedByRole timestamp snapshot hash")
        .lean()
    : [];
  res.json({ decision, applicant, history });
}

/** GET /api/decisions/review-queue - "refer" decisions awaiting a loan officer. */
async function reviewQueue(_req, res) {
  const items = await Decision.find({ status: "pending_review" })
    .sort({ createdAt: 1 })
    .populate("applicantId", "fullName loanAmountRequested employmentType createdAt")
    .select("riskScore creditScore decision topFactors modelVersion createdAt applicantId")
    .lean();
  res.json({ items });
}

/** PATCH /api/decisions/:id/review - human-in-the-loop override with a mandatory reason. */
async function reviewDecision(req, res) {
  const decision = await Decision.findById(req.params.id);
  if (!decision) throw ApiError.notFound("Decision not found");
  if (decision.status !== "pending_review") {
    throw ApiError.conflict("Only decisions pending review can be reviewed");
  }
  const before = { finalDecision: decision.finalDecision, status: decision.status };
  decision.finalDecision = req.body.finalDecision;
  decision.reviewNotes = req.body.reviewNotes;
  decision.reviewedBy = req.user._id;
  decision.reviewedAt = new Date();
  decision.status = "finalized";
  decision.effectiveDecision = decision.finalDecision;
  await decision.save();

  await Applicant.updateOne(
    { _id: decision.applicantId, latestDecision: decision._id },
    { status: decision.finalDecision === "approve" ? "approved" : "declined", decisionSummary: summaryOf(decision) }
  );
  await audit.log({
    action: "decision_reviewed",
    decisionId: decision._id,
    applicantId: decision.applicantId,
    user: req.user,
    ip: req.ip,
    modelVersion: decision.modelVersion,
    snapshot: {
      before,
      after: { finalDecision: decision.finalDecision, status: decision.status },
      modelDecision: decision.decision,
      riskScore: decision.riskScore,
      reviewNotes: decision.reviewNotes,
    },
  });
  res.json({ decision });
}

module.exports = { getDecision, reviewQueue, reviewDecision };
