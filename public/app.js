const $ = id => document.getElementById(id);
const isAndroid = /Android/i.test(navigator.userAgent), isPhone = /Android|iPhone|iPad/i.test(navigator.userAgent);
const device = isAndroid ? 'Android' : /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : /Mac/i.test(navigator.platform) ? 'Mac' : /Win/i.test(navigator.platform) ? 'Windows' : 'Browser';
const myId = localStorage.did || (localStorage.did = (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2)));
let devs = [], items = [], es, pending = new Set(), fresh = new Set();
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
addEventListener('click', () => { $('menu').style.display = 'none'; $('devpanel').style.display = 'none'; });
$('out').onclick = async () => { if (confirm('Log out? If you have not saved your account with an email, use "Add device" first so you can get back in.')) { await post('/logout'); es?.close(); location.reload(); } };
$('del').onclick = async () => { if (confirm('Permanently delete your account and ALL clips? This cannot be undone.')) { await post('/delete-account'); location.reload(); } };
$('secure').onclick = () => $('secm').style.display = 'grid'; $('sclose').onclick = () => $('secm').style.display = 'none';
$('ssave').onclick = async () => { try { await post('/upgrade', { email: $('sem').value, password: $('spw').value }); $('secm').style.display = 'none'; toast('Account saved ✓'); start(); } catch (e) { $('serr').textContent = e.message; } };
let pt, pairBase = 0; function closePair(ok) { clearInterval(pt); if (ok) { $('pairbody').innerHTML = '<div style="font-size:64px">✅</div><h3>Device connected!</h3>'; setTimeout(() => { $('pairm').style.display = 'none'; }, 1200); } else $('pairm').style.display = 'none'; }
async function openPair() { pairBase = devs.filter(x => x.id !== myId).length; if (!$('qr')) location.reload(); $('pairm').style.display = 'grid'; $('host').textContent = location.host; clearInterval(pt);
  try { const { code, expiresIn } = await post('/pair/create'); $('pcode').textContent = code.replace(/(\d{3})(\d{3})/, '$1 $2'); $('qr').src = '/api/pair/qr/' + code;
    let left = expiresIn; $('pexp').textContent = 'Code works once, for 5 minutes.'; pt = setInterval(() => { if (--left <= 0) { clearInterval(pt); openPair(); } }, 1000); }
  catch (e) { $('pexp').textContent = e.message; } }
$('adddev').onclick = openPair; $('pclose').onclick = () => closePair(false);

// ---------- main ----------
async function start() {
  try { const me = await api('/me'); $('welcome').hidden = true; $('app').hidden = false; $('secure').hidden = !!me.email; setDrive(me);
    $('quota').textContent = `${sz(me.used)} of ${sz(me.quota)} used · clips auto-delete after ${me.retentionDays} days`;
    $('auto').checked = localStorage.auto === '1'; items = await api('/items'); if (!localStorage.savedIds) items.forEach(i => savedIds.add(i.id)); render(); connect(); }
  catch { $('welcome').hidden = false; $('app').hidden = true; const c = new URLSearchParams(location.search).get('pair'); if (c) joinCode(c); } }
function setDrive(me) { $('drv').hidden = !me.driveAvailable; $('drvbanner').hidden = !(me.driveAvailable && !me.drive);
  $('drv').textContent = me.drive ? '☁ Google Drive connected (tap to disconnect)' : '☁ Send clips to Google Drive'; window.driveOn = me.drive; }
const driveGo = async () => { if (window.driveOn) { if (confirm('Stop copying new clips to Google Drive? Files already in Drive stay there.')) { await post('/drive/disconnect'); start(); } } else location.href = '/api/drive/connect'; };
$('drv').onclick = driveGo; $('drvgo').onclick = driveGo;
{ const d = new URLSearchParams(location.search).get('drive'); if (d) { history.replaceState(null, '', '/'); setTimeout(() => toast(d === 'ok' ? 'Google Drive connected ✓ Clips now appear in your file picker under Drive → ClipSync' : 'Could not connect Google Drive. Please try again.', null, null, 6000), 800); } }
const savedIds = new Set(JSON.parse(localStorage.savedIds || '[]'));
function dropSave(i, quiet) { if (!i.name || savedIds.has(i.id)) return; savedIds.add(i.id); localStorage.savedIds = JSON.stringify([...savedIds].slice(-300));
  const a = document.createElement('a'); a.href = '/api/items/' + i.id + '/file?dl=1'; a.download = i.name; document.body.append(a); a.click(); a.remove();
  if (!quiet) toast('📥 ' + i.name + ' saved to Downloads. Pick it in any upload: Recent or Downloads.', null, null, 5000); }
$('autosave').checked = localStorage.autosave ? localStorage.autosave === '1' : isAndroid;
$('autosave').onchange = () => { localStorage.autosave = $('autosave').checked ? '1' : '0'; if ($('autosave').checked) { items.forEach(i => savedIds.add(i.id)); toast('Auto-Drop on. If Chrome asks, allow multiple downloads.', null, null, 5000); } };
$('auto').onchange = () => localStorage.auto = $('auto').checked ? '1' : '0';
function connect() { es?.close(); es = new EventSource('/api/stream?d=' + encodeURIComponent(myId) + '&n=' + encodeURIComponent(device));
  es.addEventListener('devices', e => { const d = JSON.parse(e.data); devs = d.devices; drawDevs();
    if (d.joined && d.joined.id !== myId) { toast('✅ ' + d.joined.name + ' connected', null, null, 4000); }
    if ($('pairm').style.display === 'grid' && devs.filter(x => x.id !== myId).length > pairBase) closePair(true);
    if (d.left && d.left.id !== myId) toast(d.left.name + ' went offline', null, null, 2500); });
  es.addEventListener('item', e => { const i = JSON.parse(e.data); if (items.find(x => x.id === i.id)) return; items.unshift(i); fresh.add(i.id); render();
    const mine = i.device === device; if (!mine && $('autosave').checked) dropSave(i); if (!mine && $('auto').checked && i.text) copyText(i.text, true); else if (!mine) toast('New clip from ' + (i.device || 'another device')); });
  es.addEventListener('delete', e => { items = items.filter(x => x.id !== JSON.parse(e.data).id); render(); }); }

