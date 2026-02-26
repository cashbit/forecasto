import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ForecastoClient } from "../api/client.js";
import { registerWorkspaceTools } from "./workspaces.js";
import { registerRecordTools } from "./records.js";
import { registerCashflowTools } from "./cashflow.js";
import { registerBankAccountTools } from "./bank_accounts.js";

export function registerAllTools(
  server: McpServer,
  getClient: () => ForecastoClient,
): void {
  registerWorkspaceTools(server, getClient);
  registerRecordTools(server, getClient);
  registerCashflowTools(server, getClient);
  registerBankAccountTools(server, getClient);
}
