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
      const data = await getClient().get("/api/v1/workspaces");
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "get_workspace",
    "Get details of a specific Forecasto workspace.",
    { workspace_id: z.string().describe("The workspace UUID") },
    async ({ workspace_id }) => {
      const data = await getClient().get(`/api/v1/workspaces/${workspace_id}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "create_workspace",
    "Create a new Forecasto workspace for a fiscal year.",
    {
      name: z.string().describe("Workspace name"),
      fiscal_year: z.number().int().optional().describe("Fiscal year (defaults to current year)"),
      description: z.string().optional().describe("Optional description"),
    },
    async ({ name, fiscal_year, description }) => {
      const data = await getClient().post("/api/v1/workspaces", { name, fiscal_year, description });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );
}
