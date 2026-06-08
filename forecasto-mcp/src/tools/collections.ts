import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ForecastoClient } from "../api/client.js";

const JSON_OBJECT = z.record(z.unknown());

const FILTER = z.object({
  path: z.string().describe("SQLite JSON path into the document data, e.g. '$.banca' or '$.header.iban' or '$.righe[0].importo'"),
  op: z.enum(["eq", "ne", "gt", "gte", "lt", "lte", "contains"]).default("eq").describe("Comparison operator ('contains' = SQL LIKE substring)"),
  value: z.unknown().describe("Value to compare against"),
});

export function registerCollectionTools(
  server: McpServer,
  getClient: () => ForecastoClient,
): void {
  // -------------------------------------------------------------------------
  // Collections
  // -------------------------------------------------------------------------

  server.tool(
    "list_collections",
    "List the NoSQL-like document collections in a workspace (e.g. 'Estratti conto banca X', 'Buste paga', 'Contratti'). Each collection holds arbitrary-JSON documents plus 'handler_instructions' that tell how documents of that kind are parsed. Call list_workspaces first to get the workspace_id.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      include_archived: z.boolean().optional().default(false).describe("Include archived collections (default false)"),
    },
    { title: "List Collections", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    async ({ workspace_id, include_archived }) => {
      const data = await getClient().get(`/api/v1/workspaces/${workspace_id}/collections`, {
        include_archived: include_archived ? "true" : undefined,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "get_collection",
    "Get a collection's details including its handler_instructions and extraction_schema (the contract describing how documents of this kind should be parsed).",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      collection_id: z.string().describe("Collection UUID"),
    },
    { title: "Get Collection", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    async ({ workspace_id, collection_id }) => {
      const data = await getClient().get(`/api/v1/workspaces/${workspace_id}/collections/${collection_id}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "create_collection",
    "Create a new document collection. Provide handler_instructions (free text telling how a document of this kind should be parsed and what fields it must contain) and optionally extraction_schema (a JSON Schema). Owner/admin only.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      name: z.string().describe("Human-readable name, e.g. 'Estratti conto Intesa'"),
      description: z.string().optional().describe("Optional description"),
      handler_instructions: z.string().optional().describe("Free-text instructions on how to parse documents of this kind (the LLM contract)"),
      extraction_schema: JSON_OBJECT.optional().describe("Optional JSON Schema describing the expected document structure"),
      classification_hints: JSON_OBJECT.optional().describe("Optional hints (keywords, filename patterns, doc_type) to route documents here"),
    },
    { title: "Create Collection", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ workspace_id, ...body }) => {
      const data = await getClient().post(`/api/v1/workspaces/${workspace_id}/collections`, body);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "update_collection",
    "Update a collection's name, description, handler_instructions, extraction_schema, classification_hints, or archive state. Only provided fields are changed. Owner/admin only.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      collection_id: z.string().describe("Collection UUID"),
      name: z.string().optional(),
      description: z.string().optional(),
      handler_instructions: z.string().optional(),
      extraction_schema: JSON_OBJECT.optional(),
      classification_hints: JSON_OBJECT.optional(),
      is_archived: z.boolean().optional(),
    },
    { title: "Update Collection", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ workspace_id, collection_id, ...body }) => {
      const data = await getClient().patch(`/api/v1/workspaces/${workspace_id}/collections/${collection_id}`, body);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "delete_collection",
    "Soft-delete a collection and all its documents. Owner/admin only.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      collection_id: z.string().describe("Collection UUID"),
    },
    { title: "Delete Collection", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    async ({ workspace_id, collection_id }) => {
      const data = await getClient().delete(`/api/v1/workspaces/${workspace_id}/collections/${collection_id}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  // -------------------------------------------------------------------------
  // Documents
  // -------------------------------------------------------------------------

  server.tool(
    "list_collection_documents",
    "List documents in a collection (paginated, newest first). Returns the arbitrary-JSON 'data' of each document plus metadata.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      collection_id: z.string().describe("Collection UUID"),
      limit: z.number().int().min(1).max(200).default(50).describe("Max documents per page (default 50)"),
      offset: z.number().int().min(0).default(0).describe("Pagination offset (default 0)"),
    },
    { title: "List Collection Documents", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    async ({ workspace_id, collection_id, limit, offset }) => {
      const data = await getClient().get(`/api/v1/workspaces/${workspace_id}/collections/${collection_id}/documents`, {
        limit: String(limit),
        offset: String(offset),
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "get_collection_document",
    "Get a single document's full JSON payload and metadata.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      collection_id: z.string().describe("Collection UUID"),
      document_id: z.string().describe("Document UUID"),
    },
    { title: "Get Collection Document", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    async ({ workspace_id, collection_id, document_id }) => {
      const data = await getClient().get(`/api/v1/workspaces/${workspace_id}/collections/${collection_id}/documents/${document_id}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "query_collection_documents",
    "Query documents in a collection by JSON-field predicates (filters are ANDed). Each filter targets a JSON path inside the document 'data'. Example: filter on '$.banca' eq 'Intesa'. Use this instead of listing everything when you need to find specific documents.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      collection_id: z.string().describe("Collection UUID"),
      filters: z.array(FILTER).default([]).describe("JSON-field predicates, all combined with AND"),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
    },
    { title: "Query Collection Documents", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    async ({ workspace_id, collection_id, filters, limit, offset }) => {
      const data = await getClient().post(`/api/v1/workspaces/${workspace_id}/collections/${collection_id}/documents/query`, {
        filters, limit, offset,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "create_collection_document",
    "Create a document in a collection. 'data' is the arbitrary JSON payload (e.g. a bank statement parsed into header + rows, a FatturaPA invoice as JSON, a contract, a payslip). Provide source_hash to make ingestion idempotent (re-ingesting the same file returns the existing document).",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      collection_id: z.string().describe("Collection UUID"),
      data: JSON_OBJECT.describe("The arbitrary JSON document payload"),
      title: z.string().optional().describe("Human-readable title, e.g. 'EC Marzo 2026'"),
      source_filename: z.string().optional().describe("Original filename, if any"),
      source_hash: z.string().optional().describe("SHA256 of the source file — enables dedup/idempotency"),
      document_type: z.string().optional().describe("Optional document type tag"),
    },
    { title: "Create Collection Document", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ workspace_id, collection_id, ...body }) => {
      const data = await getClient().post(`/api/v1/workspaces/${workspace_id}/collections/${collection_id}/documents`, body);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "update_collection_document",
    "Update a document's JSON payload, title, or status (active|archived). Only provided fields change. The 'data' field replaces the whole payload.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      collection_id: z.string().describe("Collection UUID"),
      document_id: z.string().describe("Document UUID"),
      data: JSON_OBJECT.optional().describe("New JSON payload (replaces the existing one)"),
      title: z.string().optional(),
      status: z.enum(["active", "archived"]).optional(),
    },
    { title: "Update Collection Document", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ workspace_id, collection_id, document_id, ...body }) => {
      const data = await getClient().patch(`/api/v1/workspaces/${workspace_id}/collections/${collection_id}/documents/${document_id}`, body);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "delete_collection_document",
    "Soft-delete a document from a collection.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      collection_id: z.string().describe("Collection UUID"),
      document_id: z.string().describe("Document UUID"),
    },
    { title: "Delete Collection Document", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    async ({ workspace_id, collection_id, document_id }) => {
      const data = await getClient().delete(`/api/v1/workspaces/${workspace_id}/collections/${collection_id}/documents/${document_id}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  // -------------------------------------------------------------------------
  // Quarantine
  // -------------------------------------------------------------------------

  server.tool(
    "quarantine_document",
    "Park a document in quarantine when you cannot confidently classify it into any existing collection. Provide a quarantine_reason explaining why. The user will later route it to a collection (or you can, with route_quarantined_document).",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      data: JSON_OBJECT.describe("The arbitrary JSON payload extracted so far (may be partial)"),
      title: z.string().optional().describe("Human-readable title"),
      quarantine_reason: z.string().describe("Why this document could not be classified"),
      document_type: z.string().optional().describe("Your best guess of the document type"),
      source_filename: z.string().optional(),
      source_hash: z.string().optional().describe("SHA256 of the source file — enables dedup"),
    },
    { title: "Quarantine Document", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ workspace_id, ...body }) => {
      const data = await getClient().post(`/api/v1/workspaces/${workspace_id}/quarantine:ingest`, body);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "list_quarantine",
    "List documents currently in quarantine (unclassified, awaiting routing to a collection).",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
    },
    { title: "List Quarantine", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    async ({ workspace_id, limit, offset }) => {
      const data = await getClient().get(`/api/v1/workspaces/${workspace_id}/quarantine`, {
        limit: String(limit),
        offset: String(offset),
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "route_quarantined_document",
    "Assign a quarantined document to a collection (clears it from quarantine and increments the collection's document count). Owner/admin only.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      document_id: z.string().describe("Quarantined document UUID"),
      collection_id: z.string().describe("Target collection UUID"),
    },
    { title: "Route Quarantined Document", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ workspace_id, document_id, collection_id }) => {
      const data = await getClient().post(`/api/v1/workspaces/${workspace_id}/quarantine/${document_id}/route`, { collection_id });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "discard_quarantined_document",
    "Discard (soft-delete) a quarantined document. Owner/admin only.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      document_id: z.string().describe("Quarantined document UUID"),
    },
    { title: "Discard Quarantined Document", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    async ({ workspace_id, document_id }) => {
      const data = await getClient().delete(`/api/v1/workspaces/${workspace_id}/quarantine/${document_id}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );
}
