// app.js: the studio UI (projects, card list, form, live preview, import/export, print).
'use strict';

const $ = s => document.querySelector(s);
const el = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
};
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const slug = s => String(s || 'card').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/æ/gi, 'ae').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'card';

// ---------- storage (IndexedDB) ----------
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('multiverse-card-studio', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('projects', { keyPath: 'id' }); r.result.createObjectStore('meta'); };
      r.onsuccess = () => { this.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  req(store, mode, fn) {
    return new Promise((res, rej) => {
      const t = this.db.transaction(store, mode);
      const q = fn(t.objectStore(store));
      t.oncomplete = () => res(q && q.result);
      t.onerror = () => rej(t.error);
    });
  },
  all() { return this.req('projects', 'readonly', s => s.getAll()); },
  put(p) { return this.req('projects', 'readwrite', s => s.put(p)); },
  del(id) { return this.req('projects', 'readwrite', s => s.delete(id)); },
  getMeta(k) { return this.req('meta', 'readonly', s => s.get(k)); },
  setMeta(k, v) { return this.req('meta', 'readwrite', s => s.put(v, k)); },
};

// ---------- state ----------
const S = { projects: [], proj: null, cardId: null, bleed: false, guides: true, hist: new Map(), lastHit: null };
const cur = () => S.proj && S.proj.cards.find(c => c.id === S.cardId);
const newCard = (type, data) => ({ id: uid(), type, data: data || defaultData(type) });
const newProject = name => ({ id: uid(), name: name || 'My Deck', cards: [], updated: Date.now() });

let saveTimer = 0;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 500);
}
async function saveNow() {
  clearTimeout(saveTimer);
  if (!S.proj) return;
  S.proj.updated = Date.now();
  try { await DB.put(S.proj); } catch (e) { console.error(e); toast('Could not save: ' + e.message); }
}

function toast(msg) {
  let t = $('#toast');
  if (!t) { t = el('div', { id: 'toast' }); document.body.append(t); Object.assign(t.style, { position: 'fixed', bottom: '40px', left: '50%', transform: 'translateX(-50%)', background: '#ffc21a', color: '#111', padding: '8px 14px', borderRadius: '8px', fontWeight: 700, zIndex: 99, boxShadow: '0 6px 20px rgba(0,0,0,.5)' }); }
  t.textContent = msg; t.style.display = 'block';
  clearTimeout(t._h); t._h = setTimeout(() => { t.style.display = 'none'; }, 2600);
}

// ---------- history ----------
function hist(card) {
  let h = S.hist.get(card.id);
  if (!h) { h = { stack: [cloneVal(card.data)], i: 0 }; S.hist.set(card.id, h); }
  return h;
}
let histTimer = 0;
let histPending = null;
function pushHistory(now) {
  clearTimeout(histTimer);
  const card = cur();
  const go = () => {
    histPending = null;
    const c = card && S.proj && S.proj.cards.includes(card) ? card : null; if (!c) return;
    const h = hist(c);
    h.stack.length = h.i + 1;
    h.stack.push(cloneVal(c.data));
    if (h.stack.length > 120) h.stack.shift();
    h.i = h.stack.length - 1;
    updateUndo();
  };
  if (now) go(); else { histPending = go; histTimer = setTimeout(go, 450); }
}
function flushHistory() { if (histPending) { clearTimeout(histTimer); histPending(); } }
function undoRedo(dir) {
  clearTimeout(histTimer);
  const c = cur(); if (!c) return;
  const h = hist(c);
  // commit pending edits first so undo goes back past them
  if (JSON.stringify(h.stack[h.i]) !== JSON.stringify(c.data) && dir < 0) {
    h.stack.length = h.i + 1; h.stack.push(cloneVal(c.data)); h.i++;
  }
  const ni = h.i + dir;
  if (ni < 0 || ni >= h.stack.length) return;
  h.i = ni;
  c.data = cloneVal(h.stack[ni]);
  buildForm(); requestRender(); scheduleSave(); updateUndo();
}
function updateUndo() {
  const c = cur();
  const h = c && hist(c);
  $('#tbUndo').disabled = !h || h.i <= 0;
  $('#tbRedo').disabled = !h || h.i >= h.stack.length - 1;
}

// ---------- rendering ----------
const preview = $('#preview');
let renderBusy = false, renderAgain = false, lastR = null;
function requestRender() {
  if (renderBusy) { renderAgain = true; return; }
  renderBusy = true;
  setTimeout(async () => {
    try { await renderPreview(); } catch (e) { console.error(e); }
    renderBusy = false;
    if (renderAgain) { renderAgain = false; requestRender(); }
  }, 0);
}
async function renderPreview() {
  const c = cur();
  $('#emptyMsg').hidden = !!c;
  preview.hidden = !c;
  if (!c) return;
  lastR = await renderCard(c, preview, { bleed: S.bleed });
  if (S.guides) drawGuides(lastR);
  if (S.move) drawPartOutlines(lastR);
  if (S.guides) drawOverflow(lastR);
  $('#fitWarn').hidden = !lastR.overflow.some(r => !r.tiny);
  $('#fitTiny').hidden = !(lastR.overflow.length && lastR.overflow.every(r => r.tiny));
  fitPreview();
  scheduleThumb(c);
}
function drawOverflow(R) {
  const { ctx, bleed } = R;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, bleed, bleed);
  for (const r of R.overflow) { ctx.setLineDash([12, 6]); ctx.lineWidth = 4; ctx.strokeStyle = r.tiny ? 'rgba(255,170,0,.95)' : 'rgba(255,40,40,.95)'; ctx.strokeRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8); }
  ctx.restore();
}
function drawGuides(R) {
  const { ctx, W, H, bleed } = R;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, bleed, bleed);
  ctx.setLineDash([10, 8]); ctx.lineWidth = 2;
  if (bleed) { ctx.strokeStyle = 'rgba(0,220,255,.9)'; ctx.strokeRect(0, 0, W, H); }
  ctx.strokeStyle = 'rgba(255,60,200,.55)'; ctx.strokeRect(36, 36, W - 72, H - 72);
  ctx.restore();
}
function fitPreview() {
  const wrap = $('#canvasWrap');
  const aw = wrap.clientWidth - 36, ah = wrap.clientHeight - 36;
  const s = Math.min(aw / preview.width, ah / preview.height, 1);
  preview.style.width = Math.floor(preview.width * s) + 'px';
  preview.style.height = Math.floor(preview.height * s) + 'px';
}
window.addEventListener('resize', fitPreview);

const thumbTimers = new Map();
function scheduleThumb(card) {
  clearTimeout(thumbTimers.get(card.id));
  thumbTimers.set(card.id, setTimeout(() => drawThumb(card), 400));
}
async function drawThumb(card) {
  const cv = document.querySelector(`.ci[data-id="${card.id}"] canvas`);
  if (cv) await renderCard(card, cv, { scale: 0.16, exporting: true });
}

// ---------- card list ----------
function buildList() {
  const list = $('#cardList');
  list.innerHTML = '';
  if (!S.proj) return;
  for (const c of S.proj.cards) {
    const cv = el('canvas');
    const item = el('div', { class: 'ci' + (c.id === S.cardId ? ' on' : '') + (TEMPLATES[c.type].orient === 'h' ? ' h' : TEMPLATES[c.type].orient === 's' ? ' s' : ''), 'data-id': c.id, onclick: () => selectCard(c.id) },
      cv, el('div', { class: 't' }, el('b', {}, cardLabel(c)), el('small', {}, typeLine(c))));
    list.append(item);
    renderCard(c, cv, { scale: 0.16, exporting: true });
  }
  updateDeckSum();
  buildProjSel();
}
function typeLine(c) { const n = cardCopies(c); return TEMPLATES[c.type].name + (n !== 1 && !ONE_COPY_TYPES.has(c.type) ? '  ×' + n : ''); }
function refreshListItem(c) {
  const it = document.querySelector(`.ci[data-id="${c.id}"] .t b`);
  if (it) it.textContent = cardLabel(c);
  const sm = document.querySelector(`.ci[data-id="${c.id}"] .t small`);
  if (sm) sm.textContent = typeLine(c);
  updateDeckSum();
}
// Card counts per deck (copies included). Hero decks are 40 cards.
const DECK_SIZES = { eeHeroDeck: ['Hero deck (Enhanced)', 40], oblDeck: ['OblivAeon deck', 0], oblAeon: ['Aeon Men', 0], heroDeck: ['Hero deck', 40], villainDeck: ['Villain deck', 0], envDeck: ['Environment deck', 0], eventFront: ['Events', 0], criticalFront: ['Critical events', 0], principle: ['Principles', 0] };
function updateDeckSum() {
  const box = $('#deckSum'); if (!box) return;
  box.innerHTML = '';
  if (!S.proj) return;
  const n = {};
  for (const c of S.proj.cards) if (DECK_SIZES[c.type]) n[c.type] = (n[c.type] || 0) + cardCopies(c);
  for (const [t, v] of Object.entries(n)) {
    const [label, want] = DECK_SIZES[t];
    box.append(el('span', { class: want && v !== want ? 'off' : want ? 'ok' : '', title: want ? `A ${label.toLowerCase()} has ${want} cards` : '' }, `${label}: ${v}${want ? ' / ' + want : ''}`));
  }
}
function selectCard(id) {
  flushHistory();
  S.cardId = id; S.lastHit = null;
  document.querySelectorAll('.ci').forEach(e => e.classList.toggle('on', e.dataset.id === id));
  buildForm(); requestRender(); updateUndo();
  DB.setMeta('last', { proj: S.proj.id, card: id }).catch(() => {});
}

// ---------- form ----------
function buildForm() {
  const form = $('#form');
  const c = cur();
  form.innerHTML = '';
  $('#edType').textContent = c ? TEMPLATES[c.type].name : '';
  if (!c) return;
  c.data = withDefaults(c.type, c.data);
  const d = c.data;
  let group = form;
  for (const f of TEMPLATES[c.type].fields) {
    if (f.type === 'section') {
      group = el('details', { open: !f.closed }, el('summary', {}, f.label));
      form.append(group);
      continue;
    }
    if (f.showIf && !f.showIf(d)) continue;
    group.append(fieldRow(c, f));
  }
}

