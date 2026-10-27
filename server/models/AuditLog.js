/**
 * Immutable, hash-chained audit trail.
 *
 * Every write that matters (decision created, decision reviewed, outcome
 * recorded, fairness audit run, role changed, login) appends an entry.
 * Entries can never be updated or deleted through Mongoose, and each entry
 * stores sha256(previousHash + payload) so tampering is detectable with
 * GET /api/admin/audit-logs/verify.
 */
const mongoose = require("mongoose");
const { Schema } = mongoose;

const ACTIONS = [
  "decision_created",
  "decision_reviewed",
  "outcome_recorded",
  "mitigation_applied",
  "fairness_audit_run",
  "user_registered",
  "user_login",
  "user_role_changed",
  "user_status_changed",
  "scoring_failed",
];

const AuditLogSchema = new Schema(
  {
    decisionId: { type: Schema.Types.ObjectId, ref: "Decision", index: true },
    applicantId: { type: Schema.Types.ObjectId, ref: "Applicant", index: true },
    action: { type: String, enum: ACTIONS, required: true, index: true },
    performedBy: { type: Schema.Types.ObjectId, ref: "User" },
    performedByRole: String,
    snapshot: Schema.Types.Mixed, // inputs + outputs at the moment of the action
    modelVersion: String,
    ip: String,
    sequence: { type: Number, index: true, unique: true },
    prevHash: String,
    hash: { type: String, required: true },
    timestamp: { type: Date, default: Date.now, immutable: true, index: true },
  },
  { versionKey: false }
);

// Make every field immutable after creation.
AuditLogSchema.eachPath((path, schemaType) => {
  if (path !== "_id") schemaType.options.immutable = true;
});

function blockMutation() {
  throw new Error("AuditLog entries are immutable");
}
[
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "findOneAndReplace",
  "replaceOne",
  "deleteOne",
  "deleteMany",
  "findOneAndDelete",
].forEach((op) => AuditLogSchema.pre(op, blockMutation));

AuditLogSchema.pre("save", function preventResave() {
  if (!this.isNew) throw new Error("AuditLog entries are immutable");
});

module.exports = mongoose.model("AuditLog", AuditLogSchema);
module.exports.ACTIONS = ACTIONS;
