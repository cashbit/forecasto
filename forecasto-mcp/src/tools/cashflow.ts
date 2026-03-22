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
      stages: z.array(z.enum(["0", "1"])).optional()
        .describe("Filter by stage (0 or 1). Applies across all areas."),
      area_stage: z.array(z.string()).optional()
        .describe("Combined area:stage filters (e.g. ['actual:0', 'orders:1']). Overrides stages per area."),
      sign_filter: z.enum(["in", "out", "all"]).optional()
        .describe("Filter by cash flow direction"),
      group_by: z
        .enum(["day", "week", "month"])
        .optional()
        .describe("Grouping period (default: day)"),
      bank_account_id: z.string().optional().describe("Filter by bank account UUID"),
    },
    async ({ workspace_id, from_date, to_date, areas, stages, area_stage, sign_filter, group_by, bank_account_id }) => {
      const url = new URL(`/api/v1/workspaces/${workspace_id}/cashflow`, "http://x");
      url.searchParams.set("from_date", from_date);
      url.searchParams.set("to_date", to_date);
      if (group_by) url.searchParams.set("group_by", group_by);
      if (bank_account_id) url.searchParams.set("bank_account_id", bank_account_id);
      if (sign_filter) url.searchParams.set("sign_filter", sign_filter);
      if (areas) for (const a of areas) url.searchParams.append("areas", a);
      if (stages) for (const s of stages) url.searchParams.append("stages", s);
      if (area_stage) for (const as_ of area_stage) url.searchParams.append("area_stage", as_);
      const data = await getClient().get(
        `/api/v1/workspaces/${workspace_id}/cashflow?${url.searchParams.toString()}`,
      );
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

  server.tool(
    "get_cashflow_vat_simulation",
    "Calculate VAT (IVA) simulation for cashflow overlay. Returns projected IVA payments " +
    "grouped by P.IVA, period, and area. Uses VatRegistry balances as starting points. " +
    "One series per distinct P.IVA found across the given workspaces.",
    {
      workspace_ids: z.array(z.string()).describe("Workspace UUIDs to include"),
      from_date: z.string().describe("Start date (YYYY-MM-DD)"),
      to_date: z.string().describe("End date (YYYY-MM-DD)"),
      period_type: z.enum(["monthly", "quarterly"]).default("monthly")
        .describe("VAT settlement period"),
      use_summer_extension: z.boolean().default(true)
        .describe("Quarterly: use summer extension (Q2 Sep 16 vs Aug 16)"),
      area_stage: z.array(z.string()).optional()
        .describe("Combined area:stage filters (e.g. ['actual:0', 'orders:1'])"),
    },
    async ({ workspace_ids, from_date, to_date, period_type, use_summer_extension, area_stage }) => {
      const url = new URL("/api/v1/cashflow/vat-simulation", "http://x");
      url.searchParams.set("from_date", from_date);
      url.searchParams.set("to_date", to_date);
      url.searchParams.set("period_type", period_type);
      url.searchParams.set("use_summer_extension", String(use_summer_extension));
      for (const wid of workspace_ids) {
        url.searchParams.append("workspace_ids", wid);
      }
      if (area_stage) for (const as_ of area_stage) url.searchParams.append("area_stage", as_);
      const data = await getClient().get(`/api/v1/cashflow/vat-simulation?${url.searchParams.toString()}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );
}