function fieldRow(c, f) {
  const d = c.data;
  const set = (v, opts = {}) => {
    d[f.key] = v;
    requestRender(); scheduleSave(); pushHistory(opts.now);
    if (['title', 'name', 'caption', 'copies'].includes(f.key)) refreshListItem(c);
    if (f.rebuild) buildForm();
  };
  const row = el('div', { class: 'fr' + (f.short ? ' short' : '') });
  const id = 'f_' + f.key;
  const label = el('label', { for: id }, f.label);
  if (f.type === 'text') {
    row.append(label, el('input', { type: 'text', id, value: d[f.key] ?? '', oninput: e => set(e.target.value) }));
  } else if (f.type === 'area') {
    const ta = el('textarea', { id, rows: f.rows || 3, oninput: e => set(e.target.value) });
    ta.value = d[f.key] ?? '';
    row.append(label, ta);
    if (f.chips) {
      const ins = s => {
        const a = ta.selectionStart, b = ta.selectionEnd, v = ta.value;
        let t = s;
        if (s === 'BOLD') t = '**' + (v.slice(a, b) || 'bold') + '**';
        if (/^(> |POWER: |Start Phase: |Play Phase: |End Phase: )$/.test(s) && a > 0 && v[a - 1] !== '\n') t = '\n' + s;
        ta.value = v.slice(0, a) + t + v.slice(b);
        ta.focus(); ta.selectionStart = ta.selectionEnd = a + t.length;
        set(ta.value, { now: true });
      };
      row.append(el('div', { class: 'chips' },
        [['(H)', '(H)'], ['flip', '[flip]'], ['POWER:', 'POWER: '], ['Start Phase', 'Start Phase: '], ['Play Phase', 'Play Phase: '], ['End Phase', 'End Phase: '], ['▸ bullet', '> '], ['bold', 'BOLD']]
          .map(([l, s]) => el('button', { type: 'button', onclick: () => ins(s) }, l))));
    }
  } else if (f.type === 'range') {
    const out = el('output', {}, d[f.key]);
    row.append(label, el('div', { class: 'rangeRow' },
      el('input', { type: 'range', id, min: f.min, max: f.max, step: f.step, value: d[f.key], oninput: e => { out.textContent = e.target.value; set(+e.target.value); } }), out));
  } else if (f.type === 'color') {
    row.classList.add('inline');
    row.append(label, el('input', { type: 'color', id, value: d[f.key] || '#888888', oninput: e => set(e.target.value) }));
  } else if (f.type === 'toggle') {
    row.classList.add('inline');
    const cb = el('input', { type: 'checkbox', id, onchange: e => set(e.target.checked, { now: true }) });
    cb.checked = !!d[f.key];
    row.append(label, cb);
  } else if (f.type === 'select') {
    const sel = el('select', { id, onchange: e => set(e.target.value, { now: true }) },
      f.options.map(([v, l]) => el('option', { value: v, selected: d[f.key] === v }, l)));
    row.append(label, sel);
  } else if (f.type === 'image') {
    row.append(label, imageField(c, f));
  } else if (f.type === 'button') {
    row.append(el('button', { type: 'button', onclick: () => FORM_ACTIONS[f.action] && FORM_ACTIONS[f.action](c) }, f.label));
  }
  if (f.help) row.append(el('div', { class: 'help' }, f.help));
  return row;
}

// Divider back: list this project's deck cards of the same kind.
const FORM_ACTIONS = {
  fillList(c) {
    const kind = c.data.kind || 'Hero';
    const type = { Hero: 'heroDeck', Villain: 'villainDeck', Environment: 'envDeck' }[kind];
    const cards = S.proj.cards.filter(x => x.type === type && cardCopies(x) > 0);
    if (!cards.length) return toast(`This project has no ${kind.toLowerCase()} deck cards yet.`);
    const code = String(c.data.name || 'X').normalize('NFD').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'X';
    const merged = new Map();
    for (const x of cards) { const k = String(x.data.title || '').trim(); const m = merged.get(k); if (m) m.q += cardCopies(x); else merged.set(k, { q: cardCopies(x), k: x.data.keywords || '' }); }
    let i = 0;
    c.data.list = [...merged].sort((a, b) => a[0].localeCompare(b[0])).map(([n, v]) => `${v.q} | ${n} | ${v.k} | ${code}${String(++i).padStart(2, '0')}`).join('\n');
    buildForm(); requestRender(); scheduleSave(); pushHistory(true);
    toast(`Listed ${merged.size} cards.`);
  },
};

function imageField(c, f) {
  const a = c.data[f.key] || {};
  const th = el('div', { class: 'th' + (a.src ? ' has' : ''), title: 'Choose image', onclick: () => chooseImage(f.key) }, '+');
  if (a.src) th.style.backgroundImage = `url("${a.src}")`;
  const zoom = el('input', {
    type: 'range', min: 0.1, max: 8, step: 0.01, value: a.zoom || 1,
    oninput: e => { c.data[f.key].zoom = +e.target.value; requestRender(); scheduleSave(); pushHistory(); },
  });
  const wrap = el('div', { class: 'imgF' }, th,
    el('div', { class: 'btns' },
      el('button', { type: 'button', onclick: () => chooseImage(f.key) }, a.src ? 'Replace' : 'Choose…'),
      el('button', { type: 'button', onclick: () => imageFromUrl(f.key) }, 'From URL'),
      a.src ? el('button', { type: 'button', onclick: () => { const alts = a.alts; c.data[f.key] = { src: '', x: 0, y: 0, zoom: 1, ...(alts && alts.length ? { alts } : {}) }; afterImageChange(); } }, 'Remove') : null,
      a.src ? el('button', { type: 'button', onclick: () => openCrop(f.key) }, 'Crop…') : null,
      a.src ? el('button', { type: 'button', onclick: async () => { if (await autoFrame(f.key)) afterImageChange(); } }, 'Auto frame') : null,
      a.src ? el('button', { type: 'button', onclick: () => { Object.assign(c.data[f.key], { x: 0, y: 0, zoom: 1 }); afterImageChange(); } }, 'Center') : null,
      a.src ? el('button', { type: 'button', title: 'Keep this picture (and its framing) as a version you can switch back to', onclick: () => keepVersion(c, f.key) }, '+ Version') : null),
    a.src ? el('div', { class: 'zr rangeRow' }, el('small', {}, 'Zoom'), zoom) : null,
    altsRow(c, f.key));
  return wrap;
}

// ---------- art versions ----------
// Each image can hold other versions (picture + framing). Clicking one swaps it in.
const plainArt = a => ({ src: a.src, x: a.x || 0, y: a.y || 0, zoom: a.zoom || 1 });
function keepVersion(c, key) {
  const a = c.data[key]; if (!a || !a.src) return;
  a.alts = a.alts || [];
  const same = a.alts.find(v => v.src === a.src && v.x === (a.x || 0) && v.y === (a.y || 0) && v.zoom === (a.zoom || 1));
  if (same) return toast('That version is already kept.');
  a.alts.push(plainArt(a));
  afterImageChange(); toast('Version kept. Add or replace the picture; click a version to switch back.');
}
function altsRow(c, key) {
  const a = c.data[key];
  if (!a || !a.alts || !a.alts.length) return null;
  return el('div', { class: 'alts' }, el('small', {}, 'Versions'),
    ...a.alts.map((v, i) => {
      const t = el('div', { class: 'alt', title: 'Use this version', onclick: () => {
        const now = plainArt(a), keep = a.alts;
        c.data[key] = { ...plainArt(v), alts: keep };
        if (now.src) keep[i] = now; else keep.splice(i, 1);
        afterImageChange();
      } }, el('button', { type: 'button', class: 'x', title: 'Delete this version', onclick: e => { e.stopPropagation(); a.alts.splice(i, 1); afterImageChange(); } }, '×'));
      t.style.backgroundImage = `url("${v.src}")`;
      return t;
    }));
}

function afterImageChange() { buildForm(); requestRender(); scheduleSave(); pushHistory(true); }

let pendingImgKey = null;
function chooseImage(key) { pendingImgKey = key; $('#fileImg').value = ''; $('#fileImg').click(); }
$('#fileImg').addEventListener('change', async e => {
  const f = e.target.files[0];
  if (f && pendingImgKey) await setImageFromFile(pendingImgKey, f);
});
function driveDirect(u) {
  const m = /drive\.google\.com\/.*(?:\/d\/|[?&]id=)([\w-]{20,})/.exec(u);
  return m ? 'https://lh3.googleusercontent.com/d/' + m[1] : u;
}
async function imageFromUrl(key) {
  let url = prompt('Image URL or Google Drive share link (the file must be shared as "Anyone with the link"):');
  if (!url) return;
  url = driveDirect(url.trim());
  try {
    let r;
    try { r = await fetch(url, { mode: 'cors' }); }
    catch (e) { return toast('Could not load that address. Either the site blocks loading its images here, or the address is wrong. Download the image and choose the file instead.'); }
    if (!r.ok) return toast(`That address answered "${r.status}": the image isn't there (or isn't shared publicly).`);
    const b = await r.blob();
    if (!/^image\//.test(b.type || '')) return toast('That address is a web page, not an image. Right-click the picture and copy the image address instead.');
    await setImageFromFile(key, b);
  } catch (e) { toast('That file could not be read as an image.'); }
}

// Reads an image file into a data URL, shrinking very large images.
async function fileToDataUrl(file, maxDim = 3000) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const keepAlpha = /png|webp|gif|svg/.test(file.type || '');
    const s = Math.min(1, maxDim / Math.max(img.width, img.height));
    if (s === 1 && file.size < 6e6) return await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL(keepAlpha ? 'image/png' : 'image/jpeg', 0.92);
  } finally { URL.revokeObjectURL(url); }
}
async function setImageFromFile(key, file) {
  const c = cur(); if (!c) return;
  try {
    const src = await fileToDataUrl(file);
    const alts = c.data[key] && c.data[key].alts;
    c.data[key] = { src, x: 0, y: 0, zoom: 1, ...(alts && alts.length ? { alts } : {}) };
    await autoFrame(key);
    afterImageChange();
  } catch (e) { toast('That file could not be read as an image.'); }
}

