const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("en-IN");

export const formatINR = (v) => (v == null || Number.isNaN(Number(v)) ? "-" : inr.format(v));
export const formatNumber = (v) => (v == null ? "-" : num.format(v));
export const formatPct = (v, digits = 1) => (v == null ? "-" : `${(v * 100).toFixed(digits)}%`);
export const formatDec = (v, digits = 3) => (v == null ? "-" : Number(v).toFixed(digits));

export function formatDate(d, withTime = false) {
  if (!d) return "-";
  return new Date(d).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export const titleCase = (s = "") => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
