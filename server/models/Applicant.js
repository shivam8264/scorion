const mongoose = require("mongoose");
const { Schema } = mongoose;

const ApplicantSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    submittedBy: { type: Schema.Types.ObjectId, ref: "User" },
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },

    // ---- model features (alternative-data signals) ----
    age: { type: Number, required: true, min: 18, max: 75 },
    monthlyIncomeProxy: { type: Number, required: true, min: 0 },
    transactionRegularity: { type: Number, required: true, min: 0, max: 1 },
    monthlyUpiTxnCount: { type: Number, required: true, min: 0 },
    avgMonthlyBalance: { type: Number, required: true, min: 0 },
    billPaymentConsistency: { type: Number, required: true, min: 0, max: 1 },
    mobileRechargeRegularity: { type: Number, required: true, min: 0, max: 1 },
    digitalTenureMonths: { type: Number, required: true, min: 0 },
    savingsRatio: { type: Number, required: true, min: 0, max: 1 },
    existingLoansCount: { type: Number, required: true, min: 0 },
    debtToIncome: { type: Number, required: true, min: 0 },
    loanAmountRequested: { type: Number, required: true, min: 1 },
    loanTenureMonths: { type: Number, required: true, min: 1 },
    dependents: { type: Number, default: 0, min: 0 },
    employmentType: {
      type: String,
      enum: ["salaried", "self_employed", "casual_labour", "gig_worker"],
      required: true,
    },
    educationLevel: {
      type: String,
      enum: ["none", "secondary", "graduate", "postgraduate"],
      required: true,
    },
    loanPurpose: { type: String, trim: true, maxlength: 120 },
    dataSparsityFlag: Boolean, // computed by the ML service when not supplied

    // Protected attributes - stored ONLY for the fairness-audit stage, never
    // passed into the model's feature vector (paper section 3.3 Feature Selection).
    gender: { type: String, enum: ["male", "female", "other", "prefer_not_to_say"], default: "prefer_not_to_say" },
    region: { type: String, enum: ["urban", "rural"], required: true },

    // Repayment outcome, recorded later - enables outcome-based fairness metrics.
    actualDefault: { type: Number, enum: [0, 1, null], default: null },
    outcomeRecordedAt: Date,

    status: {
      type: String,
      enum: ["scored", "pending_review", "approved", "declined", "scoring_failed"],
      default: "scored",
      index: true,
    },
    latestDecision: { type: Schema.Types.ObjectId, ref: "Decision" },
    // Denormalised copy of the latest decision for fast, portable list queries
    // (no $lookup needed, so it also runs on Atlas, DocumentDB and FerretDB).
    decisionSummary: {
      decisionId: { type: Schema.Types.ObjectId, ref: "Decision" },
      riskScore: Number,
      creditScore: Number,
      riskBand: String,
      decision: String,
      finalDecision: String,
      status: String,
      modelVersion: String,
    },
  },
  { timestamps: true }
);

ApplicantSchema.index({ createdAt: -1 });
ApplicantSchema.index({ "decisionSummary.riskScore": -1 });

module.exports = mongoose.model("Applicant", ApplicantSchema);