// ---------- smart framing ----------
// Finds the main subject: the opaque pixels of a cut-out, or the pixels that differ
// most from the picture's edge color. Returns a box in image pixels, or null.
function subjectBox(img) {
  const n = 96, k = Math.min(1, n / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  let px;
  try { px = g.getImageData(0, 0, w, h).data; } catch (e) { return null; }
  const N = w * h, mask = new Uint8Array(N);
  let clear = 0;
  for (let i = 0; i < N; i++) if (px[i * 4 + 3] < 200) clear++;
  if (clear > N * 0.04) {
    for (let i = 0; i < N; i++) mask[i] = px[i * 4 + 3] > 40 ? 1 : 0;
  } else {
    let r = 0, gg = 0, b = 0, c = 0;
    const add = (x, y) => { const i = (y * w + x) * 4; r += px[i]; gg += px[i + 1]; b += px[i + 2]; c++; };
    for (let x = 0; x < w; x++) { add(x, 0); add(x, h - 1); }
    for (let y = 0; y < h; y++) { add(0, y); add(w - 1, y); }
    r /= c; gg /= c; b /= c;
    const d = new Float32Array(N); let sum = 0;
    for (let i = 0; i < N; i++) { d[i] = Math.hypot(px[i * 4] - r, px[i * 4 + 1] - gg, px[i * 4 + 2] - b); sum += d[i]; }
    const thr = Math.max(40, (sum / N) * 1.1);
    for (let i = 0; i < N; i++) mask[i] = d[i] > thr ? 1 : 0;
  }
  const xs = [], ys = [];
  for (let i = 0; i < N; i++) if (mask[i]) { xs.push(i % w); ys.push((i / w) | 0); }
  if (xs.length < N * 0.02 || xs.length > N * 0.92) return null;
  xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
  const q = (arr, t) => arr[Math.min(arr.length - 1, Math.floor(arr.length * t))];
  const x0 = q(xs, 0.03), x1 = q(xs, 0.97) + 1, y0 = q(ys, 0.02), y1 = q(ys, 0.99) + 1;
  return { x: x0 / k, y: y0 / k, w: (x1 - x0) / k, h: (y1 - y0) / k };
}

// Places an image so its subject sits well in its spot on the card.
async function autoFrame(key) {
  const c = cur(); const a = c && c.data[key];
  if (!a || !a.src) return false;
  const hit = lastR && lastR.hits.find(h => h.key === key);
  if (!hit) return false;
  const img = await loadImg(a.src);
  if (!img) return false;
  const box = subjectBox(img);
  const rect = hit.rect, fit = hit.fit || 'cover';
  if (!box) { Object.assign(a, { x: 0, y: 0, zoom: 1 }); return true; }
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const base = artBase(img, rect, fit);
  let zoom, x0, y0;
  if (fit === 'cover') {
    const fillNow = Math.max(box.w * base / rect.w, box.h * base / rect.h);
    zoom = Math.min(2.5, Math.max(1, 0.8 / fillNow));
    const s = base * zoom;
    x0 = rect.x + rect.w * (hit.fx ?? 0.5) - cx * s;
    y0 = rect.y + rect.h * (hit.fy ?? 0.5) - cy * s;
    x0 = Math.min(rect.x, Math.max(rect.x + rect.w - img.width * s, x0));
    y0 = Math.min(rect.y, Math.max(rect.y + rect.h - img.height * s, y0));
  } else {
    zoom = Math.max(0.2, Math.min(6, Math.min(rect.w * 0.96 / box.w, rect.h * 0.96 / box.h) / base));
    const s = base * zoom;
    x0 = rect.x + rect.w / 2 - cx * s;
    y0 = fit === 'contain-bottom' ? rect.y + rect.h - (box.y + box.h) * s : rect.y + rect.h / 2 - cy * s;
  }
  const off = artOffsets(img, rect, fit, zoom, x0, y0);
  Object.assign(a, { x: off.x, y: off.y, zoom: +zoom.toFixed(3) });
  return true;
}

// ---------- crop box ----------
const crop = { key: null, img: null, hit: null, view: null, drag: null };
async function openCrop(key) {
  const c = cur(); const a = c && c.data[key];
  const hit = lastR && lastR.hits.find(h => h.key === key);
  if (!a || !a.src || !hit) return toast('Show this card first, then crop.');
  crop.key = key; crop.hit = hit; crop.img = await loadImg(a.src);
  if (!crop.img) return;
  $('#cropZoom').value = a.zoom || 1;
  $('#dlgCrop').showModal();
  drawCrop();
}
function cropRegion() {
  const a = cur().data[crop.key], r = crop.hit.rect;
  const g = artGeom(a, crop.img, r, crop.hit.fit || 'cover');
  return { s: g.s, u: (r.x - g.x0) / g.s, v: (r.y - g.y0) / g.s, uw: r.w / g.s, vh: r.h / g.s };
}
function drawCrop() {
  const cv = $('#cropCanvas'), img = crop.img, reg = cropRegion();
  const minU = Math.min(0, reg.u), minV = Math.min(0, reg.v);
  const maxU = Math.max(img.width, reg.u + reg.uw), maxV = Math.max(img.height, reg.v + reg.vh);
  const k = Math.min(680 / (maxU - minU), 460 / (maxV - minV));
  cv.width = Math.round((maxU - minU) * k); cv.height = Math.round((maxV - minV) * k);
  crop.view = { k, minU, minV };
  const g = cv.getContext('2d');
  const X = u => (u - minU) * k, Y = v => (v - minV) * k;
  g.fillStyle = '#0d0f13'; g.fillRect(0, 0, cv.width, cv.height);
  g.globalAlpha = 0.3; g.drawImage(img, X(0), Y(0), img.width * k, img.height * k); g.globalAlpha = 1;
  g.save(); g.beginPath(); g.rect(X(reg.u), Y(reg.v), reg.uw * k, reg.vh * k); g.clip();
  g.drawImage(img, X(0), Y(0), img.width * k, img.height * k); g.restore();
  g.lineWidth = 2; g.strokeStyle = '#ffc21a'; g.strokeRect(X(reg.u), Y(reg.v), reg.uw * k, reg.vh * k);
}
function cropSet(u, v, zoom) {
  const a = cur().data[crop.key], r = crop.hit.rect, fit = crop.hit.fit || 'cover';
  const s = artBase(crop.img, r, fit) * zoom;
  const off = artOffsets(crop.img, r, fit, zoom, r.x - u * s, r.y - v * s);
  Object.assign(a, { x: off.x, y: off.y, zoom });
  drawCrop(); requestRender(); scheduleSave();
}
function cropZoomTo(z) {
  const reg = cropRegion();
  const cu = reg.u + reg.uw / 2, cv = reg.v + reg.vh / 2;
  const s = artBase(crop.img, crop.hit.rect, crop.hit.fit || 'cover') * z;
  cropSet(cu - crop.hit.rect.w / s / 2, cv - crop.hit.rect.h / s / 2, z);
}
$('#cropZoom').addEventListener('input', e => cropZoomTo(+e.target.value));
$('#cropCanvas').addEventListener('pointerdown', e => {
  const reg = cropRegion();
  crop.drag = { x: e.clientX, y: e.clientY, u: reg.u, v: reg.v, z: cur().data[crop.key].zoom || 1 };
  e.target.setPointerCapture(e.pointerId);
});
$('#cropCanvas').addEventListener('pointermove', e => {
  if (!crop.drag) return;
  const r = e.target.getBoundingClientRect(), k = crop.view.k * (r.width / e.target.width);
  cropSet(crop.drag.u + (e.clientX - crop.drag.x) / k, crop.drag.v + (e.clientY - crop.drag.y) / k, crop.drag.z);
});
$('#cropCanvas').addEventListener('pointerup', () => { crop.drag = null; pushHistory(true); });
$('#cropCanvas').addEventListener('wheel', e => {
  e.preventDefault();
  const z = Math.max(0.1, Math.min(8, (cur().data[crop.key].zoom || 1) * Math.exp(-e.deltaY * 0.0012)));
  $('#cropZoom').value = z; cropZoomTo(z);
}, { passive: false });
$('#cropAuto').onclick = async () => { await autoFrame(crop.key); $('#cropZoom').value = cur().data[crop.key].zoom; drawCrop(); requestRender(); scheduleSave(); };
$('#cropDone').onclick = () => $('#dlgCrop').close();
$('#dlgCrop').addEventListener('close', () => { pushHistory(true); buildForm(); });

// ---------- move parts mode ----------
function drawPartOutlines(R) {
  const { ctx, bleed } = R;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, bleed, bleed);
  ctx.font = `600 18px ${TF.label}`; ctx.textBaseline = 'bottom';
  for (const p of R.parts) {
    const r = p.rect, on = drag && drag.part === p.name;
    ctx.setLineDash(on ? [] : [8, 6]); ctx.lineWidth = on ? 4 : 2.5;
    ctx.strokeStyle = on ? '#ffb000' : 'rgba(0,200,255,.95)'; ctx.strokeRect(r.x, r.y, r.w, r.h);
    const tw = ctx.measureText(p.name).width + 10;
    ctx.fillStyle = 'rgba(0,120,170,.9)'; ctx.fillRect(r.x, r.y - 22, tw, 22);
    ctx.fillStyle = '#fff'; ctx.fillText(p.name, r.x + 5, r.y - 2);
  }
  ctx.restore();
}
function partAt(p) {
  if (!lastR) return null;
  let best = null;
  for (const q of lastR.parts) {
    const r = q.rect;
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h && (!best || r.w * r.h < best.rect.w * best.rect.h)) best = q;
  }
  return best;
}
function partData(name) { const d = cur().data; d.parts = d.parts || {}; return d.parts[name] = d.parts[name] || { x: 0, y: 0, s: 1 }; }
$('#tbMove').onchange = e => {
  S.move = e.target.checked;
  $('#tbResetParts').hidden = !S.move;
  $('.hint').textContent = S.move ? 'Move parts: drag a box to move it, scroll to resize, double-click to put it back.' : HINT;
  requestRender();
};
$('#tbResetParts').onclick = () => { const c = cur(); if (!c || !c.data.parts) return; delete c.data.parts; requestRender(); scheduleSave(); pushHistory(true); toast('Layout reset'); };

