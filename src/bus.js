// Realtime fan-out via Server-Sent Events + device presence. Replace with Redis pub/sub for multi-instance.
const clients = new Map(); // userId -> Set(res)
const list = uid => { const m = new Map(); for (const r of clients.get(uid) || []) if (r.dev) m.set(r.dev.id, r.dev.name);
  return [...m].map(([id, name]) => ({ id, name })); };
const emit = (uid, event, data) => { for (const r of clients.get(uid) || []) r.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
module.exports = {
  emit, list,
  add(uid, res, dev) {
    if (!clients.has(uid)) clients.set(uid, new Set());
    const isNew = dev && !list(uid).some(d => d.id === dev.id);
    res.dev = dev; clients.get(uid).add(res);
    emit(uid, 'devices', { devices: list(uid), joined: isNew ? dev : null });
    res.on('close', () => { const s = clients.get(uid); if (!s) return; s.delete(res);
      if (dev && !list(uid).some(d => d.id === dev.id)) emit(uid, 'devices', { devices: list(uid), left: dev });
      if (!s.size) clients.delete(uid); });
  },
  ping() { for (const s of clients.values()) for (const r of s) r.write(': ping\n\n'); },
};
