const Database = require('better-sqlite3');
const fs = require('fs'); const path = require('path');
const cfg = require('./config');
fs.mkdirSync(cfg.dataDir, { recursive: true });
const db = new Database(path.join(cfg.dataDir, 'clipsync.db'));
db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, email TEXT UNIQUE, pass_hash TEXT,
  created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS items(
  id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,            -- text | link | image | audio | video | file
  text TEXT, name TEXT, mime TEXT, size INTEGER DEFAULT 0, storage_key TEXT,
  device TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_items_user ON items(user_id, created_at DESC);
`);
module.exports = db;