// ---------- preview interaction: drag, zoom, drop, paste ----------
function toCard(e) {
  const r = preview.getBoundingClientRect();
  const b = lastR ? lastR.bleed : 0;
  return { x: (e.clientX - r.left) / r.width * preview.width - b, y: (e.clientY - r.top) / r.height * preview.height - b };
}
function hitAt(p, want) {
  if (!lastR) return null;
  for (let i = lastR.hits.length - 1; i >= 0; i--) {
    const h = lastR.hits[i], r = h.rect;
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h && want(h)) return h;
  }
  return null;
}
const usable = h => h.has || h.click;
let drag = null;
const HINT = $('.hint').textContent;
preview.addEventListener('pointerdown', e => {
  const p = toCard(e);
  if (S.move) {
    const q = partAt(p); if (!q) return;
    const o = partData(q.name);
    drag = { part: q.name, p, ox: o.x, oy: o.y, moved: false };
    preview.setPointerCapture(e.pointerId); preview.className = 'grabbing';
    requestRender();
    return;
  }
  const h = hitAt(p, usable);
  if (!h) return;
  S.lastHit = h.key;
  if (!h.has) { if (e.button === 0) chooseImage(h.key); return; }
  const a = cur().data[h.key];
  drag = { key: h.key, p, ox: a.x || 0, oy: a.y || 0, moved: false };
  preview.setPointerCapture(e.pointerId);
  preview.className = 'grabbing';
});
preview.addEventListener('pointermove', e => {
  const p = toCard(e);
  if (drag && drag.part) {
    const o = partData(drag.part);
    const lim = Math.max(lastR.W, lastR.H) * 0.9;
    o.x = Math.max(-lim, Math.min(lim, Math.round(drag.ox + (p.x - drag.p.x)))); o.y = Math.max(-lim, Math.min(lim, Math.round(drag.oy + (p.y - drag.p.y))));
    drag.moved = true; requestRender();
    return;
  }
  if (S.move) { const q = partAt(p); preview.className = q ? 'grab' : ''; preview.title = q ? q.name + ': drag to move, scroll to resize, double-click to reset' : ''; return; }
  if (drag) {
    const a = cur().data[drag.key];
    a.x = Math.round(drag.ox + (p.x - drag.p.x));
    a.y = Math.round(drag.oy + (p.y - drag.p.y));
    drag.moved = true;
    requestRender();
    return;
  }
  const h = hitAt(p, usable);
  preview.className = h ? (h.has ? 'grab' : 'pick') : '';
  if (h) { S.lastHit = h.key; preview.title = h.has ? 'Drag to move · scroll to zoom · double-click to replace' : 'Click to add an image'; }
  else preview.title = '';
});
preview.addEventListener('pointerup', () => {
  if (drag && drag.moved) { scheduleSave(); pushHistory(true); }
  const was = drag && drag.part;
  drag = null; preview.className = '';
  if (was) requestRender();
});
preview.addEventListener('dblclick', e => {
  if (S.move) { const q = partAt(toCard(e)); if (q && cur().data.parts) { delete cur().data.parts[q.name]; requestRender(); scheduleSave(); pushHistory(true); } return; }
  const h = hitAt(toCard(e), h => h.has); if (h) chooseImage(h.key);
});
preview.addEventListener('wheel', e => {
  if (S.move) {
    const q = partAt(toCard(e)); if (!q) return;
    e.preventDefault();
    const o = partData(q.name);
    o.s = Math.max(0.35, Math.min(2.5, Math.round((o.s || 1) * Math.exp(-e.deltaY * 0.0012) * 1000) / 1000));
    requestRender(); scheduleSave(); pushHistory();
    return;
  }
  const h = hitAt(toCard(e), h => h.has);
  if (!h) return;
  e.preventDefault();
  const a = cur().data[h.key];
  a.zoom = Math.max(0.1, Math.min(8, (a.zoom || 1) * Math.exp(-e.deltaY * 0.0012)));
  requestRender(); scheduleSave(); pushHistory();
  const z = document.querySelector(`#form .imgF .zr input`); // keep the slider roughly in sync on next build
  if (z) clearTimeout(z._t), z._t = setTimeout(buildForm, 600);
}, { passive: false });

const wrap = $('#canvasWrap');
wrap.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); wrap.classList.add('drop'); } });
wrap.addEventListener('dragleave', () => wrap.classList.remove('drop'));
wrap.addEventListener('drop', async e => {
  e.preventDefault(); wrap.classList.remove('drop');
  const f = [...e.dataTransfer.files].find(f => f.type.startsWith('image/'));
  if (!f || !cur()) return;
  const h = hitAt(toCard(e), usable);
  const key = h ? h.key : firstImageKey();
  if (key) await setImageFromFile(key, f);
});
document.addEventListener('paste', async e => {
  if (/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
  const item = [...(e.clipboardData || {}).items || []].find(i => i.type.startsWith('image/'));
  if (!item || !cur()) return;
  e.preventDefault();
  const c = cur(), ok = S.lastHit && TEMPLATES[c.type].fields.some(f => f.type === 'image' && f.key === S.lastHit && (!f.showIf || f.showIf(c.data)));
  await setImageFromFile(ok ? S.lastHit : firstImageKey(), item.getAsFile());
});
function firstImageKey() {
  const c = cur();
  const f = c && TEMPLATES[c.type].fields.find(f => f.type === 'image' && (!f.showIf || f.showIf(c.data)));
  return f && f.key;
}

// ---------- card actions ----------
function addCards(types) {
  if (!S.proj) return;
  const at = S.proj.cards.findIndex(c => c.id === S.cardId);
  const made = types.map(t => newCard(t));
  if (made.length === 2 && made[0].type === made[1].type && /^(villainChar|teamVillain)$/.test(made[0].type)) {
    made[1].data.title = made[0].type === 'teamVillain' ? 'Incapacitated' : 'Flipped Side'; made[1].data.setup = ''; made[1].data.hp = '';
    if (made[0].type === 'teamVillain') made[1].data.keywords = '';
  } else if (made.length === 2 && made[0].type === made[1].type && TEMPLATES[made[0].type].flipDefaults) Object.assign(made[1].data, TEMPLATES[made[0].type].flipDefaults);
  if (made.length === 2) { const pid = uid(); made[0].pair = pid; made[1].pair = pid; }
  let pos = at < 0 ? S.proj.cards.length : at + 1;
  const sel = S.proj.cards[at];
  if (sel && sel.pair) { const j = S.proj.cards.findIndex((c, k) => k !== at && c.pair === sel.pair); if (j >= 0) pos = Math.max(at, j) + 1; }
  S.proj.cards.splice(pos, 0, ...made);
  scheduleSave(); buildList(); selectCard(made[0].id);
}
// Cards made as a pair keep a shared pair id. Older projects fall back to list order.
function pairOf(cards, i) {
  const c = cards[i];
  if (c.pair) { const j = cards.findIndex((x, k) => k !== i && x.pair === c.pair); return j > i ? j : -1; }
  const pt = TTS_PAIR[c.type], nx = cards[i + 1];
  return pt && nx && nx.type === pt && !nx.pair ? i + 1 : -1;
}
$('#tbDup').onclick = () => {
  const c = cur(); if (!c) return;
  const n = { id: uid(), type: c.type, data: cloneVal(c.data) };
  S.proj.cards.splice(S.proj.cards.indexOf(c) + 1, 0, n);
  scheduleSave(); buildList(); selectCard(n.id);
};
$('#tbDel').onclick = () => {
  const c = cur(); if (!c) return;
  if (!confirm(`Delete "${cardLabel(c)}"?`)) return;
  const i = S.proj.cards.indexOf(c);
  S.proj.cards.splice(i, 1);
  S.hist.delete(c.id);
  const next = S.proj.cards[Math.min(i, S.proj.cards.length - 1)];
  S.cardId = next ? next.id : null;
  scheduleSave(); buildList(); buildForm(); requestRender(); updateUndo();
};
function move(dir) {
  const c = cur(); if (!c) return;
  const a = S.proj.cards, i = a.indexOf(c), j = i + dir;
  if (j < 0 || j >= a.length) return;
  [a[i], a[j]] = [a[j], a[i]];
  scheduleSave(); buildList();
}
$('#tbUp').onclick = () => move(-1);
$('#tbDown').onclick = () => move(1);
$('#tbUndo').onclick = () => undoRedo(-1);
$('#tbRedo').onclick = () => undoRedo(1);
$('#tbBleed').onchange = e => { S.bleed = e.target.checked; requestRender(); };
$('#tbGuides').onchange = e => { S.guides = e.target.checked; requestRender(); };
document.addEventListener('keydown', e => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); undoRedo(e.shiftKey ? 1 : -1); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); undoRedo(1); }
});

