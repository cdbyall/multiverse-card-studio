// text.js: turns plain game text into laid-out, auto-fitted rich text on a canvas.
// Plain-text rules (no markup needed):
//   "Start Phase: ..." / "[Play Phase]" / "End Phase" on its own line  -> phase label
//   "POWER: ..." / "REACTION: ..." / "Setup: ..."                     -> bold label
//   "> ..." or "- ..." at the start of a line                          -> arrow bullet
//   (H) -> H icon, [flip] / (flip) / (F) -> flip icon
//   **bold**, _italic_, and any "Extra bolded terms" are bolded; phase names are always bold.
'use strict';

const TF = {
  body: '"Noto Sans", "Segoe UI", sans-serif',
  label: '"Work Sans", "Segoe UI", sans-serif',
  comic: 'Bangers, Impact, sans-serif',
  title: 'Boogaloo, Impact, sans-serif',
  quote: '"Unmasked BB", "Comic Neue", "Comic Sans MS", sans-serif',
  phase: '"Avengeance Mightiest Avenger", Bangers, Impact, sans-serif',
};

const PHASE_RE = /^\s*\[?\s*(start|play|end|draw|power)\s+phase\s*\]?\s*:?\s*(.*)$/i;
const BULLET_RE = /^\s*(?:>|-|•|\*)\s+/;
const LABEL_RE = /^\s*(power|reaction|setup|advanced|challenge|setback|ongoing)\s*:\s*/i;

function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function parseInline(text, terms) {
  const t = (terms || []).map(s => s.trim()).filter(Boolean)
    .sort((a, b) => b.length - a.length).map(escRe);
  const parts = [
    '\\*\\*(.+?)\\*\\*',
    '(?<![\\w])_(.+?)_(?![\\w])',
    '\\(h\\)',
    '\\[flip\\]|\\(flip\\)|\\(f\\)',
    '\\{([a-z0-9_-]{1,24})\\}',
    '\\b(?:start|play|end|draw|power)\\s+phase\\b',
  ];
  if (t.length) parts.push('(?<![\\w])(?:' + t.join('|') + ')(?![\\w])');
  const re = new RegExp(parts.join('|'), 'gi');
  const runs = [];
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m[0] === '') { re.lastIndex++; continue; }
    if (m.index > last) runs.push({ s: text.slice(last, m.index) });
    const k = m[0];
    if (m[1] != null) runs.push({ s: m[1], b: 1 });
    else if (m[2] != null) runs.push({ s: m[2], i: 1 });
    else if (/^\(h\)$/i.test(k)) runs.push({ icon: 'H' });
    else if (/^(\[flip\]|\(flip\)|\(f\))$/i.test(k)) runs.push({ icon: 'flip' });
    else if (m[3] != null) runs.push(TEXT_ICONS.has(m[3].toLowerCase()) || DRAWN_ICONS[m[3].toLowerCase()] ? { icon: 'custom', name: m[3].toLowerCase() } : { s: k });
    else if (/phase$/i.test(k)) runs.push({ s: k.toUpperCase().replace(/\s+/, ' '), b: 1 });
    else runs.push({ s: k, b: 1 });
    last = re.lastIndex;
  }
  if (last < text.length) runs.push({ s: text.slice(last) });
  return runs;
}

function parseGameText(src, opts = {}) {
  const blocks = [];
  for (let raw of String(src || '').replace(/\r/g, '').split('\n')) {
    if (!raw.trim()) continue;
    const m = raw.match(PHASE_RE);
    if (m) {
      blocks.push({ k: 'phase', label: m[1].toUpperCase() + ' PHASE' });
      raw = m[2];
      if (!raw.trim()) continue;
    }
    let bullet = false;
    if (BULLET_RE.test(raw)) { bullet = true; raw = raw.replace(BULLET_RE, ''); }
    else if (opts.bullets) bullet = true;
    const runs = [];
    const lm = raw.match(LABEL_RE);
    if (lm) {
      runs.push({ s: lm[1].toUpperCase() + ': ', lab: 1 });
      raw = raw.slice(lm[0].length);
    }
    runs.push(...parseInline(raw, opts.terms));
    blocks.push({ k: 'p', runs, bullet });
  }
  return blocks;
}

