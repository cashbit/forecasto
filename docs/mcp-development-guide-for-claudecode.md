# MCP Server Development Guide for Claude Code

Questa guida documenta i pattern corretti, le insidie e le soluzioni per sviluppare un MCP server con autenticazione OAuth 2.0 usando `@modelcontextprotocol/sdk`. È basata sull'esperienza reale del progetto `forecasto-mcp` e raccoglie tutti gli errori incontrati e le loro correzioni.

---

## Indice

1. [Stack e dipendenze](#1-stack-e-dipendenze)
2. [Struttura del progetto](#2-struttura-del-progetto)
3. [Configurazione Express e transport](#3-configurazione-express-e-transport)
4. [OAuth: il Third-Party Authorization Flow](#4-oauth-il-third-party-authorization-flow)
5. [Implementare OAuthServerProvider](#5-implementare-oauthserverprovider)
6. [verifyAccessToken: il campo expiresAt è obbligatorio](#6-verifyaccesstoken-il-campo-expiresat-è-obbligatorio)
7. [requireBearerAuth: come funziona il middleware](#7-requirebearerauth-come-funziona-il-middleware)
8. [mcpAuthRouter: parametri critici](#8-mcpauthrouter-parametri-critici)
9. [Dynamic Client Registration](#9-dynamic-client-registration)
10. [Gestione sessioni (stateful mode)](#10-gestione-sessioni-stateful-mode)
11. [Implementare i tool MCP](#11-implementare-i-tool-mcp)
12. [Client HTTP verso il backend](#12-client-http-verso-il-backend)
13. [Deploy: nginx + systemd](#13-deploy-nginx--systemd)
14. [Insidie comuni e soluzioni](#14-insidie-comuni-e-soluzioni)
15. [Checklist pre-deploy](#15-checklist-pre-deploy)

---

## 1. Stack e dipendenze

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.x",
    "express": "^4",
    "dotenv": "^16",
    "zod": "^3"
  },
  "devDependencies": {
    "@types/express": "^4",
    "@types/node": "^20",
    "typescript": "^5"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

**tsconfig.json** — usa ES modules:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true
  },
  "include": ["src/**/*"]
}
```

> **Nota**: Con `NodeNext` gli import devono avere estensione `.js` anche per file `.ts`:
> ```typescript
> import { config } from "./config.js"; // ✅ corretto
> import { config } from "./config";    // ❌ errore runtime
> ```

---

## 2. Struttura del progetto

```
my-mcp-server/
├── src/
│   ├── index.ts           # Entry point: avvia Express
│   ├── config.ts          # Variabili d'ambiente tipizzate
│   ├── transport.ts       # Express app + routing MCP + OAuth
│   ├── oauth/
│   │   ├── provider.ts    # OAuthServerProvider implementation
│   │   └── pkce.ts        # Utilities PKCE (generateCodeVerifier, generateCodeChallenge)
│   ├── api/
│   │   └── client.ts      # HTTP client verso il backend API
│   └── tools/
│       ├── index.ts        # registerAllTools()
│       └── *.ts            # Tool modules
├── package.json
├── tsconfig.json
├── .env.example
└── .gitignore             # IMPORTANTE: includere node_modules/ e dist/
```

---

## 3. Configurazione Express e transport

```typescript
// transport.ts
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { oauthProvider } from "./oauth/provider.js";

const sessions = new Map<string, { server: McpServer; transport: StreamableHTTPServerTransport }>();

export function createExpressApp(): express.Express {
  const app = express();

  // ⚠️ CRITICO se dietro nginx: necessario per express-rate-limit
  // Senza questo, lancia ERR_ERL_UNEXPECTED_X_FORWARDED_FOR e il POST /token fallisce
  app.set("trust proxy", 1);

  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  // Monta gli endpoint OAuth (discovery, register, authorize, token)
  app.use(mcpAuthRouter({
    provider: oauthProvider,
    issuerUrl: new URL(config.appUrl),          // es. https://app.example.com
    resourceServerUrl: new URL(`${config.appUrl}/mcp`), // ⚠️ DEVE puntare a /mcp
    scopesSupported: ["read", "write"],
    resourceName: "My Service",
  }));

  // Callback dal provider OAuth di terze parti
  app.get("/oauth/callback", async (req, res) => {
    const { code, state, error } = req.query as Record<string, string>;
    if (error) { res.status(400).send(`Error: ${error}`); return; }
    try {
      const redirectUrl = await oauthProvider.handleProviderCallback(code, state);
      res.redirect(redirectUrl);
    } catch (err) {
      res.status(400).send(`Auth error: ${err instanceof Error ? err.message : err}`);
    }
  });

  // Endpoint MCP protetto da Bearer token
  const bearerAuth = requireBearerAuth({ verifier: oauthProvider });

  app.all("/mcp", bearerAuth, async (req, res) => {
    const accessToken = req.auth?.token;
    if (!accessToken) { res.status(401).json({ error: "Unauthorized" }); return; }

    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let sessionEntry = sessionId ? sessions.get(sessionId) : undefined;

    if (!sessionEntry) {
      const newSessionId = randomUUID();
      const server = new McpServer({ name: "my-server", version: "1.0.0" });
      registerAllTools(server, () => new MyApiClient(accessToken));

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
        onsessioninitialized: (sid) => sessions.set(sid, { server, transport }),
      });

      await server.connect(transport);
      sessionEntry = { server, transport };
      transport.onclose = () => sessions.delete(newSessionId);
    }

    await sessionEntry.transport.handleRequest(req, res, req.body);
  });

  return app;
}
```

---

## 4. OAuth: il Third-Party Authorization Flow

Quando il backend usa già OAuth (es. FastAPI, Django, Rails), il MCP server implementa il **Third-Party Authorization Flow**:

```
Claude → GET /authorize (MCP)
    → MCP genera PKCE proprio → redirige a Backend /oauth/authorize
    → Utente fa login sul Backend
    → Backend → redirect a /oauth/callback (MCP)
    → MCP scambia il codice Backend → ottiene token Backend
    → MCP emette il proprio codice → redirige a Claude
    → Claude → POST /token (MCP) con il codice MCP
    → MCP ritorna i token Backend a Claude
    → Claude → POST /mcp con Bearer token Backend
    → MCP verifica il token chiamando Backend /users/me
```

Il punto chiave è che il MCP server funge da **proxy OAuth**:
- Verso Claude: è un Authorization Server
- Verso il Backend: è un OAuth Client

---

## 5. Implementare OAuthServerProvider

```typescript
// oauth/provider.ts
import { randomUUID } from "crypto";
import type { Response } from "express";
import type { OAuthServerProvider, AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { OAuthClientInformationFull, OAuthTokens, OAuthTokenRevocationRequest } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { generateCodeVerifier, generateCodeChallenge } from "./pkce.js";

interface PendingAuth {
  clientState: string | undefined;
  clientRedirectUri: string;
  codeChallenge: string;
  clientId: string;
  createdAt: number;
}

interface IssuedCode {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  codeChallenge: string;
  createdAt: number;
}

// Store in-memory per i client registrati dinamicamente
class InMemoryClientsStore implements OAuthRegisteredClientsStore {
  private clients = new Map<string, OAuthClientInformationFull>();

  getClient(clientId: string) { return this.clients.get(clientId); }

  registerClient(client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">) {
    const full: OAuthClientInformationFull = {
      ...client,
      client_id: randomUUID(),
      client_id_issued_at: Math.floor(Date.now() / 1000),
    };
    this.clients.set(full.client_id, full);
    return full;
  }
}

export class MyOAuthProvider implements OAuthServerProvider {
  readonly clientsStore: OAuthRegisteredClientsStore = new InMemoryClientsStore();

  // ⚠️ CRITICO: impostare a true quando si delega il PKCE al backend
  readonly skipLocalPkceValidation = true;

  private pendingFlows = new Map<string, PendingAuth>();
  private pendingVerifiers = new Map<string, string>();
  private issuedCodes = new Map<string, IssuedCode>();

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    // Genera PKCE per la leg verso il backend
    const backendState = randomUUID();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    this.pendingFlows.set(backendState, {
      clientState: params.state,
      clientRedirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      clientId: client.client_id,
      createdAt: Date.now(),
    });
    this.pendingVerifiers.set(backendState, codeVerifier);

    const query = new URLSearchParams({
      client_id: "my-mcp-client",
      redirect_uri: config.oauth.redirectUri,
      response_type: "code",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state: backendState,
      scope: (params.scopes ?? ["read", "write"]).join(" "),
    });

    res.redirect(`${config.backendUrl}/oauth/authorize?${query}`);
  }

  async handleProviderCallback(code: string, state: string): Promise<string> {
    const pending = this.pendingFlows.get(state);
    if (!pending) throw new Error("State not found or expired");
    this.pendingFlows.delete(state);

    const codeVerifier = this.pendingVerifiers.get(state)!;
    this.pendingVerifiers.delete(state);

    // Scambia il codice del backend per token
    const tokenRes = await fetch(`${config.backendUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: "my-mcp-client",
        redirect_uri: config.oauth.redirectUri,
        code_verifier: codeVerifier,
      }).toString(),
    });

    if (!tokenRes.ok) throw new Error(`Token exchange failed: ${tokenRes.status}`);
    const tokenData = await tokenRes.json() as { access_token: string; refresh_token: string; expires_in: number };

    // Emette il proprio codice per Claude
    const mcpCode = randomUUID();
    this.issuedCodes.set(mcpCode, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresIn: tokenData.expires_in,
      codeChallenge: pending.codeChallenge,
      createdAt: Date.now(),
    });

    const params = new URLSearchParams({ code: mcpCode });
    if (pending.clientState) params.set("state", pending.clientState);
    return `${pending.clientRedirectUri}?${params}`;
  }

  async exchangeAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<OAuthTokens> {
    const issued = this.issuedCodes.get(authorizationCode);
    if (!issued) throw new Error("Authorization code not found");
    this.issuedCodes.delete(authorizationCode); // single-use

    return {
      access_token: issued.accessToken,
      token_type: "bearer",
      refresh_token: issued.refreshToken,
      expires_in: issued.expiresIn,
    };
  }

  async exchangeRefreshToken(
    _client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
  ): Promise<OAuthTokens> {
    const res = await fetch(`${config.backendUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        ...(scopes?.length ? { scope: scopes.join(" ") } : {}),
      }).toString(),
    });

    if (!res.ok) throw new Error(`Refresh failed: ${res.status}`);
    const data = await res.json() as { access_token: string; refresh_token?: string; expires_in?: number };

    return {
      access_token: data.access_token,
      token_type: "bearer",
      ...(data.refresh_token ? { refresh_token: data.refresh_token } : {}),
      ...(data.expires_in ? { expires_in: data.expires_in } : {}),
    };
  }

  // ⚠️ VEDI SEZIONE 6 — expiresAt è OBBLIGATORIO
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const res = await fetch(`${config.backendUrl}/api/v1/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error(`Invalid token (${res.status})`);
    const user = await res.json() as { id: string; email: string };

    // Decodifica JWT per estrarre exp (senza verificare la firma)
    let expiresAt = Math.floor(Date.now() / 1000) + 3600; // fallback
    try {
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()) as { exp?: number };
      if (typeof payload.exp === "number") expiresAt = payload.exp;
    } catch { /* usa il fallback */ }

    return {
      token,
      clientId: "my-mcp-client",
      scopes: ["read", "write"],
      expiresAt,  // ⚠️ OBBLIGATORIO — senza questo requireBearerAuth rifiuta tutti i token
      extra: { userId: user.id, email: user.email },
    };
  }

  async revokeToken(_client: OAuthClientInformationFull, _request: OAuthTokenRevocationRequest): Promise<void> {
    // no-op: i token scadono naturalmente
  }
}

export const oauthProvider = new MyOAuthProvider();
```

---

## 6. verifyAccessToken: il campo `expiresAt` è obbligatorio

**Questo è il bug più subdolo e frequente.**

`requireBearerAuth` controlla esplicitamente `authInfo.expiresAt`:

```typescript
// Dal codice SDK (bearerAuth.js)
if (typeof authInfo.expiresAt !== 'number' || isNaN(authInfo.expiresAt)) {
  throw new InvalidTokenError('Token has no expiration time');
}
```

Se `verifyAccessToken` ritorna un `AuthInfo` senza `expiresAt`, il middleware rifiuta **ogni** token con errore `401`, anche se il token è perfettamente valido. L'errore che vede l'utente è:

> "Your account was authorized but the integration rejected the credentials"

**Soluzione**: estrarre `exp` dal payload JWT o usare un fallback.

```typescript
// ✅ CORRETTO
async verifyAccessToken(token: string): Promise<AuthInfo> {
  // ... verifica token ...

  let expiresAt = Math.floor(Date.now() / 1000) + 3600; // fallback: 1h
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString()
    ) as { exp?: number };
    if (typeof payload.exp === "number") expiresAt = payload.exp;
  } catch { /* usa fallback */ }

  return { token, clientId: "...", scopes: [...], expiresAt }; // ✅
}

// ❌ SBAGLIATO — causa "Token has no expiration time"
async verifyAccessToken(token: string): Promise<AuthInfo> {
  return { token, clientId: "...", scopes: [...] }; // manca expiresAt!
}
```

---

## 7. `requireBearerAuth`: come funziona il middleware

`requireBearerAuth` è il guard dell'endpoint `/mcp`. Il suo flusso è:

1. Legge `Authorization: Bearer <token>` dall'header
2. Chiama `provider.verifyAccessToken(token)`
3. Controlla che `authInfo.expiresAt` sia un numero valido e non scaduto
4. Se tutto ok: popola `req.auth` e chiama `next()`
5. Se fallisce: risponde con `401` e header `WWW-Authenticate`

Quando Claude riceve un `401` da `/mcp`, interpreta i token come non validi e tenta il refresh — creando un loop se il problema non è il token ma il codice del provider.

**Debug**: se vedi in FastAPI un loop di `POST /oauth/token` + `GET /users/me` 200, il token è valido ma il middleware lo rifiuta per un altro motivo (es. `expiresAt` mancante).

---

## 8. `mcpAuthRouter`: parametri critici

```typescript
app.use(mcpAuthRouter({
  provider: oauthProvider,

  // URL base del server (issuer OAuth)
  issuerUrl: new URL("https://app.example.com"),

  // ⚠️ CRITICO: deve puntare all'URL dell'endpoint /mcp
  // Il SDK monta /.well-known/oauth-protected-resource/mcp (con il path di resourceServerUrl)
  // Se omesso o = issuerUrl, il resource metadata punta alla root e Claude non sa dove mandare le richieste
  resourceServerUrl: new URL("https://app.example.com/mcp"),

  scopesSupported: ["read", "write"],
  resourceName: "My Service",   // Nome visualizzato a Claude
}));
```

**Cosa installa `mcpAuthRouter`**:
- `GET /.well-known/oauth-authorization-server` — discovery RFC 8414
- `GET /.well-known/oauth-protected-resource/mcp` — resource metadata
- `POST /register` — Dynamic Client Registration (RFC 7591)
- `GET /authorize` → chiama `provider.authorize()`
- `POST /token` → chiama `provider.exchangeAuthorizationCode()` o `exchangeRefreshToken()`
- `POST /revoke` → chiama `provider.revokeToken()`

---

## 9. Dynamic Client Registration

Claude usa il Dynamic Client Registration (RFC 7591) per registrarsi automaticamente prima di fare il primo `/authorize`. L'SDK gestisce questo automaticamente tramite il `clientsStore`.

**Implementazione minima**:

```typescript
class InMemoryClientsStore implements OAuthRegisteredClientsStore {
  private clients = new Map<string, OAuthClientInformationFull>();

  getClient(clientId: string) {
    return this.clients.get(clientId);
  }

  registerClient(client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">) {
    const full: OAuthClientInformationFull = {
      ...client,
      client_id: randomUUID(),
      client_id_issued_at: Math.floor(Date.now() / 1000),
    };
    this.clients.set(full.client_id, full);
    return full;
  }
}
```

> **Attenzione**: lo store è in-memory. Se il server viene riavviato, Claude dovrà ri-registrarsi. Questo è ok per la maggior parte dei casi d'uso; per produzione si può persistere su DB.

---

## 10. Gestione sessioni (stateful mode)

Il transport `StreamableHTTPServerTransport` supporta sia modalità stateless che stateful. Per la maggior parte dei casi d'uso, la modalità **stateful** è preferibile perché mantiene il contesto tra le chiamate tool.

```typescript
const sessions = new Map<string, { server: McpServer; transport: StreamableHTTPServerTransport }>();

app.all("/mcp", bearerAuth, async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let sessionEntry = sessionId ? sessions.get(sessionId) : undefined;

  if (!sessionEntry) {
    // Nuova sessione: crea McpServer + Transport
    const newSessionId = randomUUID();
    const server = new McpServer({ name: "my-server", version: "1.0.0" });

    // Passa il token al client API per questa sessione
    registerAllTools(server, () => new MyApiClient(req.auth!.token));

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => newSessionId,
      onsessioninitialized: (sid) => sessions.set(sid, { server, transport }),
    });

    await server.connect(transport);
    sessionEntry = { server, transport };

    // Cleanup alla chiusura della sessione
    transport.onclose = () => sessions.delete(newSessionId);
  }

  await sessionEntry.transport.handleRequest(req, res, req.body);
});
```

---

## 11. Implementare i tool MCP

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerMyTools(server: McpServer, getClient: () => MyApiClient): void {
  // Tool semplice
  server.tool(
    "list_items",                          // nome (snake_case)
    "Descrizione chiara per Claude",       // descrizione — impatta la qualità delle chiamate
    {
      // Schema input con zod + descrizioni
      filter: z.string().optional().describe("Testo per filtrare i risultati"),
      limit:  z.number().int().min(1).max(100).default(20).describe("Numero massimo di risultati"),
    },
    async ({ filter, limit }) => {
      const data = await getClient().get("/api/v1/items", { filter, limit });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    },
  );

  // Tool con path params
  server.tool(
    "get_item",
    "Get details of a specific item by ID.",
    { item_id: z.string().describe("The item UUID") },
    async ({ item_id }) => {
      const data = await getClient().get(`/api/v1/items/${item_id}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );

  // Tool con body POST
  server.tool(
    "create_item",
    "Create a new item.",
    {
      name:        z.string().describe("Item name"),
      description: z.string().optional(),
      amount:      z.number().describe("Amount in EUR"),
    },
    async (body) => {
      const data = await getClient().post("/api/v1/items", body);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    },
  );
}
```

**Best practices per i tool**:
- Nomi in `snake_case`
- Descrizioni chiare e contestuali (Claude le usa per decidere quale tool invocare)
- Aggiungere `.describe()` a ogni campo dello schema
- Ritornare sempre `{ content: [{ type: "text", text: ... }] }`
- Il `text` deve essere stringa — usare `JSON.stringify(data, null, 2)` per oggetti

---

## 12. Client HTTP verso il backend

```typescript
// api/client.ts
export class MyApiClient {
  constructor(private accessToken: string) {}

  private async request(method: string, path: string, body?: unknown, params?: Record<string, string | number | boolean | undefined>): Promise<unknown> {
    const url = new URL(`${config.backendUrl}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== "") {
          url.searchParams.set(k, String(v));
        }
      }
    }

    const res = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as Record<string, unknown>;
      throw new Error(`${method} ${path} → ${res.status}: ${err.detail ?? err.error ?? "unknown error"}`);
    }

    if (res.status === 204) return null;
    return res.json();
  }

  get(path: string, params?: Record<string, string | number | boolean | undefined>) {
    return this.request("GET", path, undefined, params);
  }
  post(path: string, body?: unknown)          { return this.request("POST", path, body); }
  patch(path: string, body: unknown)          { return this.request("PATCH", path, body); }
  delete(path: string)                        { return this.request("DELETE", path); }
}
```

---

## 13. Deploy: nginx + systemd

### systemd service

```ini
# /etc/systemd/system/my-mcp.service
[Unit]
Description=My MCP Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/app/my-mcp
ExecStart=/usr/bin/node /app/my-mcp/dist/index.js
Restart=always
RestartSec=5
EnvironmentFile=/app/my-mcp/.env

[Install]
WantedBy=multi-user.target
```

### nginx

```nginx
# ⚠️ Ordine importante: ^~ batte la semplice corrispondenza per prefisso

# 1. Discovery OAuth — Claude controlla questi per primi
location /.well-known/oauth-authorization-server {
    proxy_pass http://127.0.0.1:3100/.well-known/oauth-authorization-server;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}

location ^~ /.well-known/oauth-protected-resource {
    proxy_pass http://127.0.0.1:3100/.well-known/oauth-protected-resource;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}

# 2. Endpoint OAuth root-level
location = /authorize { proxy_pass http://127.0.0.1:3100/authorize; ... }
location = /token     { proxy_pass http://127.0.0.1:3100/token; ... }
location = /register  { proxy_pass http://127.0.0.1:3100/register; ... }

# 3. Endpoint MCP
location /mcp {
    proxy_pass http://127.0.0.1:3100/mcp;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_read_timeout 3600s;
    proxy_buffering off;        # ⚠️ necessario per SSE/streaming
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}

# 4. ⚠️ Se /oauth/ è usato anche dal backend, usa ^~ per priorità
# Il ^~ fa sì che /oauth/callback vada all'MCP invece che al backend
location ^~ /oauth/callback {
    proxy_pass http://127.0.0.1:3100/oauth/callback;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}

# 5. Il resto di /oauth/ va al backend
location /oauth/ {
    proxy_pass http://127.0.0.1:8000/oauth/;
    ...
}
```

---

## 14. Insidie comuni e soluzioni

### ❌ `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`

**Causa**: `express-rate-limit` (usato internamente da `mcpAuthRouter`) lancia errore se Express non sa di essere dietro un proxy e vede `X-Forwarded-For`.

**Soluzione**: aggiungere **prima** di `mcpAuthRouter`:
```typescript
app.set("trust proxy", 1);
```

---

### ❌ "Token has no expiration time" / Claude in loop di refresh

**Causa**: `verifyAccessToken` ritorna `AuthInfo` senza `expiresAt`.

**Soluzione**: estrarre `exp` dal JWT o usare fallback:
```typescript
let expiresAt = Math.floor(Date.now() / 1000) + 3600;
try {
  const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()) as { exp?: number };
  if (typeof payload.exp === "number") expiresAt = payload.exp;
} catch {}
return { ..., expiresAt };
```

---

### ❌ `/.well-known/oauth-protected-resource` ritorna 404 o punta alla root

**Causa**: `resourceServerUrl` non passato a `mcpAuthRouter`, quindi il SDK usa l'`issuerUrl` (root `/`).

L'SDK monta il resource metadata a `/.well-known/oauth-protected-resource{path}` dove `path` è il pathname di `resourceServerUrl`. Se `resourceServerUrl` è la root, il path è vuoto e l'endpoint diventa `/.well-known/oauth-protected-resource`.

**Soluzione**:
```typescript
mcpAuthRouter({
  resourceServerUrl: new URL(`${config.appUrl}/mcp`), // → /.well-known/oauth-protected-resource/mcp
})
```
E nel nginx, assicurarsi che il prefisso `/.well-known/oauth-protected-resource` sia routato con `^~` all'MCP server (il prefix match con `^~` preserva il path, incluso `/mcp`).

---

### ❌ `/oauth/callback` va al backend invece che all'MCP

**Causa**: nginx ha `location /oauth/` che cattura anche `/oauth/callback`.

**Soluzione**: aggiungere prima (più in alto nel config) con `^~`:
```nginx
location ^~ /oauth/callback { proxy_pass http://127.0.0.1:3100/oauth/callback; ... }
location /oauth/             { proxy_pass http://127.0.0.1:8000/oauth/; ... }
```

---

### ❌ `node_modules/` committato in git

**Soluzione**: creare `.gitignore` prima del primo `git add`:
```
node_modules/
dist/
.env
```

---

### ❌ "State not found or expired" dopo restart del server

**Causa**: lo store in-memory (`pendingFlows`, `issuedCodes`) viene svuotato a ogni restart. Se il server viene riavviato tra l'inizio del flusso OAuth e il callback, lo state è perso.

**Soluzione per produzione**: non riavviare il server durante un flusso OAuth attivo, oppure persistere lo state su Redis/DB. In development, usare `--no-reload` o evitare hot-reload durante il test OAuth.

---

### ❌ Import senza estensione `.js` con NodeNext

**Causa**: con `moduleResolution: NodeNext`, Node.js richiede estensioni esplicite.

```typescript
// ❌ Errore: "Cannot find module './config'"
import { config } from "./config";

// ✅ Corretto (anche se il file è config.ts)
import { config } from "./config.js";
```

---

## 15. Checklist pre-deploy

- [ ] `app.set("trust proxy", 1)` aggiunto **prima** di `mcpAuthRouter`
- [ ] `verifyAccessToken` ritorna `AuthInfo` con `expiresAt` (numero unix seconds)
- [ ] `resourceServerUrl` in `mcpAuthRouter` punta a `${APP_URL}/mcp`
- [ ] Endpoint `/users/me` (o equivalente) del backend verificato e raggiungibile
- [ ] nginx: `location ^~ /oauth/callback` prima di `location /oauth/`
- [ ] nginx: `proxy_buffering off` sull'endpoint `/mcp` (per SSE/streaming)
- [ ] nginx: `proxy_read_timeout 3600s` su `/mcp`
- [ ] `.gitignore` con `node_modules/` e `dist/`
- [ ] Variabili d'ambiente in `.env` (o `EnvironmentFile` in systemd)
- [ ] `skipLocalPkceValidation = true` nel provider (quando PKCE è gestito dal backend)
- [ ] Tool: ogni campo ha `.describe()` nello schema zod
- [ ] Tool: response sempre `{ content: [{ type: "text", text: "..." }] }`

---

## Variabili d'ambiente tipiche

```bash
# .env.example
PORT=3100
BACKEND_API_URL=http://localhost:8000       # URL interno backend (senza SSL se stesso server)
APP_URL=https://app.example.com            # URL pubblico (con HTTPS) — usato per OAuth
OAUTH_CLIENT_ID=my-mcp-client
OAUTH_REDIRECT_URI=https://app.example.com/oauth/callback
```

---

## Utility PKCE

```typescript
// oauth/pkce.ts
import { createHash, randomBytes } from "crypto";

export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}
```
