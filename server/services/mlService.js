/**
 * Thin axios client for the Python FastAPI ML service.
 *
 * The browser NEVER calls the ML service directly: Express is the single auth
 * boundary, audit point and CORS policy. This module also owns the mapping
 * between the camelCase Mongo documents and the snake_case model contract,
 * and it strips the protected attributes so they can never reach the model.
 */
const axios = require("axios");
const env = require("../config/env");
const ApiError = require("../utils/ApiError");

const client = axios.create({
  baseURL: env.ML_SERVICE_URL,
  timeout: env.ML_TIMEOUT_MS,
  headers: env.ML_SERVICE_KEY ? { "X-Internal-Key": env.ML_SERVICE_KEY } : {},
});

const FEATURE_MAP = {
  age: "age",
  monthlyIncomeProxy: "monthly_income_proxy",
  transactionRegularity: "transaction_regularity",
  monthlyUpiTxnCount: "monthly_upi_txn_count",
  avgMonthlyBalance: "avg_monthly_balance",
  billPaymentConsistency: "bill_payment_consistency",
  mobileRechargeRegularity: "mobile_recharge_regularity",
  digitalTenureMonths: "digital_tenure_months",
  savingsRatio: "savings_ratio",
  existingLoansCount: "existing_loans_count",
  debtToIncome: "debt_to_income",
  loanAmountRequested: "loan_amount_requested",
  loanTenureMonths: "loan_tenure_months",
  dependents: "dependents",
  employmentType: "employment_type",
  educationLevel: "education_level",
};

/** Mongo/JS applicant -> ML feature vector. Protected attributes are dropped here. */
function toFeatures(applicant) {
  const out = {};
  for (const [js, py] of Object.entries(FEATURE_MAP)) {
    if (applicant[js] !== undefined && applicant[js] !== null) out[py] = applicant[js];
  }
  return out;
}

async function call(method, url, data) {
  try {
    const res = await client.request({ method, url, data });
    return res.data;
  } catch (err) {
    if (err.response) {
      throw ApiError.badGateway(`ML service rejected the request (${err.response.status})`, err.response.data);
    }
    throw ApiError.badGateway(`ML service unavailable: ${err.code || err.message}`);
  }
}

module.exports = {
  toFeatures,
  FEATURE_MAP,
  health: () => call("get", "/health"),
  predict: (applicant) => call("post", "/predict", toFeatures(applicant)),
  explain: (applicant) => call("post", "/explain", toFeatures(applicant)),
  predictBatch: (applicants) => call("post", "/predict/batch", { applicants: applicants.map(toFeatures) }),
  explainBatch: (applicants) => call("post", "/explain/batch", { applicants: applicants.map(toFeatures) }),
  fairnessReport: () => call("get", "/fairness-report"),
  audit: (records) => call("post", "/audit", { records }),
  modelInfo: () => call("get", "/model/info"),
  modelReport: (name) => call("get", `/model/${name}`),
};
