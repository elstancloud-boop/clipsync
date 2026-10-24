// Production entry: restore the SQLite snapshot from Supabase before the app opens it, then snapshot regularly.
const fs = require('fs'); const path = require('path'); const cfg = require('./config');
const SB = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_KEY, BUCKET = 'cp', SNAP = '_snapshot/clipsync.db';
const hdr = (x = {}) => ({ Authorization: 'Bearer ' + KEY, apikey: KEY, ...x });
const dbFile = path.join(cfg.dataDir, 'clipsync.db');
(async () => {
  if (SB && KEY) {
    try {
      await fetch(`${SB}/storage/v1/bucket`, { method: 'POST', headers: hdr({ 'Content-Type': 'application/json' }), body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }) }).catch(() => {});
      fs.mkdirSync(cfg.dataDir, { recursive: true });
      if (!fs.existsSync(dbFile)) {
        const r = await fetch(`${SB}/storage/v1/object/${BUCKET}/${SNAP}`, { headers: hdr() });
        if (r.ok) { fs.writeFileSync(dbFile, Buffer.from(await r.arrayBuffer())); console.log('restored database snapshot', fs.statSync(dbFile).size, 'bytes'); }
        else console.log('no snapshot yet (', r.status, ')');
      }
    } catch (e) { console.error('restore failed', e.message); }
  }
  const app = require('./server'); const cfg2 = require('./config'); app.listen(cfg2.port, () => console.log('ClipboardPortal on :' + cfg2.port));
  if (SB && KEY) {
    const db = require('./db'); let busy = false, last = '';
    const snap = async () => { if (busy) return; busy = true; const tmp = path.join(cfg.dataDir, 'snap.tmp');
      try { await db.backup(tmp); const buf = fs.readFileSync(tmp); const h = require('crypto').createHash('md5').update(buf).digest('hex');
        if (h !== last) { const r = await fetch(`${SB}/storage/v1/object/${BUCKET}/${SNAP}`, { method: 'POST', headers: hdr({ 'x-upsert': 'true', 'Content-Type': 'application/octet-stream' }), body: buf }); if (r.ok) last = h; else console.error('snapshot', r.status, await r.text()); } }
      catch (e) { console.error('snapshot failed', e.message); } busy = false; };
    setInterval(snap, 15000); setTimeout(snap, 3000);
    process.on('SIGTERM', async () => { await snap(); process.exit(0); });
  }
})();
