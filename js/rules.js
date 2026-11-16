// Aturan bersama Work Tracker dan Service Advisor (UI, mode demo, dan uji).
// Database yang hidup tetap memeriksa ulang lewat RPC. Jangan menganggap file ini sebagai kunci.

export const LOCS = ['BSD', 'Legok', 'Makassar'];
export const UNIT_OF = { BSD: 'rmoda-bsd', Legok: 'rmoda-legok', Makassar: 'rmoda-mks' };
export const LOC_OF = { 'rmoda-bsd': 'BSD', 'rmoda-legok': 'Legok', 'rmoda-mks': 'Makassar' };

export const DIVS = {
  bodyworks: { label: 'Bodyworks', stages: [['cuci', 'Cuci Kendaraan'], ['bongkar', 'Bongkar'], ['las', 'Las / Ketok'], ['dempul', 'Dempul'], ['epoxy', 'Epoxy'], ['sppf', 'SPPF'], ['cat', 'Pengecatan'], ['pc', 'Paint Correction'], ['rakit', 'Perakitan & Fitting'], ['finishing', 'Finishing'], ['qc', 'QC']] },
  ppf: { label: 'PPF', stages: [['cuci', 'Cuci / Persiapan'], ['bongkar', 'Bongkar'], ['prepd', 'Detailing Preparation'], ['pasang', 'Pasang PPF'], ['rakit', 'Perakitan'], ['detailing', 'Detailing'], ['coating', 'Coating'], ['finishing', 'Finishing'], ['qc', 'QC']] },
  coating: { label: 'Coating', stages: [['innerfender', 'Innerfender Detailing'], ['engine', 'Engine Bay Detailing'], ['clay', 'Clay Wash'], ['exterior', 'Exterior Detailing'], ['interior', 'Interior Detailing'], ['pc', 'Paint Correction'], ['coating', 'Coating'], ['finishing', 'Finishing'], ['qc', 'QC']] },
  vendor: { label: 'Vendor', stages: [['lepas', 'Lepas part'], ['kirim', 'Kirim ke vendor'], ['kerja', 'Dikerjakan vendor'], ['terima', 'Diterima kembali'], ['qc', 'QC'], ['pasang', 'Pasang kembali']] },
};

const STAGE_AFTER = { ppf: { prepd: ['pasang', 'rakit', 'detailing', 'coating', 'finishing', 'qc'] } };
const SPPF_RX = /sppf|spray\s*ppf/i;
const CAT_WORK_NAME = /^\s*(cat|repaint|cat\s*repair|sol\s*cat)\b|\brepaint\b|\bpengecatan\b/i;

function sppfKategori(k) {
  if (!SPPF_RX.test(k)) return false;
  const rest = String(k).replace(/s\s*ppf|spray\s*ppf/gi, '');
  return !/(^|[^a-z])ppf\b/i.test(rest);
}

export function stOf(job, div, k) {
  const st = job.stages?.[div] || {};
  if (st[k]?.s) return st[k].s;
  const af = STAGE_AFTER[div]?.[k];
  return af && af.some((x) => st[x]?.s === 'done') ? 'done' : 'todo';
}

export function divState(job, div) {
  const spec = DIVS[div];
  if (!spec) return null;
  const st = job.stages?.[div] || {};
  const list = spec.stages.map(([k, label]) => ({ k, label, s: stOf(job, div, k), at: st[k]?.at, by: st[k]?.by }));
  const counted = list.filter((x) => x.s !== 'skip');
  const cur = counted.find((x) => x.s !== 'done') || null;
  const doneN = counted.filter((x) => x.s === 'done').length;
  return { div, list, cur, done: !cur, pct: counted.length ? Math.round(doneN / counted.length * 100) : 100 };
}

export function jobComplete(job) {
  const divs = (job.divs || []).filter((d) => DIVS[d]);
  if (!divs.length) return false;
  return divs.every((d) => divState(job, d).done);
}

// Tanggal serah hanya sah bila dicatat SA dan (semua tahap selesai, atau tidak ada kartu tahap).
// Status 'done' di Work Tracker tidak pernah dihitung sebagai serah terima.
export function acceptedSerah(job, serahDate) {
  if (!serahDate) return '';
  const divs = (job.divs || []).filter((d) => DIVS[d]);
  if (!divs.length || jobComplete(job)) return String(serahDate).slice(0, 10);
  return '';
}

function isSppf(nama, kategori = '') {
  return SPPF_RX.test(String(nama || '')) || sppfKategori(kategori);
}
function isPaintName(nama) {
  return CAT_WORK_NAME.test(String(nama || ''));
}

