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
    },
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
    async ({ registry_id, balance_id }) => {
      await getClient().delete(`/api/v1/vat-registries/${registry_id}/balances/${balance_id}`);
      return { content: [{ type: "text" as const, text: "Balance deleted successfully." }] };
    },
  );
}
