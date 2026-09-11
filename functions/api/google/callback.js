// GET /api/google/callback — Google's own redirect target, not called by
// the frontend. Verifies the signed state, exchanges the code, and stores
// the refresh token against the Supabase user it was minted for.
import { verifyState } from './_shared/state.js';
import { exchangeCode } from './_shared/googleOAuth.js';
import { upsertGoogleConnection } from './_shared/supabaseAdmin.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const stateToken = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const site = env.PUBLIC_SITE_URL.replace(/\/+$/, '');

  if (error || !code || !stateToken) {
    return Response.redirect(`${site}/#google_error=${encodeURIComponent(error || 'missing_code')}`, 302);
  }

  const statePayload = await verifyState(stateToken, env);
  if (!statePayload) {
    return Response.redirect(`${site}/#google_error=invalid_state`, 302);
  }

  const redirectUri = `${site}/api/google/callback`;
  let tokenData;
  try {
    tokenData = await exchangeCode(env, code, redirectUri);
  } catch (err) {
    return Response.redirect(`${site}/#google_error=${encodeURIComponent(err.code || 'token_exchange_failed')}`, 302);
  }

  if (!tokenData.refresh_token) {
    // Shouldn't happen with access_type=offline&prompt=consent, but guard anyway
    // rather than silently storing a connection with no way to refresh it.
    return Response.redirect(`${site}/#google_error=no_refresh_token`, 302);
  }

  try {
    await upsertGoogleConnection(env, statePayload.uid, { refresh_token: tokenData.refresh_token });
  } catch (err) {
    return Response.redirect(`${site}/#google_error=storage_failed`, 302);
  }

  return Response.redirect(`${site}/#google_connected=1`, 302);
}
