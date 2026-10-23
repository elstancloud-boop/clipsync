const express = require('express'); const path = require('path'); const crypto = require('crypto');
const bcrypt = require('bcryptjs'); const jwt = require('jsonwebtoken'); const multer = require('multer');
const QR = require('qrcode');
const cfg = require('./config'); const db = require('./db'); const storage = require('./storage'); const bus = require('./bus'); const drive = require('./drive');

const app = express(); app.disable('x-powered-by'); app.set('trust proxy', 1);
app.use((req, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY' }); next(); });
app.use(express.json({ limit: '1mb' }));
const upload = multer({ dest: storage.tmpDir, limits: { fileSize: cfg.maxFileBytes, files: 10 } });

// ---- tiny in-memory rate limiter (use Redis in multi-instance) ----
const hits = new Map();
const limit = (n, ms) => (req, res, next) => { const k = req.ip + req.path, now = Date.now();
  const a = (hits.get(k) || []).filter(t => now - t < ms); a.push(now); hits.set(k, a);
  a.length > n ? res.status(429).json({ error: 'Too many requests, slow down.' }) : next(); };
setInterval(() => hits.clear(), 600000).unref();

// ---- auth (JWT in httpOnly cookie) ----
const cookie = (req, n) => (req.headers.cookie || '').split(/;\s*/).map(c => c.split('=')).find(c => c[0] === n)?.[1];
const setSession = (res, u) => res.cookie('cs', jwt.sign({ uid: u.id }, cfg.jwtSecret, { expiresIn: '90d' }),
  { httpOnly: true, sameSite: 'lax', secure: cfg.prod, maxAge: 90 * 864e5 });
const auth = (req, res, next) => { try { req.uid = jwt.verify(cookie(req, 'cs'), cfg.jwtSecret).uid;
    if (!db.prepare('SELECT 1 FROM users WHERE id=?').get(req.uid)) throw 0; next(); } // stale cookie after a data reset
  catch { res.status(401).json({ error: 'Not signed in' }); } };
// CSRF: state-changing requests must come from our own origin
app.use((req, res, next) => { if (req.method === 'GET') return next(); const o = req.headers.origin;
  if (o && new URL(o).host !== req.headers.host) return res.status(403).json({ error: 'Bad origin' }); next(); });


// ---- zero-friction onboarding: instant guest account + pairing codes (no password needed) ----
app.post('/api/start', limit(20, 3600e3), (req, res) => {
  if (!cfg.signupsOpen) return res.status(403).json({ error: 'Signups closed' });
  const id = db.prepare('INSERT INTO users(created_at) VALUES(?)').run(Date.now()).lastInsertRowid;
  setSession(res, { id }); res.json({ ok: true }); });
const pairs = new Map(); // code -> {uid, exp}
app.post('/api/pair/create', auth, limit(30, 600e3), (req, res) => {
  let code; do code = String(crypto.randomInt(100000, 1000000)); while (pairs.has(code));
  pairs.set(code, { uid: req.uid, exp: Date.now() + 5 * 60e3 }); setTimeout(() => pairs.delete(code), 5 * 60e3).unref();
  res.json({ code, expiresIn: 300 }); });
app.post('/api/pair/join', limit(15, 600e3), (req, res) => {
  const code = String(req.body.code || '').replace(/\D/g, ''), p = pairs.get(code);
  if (!p || p.exp < Date.now()) return res.status(400).json({ error: 'That code is wrong or expired. Ask for a new one.' });
  pairs.delete(code); setSession(res, { id: p.uid }); res.json({ ok: true }); });
app.get('/api/pair/qr/:code', auth, async (req, res) => {
  const url = `${req.protocol}://${req.get('host')}/?pair=${encodeURIComponent(req.params.code)}`;
  res.type('image/svg+xml').send(await QR.toString(url, { type: 'svg', margin: 1, color: { dark: '#0b0b12' } })); });
app.post('/api/upgrade', auth, limit(10, 3600e3), (req, res) => { // optional: add email+password to a guest account
  const email = String(req.body.email || '').trim().toLowerCase(), pw = String(req.body.password || '');
  if (!/^\S+@\S+\.\S+$/.test(email) || pw.length < 8) return res.status(400).json({ error: 'Enter a valid email and a password of 8+ characters' });
  if (db.prepare('SELECT 1 FROM users WHERE email=? AND id<>?').get(email, req.uid)) return res.status(409).json({ error: 'That email is already used' });
  db.prepare('UPDATE users SET email=?, pass_hash=? WHERE id=?').run(email, bcrypt.hashSync(pw, 11), req.uid); res.json({ ok: true }); });
app.post('/api/register', limit(10, 3600e3), (req, res) => {
  if (!cfg.signupsOpen) return res.status(403).json({ error: 'Signups closed' });
  const email = String(req.body.email || '').trim().toLowerCase(), pw = String(req.body.password || '');
  if (!/^\S+@\S+\.\S+$/.test(email) || pw.length < 8) return res.status(400).json({ error: 'Valid email and 8+ char password required' });
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return res.status(409).json({ error: 'Email already registered' });
  const id = db.prepare('INSERT INTO users(email,pass_hash,created_at) VALUES(?,?,?)').run(email, bcrypt.hashSync(pw, 11), Date.now()).lastInsertRowid;
  setSession(res, { id }); res.json({ ok: true });
});
app.post('/api/login', limit(20, 600e3), (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(String(req.body.email || '').trim().toLowerCase());
  if (!u || !u.pass_hash || !bcrypt.compareSync(String(req.body.password || ''), u.pass_hash)) return res.status(401).json({ error: 'Wrong email or password' });
  setSession(res, u); res.json({ ok: true });
});
app.post('/api/logout', (req, res) => { res.clearCookie('cs'); res.json({ ok: true }); });
app.get('/api/me', auth, (req, res) => { const u = db.prepare('SELECT email FROM users WHERE id=?').get(req.uid);
  const used = db.prepare('SELECT COALESCE(SUM(size),0) s FROM items WHERE user_id=?').get(req.uid).s;
  res.json({ driveAvailable: drive.enabled, drive: drive.connected(req.uid), email: u.email || null, used, quota: cfg.quotaBytes, retentionDays: cfg.retentionDays }); });
app.post('/api/delete-account', auth, async (req, res) => {
  for (const i of db.prepare('SELECT storage_key k FROM items WHERE user_id=? AND storage_key IS NOT NULL').all(req.uid)) await storage.remove(i.k);
  db.prepare('DELETE FROM users WHERE id=?').run(req.uid); res.clearCookie('cs'); res.json({ ok: true }); });

// ---- items ----
const kindOf = mime => !mime ? 'file' : mime.startsWith('image/') ? 'image' : mime.startsWith('audio/') ? 'audio' : mime.startsWith('video/') ? 'video' : 'file';
const URL_RE = /^https?:\/\/\S+$/i;
const pub = r => ({ id: r.id, kind: r.kind, text: r.text, name: r.name, mime: r.mime, size: r.size, device: r.device, createdAt: r.created_at });
function addText(uid, text, device) {
  const id = crypto.randomUUID(), t = String(text).slice(0, 200000);
  db.prepare('INSERT INTO items(id,user_id,kind,text,device,created_at) VALUES(?,?,?,?,?,?)').run(id, uid, URL_RE.test(t.trim()) ? 'link' : 'text', t, device || null, Date.now());
  return db.prepare('SELECT * FROM items WHERE id=?').get(id);
}
async function addFile(uid, f, device) {
  const used = db.prepare('SELECT COALESCE(SUM(size),0) s FROM items WHERE user_id=?').get(uid).s;
  if (used + f.size > cfg.quotaBytes) { await storage.remove(path.basename(f.path)); const e = new Error('Storage quota exceeded'); e.status = 413; throw e; }
  const id = crypto.randomUUID(); await storage.put(id, f.path);
  const name = Buffer.from(f.originalname, 'latin1').toString('utf8');
  db.prepare('INSERT INTO items(id,user_id,kind,name,mime,size,storage_key,device,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(id, uid, kindOf(f.mimetype), name, f.mimetype, f.size, id, device || null, Date.now());
  return db.prepare('SELECT * FROM items WHERE id=?').get(id);
}
const wrap = fn => (req, res, next) => fn(req, res, next).catch(e => res.status(e.status || 500).json({ error: e.message }));
async function ingest(req) {
  const out = [];
  if (req.body?.text?.trim()) out.push(addText(req.uid, req.body.text, req.body.device));
  for (const f of req.files || []) out.push(await addFile(req.uid, f, req.body.device));
  out.forEach(r => { bus.emit(req.uid, 'item', pub(r)); drive.mirror(req.uid, r); }); return out;
}
app.get('/api/items', auth, (req, res) => res.json(db.prepare('SELECT * FROM items WHERE user_id=? ORDER BY created_at DESC LIMIT 200').all(req.uid).map(pub)));
app.post('/api/items', auth, limit(120, 60e3), upload.array('files'), wrap(async (req, res) => {
  const out = await ingest(req); if (!out.length) return res.status(400).json({ error: 'Nothing to save' }); res.json(out.map(pub)); }));
// Android share-sheet target (installed PWA): Share -> ClipSync
app.post('/share', auth, upload.array('files'), async (req, res) => {
  const b = req.body || {}; req.body = { text: [b.text, b.url].filter(Boolean).join(' ') || b.title, device: 'Android share' };
  try { await ingest(req); } catch {} res.redirect(303, '/'); });
app.delete('/api/items/:id', auth, wrap(async (req, res) => {
  const r = db.prepare('SELECT * FROM items WHERE id=? AND user_id=?').get(req.params.id, req.uid);
  if (!r) return res.status(404).json({ error: 'Not found' });
  if (r.storage_key) await storage.remove(r.storage_key); drive.remove(req.uid, r.drive_id);
  db.prepare('DELETE FROM items WHERE id=?').run(r.id); bus.emit(req.uid, 'delete', { id: r.id }); res.json({ ok: true }); }));
app.get('/api/items/:id/file', auth, (req, res) => {
  const r = db.prepare('SELECT * FROM items WHERE id=? AND user_id=? AND storage_key IS NOT NULL').get(req.params.id, req.uid);
  if (!r) return res.sendStatus(404);
  // Range support so audio/video can seek. Serve user content as attachment unless safe media.
  const safe = /^(image\/(png|jpe?g|gif|webp|avif)|audio\/|video\/)/.test(r.mime || '');
  res.set({ 'Content-Type': safe ? r.mime : 'application/octet-stream', 'Accept-Ranges': 'bytes',
    'Content-Disposition': `${req.query.dl || !safe ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(r.name)}`,
    'Content-Security-Policy': "sandbox", 'Cache-Control': 'private, max-age=3600' });
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (m) { const s = m[1] ? +m[1] : 0, e = m[2] ? +m[2] : r.size - 1;
    if (s > e || e >= r.size) return res.status(416).end();
    res.status(206).set({ 'Content-Range': `bytes ${s}-${e}/${r.size}`, 'Content-Length': e - s + 1 });
    return require('fs').createReadStream(path.join(cfg.dataDir, 'blobs', r.storage_key), { start: s, end: e }).pipe(res); }
  res.set('Content-Length', r.size); storage.stream(r.storage_key).pipe(res); });
app.get('/api/stream', auth, (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders(); res.write('retry: 2000\n\n');
  const id = String(req.query.d || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40), name = String(req.query.n || 'Device').replace(/[^\w .-]/g, '').slice(0, 20) || 'Device';
  bus.add(req.uid, res, id.length >= 8 ? { id, name } : null); });
setInterval(bus.ping, 25000).unref();

// ---- retention sweep: auto-delete old items ----
async function sweep() { const cut = Date.now() - cfg.retentionDays * 864e5;
  for (const r of db.prepare('SELECT id,storage_key k FROM items WHERE created_at<?').all(cut)) { if (r.k) await storage.remove(r.k); db.prepare('DELETE FROM items WHERE id=?').run(r.id); } }
setInterval(sweep, 3600e3).unref(); sweep();

// ---- Google Drive bridge ----
app.get('/api/drive/connect', auth, (req, res) => drive.enabled ? res.redirect(drive.authUrl(req, req.uid)) : res.status(503).send('Drive not configured'));
app.get('/api/drive/callback', async (req, res) => { try { await drive.callback(req); res.redirect('/?drive=ok'); } catch (e) { res.redirect('/?drive=fail'); } });
app.post('/api/drive/disconnect', auth, (req, res) => { drive.disconnect(req.uid); res.json({ ok: true }); });
app.get('/healthz', (req, res) => res.send('ok'));
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: 0, etag: true, setHeaders: (r) => r.setHeader('Cache-Control', 'no-cache') }));
app.use((e, req, res, next) => res.status(e.code === 'LIMIT_FILE_SIZE' ? 413 : 500).json({ error: e.code === 'LIMIT_FILE_SIZE' ? 'File too large' : 'Server error' }));
if (require.main === module) app.listen(cfg.port, () => console.log('ClipSync on :' + cfg.port));
module.exports = app;
