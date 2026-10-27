/**
 * Model Insights - proxies the offline reports produced by the training
 * pipeline (comparison, evaluation, SHAP, training history) and exposes a
 * what-if simulator that scores WITHOUT persisting anything.
 */
const ml = require("../services/mlService");

const REPORTS = {
  comparison: "comparison",
  evaluation: "evaluation",
  explainability: "explainability",
  training: "training",
  "public-validation": "public-validation",
};

// Reports change only when the model is retrained, so cache them briefly.
const cache = new Map();
const TTL_MS = 5 * 60 * 1000;

async function cached(key, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  const data = await loader();
  cache.set(key, { at: Date.now(), data });
  return data;
}

async function info(_req, res) {
  res.json(await cached("info", ml.modelInfo));
}

async function report(req, res) {
  const name = REPORTS[req.params.name];
  if (!name) return res.status(404).json({ error: "Unknown report" });
  res.json(await cached(name, () => ml.modelReport(name)));
}

async function health(_req, res) {
  res.json(await ml.health());
}

/** POST /api/model/simulate - what-if analysis: score + explanation, nothing stored. */
async function simulate(req, res) {
  const [pred, expl] = await Promise.all([ml.predict(req.body), ml.explain(req.body)]);
  res.json({ prediction: pred, explanation: expl });
}

function clearCache() {
  cache.clear();
}

module.exports = { info, report, health, simulate, clearCache };
