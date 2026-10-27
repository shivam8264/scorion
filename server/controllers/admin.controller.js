const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const FairnessAudit = require("../models/FairnessAudit");
const ApiError = require("../utils/ApiError");
const ml = require("../services/mlService");
const audit = require("../services/auditService");
const { runFairnessAudit } = require("../services/fairnessService");

/** GET /api/admin/fairness-report - offline audit (ML service) + latest live audit (Mongo). */
async function fairnessReport(_req, res) {
  const [offline, latestLive, history] = await Promise.all([
    ml.fairnessReport().catch((err) => ({ error: err.message })),
    FairnessAudit.findOne({ status: { $ne: "failed" } }).sort({ createdAt: -1 }).lean(),
    FairnessAudit.find()
      .sort({ createdAt: -1 })
      .limit(30)
      .select("createdAt trigger status n labelled alerts byAttribute.gender.summary byAttribute.region.summary byAttribute.gender_x_region.summary")
      .lean(),
  ]);
  res.json({ offline, live: latestLive, history: history.reverse() });
}

/** POST /api/admin/fairness-audit/run - on-demand batch audit. */
async function runAudit(req, res) {
  const windowDays = Number(req.body?.windowDays) || undefined;
  const doc = await runFairnessAudit({ trigger: "manual", user: req.user, windowDays });
  res.status(201).json({ audit: doc });
}

/** GET /api/admin/audit-logs */
async function auditLogs(req, res) {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "25", 10), 1), 100);
  const filter = {};
  if (req.query.action) filter.action = String(req.query.action);
  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ sequence: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("performedBy", "name email role")
      .lean(),
    AuditLog.countDocuments(filter),
  ]);
  res.json({ items, total, page, limit, pages: Math.ceil(total / limit) });
}

/** GET /api/admin/audit-logs/verify - tamper-evidence check over the hash chain. */
async function verifyAuditChain(_req, res) {
  res.json(await audit.verifyChain());
}

async function listUsers(_req, res) {
  const users = await User.find().sort({ createdAt: -1 });
  res.json({ items: users.map((u) => u.toSafeJSON()) });
}

async function updateRole(req, res) {
  if (String(req.params.id) === String(req.user._id)) throw ApiError.badRequest("You cannot change your own role");
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound("User not found");
  const before = user.role;
  user.role = req.body.role;
  await user.save();
  await audit.log({
    action: "user_role_changed",
    user: req.user,
    ip: req.ip,
    snapshot: { targetUser: user._id, email: user.email, before, after: user.role },
  });
  res.json({ user: user.toSafeJSON() });
}

async function updateStatus(req, res) {
  if (String(req.params.id) === String(req.user._id)) throw ApiError.badRequest("You cannot disable yourself");
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound("User not found");
  user.isActive = req.body.isActive;
  await user.save();
  await audit.log({
    action: "user_status_changed",
    user: req.user,
    ip: req.ip,
    snapshot: { targetUser: user._id, email: user.email, isActive: user.isActive },
  });
  res.json({ user: user.toSafeJSON() });
}

module.exports = { fairnessReport, runAudit, auditLogs, verifyAuditChain, listUsers, updateRole, updateStatus };
