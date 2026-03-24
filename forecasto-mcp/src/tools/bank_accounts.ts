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
      exclude_from_cashflow: z.boolean().optional().default(false).describe("Exclude this account from cashflow calculations"),
      description: z.string().optional(),
      settings: z.record(z.unknown()).optional().describe("Optional settings dict"),
    },
    async (body) => {
      const data = await getClient().post("/api/v1/bank-accounts", body);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "update_bank_account",
    "Update an existing bank account. Only include fields you want to change. You must be the account owner.",
    {
      account_id: z.string().describe("Bank account UUID"),
      name: z.string().optional().describe("Account name"),
      bank_name: z.string().optional().describe("Bank name"),
      currency: z.string().optional().describe("Currency code (e.g. EUR)"),
      credit_limit: z.number().optional().describe("Credit limit"),
      description: z.string().optional(),
      is_active: z.boolean().optional().describe("Activate or deactivate the account"),
      exclude_from_cashflow: z.boolean().optional().describe("Exclude this account from cashflow calculations"),
      settings: z.record(z.unknown()).optional().describe("Optional settings dict"),
    },
    async ({ account_id, ...body }) => {
      const payload = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
      const data = await getClient().patch(`/api/v1/bank-accounts/${account_id}`, payload);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "get_workspace_bank_account",
    "Get the primary bank account associated with a workspace.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
    },
    async ({ workspace_id }) => {
      const data = await getClient().get(`/api/v1/workspaces/${workspace_id}/bank-account`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "set_workspace_bank_account",
    "Set the primary bank account for a workspace. Also adds it to the workspace if not already associated. Only workspace owners can do this.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      account_id: z.string().describe("Bank account UUID to set as primary"),
    },
    async ({ workspace_id, account_id }) => {
      const data = await getClient().put(`/api/v1/workspaces/${workspace_id}/bank-account/${account_id}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "remove_workspace_bank_account",
    "Remove the primary bank account designation from a workspace. The bank account remains associated but is no longer the primary.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
    },
    async ({ workspace_id }) => {
      const data = await getClient().delete(`/api/v1/workspaces/${workspace_id}/bank-account`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data ?? { success: true }, null, 2) }] };
    },
  );

  server.tool(
    "list_workspace_bank_accounts",
    "List all bank accounts associated with a workspace (including non-primary ones).",
    {
      workspace_id: z.string().describe("Workspace UUID"),
    },
    async ({ workspace_id }) => {
      const data = await getClient().get(`/api/v1/workspaces/${workspace_id}/bank-accounts`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "add_workspace_bank_account",
    "Associate a bank account with a workspace (many-to-many). If it is the first account, it also becomes the primary. Only workspace owners can do this.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      account_id: z.string().describe("Bank account UUID to associate"),
    },
    async ({ workspace_id, account_id }) => {
      const data = await getClient().post(`/api/v1/workspaces/${workspace_id}/bank-accounts/${account_id}`, {});
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "remove_workspace_bank_account_link",
    "Remove a bank account association from a workspace. If it was the primary account, the primary is also cleared. Only workspace owners can do this.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      account_id: z.string().describe("Bank account UUID to disassociate"),
    },
    async ({ workspace_id, account_id }) => {
      const data = await getClient().delete(`/api/v1/workspaces/${workspace_id}/bank-accounts/${account_id}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data ?? { success: true }, null, 2) }] };
    },
  );

  server.tool(
    "get_account_balances",
    "Get balance snapshots history for a bank account in a workspace. Used for cashflow reconciliation.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      account_id: z.string().describe("Bank account UUID"),
      from_date: z.string().optional().describe("Filter from date (YYYY-MM-DD)"),
      to_date: z.string().optional().describe("Filter to date (YYYY-MM-DD)"),
    },
    async ({ workspace_id, account_id, from_date, to_date }) => {
      const data = await getClient().get(`/api/v1/workspaces/${workspace_id}/bank-accounts/${account_id}/balances`, { from_date, to_date });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "add_balance_snapshot",
    "Add or update a real balance snapshot for a bank account on a specific date. Used to reconcile cashflow projections with actual bank balance.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      account_id: z.string().describe("Bank account UUID"),
      balance_date: z.string().describe("Snapshot date (YYYY-MM-DD)"),
      balance: z.number().describe("Actual balance amount on that date"),
      note: z.string().optional().describe("Optional note"),
      source: z.string().optional().default("manual").describe("Source of the balance (default: manual)"),
    },
    async ({ workspace_id, account_id, balance_date, balance, note, source }) => {
      const data = await getClient().post(
        `/api/v1/workspaces/${workspace_id}/bank-accounts/${account_id}/balances`,
        { balance_date, balance, note, source },
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "delete_balance_snapshot",
    "Delete a specific balance snapshot. Use get_account_balances to find balance_id.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      account_id: z.string().describe("Bank account UUID"),
      balance_id: z.string().describe("Balance snapshot UUID to delete"),
    },
    async ({ workspace_id, account_id, balance_id }) => {
      const data = await getClient().delete(
        `/api/v1/workspaces/${workspace_id}/bank-accounts/${account_id}/balances/${balance_id}`,
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(data ?? { success: true }, null, 2) }] };
    },
  );
}
