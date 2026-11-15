// pdf.js: a tiny PDF writer for print sheets. Pages hold JPEG images (and optional
// thin cut lines). Sizes are in points (72 per inch). No libraries.
function makePdf(pages, pageW, pageH) {
  const enc = new TextEncoder();
  const chunks = [], offsets = [];
  let size = 0;
  const push = b => { if (typeof b === 'string') b = enc.encode(b); chunks.push(b); size += b.length; };
  const objStart = n => { offsets[n] = size; push(`${n} 0 obj\n`); };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'.replace(/[\u0080-ÿ]/g, '?'));
  // number the objects: 1 catalog, 2 pages, then images, then page + content pairs
  const imgIds = new Map();
  let next = 3;
  for (const p of pages) for (const it of p.items) if (!imgIds.has(it.img)) imgIds.set(it.img, next++);
  const pageIds = pages.map(() => { const id = next; next += 2; return id; });
  objStart(1); push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objStart(2); push(`<< /Type /Pages /Kids [${pageIds.map(i => i + ' 0 R').join(' ')}] /Count ${pages.length} >>\nendobj\n`);
  for (const [img, id] of imgIds) {
    objStart(id);
    push(`<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`);
    push(img.bytes); push('\nendstream\nendobj\n');
  }
  const f = n => (Math.round(n * 100) / 100).toString();
  pages.forEach((p, i) => {
    const id = pageIds[i];
    let cs = '';
    const used = new Set();
    for (const it of p.items) {
      const iid = imgIds.get(it.img); used.add(iid);
      cs += `q ${f(it.w)} 0 0 ${f(it.h)} ${f(it.x)} ${f(pageH - it.y - it.h)} cm /Im${iid} Do Q\n`;
    }
    if (p.lines && p.lines.length) {
      cs += '0.6 G 0.4 w\n';
      for (const [x1, y1, x2, y2] of p.lines) cs += `${f(x1)} ${f(pageH - y1)} m ${f(x2)} ${f(pageH - y2)} l S\n`;
    }
    const xo = [...used].map(n => `/Im${n} ${n} 0 R`).join(' ');
    objStart(id);
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(pageW)} ${f(pageH)}] /Resources << /XObject << ${xo} >> >> /Contents ${id + 1} 0 R >>\nendobj\n`);
    const body = enc.encode(cs);
    objStart(id + 1);
    push(`<< /Length ${body.length} >>\nstream\n`); push(body); push('\nendstream\nendobj\n');
  });
  const xref = size;
  let x = `xref\n0 ${next}\n0000000000 65535 f \n`;
  for (let n = 1; n < next; n++) x += String(offsets[n]).padStart(10, '0') + ' 00000 n \n';
  push(x);
  push(`trailer\n<< /Size ${next} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: 'application/pdf' });
}
