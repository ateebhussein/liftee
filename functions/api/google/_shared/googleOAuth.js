// Google OAuth token exchange/refresh/revoke. Ported from the previous
// standalone Worker (worker/src/index.js in the old chalkitup repo) — the
// actual calls to Google's token endpoint are unchanged, only relocated.

export async function exchangeCode(env, code, redirectUri) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || 'token_exchange_failed');
    err.code = data.error;
    throw err;
  }
  return data; // { access_token, refresh_token, expires_in, scope, token_type }
}

export async function refreshAccessToken(env, refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || 'refresh_failed');
    err.code = data.error; // e.g. 'invalid_grant' when externally revoked
    throw err;
  }
  return data; // { access_token, expires_in, ... } — refresh_token not reissued
}

export async function revokeToken(token) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
    method: 'POST',
  }).catch(() => {});
}
