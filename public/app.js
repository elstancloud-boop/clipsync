const $ = id => document.getElementById(id);
const isAndroid = /Android/i.test(navigator.userAgent), isPhone = /Android|iPhone|iPad/i.test(navigator.userAgent);
const device = isAndroid ? 'Android' : /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : /Mac/i.test(navigator.platform) ? 'Mac' : /Win/i.test(navigator.platform) ? 'Windows' : 'Browser';
let items = [], es, pending = new Set(), fresh = new Set();
const toast = (m, act, fn, ms = 2500) => { $('tmsg').textContent = m; const a = $('tact'); a.hidden = !act; if (act) { a.textContent = act; a.onclick = () => { fn(); $('toast').style.display = 'none'; }; }
  $('toast').style.display = 'flex'; clearTimeout(toast.h); toast.h = setTimeout(() => $('toast').style.display = 'none', ms); };
const api = async (p, o = {}) => { const r = await fetch('/api' + p, { credentials: 'same-origin', ...o });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || 'Something went wrong. Please try again.'), { status: r.status }); return j; };
const post = (p, b) => api(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sz = n => n > 1e9 ? (n / 1e9).toFixed(1) + ' GB' : n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB';
const ago = t => { const s = (Date.now() - t) / 1000; return s < 45 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : new Date(t).toLocaleDateString(); };
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
let deferredInstall; addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; $('inst').hidden = false; });
$('inst').onclick = () => deferredInstall?.prompt();

// ---------- welcome / sign-in ----------
$('go').onclick = async () => { try { await post('/start'); start(); } catch (e) { $('werr').textContent = e.message; } };
$('havecode').onclick = () => { $('codebox').hidden = false; $('cin').focus(); };
const joinCode = async c => { try { await post('/pair/join', { code: c }); history.replaceState(null, '', '/'); start(); } catch (e) { $('codebox').hidden = false; $('werr').textContent = e.message; } };
$('join').onclick = () => joinCode($('cin').value); $('cin').oninput = () => { if ($('cin').value.replace(/\D/g, '').length === 6) joinCode($('cin').value); };
$('showlogin').onclick = () => { $('loginbox').hidden = false; $('em').focus(); };
$('login').onclick = async () => { try { await post('/login', { email: $('em').value, password: $('pw').value }); start(); } catch (e) { $('werr').textContent = e.message; } };

// ---------- menu / modals ----------
$('menubtn').onclick = e => { e.stopPropagation(); $('menu').style.display = $('menu').style.display === 'block' ? 'none' : 'block'; };
addEventListener('click', () => $('menu').style.display = 'none');
$('out').onclick = async () => { if (confirm('Log out? If you have not saved your account with an email, use "Add device" first so you can get back in.')) { await post('/logout'); es?.close(); location.reload(); } };
$('del').onclick = async () => { if (confirm('Permanently delete your account and ALL clips? This cannot be undone.')) { await post('/delete-account'); location.reload(); } };
$('secure').onclick = () => $('secm').style.display = 'grid'; $('sclose').onclick = () => $('secm').style.display = 'none';
$('ssave').onclick = async () => { try { await post('/upgrade', { email: $('sem').value, password: $('spw').value }); $('secm').style.display = 'none'; toast('Account saved ✓'); start(); } catch (e) { $('serr').textContent = e.message; } };
let pt; async function openPair() { $('pairm').style.display = 'grid'; $('host').textContent = location.host; clearInterval(pt);
  try { const { code, expiresIn } = await post('/pair/create'); $('pcode').textContent = code.replace(/(\d{3})(\d{3})/, '$1 $2'); $('qr').src = '/api/pair/qr/' + code;
    let left = expiresIn; $('pexp').textContent = 'Code works once, for 5 minutes.'; pt = setInterval(() => { if (--left <= 0) { clearInterval(pt); openPair(); } }, 1000); }
  catch (e) { $('pexp').textContent = e.message; } }
$('adddev').onclick = openPair; $('pclose').onclick = () => { $('pairm').style.display = 'none'; clearInterval(pt); };

// ---------- main ----------
async function start() {
  try { const me = await api('/me'); $('welcome').hidden = true; $('app').hidden = false; $('secure').hidden = !!me.email;
    $('quota').textContent = `${sz(me.used)} of ${sz(me.quota)} used · clips auto-delete after ${me.retentionDays} days`;
    $('auto').checked = localStorage.auto === '1'; items = await api('/items'); render(); connect(); }
  catch { $('welcome').hidden = false; $('app').hidden = true; const c = new URLSearchParams(location.search).get('pair'); if (c) joinCode(c); } }
