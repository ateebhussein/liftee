// GET /api/google/start — authenticated. Returns the Google consent URL to
// redirect to. Scope is intentionally drive.file ONLY: it covers both Drive
// and Sheets API access, but strictly limited to files this app created or
// that the user explicitly picked via the Picker — never the whole Drive.
import { verifyUser } from './_shared/supabaseAuth.js';
import { signState } from './_shared/state.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';

export async function onRequestGet(context) {
  const { request, env } = context;
  const user = await verifyUser(request, env);
  if (!user) return json({ error: 'unauthorized' }, 401);

  const state = await signState(user.id, env);
  const redirectUri = `${env.PUBLIC_SITE_URL.replace(/\/+$/, '')}/api/google/callback`;
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  return json({ url: 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString() });
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
}
