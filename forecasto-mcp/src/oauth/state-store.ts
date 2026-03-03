import { randomUUID } from "crypto";
import { readFileSync, writeFileSync, renameSync, existsSync } from "fs";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

export interface PendingAuth {
  clientState: string | undefined;
  clientRedirectUri: string;
  codeChallenge: string;
  clientId: string;
  createdAt: number;
}

export interface IssuedCode {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  codeChallenge: string;
  createdAt: number;
}

interface PersistedState {
  clients: Record<string, OAuthClientInformationFull>;
  pendingFlows: Record<string, PendingAuth>;
  pendingVerifiers: Record<string, string>;
  issuedCodes: Record<string, IssuedCode>;
}

const PENDING_FLOW_TTL = 10 * 60 * 1000; // 10 minutes
const ISSUED_CODE_TTL = 5 * 60 * 1000;   // 5 minutes

// ---------------------------------------------------------------------------
// PersistentOAuthStore — persists OAuth state to a JSON file on disk
// ---------------------------------------------------------------------------
export class PersistentOAuthStore {
  private statePath: string;
  private tmpPath: string;

  // Maps backed by disk
  readonly pendingFlows = new PersistentMap<string, PendingAuth>(this);
  readonly pendingVerifiers = new PersistentMap<string, string>(this);
  readonly issuedCodes = new PersistentMap<string, IssuedCode>(this);
  readonly clientsStore: PersistentClientsStore;

  constructor(statePath: string) {
    this.statePath = statePath;
    this.tmpPath = `${statePath}.tmp`;
    this.clientsStore = new PersistentClientsStore(this);
    this.load();

    // Periodically clean up expired entries
    setInterval(() => this.cleanup(), 60 * 60 * 1000).unref();
  }

  private load(): void {
    if (!existsSync(this.statePath)) return;
    try {
      const raw = readFileSync(this.statePath, "utf-8");
      const state = JSON.parse(raw) as PersistedState;
      for (const [k, v] of Object.entries(state.pendingFlows ?? {})) this.pendingFlows.data.set(k, v);
      for (const [k, v] of Object.entries(state.pendingVerifiers ?? {})) this.pendingVerifiers.data.set(k, v);
      for (const [k, v] of Object.entries(state.issuedCodes ?? {})) this.issuedCodes.data.set(k, v);
      for (const [k, v] of Object.entries(state.clients ?? {})) this.clientsStore.data.set(k, v);
      this.cleanup();
      console.log(`[OAuth] State loaded from ${this.statePath}`);
    } catch (err) {
      console.error(`[OAuth] Failed to load state from ${this.statePath}:`, err);
    }
  }

  save(): void {
    try {
      const state: PersistedState = {
        clients: Object.fromEntries(this.clientsStore.data),
        pendingFlows: Object.fromEntries(this.pendingFlows.data),
        pendingVerifiers: Object.fromEntries(this.pendingVerifiers.data),
        issuedCodes: Object.fromEntries(this.issuedCodes.data),
      };
      writeFileSync(this.tmpPath, JSON.stringify(state, null, 2), "utf-8");
      renameSync(this.tmpPath, this.statePath);
    } catch (err) {
      console.error(`[OAuth] Failed to save state to ${this.statePath}:`, err);
    }
  }

  private cleanup(): void {
    const now = Date.now();
    let changed = false;
    for (const [k, v] of this.pendingFlows.data) {
      if (now - v.createdAt > PENDING_FLOW_TTL) {
        this.pendingFlows.data.delete(k);
        this.pendingVerifiers.data.delete(k);
        changed = true;
      }
    }
    for (const [k, v] of this.issuedCodes.data) {
      if (now - v.createdAt > ISSUED_CODE_TTL) {
        this.issuedCodes.data.delete(k);
        changed = true;
      }
    }
    if (changed) this.save();
  }
}

// Thin wrapper around Map that triggers a save on every mutation
class PersistentMap<K, V> {
  readonly data = new Map<K, V>();
  constructor(private store: PersistentOAuthStore) {}

  get(key: K): V | undefined { return this.data.get(key); }
  has(key: K): boolean { return this.data.has(key); }

  set(key: K, value: V): void {
    this.data.set(key, value);
    this.store.save();
  }

  delete(key: K): void {
    this.data.delete(key);
    this.store.save();
  }
}

// Persistent client store implementing OAuthRegisteredClientsStore
class PersistentClientsStore implements OAuthRegisteredClientsStore {
  readonly data = new Map<string, OAuthClientInformationFull>();

  constructor(private store: PersistentOAuthStore) {}

  getClient(clientId: string): OAuthClientInformationFull | undefined {
    return this.data.get(clientId);
  }

  registerClient(
    client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">,
  ): OAuthClientInformationFull {
    const full: OAuthClientInformationFull = {
      ...client,
      client_id: randomUUID(),
      client_id_issued_at: Math.floor(Date.now() / 1000),
    };
    this.data.set(full.client_id, full);
    console.log(`[OAuth] Dynamic client registered: ${full.client_id} (${full.client_name ?? "unnamed"})`);
    this.store.save();
    return full;
  }
}
