import { config } from "./config.js";
import { createExpressApp } from "./transport.js";

const app = createExpressApp();

app.listen(config.port, "0.0.0.0", () => {
  console.log(`Forecasto MCP Server running on port ${config.port}`);
  console.log(`MCP endpoint: http://0.0.0.0:${config.port}/mcp`);
  console.log(`Health check: http://0.0.0.0:${config.port}/health`);
});
