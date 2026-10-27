/**
 * Axios instance for the Express API. React only ever talks to Express,
 * never to the Python ML service.
 */
import axios from "axios";

export const TOKEN_KEY = "saral.token";

export const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || ""}/api`,
  timeout: 20000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config.url.startsWith("/auth/")) {
      localStorage.removeItem(TOKEN_KEY);
      window.dispatchEvent(new Event("auth:expired"));
    }
    return Promise.reject(err);
  }
);

/** Turns an axios error into a message a person can act on. */
export function errorMessage(err) {
  const data = err?.response?.data;
  if (data?.details?.length && data.error === "Validation failed") {
    return data.details.map((d) => `${d.field || "field"}: ${d.message}`).join("; ");
  }
  if (data?.error) return data.error;
  if (err?.code === "ECONNABORTED") return "The server took too long to respond. Try again.";
  if (!err?.response) return "Cannot reach the server. Check that the API is running.";
  return err.message || "Something went wrong";
}

const unwrap = (p) => p.then((r) => r.data);

export const authApi = {
  login: (body) => unwrap(api.post("/auth/login", body)),
  register: (body) => unwrap(api.post("/auth/register", body)),
  me: () => unwrap(api.get("/auth/me")),
};

export const applicantApi = {
  create: (body) => unwrap(api.post("/applicants", body)),
  list: (params) => unwrap(api.get("/applicants", { params })),
  mine: () => unwrap(api.get("/applicants/mine")),
  get: (id) => unwrap(api.get(`/applicants/${id}`)),
  stats: () => unwrap(api.get("/applicants/stats")),
  rescore: (id) => unwrap(api.post(`/applicants/${id}/rescore`)),
  recordOutcome: (id, actualDefault) => unwrap(api.patch(`/applicants/${id}/outcome`, { actualDefault })),
};

export const decisionApi = {
  get: (id) => unwrap(api.get(`/decisions/${id}`)),
  reviewQueue: () => unwrap(api.get("/decisions/review-queue")),
  review: (id, body) => unwrap(api.patch(`/decisions/${id}/review`, body)),
};

export const adminApi = {
  fairnessReport: () => unwrap(api.get("/admin/fairness-report")),
  runAudit: (windowDays) => unwrap(api.post("/admin/fairness-audit/run", { windowDays })),
  auditLogs: (params) => unwrap(api.get("/admin/audit-logs", { params })),
  verifyChain: () => unwrap(api.get("/admin/audit-logs/verify")),
  users: () => unwrap(api.get("/admin/users")),
  setRole: (id, role) => unwrap(api.patch(`/admin/users/${id}/role`, { role })),
  setStatus: (id, isActive) => unwrap(api.patch(`/admin/users/${id}/status`, { isActive })),
};

export const modelApi = {
  info: () => unwrap(api.get("/model/info")),
  report: (name) => unwrap(api.get(`/model/reports/${name}`)),
  simulate: (body) => unwrap(api.post("/model/simulate", body)),
};
