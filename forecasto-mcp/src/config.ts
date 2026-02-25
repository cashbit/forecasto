import "dotenv/config";

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const config = {
  port: parseInt(process.env.PORT ?? "3100", 10),
  forecastoApiUrl: requireEnv("FORECASTO_API_URL", "http://localhost:8000"),
  forecastoAppUrl: requireEnv("FORECASTO_APP_URL", "http://localhost:8000"),
  oauth: {
    clientId: requireEnv("OAUTH_CLIENT_ID", "forecasto-mcp"),
    redirectUri: requireEnv("OAUTH_REDIRECT_URI", "http://localhost:3100/oauth/callback"),
  },
} as const;
