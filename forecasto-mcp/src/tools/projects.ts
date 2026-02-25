import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ForecastoClient } from "../api/client.js";

const PROJECT_STATUS = z.enum(["draft", "active", "won", "lost", "completed", "on_hold"]);

export function registerProjectTools(
  server: McpServer,
  getClient: () => ForecastoClient,
): void {
  server.tool(
    "list_projects",
    "List projects in a workspace. Projects track revenue and costs across financial pipeline areas.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      status: PROJECT_STATUS.optional().describe("Filter by project status"),
      customer_ref: z.string().optional().describe("Filter by customer reference"),
    },
    async ({ workspace_id, status, customer_ref }) => {
      const data = await getClient().get(`/api/v1/workspaces/${workspace_id}/projects`, {
        status,
        customer_ref,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "get_project",
    "Get details of a specific project including all its phases.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      project_id: z.string().describe("Project UUID"),
    },
    async ({ workspace_id, project_id }) => {
      const data = await getClient().get(`/api/v1/workspaces/${workspace_id}/projects/${project_id}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "create_project",
    "Create a new project to track revenue and costs. Use the project_code in records to associate financial entries with this project.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      name: z.string().describe("Project name"),
      customer_ref: z.string().optional().describe("Customer reference / name"),
      code: z.string().optional().describe("Short project code (used in records)"),
      status: PROJECT_STATUS.optional().default("active").describe("Project status"),
      expected_revenue: z.number().optional().describe("Expected total revenue"),
      expected_costs: z.number().optional().describe("Expected total costs"),
      start_date: z.string().optional().describe("Start date (YYYY-MM-DD)"),
      end_date: z.string().optional().describe("End date (YYYY-MM-DD)"),
      description: z.string().optional(),
    },
    async ({ workspace_id, ...body }) => {
      const data = await getClient().post(`/api/v1/workspaces/${workspace_id}/projects`, body);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.tool(
    "update_project",
    "Update project details or status. Only include fields you want to change.",
    {
      workspace_id: z.string().describe("Workspace UUID"),
      project_id: z.string().describe("Project UUID"),
      name: z.string().optional(),
      customer_ref: z.string().optional(),
      code: z.string().optional(),
      status: PROJECT_STATUS.optional(),
      expected_revenue: z.number().optional(),
      expected_costs: z.number().optional(),
      start_date: z.string().optional().describe("YYYY-MM-DD"),
      end_date: z.string().optional().describe("YYYY-MM-DD"),
      description: z.string().optional(),
    },
    async ({ workspace_id, project_id, ...body }) => {
      const payload = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
      const data = await getClient().patch(`/api/v1/workspaces/${workspace_id}/projects/${project_id}`, payload);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );
}
