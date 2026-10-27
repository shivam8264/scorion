/**
 * Append-only, hash-chained audit logging.
 * Each entry's hash = sha256(prevHash | sequence | action | ids | snapshot | timestamp).
 */
const crypto = require("crypto");
const AuditLog = require("../models/AuditLog");

const GENESIS = "0".repeat(64);

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value.toHexString === "function") return JSON.stringify(value.toHexString());
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

function computeHash(entry) {
  const payload = [
    entry.prevHash,
    entry.sequence,
    entry.action,
    entry.decisionId ? String(entry.decisionId) : "",
    entry.applicantId ? String(entry.applicantId) : "",
    entry.performedBy ? String(entry.performedBy) : "",
    stableStringify(entry.snapshot ?? null),
    new Date(entry.timestamp).toISOString(),
  ].join("|");
  return crypto.createHash("sha256").update(payload).digest("hex");
}

/**
 * Appends an entry. Retries on a sequence collision (two writers racing),
 * which keeps the chain linear without a global lock.
 */
async function log({ action, decisionId, applicantId, user, snapshot, modelVersion, ip }) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const last = await AuditLog.findOne().sort({ sequence: -1 }).select("sequence hash").lean();
    const entry = {
      action,
      decisionId,
      applicantId,
      performedBy: user?._id,
      performedByRole: user?.role || "system",
      snapshot: snapshot ? JSON.parse(JSON.stringify(snapshot)) : undefined,
      modelVersion,
      ip,
      sequence: (last?.sequence || 0) + 1,
      prevHash: last?.hash || GENESIS,
      timestamp: new Date(),
    };
    entry.hash = computeHash(entry);
    try {
      return await AuditLog.create(entry);
    } catch (err) {
      if (err.code !== 11000) throw err; // duplicate sequence -> retry
    }
  }
  throw new Error("Could not append audit log entry after retries");
}

/** Recomputes the whole chain and reports the first broken link, if any. */
async function verifyChain() {
  let prev = GENESIS;
  let checked = 0;
  const cursor = AuditLog.find().sort({ sequence: 1 }).lean().cursor();
  for await (const e of cursor) {
    const expected = computeHash({ ...e, prevHash: prev });
    if (e.prevHash !== prev || e.hash !== expected) {
      return { valid: false, checked, brokenAt: e.sequence, entryId: e._id };
    }
    prev = e.hash;
    checked += 1;
  }
  return { valid: true, checked };
}

module.exports = { log, verifyChain, computeHash, stableStringify, GENESIS };
