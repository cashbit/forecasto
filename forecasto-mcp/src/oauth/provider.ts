import { randomUUID } from "crypto";
import type { Response } from "express";
import { generateCodeVerifier, generateCodeChallenge } from "./pkce.js";
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
  OAuthTokenRevocationRequest,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { config } from "../config.js";

// ---------------------------------------------------------------------------
// Pending auth flows — keyed by the state we generate for the FastAPI flow
// ---------------------------------------------------------------------------
interface PendingAuth {
  /** The state that Claude sent us (we forward it back to Claude at the end) */
  clientState: string | undefined;
  /** Claude's redirect URI — we redirect here with our own code at the end */
  clientRedirectUri: string;
  /** The code_challenge Claude sent us (we store it for verifyAccessToken) */
  codeChallenge: string;
  /** The MCP client that initiated the flow */
  clientId: string;
  /** Timestamp for expiry cleanup */
  createdAt: number;
}

/** Our own authorization codes — keyed by code, value = tokens from FastAPI */
interface IssuedCode {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  codeChallenge: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// In-memory client store with Dynamic Registration support
// ---------------------------------------------------------------------------
class InMemoryClientsStore implements OAuthRegisteredClientsStore {
  private clients = new Map<string, OAuthClientInformationFull>();

  getClient(clientId: string): OAuthClientInformationFull | undefined {
    return this.clients.get(clientId);
  }

  registerClient(
    client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">,
  ): OAuthClientInformationFull {
    const full: OAuthClientInformationFull = {
      ...client,
      client_id: randomUUID(),
      client_id_issued_at: Math.floor(Date.now() / 1000),
    };
    this.clients.set(full.client_id, full);
    console.log(`[OAuth] Dynamic client registered: ${full.client_id} (${full.client_name ?? "unnamed"})`);
    return full;
  }
}

// ---------------------------------------------------------------------------
// ForecastoOAuthProvider — delegates auth to FastAPI (Third-Party Auth Flow)
// ---------------------------------------------------------------------------
export class ForecastoOAuthProvider implements OAuthServerProvider {
  readonly clientsStore: OAuthRegisteredClientsStore = new InMemoryClientsStore();
  readonly skipLocalPkceValidation = true;

  // Pending FastAPI OAuth flows: fastapi_state → PendingAuth
  private pendingFlows = new Map<string, PendingAuth>();
  // Code verifiers for the FastAPI leg: fastapi_state → codeVerifier
  private pendingVerifiers = new Map<string, string>();
  // Our issued codes: mcp_code → IssuedCode
  private issuedCodes = new Map<string, IssuedCode>();

  /**
   * Called by mcpAuthRouter when Claude hits GET /authorize.
   * We redirect to FastAPI login, preserving our own state.
   */
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    // Generate PKCE for the FastAPI leg of the flow
    const fastapiState = randomUUID();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    this.pendingFlows.set(fastapiState, {
      clientState: params.state,
      clientRedirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      clientId: client.client_id,
      createdAt: Date.now(),
    });
    this.pendingVerifiers.set(fastapiState, codeVerifier);

    const query = new URLSearchParams({
      client_id: "forecasto-mcp",
      redirect_uri: config.oauth.redirectUri, // our own callback URL
      response_type: "code",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state: fastapiState,
      scope: (params.scopes ?? ["read", "write"]).join(" "),
    });

    res.redirect(`${config.forecastoAppUrl}/oauth/authorize?${query.toString()}`);
  }

