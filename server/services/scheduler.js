/** Scheduled jobs: nightly fairness audit over recent decisions. */
const cron = require("node-cron");
const env = require("../config/env");
const { runFairnessAudit } = require("./fairnessService");

let task;

function startScheduler() {
  if (!env.ENABLE_SCHEDULER) return null;
  if (!cron.validate(env.FAIRNESS_AUDIT_CRON)) {
    console.warn(`[scheduler] invalid FAIRNESS_AUDIT_CRON "${env.FAIRNESS_AUDIT_CRON}" - disabled`);
    return null;
  }
  task = cron.schedule(env.FAIRNESS_AUDIT_CRON, async () => {
    try {
      const doc = await runFairnessAudit({ trigger: "scheduled" });
      console.log(`[scheduler] fairness audit ${doc.status} (n=${doc.n})`);
    } catch (err) {
      console.error("[scheduler] fairness audit failed:", err.message);
    }
  });
  console.log(`[scheduler] fairness audit scheduled: ${env.FAIRNESS_AUDIT_CRON}`);
  return task;
}

function stopScheduler() {
  if (task) task.stop();
}

module.exports = { startScheduler, stopScheduler };
