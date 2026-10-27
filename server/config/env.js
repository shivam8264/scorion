require("dotenv").config({ quiet: true });

const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseInt(process.env.PORT || "5000", 10),
  MONGO_URI: process.env.MONGO_URI || "mongodb://localhost:27017/credit_scoring",
  JWT_SECRET: process.env.JWT_SECRET || "dev-only-secret-change-me",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "8h",
  // Internal URL of the Python service. In Docker use the service name, not localhost.
  ML_SERVICE_URL: process.env.ML_SERVICE_URL || "http://localhost:8000",
  ML_SERVICE_KEY: process.env.ML_SERVICE_KEY || "",
  ML_TIMEOUT_MS: parseInt(process.env.ML_TIMEOUT_MS || "10000", 10),
  CLIENT_ORIGIN: (process.env.CLIENT_ORIGIN || "http://localhost:5173").split(","),
  FAIRNESS_AUDIT_CRON: process.env.FAIRNESS_AUDIT_CRON || "0 2 * * *",
  FAIRNESS_AUDIT_WINDOW_DAYS: parseInt(process.env.FAIRNESS_AUDIT_WINDOW_DAYS || "90", 10),
  ENABLE_SCHEDULER: (process.env.ENABLE_SCHEDULER || "true") === "true",
};

if (env.NODE_ENV === "production" && env.JWT_SECRET === "dev-only-secret-change-me") {
  throw new Error("JWT_SECRET must be set in production");
}

module.exports = env;
