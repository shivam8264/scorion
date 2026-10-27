/** Express application (exported separately from server.js so tests can import it). */
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const mongoose = require("mongoose");
const env = require("./config/env");
const { notFound, errorHandler } = require("./middleware/error.middleware");

const app = express();

app.set("trust proxy", 1);
app.use(helmet());
// CORS set up early: React dev server (5173) -> Express (5000)
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: "1mb" }));
if (env.NODE_ENV !== "test") app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    time: new Date().toISOString(),
  });
});

app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/applicants", require("./routes/applicant.routes"));
app.use("/api/decisions", require("./routes/decision.routes"));
app.use("/api/admin", require("./routes/admin.routes"));
app.use("/api/model", require("./routes/model.routes"));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
