// ClipboardPortal "Attach from ClipboardPortal" bookmarklet panel. Loaded onto any website by the bookmark.
(function () {
  var cs = document.currentScript, u = new URL(cs.src), T = u.searchParams.get('t'), O = u.origin;
  if (window.__csb) { window.__csb.remove(); window.__csb = null; return; }
  var h = document.createElement('div'); window.__csb = h; var armed = null;
  h.style.cssText = 'position:fixed;z-index:2147483647;right:12px;bottom:12px;width:min(350px,92vw);max-height:72vh;overflow:auto;background:#fff;color:#272735;border:1px solid #e6e6ec;border-radius:16px;box-shadow:0 8px 30px #0006;font:15px/1.4 system-ui,sans-serif;padding:12px;box-sizing:border-box';
  h.innerHTML = '<div style="display:flex;align-items:center"><b style="letter-spacing:.2em;font-size:13px;flex:1">CLIPBOARDPORTAL</b><span id="csx" style="cursor:pointer;padding:4px 8px">✕</span></div><div id="csm" style="color:#6b6b7b;font-size:13px;margin:6px 0">Tap a clip to attach it to this page.</div><div id="csl">Loading…</div>';
  document.body.appendChild(h);
  var $ = function (i) { return h.querySelector('#' + i); }; $('csx').onclick = function () { cleanup(); };
  function msg(t, bad) { var m = $('csm'); m.textContent = t; m.style.color = bad ? '#b42318' : '#6b6b7b'; }
  function cleanup() { document.removeEventListener('click', onDoc, true); h.remove(); window.__csb = null; }
  function visible(el) { var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; }
  function inputs() { return [].slice.call(document.querySelectorAll('input[type=file]')).filter(function (i) { return !i.disabled && !h.contains(i); }); }
  function setFile(inp, file) {
    var dt = new DataTransfer(); if (inp.multiple && inp.files) for (var i = 0; i < inp.files.length; i++) dt.items.add(inp.files[i]); dt.items.add(file);
    inp.files = dt.files; ['input', 'change'].forEach(function (n) { inp.dispatchEvent(new Event(n, { bubbles: true })); });
  }
  function dropOn(el, file) {
    var dt = new DataTransfer(); dt.items.add(file);
    ['dragenter', 'dragover', 'drop'].forEach(function (n) { el.dispatchEvent(new DragEvent(n, { bubbles: true, cancelable: true, dataTransfer: dt })); });
  }
  function attach(file, el) {
    var list = inputs(), inp = null;
    if (el) { var lab = el.closest && el.closest('label'); inp = el.matches && el.matches('input[type=file]') ? el : lab && lab.control && lab.control.type === 'file' ? lab.control : null; }
    if (!inp && list.length === 1) inp = list[0];
    if (!inp && list.length > 1) { var v = list.filter(visible); if (v.length === 1) inp = v[0]; }
    if (inp) { setFile(inp, file); msg('✓ Attached ' + file.name + '. Check the page.'); armed = null; return true; }
    if (el) { dropOn(el, file); msg('✓ Dropped ' + file.name + ' on that spot.'); armed = null; return true; }
    if (!list.length) { armed = file; msg('No upload field found. Click the exact upload area on the page now.', true); return false; }
    armed = file; msg('This page has several upload fields. Click the one you want now.', true); return false;
  }
  function onDoc(e) {
    if (!armed || h.contains(e.target)) return; e.preventDefault(); e.stopPropagation(); attach(armed, e.target);
  }
  document.addEventListener('click', onDoc, true);
  var proto = HTMLInputElement.prototype, oc = proto.click;
  proto.click = function () { if (armed && this.type === 'file') { var f = armed; armed = null; setFile(this, f); msg('✓ Attached ' + f.name); return; } return oc.apply(this, arguments); };
  function textInto(t) {
    var a = document.activeElement; if (a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && /text|search|url|email/.test(a.type)))) { a.setRangeText(t, a.selectionStart, a.selectionEnd, 'end'); a.dispatchEvent(new Event('input', { bubbles: true })); msg('✓ Inserted text'); }
    else if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { msg('✓ Copied. Now paste it where you want.'); }, function () { msg('Could not copy', true); });
  }
  fetch(O + '/api/bm/items?t=' + T).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (items) {
    var L = $('csl'); L.innerHTML = ''; if (!items.length) { L.textContent = 'No clips yet. Send something from ClipboardPortal first.'; return; }
    items.slice(0, 40).forEach(function (i) {
      var d = document.createElement('div'); d.style.cssText = 'border:1px solid #e6e6ec;border-radius:12px;padding:8px 10px;margin:6px 0;cursor:pointer;word-break:break-word';
      var icon = { image: '🖼', audio: '🎵', video: '🎬', file: '📄', link: '🔗', text: '📝' }[i.kind];
      d.textContent = icon + ' ' + (i.name || (i.text || '').slice(0, 70)); d.onmouseover = function () { d.style.background = '#f1f1f5'; }; d.onmouseout = function () { d.style.background = ''; };
      d.onclick = function () {
        if (!i.name) return textInto(i.text);
        msg('Fetching…'); fetch(O + '/api/bm/file/' + i.id + '?t=' + T).then(function (r) { return r.blob(); }).then(function (b) { attach(new File([b], i.name, { type: i.mime || b.type }), null); }).catch(function () { msg('Could not fetch the file', true); });
      }; L.appendChild(d);
    });
  }).catch(function () { $('csl').textContent = 'Could not load clips. Open ClipboardPortal and re-create the bookmark.'; });
})();
