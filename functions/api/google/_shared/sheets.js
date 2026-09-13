// Creates or prepares a user's chosen Google Sheet. Ported from the
// previous single-user app's client-side createSpreadsheet() /
// ensureCorrectHeader() / migrateLegacyRows(), now run server-side against
// whichever sheet the user created or picked via the Picker.

export const HEADER_ROW = ["Date","Workout Name","Duration","Exercise Name","Set Order","Weight","Reps","Distance","Seconds","Notes","Workout Notes","RPE"];

const LEGACY_TAB_NAME = 'WorkoutLog';
const TAB_PREFIX = 'lifteeworkoutdb_';

function isOurTab(title) {
  return title === LEGACY_TAB_NAME || title.startsWith(TAB_PREFIX);
}

function todayTabName() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${TAB_PREFIX}${yyyy}${mm}${dd}`;
}

function authHeaders(accessToken, extra) {
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...extra };
}

export async function createSpreadsheet(accessToken, title) {
  const tabName = todayTabName();
  const fileTitle = title || tabName;
  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      properties: { title: fileTitle },
      sheets: [{ properties: { title: tabName } }],
    }),
  });
  if (!res.ok) throw new Error('sheet_create_failed: ' + (await res.text()));
  const data = await res.json();
  await writeHeaderRow(accessToken, data.spreadsheetId, tabName);
  return { spreadsheetId: data.spreadsheetId, spreadsheetName: data.properties.title, tabName };
}

async function writeHeaderRow(accessToken, spreadsheetId, tabName) {
  const range = encodeURIComponent(`${tabName}!A1`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`,
    { method: 'PUT', headers: authHeaders(accessToken), body: JSON.stringify({ values: [HEADER_ROW] }) }
  );
  if (!res.ok) throw new Error('header_write_failed: ' + (await res.text()));
}

// Called when the user picks an existing spreadsheet via the Picker. Reuses
// a tab already left there by Liftee (current or legacy naming) if one
// exists, or adds a freshly-dated tab if not.
export async function prepareExistingSpreadsheet(accessToken, spreadsheetId) {
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties.title`,
    { headers: authHeaders(accessToken) }
  );
  if (!metaRes.ok) throw new Error('sheet_not_reachable: ' + (await metaRes.text()));
  const meta = await metaRes.json();
  const title = (meta.properties && meta.properties.title) || 'Untitled spreadsheet';
  const existing = (meta.sheets || []).find(s => s.properties && isOurTab(s.properties.title));

  if (!existing) {
    const tabName = todayTabName();
    const batchRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tabName } } }] }),
    });
    if (!batchRes.ok) throw new Error('tab_create_failed: ' + (await batchRes.text()));
    await writeHeaderRow(accessToken, spreadsheetId, tabName);
    return { spreadsheetId, spreadsheetName: title, tabName };
  }

  const tabName = existing.properties.title;
  await ensureCorrectHeader(accessToken, spreadsheetId, tabName);
  return { spreadsheetId, spreadsheetName: title, tabName };
}

async function ensureCorrectHeader(accessToken, spreadsheetId, tabName) {
  const headerRange = encodeURIComponent(`${tabName}!A1:L1`);
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
    await migrateLegacyRows(accessToken, spreadsheetId, tabName);
  } else {
    await writeHeaderRow(accessToken, spreadsheetId, tabName);
  }
}

// Handles a sheet that still has the very old WorkoutID-led column layout
// (from the single-user app's first version) by rewriting it into the
// current layout, preserving whatever rows it already had.
async function migrateLegacyRows(accessToken, spreadsheetId, tabName) {
  const range = encodeURIComponent(`${tabName}!A2:L100000`);
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

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(tabName)}:clear`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(tabName + '!A1')}?valueInputOption=RAW`,
    { method: 'PUT', headers: authHeaders(accessToken), body: JSON.stringify({ values: [HEADER_ROW, ...newRows] }) }
  );
}
