// Modul HRD (salinan dari aplikasi RMODA HRD di Claude, lihat saja).
// Rumus disalin dari aplikasi: karyawan aktif = status selain "Non Aktif", saldo kasbon, total gaji,
// rapot kehadiran (60% kehadiran + 40% disiplin jam masuk).
// Data uang (gaji, uang makan, kasbon, data pribadi) disimpan dengan level 'edit': hanya HRD dan owner
// yang menerimanya dari database. Bagian itu otomatis tidak tampil bila datanya tidak ada.
// Menu mengikuti aplikasi: Ikhtisar · Rekrutmen (Manual, Request, Calon Karyawan) · Karyawan (Data, Absensi & Lembur,
// KPI per Role) · Penggajian (Struktur & Kenaikan Gaji, Gaji Bulanan, Uang Makan Mingguan, Kasbon, Benefit/BPJS/THR).
// Rumus baru yang disalin: kpiRoleFor, nilai KPI tertimbang, model gaji per jabatan (JABATAN), tarif lembur,
// hitung THR (12 bln ke atas = 1× gaji pokok, di bawahnya prorata), status calon & request rekrutmen.

const LOKASI = ['BSD', 'Legok', 'Makassar'];
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const KEL = ['Tenaga Kerja Langsung', 'Operasional'];
const GCOLS = [['gajiPokok', 'Gaji pokok'], ['uangMakan', 'Uang makan'], ['insentif', 'Insentif'], ['lembur', 'Lembur'], ['reward', 'Reward'], ['potKasbon', 'Pot. kasbon'], ['potLain', 'Pot. lain']];
const JK_DEF = { masuk: '08:30', batas: '08:45', pulang: '17:30', lembur: '18:00' };
const GRADE_MEAN = { A: 'Sangat baik', B: 'Baik', C: 'Cukup, perlu diingatkan', D: 'Perlu perhatian' };
const GRADE_CLS = { A: 'ok', B: 'info', C: 'warn', D: 'bad' };
const REQ_DONE = ['Terpenuhi', 'Ditolak', 'Dibatalkan'];

