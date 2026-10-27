/**
 * Seeds demo users and realistic applicants scored by the real ML service.
 *
 *   npm run seed                 # users + 300 applicants
 *   SEED_APPLICANTS=1000 npm run seed
 *   npm run seed -- --reset      # wipe applicants/decisions/audits first (audit logs too)
 *
 * Requires MongoDB and the ML service to be running.
 */
const mongoose = require("mongoose");
const env = require("../config/env");
const { connectDB, disconnectDB } = require("../config/db");
const User = require("../models/User");
const Applicant = require("../models/Applicant");
const Decision = require("../models/Decision");
const AuditLog = require("../models/AuditLog");
const FairnessAudit = require("../models/FairnessAudit");
const ml = require("../services/mlService");
const { persist } = require("../services/decisionService");
const { runFairnessAudit } = require("../services/fairnessService");

const N = parseInt(process.env.SEED_APPLICANTS || "300", 10);
const RESET = process.argv.includes("--reset");

const USERS = [
  { name: "Asha Admin", email: "admin@demo.com", password: "Admin@1234", role: "admin" },
  { name: "Omkar Officer", email: "officer@demo.com", password: "Officer@1234", role: "loan_officer" },
  { name: "Priya Applicant", email: "applicant@demo.com", password: "Applicant@1234", role: "applicant" },
];

// --- tiny seeded RNG so every seed run is reproducible --------------------------
let s = 20261021;
const rand = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
const normal = (mu, sd) => mu + sd * Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
const pick = (opts, probs) => {
  let r = rand();
  for (let i = 0; i < opts.length; i += 1) {
    r -= probs[i];
    if (r <= 0) return opts[i];
  }
  return opts[opts.length - 1];
};
const clip = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

const FIRST = ["Aarav", "Diya", "Kabir", "Meera", "Rohan", "Sana", "Vikram", "Anika", "Arjun", "Isha",
  "Farhan", "Lakshmi", "Nikhil", "Pooja", "Ravi", "Tara", "Yusuf", "Zoya", "Harish", "Kavya"];
const LAST = ["Sharma", "Patel", "Iyer", "Khan", "Reddy", "Das", "Nair", "Singh", "Joshi", "Gupta",
  "Mehta", "Rao", "Kulkarni", "Banerjee", "Pillai"];

function makeApplicant() {
  const gender = pick(["male", "female"], [0.64, 0.36]);
  const region = pick(["urban", "rural"], [0.45, 0.55]);
  const rural = region === "rural";
  const employmentType = rural
    ? pick(["salaried", "self_employed", "casual_labour", "gig_worker"], [0.14, 0.52, 0.28, 0.06])
    : pick(["salaried", "self_employed", "casual_labour", "gig_worker"], [0.42, 0.33, 0.1, 0.15]);
  const educationLevel = pick(["none", "secondary", "graduate", "postgraduate"],
    rural ? [0.16, 0.58, 0.22, 0.04] : [0.06, 0.44, 0.38, 0.12]);
  const income = Math.round(clip(Math.exp(normal(10.1 - (rural ? 0.28 : 0) - (gender === "female" ? 0.15 : 0), 0.45)), 4000, 400000) / 100) * 100;
  const tenure = Math.round(clip(normal(rural ? 22 : 32, 16), 1, 120));
  const discipline = normal(0, 1);
  const savings = round(clip(0.22 + 0.08 * discipline + normal(0, 0.08), 0, 0.8), 3);
  const existing = Math.round(clip(normal(1, 1), 0, 6));
  return {
    fullName: `${FIRST[Math.floor(rand() * FIRST.length)]} ${LAST[Math.floor(rand() * LAST.length)]}`,
    phone: `9${Math.floor(100000000 + rand() * 899999999)}`,
    loanPurpose: pick(["Working capital", "Education", "Medical", "Home repair", "Vehicle", "Equipment"],
      [0.3, 0.15, 0.15, 0.15, 0.15, 0.1]),
    age: Math.round(clip(normal(34, 9), 21, 65)),
    monthlyIncomeProxy: income,
    transactionRegularity: round(clip(0.62 + 0.12 * discipline + normal(0, 0.1), 0.05, 1), 3),
    monthlyUpiTxnCount: Math.round(clip(normal(rural ? 16 : 30, 10), 1, 150)),
    avgMonthlyBalance: Math.round(income * clip(0.3 + 2 * savings + normal(0, 0.3), 0.05, 6)),
    billPaymentConsistency: round(clip(0.72 + 0.14 * discipline + normal(0, 0.08), 0, 1), 3),
    mobileRechargeRegularity: round(clip(0.66 + 0.12 * discipline + normal(0, 0.1), 0, 1), 3),
    digitalTenureMonths: tenure,
    savingsRatio: savings,
    existingLoansCount: existing,
    debtToIncome: round(clip(0.18 + 0.07 * existing + normal(0, 0.1), 0, 1.5), 3),
    loanAmountRequested: Math.round(clip(income * (0.6 + rand() * 4.9), 5000, 1500000) / 1000) * 1000,
    loanTenureMonths: pick([6, 12, 18, 24, 36, 48, 60], [0.12, 0.3, 0.14, 0.2, 0.14, 0.06, 0.04]),
    dependents: Math.round(clip(normal(rural ? 2.1 : 1.6, 1.2), 0, 7)),
    employmentType,
    educationLevel,
    gender,
    region,
  };
}

