import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ForecastoClient } from "../api/client.js";

const AREA = z.enum(["actual", "orders", "prospect", "budget"]);
const STAGE = z.enum(["0", "1"]).describe(
  "Record stage. Meaning varies by area: actual(0=da pagare,1=pagato), orders(0=in corso,1=consegnato), prospect(0=in attesa,1=accettato), budget(0=da confermare,1=confermato)",
);

// CSV column order — matches RecordResponse fields (excludes workspace_id, transfer_history, classification)
const CSV_COLUMNS = [
  "id", "area", "type", "account", "reference", "note",
  "date_cashflow", "date_offer",
  "amount", "vat", "vat_deduction", "total",
  "stage", "transaction_id", "bank_account_id", "project_code",
  "owner", "nextaction", "review_date",
  "seq_num", "version", "is_draft",
  "created_by", "updated_by", "created_at", "updated_at",
] as const;

type RecordRow = Record<string, unknown>;

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function recordsToCsv(records: RecordRow[]): string {
  if (records.length === 0) return CSV_COLUMNS.join(",") + "\n(no records)";
  const header = CSV_COLUMNS.join(",");
  const rows = records.map((r) => CSV_COLUMNS.map((col) => csvEscape(r[col])).join(","));
  return [header, ...rows].join("\n");
}

export function registerRecordTools(
  server: McpServer,
  getClient: () => ForecastoClient,
): void {
  server.tool(
    "list_records",
    "List financial records in a workspace as CSV. Filter by area, date range, text search, sign (in/out), or project code. Returns CSV with total_records count. If has_more=true, call again with increased offset to paginate. Call list_workspaces first to get the workspace_id.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      area: AREA.optional().describe("Filter by financial area"),
      date_start: z.string().optional().describe("Start date filter (YYYY-MM-DD)"),
      date_end: z.string().optional().describe("End date filter (YYYY-MM-DD)"),
      sign: z.enum(["in", "out", "all"]).optional().describe("Filter by cash flow direction"),
      text_filter: z.string().optional().describe("Text search in account, reference, note"),
      project_code: z.string().optional().describe("Filter by project code"),
      bank_account_id: z.string().optional().describe("Filter by bank account UUID"),
      limit: z.number().int().min(1).max(1000).default(200).describe("Max records per page (default 200)"),
      offset: z.number().int().min(0).default(0).describe("Pagination offset (default 0)"),
    },
    async ({ workspace_id, area, date_start, date_end, sign, text_filter, project_code, bank_account_id, limit, offset }) => {
      const data = await getClient().get(`/api/v1/workspaces/${workspace_id}/records`, {
        area, date_start, date_end, sign, text_filter, project_code, bank_account_id,
        limit: String(limit),
        offset: String(offset),
      }) as { records: RecordRow[]; total_records: number; has_more?: boolean };

      const csv = recordsToCsv(data.records ?? []);
      const meta = `total_records=${data.total_records} returned=${(data.records ?? []).length} offset=${offset} has_more=${data.has_more ?? false}`;
      return { content: [{ type: "text" as const, text: `${meta}\n\n${csv}` }] };
    },
  );

  server.tool(
    "get_record",
    "Get full details of a specific financial record (includes transfer_history and classification).",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      record_id: z.string().describe("Record UUID"),
    },
    async ({ workspace_id, record_id }) => {
      const data = await getClient().get(`/api/v1/workspaces/${workspace_id}/records/${record_id}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "create_record",
    "Create a new financial record. Areas: actual=cassa confermata, orders=ordini confermati, prospect=pipeline/preventivi, budget=pianificato. Use list_workspaces first.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      area: AREA,
      type: z.string().describe("Record type/category (e.g. 'Fattura', 'Stipendio')"),
      account: z.string().describe("Account name (counterpart name or category)"),
      reference: z.string().describe("Reference description"),
      date_cashflow: z.string().describe("Cash flow date (YYYY-MM-DD)"),
      date_offer: z.string().describe("Offer/document date (YYYY-MM-DD)"),
      amount: z.number().describe("Net amount (without VAT)"),
      vat: z.number().default(0).describe("VAT amount"),
      total: z.number().describe("Total amount (amount + vat)"),
      stage: STAGE,
      note: z.string().optional().describe("Optional note"),
      transaction_id: z.string().optional().describe("External transaction ID"),
      bank_account_id: z.string().optional().describe("Bank account UUID to associate"),
      project_code: z.string().optional().describe("Project code to associate"),
    },
    async ({ workspace_id, ...body }) => {
      const data = await getClient().post(`/api/v1/workspaces/${workspace_id}/records`, body);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "update_record",
    "Update an existing financial record. Only include fields you want to change.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      record_id: z.string().describe("Record UUID"),
      type: z.string().optional(),
      account: z.string().optional(),
      reference: z.string().optional(),
      date_cashflow: z.string().optional().describe("YYYY-MM-DD"),
      date_offer: z.string().optional().describe("YYYY-MM-DD"),
      amount: z.number().optional(),
      vat: z.number().optional(),
      total: z.number().optional(),
      stage: STAGE.optional(),
      note: z.string().optional(),
      transaction_id: z.string().optional(),
      bank_account_id: z.string().optional(),
      project_code: z.string().optional(),
    },
    async ({ workspace_id, record_id, ...body }) => {
      const payload = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
      const data = await getClient().patch(`/api/v1/workspaces/${workspace_id}/records/${record_id}`, payload);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "delete_record",
    "Soft-delete a financial record from a workspace. The record is marked as deleted but not permanently removed.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      record_id: z.string().describe("Record UUID"),
    },
    async ({ workspace_id, record_id }) => {
      const data = await getClient().delete(`/api/v1/workspaces/${workspace_id}/records/${record_id}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data ?? { success: true }, null, 2) }] };
    },
  );

  server.tool(
    "transfer_record",
    "Move a financial record from one area to another (e.g. from prospect to orders when a deal is signed, or from orders to actual when paid).",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      record_id: z.string().describe("Record UUID"),
      to_area: AREA.describe("Destination area"),
      note: z.string().optional().describe("Optional note for the transfer"),
    },
    async ({ workspace_id, record_id, to_area, note }) => {
      const data = await getClient().post(
        `/api/v1/workspaces/${workspace_id}/records/${record_id}/transfer`,
        { to_area, note },
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "export_records",
    "Export all financial records from a workspace as CSV with optional filters. Suitable for bulk analysis.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      area: AREA.optional(),
      date_start: z.string().optional().describe("Start date (YYYY-MM-DD)"),
      date_end: z.string().optional().describe("End date (YYYY-MM-DD)"),
      sign: z.enum(["in", "out", "all"]).optional(),
    },
    async ({ workspace_id, area, date_start, date_end, sign }) => {
      const data = await getClient().get(`/api/v1/workspaces/${workspace_id}/records/export`, {
        area, date_start, date_end, sign,
      }) as { records: RecordRow[] };
      const csv = recordsToCsv(data.records ?? []);
      return { content: [{ type: "text" as const, text: csv }] };
    },
  );
}
