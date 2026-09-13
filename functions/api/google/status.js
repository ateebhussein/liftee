// GET /api/google/status — authenticated. Tells the frontend whether this
// account has connected Google yet and, if so, whether a sheet has been
// chosen — without ever exposing the refresh token itself.
import { verifyUser } from './_shared/supabaseAuth.js';
import { getGoogleConnection } from './_shared/supabaseAdmin.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const user = await verifyUser(request, env);
  if (!user) return json({ error: 'unauthorized' }, 401);

  const connection = await getGoogleConnection(env, user.id);
  if (!connection) return json({ connected: false });

  return json({
    connected: true,
    hasSheet: !!connection.spreadsheet_id,
    spreadsheetId: connection.spreadsheet_id || null,
    spreadsheetName: connection.spreadsheet_name || null,
    sheetTabName: connection.sheet_tab_name || null,
  });
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
}
