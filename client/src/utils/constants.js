export const ROLE_LABELS = { applicant: "Applicant", loan_officer: "Loan officer", admin: "Administrator" };

export const EMPLOYMENT_OPTIONS = [
  { value: "salaried", label: "Salaried (regular wage)" },
  { value: "self_employed", label: "Self-employed / own business" },
  { value: "casual_labour", label: "Casual labour" },
  { value: "gig_worker", label: "Gig / platform worker" },
];

export const EDUCATION_OPTIONS = [
  { value: "none", label: "No formal schooling" },
  { value: "secondary", label: "Secondary school" },
  { value: "graduate", label: "Graduate" },
  { value: "postgraduate", label: "Postgraduate" },
];

export const GENDER_OPTIONS = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

export const REGION_OPTIONS = [
  { value: "urban", label: "Urban" },
  { value: "rural", label: "Rural" },
];

export const TENURE_OPTIONS = [6, 12, 18, 24, 36, 48, 60].map((m) => ({ value: m, label: `${m} months` }));

export const DECISION_LABELS = { approve: "Approve", refer: "Refer to officer", decline: "Decline" };

export const STATUS_LABELS = {
  scored: "Scored",
  pending_review: "Pending review",
  approved: "Approved",
  declined: "Declined",
  scoring_failed: "Scoring failed",
};

export const CHART_COLORS = [
  "var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)",
  "var(--chart-6)", "var(--chart-7)", "var(--chart-8)", "var(--chart-9)",
];