// Saran untuk baris baru atau divisi yang masih kosong.
// SPPF tidak pernah disarankan sebagai PPF. Pilihan yang sudah tersimpan tidak lewat sini.
export function suggestDiv(nama, hinted, kategori = '') {
  if (isSppf(nama, kategori)) return 'bodyworks';
  if (isPaintName(nama)) return 'bodyworks';
  if (hinted === 'ppf' && isSppf(nama, kategori)) return 'bodyworks';
  return DIVS[hinted] ? hinted : '';
}

// Divisi yang sudah dipilih SA (termasuk Vendor) tetap. Kosong memakai saran.
export function coerceDiv(nama, div, kategori = '') {
  const chosen = String(div ?? '');
  if (chosen && (DIVS[chosen] || chosen === 'lainnya')) return chosen;
  return suggestDiv(nama, '', kategori);
}

// Jalur simpan WO, edit, kirim ke Work Tracker, dan revisi tidak boleh mengisi tanggal serah.
export function preserveSerah(prev, next) {
  const out = { ...(next || {}) };
  if (prev && prev.serah) out.serah = prev.serah;
  else delete out.serah;
  return out;
}

export function bayarAktif(p) {
  if (!p || p.batal || p.hapus) return false;
  if (p.statusBatal === 'Dibatalkan' || p.statusBatal === 'Diarsipkan') return false;
  return true;
}

