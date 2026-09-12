// POST /api/google/select-sheet — authenticated. Body: {mode:'create', title?}
// or {mode:'existing', spreadsheetId, spreadsheetName?}. Creates a fresh
// sheet or prepares/validates a picked one, then remembers the choice.
import { verifyUser } from './_shared/supabaseAuth.js';
import { getGoogleConnection, updateGoogleConnection } from './_shared/supabaseAdmin.js';
import { refreshAccessToken } from './_shared/googleOAuth.js';
import { createSpreadsheet, prepareExistingSpreadsheet } from './_shared/sheets.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const user = await verifyUser(request, env);
  if (!user) return json({ error: 'unauthorized' }, 401);

  const connection = await getGoogleConnection(env, user.id);
  if (!connection) return json({ error: 'not_connected' }, 409);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }

  let accessToken;
  try {
    const tokenData = await refreshAccessToken(env, connection.refresh_token);
    accessToken = tokenData.access_token;
  } catch (err) {
    return json({ error: err.code || 'refresh_failed' }, 502);
  }

  let result;
  try {
    if (body.mode === 'create') {
      const title = body.title || `lifteeworkout_${user.id}`;
      result = await createSpreadsheet(accessToken, title);
    } else if (body.mode === 'existing' && body.spreadsheetId) {
      result = await prepareExistingSpreadsheet(accessToken, body.spreadsheetId);
    } else {
      return json({ error: 'invalid_mode' }, 400);
    }
  } catch (err) {
    return json({ error: 'sheet_setup_failed', message: String((err && err.message) || err) }, 502);
  }

  await updateGoogleConnection(env, user.id, {
    spreadsheet_id: result.spreadsheetId,
    spreadsheet_name: result.spreadsheetName,
  });

  return json({ spreadsheetId: result.spreadsheetId, spreadsheetName: result.spreadsheetName });
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
}