$('auto').onchange = () => localStorage.auto = $('auto').checked ? '1' : '0';
function connect() { es?.close(); es = new EventSource('/api/stream');
  es.addEventListener('item', e => { const i = JSON.parse(e.data); if (items.find(x => x.id === i.id)) return; items.unshift(i); fresh.add(i.id); render();
    const mine = i.device === device; if (!mine && $('auto').checked && i.text) copyText(i.text, true); else if (!mine) toast('New clip from ' + (i.device || 'another device')); });
  es.addEventListener('delete', e => { items = items.filter(x => x.id !== JSON.parse(e.data).id); render(); }); }

function emptyState() { const e = $('empty'); e.hidden = items.length > 0; if (items.length) return;
  e.innerHTML = isPhone ? `<h3>You're in 🎉 Here's how it works</h3><ol class="steps"><li><div><b>Send from here:</b> tap <b>Paste</b> or <b>Files</b> above, or use Android's <b>Share</b> button in any app and pick ClipSync (install the app from ⋯ menu first).</div></li><li><div><b>On your computer:</b> open <b>${esc(location.host)}</b>, then tap <b>I have a code</b>.</div></li><li><div>Tap <b>＋ Add device</b> at the top to get your code.</div></li></ol><button class="big" onclick="openPair()">＋ Connect my computer</button>`
  : `<h3>You're in 🎉 Here's how it works</h3><ol class="steps"><li><div><b>Connect your phone:</b> click <b>＋ Add device</b> and scan the QR code with your phone camera.</div></li><li><div><b>Send anything:</b> press <b>${/Mac/.test(device) ? '⌘' : 'Ctrl'}+V</b> on this page to paste text, images or files, or drag files here.</div></li><li><div><b>Get things back:</b> clips from your phone appear here instantly. Click any clip to copy it.</div></li></ol><button class="big" onclick="openPair()">＋ Connect my phone</button>`; }
window.openPair = openPair;

function render() { emptyState(); $('list').innerHTML = '';
  for (const i of items) { const c = document.createElement('div'); c.className = 'card clip' + (fresh.has(i.id) ? ' fresh' : ''); const u = `/api/items/${i.id}/file`; let body = '';
    if (i.kind === 'text') body = `<div class="txt">${esc(i.text)}</div>`;
    else if (i.kind === 'link') { let h = i.text; try { h = new URL(i.text.trim()).hostname; } catch {} body = `<div class="txt">🔗 <a href="${esc(i.text.trim())}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">${esc(h)}</a><div class="hint">${esc(i.text.slice(0, 120))}</div></div>`; }
    else if (i.kind === 'image') body = `<img loading="lazy" src="${u}" alt="${esc(i.name)}">`;
    else if (i.kind === 'video') body = `<video controls playsinline preload="metadata" src="${u}" onclick="event.stopPropagation()"></video>`;
    else if (i.kind === 'audio') body = `<audio controls preload="metadata" src="${u}" onclick="event.stopPropagation()"></audio>`;
    else body = `<div class="file"><b>📄</b><span>${esc(i.name)}</span></div>`;
    c.innerHTML = `<div class="meta">${i.name && i.kind !== 'file' ? esc(i.name) + ' · ' : ''}${i.size ? sz(i.size) + ' · ' : ''}from ${esc(i.device || 'a device')} · ${ago(i.createdAt)}</div>${body}<div class="row"></div>`;
    const row = c.lastChild, btn = (t, cls, fn) => { const b = document.createElement('button'); b.textContent = t; b.className = cls; b.onclick = e => { e.stopPropagation(); fn(); }; row.append(b); };
    const main = () => i.kind === 'image' ? copyImage(u) : i.text ? copyText(i.text) : (location.href = u + '?dl=1');
    c.onclick = main;
    if (i.kind === 'image') btn('Copy image', '', main); else if (i.text) btn('Copy', '', main); else btn('Save', '', main);
    if (i.name && i.kind !== 'file') btn('Save', 'sec', () => location.href = u + '?dl=1'); btn('🗑', 'x', () => removeClip(i)); $('list').append(c); }
  fresh.clear(); }