export function plateKey(p) {
  return String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
export function woCode(plate, iso) {
  const p = plateKey(plate);
  if (!p || !iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${p}|${d}-${m}-${y}`;
}

const RX = { SQ: /^SQ\.(\d{4})\.(\d{2})\.(\d+)$/, SO: /^SO\.(\d{4})\.(\d{2})\.(\d+)$/, RMD: /^RMD(\d+)\.(\d{2})\.(\d{2})$/ };
export const fmtSQ = (ym, n) => `SQ.${ym.slice(0, 4)}.${ym.slice(5, 7)}.${String(n).padStart(5, '0')}`;
export const fmtSO = (ym, n) => `SO.${ym.slice(0, 4)}.${ym.slice(5, 7)}.${String(n).padStart(5, '0')}`;
export const fmtRMD = (ym, n) => `RMD${String(n).padStart(3, '0')}.${ym.slice(5, 7)}.${ym.slice(2, 4)}`;
export const fmtNo = (kind, ym, n) => (kind === 'SQ' ? fmtSQ(ym, n) : kind === 'SO' ? fmtSO(ym, n) : fmtRMD(ym, n));

function nosOf(t, kind) {
  if (kind === 'SQ') return [t.est?.no];
  if (kind === 'SO') return [t.so?.no];
  return [t.fak?.no, ...(t.dp || []).map((d) => d.no), ...(t.fakBatal || []).map((f) => f.no)];
}
export function nextNum(kind, ym, list, set) {
  let max = 0;
  for (const t of list || []) {
    for (const no of nosOf(t, kind)) {
      const m = no && String(no).match(RX[kind]);
      if (!m) continue;
      if ((kind === 'SQ' || kind === 'SO') && `${m[1]}-${m[2]}` === ym) max = Math.max(max, +m[3]);
      if (kind === 'RMD' && `20${m[3]}-${m[2]}` === ym) max = Math.max(max, +m[1]);
    }
  }
  const bag = kind === 'SQ' ? set?.mulaiSQ : kind === 'SO' ? set?.mulaiSO : set?.mulaiRMD;
  const start = Number(bag?.[ym]) || 1;
  return Math.max(max + 1, start);
}

export function blankActor() {
  return { owner: false, seeAll: false, sa: [], kabeng: [], kadiv: [], divs: [], finance: false, gudang: false, name: '' };
}

export function actorFromMember(me, assignments, roles) {
  const actor = blankActor();
  actor.owner = !!me?.is_owner;
  actor.seeAll = !!me?.see_all_units;
  actor.name = me?.name || '';
  const byId = Object.fromEntries((roles || []).map((r) => [r.id, r.name]));
  for (const a of assignments || []) {
    const name = byId[a.role_id] || a.role_name || '';
    const loc = LOC_OF[a.unit_id];
    if (name === 'Service Advisor' && loc) actor.sa.push(loc);
    if ((name === 'Kepala Bengkel' || name === 'Kepala Unit') && loc) actor.kabeng.push(loc);
    if (name === 'Kepala Divisi' && loc) {
      actor.kadiv.push(loc);
      const div = a.scope?.div;
      if (div === 'all') actor.divs.push('bodyworks', 'ppf', 'coating', 'vendor');
      else if (div) actor.divs.push(div);
    }
    if (name === 'Finance') actor.finance = true;
    if (name === 'Gudang') actor.gudang = true;
  }
  if (actor.seeAll) {
    if (actor.sa.length) actor.sa = LOCS.slice();
    if (actor.kabeng.length) actor.kabeng = LOCS.slice();
    if (actor.kadiv.length) actor.kadiv = LOCS.slice();
  }
  return actor;
}

function locOk(list, actor, loc) {
  if (actor.owner || actor.seeAll) return true;
  if (!loc) return false;
  return (list || []).includes(loc);
}

// action: wt_masuk, wt_edit, wt_void, wt_tick, wt_target, wt_revisi, wt_revisi_ok,
// sa_trx, sa_doc, sa_pay, sa_nominal, sa_batal_bayar, sa_serah, sa_konf_jawab, konf_tanya, konf_tutup,
// kat_edit, set_nomor, set_tim, set_source
export function allows(actor, action, ctx = {}) {
  if (!actor) return false;
  const loc = ctx.loc || '';
  const div = ctx.div || '';
  const divOk = actor.owner || !div || actor.divs.includes(div);
  switch (action) {
    case 'set_source':
    case 'set_nomor':
    case 'set_tim':
      return !!actor.owner;
    case 'wt_masuk':
    case 'wt_edit':
    case 'sa_trx':
    case 'sa_doc':
    case 'sa_pay':
    case 'sa_serah':
    case 'sa_konf_jawab':
      return actor.owner || locOk(actor.sa, actor, loc);
    case 'kat_edit':
      return actor.owner || (actor.sa || []).length > 0;
    case 'wt_void':
      return (actor.owner || locOk(actor.sa, actor, loc)) && (actor.owner || !ctx.handed);
    case 'sa_nominal':
      if (ctx.handed && !actor.owner) return false;
      return actor.owner || locOk(actor.sa, actor, loc);
    case 'sa_batal_bayar':
    case 'sa_ubah_jenis':
      return !!actor.owner;
    case 'sa_tgl_bayar':
      return !!actor.owner || (actor.sa || []).length > 0;
    case 'sa_hapus_bayar':
      return actor.owner || locOk(actor.sa, actor, loc);
    case 'wt_tick':
      if (actor.owner || locOk(actor.kabeng, actor, loc)) return true;
      return locOk(actor.kadiv, actor, loc) && divOk;
    case 'wt_target':
    case 'wt_revisi_ok':
      return actor.owner || locOk(actor.kabeng, actor, loc);
    case 'wt_revisi':
      if (actor.owner || locOk(actor.kabeng, actor, loc)) return true;
      return locOk(actor.kadiv, actor, loc) && divOk;
    case 'konf_tanya':
    case 'konf_tutup':
      return !!(actor.owner || actor.finance || actor.gudang || actor.kabeng.length);
    default:
      return false;
  }
}

export function payJumlah(v) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export function nominalProblems(oldBayar, nextBayar, alasan) {
  const problems = [];
  if (String(alasan || '').trim().length < 10) problems.push('Alasan minimal 10 karakter.');
  const next = nextBayar || [];
  if (next.some((p) => payJumlah(p.jumlah) <= 0)) problems.push('Nominal Rp0 ditolak.');
  const key = (p) => p.id || `${p.tgl || ''}|${p.jenis || ''}|${p.inv || ''}`;
  const nextKeys = new Set(next.map(key));
  for (const p of oldBayar || []) {
    if (p.bukti || p.buktiNama) {
      if (!nextKeys.has(key(p))) problems.push('Baris yang sudah ada bukti tidak bisa dihapus.');
    }
  }
  return problems;
}

export const PREVIEW = [
  ['owner', 'Owner', { ...blankActor(), owner: true, name: 'Owner' }],
  ['sa-bsd', 'SA BSD', { ...blankActor(), sa: ['BSD'], name: 'Kenny' }],
  ['sa-legok', 'SA Legok', { ...blankActor(), sa: ['Legok'], name: 'Michael' }],
  ['sa-mks', 'SA Makassar', { ...blankActor(), sa: ['Makassar'], name: 'Gabriel' }],
  ['kb-bsd', 'Kepala Bengkel BSD', { ...blankActor(), kabeng: ['BSD'], name: 'Raka Pratama' }],
  ['kb-all', 'Kepala Bengkel semua lokasi', { ...blankActor(), kabeng: LOCS.slice(), seeAll: true, name: 'Kepala Bengkel' }],
  ['kd-bw', 'Kepala Divisi Bodyworks', { ...blankActor(), kadiv: LOCS.slice(), divs: ['bodyworks'], name: 'Kadiv Bodyworks' }],
  ['kd-ppf', 'Kepala Divisi PPF', { ...blankActor(), kadiv: LOCS.slice(), divs: ['ppf'], name: 'Kadiv PPF' }],
  ['kd-coat', 'Kepala Divisi Coating', { ...blankActor(), kadiv: LOCS.slice(), divs: ['coating'], name: 'Kadiv Coating' }],
  ['kd-ven', 'Kepala Divisi Vendor', { ...blankActor(), kadiv: LOCS.slice(), divs: ['vendor'], name: 'Kadiv Vendor' }],
];