  /**
   * Called by FastAPI after user logs in → FastAPI redirects to our /oauth/callback.
   * We exchange the FastAPI code for tokens, issue our own code, redirect to Claude.
   */
  async handleFastApiCallback(
    fastapiCode: string,
    fastapiState: string,
  ): Promise<string> {
    const pending = this.pendingFlows.get(fastapiState);
    if (!pending) throw new Error("State not found or expired");
    this.pendingFlows.delete(fastapiState);

    const codeVerifier = this.pendingVerifiers.get(fastapiState);
    if (!codeVerifier) throw new Error("Code verifier not found");
    this.pendingVerifiers.delete(fastapiState);

    // Exchange FastAPI code for tokens
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: fastapiCode,
      client_id: "forecasto-mcp",
      redirect_uri: config.oauth.redirectUri,
      code_verifier: codeVerifier,
    });

    const tokenRes = await fetch(`${config.forecastoApiUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!tokenRes.ok) {
      const err = (await tokenRes.json().catch(() => ({}))) as Record<string, string>;
      throw new Error(err.error_description ?? err.error ?? `Token exchange failed: ${tokenRes.status}`);
    }

    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    // Issue our own code that Claude will exchange
    const mcpCode = randomUUID();
    this.issuedCodes.set(mcpCode, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresIn: tokenData.expires_in,
      codeChallenge: pending.codeChallenge,
      createdAt: Date.now(),
    });

    // Build redirect URL to Claude's callback
    const callbackParams = new URLSearchParams({ code: mcpCode });
    if (pending.clientState) callbackParams.set("state", pending.clientState);

    return `${pending.clientRedirectUri}?${callbackParams.toString()}`;
  }

  /**
   * Returns the code_challenge for a given auth code.
   * skipLocalPkceValidation=true means this won't be called by the SDK.
   */
  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const issued = this.issuedCodes.get(authorizationCode);
    if (!issued) throw new Error("Authorization code not found");
    return issued.codeChallenge;
  }

  /**
   * Called by mcpAuthRouter when Claude hits POST /token with code.
   * We look up our issued code and return the FastAPI tokens.
   */
  async exchangeAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    _redirectUri?: string,
  ): Promise<OAuthTokens> {
    const issued = this.issuedCodes.get(authorizationCode);
    if (!issued) throw new Error("Authorization code not found or already used");

    // Single-use
    this.issuedCodes.delete(authorizationCode);

    return {
      access_token: issued.accessToken,
      token_type: "bearer",
      refresh_token: issued.refreshToken,
      expires_in: issued.expiresIn,
    };
  }

  /**
   * Called by mcpAuthRouter when Claude hits POST /token with refresh_token.
   */
  async exchangeRefreshToken(
    _client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
  ): Promise<OAuthTokens> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    if (scopes?.length) body.set("scope", scopes.join(" "));

    const res = await fetch(`${config.forecastoApiUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as Record<string, string>;
      throw new Error(err.error_description ?? err.error ?? `Refresh failed: ${res.status}`);
    }

    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    return {
      access_token: data.access_token,
      token_type: "bearer",
      ...(data.refresh_token ? { refresh_token: data.refresh_token } : {}),
      ...(data.expires_in ? { expires_in: data.expires_in } : {}),
    };
  }

  /**
   * Verify Bearer token by calling FastAPI /api/v1/users/me.
   * Used by requireBearerAuth middleware on /mcp.
   */
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const res = await fetch(`${config.forecastoApiUrl}/api/v1/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`Invalid or expired token (${res.status})`);
    }

    const user = (await res.json()) as { id: string; email: string };

    // Decode JWT payload (without verifying signature) to extract expiry
    let expiresAt: number = Math.floor(Date.now() / 1000) + 3600; // fallback: 1h from now
    try {
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()) as { exp?: number };
      if (typeof payload.exp === "number") expiresAt = payload.exp;
    } catch {
      // ignore decode errors, use fallback
    }

    return {
      token,
      clientId: "forecasto-mcp",
      scopes: ["read", "write"],
      expiresAt,
      extra: { userId: user.id, email: user.email },
    };
  }

  async revokeToken(
    _client: OAuthClientInformationFull,
    _request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    // No-op: tokens expire naturally
  }
}

// Singleton
export const oauthProvider = new ForecastoOAuthProvider();