// ---------- export ----------
function download(blob, name) {
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function cardPng(card, bleed) {
  const cv = document.createElement('canvas');
  await renderCard(card, cv, { bleed, exporting: true });
  return await new Promise((res, rej) => {
    try { cv.toBlob(b => b ? res(b) : rej(new Error('empty')), 'image/png'); } catch (e) { rej(e); }
  });
}
$('#tbPng').onclick = async () => {
  const c = cur(); if (!c) return;
  try { download(await cardPng(c, S.bleed), slug(cardLabel(c)) + '.png'); }
  catch (e) { toast('Export blocked: an image came from a site that does not allow it. Re-add it from a file.'); }
};
$('#btnZip').onclick = async () => {
  if (!S.proj || !S.proj.cards.length) return;
  toast('Building PNGs…');
  const files = [], used = new Set();
  let n = 0;
  for (const c of S.proj.cards) {
    n++;
    let name = String(n).padStart(2, '0') + '-' + slug(cardLabel(c)) + '-' + slug(c.type);
    while (used.has(name)) name += '-2';
    used.add(name);
    try { files.push({ name: name + '.png', data: new Uint8Array(await (await cardPng(c, S.bleed)).arrayBuffer()) }); }
    catch (e) { toast('Skipped one card: blocked image.'); }
  }
  download(makeZip(files), slug(S.proj.name) + '-cards.zip');
};
$('#tbCopy').onclick = async () => {
  const c = cur(); if (!c) return;
  const txt = JSON.stringify({ app: 'multiverse-card-studio', version: 1, card: c });
  try { await navigator.clipboard.writeText(txt); toast('Card copied. Paste it into a .json file, or import it.'); }
  catch (e) { download(new Blob([txt], { type: 'application/json' }), slug(cardLabel(c)) + '.card.json'); }
};
$('#btnGallery').onclick = () => window.open('https://unitysworkshop.com/card-gallery/', '_blank', 'noopener');
$('#btnExportJson').onclick = async () => {
  if (!S.proj) return;
  await saveNow();
  const blob = new Blob([JSON.stringify({ app: 'multiverse-card-studio', version: 1, project: S.proj })], { type: 'application/json' });
  download(blob, slug(S.proj.name) + '.mcs.json');
};

// ---------- import ----------
$('#btnImport').onclick = () => { $('#fileImport').value = ''; $('#fileImport').click(); };
let pendingRows = null;
$('#fileImport').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  const text = await f.text();
  try {
    if (/\.(csv|tsv|txt)$/i.test(f.name)) { pendingRows = parseTable(text); openImportType(); return; }
    const j = JSON.parse(text.replace(/,\s*([\]}])/g, '$1'));
    if (j.app === 'multiverse-card-studio' && j.project) {
      const p = j.project;
      p.id = uid(); p.name = p.name + (S.projects.some(q => q.name === p.name) ? ' (imported)' : '');
      p.cards = p.cards.filter(c => TEMPLATES[c.type]).map(c => ({ ...c, id: uid() }));
      S.projects.push(p); await DB.put(p); openProject(p.id); toast('Project imported');
      return;
    }
    if (j.app === 'multiverse-card-studio' && j.card && TEMPLATES[j.card.type]) {
      const c = { ...j.card, id: uid() };
      const at = S.proj.cards.findIndex(x => x.id === S.cardId);
      S.proj.cards.splice(at + 1, 0, c); scheduleSave(); buildList(); selectCard(c.id); toast('Card imported');
      return;
    }
    const rows = Array.isArray(j) ? j : [j];
    pendingRows = rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v == null ? '' : String(v)])));
    openImportType();
  } catch (err) { console.error(err); toast('Could not read that file.'); }
});
function parseTable(text) {
  const tab = text.split('\n')[0].includes('\t');
  const rows = [];
  if (tab) text.replace(/\r/g, '').split('\n').filter(l => l.trim()).forEach(l => rows.push(l.split('\t')));
  else {
    let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (ch === '"') q = false; else f += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { row.push(f); f = ''; }
      else if (ch === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
      else if (ch !== '\r') f += ch;
    }
    if (f || row.length) { row.push(f); rows.push(row); }
  }
  const head = rows.shift() || [];
  return rows.filter(r => r.some(x => x.trim())).map(r => Object.fromEntries(head.map((h, i) => [h, r[i] || ''])));
}
function openImportType() {
  const sel = $('#impType');
  sel.innerHTML = '';
  for (const [k, t] of Object.entries(TEMPLATES)) sel.append(el('option', { value: k }, t.group + ': ' + t.name));
  const keys = Object.keys(pendingRows[0] || {}).join(' ').toLowerCase();
  sel.value = /incap/.test(keys) ? 'heroChar' : 'heroDeck';
  $('#dlgImportType').showModal();
}
const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const ALIASES = { gametext: 'gameText', text: 'gameText', image: 'art', imageurl: 'art', innatepowername: 'powerName', powername: 'powerName', innatepowereffect: 'powerText', power: 'powerText', deck: 'name', hero: 'name', featuredissue: 'issue', incapacitatedcaption: 'caption', description: 'title', flavortext: 'flavor', collectionflavortext: 'collFlavor', collectionissues: 'issues' };
$('#impGo').onclick = () => {
  const type = $('#impType').value, tpl = TEMPLATES[type];
  const fmap = new Map();
  for (const f of tpl.fields) if (f.key) { fmap.set(norm(f.key), f); fmap.set(norm(f.label), f); }
  const made = [];
  for (const row of pendingRows || []) {
    const data = defaultData(type);
    for (const f of tpl.fields) if (f.type === 'area' || f.type === 'text') data[f.key] = '';
    const opts = [];
    const direct = new Set(Object.keys(row).map(k => fmap.get(norm(k))).filter(Boolean).map(f => f.key));
    for (const [k, v] of Object.entries(row)) {
      const nk = norm(k);
      if (/^incapacitatedoption\d$/.test(nk)) { if (v && v !== '-') opts.push(v); continue; }
      const f = fmap.get(nk) || (direct.has(ALIASES[nk]) ? null : tpl.fields.find(x => x.key === ALIASES[nk]));
      if (!f) continue;
      if (f.type === 'image') { if (/^(https?:|data:)/.test(v)) data[f.key] = { src: v, x: (+row.ImageX || 0) * 3, y: (+row.ImageY || 0) * 3, zoom: (+row.ImageZoom || 100) / 100 }; }
      else if (f.type === 'toggle') data[f.key] = !!v && v !== '0' && v.toLowerCase() !== 'false';
      else if (f.type === 'range') data[f.key] = +v || f.def;
      else data[f.key] = v === '-' ? '' : v.replace(/\\n/g, '\n');
    }
    if (opts.length && 'options' in data) data.options = opts.join('\n');
    if ('suddenly' in data && row.Suddenly !== undefined) data.suddenly = true;
    for (const f of tpl.fields) if ((f.type === 'area' || f.type === 'text') && data[f.key] === '' && ['labelPrefix', 'gradeLabel', 'keywords'].includes(f.key)) data[f.key] = cloneVal(f.def);
    made.push(newCard(type, data));
  }
  $('#dlgImportType').close();
  if (!made.length) return toast('No rows found.');
  S.proj.cards.push(...made);
  scheduleSave(); buildList(); selectCard(made[0].id);
  toast(`Imported ${made.length} card${made.length > 1 ? 's' : ''}`);
};

// ---------- print ----------
// Lays cards out on pages at their real size (inches). Landscape cards are turned to portrait.
// Each item: { w, h } in inches; returns pages of { item, x, y } from the printable area's top-left.
function packPages(items, pw, ph, gap = 0) {
  items = items.map((it, i) => [it, i]).sort((a, b) => (b[0].h - a[0].h) || (b[0].w - a[0].w) || (a[1] - b[1])).map(a => a[0]); // same sizes share rows
  const pages = []; let page = [], x = 0, y = 0, rowH = 0, row = [];
  const centerRow = () => { const used = row.length ? Math.max(...row.map(p => p.x + p.item.w)) : 0; const off = (pw - used) / 2; row.forEach(p => p.x += off); row = []; };
  for (const it of items) {
    if (x > 0 && x + it.w > pw + 1e-6) { centerRow(); x = 0; y += rowH + gap; rowH = 0; }
    if (y > 0 && y + it.h > ph + 1e-6) { centerRow(); pages.push(page); page = []; x = 0; y = 0; rowH = 0; }
    const p = { item: it, x, y }; page.push(p); row.push(p);
    x += it.w + gap; rowH = Math.max(rowH, it.h);
  }
  centerRow(); if (page.length) pages.push(page);
  return pages;
}
async function printImages(cards, copies, type) {
  const out = [];
  for (const c of cards) {
    const cv = document.createElement('canvas');
    await renderCard(c, cv, { exporting: true });
    let im = cv, [w, h] = cardInches(c.type);
    if (cv.width > cv.height) {
      im = document.createElement('canvas'); im.width = cv.height; im.height = cv.width;
      const g = im.getContext('2d'); g.translate(im.width, 0); g.rotate(Math.PI / 2); g.drawImage(cv, 0, 0);
      [w, h] = [h, w];
    }
    let data;
    try { data = type === 'blob' ? await new Promise(res => im.toBlob(res, 'image/jpeg', 0.92)) : im.toDataURL('image/jpeg', 0.95); }
    catch (e) { toast('Skipped a card with a blocked image.'); continue; }
    if (!data) continue;
    if (type === 'blob') data = { w: im.width, h: im.height, bytes: new Uint8Array(await data.arrayBuffer()) };
    const n = copies * cardCopies(c);
    for (let k = 0; k < n; k++) out.push({ data, w, h });
  }
  return out;
}
const PAPER = { letter: [8.5, 11], a4: [8.27, 11.69] };
$('#btnPrint').onclick = () => $('#dlgPrint').showModal();
$('#prGo').onclick = async () => {
  const which = $('#prWhich').value, copies = Math.max(1, Math.min(20, +$('#prCopies').value || 1));
  const cards = which === 'cur' ? [cur()].filter(Boolean) : S.proj.cards;
  $('#dlgPrint').close();
  if (!cards.length) return;
  toast('Preparing print sheets…');
  const area = $('#printArea');
  area.innerHTML = '';
  const imgs = await printImages(cards, copies, 'url');
  const [pw, ph] = PAPER[$('#prPaper').value === 'a4' ? 'a4' : 'letter'].map(v => v - 0.5);
  const style = el('style', { id: 'pageStyle' }, `@page { size: ${$('#prPaper').value === 'a4' ? 'A4' : 'letter'} portrait; margin: 0.25in; }`);
  area.append(style);
  for (const pg of packPages(imgs, pw, ph - 0.1)) {
    const page = el('div', { class: 'pp' + ($('#prLines').checked ? ' lines' : '') });
    page.style.width = pw + 'in'; page.style.height = (ph - 0.15) + 'in';
    for (const p of pg) { const im = el('img', { src: p.item.data }); Object.assign(im.style, { left: p.x + 'in', top: (p.y + 0.1) + 'in', width: p.item.w + 'in', height: p.item.h + 'in' }); page.append(im); }
    area.append(page);
  }
  await Promise.race([
    Promise.all([...area.querySelectorAll('img')].map(i => i.decode().catch(() => {}))),
    new Promise(r => setTimeout(r, 4000)),
  ]);
  window.print();
};
window.addEventListener('afterprint', () => { $('#printArea').innerHTML = ''; });

