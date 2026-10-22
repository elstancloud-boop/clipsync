# ClipSync architecture

Goal: copy on Android, paste on Mac/Windows (and back) for text, links, images, audio, video, files.

## Key constraint
Android/iOS block background clipboard reading, and browsers only read the clipboard on a user gesture. A silent
"auto-sync" is therefore impossible in a web product. ClipSync uses the best allowed path: **one action per device**
- Android: install the PWA, then **Share -> ClipSync** from any app (Web Share Target). Or tap "Paste from clipboard".
- PC: **Ctrl/Cmd+V anywhere on the page**, drag & drop, or the Send button. Copy/Download buttons on every clip.
- Everything appears on all signed-in devices in real time.

## Phase 1 (this repo): modular monolith
```
Android PWA / Mac / Windows browser
        |  HTTPS (REST + SSE)
   Express app ── auth (bcrypt + JWT httpOnly cookie, CSRF origin check, rate limits)
        ├─ items API (text/link/image/audio/video/file, 100 MB cap, per-user quota, retention sweep)
        ├─ realtime bus (SSE per user)         [bus.js]
        ├─ storage driver (local disk)         [storage.js]
        └─ SQLite (WAL): users, items          [db.js]
```
Why: zero-ops, one container, handles thousands of users. Seams (bus, storage, db) are isolated modules.

## Phase 2: scale-out (swap modules, API unchanged)
| Concern | Phase 1 | Phase 2 |
|---|---|---|
| Database | SQLite | Postgres (same SQL, 2 tables) |
| Blobs | local disk | S3/Cloudflare R2 with presigned uploads/downloads (bypass app server for big files) |
| Realtime | in-process SSE | Redis pub/sub fan-out, or WebSocket gateway |
| Rate limit | in-memory | Redis |
| Sessions | JWT cookie | + refresh/rotation, device list, revoke |

## Phase 3: product growth
- **End-to-end encryption** (WebCrypto AES-GCM, key from passphrase; server stores ciphertext only). Biggest trust feature.
- Native Android app (Kotlin/Flutter): foreground "clipboard tile" + share sheet + notification quick-send; desktop tray apps (Tauri) for hotkey send/receive. Same API.
- Email verification + password reset (Resend/Postmark), OAuth (Google), Stripe billing.
- Plans: Free (1 GB, 30-day retention, 100 MB files) / Pro (50 GB, 1 year, 2 GB files via chunked/resumable uploads, tus).
- Observability: Sentry, structured logs, uptime check on /healthz. Virus scan (ClamAV) on uploads for public use.

## Security notes
httpOnly SameSite cookies; Origin check on writes; uploads served with `CSP: sandbox`, `nosniff`, and as attachment
unless image/audio/video; filenames encoded; per-user isolation on every query; account deletion wipes blobs.
Before public launch: set a strong JWT_SECRET, enable HTTPS (Render does), add email verification + abuse reporting + Terms/Privacy.

## Deploy
Render: push repo to GitHub -> New Blueprint (render.yaml). Or `docker build -t clipsync . && docker run -p 3000:3000 -v cs:/data -e JWT_SECRET=... clipsync`.
Env: JWT_SECRET, MAX_FILE_MB, QUOTA_MB, RETENTION_DAYS, SIGNUPS_OPEN.

## UX principles (v1.1)
- No signup wall: "Get started" creates an instant guest account; optional email later ("Save my account").
- Add a device with a QR code or 6-digit code (single-use, 5 min). No passwords on phone.
- One-tap everywhere: click/tap any clip to copy; big Paste/Files/Send buttons; Cmd/Ctrl+V and drag & drop on PC.
- Plain-language messages, upload progress, undo on delete, dark mode, first-run guide tailored to phone vs computer.
