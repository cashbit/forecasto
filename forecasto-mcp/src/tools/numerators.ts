import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ForecastoClient } from "../api/client.js";

const RESET_POLICY = z
  .enum(["never", "yearly", "monthly"])
  .describe("When the counter resets: 'never', 'yearly' (Jan 1) or 'monthly' (1st of month)");

export function registerNumeratorTools(
  server: McpServer,
  getClient: () => ForecastoClient,
): void {
  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  server.tool(
    "list_numerators",
    "List the document numerators (numeratori) in a workspace — consecutive counters for documents like offerte, fatture, protocollo. Each numerator carries its formatting rules and reset policy. Call list_workspaces first to get the workspace_id.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
    },
    { title: "List Numerators", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    async ({ workspace_id }) => {
      const data = await getClient().get(`/api/v1/workspaces/${workspace_id}/numerators`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "get_numerator",
    "Get a numerator's details: rules, reset policy, current last_value and any active pending reservation.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      numerator_id: z.string().describe("Numerator UUID"),
    },
    { title: "Get Numerator", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    async ({ workspace_id, numerator_id }) => {
      const data = await getClient().get(`/api/v1/workspaces/${workspace_id}/numerators/${numerator_id}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "create_numerator",
    "Create a new document numerator. The number format is built from structured fields: [prefix][year][month][zero-padded sequence] joined by 'separator', then 'suffix'. E.g. prefix='', include_year=true, separator='/', padding=3 -> '2026/001'; prefix='INV', include_year=true, separator='-', padding=4 -> 'INV-2026-0001'. Set confirm_ttl_seconds=0 for immediate issuance (no confirm step). Owner/admin or members with the create-numerators permission.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      key: z.string().describe("Machine slug, unique per workspace, e.g. 'offerte', 'fatture', 'protocollo'"),
      name: z.string().describe("Human-readable name, e.g. 'Offerte 2026'"),
      reset_policy: RESET_POLICY.optional().default("never"),
      start_number: z.number().int().min(0).optional().default(1).describe("First number of each period (e.g. 1 or 1000)"),
      prefix: z.string().optional().describe("Static prefix, e.g. 'INV' or 'OFF'"),
      suffix: z.string().optional().describe("Static suffix appended at the end"),
      separator: z.string().optional().default("/").describe("Separator between parts (default '/')"),
      padding: z.number().int().min(1).max(12).optional().default(1).describe("Zero-padding width of the sequence number (e.g. 4 -> '0001')"),
      include_year: z.boolean().optional().default(false).describe("Include the 4-digit year in the number"),
      include_month: z.boolean().optional().default(false).describe("Include the 2-digit month in the number"),
      confirm_ttl_seconds: z.number().int().min(0).max(3600).optional().default(60).describe("Seconds a reserved number is held before auto-release. 0 = issue immediately (no confirm)."),
    },
    { title: "Create Numerator", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ workspace_id, ...body }) => {
      const data = await getClient().post(`/api/v1/workspaces/${workspace_id}/numerators`, body);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "update_numerator",
    "Update a numerator's name, rules, format fields or reset policy. Only provided fields change. A new start_number must be greater than the last issued value. Owner/admin or members with the create-numerators permission.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      numerator_id: z.string().describe("Numerator UUID"),
      name: z.string().optional(),
      reset_policy: RESET_POLICY.optional(),
      start_number: z.number().int().min(0).optional(),
      prefix: z.string().optional(),
      suffix: z.string().optional(),
      separator: z.string().optional(),
      padding: z.number().int().min(1).max(12).optional(),
      include_year: z.boolean().optional(),
      include_month: z.boolean().optional(),
      confirm_ttl_seconds: z.number().int().min(0).max(3600).optional(),
    },
    { title: "Update Numerator", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ workspace_id, numerator_id, ...body }) => {
      const data = await getClient().patch(`/api/v1/workspaces/${workspace_id}/numerators/${numerator_id}`, body);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "delete_numerator",
    "Soft-delete a numerator (its issued-number history is preserved). Owner/admin or members with the create-numerators permission.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      numerator_id: z.string().describe("Numerator UUID"),
    },
    { title: "Delete Numerator", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    async ({ workspace_id, numerator_id }) => {
      const data = await getClient().delete(`/api/v1/workspaces/${workspace_id}/numerators/${numerator_id}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  // -------------------------------------------------------------------------
  // History + peek
  // -------------------------------------------------------------------------

  server.tool(
    "get_numerator_entries",
    "List the history of numbers already issued (confirmed) by a numerator, most recent first.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      numerator_id: z.string().describe("Numerator UUID"),
      limit: z.number().int().min(1).max(500).optional().default(100),
      offset: z.number().int().min(0).optional().default(0),
    },
    { title: "Get Numerator History", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    async ({ workspace_id, numerator_id, limit, offset }) => {
      const data = await getClient().get(
        `/api/v1/workspaces/${workspace_id}/numerators/${numerator_id}/entries`,
        { limit, offset },
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "peek_numerator",
    "Preview the next number a numerator would issue WITHOUT consuming it (advisory — a concurrent reserve+confirm can move it).",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      numerator_id: z.string().describe("Numerator UUID"),
    },
    { title: "Peek Next Number", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    async ({ workspace_id, numerator_id }) => {
      const data = await getClient().get(`/api/v1/workspaces/${workspace_id}/numerators/${numerator_id}/peek`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  // -------------------------------------------------------------------------
  // Reserve / confirm / cancel
  // -------------------------------------------------------------------------

  server.tool(
    "reserve_number",
    "Request a number from a numerator. The response 'result.status' is one of:\n" +
      "- 'issued': single-phase numerator (confirm_ttl_seconds=0) — the number is already consumed (result.value/result.formatted); you are done, do NOT call confirm.\n" +
      "- 'reserved': two-phase — the number is held but NOT yet consumed. You get a 'token' and an 'expires_at'. Call confirm_number with that token before it expires to actually take the number, otherwise it is released.\n" +
      "- 'pending': another user holds a reservation right now; wait 'retry_after_seconds' and try again. (Re-reserving as the same user returns your own existing reservation.)",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      numerator_id: z.string().describe("Numerator UUID"),
    },
    { title: "Reserve Number", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ workspace_id, numerator_id }) => {
      const data = await getClient().post(
        `/api/v1/workspaces/${workspace_id}/numerators/${numerator_id}/reserve`,
        {},
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "confirm_number",
    "Confirm a previously reserved number using its token, consuming it permanently and advancing the counter. Only needed when reserve_number returned status 'reserved'. Fails (409) if the reservation expired, was already confirmed, or the period changed since reserving.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      numerator_id: z.string().describe("Numerator UUID"),
      token: z.string().describe("The reservation token returned by reserve_number"),
    },
    { title: "Confirm Number", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ workspace_id, numerator_id, token }) => {
      const data = await getClient().post(
        `/api/v1/workspaces/${workspace_id}/numerators/${numerator_id}/confirm`,
        { token },
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "cancel_number_reservation",
    "Release a reserved number before its TTL expires, so the same candidate becomes available again. Idempotent.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      numerator_id: z.string().describe("Numerator UUID"),
      token: z.string().describe("The reservation token returned by reserve_number"),
    },
    { title: "Cancel Reservation", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    async ({ workspace_id, numerator_id, token }) => {
      const data = await getClient().post(
        `/api/v1/workspaces/${workspace_id}/numerators/${numerator_id}/cancel`,
        { token },
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );
}
