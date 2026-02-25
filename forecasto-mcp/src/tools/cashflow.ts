import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ForecastoClient } from "../api/client.js";

export function registerCashflowTools(
  server: McpServer,
  getClient: () => ForecastoClient,
): void {
  server.tool(
    "get_cashflow",
    "Calculate cashflow projection for a workspace over a date range. Returns inflows, outflows, net cashflow, and running balance grouped by day/week/month. Essential for financial forecasting and planning.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      from_date: z.string().describe("Start date (YYYY-MM-DD)"),
      to_date: z.string().describe("End date (YYYY-MM-DD)"),
      areas: z
        .array(z.enum(["actual", "orders", "prospect", "budget"]))
        .optional()
        .describe("Areas to include (default: all)"),
      group_by: z
        .enum(["day", "week", "month"])
        .optional()
        .describe("Grouping period (default: month)"),
      bank_account_id: z.string().optional().describe("Filter by bank account UUID"),
    },
    async ({ workspace_id, from_date, to_date, areas, group_by, bank_account_id }) => {
      const params: Record<string, string | undefined> = {
        from_date,
        to_date,
        group_by,
        bank_account_id,
      };
      if (areas && areas.length > 0) {
        // FastAPI expects repeated query params for arrays
        const url = new URL(`/api/v1/workspaces/${workspace_id}/cashflow`, "http://x");
        for (const [k, v] of Object.entries(params)) {
          if (v) url.searchParams.set(k, v);
        }
        for (const area of areas) {
          url.searchParams.append("areas", area);
        }
        const data = await getClient().get(
          `/api/v1/workspaces/${workspace_id}/cashflow?${url.searchParams.toString()}`,
        );
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      }
      const data = await getClient().get(`/api/v1/workspaces/${workspace_id}/cashflow`, params);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "get_consolidated_cashflow",
    "Calculate consolidated cashflow across multiple workspaces. Useful for multi-entity or multi-year financial analysis.",
    {
      workspace_ids: z.array(z.string()).describe("List of workspace UUIDs to consolidate"),
      from_date: z.string().describe("Start date (YYYY-MM-DD)"),
      to_date: z.string().describe("End date (YYYY-MM-DD)"),
      group_by: z
        .enum(["day", "week", "month"])
        .optional()
        .describe("Grouping period (default: month)"),
    },
    async ({ workspace_ids, from_date, to_date, group_by }) => {
      const url = new URL("/api/v1/cashflow/consolidated", "http://x");
      url.searchParams.set("from_date", from_date);
      url.searchParams.set("to_date", to_date);
      if (group_by) url.searchParams.set("group_by", group_by);
      for (const wid of workspace_ids) {
        url.searchParams.append("workspace_ids", wid);
      }
      const data = await getClient().get(`/api/v1/cashflow/consolidated?${url.searchParams.toString()}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );
}
