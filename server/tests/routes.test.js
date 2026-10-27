/**
 * Route-level tests with Mongo models and the ML client mocked, so the suite
 * runs without a database or the Python service.
 */
const request = require("supertest");
const jwt = require("jsonwebtoken");

jest.mock("../models/User");
jest.mock("../services/mlService", () => ({
  ...jest.requireActual("../services/mlService"),
  modelInfo: jest.fn(async () => ({ model_version: "xgb-test" })),
  modelReport: jest.fn(async (name) => ({ report: name })),
  predict: jest.fn(async () => ({ risk_score: 0.1, decision: "approve" })),
  explain: jest.fn(async () => ({ summary: "ok" })),
}));

const env = require("../config/env");
const User = require("../models/User");
const app = require("../app");

const users = {
  u1: { _id: "u1", role: "applicant", isActive: true, toSafeJSON: () => ({ id: "u1", role: "applicant" }) },
  u2: { _id: "u2", role: "loan_officer", isActive: true, toSafeJSON: () => ({ id: "u2", role: "loan_officer" }) },
  u3: { _id: "u3", role: "admin", isActive: false, toSafeJSON: () => ({ id: "u3", role: "admin" }) },
};
User.findById = jest.fn(async (id) => users[id] || null);
const token = (id) => `Bearer ${jwt.sign({ sub: id }, env.JWT_SECRET)}`;

test("health endpoint is public", async () => {
  const res = await request(app).get("/api/health");
  expect(res.status).toBe(200);
  expect(res.body.status).toBe("ok");
});

test("protected routes require a token", async () => {
  expect((await request(app).get("/api/auth/me")).status).toBe(401);
  expect((await request(app).get("/api/applicants")).status).toBe(401);
});

test("invalid tokens are rejected", async () => {
  const res = await request(app).get("/api/auth/me").set("Authorization", "Bearer nope");
  expect(res.status).toBe(401);
});

test("disabled accounts are rejected", async () => {
  const res = await request(app).get("/api/auth/me").set("Authorization", token("u3"));
  expect(res.status).toBe(401);
});

test("applicants cannot reach admin or officer routes", async () => {
  expect((await request(app).get("/api/admin/users").set("Authorization", token("u1"))).status).toBe(403);
  expect((await request(app).get("/api/applicants").set("Authorization", token("u1"))).status).toBe(403);
  expect((await request(app).get("/api/decisions/review-queue").set("Authorization", token("u1"))).status).toBe(403);
});

test("loan officers cannot reach admin routes", async () => {
  const res = await request(app).get("/api/admin/fairness-report").set("Authorization", token("u2"));
  expect(res.status).toBe(403);
});

test("applicant payloads are validated before reaching the model", async () => {
  const res = await request(app)
    .post("/api/applicants")
    .set("Authorization", token("u1"))
    .send({ fullName: "X", age: 12 });
  expect(res.status).toBe(400);
  expect(res.body.error).toBe("Validation failed");
  expect(res.body.details.length).toBeGreaterThan(3);
});

test("model insights reports are proxied for any signed-in role", async () => {
  const res = await request(app).get("/api/model/reports/comparison").set("Authorization", token("u1"));
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ report: "comparison" });
  const bad = await request(app).get("/api/model/reports/secrets").set("Authorization", token("u1"));
  expect(bad.status).toBe(404);
});

test("unknown routes return 404 JSON", async () => {
  const res = await request(app).get("/api/nope");
  expect(res.status).toBe(404);
});
