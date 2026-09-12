// Reads/writes the google_connections table using the Supabase service-role
// key, which bypasses Row Level Security. This module — and the service
// role key itself — must NEVER be imported by, or its key copied into, any
// client-reachable file. It exists only for these Pages Functions to call.

function restUrl(env, pathAndQuery) {
  return `${env.SUPABASE_URL}/rest/v1/${pathAndQuery}`;
}

function adminHeaders(env, extra) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

export async function getGoogleConnection(env, userId) {
  const res = await fetch(
    restUrl(env, `google_connections?user_id=eq.${encodeURIComponent(userId)}&select=*`),
    { headers: adminHeaders(env) }
  );
  if (!res.ok) throw new Error('supabase_read_failed: ' + (await res.text()));
  const rows = await res.json();
  return rows[0] || null;
}

export async function upsertGoogleConnection(env, userId, fields) {
  const res = await fetch(restUrl(env, 'google_connections?on_conflict=user_id'), {
    method: 'POST',
    headers: adminHeaders(env, { Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify({ user_id: userId, ...fields }),
  });
  if (!res.ok) throw new Error('supabase_upsert_failed: ' + (await res.text()));
  const rows = await res.json();
  return rows[0];
}

export async function updateGoogleConnection(env, userId, fields) {
  const res = await fetch(restUrl(env, `google_connections?user_id=eq.${encodeURIComponent(userId)}`), {
    method: 'PATCH',
    headers: adminHeaders(env, { Prefer: 'return=representation' }),
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error('supabase_update_failed: ' + (await res.text()));
  const rows = await res.json();
  return rows[0];
}

export async function deleteGoogleConnection(env, userId) {
  const res = await fetch(
    restUrl(env, `google_connections?user_id=eq.${encodeURIComponent(userId)}`),
    { method: 'DELETE', headers: adminHeaders(env) }
  );
  if (!res.ok) throw new Error('supabase_delete_failed: ' + (await res.text()));
}
