/** Zod schemas - validate applicant data before it ever reaches the model. */
const { z } = require("zod");

const ratio = z.coerce.number().min(0, "Must be between 0 and 1").max(1, "Must be between 0 and 1");
const count = (max) => z.coerce.number().int().min(0).max(max);

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Za-z]/, "Password must contain a letter")
    .regex(/[0-9]/, "Password must contain a number"),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

const applicantFeatureShape = {
  age: z.coerce.number().int().min(18).max(75),
  monthlyIncomeProxy: z.coerce.number().min(0).max(5_000_000),
  transactionRegularity: ratio,
  monthlyUpiTxnCount: count(2000),
  avgMonthlyBalance: z.coerce.number().min(0).max(50_000_000),
  billPaymentConsistency: ratio,
  mobileRechargeRegularity: ratio,
  digitalTenureMonths: count(360),
  savingsRatio: ratio,
  existingLoansCount: count(30),
  debtToIncome: z.coerce.number().min(0).max(5),
  loanAmountRequested: z.coerce.number().positive().max(10_000_000),
  loanTenureMonths: z.coerce.number().int().min(1).max(120),
  dependents: count(15).default(0),
  employmentType: z.enum(["salaried", "self_employed", "casual_labour", "gig_worker"]),
  educationLevel: z.enum(["none", "secondary", "graduate", "postgraduate"]),
};

const applicantSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s]{7,15}$/, "Invalid phone number")
    .optional()
    .or(z.literal("")),
  loanPurpose: z.string().trim().max(120).optional(),
  ...applicantFeatureShape,
  // protected attributes: collected for fairness auditing only
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).default("prefer_not_to_say"),
  region: z.enum(["urban", "rural"]),
});

const simulateSchema = z.object(applicantFeatureShape);

const reviewSchema = z.object({
  finalDecision: z.enum(["approve", "decline"]),
  reviewNotes: z.string().trim().min(5, "Please give a reason (min 5 characters)").max(1000),
});

const outcomeSchema = z.object({ actualDefault: z.union([z.literal(0), z.literal(1)]) });

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["scored", "pending_review", "approved", "declined", "scoring_failed"]).optional(),
  decision: z.enum(["approve", "refer", "decline"]).optional(),
  search: z.string().trim().max(80).optional(),
  sort: z.enum(["newest", "oldest", "risk_desc", "risk_asc"]).default("newest"),
});

const roleSchema = z.object({ role: z.enum(["applicant", "loan_officer", "admin"]) });
const statusSchema = z.object({ isActive: z.boolean() });

module.exports = {
  registerSchema,
  loginSchema,
  applicantSchema,
  simulateSchema,
  reviewSchema,
  outcomeSchema,
  listQuerySchema,
  roleSchema,
  statusSchema,
};
