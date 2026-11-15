// render.js: card templates (fields + drawing) and the shared drawing kit.
// Every frame here is drawn in code (original designs in the comic-card style);
// no official frame art is used. Cards render at 300 dpi: 750 x 1050 (or 1050 x 750).
'use strict';

const INK = '#111';
const BLEED = 36; // 1/8 inch at 300 dpi

// ---------- small utilities ----------
function hexToRgb(h) {
  const m = String(h || '').match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (m) return [+m[1], +m[2], +m[3]];
  h = String(h || '#888').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(hex, amt) { // amt -1..1 (negative = darker)
  const [r, g, b] = hexToRgb(hex);
  const f = c => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function rgba(hex, a) { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }
function inset(r, dx, dy) { dy = dy == null ? dx : dy; return { x: r.x + dx, y: r.y + dy, w: r.w - 2 * dx, h: r.h - 2 * dy }; }
function hashStr(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(a) {
  return function rnd() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function polyBBox(p) {
  const xs = p.map(q => q[0]), ys = p.map(q => q[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
function pathShape(ctx, shape) {
  ctx.beginPath();
  if (Array.isArray(shape)) { shape.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); }
  else if (shape.r) ctx.roundRect(shape.x, shape.y, shape.w, shape.h, shape.r);
  else ctx.rect(shape.x, shape.y, shape.w, shape.h);
}

// ---------- image cache ----------
const IMG_CACHE = new Map();
function loadImg(src) {
  if (!src) return Promise.resolve(null);
  let p = IMG_CACHE.get(src);
  if (!p) {
    p = new Promise(res => {
      const i = new Image();
      if (/^https?:/i.test(src)) i.crossOrigin = 'anonymous';
      i.onload = () => res(i);
      i.onerror = () => res(null);
      i.src = src;
    });
    IMG_CACHE.set(src, p);
    if (IMG_CACHE.size > 80) IMG_CACHE.delete(IMG_CACHE.keys().next().value);
  }
  return p;
}

// ---------- drawing kit ----------
const HT_CACHE = new Map();
function halftone(ctx, rect, color, o = {}) {
  const step = o.step || 16, maxR = o.maxR || step * 0.36;
  const key = [Math.round(rect.w), Math.round(rect.h), color, step, maxR, o.dir || 'diag', o.alpha || 1].join('|');
  let c = HT_CACHE.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(rect.w)); c.height = Math.max(1, Math.round(rect.h));
    const g = c.getContext('2d');
    g.fillStyle = color; g.globalAlpha = o.alpha || 1;
    g.beginPath();
    for (let y = 0, row = 0; y < c.height + step; y += step * 0.866, row++) {
      for (let x = (row % 2) * step / 2; x < c.width + step; x += step) {
        let t;
        if (o.dir === 'down') t = y / c.height;
        else if (o.dir === 'up') t = 1 - y / c.height;
        else if (o.dir === 'flat') t = 0.7;
        else if (o.dir === 'radial') t = Math.min(1, Math.hypot(x - c.width / 2, y - c.height / 2) / (Math.hypot(c.width, c.height) / 2));
        else t = (x / c.width + y / c.height) / 2;
        const r = maxR * Math.max(0, Math.min(1, t));
        if (r < 0.4) continue;
        g.moveTo(x + r, y); g.arc(x, y, r, 0, Math.PI * 2);
      }
    }
    g.fill();
    HT_CACHE.set(key, c);
    if (HT_CACHE.size > 40) HT_CACHE.delete(HT_CACHE.keys().next().value);
  }
  ctx.drawImage(c, rect.x, rect.y, rect.w, rect.h);
}

function placeholder(R, rect, color, label) {
  const { ctx } = R;
  const g = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
  g.addColorStop(0, shade(color, 0.35)); g.addColorStop(1, shade(color, -0.25));
  ctx.fillStyle = g; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  halftone(ctx, rect, rgba('#ffffff', 0.35), { step: 18, dir: 'diag' });
  if (!R.exporting && label !== '') {
    ctx.save();
    ctx.font = `600 ${Math.max(14, Math.min(30, rect.w / 16))}px ${TF.label}`;
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 6;
    ctx.fillText(label || 'Click or drop art here', rect.x + rect.w / 2, rect.y + rect.h / 2);
    ctx.restore();
  }
}

// Draws an art field (image + pan/zoom) into a rect or polygon and registers it for drag/drop.
function drawArt(R, key, rect, o = {}) {
  const { ctx } = R;
  const a = R.d[key] || {};
  const img = a.src ? R.imgs.get(a.src) : null;
  const shape = o.poly || rect;
  if (!img && o.placeholder === false) {
    R.hits.push({ key, rect, has: false, click: false, fit: o.fit || 'cover', fx: 0.5, fy: 0.5 });
    return;
  }
  ctx.save();
  pathShape(ctx, shape); ctx.clip();
  if (!img) placeholder(R, rect, o.phColor || '#5b8fd6', o.phLabel);
  else {
    const g = artGeom(a, img, rect, o.fit || 'cover');
    if (o.filter) ctx.filter = o.filter;
    ctx.drawImage(img, g.x0, g.y0, img.width * g.s, img.height * g.s);
    ctx.filter = 'none';
    if (o.tint) {
      ctx.globalCompositeOperation = 'color';
      ctx.fillStyle = o.tint; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.3;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }
  }
  ctx.restore();
  R.hits.push({ key, rect, has: !!img, click: o.click !== false, fit: o.fit || 'cover', fx: o.fx != null ? o.fx : 0.5, fy: o.fy != null ? o.fy : 0.5 });
}

// Where an art image lands: scale s and top-left (x0, y0) in card units.
function artBase(img, rect, fit) {
  return fit === 'cover' ? Math.max(rect.w / img.width, rect.h / img.height) : Math.min(rect.w / img.width, rect.h / img.height);
}
function artGeom(a, img, rect, fit) {
  const s = artBase(img, rect, fit) * (a.zoom || 1);
  const w = img.width * s, h = img.height * s;
  const x0 = rect.x + (rect.w - w) / 2 + (a.x || 0);
  const y0 = (fit === 'contain-bottom' ? rect.y + rect.h - h : rect.y + (rect.h - h) / 2) + (a.y || 0);
  return { s, x0, y0 };
}
// The x/y offsets that put the image's top-left at (x0, y0) for a given zoom.
function artOffsets(img, rect, fit, zoom, x0, y0) {
  const s = artBase(img, rect, fit) * zoom;
  const w = img.width * s, h = img.height * s;
  return {
    x: Math.round(x0 - (rect.x + (rect.w - w) / 2)),
    y: Math.round(y0 - (fit === 'contain-bottom' ? rect.y + rect.h - h : rect.y + (rect.h - h) / 2)),
  };
}

function strokeShape(ctx, shape, lw, color) {
  ctx.save(); ctx.lineWidth = lw || 5; ctx.strokeStyle = color || INK; ctx.lineJoin = 'round';
  pathShape(ctx, shape); ctx.stroke(); ctx.restore();
}

function box(ctx, r, o = {}) {
  ctx.save();
  if (o.shadow !== false) {
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    pathShape(ctx, { ...r, x: r.x + 6, y: r.y + 7 }); ctx.fill();
  }
  ctx.fillStyle = o.fill || '#fff';
  pathShape(ctx, r); ctx.fill();
  if (o.dots) { ctx.save(); pathShape(ctx, r); ctx.clip(); halftone(ctx, r, o.dots, { step: 12, dir: 'up', maxR: 3.2 }); ctx.restore(); }
  ctx.lineWidth = o.lw || 5; ctx.strokeStyle = o.stroke || INK; ctx.lineJoin = 'round';
  pathShape(ctx, r); ctx.stroke();
  ctx.restore();
}

function fitFont(ctx, text, family, maxW, maxSize, weight) {
  let s = maxSize;
  ctx.font = `${weight || ''} ${s}px ${family}`;
  const w = ctx.measureText(text).width;
  if (w > maxW) s = s * maxW / w;
  ctx.font = `${weight || ''} ${s}px ${family}`;
  return s;
}

// Comic lettering with outline + 3D extrusion. Used for name logos, mastheads, blurbs.
function comicLettering(ctx, text, rect, o = {}) {
  text = String(text || '').toUpperCase().trim();
  if (!text) return;
  const fam = o.family || TF.comic;
  const words = text.split(/\s+/);
  const maxLines = o.maxLines || 2;
  const fit = ls => {
    let size = rect.h / ls.length / (ls.length > 1 ? 0.95 : 0.86);
    ctx.font = `${size}px ${fam}`;
    const mw = Math.max(...ls.map(l => ctx.measureText(l).width));
    if (mw > rect.w * 0.94) size *= rect.w * 0.94 / mw;
    return size;
  };
  let lines = [text], best = fit(lines);
  if (words.length > 1 && maxLines > 1) {
    for (let i = 1; i < words.length; i++) {
      const ls = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
      const s = fit(ls);
      if (s > best * 1.12) { best = s; lines = ls; }
    }
  }
  const size = Math.min(best, o.maxSize || 999);
  const depth = o.depth != null ? size * o.depth : size * 0.07;
  const lh = size * 0.95;
  const total = lh * (lines.length - 1) + size * 0.8;
  const align = o.align || 'center';
  const ax = align === 'center' ? rect.x + rect.w / 2 : align === 'left' ? rect.x + rect.w * 0.03 : rect.x + rect.w * 0.97;
  const top = rect.y + (rect.h - total) / 2 + size * 0.8;
  const color = o.color || '#2f6fd6';
  ctx.save();
  ctx.font = `${size}px ${fam}`;
  ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round'; ctx.miterLimit = 2;
  lines.forEach((l, i) => {
    ctx.save();
    ctx.translate(ax, top + i * lh);
    if (o.rotate) ctx.rotate(o.rotate);
    ctx.transform(1, 0, o.skew != null ? o.skew : -0.08, 1, 0, 0);
    const steps = Math.max(1, Math.round(depth / 1.5));
    ctx.strokeStyle = o.outline || INK; ctx.lineWidth = size * (o.outlineW || 0.13);
    for (let k = steps; k >= 0; k--) ctx.strokeText(l, depth * k / steps, depth * k / steps);
    ctx.fillStyle = o.extrude || shade(color, -0.5);
    for (let k = steps; k >= 1; k--) ctx.fillText(l, depth * k / steps, depth * k / steps);
    let fill = o.fill;
    if (!fill) {
      const g = ctx.createLinearGradient(0, -size * 0.8, 0, 0);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, shade(color, 0.75)); g.addColorStop(1, shade(color, 0.35));
      fill = g;
    }
    ctx.fillStyle = fill; ctx.fillText(l, 0, 0);
    if (o.innerLine !== false) {
      ctx.strokeStyle = o.innerColor || color; ctx.lineWidth = Math.max(1, size * 0.018);
      ctx.strokeText(l, 0, 0);
    }
    ctx.restore();
  });
  ctx.restore();
}

// Logo: uploaded logo image if any, otherwise generated lettering from the name.
function drawLogo(R, key, name, rect, color, o = {}) {
  const a = R.d[key] || {};
  if (a.src && R.imgs.get(a.src)) drawArt(R, key, rect, { fit: 'contain', placeholder: false });
  else {
    comicLettering(R.ctx, name, rect, { color, ...o });
    R.hits.push({ key, rect, has: false, click: false });
  }
}

function hpStar(ctx, cx, cy, r, hp) {
  if (hp === '' || hp == null) return;
  ctx.save();
  const n = 12;
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + i * Math.PI / n;
    const rr = i % 2 ? r * 0.7 : r * (i % 4 ? 0.95 : 1.04);
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.save(); ctx.translate(4, 5); ctx.fill(); ctx.restore();
  const g = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.3, r * 0.1, cx, cy, r);
  g.addColorStop(0, '#fff27a'); g.addColorStop(0.55, '#ffc21a'); g.addColorStop(1, '#ff7a00');
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke();
  const s = String(hp);
  fitFont(ctx, s, TF.phase, r * 1.25, r * 0.95);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = r * 0.12; ctx.strokeStyle = '#fff'; ctx.strokeText(s, cx, cy + r * 0.06);
  ctx.fillStyle = INK; ctx.fillText(s, cx, cy + r * 0.06);
  ctx.restore();
}

// A keyword tag (yellow box). align 'left' starts at x, 'right' ends at x. Returns width.
function tag(ctx, text, x, y, h, o = {}) {
  text = String(text || '').toUpperCase().trim();
  if (!text) return 0;
  ctx.save();
  const fs = h * 0.74;
  ctx.font = `${fs}px ${TF.title}`;
  const w = Math.min(o.maxW || 9999, ctx.measureText(text).width + h * 0.6);
  const bx = o.align === 'right' ? x - w : x;
  box(ctx, { x: bx, y, w, h }, { fill: o.fill || '#ffd23f', lw: 4 });
  ctx.fillStyle = o.color || INK; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  fitFont(ctx, text, TF.title, w - h * 0.4, fs);
  ctx.fillText(text, bx + w / 2, y + h * 0.54);
  ctx.restore();
  return w;
}

// White title banner with comic lettering.
function banner(ctx, text, r, o = {}) {
  box(ctx, r, { fill: o.fill || '#fff', lw: 5 });
  text = String(text || '').toUpperCase();
  if (!text) return;
  ctx.save();
  const size = fitFont(ctx, text, TF.title, r.w - 36, r.h * 0.74);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
  const x = r.x + r.w / 2, y = r.y + r.h / 2 + size * 0.36;
  if (o.plain) { ctx.fillStyle = o.color || INK; ctx.fillText(text, x, y); ctx.restore(); return; }
  ctx.lineWidth = size * 0.16; ctx.strokeStyle = INK;
  ctx.strokeText(text, x + 2, y + 3); ctx.strokeText(text, x, y);
  ctx.fillStyle = o.color || '#ffb000'; ctx.fillText(text, x, y);
  ctx.restore();
}

function quoteBubble(ctx, quote, attr, r, accent, scale) {
  scale = scale || 1;
  quote = String(quote || '').trim(); attr = String(attr || '').trim();
  if (!quote && !attr) return;
  ctx.save();
  const rad = Math.min(r.h / 2, 60);
  box(ctx, { ...r, r: rad }, { fill: '#fffdf2', lw: 4 });
  const padX = rad * 0.8 + 10;
  const aSize = Math.round(19 * scale);
  const qr = { x: r.x + padX, y: r.y + 12, w: r.w - padX * 2, h: r.h - 24 - (attr ? aSize + 6 : 0) };
  let size = Math.round(24 * scale), lines;
  for (; size > 11; size -= 1) {
    ctx.font = `italic ${size}px ${TF.quote}`;
    lines = wrapPlain(ctx, '"' + quote.toUpperCase() + '"', qr.w);
    if (lines.length * size * 1.12 <= qr.h) break;
  }
  if (quote) {
    ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const th = lines.length * size * 1.12;
    const y0 = qr.y + (qr.h - th) / 2;
    lines.forEach((l, i) => ctx.fillText(l, qr.x + qr.w / 2, y0 + i * size * 1.12));
  }
  if (attr) {
    ctx.font = `italic ${aSize}px ${TF.quote}`;
    ctx.fillStyle = accent || '#c8102e'; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    fitFont(ctx, '—' + attr.toUpperCase(), TF.quote, r.w - padX * 2, aSize, 'italic');
    ctx.fillText('—' + attr.toUpperCase(), r.x + r.w - padX, r.y + r.h - 12);
  }
  ctx.restore();
}

function artistCredit(R, text, W, H) {
  if (!String(text || '').trim()) return;
  const { ctx } = R;
  ctx.save();
  ctx.translate(15, H - 40); ctx.rotate(-Math.PI / 2);
  ctx.font = `600 13px ${TF.label}`; ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.textBaseline = 'middle';
  ctx.fillText('ART: ' + String(text).toUpperCase(), 0, 0);
  ctx.restore();
}

function frameBg(ctx, W, H, color) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, shade(color, 0.12)); g.addColorStop(1, shade(color, -0.3));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  halftone(ctx, { x: 0, y: 0, w: W, h: H }, rgba('#000000', 0.22), { step: 14, dir: 'diag', maxR: 4.5 });
}

