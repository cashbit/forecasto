interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix ms
}

interface PendingAuth {
  state: string;
  codeVerifier: string;
  sessionId: string;
  resolveToken: (token: TokenSet | null) => void;
}

/**
 * In-memory store for OAuth tokens keyed by MCP session ID,
 * and pending auth flows keyed by state parameter.
 */
class TokenStore {
  private tokens = new Map<string, TokenSet>();
  private pending = new Map<string, PendingAuth>(); // state → pending auth

  set(sessionId: string, tokens: TokenSet): void {
    this.tokens.set(sessionId, tokens);
  }

  get(sessionId: string): TokenSet | undefined {
    return this.tokens.get(sessionId);
  }

  delete(sessionId: string): void {
    this.tokens.delete(sessionId);
  }

  needsRefresh(sessionId: string): boolean {
    const t = this.tokens.get(sessionId);
    if (!t) return true;
    // Refresh if within 5 minutes of expiry
    return Date.now() >= t.expiresAt - 5 * 60 * 1000;
  }

  updateAccessToken(sessionId: string, accessToken: string, expiresIn: number): void {
    const existing = this.tokens.get(sessionId);
    if (existing) {
      existing.accessToken = accessToken;
      existing.expiresAt = Date.now() + expiresIn * 1000;
    }
  }

  // --- Pending auth flows ---

  registerPending(state: string, auth: PendingAuth): void {
    this.pending.set(state, auth);
  }

  getPending(state: string): PendingAuth | undefined {
    return this.pending.get(state);
  }

  deletePending(state: string): void {
    this.pending.delete(state);
  }
}

export const tokenStore = new TokenStore();
export type { TokenSet, PendingAuth };