async function seedUsers() {
  const out = {};
  for (const u of USERS) {
    let user = await User.findOne({ email: u.email });
    if (!user) user = await User.create(u);
    out[u.role] = user;
    console.log(`  user ${u.email.padEnd(22)} / ${u.password}  (${u.role})`);
  }
  return out;
}

async function main() {
  await connectDB();
  await ml.health().catch(() => {
    throw new Error(`ML service not reachable at ${env.ML_SERVICE_URL}. Start it first.`);
  });

  if (RESET) {
    console.log("Resetting collections...");
    await Promise.all([
      Applicant.collection.deleteMany({}),
      Decision.collection.deleteMany({}),
      FairnessAudit.collection.deleteMany({}),
      AuditLog.collection.deleteMany({}), // driver-level: bypasses the immutability hooks intentionally
    ]);
  }

  console.log("Users:");
  const users = await seedUsers();

  console.log(`Applicants: generating ${N} and scoring via ML service...`);
  const BATCH = 50;
  let created = 0;
  for (let i = 0; i < N; i += BATCH) {
    const batch = Array.from({ length: Math.min(BATCH, N - i) }, makeApplicant);
    const [preds, expls] = await Promise.all([ml.predictBatch(batch), ml.explainBatch(batch)]);
    for (let j = 0; j < batch.length; j += 1) {
      const isDemoApplicant = i + j < 3;
      const applicant = await Applicant.create({
        ...batch[j],
        ...(isDemoApplicant ? { fullName: users.applicant.name, userId: users.applicant._id } : {}),
        submittedBy: isDemoApplicant ? users.applicant._id : users.loan_officer._id,
      });
      const decision = await persist(applicant, preds.results[j], expls.results[j], { user: users.loan_officer });

      // Spread history over the last 30 days; older loans get a simulated repayment outcome.
      const daysAgo = Math.floor(rand() * 30);
      const at = new Date(Date.now() - daysAgo * 864e5 - Math.floor(rand() * 864e5));
      const update = { createdAt: at, updatedAt: at };
      if (daysAgo > 12 && decision.decision !== "decline") {
        update.actualDefault = rand() < decision.riskScore ? 1 : 0;
        update.outcomeRecordedAt = new Date();
      }
      await Applicant.collection.updateOne({ _id: applicant._id }, { $set: update });
      await Decision.collection.updateOne({ _id: decision._id }, { $set: { createdAt: at, updatedAt: at } });
      created += 1;
    }
    process.stdout.write(`  ${created}/${N}\r`);
  }
  console.log(`\n  created ${created} applicants with decisions`);

  const auditDoc = await runFairnessAudit({ trigger: "manual", user: users.admin, windowDays: 60 });
  console.log(`Fairness audit: ${auditDoc.status} (n=${auditDoc.n})`);
  await disconnectDB();
}

main().catch(async (err) => {
  console.error("Seed failed:", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
