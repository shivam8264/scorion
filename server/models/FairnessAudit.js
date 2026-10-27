const mongoose = require("mongoose");
const { Schema } = mongoose;

/** Result of one live batch fairness audit over recent decisions. */
const FairnessAuditSchema = new Schema(
  {
    trigger: { type: String, enum: ["scheduled", "manual"], required: true },
    triggeredBy: { type: Schema.Types.ObjectId, ref: "User" },
    windowDays: Number,
    n: Number,
    labelled: Number,
    status: { type: String, enum: ["healthy", "attention", "insufficient_data", "failed"] },
    alerts: [String],
    decisionMix: Schema.Types.Mixed,
    byAttribute: Schema.Types.Mixed,
    modelVersions: [String],
    error: String,
  },
  { timestamps: true }
);

FairnessAuditSchema.index({ createdAt: -1 });

module.exports = mongoose.model("FairnessAudit", FairnessAuditSchema);
