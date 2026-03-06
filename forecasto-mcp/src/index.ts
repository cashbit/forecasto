import { config } from "./config.js";
import { createExpressApp, shutdownAllSessions } from "./transport.js";

const app = createExpressApp();

const httpServer = app.listen(config.port, "0.0.0.0", () => {
  console.log(`Forecasto MCP Server running on port ${config.port}`);
  console.log(`MCP endpoint: http://0.0.0.0:${config.port}/mcp`);
  console.log(`Health check: http://0.0.0.0:${config.port}/health`);
});

let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`${signal} received. Starting graceful shutdown...`);

  // 1. Stop accepting new connections
  httpServer.close(() => {
    console.log("HTTP server closed.");
  });

  // 2. Close all active MCP sessions
  try {
    await shutdownAllSessions();
    console.log("All MCP sessions closed.");
  } catch (err) {
    console.error("Error closing sessions:", err);
  }

  // 3. Grace period for in-flight responses, then exit
  setTimeout(() => {
    console.log("Grace period expired. Exiting.");
    process.exit(0);
  }, 5000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