// ---------- new card picker ----------
let pickerBuilt = false;
async function buildPicker() {
  if (pickerBuilt) return;
  pickerBuilt = true;
  const grid = $('#pickGrid');
  for (const [group, items] of PICKER) {
    grid.append(el('h3', {}, group));
    const row = el('div', { class: 'pickRow' });
    grid.append(row);
    for (const it of items) {
      const types = Array.isArray(it) ? it : [it];
      const label = Array.isArray(it)
        ? (it[0] === it[1] ? TEMPLATES[it[0]].name.replace(/ \([^)]*\)$| card$/i, '') + ' (front + flipped)' : TEMPLATES[it[0]].name.replace(/ \([^)]*\)$| card$/i, '') + ' (front + back)')
        : TEMPLATES[it].name;
      const cvs = types.map(() => el('canvas'));
      const wide = types.length > 1 || TEMPLATES[types[0]].orient === 'h';
      const btn = el('button', { type: 'button', class: 'pickItem' + (wide ? ' wide' : ''), onclick: () => { $('#dlgNew').close(); addCards(types); } },
        el('div', { class: 'pv' + (types.length > 1 ? ' pair' : '') }, cvs),
        el('span', {}, label),
        TEMPLATES[types[0]].badge ? el('i', {}, TEMPLATES[types[0]].badge) : null);
      row.append(btn);
      types.forEach((t, i) => {
        const demo = newCard(t);
        if (types.length === 2 && types[0] === types[1] && i === 1 && TEMPLATES[t].flipDefaults) Object.assign(demo.data, TEMPLATES[t].flipDefaults);
        else if (types.length === 2 && types[0] === types[1] && i === 1) { demo.data.title = t === 'teamVillain' ? 'Incapacitated' : 'Flipped Side'; demo.data.hp = ''; if (t === 'teamVillain') demo.data.keywords = ''; }
        renderCard(demo, cvs[i], { scale: 0.17, exporting: true });
      });
    }
  }
}
$('#btnNewCard').onclick = async () => { await buildPicker(); $('#dlgNew').showModal(); };
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());
$('#btnHelp').onclick = () => $('#dlgHelp').showModal();

// ---------- Tabletop Simulator export ----------
// Builds TTS deck sheets (up to 10 x 7 cards per image) and a Saved Object file that
// spawns a bag with every deck. Character cards get their own back (Unique Backs);
// deck cards share the project's deck back of the same kind.
const TTS_PAIR = { heroChar: 'heroCharBack', faFront: 'faBack', villainChar: 'villainChar', teamVillain: 'teamVillain', eventFront: 'eventBack', criticalFront: 'villainChar',
  eeHeroChar: 'eeHeroCharBack', eeVillainChar: 'eeVillainChar', eeVillainInstr: 'eeVillainInstr', eeTeamVillain: 'eeTeamVillain', oblBooklet: 'oblBooklet', oblScion: 'oblScion', oblMission: 'oblReward', oblShield: 'oblShield' };
const TTS_DECK_NAMES = { heroDeck: 'Hero deck', villainDeck: 'Villain deck', envDeck: 'Environment deck', principle: 'Principles deck', eeHeroDeck: 'Hero deck', eeVillainDeck: 'Villain deck', eeEnvDeck: 'Environment deck', oblDeck: 'OblivAeon deck', oblAeon: 'Aeon Men deck' };
const TTS_CHAR_NAMES = { Hero: 'Hero character cards', Villain: 'Villain character cards', Events: 'Event cards' };
const TTS_BACK_FOR = { heroDeck: 'heroBack', villainDeck: 'villainBack', envDeck: 'envBack', principle: 'principleBack', eeHeroDeck: 'eeHeroBack', eeVillainDeck: 'eeVillainBack', eeEnvDeck: 'eeEnvBack', oblDeck: 'oblDeckBack', oblAeon: 'oblAeonBack' };
const NO_TTS_TYPES = new Set(['dividerFront', 'dividerBack']);
const TTS_BACK_TYPES = new Set(['heroBack', 'villainBack', 'envBack', 'principleBack', 'eeHeroBack', 'eeVillainBack', 'eeEnvBack', 'oblDeckBack', 'oblAeonBack']);

function ttsGroups(cards) {
  const chars = new Map(), decks = new Map();
  const used = new Set();
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    if (TTS_BACK_TYPES.has(c.type) || used.has(i) || NO_TTS_TYPES.has(c.type)) continue;
    const pt = TTS_PAIR[c.type];
    if (pt) {
      const j = pairOf(cards, i);
      let back = null;
      if (j >= 0) { back = cards[j]; used.add(j); }
      const o = TEMPLATES[c.type].orient, grp = TEMPLATES[c.type].group, gk = grp + '|' + o + '|' + cardSize(c.type).join('x') + (/^(ee|obl)/.test(c.type) ? '|' + c.type : '');
      if (!chars.has(gk)) chars.set(gk, { name: grp === 'Villain' && o === 'v' ? 'Team villain cards' : TTS_CHAR_NAMES[grp] || TEMPLATES[c.type].ttsName || (/^(ee|obl)/.test(c.type) ? TEMPLATES[c.type].name.replace(/ \(.*\)$/, '') + 's' : grp + ' cards'), faces: [], backs: [], unique: true, orient: o });
      chars.get(gk).faces.push(c); chars.get(gk).backs.push(back);
      continue;
    }
    if (!cardCopies(c)) continue;
    if (!decks.has(c.type)) decks.set(c.type, []);
    decks.get(c.type).push(c);
  }
  const groups = [...chars.values()];
  for (const [t, list] of decks) {
    const bt = TTS_BACK_FOR[t];
    groups.push({ name: TTS_DECK_NAMES[t] || TEMPLATES[t].name.replace(/ \(.*\)$/, ''), faces: list, back: bt ? cards.find(c => c.type === bt) || null : null, unique: false, orient: TEMPLATES[t].orient });
  }
  // TTS holds at most 69 cards per sheet (the 70th slot is the hidden face)
  const out = [];
  for (const g of groups) {
    for (let i = 0; i < g.faces.length; i += 69) {
      out.push({ ...g, name: g.faces.length > 69 ? `${g.name} ${i / 69 + 1}` : g.name, faces: g.faces.slice(i, i + 69), backs: g.backs ? g.backs.slice(i, i + 69) : null });
    }
  }
  return out;
}

function genericBack(W, H, label) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#2a2f3a'); gr.addColorStop(1, '#0e1014');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  halftone(g, { x: 0, y: 0, w: W, h: H }, 'rgba(255,255,255,.08)', { step: 16, dir: 'radial' });
  g.fillStyle = 'rgba(255,255,255,.75)'; g.textAlign = 'center'; g.textBaseline = 'middle';
  fitFont(g, label.toUpperCase(), TF.comic, W * 0.8, W * 0.12);
  g.fillText(label.toUpperCase(), W / 2, H / 2);
  return cv;
}

async function ttsSheet(list, W, H, blankLabel) {
  const n = list.length, cols = Math.min(10, n), rows = Math.ceil(n / cols);
  const k = Math.min(1, 4096 / (cols * W), 4096 / (rows * H));
  const cw = Math.floor(W * k), ch = Math.floor(H * k);
  const sheet = document.createElement('canvas'); sheet.width = cols * cw; sheet.height = rows * ch;
  const g = sheet.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, sheet.width, sheet.height);
  const tmp = document.createElement('canvas');
  for (let i = 0; i < n; i++) {
    const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
    if (list[i]) {
      await renderCard(list[i], tmp, { scale: k, exporting: true });
      if ((TEMPLATES[list[i].type].orient === 'h') !== (W > H)) {
        g.save(); g.translate(x + cw / 2, y + ch / 2); g.rotate(Math.PI / 2); g.drawImage(tmp, -ch / 2, -cw / 2, ch, cw); g.restore();
      } else g.drawImage(tmp, x, y, cw, ch);
    }
    else g.drawImage(genericBack(W, H, blankLabel || ''), x, y, cw, ch);
  }
  return { canvas: sheet, cols, rows };
}

const canvasBytes = cv => new Promise((res, rej) => {
  try { cv.toBlob(async b => b ? res(new Uint8Array(await b.arrayBuffer())) : rej(new Error('empty')), 'image/png'); } catch (e) { rej(e); }
});

