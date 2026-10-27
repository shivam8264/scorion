const mongoose = require("mongoose");
const { Schema } = mongoose;

const FactorSchema = new Schema(
  {
    feature: String,
    label: String,
    shap: Number,
    value: Schema.Types.Mixed,
    direction: { type: String, enum: ["increases_risk", "decreases_risk"] },
    reason: String,
  },
  { _id: false }
);

const DecisionSchema = new Schema(
  {
    applicantId: { type: Schema.Types.ObjectId, ref: "Applicant", required: true, index: true },
    riskScore: { type: Number, required: true },
    creditScore: Number,
    riskBand: { type: String, enum: ["low", "medium", "high"] },
    decision: { type: String, enum: ["approve", "refer", "decline"], required: true }, // model output
    finalDecision: { type: String, enum: ["approve", "refer", "decline"] }, // after human review
    effectiveDecision: { type: String, enum: ["approve", "refer", "decline"], index: true }, // final ?? model
    status: { type: String, enum: ["finalized", "pending_review"], default: "finalized", index: true },

    shapValues: Schema.Types.Mixed, // { feature: contribution }
    topFactors: [String], // plain-language reasons
    topFactorDetails: [FactorSchema],
    positiveFactors: [FactorSchema], // raised risk
    negativeFactors: [FactorSchema], // lowered risk
    explanationSummary: String,
    waterfall: Schema.Types.Mixed,
    baseValue: Number,
    baseProbability: Number,
    engineeredFeatures: Schema.Types.Mixed,
    dataSparsityFlag: Boolean,
    thresholds: Schema.Types.Mixed,

    modelVersion: { type: String, required: true, index: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewNotes: String,
    reviewedAt: Date,
  },
  { timestamps: true }
);

DecisionSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Decision", DecisionSchema);
