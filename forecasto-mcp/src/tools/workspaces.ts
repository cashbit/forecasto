import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ForecastoClient } from "../api/client.js";

export function registerWorkspaceTools(
  server: McpServer,
  getClient: () => ForecastoClient,
): void {
  server.tool(
    "list_workspaces",
    "List all Forecasto workspaces you have access to, including your role and area permissions for each.",
    {},
    async () => {
      const data = await getClient().get("/api/v1/workspaces") as { workspaces?: Record<string, unknown>[] };
      const stripped = (data.workspaces ?? []).map(ws => {
        const { sdi_supplier_mappings: _sdi, excel_column_mappings: _excel, ...cleanSettings } =
          ((ws.settings ?? {}) as Record<string, unknown>);
        return { ...ws, settings: cleanSettings };
      });
      return { content: [{ type: "text" as const, text: JSON.stringify({ ...data, workspaces: stripped }, null, 2) }] };
    },
  );

  server.tool(
    "get_workspace",
    "Get details of a specific Forecasto workspace.",
    { workspace_id: z.string().describe("The workspace UUID") },
    async ({ workspace_id }) => {
      const data = await getClient().get(`/api/v1/workspaces/${workspace_id}`) as { workspace?: Record<string, unknown> };
      if (data.workspace?.settings) {
        const { sdi_supplier_mappings: _sdi, excel_column_mappings: _excel, ...cleanSettings } =
          (data.workspace.settings as Record<string, unknown>);
        data.workspace = { ...data.workspace, settings: cleanSettings };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "create_workspace",
    "Create a new Forecasto workspace.",
    {
      name: z.string().describe("Workspace name"),
      description: z.string().optional().describe("Optional description"),
      settings: z.record(z.unknown()).optional().describe("Optional initial settings dict"),
    },
    async ({ name, description, settings }) => {
      const data = await getClient().post("/api/v1/workspaces", { name, description, settings });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "update_workspace",
    "Update workspace details such as name, description, settings, VAT registry association, or archived status. Only include fields you want to change.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      name: z.string().optional().describe("New workspace name"),
      description: z.string().optional().describe("Workspace description"),
      is_archived: z.boolean().optional().describe("Archive or unarchive the workspace"),
      vat_registry_id: z.string().nullable().optional().describe("UUID of the VAT registry to associate (null to unlink)"),
      settings: z.record(z.unknown()).optional().describe("Partial settings object to merge into workspace settings"),
    },
    async ({ workspace_id, ...body }) => {
      const payload = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
      const data = await getClient().patch(`/api/v1/workspaces/${workspace_id}`, payload);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );
}
