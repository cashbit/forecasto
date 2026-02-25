"""OAuth 2.0 Authorization Server endpoints for MCP server authentication.

Implements Authorization Code Flow with PKCE (RFC 7636).
Endpoints are mounted at /oauth (no /api/v1 prefix, per OAuth convention).
"""

from __future__ import annotations

from typing import Annotated, Optional
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Form, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from forecasto.config import settings
from forecasto.database import get_db
from forecasto.exceptions import UnauthorizedException, ValidationException
from forecasto.schemas.oauth import OAuthMetadata, TokenRequest, TokenResponse
from forecasto.services.auth_service import AuthService
from forecasto.services.oauth_service import OAuthService

router = APIRouter()


def _base_url(request: Request) -> str:
    """Return the scheme+host of the current request (e.g. https://app.forecasto.it)."""
    return str(request.base_url).rstrip("/")


# ---------------------------------------------------------------------------
# Discovery endpoint (required by MCP spec / RFC 8414)
# ---------------------------------------------------------------------------

@router.get("/.well-known/oauth-authorization-server", response_model=OAuthMetadata)
async def oauth_metadata(request: Request):
    """OAuth 2.0 Authorization Server Metadata (RFC 8414).

    Claude's MCP client reads this to discover authorization + token endpoints.
    """
    base = _base_url(request)
    return OAuthMetadata(
        issuer=base,
        authorization_endpoint=f"{base}/oauth/authorize",
        token_endpoint=f"{base}/oauth/token",
    )


# ---------------------------------------------------------------------------
# Authorization endpoint
# ---------------------------------------------------------------------------

_LOGIN_HTML = """\
<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Accedi a Forecasto</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #f5f5f5; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; }}
    .card {{ background: white; border-radius: 12px; padding: 40px;
             width: 100%; max-width: 400px; box-shadow: 0 4px 24px rgba(0,0,0,.08); }}
    .logo {{ text-align: center; margin-bottom: 28px; }}
    .logo span {{ font-size: 22px; font-weight: 700; color: #1a1a2e; }}
    .logo small {{ display: block; color: #666; font-size: 13px; margin-top: 4px; }}
    label {{ display: block; font-size: 14px; font-weight: 500; color: #333;
             margin-bottom: 6px; }}
    input[type=email], input[type=password] {{
      width: 100%; padding: 10px 14px; border: 1px solid #ddd;
      border-radius: 8px; font-size: 15px; margin-bottom: 18px;
      outline: none; transition: border-color .2s;
    }}
    input:focus {{ border-color: #6366f1; }}
    button {{ width: 100%; padding: 12px; background: #6366f1; color: white;
              border: none; border-radius: 8px; font-size: 15px; font-weight: 600;
              cursor: pointer; }}
    button:hover {{ background: #4f46e5; }}
    .error {{ background: #fee2e2; color: #b91c1c; padding: 10px 14px;
              border-radius: 8px; font-size: 14px; margin-bottom: 18px; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <span>Forecasto</span>
      <small>Connetti il tuo account a {client_name}</small>
    </div>
    {error_html}
    <form method="post" action="/oauth/authorize">
      <input type="hidden" name="client_id" value="{client_id}">
      <input type="hidden" name="redirect_uri" value="{redirect_uri}">
      <input type="hidden" name="state" value="{state}">
      <input type="hidden" name="scope" value="{scope}">
      <input type="hidden" name="code_challenge" value="{code_challenge}">
      <input type="hidden" name="code_challenge_method" value="{code_challenge_method}">
      <label for="email">Email</label>
      <input type="email" id="email" name="email" placeholder="email@esempio.it"
             value="{prefill_email}" required autofocus>
      <label for="password">Password</label>
      <input type="password" id="password" name="password"
             placeholder="La tua password" required>
      <button type="submit">Accedi e autorizza</button>
    </form>
  </div>
</body>
</html>
"""


