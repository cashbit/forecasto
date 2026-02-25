import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ForecastoClient } from "../api/client.js";

export function registerBankAccountTools(
  server: McpServer,
  getClient: () => ForecastoClient,
): void {
  server.tool(
    "list_bank_accounts",
    "List your personal bank accounts used for cashflow tracking in Forecasto.",
    {
      active_only: z.boolean().optional().default(true).describe("Return only active accounts"),
    },
    async ({ active_only }) => {
      const data = await getClient().get("/api/v1/bank-accounts", { active_only });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "create_bank_account",
    "Create a new bank account for cashflow tracking. Once created, associate it with workspaces.",
    {
      name: z.string().describe("Account name (e.g. 'Conto Corrente BNL')"),
      bank_name: z.string().optional().describe("Bank name"),
      currency: z.string().default("EUR").describe("Currency code (default: EUR)"),
      credit_limit: z.number().optional().describe("Credit limit for the account"),
      description: z.string().optional(),
    },
    async (body) => {
      const data = await getClient().post("/api/v1/bank-accounts", body);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );
}
