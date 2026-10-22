// Realtime fan-out via Server-Sent Events. Replace with Redis pub/sub for multi-instance.
const clients = new Map(); // userId -> Set(res)
module.exports = {
  add(uid, res) { if (!clients.has(uid)) clients.set(uid, new Set()); clients.get(uid).add(res);
    res.on('close', () => clients.get(uid)?.delete(res)); },
  emit(uid, event, data) {
    for (const r of clients.get(uid) || []) r.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  },
  ping() { for (const s of clients.values()) for (const r of s) r.write(': ping\n\n'); },
};