@router.get("/authorize", response_class=HTMLResponse)
async def authorize_get(
    request: Request,
    client_id: str = Query(...),
    redirect_uri: str = Query(...),
    response_type: str = Query("code"),
    scope: str = Query("read write"),
    state: str = Query(""),
    code_challenge: Optional[str] = Query(None),
    code_challenge_method: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Show the Forecasto login form to authorize the OAuth client."""
    oauth = OAuthService(db)
    try:
        client = await oauth.validate_client_redirect(client_id, redirect_uri)
    except (ValidationException, Exception):
        return HTMLResponse(
            "<h3>Richiesta non valida: client_id o redirect_uri non registrati.</h3>",
            status_code=400,
        )

    html = _LOGIN_HTML.format(
        client_name=client.name,
        client_id=client_id,
        redirect_uri=redirect_uri,
        state=state,
        scope=scope,
        code_challenge=code_challenge or "",
        code_challenge_method=code_challenge_method or "",
        error_html="",
        prefill_email="",
    )
    return HTMLResponse(html)


@router.post("/authorize")
async def authorize_post(
    request: Request,
    client_id: str = Form(...),
    redirect_uri: str = Form(...),
    state: str = Form(""),
    scope: str = Form("read write"),
    code_challenge: str = Form(""),
    code_challenge_method: str = Form(""),
    email: str = Form(...),
    password: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    """Process login form, issue auth code, redirect back to client."""
    oauth = OAuthService(db)

    # Validate client/redirect first
    try:
        client = await oauth.validate_client_redirect(client_id, redirect_uri)
    except (ValidationException, Exception):
        return HTMLResponse("<h3>client_id o redirect_uri non validi.</h3>", status_code=400)

    # Authenticate user
    try:
        user = await oauth.authenticate_user(email, password)
    except UnauthorizedException as e:
        # Re-show form with error
        html = _LOGIN_HTML.format(
            client_name=client.name,
            client_id=client_id,
            redirect_uri=redirect_uri,
            state=state,
            scope=scope,
            code_challenge=code_challenge,
            code_challenge_method=code_challenge_method,
            error_html=f'<div class="error">{e.message}</div>',
            prefill_email=email,
        )
        return HTMLResponse(html, status_code=401)

    # Issue authorization code
    auth_code = await oauth.create_authorization_code(
        user_id=user.id,
        client_id=client_id,
        redirect_uri=redirect_uri,
        scope=scope,
        code_challenge=code_challenge or None,
        code_challenge_method=code_challenge_method or None,
    )

    # Redirect back to client with code + state
    params = {"code": auth_code}
    if state:
        params["state"] = state
    redirect_url = f"{redirect_uri}?{urlencode(params)}"
    return RedirectResponse(redirect_url, status_code=302)


# ---------------------------------------------------------------------------
# Token endpoint
# ---------------------------------------------------------------------------

@router.post("/token")
async def token(
    grant_type: str = Form(...),
    code: Optional[str] = Form(None),
    redirect_uri: Optional[str] = Form(None),
    client_id: Optional[str] = Form(None),
    code_verifier: Optional[str] = Form(None),
    refresh_token: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
):
    """Exchange authorization code or refresh token for access + refresh tokens."""
    if grant_type == "authorization_code":
        if not all([code, redirect_uri, client_id]):
            return JSONResponse(
                {"error": "invalid_request", "error_description": "code, redirect_uri, client_id required"},
                status_code=400,
            )
        oauth = OAuthService(db)
        try:
            tokens = await oauth.exchange_code_for_tokens(
                code=code,
                client_id=client_id,
                redirect_uri=redirect_uri,
                code_verifier=code_verifier,
            )
            return tokens
        except UnauthorizedException as e:
            return JSONResponse(
                {"error": "invalid_grant", "error_description": e.message},
                status_code=400,
            )

    elif grant_type == "refresh_token":
        if not refresh_token:
            return JSONResponse(
                {"error": "invalid_request", "error_description": "refresh_token required"},
                status_code=400,
            )
        auth_service = AuthService(db)
        try:
            result = await auth_service.refresh_token(refresh_token)
            return {
                "access_token": result.access_token,
                "refresh_token": result.refresh_token,
                "token_type": result.token_type,
                "expires_in": result.expires_in,
                "scope": "read write",
            }
        except UnauthorizedException as e:
            return JSONResponse(
                {"error": "invalid_grant", "error_description": e.message},
                status_code=400,
            )

    else:
        return JSONResponse(
            {"error": "unsupported_grant_type"},
            status_code=400,
        )