function terms(d) { return String(d.boldTerms || '').split(',').map(s => s.trim()).filter(Boolean); }

function gameText(R, text, rect, o = {}) {
  const d = R.d;
  return drawGameTextBox(R.ctx, text, rect, {
    base: (o.base || 30) * ((d.textSize || 100) / 100),
    min: o.min || 12, terms: terms(d), hiPhase: !!d.hiPhase, ...o,
  });
}

function nemesis(R, rect, name, color) {
  const a = R.d.nemesis || {};
  if (a.src && R.imgs.get(a.src)) { drawArt(R, 'nemesis', rect, { fit: 'contain', placeholder: false }); return; }
  if (R.d.noNemesis) return;
  const { ctx } = R;
  const { x, y, w, h } = rect;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + w * 0.5, y + h * 0.04);
  ctx.lineTo(x + w * 0.94, y + h * 0.2);
  ctx.quadraticCurveTo(x + w * 0.92, y + h * 0.75, x + w * 0.5, y + h * 0.97);
  ctx.quadraticCurveTo(x + w * 0.08, y + h * 0.75, x + w * 0.06, y + h * 0.2);
  ctx.closePath();
  ctx.fillStyle = color || '#c8102e'; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
  const ini = String(name || '?').trim().split(/\s+/).map(s => s[0] || '').join('').slice(0, 2).toUpperCase();
  ctx.font = `${h * 0.5}px ${TF.comic}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 4; ctx.strokeText(ini, x + w / 2, y + h * 0.47);
  ctx.fillStyle = '#ffd23f'; ctx.fillText(ini, x + w / 2, y + h * 0.47);
  ctx.restore();
  R.hits.push({ key: 'nemesis', rect, has: false, click: true });
}

function comicLabel(ctx, text, x, y, size, o = {}) {
  text = String(text || '').toUpperCase();
  if (!text) return;
  ctx.save();
  ctx.font = `${size}px ${TF.phase}`;
  if (o.maxW) fitFont(ctx, text, TF.phase, o.maxW, size);
  ctx.translate(x, y); ctx.transform(1, 0, -0.14, 1, 0, 0);
  ctx.textAlign = o.align || 'left'; ctx.lineJoin = 'round';
  if (o.stroke !== false) { ctx.lineWidth = size * 0.16; ctx.strokeStyle = o.stroke || '#fff'; ctx.strokeText(text, 0, 0); }
  ctx.fillStyle = o.color || INK; ctx.fillText(text, 0, 0);
  ctx.restore();
}

// ---------- First Appearance: comic cover builder + graded slab ----------
const ERAS = {
  golden: { paper: '#ecdcb0', label: 'Golden Age (1938-56)' },
  silver: { paper: '#f2e7c9', label: 'Silver Age (1956-70)' },
  bronze: { paper: '#f5eedb', label: 'Bronze Age (1970-85)' },
  modern: { paper: '#ffffff', label: 'Modern' },
};

function speechBubble(ctx, text, r, tailTo) {
  text = String(text || '').trim();
  if (!text) return;
  ctx.save();
  ctx.font = `700 ${Math.max(12, r.h * 0.2)}px ${TF.quote}`;
  let size = Math.max(12, r.h * 0.22), lines;
  for (; size > 9; size -= 1) {
    ctx.font = `700 ${size}px ${TF.quote}`;
    lines = wrapPlain(ctx, text.toUpperCase(), r.w * 0.72);
    if (lines.length * size * 1.1 <= r.h * 0.66) break;
  }
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  ctx.beginPath(); ctx.ellipse(cx, cy, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#fffdf3'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
  if (tailTo) {
    ctx.beginPath();
    ctx.moveTo(cx + r.w * 0.08, cy + r.h * 0.38);
    ctx.lineTo(tailTo[0], tailTo[1]);
    ctx.lineTo(cx + r.w * 0.22, cy + r.h * 0.3);
    ctx.fillStyle = '#fffdf3'; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, cy, r.w / 2 - 1.5, r.h / 2 - 1.5, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const th = lines.length * size * 1.1;
  lines.forEach((l, i) => ctx.fillText(l, cx, cy - th / 2 + size * 0.55 + i * size * 1.1));
  ctx.restore();
}

function ageCover(ctx, r, amt, seed) {
  if (!amt) return;
  const a = amt / 100, rnd = mulberry32(seed || 1);
  ctx.save();
  ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
  // yellowed paper + faded inks
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `rgba(222,190,128,${0.6 * a})`; ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = `rgba(110,92,64,${0.4 * a})`; ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.globalCompositeOperation = 'source-over';
  // browned edges
  const g = ctx.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, Math.min(r.w, r.h) * 0.35, r.x + r.w / 2, r.y + r.h / 2, Math.hypot(r.w, r.h) * 0.58);
  g.addColorStop(0, 'rgba(110,70,25,0)'); g.addColorStop(1, `rgba(110,70,25,${0.55 * a})`);
  ctx.fillStyle = g; ctx.fillRect(r.x, r.y, r.w, r.h);
  // spine wear on the left
  const sg = ctx.createLinearGradient(r.x, 0, r.x + r.w * 0.06, 0);
  sg.addColorStop(0, `rgba(255,245,220,${0.45 * a})`); sg.addColorStop(1, 'rgba(255,245,220,0)');
  ctx.fillStyle = sg; ctx.fillRect(r.x, r.y, r.w * 0.06, r.h);
  for (let i = 0; i < 24 * a; i++) {
    const y = r.y + rnd() * r.h, h = 4 + rnd() * 26;
    ctx.fillStyle = `rgba(255,248,228,${0.25 + rnd() * 0.5})`;
    ctx.fillRect(r.x + r.w * 0.012 + rnd() * 4, y, 1.5 + rnd() * 2, h);
  }
  // foxing / specks
  for (let i = 0; i < 900 * a; i++) {
    const x = r.x + rnd() * r.w, y = r.y + rnd() * r.h, s = 0.4 + rnd() * rnd() * 3.2;
    ctx.fillStyle = rnd() < 0.7 ? `rgba(95,62,25,${0.15 + rnd() * 0.35})` : `rgba(255,250,235,${0.3 + rnd() * 0.5})`;
    ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
  }
  // edge chips and worn corners
  ctx.fillStyle = 'rgba(250,240,215,.85)';
  for (let i = 0; i < 120 * a; i++) {
    const side = Math.floor(rnd() * 4), t = rnd(), s = 1 + rnd() * 6 * a;
    let x = side === 1 ? r.x + r.w : side === 3 ? r.x : r.x + t * r.w;
    let y = side === 0 ? r.y : side === 2 ? r.y + r.h : r.y + t * r.h;
    ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
  }
  for (const [cx, cy] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) {
    const s = 6 + 26 * a * rnd();
    ctx.beginPath(); ctx.arc(cx, cy, s, 0, Math.PI * 2); ctx.fill();
  }
  // creases
  const nC = a > 0.3 ? 1 + Math.floor(a * 3) : 0;
  for (let k = 0; k < nC; k++) {
    const vertical = rnd() < 0.6;
    const x1 = vertical ? r.x + r.w * (0.15 + rnd() * 0.7) : r.x;
    const y1 = vertical ? r.y : r.y + r.h * (0.1 + rnd() * 0.8);
    const x2 = vertical ? x1 + (rnd() - 0.5) * r.w * 0.2 : r.x + r.w * (0.2 + rnd() * 0.8);
    const y2 = vertical ? r.y + r.h * (0.2 + rnd() * 0.8) : y1 + (rnd() - 0.5) * r.h * 0.15;
    ctx.lineWidth = 2.2; ctx.strokeStyle = `rgba(255,252,240,${0.55 * a})`;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.lineWidth = 1.2; ctx.strokeStyle = `rgba(70,45,20,${0.35 * a})`;
    ctx.beginPath(); ctx.moveTo(x1 + 1.6, y1 + 1.6); ctx.lineTo(x2 + 1.6, y2 + 1.6); ctx.stroke();
  }
  ctx.restore();
}

function drawCover(R, rect) {
  const { ctx, d } = R;
  if (d.coverMode === 'image') {
    drawArt(R, 'coverImage', rect, { phColor: '#c9a85e', phLabel: 'Drop a full comic cover image' });
    if (d.ageUploaded) ageCover(ctx, rect, d.age, R.seed);
    return;
  }
  const era = ERAS[d.era] || ERAS.silver;
  const paper = era.paper;
  ctx.save();
  ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
  ctx.fillStyle = d.coverBg || '#f2b33d'; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  const mh = rect.h * 0.2;
  const artR = { x: rect.x, y: rect.y + mh, w: rect.w, h: rect.h - mh };
  ctx.fillStyle = d.coverBg || '#f2b33d'; ctx.fillRect(artR.x, artR.y, artR.w, artR.h);
  if (d.coverDots !== false) halftone(ctx, artR, rgba(shade(d.coverBg || '#f2b33d', -0.35), 1), { step: 13, dir: 'radial', maxR: 4 });
  drawArt(R, 'coverArt', artR, { placeholder: !R.exporting, phColor: d.coverBg || '#f2b33d', phLabel: 'Drop the hero art (a cut-out works best)', fit: d.coverArtFit === 'cover' ? 'cover' : 'contain-bottom' });
  // masthead
  ctx.fillStyle = paper; ctx.fillRect(rect.x, rect.y, rect.w, mh);
  ctx.fillStyle = INK; ctx.fillRect(rect.x, rect.y + mh - 3, rect.w, 3);
  // publisher seal
  const sr = mh * 0.34, sx = rect.x + mh * 0.48, sy = rect.y + mh * 0.5;
  ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath(); ctx.arc(sx, sy, sr * 0.78, 0, Math.PI * 2); ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  fitFont(ctx, String(d.sealText || 'SC').toUpperCase(), TF.comic, sr * 1.3, sr * 0.9);
  ctx.fillText(String(d.sealText || 'SC').toUpperCase(), sx, sy + 2);
  // price / date / issue box
  const bw = mh * 0.95, bx = rect.x + rect.w - bw - mh * 0.12, by = rect.y + mh * 0.12, bh = mh * 0.76;
  ctx.fillStyle = '#fff'; ctx.fillRect(bx, by, bw, bh);
  ctx.lineWidth = 2.5; ctx.strokeRect(bx, by, bw, bh);
  ctx.fillStyle = INK;
  const ls = [d.price, d.coverDate, d.issueNo ? 'No. ' + String(d.issueNo).replace(/^#/, '') : ''].filter(Boolean);
  ls.forEach((l, i) => {
    fitFont(ctx, String(l).toUpperCase(), TF.label, bw - 10, bh / 3.6, i === 0 ? '800' : '700');
    ctx.fillText(String(l).toUpperCase(), bx + bw / 2, by + bh * (i + 0.55) / Math.max(3, ls.length));
  });
  // title
  comicLettering(ctx, d.comicTitle, { x: rect.x + mh * 0.92, y: rect.y + mh * 0.06, w: rect.w - mh * 2.05, h: mh * 0.86 }, {
    color: d.mastheadColor || '#d62828', fill: d.mastheadColor || '#d62828', extrude: shade(d.mastheadColor || '#d62828', -0.55),
    innerColor: shade(d.mastheadColor || '#d62828', 0.4), depth: 0.06, skew: d.era === 'modern' ? -0.12 : 0,
    family: d.era === 'golden' ? TF.title : TF.comic,
  });
  // bubble and blurb
  if (d.bubble) speechBubble(ctx, d.bubble, { x: rect.x + rect.w * 0.05, y: artR.y + rect.h * 0.04, w: rect.w * 0.4, h: rect.h * 0.15 }, [rect.x + rect.w * 0.38, artR.y + rect.h * 0.26]);
  if (d.blurb) {
    comicLettering(ctx, d.blurb, { x: rect.x + rect.w * 0.36, y: rect.y + rect.h * 0.72, w: rect.w * 0.6, h: rect.h * 0.24 }, {
      color: '#ffd23f', fill: '#ffe14d', extrude: '#b3121f', outline: INK, innerLine: false, depth: 0.09,
      rotate: -0.06, maxLines: 3,
    });
  }
  ctx.restore();
  ageCover(ctx, rect, d.age, R.seed);
}

function slabBase(R, labelPrefix) {
  const { ctx, d, W, H } = R;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#3a3d44'); g.addColorStop(0.5, '#24262b'); g.addColorStop(1, '#141518');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // acrylic case edge
  ctx.save();
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,.18)';
  ctx.beginPath(); ctx.roundRect(12, 10, W - 24, H - 20, 26); ctx.stroke();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.6)';
  ctx.beginPath(); ctx.roundRect(18, 16, W - 36, H - 32, 22); ctx.stroke();
  ctx.restore();
  // grade label
  const lb = { x: 38, y: 24, w: W - 76, h: 66, r: 10 };
  const lg = ctx.createLinearGradient(0, lb.y, 0, lb.y + lb.h);
  lg.addColorStop(0, '#dff0fb'); lg.addColorStop(1, '#a8d2ee');
  ctx.save();
  ctx.fillStyle = lg; pathShape(ctx, lb); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = '#5f8fb3'; ctx.stroke();
  ctx.fillStyle = '#2b4a63'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.font = `600 12px ${TF.label}`;
  ctx.fillText(String(d.gradeLabel || '').toUpperCase().split('').join(' '), W / 2, lb.y + 17);
  const pre = String(labelPrefix || '').toUpperCase() + ': ';
  const nm = String(d.name || '').toUpperCase();
  let fs = 30;
  for (; fs > 14; fs--) {
    ctx.font = `500 ${fs}px ${TF.label}`; const w1 = ctx.measureText(pre).width;
    ctx.font = `800 ${fs}px ${TF.label}`; const w2 = ctx.measureText(nm).width;
    if (w1 + w2 < lb.w - (d.grade ? 170 : 60)) break;
  }
  ctx.font = `500 ${fs}px ${TF.label}`; const w1 = ctx.measureText(pre).width;
  ctx.font = `800 ${fs}px ${TF.label}`; const w2 = ctx.measureText(nm).width;
  const sx = (d.grade ? W / 2 - 50 : W / 2) - (w1 + w2) / 2;
  ctx.textAlign = 'left'; ctx.fillStyle = '#16293a';
  ctx.font = `500 ${fs}px ${TF.label}`; ctx.fillText(pre, sx, lb.y + 54);
  ctx.font = `800 ${fs}px ${TF.label}`; ctx.fillText(nm, sx + w1, lb.y + 54);
  if (d.grade) {
    const gx = lb.x + lb.w - 104, gy = lb.y + 10;
    ctx.fillStyle = '#16293a'; ctx.beginPath(); ctx.roundRect(gx, gy, 92, lb.h - 20, 6); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    fitFont(ctx, String(d.grade), TF.label, 80, 34, '800');
    ctx.fillText(String(d.grade), gx + 46, gy + (lb.h - 20) / 2 + 12);
  }
  ctx.restore();
  // cover well
  const well = { x: 46, y: 104, w: W - 92, h: 664 };
  ctx.fillStyle = '#0c0d0f'; ctx.fillRect(well.x, well.y, well.w, well.h);
  const cover = inset(well, 12, 10);
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 14; ctx.fillStyle = '#000';
  ctx.fillRect(cover.x, cover.y, cover.w, cover.h); ctx.restore();
  drawCover(R, cover);
  // glass sheen
  ctx.save();
  const sh = ctx.createLinearGradient(well.x, well.y, well.x + well.w, well.y + well.h);
  sh.addColorStop(0, 'rgba(255,255,255,.10)'); sh.addColorStop(0.35, 'rgba(255,255,255,0)');
  sh.addColorStop(0.62, 'rgba(255,255,255,0)'); sh.addColorStop(0.7, 'rgba(255,255,255,.07)'); sh.addColorStop(0.78, 'rgba(255,255,255,0)');
  ctx.fillStyle = sh; ctx.fillRect(well.x, well.y, well.w, well.h);
  ctx.restore();
  // lower panel
  const pnl = { x: 38, y: 782, w: W - 76, h: 244, r: 14 };
  const pg = ctx.createLinearGradient(0, pnl.y, 0, pnl.y + pnl.h);
  pg.addColorStop(0, '#d9eefb'); pg.addColorStop(1, '#b4dbf2');
  ctx.save(); ctx.fillStyle = pg; pathShape(ctx, pnl); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = '#5f8fb3'; ctx.stroke();
  // footer strip with the featured issue
  ctx.beginPath(); ctx.roundRect(pnl.x, pnl.y + pnl.h - 38, pnl.w, 38, [0, 0, 14, 14]);
  ctx.fillStyle = '#7fb2d6'; ctx.fill();
  if (d.issue) {
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    fitFont(ctx, d.issue, TF.label, pnl.w - 40, 20, '500');
    ctx.fillText(d.issue, W / 2, pnl.y + pnl.h - 18);
  }
  ctx.restore();
  return pnl;
}

// ---------- shared layouts ----------
function deckFrontV(R) {
  const { ctx, d, W, H } = R;
  const fc = d.frameColor;
  frameBg(ctx, W, H, fc);
  const hasQ = String(d.quote || '').trim() || String(d.attribution || '').trim();
  const art = { x: 22, y: 22, w: W - 44, h: H - 44 };
  drawArt(R, 'art', art, { phColor: shade(fc, 0.15), fy: 0.28 });
  strokeShape(ctx, art, 5);
  const hasHp = d.hp !== '' && d.hp != null;
  const tr = { x: 54, y: 44, w: hasHp ? 540 : 642, h: 78 };
  part(R, 'Title', tr, () => banner(ctx, d.title, tr, { color: d.titleColor }));
  if (hasHp) part(R, 'HP', { x: 588, y: 22, w: 128, h: 128 }, () => hpStar(ctx, 652, 86, 64, d.hp));
  const tb = { x: 48, y: 598, w: 654, h: hasQ ? 296 : 412 };
  part(R, 'Text box', tb, () => { box(ctx, tb, { dots: rgba(fc, 0.16) }); gameText(R, d.gameText, { x: tb.x + 24, y: tb.y + 36, w: tb.w - 48, h: tb.h - 52 }, { base: 31 }); });
  part(R, 'Keywords', { x: 32, y: 560, w: 300, h: 54 }, () => { const w = tag(ctx, d.keywords, 32, 560, 54, { maxW: 520 }); return w ? { x: 32, y: 560, w, h: 54 } : null; });
  if (d.suddenly) part(R, 'SUDDENLY!', { x: W - 330, y: 556, w: 270, h: 70 }, () => suddenly(ctx, W - 64, 566));
  const qr = { x: 40, y: 910, w: 670, h: 116 };
  if (hasQ) part(R, 'Quote', qr, () => quoteBubble(ctx, d.quote, d.attribution, qr, shade(fc, -0.25), (d.quoteSize || 100) / 100));
  artistCredit(R, d.artist, W, H);
}

function suddenly(ctx, xRight, y) {
  ctx.save();
  ctx.translate(xRight, y); ctx.rotate(-0.06);
  ctx.font = `44px ${TF.comic}`;
  const w = ctx.measureText('SUDDENLY!').width + 34;
  box(ctx, { x: -w, y: 0, w, h: 58 }, { fill: '#e8213b', lw: 4 });
  ctx.fillStyle = '#ffe14d'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
  ctx.strokeText('SUDDENLY!', -w / 2, 32); ctx.fillText('SUDDENLY!', -w / 2, 32);
  ctx.restore();
}

function backPanels(R, panels, tint, filter) {
  const { ctx } = R;
  for (const [key, poly] of panels) {
    const bb = polyBBox(poly);
    drawArt(R, key, bb, { poly, filter, tint, phColor: tint || '#777', phLabel: 'Drop art' });
    ctx.save(); ctx.lineWidth = 9; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
    pathShape(ctx, poly); ctx.stroke(); ctx.restore();
  }
}

// ---------- movable parts ----------
// Wraps one part of a card (title, text box, logo...) so the user can move and
// resize it in "Move parts" mode. hint = the part's usual box (centre of scaling);
// fn may return the box it really drew. Art hit regions inside follow the move.
function part(R, name, hint, fn) {
  const { ctx } = R;
  const o = (R.d.parts || {})[name] || {};
  const dx = o.x || 0, dy = o.y || 0, s = o.s || 1;
  const cx = hint.x + hint.w / 2, cy = hint.y + hint.h / 2;
  const map = r => ({ x: cx + dx + (r.x - cx) * s, y: cy + dy + (r.y - cy) * s, w: r.w * s, h: r.h * s });
  const moved = dx || dy || s !== 1;
  ctx.save();
  if (moved) { ctx.translate(cx + dx, cy + dy); ctx.scale(s, s); ctx.translate(-cx, -cy); }
  const n = R.hits.length;
  const got = fn();
  ctx.restore();
  if (moved) for (let i = n; i < R.hits.length; i++) R.hits[i].rect = map(R.hits[i].rect);
  const r = got && typeof got === 'object' && 'w' in got && got.w > 0 ? got : hint;
  R.parts.push({ name, rect: map(r) });
  return got;
}

function variantRibbon(ctx, text, cx, cy, color, maxW) {
  text = String(text || '').trim().toUpperCase();
  if (!text) return;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.03);
  ctx.font = `40px ${TF.title}`;
  const vw = Math.min(maxW || 620, ctx.measureText(text).width + 60);
  box(ctx, { x: -vw / 2, y: -26, w: vw, h: 52 }, { fill: color || '#c8102e', lw: 4 });
  fitFont(ctx, text, TF.title, vw - 40, 40);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.strokeText(text, 0, 3); ctx.fillText(text, 0, 3);
  ctx.restore();
  return { x: cx - vw / 2, y: cy - 26, w: vw, h: 52 };
}

// How many of this card the deck holds.
function cardCopies(c) { return Math.max(1, Math.min(99, parseInt((c.data || {}).copies, 10) || 1)); }
const ONE_COPY_TYPES = new Set(['heroBack', 'villainBack', 'envBack', 'heroCharBack', 'faBack', 'eventBack', 'principleBack']);

// ---------- Events ----------
function paperBg(R, color) {
  const { ctx, W, H } = R;
  ctx.fillStyle = color || '#eadfc4'; ctx.fillRect(0, 0, W, H);
  const rnd = mulberry32(R.seed);
  ctx.save();
  for (let i = 0; i < 1400; i++) {
    const x = rnd() * W, y = rnd() * H, r = 0.6 + rnd() * 1.8;
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(90,60,25,.10)' : 'rgba(255,255,255,.22)';
    ctx.fillRect(x, y, r, r);
  }
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(80,50,20,.18)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// Yellow comic caption box. Paragraphs split on blank lines. Fits the text;
// with o.fit the box shrinks to the text. Returns the box drawn.
function captionBox(ctx, text, r, o = {}) {
  text = String(text || '').trim();
  if (!text) return { ...r, h: 0 };
  const paras = text.toUpperCase().split(/\n\s*\n/).map(p => p.replace(/\s*\n\s*/g, ' '));
  const pad = o.pad || 14, w = r.w - pad * 2;
  let size = o.size || 24, lines, th;
  for (; size > 9; size -= 0.5) {
    ctx.font = `${size}px ${TF.quote}`;
    lines = []; paras.forEach((p, i) => { if (i) lines.push(null); lines.push(...wrapPlain(ctx, p, w)); });
    th = lines.reduce((a, l) => a + (l === null ? size * 0.55 : size * 1.18), 0);
    if (th <= r.h - pad * 2) break;
  }
  const b = o.fit ? { ...r, h: Math.min(r.h, th + pad * 2 + 2) } : { ...r };
  box(ctx, b, { fill: o.fill || '#ffe14d', lw: 4, shadow: false, stroke: o.stroke });
  ctx.save();
  ctx.font = `${size}px ${TF.quote}`; ctx.fillStyle = INK; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  let y = b.y + pad + Math.max(0, (b.h - pad * 2 - th) / 2);
  for (const l of lines) {
    if (l === null) { y += size * 0.55; continue; }
    ctx.fillText(l, b.x + pad, y + size * 0.08); y += size * 1.18;
  }
  ctx.restore();
  return b;
}

// The red rubber stamp with the collection limit.
function limitStamp(ctx, cx, cy, r, n, rot) {
  n = String(n == null ? '' : n).trim();
  if (!n) return;
  const red = '#c8202c';
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(rot == null ? -0.18 : rot);
  ctx.globalAlpha = 0.92;
  ctx.beginPath();
  for (let i = 0; i < 36; i++) { const a = i * Math.PI / 18, rr = i % 2 ? r : r * 1.07; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath(); ctx.fillStyle = red; ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.84, 0, Math.PI * 2); ctx.fillStyle = '#f6efe0'; ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2); ctx.lineWidth = r * 0.04; ctx.strokeStyle = red; ctx.stroke();
  ctx.fillStyle = red; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  fitFont(ctx, n, TF.phase, r * 0.9, r * 0.92);
  ctx.fillText(n, 0, -r * 0.12);
  // "COLLECTION LIMIT" bent along the bottom
  const word = 'COLLECTION LIMIT', fs = r * 0.15;
  ctx.font = `${fs}px ${TF.title}`;
  const rad = r * 0.6, step = fs * 0.62 / rad, a0 = Math.PI / 2 + step * (word.length - 1) / 2;
  for (let i = 0; i < word.length; i++) {
    const a = a0 - i * step;
    ctx.save(); ctx.translate(Math.cos(a) * rad, Math.sin(a) * rad); ctx.rotate(a - Math.PI / 2);
    ctx.fillText(word[i], 0, 0); ctx.restore();
  }
  ctx.restore();
}

// A comic cover lying on the card, slightly turned, with a drop shadow.
function tiltedCover(R, rect, deg) {
  const { ctx } = R;
  const a = (deg || 0) * Math.PI / 180;
  ctx.save();
  ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2); ctx.rotate(a);
  const r = { x: -rect.w / 2, y: -rect.h / 2, w: rect.w, h: rect.h };
  ctx.save(); ctx.shadowColor = 'rgba(40,25,10,.55)'; ctx.shadowBlur = 16; ctx.shadowOffsetX = 6; ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#fff'; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.restore();
  const n = R.hits.length;
  drawCover(R, r);
  // hit regions are kept in card space (close enough for a small turn)
  for (let i = n; i < R.hits.length; i++) { const h = R.hits[i].rect; R.hits[i].rect = { ...h, x: h.x + rect.x + rect.w / 2, y: h.y + rect.y + rect.h / 2 }; }
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.restore();
}

function eventHeader(ctx, left, right, y, W, color) {
  let rw = 0;
  if (right) { ctx.save(); ctx.font = `34px ${TF.phase}`; rw = Math.min(250, ctx.measureText(String(right).toUpperCase()).width + 10); ctx.restore(); }
  comicLabel(ctx, left, 34, y, 40, { maxW: W - 70 - (rw ? rw + 24 : 0), color: color || INK });
  if (right) comicLabel(ctx, right, W - 34, y, 34, { align: 'right', maxW: 250 });
  ctx.save(); ctx.fillStyle = INK; ctx.fillRect(30, y + 10, W - 60, 3); ctx.restore();
}

function eventFrontDraw(R, critical) {
  const { ctx, d, W, H } = R;
  paperBg(R, d.paperColor);
  let y = 66;
  if (critical) {
    ctx.save();
    ctx.fillStyle = d.headerColor || '#d62828'; ctx.fillRect(0, 0, W, 70);
    ctx.fillStyle = INK; ctx.fillRect(0, 70, W, 4);
    ctx.restore();
    comicLabel(ctx, d.banner || 'Critical Event', W / 2, 54, 44, { align: 'center', stroke: false, maxW: W - 80 });
    y = 128;
    eventHeader(ctx, d.title, d.date, y, W, d.headerColor || '#d62828');
  } else {
    eventHeader(ctx, 'Event: ' + String(d.title || ''), d.date, y, W);
  }
  const capR = { x: 34, y: y + 26, w: W - 68, h: critical ? 250 : 280 };
  const cap = part(R, 'Caption', capR, () => captionBox(ctx, d.flavor, capR, { fit: true, size: 28, fill: d.captionColor }));
  const villain = String(d.villain || '').trim(), effT = String(d.effectTitle || '').trim(), effX = String(d.effectText || '').trim();
  // bottom block (normal Events): villain tag, effect title tag, effect text box
  let bottom = H - 30;
  if (!critical && (villain || effT || effX)) {
    const lay = effX ? fitText(ctx, parseGameText(effX, { terms: terms(d) }), W - 68 - 32, 150, 24 * ((d.textSize || 100) / 100), 11, {}) : null;
    const eh = effX ? Math.ceil(lay.height) + 24 : 0;
    const eb = { x: 34, y: H - 30 - eh, w: W - 68, h: eh };
    let ty = eb.y - (effX ? 4 : 0);
    if (effT) ty -= 40;
    if (villain) ty -= 42;
    const top = ty;
    part(R, 'Effect', { x: 34, y: top, w: W - 68, h: H - 30 - top }, () => {
      let t2 = eb.y - (effX ? 4 : 0);
      if (effT) { t2 -= 40; tag(ctx, effT, 34, t2, 38, { maxW: 600, fill: '#ffe14d' }); }
      if (villain) { t2 -= 42; tag(ctx, 'Villain: ' + villain, 34, t2, 38, { maxW: 600, fill: '#ffe14d' }); }
      if (effX) { box(ctx, eb, { lw: 3, shadow: false }); gameText(R, effX, inset(eb, 16, 12), { base: 24, min: 11 }); }
    });
    bottom = ty - 18;
  }
  const ct = (cap.h ? cap.y + cap.h : y) + 24;
  const ch = Math.max(200, bottom - ct), cw = Math.min(W - 200, ch * 0.66);
  part(R, 'Cover', { x: 70, y: ct, w: cw, h: ch }, () => tiltedCover(R, { x: 70, y: ct, w: cw, h: ch }, d.tilt));
  const sx2 = Math.min(W - 92, 70 + cw + 70), sy2 = ct + ch - 70;
  if (String(d.collectionLimit || '').trim()) part(R, 'Stamp', { x: sx2 - 72, y: sy2 - 72, w: 144, h: 144 }, () => limitStamp(ctx, sx2, sy2, 66, d.collectionLimit));
}

// ---------- field helpers ----------
const IMG = () => ({ src: '', x: 0, y: 0, zoom: 1 });
const F = {
  sec: (label, o) => ({ type: 'section', label, ...o }),
  text: (key, label, def = '', o) => ({ type: 'text', key, label, def, ...o }),
  area: (key, label, def = '', o) => ({ type: 'area', key, label, def, ...o }),
  num: (key, label, def = '', o) => ({ type: 'text', key, label, def, short: true, ...o }),
  range: (key, label, def, min, max, step, o) => ({ type: 'range', key, label, def, min, max, step: step || 1, ...o }),
  color: (key, label, def, o) => ({ type: 'color', key, label, def, ...o }),
  tog: (key, label, def = false, o) => ({ type: 'toggle', key, label, def, ...o }),
  sel: (key, label, def, options, o) => ({ type: 'select', key, label, def, options, ...o }),
  img: (key, label, o) => ({ type: 'image', key, label, def: IMG(), ...o }),
};
const STYLE = (color, extra = []) => [
  F.sec('Style', { closed: true }),
  F.color('frameColor', 'Frame color', color),
  ...extra,
  F.range('textSize', 'Text size (%)', 100, 60, 140),
  F.range('quoteSize', 'Quote text size (%)', 100, 60, 140),
  F.tog('hiPhase', 'Higher-contrast phase labels'),
  F.text('boldTerms', 'Extra bolded terms', '', { help: 'Comma separated, e.g. Construct, Limited' }),
];
const GT_HELP = 'POWER: / Start Phase: / > bullet / (H) / [flip] / **bold**';

const COVER_FIELDS = [
  F.sec('Comic cover'),
  F.sel('coverMode', 'Cover', 'build', [['build', 'Build a cover here'], ['image', 'Upload a finished cover']], { rebuild: true }),
  F.img('coverImage', 'Cover image', { showIf: d => d.coverMode === 'image' }),
  F.tog('ageUploaded', 'Age the uploaded cover too', false, { showIf: d => d.coverMode === 'image' }),
  F.img('coverArt', 'Hero art on the cover', { showIf: d => d.coverMode !== 'image', help: 'A transparent PNG cut-out looks best.' }),
  F.sel('coverArtFit', 'Art fit', 'contain', [['contain', 'Whole figure'], ['cover', 'Fill the cover']], { showIf: d => d.coverMode !== 'image' }),
  F.text('comicTitle', 'Comic title (masthead)', 'Mighty Tales', { showIf: d => d.coverMode !== 'image' }),
  F.num('issueNo', 'Issue number', '12', { showIf: d => d.coverMode !== 'image' }),
  F.num('price', 'Price', '12¢', { showIf: d => d.coverMode !== 'image' }),
  F.num('coverDate', 'Cover month', 'JUN', { showIf: d => d.coverMode !== 'image' }),
  F.text('sealText', 'Publisher seal', 'SC', { showIf: d => d.coverMode !== 'image' }),
  F.area('blurb', 'Cover blurb', 'The coming of a brand-new hero!', { showIf: d => d.coverMode !== 'image', rows: 2 }),
  F.area('bubble', 'Speech bubble', '', { showIf: d => d.coverMode !== 'image', rows: 2 }),
  F.sel('era', 'Era', 'silver', Object.entries(ERAS).map(([k, v]) => [k, v.label]), { showIf: d => d.coverMode !== 'image' }),
  F.color('mastheadColor', 'Masthead color', '#d62828', { showIf: d => d.coverMode !== 'image' }),
  F.color('coverBg', 'Cover background', '#f2b33d', { showIf: d => d.coverMode !== 'image' }),
  F.tog('coverDots', 'Halftone dots', true, { showIf: d => d.coverMode !== 'image' }),
  F.range('age', 'Age and wear', 55, 0, 100),
];

// ---------- templates ----------
const TEMPLATES = {
  heroDeck: {
    name: 'Hero deck card', group: 'Hero', orient: 'v',
    fields: [
      F.sec('Card'), F.text('title', 'Title', 'Rally the Team'), F.text('keywords', 'Keywords', 'One-Shot'), F.num('hp', 'HP', ''),
      F.tog('suddenly', 'SUDDENLY! banner'),
      F.sec('Art'), F.img('art', 'Card art'), F.text('artist', 'Artist'),
      F.sec('Game text'), F.area('gameText', 'Game text', 'Each Hero target regains 2 HP.\nOne player may draw a card.', { help: GT_HELP, rows: 6, chips: true }),
      F.sec('Quote'), F.area('quote', 'Quote', 'Stand together and nothing can knock us down!', { rows: 2 }), F.text('attribution', 'Attribution', 'Captain Example, Mighty Tales #12'),
      ...STYLE('#2f6fd6', [F.color('titleColor', 'Title color', '#ffb000')]),
    ],
    draw: deckFrontV,
  },
  heroBack: {
    name: 'Hero deck back', group: 'Hero', orient: 'v',
    fields: [
      F.sec('Logo'), F.text('name', 'Hero name (lettered logo)', 'Captain Example'), F.img('logo', 'Logo image (optional)'),
      F.color('color', 'Color', '#2aa3d8'),
      F.sec('Panels'), F.img('artL', 'Left panel'), F.img('artR', 'Right panel'), F.img('artB', 'Bottom panel'),
    ],
    draw(R) {
      const { ctx, d, W, H } = R;
      ctx.fillStyle = shade(d.color, -0.62); ctx.fillRect(0, 0, W, H);
      halftone(ctx, { x: 0, y: 0, w: W, h: H }, rgba(d.color, 0.35), { step: 16, dir: 'down' });
      backPanels(R, [
        ['artL', [[34, 262], [372, 246], [364, 642], [34, 654]]],
        ['artR', [[388, 246], [716, 264], [716, 638], [380, 642]]],
        ['artB', [[34, 670], [716, 654], [716, 1016], [34, 1016]]],
      ], d.color, 'grayscale(1) contrast(1.15)');
      part(R, 'Logo', { x: 36, y: 34, w: 678, h: 200 }, () => drawLogo(R, 'logo', d.name, { x: 36, y: 34, w: 678, h: 200 }, d.color));
    },
  },
  heroChar: {
    name: 'Hero character card', group: 'Hero', orient: 'v',
    fields: [
      F.sec('Hero'), F.text('name', 'Hero name', 'Captain Example'), F.text('tagline', 'Tagline above the logo', ''),
      F.img('logo', 'Logo image (optional)', { help: 'Leave empty to letter the name automatically.' }),
      F.text('keywords', 'Keywords', 'Hero'), F.num('hp', 'HP', '30'),
      F.text('variantName', 'Variant name (ribbon)', '', { help: 'e.g. Rook City, Future, Team Leader. Empty = base card.' }),
      F.color('variantColor', 'Variant ribbon color', '#c8102e'),
      F.sec('Power'), F.text('powerName', 'Power name', 'Heroic Stand'),
      F.area('powerText', 'Power text', 'Until your next START PHASE, reduce damage dealt to Hero targets by 1.', { help: 'POWER: is added for you. ' + GT_HELP, rows: 4, chips: true }),
      F.area('extraText', 'Extra text (setup etc.)', '', { rows: 2, chips: true }),
      F.img('nemesis', 'Nemesis icon'), F.tog('noNemesis', 'No nemesis icon'),
      F.sec('Art'), F.img('bg', 'Background art'), F.img('fg', 'Foreground art (cut-out)'),
      F.sec('Style', { closed: true }), F.color('color', 'Hero color', '#2f6fd6'),
      F.range('textSize', 'Text size (%)', 100, 60, 140), F.tog('hiPhase', 'Higher-contrast phase labels'), F.text('boldTerms', 'Extra bolded terms'),
    ],
    draw(R) {
      const { ctx, d, W, H } = R;
      drawArt(R, 'bg', { x: 0, y: 0, w: W, h: H }, { phColor: d.color, phLabel: 'Background art' });
      drawArt(R, 'fg', { x: 0, y: 140, w: W, h: 680 }, { fit: 'contain-bottom', placeholder: false });
      let ly = 34;
      if (d.tagline) { part(R, 'Tagline', { x: 75, y: 30, w: 600, h: 50 }, () => comicLabel(ctx, d.tagline, W / 2, 70, 40, { align: 'center', color: d.color, stroke: INK, maxW: 600 })); ly = 72; }
      part(R, 'Logo', { x: 34, y: ly, w: 682, h: 200 }, () => drawLogo(R, 'logo', d.name, { x: 34, y: ly, w: 682, h: 200 }, d.color));
      if (String(d.variantName || '').trim()) part(R, 'Variant ribbon', { x: 65, y: ly + 188, w: 620, h: 52 }, () => variantRibbon(ctx, d.variantName, W / 2, ly + 214, d.variantColor));
      const pb = { x: 36, y: 806, w: 678, h: 212 };
      part(R, 'Power box', pb, () => {
        box(ctx, pb);
        comicLabel(ctx, d.powerName, pb.x + 22, pb.y + 54, 44, { maxW: 480 });
        const hasN = !(d.noNemesis && !(d.nemesis && d.nemesis.src));
        const tx = hasN ? pb.x + 112 : pb.x + 24;
        let txt = String(d.powerText || '').trim();
        if (txt && !/^\s*power\s*:/i.test(txt)) txt = 'POWER: ' + txt;
        if (d.extraText) txt += '\n' + d.extraText;
        gameText(R, txt, { x: tx, y: pb.y + 68, w: pb.x + pb.w - 22 - tx, h: pb.h - 80 }, { base: 30 });
        if (hasN) nemesis(R, { x: pb.x + 18, y: pb.y + 92, w: 80, h: 92 }, d.name, d.color);
      });
      part(R, 'HP', { x: 584, y: 734, w: 132, h: 132 }, () => hpStar(ctx, 650, 800, 66, d.hp));
      part(R, 'Keywords', { x: 300, y: 774, w: 284, h: 44 }, () => { const w = tag(ctx, d.keywords, 584, 774, 44, { align: 'right', maxW: 300 }); return w ? { x: 584 - w, y: 774, w, h: 44 } : null; });
    },
  },
  heroCharBack: {
    name: 'Hero character back (incapacitated)', group: 'Hero', orient: 'v',
    fields: [
      F.sec('Incapacitated'), F.text('caption', 'Caption', 'Down but Not Out'),
      F.area('options', 'Options (one per line)', '1 player may draw a card now.\n1 Hero may use a power now.\nDestroy 1 Ongoing card.', { help: 'Each line becomes an arrow bullet. ' + GT_HELP, rows: 5, chips: true }),
      F.sec('Art'), F.img('bg', 'Background art'),
      F.sec('Style', { closed: true }), F.color('color', 'Color', '#5a6f8f'),
      F.range('textSize', 'Text size (%)', 100, 60, 140), F.tog('hiPhase', 'Higher-contrast phase labels'), F.text('boldTerms', 'Extra bolded terms'),
    ],
    draw(R) {
      const { ctx, d, W, H } = R;
      drawArt(R, 'bg', { x: 0, y: 0, w: W, h: H }, { phColor: d.color, phLabel: 'Background art' });
      const ib = { x: 36, y: 694, w: 678, h: 322 };
      part(R, 'Text box', ib, () => {
        box(ctx, ib);
        comicLabel(ctx, d.caption, ib.x + 22, ib.y + 54, 44, { maxW: 620 });
        gameText(R, d.options, { x: ib.x + 22, y: ib.y + 72, w: ib.w - 44, h: ib.h - 88 }, { base: 30, bullets: true });
      });
    },
  },
  faFront: {
    name: 'First Appearance (front)', group: 'Hero', orient: 'v', badge: 'NEW',
    fields: [
      F.sec('Slab label'), F.text('name', 'Hero name', 'Captain Example'),
      F.text('labelPrefix', 'Label', 'First Appearance'), F.text('gradeLabel', 'Small print', 'SC Universal Grade'),
      F.num('grade', 'Grade (optional)', '', { help: 'e.g. 9.8' }),
      F.text('issue', 'Featured issue (footer)', 'Mighty Tales #12, Jun 1962'),
      F.sec('Power'), F.text('keywords', 'Keywords', 'Hero'), F.num('hp', 'HP', '28'),
      F.text('powerName', 'Power name', 'Bold Beginnings'),
      F.area('powerText', 'Power text', '1 Hero target regains 2 HP. You may draw a card.', { help: 'POWER: is added for you. ' + GT_HELP, rows: 4, chips: true }),
      F.area('extraText', 'Extra text (setup etc.)', '', { rows: 2, chips: true }),
      F.img('nemesis', 'Nemesis icon'), F.tog('noNemesis', 'No nemesis icon'), F.color('color', 'Hero color (default icon)', '#c8102e'),
      ...COVER_FIELDS,
      F.sec('Text style', { closed: true }), F.range('textSize', 'Text size (%)', 100, 60, 140), F.tog('hiPhase', 'Higher-contrast phase labels'), F.text('boldTerms', 'Extra bolded terms'),
    ],
    draw(R) {
      const { ctx, d } = R;
      const p = slabBase(R, d.labelPrefix);
      comicLabel(ctx, d.powerName, p.x + 22, p.y + 50, 42, { maxW: 470, stroke: false, color: '#10212f' });
      // HP block
      const hb = { x: p.x + p.w - 138, y: p.y + 16, w: 120, h: 132, r: 12 };
      const hg = ctx.createLinearGradient(hb.x, hb.y, hb.x + hb.w, hb.y + hb.h);
      hg.addColorStop(0, '#f6f7f9'); hg.addColorStop(0.5, '#b9bec6'); hg.addColorStop(1, '#eef0f3');
      ctx.save(); ctx.fillStyle = hg; pathShape(ctx, hb); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#6d7480'; ctx.stroke();
      ctx.fillStyle = '#10212f'; ctx.textAlign = 'center';
      if (d.keywords) { fitFont(ctx, String(d.keywords).toUpperCase(), TF.phase, hb.w - 16, 28); ctx.fillText(String(d.keywords).toUpperCase(), hb.x + hb.w / 2, hb.y + 30); }
      if (d.hp !== '') { fitFont(ctx, String(d.hp), TF.label, hb.w - 18, 66, '800'); ctx.fillText(String(d.hp), hb.x + hb.w / 2, hb.y + 104); }
      ctx.restore();
      const hasN = !(d.noNemesis && !(d.nemesis && d.nemesis.src));
      const tx = p.x + 22;
      let txt = String(d.powerText || '').trim();
      if (txt && !/^\s*power\s*:/i.test(txt)) txt = 'POWER: ' + txt;
      if (d.extraText) txt += '\n' + d.extraText;
      gameText(R, txt, { x: tx, y: p.y + 66, w: hb.x - 16 - tx, h: hasN ? 70 : 128 }, { base: 30, min: 14 });
      if (hasN) nemesis(R, { x: p.x + 18, y: p.y + 140, w: 62, h: 62 }, d.name, d.color);
    },
  },
  faBack: {
    name: 'First Appearance (back)', group: 'Hero', orient: 'v', badge: 'NEW',
    fields: [
      F.sec('Slab label'), F.text('name', 'Hero name', 'Captain Example'),
      F.text('labelPrefix', 'Label', 'Notable Defeat'), F.text('gradeLabel', 'Small print', 'SC Universal Grade'),
      F.num('grade', 'Grade (optional)', ''),
      F.text('issue', 'Featured issue (footer)', 'Mighty Tales #40, Oct 1964'),
      F.sec('Incapacitated'), F.text('caption', 'Caption', 'The Final Page?'),
      F.area('options', 'Options (one per line)', '1 Hero may use a power now.\n1 player may draw a card now.\n1 Hero target regains 2 HP.', { rows: 5, chips: true, help: 'Each line becomes an arrow bullet.' }),
      ...COVER_FIELDS.map(f => f.key === 'blurb' ? { ...f, def: 'Is this the end?' } : f.key === 'coverBg' ? { ...f, def: '#7a5ea8' } : f.key === 'issueNo' ? { ...f, def: '40' } : f.key === 'coverDate' ? { ...f, def: 'OCT' } : f),
      F.sec('Text style', { closed: true }), F.range('textSize', 'Text size (%)', 100, 60, 140), F.tog('hiPhase', 'Higher-contrast phase labels'), F.text('boldTerms', 'Extra bolded terms'),
    ],
    draw(R) {
      const { ctx, d } = R;
      const p = slabBase(R, d.labelPrefix);
      comicLabel(ctx, d.caption, p.x + 22, p.y + 50, 42, { maxW: p.w - 50, stroke: false, color: '#10212f' });
      gameText(R, d.options, { x: p.x + 22, y: p.y + 64, w: p.w - 44, h: p.h - 112 }, { base: 30, bullets: true });
    },
  },
  villainDeck: {
    name: 'Villain deck card', group: 'Villain', orient: 'v',
    fields: [
      F.sec('Card'), F.text('title', 'Title', 'Doom Drone'), F.text('keywords', 'Keywords', 'Minion'), F.num('hp', 'HP', '6'),
      F.sec('Art'), F.img('art', 'Card art'), F.text('artist', 'Artist'),
      F.sec('Game text'), F.area('gameText', 'Game text', 'End Phase: This card deals the Hero target with the highest HP 2 energy damage.', { help: GT_HELP, rows: 6, chips: true }),
      F.sec('Quote'), F.area('quote', 'Quote', 'Resistance is adorable.', { rows: 2 }), F.text('attribution', 'Attribution', 'Baron Example, Mighty Tales #13'),
      ...STYLE('#c62828', [F.color('titleColor', 'Title color', '#ffb000')]),
    ],
    draw: deckFrontV,
  },
  villainBack: {
    name: 'Villain deck back', group: 'Villain', orient: 'v',
    fields: [
      F.sec('Logo'), F.text('name', 'Villain name (lettered logo)', 'Baron Example'), F.img('logo', 'Logo image (optional)'),
      F.color('color', 'Logo color', '#8a9099'), F.color('tint', 'Panel tint', '#9aa0a8'), F.tog('noTint', 'Plain gray panels', true),
      F.sec('Panels'), F.img('artT', 'Top panel'), F.img('artL', 'Left panel'), F.img('artR', 'Right panel'),
    ],
    draw(R) {
      const { ctx, d, W, H } = R;
      ctx.fillStyle = '#141416'; ctx.fillRect(0, 0, W, H);
      backPanels(R, [
        ['artT', [[34, 34], [716, 34], [716, 548], [34, 596]]],
        ['artL', [[34, 612], [372, 580], [364, 832], [34, 832]]],
        ['artR', [[388, 578], [716, 548], [716, 832], [380, 832]]],
      ], d.noTint ? null : d.tint, 'grayscale(1) contrast(1.2)');
      part(R, 'Logo', { x: 36, y: 846, w: 678, h: 176 }, () => drawLogo(R, 'logo', d.name, { x: 36, y: 846, w: 678, h: 176 }, d.color));
    },
  },
  villainChar: {
    name: 'Villain character card', group: 'Villain', orient: 'h',
    fields: [
      F.sec('Villain'), F.text('name', 'Villain name', 'Baron Example'), F.img('logo', 'Logo image (optional)'),
      F.text('title', 'Description banner', 'Master of Mayhem'), F.num('hp', 'HP', '40'), F.text('keywords', 'Keywords', 'Villain'),
      F.range('descShift', 'Banner + HP position (left/right)', 0, -420, 0),
      F.text('variantName', 'Variant name (ribbon)', '', { help: 'For variant villains. Empty = base card.' }), F.color('variantColor', 'Variant ribbon color', '#c8102e'),
      F.sec('Game text'), F.area('setup', 'Setup (left edge)', 'Setup: Put Baron Example into play, "Master of Mayhem" side up.', { rows: 2 }),
      F.area('gameText', 'Game text', 'Reduce damage dealt to Baron Example by 1.\nEnd Phase: Baron Example deals each Hero target 2 melee damage.', { help: GT_HELP, rows: 6, chips: true }),
      F.range('boxWidth', 'Text box width', 360, 260, 640),
      F.sel('boxAlign', 'Text box position', 'bottom', [['fill', 'Fill the space'], ['top', 'Top (fit to text)'], ['center', 'Middle (fit to text)'], ['bottom', 'Bottom (fit to text)']]),
      F.sec('Advanced'), F.sel('advPhase', 'Advanced phase', '', [['', 'None'], ['start', 'Start Phase'], ['play', 'Play Phase'], ['end', 'End Phase']]),
      F.area('advanced', 'Advanced text', '', { rows: 2 }),
      F.range('advWidth', 'Advanced box width', 980, 380, 980),
      F.img('nemesis', 'Nemesis icon'), F.tog('noNemesis', 'No nemesis icon'),
      F.sec('Art'), F.img('bg', 'Background art'), F.img('fg', 'Foreground art (cut-out)'),
      F.sec('Style', { closed: true }), F.color('color', 'Villain color', '#7b1fa2'),
      F.range('textSize', 'Text size (%)', 100, 60, 140), F.tog('hiPhase', 'Higher-contrast phase labels'), F.text('boldTerms', 'Extra bolded terms'),
    ],
    draw(R) {
      const { ctx, d, W, H } = R;
      drawArt(R, 'bg', { x: 0, y: 0, w: W, h: H }, { phColor: d.color, phLabel: 'Background art' });
      drawArt(R, 'fg', { x: 0, y: 0, w: W * 0.66, h: H }, { fit: 'contain-bottom', placeholder: false });
      const bx = d.border ? 22 : 0;
      const sx = d.setup ? 52 + bx : bx;
      if (d.setup) {
        ctx.save(); ctx.fillStyle = 'rgba(10,10,12,.92)'; ctx.fillRect(0, 0, 52 + bx, H);
        ctx.translate(34 + bx, H - 20 - bx); ctx.rotate(-Math.PI / 2);
        drawGameTextBox(ctx, d.setup, { x: 0, y: -24, w: H - 40 - bx * 2, h: 32 }, { base: 20, min: 10, color: '#fff', terms: terms(d) });
        ctx.restore();
      }
      part(R, 'Logo', { x: 460, y: 20, w: 570, h: 136 }, () => drawLogo(R, 'logo', d.name, { x: 460, y: 20, w: 570, h: 136 }, d.color));
      if (String(d.variantName || '').trim()) part(R, 'Variant ribbon', { x: sx + 20, y: 24, w: 380, h: 52 }, () => variantRibbon(ctx, d.variantName, sx + 210, 50, d.variantColor, 380));
      const hasT = !!String(d.title || '').trim();
      const dx = d.descShift || 0;
      if (hasT) part(R, 'Description', { x: 590 + dx, y: 162, w: 350, h: 54 }, () => banner(ctx, d.title, { x: 590 + dx, y: 162, w: 350, h: 54 }, { fill: '#ffd23f', plain: true }));
      part(R, 'HP', { x: 922 + dx, y: 130, w: 116, h: 116 }, () => hpStar(ctx, 980 + dx, 188, 58, d.hp));
      part(R, 'Keywords', { x: 760 + dx, y: 232, w: 250, h: 40 }, () => comicLabel(ctx, d.keywords, 1010 + dx, 262, 32, { align: 'right' }));
      const bw = d.boxWidth || 360;
      const adv = String(d.advanced || '').trim();
      const top = 282, bottom = adv ? 668 : 722;
      const tb = { x: W - 26 - bw, y: top, w: bw, h: bottom - top };
      if (d.boxAlign && d.boxAlign !== 'fill') {
        const blocks = parseGameText(d.gameText, { terms: terms(d) });
        const lay = fitText(ctx, blocks, tb.w - 36, tb.h - 32, 26 * ((d.textSize || 100) / 100), 12, {});
        tb.h = Math.min(bottom - top, Math.ceil(lay.height) + 36);
        if (d.boxAlign === 'center') tb.y = top + (bottom - top - tb.h) / 2;
        else if (d.boxAlign === 'bottom') tb.y = bottom - tb.h;
      }
      part(R, 'Text box', tb, () => {
        box(ctx, tb);
        gameText(R, d.gameText, inset(tb, 18, 16), { base: 26 });
        const hasN = !(d.noNemesis && !(d.nemesis && d.nemesis.src));
        if (hasN) nemesis(R, { x: tb.x - 96, y: tb.y + tb.h - 100, w: 84, h: 96 }, d.name, d.color);
      });
      if (adv) part(R, 'Advanced', { x: sx + 18, y: 684, w: W - 44 - sx, h: 52 }, () => {
        const ay = 684, ah = 52;
        const tw = tag(ctx, 'Advanced…', sx + 18, ay, ah, { fill: '#ffb000' });
        const full = W - 26 - (sx + 18);
        const ab = { x: sx + 18 + tw + 8, y: ay, w: Math.max(120, Math.min(full, d.advWidth || full) - tw - 8), h: ah };
        box(ctx, ab, { lw: 4 });
        const at = (d.advPhase ? '**' + d.advPhase.toUpperCase() + ' PHASE:** ' : '') + adv.replace(/\n/g, ' ');
        drawGameTextBox(ctx, at, inset(ab, 12, 6), { base: 20, min: 10, terms: terms(d), valign: 'center' });
        return { x: sx + 18, y: ay, w: ab.x + ab.w - sx - 18, h: ah };
      });
    },
  },
  teamVillain: {
    name: 'Team villain character card', group: 'Villain', orient: 'v', badge: 'NEW',
    fields: [
      F.sec('Villain'), F.text('tagline', 'Team name (small line above the name)', 'The Example Six'), F.text('name', 'Villain name', 'Madame Example'), F.img('logo', 'Logo image (optional)'),
      F.text('title', 'Description banner', 'Queen of Static'), F.num('hp', 'HP', '22'), F.text('keywords', 'Keywords', 'Villain'),
      F.text('variantName', 'Variant name (ribbon)', ''), F.color('variantColor', 'Variant ribbon color', '#c8102e'),
      F.sec('Game text'), F.area('gameText', 'Game text', 'End Phase: Madame Example deals the Hero target with the lowest HP 2 lightning damage.', { help: GT_HELP, rows: 6, chips: true }),
      F.area('advanced', 'Advanced text', '', { rows: 2 }),
      F.img('nemesis', 'Nemesis icon'), F.tog('noNemesis', 'No nemesis icon'),
      F.sec('Art'), F.img('bg', 'Background art'), F.img('fg', 'Foreground art (cut-out)'),
      F.sec('Style', { closed: true }), F.color('color', 'Villain color', '#8e2442'),
      F.range('textSize', 'Text size (%)', 100, 60, 140), F.tog('hiPhase', 'Higher-contrast phase labels'), F.text('boldTerms', 'Extra bolded terms'),
    ],
    draw(R) {
      const { ctx, d, W, H } = R;
      drawArt(R, 'bg', { x: 0, y: 0, w: W, h: H }, { phColor: d.color, phLabel: 'Background art' });
      drawArt(R, 'fg', { x: 0, y: 110, w: W, h: 760 }, { fit: 'contain-bottom', placeholder: false });
      const tl = String(d.tagline || '').trim();
      if (tl) part(R, 'Team name', { x: 175, y: 22, w: 400, h: 44 }, () => {
        ctx.save(); ctx.fillStyle = '#e8c56a'; ctx.fillRect(110, 43, 530, 3);
        ctx.font = `30px ${TF.title}`; const tw = Math.min(380, ctx.measureText(tl.toUpperCase()).width + 40);
        box(ctx, { x: W / 2 - tw / 2, y: 24, w: tw, h: 40 }, { fill: '#1d1a17', stroke: '#e8c56a', lw: 3, shadow: false });
        ctx.fillStyle = '#e8c56a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        fitFont(ctx, tl.toUpperCase(), TF.title, tw - 24, 30); ctx.fillText(tl.toUpperCase(), W / 2, 46); ctx.restore();
      });
      const ly = tl ? 64 : 28;
      part(R, 'Logo', { x: 60, y: ly, w: 630, h: 140 }, () => drawLogo(R, 'logo', d.name, { x: 60, y: ly, w: 630, h: 140 }, d.color));
      if (String(d.variantName || '').trim()) part(R, 'Variant ribbon', { x: 75, y: ly + 128, w: 600, h: 52 }, () => variantRibbon(ctx, d.variantName, W / 2, ly + 160, d.variantColor));
      // text box sits at the bottom and fits its text, like the printed cards
      const adv = String(d.advanced || '').trim();
      let txt = String(d.gameText || '');
      if (adv) txt += '\n**ADVANCED:** ' + adv.replace(/\n/g, ' ');
      const hasN = !(d.noNemesis && !(d.nemesis && d.nemesis.src));
      const tb = { x: hasN ? 110 : 40, y: 0, w: 0, h: 0 };
      tb.w = 712 - tb.x;
      const lay = String(txt).trim() ? fitText(ctx, parseGameText(txt, { terms: terms(d) }), tb.w - 36, 380, 26 * ((d.textSize || 100) / 100), 12, {}) : null;
      tb.h = lay ? Math.max(90, Math.min(400, Math.ceil(lay.height) + 34)) : 0;
      tb.y = 1016 - tb.h;
      if (tb.h) part(R, 'Text box', tb, () => { box(ctx, tb, { lw: 4 }); gameText(R, txt, inset(tb, 18, 16), { base: 26 }); });
      if (hasN) part(R, 'Nemesis icon', { x: 30, y: 930, w: 74, h: 86 }, () => nemesis(R, { x: 30, y: 930, w: 74, h: 86 }, d.name, d.color));
      const top = tb.h ? tb.y : 1016;
      const hasHp = d.hp !== '' && d.hp != null;
      if (String(d.title || '').trim()) part(R, 'Description', { x: hasHp ? 330 : 400, y: top - 104, w: 300, h: 50 }, () => banner(ctx, d.title, { x: hasHp ? 330 : 400, y: top - 104, w: 300, h: 50 }, { fill: '#ffd23f', plain: true }));
      if (hasHp) part(R, 'HP', { x: 630, y: top - 128, w: 96, h: 96 }, () => hpStar(ctx, 678, top - 80, 46, d.hp));
      if (String(d.keywords || '').trim()) part(R, 'Keywords', { x: 420, y: top - 50, w: 280, h: 40 }, () => comicLabel(ctx, d.keywords, 700, top - 16, 30, { align: 'right' }));
    },
  },
  envDeck: {
    name: 'Environment deck card', group: 'Environment', orient: 'h',
    fields: [
      F.sec('Card'), F.text('title', 'Title', 'Collapsing Walkway'), F.text('keywords', 'Keywords', 'Ongoing'), F.num('hp', 'HP', ''),
      F.tog('suddenly', 'SUDDENLY! banner'),
      F.sec('Art'), F.img('art', 'Card art'), F.text('artist', 'Artist'),
      F.sec('Game text'), F.area('gameText', 'Game text', 'At the start of the Environment turn, each target deals itself 1 melee damage.\nWhen this card is destroyed, each player may draw a card.', { help: GT_HELP, rows: 6, chips: true }),
      F.sec('Quote'), F.area('quote', 'Quote', 'Watch your step. All of them.', { rows: 2 }), F.text('attribution', 'Attribution', 'Mighty Tales #14'),
      ...STYLE('#2f9e55', [F.color('titleColor', 'Title color', '#ffb000')]),
    ],
    draw(R) {
      const { ctx, d, W, H } = R;
      const fc = d.frameColor;
      frameBg(ctx, W, H, fc);
      const art = { x: 26, y: 26, w: 520, h: H - 52 };
      drawArt(R, 'art', art, { phColor: shade(fc, 0.1) });
      strokeShape(ctx, art, 5);
      const hasQ = String(d.quote || '').trim() || String(d.attribution || '').trim();
      const hasHp = d.hp !== '' && d.hp != null;
      const tr = { x: 556, y: 38, w: hasHp ? 372 : 466, h: 66 };
      part(R, 'Title', tr, () => banner(ctx, d.title, tr, { color: d.titleColor }));
      if (hasHp) part(R, 'HP', { x: 928, y: 22, w: 112, h: 112 }, () => hpStar(ctx, 980, 72, 52, d.hp));
      const tb = { x: 572, y: 150, w: 446, h: hasQ ? 430 : 568 };
      part(R, 'Text box', tb, () => { box(ctx, tb, { dots: rgba(fc, 0.14) }); gameText(R, d.gameText, { x: tb.x + 20, y: tb.y + 36, w: tb.w - 40, h: tb.h - 50 }, { base: 28, valign: 'center' }); });
      part(R, 'Keywords', { x: 556, y: 110, w: 260, h: 48 }, () => { const w = tag(ctx, d.keywords, 556, 110, 48, { maxW: 440 }); return w ? { x: 556, y: 110, w, h: 48 } : null; });
      if (d.suddenly) part(R, 'SUDDENLY!', { x: W - 310, y: 104, w: 270, h: 70 }, () => suddenly(ctx, W - 40, 112));
      const qr = { x: 480, y: 596, w: 546, h: 122 };
      if (hasQ) part(R, 'Quote', qr, () => quoteBubble(ctx, d.quote, d.attribution, qr, shade(fc, -0.3), (d.quoteSize || 100) / 100));
      artistCredit(R, d.artist, W, H);
    },
  },
  envBack: {
    name: 'Environment deck back', group: 'Environment', orient: 'h',
    fields: [F.sec('Card'), F.text('title', 'Environment name', 'Example City'), F.img('art', 'Art'), F.color('frameColor', 'Border color', '#13202a')],
    draw(R) {
      const { ctx, d, W, H } = R;
      ctx.fillStyle = d.frameColor; ctx.fillRect(0, 0, W, H);
      const art = { x: 26, y: 26, w: W - 52, h: H - 52 };
      drawArt(R, 'art', art, { phColor: '#3f7f5a' });
      strokeShape(ctx, art, 5);
      part(R, 'Title', { x: 52, y: 50, w: 400, h: 64 }, () => { const w = tag(ctx, d.title, 52, 50, 64, { maxW: 700 }); return w ? { x: 52, y: 50, w, h: 64 } : null; });
    },
  },
  principle: {
    name: 'Principle card', group: 'Principles', orient: 'h',
    fields: [
      F.sec('Card'), F.text('title', 'Title', 'Principle of the Open Door'),
      F.sec('Art'), F.img('art', 'Card art'), F.text('artist', 'Artist'),
      F.sec('Game text'), F.area('gameText', 'Game text', 'End Phase\nEach player may draw a card.', { help: GT_HELP, rows: 6, chips: true }),
      F.sec('Flavor text'), F.area('quote', 'Flavor text', 'Every door you open lets something in. You have made peace with that.', { rows: 3 }),
      ...STYLE('#272429', [F.color('accent', 'Edge color', '#4b2f78'), F.color('titleColor', 'Title color', '#ffb000'), F.color('paperColor', 'Flavor box color', '#ece2c8')]),
    ],
    draw(R) {
      const { ctx, d, W, H } = R;
      const fc = d.frameColor;
      ctx.fillStyle = fc; ctx.fillRect(0, 0, W, H);
      halftone(ctx, { x: 0, y: 0, w: W, h: H }, 'rgba(255,255,255,.035)', { step: 14, dir: 'diag', maxR: 4 });
      // purple edge behind the left column
      ctx.fillStyle = d.accent || '#4b2f78'; ctx.fillRect(22, 26, 18, H - 52); ctx.fillRect(22, 26, 360, 12);
      const art = { x: 520, y: 26, w: W - 546, h: H - 52 };
      drawArt(R, 'art', art, { phColor: '#6a4a3a' });
      strokeShape(ctx, art, 4);
      const hasQ = String(d.quote || '').trim();
      const tb = { x: 26, y: 128, w: 470, h: hasQ ? 446 : 590 };
      part(R, 'Text box', tb, () => { box(ctx, tb, { shadow: false, lw: 3, dots: 'rgba(0,0,0,.05)' }); gameText(R, d.gameText, inset(tb, 24, 22), { base: 30, valign: 'center' }); });
      part(R, 'Title', { x: 38, y: 40, w: 474, h: 66 }, () => banner(ctx, d.title, { x: 38, y: 40, w: 474, h: 66 }, { color: d.titleColor }));
      if (hasQ) part(R, 'Flavor text', { x: 26, y: 588, w: 476, h: 132 }, () => {
        ctx.save(); ctx.translate(0, 0);
        ctx.beginPath(); ctx.moveTo(30, 592); ctx.lineTo(494, 598); ctx.lineTo(500, 716); ctx.lineTo(40, 720); ctx.closePath();
        ctx.fillStyle = d.paperColor || '#ece2c8'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.stroke();
        ctx.restore();
        captionBox(ctx, d.quote, { x: 44, y: 600, w: 444, h: 112 }, { size: 22 * ((d.quoteSize || 100) / 100), fill: 'rgba(0,0,0,0)', stroke: 'rgba(0,0,0,0)', pad: 6 });
      });
      artistCredit(R, d.artist, W, H);
    },
  },
  principleBack: {
    name: 'Principles deck back', group: 'Principles', orient: 'h', badge: 'NEW',
    fields: [
      F.sec('Back'), F.text('title', 'Title', 'Principles Deck'),
      F.sec('Panels'), F.img('artA', 'Panel 1'), F.img('artB', 'Panel 2'), F.img('artC', 'Panel 3'), F.img('artD', 'Panel 4'), F.img('artE', 'Panel 5'),
      F.color('frameColor', 'Border color', '#141416'),
    ],
    draw(R) {
      const { ctx, d, W, H } = R;
      ctx.fillStyle = d.frameColor; ctx.fillRect(0, 0, W, H);
      backPanels(R, [
        ['artA', [[24, 24], [600, 24], [470, 330], [24, 380]]],
        ['artB', [[612, 24], [1026, 24], [1026, 250], [500, 330]]],
        ['artC', [[24, 392], [470, 342], [380, 726], [24, 726]]],
        ['artD', [[482, 340], [1026, 262], [1026, 470], [430, 560]]],
        ['artE', [[426, 572], [1026, 482], [1026, 726], [392, 726]]],
      ], null, null);
      part(R, 'Title', { x: 40, y: 34, w: 420, h: 70 }, () => comicLabel(ctx, d.title, 52, 92, 52, { stroke: INK, color: '#fff', maxW: 520 }));
    },
  },
  eventFront: {
    name: 'Event (front)', group: 'Events', orient: 'v', badge: 'NEW',
    fields: [
      F.sec('Event'), F.text('title', 'Title', 'Night of the Long Fall'), F.text('date', 'Date', 'October 1984'),
      F.area('flavor', 'Flavor text', 'Baron Example has finally found a way to pull the moon out of the sky.\n\nThe heroes have one night to stop him before the tides swallow the city.', { rows: 5, help: 'Lettered in caps. A blank line starts a new paragraph.' }),
      F.num('collectionLimit', 'Collection limit', '1'),
      F.sec('Effect'), F.text('villain', 'Villain', 'Baron Example'), F.text('effectTitle', 'Effect title', 'Falling Skies'),
      F.area('effectText', 'Effect game text', 'At the end of the Villain turn, Baron Example deals each Hero target 1 projectile damage.', { rows: 3, help: GT_HELP, chips: true }),
      ...COVER_FIELDS.map(f => f.key === 'blurb' ? { ...f, def: 'The night the sky fell!' } : f.key === 'age' ? { ...f, def: 30 } : f.key === 'era' ? { ...f, def: 'bronze' } : f),
      F.sec('Style', { closed: true }), F.color('paperColor', 'Paper color', '#eadfc4'), F.color('captionColor', 'Caption color', '#ffe14d'),
      F.range('tilt', 'Cover turn (degrees)', -2, -8, 8, 0.5),
      F.range('textSize', 'Text size (%)', 100, 60, 140), F.tog('hiPhase', 'Higher-contrast phase labels'), F.text('boldTerms', 'Extra bolded terms'),
    ],
    draw(R) { eventFrontDraw(R, false); },
  },
  eventBack: {
    name: 'Event (back, collection)', group: 'Events', orient: 'h', badge: 'NEW',
    fields: [
      F.sec('Collection'), F.text('title', 'Event title (for your list)', 'Night of the Long Fall'),
      F.area('collFlavor', 'Collection flavor text', 'The heroes chased Baron Example to his moon-anchor high above the bay.\n\nWith seconds to spare, they cut the chain and the moon drifted home. The city never knew how close it came.', { rows: 6, help: 'Lettered in caps. A blank line starts a new paragraph.' }),
      F.area('issues', 'Collection issues (one per line)', 'Mighty Tales #40\nBaron Example #3\nCity of Tides One-Shot\nMighty Tales Annual #2', { rows: 5 }),
      F.sec('Rewards'),
      F.area('rewardIntro', 'Reward rules', 'One Hero may use one of these two abilities at any time during their turn. Once either ability has been used, remove this card from the game.', { rows: 3 }),
      F.text('r1Title', 'Reward 1 title', 'Lunar Insight'),
      F.area('r1Flavor', 'Reward 1 flavor text', 'Up close, the moon had a lot to say.', { rows: 2 }),
      F.area('r1Text', 'Reward 1 game text', 'Reveal the top 3 cards of 1 deck. Replace them in any order.', { rows: 2, help: GT_HELP, chips: true }),
      F.text('r2Title', 'Reward 2 title', 'Tide Turner'),
      F.area('r2Flavor', 'Reward 2 flavor text', 'The sea remembers who saved it.', { rows: 2 }),
      F.area('r2Text', 'Reward 2 game text', 'Destroy up to 2 Environment cards.', { rows: 2, help: GT_HELP, chips: true }),
      ...COVER_FIELDS.map(f => f.key === 'blurb' ? { ...f, def: 'Annual special!' } : f.key === 'coverBg' ? { ...f, def: '#4a8fd6' } : f.key === 'comicTitle' ? { ...f, def: 'Mighty Tales Annual' } : f.key === 'issueNo' ? { ...f, def: '2' } : f.key === 'age' ? { ...f, def: 30 } : f.key === 'era' ? { ...f, def: 'bronze' } : f),
      F.sec('Style', { closed: true }), F.color('paperColor', 'Paper color', '#eadfc4'), F.color('captionColor', 'Caption color', '#ffe14d'),
      F.range('tilt', 'Cover turn (degrees)', 0, -8, 8, 0.5),
      F.range('textSize', 'Text size (%)', 100, 60, 140), F.tog('hiPhase', 'Higher-contrast phase labels'), F.text('boldTerms', 'Extra bolded terms'),
    ],
    draw(R) {
      const { ctx, d, W, H } = R;
      paperBg(R, d.paperColor);
      comicLabel(ctx, 'Collection', 34, 60, 44, { stroke: INK, color: '#fff' });
      const issues = String(d.issues || '').split('\n').map(s => s.trim()).filter(Boolean);
      // cover in the middle, issue list under it
      const cw = 360, cx = 352;
      const isz = 21, ih = issues.length ? issues.length * isz * 1.2 + 14 : 0;
      const chh = Math.min(H - 60 - ih, cw / 0.66);
      part(R, 'Cover', { x: cx, y: 30, w: cw, h: chh }, () => tiltedCover(R, { x: cx, y: 30, w: cw, h: chh }, d.tilt));
      if (issues.length) part(R, 'Issue list', { x: cx - 10, y: 30 + chh + 10, w: cw + 20, h: ih }, () => {
        ctx.save(); ctx.fillStyle = '#2a2016'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        issues.forEach((l, i) => { fitFont(ctx, l, TF.body, cw + 20, isz, 'italic'); ctx.fillText(l, cx + cw / 2, 30 + chh + 14 + i * isz * 1.2); });
        ctx.restore();
      });
      part(R, 'Caption', { x: 30, y: 78, w: cx - 50, h: H - 108 }, () => captionBox(ctx, d.collFlavor, { x: 30, y: 78, w: cx - 50, h: H - 108 }, { size: 30, pad: 16, fill: d.captionColor }));
      part(R, 'Rewards', { x: cx + cw + 22, y: 30, w: W - 50 - cx - cw, h: H - 60 }, () => {
      // rewards column
      const rx = cx + cw + 22, rw = W - 28 - rx;
      const s = (d.textSize || 100) / 100;
      const intro = String(d.rewardIntro || '').trim();
      let ry = 30;
      if (intro) {
        const lay = drawGameTextBox(ctx, '_' + intro.replace(/\n/g, ' ') + '_', { x: rx, y: ry, w: rw, h: 170 }, { base: 22 * s, min: 11, terms: terms(d) });
        ry += (lay ? lay.height : 0) + 16;
      }
      const rb = { x: rx, y: ry, w: rw, h: H - 30 - ry };
      box(ctx, rb, { lw: 3, shadow: false });
      const one = (t, f, g) => {
        const parts = [];
        if (String(t || '').trim()) parts.push('**' + String(t).trim().toUpperCase() + '**');
        String(f || '').split('\n').map(x => x.trim()).filter(Boolean).forEach(x => parts.push('_' + x + '_'));
        if (String(g || '').trim()) parts.push(String(g).trim());
        return parts.join('\n');
      };
      const mid = rb.y + rb.h / 2;
      gameText(R, one(d.r1Title, d.r1Flavor, d.r1Text), { x: rb.x + 14, y: rb.y + 12, w: rb.w - 28, h: mid - 26 - rb.y - 12 }, { base: 22, min: 10 });
      gameText(R, one(d.r2Title, d.r2Flavor, d.r2Text), { x: rb.x + 14, y: mid + 26, w: rb.w - 28, h: rb.y + rb.h - 12 - mid - 26 }, { base: 22, min: 10 });
      ctx.save(); ctx.font = `30px ${TF.title}`;
      const ow = ctx.measureText('- OR -').width + 28;
      ctx.restore();
      tag(ctx, '- OR -', rb.x + (rb.w - ow) / 2, mid - 20, 40, { fill: '#ffe14d' });
      });
    },
  },
  criticalFront: {
    name: 'Critical Event (front)', group: 'Events', orient: 'v', badge: 'NEW',
    fields: [
      F.sec('Critical Event'), F.text('title', 'Title', 'Baron, Ascendant'), F.text('date', 'Date', 'March 1997'),
      F.area('flavor', 'Flavor text', 'Baron Example merged with his doomsday engine. Now the city has a new skyline, and it is wearing a cape.', { rows: 5, help: 'Lettered in caps. A blank line starts a new paragraph.' }),
      F.num('collectionLimit', 'Collection limit', '2'),
      F.text('banner', 'Top banner', 'Critical Event'),
      ...COVER_FIELDS.map(f => f.key === 'blurb' ? { ...f, def: 'One-shot special!' } : f.key === 'coverBg' ? { ...f, def: '#5aa04a' } : f.key === 'comicTitle' ? { ...f, def: 'Baron Ascendant' } : f.key === 'issueNo' ? { ...f, def: '1' } : f.key === 'age' ? { ...f, def: 15 } : f.key === 'era' ? { ...f, def: 'modern' } : f),
      F.sec('Style', { closed: true }), F.color('headerColor', 'Banner color', '#d62828'),
      F.color('paperColor', 'Paper color', '#eadfc4'), F.color('captionColor', 'Caption color', '#ffe14d'),
      F.range('tilt', 'Cover turn (degrees)', 0, -8, 8, 0.5),
    ],
    draw(R) { eventFrontDraw(R, true); },
  },
};

for (const [k, t] of Object.entries(TEMPLATES)) {
  t.fields.push(F.sec('Print and decks', { closed: true }), F.tog('border', 'Black card border', false, { help: 'Like printed cards. Good for Tabletop Simulator too.' }));
  if (!ONE_COPY_TYPES.has(k)) t.fields.push(F.num('copies', 'Copies in the deck', '1', { help: 'How many of this card the deck holds. Used by deck counts, print, PDF and Tabletop Simulator.' }));
}

// Order and grouping for the "New card" picker. Pairs make two linked cards at once.
const PICKER = [
  ['Hero', ['heroDeck', 'heroBack', 'heroChar', 'heroCharBack', 'faFront', 'faBack', ['heroChar', 'heroCharBack'], ['faFront', 'faBack']]],
  ['Villain', ['villainDeck', 'villainBack', 'villainChar', ['villainChar', 'villainChar'], 'teamVillain', ['teamVillain', 'teamVillain']]],
  ['Environment', ['envDeck', 'envBack']],
  ['Principles', ['principle', 'principleBack']],
  ['Events', ['eventFront', 'eventBack', 'criticalFront', ['eventFront', 'eventBack'], ['criticalFront', 'villainChar']]],
];

function cardSize(type) { return TEMPLATES[type].orient === 'h' ? [1050, 750] : [750, 1050]; }

function cloneVal(o) {
  if (Array.isArray(o)) return o.map(cloneVal);
  if (o && typeof o === 'object') { const r = {}; for (const k in o) r[k] = cloneVal(o[k]); return r; }
  return o;
}

function withDefaults(type, data) {
  const out = { ...data };
  for (const f of TEMPLATES[type].fields) {
    if (!f.key) continue;
    if (out[f.key] === undefined) out[f.key] = cloneVal(f.def);
    else if (f.type === 'image' && (!out[f.key] || typeof out[f.key] !== 'object')) out[f.key] = { ...IMG(), src: typeof out[f.key] === 'string' ? out[f.key] : '' };
  }
  return out;
}

function defaultData(type) { return withDefaults(type, {}); }

function cardLabel(card) {
  const d = card.data || {};
  return d.title || d.name || d.caption || TEMPLATES[card.type].name;
}

// Renders a card onto a canvas. Returns the render context (with hit regions).
async function renderCard(card, canvas, o = {}) {
  const tpl = TEMPLATES[card.type];
  const [W, H] = cardSize(card.type);
  const d = withDefaults(card.type, card.data || {});
  const srcs = tpl.fields.filter(f => f.type === 'image').map(f => d[f.key] && d[f.key].src).filter(Boolean);
  const imgs = new Map();
  await Promise.all(srcs.map(async s => imgs.set(s, await loadImg(s))));
  const b = o.bleed ? BLEED : 0, sc = o.scale || 1;
  const cw = Math.round((W + 2 * b) * sc), ch = Math.round((H + 2 * b) * sc);
  if (canvas.width !== cw) canvas.width = cw;
  if (canvas.height !== ch) canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  ctx.setTransform(sc, 0, 0, sc, b * sc, b * sc);
  const R = { ctx, d, W, H, imgs, hits: [], parts: [], exporting: !!o.exporting, seed: hashStr(card.id || 'x'), bleed: b, scale: sc };
  ctx.save();
  tpl.draw(R);
  ctx.restore();
  if (d.border) {
    ctx.save(); ctx.fillStyle = '#0b0b0c'; ctx.beginPath(); ctx.rect(0, 0, W, H);
    ctx.roundRect(22, 22, W - 44, H - 44, 16); ctx.fill('evenodd'); ctx.restore();
  }
  if (b) extendBleed(ctx, Math.round(b * sc), Math.round(W * sc), Math.round(H * sc));
  return R;
}

// Fills the bleed margin by stretching the outermost pixels of the card.
function extendBleed(ctx, b, w, h) {
  const c = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(c, b, b, 1, h, 0, b, b, h);
  ctx.drawImage(c, b + w - 1, b, 1, h, b + w, b, b, h);
  ctx.drawImage(c, 0, b, w + 2 * b, 1, 0, 0, w + 2 * b, b);
  ctx.drawImage(c, 0, b + h - 1, w + 2 * b, 1, 0, b + h, w + 2 * b, b);
}