function drawDevs() { const n = devs.length, others = devs.filter(d => d.id !== myId).length, c = $('devchip');
  c.className = others ? 'on' : ''; connUI(others, devs.filter(d => d.id !== myId).map(d => d.name).filter((v, i, a) => a.indexOf(v) === i).join(' + ')); c.innerHTML = '<i>●</i> ' + (others ? others + 1 + ' devices' : 'Only this device');
  const p = $('devpanel'); p.innerHTML = '<h3>Connected devices</h3>' + devs.map(d => `<div class="d"><span class="g">●</span><span>${esc(d.name)}${d.id === myId ? ' <small>(this device)</small>' : ''}</span></div>`).join('') +
    (others ? '' : '<small>No other device is connected yet.</small><div class="row"><button onclick="openPair()">＋ Connect another device</button></div>'); }
function connUI(others, names) { const a = $('adddev'), e = $('emptyconn');
  if (a) { a.className = others ? 'ok' : ''; a.innerHTML = others ? '<span class="dc"></span>' + esc(names) + ' connected' : '＋ Add device'; }
  if (e) { e.className = 'big' + (others ? ' ok' : ''); e.innerHTML = others ? '<span class="dc"></span>' + esc(names) + ' connected. Send something!' : (isPhone ? '＋ Connect my computer' : '＋ Connect my phone'); } }
$('devchip').onclick = e => { e.stopPropagation(); $('menu').style.display = 'none'; const p = $('devpanel'); p.style.display = p.style.display === 'block' ? 'none' : 'block'; };
$('devpanel').onclick = e => e.stopPropagation();

function emptyState() { const e = $('empty'); e.hidden = items.length > 0; if (items.length) return;
  e.innerHTML = isPhone ? `<h3>You're in 🎉 Here's how it works</h3><ol class="steps"><li><div><b>Send from here:</b> tap <b>Paste</b> or <b>Files</b> above, or use Android's <b>Share</b> button in any app and pick ClipSync (install the app from ⋯ menu first).</div></li><li><div><b>On your computer:</b> open <b>${esc(location.host)}</b>, then tap <b>I have a code</b>.</div></li><li><div>Tap <b>＋ Add device</b> at the top to get your code.</div></li></ol><button class="big" id="emptyconn" onclick="openPair()">＋ Connect my computer</button>`
  : `<h3>You're in 🎉 Here's how it works</h3><ol class="steps"><li><div><b>Connect your phone:</b> click <b>＋ Add device</b> and scan the QR code with your phone camera.</div></li><li><div><b>Send anything:</b> press <b>${/Mac/.test(device) ? '⌘' : 'Ctrl'}+V</b> on this page to paste text, images or files, or drag files here.</div></li><li><div><b>Get things back:</b> clips from your phone appear here instantly. Click any clip to copy it.</div></li></ol><button class="big" id="emptyconn" onclick="openPair()">＋ Connect my phone</button>`; }
window.openPair = openPair;

function render() { emptyState(); setTimeout(drawDevs, 0); $('list').innerHTML = '';
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
    if (i.name) { c.draggable = true; c.ondragstart = e => { e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData('DownloadURL', (i.mime || 'application/octet-stream') + ':' + i.name + ':' + location.origin + u + '?dl=1'); }; }
    else if (i.text) { c.draggable = true; c.ondragstart = e => e.dataTransfer.setData('text/plain', i.text); }
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
$('bmbtn').onclick = async () => { try { const { token } = await api('/bm/token'); const code = "javascript:(function(){var s=document.createElement('script');s.src='" + location.origin + "/bm.js?t=" + token + "&r='+Date.now();document.body.appendChild(s)})();";
    $('bmlink').setAttribute('href', code); $('bmlink').onclick = e => { e.preventDefault(); toast('Drag this button to your bookmarks bar'); }; $('bmcopy').onclick = async () => { try { await navigator.clipboard.writeText(code); toast('Bookmark copied ✓'); } catch { toast('Could not copy'); } };
    $('bmm').style.display = 'grid'; } catch (e) { toast(e.message); } };
$('bmclose').onclick = () => $('bmm').style.display = 'none';
// mobile: when you come back to ClipSync, offer to send what you just copied
let lastClip = localStorage.lastClip || '';
async function clipOffer() { if (!isPhone || $('app').hidden || !navigator.clipboard?.readText) return; try { const t = (await navigator.clipboard.readText()).trim(); if (!t || t === lastClip) return;
    lastClip = localStorage.lastClip = t; toast('Send what you copied?', 'Send', () => send(t, []), 8000); } catch {} }
addEventListener('focus', clipOffer); document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(clipOffer, 400); });
setInterval(() => { if (!$('app').hidden && !document.hidden) render(); }, 60000);
addEventListener('visibilitychange', () => { if (!document.hidden && !$('app').hidden) start(); });
start();