async function buildTTS(proj, folderPath) {
  const name = proj.name.replace(/[\\/:*?"<>|]+/g, '').trim() || 'Card Studio';
  const sub = 'Card Studio - ' + name;
  const base = 'file:///' + String(folderPath || '').trim().replace(/\\/g, '/').replace(/\/+$/, '') + '/' + sub + '/';
  const files = [];
  const objs = [];
  let deckKey = 0;
  const groups = ttsGroups(proj.cards);
  if (!groups.length) throw new Error('No playable cards in this project yet.');
  for (const g of groups) {
    deckKey++;
    const first = g.faces.find(Boolean) || (g.backs || []).find(Boolean);
    const [W, H] = first ? cardSize(first.type) : g.orient === 'h' ? [1050, 750] : [750, 1050];
    const [inW, inH] = first ? cardInches(first.type) : [2.5, 3.5];
    const tag = String(deckKey).padStart(2, '0') + '-' + slug(g.name);
    const faces = await ttsSheet(g.faces, W, H);
    const faceFile = tag + '-faces.png';
    files.push({ name: faceFile, data: await canvasBytes(faces.canvas) });
    let backFile;
    if (g.unique) {
      const backs = await ttsSheet(g.backs, W, H, 'No back');
      backFile = tag + '-backs.png';
      files.push({ name: backFile, data: await canvasBytes(backs.canvas) });
    } else {
      let bc;
      if (g.back) { bc = document.createElement('canvas'); await renderCard(g.back, bc, { scale: Math.min(1, faces.canvas.width / faces.cols / W), exporting: true }); }
      else bc = genericBack(W, H, g.name);
      backFile = tag + '-back.png';
      files.push({ name: backFile, data: await canvasBytes(bc) });
    }
    const cd = { FaceURL: base + faceFile, BackURL: base + backFile, NumWidth: faces.cols, NumHeight: faces.rows, BackIsHidden: true, UniqueBack: g.unique, Type: 0 };
    const side = g.orient === 'h';
    // TTS cards are 2.5 x 3.5 at scale 1; bigger cards are scaled to their real size and shape
    const [sx, sz] = side ? [Math.max(inW, inH) / 3.5, Math.min(inW, inH) / 2.5] : [inW / 2.5, inH / 3.5];
    const tf = x => ({ posX: x, posY: 1, posZ: 0, rotX: 0, rotY: 180, rotZ: 0, scaleX: +sx.toFixed(3), scaleY: 1, scaleZ: +sz.toFixed(3) });
    // copies share one picture on the sheet (same CardID)
    const cardsJ = g.faces.flatMap((c, i) => Array.from({ length: cardCopies(c) }, () => ({
      Name: 'Card', Transform: tf(0), Nickname: cardLabel(c), Description: TEMPLATES[c.type].name,
      CardID: deckKey * 100 + i, SidewaysCard: side, HideWhenFaceDown: !g.unique, CustomDeck: { [deckKey]: cd },
    })));
    const x = (objs.length % 6) * 3.2 - 8, z = Math.floor(objs.length / 6) * -4.4;
    if (cardsJ.length === 1) objs.push({ ...cardsJ[0], Transform: { ...tf(x), posZ: z } });
    else objs.push({
      Name: 'Deck', Transform: { ...tf(x), posZ: z }, Nickname: g.name, Description: '', SidewaysCard: side, HideWhenFaceDown: !g.unique,
      DeckIDs: cardsJ.map(c => c.CardID), CustomDeck: { [deckKey]: cd }, ContainedObjects: cardsJ,
    });
  }
  const save = {
    SaveName: name, GameMode: '', Gravity: 0.5, PlayArea: 0.5, Date: '', Table: '', Sky: '', Note: '', Rules: '', XmlUI: '', LuaScript: '', LuaScriptState: '',
    ObjectStates: [{
      Name: 'Bag', Nickname: name, Description: 'Made with Multiverse Card Studio',
      Transform: { posX: 0, posY: 1, posZ: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
      ColorDiffuse: { r: 0.2, g: 0.35, b: 0.7 }, ContainedObjects: objs,
    }],
  };
  // thumbnail for the Saved Objects menu
  const th = document.createElement('canvas'); th.width = th.height = 256;
  const tg = th.getContext('2d'); tg.fillStyle = '#14161c'; tg.fillRect(0, 0, 256, 256);
  const first = proj.cards.find(c => !TTS_BACK_TYPES.has(c.type));
  if (first) {
    const tmp = document.createElement('canvas'); await renderCard(first, tmp, { scale: 0.3, exporting: true });
    const s = Math.min(240 / tmp.width, 240 / tmp.height);
    tg.drawImage(tmp, (256 - tmp.width * s) / 2, (256 - tmp.height * s) / 2, tmp.width * s, tmp.height * s);
  }
  const enc = new TextEncoder();
  const readme = [
    'Multiverse Card Studio: Tabletop Simulator export for "' + name + '"',
    '',
    'This folder must sit at: ' + String(folderPath).trim().replace(/[\\/]+$/, '') + '\\' + sub,
    '(the card images are linked to that exact place on this PC).',
    '',
    'In Tabletop Simulator: Objects > Saved Objects > "' + sub + '" > "' + name + '".',
    'A bag appears with every deck. Character cards have their own backs.',
    '',
    'PLAYING WITH FRIENDS: the images live on your PC, so before friends can see them,',
    'spawn the bag, then use Modding > Cloud Manager > "Upload All Loaded Files" (or right-click',
    'the bag > Save Object after uploading). That puts the images on your Steam Cloud and',
    'fixes the links for everyone.',
  ].join('\r\n');
  return {
    sub, files: [
      ...files,
      { name: name + '.json', data: enc.encode(JSON.stringify(save, null, 2)) },
      { name: name + '.png', data: await canvasBytes(th) },
      { name: 'README.txt', data: enc.encode(readme) },
    ],
  };
}

const TTS_DEFAULT = 'C:\\Users\\YOU\\Documents\\My Games\\Tabletop Simulator\\Saves\\Saved Objects';
$('#btnTTS').onclick = async () => {
  let p = '';
  try { p = (await DB.getMeta('ttsPath')) || ''; } catch (e) {}
  $('#ttsPath').value = p || TTS_DEFAULT;
  const groups = S.proj ? ttsGroups(S.proj.cards) : [];
  $('#ttsSummary').textContent = groups.length
    ? groups.map(g => { const n = g.faces.reduce((a, c) => a + cardCopies(c), 0); return `${g.name}: ${n} card${n > 1 ? 's' : ''}${g.unique ? ' (own backs)' : g.back ? ' + "' + cardLabel(g.back) + '" back' : ' + plain back'}`; }).join(' · ')
    : 'No playable cards yet.';
  $('#ttsSaveFolder').hidden = !window.showDirectoryPicker;
  $('#dlgTTS').showModal();
};
async function ttsRun(toFolder) {
  const path = $('#ttsPath').value.trim();
  if (!path || path.includes('\\YOU\\')) return toast('Type the path of your Tabletop Simulator "Saved Objects" folder first.');
  DB.setMeta('ttsPath', path).catch(() => {});
  let dir = null;
  if (toFolder) {
    try { dir = await window.showDirectoryPicker({ id: 'tts', mode: 'readwrite' }); } catch (e) { return; }
  }
  toast('Building Tabletop Simulator decks…');
  let out;
  try { out = await buildTTS(S.proj, path); } catch (e) { return toast(e.message || 'Export failed (a blocked image?).'); }
  if (dir) {
    const subDir = await dir.getDirectoryHandle(out.sub, { create: true });
    for (const f of out.files) {
      const fh = await subDir.getFileHandle(f.name, { create: true });
      const w = await fh.createWritable(); await w.write(f.data); await w.close();
    }
    toast('Saved. In Tabletop Simulator: Objects > Saved Objects > ' + out.sub);
  } else {
    download(makeZip(out.files.map(f => ({ name: out.sub + '/' + f.name, data: f.data }))), slug(S.proj.name) + '-tabletop-simulator.zip');
    toast('Unzip it into your Saved Objects folder.');
  }
  $('#dlgTTS').close();
}
$('#ttsSaveFolder').onclick = () => ttsRun(true);
$('#ttsZip').onclick = () => ttsRun(false);

// ---------- share by link (GitHub Gist) ----------
// The project goes into a secret gist on the user's own GitHub account, one file per
// picture. The link opens this site with #gist=<id>, which offers to import it.
const GIST_TOKEN_KEY = 'mcs-gist-token';
function tokenGet() { try { return localStorage.getItem(GIST_TOKEN_KEY) || ''; } catch (e) { return ''; } }
function tokenSet(v) { try { v ? localStorage.setItem(GIST_TOKEN_KEY, v) : localStorage.removeItem(GIST_TOKEN_KEY); } catch (e) {} }
async function shrinkForShare(src) {
  if (!/^data:image\//.test(src) || src.length < 400000) return src;
  const img = await loadImg(src);
  if (!img) return src;
  const s = Math.min(1, 2000 / Math.max(img.width, img.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  const out = cv.toDataURL('image/webp', 0.86);
  return out.startsWith('data:image/webp') && out.length < src.length ? out : src;
}
async function shareFiles(proj) {
  const p = cloneVal(proj);
  const files = {}, seen = new Map();
  let n = 0;
  const take = async a => {
    if (!a || typeof a !== 'object' || !a.src || !/^data:/.test(a.src)) return;
    if (!seen.has(a.src)) { const name = 'img' + (++n) + '.txt'; seen.set(a.src, name); files[name] = { content: await shrinkForShare(a.src) }; }
    a.src = 'gistfile:' + seen.get(a.src);
  };
  for (const c of p.cards) for (const v of Object.values(c.data || {})) {
    if (v && typeof v === 'object' && 'src' in v) { await take(v); for (const alt of v.alts || []) await take(alt); }
  }
  for (const ic of p.icons || []) await take(ic);
  files['project.mcs.json'] = { content: JSON.stringify({ app: 'multiverse-card-studio', version: 1, project: p }) };
  return files;
}
$('#btnShare').onclick = () => {
  $('#shToken').value = tokenGet();
  $('#shOut').hidden = true;
  $('#dlgShare').showModal();
};
$('#shForget').onclick = () => { tokenSet(''); $('#shToken').value = ''; toast('Token removed from this browser.'); };
$('#shGo').onclick = async () => {
  const token = $('#shToken').value.trim();
  if (!token) return toast('Paste your GitHub token first (see the steps above).');
  if (!S.proj) return;
  tokenSet(token);
  toast('Uploading…');
  try {
    await saveNow();
    const files = await shareFiles(S.proj);
    const r = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'Multiverse Card Studio: ' + S.proj.name, public: false, files }),
    });
    if (!r.ok) throw new Error(r.status === 401 ? 'GitHub did not accept that token.' : r.status === 422 ? 'GitHub refused the upload (too big?).' : 'GitHub said ' + r.status + '.');
    const j = await r.json();
    const link = location.origin + location.pathname + '#gist=' + j.id;
    $('#shLink').value = link; $('#shOut').hidden = false;
    try { await navigator.clipboard.writeText(link); toast('Link copied.'); } catch (e) { toast('Link ready.'); }
  } catch (e) { toast(e.message || 'Upload failed.'); }
};
$('#shCopy').onclick = async () => { try { await navigator.clipboard.writeText($('#shLink').value); toast('Link copied.'); } catch (e) { $('#shLink').select(); } };
async function gistText(file) {
  if (!file.truncated) return file.content;
  const r = await fetch(file.raw_url); if (!r.ok) throw new Error('Could not read a shared file.');
  return await r.text();
}
async function openSharedLink() {
  const m = /[#&]gist=([0-9a-f]{8,40})/i.exec(location.hash);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    toast('Opening the shared project…');
    const r = await fetch('https://api.github.com/gists/' + m[1], { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error(r.status === 404 ? 'That shared link no longer exists.' : 'GitHub said ' + r.status + '.');
    const g = await r.json();
    const main = g.files['project.mcs.json'];
    if (!main) throw new Error('That link is not a Card Studio project.');
    const j = JSON.parse(await gistText(main));
    const p = j.project;
    if (!p || !Array.isArray(p.cards)) throw new Error('That link is not a Card Studio project.');
    if (!confirm(`Add the shared project "${p.name}" (${p.cards.length} cards) to your projects?`)) return;
    const cache = new Map();
    const fill = async a => {
      if (!a || typeof a !== 'object' || !/^gistfile:/.test(a.src || '')) return;
      const name = a.src.slice(9);
      if (!cache.has(name)) cache.set(name, g.files[name] ? await gistText(g.files[name]) : '');
      a.src = cache.get(name);
    };
    for (const c of p.cards) for (const v of Object.values(c.data || {})) {
      if (v && typeof v === 'object' && 'src' in v) { await fill(v); for (const alt of v.alts || []) await fill(alt); }
    }
    for (const ic of p.icons || []) await fill(ic);
    p.id = uid(); p.name = p.name + (S.projects.some(q => q.name === p.name) ? ' (shared)' : '');
    p.cards = p.cards.filter(c => TEMPLATES[c.type]).map(c => ({ ...c, id: uid() }));
    S.projects.push(p); await DB.put(p); await openProject(p.id); toast('Shared project added.');
  } catch (e) { toast(e.message || 'Could not open that link.'); }
}
window.addEventListener('hashchange', openSharedLink);

// ---------- PDF ----------
async function buildPdf(cards, copies, paper, lines) {
  const [pwIn, phIn] = PAPER[paper === 'a4' ? 'a4' : 'letter'];
  const list = await printImages(cards, copies, 'blob');
  const m = 0.25, pages = [];
  for (const pg of packPages(list, pwIn - 2 * m, phIn - 2 * m)) {
    const bottom = Math.max(...pg.map(p => p.y + p.item.h));
    const oy = m + (phIn - 2 * m - bottom) / 2;
    const items = pg.map(p => ({ img: p.item.data, x: (m + p.x) * 72, y: (oy + p.y) * 72, w: p.item.w * 72, h: p.item.h * 72 }));
    const ls = [];
    if (lines) for (const it of items) {
      ls.push([it.x, it.y, it.x + it.w, it.y], [it.x, it.y + it.h, it.x + it.w, it.y + it.h], [it.x, it.y, it.x, it.y + it.h], [it.x + it.w, it.y, it.x + it.w, it.y + it.h]);
    }
    pages.push({ items, lines: ls });
  }
  return makePdf(pages, pwIn * 72, phIn * 72);
}
$('#prPdf').onclick = async () => {
  const which = $('#prWhich').value, copies = Math.max(1, Math.min(20, +$('#prCopies').value || 1));
  const cards = which === 'cur' ? [cur()].filter(Boolean) : S.proj.cards;
  if (!cards.length) return;
  $('#dlgPrint').close();
  toast('Building the PDF…');
  try { download(await buildPdf(cards, copies, $('#prPaper').value, $('#prLines').checked), slug(S.proj.name) + '-print.pdf'); }
  catch (e) { console.error(e); toast('PDF failed: an image came from a site that does not allow it.'); }
};

// ---------- text icons ({name} in game text) ----------
const iconName = s => String(s || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24);
function syncIcons() {
  TEXT_ICONS.clear();
  for (const ic of (S.proj && S.proj.icons) || []) {
    if (!ic.name || !ic.src) continue;
    loadImg(ic.src).then(img => { if (img && S.proj && (S.proj.icons || []).includes(ic)) { TEXT_ICONS.set(ic.name, img); requestRender(); buildList(); } });
  }
}
function buildIcons() {
  const box = $('#icList'); box.innerHTML = '';
  const list = S.proj.icons || [];
  if (!list.length) box.append(el('p', { class: 'muted' }, 'No pictures yet.'));
  list.forEach((ic, i) => {
    const name = el('input', { type: 'text', value: ic.name, spellcheck: 'false' });
    name.onchange = () => {
      const n = iconName(name.value);
      if (!n) { name.value = ic.name; return toast('Use letters, numbers, - or _.'); }
      if (list.some((o, j) => j !== i && o.name === n)) { name.value = ic.name; return toast('Another icon already has that name.'); }
      ic.name = n; name.value = n; syncIcons(); scheduleSave();
    };
    box.append(el('div', { class: 'icRow' }, el('img', { src: ic.src, alt: '' }), el('code', {}, '{'), name, el('code', {}, '}'),
      el('button', { type: 'button', class: 'ghost', onclick: () => { list.splice(i, 1); syncIcons(); buildIcons(); scheduleSave(); } }, 'Remove')));
  });
}
$('#btnIcons').onclick = () => { $('#icBuilt').textContent = Object.keys(DRAWN_ICONS).map(n => '{' + n + '}').join(' '); buildIcons(); $('#dlgIcons').showModal(); };
$('#icAdd').onclick = () => $('#icFile').click();
$('#icFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const list = S.proj.icons || (S.proj.icons = []);
  let base = iconName(f.name.replace(/\.[^.]+$/, '')) || 'icon', n = base, k = 1;
  while (list.some(o => o.name === n)) n = base + (++k);
  list.push({ name: n, src: await fileToDataUrl(f, 256) });
  syncIcons(); buildIcons(); scheduleSave();
};

// ---------- projects ----------
function buildProjSel() {
  const sel = $('#projSel');
  sel.innerHTML = '';
  for (const p of S.projects.slice().sort((a, b) => a.name.localeCompare(b.name)))
    sel.append(el('option', { value: p.id, selected: S.proj && p.id === S.proj.id }, `${p.name} (${p.cards.length})`));
}
async function openProject(id, cardId) {
  await saveNow();
  S.proj = S.projects.find(p => p.id === id) || S.projects[0];
  syncIcons();
  S.cardId = (cardId && S.proj.cards.some(c => c.id === cardId)) ? cardId : (S.proj.cards[0] || {}).id || null;
  buildProjSel(); buildList(); buildForm(); requestRender(); updateUndo();
  DB.setMeta('last', { proj: S.proj.id, card: S.cardId }).catch(() => {});
}
$('#projSel').onchange = e => openProject(e.target.value);
$('#projNew').onclick = async () => {
  const name = prompt('Name for the new project:', 'New Deck');
  if (!name) return;
  const p = newProject(name);
  S.projects.push(p); await DB.put(p); openProject(p.id);
};
$('#projRename').onclick = async () => {
  const name = prompt('Rename project:', S.proj.name);
  if (!name) return;
  S.proj.name = name; await saveNow(); buildProjSel();
};
$('#projDel').onclick = async () => {
  if (!confirm(`Delete the project "${S.proj.name}" and all ${S.proj.cards.length} cards? Save a project file first if you want a copy.`)) return;
  await DB.del(S.proj.id);
  S.projects = S.projects.filter(p => p !== S.proj);
  if (!S.projects.length) { const p = starterProject(); S.projects.push(p); await DB.put(p); }
  S.proj = null;
  openProject(S.projects[0].id);
};

function starterProject() {
  const p = newProject('My First Deck');
  p.cards = ['faFront', 'faBack', 'heroChar', 'heroDeck', 'heroBack', 'villainChar', 'villainDeck', 'envDeck', 'principle'].map(t => newCard(t));
  return p;
}

// ---------- install (PWA) ----------
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('#btnInstall').hidden = false; });
$('#btnInstall').onclick = async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $('#btnInstall').hidden = true; };
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});