function runFont(r, size, fam) {
  if (r.lab) return `700 ${size}px ${fam || TF.label}`;
  return `${r.i ? 'italic ' : ''}${r.b ? '700' : '400'} ${size}px ${fam || TF.body}`;
}

function layoutText(ctx, blocks, width, size, o = {}) {
  const lh = size * (o.lineHeight || 1.24);
  const gap = size * (o.paraGap != null ? o.paraGap : 0.42);
  const ind = size * 1.15;
  const phaseH = size * 1.4;
  const lines = [];
  let y = 0, first = true;
  for (const b of blocks) {
    if (b.k === 'phase') {
      if (!first) y += gap * 0.7;
      lines.push({ y, phase: b.label });
      y += phaseH;
      first = false;
      continue;
    }
    if (!first) y += gap;
    first = false;
    const x0 = b.bullet ? ind : 0, maxW = width - x0;
    let line = { y, items: [], w: 0, x0, bullet: b.bullet };
    const trim = () => {
      while (line.items.length && line.items[line.items.length - 1].sp) line.w -= line.items.pop().w;
    };
    const pushLine = () => {
      trim(); lines.push(line); y += lh;
      line = { y, items: [], w: 0, x0, bullet: false };
    };
    for (const r of b.runs) {
      if (r.icon) {
        const w = size * 1.05;
        if (line.w + w > maxW && line.items.length) pushLine();
        line.items.push({ icon: r.icon, name: r.name, x: line.w, w });
        line.w += w;
        continue;
      }
      const font = runFont(r, size, o.family);
      ctx.font = font;
      for (const piece of r.s.split(/(\s+)/)) {
        if (!piece) continue;
        const sp = /^\s+$/.test(piece);
        if (sp && !line.items.length) continue;
        let s = sp ? ' ' : piece;
        let w = ctx.measureText(s).width;
        // a single word wider than the line (a URL, a long name) is split
        while (!sp && w > maxW && s.length > 1) {
          let n = s.length - 1;
          while (n > 1 && ctx.measureText(s.slice(0, n)).width > maxW - (line.items.length ? line.w : 0)) n--;
          if (line.items.length && ctx.measureText(s.slice(0, n)).width > maxW - line.w) { pushLine(); continue; }
          const head = s.slice(0, n);
          line.items.push({ s: head, font, x: line.w, w: ctx.measureText(head).width, sp: false, lab: r.lab });
          line.w += ctx.measureText(head).width;
          pushLine();
          s = s.slice(n); w = ctx.measureText(s).width;
        }
        if (!sp && line.w + w > maxW && line.items.length) {
          // keep a word glued to what it touches (e.g. "PHASE" + ","): carry the whole word over
          let k = line.items.length;
          while (k > 0 && !line.items[k - 1].sp && !line.items[k - 1].icon) k--;
          const carry = k > 0 ? line.items.splice(k) : [];
          if (carry.length) line.w = carry[0].x;
          pushLine();
          for (const it of carry) { it.x = line.w; line.items.push(it); line.w += it.w; }
        }
        line.items.push({ s, font, x: line.w, w, sp, lab: r.lab });
        line.w += w;
      }
    }
    if (line.items.length) pushLine();
  }
  return { lines, height: y, size, width };
}

function fitText(ctx, blocks, w, h, base, min, o) {
  let s = base, lay;
  min = min || 13;
  for (let n = 0; n < 60; n++) {
    lay = layoutText(ctx, blocks, w, s, o);
    if (lay.height <= h || s <= min) break;
    s = Math.max(min, s * 0.95);
  }
  return lay;
}

