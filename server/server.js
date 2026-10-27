const app = require("./app");
const env = require("./config/env");
const { connectDB, disconnectDB } = require("./config/db");
const { startScheduler, stopScheduler } = require("./services/scheduler");

async function start() {
  await connectDB();
  const server = app.listen(env.PORT, () => {
    console.log(`[server] API listening on http://localhost:${env.PORT} (ML: ${env.ML_SERVICE_URL})`);
  });
  startScheduler();

  const shutdown = async (signal) => {
    console.log(`[server] ${signal} received, shutting down`);
    stopScheduler();
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start().catch((err) => {
  console.error("[server] failed to start:", err.message);
  process.exit(1);
});
