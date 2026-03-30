import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ForecastoClient } from "../api/client.js";

export function registerVatRegistryTools(
  server: McpServer,
  getClient: () => ForecastoClient,
): void {
  // ── List VAT registries ──────────────────────────────────────
  server.tool(
    "list_vat_registries",
    "List all VAT registries (anagrafica partite IVA) owned by the current user.",
    {},
    { title: "List VAT Registries", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    async () => {
      const data = await getClient().get("/api/v1/vat-registries");
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  // ── Create VAT registry ─────────────────────────────────────
  server.tool(
    "create_vat_registry",
    "Create a new VAT registry entry with a name and VAT number.",
    {
      name: z.string().describe("Display name (e.g. 'TechMakers SRL')"),
      vat_number: z.string().describe("VAT number (e.g. 'IT01234567890')"),
      bank_account_id: z.string().optional().describe("UUID of the bank account for VAT settlements"),
    },
    { title: "Create VAT Registry", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async (body) => {
      const data = await getClient().post("/api/v1/vat-registries", body);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  // ── Get VAT registry with balances ──────────────────────────
  server.tool(
    "get_vat_registry",
    "Get details of a specific VAT registry including its balance entries.",
    {
      registry_id: z.string().describe("VAT registry UUID"),
    },
    { title: "Get VAT Registry", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    async ({ registry_id }) => {
      const registry = await getClient().get(`/api/v1/vat-registries/${registry_id}`);
      const balances = await getClient().get(`/api/v1/vat-registries/${registry_id}/balances`);
      const result = { ...(registry as Record<string, unknown>), balances };
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ── Add VAT balance ─────────────────────────────────────────
  server.tool(
    "add_vat_balance",
    "Add a monthly IVA balance entry to a VAT registry. " +
    "Positive amount = credit, negative = debit. " +
    "The balance determines the starting point for VAT calculation.",
    {
      registry_id: z.string().describe("VAT registry UUID"),
      month: z.string().describe("Month (YYYY-MM)"),
      amount: z.number().describe("Balance amount (positive = credit, negative = debit)"),
      note: z.string().optional().describe("Optional note"),
    },
    { title: "Add VAT Balance", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ registry_id, ...body }) => {
      const data = await getClient().post(
        `/api/v1/vat-registries/${registry_id}/balances`,
        body,
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  // ── Delete VAT balance ──────────────────────────────────────
  server.tool(
    "delete_vat_balance",
    "Delete a VAT balance entry from a registry.",
    {
      registry_id: z.string().describe("VAT registry UUID"),
      balance_id: z.string().describe("Balance entry UUID"),
    },
    { title: "Delete VAT Balance", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    async ({ registry_id, balance_id }) => {
      await getClient().delete(`/api/v1/vat-registries/${registry_id}/balances/${balance_id}`);
      return { content: [{ type: "text" as const, text: "Balance deleted successfully." }] };
    },
  );

  // ── Update VAT registry ─────────────────────────────────────
  server.tool(
    "update_vat_registry",
    "Update name or VAT number of an existing VAT registry. Only include fields you want to change.",
    {
      registry_id: z.string().describe("VAT registry UUID"),
      name: z.string().optional().describe("New display name"),
      vat_number: z.string().optional().describe("New VAT number (e.g. 'IT01234567890')"),
      bank_account_id: z.string().nullable().optional().describe("UUID of the bank account for VAT settlements (null to unlink)"),
    },
    { title: "Update VAT Registry", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ registry_id, ...body }) => {
      const payload = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
      const data = await getClient().patch(`/api/v1/vat-registries/${registry_id}`, payload);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  // ── Delete VAT registry ─────────────────────────────────────
  server.tool(
    "delete_vat_registry",
    "Delete a VAT registry and all its balance entries. This action is irreversible.",
    {
      registry_id: z.string().describe("VAT registry UUID"),
    },
    { title: "Delete VAT Registry", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    async ({ registry_id }) => {
      await getClient().delete(`/api/v1/vat-registries/${registry_id}`);
      return { content: [{ type: "text" as const, text: "VAT registry deleted successfully." }] };
    },
  );

  // ── Update VAT balance ──────────────────────────────────────
  server.tool(
    "update_vat_balance",
    "Update an existing VAT balance entry (month, amount, or note). Only include fields you want to change.",
    {
      registry_id: z.string().describe("VAT registry UUID"),
      balance_id: z.string().describe("Balance entry UUID"),
      amount: z.number().optional().describe("Balance amount (positive = credit, negative = debit)"),
      note: z.string().optional().describe("Optional note"),
    },
    { title: "Update VAT Balance", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ registry_id, balance_id, amount, note }) => {
      const payload = Object.fromEntries(Object.entries({ amount, note }).filter(([, v]) => v !== undefined));
      const data = await getClient().patch(
        `/api/v1/vat-registries/${registry_id}/balances/${balance_id}`,
        payload,
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );
}
