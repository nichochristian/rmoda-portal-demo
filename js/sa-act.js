// Aksi tulis Service Advisor. Di portal sungguhan hanya jalan bila saklar sumber menyala.
// Hapus menjadi tanda Dibatalkan. Baris bayar berbukti tidak dihapus.
// Batalkan baris pembayaran (v22) menandai Dibatalkan, tidak menghapus baris.

import { LOCS, UNIT_OF, nextNum, fmtNo, woCode, coerceDiv, plateKey, nominalProblems, payJumlah, jobComplete, preserveSerah, bayarAktif } from './rules.js?v=44';
import { docHtml, printHtml, downloadPdf } from './print-doc.js?v=44';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id' + Date.now());
const today = () => new Date().toISOString().slice(0, 10);
const num = (v) => payJumlah(v);
const REK = ['BCA 727 RMODA', 'BCA 760 EXPC', 'BCA 701 Makassar', 'Tunai', 'Lainnya'];
const METODE = ['Transfer', 'Tunai', 'EDC/Kartu', 'QRIS'];

function ymOf(iso) { return (iso || today()).slice(0, 7); }
function listOf(TRX) { return Object.entries(TRX).map(([id, t]) => ({ id, ...t })); }
function entitas(lok) { return /makassar/i.test(lok || '') ? 'Redjeki Studio Makassar' : 'PT RMODA Studio Indonesia'; }

export function claimNo(kind, ym, TRX, SET) {
  let n = nextNum(kind, ym, listOf(TRX), SET);
  const used = new Set();
  for (const t of Object.values(TRX)) for (const f of t.fakBatal || []) if (f?.no) used.add(f.no);
  for (let i = 0; i < 40; i++, n++) {
    const no = fmtNo(kind, ym, n);
    if (kind === 'RMD' && used.has(no)) continue;
    return no;
  }
  throw new Error('Nomor penuh. Periksa pengaturan nomor.');
}

function lineOf(it) {
  const div = coerceDiv(it.nama, it.div);
  return { ...it, div, qty: num(it.qty) || 1, harga: num(it.harga) };
}

