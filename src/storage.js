// Storage driver: local disk cache + optional durable copy in Supabase Storage (survives Render restarts).
const fs = require('fs'); const path = require('path'); const cfg = require('./config');
const root = path.join(cfg.dataDir, 'blobs'); fs.mkdirSync(root, { recursive: true });
const p = k => path.join(root, k.replace(/[^a-zA-Z0-9_-]/g, ''));
const SB = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_KEY, BUCKET = 'cp';
const hdr = (x = {}) => ({ Authorization: 'Bearer ' + KEY, apikey: KEY, ...x });
const remote = !!(SB && KEY);
async function up(key, file) { try { const r = await fetch(`${SB}/storage/v1/object/${BUCKET}/${key}`, { method: 'POST', headers: hdr({ 'x-upsert': 'true', 'Content-Type': 'application/octet-stream' }), body: fs.readFileSync(file) }); if (!r.ok) console.error('supabase put', r.status, await r.text()); } catch (e) { console.error('supabase put', e.message); } }
module.exports = {
  remote, SB, KEY, BUCKET, hdr,
  async put(key, tmpPath) { fs.renameSync(tmpPath, p(key)); if (remote) up(key, p(key)); },
  // Makes sure the file is on local disk (re-downloads from Supabase after a restart); returns its path.
  async ensure(key) { const f = p(key); if (fs.existsSync(f)) return f; if (!remote) return f;
    const r = await fetch(`${SB}/storage/v1/object/${BUCKET}/${key}`, { headers: hdr() }); if (!r.ok) throw Object.assign(new Error('File missing'), { status: 404 });
    fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); return f; },
  async remove(key) { try { fs.unlinkSync(p(key)); } catch {} if (remote) fetch(`${SB}/storage/v1/object/${BUCKET}/${key}`, { method: 'DELETE', headers: hdr() }).catch(() => {}); },
  tmpDir: path.join(cfg.dataDir, 'tmp'),
};
fs.mkdirSync(module.exports.tmpDir, { recursive: true });
