// Storage driver interface: put(key, tmpPath) / stream(key) / remove(key).
// Swap this file's export for an S3/R2 driver to scale horizontally (see ARCHITECTURE.md).
const fs = require('fs'); const path = require('path'); const cfg = require('./config');
const root = path.join(cfg.dataDir, 'blobs'); fs.mkdirSync(root, { recursive: true });
const p = k => path.join(root, k.replace(/[^a-zA-Z0-9_-]/g, ''));
module.exports = {
  async put(key, tmpPath) { fs.renameSync(tmpPath, p(key)); },
  stream(key) { return fs.createReadStream(p(key)); },
  async remove(key) { try { fs.unlinkSync(p(key)); } catch {} },
  tmpDir: path.join(cfg.dataDir, 'tmp'),
};
fs.mkdirSync(module.exports.tmpDir, { recursive: true });