const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const rpDoc = (n) => 'Rp\u00A0' + Math.round(num(n)).toLocaleString('id-ID');
export function tglId(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(String(iso))) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${+d} ${BLN[+m - 1]} ${y}`;
}
export function parseTanggal(s) {
  const t = String(s || '').trim();
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return '';
  const d = +m[1], mo = +m[2], y = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function itemRows(t) {
  return (t.items || []).map((it) => {
    const qty = num(it.qty) || 1;
    const disk = num(it.disk);
    const jumlah = qty * num(it.harga) - disk;
    return [it.nama || '', String(qty), rpDoc(it.harga), disk ? rpDoc(disk) : '', rpDoc(jumlah)];
  });
}
function sumRp(rows) {
  return rows.reduce((a, r) => a + num(String(r[4] || '').replace(/[^\d]/g, '')), 0);
}

export function buildDocModel(kind, t, no, opt = {}) {
  const idx = Number(opt.idx || 0);
  let rows = itemRows(t);
  let title = 'Dokumen';
  let tgl = opt.tgl || '';
  let docNo = no || '';
  let totals = [['Total', rpDoc(sumRp(rows))]];
  if (kind === 'est') { title = 'Estimasi'; tgl = tgl || t.est?.tgl; docNo = docNo || t.est?.no; }
  else if (kind === 'so') { title = 'Pesanan Penjualan'; tgl = tgl || t.so?.tgl; docNo = docNo || t.so?.no; }
  else if (kind === 'wo') { title = 'Work Order'; tgl = tgl || t.wo?.tglTerima || t.woTgl; docNo = docNo || woCode(t.kend?.plat, t.woTgl || t.wo?.tglTerima || tgl); }
  else if (kind === 'fak' || kind === 'lunas') {
    title = kind === 'lunas' ? 'Invoice Lunas' : 'Faktur Penjualan';
    tgl = tgl || t.fak?.tgl; docNo = docNo || t.fak?.no;
    const total = sumRp(rows);
    const aktif = (t.bayar || []).filter(bayarAktif);
    const dp = (p) => p.jenis === 'Uang Muka' || /^DP/.test(p.jenis || '');
    const lines = aktif.map((p) => [`${dp(p) ? 'Uang muka' : 'Pembayaran'} ${tglId(p.tgl)}${p.inv ? ' (' + p.inv + ')' : ''}`, rpDoc(p.jumlah)]);
    const paid = aktif.reduce((a, p) => a + num(p.jumlah), 0);
    const sisa = Math.max(0, total - paid);
    const lebih = Math.max(0, paid - total);
    totals = [['Total', rpDoc(total)], ...lines, ['Sisa tagihan', rpDoc(sisa)]];
    if (lebih > 0) totals.push(['Lebih bayar', rpDoc(lebih)]);
  }
  else if (kind === 'dp') {
    const d = (t.dp || [])[idx] || {};
    title = 'Invoice DP ' + (idx + 1);
    tgl = d.tgl; docNo = d.no;
    rows = [['Uang muka ' + (idx + 1), '1', rpDoc(d.jumlah), '', rpDoc(d.jumlah)]];
    totals = [['Total', rpDoc(d.jumlah)]];
  } else if (kind === 'kwit') {
    let p = (t.bayar || [])[idx];
    if (!bayarAktif(p)) p = (t.bayar || []).filter(bayarAktif).slice(-1)[0] || {};
    title = 'Kwitansi';
    tgl = p.tgl; docNo = p.inv || 'Kwitansi';
    rows = [[`Pembayaran ${p.jenis || ''}`.trim(), '1', rpDoc(p.jumlah), '', rpDoc(p.jumlah)]];
    totals = [['Diterima', rpDoc(p.jumlah)]];
  }
  if (!rows.length) rows = [['', '', '', '', '']];
  const set = opt.set || {};
  const lok = t.lokasi || '';
  const alamat = (set.kop && set.kop[lok]) || (set.alamat && set.alamat[lok]) || '';
  let ket = t.keterangan || '';
  if (kind === 'fak' || kind === 'lunas' || kind === 'dp') {
    const khusus = set.ketFakturLok && set.ketFakturLok[lok];
    ket = (khusus && String(khusus).trim()) || set.ketFaktur || ket;
  }
  return {
    kind, no: docNo, title, tgl: tglId(tgl),
    entitas: entitas(t.lokasi),
    alamat,
    logo: 'assets/rmoda-logo.png',
    trx: { kepada: t.kepada, kend: [t.kend?.merk, t.kend?.tipe].filter(Boolean).join(' '), plat: (t.kend?.plat || '').toUpperCase(), lokasi: t.lokasi, wo: woCode(t.kend?.plat, t.woTgl || t.wo?.tglTerima || tgl) },
    rows, totals, ket, ttd: t.sa || '',
  };
}

async function put(bag, app, coll, id, data, opt) {
  await bag.gate.save(app, coll, id, data, opt);
  if (bag.refresh) await bag.refresh();
}

export function trxFormHtml(t, kat, sas) {
  const items = (t?.items || [{ nama: '', qty: 1, harga: 0, div: '' }]);
  return `<h3>${t ? 'Edit transaksi' : 'Transaksi baru'}</h3>
    <div class="composer__grid">
      <input class="inp" name="kepada" required placeholder="Nama customer" value="${esc(t?.kepada || '')}">
      <input class="inp" name="telp" placeholder="No. HP / WhatsApp" value="${esc(t?.telp || '')}">
      <input class="inp" name="email" placeholder="Email / IG" value="${esc(t?.email || '')}">
      <select class="inp" name="lokasi" required>${LOCS.map((l) => `<option ${t?.lokasi === l ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select class="inp" name="sa" required><option value="">SA pemilik</option>${sas.map((n) => `<option ${t?.sa === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
      <input class="inp" name="merk" placeholder="Merk" value="${esc(t?.kend?.merk || '')}">
      <input class="inp" name="tipe" placeholder="Tipe" value="${esc(t?.kend?.tipe || '')}">
      <input class="inp" name="tahun" placeholder="Tahun" value="${esc(t?.kend?.tahun || '')}">
      <input class="inp" name="warna" placeholder="Warna" value="${esc(t?.kend?.warna || '')}">
      <input class="inp" name="plat" placeholder="Plat" value="${esc(t?.kend?.plat || '')}">
    </div>
    <p class="muted tiny">Pekerjaan. Pilih katalog atau isi manual. SPPF dan Repaint/Cat masuk Bodyworks.</p>
    <div id="itemBox">${items.map((it, i) => itemRow(it, i, kat)).join('')}</div>
    <p><button type="button" class="btn btn--s" id="addItem">+ Baris manual</button></p>
    <div class="composer__grid">
      <input class="inp" name="diskon" placeholder="Diskon faktur Rp" value="${esc(t?.diskon || '')}">
      <input class="inp" name="biayaLain" placeholder="Biaya lain" value="${esc(t?.biayaLain || '')}">
      <input class="inp" name="termin" placeholder="Syarat bayar" value="${esc(t?.termin || 'C.O.D')}">
      <input class="inp" name="pic" placeholder="PIC" value="${esc(t?.pic || '')}">
    </div>
    <textarea class="inp" name="keterangan" placeholder="Keterangan">${esc(t?.keterangan || '')}</textarea>`;
}
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function itemRow(it, i, kat) {
  const opts = Object.values(kat || {}).filter((k) => k && k.nama && !k.hapus).slice(0, 80).map((k) => `<option value="${esc(k.kode || '')}">${esc(k.kode || '')} ${esc(k.nama)}</option>`).join('');
  return `<div class="composer__grid" data-item="${i}">
    <select class="inp" name="kode_${i}"><option value="">Manual</option>${opts}</select>
    <input class="inp" name="nama_${i}" placeholder="Nama jasa" value="${esc(it.nama || '')}">
    <input class="inp" name="qty_${i}" placeholder="Qty" value="${esc(it.qty || 1)}">
    <input class="inp" name="harga_${i}" placeholder="Harga" value="${esc(it.harga || '')}">
    <select class="inp" name="div_${i}">${['', 'bodyworks', 'ppf', 'coating', 'vendor'].map((d) => `<option value="${d}" ${it.div === d ? 'selected' : ''}>${d || 'Divisi'}</option>`).join('')}</select>
  </div>`;
}

function readItems(fd) {
  const items = [];
  for (let i = 0; i < 30; i++) {
    if (!fd.has('nama_' + i)) continue;
    const nama = String(fd.get('nama_' + i) || '').trim();
    if (!nama) continue;
    items.push(lineOf({ kode: fd.get('kode_' + i) || '', nama, qty: fd.get('qty_' + i), harga: fd.get('harga_' + i), div: fd.get('div_' + i) || '', disk: 0 }));
  }
  return items;
}

export async function saveTrx(bag, id, fd, prev) {
  const lokasi = String(fd.get('lokasi'));
  if (!bag.gate.can('sa_trx', { app: 'sa', loc: lokasi })) throw new Error('Hanya SA lokasi ini atau Owner.');
  const items = readItems(fd);
  if (!items.length) throw new Error('Isi minimal satu pekerjaan.');
  const now = new Date().toISOString();
  const data = {
    ...(prev || {}),
    kepada: fd.get('kepada'), telp: fd.get('telp') || '', email: fd.get('email') || '', lokasi, sa: fd.get('sa'),
    kend: { merk: fd.get('merk') || '', tipe: fd.get('tipe') || '', tahun: fd.get('tahun') || '', warna: fd.get('warna') || '', plat: fd.get('plat') || '' },
    items, diskon: num(fd.get('diskon')), biayaLain: num(fd.get('biayaLain')), termin: fd.get('termin') || 'C.O.D', pic: fd.get('pic') || '',     keterangan: fd.get('keterangan') || '',
    diubah: now, diubahOleh: bag.gate.actor().name, dibuat: prev?.dibuat || now, dibuatOleh: prev?.dibuatOleh || bag.gate.actor().name,
  };
  const locked = preserveSerah(prev, data);
  const nid = id || ('trx-' + uid());
  await put(bag, 'sa', 'trx', nid, locked, { action: 'sa_trx', loc: lokasi, unit_id: UNIT_OF[lokasi] });
}

export async function issue(bag, id, kind) {
  const t = bag.trx()[id];
  if (!t) throw new Error('Transaksi tidak ditemukan.');
  if (!bag.gate.can('sa_doc', { app: 'sa', loc: t.lokasi })) throw new Error('Hanya SA lokasi ini atau Owner.');
  const data = { ...t, items: t.items || [], bayar: t.bayar || [], kend: t.kend || {} };
  const ym = ymOf(today());
  if (kind === 'est') {
    if (data.est) throw new Error('Estimasi sudah terbit.');
    if (!data.kepada || !data.lokasi || !data.sa || !(data.items || []).length) throw new Error('Lengkapi customer, lokasi, SA, dan pekerjaan.');
    data.est = { no: claimNo('SQ', ym, bag.trx(), bag.set()), tgl: today() };
  } else if (kind === 'so') {
    if (!data.est) throw new Error('Terbitkan estimasi dulu.');
    if (data.so) throw new Error('Pesanan sudah terbit.');
    data.so = { no: claimNo('SO', ym, bag.trx(), bag.set()), tgl: today() };
  } else if (kind === 'wo') {
    if (!data.so) throw new Error('Terbitkan pesanan dulu.');
    if (data.wo) throw new Error('WO sudah dibuat.');
    const tgl = data.woTgl || today();
    data.woTgl = tgl;
    data.wo = { tglTerima: tgl, tglKirim: tgl, rev: 1 };
    const divs = [];
    data.items = (data.items || []).map((it) => { const div = coerceDiv(it.nama, it.div); if (div && DIVS_OK(div) && !divs.includes(div)) divs.push(div); return { ...it, div }; });
    const jobId = data.wtJob || ('job-' + uid());
    data.wtJob = jobId;
    data.perluCek = true;
    const job = {
      no: 'RM-' + tgl.slice(2, 4) + tgl.slice(5, 7) + '-' + String(Math.floor(Math.random() * 800) + 100),
      plate: data.kend.plat, car: [data.kend.merk, data.kend.tipe].filter(Boolean).join(' '), color: data.kend.warna, year: data.kend.tahun,
      customer: data.kepada, phone: data.telp, loc: data.lokasi, inDate: tgl, divs, stages: Object.fromEntries(divs.map((d) => [d, {}])),
      woNo: woCode(data.kend.plat, tgl), woItems: data.items.map((it) => ({ t: it.nama, div: it.div })),
      saTrx: id, perluCekSA: true,
      log: { [uid()]: { at: new Date().toISOString(), by: bag.gate.actor().name, t: 'WO dibuat dari Service Advisor' } },
    };
    await bag.gate.save('work', 'jobs', jobId, job, { action: 'wt_masuk', loc: data.lokasi, unit_id: UNIT_OF[data.lokasi], app: 'work' });
  } else if (kind === 'dp1' || kind === 'dp2') {
    if (!data.wo) throw new Error('Buat WO dulu.');
    data.dp = data.dp || [];
    const idx = kind === 'dp1' ? 0 : 1;
    if (idx === 1 && !data.dp[0]) throw new Error('Invoice DP 1 dulu.');
    if (data.dp[idx]) throw new Error('Invoice ini sudah terbit.');
    const jumlah = num(prompt('Nominal invoice DP (rupiah)', '') || 0);
    if (jumlah <= 0) throw new Error('Nominal DP harus lebih dari nol.');
    data.dp[idx] = { no: claimNo('RMD', ym, bag.trx(), bag.set()), tgl: today(), jumlah };
  } else if (kind === 'fak') {
    if (!data.wo) throw new Error('Buat WO dulu.');
    if (data.fak) throw new Error('Faktur sudah terbit.');
    data.fak = { no: claimNo('RMD', ym, bag.trx(), bag.set()), tgl: today() };
  } else if (kind === 'lunas') {
    if (!data.fak) throw new Error('Faktur belum terbit.');
    data.fak = { ...data.fak, lunasDiMuka: false };
  }
  data.diubah = new Date().toISOString();
  const locked = preserveSerah(t, data);
  await put(bag, 'sa', 'trx', id, locked, { action: 'sa_doc', loc: data.lokasi, unit_id: UNIT_OF[data.lokasi] });
}
function DIVS_OK(d) { return ['bodyworks', 'ppf', 'coating', 'vendor'].includes(d); }

export async function catatBayar(bag, id, fd) {
  const t = bag.trx()[id];
  if (!bag.gate.can('sa_pay', { app: 'sa', loc: t.lokasi })) throw new Error('Hanya SA lokasi ini atau Owner.');
  const jumlah = num(fd.get('jumlah'));
  if (jumlah <= 0) throw new Error('Nominal Rp0 ditolak.');
  if (!fd.get('inv')) throw new Error('Pembayaran wajib terkait invoice RMD.');
  const file = fd.get('bukti');
  const data = { ...t, bayar: [...(t.bayar || [])] };
  data.bayar.push({
    id: uid(), tgl: fd.get('tgl'), jumlah, jenis: fd.get('jenis') || 'Pelunasan', metode: fd.get('metode'), rek: fd.get('rek'),
    inv: fd.get('inv'), ket: fd.get('ket') || '', buktiNama: file && file.name ? file.name : '',
  });
  if (!data.bayar.at(-1).buktiNama) throw new Error('Foto bukti wajib diisi. Yang disimpan di demo hanya nama filenya.');
  data.diubah = new Date().toISOString();
  const locked = preserveSerah(t, data);
  await put(bag, 'sa', 'trx', id, locked, { action: 'sa_pay', loc: t.lokasi, unit_id: UNIT_OF[t.lokasi] });
}

export function bayarForm(t) {
  const inv = [t.fak?.no, ...(t.dp || []).map((d) => d.no)].filter(Boolean);
  return `<h3>Catat pembayaran</h3>
    <label>Jenis / invoice RMD <select class="inp" name="inv" required>${inv.map((n) => `<option>${esc(n)}</option>`).join('') || '<option value="">Belum ada invoice</option>'}</select></label>
    <label>Jenis <select class="inp" name="jenis"><option>DP 1</option><option>DP 2</option><option selected>Pelunasan</option></select></label>
    <label>Tanggal <input class="inp" type="date" name="tgl" required value="${today()}"></label>
    <label>Nominal <input class="inp" name="jumlah" required inputmode="numeric"></label>
    <label>Metode <select class="inp" name="metode">${METODE.map((m) => `<option>${m}</option>`).join('')}</select></label>
    <label>Rekening tujuan <select class="inp" name="rek">${REK.map((m) => `<option>${m}</option>`).join('')}</select></label>
    <label>Foto bukti <input class="inp" type="file" name="bukti" accept="image/*" required></label>
    <input class="inp" name="ket" placeholder="Catatan">`;
}

export async function editNominal(bag, id, fd) {
  const t = bag.trx()[id];
  const handed = !!(t.serah);
  if (!bag.gate.can('sa_nominal', { app: 'sa', loc: t.lokasi, handed })) throw new Error(handed ? 'Mobil sudah diserahkan. Ubah nominal hanya Owner.' : 'Hanya SA lokasi ini atau Owner.');
  const idx = Number(fd.get('idx'));
  const lama = (t.bayar || [])[idx];
  if (!lama) throw new Error('Baris tidak ditemukan.');
  if (!bayarAktif(lama)) throw new Error('Baris yang dibatalkan tidak bisa diubah nominalnya. Pulihkan dulu.');
  const jumlah = num(fd.get('jumlah'));
  const alasan = String(fd.get('alasan') || '');
  const next = (t.bayar || []).map((p, i) => i === idx ? { ...p, jumlah, riwayatJumlah: [...(p.riwayatJumlah || []), { dari: p.jumlah, ke: jumlah, at: new Date().toISOString(), oleh: bag.gate.actor().name }] } : p);
  const problems = nominalProblems(t.bayar, next, alasan);
  if (problems.length) throw new Error(problems[0]);
  const data = preserveSerah(t, { ...t, bayar: next, koreksi: [...(t.koreksi || []), { aksi: 'ubah-nominal', alasan, at: new Date().toISOString(), oleh: bag.gate.actor().name, peran: bag.gate.actor().owner ? 'Owner' : 'SA', teks: `${rp(lama.jumlah)} menjadi ${rp(jumlah)}`, dari: lama.jumlah, ke: jumlah }] });
  await bag.gate.save('sa', 'trx', id, data, { action: 'sa_nominal', loc: t.lokasi, unit_id: UNIT_OF[t.lokasi], handed });
  const kn = (bag.konf().reduce((m, k) => Math.max(m, k.no || 0), 0) || 0) + 1;
  await bag.gate.save('sa', 'konf', 'konf-' + uid(), {
    no: kn, status: 'menunggu', dari: bag.gate.actor().owner ? 'Owner' : 'SA', untuk: 'Finance', lokasi: t.lokasi,
    wo: woCode(t.kend?.plat, t.woTgl || today()), kategori: 'Nominal DP/Pembayaran', prio: 'Penting',
    q: `Nominal pembayaran diubah dari ${rp(lama.jumlah)} menjadi ${rp(jumlah)}. Alasan: ${alasan}`,
    dibuat: new Date().toISOString(), penanya: bag.gate.actor().name, trxId: id,
  }, { action: 'sa_nominal', loc: t.lokasi, unit_id: UNIT_OF[t.lokasi], handed });
  if (bag.refresh) await bag.refresh();
}

async function konfBayar(bag, t, id, q) {
  const kn = (bag.konf().reduce((m, k) => Math.max(m, k.no || 0), 0) || 0) + 1;
  await bag.gate.save('sa', 'konf', 'konf-' + uid(), {
    no: kn, status: 'menunggu', dari: 'Owner', untuk: 'Finance', lokasi: t.lokasi,
    wo: woCode(t.kend?.plat, t.woTgl || t.wo?.tglTerima || today()), kategori: 'Nominal DP/Pembayaran', prio: 'Penting',
    q, dibuat: new Date().toISOString(), penanya: bag.gate.actor().name, trxId: id,
  }, { action: 'sa_batal_bayar', loc: t.lokasi, unit_id: UNIT_OF[t.lokasi], handed: !!t.serah, app: 'sa' });
}

function ubahBarisBayar(bag, id, fd, batal) {
  const t = bag.trx()[id];
  if (!t) throw new Error('Transaksi tidak ditemukan.');
  if (!bag.gate.can('sa_batal_bayar', { app: 'sa', loc: t.lokasi, handed: !!t.serah })) throw new Error('Hanya Owner yang boleh membatalkan atau memulihkan baris pembayaran.');
  const idx = Number(fd.get('idx'));
  const alasan = String(fd.get('alasan') || '').trim();
  if (alasan.length < 10) throw new Error('Alasan minimal 10 karakter.');
  const lama = (t.bayar || [])[idx];
  if (!lama) throw new Error('Baris tidak ditemukan.');
  if (batal && !bayarAktif(lama)) throw new Error('Baris ini sudah dibatalkan.');
  if (!batal && bayarAktif(lama)) throw new Error('Baris ini tidak dalam status Dibatalkan.');
  const now = new Date().toISOString();
  const who = bag.gate.actor().name;
  const peran = 'Owner';
  const next = (t.bayar || []).map((p, i) => {
    if (i !== idx) return p;
    if (batal) return { ...p, batal: { at: now, oleh: who, peran, alasan } };
    const jejak = { ...(typeof p.batal === 'object' && p.batal ? p.batal : {}), pulihAt: now, pulihOleh: who, pulihPeran: peran, pulihAlasan: alasan };
    const { batal: _drop, statusBatal: _st, ...rest } = p;
    return { ...rest, riwayatBatal: [...(Array.isArray(p.riwayatBatal) ? p.riwayatBatal : []), jejak] };
  });
  const aksi = batal ? 'batal-bayar' : 'pulih-bayar';
  const teks = `${batal ? 'Pembayaran dibatalkan' : 'Pembayaran dipulihkan'}: ${lama.jenis || ''} ${lama.inv || ''} ${tglId(lama.tgl) || lama.tgl || ''} ${rpDoc(lama.jumlah)}`.replace(/\s+/g, ' ').trim();
  const data = preserveSerah(t, {
    ...t,
    bayar: next,
    koreksi: [...(t.koreksi || []), {
      aksi, alasan, at: now, oleh: who, peran: 'Owner', teks,
      pembayaran: { id: lama.id || '', jenis: lama.jenis, jumlah: lama.jumlah, tgl: lama.tgl, inv: lama.inv || '' },
    }],
  });
  const q = `${teks}. Alasan: ${alasan}`;
  return { t, data, q };
}

export async function batalBayar(bag, id, fd) {
  const { t, data, q } = ubahBarisBayar(bag, id, fd, true);
  await bag.gate.save('sa', 'trx', id, data, { action: 'sa_batal_bayar', loc: t.lokasi, unit_id: UNIT_OF[t.lokasi], handed: !!t.serah, app: 'sa' });
  await konfBayar(bag, t, id, q);
  if (bag.refresh) await bag.refresh();
}

export async function pulihBayar(bag, id, fd) {
  const { t, data, q } = ubahBarisBayar(bag, id, fd, false);
  await bag.gate.save('sa', 'trx', id, data, { action: 'sa_batal_bayar', loc: t.lokasi, unit_id: UNIT_OF[t.lokasi], handed: !!t.serah, app: 'sa' });
  await konfBayar(bag, t, id, q);
  if (bag.refresh) await bag.refresh();
}

function barisAktif(t, idx) {
  const p = (t.bayar || [])[idx];
  if (!p) throw new Error('Baris tidak ditemukan.');
  if (!bayarAktif(p)) throw new Error('Baris yang dibatalkan atau disembunyikan tidak bisa diubah.');
  return p;
}

export async function revisiTglBayar(bag, id, fd) {
  const t = bag.trx()[id];
  if (!t) throw new Error('Transaksi tidak ditemukan.');
  if (!bag.gate.can('sa_tgl_bayar', { app: 'sa', loc: t.lokasi })) throw new Error('Hanya Owner atau Service Advisor yang bisa merevisi tanggal pembayaran.');
  const alasan = String(fd.get('alasan') || '').trim();
  if (alasan.length < 10) throw new Error('Alasan minimal 10 karakter.');
  const tgl = parseTanggal(fd.get('tgl'));
  if (!tgl) throw new Error('Isi tanggal hari/bulan/tahun, contoh 16/11/2026.');
  if (tgl > today()) throw new Error('Tanggal pembayaran tidak boleh setelah hari ini.');
  const idx = Number(fd.get('idx'));
  const lama = barisAktif(t, idx);
  const now = new Date().toISOString();
  const who = bag.gate.actor().name;
  const peran = bag.gate.actor().owner ? 'Owner' : 'SA';
  const next = (t.bayar || []).map((p, i) => i === idx ? { ...p, tgl, riwayatTgl: [...(p.riwayatTgl || []), { at: now, oleh: who, peran, dari: p.tgl, ke: tgl, alasan }] } : p);
  const data = preserveSerah(t, { ...t, bayar: next, koreksi: [...(t.koreksi || []), { aksi: 'tgl-bayar', alasan, at: now, oleh: who, peran, tglLama: lama.tgl, tglBaru: tgl, pembayaran: { id: lama.id || '', jumlah: lama.jumlah, jenis: lama.jenis, inv: lama.inv || '' } }] });
  await bag.gate.save('sa', 'trx', id, data, { action: 'sa_tgl_bayar', loc: t.lokasi, unit_id: UNIT_OF[t.lokasi], app: 'sa' });
  if (bag.refresh) await bag.refresh();
}

export async function ubahJenisBayar(bag, id, fd) {
  const t = bag.trx()[id];
  if (!t) throw new Error('Transaksi tidak ditemukan.');
  if (!bag.gate.can('sa_ubah_jenis', { app: 'sa', loc: t.lokasi })) throw new Error('Hanya Owner yang bisa mengubah jenis pembayaran.');
  const alasan = String(fd.get('alasan') || '').trim();
  if (alasan.length < 10) throw new Error('Alasan minimal 10 karakter.');
  const [jenis, inv] = String(fd.get('jenis') || '').split('|');
  if (!jenis) throw new Error('Pilih jenis pembayaran.');
  if (jenis === 'Pelunasan' && !t.fak) throw new Error('Belum ada faktur pelunasan.');
  const idx = Number(fd.get('idx'));
  const lama = barisAktif(t, idx);
  const now = new Date().toISOString();
  const who = bag.gate.actor().name;
  const next = (t.bayar || []).map((p, i) => i === idx ? { ...p, jenis, inv: inv || '', riwayatJenis: [...(p.riwayatJenis || []), { at: now, oleh: who, dari: { jenis: p.jenis, inv: p.inv || '' }, ke: { jenis, inv: inv || '' }, alasan }] } : p);
  const data = preserveSerah(t, { ...t, bayar: next, koreksi: [...(t.koreksi || []), { aksi: 'ubah-jenis', alasan, at: now, oleh: who, peran: 'Owner', dari: { jenis: lama.jenis, inv: lama.inv || '' }, ke: { jenis, inv: inv || '' }, pembayaran: { tgl: lama.tgl, jumlah: lama.jumlah } }] });
  await bag.gate.save('sa', 'trx', id, data, { action: 'sa_ubah_jenis', loc: t.lokasi, unit_id: UNIT_OF[t.lokasi], app: 'sa' });
  if (bag.refresh) await bag.refresh();
}

export async function hapusBayar(bag, id, fd) {
  const t = bag.trx()[id];
  if (!t) throw new Error('Transaksi tidak ditemukan.');
  if (!bag.gate.can('sa_hapus_bayar', { app: 'sa', loc: t.lokasi })) throw new Error('Hanya SA lokasi ini atau Owner.');
  const idx = Number(fd.get('idx'));
  const lama = barisAktif(t, idx);
  if (lama.bukti || lama.buktiNama) throw new Error('Pembayaran yang sudah ada bukti tidak bisa dihapus.');
  const alasan = String(fd.get('alasan') || '').trim() || 'Pembayaran tanpa bukti disembunyikan';
  const now = new Date().toISOString();
  const who = bag.gate.actor().name;
  const peran = bag.gate.actor().owner ? 'Owner' : 'SA';
  const next = (t.bayar || []).map((p, i) => i === idx ? { ...p, hapus: { at: now, oleh: who, peran, alasan }, statusBatal: 'Diarsipkan' } : p);
  const data = preserveSerah(t, { ...t, bayar: next, koreksi: [...(t.koreksi || []), { aksi: 'hapus-bayar', alasan, at: now, oleh: who, peran, pembayaran: { id: lama.id || '', tgl: lama.tgl, jumlah: lama.jumlah, jenis: lama.jenis, inv: lama.inv || '' } }] });
  await bag.gate.save('sa', 'trx', id, data, { action: 'sa_hapus_bayar', loc: t.lokasi, unit_id: UNIT_OF[t.lokasi], app: 'sa' });
  if (bag.refresh) await bag.refresh();
}

export async function serah(bag, id, tglRaw) {
  const tgl = parseTanggal(tglRaw);
  const t = bag.trx()[id];
  if (!tgl) throw new Error('Isi tanggal hari/bulan/tahun, contoh 16/11/2026. Tanggal tidak terisi otomatis.');
  if (!bag.gate.can('sa_serah', { app: 'sa', loc: t.lokasi })) throw new Error('Hanya SA lokasi ini atau Owner.');
  if (t.wtJob) {
    const j = bag.job?.(t.wtJob);
    if (j && !jobComplete(j)) throw new Error('Semua tahap termasuk QC belum selesai.');
  }
  const data = { ...t, serah: tgl, diubah: new Date().toISOString() };
  await bag.gate.save('sa', 'trx', id, data, { action: 'sa_serah', loc: t.lokasi, unit_id: UNIT_OF[t.lokasi] });
  const code = woCode(t.kend?.plat, t.woTgl || t.wo?.tglTerima || tgl);
  await bag.gate.save('work', 'handover', 'h-' + id, { wtJob: t.wtJob || '', woCode: code, serah: tgl, batal: false, lokasi: t.lokasi }, { action: 'sa_serah', loc: t.lokasi, unit_id: UNIT_OF[t.lokasi], app: 'work' });
  if (bag.refresh) await bag.refresh();
}

const DROP_JOB = ['divStates', 'complete', 'handed', 'handedDate', 'active', 'ready', 'late', 'lateBy', 'lateOpen', 'noTarget', 'atVendor', 'openRevs', 'revList', 'days', 'id'];
export async function cekWo(bag, id, divPicks) {
  const t = bag.trx()[id];
  if (!t) throw new Error('Transaksi tidak ditemukan.');
  if (!bag.gate.can('sa_doc', { app: 'sa', loc: t.lokasi })) throw new Error('Hanya SA lokasi ini atau Owner.');
  const items = (t.items || []).map((it, i) => ({ ...it, div: coerceDiv(it.nama, divPicks[i] || it.div) }));
  const divList = [];
  items.forEach((it) => { if (['bodyworks', 'ppf', 'coating', 'vendor'].includes(it.div) && !divList.includes(it.div)) divList.push(it.div); });
  if (!divList.length) throw new Error('Pilih divisi untuk minimal satu pekerjaan.');
  const sig = JSON.stringify(items.filter((i) => String(i.nama || '').trim()).map((i) => [String(i.nama).trim(), i.div, i.div === 'vendor' ? String(i.vendor || '').trim() : '']));
  const data = preserveSerah(t, { ...t, items, perluCek: false, woCek: { sig, at: new Date().toISOString(), by: bag.gate.actor().name } });
  const jobId = t.wtJob;
  const j = jobId && bag.job ? bag.job(jobId) : null;
  if (j) {
    const raw = preserveSerah(j, { ...j });
    DROP_JOB.forEach((k) => delete raw[k]);
    raw.divs = divList;
    raw.stages = { ...(raw.stages || {}) };
    divList.forEach((d) => { if (!raw.stages[d]) raw.stages[d] = {}; });
    raw.perluCekSA = false;
    raw.woItems = items.map((it) => ({ t: it.nama, div: it.div }));
    await bag.gate.save('work', 'jobs', jobId, raw, { action: 'wt_edit', loc: t.lokasi, unit_id: UNIT_OF[t.lokasi], app: 'work' });
  }
  await put(bag, 'sa', 'trx', id, data, { action: 'sa_doc', loc: t.lokasi, unit_id: UNIT_OF[t.lokasi] });
}

export async function saveKonf(bag, fd, prev) {
  const lokasi = String(fd.get('lokasi'));
  const action = prev ? 'sa_konf_jawab' : 'konf_tanya';
  if (prev && fd.get('mode') === 'jawab') {
    if (!bag.gate.can('sa_konf_jawab', { app: 'sa', loc: lokasi })) throw new Error('Hanya SA lokasi ini yang menjawab.');
    const data = { ...prev, status: 'dijawab', jawab: fd.get('jawab'), jawabOleh: bag.gate.actor().name, waktuJawab: new Date().toISOString() };
    await put(bag, 'sa', 'konf', prev.id, data, { action: 'sa_konf_jawab', loc: lokasi, unit_id: UNIT_OF[lokasi] });
    return;
  }
  if (prev && (fd.get('mode') === 'ulang' || fd.get('mode') === 'selesai')) {
    if (!bag.gate.can('konf_tutup', { app: 'sa', loc: lokasi })) throw new Error('Tanya ulang dan tandai selesai untuk Admin, Finance, Gudang, atau Kepala Bengkel.');
    const data = { ...prev };
    if (fd.get('mode') === 'ulang') {
      data.jawabSebelumnya = [...(data.jawabSebelumnya || []), { jawab: data.jawab, oleh: data.jawabOleh, waktu: data.waktuJawab }];
      data.status = 'menunggu'; data.jawab = ''; data.q = fd.get('q') || data.q;
    } else data.status = 'selesai';
    await put(bag, 'sa', 'konf', prev.id, data, { action: 'konf_tutup', loc: lokasi, unit_id: UNIT_OF[lokasi] });
    return;
  }
  if (!bag.gate.can('konf_tanya', { app: 'sa', loc: lokasi })) throw new Error('Pertanyaan baru untuk Admin, Finance, Gudang, Produksi, atau Owner.');
  const no = (bag.konf().reduce((m, k) => Math.max(m, k.no || 0), 0) || 0) + 1;
  await put(bag, 'sa', 'konf', 'konf-' + uid(), {
    no, status: 'menunggu', dari: fd.get('dari'), untuk: fd.get('untuk'), lokasi, wo: fd.get('wo') || '',
    kategori: fd.get('kategori'), prio: fd.get('prio') || 'Biasa', q: fd.get('q'), dibuat: new Date().toISOString(), penanya: bag.gate.actor().name,
  }, { action: 'konf_tanya', loc: lokasi, unit_id: UNIT_OF[lokasi] });
}

export function konfForm(sas) {
  return `<h3>Pertanyaan baru</h3>
    <label>Dari <select class="inp" name="dari" required>${['Finance', 'Gudang', 'Produksi', 'Admin'].map((x) => `<option>${x}</option>`).join('')}</select></label>
    <label>Untuk SA <select class="inp" name="untuk"><option>Semua SA</option>${sas.map((n) => `<option>${esc(n)}</option>`).join('')}</select></label>
    <label>Lokasi <select class="inp" name="lokasi">${LOCS.map((l) => `<option>${l}</option>`).join('')}</select></label>
    <input class="inp" name="wo" placeholder="Kode WO / plat (opsional)">
    <label>Kategori <select class="inp" name="kategori">${['Nominal DP/Pembayaran', 'Plat', 'No HP/Data customer', 'Diskon/Harga', 'Item/Jasa', 'Lainnya'].map((x) => `<option>${x}</option>`).join('')}</select></label>
    <label>Prioritas <select class="inp" name="prio"><option>Biasa</option><option>Penting</option></select></label>
    <textarea class="inp" name="q" required placeholder="Pertanyaan"></textarea>`;
}

export async function saveKat(bag, fd, prev) {
  if (!bag.gate.can('kat_edit', { app: 'sa', loc: 'BSD' })) throw new Error('Hanya SA atau Owner.');
  const kode = String(fd.get('kode') || '').trim();
  const nama = String(fd.get('nama') || '').trim();
  if (!nama) throw new Error('Nama wajib diisi.');
  const id = prev?.id || ('k' + (kode || nama).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) + '-' + uid().slice(0, 6));
  const data = { kode, nama, kategori: fd.get('kategori') || '', jenis: fd.get('jenis') || 'SVC', harga: num(fd.get('harga')), hargaLok: { Makassar: num(fd.get('hargaMks')) || undefined }, manual: true, hapus: false };
  await put(bag, 'sa', 'katalog', id, data, { action: 'kat_edit', loc: 'BSD', unit_id: null });
}

export async function nonaktifKat(bag, id, item) {
  if (!bag.gate.can('kat_edit', { app: 'sa', loc: 'BSD' })) throw new Error('Hanya SA atau Owner.');
  await put(bag, 'sa', 'katalog', id, { ...item, hapus: true, nonaktif: true }, { action: 'kat_edit', loc: 'BSD', unit_id: null });
}

export async function importKat(bag, file) {
  if (!bag.gate.can('kat_edit', { app: 'sa', loc: 'BSD' })) throw new Error('Hanya SA atau Owner.');
  const rows = await readTable(file);
  const head = rows[0].map((x) => String(x).trim().toLowerCase());
  const ik = head.findIndex((h) => h.includes('kode'));
  const inama = head.findIndex((h) => h.includes('nama'));
  const ih = head.findIndex((h) => h.includes('harga'));
  if (ik < 0 || inama < 0) throw new Error('Kolom harus memuat Kode Barang dan Nama Barang, format Daftar Barang Accurate.');
  let n = 0;
  for (const r of rows.slice(1)) {
    const kode = String(r[ik] || '').trim();
    const nama = String(r[inama] || '').trim();
    if (!nama) continue;
    const id = 'k' + (kode || nama).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48);
    const old = bag.kat()[id];
    if (old?.manual) continue;
    await bag.gate.save('sa', 'katalog', id, { kode, nama, harga: num(r[ih]), jenis: 'SVC', hapus: false, manual: false, impor: true }, { action: 'kat_edit', loc: 'BSD', unit_id: null });
    n++;
  }
  if (bag.refresh) await bag.refresh();
  return n;
}

async function readTable(file) {
  const buf = await file.arrayBuffer();
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    const text = new TextDecoder().decode(buf);
    const sep = text.split('\n')[0].includes(';') ? ';' : ',';
    return text.split(/\r?\n/).filter(Boolean).map((line) => line.split(sep).map((c) => c.replace(/^"|"$/g, '').replace(/""/g, '"')));
  }
  const files = await unzip(buf);
  const ss = files['xl/sharedStrings.xml'] || '';
  const strings = [...ss.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((m) => m[1]);
  const sheet = files['xl/worksheets/sheet1.xml'] || Object.entries(files).find(([k]) => k.startsWith('xl/worksheets/sheet'))?.[1] || '';
  const rows = [];
  for (const row of sheet.matchAll(/<row[\s\S]*?<\/row>/g)) {
    const cells = [];
    for (const c of row[0].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const ref = (c[1].match(/r="([A-Z]+)/) || [])[1] || '';
      const col = ref ? ref.charCodeAt(0) - 65 : cells.length;
      const t = (c[1].match(/t="([^"]+)"/) || [])[1];
      const v = (c[2].match(/<v>([^<]*)<\/v>/) || [])[1] || '';
      cells[col] = t === 's' ? (strings[+v] || '') : v;
    }
    rows.push(cells.map((x) => x || ''));
  }
  return rows;
}

async function unzip(buf) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  const out = {};
  let i = 0;
  while (i + 30 < u8.length) {
    if (dv.getUint32(i, true) !== 0x04034b50) break;
    const method = dv.getUint16(i + 8, true);
    const compSize = dv.getUint32(i + 18, true);
    const nameLen = dv.getUint16(i + 26, true);
    const extra = dv.getUint16(i + 28, true);
    const name = new TextDecoder().decode(u8.slice(i + 30, i + 30 + nameLen));
    const start = i + 30 + nameLen + extra;
    const comp = u8.slice(start, start + compSize);
    let data = comp;
    if (method === 8) {
      data = new Uint8Array(await new Response(new Blob([comp]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    }
    out[name] = new TextDecoder().decode(data);
    i = start + compSize;
  }
  return out;
}

export function pengaturanHtml(set) {
  const ym = ymOf(today());
  return `<h3>Pengaturan</h3><p class="muted tiny">Berlaku untuk semua SA. Nomor berikutnya memakai angka terbesar antara isian dan nomor yang sudah terbit.</p>
    <label>Daftar SA, pisahkan koma <input class="inp" name="saList" value="${esc((set.saList || []).join(', '))}"></label>
    <label>Keterangan faktur <textarea class="inp" name="ketFaktur">${esc(set.ketFaktur || '')}</textarea></label>
    <label>Alamat kop BSD <input class="inp" name="kopBSD" value="${esc(set.kop?.BSD || '')}"></label>
    <label>Alamat kop Legok <input class="inp" name="kopLegok" value="${esc(set.kop?.Legok || '')}"></label>
    <label>Alamat kop Makassar <input class="inp" name="kopMks" value="${esc(set.kop?.Makassar || '')}"></label>
    <p>Bulan ${esc(ym)}</p>
    <label>Nomor awal estimasi <input class="inp" name="sq" value="${esc(set.mulaiSQ?.[ym] || 1)}"></label>
    <label>Nomor awal pesanan <input class="inp" name="so" value="${esc(set.mulaiSO?.[ym] || 1)}"></label>
    <label>Nomor awal faktur RMD <input class="inp" name="rmd" value="${esc(set.mulaiRMD?.[ym] || 1)}"></label>
    <p class="muted tiny">Contoh: ${esc(fmtNo('SQ', ym, Number(set.mulaiSQ?.[ym]) || 1))} · ${esc(fmtNo('SO', ym, Number(set.mulaiSO?.[ym]) || 1))} · ${esc(fmtNo('RMD', ym, Number(set.mulaiRMD?.[ym]) || 1))}</p>
    <p class="muted tiny">Pindah data dari aplikasi lama tidak dijalankan di sini. File JSON lama tidak diimpor, supaya salinan Claude tidak tertimpa.</p>`;
}

export async function saveSet(bag, fd) {
  if (!bag.gate.can('set_nomor', { app: 'sa' })) throw new Error('Hanya Owner.');
  const ym = ymOf(today());
  const prev = bag.set();
  const data = {
    ...prev,
    saList: String(fd.get('saList') || '').split(',').map((s) => s.trim()).filter(Boolean),
    ketFaktur: fd.get('ketFaktur') || '',
    kop: { BSD: fd.get('kopBSD') || '', Legok: fd.get('kopLegok') || '', Makassar: fd.get('kopMks') || '' },
    mulaiSQ: { ...(prev.mulaiSQ || {}), [ym]: Number(fd.get('sq')) || 1 },
    mulaiSO: { ...(prev.mulaiSO || {}), [ym]: Number(fd.get('so')) || 1 },
    mulaiRMD: { ...(prev.mulaiRMD || {}), [ym]: Number(fd.get('rmd')) || 1 },
  };
  await put(bag, 'sa', 'pengaturan', 'umum', data, { action: 'set_nomor', loc: 'BSD', unit_id: null });
}

export function excelXml(rows) {
  const cell = (v) => `<Cell><Data ss:Type="${typeof v === 'number' ? 'Number' : 'String'}">${esc(v)}</Data></Cell>`;
  const body = rows.map((r) => `<Row>${r.map(cell).join('')}</Row>`).join('');
  return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Rekap"><Table>${body}</Table></Worksheet></Workbook>`;
}

export { printHtml, downloadPdf, docHtml, plateKey };
