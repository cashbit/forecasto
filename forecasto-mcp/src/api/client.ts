import { config } from "../config.js";

export class ForecastoApiError extends Error {
  constructor(
    public status: number,
    public errorCode: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "ForecastoApiError";
  }
}

type RefreshCallback = () => Promise<string | null>;

export class ForecastoClient {
  private accessToken: string;
  private onRefresh: RefreshCallback | null;

  constructor(accessToken: string, onRefresh: RefreshCallback | null = null) {
    this.accessToken = accessToken;
    this.onRefresh = onRefresh;
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string | number | boolean | undefined>,
    retry = true,
  ): Promise<unknown> {
    const url = new URL(`${config.forecastoApiUrl}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== "") {
          url.searchParams.set(k, String(v));
        }
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
    };

    const res = await fetch(url.toString(), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401 && retry && this.onRefresh) {
      const newToken = await this.onRefresh();
      if (newToken) {
        this.accessToken = newToken;
        return this.request(method, path, body, params, false);
      }
    }

    if (!res.ok) {
      let errorBody: Record<string, unknown> = {};
      try {
        errorBody = (await res.json()) as Record<string, unknown>;
      } catch {
        // ignore JSON parse failure
      }
      throw new ForecastoApiError(
        res.status,
        errorBody.error_code as string | undefined,
        (errorBody.error as string) ?? `HTTP ${res.status}`,
      );
    }

    if (res.status === 204) return null;
    return res.json();
  }

  async get(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<unknown> {
    return this.request("GET", path, undefined, params);
  }

  async post(path: string, body?: unknown): Promise<unknown> {
    return this.request("POST", path, body);
  }

  async patch(path: string, body: unknown): Promise<unknown> {
    return this.request("PATCH", path, body);
  }

  async delete(path: string): Promise<unknown> {
    return this.request("DELETE", path);
  }
}
