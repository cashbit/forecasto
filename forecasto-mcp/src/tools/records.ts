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
  "amount", "vat", "vat_deduction", "vat_month", "total", "withholding_rate", "withholding_amount",
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
      text_filter_field: z.enum(["account", "reference", "note", "owner", "transaction_id"]).optional().describe("Limit text search to a specific field (default: all fields)"),
      project_code: z.string().optional().describe("Filter by project code"),
      bank_account_id: z.string().optional().describe("Filter by bank account UUID"),
      include_deleted: z.boolean().optional().default(false).describe("Include soft-deleted records (default false)"),
      limit: z.number().int().min(1).max(1000).default(200).describe("Max records per page (default 200)"),
      offset: z.number().int().min(0).default(0).describe("Pagination offset (default 0)"),
    },
    { title: "List Records", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    async ({ workspace_id, area, date_start, date_end, sign, text_filter, text_filter_field, project_code, bank_account_id, include_deleted, limit, offset }) => {
      const data = await getClient().get(`/api/v1/workspaces/${workspace_id}/records`, {
        area, date_start, date_end, sign, text_filter, text_filter_field, project_code, bank_account_id,
        include_deleted: include_deleted ? "true" : undefined,
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
    { title: "Get Record", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
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
      owner: z.string().optional().describe("Owner (uppercase, e.g. 'CARLO')"),
      nextaction: z.string().optional().describe("Next action description"),
      review_date: z.string().optional().describe("Review date (YYYY-MM-DD)"),
      vat_month: z.string().optional().describe("VAT month (YYYY-MM). Defaults to month of date_cashflow if not set"),
      vat_deduction: z.number().min(0).max(100).default(100).describe("IVA deducibile % (default 100). Use <100 for partially deductible expenses."),
      withholding_rate: z.number().min(0).max(100).optional().describe("Ritenuta d'acconto % (e.g. 20 for professionals). Withholding amount is calculated as |amount| * rate / 100."),
      classification: z.record(z.unknown()).optional().describe("Optional JSON classification dict"),
    },
    { title: "Create Record", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
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
      owner: z.string().optional(),
      nextaction: z.string().optional(),
      review_date: z.string().optional().describe("YYYY-MM-DD"),
      vat_month: z.string().optional().describe("VAT month (YYYY-MM)"),
      vat_deduction: z.number().min(0).max(100).optional().describe("IVA deducibile %"),
      withholding_rate: z.number().min(0).max(100).optional().nullable().describe("Ritenuta d'acconto % (null to clear)"),
      classification: z.record(z.unknown()).optional().describe("Optional JSON classification dict"),
    },
    { title: "Update Record", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
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
    { title: "Delete Record", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
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
    { title: "Transfer Record", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
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
    { title: "Export Records", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    async ({ workspace_id, area, date_start, date_end, sign }) => {
      const data = await getClient().get(`/api/v1/workspaces/${workspace_id}/records/export`, {
        area, date_start, date_end, sign,
      }) as { records: RecordRow[] };
      const csv = recordsToCsv(data.records ?? []);
      return { content: [{ type: "text" as const, text: csv }] };
    },
  );

  server.tool(
    "restore_record",
    "Restore a soft-deleted financial record. Use get_record with the record UUID to find deleted records.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      record_id: z.string().describe("Record UUID to restore"),
    },
    { title: "Restore Record", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ workspace_id, record_id }) => {
      const data = await getClient().post(`/api/v1/workspaces/${workspace_id}/records/${record_id}/restore`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "bulk_create_records",
    "Bulk import multiple financial records at once. Faster than calling create_record in a loop. Returns import results with success count and any errors.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      records: z.array(z.object({
        area: AREA,
        type: z.string().describe("Record type/category"),
        account: z.string().describe("Account/counterpart name"),
        reference: z.string().describe("Reference description"),
        date_cashflow: z.string().describe("Cash flow date (YYYY-MM-DD)"),
        date_offer: z.string().describe("Offer/document date (YYYY-MM-DD)"),
        amount: z.number().describe("Net amount (without VAT)"),
        vat: z.number().default(0).describe("VAT amount"),
        total: z.number().describe("Total amount (amount + vat)"),
        stage: STAGE,
        note: z.string().optional(),
        transaction_id: z.string().optional(),
        bank_account_id: z.string().optional(),
        project_code: z.string().optional(),
        owner: z.string().optional(),
        nextaction: z.string().optional(),
        review_date: z.string().optional().describe("YYYY-MM-DD"),
        vat_month: z.string().optional().describe("VAT month (YYYY-MM)"),
        vat_deduction: z.number().min(0).max(100).optional().describe("IVA deducibile % (default 100)"),
        withholding_rate: z.number().min(0).max(100).optional().describe("Ritenuta d'acconto %"),
        classification: z.record(z.unknown()).optional(),
      })).describe("Array of records to create"),
    },
    { title: "Bulk Create Records", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ workspace_id, records }) => {
      const data = await getClient().post(`/api/v1/workspaces/${workspace_id}/records/bulk-import`, records);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "get_field_values",
    "Get distinct values for a specific field across records in a workspace. Useful for autocomplete before creating/updating records (e.g. know existing account names, project codes, owners).",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      field: z.enum(["account", "reference", "project_code", "owner", "nextaction"]).describe("Field to get distinct values for"),
      area: AREA.optional().describe("Filter by area"),
      sign: z.enum(["in", "out"]).optional().describe("Filter by cash flow direction"),
      q: z.string().optional().describe("Search string for autocomplete filtering"),
      limit: z.number().int().min(1).max(100).optional().default(20).describe("Max results (default 20)"),
      account_filter: z.string().optional().describe("Filter reference values by specific account name"),
    },
    { title: "Get Field Values", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    async ({ workspace_id, field, area, sign, q, limit, account_filter }) => {
      const data = await getClient().get(`/api/v1/workspaces/${workspace_id}/records/field-values`, {
        field, area, sign, q, limit: limit !== undefined ? String(limit) : undefined, account_filter,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "clone_record",
    "Clone a financial record N times, shifting the date by a fixed interval each time. Useful for recurring entries (e.g. monthly invoices). Returns the list of newly created records.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      record_id: z.string().describe("UUID of the record to clone"),
      count: z.number().int().min(1).max(60).default(2).describe("Number of copies to create (default 2)"),
      interval_value: z.number().int().min(1).default(1).describe("Interval quantity (default 1)"),
      interval_unit: z.enum(["days", "weeks", "months"]).default("months").describe("Interval unit (default months)"),
      next_action: z.string().optional().describe("Override next_action on all clones"),
      review_date_offset_days: z.number().int().optional().describe("If set, review_date = date_cashflow + N days"),
    },
    { title: "Clone Record", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ workspace_id, record_id, count, interval_value, interval_unit, next_action, review_date_offset_days }) => {
      const original = await getClient().get(`/api/v1/workspaces/${workspace_id}/records/${record_id}`) as RecordRow;

      function shiftDate(dateStr: string, n: number): string {
        const d = new Date(dateStr + "T00:00:00Z");
        if (interval_unit === "days") d.setUTCDate(d.getUTCDate() + n * interval_value);
        else if (interval_unit === "weeks") d.setUTCDate(d.getUTCDate() + n * interval_value * 7);
        else {
          const targetMonth = d.getUTCMonth() + n * interval_value;
          const year = d.getUTCFullYear() + Math.floor(targetMonth / 12);
          const month = ((targetMonth % 12) + 12) % 12;
          const day = Math.min(d.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
          return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
        }
        return d.toISOString().slice(0, 10);
      }

      const created = [];
      for (let i = 1; i <= count; i++) {
        const newDateCashflow = shiftDate(original.date_cashflow as string, i);
        const newDateOffer = shiftDate(original.date_offer as string, i);
        const reviewDate = review_date_offset_days !== undefined
          ? shiftDate(newDateCashflow, 0).slice(0, 10) // will recalc below
          : original.review_date;

        const payload: RecordRow = {
          area: original.area,
          type: original.type,
          account: original.account,
          reference: original.reference,
          note: original.note,
          date_cashflow: newDateCashflow,
          date_offer: newDateOffer,
          amount: original.amount,
          vat: original.vat,
          vat_deduction: original.vat_deduction,
          withholding_rate: original.withholding_rate,
          total: original.total,
          stage: original.stage,
          project_code: original.project_code,
          owner: original.owner,
          vat_month: original.vat_month,
          nextaction: next_action !== undefined ? next_action : original.nextaction,
          review_date: review_date_offset_days !== undefined
            ? (() => {
                const d = new Date(newDateCashflow + "T00:00:00Z");
                d.setUTCDate(d.getUTCDate() + review_date_offset_days);
                return d.toISOString().slice(0, 10);
              })()
            : reviewDate,
        };

        const rec = await getClient().post(`/api/v1/workspaces/${workspace_id}/records`, payload);
        created.push(rec);
      }

      return { content: [{ type: "text" as const, text: JSON.stringify({ created_count: created.length, records: created }, null, 2) }] };
    },
  );

  server.tool(
    "split_record",
    "Split a financial record into multiple installments with proportional amounts. The original record is deleted and replaced by the installments. Percentages must sum to 100.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      record_id: z.string().describe("UUID of the record to split"),
      installments: z.array(z.object({
        date: z.string().describe("Date for this installment (YYYY-MM-DD)"),
        split_percent: z.number().min(0.01).max(100).describe("Percentage of original amount (0-100)"),
      })).min(2).max(24).describe("Installments definition. Percentages must sum to 100."),
    },
    { title: "Split Record", readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    async ({ workspace_id, record_id, installments }) => {
      const totalPct = installments.reduce((s, i) => s + i.split_percent, 0);
      if (totalPct < 99 || totalPct > 101) {
        throw new Error(`Installment percentages must sum to 100, got ${totalPct.toFixed(2)}`);
      }

      const original = await getClient().get(`/api/v1/workspaces/${workspace_id}/records/${record_id}`) as RecordRow;
      const origAmount = Number(original.amount);
      const origTotal = Number(original.total);
      const tot = installments.length;

      const created: RecordRow[] = [];
      for (let i = 0; i < installments.length; i++) {
        const inst = installments[i];
        const isLast = i === tot - 1;

        // Use proportional amounts; last installment gets the remainder to avoid rounding issues
        const newAmount = isLast
          ? origAmount - created.reduce((s, r) => s + Number(r.amount), 0)
          : Math.round(origAmount * (inst.split_percent / 100) * 100) / 100;
        const newTotal = isLast
          ? origTotal - created.reduce((s, r) => s + Number(r.total), 0)
          : Math.round(origTotal * (inst.split_percent / 100) * 100) / 100;
        const newVat = Math.round((newTotal - newAmount) * 100) / 100;

        const payload: RecordRow = {
          area: original.area,
          type: original.type,
          account: original.account,
          reference: original.reference as string,
          transaction_id: `(${i + 1}/${tot})${original.transaction_id ? ' ' + original.transaction_id : ''}`,
          note: original.note,
          date_cashflow: inst.date,
          date_offer: original.date_offer,
          amount: newAmount,
          vat: newVat,
          vat_deduction: original.vat_deduction,
          withholding_rate: original.withholding_rate,
          total: newTotal,
          stage: original.stage,
          project_code: original.project_code,
          owner: original.owner,
          nextaction: original.nextaction,
          review_date: original.review_date,
          vat_month: original.vat_month,
        };

        const rec = await getClient().post(`/api/v1/workspaces/${workspace_id}/records`, payload) as RecordRow;
        created.push(rec);
      }

      await getClient().delete(`/api/v1/workspaces/${workspace_id}/records/${record_id}`);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ created_count: created.length, deleted_record_id: record_id, records: created }, null, 2),
        }],
      };
    },
  );
}
