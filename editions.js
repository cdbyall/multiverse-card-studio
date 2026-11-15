// Enhanced Edition (the original Sentinels look) and OblivAeon templates.
// Positions are measured from scans and photos of the printed cards (fractions of the card),
// turned into pixels at 300 dpi. No official art is used.

// ---------- shared Enhanced Edition kit ----------
const EE_FAM = TF.quote; // all-caps comic hand lettering
const EE_KIND = {
  Hero: { bar: ['#ffe14d', '#f6a51c'], dots: '#f08a1a', title: '#ef4a1e', titleStroke: INK, plate: '#ffd93b', corner: ['#1d2a6b', '#e04fa4'] },
  Villain: { bar: ['#3f63d8', '#7b2fb3'], dots: '#2a1a7a', title: '#ffc21a', titleStroke: INK, plate: '#ff6a2a', corner: ['#d3261c', '#ffd21f'] },
  Environment: { bar: ['#7ad04a', '#2e9c3a'], dots: '#1f7a2a', title: '#ef4a1e', titleStroke: INK, plate: '#8fe05a', corner: ['#1f6d2c', '#9be36b'] },
};

function eeText(R, text, rect, o = {}) {
  return gameText(R, text, rect, { family: EE_FAM, caps: true, lineHeight: 1.14, paraGap: 0.55, ...o });
}
// Outlined comic title (left aligned or centered).
function eeTitle(ctx, text, x, y, size, maxW, o = {}) {
  text = String(text || '').toUpperCase();
  if (!text) return;
  ctx.save();
  const s = fitFont(ctx, text, o.family || TF.comic, maxW, size);
  ctx.textAlign = o.align || 'left'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
  ctx.lineWidth = s * 0.16; ctx.strokeStyle = o.stroke || INK;
  ctx.strokeText(text, x + s * 0.04, y + s * 0.05); ctx.strokeText(text, x, y);
  ctx.fillStyle = o.color || '#ef4a1e'; ctx.fillText(text, x, y);
  ctx.restore();
}
// Chrome lettering for villain names and HP (condensed, metallic, dark outline).
function eeChrome(ctx, text, x, y, size, maxW, o = {}) {
  text = String(text || '').toUpperCase();
  if (!text) return 0;
  ctx.save();
  ctx.font = `${size}px ${TF.comic}`;
  const sq = 0.78, w = ctx.measureText(text).width * sq;
  const k = Math.min(1, maxW / w);
  ctx.translate(x, y); ctx.scale(sq * k, k);
  ctx.textAlign = o.align || 'left'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
  const g = ctx.createLinearGradient(0, -size * 0.85, 0, 0);
  const c = o.colors || ['#ffffff', '#b9d4f2', '#4d6fa8', '#e6f1ff'];
  g.addColorStop(0, c[0]); g.addColorStop(0.45, c[1]); g.addColorStop(0.55, c[2]); g.addColorStop(1, c[3]);
  ctx.lineWidth = size * 0.12; ctx.strokeStyle = o.stroke || '#0c1530'; ctx.strokeText(text, 0, 0);
  ctx.fillStyle = g; ctx.fillText(text, 0, 0);
  ctx.restore();
  return w * k;
}
// Flat plate with centered caps text (keyword plates, description bars, section tabs).
function eePlate(ctx, text, r, fill, o = {}) {
  ctx.save();
  ctx.fillStyle = fill; ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.lineWidth = o.lw || 3; ctx.strokeStyle = o.stroke || INK; ctx.strokeRect(r.x, r.y, r.w, r.h);
  text = String(text || '').toUpperCase();
  if (text) {
    ctx.fillStyle = o.color || INK; ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle';
    fitFont(ctx, text, o.family || EE_FAM, r.w - 20, r.h * (o.k || 0.72), o.weight || (o.italic ? 'italic 700' : '700'));
    ctx.fillText(text, o.align === 'left' ? r.x + 12 : r.x + r.w / 2, r.y + r.h * 0.54);
  }
  ctx.restore();
}
function eeCredit(R, x, y, align) {
  const t = String(R.d.artist || '').trim();
  if (!t) return;
  const { ctx } = R;
  ctx.save(); ctx.font = `13px ${EE_FAM}`; ctx.fillStyle = 'rgba(255,255,255,.92)';
  ctx.textAlign = align || 'right'; ctx.textBaseline = 'middle';
  ctx.fillText(('ART BY ' + t).toUpperCase(), x, y); ctx.restore();
}
// Round nemesis badge (Enhanced Edition style).
function eeNemesis(R, rect, color) {
  const { ctx, d } = R;
  if (d.noNemesis && !(d.nemesis && d.nemesis.src)) return;
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2, r = Math.min(rect.w, rect.h) / 2;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
  g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#9aa3ad');
  ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
  ctx.restore();
  const a = d.nemesis || {};
  const inner = { x: cx - r * 0.78, y: cy - r * 0.78, w: r * 1.56, h: r * 1.56 };
  if (a.src && R.imgs.get(a.src)) {
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r * 0.84, 0, Math.PI * 2); ctx.clip();
    drawArt(R, 'nemesis', inner, { fit: 'contain', placeholder: false }); ctx.restore();
  } else {
    ctx.save();
    const ini = String(d.name || d.title || '?').trim().split(/\s+/).map(s => s[0] || '').join('').slice(0, 2).toUpperCase();
    ctx.font = `${r}px ${TF.comic}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = color || '#c8102e'; ctx.fillText(ini, cx, cy + r * 0.06); ctx.restore();
    R.hits.push({ key: 'nemesis', rect: inner, has: false, click: true });
  }
}
// Stacked sections with tabs (villain instructions, team villains, Scions).
// secs: [{ tab, text }], laid into rect with heights shared out by how much each needs.
function eeSections(R, secs, rect, o = {}) {
  const { ctx } = R;
  secs = secs.filter(s => String(s.text || '').trim());
  if (!secs.length) return;
  const tabH = o.tabH || 32, gap = o.gap || 16, pad = o.pad || 12;
  const avail = rect.h - secs.length * (tabH + gap) + gap;
  const base = (o.base || 24) * ((R.d.textSize || 100) / 100);
  const need = secs.map(s => fitText(ctx, parseGameText(String(s.text).toUpperCase(), { terms: terms(R.d) }), rect.w - pad * 2, 9999, base, 10, { family: EE_FAM, lineHeight: 1.14, paraGap: 0.55 }).height + pad * 2);
  const total = need.reduce((a, b) => a + b, 0);
  const k = total > avail ? avail / total : 1;
  let y = rect.y;
  if (o.spread && total < avail) {
    // keep each box its natural height and space the sections over the area
    const extra = (avail - total) / secs.length;
    secs.forEach((s, i) => { s.y = y; y += tabH + need[i] + gap + extra; s.h = need[i]; });
  } else {
    const spare = o.fillFirst && total < avail ? avail - total : 0;
    secs.forEach((s, i) => { s.y = y; s.h = need[i] * k + (i === 0 ? spare : 0); y += tabH + s.h + gap; });
  }
  for (const s of secs) {
    const tw = o.tabW || Math.min(rect.w * 0.62, 300);
    const tx = o.tabAlign === 'left' ? rect.x + 14 : rect.x + (rect.w - tw) / 2;
    const bx = { x: rect.x, y: s.y + tabH - 2, w: rect.w, h: s.h };
    ctx.save(); ctx.fillStyle = o.boxFill || 'rgba(176,220,245,.88)'; ctx.fillRect(bx.x, bx.y, bx.w, bx.h);
    ctx.lineWidth = 3; ctx.strokeStyle = o.boxStroke || INK; ctx.strokeRect(bx.x, bx.y, bx.w, bx.h); ctx.restore();
    eePlate(ctx, s.tab, { x: tx, y: s.y, w: tw, h: tabH }, o.tabFill || '#ffd93b', { italic: true, k: 0.7 });
    eeText(R, s.text, inset(bx, pad, pad * 0.8), { base: o.base || 24, min: 10 });
  }
}
// Comic dots panel (the corner beside the quote).
function eeDotPanel(ctx, r, cols) {
  ctx.save();
  ctx.fillStyle = cols[0]; ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
  ctx.fillStyle = cols[1];
  const step = 26;
  for (let y = r.y, row = 0; y < r.y + r.h + step; y += step * 0.86, row++)
    for (let x = r.x + (row % 2) * step / 2; x < r.x + r.w + step; x += step) {
      ctx.beginPath(); ctx.arc(x, y, step * (0.18 + 0.2 * ((x * 7 + y * 3) % 5) / 5), 0, Math.PI * 2); ctx.fill();
    }
  ctx.restore();
  ctx.save(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.restore();
}
function eeBlack(R) { R.ctx.fillStyle = '#0a0a0b'; R.ctx.fillRect(0, 0, R.W, R.H); }

// ---------- Enhanced Edition deck card ----------
function eeDeckDraw(R, kind) {
  const { ctx, d, W, H } = R;
  const K = EE_KIND[kind] || EE_KIND.Hero;
  eeBlack(R);
  // art
  drawArt(R, 'art', { x: 22, y: 100, w: W - 44, h: 515 }, { phColor: kind === 'Villain' ? '#6a4cc0' : kind === 'Environment' ? '#4f9a46' : '#e0882a' });
  // title bar
  const tb = { x: 22, y: 22, w: W - 44, h: 80 };
  part(R, 'Title', tb, () => {
    ctx.save();
    const g = ctx.createLinearGradient(0, tb.y, 0, tb.y + tb.h);
    g.addColorStop(0, K.bar[0]); g.addColorStop(1, K.bar[1]);
    ctx.fillStyle = g; ctx.fillRect(tb.x, tb.y, tb.w, tb.h);
    halftone(ctx, tb, rgba(K.dots, 0.35), { step: 12, dir: 'up', maxR: 3.4 });
    ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.strokeRect(tb.x, tb.y, tb.w, tb.h);
    ctx.restore();
    const hasHp = String(d.hp || '').trim() !== '';
    eeTitle(ctx, d.title, tb.x + 16, tb.y + 64, 58, tb.w - (hasHp ? 140 : 32), { color: K.title });
  });
  if (String(d.hp || '').trim() !== '') part(R, 'HP', { x: W - 120, y: 8, w: 108, h: 108 }, () => {
    if (kind === 'Environment') {
      box(ctx, { x: W - 104, y: 30, w: 74, h: 64 }, { fill: '#fff', lw: 4, shadow: false });
      ctx.save(); ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      fitFont(ctx, String(d.hp), TF.comic, 62, 52); ctx.fillText(String(d.hp), W - 67, 64); ctx.restore();
    } else hpStar(ctx, W - 68, 62, 48, d.hp);
  });
  // text box
  const tx = { x: 22, y: 612, w: W - 44, h: 270 };
  ctx.save(); ctx.fillStyle = '#f6efd9'; ctx.fillRect(tx.x, tx.y, tx.w, tx.h);
  ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.strokeRect(tx.x, tx.y, tx.w, tx.h); ctx.restore();
  part(R, 'Game text', inset(tx, 18, 0), () => eeText(R, d.gameText, { x: tx.x + 22, y: tx.y + 38, w: tx.w - 44, h: tx.h - 50 }, { base: 37 }));
  // keyword plate over the art's bottom edge
  if (String(d.keywords || '').trim()) {
    const kr = kind === 'Villain' ? { x: 68, y: 580, w: 210, h: 50 } : { x: 75, y: 580, w: 412, h: 50 };
    ctx.save(); ctx.font = `700 34px ${EE_FAM}`;
    if (kind === 'Villain') kr.w = Math.min(560, Math.max(200, ctx.measureText(String(d.keywords).toUpperCase()).width + 50));
    ctx.restore();
    part(R, 'Keywords', kr, () => eePlate(ctx, d.keywords, kr, K.plate, { lw: 4, k: 0.66 }));
  }
  // quote: balloon (heroes, villains) or narration box (environments), with the dots corner
  const q = String(d.quote || '').trim(), at = String(d.attribution || '').trim();
  if (kind === 'Environment') {
    eeDotPanel(ctx, { x: 22, y: 884, w: W - 44, h: 128 }, [K.corner[0], K.corner[1]]);
    if (q) part(R, 'Quote', { x: 36, y: 892, w: 560, h: 112 }, () => {
      const r = { x: 36, y: 892, w: 560, h: 112 };
      ctx.save(); ctx.fillStyle = '#e6f6d8'; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.lineWidth = 4; ctx.strokeStyle = '#2e8a3a'; ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.restore();
      drawGameTextBox(ctx, q.toUpperCase(), inset(r, 14, 10), { base: 21 * ((d.quoteSize || 100) / 100), min: 10, family: EE_FAM, lineHeight: 1.1, valign: 'center' });
    });
  } else {
    eeDotPanel(ctx, { x: 22, y: 884, w: W - 44, h: 128 }, K.corner);
    if (q || at) part(R, 'Quote', { x: 26, y: 888, w: 556, h: 122 }, () => quoteBubble(ctx, q, at, { x: 26, y: 888, w: 556, h: 122 }, INK, 0.95 * ((d.quoteSize || 100) / 100)));
  }
  eeCredit(R, W - 26, H - 20);
}
const EE_DECK_FIELDS = (kind, title, kw, text, quote, attr, hp) => [
  F.sec('Card'), F.text('title', 'Title', title), F.text('keywords', 'Keywords', kw), F.num('hp', 'HP', hp || ''),
  F.sec('Art'), F.img('art', 'Card art'), F.text('artist', 'Artist (small credit line)'),
  F.sec('Game text'), F.area('gameText', 'Game text', text, { help: GT_HELP, rows: 6, chips: true }),
  F.sec(kind === 'Environment' ? 'Narration' : 'Quote'), F.area('quote', kind === 'Environment' ? 'Narration' : 'Quote', quote, { rows: 2 }),
  ...(kind === 'Environment' ? [] : [F.text('attribution', 'Attribution', attr)]),
  F.sec('Style', { closed: true }), F.range('textSize', 'Text size (%)', 100, 60, 140), F.range('quoteSize', 'Quote text size (%)', 100, 60, 140),
  F.tog('hiPhase', 'Higher-contrast phase labels'), F.text('boldTerms', 'Extra bolded terms'),
];

// Deck backs: one big piece of art, the game logo in the corner and the deck's name.
function eeBackDraw(R) {
  const { ctx, d, W, H } = R;
  eeBlack(R);
  drawArt(R, 'art', { x: 22, y: 22, w: W - 44, h: H - 44 }, { phColor: d.color || '#3a5fb8', phLabel: 'Back art' });
  if (!d.noLogo) part(R, 'Game logo', { x: 40, y: 40, w: 300, h: 120 }, () => {
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(40, 40, 300, 120); ctx.restore();
    eeTitle(ctx, d.gameName || 'Sentinels', 190, 92, 46, 270, { align: 'center', color: '#ffd21f' });
    eeTitle(ctx, d.gameSub || 'of the Multiverse', 190, 140, 34, 270, { align: 'center', color: '#fff' });
  });
  const lr = { x: 40, y: H * 0.56, w: W - 80, h: 220 };
  part(R, 'Logo', lr, () => drawLogo(R, 'logo', d.name, lr, d.color || '#3a5fb8'));
}
const EE_BACK_FIELDS = (name, color) => [
  F.sec('Back'), F.text('name', 'Deck name (lettered logo)', name), F.img('logo', 'Logo image (optional)'), F.color('color', 'Logo color', color),
  F.img('art', 'Back art'),
  F.sec('Game logo', { closed: true }), F.tog('noLogo', 'Hide the game logo'), F.text('gameName', 'Logo line 1', 'Sentinels'), F.text('gameSub', 'Logo line 2', 'of the Multiverse'),
];

// ---------- the templates ----------
Object.assign(TEMPLATES, {
  eeHeroDeck: {
    name: 'Hero deck card (Enhanced)', group: 'Enhanced Edition', orient: 'v', badge: 'NEW',
    fields: EE_DECK_FIELDS('Hero', 'Rally the Team', 'One-Shot', 'Each Hero target regains 2 HP.\nOne player may draw a card.', 'Stand together and nothing can knock us down!', 'Captain Example, Mighty Tales #12'),
    draw(R) { eeDeckDraw(R, 'Hero'); },
  },
  eeHeroBack: {
    name: 'Hero deck back (Enhanced)', group: 'Enhanced Edition', orient: 'v', badge: 'NEW',
    fields: EE_BACK_FIELDS('Captain Example', '#2f6fd6'), draw: eeBackDraw,
  },
  eeHeroChar: {
    name: 'Hero character card (Enhanced)', group: 'Enhanced Edition', orient: 'v', badge: 'NEW', labelName: true,
    fields: [
      F.sec('Hero'), F.text('name', 'Hero name', 'Captain Example'), F.img('logo', 'Logo image (optional)'), F.num('hp', 'HP', '30'),
      F.sec('Power'), F.text('powerName', 'Power name', 'Heroic Stand'),
      F.area('powerText', 'Power text', 'Until your next turn, reduce damage dealt to Hero targets by 1.', { help: 'POWER: is added for you. ' + GT_HELP, rows: 3, chips: true }),
      F.img('nemesis', 'Nemesis icon'), F.tog('noNemesis', 'No nemesis icon'),
      F.sec('Art'), F.img('art', 'Art'), F.text('artist', 'Artist (small credit line)'),
      F.sec('Masthead', { closed: true }), F.text('mast1', 'Top word', 'Sentinel'), F.text('mast2', 'Big letters', 'SC'), F.text('mast3', 'Bottom word', 'Comics'),
      F.sec('Style', { closed: true }), F.color('color', 'Name color', '#ffcf1a'), F.color('boxColor', 'Text box color', '#fff27a'),
      F.range('textSize', 'Text size (%)', 100, 60, 140), F.text('boldTerms', 'Extra bolded terms'),
    ],
    draw(R) {
      const { ctx, d, W, H } = R;
      eeBlack(R);
      drawArt(R, 'art', { x: 22, y: 22, w: W - 44, h: H - 60 }, { phColor: '#2f6fd6', phLabel: 'Hero art' });
      part(R, 'Masthead', { x: 30, y: 22, w: 64, h: 360 }, () => {
        const m = { x: 30, y: 26, w: 62, h: 268 };
        ctx.save(); ctx.fillStyle = '#fff'; ctx.fillRect(m.x, m.y, m.w, m.h); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.strokeRect(m.x, m.y, m.w, m.h);
        ctx.fillStyle = '#16306e'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        fitFont(ctx, String(d.mast1 || '').toUpperCase(), TF.label, m.w - 8, 15, '800'); ctx.fillText(String(d.mast1 || '').toUpperCase(), m.x + m.w / 2, m.y + 20);
        const big = String(d.mast2 || '').toUpperCase().slice(0, 3);
        ctx.font = `${92}px ${TF.comic}`;
        [...big].forEach((ch, i) => { const s = fitFont(ctx, ch, TF.comic, m.w - 6, 100); ctx.fillText(ch, m.x + m.w / 2, m.y + 28 + (i + 1) * (m.h - 60) / Math.max(1, big.length) - 6); });
        fitFont(ctx, String(d.mast3 || '').toUpperCase(), TF.label, m.w - 8, 15, '800'); ctx.fillText(String(d.mast3 || '').toUpperCase(), m.x + m.w / 2, m.y + m.h - 8);
        ctx.restore();
        if (String(d.hp || '').trim()) {
          const s = String(d.hp); ctx.save(); const fs = fitFont(ctx, s, TF.comic, 80, 84);
          ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.lineWidth = fs * 0.14; ctx.strokeStyle = INK; ctx.strokeText(s, m.x + m.w / 2, m.y + m.h + 82);
          ctx.fillStyle = '#ffe14d'; ctx.fillText(s, m.x + m.w / 2, m.y + m.h + 82); ctx.restore();
        }
      });
      part(R, 'Logo', { x: 105, y: 105, w: 533, h: 190 }, () => drawLogo(R, 'logo', d.name, { x: 105, y: 105, w: 533, h: 190 }, d.color));
      const pb = { x: 60, y: 868, w: 540, h: 140 };
      part(R, 'Power box', pb, () => {
        ctx.save(); ctx.fillStyle = d.boxColor || '#fff27a'; ctx.fillRect(pb.x, pb.y, pb.w, pb.h); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.strokeRect(pb.x, pb.y, pb.w, pb.h);
        ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        fitFont(ctx, String(d.powerName || '').toUpperCase(), EE_FAM, pb.w - 40, 26, '700'); ctx.fillText(String(d.powerName || '').toUpperCase(), pb.x + pb.w / 2, pb.y + 30);
        ctx.restore();
        let txt = String(d.powerText || '').trim();
        if (txt && !/^\s*power\s*:/i.test(txt)) txt = 'POWER: ' + txt;
        eeText(R, txt, { x: pb.x + 14, y: pb.y + 38, w: pb.w - 28, h: pb.h - 46 }, { base: 34 });
      });
      part(R, 'Nemesis icon', { x: 596, y: 806, w: 106, h: 106 }, () => eeNemesis(R, { x: 600, y: 810, w: 100, h: 100 }, '#c8102e'));
      eeCredit(R, W - 26, H - 20);
    },
  },
  eeHeroCharBack: {
    name: 'Hero character back (Enhanced)', group: 'Enhanced Edition', orient: 'v', badge: 'NEW',
    fields: [
      F.sec('Incapacitated'), F.area('options', 'Abilities (one per line)', '1 player may draw a card now.\n1 player may play a card now.\nThe Hero target with the lowest HP regains 2 HP.', { rows: 5, chips: true, help: 'Each line gets an arrow. ' + GT_HELP }),
      F.sec('Art'), F.img('art', 'Art'), F.text('artist', 'Artist (small credit line)'),
      F.sec('Style', { closed: true }), F.color('panelColor', 'Panel color', '#f7b2d4'), F.range('textSize', 'Text size (%)', 100, 60, 140), F.text('boldTerms', 'Extra bolded terms'),
    ],
    draw(R) {
      const { ctx, d, W, H } = R;
      eeBlack(R);
      drawArt(R, 'art', { x: 68, y: 84, w: W - 120, h: 693 }, { phColor: '#5a6f8f', phLabel: 'Incapacitated art' });
      ctx.save(); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.strokeRect(68, 84, W - 120, 693); ctx.restore();
      const pb = { x: 68, y: 777, w: W - 120, h: 200 };
      part(R, 'Text box', pb, () => {
        ctx.save(); ctx.fillStyle = d.panelColor || '#f7b2d4'; ctx.fillRect(pb.x, pb.y, pb.w, pb.h); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.strokeRect(pb.x, pb.y, pb.w, pb.h); ctx.restore();
        eeText(R, d.options, inset(pb, 16, 14), { base: 46, bullets: true, valign: 'center' });
      });
      eeCredit(R, W - 26, H - 20);
    },
  },
  eeVillainDeck: {
    name: 'Villain deck card (Enhanced)', group: 'Enhanced Edition', orient: 'v', badge: 'NEW',
    fields: EE_DECK_FIELDS('Villain', 'Slash and Burn', 'One-Shot', 'Baron Example deals the Hero target with the lowest HP 4 melee damage.', 'Heroes! Just in time to test my latest upgrades!', 'Baron Example, Freedom Five #457'),
    draw(R) { eeDeckDraw(R, 'Villain'); },
  },
  eeVillainBack: {
    name: 'Villain deck back (Enhanced)', group: 'Enhanced Edition', orient: 'v', badge: 'NEW',
    fields: EE_BACK_FIELDS('Baron Example', '#8e2442'), draw: eeBackDraw,
  },
  eeVillainChar: {
    name: 'Villain character card (Enhanced)', group: 'Enhanced Edition', orient: 'v', badge: 'NEW', labelName: true,
    flipDefaults: { title: 'Flipped Side', hp: '' },
    fields: [
      F.sec('Villain'), F.text('name', 'Villain name', 'Baron Example'), F.num('hp', 'HP', '40'),
      F.text('keywords', 'Keyword plate', 'Villain'), F.text('title', 'Description', 'Master of Mayhem'),
      F.img('nemesis', 'Nemesis icon'), F.tog('noNemesis', 'No nemesis icon'),
      F.sec('Art'), F.img('art', 'Art'), F.text('artist', 'Artist (small credit line)'),
      F.sec('Style', { closed: true }), F.color('descColor', 'Description bar color', '#a9dcf3'),
    ],
    draw(R) {
      const { ctx, d, W, H } = R;
      eeBlack(R);
      drawArt(R, 'art', { x: 68, y: 74, w: W - 136, h: 882 }, { phColor: '#3b4f8a', phLabel: 'Villain art' });
      ctx.save(); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.strokeRect(68, 74, W - 136, 882); ctx.restore();
      part(R, 'Name', { x: 75, y: 90, w: 450, h: 112 }, () => eeChrome(ctx, d.name, 80, 192, 112, String(d.hp || '').trim() ? 440 : 590));
      if (String(d.hp || '').trim()) part(R, 'HP', { x: 540, y: 90, w: 130, h: 112 }, () => eeChrome(ctx, d.hp, 668, 192, 112, 130, { align: 'right' }));
      part(R, 'Nemesis icon', { x: 576, y: 828, w: 100, h: 100 }, () => eeNemesis(R, { x: 578, y: 830, w: 96, h: 96 }, '#5a2a8a'));
      if (String(d.keywords || '').trim()) part(R, 'Keywords', { x: 135, y: 893, w: 315, h: 33 }, () => eePlate(ctx, d.keywords, { x: 135, y: 893, w: 315, h: 33 }, '#ffd93b', { italic: true }));
      if (String(d.title || '').trim()) part(R, 'Description', { x: 120, y: 924, w: 510, h: 38 }, () => eePlate(ctx, d.title, { x: 120, y: 924, w: 510, h: 38 }, d.descColor || '#a9dcf3', { italic: true }));
      eeCredit(R, W - 70, H - 48);
    },
  },
  eeVillainInstr: {
    name: 'Villain instructions card (Enhanced)', group: 'Enhanced Edition', orient: 'v', badge: 'NEW', labelName: true,
    flipDefaults: { title: 'Flipped Side', setup: '' },
    fields: [
      F.sec('Villain'), F.text('name', 'Villain name', 'Baron Example'), F.text('title', 'Side (subtitle box)', 'Master of Mayhem'),
      F.sec('Instructions'),
      F.area('setup', 'Setup', "At the start of the game, put Baron Example's villain character card into play, Master of Mayhem side up.\nShuffle the villain deck.", { rows: 4, chips: true }),
      F.area('gameplay', 'Game play', 'At the start of the villain turn, if there are 3 or more Devices in play, flip this card.\nAt the end of the villain turn, play the top card of the villain deck.', { rows: 4, chips: true }),
      F.area('advanced', 'Advanced', 'Reduce damage dealt to Devices by 1.', { rows: 2, chips: true }),
      F.sec('Art'), F.img('art', 'Background art (shown faded)'), F.text('artist', 'Artist (small credit line)'),
      F.sec('Style', { closed: true }), F.color('boxColor', 'Box color', '#b0dcf5'), F.range('textSize', 'Text size (%)', 100, 60, 140), F.text('boldTerms', 'Extra bolded terms'),
    ],
    draw(R) {
      const { ctx, d, W, H } = R;
      eeBlack(R);
      const ar = { x: 68, y: 74, w: W - 136, h: 882 };
      drawArt(R, 'art', ar, { phColor: '#5d93c9', phLabel: 'Background art' });
      ctx.save(); ctx.fillStyle = 'rgba(200,232,250,.45)'; ctx.fillRect(ar.x, ar.y, ar.w, ar.h); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.strokeRect(ar.x, ar.y, ar.w, ar.h); ctx.restore();
      part(R, 'Name', { x: 75, y: 90, w: 600, h: 112 }, () => eeChrome(ctx, d.name, 80, 192, 112, 590));
      if (String(d.title || '').trim()) part(R, 'Subtitle', { x: 113, y: 214, w: 510, h: 38 }, () => eePlate(ctx, d.title, { x: 113, y: 214, w: 510, h: 38 }, d.boxColor || '#b0dcf5', { italic: true }));
      const sr = { x: 92, y: 290, w: W - 184, h: 640 };
      part(R, 'Instructions', sr, () => eeSections(R, [{ tab: 'Setup', text: d.setup }, { tab: 'Game play', text: d.gameplay }, { tab: 'Advanced', text: d.advanced }], sr,
        { boxFill: rgba(d.boxColor || '#b0dcf5', 0.9), base: 34, tabW: 230, spread: true }));
      eeCredit(R, W - 70, H - 48);
    },
  },
  eeTeamVillain: {
    name: 'Team villain card (Enhanced, oversized)', group: 'Enhanced Edition', orient: 'h', badge: 'NEW', labelName: true,
    size: [1125, 750], inches: [6, 4],
    flipDefaults: { title: 'Incapacitated', hp: '', setup: '' },
    fields: [
      F.sec('Villain'), F.text('name', 'Villain name', 'Madame Example'), F.num('hp', 'HP', '20'),
      F.text('keywords', 'Keyword plate', 'Villain'), F.text('title', 'Description', 'The Every Woman'),
      F.img('nemesis', 'Nemesis icon'), F.tog('noNemesis', 'No nemesis icon'),
      F.sec('Instructions'),
      F.area('setup', 'Setup', "At the start of the game, put Madame Example's villain character card into play.", { rows: 3, chips: true }),
      F.area('gameplay', 'Game play', 'At the end of her turn, Madame Example deals the Hero target with the highest HP 2 melee damage.', { rows: 4, chips: true }),
      F.area('advanced', 'Advanced', '', { rows: 2, chips: true }),
      F.sec('Art'), F.img('art', 'Art'), F.text('artist', 'Artist (small credit line)'),
      F.sec('Style', { closed: true }), F.color('color', 'Panel color', '#e8572a'), F.color('nameColor', 'Name color', '#ff9a1f'),
      F.range('textSize', 'Text size (%)', 100, 60, 140), F.text('boldTerms', 'Extra bolded terms'),
    ],
    draw(R) {
      const { ctx, d, W, H } = R;
      eeBlack(R);
      drawArt(R, 'art', { x: 14, y: 14, w: 576, h: H - 28 }, { phColor: '#b5452a', phLabel: 'Villain art' });
      const pr = { x: 590, y: 14, w: W - 604, h: H - 50 };
      ctx.save(); const g = ctx.createLinearGradient(pr.x, 0, pr.x + pr.w, 0); g.addColorStop(0, shade(d.color, -0.15)); g.addColorStop(1, shade(d.color, 0.1));
      ctx.fillStyle = g; ctx.fillRect(pr.x, pr.y, pr.w, pr.h); ctx.restore();
      part(R, 'Name', { x: 34, y: 40, w: 450, h: 100 }, () => eeTitle(ctx, d.name, 34, 122, 84, 440, { color: d.nameColor || '#ff9a1f', family: TF.comic }));
      if (String(d.hp || '').trim()) part(R, 'HP', { x: 484, y: 38, w: 90, h: 112 }, () => {
        box(ctx, { x: 486, y: 40, w: 86, h: 108 }, { fill: '#fff', lw: 4, shadow: false });
        ctx.save(); ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; fitFont(ctx, String(d.hp), TF.comic, 76, 90); ctx.fillText(String(d.hp), 529, 98); ctx.restore();
      });
      const sr = { x: pr.x + 18, y: 40, w: pr.w - 36, h: H - 100 };
      part(R, 'Instructions', sr, () => eeSections(R, [{ tab: 'Setup', text: d.setup }, { tab: 'Game play', text: d.gameplay }, { tab: 'Advanced', text: d.advanced }], sr,
        { boxFill: '#f7a33b', base: 29, tabW: 200, spread: true }));
      if (String(d.keywords || '').trim()) part(R, 'Keywords', { x: 112, y: 640, w: 300, h: 32 }, () => eePlate(ctx, d.keywords, { x: 112, y: 640, w: 300, h: 32 }, '#ffd93b', { italic: true }));
      if (String(d.title || '').trim()) part(R, 'Description', { x: 100, y: 672, w: 340, h: 38 }, () => eePlate(ctx, d.title, { x: 100, y: 672, w: 340, h: 38 }, '#f39a2b', { italic: true }));
      part(R, 'Nemesis icon', { x: 444, y: 630, w: 84, h: 84 }, () => eeNemesis(R, { x: 446, y: 632, w: 80, h: 80 }, '#8e2442'));
      eeCredit(R, W - 26, H - 18);
    },
  },
  eeEnvDeck: {
    name: 'Environment deck card (Enhanced)', group: 'Enhanced Edition', orient: 'v', badge: 'NEW',
    fields: EE_DECK_FIELDS('Environment', 'Volcanic Eruption', '', 'At the start of the environment turn, deal each target 2 fire damage.', 'Blasting a dense cloud of ash into the sky, the volcano roared to life.', '', ''),
    draw(R) { eeDeckDraw(R, 'Environment'); },
  },
  eeEnvBack: {
    name: 'Environment deck back (Enhanced)', group: 'Enhanced Edition', orient: 'v', badge: 'NEW',
    fields: EE_BACK_FIELDS('Example City', '#2e9c3a'), draw: eeBackDraw,
  },
});

// ---------- OblivAeon ----------
function splatterBg(R, rect, cols, base) {
  const { ctx } = R;
  ctx.save(); ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
  ctx.fillStyle = base; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  const rnd = mulberry32(R.seed ^ 0x5eed);
  for (let i = 0; i < 26; i++) {
    const x = rect.x + rnd() * rect.w, y = rect.y + rnd() * rect.h, r = 20 + rnd() * 90;
    ctx.fillStyle = rgba(cols[i % cols.length], 0.55 + rnd() * 0.4);
    ctx.beginPath();
    for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2, rr = r * (0.55 + rnd() * 0.6); ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
    for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.arc(x + (rnd() - 0.5) * r * 3, y + (rnd() - 0.5) * r * 3, 3 + rnd() * 10, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}
function creamBox(ctx, r, fill) {
  ctx.save(); ctx.fillStyle = fill || '#f6efd9'; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.restore();
}
function titleBar(ctx, r, cols, text, o = {}) {
  ctx.save();
  const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h); g.addColorStop(0, cols[0]); g.addColorStop(1, cols[1]);
  ctx.fillStyle = g; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.restore();
  eeTitle(ctx, text, o.align === 'left' ? r.x + 18 : r.x + r.w / 2, r.y + r.h * 0.78, r.h * 0.78, r.w - 40, { align: o.align || 'center', color: o.color || '#ef4a1e' });
}
const OBL_TEXT_STYLE = [F.sec('Style', { closed: true }), F.range('textSize', 'Text size (%)', 100, 60, 140), F.text('boldTerms', 'Extra bolded terms')];

Object.assign(TEMPLATES, {
  oblBooklet: {
    name: 'OblivAeon (booklet page)', ttsName: 'OblivAeon', group: 'OblivAeon', orient: 'h', badge: 'NEW', labelName: true,
    size: [1028, 750], inches: [6.5, 4.74],
    flipDefaults: { title: 'Next Form' },
    fields: [
      F.sec('Villain'), F.text('name', 'Name', 'OblivAeon'), F.text('hp', 'HP', '10,000 HP'), F.text('keywords', 'Keyword plate', 'Villain'), F.text('title', 'Description', 'The End Has Come'),
      F.img('nemesis', 'Nemesis icon'), F.tog('noNemesis', 'No nemesis icon'),
      F.sec('Text'), F.area('gameplay', 'Game play', 'At the start of the villain turn, OblivAeon deals each Hero target 2 infernal damage.\nOblivAeon is immune to damage dealt by environment cards.', { rows: 6, chips: true }),
      F.area('advanced', 'Advanced', 'At the end of the villain turn, add 1 token to the Inevitable Destruction card.', { rows: 2, chips: true }),
      F.sec('Art'), F.img('art', 'Art (right page)'), F.text('artist', 'Artist (small credit line)'),
      F.sec('Style', { closed: true }), F.color('color', 'Page color', '#d22aa0'), F.range('textSize', 'Text size (%)', 100, 60, 140), F.text('boldTerms', 'Extra bolded terms'),
    ],
    draw(R) {
      const { ctx, d, W, H } = R;
      eeBlack(R);
      drawArt(R, 'art', { x: W / 2, y: 14, w: W / 2 - 14, h: H - 28 }, { phColor: '#3a1a5a', phLabel: 'OblivAeon art' });
      const lp = { x: 14, y: 14, w: W / 2 - 18, h: H - 28 };
      ctx.save(); ctx.fillStyle = d.color || '#d22aa0'; ctx.fillRect(lp.x, lp.y, lp.w, lp.h); ctx.restore();
      halftone(ctx, lp, 'rgba(0,0,0,.18)', { step: 14, dir: 'up', maxR: 3 });
      part(R, 'Name', { x: 24, y: 24, w: 480, h: 86 }, () => { const w = eeChrome(ctx, d.name, 28, 98, 84, 270); eeChrome(ctx, d.hp, 40 + Math.max(w, 200), 98, 84, 480 - Math.max(w, 200) - 20); });
      if (String(d.keywords || '').trim()) part(R, 'Keywords', { x: 60, y: 120, w: 260, h: 30 }, () => eePlate(ctx, d.keywords, { x: 60, y: 120, w: 260, h: 30 }, '#ffd93b', { italic: true }));
      if (String(d.title || '').trim()) part(R, 'Description', { x: 50, y: 150, w: 300, h: 34 }, () => eePlate(ctx, d.title, { x: 50, y: 150, w: 300, h: 34 }, '#f7a6dc', { italic: true }));
      part(R, 'Nemesis icon', { x: 370, y: 116, w: 74, h: 74 }, () => eeNemesis(R, { x: 372, y: 118, w: 70, h: 70 }, '#5a1a6a'));
      const sr = { x: 30, y: 200, w: lp.w - 32, h: H - 240 };
      part(R, 'Text', sr, () => eeSections(R, [{ tab: 'Game play', text: d.gameplay }, { tab: 'Advanced', text: d.advanced }], sr,
        { boxFill: '#f7b8e6', base: 24, tabW: 170, tabAlign: 'left', tabH: 28, fillFirst: true }));
      eeCredit(R, W - 26, H - 22);
    },
  },
  oblScion: {
    name: 'Scion (oversized)', group: 'OblivAeon', orient: 'h', badge: 'NEW', labelName: true,
    size: [1125, 750], inches: [6, 4],
    flipDefaults: { title: 'Flipped Side' },
    fields: [
      F.sec('Scion'), F.text('name', 'Name', 'Aeon Example'), F.num('hp', 'HP', '60'), F.text('keywords', 'Keyword plate', 'Villain, Scion'), F.text('title', 'Description', 'Aeon Army Commander'),
      F.img('nemesis', 'Nemesis icon'), F.tog('noNemesis', 'No nemesis icon'),
      F.sec('Text'), F.area('gameplay', 'Game play', 'At the start of the villain turn, if there are at least (H) Aeon Men here, flip this card.\nAt the end of the villain turn, play the top card of the Aeon Men deck.', { rows: 6, chips: true }),
      F.area('advanced', 'Advanced', 'The first time an Aeon Man enters this battle zone each turn, play the top card of the Aeon Men deck.', { rows: 2, chips: true }),
      F.sec('Quote'), F.area('quote', 'Quote', 'It was described in Aeon terms as "the end."', { rows: 2 }), F.text('attribution', 'Attribution', 'OblivAeon #1'),
      F.sec('Art'), F.img('art', 'Art (left and top strip)'), F.text('artist', 'Artist (small credit line)'),
      F.sec('Style', { closed: true }), F.color('nameColor', 'Name color', '#ff8a1f'), F.range('textSize', 'Text size (%)', 100, 60, 140), F.text('boldTerms', 'Extra bolded terms'),
    ],
    draw(R) {
      const { ctx, d, W, H } = R;
      eeBlack(R);
      splatterBg(R, { x: 14, y: 14, w: W - 28, h: H - 28 }, ['#f2a3c9', '#9c5ad6', '#ffb347', '#ffffff'], '#f4eef6');
      const art = [[14, 14], [W - 14, 14], [W - 14, 150], [506, 150], [506, H - 14], [14, H - 14]];
      drawArt(R, 'art', { x: 14, y: 14, w: W - 28, h: H - 28 }, { poly: art, phColor: '#e0742a', phLabel: 'Scion art' });
      ctx.save(); ctx.lineWidth = 4; ctx.strokeStyle = INK; pathShape(ctx, art); ctx.stroke(); ctx.restore();
      part(R, 'Name', { x: 22, y: 22, w: 450, h: 100 }, () => eeTitle(ctx, d.name, 26, 104, 86, 440, { color: d.nameColor || '#ff8a1f' }));
      if (String(d.hp || '').trim()) part(R, 'HP', { x: 1040, y: 36, w: 74, h: 112 }, () => {
        box(ctx, { x: 1042, y: 38, w: 70, h: 108 }, { fill: '#fff', lw: 4, shadow: false });
        ctx.save(); ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; fitFont(ctx, String(d.hp), TF.comic, 62, 80); ctx.fillText(String(d.hp), 1077, 94); ctx.restore();
      });
      const sr = { x: 420, y: 205, w: W - 446, h: 505 };
      part(R, 'Text', sr, () => eeSections(R, [{ tab: 'Gameplay', text: d.gameplay }, { tab: 'Advanced', text: d.advanced }], sr,
        { boxFill: '#f6efd9', base: 27, tabW: 200, tabAlign: 'left', tabH: 30, fillFirst: true }));
      if (String(d.keywords || '').trim()) part(R, 'Keywords', { x: 22, y: 556, w: 200, h: 32 }, () => eePlate(ctx, d.keywords, { x: 22, y: 556, w: 200, h: 32 }, '#ffd93b', { italic: true }));
      if (String(d.title || '').trim()) part(R, 'Description', { x: 22, y: 588, w: 300, h: 36 }, () => eePlate(ctx, d.title, { x: 22, y: 588, w: 300, h: 36 }, '#f6efd9', { italic: true }));
      part(R, 'Nemesis icon', { x: 326, y: 560, w: 72, h: 72 }, () => eeNemesis(R, { x: 328, y: 562, w: 68, h: 68 }, '#5a1a6a'));
      const q = String(d.quote || '').trim(), at = String(d.attribution || '').trim();
      if (q || at) part(R, 'Quote', { x: 22, y: 632, w: 360, h: 92 }, () => quoteBubble(ctx, q, at, { x: 22, y: 632, w: 360, h: 92 }, INK, 0.72));
      eeCredit(R, W - 26, H - 22);
    },
  },
  oblScionBack: {
    name: 'Scion deck back (oversized)', group: 'OblivAeon', orient: 'h', badge: 'NEW',
    size: [1125, 750], inches: [6, 4],
    fields: [F.sec('Back'), F.text('title', 'Words', 'Scion Deck'), F.img('art', 'Art (optional, replaces the splatter)')],
    draw(R) {
      const { ctx, d, W, H } = R;
      eeBlack(R);
      if (d.art && d.art.src) drawArt(R, 'art', { x: 14, y: 14, w: W - 28, h: H - 28 }, {});
      else { splatterBg(R, { x: 14, y: 14, w: W - 28, h: H - 28 }, ['#f2a3c9', '#9c5ad6', '#7b2fb3', '#ffffff', '#e04fa4'], '#faf4fb'); R.hits.push({ key: 'art', rect: { x: 14, y: 14, w: W - 28, h: H - 28 }, has: false, click: true }); }
      part(R, 'Words', { x: 60, y: 240, w: W - 120, h: 280 }, () => {
        ctx.save(); ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        fitFont(ctx, String(d.title || '').toUpperCase(), TF.comic, W - 160, 230); ctx.fillText(String(d.title || '').toUpperCase(), W / 2, H / 2 + 10); ctx.restore();
      });
    },
  },
  oblMission: {
    name: 'Mission (objective side)', group: 'OblivAeon', orient: 'h', badge: 'NEW',
    fields: [
      F.sec('Mission'), F.text('title', 'Title', 'Summon the Example'), F.text('label', 'Label', 'Objective'),
      F.area('gameText', 'Objective text', 'Whenever a Hero target deals 5 or more damage to a single target in one turn, add 1 token to this card.\nWhen there are 3 tokens on this card, flip it.', { rows: 5, chips: true, help: GT_HELP }),
      F.area('story', 'Story box', 'The heroes rushed to the rift, knowing the fate of the multiverse rode on what they did next.', { rows: 3 }),
      F.sec('Art'), F.img('art', 'Art'), F.text('artist', 'Artist (small credit line)'),
      ...OBL_TEXT_STYLE,
    ],
    draw(R) {
      const { ctx, d, W, H } = R;
      eeBlack(R);
      drawArt(R, 'art', { x: 18, y: 18, w: 500, h: 505 }, { phColor: '#b03a6a', phLabel: 'Mission art' });
      titleBar(ctx, { x: 18, y: 18, w: W - 36, h: 72 }, ['#7a0f1c', '#c22a3a'], d.title, { align: 'left', color: '#ffe0ea' });
      const rb = { x: 525, y: 100, w: W - 545, h: 590 };
      creamBox(ctx, rb);
      if (String(d.label || '').trim()) part(R, 'Label', { x: 525, y: 88, w: 230, h: 52 }, () => eePlate(ctx, d.label, { x: 525, y: 88, w: 230, h: 52 }, '#2a1418', { color: '#ff9db0', italic: true }));
      part(R, 'Objective text', rb, () => eeText(R, d.gameText, { x: rb.x + 22, y: rb.y + 60, w: rb.w - 44, h: rb.h - 76 }, { base: 38 }));
      const sb = { x: 18, y: 538, w: 500, h: 158 };
      ctx.save(); ctx.fillStyle = '#e27a72'; ctx.fillRect(sb.x, sb.y, sb.w, sb.h); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.strokeRect(sb.x, sb.y, sb.w, sb.h); ctx.restore();
      if (String(d.story || '').trim()) part(R, 'Story box', sb, () => drawGameTextBox(ctx, String(d.story).toUpperCase(), inset(sb, 16, 12), { base: 22, min: 10, family: EE_FAM, lineHeight: 1.12, valign: 'center' }));
      eeCredit(R, W - 26, H - 22);
    },
  },
  oblReward: {
    name: 'Mission (reward side)', group: 'OblivAeon', orient: 'v', badge: 'NEW',
    fields: EE_DECK_FIELDS('Hero', 'Apex of Example', 'Reward, Ongoing', 'Increase damage dealt by Hero targets by 1.', 'This is what we fight for.', 'Captain Example, OblivAeon #3'),
    draw(R) { eeDeckDraw(R, 'Hero'); },
  },
  oblShield: {
    name: 'OblivAeon Shield', ttsName: 'OblivAeon Shield', group: 'OblivAeon', orient: 'v', badge: 'NEW',
    flipDefaults: { phase: 'OblivAeon Shield Phase 2' },
    fields: [
      F.sec('Shield'), F.text('title', 'Title', 'The Source of Foes'), F.text('phase', 'Plate', 'OblivAeon Shield Phase 1'),
      F.area('gameText', 'Text', 'Bring forth Aeon Example.\nOblivAeon is immune to damage.\nAt the end of OblivAeon\'s turn, play the top card of the Aeon Men deck.', { rows: 6, chips: true, help: GT_HELP }),
      F.sec('Art'), F.img('art', 'Art'), F.text('artist', 'Artist (small credit line)'),
      ...OBL_TEXT_STYLE,
    ],
    draw(R) {
      const { ctx, d, W, H } = R;
      eeBlack(R);
      drawArt(R, 'art', { x: 22, y: 525, w: W - 44, h: 452 }, { phColor: '#2a5aa8', phLabel: 'Shield art' });
      titleBar(ctx, { x: 22, y: 31, w: W - 44, h: 66 }, ['#2b2f78', '#4a2a8a'], d.title, { color: '#ffd7f1' });
      const tb = { x: 22, y: 130, w: W - 44, h: 395 };
      creamBox(ctx, tb);
      if (String(d.phase || '').trim()) part(R, 'Plate', { x: 98, y: 95, w: 502, h: 52 }, () => eePlate(ctx, d.phase, { x: 98, y: 95, w: 502, h: 52 }, '#ffd93b', { italic: true }));
      part(R, 'Text', tb, () => eeText(R, d.gameText, { x: tb.x + 22, y: tb.y + 36, w: tb.w - 44, h: tb.h - 48 }, { base: 34 }));
      eeCredit(R, W - 26, H - 22);
    },
  },
  oblBattleZone: {
    name: 'Battle Zone', group: 'OblivAeon', orient: 'h', badge: 'NEW',
    fields: [
      F.sec('Battle Zone'), F.text('title', 'Title', 'First Battle Zone'),
      F.text('t1', 'Trigger 1', 'At the start of the villain turn'), F.area('x1', 'Text 1', 'If there are more Scions than heroes here, add 1 devastation token to the Inevitable Destruction card for each Scion here.', { rows: 3, chips: true }),
      F.text('t2', 'Trigger 2', 'Whenever a Scion is destroyed'), F.area('x2', 'Text 2', 'Remove 1 devastation token from the Inevitable Destruction card.', { rows: 2, chips: true }),
      F.text('t3', 'Trigger 3', 'Whenever a hero is incapacitated'), F.area('x3', 'Text 3', 'Add 1 devastation token to the Inevitable Destruction card.', { rows: 2, chips: true }),
      F.sec('Art'), F.img('art', 'Faded background art'),
      ...OBL_TEXT_STYLE,
    ],
    draw(R) {
      const { ctx, d, W, H } = R;
      eeBlack(R);
      const bg = { x: 18, y: 18, w: W - 36, h: H - 36 };
      ctx.save(); ctx.fillStyle = '#f6efd9'; ctx.fillRect(bg.x, bg.y, bg.w, bg.h); ctx.restore();
      ctx.save(); ctx.globalAlpha = 0.22; drawArt(R, 'art', bg, { placeholder: false }); ctx.restore();
      titleBar(ctx, { x: 18, y: 22, w: W - 36, h: 90 }, ['#f2c64a', '#c8901c'], d.title, { color: '#e8301c' });
      let y = 132;
      const secs = [[d.t1, d.x1], [d.t2, d.x2], [d.t3, d.x3]].filter(s => String(s[0] || '').trim() || String(s[1] || '').trim());
      const each = (H - 50 - y) / Math.max(1, secs.length);
      secs.forEach(([t, x], i) => {
        const sy = y + i * each;
        if (String(t || '').trim()) {
          ctx.save(); ctx.font = `italic 700 30px ${EE_FAM}`; const tw = Math.min(W - 120, ctx.measureText(String(t).toUpperCase()).width + 40); ctx.restore();
          eePlate(ctx, t, { x: 50, y: sy, w: tw, h: 44 }, '#ffd93b', { italic: true, k: 0.68 });
        }
        eeText(R, x, { x: 60, y: sy + 52, w: W - 120, h: each - 62 }, { base: 34 });
      });
    },
  },
  oblInevitable: {
    name: 'Inevitable Destruction (oversized)', group: 'OblivAeon', orient: 'h', badge: 'NEW',
    size: [1125, 750], inches: [6, 4],
    fields: [
      F.sec('Card'), F.text('title', 'Title', 'Inevitable Destruction Card'),
      F.area('gameText', 'Text', "At the start of OblivAeon's turn, if there are 12 or more devastation tokens on this card, remove 12 of them and remove the environment in the battle zone with OblivAeon from the game.", { rows: 4, chips: true }),
      F.text('pool', 'Token pool words', 'Devastation Token Pool'),
      F.text('track', 'Countdown (left to right, comma separated)', '6,5,4,3,2,1,0'), F.text('trackLabel', 'Under the first box', 'Countdown token'),
      ...OBL_TEXT_STYLE,
    ],
    draw(R) {
      const { ctx, d, W, H } = R;
      eeBlack(R);
      ctx.save(); ctx.fillStyle = '#f2ead8'; ctx.fillRect(14, 14, W - 28, H - 28); ctx.restore();
      titleBar(ctx, { x: 30, y: 24, w: W - 60, h: 76 }, ['#4a2a9a', '#2a1a6a'], d.title, { color: '#d6c8ff' });
      part(R, 'Text', { x: 40, y: 106, w: W - 80, h: 140 }, () => eeText(R, d.gameText, { x: 44, y: 110, w: W - 88, h: 136 }, { base: 28 }));
      const pool = { x: 40, y: 250, w: W - 80, h: 200 };
      part(R, 'Token pool', pool, () => {
        ctx.save(); ctx.fillStyle = '#b5b0aa'; ctx.fillRect(pool.x, pool.y, pool.w, pool.h); ctx.lineWidth = 3; ctx.strokeStyle = '#6a6460'; ctx.strokeRect(pool.x, pool.y, pool.w, pool.h);
        const words = String(d.pool || '').toUpperCase().split(/\s+/); const half = Math.ceil(words.length / 2);
        ctx.fillStyle = '#7a746e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        [words.slice(0, half).join(' '), words.slice(half).join(' ')].forEach((l, i) => { fitFont(ctx, l, TF.comic, pool.w - 120, 78); ctx.fillText(l, pool.x + pool.w / 2, pool.y + 62 + i * 80); });
        ctx.restore();
      });
      const nums = String(d.track || '').split(',').map(s => s.trim()).filter(Boolean);
      const tr = { x: 40, y: 488, w: W - 80, h: 225 };
      part(R, 'Countdown', tr, () => {
        const n = Math.max(1, nums.length), bw = tr.w / n;
        nums.forEach((s, i) => {
          const r = { x: tr.x + i * bw + 4, y: tr.y, w: bw - 8, h: tr.h - 30 };
          const last = i === n - 1;
          ctx.save(); const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
          g.addColorStop(0, last ? '#ff9a1f' : '#3a1a6a'); g.addColorStop(1, last ? '#d8401a' : '#1e0e3e');
          ctx.fillStyle = g; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.strokeRect(r.x, r.y, r.w, r.h);
          ctx.restore();
          eeTitle(ctx, s, r.x + r.w / 2, r.y + r.h * 0.8, r.h * 0.8, r.w - 16, { align: 'center', color: last ? '#fff3b0' : '#ffd21f' });
        });
        if (String(d.trackLabel || '').trim()) { ctx.save(); ctx.fillStyle = INK; ctx.textAlign = 'center'; fitFont(ctx, String(d.trackLabel).toUpperCase(), EE_FAM, bw, 18, '700'); ctx.fillText(String(d.trackLabel).toUpperCase(), tr.x + bw / 2, tr.y + tr.h - 6); ctx.restore(); }
      });
    },
  },
  oblReserve: {
    name: 'Scion Reserve (oversized)', group: 'OblivAeon', orient: 'h', badge: 'NEW',
    size: [1125, 750], inches: [6, 4],
    fields: [
      F.sec('Card'), F.text('title', 'Title', 'The Scion Reserve'),
      F.text('t1', 'Left heading', 'Round order'), F.area('x1', 'Left text', 'OblivAeon turn\n> Start of OblivAeon turn\n> Play the top card of the OblivAeon deck\nHero turns\nEnvironment turn in the first battle zone\nVillain turn in the first battle zone', { rows: 8, chips: true }),
      F.text('t2', 'Right heading', 'Gameplay'), F.area('x2', 'Right text', 'Whenever an environment is removed from the game, follow these steps:\n> Remove all of that environment\'s cards from the game.\n> Move the OblivAeon marker to that battle zone.', { rows: 8, chips: true }),
      ...OBL_TEXT_STYLE,
    ],
    draw(R) {
      const { ctx, d, W, H } = R;
      eeBlack(R);
      splatterBg(R, { x: 14, y: 14, w: W - 28, h: H - 28 }, ['#7b2fb3', '#e04fa4', '#ff8a1f', '#2a0a3a'], '#1a0a24');
      part(R, 'Title', { x: 40, y: 22, w: W - 80, h: 110 }, () => eeTitle(ctx, d.title, W / 2, 112, 100, W - 120, { align: 'center', color: '#ffb21f' }));
      const cw = (W - 100) / 2;
      [[d.t1, d.x1], [d.t2, d.x2]].forEach(([t, x], i) => {
        const r = { x: 40 + i * (cw + 20), y: 150, w: cw, h: H - 190 };
        part(R, i ? 'Right column' : 'Left column', r, () => {
          creamBox(ctx, r, 'rgba(246,239,217,.95)');
          if (String(t || '').trim()) eePlate(ctx, t, { x: r.x + 20, y: r.y - 16, w: Math.min(r.w - 40, 260), h: 36 }, '#ffd93b', { italic: true });
          eeText(R, x, { x: r.x + 18, y: r.y + 30, w: r.w - 36, h: r.h - 42 }, { base: 26, bullets: true });
        });
      });
    },
  },
  oblReminder: {
    name: 'Reminder card', group: 'OblivAeon', orient: 'v', badge: 'NEW',
    fields: [
      F.sec('Card'), F.text('title', 'Title', 'Hero Reminder Card'), F.text('tab', 'Heading', 'Hero start of turn phase:'),
      F.area('gameText', 'Text', 'First, you may move your hero marker from one battle zone to the other.\nThen you may do one of these six things:\n> Take on an objective\n> Swap out an objective\n> Trade an objective\n> Shuffle the mission deck', { rows: 8, chips: true }),
      ...OBL_TEXT_STYLE,
    ],
    draw(R) {
      const { ctx, d, W, H } = R;
      eeBlack(R);
      ctx.save(); ctx.fillStyle = '#f6efd9'; ctx.fillRect(22, 22, W - 44, H - 44); ctx.restore();
      titleBar(ctx, { x: 22, y: 30, w: W - 44, h: 72 }, ['#3a7ad8', '#1f4fa8'], d.title, { color: '#ffd21f' });
      if (String(d.tab || '').trim()) part(R, 'Heading', { x: 40, y: 112, w: W - 80, h: 44 }, () => eePlate(ctx, d.tab, { x: 40, y: 112, w: W - 80, h: 44 }, '#ffd93b', { italic: true, align: 'left' }));
      part(R, 'Text', { x: 40, y: 170, w: W - 80, h: H - 220 }, () => eeText(R, d.gameText, { x: 44, y: 172, w: W - 88, h: H - 220 }, { base: 33, bullets: true }));
    },
  },
  oblDeck: {
    name: 'OblivAeon deck card', group: 'OblivAeon', orient: 'v', badge: 'NEW',
    fields: EE_DECK_FIELDS('Villain', 'Example of Ruin', 'One-Shot', 'OblivAeon deals each Hero target in this battle zone 3 energy damage.', 'All things end.', 'OblivAeon, OblivAeon #2'),
    draw(R) { eeDeckDraw(R, 'Villain'); },
  },
  oblDeckBack: {
    name: 'OblivAeon deck back', group: 'OblivAeon', orient: 'v', badge: 'NEW',
    fields: [F.sec('Back'), F.text('title', 'Words', 'OblivÆon'), F.color('glow', 'Glow color', '#ff8a1f'), F.img('art', 'Art (optional, replaces the eclipse)')],
    draw(R) {
      const { ctx, d, W, H } = R;
      eeBlack(R);
      if (d.art && d.art.src) drawArt(R, 'art', { x: 22, y: 22, w: W - 44, h: H - 44 }, {});
      else {
        const cx = W / 2, cy = H * 0.44, r = 200;
        const g = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.9);
        g.addColorStop(0, d.glow || '#ff8a1f'); g.addColorStop(0.3, rgba(d.glow || '#ff8a1f', 0.45)); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#050505'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
        R.hits.push({ key: 'art', rect: { x: 22, y: 22, w: W - 44, h: H - 44 }, has: false, click: true });
      }
      part(R, 'Words', { x: 40, y: H * 0.76, w: W - 80, h: 120 }, () => {
        ctx.save(); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        fitFont(ctx, String(d.title || '').toUpperCase(), TF.label, W - 120, 92, '300'); ctx.fillText(String(d.title || '').toUpperCase(), W / 2, H * 0.76 + 60); ctx.restore();
      });
    },
  },
  oblAeon: {
    name: 'Aeon Men card', group: 'OblivAeon', orient: 'v', badge: 'NEW',
    fields: EE_DECK_FIELDS('Villain', 'Aeon Example', 'Aeon Man', 'At the end of the villain turn, this card deals the Hero target with the highest HP 2 energy damage.', '', '', '4'),
    draw(R) { eeDeckDraw(R, 'Villain'); },
  },
  oblAeonBack: {
    name: 'Aeon Men deck back', group: 'OblivAeon', orient: 'v', badge: 'NEW',
    fields: [F.sec('Back'), F.text('title', 'Words', 'Aeon Men'), F.img('art', 'Art (optional, replaces the glow)')],
    draw(R) {
      const { ctx, d, W, H } = R;
      eeBlack(R);
      if (d.art && d.art.src) drawArt(R, 'art', { x: 22, y: 22, w: W - 44, h: H - 44 }, {});
      else {
        const g = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, H * 0.6);
        g.addColorStop(0, '#ff9a3a'); g.addColorStop(0.45, '#7a2a10'); g.addColorStop(1, '#120806');
        ctx.fillStyle = g; ctx.fillRect(22, 22, W - 44, H - 44);
        R.hits.push({ key: 'art', rect: { x: 22, y: 22, w: W - 44, h: H - 44 }, has: false, click: true });
      }
      part(R, 'Words', { x: 22, y: H / 2 - 80, w: W - 44, h: 160 }, () => {
        ctx.save(); ctx.fillStyle = 'rgba(190,225,255,.92)'; ctx.fillRect(22, H / 2 - 80, W - 44, 160);
        ctx.fillStyle = '#0d1a3a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        fitFont(ctx, String(d.title || '').toUpperCase(), TF.comic, W - 120, 120); ctx.fillText(String(d.title || '').toUpperCase(), W / 2, H / 2 + 6); ctx.restore();
      });
    },
  },
});

// print fields and copies for the new templates (render.js does this for its own)
const EDITION_TYPES = ['eeHeroDeck', 'eeHeroBack', 'eeHeroChar', 'eeHeroCharBack', 'eeVillainDeck', 'eeVillainBack', 'eeVillainChar', 'eeVillainInstr', 'eeTeamVillain', 'eeEnvDeck', 'eeEnvBack',
  'oblBooklet', 'oblScion', 'oblScionBack', 'oblMission', 'oblReward', 'oblShield', 'oblBattleZone', 'oblInevitable', 'oblReserve', 'oblReminder', 'oblDeck', 'oblDeckBack', 'oblAeon', 'oblAeonBack'];
for (const k of ['eeHeroBack', 'eeVillainBack', 'eeEnvBack', 'eeHeroCharBack', 'oblDeckBack', 'oblAeonBack', 'oblScionBack', 'oblReward']) ONE_COPY_TYPES.add(k);
for (const k of EDITION_TYPES) {
  const t = TEMPLATES[k];
  t.fields.push(F.sec('Print and decks', { closed: true }), F.tog('border', 'Black card border', false, { help: 'Like printed cards. Good for Tabletop Simulator too.' }));
  if (!ONE_COPY_TYPES.has(k)) t.fields.push(F.num('copies', 'Copies in the deck', '1', { help: 'How many of this card the deck holds (0 leaves it out, 99 at most). Used by deck counts, print, PDF and Tabletop Simulator.' }));
}
PICKER.push(
  ['Enhanced Edition (original look)', ['eeHeroDeck', 'eeHeroBack', ['eeHeroChar', 'eeHeroCharBack'], 'eeVillainDeck', 'eeVillainBack', ['eeVillainChar', 'eeVillainChar'], ['eeVillainInstr', 'eeVillainInstr'], ['eeTeamVillain', 'eeTeamVillain'], 'eeEnvDeck', 'eeEnvBack', 'eeHeroChar', 'eeHeroCharBack', 'eeVillainChar', 'eeVillainInstr', 'eeTeamVillain']],
  ['OblivAeon', [['oblBooklet', 'oblBooklet'], ['oblScion', 'oblScion'], ['oblMission', 'oblReward'], ['oblShield', 'oblShield'], 'oblBattleZone', 'oblInevitable', 'oblReserve', 'oblReminder', 'oblDeck', 'oblDeckBack', 'oblAeon', 'oblAeonBack', 'oblScionBack', 'oblScion', 'oblMission', 'oblReward', 'oblShield', 'oblBooklet']],
);
