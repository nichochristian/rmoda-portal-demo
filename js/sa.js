// Modul Service Advisor (bagian dari Work Tracker; salinan dari aplikasi RMODA Studio di Claude, lihat saja).
// Rumus (total, diskon, pembayaran, status, kode WO, serah terima, WO belum dicek) disalin dari aplikasi supaya angkanya sama.
// Data: app_docs app='sa' (trx, konf, katalog, pengaturan). RLS hanya memberi Owner dan peran Service Advisor.

import * as Act from './sa-act.js?v=45';
import { coerceDiv, bayarAktif } from './rules.js?v=45';

/* ---------------- util (sama dengan aplikasi) ---------------- */
const num = v => { if (typeof v === 'number') return isFinite(v) ? v : 0; const n = Number(String(v ?? '').replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')); return isFinite(n) ? n : 0; };
const fmt = v => Math.round(v || 0).toLocaleString('id-ID');
const rp = v => (v < 0 ? '-' : '') + 'Rp' + fmt(Math.abs(v || 0));
const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const dL = iso => { if (!iso || !/^\d{4}-\d\d-\d\d/.test(iso)) return ''; const [y, m, d] = iso.split('-'); return +d + ' ' + BLN[+m - 1] + ' ' + y.slice(0, 4); };
const pad2 = n => String(n).padStart(2, '0');
const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
const ymOf = iso => (iso || todayISO()).slice(0, 7);
const dtL = s => { if (!s) return ''; const d = new Date(s); if (isNaN(d)) return ''; return dL(d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
const kid = kode => kode ? 'k' + String(kode).replace(/[^A-Za-z0-9_-]/g, '') : '';
const slugN = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);

/* ---------------- domain (disalin dari aplikasi) ---------------- */
const pctNum = v => { if (typeof v === 'number') return isFinite(v) ? v : 0; const n = Number(String(v ?? '').trim().replace(/\s/g, '').replace(',', '.').replace(/[^\d.-]/g, '')); return isFinite(n) ? n : 0; };
const r2 = n => Math.round(n * 100) / 100;
const fmt2 = n => Number(n || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const baseOf = it => num(it.qty) * num(it.harga);
const clampD = (d, base) => Math.max(0, Math.min(Math.max(0, base), Math.round(d)));
const effDisk = it => { const b = baseOf(it); return clampD(it.diskMode === 'pct' ? b * Math.min(100, Math.max(0, pctNum(it.diskPct))) / 100 : num(it.disk), b); };
const pctOf = it => { if (it.diskMode === 'pct') return Math.min(100, Math.max(0, pctNum(it.diskPct))); const b = baseOf(it); return b > 0 ? r2(effDisk(it) / b * 100) : 0; };
const lineTotal = it => baseOf(it) - effDisk(it);
const subTotal = t => (t.items || []).reduce((a, it) => a + lineTotal(it), 0);
const effDiskT = t => { const b = subTotal(t); return clampD(t.diskonMode === 'pct' ? b * Math.min(100, Math.max(0, pctNum(t.diskonPct))) / 100 : num(t.diskon), b); };
const pctOfT = t => { if (t.diskonMode === 'pct') return Math.min(100, Math.max(0, pctNum(t.diskonPct))); const b = subTotal(t); return b > 0 ? r2(effDiskT(t) / b * 100) : 0; };
const grand = t => subTotal(t) - effDiskT(t) + num(t.biayaLain);
const isDP = p => !!p && (p.jenis === 'Uang Muka' || /^DP/.test(p.jenis || ''));
const paidDP = t => (t.bayar || []).filter(p => bayarAktif(p) && isDP(p)).reduce((a, p) => a + num(p.jumlah), 0);
const paidLunas = t => (t.bayar || []).filter(p => bayarAktif(p) && !isDP(p)).reduce((a, p) => a + num(p.jumlah), 0);
const paid = t => paidDP(t) + paidLunas(t);
const sisa = t => grand(t) - paid(t);
const dpPays = t => (t.bayar || []).filter(p => isDP(p));
const dpRefs = t => { const r = [...new Set(dpPays(t).map(p => p.inv).filter(Boolean))]; return r.length ? r : (t.dp || []).map(d => d.no); };
const uangMuka = t => t.fak && t.fak.lunasDiMuka ? num(t.fak.dimuka) || paid(t) : paidDP(t);
const fakBatalOf = t => Array.isArray(t && t.fakBatal) ? t.fakBatal.filter(Boolean) : [];
const woAliasOf = t => Array.isArray(t && t.woAlias) ? t.woAlias.filter(Boolean) : [];
function status(t) {
  if (t.batal) return 'Batal';
  if (t.fak) return sisa(t) <= 0 ? 'Lunas' : 'Belum Lunas';
  if (t.wo) return 'WO Berjalan';
  if (t.so) return 'Pesanan';
  if (t.est) return 'Estimasi';
  return 'Draf';
}
function payStatus(t) { if (!t || t.batal) return ''; const pd = paid(t); if (pd <= 0) return 'Belum bayar'; if (sisa(t) <= 0) return t.fak ? 'Lunas' : 'Lunas di muka'; return 'DP'; }
const lebihBayar = t => Math.max(0, paid(t) - grand(t));
const payTxt = t => { const s = payStatus(t); const l = lebihBayar(t); return s + (l > 0 ? ' · Lebih bayar ' + rp(l) : ''); };
const committed = t => !!(t.fak || t.wo || t.so || (t.dp || []).length || paid(t) > 0);
const owes = t => !t.batal && committed(t) && sisa(t) > 0;
const plateKey = p => String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const woDateOf = t => t.woTgl || t.wo?.tglKirim || t.est?.tgl || (t.dibuat || '').slice(0, 10) || todayISO();
const woNo = t => { const p = plateKey(t.kend?.plat); if (!p) return ''; const [y, m, dd] = woDateOf(t).split('-'); return `${p}|${dd}-${m}-${y}`; };
const LOKASI3 = ['BSD', 'Legok', 'Makassar'];
const isMks = l => /makassar/i.test(String(l || ''));
const kendTxt = t => [t.kend?.merk, t.kend?.tipe].filter(Boolean).join(' ');
const lastDate = t => t.fak?.tgl || t.wo?.tglTerima || t.est?.tgl || (t.dibuat || '').slice(0, 10);
const saNorm = s => String(s || '').trim().toUpperCase();
const picFrom = t => { const ex = String((t && t.pic) || '').trim(); if (ex) return ex; const m = String((t && t.keterangan) || '').match(/(?:^|\n)\s*PIC:\s*(.+?)\s*$/im); return m ? m[1].trim() : ''; };
const stripPicLine = ket => String(ket || '').replace(/(?:\n|^)\s*PIC:\s*.+$/im, '').replace(/[ \t]+$/gm, '').replace(/\n+$/, '');
const tglRevOf = p => Array.isArray(p && p.riwayatTgl) ? p.riwayatTgl.filter(Boolean) : [];
const nomRevOf = p => Array.isArray(p && p.riwayatJumlah) ? p.riwayatJumlah.filter(Boolean) : [];

/* Divisi per baris WO (v18) — dipakai rumus "WO belum dicek" */
const DIVX = { bodyworks: 'Bodyworks', ppf: 'PPF', coating: 'Coating', vendor: 'Vendor', lainnya: 'Lainnya' };
const DIVMAP_OPTS = ['bodyworks', 'ppf', 'coating', 'lainnya'];
const DIVMAP_DEF = [
  ['Cat', 'bodyworks'], ['Cat Repair', 'bodyworks'], ['Cat Per Panel', 'bodyworks'], ['Repaint', 'bodyworks'], ['SPPF', 'bodyworks'], ['Las Ketok', 'bodyworks'], ['Dempul', 'bodyworks'], ['Epoxy', 'bodyworks'],
  ['PPF', 'ppf'], ['PPF Installation', 'ppf'], ['PPF Replace', 'ppf'], ['Re PPF', 'ppf'],
  ['Coating', 'coating'], ['Coatings', 'coating'], ['Coating Maintenance', 'coating'], ['Auto Detailing', 'coating'], ['Detailing', 'coating'], ['Poles', 'coating'], ['Recoat', 'coating'],
  ['Towing', 'lainnya'], ['Balancing', 'lainnya'], ['Biaya Admin', 'lainnya'], ['Jasa lain-lain', 'lainnya'],
].map(([k, d]) => ({ t: 'kat', k, d }));
const dmNorm = x => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const CPP_NAME = /^\s*(cat|repaint|sol|blending|dempul|clear)\b/i;
const SPPF_RX = /sppf|spray\s*ppf/i;
const nmKey = x => String(x || '').toLowerCase().replace(/\s+/g, ' ').trim();

const KST = { menunggu: ['Menunggu jawaban', 'bad'], dijawab: ['Dijawab', 'warn'], selesai: ['Selesai', 'ok'] };
const kNorm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9|]/g, '');
const umurOf = k => { const end = k.status === 'menunggu' ? Date.now() : new Date(k.waktuJawab || k.dibuat).getTime(); return Math.max(0, Math.floor((end - new Date(k.dibuat).getTime()) / 864e5)); };
const lampExt = n => { const m = /\.([A-Za-z0-9]+)$/.exec(String(n || '').trim()); return m ? m[1].toLowerCase() : ''; };
const lampSize = b => (b = num(b)) >= 1048576 ? (Math.round(b / 104857.6) / 10).toString().replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
const lampThumbOk = s => /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(String(s || ''));
const p_hb = k => (k.pembayaran?.jenis || '') + ' Rp' + fmt(num(k.pembayaran?.jumlah)) + ' tgl ' + dL(k.pembayaran?.tgl);
const KX_LBL = { 'ubah-nominal': 'Nominal pembayaran diubah', 'batal-faktur': 'Faktur dibatalkan', 'ubah-jenis': 'Jenis pembayaran diubah', 'kode-wo': 'Kode WO dikoreksi', 'tgl-bayar': 'Tanggal pembayaran direvisi', 'ganti-sa': 'SA pemilik diganti', 'hapus-bayar': 'Pembayaran (tanpa bukti) dihapus', 'batal-bayar': 'Baris pembayaran dibatalkan', 'pulih-bayar': 'Baris pembayaran dipulihkan', 'serah-terima': 'Serah terima dicatat', 'ubah-serah': 'Tanggal serah terima diubah', 'reset-serah': 'Status serah terima dikembalikan' };
const csvCell = v => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const DEF_SET = { saList: ['KENNY', 'MICHAEL', 'GABRIEL'], lokasi: ['BSD', 'Legok', 'Makassar'] };
const TABS = ['Aktif', 'WO belum dicek', 'Estimasi', 'Pesanan', 'WO Berjalan', 'Belum Lunas', 'Lunas di muka', 'Lunas', 'Semua', 'Batal'];
const NAV = [['Transaksi', [['trx', 'Daftar Transaksi'], ['konf', 'Konfirmasi'], ['serah', 'Serah Terima'], ['rekap', 'Rekap & Ekspor']]], ['Data', [['katalog', 'Katalog Jasa & Barang'], ['setting', 'Pengaturan']]]];

/* Status → warna lencana portal */
const CHIP = { 'Lunas': 'ok', 'Belum Lunas': 'bad', 'WO Berjalan': 'info', 'Estimasi': 'warn', 'Pesanan': 'warn', 'Draf': '', 'Batal': '' };
const PCHIP = { 'Lunas': 'ok', 'Lunas di muka': 'ok', 'DP': 'warn', 'Belum bayar': '' };
const MCHIP = { 'Belum masuk': '', 'Dikerjakan': 'info', 'Selesai/Siap serah': 'ok', 'Selesai QC · Siap serah SA': 'ok', 'Selesai/Sudah serah': 'ok' };

/**
 * Bangun model data SA dari dokumen app_docs. Dipakai tampilan SA dan (sebagian) Work Tracker.
 * W = jembatan ke data Work Tracker: { job(id), all(), complete(job) }.
 */
export function saModel(saDocs, W) {
  const by = (c) => saDocs.filter(d => d.coll === c);
  const TRX = {}; by('trx').forEach(d => { TRX[d.id] = d.data || {}; });
  const KONF = by('konf').map(d => ({ id: d.id, ...(d.data || {}) }));
  const KAT = {};
  const singles = [];
  by('katalog').forEach(d => { const x = d.data || {}; if (Array.isArray(x.items)) x.items.forEach(it => { if (it && it.nama) KAT[kid(it.kode) || 'n' + slugN(it.nama)] = it; }); else singles.push([d.id, x]); });
  singles.forEach(([id, x]) => { if (x.hapus) delete KAT[id]; else KAT[id] = x; });
  const SET = Object.assign({}, DEF_SET, by('pengaturan').find(d => d.id === 'umum')?.data || {});
  const katByNameMap = new Map(); Object.values(KAT).forEach(k => { if (k && k.nama && !k.hapus) katByNameMap.set(nmKey(k.nama), k); });

  const jobById = (id) => W.job(id);
  function wtJobOf(t) { if (t.wtJob) { const j = jobById(t.wtJob); if (j) return j; } const c = woNo(t), p = plateKey(t.kend?.plat); if (!t.wo || !p) return null; const all = W.all() || []; return all.find(j => c && String(j.woNo || '') === c) || all.find(j => plateKey(j.plate) === p && !j.handed) || null; }
  const serahBlockedWT = t => { if (!t || !t.wtJob) return false; const j = jobById(t.wtJob); if (!j) return false; return !W.complete(j); };
  const serahOf = t => (t.serah && !serahBlockedWT(t) ? t.serah : '');
  const serahEligible = t => !!(t && !t.batal && (t.wo || t.fak || t.wtJob));
  const wtComplete = t => { const j = wtJobOf(t); return j ? W.complete(j) : false; };
  const serahSiap = t => !!(t && !t.batal && !serahOf(t) && wtComplete(t));
  function mobilStatus(t) { if (serahOf(t)) return 'Selesai/Sudah serah'; const j = wtJobOf(t); if (!t.wo || !j) return 'Belum masuk'; if (j.handed) return 'Selesai/Sudah serah'; if (W.complete(j)) return 'Selesai QC · Siap serah SA'; if (j.inDate && j.inDate > todayISO()) return 'Belum masuk'; return 'Dikerjakan'; }

  function katRec(it) { const k = it && it.kode ? KAT[kid(it.kode)] : null; if (k && !k.hapus) return k; return katByNameMap.get(nmKey(String((it && it.nama) || '').trim())) || null; }
  // Tabel divisi dari Pengaturan (config/divisi) belum disalin ke portal → pakai isi awal aplikasi.
  function sugDiv(it) {
    const nama = String((it && it.nama) || '').trim(); if (!nama) return '';
    if (SPPF_RX.test(nama) || /^\s*(cat|repaint|cat\s*repair|sol\s*cat)\b|\brepaint\b/i.test(nama)) return 'bodyworks';
    const rows = DIVMAP_DEF.filter(r => DIVMAP_OPTS.includes(r.d)), kode = String((it && it.kode) || '').trim();
    let d = '';
    if (kode) { const r = rows.find(r => r.t === 'kode' && String(r.k).trim() === kode); if (r) d = r.d; }
    const k = katRec(it), kat = dmNorm(k && k.kategori);
    if (k && SPPF_RX.test(String(k.kategori || '')) && !/(^|[^a-z])ppf\b/i.test(String(k.kategori || '').replace(/s\s*ppf|spray\s*ppf/gi, ''))) return 'bodyworks';
    if (!d && kat) {
      let best = null, bl = 0;
      for (const r of rows) { if (r.t === 'kode') continue; const key = dmNorm(r.k); if (key && kat.startsWith(key) && key.length > bl) { best = r; bl = key.length; } }
      if (best) d = (dmNorm(best.k) === 'cat per panel' && !CPP_NAME.test(nama)) ? '' : best.d;
    }
    if (d === 'ppf' && (SPPF_RX.test(nama) || SPPF_RX.test(String((k && k.nama) || '')) || SPPF_RX.test(String((k && k.kategori) || '')))) d = 'bodyworks';
    if (!d && (SPPF_RX.test(nama) || /^\s*(cat|repaint|cat\s*repair)\b|\brepaint\b/i.test(nama))) d = 'bodyworks';
    return d;
  }
  const rowDiv = (it) => {
    const stored = it && it.div !== undefined && it.div !== null ? String(it.div) : '';
    if (stored !== '') return stored;
    return sugDiv(it);
  };
  const woRows = t => ((t && t.items) || []).filter(i => String(i.nama || '').trim());
  const woSig = t => JSON.stringify(woRows(t).map(i => [String(i.nama).trim(), rowDiv(i), rowDiv(i) === 'vendor' ? String(i.vendor || '').trim() : '']));
  const woCekOk = t => !!(t && t.woCek && t.woCek.sig === woSig(t));
  function needsCek(t) {
    if (!t || !t.wo || t.batal || woCekOk(t) || serahOf(t)) return false;
    const j = t.wtJob ? jobById(t.wtJob) : null;
    if (j && j.handed) return false;
    return !t.wtJob || !!(j && j.perluCekSA) || !!t.woCek;
  }
  function inTab(t, tab) { if (tab === 'WO belum dicek') return needsCek(t); if (tab === 'Belum Lunas') return owes(t); if (tab === 'Lunas di muka') return payStatus(t) === 'Lunas di muka'; const s = status(t); if (tab === 'Semua') return s !== 'Batal'; if (tab === 'Aktif') return ['Draf', 'Estimasi', 'Pesanan', 'WO Berjalan', 'Belum Lunas'].includes(s); return s === tab; }

  const saMembers = () => (W.saMembers?.() || []).filter(m => m && String(m.name || '').trim());
  function saOfficialNames() { const names = [], seen = new Set(); for (const m of saMembers()) { const n = String(m.name || '').trim(); const k = saNorm(n); if (!n || seen.has(k)) continue; seen.add(k); names.push(n); } return names.length ? names : (SET.saList || []); }
  const saIsOfficial = name => { const k = saNorm(name); return !!k && saOfficialNames().some(n => saNorm(n) === k); };
  const saUnclear = t => !saNorm(t && t.sa) || !saIsOfficial(t.sa);
  function konfFor(code, plat, trxId, alias) { const c = kNorm(code), p = plateKey(plat), al = new Set((alias || []).map(kNorm).filter(Boolean)); return KONF.filter(k => (trxId && k.trxId === trxId) || (c && kNorm(k.wo) === c) || al.has(kNorm(k.wo)) || (p && kNorm(k.wo).split('|')[0] === p)); }
  // Tanpa pilihan "nama saya" di portal: semua pertanyaan menunggu dihitung (sama dengan aplikasi bila nama belum dipilih).
  const konfMine = () => KONF.filter(k => k.status === 'menunggu');

  function csvRows(kind, ym) {
    const T = Object.entries(TRX).map(([id, t]) => ({ id, ...t, items: t.items || [] }));
    const H = ['Kode WO', 'Lokasi', 'Tanggal', 'No. Dokumen', 'Jenis Dokumen', 'Customer', 'No. HP', 'Email/IG', 'Merek', 'Tipe', 'Warna', 'Plat', 'Kode Barang', 'Item', 'Qty', 'Harga (tanpa PPN)', 'Diskon %', 'Diskon Rp', 'Total', 'Status', 'SA', 'Tgl Serah Terima', 'Status Bayar', 'Status Mobil', 'Keterangan'];
    const base = (t, tgl, no, jenis) => [woNo(t), t.lokasi || '', tgl || '', no || '', jenis, t.kepada || '', t.telp || '', t.email || '', t.kend?.merk || '', t.kend?.tipe || '', t.kend?.warna || '', (t.kend?.plat || '').toUpperCase()];
    const tail = t => [t.batal ? 'Batal' : status(t), t.sa || '', serahOf(t), t.batal ? '' : payTxt(t), t.batal ? '' : mobilStatus(t), t.keterangan || ''];
    const items = (t, tgl, no, jenis) => [...t.items.map(it => [...base(t, tgl, no, jenis), it.kode || '', it.nama || '', num(it.qty), num(it.harga), pctOf(it), effDisk(it), lineTotal(it), ...tail(t)]),
      ...(effDiskT(t) ? [[...base(t, tgl, no, jenis), '', 'Diskon faktur', 1, 0, pctOfT(t), effDiskT(t), -effDiskT(t), ...tail(t)]] : []),
      ...(num(t.biayaLain) ? [[...base(t, tgl, no, jenis), '', 'Biaya lain-lain', 1, num(t.biayaLain), 0, 0, num(t.biayaLain), ...tail(t)]] : [])];
    const inM = d => d && ymOf(d) === ym;
    const rows = [];
    if (kind === 'est') T.filter(t => t.est && inM(t.est.tgl)).forEach(t => rows.push(...items(t, t.est.tgl, t.est.no, 'Estimasi')));
    if (kind === 'so') T.filter(t => t.so && inM(t.so.tgl)).forEach(t => rows.push(...items(t, t.so.tgl, t.so.no, 'Pesanan Penjualan')));
    if (kind === 'wo') T.filter(t => t.wo && inM(t.wo.tglTerima || woDateOf(t))).forEach(t => rows.push(...items(t, t.wo.tglTerima || woDateOf(t), woNo(t), 'Work Order')));
    if (kind === 'inv') {
      T.forEach(t => (t.dp || []).forEach((d, i) => { if (inM(d.tgl)) rows.push([...base(t, d.tgl, d.no, 'Invoice DP ' + (i + 1)), '', 'Uang Muka ' + (i + 1) + ' (bukan pendapatan)', 1, num(d.jumlah), 0, 0, num(d.jumlah), ...tail(t)]); }));
      T.filter(t => t.fak && inM(t.fak.tgl)).forEach(t => { rows.push(...items(t, t.fak.tgl, t.fak.no, 'Faktur Pelunasan')); if (uangMuka(t)) rows.push([...base(t, t.fak.tgl, t.fak.no, 'Faktur Pelunasan'), '', (t.fak.lunasDiMuka ? 'Dikurangi pembayaran di muka' : 'Dikurangi uang muka') + ' (' + dpRefs(t).join(', ') + ')', 1, -uangMuka(t), 0, 0, -uangMuka(t), ...tail(t)]); });
    }
    if (kind === 'pay') {
      const H2 = ['Kode WO', 'Lokasi', 'Tanggal', 'No. Invoice RMD', 'Jenis', 'Customer', 'Item', 'Qty', 'Harga', 'Total', 'Status', 'Metode', 'Rekening Tujuan', 'Bukti', 'Catatan', 'Tgl Serah Terima', 'Status Bayar', 'Status Mobil', 'Keterangan WO'];
      T.forEach(t => (t.bayar || []).filter(p => bayarAktif(p) && inM(p.tgl)).forEach(p => rows.push([woNo(t), t.lokasi || '', p.tgl, p.inv || '', p.jenis, t.kepada || '', 'Pembayaran ' + p.jenis, 1, num(p.jumlah), num(p.jumlah), isDP(p) ? 'Uang muka (bukan pendapatan)' : 'Pelunasan', p.metode || '', p.rek || '', p.bukti ? (String(p.bukti).startsWith('db:') ? 'database:' + p.bukti.slice(3) : '/_blob/' + p.bukti) : '', p.ket || '', serahOf(t), t.batal ? '' : payTxt(t), t.batal ? '' : mobilStatus(t), t.keterangan || ''])));
      return [H2, ...rows];
    }
    return [H, ...rows];
  }

  return { TRX, KONF, KAT, SET, wtJobOf, serahOf, serahEligible, serahSiap, mobilStatus, needsCek, inTab, rowDiv, saOfficialNames, saIsOfficial, saUnclear, konfFor, konfMine, csvRows };
}

/* ================================================================== */
/* Tampilan                                                            */
/* ================================================================== */
const UIKEY = 'rmoda-portal-sa';
const loadUI = () => { try { return JSON.parse(localStorage.getItem(UIKEY)) || {}; } catch (e) { return {}; } };
const saveUI = (u) => { try { localStorage.setItem(UIKEY, JSON.stringify({ view: u.view, tab: u.tab, lok: u.lok })); } catch (e) {} };

/**
 * ctx: konteks portal ({$, esc, api, toast}). root: elemen tempat SA digambar.
 * shared: { saDocs, sync, W (jembatan Work Tracker), openJob(id) }
 */
export function viewSa(ctx, root, shared) {
  const { esc } = ctx;
  const M = saModel(shared.saDocs, shared.W);
  const { TRX, KONF, KAT, SET } = M;
  const gate = shared.gate;
  const bag = {
    gate, refresh: shared.refresh,
    trx: () => TRX, set: () => SET, konf: () => KONF, kat: () => KAT,
    job: (id) => shared.W?.job?.(id),
  };
  const writable = !gate || gate.writable('sa');
  const ask = (html, fn) => {
    const dlg = document.getElementById('dlg');
    dlg.classList.remove('dlg--wide');
    dlg.innerHTML = `<form class="dlg" id="saForm">${html}<div class="composer__acts"><button type="button" class="btn" data-close>Batal</button><button class="btn btn--primary" type="submit">Simpan</button></div></form>`;
    dlg.onclick = (e) => { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); };
    dlg.onsubmit = async (e) => { e.preventDefault(); try { await fn(new FormData(e.target)); dlg.close(); } catch (err) { ctx.toast(err.message, true); } };
    if (!dlg.open) dlg.showModal();
  };
  const saved = loadUI();
  const ui = { view: saved.view || 'trx', tab: TABS.includes(saved.tab) ? saved.tab : 'Aktif', lok: saved.lok || 'Semua', sa: 'Semua', q: '', mob: 'Semua',
    serahTab: 'siap', serahBayar: 'Semua', serahQ: '', rekapM: todayISO().slice(0, 7), katQ: '', ktab: 'menunggu', ksa: '', klok: '', kq: '' };

  const pill = (txt, cls) => `<span class="badge ${cls || 'off'}">${esc(txt)}</span>`;
  const chip = s => pill(s, CHIP[s]);
  const payChip = t => { const s = payStatus(t); if (!s) return ''; const l = lebihBayar(t); return pill(s, PCHIP[s]) + (l > 0 ? ' ' + pill('Lebih bayar ' + rp(l), 'info') : ''); };
  const mobilChip = t => { const s = M.mobilStatus(t); return pill(s, MCHIP[s]); };
  const serahChip = t => { const d = M.serahOf(t); return d ? `<span class="badge ok" title="${t.serah ? 'Dicatat di transaksi' : 'Dari Work Tracker, belum dikonfirmasi di transaksi'}">${esc(dL(d))}${t.serah ? '' : ' · WT'}</span>` : pill('Belum serah', 'off'); };
  const saChip = t => { const name = String(t && t.sa || '').trim(); if (!name) return pill('SA belum dipilih', 'bad'); if (!M.saIsOfficial(name)) return `<span class="badge warn" title="Nama ini tidak ada di daftar Service Advisor tim">SA ${esc(name)}</span>`; return pill('SA ' + name, 'ok'); };
  const kchip = s => pill((KST[s] || [s])[0], (KST[s] || ['', ''])[1]);
  const mono = s => `<span class="mono">${esc(s)}</span>`;
  const stat = (k, v, d, cls = '') => `<div class="wt-stat ${cls}"><small>${esc(k)}</small><b>${v}</b><span>${d}</span></div>`;
  const tabsHtml = (items, attr, cur) => `<div class="sa-tabs" role="tablist">${items.map(([k, l, n]) => `<button role="tab" ${attr}="${esc(k)}" aria-selected="${k === cur}">${esc(l)}${n != null ? `<span class="sa-n">${n}</span>` : ''}</button>`).join('')}</div>`;
  const selLok = (id, cur, list, allLabel = 'Semua lokasi', allVal = 'Semua') => `<select class="inp inp--s" id="${id}" aria-label="Lokasi"><option value="${allVal}">${allLabel}</option>${list.map(l => `<option ${cur === l ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const selSA = (id, cur, withUnclear, nK) => `<select class="inp inp--s" id="${id}" aria-label="Filter SA"><option value="Semua">Semua SA</option>${M.saOfficialNames().map(n => `<option value="${esc(n)}" ${saNorm(cur) === saNorm(n) ? 'selected' : ''}>${esc(n)}</option>`).join('')}${withUnclear ? `<option value="__kosong" ${cur === '__kosong' ? 'selected' : ''}>Tanpa SA / tidak jelas${nK ? ' (' + nK + ')' : ''}</option>` : ''}</select>`;
  const head = (title, sub, right = '') => `<div class="sa-head"><div><h2>${esc(title)}</h2><p class="muted tiny">${sub}</p></div>${right ? `<div class="sa-filters">${right}</div>` : ''}</div>`;
  const allTrx = () => Object.entries(TRX).map(([id, t]) => ({ id, ...t }));
  const lokF = t => ui.lok === 'Semua' || t.lokasi === ui.lok;
  const saF = t => ui.sa === 'Semua' || (ui.sa === '__kosong' ? M.saUnclear(t) : saNorm(t.sa) === saNorm(ui.sa));

  root.innerHTML = `
    <div class="wt-sync"><span>Service Advisor${shared.sync ? ` · salinan ${esc(dtL(shared.sync.at))}` : ''}.</span>
      <span class="muted">${writable ? (gate?.demo ? 'Mode demo: simpan hanya di browser ini.' : 'Portal menjadi sumber. Perubahan tidak akan ditimpa salinan Claude.') : esc(gate?.blockReason('sa') || '')}</span></div>
    <nav class="sa-nav" id="saNav" aria-label="Bagian Service Advisor"></nav>
    <div id="saMain" class="sa-main"></div>`;

  function renderNav() {
    const tr = Object.values(TRX);
    const counts = { konf: M.konfMine().length, trx: tr.filter(t => ['Estimasi', 'Pesanan', 'WO Berjalan', 'Belum Lunas', 'Draf'].includes(status(t))).length, katalog: Object.keys(KAT).length, serah: tr.filter(t => M.serahSiap(t)).length };
    root.querySelector('#saNav').innerHTML = NAV.map(([g, items]) => `<div class="sa-navg"><span class="sa-navh">${g}</span>${items.map(([id, l]) =>
      `<button data-sa-nav="${id}" aria-pressed="${ui.view === id}">${esc(l)}${counts[id] != null ? `<span class="sa-n ${id === 'konf' && counts[id] ? 'is-bad' : ''}">${counts[id]}</span>` : ''}</button>`).join('')}</div>`).join('');
  }

  /* ---------------- Daftar Transaksi ---------------- */
  function vTrx() {
    const all = allTrx();
    const q = ui.q.trim().toLowerCase();
    const qF = t => !q || [t.kepada, t.telp, t.kend?.plat, kendTxt(t), t.est?.no, t.so?.no, t.fak?.no, ...(t.dp || []).map(d => d.no), ...fakBatalOf(t).map(f => f.no), woNo(t), ...woAliasOf(t), t.sa, t.wtJob, t.keterangan, t.pic, M.serahOf(t)].join(' ').toLowerCase().includes(q);
    const mobF = t => !['Belum Lunas', 'Lunas di muka'].includes(ui.tab) || ui.mob === 'Semua' || M.mobilStatus(t).startsWith(ui.mob);
    const rows = all.filter(t => M.inTab(t, ui.tab) && lokF(t) && saF(t) && qF(t) && mobF(t)).sort((a, b) => (b.diubah || '').localeCompare(a.diubah || ''));
    const ym = todayISO().slice(0, 7), bln = BULAN[+ym.slice(5) - 1];
    const L = all.filter(t => lokF(t) && saF(t));
    const estM = L.filter(t => t.est && ymOf(t.est.tgl) === ym && !t.batal).length;
    const woRun = L.filter(t => status(t) === 'WO Berjalan').length;
    const blm = L.filter(owes);
    const terima = L.filter(t => !t.batal).flatMap(t => t.bayar || []).filter(p => ymOf(p.tgl) === ym).reduce((a, p) => a + num(p.jumlah), 0);
    const cnt = tab => all.filter(t => M.inTab(t, tab) && lokF(t) && saF(t)).length;
    const nKosong = all.filter(t => !t.batal && M.saUnclear(t)).length;
    const nCek = all.filter(t => M.needsCek(t) && lokF(t) && saF(t)).length;
    const nK = M.konfMine().length;
    return `${head('Daftar Transaksi', 'Estimasi, pesanan, WO, DP, faktur, lalu kwitansi. Nomor mengikuti Pengaturan.', selLok('saLok', ui.lok, SET.lokasi || LOKASI3) + selSA('saSA', ui.sa, true, nKosong) + (gate?.can('sa_trx', { app: 'sa', loc: ui.lok === 'Semua' ? 'BSD' : ui.lok }) ? '<button type="button" class="btn btn--primary" data-sa-new>Transaksi baru</button>' : ''))}
    <div class="wt-stats">
      ${stat('Estimasi ' + bln, estM, 'dokumen SQ terbit')}
      ${stat('WO berjalan', woRun, 'mobil dikerjakan, belum faktur', 'info')}
      ${stat('Belum lunas', rp(blm.reduce((a, t) => a + sisa(t), 0)), blm.length + ' mobil/transaksi masih ada sisa', 'bad')}
      ${stat('Diterima ' + bln, rp(terima), 'DP + pelunasan tercatat', 'ok')}
    </div>
    ${nKosong ? `<p class="note">Ada <b>${nKosong} transaksi</b> tanpa SA atau SA-nya tidak ada di daftar tim. Saring <b>Tanpa SA / tidak jelas</b>.</p>` : ''}
    ${nCek ? `<button class="sa-alert warn" data-sa-tab="WO belum dicek">${nCek} WO belum dicek. Cek divisi tiap baris, lalu kirim ke Work Tracker.</button>` : ''}
    ${nK ? `<button class="sa-alert bad" data-sa-nav="konf">${nK} pertanyaan Konfirmasi menunggu jawaban — buka ›</button>` : ''}
    ${tabsHtml(TABS.map(t => [t, t, cnt(t)]), 'data-sa-tab', ui.tab)}
    <div class="sa-filters"><input type="search" class="inp" id="saQ" placeholder="Cari nama, plat, nomor dokumen, keterangan, PIC…" value="${esc(ui.q)}" aria-label="Cari transaksi"></div>
    ${['Belum Lunas', 'Lunas di muka'].includes(ui.tab) ? `<div class="wt-seg" role="group" aria-label="Status mobil">${['Semua', 'Belum masuk', 'Dikerjakan', 'Selesai'].map(f => `<button data-sa-mob="${f}" aria-pressed="${ui.mob === f}">${f} <span class="muted">${all.filter(t => M.inTab(t, ui.tab) && lokF(t) && saF(t) && (f === 'Semua' || M.mobilStatus(t).startsWith(f))).length}</span></button>`).join('')}</div>` : ''}
    ${rows.length ? `<div class="tablewrap"><table class="tbl sa-tbl"><thead><tr><th>Tanggal</th><th>Kode WO</th><th>Customer</th><th>Kendaraan</th><th>Plat</th><th>SA</th><th>Lokasi</th><th>Estimasi</th><th>Faktur</th><th class="num">Total</th><th class="num">Sisa</th><th>Status</th><th>Bayar</th><th>Mobil</th><th>Tgl Serah</th></tr></thead><tbody>
      ${rows.map(t => `<tr data-sa-open="${esc(t.id)}" tabindex="0"><td class="nowrap">${dL(lastDate(t))}</td><td class="mono"><b>${esc(woNo(t) || '–')}</b>${M.needsCek(t) ? ` ${pill('WO belum dicek SA', 'warn')}` : ''}</td><td><b>${esc(t.kepada || '–')}</b></td><td>${esc(kendTxt(t) || '–')}</td><td class="mono nowrap">${esc((t.kend?.plat || '').toUpperCase() || '–')}</td><td>${saChip(t)}</td><td>${esc(t.lokasi || '')}</td><td class="mono">${esc(t.est?.no || '–')}</td><td class="mono">${esc(t.fak?.no || '–')}</td><td class="num">${fmt(grand(t))}</td><td class="num">${t.fak || paid(t) ? fmt(Math.max(0, sisa(t))) : '–'}</td><td>${chip(status(t))}</td><td>${payChip(t)}</td><td>${t.batal ? '' : mobilChip(t)}</td><td>${t.batal ? '' : serahChip(t)}</td></tr>`).join('')}
    </tbody></table></div><p class="muted tiny">${rows.length} transaksi.</p>` : `<div class="empty"><p class="muted">${all.length ? 'Tidak ada transaksi di tab ini.' : 'Belum ada transaksi.'}</p></div>`}`;
  }

  /* ---------------- Rekap ---------------- */
  function vRekap() {
    const ym = ui.rekapM, bl = BULAN[+ym.slice(5) - 1] + ' ' + ym.slice(0, 4);
    const T = allTrx().filter(t => !t.batal);
    const fak = T.filter(t => t.fak && ymOf(t.fak.tgl) === ym).sort((a, b) => String(a.fak.no).localeCompare(String(b.fak.no)));
    const pays = T.flatMap(t => (t.bayar || []).filter(bayarAktif).map(p => ({ ...p, t }))).filter(p => ymOf(p.tgl) === ym).sort((a, b) => String(a.tgl).localeCompare(String(b.tgl)));
    const piutang = T.filter(owes);
    const byLok = {}; fak.forEach(t => byLok[t.lokasi || '–'] = (byLok[t.lokasi || '–'] || 0) + grand(t));
    const diakui = T.filter(t => t.fak && ymOf(M.serahOf(t)) === ym && M.serahOf(t));
    return `${head('Rekap & Ekspor', 'Untuk diinput ulang ke Accurate. CSV dibuat langsung di browser ini dari data salinan.', `<input type="month" class="inp inp--s" id="saM" value="${ym}" aria-label="Bulan">`)}
    <div class="sa-filters"><span class="muted tiny">Ekspor untuk Accurate:</span>${[['est', 'Estimasi'], ['so', 'Pesanan Penjualan'], ['wo', 'Work Order'], ['inv', 'Invoice'], ['pay', 'Pembayaran']].map(([k, l]) => `<button class="btn btn--s" data-sa-csv="${k}">${l} CSV</button>`).join('')}<button class="btn btn--s" data-sa-xlsx>Unduh Excel</button></div>
    <div class="wt-stats">
      ${stat('Pendapatan diakui (serah terima)', rp(diakui.reduce((a, t) => a + grand(t), 0)), esc(T.filter(t => M.serahOf(t) && ymOf(M.serahOf(t)) === ym).length + ' mobil diserahkan bulan ini · PSAK 72'), 'ok')}
      ${stat('Faktur terbit', rp(fak.reduce((a, t) => a + grand(t), 0)), esc(fak.length + ' faktur · ' + (Object.entries(byLok).map(([l, v]) => l + ' ' + rp(v)).join(' · ') || '–')))}
      ${stat('Uang diterima', rp(pays.reduce((a, p) => a + num(p.jumlah), 0)), esc('uang muka (bukan pendapatan) ' + rp(pays.filter(p => isDP(p)).reduce((a, p) => a + num(p.jumlah), 0)) + ' · pelunasan ' + rp(pays.filter(p => !isDP(p)).reduce((a, p) => a + num(p.jumlah), 0))), 'info')}
      ${stat('Piutang berjalan', rp(piutang.reduce((a, t) => a + sisa(t), 0)), esc(piutang.length + ' mobil/transaksi, semua bulan · ' + ['Belum masuk', 'Dikerjakan', 'Selesai'].map(f => f + ' ' + piutang.filter(t => M.mobilStatus(t).startsWith(f)).length).join(' · ')), 'bad')}
    </div>
    <h3 class="wt-h">Faktur ${bl}</h3>
    ${fak.length ? `<div class="tablewrap"><table class="tbl sa-tbl"><thead><tr><th>No. Faktur</th><th>Kode WO</th><th>Tanggal</th><th>Customer</th><th>Lokasi</th><th>SA</th><th class="num">Total</th><th class="num">Uang muka</th><th class="num">Pelunasan</th><th class="num">Sisa</th><th>Tgl Serah</th><th>Keterangan</th></tr></thead><tbody>
      ${fak.map(t => `<tr data-sa-open="${esc(t.id)}" tabindex="0"><td class="mono">${esc(t.fak.no)}</td><td class="mono">${esc(woNo(t))}</td><td class="nowrap">${dL(t.fak.tgl)}</td><td>${esc(t.kepada)}</td><td>${esc(t.lokasi || '')}</td><td>${esc(t.sa || '')}</td><td class="num">${fmt(grand(t))}</td><td class="num">${fmt(paidDP(t))}</td><td class="num">${fmt(paidLunas(t))}</td><td class="num">${fmt(Math.max(0, sisa(t)))}</td><td>${serahChip(t)}</td><td class="wrapcell">${esc(t.keterangan || '')}</td></tr>`).join('')}
    </tbody></table></div>` : `<div class="empty"><p class="muted">Belum ada faktur di bulan ini.</p></div>`}
    <h3 class="wt-h">Penerimaan uang ${bl}</h3>
    ${pays.length ? `<div class="tablewrap"><table class="tbl sa-tbl"><thead><tr><th>Tanggal</th><th>Kode WO</th><th>Jenis</th><th>Metode</th><th>Customer</th><th>Invoice</th><th class="num">Jumlah</th><th>Catatan</th></tr></thead><tbody>
      ${pays.map(p => `<tr data-sa-open="${esc(p.t.id)}" tabindex="0"><td class="nowrap">${dL(p.tgl)}</td><td class="mono">${esc(woNo(p.t))}</td><td>${esc(p.jenis)}</td><td>${esc(p.metode || '')}</td><td>${esc(p.t.kepada)}</td><td class="mono">${esc(p.inv || p.t.fak?.no || '–')}</td><td class="num">${fmt(num(p.jumlah))}</td><td class="wrapcell">${esc(p.ket || '')}</td></tr>`).join('')}
    </tbody></table></div>` : `<div class="empty"><p class="muted">Belum ada penerimaan di bulan ini.</p></div>`}`;
  }

  /* ---------------- Serah Terima ---------------- */
  function vSerah() {
    const all = allTrx().filter(M.serahEligible);
    const q = (ui.serahQ || '').trim().toLowerCase();
    const qF = t => !q || [t.kepada, t.telp, t.kend?.plat, kendTxt(t), woNo(t), t.sa, t.fak?.no, M.serahOf(t), t.keterangan, t.pic, payTxt(t)].join(' ').toLowerCase().includes(q);
    const tab = ui.serahTab;
    const byTabK = (t, k) => k === 'sudah' ? !!M.serahOf(t) : k === 'siap' ? M.serahSiap(t) : !M.serahOf(t) && !M.serahSiap(t);
    const bf = ui.serahBayar;
    const payF = t => { if (bf === 'Semua') return true; const s = payStatus(t); if (bf === 'Lunas') return s === 'Lunas' || s === 'Lunas di muka'; if (bf === 'Belum lunas') return s !== 'Lunas' && s !== 'Lunas di muka'; return true; };
    const rows = all.filter(t => lokF(t) && saF(t) && qF(t) && byTabK(t, tab) && payF(t)).sort((a, b) => tab === 'sudah' ? (M.serahOf(b) || '').localeCompare(M.serahOf(a) || '') : (b.diubah || '').localeCompare(a.diubah || ''));
    const ym = todayISO().slice(0, 7);
    const L = all.filter(t => lokF(t) && saF(t));
    const siap = L.filter(M.serahSiap);
    const belumWT = L.filter(t => !M.serahOf(t) && !M.serahSiap(t));
    const sudahBln = L.filter(t => M.serahOf(t) && ymOf(M.serahOf(t)) === ym);
    const pendapatan = L.filter(t => t.fak && M.serahOf(t) && ymOf(M.serahOf(t)) === ym).reduce((a, t) => a + grand(t), 0);
    const sisaSerah = L.filter(t => M.serahOf(t) && sisa(t) > 0).length;
    const cntTab = k => L.filter(t => byTabK(t, k) && payF(t)).length;
    const filtered = q || ui.lok !== 'Semua' || ui.sa !== 'Semua' || bf !== 'Semua';
    const emptyMsg = all.length ? (tab === 'siap' ? 'Tidak ada mobil yang sudah selesai QC dan siap serah terima' + (filtered ? ' dengan saringan ini' : '') + '.'
      : tab === 'wt' ? 'Tidak ada mobil yang masih dikerjakan di Work Tracker, atau transaksi tanpa kartu WT' + (filtered ? ' dengan saringan ini' : '') + '.' : 'Tidak ada mobil yang cocok dengan saringan ini.')
      : 'Belum ada work order / faktur yang perlu dicatat serah terimanya.';
    return `${head('Serah Terima', 'Tanggal mobil diserahkan ke customer. Dipakai Finance untuk pengakuan pendapatan (PSAK 72). Tombol Serah Terima muncul setelah semua tahap, termasuk QC. Tanggal diisi sendiri, tidak terisi otomatis. Transaksi lama tanpa kartu Work Tracker tetap bisa dicatat.', selLok('saLok', ui.lok, SET.lokasi || LOKASI3) + selSA('saSA', ui.sa, true))}
    <div class="wt-stats">
      ${stat('Siap serah terima', siap.length, 'lulus semua tahap kerja / QC final, belum diserahkan', 'ok')}
      ${stat('Belum selesai WT / Tanpa WT', belumWT.length, 'masih dikerjakan di bengkel, atau transaksi lama tanpa kartu WT', 'info')}
      ${stat('Diserahkan ' + BULAN[+ym.slice(5) - 1], sudahBln.length, 'tanggal serah di bulan ini')}
      ${stat('Pendapatan diakui', rp(pendapatan), 'faktur yang serah terimanya di bulan ini · PSAK 72', 'ok')}
      ${stat('Sudah serah, masih ada sisa', sisaSerah, 'diserahkan tetapi pembayaran belum lunas', 'bad')}
    </div>
    ${tabsHtml([['siap', 'Siap serah terima', cntTab('siap')], ['wt', 'Belum selesai WT / Tanpa WT', cntTab('wt')], ['sudah', 'Sudah serah terima', cntTab('sudah')]], 'data-sa-stab', tab)}
    <div class="sa-filters"><div class="wt-seg" role="group" aria-label="Status bayar">${['Semua', 'Lunas', 'Belum lunas'].map(f => `<button data-sa-sbyr="${f}" aria-pressed="${bf === f}">${f}</button>`).join('')}</div>
      <input type="search" class="inp" id="saSQ" placeholder="Cari nama, plat, kode WO, tanggal…" value="${esc(ui.serahQ)}" aria-label="Cari serah terima"></div>
    ${rows.length ? `<div class="tablewrap desk-table"><table class="tbl sa-tbl"><thead><tr><th>Kode WO</th><th>Customer</th><th>Kendaraan</th><th>Plat</th><th>SA</th><th>Lokasi</th><th>Bayar</th><th>Mobil</th><th>Tgl Serah</th></tr></thead><tbody>
      ${rows.map(t => `<tr data-sa-open="${esc(t.id)}" tabindex="0"><td class="mono"><b>${esc(woNo(t) || '–')}</b></td><td><b>${esc(t.kepada || '–')}</b></td><td>${esc(kendTxt(t) || '–')}</td><td class="mono nowrap">${esc((t.kend?.plat || '').toUpperCase() || '–')}</td><td>${saChip(t)}</td><td>${esc(t.lokasi || '')}</td><td>${payChip(t) || '–'}</td><td>${mobilChip(t)}</td><td>${serahChip(t)}${(tab === 'siap' || (tab === 'wt' && !t.wtJob)) && gate?.can('sa_serah', { app: 'sa', loc: t.lokasi }) ? ` <button type="button" class="btn btn--s" data-sa-serah-id="${esc(t.id)}">Serah Terima</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div><div class="m-cards">${rows.map((t) => `<button type="button" class="m-card" data-sa-open="${esc(t.id)}"><b>${esc(woNo(t) || '')}</b> ${esc(t.kepada || '')}<small>${esc(kendTxt(t) || '')} · ${esc((t.kend?.plat || '').toUpperCase())} · ${esc(t.lokasi || '')}</small><span>${mobilChip(t)} ${serahChip(t)}</span>${(tab === 'siap' || (tab === 'wt' && !t.wtJob)) && gate?.can('sa_serah', { app: 'sa', loc: t.lokasi }) ? `<span class="btn btn--s" data-sa-serah-id="${esc(t.id)}">Serah Terima</span>` : ''}</button>`).join('')}</div>` : `<div class="empty"><p class="muted">${emptyMsg}</p></div>`}`;
  }

  /* ---------------- Katalog ---------------- */
  function vKatalog() {
    const q = ui.katQ.trim().toLowerCase();
    const all = Object.entries(KAT).map(([id, k]) => ({ id, ...k }));
    const rows = all.filter(k => !q || (k.kode + ' ' + k.nama + ' ' + (k.kategori || '')).toLowerCase().includes(q)).sort((a, b) => (a.nama || '').localeCompare(b.nama || ''));
    const MAX = 400, shown = rows.slice(0, MAX);
    return `${head('Katalog Jasa & Barang', 'Kode dari Accurate. Item manual tidak tertimpa impor. Hapus menjadi nonaktif.', gate?.can('kat_edit', { app: 'sa' }) ? '<button type="button" class="btn btn--s" data-sa-kat>Tambah item</button><label class="btn btn--s">Impor Excel<input type="file" id="saImport" accept=".xlsx,.csv" hidden></label>' : '')}
    <div class="sa-filters"><input type="search" class="inp" id="saKQ" placeholder="Cari kode, nama, atau kategori…" value="${esc(ui.katQ)}" aria-label="Cari katalog"><span class="muted tiny">${rows.length} dari ${all.length} item${rows.length > MAX ? ` · menampilkan ${MAX} pertama, persempit pencarian` : ''}</span></div>
    ${shown.length ? `<div class="tablewrap"><table class="tbl sa-tbl"><thead><tr><th>Kode</th><th>Nama</th><th>Kategori</th><th>Jenis</th><th class="num">Harga BSD/Legok</th><th class="num">Harga Makassar</th></tr></thead><tbody>
      ${shown.map(k => `<tr><td class="mono">${esc(k.kode)}</td><td class="wrapcell">${esc(k.nama)}${k.lok ? ` <span class="muted tiny">· khusus ${esc(k.lok)}</span>` : ''}</td><td>${esc(k.kategori || '')}</td><td>${esc({ SVC: 'Jasa', INV: 'Produk', NON: 'Non-stok' }[k.jenis] || k.jenis || '')}</td><td class="num">${num(k.harga) ? fmt(num(k.harga)) : '–'}</td><td class="num">${num((k.hargaLok || {}).Makassar) ? fmt(num(k.hargaLok.Makassar)) : '–'}</td></tr>`).join('')}
    </tbody></table></div>` : `<div class="empty"><p class="muted">${all.length ? 'Tidak ada yang cocok.' : 'Katalog masih kosong.'}</p></div>`}`;
  }

  /* ---------------- Konfirmasi ---------------- */
  function vKonf() {
    const all = KONF.slice().sort((a, b) => (b.no || 0) - (a.no || 0));
    const kq = ui.kq.trim().toLowerCase();
    const f = all.filter(k => (!ui.ksa || k.untuk === ui.ksa || k.untuk === 'Semua SA') && (!ui.klok || k.lokasi === ui.klok) && (!kq || [k.no, k.wo, k.q, k.jawab, k.dari, k.untuk, k.kategori, k.penanya].join(' ').toLowerCase().includes(kq)));
    const tabs = [['menunggu', 'Menunggu'], ['dijawab', 'Dijawab'], ['selesai', 'Selesai'], ['semua', 'Semua']];
    const rows = f.filter(k => ui.ktab === 'semua' || k.status === ui.ktab);
    return `${head('Konfirmasi', 'Pertanyaan dari Admin, Finance, Gudang, atau Produksi untuk SA.',
      `<select class="inp inp--s" id="saKSA" aria-label="Filter SA"><option value="">Semua SA</option>${(SET.saList || []).map(n => `<option ${ui.ksa === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>${selLok('saKLok', ui.klok, LOKASI3, 'Semua lokasi', '')}<button class="btn btn--s" data-sa-kcsv>Ekspor CSV</button>${gate?.can('konf_tanya', { app: 'sa', loc: 'BSD' }) ? '<button type="button" class="btn btn--primary" data-sa-knew>Pertanyaan baru</button>' : ''}`)}
    ${tabsHtml(tabs.map(([k, l]) => [k, l, k === 'semua' ? f.length : f.filter(x => x.status === k).length]), 'data-sa-ktab', ui.ktab)}
    <div class="sa-filters"><input type="search" class="inp" id="saKQ2" placeholder="Cari nomor, kode WO, isi pertanyaan…" value="${esc(ui.kq)}" aria-label="Cari konfirmasi"></div>
    ${rows.length ? `<div class="tablewrap"><table class="tbl sa-tbl"><thead><tr><th>No</th><th>Tanggal</th><th class="num">Umur</th><th>Dari</th><th>Untuk SA</th><th>Lokasi</th><th>Kode WO / Plat</th><th>Kategori</th><th>Pertanyaan</th><th>Prioritas</th><th>Status</th></tr></thead><tbody>
      ${rows.map(k => { const u = umurOf(k), late = k.status === 'menunggu' && u > 1; return `<tr data-sa-kopen="${esc(k.id)}" tabindex="0"><td class="mono">#${esc(k.no)}</td><td class="nowrap">${dL((k.dibuat || '').slice(0, 10))}</td><td class="num nowrap ${late ? 'sa-late' : ''}">${u} hr</td><td>${esc(k.dari)}</td><td>${esc(k.untuk)}</td><td>${esc(k.lokasi || '')}</td><td class="mono">${esc(k.wo || '–')}</td><td>${esc(k.kategori)}</td><td class="wrapcell">${esc(String(k.q || '').slice(0, 90))}${String(k.q || '').length > 90 ? '…' : ''}${(k.lampiran || []).length ? ` <span class="muted tiny">· ${(k.lampiran || []).length} lampiran</span>` : ''}</td><td>${k.prio === 'Penting' ? pill('Penting', 'bad') : 'Biasa'}</td><td>${kchip(k.status)}</td></tr>`; }).join('')}
    </tbody></table></div>` : `<div class="empty"><p class="muted">Tidak ada pertanyaan di sini.</p></div>`}`;
  }

  /* ---------------- Detail (sheet) ---------------- */
  const dlg = document.getElementById('dlg');
  function openSheet(html) {
    dlg.classList.add('dlg--wide');
    dlg.innerHTML = `<div class="dlg sa-sheet">${html}</div>`;
    dlg.onclick = async (e) => {
      if (e.target === dlg || e.target.closest('[data-close]')) return dlg.close();
      const k = e.target.closest('[data-sa-kopen]'); if (k) return openKonf(k.dataset.saKopen);
      const t = e.target.closest('[data-sa-open]'); if (t) return openTrx(t.dataset.saOpen);
      const j = e.target.closest('[data-sa-wtjob]'); if (j) { dlg.close(); return shared.openJob?.(j.dataset.saWtjob); }
      const img = e.target.closest('[data-sa-zoom]'); if (img) img.classList.toggle('is-zoom');
      const issue = e.target.closest('[data-sa-issue]');
      if (issue) { try { await Act.issue(bag, openId, issue.dataset.saIssue); } catch (err) { ctx.toast(err.message, true); } return; }
      const pr = e.target.closest('[data-sa-print]');
      if (pr) {
        try {
          const model = Act.buildDocModel(pr.dataset.saPrint, TRX[openId], '', { idx: pr.dataset.idx || 0, set: SET });
          const html = Act.docHtml(model);
          dlg.innerHTML = `<div class="dlg"><div class="wt-dh"><h2>Siap cetak</h2><button type="button" class="iconbtn" data-close aria-label="Tutup">×</button></div><iframe class="print-frame" id="printFrame" title="Dokumen"></iframe><p class="muted tiny">Dialog printer ikut terbuka. Bila tidak muncul, tekan Ctrl+P di halaman dokumen.</p></div>`;
          const frame = dlg.querySelector('#printFrame');
          if (frame) frame.srcdoc = html;
          Act.printHtml(html);
        } catch (err) { ctx.toast(err.message || 'Dialog cetak tidak terbuka. Buka tab lalu tekan Ctrl+P.', true); }
        return;
      }
      const pdf = e.target.closest('[data-sa-pdf]');
      if (pdf) { try { const model = Act.buildDocModel(pdf.dataset.saPdf, TRX[openId], '', { idx: pdf.dataset.idx || 0, set: SET }); await Act.downloadPdf(model, (model.title || 'dokumen').replace(/\s+/g, '_') + '.pdf'); ctx.toast('PDF diunduh.'); } catch (err) { ctx.toast(err.message, true); } return; }
      if (e.target.closest('[data-sa-pay]')) return ask(Act.bayarForm(TRX[openId]), (fd) => Act.catatBayar(bag, openId, fd));
      const tglBtn = e.target.closest('[data-sa-tgl]');
      if (tglBtn) {
        const i = Number(tglBtn.dataset.saTgl);
        const p = (TRX[openId].bayar || [])[i] || {};
        return ask(`<h3>Revisi tanggal pembayaran</h3><p>${esc(p.jenis || '')} ${fmt(num(p.jumlah))}. Nominal, jenis, dan bukti tidak berubah.</p><label class="f">Tanggal baru (hari/bulan/tahun)<input class="inp" name="tgl" inputmode="numeric" placeholder="16/11/2026" required></label><label class="f">Alasan<textarea class="inp" name="alasan" required minlength="10"></textarea></label><input type="hidden" name="idx" value="${i}">`, async (fd) => { await Act.revisiTglBayar(bag, openId, fd); ctx.toast('Tanggal pembayaran direvisi.'); });
      }
      const jenisBtn = e.target.closest('[data-sa-jenis]');
      if (jenisBtn) {
        const i = Number(jenisBtn.dataset.saJenis);
        const p = (TRX[openId].bayar || [])[i] || {};
        const t0 = TRX[openId];
        const opts = [t0.fak?.no ? `<option value="Pelunasan|${esc(t0.fak.no)}">Pelunasan · ${esc(t0.fak.no)}</option>` : '', ...(t0.dp || []).map((d, n) => `<option value="DP ${n + 1}|${esc(d.no)}">DP ${n + 1} · ${esc(d.no)}</option>`)].join('');
        return ask(`<h3>Ubah jenis pembayaran</h3><p>Sekarang ${esc(p.jenis || '')}${p.inv ? ' · ' + esc(p.inv) : ''}. Nominal dan bukti tidak berubah.</p><label class="f">Jenis baru<select class="inp" name="jenis">${opts}</select></label><label class="f">Alasan<textarea class="inp" name="alasan" required minlength="10"></textarea></label><input type="hidden" name="idx" value="${i}">`, async (fd) => { await Act.ubahJenisBayar(bag, openId, fd); ctx.toast('Jenis pembayaran diubah.'); });
      }
      const hapusBtn = e.target.closest('[data-sa-hapus]');
      if (hapusBtn) {
        const i = Number(hapusBtn.dataset.saHapus);
        const p = (TRX[openId].bayar || [])[i] || {};
        if (!confirm(`Sembunyikan pembayaran ${p.jenis || ''} ${fmt(num(p.jumlah))} tanggal ${dL(p.tgl)}? Baris tetap tersimpan di data, tidak dihitung, dan tidak bisa dihapus dari database.`)) return;
        const fd = new FormData(); fd.set('idx', String(i)); fd.set('alasan', 'Pembayaran tanpa bukti disembunyikan');
        try { await Act.hapusBayar(bag, openId, fd); ctx.toast('Pembayaran disembunyikan. Baris tetap ada di data.'); } catch (err) { ctx.toast(err.message, true); }
        return;
      }
      const batal = e.target.closest('[data-sa-batal]');
      if (batal) {
        const t0 = TRX[openId];
        const i = Number(batal.dataset.saBatal);
        const p = (t0.bayar || [])[i] || {};
        const sekarang = (t0.bayar || []).filter(bayarAktif).reduce((a, x) => a + num(x.jumlah), 0);
        const nanti = (t0.bayar || []).filter((x, j) => j !== i && bayarAktif(x)).reduce((a, x) => a + num(x.jumlah), 0);
        return ask(`<h3>Batalkan baris pembayaran</h3><p>Baris tidak dihapus. Tetap tampil dicoret dengan tanda Dibatalkan, alasan, nama, dan waktu. Nominalnya tidak dihitung lagi di total, sisa, status lunas, invoice, kwitansi, dan rekap.</p><p><b>${esc(p.jenis || 'Pembayaran')}</b> ${fmt(num(p.jumlah))} · ${esc(dL(p.tgl))}${p.inv ? ' · ' + esc(p.inv) : ''}</p><p class="muted">Dibayar ${rp(sekarang)} menjadi ${rp(nanti)}. Sisa tagihan ${rp(Math.max(0, grand(t0) - nanti))}.</p><label class="f">Alasan<textarea class="inp" name="alasan" required minlength="10" placeholder="Minimal 10 karakter"></textarea></label><input type="hidden" name="idx" value="${i}">`, async (fd) => { await Act.batalBayar(bag, openId, fd); ctx.toast('Baris pembayaran dibatalkan. Konfirmasi ke Finance dibuat.'); });
      }
      const pulih = e.target.closest('[data-sa-pulih]');
      if (pulih) {
        const t0 = TRX[openId];
        const i = Number(pulih.dataset.saPulih);
        const p = (t0.bayar || [])[i] || {};
        return ask(`<h3>Pulihkan baris pembayaran</h3><p>Baris dihitung lagi. Alasan wajib, minimal 10 karakter. Riwayat pembatalan tetap tersimpan.</p><p><b>${esc(p.jenis || 'Pembayaran')}</b> ${fmt(num(p.jumlah))} · ${esc(dL(p.tgl))}</p><label class="f">Alasan<textarea class="inp" name="alasan" required minlength="10"></textarea></label><input type="hidden" name="idx" value="${i}">`, async (fd) => { await Act.pulihBayar(bag, openId, fd); ctx.toast('Baris pembayaran dipulihkan.'); });
      }
      if (e.target.closest('[data-sa-nom]')) {
        const t0 = TRX[openId];
        const opts = (t0.bayar || []).map((p, i) => bayarAktif(p) ? `<option value="${i}">${esc(p.jenis || 'Bayar')} ${fmt(num(p.jumlah))}</option>` : '').join('');
        return ask(`<h3>Edit nominal</h3><p class="muted tiny">Alasan minimal 10 karakter. Rp0 ditolak. Baris yang ada bukti tidak bisa dihapus. Sudah serah hanya Owner. Konfirmasi ke Finance dibuat otomatis.</p><label>Baris <select class="inp" name="idx">${opts}</select></label><label>Nominal baru <input class="inp" name="jumlah" required></label><label>Alasan <input class="inp" name="alasan" required minlength="10"></label>`, (fd) => Act.editNominal(bag, openId, fd));
      }
      if (e.target.closest('[data-sa-edit]')) return ask(Act.trxFormHtml(TRX[openId], KAT, M.saOfficialNames()), (fd) => Act.saveTrx(bag, openId, fd, TRX[openId]));
      if (e.target.closest('[data-sa-cek]')) {
        const divs = [...dlg.querySelectorAll('[data-cek-div]')].map((s) => s.value);
        try { await Act.cekWo(bag, openId, divs); ctx.toast('WO dicek dan dikirim ke Work Tracker.'); } catch (err) { ctx.toast(err.message, true); }
        return;
      }
      if (e.target.closest('[data-sa-serah]')) return ask(serahForm(), (fd) => Act.serah(bag, openId, fd.get('tgl')));
      if (e.target.closest('[data-sa-kjawab]')) return ask('<h3>Jawaban</h3><textarea class="inp" name="jawab" required></textarea><input type="hidden" name="mode" value="jawab"><input type="hidden" name="lokasi" value="' + esc(KONF.find(x => x.id === openId)?.lokasi || '') + '">', (fd) => Act.saveKonf(bag, fd, KONF.find(x => x.id === openId)));
      if (e.target.closest('[data-sa-kulang]')) return ask('<h3>Tanya ulang</h3><textarea class="inp" name="q" required></textarea><input type="hidden" name="mode" value="ulang">', (fd) => Act.saveKonf(bag, fd, { ...KONF.find(x => x.id === openId), id: openId }));
      if (e.target.closest('[data-sa-kselesai]')) {
        const fd = new FormData(); fd.set('mode', 'selesai'); fd.set('lokasi', KONF.find(x => x.id === openId)?.lokasi || '');
        try { await Act.saveKonf(bag, fd, { ...KONF.find(x => x.id === openId), id: openId }); } catch (err) { ctx.toast(err.message, true); }
        return;
      }
    };
    dlg.onclose = () => dlg.classList.remove('dlg--wide');
    if (!dlg.open) dlg.showModal(); else dlg.scrollTop = 0;
    dlg.querySelector('.sa-sheet')?.scrollIntoView?.({ block: 'start' });
  }
  const fact = (label, val, sub = '') => `<div><small>${esc(label)}</small><b>${val || '—'}</b>${sub ? `<span class="muted">${sub}</span>` : ''}</div>`;
  const step = (title, no, sub, done) => `<div class="sa-step ${done ? 'is-done' : ''}"><small>${esc(title)}</small><b class="mono">${esc(no || '—')}</b><span class="muted">${esc(sub)}</span></div>`;

  function koreksiHtml(t) {
    const K = (t.koreksi || []).filter(Boolean), FB = fakBatalOf(t), R = (t.riwayatSA || []).filter(Boolean);
    if (!K.length && !FB.length && !woAliasOf(t).length && !R.length) return '';
    const det = k => k.aksi === 'ubah-nominal' ? esc(k.teks || '') : (k.aksi === 'batal-bayar' || k.aksi === 'pulih-bayar') ? esc(k.teks || p_hb(k)) : k.aksi === 'batal-faktur' ? `${esc(k.faktur)} (${esc(dL(k.tglFaktur))})` : k.aksi === 'ubah-jenis' ? `${esc(dL(k.pembayaran?.tgl))} ${esc(rp(num(k.pembayaran?.jumlah)))}: ${esc(k.dari?.jenis)}${k.dari?.inv ? ' · ' + esc(k.dari.inv) : ''} → ${esc(k.ke?.jenis)}${k.ke?.inv ? ' · ' + esc(k.ke.inv) : ''}` : k.aksi === 'kode-wo' ? `${mono(k.dari)} → ${mono(k.ke)}` : k.aksi === 'hapus-bayar' ? esc(p_hb(k)) : k.aksi === 'tgl-bayar' ? `${esc(rp(num(k.pembayaran?.jumlah)))} ${esc(k.pembayaran?.jenis || '')}${k.pembayaran?.inv ? ' · ' + esc(k.pembayaran.inv) : ''}: ${esc(dL(k.tglLama))} → ${esc(dL(k.tglBaru))}` : k.aksi === 'ganti-sa' ? `${esc(k.dari || '(belum dipilih)')} → ${esc(k.ke || '')}` : (k.aksi === 'serah-terima' || k.aksi === 'ubah-serah') ? `${esc(dL(k.tglLama) || '–')} → ${esc(dL(k.tglBaru))}` : k.aksi === 'reset-serah' ? `${esc(dL(k.tglLama) || '–')} → belum serah terima` : '';
    return `<h3>Riwayat koreksi</h3>
      ${FB.length ? `<p class="muted tiny">Faktur dibatalkan (nomor tidak dipakai ulang): ${FB.map(f => `<b class="mono">${esc(f.no)}</b> (${esc(dL(f.tgl))})`).join(', ')}</p>` : ''}
      ${woAliasOf(t).length ? `<p class="muted tiny">Kode WO lama (masih bisa dicari): ${woAliasOf(t).map(c => `<b class="mono">${esc(c)}</b>`).join(', ')}</p>` : ''}
      ${K.length ? `<div class="tablewrap"><table class="tbl"><thead><tr><th>Waktu</th><th>Oleh</th><th>Koreksi</th><th>Detail</th><th>Alasan</th></tr></thead><tbody>${K.map(k => `<tr><td class="nowrap">${esc(dtL(k.at))}</td><td>${esc(k.oleh || '–')}${k.peran ? `<br><small class="muted">${esc(k.peran)}</small>` : ''}</td><td>${esc(KX_LBL[k.aksi] || k.aksi)}</td><td>${det(k)}</td><td>${esc(k.alasan)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${R.length ? `<p class="muted tiny">Pergantian SA: ${R.map(r => `${esc(dtL(r.at))} · ${esc(r.dari || '–')} → ${esc(r.ke || '')} oleh ${esc(r.oleh || '')}${r.alasan ? ' (' + esc(r.alasan) + ')' : ''}`).join('; ')}</p>` : ''}`;
  }

  function payAct(t, p, i) {
    if (p.hapus) return '';
    if (!bayarAktif(p)) {
      return gate?.can('sa_batal_bayar', { app: 'sa', loc: t.lokasi, handed: !!t.serah }) ? `<button type="button" class="btn btn--s" data-sa-pulih="${i}">Pulihkan</button>` : '';
    }
    const bits = [];
    if (isDP(p)) bits.push(`<button type="button" class="btn btn--s" data-sa-print="kwit" data-idx="${i}">Kwitansi</button>`);
    if (gate?.can('sa_tgl_bayar', { app: 'sa', loc: t.lokasi })) bits.push(`<button type="button" class="btn btn--s" data-sa-tgl="${i}">Revisi tanggal</button>`);
    if (gate?.can('sa_ubah_jenis', { app: 'sa', loc: t.lokasi })) bits.push(`<button type="button" class="btn btn--s" data-sa-jenis="${i}">Ubah jenis</button>`);
    if (gate?.can('sa_batal_bayar', { app: 'sa', loc: t.lokasi, handed: !!t.serah })) bits.push(`<button type="button" class="btn btn--s" data-sa-batal="${i}">Batalkan</button>`);
    if (!p.bukti && !p.buktiNama && gate?.can('sa_hapus_bayar', { app: 'sa', loc: t.lokasi })) bits.push(`<button type="button" class="btn btn--s" data-sa-hapus="${i}">Hapus</button>`);
    return bits.join(' ');
  }
  function payNote(p) {
    if (bayarAktif(p)) return `${esc(p.ket || '')}${p.bukti || p.buktiNama ? ' <span class="muted tiny">· ada foto bukti</span>' : ''}`;
    const b = p.batal && typeof p.batal === 'object' ? p.batal : {};
    return `${pill('Dibatalkan', 'bad')} <span class="muted">${esc(b.alasan || p.batalAlasan || '')}. ${esc(b.oleh || p.batalOleh || '')}${b.peran ? ' (' + esc(b.peran) + ')' : ''}${(b.at || p.batalAt) ? ', ' + esc(dtL(b.at || p.batalAt)) : ''}</span>`;
  }
  function payTable(t) {
    const s = (on, html) => on ? `<s>${html}</s>` : html;
    const rows = t.bayar.map((p, i) => { if (p.hapus) return ''; const off = !bayarAktif(p); return `<tr class="${off ? 'is-batal' : ''}"><td class="nowrap">${s(off, dL(p.tgl))}${tglRevOf(p).length ? ` <span class="badge off" title="Tanggal awal ${esc(dL(tglRevOf(p)[0].dari))}">direvisi</span>` : ''}</td><td>${s(off, esc(p.jenis))}</td><td>${s(off, esc(p.metode || ''))}</td><td>${s(off, esc(p.rek || '–'))}</td><td class="mono">${s(off, esc(p.inv || '–'))}${p.inv && fakBatalOf(t).some(f => f.no === p.inv) ? ` ${pill('faktur dibatalkan', 'bad')}` : ''}</td><td class="num">${s(off, fmt(num(p.jumlah)))}${nomRevOf(p).length ? `<br><small class="muted">diubah ${nomRevOf(p).length}×</small>` : ''}</td><td class="wrapcell">${payNote(p)}</td><td>${payAct(t, p, i)}</td></tr>`; }).join('');
    const cards = t.bayar.map((p, i) => { if (p.hapus) return ''; const off = !bayarAktif(p); return `<article class="sa-pay ${off ? 'is-batal' : ''}"><div class="pay-main">${s(off, `<b>${esc(p.jenis || 'Pembayaran')}</b> ${fmt(num(p.jumlah))}`)}</div><small>${s(off, esc(dL(p.tgl)) + (p.inv ? ' · ' + esc(p.inv) : ''))}</small><div>${payNote(p)}</div>${payAct(t, p, i)}</article>`; }).join('');
    return `<div class="tablewrap desk-table"><table class="tbl sa-tbl"><thead><tr><th>Tanggal</th><th>Jenis</th><th>Metode</th><th>Rekening</th><th>Invoice</th><th class="num">Jumlah</th><th>Catatan</th><th></th></tr></thead><tbody>${rows}</tbody></table></div><div class="m-cards">${cards}</div>`;
  }
  function openTrx(id) {
    const t0 = TRX[id]; if (!t0) return ctx.toast('Transaksi tidak ditemukan.', true);
    const t = { ...t0, items: t0.items || [], bayar: t0.bayar || [], kend: t0.kend || {} };
    const st = status(t), j = M.wtJobOf(t), wn = woNo(t);
    const L = (wn || t.kend.plat) ? M.konfFor(wn, t.kend.plat, id, woAliasOf(t)).sort((a, b) => (b.no || 0) - (a.no || 0)) : [];
    const dps = t.dp || [];
    const serah = M.serahOf(t);
    openSheet(`
      <div class="wt-dh"><div><div class="wt-tags">${chip(st)} ${saChip(t)} ${payChip(t)} ${t.batal ? '' : mobilChip(t)}</div>
        <h2>${esc(t.kepada || 'Tanpa nama')}</h2><p class="muted tiny">${wn ? 'Kode WO ' + mono(wn) + ' · ' : ''}${esc(t.lokasi || '')}${t.diubah ? ' · diubah ' + esc(dtL(t.diubah)) + (t.diubahOleh ? ' oleh ' + esc(t.diubahOleh) : '') : ''}</p></div>
        <button class="iconbtn" data-close aria-label="Tutup">×</button></div>
      <div class="sa-steps">
        ${step('Estimasi', t.est?.no, t.est ? dL(t.est.tgl) : 'Belum terbit', !!t.est)}
        ${step('Pesanan Penjualan', t.so?.no, t.so ? dL(t.so.tgl) : 'Belum terbit', !!t.so)}
        ${step('Work Order', t.wo ? wn : '', t.wo ? 'Kirim ' + (dL(t.wo.tglKirim) || '–') + (t.wtJob ? ' · ' + t.wtJob : '') : 'Belum dibuat', !!t.wo)}
        ${[0, 1].map(i => { const d = dps[i]; return step('Invoice DP ' + (i + 1), d?.no, d ? rp(num(d.jumlah)) + ' · ' + dL(d.tgl) : '—', !!d); }).join('')}
        ${step('Faktur Pelunasan', t.fak?.no, t.fak ? dL(t.fak.tgl) + (uangMuka(t) ? (t.fak.lunasDiMuka ? ' · lunas di muka ' : ' · dikurangi DP ') + rp(uangMuka(t)) : '') + (lebihBayar(t) > 0 ? ' · lebih bayar ' + rp(lebihBayar(t)) : '') : payStatus(t) === 'Lunas di muka' ? 'Sudah lunas di muka' : 'Belum terbit', !!t.fak)}
        ${step('Invoice Lunas', st === 'Lunas' ? t.fak.no : '', st === 'Lunas' ? 'Sisa tagihan 0' : t.fak ? 'Sisa ' + rp(Math.max(0, sisa(t))) : 'Setelah faktur dibayar penuh', st === 'Lunas')}
      </div>
      ${M.needsCek(t) ? `<div class="note"><b>Cek WO sebelum ke Work Tracker</b><p class="tiny">Saran awal SPPF, Cat, Cat Repair, dan Repaint adalah Bodyworks bila divisi masih kosong. Pilihan yang sudah ada, termasuk Vendor, tidak ditimpa. SPPF tidak pernah otomatis menjadi PPF. Tahap yang sudah berjalan tidak dihapus.</p>${t.items.map((it, i) => { const dv = M.rowDiv(it); return `<label class="f">${esc(it.nama || 'Pekerjaan')} <select class="inp" data-cek-div="${i}">${['bodyworks', 'ppf', 'coating', 'vendor'].map((d) => `<option value="${d}" ${dv === d ? 'selected' : ''}>${esc(DIVX[d])}</option>`).join('')}</select></label>`; }).join('')}${gate?.can('sa_doc', { app: 'sa', loc: t.lokasi }) ? '<p><button type="button" class="btn btn--primary" data-sa-cek>Kirim ke Work Tracker</button></p>' : ''}</div>` : ''}
      <h3>Customer &amp; kendaraan</h3>
      <div class="wt-facts">
        ${fact('Customer', esc(t.kepada), esc([t.telp, t.email].filter(Boolean).join(' · ')))}
        ${fact('Kendaraan', esc(kendTxt(t)), esc([t.kend.tahun, t.kend.warna].filter(Boolean).join(' · ')))}
        ${fact('Plat', t.kend.plat ? `<span class="plate">${esc(String(t.kend.plat).toUpperCase())}</span>` : '')}
        ${fact('SA pemilik', esc(t.sa || ''), picFrom(t) ? 'PIC ' + esc(picFrom(t)) : '')}
      </div>
      <h3>Pekerjaan &amp; harga</h3>
      ${t.items.length ? `<div class="tablewrap"><table class="tbl sa-tbl"><thead><tr><th>Kode</th><th>Nama barang / jasa</th><th>Divisi</th><th class="num">Kts.</th><th class="num">@Harga</th><th class="num">Disk %</th><th class="num">Disk Rp</th><th class="num">Total</th><th>Ket. di WO</th></tr></thead><tbody>
        ${t.items.map(it => { const dv = M.rowDiv(it); return `<tr><td class="mono">${esc(it.kode || '')}</td><td class="wrapcell">${esc(it.nama || '')}</td><td>${esc(DIVX[dv] || dv || '—')}${dv === 'vendor' && it.vendor ? `<br><small class="muted">${esc(it.vendor)}</small>` : ''}</td><td class="num">${esc(String(num(it.qty)))}</td><td class="num">${fmt(num(it.harga))}</td><td class="num">${pctOf(it) ? fmt2(pctOf(it)) : ''}</td><td class="num">${effDisk(it) ? fmt(effDisk(it)) : ''}</td><td class="num"><b>${fmt(lineTotal(it))}</b></td><td class="wrapcell">${esc(it.ket || '')}</td></tr>`; }).join('')}
      </tbody></table></div>` : '<p class="muted">Belum ada item.</p>'}
      <dl class="sa-totals">
        <dt>Sub total</dt><dd>${rp(subTotal(t))}</dd>
        ${effDiskT(t) ? `<dt>Diskon faktur${pctOfT(t) ? ' (' + fmt2(pctOfT(t)) + '%)' : ''}</dt><dd>−${rp(effDiskT(t))}</dd>` : ''}
        ${num(t.biayaLain) ? `<dt>Biaya lain-lain</dt><dd>${rp(num(t.biayaLain))}</dd>` : ''}
        <dt class="big">Total</dt><dd class="big">${rp(grand(t))}</dd>
        <dt>Dibayar</dt><dd>${rp(paid(t))}${paidDP(t) ? ` <small class="muted">(uang muka ${rp(paidDP(t))})</small>` : ''}</dd>
        <dt>Sisa</dt><dd class="${sisa(t) > 0 && committed(t) ? 'sa-late' : ''}">${rp(Math.max(0, sisa(t)))}</dd>
      </dl>
      <h3>Pembayaran</h3>
      ${t.bayar.length ? `${payTable(t)}<p class="muted tiny">Baris Dibatalkan tetap tersimpan, dicoret, dan tidak dihitung. Yang tersimpan di portal adalah nama file bukti. File fotonya belum ikut.</p>` : '<p class="muted">Belum ada pembayaran tercatat.</p>'}
      <h3>Keterangan &amp; tanggal</h3>
      ${stripPicLine(t.keterangan) ? `<p class="note">${esc(stripPicLine(t.keterangan))}</p>` : ''}
      <div class="wt-facts">
        ${fact('Syarat bayar', esc(t.termin || 'C.O.D'))}
        ${fact('Tanggal kode WO', esc(dL(woDateOf(t))), woAliasOf(t).length ? 'Kode lama: ' + woAliasOf(t).map(esc).join(', ') : '')}
        ${t.wo ? fact('Penerimaan / pengiriman (WO)', esc((dL(t.wo.tglTerima) || '–') + ' → ' + (dL(t.wo.tglKirim) || '–')), 'WO ke-' + esc(t.wo.rev || 1)) : ''}
        ${fact('Serah terima', serah ? esc(dL(serah)) : 'Belum serah', serah && !t.serah ? 'dari Work Tracker, belum dikonfirmasi di transaksi' : '')}
      </div>
      <h3>Work Tracker</h3>
      ${j ? `<div class="sa-wt"><span class="plate">${esc(j.plate || '—')}</span> <b>${esc(j.no || j.id)}</b> <span class="muted">${esc(j.car || '')} · ${esc(j.loc || '')}</span> ${mobilChip(t)}
        <button class="btn btn--s" data-sa-wtjob="${esc(j.id)}">Buka kartu Work Tracker →</button></div>`
        : `<p class="muted">${t.wtJob ? 'Kartu ' + esc(t.wtJob) + ' tidak terlihat dengan akses kamu.' : 'Belum ada kartu Work Tracker untuk transaksi ini.'}</p>`}
      <h3>Konfirmasi (${L.length})</h3>
      ${L.length ? `<ul class="wt-items">${L.map(k => `<li><button class="sa-linkrow" data-sa-kopen="${esc(k.id)}"><span class="mono">#${esc(k.no)}</span> ${esc(k.kategori || '')} ${kchip(k.status)}<br><span>${esc(k.q || '')}</span>${k.jawab ? `<br><small class="muted">Jawab: ${esc(k.jawab)}</small>` : ''}</button></li>`).join('')}</ul>` : '<p class="muted">Belum ada pertanyaan untuk WO ini.</p>'}
      ${koreksiHtml(t)}
      <h3>Dokumen</h3>
      <div class="fchips">
        ${!t.est && gate?.can('sa_doc', { app: 'sa', loc: t.lokasi }) ? '<button type="button" class="btn btn--s" data-sa-issue="est">Terbitkan Estimasi</button>' : ''}
        ${t.est && !t.so && gate?.can('sa_doc', { app: 'sa', loc: t.lokasi }) ? '<button type="button" class="btn btn--s" data-sa-issue="so">Terbitkan Pesanan</button>' : ''}
        ${t.so && !t.wo && gate?.can('sa_doc', { app: 'sa', loc: t.lokasi }) ? '<button type="button" class="btn btn--s" data-sa-issue="wo">Buat WO</button>' : ''}
        ${t.wo && !(t.dp || [])[0] && gate?.can('sa_doc', { app: 'sa', loc: t.lokasi }) ? '<button type="button" class="btn btn--s" data-sa-issue="dp1">Invoice DP 1</button>' : ''}
        ${(t.dp || [])[0] && !(t.dp || [])[1] && gate?.can('sa_doc', { app: 'sa', loc: t.lokasi }) ? '<button type="button" class="btn btn--s" data-sa-issue="dp2">Invoice DP 2</button>' : ''}
        ${t.wo && !t.fak && gate?.can('sa_doc', { app: 'sa', loc: t.lokasi }) ? '<button type="button" class="btn btn--s" data-sa-issue="fak">Faktur Pelunasan</button>' : ''}
        ${t.est ? '<button type="button" class="btn btn--s" data-sa-print="est">Cetak estimasi</button><button type="button" class="btn btn--s" data-sa-pdf="est">Unduh PDF</button>' : ''}
        ${t.so ? '<button type="button" class="btn btn--s" data-sa-print="so">Cetak pesanan</button><button type="button" class="btn btn--s" data-sa-pdf="so">Unduh PDF pesanan</button>' : ''}
        ${t.wo ? '<button type="button" class="btn btn--s" data-sa-print="wo">Cetak langsung WO</button><button type="button" class="btn btn--s" data-sa-pdf="wo">Unduh PDF WO</button>' : ''}
        ${(t.dp || []).map((d, i) => `<button type="button" class="btn btn--s" data-sa-print="dp" data-idx="${i}">Cetak Invoice DP ${i + 1}</button><button type="button" class="btn btn--s" data-sa-pdf="dp" data-idx="${i}">Unduh PDF DP ${i + 1}</button>`).join('')}
        ${t.fak ? '<button type="button" class="btn btn--s" data-sa-print="fak">Cetak faktur</button><button type="button" class="btn btn--s" data-sa-pdf="fak">Unduh PDF faktur</button>' : ''}
        ${st === 'Lunas' ? '<button type="button" class="btn btn--s" data-sa-print="lunas">Cetak Invoice Lunas</button><button type="button" class="btn btn--s" data-sa-pdf="lunas">Unduh PDF Invoice Lunas</button>' : ''}
        ${(t.bayar || []).some(bayarAktif) ? '<button type="button" class="btn btn--s" data-sa-print="kwit">Cetak kwitansi</button><button type="button" class="btn btn--s" data-sa-pdf="kwit">Unduh PDF kwitansi</button>' : ''}
        ${gate?.can('sa_pay', { app: 'sa', loc: t.lokasi }) && (t.fak || (t.dp || []).length) ? '<button type="button" class="btn btn--s" data-sa-pay>Catat pembayaran</button>' : ''}
        ${gate?.can('sa_nominal', { app: 'sa', loc: t.lokasi, handed: !!t.serah }) && (t.bayar || []).some(bayarAktif) ? '<button type="button" class="btn btn--s" data-sa-nom>Edit nominal</button>' : ''}
        ${gate?.can('sa_trx', { app: 'sa', loc: t.lokasi }) ? '<button type="button" class="btn btn--s" data-sa-edit>Edit transaksi</button>' : ''}
        ${M.serahSiap(t) && gate?.can('sa_serah', { app: 'sa', loc: t.lokasi }) ? '<button type="button" class="btn btn--primary" data-sa-serah>Serah Terima</button>' : ''}
      </div>
      <p class="muted tiny">Dibuat ${esc(dtL(t.dibuat))}${t.dibuatOleh ? ' oleh ' + esc(t.dibuatOleh) : ''}. Cetak langsung memakai dialog printer. Bila dialog tidak muncul, tab baru terbuka lalu tekan Ctrl+P.</p>`);
  }

  function openKonf(id) {
    openId = id;
    const k = KONF.find(x => x.id === id); if (!k) return ctx.toast('Pertanyaan tidak ditemukan.', true);
    const L = Array.isArray(k.lampiran) ? k.lampiran : [];
    const byP = {}; L.forEach(a => (byP[a.putaran || 1] = byP[a.putaran || 1] || []).push(a));
    const lamp = L.length ? `<h3>Lampiran (${L.length})</h3>
      <p class="muted tiny">File asli lampiran belum tersedia di portal (hanya nama dan gambar kecil yang ikut disalin). Unduh file aslinya dari aplikasi Claude.</p>
      ${Object.keys(byP).sort((a, b) => a - b).map(p => `${Object.keys(byP).length > 1 ? `<small class="muted">Putaran ${esc(p)}</small>` : ''}<ul class="sa-lamp">${byP[p].map(a => { const tr = a.ditarik; return `<li class="${tr ? 'is-off' : ''}">
        ${lampThumbOk(a.thumb) && !tr ? `<img src="${esc(a.thumb)}" alt="Gambar kecil ${esc(a.nama)}" data-sa-zoom>` : `<span class="sa-ext">${esc((lampExt(a.nama) || 'file').toUpperCase())}</span>`}
        <div><b>${esc(a.nama)}</b><small class="muted">${esc(lampSize(a.ukuran || 0))} · ${esc(a.olehNama || '')} · ${esc(dtL(a.at))}</small>${tr ? `<small class="sa-late">Ditarik ${esc(tr.olehNama || '')} · ${esc(dtL(tr.at))} · alasan: ${esc(tr.alasan || '-')}</small>` : ''}</div></li>`; }).join('')}</ul>`).join('')}` : '';
    const t = k.trxId && TRX[k.trxId] ? k.trxId : '';
    openSheet(`
      <div class="wt-dh"><div><div class="wt-tags">${kchip(k.status)} ${k.prio === 'Penting' ? pill('Penting', 'bad') : pill('Biasa', 'off')}</div>
        <h2>Konfirmasi #${esc(k.no)}</h2><p class="muted tiny">${esc(k.kategori || '')} · umur ${umurOf(k)} hari</p></div>
        <button class="iconbtn" data-close aria-label="Tutup">×</button></div>
      <div class="wt-facts">
        ${fact('Dari', esc(k.dari) + (k.penanya ? ` <span class="muted">(${esc(k.penanya)})</span>` : ''))}
        ${fact('Untuk SA', esc(k.untuk))}
        ${fact('Lokasi', esc(k.lokasi || ''))}
        ${fact('Kode WO / plat', k.wo ? mono(k.wo) : '–')}
        ${fact('Dibuat', esc(dtL(k.dibuat)))}
      </div>
      <h3>Pertanyaan</h3><p class="sa-q">${esc(k.q)}</p>
      ${t ? `<div><button class="btn btn--s" data-sa-open="${esc(t)}">Buka transaksi</button></div>` : ''}
      <h3>Jawaban SA</h3>
      ${k.status === 'menunggu' ? '<p class="muted">Belum dijawab.</p>' : `<p class="sa-q">${esc(k.jawab || (L.length ? '(jawaban berupa lampiran)' : '–'))}</p><p class="muted tiny">Dijawab ${esc(k.jawabOleh || '')} · ${esc(dtL(k.waktuJawab))}</p>${k.foto ? '<p class="muted tiny">Ada foto jawaban (tidak ikut disalin ke portal).</p>' : ''}`}
      ${(k.jawabSebelumnya || []).length ? `<h3>Jawaban sebelumnya</h3><ul class="wt-items">${k.jawabSebelumnya.map(x => `<li><small class="muted">${esc(dtL(x.waktu || x.at))} · ${esc(x.oleh || x.jawabOleh || '')}</small><br>${esc(x.jawab || x.t || '')}</li>`).join('')}</ul>` : ''}
      ${lamp}
      ${(k.riwayat || []).length ? `<h3>Riwayat</h3><ul class="wt-log">${k.riwayat.map(r => `<li><small class="muted">${esc(dtL(r.at))} · ${esc(r.by || '')}</small><span>${esc(r.t)}</span></li>`).join('')}</ul>` : ''}
      <div class="fchips">
        ${k.status === 'menunggu' && gate?.can('sa_konf_jawab', { app: 'sa', loc: k.lokasi }) ? '<button type="button" class="btn btn--primary" data-sa-kjawab>Jawab</button>' : ''}
        ${k.status === 'dijawab' && gate?.can('konf_tutup', { app: 'sa', loc: k.lokasi }) ? '<button type="button" class="btn btn--s" data-sa-kulang>Tanya ulang</button><button type="button" class="btn btn--s" data-sa-kselesai>Tandai selesai</button>' : ''}
      </div>`);
  }

  /* ---------------- CSV ---------------- */
  function download(name, rows) {
    const txt = '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
    const u = URL.createObjectURL(new Blob([txt], { type: 'text/csv' })), a = document.createElement('a');
    a.href = u; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
  }
  function exportCSV(kind) {
    const rows = M.csvRows(kind, ui.rekapM);
    if (rows.length < 2) return ctx.toast('Tidak ada data di bulan ini.');
    const nm = { est: 'Estimasi', so: 'Pesanan_Penjualan', wo: 'Work_Order', inv: 'Invoice', pay: 'Pembayaran' }[kind];
    download(`${nm}_${ui.rekapM}.csv`, rows);
  }
  function exportKonf() {
    const rows = [['no', 'tanggal', 'dari', 'untuk_sa', 'lokasi', 'kode_wo', 'kategori', 'pertanyaan', 'prioritas', 'status', 'jawaban', 'dijawab_oleh', 'waktu_jawab', 'umur_hari', 'lampiran', 'lampiran_ditarik']];
    KONF.slice().sort((a, b) => (a.no || 0) - (b.no || 0)).forEach(k => rows.push([k.no, (k.dibuat || '').slice(0, 10), k.dari, k.untuk, k.lokasi, k.wo, k.kategori, k.q, k.prio, (KST[k.status] || [k.status])[0], k.jawab, k.jawabOleh, k.waktuJawab, umurOf(k),
      (k.lampiran || []).filter(a => !a.ditarik).map(a => `${a.nama} (${a.tipe || lampExt(a.nama)}, ${lampSize(a.ukuran || 0)}, putaran ${a.putaran || 1}, ${a.olehNama || ''}, ${a.at || ''}, ${a.ref})`).join(' | '),
      (k.lampiran || []).filter(a => a.ditarik).map(a => `${a.nama} — ditarik ${a.ditarik.olehNama || ''} ${a.ditarik.at || ''}: ${a.ditarik.alasan || ''}`).join(' | ')]));
    download(`Konfirmasi_${todayISO()}.csv`, rows);
  }

  /* ---------------- render & events ---------------- */
  function vSet() {
    const on = gate?.can('set_nomor', { app: 'sa' });
    return `${head('Pengaturan', 'SA, kop faktur, dan nomor dokumen berikutnya.')}
      ${on ? `<form id="saSet">${Act.pengaturanHtml(SET)}<p><button class="btn btn--primary" type="submit">Simpan pengaturan</button></p>
        <h3>Saklar sumber data</h3>
        <p class="muted tiny">Mati: staf hanya melihat, salinan Claude tetap jalan. Nyala: portal jadi sumber dan salinan Claude untuk app ini berhenti. Hanya Owner, setelah Pak menyetujui.</p>
        <p><button type="button" class="btn" data-src="work">Work Tracker: ${gate.sources.work ? 'NYALA' : 'mati'}</button>
           <button type="button" class="btn" data-src="sa">Service Advisor: ${gate.sources.sa ? 'NYALA' : 'mati'}</button></p>
      </form>` : '<p class="muted">Hanya Owner yang mengubah pengaturan.</p>'}`;
  }
  const VIEWS = { trx: vTrx, konf: vKonf, serah: vSerah, rekap: vRekap, katalog: vKatalog, setting: vSet };
  function render(keepFocus) {
    if (!VIEWS[ui.view]) ui.view = 'trx';
    saveUI(ui); renderNav();
    const a = keepFocus && document.activeElement, id = a?.id, pos = a?.selectionStart;
    root.querySelector('#saMain').innerHTML = VIEWS[ui.view]();
    if (id) { const n = root.querySelector('#' + id); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} } }
  }
  function serahForm() {
    return '<h3>Serah Terima</h3><p>Isi tanggal saat mobil diterima customer. Biarkan kosong sampai SA mengisinya.</p><label class="f">Tanggal (hari/bulan/tahun)<input class="inp" name="tgl" inputmode="numeric" autocomplete="off" placeholder="16/11/2026" required></label>';
  }
  let openId = '';
  const _openTrx = openTrx;
  openTrx = (id) => { openId = id; _openTrx(id); };
  root.onclick = async (e) => {
    const serahBtn = e.target.closest('[data-sa-serah-id]');
    if (serahBtn) { e.stopPropagation(); openId = serahBtn.dataset.saSerahId; ask(serahForm(), async (fd) => { await Act.serah(bag, openId, fd.get('tgl')); ctx.toast('Serah terima tercatat.'); }); return; }
    const src = e.target.closest('[data-src]');
    if (src) {
      const app = src.dataset.src;
      const on = !gate.sources[app];
      const ok = confirm(on
        ? 'Nyalakan portal sebagai sumber untuk bagian ini? Salinan dari Claude akan berhenti menimpa data. Lakukan hanya setelah Pak menyetujui.'
        : 'Matikan sumber portal? Salinan Claude akan jalan lagi dan bisa menimpa perubahan di portal.');
      if (!ok) return;
      try { await gate.setSource(app, on); ctx.toast(on ? 'Saklar sumber nyala.' : 'Saklar sumber mati.'); render(); } catch (err) { ctx.toast(err.message, true); }
      return;
    }
    const t = e.target.closest('[data-sa-nav],[data-sa-tab],[data-sa-mob],[data-sa-stab],[data-sa-sbyr],[data-sa-ktab],[data-sa-open],[data-sa-kopen],[data-sa-csv],[data-sa-kcsv],[data-sa-new],[data-sa-xlsx],[data-sa-knew],[data-sa-kat]'); if (!t) return;
    const d = t.dataset;
    if ('saNew' in d) return ask(Act.trxFormHtml(null, KAT, M.saOfficialNames()), (fd) => Act.saveTrx(bag, null, fd, null));
    if ('saXlsx' in d) {
      const rows = M.csvRows('inv', ui.rekapM);
      const blob = new Blob([Act.excelXml(rows)], { type: 'application/vnd.ms-excel' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Rekap_${ui.rekapM}.xls`; a.click();
      return;
    }
    if ('saKnew' in d) return ask(Act.konfForm(M.saOfficialNames()), (fd) => Act.saveKonf(bag, fd, null));
    if ('saKat' in d) return ask('<h3>Item katalog</h3><input class="inp" name="kode" placeholder="Kode barang"><input class="inp" name="nama" placeholder="Nama" required><input class="inp" name="kategori" placeholder="Kategori"><select class="inp" name="jenis"><option value="SVC">Jasa</option><option value="INV">Produk</option><option value="NON">Non-stok</option></select><input class="inp" name="harga" placeholder="Harga BSD/Legok"><input class="inp" name="hargaMks" placeholder="Harga Makassar">', (fd) => Act.saveKat(bag, fd, null));
    if (d.saNav) { ui.view = d.saNav; render(); return window.scrollTo?.(0, 0); }
    if (d.saTab) { ui.tab = d.saTab; ui.mob = 'Semua'; return render(); }
    if (d.saMob) { ui.mob = d.saMob; return render(); }
    if (d.saStab) { ui.serahTab = d.saStab; return render(); }
    if (d.saSbyr) { ui.serahBayar = d.saSbyr; return render(); }
    if (d.saKtab) { ui.ktab = d.saKtab; return render(); }
    if (d.saOpen) return openTrx(d.saOpen);
    if (d.saKopen) return openKonf(d.saKopen);
    if (d.saCsv) return exportCSV(d.saCsv);
    if ('saKcsv' in d) return exportKonf();
  };
  root.onkeydown = (e) => { if (e.key !== 'Enter') return; const d = e.target.dataset || {}; if (d.saOpen) openTrx(d.saOpen); else if (d.saKopen) openKonf(d.saKopen); };
  root.oninput = (e) => {
    const id = e.target.id, v = e.target.value;
    const map = { saQ: 'q', saSQ: 'serahQ', saKQ: 'katQ', saKQ2: 'kq' };
    if (map[id]) { ui[map[id]] = v; render(true); }
  };
  root.onchange = (e) => {
    const id = e.target.id, v = e.target.value;
    if (id === 'saLok') ui.lok = v; else if (id === 'saSA') ui.sa = v; else if (id === 'saM') ui.rekapM = v || todayISO().slice(0, 7);
    else if (id === 'saKSA') ui.ksa = v; else if (id === 'saKLok') ui.klok = v;
    else if (id === 'saImport') {
      const file = e.target.files?.[0]; if (!file) return;
      Act.importKat(bag, file).then((n) => ctx.toast(n + ' item katalog diimpor. Item manual tidak berubah.')).catch((err) => ctx.toast(err.message, true));
      return;
    } else return;
    render();
  };
  root.addEventListener('submit', (e) => {
    if (e.target.id !== 'saSet') return;
    e.preventDefault();
    Act.saveSet(bag, new FormData(e.target)).then(() => ctx.toast('Pengaturan tersimpan.')).catch((err) => ctx.toast(err.message, true));
  });
  render();

  return {
    openTrx, openKonf,
    go(view) { ui.view = view; render(); },
  };
}
