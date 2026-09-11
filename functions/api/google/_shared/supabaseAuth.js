// Verifies a Supabase session JWT by asking Supabase itself who it belongs
// to — simpler and safer than reimplementing JWT verification, and cheap
// enough at this app's scale. Returns null for any missing/invalid/expired
// token; callers should respond 401 in that case.
export async function verifyUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1];

  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: env.SUPABASE_ANON_KEY,
    },
  });
  if (!res.ok) return null;

  const user = await res.json();
  if (!user || !user.id) return null;
  return { id: user.id, email: user.email };
}
