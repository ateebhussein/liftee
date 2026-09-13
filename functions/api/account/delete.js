// POST /api/account/delete — authenticated. Permanently deletes the
// signed-in user's Supabase account (revoking Google access first).
// Deleting the auth.users row cascades to profiles and google_connections
// automatically — it does NOT touch the user's Google Sheet itself, which
// stays in their Drive untouched.
import { verifyUser } from '../google/_shared/supabaseAuth.js';
import { getGoogleConnection } from '../google/_shared/supabaseAdmin.js';
import { revokeToken } from '../google/_shared/googleOAuth.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const user = await verifyUser(request, env);
  if (!user) return json({ error: 'unauthorized' }, 401);

  const connection = await getGoogleConnection(env, user.id);
  if (connection) {
    await revokeToken(connection.refresh_token);
  }

  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
    method: 'DELETE',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) return json({ error: 'delete_failed', message: await res.text() }, 502);

  return json({ ok: true });
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
}