function drawArrowBullet(ctx, x, y, s, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - s * 0.55);
  ctx.lineTo(x + s * 0.7, y);
  ctx.lineTo(x, y + s * 0.55);
  ctx.lineTo(x + s * 0.18, y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawTextIcon(ctx, kind, x, baseY, size, color) {
  const r = size * 0.42, cx = x + size * 0.52, cy = baseY - size * 0.36;
  ctx.save();
  ctx.lineWidth = Math.max(1.5, size * 0.09);
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  if (kind === 'H') {
    ctx.font = `800 ${size * 0.62}px ${TF.label}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('H', cx, cy + size * 0.03);
    ctx.lineWidth = Math.max(1, size * 0.05);
    ctx.beginPath(); ctx.moveTo(cx - r * 0.75, cy); ctx.lineTo(cx + r * 0.75, cy); ctx.stroke();
  } else {
    // flip: two curved arrows chasing each other
    ctx.lineWidth = Math.max(1.5, size * 0.07);
    for (const a0 of [Math.PI * 0.15, Math.PI * 1.15]) {
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, a0, a0 + Math.PI * 0.75); ctx.stroke();
      const ae = a0 + Math.PI * 0.75;
      const ax = cx + Math.cos(ae) * r * 0.55, ay = cy + Math.sin(ae) * r * 0.55;
      ctx.beginPath();
      ctx.moveTo(ax + Math.cos(ae - 0.9) * r * 0.32, ay + Math.sin(ae - 0.9) * r * 0.32);
      ctx.lineTo(ax, ay);
      ctx.lineTo(ax + Math.cos(ae + Math.PI * 0.5 + 0.5) * r * 0.32, ay + Math.sin(ae + Math.PI * 0.5 + 0.5) * r * 0.32);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// Icons typed as {name}: pictures added under "Text icons" (TEXT_ICONS, set by the app),
// or a few drawn ones. Unknown names print as {name} so typos show.
const TEXT_ICONS = new Map();
const DRAWN_ICONS = {
  sun(ctx, cx, cy, r) { ctx.beginPath(); ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2); ctx.fill(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62); ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.stroke(); } },
  moon(ctx, cx, cy, r) { ctx.beginPath(); ctx.arc(cx, cy, r * 0.85, 0, Math.PI * 2); ctx.arc(cx + r * 0.38, cy - r * 0.22, r * 0.7, 0, Math.PI * 2, true); ctx.fill('evenodd'); },
  star(ctx, cx, cy, r) { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r; ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); },
  ankh(ctx, cx, cy, r) { ctx.beginPath(); ctx.ellipse(cx, cy - r * 0.45, r * 0.32, r * 0.42, 0, 0, Math.PI * 2); ctx.stroke(); ctx.fillRect(cx - r * 0.75, cy - r * 0.02, r * 1.5, r * 0.2); ctx.fillRect(cx - r * 0.1, cy, r * 0.2, r); },
  eye(ctx, cx, cy, r) { ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.quadraticCurveTo(cx, cy - r * 0.9, cx + r, cy); ctx.quadraticCurveTo(cx, cy + r * 0.9, cx - r, cy); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2); ctx.fill(); },
  skull(ctx, cx, cy, r) { ctx.beginPath(); ctx.arc(cx, cy - r * 0.15, r * 0.75, Math.PI, 0); ctx.lineTo(cx + r * 0.5, cy + r * 0.75); ctx.lineTo(cx - r * 0.5, cy + r * 0.75); ctx.closePath(); ctx.fill(); ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.arc(cx - r * 0.3, cy, r * 0.2, 0, Math.PI * 2); ctx.arc(cx + r * 0.3, cy, r * 0.2, 0, Math.PI * 2); ctx.fill(); ctx.restore(); },
  heart(ctx, cx, cy, r) { ctx.beginPath(); ctx.moveTo(cx, cy + r * 0.85); ctx.bezierCurveTo(cx - r * 1.3, cy - r * 0.1, cx - r * 0.5, cy - r * 1.1, cx, cy - r * 0.35); ctx.bezierCurveTo(cx + r * 0.5, cy - r * 1.1, cx + r * 1.3, cy - r * 0.1, cx, cy + r * 0.85); ctx.fill(); },
  bolt(ctx, cx, cy, r) { ctx.beginPath(); ctx.moveTo(cx + r * 0.2, cy - r); ctx.lineTo(cx - r * 0.55, cy + r * 0.1); ctx.lineTo(cx - r * 0.05, cy + r * 0.1); ctx.lineTo(cx - r * 0.25, cy + r); ctx.lineTo(cx + r * 0.6, cy - r * 0.15); ctx.lineTo(cx + r * 0.08, cy - r * 0.15); ctx.closePath(); ctx.fill(); },
};
function drawCustomIcon(ctx, name, x, baseY, size, color) {
  const cx = x + size * 0.52, cy = baseY - size * 0.36, r = size * 0.44;
  const img = TEXT_ICONS.get(name);
  ctx.save();
  if (img && img.width) {
    const s = Math.min(size * 0.95 / img.width, size * 0.95 / img.height);
    ctx.drawImage(img, cx - img.width * s / 2, cy - img.height * s / 2, img.width * s, img.height * s);
  } else if (DRAWN_ICONS[name]) {
    ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.5, size * 0.08); ctx.lineCap = 'round';
    DRAWN_ICONS[name](ctx, cx, cy, r);
  } else {
    ctx.fillStyle = '#c8102e'; ctx.font = `700 ${size * 0.5}px ${TF.label}`; ctx.textBaseline = 'alphabetic';
    ctx.fillText('{' + name + '}', x, baseY);
  }
  ctx.restore();
}

function drawPhaseLabel(ctx, label, x, y, size, o) {
  const fs = size * 1.18;
  ctx.save();
  ctx.font = `${fs}px ${TF.phase}`;
  const tw = ctx.measureText(label).width;
  const sq = size * 0.62;
  const by = y + size * 1.02;
  if (o.hiPhase) {
    ctx.fillStyle = '#c8102e';
    ctx.fillRect(x - 4, y + size * 0.08, tw + sq + size * 0.9, size * 1.18);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + 2, by - sq - size * 0.04, sq * 0.8, sq * 0.8);
    ctx.fillText(label, x + sq + size * 0.3, by);
  } else {
    ctx.fillStyle = '#d0142c';
    ctx.fillRect(x, by - sq - size * 0.02, sq, sq);
    ctx.translate(x + sq + size * 0.32, by);
    ctx.transform(1, 0, -0.14, 1, 0, 0);
    ctx.lineJoin = 'round';
    ctx.lineWidth = fs * 0.12; ctx.strokeStyle = '#1a0a0a';
    ctx.strokeText(label, 0, 0);
    ctx.fillStyle = '#e8213b';
    ctx.fillText(label, 0, 0);
  }
  ctx.restore();
}

function drawLaid(ctx, lay, x, y, o = {}) {
  const color = o.color || '#151515';
  const size = lay.size;
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  for (const L of lay.lines) {
    if (L.phase) { drawPhaseLabel(ctx, L.phase, x, y + L.y, size, o); continue; }
    const by = y + L.y + size * 0.95;
    const off = o.align === 'center' ? (lay.width - L.x0 - L.w) / 2 : 0;
    if (L.bullet) drawArrowBullet(ctx, x + size * 0.15, by - size * 0.34, size * 0.5, o.bulletColor || color);
    for (const it of L.items) {
      const ix = x + L.x0 + it.x + off;
      if (it.icon === 'custom') { drawCustomIcon(ctx, it.name, ix, by, size, color); continue; }
      if (it.icon) { drawTextIcon(ctx, it.icon, ix, by, size, color); continue; }
      ctx.font = it.font;
      ctx.fillStyle = it.lab ? (o.labelColor || color) : color;
      ctx.fillText(it.s, ix, by);
    }
  }
  ctx.restore();
}

// Draws game text into a rect, shrinking the font until it fits.
function drawGameTextBox(ctx, text, rect, o = {}) {
  if (o.caps) text = String(text || '').toUpperCase();
  const blocks = parseGameText(text, o);
  if (!blocks.length) return null;
  const lay = fitText(ctx, blocks, rect.w, rect.h, o.base || 30, o.min || 13, o);
  let y = rect.y;
  if (o.valign === 'center') y += Math.max(0, (rect.h - lay.height) / 2);
  else if (o.valign === 'bottom') y += Math.max(0, rect.h - lay.height);
  drawLaid(ctx, lay, rect.x, y, o);
  return lay;
}

function wrapPlain(ctx, text, maxW) {
  const out = [];
  for (const para of String(text || '').split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const t = line ? line + ' ' + w : w;
      if (line && ctx.measureText(t).width > maxW) { out.push(line); line = w; }
      else line = t;
    }
    out.push(line);
  }
  return out;
}
