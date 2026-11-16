// Cetak langsung dan unduh PDF. Keduanya memakai susunan yang sama: A4, kop, tabel, total, tanda tangan.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pdfSafe = (s) => String(s ?? '').replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();

export function docHtml(model) {
  const { no, tgl, title, entitas, alamat, logo, trx, rows, totals, ket, ttd } = model;
  const head = `<header class="kop"><div class="brandline">${logo ? `<img src="${esc(logo)}" alt="RMODA Studio">` : ''}<div><b>${esc(entitas)}</b>${alamat ? `<p class="addr">${esc(alamat)}</p>` : ''}</div></div><h1>${esc(title)}</h1><p class="docno">No. ${esc(no || '')}</p><p class="doctgl">Tanggal ${esc(tgl || '')}</p></header>`;
  const cust = `<p class="cust"><b>${esc(trx.kepada || '')}</b><br>${esc(trx.kend || '')}${trx.plat ? ' · ' + esc(trx.plat) : ''}<br>${esc(trx.lokasi || '')}${trx.wo ? '<br>WO ' + esc(trx.wo) : ''}</p>`;
  const table = `<table><thead><tr>${['Keterangan', 'Qty', 'Harga', 'Diskon', 'Jumlah'].map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${(rows || []).map((r) => `<tr><td>${esc(r[0])}</td><td class="n">${esc(r[1])}</td><td class="n">${esc(r[2])}</td><td class="n">${esc(r[3])}</td><td class="n">${esc(r[4])}</td></tr>`).join('')}</tbody></table>`;
  const sum = `<div class="totals">${(totals || []).map(([k, v]) => `<div><span>${esc(k)}</span><b class="amt">${esc(v)}</b></div>`).join('')}</div>`;
  const foot = `${ket ? `<p class="ket"><b>Keterangan</b><br>${esc(ket)}</p>` : ''}<div class="ttd"><div><small>Hormat kami</small><b>${esc(ttd || entitas || '')}</b></div><div><small>Penerima</small><b>${esc(trx.kepada || '')}</b></div></div>`;
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${esc(title)} ${esc(no || '')}</title>
<style>
@page { size: A4 portrait; margin: 14mm; }
html, body { margin: 0; color: #111; font: 12px/1.45 "Inter", system-ui, sans-serif; }
.brandline { display: flex; gap: 12px; align-items: flex-start; }
.brandline img { height: 42px; width: auto; background: #111; }
.addr { white-space: pre-line; margin: 4px 0 0; }
.kop h1 { font-size: 18px; margin: 10px 0 0; }
.docno, .doctgl { margin: 2px 0; }
table { width: 100%; border-collapse: collapse; margin-top: 12px; table-layout: fixed; }
th, td { border-bottom: 1px solid #ddd; padding: 6px 4px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
th { font-size: 11px; }
td.n, th:nth-child(n+2) { text-align: right; white-space: nowrap; }
th:first-child, td:first-child { width: 36%; }
th:nth-child(2), td:nth-child(2) { width: 10%; }
th:nth-child(3), td:nth-child(3) { width: 22%; }
th:nth-child(4), td:nth-child(4) { width: 14%; }
th:nth-child(5), td:nth-child(5) { width: 18%; }
thead { display: table-header-group; }
tr, .totals, .ttd, .ket, .cust { break-inside: avoid; page-break-inside: avoid; }
.totals { margin-top: 12px; margin-left: auto; width: min(320px, 100%); }
.totals div { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.totals span { min-width: 0; }
.totals b, .amt { white-space: nowrap; flex: none; }
.ttd { display: flex; justify-content: space-between; gap: 24px; margin-top: 36px; }
.ttd div { width: 42%; }
.ttd small, .ttd b { display: block; }
.ttd b { margin-top: 56px; font-weight: 650; }
.ket { white-space: pre-wrap; color: #333; margin-top: 16px; }
@media screen { body { padding: 8px; background: #f3f3f1; } .sheet { background: #fff; max-width: 210mm; margin: 0 auto; padding: 12mm; min-height: 240mm; } }
@media screen and (max-width: 640px) {
  body { padding: 0; }
  .sheet { padding: 10px; min-height: 0; }
  table, .kop, .cust { font-size: 11px; }
  th, td { padding: 4px 2px; }
  th:nth-child(4), td:nth-child(4) { display: none; }
  th:nth-child(5), td:nth-child(5) { width: 34%; white-space: nowrap; }
  th:nth-child(3), td:nth-child(3) { width: 28%; white-space: nowrap; }
}
</style></head><body><article class="sheet">${head}${cust}${table}${sum}${foot}</article></body></html>`;
}

export function printHtml(html) {
  if (window.PORTAL_NOPRINT) return;
  const frame = document.createElement('iframe');
  frame.setAttribute('title', 'Cetak dokumen');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const w = frame.contentWindow;
  w.document.open();
  w.document.write(html);
  w.document.close();
  const go = () => {
    try { w.focus(); w.print(); }
    catch (e) {
      const pop = window.open('', '_blank');
      if (!pop) throw new Error('Dialog cetak tidak terbuka. Izinkan pop-up, lalu tekan Ctrl+P.');
      pop.document.write(html);
      pop.document.close();
      pop.focus();
      setTimeout(() => pop.print(), 250);
    }
    setTimeout(() => frame.remove(), 1500);
  };
  setTimeout(go, 200);
}

async function lib() {
  if (globalThis.PDFLib) return globalThis.PDFLib;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'assets/crm/lib/pdf-lib.min.js';
    s.onload = res;
    s.onerror = () => rej(new Error('Pustaka PDF tidak termuat'));
    document.head.appendChild(s);
  });
  return globalThis.PDFLib;
}

export async function downloadPdf(model, filename) {
  const PDFLib = await lib();
  const doc = await PDFLib.PDFDocument.create();
  if (model.logo) {
    try {
      const bytes = await (await fetch(model.logo)).arrayBuffer();
      model._logo = await doc.embedPng(bytes);
    } catch (e) { model._logo = null; }
  }
  const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  const bold = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
  const pageW = 595, pageH = 842, margin = 40;
  const cols = [210, 50, 100, 80, 75];
  let page = doc.addPage([pageW, pageH]);
  let y = pageH - margin;

  const ensure = (need) => {
    if (y - need < margin) {
      page = doc.addPage([pageW, pageH]);
      y = pageH - margin;
      drawHeader(true);
    }
  };
  const text = (value, x, size, face, max) => {
    let s = pdfSafe(value);
    if (max) while (s && face.widthOfTextAtSize(s, size) > max) s = s.slice(0, -1);
    page.drawText(s, { x, y, size, font: face });
  };
  const wrap = (value, x, size, face, max, lineH) => {
    const words = pdfSafe(value).split(' ').filter(Boolean);
    let line = '';
    const lines = [];
    for (const w of words) {
      const tryLine = line ? line + ' ' + w : w;
      if (face.widthOfTextAtSize(tryLine, size) > max && line) { lines.push(line); line = w; }
      else line = tryLine;
    }
    if (line) lines.push(line);
    lines.forEach((ln, i) => {
      if (i) { y -= lineH; ensure(lineH); }
      page.drawText(ln, { x, y, size, font: face });
    });
    return lines.length || 1;
  };

  function drawHeader(cont) {
    if (model._logo) {
      const h = 36;
      const w = Math.min(220, model._logo.width * (h / model._logo.height));
      page.drawRectangle({ x: margin, y: y - h + 8, width: w, height: h, color: PDFLib.rgb(0.07, 0.07, 0.08) });
      page.drawImage(model._logo, { x: margin, y: y - h + 8, width: w, height: h });
      y -= h + 10;
    }
    text(model.entitas || '', margin, 13, bold, 400);
    y -= 14;
    if (model.alamat) {
      for (const line of String(model.alamat).split(/\n/)) {
        text(line, margin, 9, font, 480);
        y -= 12;
      }
    }
    text(model.title || '', margin, 16, bold, 400);
    y -= 18;
    text('No. ' + (model.no || ''), margin, 11, font, 480);
    y -= 14;
    text('Tanggal ' + (model.tgl || ''), margin, 11, font, 480);
    y -= 16;
    text(model.trx?.kepada || '', margin, 11, bold, 480);
    y -= 13;
    text([model.trx?.kend, model.trx?.plat].filter(Boolean).join(' · '), margin, 10, font, 480);
    y -= 12;
    text([model.trx?.lokasi, model.trx?.wo ? 'WO ' + model.trx.wo : ''].filter(Boolean).join(' · '), margin, 10, font, 480);
    y -= 18;
    if (cont) { text('(lanjutan)', margin, 8, font, 200); y -= 12; }
    const heads = ['Keterangan', 'Qty', 'Harga', 'Diskon', 'Jumlah'];
    let x = margin;
    heads.forEach((h, i) => { text(h, x, 9, bold, cols[i] - 4); x += cols[i]; });
    y -= 4;
    page.drawLine({ start: { x: margin, y }, end: { x: pageW - margin, y }, thickness: 0.6 });
    y -= 14;
  }
  drawHeader(false);

  for (const row of model.rows || []) {
    ensure(28);
    const top = y;
    let x = margin;
    const nameLines = wrap(row[0], x, 9, font, cols[0] - 6, 11);
    const rowH = Math.max(14, nameLines * 11);
    y = top;
    x = margin + cols[0];
    for (let i = 1; i < 5; i++) {
      const cell = pdfSafe(row[i]);
      const w = font.widthOfTextAtSize(cell, 9);
      page.drawText(cell, { x: x + cols[i] - 6 - w, y: top, size: 9, font });
      x += cols[i];
    }
    y = top - rowH;
    page.drawLine({ start: { x: margin, y: y + 4 }, end: { x: pageW - margin, y: y + 4 }, thickness: 0.3, color: PDFLib.rgb(0.85, 0.85, 0.85) });
    y -= 8;
  }

  ensure(80);
  y -= 8;
  for (const [k, v] of model.totals || []) {
    const label = pdfSafe(k);
    const val = pdfSafe(v);
    const vw = bold.widthOfTextAtSize(val, 11);
    const amountX = pageW - margin - vw;
    const labelX = pageW - margin - 280;
    const labelW = Math.max(40, amountX - labelX - 8);
    page.drawText(val, { x: amountX, y, size: 11, font: bold });
    const startY = y;
    wrap(label, labelX, 10, font, labelW, 12);
    y = Math.min(y, startY) - 16;
  }
  if (model.ket) {
    y -= 6;
    text('Keterangan', margin, 10, bold, 200);
    y -= 14;
    for (const line of String(model.ket).split(/\n/)) {
      wrap(line, margin, 9, font, pageW - margin * 2, 12);
      y -= 12;
    }
    y -= 4;
  }
  ensure(90);
  y -= 28;
  const left = margin;
  const right = margin + 280;
  page.drawText('Hormat kami', { x: left, y, size: 10, font });
  page.drawText('Penerima', { x: right, y, size: 10, font });
  y -= 48;
  page.drawText(pdfSafe(model.ttd || model.entitas || ''), { x: left, y, size: 11, font: bold });
  page.drawText(pdfSafe(model.trx?.kepada || ''), { x: right, y, size: 11, font: bold });

  const bytes = await doc.save();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