function removeClip(i) { items = items.filter(x => x.id !== i.id); render(); const t = setTimeout(() => api('/items/' + i.id, { method: 'DELETE' }).catch(() => {}), 5000);
  toast('Clip deleted', 'Undo', () => { clearTimeout(t); items.push(i); items.sort((a, b) => b.createdAt - a.createdAt); render(); }, 5000); }
async function copyText(t, quiet) { try { await navigator.clipboard.writeText(t); toast(quiet ? 'Auto-copied new clip ✓' : 'Copied ✓ — now paste it anywhere'); } catch { toast('Your browser blocked copying. Tap the page, then try again.'); } }
async function copyImage(u) { try { const b = await (await fetch(u)).blob(); let png = b;
    if (b.type !== 'image/png') { const bm = await createImageBitmap(b), cv = document.createElement('canvas'); cv.width = bm.width; cv.height = bm.height; cv.getContext('2d').drawImage(bm, 0, 0); png = await new Promise(r => cv.toBlob(r, 'image/png')); }
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]); toast('Image copied ✓ — now paste it anywhere'); } catch { toast('Could not copy the image. Use Save instead.'); } }

function upload(fd) { return new Promise((res, rej) => { const x = new XMLHttpRequest(); x.open('POST', '/api/items'); const p = $('prog'), bar = p.firstChild;
  x.upload.onprogress = e => { p.style.display = 'block'; bar.style.width = (e.loaded / e.total * 100) + '%'; };
  x.onload = () => { p.style.display = 'none'; let j = {}; try { j = JSON.parse(x.responseText); } catch {} x.status < 300 ? res(j) : rej(new Error(j.error || 'Upload failed')); };
  x.onerror = () => { p.style.display = 'none'; rej(new Error('No internet connection')); }; x.send(fd); }); }
async function send(text, files) { if (!text && !files.length) return toast('Type or paste something first'); const fd = new FormData(); fd.append('device', device); if (text) fd.append('text', text); files.forEach(f => fd.append('files', f, f.name));
  try { toast(files.length ? 'Uploading…' : 'Sending…', null, null, 60000); const out = await upload(fd); out.forEach(i => { if (!items.find(x => x.id === i.id)) { items.unshift(i); fresh.add(i.id); } }); render(); toast('Sent ✓ — it is on your other devices now'); return true; }
  catch (e) { toast(e.message); } }
$('send').onclick = async () => { if (await send($('t').value.trim(), [])) $('t').value = ''; };
$('t').onkeydown = e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) $('send').click(); };
$('pick').onclick = () => $('f').click(); $('f').onchange = () => { send('', [...$('f').files]); $('f').value = ''; };
$('pastebtn').onclick = async () => { try { let any = 0; for (const it of await navigator.clipboard.read()) for (const ty of it.types) {
    if (ty === 'text/plain') { await send(await (await it.getType(ty)).text(), []); any = 1; break; } else if (/^(image|audio|video)\//.test(ty)) { const b = await it.getType(ty); await send('', [new File([b], 'clip.' + ty.split('/')[1].split('+')[0], { type: ty })]); any = 1; break; } }
    if (!any) toast('Your clipboard is empty — copy something first'); }
  catch { try { const t = await navigator.clipboard.readText(); t ? send(t, []) : toast('Your clipboard is empty — copy something first'); } catch { toast('Please allow clipboard access, or long-press the box and choose Paste'); } } };
document.addEventListener('paste', e => { if ($('app').hidden) return; const files = [...(e.clipboardData.files || [])], txt = e.clipboardData.getData('text/plain');
  if (e.target.id === 't' && !files.length) return; if (files.length || txt) { e.preventDefault(); send(files.length ? '' : txt, files); } });
let dc = 0; addEventListener('dragenter', e => { e.preventDefault(); dc++; $('drop').style.display = 'grid'; });
addEventListener('dragleave', () => { if (--dc <= 0) $('drop').style.display = 'none'; }); addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => { e.preventDefault(); dc = 0; $('drop').style.display = 'none'; if (!$('app').hidden) send('', [...e.dataTransfer.files]); });
setInterval(() => { if (!$('app').hidden && !document.hidden) render(); }, 60000);
addEventListener('visibilitychange', () => { if (!document.hidden && !$('app').hidden) start(); });
start();
