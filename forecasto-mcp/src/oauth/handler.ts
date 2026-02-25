import type { Request, Response } from "express";
import { config } from "../config.js";
import { tokenStore } from "./store.js";

const SUCCESS_HTML = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <title>Connessione riuscita</title>
  <style>
    body { font-family: -apple-system, sans-serif; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; background: #f5f5f5; }
    .card { background: white; border-radius: 12px; padding: 40px; text-align: center;
            max-width: 360px; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h2 { color: #1a1a2e; margin-bottom: 8px; }
    p { color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✅</div>
    <h2>Connessione riuscita</h2>
    <p>Forecasto è ora connesso a Claude.<br>Puoi chiudere questa finestra.</p>
  </div>
</body>
</html>`;

const ERROR_HTML = (msg: string) => `<!DOCTYPE html>
<html lang="it">
<head><meta charset="utf-8"><title>Errore</title></head>
<body style="font-family:sans-serif;padding:40px">
  <h2>Errore durante l'autenticazione</h2>
  <p>${msg}</p>
</body>
</html>`;

export async function oauthCallbackHandler(req: Request, res: Response): Promise<void> {
  const { code, state, error } = req.query as Record<string, string>;

  if (error) {
    res.status(400).send(ERROR_HTML(`OAuth error: ${error}`));
    return;
  }

  if (!code || !state) {
    res.status(400).send(ERROR_HTML("Parametri mancanti nella risposta OAuth."));
    return;
  }

  const pending = tokenStore.getPending(state);
  if (!pending) {
    res.status(400).send(ERROR_HTML("State non valido o sessione scaduta."));
    return;
  }

  tokenStore.deletePending(state);

  // Exchange code for tokens
  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.oauth.redirectUri,
      client_id: config.oauth.clientId,
      code_verifier: pending.codeVerifier,
    });

    const tokenRes = await fetch(`${config.forecastoAppUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!tokenRes.ok) {
      const errBody = (await tokenRes.json()) as Record<string, string>;
      res.status(400).send(ERROR_HTML(`Token exchange fallito: ${errBody.error_description ?? errBody.error}`));
      pending.resolveToken(null);
      return;
    }

    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    const tokenSet = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
    };

    tokenStore.set(pending.sessionId, tokenSet);
    pending.resolveToken(tokenSet);

    res.send(SUCCESS_HTML);
  } catch (err) {
    res.status(500).send(ERROR_HTML("Errore interno durante lo scambio del token."));
    pending.resolveToken(null);
  }
}
