// Creates or prepares a user's chosen Google Sheet. Ported from the
// previous single-user app's client-side createSpreadsheet() /
// ensureCorrectHeader() / migrateLegacyRows(), now run server-side against
// whichever sheet the user created or picked via the Picker.

export const TAB_NAME = 'WorkoutLog';
export const HEADER_ROW = ["Date","Workout Name","Duration","Exercise Name","Set Order","Weight","Reps","Distance","Seconds","Notes","Workout Notes","RPE"];
export const DEFAULT_SHEET_NAME = 'Liftee Workout Data';

function authHeaders(accessToken, extra) {
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...extra };
}

export async function createSpreadsheet(accessToken, title) {
  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      properties: { title: title || DEFAULT_SHEET_NAME },
      sheets: [{ properties: { title: TAB_NAME } }],
    }),
  });
  if (!res.ok) throw new Error('sheet_create_failed: ' + (await res.text()));
  const data = await res.json();
  await writeHeaderRow(accessToken, data.spreadsheetId);
  return { spreadsheetId: data.spreadsheetId, spreadsheetName: data.properties.title };
}

async function writeHeaderRow(accessToken, spreadsheetId) {
  const range = encodeURIComponent(`${TAB_NAME}!A1`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`,
    { method: 'PUT', headers: authHeaders(accessToken), body: JSON.stringify({ values: [HEADER_ROW] }) }
  );
  if (!res.ok) throw new Error('header_write_failed: ' + (await res.text()));
}

// Called when the user picks an existing spreadsheet via the Picker. Adds a
// WorkoutLog tab if missing, or validates/migrates its header if present.
export async function prepareExistingSpreadsheet(accessToken, spreadsheetId) {
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties.title`,
    { headers: authHeaders(accessToken) }
  );
  if (!metaRes.ok) throw new Error('sheet_not_reachable: ' + (await metaRes.text()));
  const meta = await metaRes.json();
  const title = (meta.properties && meta.properties.title) || 'Untitled spreadsheet';
  const hasTab = (meta.sheets || []).some(s => s.properties && s.properties.title === TAB_NAME);

  if (!hasTab) {
    const batchRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: TAB_NAME } } }] }),
    });
    if (!batchRes.ok) throw new Error('tab_create_failed: ' + (await batchRes.text()));
    await writeHeaderRow(accessToken, spreadsheetId);
    return { spreadsheetId, spreadsheetName: title };
  }

  await ensureCorrectHeader(accessToken, spreadsheetId);
  return { spreadsheetId, spreadsheetName: title };
}

async function ensureCorrectHeader(accessToken, spreadsheetId) {
  const headerRange = encodeURIComponent(`${TAB_NAME}!A1:L1`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${headerRange}`,
    { headers: authHeaders(accessToken) }
  );
  if (!res.ok) throw new Error('header_read_failed: ' + (await res.text()));
  const data = await res.json();
  const currentHeader = (data.values && data.values[0]) || [];
  const matches = HEADER_ROW.length === currentHeader.length && HEADER_ROW.every((h, i) => currentHeader[i] === h);
  if (matches) return;

  if (currentHeader[0] === 'WorkoutID') {
    await migrateLegacyRows(accessToken, spreadsheetId);
  } else {
    await writeHeaderRow(accessToken, spreadsheetId);
  }
}

// Handles a sheet that still has the very old WorkoutID-led column layout
// (from the single-user app's first version) by rewriting it into the
// current layout, preserving whatever rows it already had.
async function migrateLegacyRows(accessToken, spreadsheetId) {
  const range = encodeURIComponent(`${TAB_NAME}!A2:L100000`);
  const getRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
    { headers: authHeaders(accessToken) }
  );
  if (!getRes.ok) return;
  const data = await getRes.json();
  const oldRows = data.values || [];
  const newRows = oldRows
    .filter(r => r[4])
    .map(r => {
      const [, date, name, duration, exName, , setOrder, weight, , reps] = r;
      return [date || '', name || '', duration || '', exName || '', setOrder || '', weight || '', reps || '', 0, 0, '', '', ''];
    });

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(TAB_NAME)}:clear`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(TAB_NAME + '!A1')}?valueInputOption=RAW`,
    { method: 'PUT', headers: authHeaders(accessToken), body: JSON.stringify({ values: [HEADER_ROW, ...newRows] }) }
  );
}
