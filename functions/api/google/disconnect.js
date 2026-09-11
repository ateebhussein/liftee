// POST /api/google/disconnect — authenticated. Revokes with Google and
// forgets this account's connection entirely (used by Settings -> Disconnect,
// distinct from Supabase sign-out).
import { verifyUser } from './_shared/supabaseAuth.js';
import { getGoogleConnection, deleteGoogleConnection } from './_shared/supabaseAdmin.js';
import { revokeToken } from './_shared/googleOAuth.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const user = await verifyUser(request, env);
  if (!user) return json({ error: 'unauthorized' }, 401);

  const connection = await getGoogleConnection(env, user.id);
  if (connection) {
    await revokeToken(connection.refresh_token);
    await deleteGoogleConnection(env, user.id);
  }
  return new Response(null, { status: 204 });
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
}
