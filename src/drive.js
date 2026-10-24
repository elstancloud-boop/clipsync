// Drive Bridge: mirrors every clip into the user's own Google Drive ("ClipboardPortal" folder) so it shows up
// in Android's system file picker under Drive. Scope drive.file = app can only touch files it created.
const jwt = require('jsonwebtoken'); const fs = require('fs'); const path = require('path');
const cfg = require('./config'); const db = require('./db');
db.exec(`CREATE TABLE IF NOT EXISTS drive(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL, folder_id TEXT)`);
try { db.exec('ALTER TABLE items ADD COLUMN drive_id TEXT'); } catch {}
const ID = process.env.GOOGLE_CLIENT_ID, SECRET = process.env.GOOGLE_CLIENT_SECRET;
const enabled = !!(ID && SECRET);
const redirect = req => `${req.protocol}://${req.get('host')}/api/drive/callback`;
const connected = uid => !!db.prepare('SELECT 1 FROM drive WHERE user_id=?').get(uid);
const tokens = new Map();

function authUrl(req, uid) {
  const state = jwt.sign({ uid, k: 'drive' }, cfg.jwtSecret, { expiresIn: '10m' });
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({ client_id: ID, redirect_uri: redirect(req),
    response_type: 'code', scope: 'https://www.googleapis.com/auth/drive.file', access_type: 'offline', prompt: 'consent', state });
}
async function form(url, body) { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
  return { ok: r.ok, j: await r.json().catch(() => ({})) }; }
async function callback(req) {
  const { uid } = jwt.verify(String(req.query.state), cfg.jwtSecret);
  const { ok, j } = await form('https://oauth2.googleapis.com/token', { code: String(req.query.code), client_id: ID, client_secret: SECRET, redirect_uri: redirect(req), grant_type: 'authorization_code' });
  if (!ok || !j.refresh_token) throw new Error('Google did not grant access');
  db.prepare('INSERT INTO drive(user_id,refresh_token) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET refresh_token=excluded.refresh_token, folder_id=NULL').run(uid, j.refresh_token);
  tokens.delete(uid); backfill(uid); return uid;
}
async function access(uid) {
  const t = tokens.get(uid); if (t && t.exp > Date.now() + 30000) return t.v;
  const row = db.prepare('SELECT refresh_token r FROM drive WHERE user_id=?').get(uid); if (!row) return null;
  const { ok, j } = await form('https://oauth2.googleapis.com/token', { client_id: ID, client_secret: SECRET, refresh_token: row.r, grant_type: 'refresh_token' });
  if (!ok) { if (j.error === 'invalid_grant') db.prepare('DELETE FROM drive WHERE user_id=?').run(uid); return null; }
  tokens.set(uid, { v: j.access_token, exp: Date.now() + j.expires_in * 1000 }); return j.access_token;
}
async function folder(uid, tok, reset) {
  const row = db.prepare('SELECT folder_id f FROM drive WHERE user_id=?').get(uid);
  if (row.f && !reset) return row.f;
  const r = await fetch('https://www.googleapis.com/drive/v3/files', { method: 'POST', headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'ClipboardPortal', mimeType: 'application/vnd.google-apps.folder' }) });
  const j = await r.json(); if (!j.id) throw new Error('folder failed');
  db.prepare('UPDATE drive SET folder_id=? WHERE user_id=?').run(j.id, uid); return j.id;
}
async function put(uid, tok, name, mime, buf, reset) {
  const parent = await folder(uid, tok, reset), b = 'cs' + Date.now();
  const body = Buffer.concat([Buffer.from(`--${b}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ name, parents: [parent] })}\r\n--${b}\r\nContent-Type: ${mime || 'application/octet-stream'}\r\n\r\n`), buf, Buffer.from(`\r\n--${b}--`)]);
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { authorization: 'Bearer ' + tok, 'content-type': 'multipart/related; boundary=' + b }, body });
  if (r.status === 404 && !reset) return put(uid, tok, name, mime, buf, true); // folder was deleted in Drive
  const j = await r.json(); if (!j.id) throw new Error('upload failed ' + r.status); return j.id;
}
const stamp = t => new Date(t).toISOString().slice(0, 16).replace(/[-:T]/g, '');
async function mirror(uid, row) {
  try {
    if (!enabled || !connected(uid) || row.drive_id) return; const tok = await access(uid); if (!tok) return;
    let name, mime, buf;
    if (row.storage_key) { name = row.name; mime = row.mime; buf = fs.readFileSync(path.join(cfg.dataDir, 'blobs', row.storage_key.replace(/[^a-zA-Z0-9_-]/g, ''))); }
    else if (row.kind === 'link') { name = `link-${stamp(row.created_at)}.url`; mime = 'text/plain'; buf = Buffer.from(`[InternetShortcut]\r\nURL=${row.text.trim()}\r\n`); }
    else { name = `text-${stamp(row.created_at)}.txt`; mime = 'text/plain'; buf = Buffer.from(row.text || ''); }
    const id = await put(uid, tok, name, mime, buf); db.prepare('UPDATE items SET drive_id=? WHERE id=?').run(id, row.id);
  } catch (e) { console.error('drive mirror', e.message); }
}
async function remove(uid, driveId) { try { if (!driveId || !enabled) return; const tok = await access(uid); if (!tok) return;
  await fetch('https://www.googleapis.com/drive/v3/files/' + driveId, { method: 'DELETE', headers: { authorization: 'Bearer ' + tok } }); } catch {} }
async function backfill(uid) { for (const r of db.prepare('SELECT * FROM items WHERE user_id=? AND drive_id IS NULL ORDER BY created_at').all(uid)) await mirror(uid, r); }
const disconnect = uid => { db.prepare('DELETE FROM drive WHERE user_id=?').run(uid); tokens.delete(uid); };
module.exports = { enabled, connected, authUrl, callback, mirror, remove, disconnect };
