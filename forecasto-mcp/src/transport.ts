import express, { type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { config } from "./config.js";
import { oauthProvider } from "./oauth/provider.js";
import { ForecastoClient } from "./api/client.js";
import { registerAllTools } from "./tools/index.js";

// Mutable token holder so tool calls always use the freshest token Claude sent
// on the current MCP request, not the one captured when the session was opened.
interface TokenRef {
  value: string;
}

interface SessionEntry {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
  tokenRef: TokenRef;
}

// Map of sessionId → session entry (stateful mode)
const sessions = new Map<string, SessionEntry>();

function createSessionServer(tokenRef: TokenRef): { server: McpServer; sessionId: string } {
  const sessionId = randomUUID();
  const mcpServer = new McpServer({ name: "forecasto", version: "1.0.0" });

  function getClient(): ForecastoClient {
    // Read the latest token each call — do NOT close over a string that was
    // valid only when the session was created.
    return new ForecastoClient(tokenRef.value, async () => null);
  }

  registerAllTools(mcpServer, getClient);
  return { server: mcpServer, sessionId };
}

export function createExpressApp(): express.Express {
  const app = express();
  // Trust nginx reverse proxy — required for express-rate-limit with X-Forwarded-For
  app.set("trust proxy", 1);
  app.use(express.json());

  // Health check — also verifies backend connectivity
  app.get("/health", async (_req, res) => {
    try {
      const backendRes = await fetch(`${config.forecastoApiUrl}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (backendRes.ok) {
        res.json({ status: "ok", service: "forecasto-mcp", backend: "ok" });
      } else {
        res.status(503).json({
          status: "degraded",
          service: "forecasto-mcp",
          backend: "unhealthy",
        });
      }
    } catch {
      res.status(503).json({
        status: "degraded",
        service: "forecasto-mcp",
        backend: "unreachable",
      });
    }
  });

  // -------------------------------------------------------------------------
  // MCP Auth Router — installs at root:
  //   GET  /.well-known/oauth-authorization-server
  //   GET  /.well-known/oauth-protected-resource/mcp
  //   POST /register
  //   GET  /authorize   → calls provider.authorize() → redirects to FastAPI
  //   POST /token       → calls provider.exchangeAuthorizationCode/exchangeRefreshToken
  // -------------------------------------------------------------------------
  app.use(
    mcpAuthRouter({
      provider: oauthProvider,
      issuerUrl: new URL(config.forecastoAppUrl),
      resourceServerUrl: new URL(`${config.forecastoAppUrl}/mcp`),
      scopesSupported: ["read", "write"],
      resourceName: "Forecasto",
    }),
  );

  // -------------------------------------------------------------------------
  // OAuth callback from FastAPI login form
  // FastAPI redirects here after successful login with ?code=...&state=...
  // We exchange the code, issue our own code, and redirect to Claude.
  // -------------------------------------------------------------------------
  app.get("/oauth/callback", async (req: Request, res: Response) => {
    const { code, state, error } = req.query as Record<string, string>;

    if (error) {
      res.status(400).send(`<h2>OAuth Error</h2><p>${error}</p>`);
      return;
    }

    if (!code || !state) {
      res.status(400).send("<h2>Missing parameters</h2>");
      return;
    }

    try {
      const claudeCallbackUrl = await oauthProvider.handleFastApiCallback(code, state);
      res.redirect(claudeCallbackUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).send(`<h2>Auth error</h2><p>${msg}</p>`);
    }
  });

  // -------------------------------------------------------------------------
  // MCP Streamable HTTP — requires Bearer token
  // -------------------------------------------------------------------------
  const bearerAuth = requireBearerAuth({ verifier: oauthProvider });

  app.all("/mcp", bearerAuth, async (req: Request, res: Response) => {
    const accessToken = req.auth?.token;
    if (!accessToken) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    // Case 1: Session ID present but unknown → 404
    // This signals the MCP client to re-initialize (triggers "Reconnect" button)
    if (sessionId && !sessions.has(sessionId)) {
      res.status(404).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Session not found" },
        id: null,
      });
      return;
    }

    // Case 2: Known session → refresh the per-session token with the one
    // Claude just sent (already verified by bearerAuth), then delegate.
    if (sessionId) {
      const entry = sessions.get(sessionId)!;
      entry.tokenRef.value = accessToken;
      await entry.transport.handleRequest(req, res, req.body);
      return;
    }

    // Case 3: No session ID → new session (expects InitializeRequest)
    const tokenRef: TokenRef = { value: accessToken };
    const { server: sessionServer, sessionId: newSessionId } = createSessionServer(tokenRef);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => newSessionId,
      onsessioninitialized: (sid) => {
        sessions.set(sid, { server: sessionServer, transport, tokenRef });
      },
    });

    await sessionServer.connect(transport);

    transport.onclose = () => {
      sessions.delete(newSessionId);
    };

    await transport.handleRequest(req, res, req.body);
  });

  return app;
}

/** Close all active MCP sessions (for graceful shutdown). */
export async function shutdownAllSessions(): Promise<void> {
  const entries = Array.from(sessions.values());
  await Promise.allSettled(entries.map(({ transport }) => transport.close()));
  sessions.clear();
}
