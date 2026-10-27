const ml = require("../services/mlService");
const { computeHash, stableStringify, GENESIS } = require("../services/auditService");
const { decisionFromML } = require("../services/decisionService");
const { applicantSchema, reviewSchema } = require("../validators/schemas");

const APPLICANT = {
  fullName: "Test User", age: 30, monthlyIncomeProxy: 25000, transactionRegularity: 0.7,
  monthlyUpiTxnCount: 25, avgMonthlyBalance: 15000, billPaymentConsistency: 0.8,
  mobileRechargeRegularity: 0.75, digitalTenureMonths: 24, savingsRatio: 0.2, existingLoansCount: 1,
  debtToIncome: 0.25, loanAmountRequested: 50000, loanTenureMonths: 12, dependents: 2,
  employmentType: "salaried", educationLevel: "graduate", gender: "female", region: "rural",
};

describe("mlService.toFeatures", () => {
  test("maps camelCase to the snake_case model contract", () => {
    const f = ml.toFeatures(APPLICANT);
    expect(f.monthly_income_proxy).toBe(25000);
    expect(f.employment_type).toBe("salaried");
    expect(Object.keys(f)).toHaveLength(Object.keys(ml.FEATURE_MAP).length);
  });
  test("never forwards protected attributes or PII to the model", () => {
    const f = ml.toFeatures(APPLICANT);
    expect(f).not.toHaveProperty("gender");
    expect(f).not.toHaveProperty("region");
    expect(f).not.toHaveProperty("fullName");
  });
});

describe("audit hash chain", () => {
  const entry = {
    prevHash: GENESIS, sequence: 1, action: "decision_created", decisionId: "a1", applicantId: "b2",
    performedBy: "c3", snapshot: { b: 1, a: [1, 2] }, timestamp: "2026-10-21T00:00:00.000Z",
  };
  test("stable stringify is key-order independent", () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
  });
  test("hash is deterministic and sensitive to tampering", () => {
    const h = computeHash(entry);
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(computeHash({ ...entry })).toBe(h);
    expect(computeHash({ ...entry, snapshot: { b: 2, a: [1, 2] } })).not.toBe(h);
    expect(computeHash({ ...entry, prevHash: "f".repeat(64) })).not.toBe(h);
  });
});

describe("decisionFromML", () => {
  const pred = {
    risk_score: 0.42, credit_score: 623, risk_band: "medium", decision: "refer",
    shap_values: { debt_to_income: 0.4 }, top_factors: ["x"], top_factor_details: [],
    base_value: -1.4, data_sparsity_flag: false, thresholds: {}, model_version: "xgb-test",
  };
  test("refer decisions go to the human review queue", () => {
    const d = decisionFromML("id", pred, { summary: "s" });
    expect(d.status).toBe("pending_review");
    expect(d.finalDecision).toBeUndefined();
    expect(d.modelVersion).toBe("xgb-test");
  });
  test("approve decisions are finalized immediately", () => {
    const d = decisionFromML("id", { ...pred, decision: "approve" }, {});
    expect(d.status).toBe("finalized");
    expect(d.finalDecision).toBe("approve");
  });
});

describe("validators", () => {
  test("accepts a valid applicant and coerces numeric strings", () => {
    const r = applicantSchema.safeParse({ ...APPLICANT, age: "30" });
    expect(r.success).toBe(true);
    expect(r.data.age).toBe(30);
  });
  test("rejects out-of-range ratios", () => {
    expect(applicantSchema.safeParse({ ...APPLICANT, transactionRegularity: 1.4 }).success).toBe(false);
  });
  test("rejects unknown employment types", () => {
    expect(applicantSchema.safeParse({ ...APPLICANT, employmentType: "astronaut" }).success).toBe(false);
  });
  test("review requires a reason", () => {
    expect(reviewSchema.safeParse({ finalDecision: "approve", reviewNotes: "" }).success).toBe(false);
  });
});