// ---------- start ----------
(async function start() {
  try {
    await Promise.race([new Promise(r => setTimeout(r, 5000)), Promise.all([
      document.fonts.load(`40px Bangers`), document.fonts.load(`20px Boogaloo`), document.fonts.load(`20px "Noto Sans"`), document.fonts.load(`italic 20px "Noto Sans"`),
      document.fonts.load(`700 20px "Noto Sans"`), document.fonts.load(`700 20px "Work Sans"`), document.fonts.load(`500 20px "Work Sans"`),
      document.fonts.load(`800 20px "Work Sans"`), document.fonts.load(`italic 700 20px "Comic Neue"`),
      document.fonts.load(`20px "Avengeance Mightiest Avenger"`), document.fonts.load(`20px "Unmasked BB"`), document.fonts.load(`italic 20px "Unmasked BB"`), document.fonts.load(`700 20px "Unmasked BB"`),
    ])]);
  } catch (e) { /* offline without cached fonts: fall back to system fonts */ }
  try { await DB.open(); S.projects = await DB.all(); }
  catch (e) { toast('Saving is unavailable in this browser window (private mode?). Work will not be kept.'); DB.put = async () => {}; DB.setMeta = async () => {}; DB.del = async () => {}; }
  if (!S.projects.length) { const p = starterProject(); S.projects.push(p); await DB.put(p); }
  let last = null;
  try { last = await DB.getMeta('last'); } catch (e) {}
  await openProject(last && S.projects.some(p => p.id === last.proj) ? last.proj : S.projects[0].id, last && last.card);
  window.addEventListener('beforeunload', () => { saveNow(); });
  openSharedLink();
})();
