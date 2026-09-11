// POST /api/google/token — authenticated. Mints a fresh short-lived Google
// access token from the stored refresh token. The browser uses this token
// directly against Sheets/Drive, exactly like before — it never sees the
// refresh token itself.
import { verifyUser } from './_shared/supabaseAuth.js';
import { getGoogleConnection, deleteGoogleConnection } from './_shared/supabaseAdmin.js';
import { refreshAccessToken } from './_shared/googleOAuth.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const user = await verifyUser(request, env);
  if (!user) return json({ error: 'unauthorized' }, 401);

  const connection = await getGoogleConnection(env, user.id);
  if (!connection) return json({ error: 'not_connected' }, 404);

  try {
    const data = await refreshAccessToken(env, connection.refresh_token);
    return json({ access_token: data.access_token, expires_in: data.expires_in });
  } catch (err) {
    if (err.code === 'invalid_grant') {
      // Revoked externally (e.g. in the user's Google Account settings) — drop
      // the dead connection so /api/google/status correctly reports "not connected".
      await deleteGoogleConnection(env, user.id).catch(() => {});
      return json({ error: 'needs_reauth' }, 409);
    }
    return json({ error: err.code || 'refresh_failed' }, 502);
  }
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
}
