import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ForecastoClient } from "../api/client.js";

export function registerVatTools(
  server: McpServer,
  getClient: () => ForecastoClient,
): void {
  server.tool(
    "calculate_vat",
    "Calculate Italian periodic VAT (IVA) and create settlement records. " +
    "Aggregates IVA a debito (from sales/income records) and IVA a credito " +
    "(from purchase/expense records, weighted by vat_deduction %) across source " +
    "workspaces, then creates net IVA payment records in the target workspace. " +
    "Use dry_run=true to preview without creating records. " +
    "Records created: account='Erario', reference='IVA DA VERSARE', owner='ADMIN', nextaction='VERIFICARE'.",
    {
      vat_registry_id: z.string().describe("VAT registry UUID to calculate for"),
      period_type: z.enum(["monthly", "quarterly"]).describe("VAT settlement period"),
      end_month: z.string().optional().describe("End month (YYYY-MM), defaults to current month"),
      use_summer_extension: z.boolean().default(true)
        .describe("Quarterly only: use summer extension (Q2 deadline Sep 16 instead of Aug 16)"),
      dry_run: z.boolean().default(false)
        .describe("If true, only preview the calculation without creating records"),
    },
    async ({ dry_run, ...body }) => {
      const data = await getClient().post(
        `/api/v1/vat/calculate?dry_run=${dry_run}`,
        body,
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );
}