const pad = (n) => String(n).padStart(2, '0');
const num = (v) => { const n = Number(String(v ?? '').replace(/[^\d.-]/g, '')); return isFinite(n) ? n : 0; };
const rp = (v) => (v < 0 ? '-' : '') + 'Rp' + Math.round(Math.abs(v || 0)).toLocaleString('id-ID');
const rpS = (v) => v ? Math.round(v).toLocaleString('id-ID') : '–';
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const mLabel = (ym) => { if (!ym) return ''; const [y, m] = ym.split('-'); return BULAN[+m - 1] + ' ' + y; };
const dLabel = (iso) => { if (!iso || !/^\d{4}-\d\d-\d\d/.test(iso)) return iso || '–'; const d = new Date(iso.slice(0, 10) + 'T00:00:00'); return d.getDate() + ' ' + BULAN[d.getMonth()].slice(0, 3) + ' ' + d.getFullYear(); };
const fmtDT = (s) => { if (!s) return '—'; const d = new Date(s); return `${d.getDate()} ${BULAN[d.getMonth()].slice(0, 3)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const monthEnd = (ym) => ym + '-' + pad(new Date(+ym.slice(0, 4), +ym.slice(5), 0).getDate());
const toMin = (t) => { const m = /^(\d{1,2})[:.](\d{2})/.exec(String(t || '')); return m ? +m[1] * 60 + +m[2] : null; };
const fmtMin = (m) => m == null ? '' : pad(Math.floor(m / 60)) + ':' + pad(m % 60);
const addMin = (t, n) => { const m = toMin(t); return m == null ? t : fmtMin(m + n); };
const durTxt = (m) => { m = Math.max(0, Math.round(m)); const h = Math.floor(m / 60), mm = m % 60; return ((h ? h + ' jam ' : '') + (mm || !h ? mm + ' mnt' : '')).trim(); };
const pct = (v) => Math.round(v * 100) + '%';
function monthsBetween(iso, refISO) {
  if (!iso) return null; const a = new Date(iso + 'T00:00:00'), b = new Date((refISO || todayISO()) + 'T00:00:00');
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()); if (b.getDate() < a.getDate()) m--; return m;
}
const lamaKerja = (a, b) => { const m = monthsBetween(a, b); if (m == null) return '–'; if (m < 0) return 'baru'; const y = Math.floor(m / 12); return (y ? y + ' th ' : '') + (m % 12) + ' bln'; };
const kelAuto = (e) => ['Coating & Detailing', 'Bodywork', 'PPF'].includes(e.divisi) || /SERVICE ADVISOR|^SA$/.test((e.posisi || '').toUpperCase()) ? KEL[0] : KEL[1];
const kelOf = (e) => (e && KEL.includes(e.kelompok)) ? e.kelompok : kelAuto(e || {});
const rowTotal = (r) => num(r.gajiPokok) + num(r.uangMakan) + num(r.insentif) + num(r.lembur) + num(r.reward) - num(r.potKasbon) - num(r.potLain);
function kasSaldo(k) {
  let s = 0;
  [...(k.entries || [])].sort((a, b) => (a.tgl || '').localeCompare(b.tgl || '')).forEach(en => { s = en.jenis === 'Saldo' ? num(en.jumlah) : s + (en.jenis === 'Kasbon' ? num(en.jumlah) : -num(en.jumlah)); });
  return s;
}
const gradeOf = (s) => s >= 90 ? 'A' : s >= 80 ? 'B' : s >= 70 ? 'C' : 'D';
const statusBadge = (s) => `<span class="badge ${s === 'Aktif' ? 'ok' : s === 'Training' ? 'info' : 'off'}">${s || '–'}</span>`;
const tglMasukTxt = (e) => e.tglMasukISO ? dLabel(e.tglMasukISO) + (e.tglMasukPerkiraan ? ' ±' : '') : (e.tglMasuk && e.tglMasuk !== '-' ? e.tglMasuk : '–');
const umPeriod = (d) => d.periodeDari && d.periodeSampai ? [d.periodeDari, d.periodeSampai] : [d.tanggal, d.tanggal];
const umDocLok = (d) => d.lokasi || (d.payroll === 'Makassar' ? 'Makassar' : 'BSD');
const escH = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isoOf = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const empLok = (e) => !e ? 'BSD' : e.payroll === 'Makassar' || (!e.payroll && e.lokasi === 'Makassar') ? 'Makassar' : e.lokasi === 'Legok' ? 'Legok' : 'BSD';

/* ---------- Struktur gaji (disalin dari aplikasi) ---------- */
// [jabatan, jumlah orang model, gaji min (juta), gaji max (juta)]
const JABATAN = {
  'Coating & Detailing': [['KEPALA BENGKEL', 2, 8, 8.5], ['LEADER POLISHER + TEKNISI', 2, 5.5, 6], ['POLISHER', 4, 4, 4.5], ['HELPER SENIOR / CAPTAIN', 4, 3.8, 3.8], ['HELPER JUNIOR', 4, 3, 3.5], ['INTERIOR DETAILER SENIOR', 1, 5, 5.5], ['INTERIOR DETAILER JUNIOR', 2, 3, 3.5]],
  'Bodywork': [['LEADER BODYWORK + TEKNISI', 1, 10, 11], ['PAINTER SENIOR', 1, 7, 8], ['PAINTER JUNIOR', 2, 5.5, 6], ['LEADER PREP', 1, 5, 5.5], ['HELPER PREP SENIOR', 2, 4, 4.5], ['HELPER PREP JUNIOR', 4, 3, 3.5], ['HELPER DEMPUL', 2, 5, 6], ['POLISHER', 4, 4, 5], ['LEADER BONGKAR PASANG', 1, 9, 9.5], ['HELPER B/P SENIOR', 3, 7, 7.5], ['HELPER B/P JUNIOR', 1, 4.5, 5.5], ['TINTER', 1, 5, 6]],
  'PPF': [['LEADER PPF + TEKNISI', 1, 10, 11], ['TEKNISI PPF SENIOR', 2, 7, 8], ['TEKNISI PPF JUNIOR', 3, 4, 4.5]],
  'Admin & QC': [['SERVICE ADVISOR (SA)', 3, 7.5, 8.5], ['HR', 1, 7.5, 8], ['FINANCE', 1, 6, 6], ['ACCOUNTING', 1, 5, 6], ['ADMIN GUDANG', 3, 3.1, 3.5]],
  'Media': [['LEADER MEDIA', 1, 7, 8], ['JUNIOR MEDIA', 1, 4.5, 5]],
  'Keamanan & Kebersihan': [['SECURITY', 1, 3.1, 3.3], ['OB', 2, 2.5, 2.5]],
  'Direksi': [['DIREKTUR UTAMA', 1, 27, 30], ['DIREKTUR MARKETING', 1, 13.5, 16]],
};
const KEL_S = { 'Tenaga Kerja Langsung': 'TKL', 'Operasional': 'OPS' };
const jabFind = (d, p) => (JABATAN[d] || []).find(j => j[0] === (p || '').toUpperCase());
const jabOk = (e) => !!jabFind(e.divisi, e.posisi);
const jt = (v) => String(v).replace('.', ',');
const jabRangeTxt = (j) => j ? (j[2] === j[3] ? `${jt(j[2])} jt` : `${jt(j[2])}–${jt(j[3])} jt`) : '';
const JENIS_UBAH = ['Kenaikan gaji', 'Penurunan gaji', 'Penyesuaian', 'Lulus training', 'Promosi / pindah posisi'];
const selisih = (a, b) => { a = num(a); b = num(b); if (!a) return b ? 'baru' : ''; const p = (b - a) / a * 100; return (p > 0 ? '+' : '') + p.toFixed(0) + '%'; };

/* Tarif lembur per jam (lemburRate di aplikasi). Tarif dari Pengaturan dipakai bila ada, selain itu tarif awal aplikasi. */
const LEMBUR_KAT = [['kb', 'Kepala bengkel'], ['kd', 'Leader / Senior'], ['staff', 'Staff'], ['training', 'Training'], ['none', 'Tidak ada lembur']];
const LEMBUR_DEF = { kb: 20000, kd: 15000, staff: 10000, training: 10000, none: 0 };
function lemburKatAuto(e) {
  const p = (e.posisi || '').toUpperCase(), d = e.divisi || '';
  if (p.includes('KEPALA BENGKEL')) return 'kb';
  if (p === 'SA' || p.includes('SERVICE ADVISOR') || p.startsWith('HEAD') || p.startsWith('DIREKTUR') || ['Admin & QC', 'Direksi', 'Keamanan & Kebersihan', 'Security', 'Umum (OB)', 'Admin', 'HR', 'Finance', 'Marketing'].includes(d) || p === 'SECURITY' || p === 'OB' || /ADMIN|HRD|FINANCE|LOGISTIC/.test(p)) return 'none';
  if (e.status === 'Training') return 'training';
  if (p.startsWith('LEADER') || p.includes('KEPALA') || (/SENIOR/.test(p) && !/HELPER|INTERIOR/.test(p)) || /DEMPUL|B\/P SENIOR|CAPTAIN/.test(p)) return 'kd';
  return 'staff';
}
const lemburKatLabel = (k) => (LEMBUR_KAT.find(x => x[0] === k) || [k, k])[1];
function lemburRate(S, e) {
  const L = S.pengaturan.lembur || {}, R = { ...LEMBUR_DEF, ...L, none: 0 };
  if (e.lemburKat) return num(R[e.lemburKat]);
  if (e.status === 'Training') return num(R.training);
  if (jabFind(e.divisi, e.posisi)) { const J = L.jab || {}, k = (e.divisi || '') + '|' + (e.posisi || '').toUpperCase(); return k in J ? num(J[k]) : num(R[lemburKatAuto({ divisi: e.divisi, posisi: e.posisi, status: 'Aktif' })]); }
  return num(R[lemburKatAuto(e)]);
}

/* THR: 12 bulan ke atas = 1× gaji pokok, di bawahnya gaji pokok × bulan ÷ 12; harian/tanpa gaji pokok = manual */
function thrCalc(e, ref) {
  const mk = monthsBetween(e.tglMasukISO, ref), gp = num(e.gajiPokok);
  const harian = e.sistemGaji === 'Harian' || !gp;
  const thr = harian ? null : (mk == null ? gp : mk >= 12 ? gp : mk < 1 ? 0 : Math.round(gp * mk / 12));
  return { e, mk, gp, harian, thr };
}

/* ---------- KPI ---------- */
function kpiRoleFor(S, e) {
  if (e.kpiRole && S.kpiT[e.kpiRole]) return e.kpiRole;
  const p = (e.posisi || '').toLowerCase(), d = e.divisi || '';
  const pick = (id) => S.kpiT[id] ? id : '';
  if (p.includes('kepala')) return pick('kepala-bengkel');
  if (p === 'sa') return pick('service-advisor');
  if (d === 'PPF') return pick(p.includes('leader') ? 'leader-ppf' : 'installer-ppf');
  if (d === 'Bodywork') return pick(/paint|tinter|leader/.test(p) ? 'painter-bodywork' : 'helper-bodywork');
  if (d === 'Coating & Detailing' || d === 'Detailing') return pick(/leader|polisher|interior/.test(p) ? 'polisher-detailing' : 'helper-detailing');
  if (p.includes('service advisor')) return pick('service-advisor');
  if (p === 'hr' || p.includes('hrd')) return pick('hrd');
  if (d === 'Admin & QC' || d === 'Admin') return pick(/gudang|logistic/.test(p) ? 'admin-logistik' : 'admin-finance');
  if (d === 'Media') return pick('media');
  if (p === 'security') return pick('security');
  if (p === 'ob') return pick('ob');
  return '';
}
function kpiScore(t, r) {
  if (!r) return null; let s = 0, w = 0;
  (t.indikator || []).forEach((x, i) => { const v = r.skor?.[i]; if (v !== undefined && v !== '') { s += num(v) * num(x.bobot); w += num(x.bobot); } });
  return w ? s / w : null;
}
const kpiGrade = (v) => v == null ? '' : `<span class="badge ${v >= 90 ? 'ok' : v >= 75 ? 'info' : v >= 60 ? 'warn' : 'bad'}">${v >= 90 ? 'A' : v >= 75 ? 'B' : v >= 60 ? 'C' : 'D'} · ${v.toFixed(0)}</span>`;

/* ---------- Rekrutmen & calon karyawan ---------- */
const KSTAT = ['Lamaran masuk', 'Dijadwalkan interview', 'Proses interview', 'Tes praktik', 'Menunggu keputusan', 'Diterima', 'Ditolak', 'Mundur'];
const KSTAT_PROSES = KSTAT.slice(0, 5);
const kChip = (s) => `<span class="badge ${s === 'Diterima' ? 'ok' : ['Ditolak', 'Mundur'].includes(s) ? 'bad' : s === 'Menunggu keputusan' ? 'warn' : 'info'}">${escH(s || '–')}</span>`;
const rChip = (s) => `<span class="badge ${s === 'Terpenuhi' ? 'ok' : ['Ditolak', 'Dibatalkan'].includes(s) ? 'bad' : s === 'Diajukan' ? 'warn' : 'info'}">${escH(s || '–')}</span>`;
const kNextIv = (k, today) => (k.interviews || []).filter(x => x.tgl && x.tgl >= today && (x.hasil || 'Belum') === 'Belum').sort((a, b) => (a.tgl + (a.jam || '')).localeCompare(b.tgl + (b.jam || '')))[0];
const kLastIv = (k) => [...(k.interviews || [])].filter(x => x.tgl).sort((a, b) => (b.tgl + (b.jam || '')).localeCompare(a.tgl + (a.jam || '')))[0];

/* Manual: "## " = subjudul, "- " = poin, **teks** = tebal (sama dengan md() di aplikasi) */
const mdInline = (s) => escH(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
function md(t) {
  const out = []; let list = false;
  String(t || '').split('\n').forEach(line => {
    const l = line.trimEnd();
    if (/^\s*[-•]\s+/.test(l)) { if (!list) { out.push('<ul>'); list = true; } out.push('<li>' + mdInline(l.replace(/^\s*[-•]\s+/, '')) + '</li>'); return; }
    if (list) { out.push('</ul>'); list = false; }
    if (/^##\s+/.test(l)) out.push('<h4>' + mdInline(l.replace(/^##\s+/, '')) + '</h4>');
    else if (l.trim()) out.push('<p>' + mdInline(l) + '</p>');
  });
  if (list) out.push('</ul>'); return out.join('');
}

/* ---------- Data dari portal ---------- */
function loadState(docs) {
  const by = (c) => Object.fromEntries(docs.filter(d => d.coll === c).map(d => [d.id, d.data || {}]));
  const S = { karyawan: by('karyawan'), gajiEmp: by('karyawan_gaji'), absensi: by('absensi'), lembur: by('lembur_jam'), gaji: by('gaji'),
    uangmakan: by('uangmakan'), kasbon: by('kasbon'), rekrutmen: by('rekrutmen'), pengaturan: by('pengaturan'),
    manual: by('manual'), kandidat: by('kandidat'), kandidatGaji: by('kandidat_gaji'), rekGaji: by('rekrutmen_gaji'),
    kpiT: by('kpi_template'), kpiIns: by('kpi_insentif'), kpiNilai: by('kpi_nilai'), thr: by('thr'), pembayaran: by('pembayaran') };
  S.emps = Object.entries(S.karyawan).map(([id, e]) => ({ id, ...e }))
    .sort((a, b) => (a.lokasi || '').localeCompare(b.lokasi || '') || (a.divisi || '').localeCompare(b.divisi || '') || (a.nama || '').localeCompare(b.nama || ''));
  S.hasPay = Object.keys(S.gajiEmp).length > 0 || Object.keys(S.gaji).length > 0;
  return S;
}

/* Rapot kehadiran, sama dengan rapotFor() di aplikasi */
function jkFor(S, e) {
  const J = { ...JK_DEF, ...(S.pengaturan.jamkerja || {}) };
  const jb = (J.jab || {})[(e.posisi || '').toUpperCase()];
  const masuk = e.jkMasuk || (jb && jb.masuk); if (!masuk) return J;
  const src = e.jkMasuk ? { b: e.jkBatas, p: e.jkPulang } : { b: jb.batas, p: jb.pulang };
  return { ...J, masuk, batas: src.b || addMin(masuk, toMin(J.batas) - toMin(J.masuk)), pulang: src.p || J.pulang, khusus: true };
}
function rapotFor(S, e, dari, sampai) {
  const J = jkFor(S, e), M = toMin(J.masuk); const days = [];
  const months = []; let ym = dari.slice(0, 7);
  for (let i = 0; i < 24 && ym <= sampai.slice(0, 7); i++) { months.push(ym); const [y, m] = ym.split('-').map(Number); ym = m === 12 ? (y + 1) + '-01' : y + '-' + pad(m + 1); }
  months.forEach(ym => Object.entries(S.absensi).filter(([k]) => k.startsWith(ym + '_')).forEach(([, d]) => {
    const codes = d.data?.[e.id] || {}, jam = d.jam?.[e.id] || {};
    Object.keys({ ...codes, ...jam }).forEach(dd => {
      const iso = ym + '-' + pad(dd); if (iso < dari || iso > sampai) return; if (days.some(x => x.iso === iso)) return;
      const j = jam[dd] || {}, f = String(j.f || ''); let code = codes[dd] || (j.i ? (j.um ? 'H' : 'T') : '');
      if (!code) return;
      const ti = j.i && !/tidak scan masuk/.test(f) ? toMin(j.i) : null;
      if (J.khusus && ti != null && (code === 'H' || code === 'T')) code = ti > toMin(J.batas) ? 'T' : 'H';
      let tel = 0; if (ti != null && (code === 'H' || code === 'T')) tel = Math.max(0, ti - M); else { const m = /telat (\d+) mnt/.exec(f); if (m) tel = +m[1]; }
      days.push({ iso, code, i: j.i || '', o: j.o || '', tel, noOut: /tidak scan pulang/.test(f), noIn: /tidak scan masuk/.test(f), f });
    });
  }));
  days.sort((a, b) => a.iso.localeCompare(b.iso));
  const n = (c) => days.filter(x => x.code === c).length;
  const hadir = n('H') + n('T'), wajib = days.filter(x => ['H', 'T', 'S', 'I', 'A'].includes(x.code)).length;
  const tepat = days.filter(x => (x.code === 'H' || x.code === 'T') && !x.tel && !x.noIn).length;
  const telatOk = days.filter(x => x.code === 'H' && x.tel > 0).length, telatLewat = n('T');
  const totTel = days.reduce((s, x) => s + (x.code === 'H' || x.code === 'T' ? x.tel : 0), 0);
  const ins = days.filter(x => x.i && !x.noIn && (x.code === 'H' || x.code === 'T')).map(x => toMin(x.i)).filter(v => v != null && v < 720);
  const avgIn = ins.length ? Math.round(ins.reduce((a, b) => a + b, 0) / ins.length) : null;
  let lmMenit = 0; Object.values(S.lembur).forEach(d => (d.rows || []).forEach(r => { if (r.empId === e.id && r.tgl >= dari && r.tgl <= sampai) lmMenit += num(r.menit); }));
  const pHadir = wajib ? hadir / wajib : 0, pTepat = hadir ? tepat / hadir : 0;
  const pDisiplin = hadir ? (tepat + 0.5 * telatOk) / hadir : 0;
  const skor = wajib ? Math.round(pHadir * 60 + pDisiplin * 40) : null;
  return { e, days, wajib, hadir, tepat, telatOk, telatLewat, totTel, avgIn, S: n('S'), I: n('I'), C: n('C'), A: n('A'), noOut: days.filter(x => x.noOut).length, lmMenit, pHadir, pTepat, skor, J };
}
const gradeBadge = (skor) => skor == null ? '<span class="badge off" title="belum ada data absensi">–</span>'
  : `<span class="badge ${GRADE_CLS[gradeOf(skor)]}" title="${GRADE_MEAN[gradeOf(skor)]} · skor ${skor}">${gradeOf(skor)}</span>`;

function trainingList(act) {
  return act.filter(e => e.status === 'Training').map(e => {
    const m = /training\s*(\d+)/i.exec(e.catatan || ''); const months = m ? +m[1] : null;
    let end = null; if (months && e.tglMasukISO) { const d = new Date(e.tglMasukISO + 'T00:00:00'); d.setMonth(d.getMonth() + months); end = d.toISOString().slice(0, 10); }
    return { ...e, end, months };
  }).sort((a, b) => (a.end || '9').localeCompare(b.end || '9'));
}

export async function viewHrd(ctx) {
  const { $, esc, api, setHead } = ctx;
  setHead('HRD', `<span class="badge info">Lihat saja</span>`);
  const view = $('#view');
  view.innerHTML = `<div class="empty"><p class="muted">Memuat data HRD…</p></div>`;
  const [docs, sync] = await Promise.all([api.listDocs('hrd'), api.lastSync('hrd')]);
  const S = loadState(docs);
  if (!S.emps.length) {
    view.innerHTML = `<div class="empty"><h2>Belum ada data yang bisa kamu lihat</h2><p class="muted">Data HRD belum disalin, atau unit kamu tidak punya akses ke HRD.</p></div>`;
    return;
  }
  const today = todayISO(), ym = today.slice(0, 7);
  const locs = LOKASI.filter(l => S.emps.some(e => e.lokasi === l));
  const hasGaji = Object.keys(S.gaji).length > 0, hasUM = Object.keys(S.uangmakan).length > 0, hasKas = Object.keys(S.kasbon).length > 0;
  const hasEmpPay = Object.keys(S.gajiEmp).length > 0;
  const NAV = [
    ['Ikhtisar', [['ringkasan', 'Ringkasan']]],
    ['Rekrutmen', [...(Object.keys(S.manual).length ? [['manual', 'Manual Rekrutmen']] : []), ['rekrutmen', 'Request Rekrutmen'], ['kandidat', 'Calon Karyawan']]],
    ['Karyawan', [['karyawan', 'Data Karyawan'], ['absensi', 'Absensi & Lembur'], ...(Object.keys(S.kpiT).length ? [['kpi', 'KPI per Role']] : [])]],
    ['Penggajian', [...(hasEmpPay ? [['struktur', 'Struktur & Kenaikan Gaji']] : []), ...(hasGaji ? [['gaji', 'Gaji Bulanan']] : []),
      ...(hasUM ? [['um', 'Uang Makan Mingguan']] : []), ...(hasKas ? [['kasbon', 'Kasbon']] : []), ...(hasEmpPay ? [['benefit', 'Benefit, BPJS & THR']] : [])]],
  ].filter(([, items]) => items.length);
  const st = { tab: 'ringkasan', loc: '', kTab: 'aktif', div: '', status: '', q: '', absM: ym, gM: '', umD: '', grade: '',
    manualSec: '', reqF: 'Terbuka', kdF: 'Proses', kpiTab: 'template', kpiRole: '', kpiM: ym, sTab: 'now', rJ: 'Semua', rY: 'Semua',
    benTab: 'bpjs', thrDate: '2027-03-10' };
  // Karyawan + data gaji (hanya ada untuk HRD/owner) digabung, seperti S.karyawan di aplikasi
  const full = (e) => ({ ...e, ...(S.gajiEmp[e.id] || {}), id: e.id, nama: e.nama });
  const head = (title, sub) => `<div class="sa-head"><div><h2>${esc(title)}</h2><p class="muted tiny">${sub}</p></div></div>`;
  const subTabs = (key, items) => `<div class="sa-tabs" role="tablist">${items.map(([k, l]) => `<button role="tab" data-set="${key}:${k}" aria-selected="${st[key] === k}">${esc(l)}</button>`).join('')}</div>`;
  const seg = (key, items, label) => `<div class="wt-seg" role="group" aria-label="${esc(label)}">${items.map(([k, l]) => `<button data-set="${key}:${esc(k)}" aria-pressed="${st[key] === k}">${l}</button>`).join('')}</div>`;
  const gradeCache = {};
  const empGrade = (e) => { if (!(e.id in gradeCache)) { const r = rapotFor(S, e, ym + '-01', monthEnd(ym)); gradeCache[e.id] = r.days.length ? r.skor : null; } return gradeCache[e.id]; };
  const kasOf = (id) => S.kasbon[id] ? kasSaldo(S.kasbon[id]) : 0;
  const empLokOf = (id, fallback) => S.karyawan[id]?.lokasi || fallback || '';
  const inLoc = (l) => !st.loc || l === st.loc;

  view.innerHTML = `
    <div class="wt-sync"><span>Salinan dari aplikasi <b>RMODA HRD</b> di Claude${sync ? ` · diperbarui ${esc(fmtDT(sync.at))}` : ''}.</span>
      <span class="muted">Untuk mengubah data, tetap pakai aplikasi di Claude selama masa transisi.${S.hasPay ? '' : ' Angka gaji, uang makan, dan kasbon hanya tampil untuk HRD dan owner.'}</span></div>
    <div class="wt-bar">
      <nav class="sa-nav hr-nav" aria-label="Menu HRD">${NAV.map(([g, items]) => `<div class="sa-navg"><span class="sa-navh">${esc(g)}</span>${items.map(([k, l]) => `<button data-tab="${k}" aria-pressed="${k === st.tab}">${esc(l)}</button>`).join('')}</div>`).join('')}</nav>
      ${locs.length > 1 ? `<div class="wt-seg" role="group" aria-label="Lokasi"><button data-loc="" aria-pressed="true">Semua lokasi</button>${locs.map(l => `<button data-loc="${l}" aria-pressed="false">${l}</button>`).join('')}</div>` : ''}
    </div>
    <div id="wt"></div>`;

  /* ---------- Ringkasan ---------- */
  function drawSummary() {
    const all = S.emps.filter(e => inLoc(e.lokasi)), act = all.filter(e => e.status !== 'Non Aktif');
    const eks = all.filter(e => e.status === 'Non Aktif');
    const perLoc = locs.map(l => `${l} ${act.filter(e => e.lokasi === l).length}`).join(' · ');
    const gDocs = Object.values(S.gaji).filter(g => inLoc(g.lokasi));
    const last = gDocs.map(g => g.bulan).sort().pop();
    const lastTot = gDocs.filter(g => g.bulan === last).reduce((s, g) => s + (g.rows || []).reduce((a, r) => a + num(r.total), 0), 0);
    const kas = Object.entries(S.kasbon).filter(([id, k]) => !k.arsip && inLoc(empLokOf(k.empId || id, k.payroll === 'Makassar' ? 'Makassar' : 'BSD')));
    const kasTot = kas.reduce((s, [, k]) => s + Math.max(0, kasSaldo(k)), 0);
    const open = Object.values(S.rekrutmen).filter(r => !REQ_DONE.includes(r.status) && inLoc(r.lokasi));
    const need = open.reduce((s, r) => s + num(r.jumlah), 0);
    const left = eks.filter(e => e.tglKeluar).sort((a, b) => b.tglKeluar.localeCompare(a.tglKeluar)).slice(0, 10);
    const divs = [...new Set(act.map(e => e.divisi).filter(Boolean))].sort();
    const L = st.loc ? [st.loc] : locs;
    const training = trainingList(act);
    const tiles = [
      ['Karyawan aktif', act.length, st.loc ? 'termasuk training' : perLoc, ''],
      ['Masa training', act.filter(e => e.status === 'Training').length, 'belum karyawan tetap', 'info'],
      ['Eks karyawan', eks.length, `${eks.filter(e => (e.tglKeluar || '') >= today.slice(0, 4) + '-01-01').length} keluar sepanjang ${today.slice(0, 4)}`, ''],
      ...(last ? [[`Total gaji ${mLabel(last)}`, rp(lastTot), gDocs.filter(g => g.bulan === last).some(g => g.status !== 'Dibayar') ? 'masih draft' : 'sudah dibayar', 'ok']] : []),
      ...(hasKas ? [['Kasbon berjalan', rp(kasTot), `${kas.filter(([, k]) => kasSaldo(k) > 0).length} orang masih ada sisa`, 'warn']] : []),
      ['Kebutuhan orang', need, `dari ${open.length} request rekrutmen terbuka`, need ? 'warn' : ''],
    ];
    $('#wt').innerHTML = `
      <div class="wt-stats">${tiles.map(([l, n, s, t]) => `<div class="wt-stat ${t}"><small>${l}</small><b>${n}</b><span>${esc(s)}</span></div>`).join('')}</div>
      <h2 class="wt-h">Komposisi karyawan aktif</h2>
      <div class="tablewrap"><table class="tbl"><thead><tr><th>Divisi</th>${L.map(l => `<th>${l}</th>`).join('')}<th>Total</th></tr></thead><tbody>
        ${divs.map(d => `<tr><td>${esc(d)}</td>${L.map(l => `<td>${act.filter(e => e.divisi === d && e.lokasi === l).length || '–'}</td>`).join('')}<td><b>${act.filter(e => e.divisi === d).length}</b></td></tr>`).join('')}
        ${KEL.map(k => `<tr><td class="muted">${k}</td>${L.map(l => `<td class="muted">${act.filter(e => kelOf(e) === k && e.lokasi === l).length || '–'}</td>`).join('')}<td class="muted">${act.filter(e => kelOf(e) === k).length}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="note">Tenaga kerja langsung = semua teknisi (Coating &amp; Detailing, Bodywork, PPF) dan SA. Sisanya operasional.</p>
      <h2 class="wt-h">Baru keluar</h2>
      <div class="tablewrap"><table class="tbl wt-tbl"><thead><tr><th>Nama</th><th>Posisi terakhir</th><th>Lokasi</th><th>Keluar</th><th>Lama kerja</th><th>Alasan</th></tr></thead><tbody>
        ${left.map(e => `<tr data-emp="${esc(e.id)}" tabindex="0"><td><b>${esc(e.nama)}</b></td><td>${esc(e.posisi || '–')}<br><small class="muted">${esc(e.divisi || '')}</small></td><td>${esc(e.lokasi || '')}</td>
          <td><small>${esc(dLabel(e.tglKeluar))}${e.tglKeluarPerkiraan ? ' ±' : ''}</small></td><td><small>${esc(lamaKerja(e.tglMasukISO, e.tglKeluar))}</small></td><td><small>${esc(e.alasanKeluar || '–')}</small></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Belum ada yang keluar.</td></tr>'}
      </tbody></table></div>
      <h2 class="wt-h">Training yang perlu dievaluasi (${training.length})</h2>
      <div class="tablewrap"><table class="tbl wt-tbl"><thead><tr><th>Nama</th><th>Posisi</th><th>Lokasi</th><th>Masuk</th><th>Selesai training</th></tr></thead><tbody>
        ${training.map(e => `<tr data-emp="${esc(e.id)}" tabindex="0"><td><b>${esc(e.nama)}</b></td><td>${esc(e.posisi || '–')}</td><td>${esc(e.lokasi || '')}</td><td><small>${esc(tglMasukTxt(e))}</small></td>
          <td>${e.end ? (e.end < today ? `<span class="badge warn">${esc(dLabel(e.end))} · lewat</span>` : `<small>${esc(dLabel(e.end))}</small>`) : '<small class="muted">durasi belum dicatat</small>'}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Tidak ada karyawan training.</td></tr>'}
      </tbody></table></div>
      <h2 class="wt-h">Request rekrutmen terbuka (${open.length})</h2>
      <div class="tablewrap"><table class="tbl"><thead><tr><th>Posisi</th><th>Divisi</th><th>Lokasi</th><th>Jumlah</th><th>Target masuk</th><th>Pemohon</th><th>Status</th></tr></thead><tbody>
        ${open.map(r => `<tr><td><b>${esc(r.posisi || '')}</b>${r.alasan ? `<br><small class="muted">${esc(r.alasan)}</small>` : ''}</td><td>${esc(r.divisi || '')}</td><td>${esc(r.lokasi || '')}</td><td>${num(r.jumlah) || 1}</td>
          <td><small>${esc(dLabel(r.targetMasuk))}</small>${r.targetMasuk && r.targetMasuk < today ? ' <span class="badge bad">lewat</span>' : ''}</td><td><small>${esc(r.pemohon || '')}</small></td><td><span class="badge info">${esc(r.status || '')}</span></td></tr>`).join('') || '<tr><td colspan="7" class="muted">Belum ada request.</td></tr>'}
      </tbody></table></div>`;
  }

  /* ---------- Data karyawan ---------- */
  function drawEmps() {
    const eks = st.kTab === 'eks', q = st.q.trim().toLowerCase();
    const base = S.emps.filter(e => eks ? e.status === 'Non Aktif' : e.status !== 'Non Aktif').filter(e => inLoc(e.lokasi));
    const divs = [...new Set(base.map(e => e.divisi).filter(Boolean))].sort();
    if (st.div && !divs.includes(st.div)) st.div = '';
    const list = base.filter(e => (!st.div || e.divisi === st.div) && (eks || !st.status || e.status === st.status)
      && (!q || `${e.nama} ${e.panggilan || ''} ${e.posisi || ''}`.toLowerCase().includes(q)))
      .sort((a, b) => eks ? (b.tglKeluar || '').localeCompare(a.tglKeluar || '') : 0);
    const nA = S.emps.filter(e => e.status !== 'Non Aktif' && inLoc(e.lokasi)).length, nE = S.emps.filter(e => e.status === 'Non Aktif' && inLoc(e.lokasi)).length;
    $('#wt').innerHTML = `
      <div class="toolbar">
        <div class="wt-seg" role="group" aria-label="Status karyawan"><button data-ktab="aktif" aria-pressed="${!eks}">Karyawan aktif ${nA}</button><button data-ktab="eks" aria-pressed="${eks}">Eks karyawan ${nE}</button></div>
        <select class="inp inp--s" id="hrDiv" aria-label="Divisi"><option value="">Semua divisi</option>${divs.map(d => `<option ${d === st.div ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select>
        ${eks ? '' : `<select class="inp inp--s" id="hrSt" aria-label="Status">${[['', 'Aktif + training'], ['Aktif', 'Aktif saja'], ['Training', 'Training saja']].map(([v, l]) => `<option value="${v}" ${st.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`}
        <input class="inp" id="hrQ" placeholder="Cari nama, panggilan, posisi" value="${esc(st.q)}" aria-label="Cari karyawan">
      </div>
      <p class="lead">${list.length} orang</p>
      <div class="tablewrap"><table class="tbl wt-tbl">${eks
        ? `<thead><tr><th>Nama</th><th>Posisi terakhir</th><th>Lokasi</th><th>Masuk</th><th>Keluar</th><th>Lama kerja</th><th>Alasan keluar</th>${hasKas ? '<th>Sisa kasbon</th>' : ''}</tr></thead><tbody>
          ${list.map(e => { const k = kasOf(e.id); return `<tr data-emp="${esc(e.id)}" tabindex="0"><td><b>${esc(e.nama)}</b></td><td>${esc(e.posisi || '–')}<br><small class="muted">${esc(e.divisi || '')}</small></td><td>${esc(e.lokasi || '')}</td>
            <td><small>${esc(tglMasukTxt(e))}</small></td><td><small>${e.tglKeluar ? esc(dLabel(e.tglKeluar)) + (e.tglKeluarPerkiraan ? ' ±' : '') : '<span class="muted">sebelum 2026</span>'}</small></td>
            <td><small>${e.tglKeluar ? esc(lamaKerja(e.tglMasukISO, e.tglKeluar)) : '–'}</small></td><td><small>${esc(e.alasanKeluar || '–')}</small></td>${hasKas ? `<td>${k > 0 ? `<span class="badge warn">${rpS(k)}</span>` : '–'}</td>` : ''}</tr>`; }).join('') || `<tr><td colspan="8" class="muted">Tidak ada eks karyawan dengan filter ini.</td></tr>`}</tbody>`
        : `<thead><tr><th>Nama</th><th>Posisi</th><th>Lokasi</th><th>Status</th><th>Masuk</th><th>Masa kerja</th><th title="Nilai kehadiran bulan ini">Kehadiran</th><th>No HP</th></tr></thead><tbody>
          ${list.map(e => `<tr data-emp="${esc(e.id)}" tabindex="0"><td><b>${esc(e.nama)}</b>${e.panggilan ? `<br><small class="muted">${esc(e.panggilan)}</small>` : ''}</td>
            <td>${esc(e.posisi || '–')}<br><small class="muted">${esc(e.divisi || '')}</small></td><td>${esc(e.lokasi || '')}</td><td>${statusBadge(e.status)}</td>
            <td><small>${esc(tglMasukTxt(e))}</small></td><td><small>${esc(lamaKerja(e.tglMasukISO))}</small></td><td>${gradeBadge(empGrade(e))}</td><td><small>${esc(e.hp || '–')}</small></td></tr>`).join('') || `<tr><td colspan="8" class="muted">Tidak ada karyawan dengan filter ini.</td></tr>`}</tbody>`}
      </table></div>
      ${eks ? '<p class="note">± = tanggal perkiraan (dari pembayaran terakhir).</p>' : ''}`;
    $('#hrDiv').onchange = (e) => { st.div = e.target.value; drawEmps(); };
    const s = $('#hrSt'); if (s) s.onchange = (e) => { st.status = e.target.value; drawEmps(); };
    bindSearch('hrQ', drawEmps);
  }

  function openEmp(id) {
    const e = S.emps.find(x => x.id === id); if (!e) return;
    const p = S.gajiEmp[id];
    const r = rapotFor(S, e, ym + '-01', monthEnd(ym));
    const hist = [];
    Object.values(S.gaji).forEach(g => (g.rows || []).forEach(x => { if (x.empId === id) hist.push({ bulan: g.bulan, ...x }); }));
    hist.sort((a, b) => b.bulan.localeCompare(a.bulan));
    const kas = S.kasbon[id];
    const riw = [...(p?.riwayat || [])].sort((a, b) => (b.tgl || '').localeCompare(a.tgl || ''));
    const tf = {}, thrH = [];
    Object.values(S.pembayaran).forEach(d => (d.rows || []).forEach(r => { if (r.empId !== id || !r.tgl) return; const m = r.tgl.slice(0, 7); const t = tf[m] = tf[m] || { gaji: 0, um: 0, kas: 0, thr: 0, n: 0 };
      if (r.kategori === 'Uang Makan') { t.um += num(r.jumlah); t.n++; } else if (r.kategori === 'Kasbon') t.kas += num(r.jumlah); else if (r.kategori === 'Thr') t.thr += num(r.jumlah); else t.gaji += num(r.jumlah); }));
    Object.values(S.thr).forEach(d => (d.rows || []).forEach(r => { if (r.empId === id) thrH.push({ tahun: d.tahun, ...r }); }));
    const tfM = Object.keys(tf).sort();
    openDlg(`<div class="dlg">
      <div class="wt-dh"><div><span class="muted tiny">${esc(e.divisi || '')} · ${esc(e.lokasi || '')}</span><h2>${esc(e.nama)}${e.panggilan ? ` <span class="muted">(${esc(e.panggilan)})</span>` : ''}</h2></div><button class="iconbtn" data-close aria-label="Tutup">×</button></div>
      <div class="wt-facts">
        <div><small>Posisi</small><b>${esc(e.posisi || '–')}</b><span class="muted">${esc(kelOf(e))}</span></div>
        <div><small>Status</small>${statusBadge(e.status)}</div>
        <div><small>Masuk</small><b>${esc(tglMasukTxt(e))}</b><span class="muted">${esc(lamaKerja(e.tglMasukISO, e.tglKeluar))}</span></div>
        ${e.tglKeluar ? `<div><small>Keluar</small><b>${esc(dLabel(e.tglKeluar))}${e.tglKeluarPerkiraan ? ' ±' : ''}</b><span class="muted">${esc(e.alasanKeluar || '')}</span></div>` : ''}
        <div><small>No HP</small><b>${esc(e.hp || '–')}</b></div>
        ${e.status !== 'Non Aktif' ? `<div><small>Kehadiran ${esc(mLabel(ym))}</small>${gradeBadge(r.days.length ? r.skor : null)}<span class="muted">${r.days.length ? `hadir ${r.hadir}/${r.wajib} · alpa ${r.A}` : 'belum ada data'}</span></div>` : ''}
      </div>
      ${e.catatan || e.catatanKeluar ? `<p class="note">${esc([e.catatan, e.catatanKeluar].filter(Boolean).join(' · '))}</p>` : ''}
      ${e.peranTambahan ? `<p class="note">Peran tambahan: ${esc(e.peranTambahan)}</p>` : ''}
      ${(e.cekData || []).length ? `<h3>Perlu dicek HRD</h3><ul class="wt-items">${e.cekData.map(c => `<li><span class="badge warn">cek</span> ${esc(c)}</li>`).join('')}</ul>` : ''}
      ${p ? `<h3>Gaji &amp; data pribadi <span class="muted tiny">· hanya HRD &amp; owner</span></h3>
      <div class="wt-facts">
        <div><small>Sistem gaji</small><b>${esc(p.sistemGaji || '–')}</b></div>
        <div><small>Gaji pokok</small><b>${p.gajiPokok ? rp(p.gajiPokok) : '–'}</b></div>
        <div><small>Uang makan / hari</small><b>${p.uangMakanHarian ? rp(p.uangMakanHarian) : '–'}</b><span class="muted">${esc(p.uangMakanCara || '')}</span></div>
        <div><small>Insentif</small><b>${esc(p.insentifSkema || '–')}</b></div>
        <div><small>NIK</small><b>${esc(p.nik || '–')}</b></div>
        <div><small>Rekening</small><b>${esc(p.rekening || '–')}</b></div>
        <div><small>BPJS Kes / TK</small><b>${esc(p.bpjsKes || '–')} / ${esc(p.bpjsTK || '–')}</b></div>
        <div><small>Domisili</small><span>${esc(p.domisili || '–')}</span></div>
      </div>` : ''}
      ${riw.length ? `<h3>Riwayat perubahan</h3><ul class="wt-log">${riw.map(x => `<li><small class="muted">${esc(dLabel(x.tgl))}${x.perkiraan ? ' ±' : ''} · ${esc(x.jenis || '')}</small><span>${x.gpKe != null ? `Gaji pokok ${rpS(x.gpDari)} → <b>${rpS(x.gpKe)}</b>` : ''}${x.sistemKe && x.sistemKe !== x.sistemDari ? ` · ${esc(x.sistemDari || '–')} → ${esc(x.sistemKe)}` : ''}${x.posisiKe ? ` · posisi ${esc(x.posisiDari || '–')} → ${esc(x.posisiKe)}` : ''}${x.catatan ? ` <span class="muted">${esc(x.catatan)}</span>` : ''}</span></li>`).join('')}</ul>` : ''}
      ${hist.length ? `<h3>Gaji per bulan</h3><div class="tablewrap"><table class="tbl"><thead><tr><th>Bulan</th>${GCOLS.map(c => `<th>${c[1]}</th>`).join('')}<th>Total</th></tr></thead><tbody>
        ${hist.map(x => `<tr><td>${esc(mLabel(x.bulan))}</td>${GCOLS.map(c => `<td>${rpS(x[c[0]])}</td>`).join('')}<td><b>${rpS(rowTotal(x))}</b></td></tr>`).join('')}</tbody></table></div>` : ''}
      ${kas ? `<h3>Kasbon · sisa ${rp(kasSaldo(kas))}${kas.cicilanPerBulan ? ` <span class="muted tiny">· cicilan ${rp(kas.cicilanPerBulan)}/bulan</span>` : ''}</h3>
        <ul class="wt-log">${[...(kas.entries || [])].sort((a, b) => (b.tgl || '').localeCompare(a.tgl || '')).map(x => `<li><small class="muted">${esc(dLabel(x.tgl))} · ${esc(x.jenis)}</small><span><b>${rp(x.jumlah)}</b> ${esc(x.ket || '')}</span></li>`).join('')}</ul>` : ''}
      ${thrH.length ? `<h3>THR</h3><div class="tablewrap"><table class="tbl"><tbody>${thrH.map(x => `<tr><td>THR ${esc(x.tahun)}</td><td><b>${rpS(x.total)}</b></td></tr>`).join('')}</tbody></table></div>` : ''}
      ${tfM.length ? `<h3>Transfer dari rekening gaji (mutasi bank)</h3><div class="tablewrap"><table class="tbl"><thead><tr><th>Bulan</th><th>Gaji / insentif / lembur</th><th>Uang makan</th><th>× transfer UM</th><th>Kasbon diberikan</th><th>THR</th></tr></thead><tbody>
        ${tfM.map(m => { const x = tf[m]; return `<tr><td>${esc(mLabel(m))}</td><td>${rpS(x.gaji)}</td><td>${rpS(x.um)}</td><td>${x.n || '–'}</td><td>${rpS(x.kas)}</td><td>${rpS(x.thr)}</td></tr>`; }).join('')}</tbody></table></div>
        <p class="note">Sebagian uang makan dibayar tunai lewat Finance, jadi tidak semua muncul di mutasi per nama.</p>` : ''}
    </div>`);
  }
  function openDlg(html) {
    const dlg = $('#dlg'); dlg.classList.add('dlg--wide');
    dlg.innerHTML = html;
    dlg.onclick = (ev) => {
      if (ev.target === dlg || ev.target.closest('[data-close]')) return dlg.close();
      const t = ev.target.closest('[data-emp],[data-kd],[data-req]'); if (!t) return;
      if (t.dataset.emp) openEmp(t.dataset.emp); else if (t.dataset.kd) openKd(t.dataset.kd); else openReq(t.dataset.req);
    };
    dlg.onkeydown = (ev) => { const d = ev.target.dataset || {}; if (ev.key === 'Enter' && (d.emp || d.kd || d.req)) ev.target.click(); };
    dlg.onclose = () => dlg.classList.remove('dlg--wide');
    if (!dlg.open) dlg.showModal();
  }

  /* ---------- Kehadiran ---------- */
  function drawAbs() {
    const months = [...new Set([ym, ...Object.values(S.absensi).map(d => d.bulan).filter(Boolean)])].sort().reverse();
    const a = st.absM + '-01', b = monthEnd(st.absM);
    const scope = S.emps.filter(e => e.status !== 'Non Aktif' && inLoc(e.lokasi));
    const list = scope.map(e => rapotFor(S, e, a, b)).filter(r => r.days.length).sort((x, y) => (x.skor ?? 999) - (y.skor ?? 999));
    const g = (k) => list.filter(r => r.skor != null && gradeOf(r.skor) === k).length;
    const shown = st.grade ? list.filter(r => r.skor != null && gradeOf(r.skor) === st.grade) : list;
    const avg = (f) => list.length ? pct(list.reduce((s, r) => s + f(r), 0) / list.length) : '–';
    $('#wt').innerHTML = `
      <div class="toolbar"><select class="inp inp--s" id="hrAbsM" aria-label="Bulan">${months.map(m => `<option value="${m}" ${m === st.absM ? 'selected' : ''}>${mLabel(m)}</option>`).join('')}</select>
        <span class="muted">${list.length} karyawan ada datanya${scope.length - list.length > 0 ? ` · ${scope.length - list.length} tanpa data` : ''}</span></div>
      <div class="wt-stats">
        <div class="wt-stat"><small>Rata-rata kehadiran</small><b>${avg(r => r.pHadir)}</b><span>tepat waktu ${avg(r => r.pTepat)}</span></div>
        <div class="wt-stat bad"><small>Total alpa</small><b>${list.reduce((s, r) => s + r.A, 0)}</b><span>hari</span></div>
        <div class="wt-stat warn"><small>Total telat</small><b>${list.reduce((s, r) => s + r.telatOk + r.telatLewat, 0)}×</b><span>${esc(durTxt(list.reduce((s, r) => s + r.totTel, 0)))} keterlambatan</span></div>
      </div>
      <div class="wt-seg" role="group" aria-label="Nilai"><button data-grade="" aria-pressed="${!st.grade}">Semua nilai</button>${['A', 'B', 'C', 'D'].map(k => `<button data-grade="${k}" aria-pressed="${st.grade === k}">${k} · ${GRADE_MEAN[k]} <span class="muted">${g(k)}</span></button>`).join('')}</div>
      <div class="tablewrap"><table class="tbl wt-tbl"><thead><tr><th>Nilai</th><th>Nama</th><th>Lokasi</th><th>Hadir / wajib</th><th>Tepat waktu</th><th>Telat (dapat UM)</th><th>Telat lewat batas</th><th>Total telat</th><th>Rata² masuk</th><th>S / I / C</th><th>Alpa</th><th>Lupa scan pulang</th><th>Lembur</th></tr></thead><tbody>
        ${shown.map(r => `<tr data-emp="${esc(r.e.id)}" tabindex="0"><td>${gradeBadge(r.skor)} <small class="muted">${r.skor ?? ''}</small></td><td><b>${esc(r.e.nama)}</b><br><small class="muted">${esc(r.e.posisi || '')}</small></td><td>${esc(r.e.lokasi || '')}</td>
          <td>${r.hadir} / ${r.wajib}</td><td>${r.tepat} <small class="muted">${r.hadir ? pct(r.pTepat) : ''}</small></td><td>${r.telatOk || '–'}</td><td>${r.telatLewat ? `<span class="badge bad">${r.telatLewat}</span>` : '–'}</td>
          <td><small>${r.totTel ? esc(durTxt(r.totTel)) : '–'}</small></td><td>${r.avgIn != null ? fmtMin(r.avgIn) : '–'}</td><td>${r.S} / ${r.I} / ${r.C}</td><td>${r.A ? `<span class="badge bad">${r.A}</span>` : '–'}</td><td>${r.noOut || '–'}</td><td><small>${r.lmMenit ? esc(durTxt(r.lmMenit)) : '–'}</small></td></tr>`).join('')
          || '<tr><td colspan="13" class="muted">Belum ada data absensi di bulan ini.</td></tr>'}
      </tbody></table></div>
      <p class="note">Nilai = 60% kehadiran (hadir ÷ hari wajib; cuti &amp; libur tidak dihitung) + 40% disiplin jam masuk (tepat waktu = poin penuh, telat masih dalam batas = setengah poin, telat lewat batas = 0). A ≥ 90, B ≥ 80, C ≥ 70, D di bawahnya. Sama dengan rapot di aplikasi HRD.</p>`;
    $('#hrAbsM').onchange = (e) => { st.absM = e.target.value; drawAbs(); };
  }

  /* ---------- Gaji bulanan ---------- */
  function drawGaji() {
    const docsL = Object.entries(S.gaji).filter(([, g]) => inLoc(g.lokasi));
    const months = [...new Set(docsL.map(([, g]) => g.bulan))].sort().reverse();
    if (!months.includes(st.gM)) st.gM = months[0] || '';
    const sel = docsL.filter(([, g]) => g.bulan === st.gM).sort((a, b) => LOKASI.indexOf(a[1].lokasi) - LOKASI.indexOf(b[1].lokasi));
    const rows = sel.flatMap(([, g]) => (g.rows || []).map(r => ({ ...r, _lok: g.lokasi })));
    const T = (k) => rows.reduce((s, r) => s + num(r[k]), 0), tot = rows.reduce((s, r) => s + rowTotal(r), 0);
    const trend = months.slice(0, 6).reverse().map(m => [m, docsL.filter(([, g]) => g.bulan === m).reduce((s, [, g]) => s + (g.rows || []).reduce((a, r) => a + rowTotal(r), 0), 0)]);
    $('#wt').innerHTML = `
      <div class="toolbar"><select class="inp inp--s" id="hrGM" aria-label="Bulan">${months.map(m => `<option value="${m}" ${m === st.gM ? 'selected' : ''}>${mLabel(m)}</option>`).join('')}</select>
        ${sel.map(([, g]) => `<span class="badge ${g.status === 'Dibayar' ? 'ok' : 'warn'}">${esc(g.lokasi)}: ${g.status === 'Dibayar' ? 'Dibayar' : 'Draft'}</span>`).join(' ')}</div>
      <div class="wt-stats">
        <div class="wt-stat ok"><small>Total gaji ${esc(mLabel(st.gM))}</small><b>${rp(tot)}</b><span>${rows.length} orang</span></div>
        ${sel.map(([, g]) => { const rr = g.rows || []; return `<div class="wt-stat"><small>${esc(g.lokasi)}</small><b>${rp(rr.reduce((s, r) => s + rowTotal(r), 0))}</b><span>${rr.length} orang</span></div>`; }).join('')}
        ${KEL.map(k => { const rr = rows.filter(r => kelOf(S.karyawan[r.empId] || { divisi: r.divisi, posisi: r.posisi }) === k); return `<div class="wt-stat info"><small>${k}</small><b>${rp(rr.reduce((s, r) => s + rowTotal(r), 0))}</b><span>${rr.length} orang</span></div>`; }).join('')}
        <div class="wt-stat warn"><small>Potongan kasbon</small><b>${rp(T('potKasbon'))}</b><span>dipotong dari gaji</span></div>
      </div>
      ${trend.length > 1 ? `<h2 class="wt-h">Total gaji 6 bulan terakhir</h2><div class="card wt-load">${(() => { const max = Math.max(1, ...trend.map(t => t[1])); return trend.map(([m, v]) => `<div class="wt-meter"><span>${esc(mLabel(m))}</span><i><b style="width:${v / max * 100}%"></b></i><em style="min-width:110px">${rpS(v)}</em></div>`).join(''); })()}</div>` : ''}
      <h2 class="wt-h">Rincian per orang</h2>
      <div class="tablewrap"><table class="tbl wt-tbl"><thead><tr><th>Nama / jabatan</th>${st.loc ? '' : '<th>Lokasi</th>'}${GCOLS.map(c => `<th>${c[1]}</th>`).join('')}<th>Total gaji</th><th>Ket.</th></tr></thead><tbody>
        ${rows.map(r => `<tr ${r.empId && S.karyawan[r.empId] ? `data-emp="${esc(r.empId)}" tabindex="0"` : ''}><td><b>${esc(r.nama || '')}</b>${r.sistem === 'Harian' ? ' <span class="badge warn">harian</span>' : ''}<br><small class="muted">${esc([r.posisi, r.divisi].filter(Boolean).join(' · ') || '–')}</small></td>
          ${st.loc ? '' : `<td>${esc(r._lok)}</td>`}${GCOLS.map(c => `<td>${rpS(r[c[0]])}</td>`).join('')}<td><b>${rpS(rowTotal(r))}</b></td><td><small>${esc(r.ket || '')}</small></td></tr>`).join('') || '<tr><td colspan="11" class="muted">Belum ada data gaji.</td></tr>'}
      </tbody><tfoot><tr><td><b>Total</b></td>${st.loc ? '' : '<td></td>'}${GCOLS.map(c => `<td><b>${rpS(T(c[0]))}</b></td>`).join('')}<td><b>${rpS(tot)}</b></td><td></td></tr></tfoot></table></div>`;
    $('#hrGM').onchange = (e) => { st.gM = e.target.value; drawGaji(); };
  }

  /* ---------- Uang makan mingguan ---------- */
  function drawUM() {
    const docsL = Object.entries(S.uangmakan).filter(([, d]) => inLoc(umDocLok(d)));
    const dates = [...new Set(docsL.map(([, d]) => d.tanggal).filter(Boolean))].sort().reverse();
    if (!dates.includes(st.umD)) st.umD = dates[0] || '';
    const sel = docsL.filter(([, d]) => d.tanggal === st.umD).sort((a, b) => LOKASI.indexOf(umDocLok(a[1])) - LOKASI.indexOf(umDocLok(b[1])));
    const rows = sel.flatMap(([, d]) => (d.rows || []).map(r => ({ ...r, _lok: umDocLok(d) })));
    const tot = rows.reduce((s, r) => s + num(r.jumlah), 0);
    const [pd, ps] = sel[0] ? umPeriod(sel[0][1]) : ['', ''];
    const name = (r) => r.empId ? (S.karyawan[r.empId]?.nama || r.nama) : r.nama;
    const hari = (iso) => iso ? HARI[new Date(iso + 'T00:00:00').getDay()] + ', ' + dLabel(iso) : '';
    $('#wt').innerHTML = `
      <div class="toolbar"><select class="inp inp--s" id="hrUM" aria-label="Tanggal bayar">${dates.map(d => `<option value="${d}" ${d === st.umD ? 'selected' : ''}>Bayar ${esc(hari(d))}</option>`).join('')}</select>
        ${pd ? `<span class="muted">Periode ${esc(dLabel(pd))} – ${esc(dLabel(ps))}</span>` : ''}</div>
      <div class="wt-stats">
        <div class="wt-stat ok"><small>Total dibayar</small><b>${rp(tot)}</b><span>${rows.filter(r => num(r.jumlah) > 0).length} orang dibayar</span></div>
        ${sel.map(([, d]) => { const rr = d.rows || []; return `<div class="wt-stat"><small>${esc(umDocLok(d))}</small><b>${rp(rr.reduce((s, r) => s + num(r.jumlah), 0))}</b><span>${rr.filter(r => num(r.jumlah) > 0).length} orang · ${rr.reduce((s, r) => s + num(r.hari), 0)} hari-orang</span></div>`; }).join('')}
        <div class="wt-stat warn"><small>Koreksi</small><b>${rows.reduce((s, r) => s + num(r.koreksi), 0) ? rp(rows.reduce((s, r) => s + num(r.koreksi), 0)) : '–'}</b><span>${rows.filter(r => num(r.koreksi)).length} orang dikoreksi · ${rows.filter(r => r.manual).length} diubah manual</span></div>
      </div>
      <div class="tablewrap"><table class="tbl wt-tbl"><thead><tr><th>Nama</th>${st.loc ? '' : '<th>Lokasi</th>'}<th>Hari</th><th>Uang makan / hari</th><th>Potongan</th><th>Koreksi</th><th>Jumlah</th><th>Ket.</th></tr></thead><tbody>
        ${rows.map(r => `<tr ${r.empId && S.karyawan[r.empId] ? `data-emp="${esc(r.empId)}" tabindex="0"` : ''}><td><b>${esc(name(r) || '')}</b></td>${st.loc ? '' : `<td>${esc(r._lok)}</td>`}<td>${num(r.hari)}</td><td>${rpS(r.rate)}</td><td>${rpS(r.potongan)}</td><td>${rpS(r.koreksi)}</td>
          <td><b>${rpS(r.jumlah)}</b>${r.manual ? ' <span class="badge warn">manual</span>' : ''}</td><td><small>${esc([r.cara, r.ket].filter(Boolean).join(' · '))}</small></td></tr>`).join('') || '<tr><td colspan="8" class="muted">Belum ada daftar uang makan.</td></tr>'}
      </tbody><tfoot><tr><td><b>Total</b></td>${st.loc ? '' : '<td></td>'}<td><b>${rows.reduce((s, r) => s + num(r.hari), 0)}</b></td><td></td><td>${rpS(rows.reduce((s, r) => s + num(r.potongan), 0))}</td><td>${rpS(rows.reduce((s, r) => s + num(r.koreksi), 0))}</td><td><b>${rpS(tot)}</b></td><td></td></tr></tfoot></table></div>`;
    $('#hrUM').onchange = (e) => { st.umD = e.target.value; drawUM(); };
  }

  /* ---------- Kasbon ---------- */
  function drawKas() {
    const all = Object.entries(S.kasbon).map(([id, k]) => ({ id, ...k, s: kasSaldo(k), lok: empLokOf(k.empId || id, k.payroll === 'Makassar' ? 'Makassar' : 'BSD') })).filter(k => inLoc(k.lok));
    const list = all.filter(k => st.kasAll || (k.s > 0 && !k.arsip)).sort((a, b) => b.s - a.s);
    const run = all.filter(k => !k.arsip && k.s > 0);
    const gp = (id) => num(S.gajiEmp[id]?.gajiPokok);
    const last = (k) => [...(k.entries || [])].sort((a, b) => (b.tgl || '').localeCompare(a.tgl || ''))[0];
    $('#wt').innerHTML = `
      <div class="wt-stats">
        <div class="wt-stat warn"><small>Total sisa kasbon</small><b>${rp(all.filter(k => !k.arsip).reduce((s, k) => s + Math.max(0, k.s), 0))}</b><span>${run.length} orang masih ada sisa</span></div>
        <div class="wt-stat"><small>Cicilan per bulan</small><b>${rp(run.reduce((s, k) => s + Math.min(k.s, num(k.cicilanPerBulan)), 0))}</b><span>dipotong di gaji berikutnya</span></div>
        <div class="wt-stat bad"><small>Lewat limit</small><b>${run.filter(k => gp(k.empId || k.id) && k.s > gp(k.empId || k.id)).length}</b><span>aturan: maksimal 1× gaji pokok</span></div>
      </div>
      <div class="toolbar"><div class="wt-seg" role="group" aria-label="Tampilkan"><button data-kasall="" aria-pressed="${!st.kasAll}">Masih berjalan</button><button data-kasall="1" aria-pressed="${!!st.kasAll}">Semua, termasuk lunas &amp; arsip</button></div></div>
      <div class="tablewrap"><table class="tbl wt-tbl"><thead><tr><th>Nama</th><th>Lokasi</th><th>Gaji pokok</th><th>Sisa kasbon</th><th>Sisa limit</th><th>Cicilan / bulan</th><th>Transaksi terakhir</th></tr></thead><tbody>
        ${list.map(k => { const g = gp(k.empId || k.id), l = last(k); const emp = S.karyawan[k.empId || k.id];
          return `<tr ${emp ? `data-emp="${esc(k.empId || k.id)}" tabindex="0"` : ''}><td><b>${esc(k.nama || '')}</b> <small class="muted">${esc(k.panggilan || '')}</small>${emp?.status === 'Non Aktif' ? ' <span class="badge off">eks</span>' : ''}${k.arsip ? ' <span class="badge warn">perlu dicek</span>' : ''}</td><td>${esc(k.lok)}</td>
          <td>${g ? rpS(g) : (S.gajiEmp[k.empId || k.id]?.sistemGaji === 'Harian' ? '<span class="badge warn">harian</span>' : '–')}</td><td><b>${rpS(k.s)}</b></td>
          <td>${g ? (g - k.s < 0 ? `<span class="badge bad">lewat ${rpS(k.s - g)}</span>` : rpS(g - k.s)) : '–'}</td><td>${rpS(k.cicilanPerBulan)}</td><td><small>${l ? `${esc(dLabel(l.tgl))} · ${esc(l.jenis)} ${rp(l.jumlah)}` : '–'}</small></td></tr>`; }).join('') || '<tr><td colspan="7" class="muted">Tidak ada kasbon berjalan.</td></tr>'}
      </tbody></table></div>`;
  }

  /* ================= REKRUTMEN ================= */
  /* ---------- Manual rekrutmen ---------- */
  function drawManual() {
    const secs = Object.entries(S.manual).sort((a, b) => num(a[1].urutan) - num(b[1].urutan));
    if (!st.manualSec || !S.manual[st.manualSec]) st.manualSec = secs[0]?.[0] || '';
    const s = S.manual[st.manualSec];
    $('#wt').innerHTML = head('Manual Rekrutmen', 'Panduan baku proses rekrutmen RMODA. Tersimpan di sini supaya kalau HRD berganti orang, penggantinya bisa langsung belajar dari manual yang sama.')
      + (s ? `<div class="hr-split"><nav class="hr-toc card" aria-label="Bagian manual">${secs.map(([id, x], i) => `<button data-set="manualSec:${esc(id)}" aria-pressed="${id === st.manualSec}">${i + 1}. ${esc(x.judul)}</button>`).join('')}</nav>
        <article class="card hr-doc"><h3>${esc(s.judul)}</h3>
          <p class="muted tiny">${s.diubah ? 'Terakhir diubah ' + esc(dLabel(String(s.diubah).slice(0, 10))) : ''}${s.draft ? ' <span class="badge warn">draf awal, mohon disesuaikan HRD</span>' : ''}</p>
          ${md(s.isi)}</article></div>` : '<div class="empty"><p class="muted">Manual belum ada.</p></div>');
  }

  /* ---------- Request rekrutmen ---------- */
  const kAll = () => Object.entries(S.kandidat).map(([id, k]) => ({ id, ...k }));
  const reqKds = (rid) => kAll().filter(k => k.requestId === rid);
  const reqOk = (rid) => reqKds(rid).filter(k => k.status === 'Diterima').length;
  function drawReq() {
    const all = Object.entries(S.rekrutmen).map(([id, r]) => ({ id, ...r })).filter(r => inLoc(r.lokasi)).sort((a, b) => (b.tglRequest || '').localeCompare(a.tglRequest || ''));
    const list = all.filter(r => st.reqF === 'Semua' || (st.reqF === 'Terbuka' ? !REQ_DONE.includes(r.status) : REQ_DONE.includes(r.status)));
    $('#wt').innerHTML = head('Request Rekrutmen', 'Kepala divisi mengajukan kebutuhan orang beserta kriterianya. HRD memproses sesuai Manual Rekrutmen; pelamarnya dicatat di menu Calon Karyawan.')
      + `<div class="toolbar">${seg('reqF', ['Terbuka', 'Selesai', 'Semua'].map(s => [s, s]), 'Status request')}<span class="muted">${list.length} request</span></div>`
      + (list.length ? `<div class="hr-cards">${list.map(r => {
        const kds = reqKds(r.id), ok = kds.filter(k => k.status === 'Diterima').length, need = num(r.jumlah);
        const p = Math.min(100, need ? ok / need * 100 : 0);
        return `<div class="card hr-card" data-req="${esc(r.id)}" tabindex="0" role="button">
          <div class="hr-card-h"><b>${esc(r.posisi || '')}</b>${rChip(r.status)}</div>
          <small class="muted">${esc(r.divisi || '')} · ${esc(r.lokasi || '')} · butuh ${need} orang</small>
          <small class="muted">Diajukan ${esc(r.pemohon || '–')} · ${esc(dLabel(r.tglRequest))}${r.targetMasuk ? ` · target masuk ${esc(dLabel(r.targetMasuk))}` : ''}</small>
          <i class="hr-bar"><b style="width:${p}%"></b></i>
          <small class="muted"><b class="hr-ink">${ok}/${need || 1} terisi</b> · ${kds.length} calon · ${kds.filter(k => KSTAT_PROSES.includes(k.status)).length} masih proses · ${kds.filter(k => ['Ditolak', 'Mundur'].includes(k.status)).length} ditolak/mundur</small>
          ${kds.filter(k => k.status === 'Diterima').map(k => `<small>✓ <b>${esc(k.nama)}</b> <span class="muted">· masuk ${k.targetMasuk ? esc(dLabel(k.targetMasuk)) : '?'}${k.empId ? ' · sudah di Data Karyawan' : ''}</span></small>`).join('')}
        </div>`; }).join('')}</div>` : `<div class="empty"><p class="muted">${all.length ? 'Tidak ada request di filter ini.' : 'Belum ada request rekrutmen.'}</p></div>`);
  }
  function openReq(id) {
    const r = S.rekrutmen[id]; if (!r) return;
    const kds = reqKds(id), pen = S.rekGaji[id]?.penawaran;
    openDlg(`<div class="dlg">
      <div class="wt-dh"><div><span class="muted tiny">${esc(r.divisi || '')} · ${esc(r.lokasi || '')}</span><h2>Request · ${esc(r.posisi || '')}</h2></div><button class="iconbtn" data-close aria-label="Tutup">×</button></div>
      <div class="wt-facts">
        <div><small>Status</small>${rChip(r.status)}${r.tglTerpenuhi ? `<span class="muted">terpenuhi ${esc(dLabel(r.tglTerpenuhi))}</span>` : ''}</div>
        <div><small>Jumlah orang</small><b>${num(r.jumlah) || 1}</b><span class="muted">${reqOk(id)} sudah diterima</span></div>
        <div><small>Diajukan oleh</small><b>${esc(r.pemohon || '–')}</b><span class="muted">${esc(dLabel(r.tglRequest))}</span></div>
        <div><small>Target mulai kerja</small><b>${esc(r.targetMasuk ? dLabel(r.targetMasuk) : '–')}</b></div>
        ${pen ? `<div><small>Gaji yang ditawarkan</small><b>${esc(pen)}</b></div>` : ''}
      </div>
      ${r.alasan ? `<h3>Alasan kebutuhan</h3><p class="note">${esc(r.alasan)}</p>` : ''}
      ${r.kriteria ? `<h3>Kriteria &amp; requirement</h3><p class="note">${esc(r.kriteria)}</p>` : ''}
      <h3>Calon karyawan untuk request ini · ${reqOk(id)}/${num(r.jumlah) || 1} terisi</h3>
      ${kds.length ? `<div class="tablewrap"><table class="tbl wt-tbl"><thead><tr><th>Nama</th><th>Status</th><th>Interview / target masuk</th></tr></thead><tbody>${kds.map(k => { const n = kNextIv(k, today);
        return `<tr data-kd="${esc(k.id)}" tabindex="0"><td><b>${esc(k.nama)}</b></td><td>${kChip(k.status)}</td><td><small>${k.status === 'Diterima' ? (k.targetMasuk ? 'masuk ' + esc(dLabel(k.targetMasuk)) : '–') : ['Ditolak', 'Mundur'].includes(k.status) ? esc(k.alasanTolak || '') : n ? esc(dLabel(n.tgl)) + ' · ' + esc(n.tahap || '') : '–'}</small></td></tr>`; }).join('')}</tbody></table></div>`
        : '<p class="muted">Belum ada calon yang dikaitkan ke request ini.</p>'}
    </div>`);
  }

  /* ---------- Calon karyawan ---------- */
  function drawKandidat() {
    const all = kAll().filter(k => inLoc(k.lokasi)), f = st.kdF;
    const inF = (k) => f === 'Semua' ? true : f === 'Proses' ? KSTAT_PROSES.includes(k.status) : f === 'Diterima' ? k.status === 'Diterima' : ['Ditolak', 'Mundur'].includes(k.status);
    const list = all.filter(inF).sort((a, b) => { const na = kNextIv(a, today), nb = kNextIv(b, today); if (f === 'Proses' && (na || nb)) return (na ? na.tgl : '9').localeCompare(nb ? nb.tgl : '9'); if (f === 'Diterima') return (a.targetMasuk || '9').localeCompare(b.targetMasuk || '9'); return (b.tglLamar || '').localeCompare(a.tglLamar || ''); });
    const wk = isoOf(new Date(Date.now() + 7 * 864e5)), m0 = today.slice(0, 7);
    const proses = all.filter(k => KSTAT_PROSES.includes(k.status)).length;
    const ivWeek = all.filter(k => KSTAT_PROSES.includes(k.status)).flatMap(k => (k.interviews || []).filter(x => x.tgl >= today && x.tgl <= wk && (x.hasil || 'Belum') === 'Belum')).length;
    const akanMasuk = all.filter(k => k.status === 'Diterima' && !k.empId && k.targetMasuk);
    const tolakBln = all.filter(k => ['Ditolak', 'Mundur'].includes(k.status) && (k.tglTolak || '').startsWith(m0)).length;
    const telat = akanMasuk.filter(k => k.targetMasuk < today);
    const colH = f === 'Diterima' ? 'Target masuk' : f === 'Ditolak' ? 'Alasan ditolak / mundur' : f === 'Proses' ? 'Interview' : 'Interview / target masuk / alasan';
    const lbl = (t) => f === 'Semua' ? `<small class="muted">${t}</small> ` : '';
    $('#wt').innerHTML = head('Calon Karyawan', 'Semua pelamar per posisi, divisi dan lokasi: jadwal &amp; hasil interview, yang ditolak beserta alasannya, dan yang diterima beserta target tanggal masuknya.')
      + `<div class="wt-stats">
        <div class="wt-stat info"><small>Dalam proses</small><b>${proses}</b><span>belum ada keputusan</span></div>
        <div class="wt-stat"><small>Interview 7 hari ke depan</small><b>${ivWeek}</b><span>jadwal yang belum ada hasilnya</span></div>
        <div class="wt-stat ${telat.length ? 'bad' : 'ok'}"><small>Diterima, menunggu masuk</small><b>${akanMasuk.length}</b><span>${telat.length ? `${telat.length} lewat target masuk` : akanMasuk.length ? 'terdekat ' + esc(dLabel(akanMasuk.map(k => k.targetMasuk).sort()[0])) : '–'}</span></div>
        <div class="wt-stat"><small>Ditolak / mundur bulan ini</small><b>${tolakBln}</b><span>${esc(mLabel(m0))}</span></div></div>
      <div class="toolbar">${seg('kdF', [['Proses', 'Proses'], ['Diterima', 'Diterima'], ['Ditolak', 'Ditolak / mundur'], ['Semua', 'Semua']], 'Status calon')}<span class="muted">${list.length} calon</span></div>
      ${list.length ? `<div class="tablewrap"><table class="tbl wt-tbl"><thead><tr><th>Nama</th><th>Posisi / divisi</th><th>Lokasi</th><th>Melamar</th><th>Status</th><th>${colH}</th><th>Catatan</th></tr></thead><tbody>
        ${list.map(k => { const n = kNextIv(k, today), l = kLastIv(k), rq = k.requestId && S.rekrutmen[k.requestId];
          const col = k.status === 'Diterima' ? (k.targetMasuk ? `${lbl('Target masuk')}<b>${esc(dLabel(k.targetMasuk))}</b>${k.empId ? ' <span class="badge ok">sudah jadi karyawan</span>' : k.targetMasuk < today ? ' <span class="badge bad">lewat</span>' : ''}` : '<span class="badge warn">target masuk belum diisi</span>')
            : ['Ditolak', 'Mundur'].includes(k.status) ? `${lbl('Alasan')}${esc(k.alasanTolak || '–')}${k.tahapTolak ? ` <span class="muted">· ${esc(k.tahapTolak)}</span>` : ''}`
            : n ? `${lbl('Interview')}<b>${HARI[new Date(n.tgl + 'T00:00:00').getDay()]} ${esc(dLabel(n.tgl))}${n.jam ? ' ' + esc(n.jam) : ''}</b> <span class="muted">· ${esc(n.tahap || '')}</span>` : l ? `<span class="muted">terakhir ${esc(dLabel(l.tgl))} · ${esc(l.tahap || '')} · ${esc(l.hasil || '')}</span>` : '<span class="muted">belum dijadwalkan</span>';
          return `<tr data-kd="${esc(k.id)}" tabindex="0"><td><b>${esc(k.nama || '')}</b><br><small class="muted">${esc(k.hp || '')}${k.sumber ? ' · ' + esc(k.sumber) : ''}</small></td>
            <td>${esc(k.posisi || '–')}<br><small class="muted">${esc(k.divisi || '')}</small>${rq ? `<br><span class="badge off">request · ${reqOk(k.requestId)}/${num(rq.jumlah) || 1} terisi</span>` : KSTAT_PROSES.includes(k.status) || k.status === 'Diterima' ? '<br><span class="badge warn">tanpa request</span>' : ''}</td>
            <td>${esc(k.lokasi || '')}</td><td><small>${esc(dLabel(k.tglLamar))}</small></td><td>${kChip(k.status)}</td><td><small>${col}</small></td><td><small class="muted">${esc(k.catatan || '')}</small></td></tr>`; }).join('')}
      </tbody></table></div>` : `<div class="empty"><p class="muted">${all.length ? 'Tidak ada calon di filter ini.' : 'Belum ada calon karyawan.'}</p></div>`}`;
  }
  function openKd(id) {
    const k = S.kandidat[id]; if (!k) return;
    const g = S.kandidatGaji[id] || {}, rq = k.requestId && S.rekrutmen[k.requestId];
    const tolak = ['Ditolak', 'Mundur'].includes(k.status);
    openDlg(`<div class="dlg">
      <div class="wt-dh"><div><span class="muted tiny">${esc(k.posisi || '')} · ${esc(k.lokasi || '')} · melamar ${esc(dLabel(k.tglLamar))}</span><h2>${esc(k.nama || '')} ${kChip(k.status)}</h2></div><button class="iconbtn" data-close aria-label="Tutup">×</button></div>
      <div class="wt-facts">
        <div><small>No HP / WA</small><b>${esc(k.hp || '–')}</b></div>
        <div><small>Divisi</small><b>${esc(k.divisi || '–')}</b></div>
        <div><small>Sumber lamaran</small><b>${esc(k.sumber || '–')}</b>${k.referensi ? `<span class="muted">referensi ${esc(k.referensi)}</span>` : ''}</div>
        <div><small>Request rekrutmen</small>${rq ? `<button class="btn btn--s" data-req="${esc(k.requestId)}">${esc(rq.posisi || '')} · ${esc(rq.lokasi || '')} · diterima ${reqOk(k.requestId)}/${num(rq.jumlah) || 1}</button>` : '<b>— tidak terkait request —</b>'}</div>
        ${g.domisili ? `<div><small>Domisili</small><span>${esc(g.domisili)}</span></div>` : ''}
      </div>
      ${k.catatan ? `<p class="note">${esc(k.catatan)}</p>` : ''}
      <h3>Interview &amp; tes</h3>
      ${(k.interviews || []).length ? `<div class="tablewrap"><table class="tbl"><thead><tr><th>Tanggal &amp; jam</th><th>Tahap</th><th>Oleh</th><th>Hasil</th><th>Catatan</th></tr></thead><tbody>${k.interviews.map(x => `<tr><td><small>${esc(dLabel(x.tgl))}${x.jam ? ' ' + esc(x.jam) : ''}</small></td><td>${esc(x.tahap || '')}</td><td>${esc(x.oleh || '')}</td><td>${esc(x.hasil || 'Belum')}</td><td><small>${esc(x.catatan || '')}</small></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Belum ada jadwal interview.</p>'}
      ${tolak ? `<h3>Ditolak / mundur</h3><div class="wt-facts"><div><small>Tanggal</small><b>${esc(dLabel(k.tglTolak))}</b></div><div><small>Gagal di tahap</small><b>${esc(k.tahapTolak || '–')}</b></div><div><small>Alasan</small><b>${esc(k.alasanTolak || '–')}</b></div></div>${k.ketTolak ? `<p class="note">${esc(k.ketTolak)}</p>` : ''}` : ''}
      ${k.status === 'Diterima' ? `<h3>Diterima</h3><div class="wt-facts">
        <div><small>Tanggal diterima</small><b>${esc(dLabel(k.tglTerima))}</b></div>
        <div><small>Target masuk kerja</small><b>${esc(dLabel(k.targetMasuk))}</b></div>
        <div><small>Sistem gaji</small><b>${esc(k.sistemGaji || g.sistemGaji || '–')}</b></div>
        ${g.uangHarian ? `<div><small>Uang harian / hari</small><b>${rp(g.uangHarian)}</b></div>` : ''}
        ${g.gajiPokok ? `<div><small>Gaji pokok / bulan</small><b>${rp(g.gajiPokok)}</b></div>` : ''}
        <div><small>Masa training</small><b>${num(k.masaTraining) ? num(k.masaTraining) + ' bulan' : '–'}</b></div>
        <div><small>Disetujui oleh</small><b>${esc(k.disetujui || '–')}</b></div></div>
        ${k.empId && S.karyawan[k.empId] ? `<p><span class="badge ok">Sudah jadi karyawan</span> <button class="btn btn--s" data-emp="${esc(k.empId)}">Buka data karyawan</button></p>` : ''}` : ''}
    </div>`);
  }

  /* ================= KPI PER ROLE ================= */
  function drawKpi() {
    const roles = Object.entries(S.kpiT).sort((a, b) => (a[1].urutan || 99) - (b[1].urutan || 99));
    if (!st.kpiRole || !S.kpiT[st.kpiRole]) st.kpiRole = roles[0]?.[0] || '';
    const t = S.kpiT[st.kpiRole];
    const act = S.emps.filter(e => e.status !== 'Non Aktif' && inLoc(e.lokasi));
    const side = `<nav class="hr-toc card" aria-label="Role">${roles.map(([id, r]) => `<button data-set="kpiRole:${esc(id)}" aria-pressed="${id === st.kpiRole}">${esc(r.nama)}<small class="muted">${esc(r.divisi || '')} · ${act.filter(e => kpiRoleFor(S, e) === id).length} orang</small></button>`).join('')}</nav>`;
    const top = head('KPI per Role', 'Indikator kinerja tiap role beserta bobotnya, lalu penilaian bulanan per karyawan. Skor per indikator diisi 0–100 (persen pencapaian target).')
      + subTabs('kpiTab', [['template', 'Indikator per role'], ['nilai', 'Penilaian bulanan']]);
    if (!t) { $('#wt').innerHTML = top + '<div class="empty"><p class="muted">Belum ada template KPI.</p></div>'; return; }
    const ind = t.indikator || [];
    if (st.kpiTab === 'template') {
      const bobot = ind.reduce((s, x) => s + num(x.bobot), 0), ins = S.kpiIns[st.kpiRole]?.insentif;
      $('#wt').innerHTML = top + `<div class="hr-split">${side}<div class="card hr-doc">
        <div class="hr-card-h"><div><h3>${esc(t.nama)}</h3><small class="muted">${esc(t.divisi || '')}</small>${t.draft ? ' <span class="badge warn">draf usulan, mohon direview</span>' : ''}</div><span class="badge ${bobot === 100 ? 'ok' : 'bad'}">Total bobot ${bobot}%</span></div>
        <div class="tablewrap"><table class="tbl"><thead><tr><th>Indikator</th><th>Target</th><th>Bobot %</th></tr></thead><tbody>
          ${ind.map(x => `<tr><td>${esc(x.nama)}</td><td><small>${esc(x.target || '')}</small></td><td>${num(x.bobot)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Belum ada indikator.</td></tr>'}</tbody></table></div>
        ${ins ? `<h3>Skema insentif terkait</h3><p class="muted">${esc(ins)}</p>` : ''}</div></div>`;
      return;
    }
    // Nilai bulanan: dokumen portal dipecah per lokasi (bulan_lokasi), digabung lagi di sini
    const months = [...new Set([ym, ...Object.values(S.kpiNilai).map(d => d.bulan).filter(Boolean)])].sort().reverse();
    const nd = {}; Object.values(S.kpiNilai).filter(d => d.bulan === st.kpiM).forEach(d => Object.assign(nd, d.data || {}));
    const people = act.filter(e => kpiRoleFor(S, e) === st.kpiRole);
    $('#wt').innerHTML = top + `<div class="hr-split">${side}<div class="card hr-doc">
      <div class="hr-card-h"><h3>${esc(t.nama)} · ${esc(mLabel(st.kpiM))}</h3><select class="inp inp--s" id="hrKpiM" aria-label="Bulan">${months.map(m => `<option value="${m}" ${m === st.kpiM ? 'selected' : ''}>${mLabel(m)}</option>`).join('')}</select></div>
      <div class="tablewrap"><table class="tbl"><thead><tr><th>Nama</th>${ind.map(x => `<th title="${esc(x.target || '')}">${esc(x.nama)}<br><small>${num(x.bobot)}%</small></th>`).join('')}<th>Nilai</th><th>Catatan</th></tr></thead><tbody>
        ${people.map(e => { const r = nd[e.id] || {}; return `<tr data-emp="${esc(e.id)}" tabindex="0"><td><b>${esc(e.nama)}</b> <small class="muted">${esc(e.lokasi || '')}</small></td>${ind.map((x, i) => `<td>${r.skor?.[i] ?? '–'}</td>`).join('')}<td>${kpiGrade(kpiScore(t, nd[e.id])) || '–'}</td><td><small>${esc(r.catatan || '')}</small></td></tr>`; }).join('')
          || `<tr><td colspan="${ind.length + 3}" class="muted">Belum ada karyawan dengan role ini.</td></tr>`}</tbody></table></div>
      <p class="muted tiny">Nilai: A ≥ 90 · B 75–89 · C 60–74 · D &lt; 60. ${Object.keys(nd).length ? '' : 'Belum ada penilaian untuk bulan ini.'}</p></div></div>`;
    $('#hrKpiM').onchange = (e) => { st.kpiM = e.target.value; drawKpi(); };
  }

  /* ================= PENGGAJIAN ================= */
  /* ---------- Struktur & kenaikan gaji ---------- */
  function riwayatTable(rows, withName) {
    if (!rows.length) return '<div class="empty"><p class="muted">Belum ada perubahan gaji atau kelulusan training yang tercatat.</p></div>';
    return `<div class="tablewrap"><table class="tbl wt-tbl"><thead><tr><th>Berlaku</th>${withName ? '<th>Nama</th>' : ''}<th>Jenis</th><th>Gaji pokok lama</th><th>Gaji pokok baru</th><th>Naik</th><th>Uang harian</th><th>Insentif</th><th>Status / sistem</th><th>Dinilai / disetujui</th><th>Catatan</th></tr></thead><tbody>
    ${rows.map(r => { const d = num(r.gpKe) - num(r.gpDari); return `<tr ${withName && S.karyawan[r.empId] ? `data-emp="${esc(r.empId)}" tabindex="0"` : ''}><td><small>${esc(dLabel(r.tgl))}${r.perkiraan ? ' ±' : ''}</small></td>${withName ? `<td><b>${esc(r.nama)}</b></td>` : ''}
      <td><span class="badge ${r.jenis === 'Lulus training' ? 'ok' : r.jenis === 'Kenaikan gaji' ? 'info' : r.jenis === 'Penurunan gaji' ? 'bad' : 'off'}">${esc(r.jenis || '')}</span></td>
      <td>${rpS(r.gpDari)}</td><td><b>${rpS(r.gpKe)}</b></td><td>${d ? (d > 0 ? '+' : '') + rpS(d) + ` <small class="muted">${selisih(r.gpDari, r.gpKe)}</small>` : '–'}</td>
      <td>${num(r.umDari) !== num(r.umKe) ? `${rpS(r.umDari)} → <b>${rpS(r.umKe)}</b>` : rpS(r.umKe)}</td>
      <td><small>${(r.insDari || '') !== (r.insKe || '') && (r.insDari || r.insKe) ? `${esc(r.insDari || '–')} → <b>${esc(r.insKe || '–')}</b>` : `<span class="muted">${esc(r.insKe || '')}</span>`}</small></td>
      <td><small>${r.statusDari !== r.statusKe && r.statusKe ? `${esc(r.statusDari || '–')} → ${esc(r.statusKe)}` : ''}${r.sistemDari !== r.sistemKe && r.sistemKe ? `${r.statusDari !== r.statusKe ? '<br>' : ''}${esc(r.sistemDari || '–')} → ${esc(r.sistemKe)}` : ''}${r.posisiDari !== r.posisiKe && r.posisiKe ? `<br><span class="muted">${esc(r.posisiDari || '–')} → ${esc(r.posisiKe)}</span>` : ''}</small></td>
      <td><small>${esc(r.oleh || '–')}</small></td><td><small>${esc(r.catatan || '')}${r.sumber ? `<br><span class="muted">${esc(r.sumber)}</span>` : ''}</small></td></tr>`; }).join('')}
    </tbody></table></div>`;
  }
  function drawStruktur() {
    const tabs = subTabs('sTab', [['now', 'Gaji saat ini'], ['riwayat', 'Riwayat kenaikan & training'], ['model', 'Model gaji per jabatan']]);
    const top = head('Struktur & Kenaikan Gaji', 'Komponen gaji tetap tiap karyawan: gaji pokok, uang harian (uang makan per hari kerja), dan skema insentif. Angka di sini jadi dasar saat membuat gaji bulanan dan uang makan mingguan.') + tabs;
    const emps = S.emps.map(full);
    if (st.sTab === 'model') {
      // Seperti di aplikasi: dihitung untuk semua lokasi
      const act = emps.filter(e => e.status !== 'Non Aktif');
      let tMin = 0, tMax = 0, tHc = 0, tAct = 0;
      const body = Object.entries(JABATAN).map(([d, js]) => `<tbody><tr class="hr-grp"><td colspan="6">${esc(d)}</td></tr>${js.map(j => {
        const ppl = act.filter(e => e.divisi === d && e.posisi === j[0]);
        tMin += j[1] * j[2]; tMax += j[1] * j[3]; tHc += j[1]; tAct += ppl.length;
        const diff = ppl.length - j[1];
        return `<tr><td>${esc(j[0])}</td><td>${j[1]}</td><td>${ppl.length}${diff ? ` <span class="badge ${diff > 0 ? 'warn' : 'off'}">${diff > 0 ? '+' : ''}${diff}</span>` : ''}</td><td>${jabRangeTxt(j)}</td><td><small>${rpS(j[1] * j[2] * 1e6)} – ${rpS(j[1] * j[3] * 1e6)}</small></td>
          <td><small>${ppl.map(e => `<span class="hr-link" data-emp="${esc(e.id)}" tabindex="0">${esc(e.panggilan || e.nama)}${e.lokasi !== 'BSD' ? ` <span class="muted">(${esc(e.lokasi || '')})</span>` : ''}${num(e.gajiPokok) ? ` <span class="muted">${(num(e.gajiPokok) / 1e6).toFixed(1).replace('.', ',')}</span>` : ''}</span>`).join(', ') || '–'}</small></td></tr>`; }).join('')}</tbody>`).join('');
      const un = act.filter(e => !jabOk(e));
      $('#wt').innerHTML = top + `<p class="lead">Model gaji per jabatan (dari file Model Gaji): jumlah orang yang direncanakan dibanding yang ada sekarang, dan range gaji pokok per jabatan. Angka di samping nama = gaji pokok sekarang (juta). Semua lokasi.</p>
        <div class="wt-stats"><div class="wt-stat"><small>Headcount model</small><b>${tHc}</b><span>sekarang ${tAct} orang terpetakan</span></div>
          <div class="wt-stat info"><small>Total gaji model / bulan</small><b>${tMin.toFixed(1).replace('.', ',')}–${tMax.toFixed(1).replace('.', ',')} jt</b><span>budget 27% × 1.400 jt = 378 jt</span></div>
          <div class="wt-stat warn"><small>Belum dipetakan</small><b>${un.length}</b><span>${esc(un.slice(0, 4).map(e => e.panggilan || e.nama).join(', '))}${un.length > 4 ? '…' : ''}</span></div></div>
        <div class="tablewrap"><table class="tbl"><thead><tr><th>Jabatan</th><th>Model</th><th>Ada</th><th>Range gaji</th><th>Total model</th><th>Orangnya</th></tr></thead>${body}</table></div>`;
      return;
    }
    if (st.sTab === 'riwayat') {
      const all = []; emps.filter(e => inLoc(empLok(e))).forEach(e => (e.riwayat || []).forEach(r => all.push({ ...r, empId: e.id, nama: e.nama })));
      const years = [...new Set(all.map(r => (r.tgl || '').slice(0, 4)).filter(Boolean))].sort().reverse();
      const rows = all.filter(r => (st.rJ === 'Semua' || r.jenis === st.rJ) && (st.rY === 'Semua' || (r.tgl || '').startsWith(st.rY))).sort((a, b) => (b.tgl || '').localeCompare(a.tgl || ''));
      const naik = rows.filter(r => num(r.gpKe) > num(r.gpDari) && num(r.gpDari) > 0);
      $('#wt').innerHTML = top + `<div class="wt-stats">
          <div class="wt-stat info"><small>Kenaikan gaji</small><b>${rows.filter(r => r.jenis === 'Kenaikan gaji').length}</b><span>tambahan ${rp(naik.reduce((s, r) => s + num(r.gpKe) - num(r.gpDari), 0))} / bulan</span></div>
          <div class="wt-stat ok"><small>Lulus training</small><b>${rows.filter(r => r.jenis === 'Lulus training').length}</b><span>diangkat jadi karyawan bulanan</span></div>
          <div class="wt-stat"><small>Masih training</small><b>${emps.filter(e => e.status === 'Training' && inLoc(empLok(e))).length}</b><span>belum dinyatakan lulus</span></div></div>
        <div class="toolbar"><select class="inp inp--s" id="hrRJ" aria-label="Jenis">${['Semua', ...JENIS_UBAH].map(j => `<option ${j === st.rJ ? 'selected' : ''}>${j}</option>`).join('')}</select>
          <select class="inp inp--s" id="hrRY" aria-label="Tahun">${['Semua', ...years].map(y => `<option ${y === st.rY ? 'selected' : ''}>${y}</option>`).join('')}</select>
          <span class="muted">${rows.length} catatan · ± = tanggal perkiraan dari bulan gaji di sheet</span></div>
        ${riwayatTable(rows, true)}`;
      $('#hrRJ').onchange = (e) => { st.rJ = e.target.value; drawStruktur(); };
      $('#hrRY').onchange = (e) => { st.rY = e.target.value; drawStruktur(); };
      return;
    }
    const list = emps.filter(e => e.status !== 'Non Aktif' && inLoc(empLok(e)));
    const groups = {}; list.forEach(e => (groups[e.divisi || ''] = groups[e.divisi || ''] || []).push(e));
    const gp = (arr) => arr.reduce((s, e) => s + num(e.gajiPokok), 0);
    $('#wt').innerHTML = top + `<div class="wt-stats">
        <div class="wt-stat ok"><small>Total gaji pokok / bulan</small><b>${rp(gp(list))}</b><span>${KEL.map(k => { const a = list.filter(e => kelOf(e) === k); return `${KEL_S[k]} ${rp(gp(a))} · ${a.length} org`; }).join('<br>')}</span></div>
        <div class="wt-stat"><small>Uang makan / minggu (6 hari)</small><b>${rp(list.reduce((s, e) => s + num(e.uangMakanHarian) * 6, 0))}</b><span>jika semua masuk penuh</span></div>
        <div class="wt-stat warn"><small>Karyawan harian</small><b>${list.filter(e => e.sistemGaji === 'Harian').length}</b><span>dibayar lewat uang harian</span></div></div>
      <div class="tablewrap"><table class="tbl wt-tbl"><thead><tr><th>Nama</th><th>Posisi</th><th>Lokasi</th><th>Sistem</th><th>Gaji pokok</th><th>Uang harian</th><th>Lembur / jam</th><th>Bayar UM</th><th>Skema insentif</th></tr></thead>
      ${Object.keys(groups).sort().map(g => `<tbody><tr class="hr-grp"><td colspan="9">${esc(g || '–')} <span class="muted">· ${groups[g].length} orang · ${rp(gp(groups[g]))}</span></td></tr>
        ${groups[g].map(e => { const lr = lemburRate(S, e); return `<tr data-emp="${esc(e.id)}" tabindex="0"><td><b>${esc(e.nama)}</b></td><td>${esc(e.posisi || '–')}${jabOk(e) ? '' : ' <span class="badge warn">belum dipetakan</span>'}</td><td>${esc(e.lokasi || '')}</td>
          <td>${e.sistemGaji === 'Harian' ? '<span class="badge warn">Harian</span>' : '<span class="badge off">Bulanan</span>'}</td><td>${rpS(e.gajiPokok)}</td><td>${rpS(e.uangMakanHarian)}</td>
          <td title="${esc(lemburKatLabel(e.lemburKat || lemburKatAuto(e)))}">${lr ? rpS(lr) : '<span class="muted">tidak ada</span>'}</td><td><small>${esc((e.uangMakanCara || '').replace(' (bersama gaji)', '').replace(' (Sabtu)', ''))}</small></td><td><small>${esc(e.insentifSkema || '–')}</small></td></tr>`; }).join('')}</tbody>`).join('')}
      </table></div>`;
  }

  /* ---------- Benefit, BPJS & THR ---------- */
  function drawBenefit() {
    const top = head('Benefit, BPJS & THR', 'Status BPJS tiap karyawan, perhitungan dan riwayat THR, serta daftar benefit lain yang berlaku.')
      + subTabs('benTab', [['bpjs', 'BPJS'], ['thr', 'THR'], ['lain', 'Daftar benefit']]);
    const act = S.emps.map(full).filter(e => e.status !== 'Non Aktif');
    if (st.benTab === 'bpjs') {
      const L = act.filter(e => inLoc(e.lokasi)), c = (k, v) => L.filter(e => (e[k] || '') === v).length;
      $('#wt').innerHTML = top + `<div class="wt-stats">
          <div class="wt-stat ok"><small>BPJS Kesehatan terdaftar</small><b>${c('bpjsKes', 'Terdaftar')} / ${L.length}</b><span>${c('bpjsKes', '')} belum diisi statusnya</span></div>
          <div class="wt-stat ok"><small>BPJS TK terdaftar</small><b>${c('bpjsTK', 'Terdaftar')} / ${L.length}</b><span>${c('bpjsTK', '')} belum diisi statusnya</span></div></div>
        <div class="tablewrap"><table class="tbl wt-tbl"><thead><tr><th>Nama</th><th>Lokasi</th><th>Status</th><th>BPJS Kesehatan</th><th>No. BPJS Kes</th><th>BPJS Ketenagakerjaan</th><th>No. BPJS TK</th></tr></thead><tbody>
          ${L.map(e => `<tr data-emp="${esc(e.id)}" tabindex="0"><td><b>${esc(e.nama)}</b></td><td>${esc(e.lokasi || '')}</td><td>${statusBadge(e.status)}</td><td>${esc(e.bpjsKes || '–')}</td><td><small>${esc(e.noBpjsKes || '')}</small></td><td>${esc(e.bpjsTK || '–')}</td><td><small>${esc(e.noBpjsTK || '')}</small></td></tr>`).join('') || '<tr><td colspan="7" class="muted">Tidak ada karyawan aktif.</td></tr>'}
        </tbody></table></div>`;
      return;
    }
    if (st.benTab === 'thr') {
      const ref = st.thrDate, L = st.loc ? [st.loc] : LOKASI;
      const calc = act.filter(e => L.includes(empLok(e))).map(e => thrCalc(e, ref));
      const tot = (a) => a.reduce((s, x) => s + (x.thr || 0), 0);
      // Riwayat: dokumen portal dipecah per lokasi; bila semua lokasi, digabung lagi per tahun & payroll seperti di aplikasi
      const hist = {};
      Object.values(S.thr).filter(t => inLoc(t.lokasi)).forEach(t => { const k = st.loc ? t.tahun + ' · ' + t.lokasi : t.tahun + ' · ' + (t.payroll || t.lokasi);
        const h = hist[k] = hist[k] || { label: k, tahun: t.tahun, tglBayar: t.tglBayar, rows: [], prorata: [] }; h.rows.push(...(t.rows || [])); h.prorata.push(...(t.prorata || [])); });
      const H = Object.values(hist).sort((a, b) => String(b.tahun).localeCompare(String(a.tahun)) || a.label.localeCompare(b.label));
      $('#wt').innerHTML = top + `<div class="toolbar"><label class="muted">Acuan masa kerja <input type="date" class="inp inp--s" id="hrThrD" value="${esc(ref)}"></label></div>
        <p class="note">Aturan yang dipakai di THR 2026: masa kerja 12 bulan ke atas dapat 1× gaji pokok; di bawah 12 bulan dapat gaji pokok × bulan kerja ÷ 12. Karyawan harian dihitung manual. Ini hanya perkiraan; THR yang disimpan ada di riwayat.</p>
        <div class="wt-stats">${L.map(l => { const a = calc.filter(x => empLok(x.e) === l); return `<div class="wt-stat ok"><small>Perkiraan THR ${esc(l)}</small><b>${rp(tot(a))}</b><span>${a.filter(x => x.harian).length} karyawan harian belum dihitung</span></div>`; }).join('')}</div>
        <div class="tablewrap"><table class="tbl wt-tbl"><thead><tr><th>Nama</th>${st.loc ? '' : '<th>Lokasi</th>'}<th>Masa kerja</th><th>Gaji pokok</th><th>THR</th></tr></thead><tbody>
          ${calc.map(x => `<tr data-emp="${esc(x.e.id)}" tabindex="0"><td><b>${esc(x.e.nama)}</b></td>${st.loc ? '' : `<td>${esc(empLok(x.e))}</td>`}<td>${x.mk == null ? '<span class="badge warn">tgl masuk?</span>' : x.mk + ' bln'}</td><td>${rpS(x.gp)}</td><td>${x.harian ? '<span class="badge warn">manual</span>' : `<b>${rpS(x.thr)}</b>`}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Tidak ada karyawan.</td></tr>'}
        </tbody><tfoot><tr><td><b>Total</b></td>${st.loc ? '' : '<td></td>'}<td></td><td></td><td><b>${rpS(tot(calc))}</b></td></tr></tfoot></table></div>
        <h2 class="wt-h">Riwayat THR</h2>
        ${H.map((t, i) => `<details class="card hr-det" ${i === 0 ? 'open' : ''}><summary><b>THR ${esc(t.label)}</b> <span class="muted">· ${rp(t.rows.reduce((s, r) => s + num(r.total), 0))} · ${t.rows.length} orang${t.tglBayar ? ' · ' + esc(t.tglBayar) : ''}</span></summary>
          <div class="tablewrap"><table class="tbl"><thead><tr><th>Nama</th><th>Gaji pokok / THR</th><th>Uang makan</th><th>Total</th></tr></thead><tbody>${t.rows.map(r => `<tr ${S.karyawan[r.empId] ? `data-emp="${esc(r.empId)}" tabindex="0"` : ''}><td>${esc(r.nama || '')}</td><td>${rpS(r.gajiPokok)}</td><td>${rpS(r.uangMakan)}</td><td><b>${rpS(r.total)}</b></td></tr>`).join('')}</tbody></table></div>
          ${t.prorata.length ? `<p class="muted tiny">Prorata: ${t.prorata.map(p => `${esc(p.nama)} (${esc(p.bulan)} bln)`).join(', ')}</p>` : ''}</details>`).join('') || '<div class="empty"><p class="muted">Belum ada riwayat.</p></div>'}`;
      $('#hrThrD').onchange = (e) => { if (e.target.value) { st.thrDate = e.target.value; drawBenefit(); } };
      return;
    }
    const items = (S.pengaturan.benefit || {}).items || [];
    $('#wt').innerHTML = top + `<p class="lead">Daftar ini jadi acuan HRD saat menjelaskan hak karyawan baru.</p>
      <div class="tablewrap"><table class="tbl"><thead><tr><th>Benefit</th><th>Berlaku untuk</th><th>Ketentuan</th></tr></thead><tbody>
        ${items.map(it => `<tr><td><b>${esc(it.nama || '')}</b></td><td>${esc(it.untuk || '')}</td><td class="hr-pre">${esc(it.ket || '')}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Belum ada daftar benefit.</td></tr>'}
      </tbody></table></div>`;
  }

  function bindSearch(idq, fn) {
    const inp = $('#' + idq); if (!inp) return;
    inp.oninput = () => { st.q = inp.value; const pos = inp.selectionStart; fn(); const n = $('#' + idq); n.focus(); n.setSelectionRange(pos, pos); };
  }
  const draw = () => ({ ringkasan: drawSummary, karyawan: drawEmps, absensi: drawAbs, gaji: drawGaji, um: drawUM, kasbon: drawKas,
    manual: drawManual, rekrutmen: drawReq, kandidat: drawKandidat, kpi: drawKpi, struktur: drawStruktur, benefit: drawBenefit })[st.tab]();
  view.onclick = (e) => {
    const t = e.target.closest('[data-tab],[data-loc],[data-ktab],[data-grade],[data-kasall],[data-set],[data-emp],[data-kd],[data-req]'); if (!t) return;
    if (t.dataset.tab) { st.tab = t.dataset.tab; view.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-pressed', b === t)); }
    else if ('loc' in t.dataset) { st.loc = t.dataset.loc; view.querySelectorAll('[data-loc]').forEach(b => b.setAttribute('aria-pressed', b === t)); }
    else if (t.dataset.ktab) { st.kTab = t.dataset.ktab; st.div = ''; }
    else if ('grade' in t.dataset) st.grade = t.dataset.grade;
    else if ('kasall' in t.dataset) st.kasAll = !!t.dataset.kasall;
    else if (t.dataset.set) { const i = t.dataset.set.indexOf(':'); st[t.dataset.set.slice(0, i)] = t.dataset.set.slice(i + 1); }
    else if (t.dataset.emp) return openEmp(t.dataset.emp);
    else if (t.dataset.kd) return openKd(t.dataset.kd);
    else if (t.dataset.req) return openReq(t.dataset.req);
    draw();
  };
  view.onkeydown = (e) => { const d = e.target.dataset || {}; if (e.key !== 'Enter') return; if (d.emp) openEmp(d.emp); else if (d.kd) openKd(d.kd); else if (d.req) openReq(d.req); };
  draw();
}

/* Ringkasan singkat untuk Beranda portal */
export async function hrdHomeSummary(api) {
  const [docs, sync] = await Promise.all([api.listDocs('hrd'), api.lastSync('hrd')]);
  const S = loadState(docs);
  if (!S.emps.length) return null;
  const act = S.emps.filter(e => e.status !== 'Non Aktif');
  const year = todayISO().slice(0, 4);
  const kas = Object.values(S.kasbon).filter(k => !k.arsip);
  return {
    syncAt: sync?.at || null,
    active: act.length,
    perLoc: Object.fromEntries(LOKASI.map(l => [l, act.filter(e => e.lokasi === l).length]).filter(([, n]) => n)),
    training: act.filter(e => e.status === 'Training').length,
    leftThisYear: S.emps.filter(e => e.status === 'Non Aktif' && (e.tglKeluar || '') >= year + '-01-01').length,
    openRequests: Object.values(S.rekrutmen).filter(r => !REQ_DONE.includes(r.status)).reduce((s, r) => s + num(r.jumlah), 0),
    kasbon: kas.length ? kas.reduce((s, k) => s + Math.max(0, kasSaldo(k)), 0) : null,   // null bila pengguna tidak boleh melihat uang
  };
}
