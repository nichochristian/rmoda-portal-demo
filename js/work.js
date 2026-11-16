// Modul Work Tracker. Tulis hanya lewat saklar sumber, atau di mode demo.
import { acceptedSerah, bayarAktif } from './rules.js?v=44';
// Bagian Service Advisor (js/sa.js) dimuat saat tombol "Service Advisor" dibuka.

/* Ringkasan pembayaran & konfirmasi per kartu (sama dengan RMODA_PAY / payOfJob / konfOfJob di aplikasi) */
const PAY = (() => {
  const n = v => { if (typeof v === 'number') return isFinite(v) ? v : 0; const x = Number(String(v ?? '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')); return isFinite(x) ? x : 0; };
  const p = v => { if (typeof v === 'number') return isFinite(v) ? v : 0; const x = Number(String(v ?? '').trim().replace(/\s/g, '').replace(',', '.').replace(/[^\d.-]/g, '')); return isFinite(x) ? x : 0; };
  const cl = (d, b) => Math.max(0, Math.min(Math.max(0, b), Math.round(d)));
  const line = it => { const b = n(it.qty) * n(it.harga); return b - cl(it.diskMode === 'pct' ? b * Math.min(100, Math.max(0, p(it.diskPct))) / 100 : n(it.disk), b); };
  const grand = t => { const b = (t.items || []).reduce((a, it) => a + line(it), 0); return b - cl(t.diskonMode === 'pct' ? b * Math.min(100, Math.max(0, p(t.diskonPct))) / 100 : n(t.diskon), b) + n(t.biayaLain); };
  const paid = t => (t.bayar || []).filter(bayarAktif).reduce((a, x) => a + n(x.jumlah), 0);
  const status = t => { if (!t || t.batal) return ''; const pd = paid(t); if (pd <= 0) return 'Belum bayar'; if (grand(t) - pd <= 0) return t.fak ? 'Lunas' : 'Lunas di muka'; return 'DP'; };
  const rp = v => 'Rp' + Math.round(v).toLocaleString('id-ID');
  return { grand, paid, status, lebih: t => Math.max(0, paid(t) - grand(t)), rp };
})();
const KST = { menunggu: ['Menunggu jawaban', 'bad'], dijawab: ['Dijawab', 'warn'], selesai: ['Selesai', 'ok'] };
function saForJob(saDocs) {
  const L = saDocs.filter(d => d.coll === 'trx').map(d => ({ id: d.id, ...(d.data || {}) })).filter(t => !t.batal);
  const K = saDocs.filter(d => d.coll === 'konf').map(d => ({ id: d.id, ...(d.data || {}) }));
  const nk = v => String(v || '').toUpperCase().replace(/[^A-Z0-9|]/g, '');
  const find = (j) => L.find(t => t.wtJob === j.id) || (j.woNo ? L.find(t => t.woCode === j.woNo || (Array.isArray(t.woAlias) && t.woAlias.includes(j.woNo))) : null);
  return {
    trxOf: (j) => L.find(t => t.wtJob === j.id) || (j.saTrx ? L.find(t => t.id === j.saTrx) : null) || (j.woNo ? L.find(t => t.woCode === j.woNo || (Array.isArray(t.woAlias) && t.woAlias.includes(j.woNo))) : null) || null,
    payOf(j) { const t = find(j); if (!t) return null; const s = PAY.status(t); return s ? { s, l: PAY.lebih(t), sisa: Math.max(0, PAY.grand(t) - PAY.paid(t)), rp: PAY.rp } : null; },
    konfOf(j) { const c = nk(j.woNo), p = nk(j.plate); return K.filter(k => { const w = nk(k.wo); return (c && w === c) || (p && w.split('|')[0] === p); }).sort((a, b) => (b.no || 0) - (a.no || 0)); },
    waiting: K.filter(k => k.status === 'menunggu').length,
    KST,
  };
}
// Data dibaca dari tabel app_docs; aturan akses per unit dijaga database (RLS).

const DIVS = {
  bodyworks: { label: 'Bodyworks', stages: [['cuci', 'Cuci Kendaraan'], ['bongkar', 'Bongkar'], ['las', 'Las / Ketok'], ['dempul', 'Dempul'], ['epoxy', 'Epoxy'], ['sppf', 'SPPF'], ['cat', 'Pengecatan'], ['pc', 'Paint Correction'], ['rakit', 'Perakitan & Fitting'], ['finishing', 'Finishing'], ['qc', 'QC']] },
  ppf: { label: 'PPF', stages: [['cuci', 'Cuci / Persiapan'], ['bongkar', 'Bongkar'], ['prepd', 'Detailing Preparation'], ['pasang', 'Pasang PPF'], ['rakit', 'Perakitan'], ['detailing', 'Detailing'], ['coating', 'Coating'], ['finishing', 'Finishing'], ['qc', 'QC']] },
  coating: { label: 'Coating', stages: [['innerfender', 'Innerfender Detailing'], ['engine', 'Engine Bay Detailing'], ['clay', 'Clay Wash'], ['exterior', 'Exterior Detailing'], ['interior', 'Interior Detailing'], ['pc', 'Paint Correction'], ['coating', 'Coating'], ['finishing', 'Finishing'], ['qc', 'QC']] },
  vendor: { label: 'Vendor', stages: [['lepas', 'Lepas part'], ['kirim', 'Kirim ke vendor'], ['kerja', 'Dikerjakan vendor'], ['terima', 'Diterima kembali'], ['qc', 'QC'], ['pasang', 'Pasang kembali']] },
};
const LOCS = ['BSD', 'Legok', 'Makassar'];
const PRI = { TINGGI: ['bad', 'Prioritas tinggi'], SEDANG: ['warn', 'Prioritas sedang'], RINGAN: ['off', 'Prioritas ringan'] };
const ROLE = { sa: 'Service Advisor', kabeng: 'Kepala Bengkel', kadiv: 'Kepala Divisi', owner: 'Owner' };

const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayOf = (s) => !s ? null : String(s).length > 10 ? isoDay(new Date(s)) : String(s).slice(0, 10);
const fmtD = (s) => s ? new Date(dayOf(s) + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const fmtDs = (s) => s ? new Date(dayOf(s) + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '—';
const fmtDT = (s) => { if (!s) return '—'; const d = new Date(s); return `${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const daysBetween = (a, b) => Math.round((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 864e5);

/* ---------- turunan data (rumus sama dengan aplikasi RMODA Studio) ---------- */
const STAGE_AFTER = { ppf: { prepd: ['pasang', 'rakit', 'detailing', 'coating', 'finishing', 'qc'] } };
function stOf(job, div, k) {
  const st = job.stages?.[div] || {};
  if (st[k]?.s) return st[k].s;
  const af = STAGE_AFTER[div]?.[k];
  return af && af.some(x => st[x]?.s === 'done') ? 'done' : 'todo';
}
function divState(job, div) {
  const st = job.stages?.[div] || {};
  const list = DIVS[div].stages.map(([k, label]) => ({ k, label, s: stOf(job, div, k), at: st[k]?.at, by: st[k]?.by }));
  const counted = list.filter(x => x.s !== 'skip');
  const cur = counted.find(x => x.s !== 'done') || null;
  const doneN = counted.filter(x => x.s === 'done').length;
  return { div, list, cur, done: !cur, pct: counted.length ? Math.round(doneN / counted.length * 100) : 100 };
}
function finishOf(job) {
  let last = '';
  for (const d of job.divs || []) for (const s of Object.values(job.stages?.[d] || {})) if (s && s.s !== 'todo' && s.at && s.at > last) last = s.at;
  return last ? dayOf(last) : dayOf(job.lastAt);
}
const revSt = (r) => r.status || (r.done ? 'ok' : 'open');

/* Area bengkel (sama dengan ISO_ZONES / ISO_MAP / isoZoneOf di aplikasi): tiap mobil aktif ada di satu area */
const ZONES = [
  ['cuci', 'Cuci', '#4FA3D9'], ['bongkar', 'Bongkar & Rakit', '#8C8C86'], ['las', 'Las & Dempul', '#D98E2B'],
  ['booth', 'Booth Cat', '#C1161D'], ['poles', 'Poles & Detailing', '#7A5BC4'], ['ready', 'Siap diambil', '#1C7A4B'],
  ['qc', 'QC', '#2C8C8C'], ['coating', 'Coating', '#3B6FD1'], ['ppf', 'PPF', '#B8577E'], ['vendor', 'Tunggu vendor', '#6F6F6B'],
];
const ZONE_MAP = {
  bodyworks: { cuci: 'cuci', bongkar: 'bongkar', las: 'las', dempul: 'las', epoxy: 'booth', sppf: 'booth', cat: 'booth', pc: 'poles', rakit: 'bongkar', finishing: 'poles', qc: 'qc' },
  ppf: { cuci: 'cuci', bongkar: 'bongkar', pasang: 'ppf', rakit: 'bongkar', detailing: 'poles', coating: 'coating', finishing: 'poles', qc: 'qc' },
  coating: { innerfender: 'cuci', engine: 'cuci', clay: 'cuci', exterior: 'poles', interior: 'poles', pc: 'poles', coating: 'coating', finishing: 'poles', qc: 'qc' },
  vendor: { lepas: 'bongkar', kirim: 'vendor', kerja: 'vendor', terima: 'vendor', qc: 'qc', pasang: 'bongkar' },
};
const ZONE_ORDER = ['bodyworks', 'ppf', 'coating', 'vendor'];
// Semua divisi selesai -> Siap diambil; selain itu area dari tahap berjalan di divisi pertama (urut Bodyworks, PPF, Coating, Vendor) yang belum selesai
function zoneOf(j) {
  if (j.complete) return 'ready';
  for (const d of ZONE_ORDER) { const p = j.divStates.find(x => x.div === d); if (p && !p.done) return ZONE_MAP[d][p.cur.k] || 'bongkar'; }
  return 'cuci';
}
const posText = (j) => j.divStates.map(p => DIVS[p.div].label + ' · ' + (p.done ? 'selesai' : p.cur.label)).join('  /  ');
function enrich(job, today, handover) {
  const divs = (job.divs || []).filter(d => DIVS[d]).map(d => divState(job, d));
  const complete = divs.length > 0 && divs.every(d => d.done);
  // Serah terima: status "done" di Work Tracker, atau tanggal serah dari transaksi SA (hanya bila semua tahap selesai)
  const t = handover.find(h => h.wtJob === job.id) || (job.woNo ? handover.find(h => h.woCode === job.woNo || (h.woAlias || []).includes(job.woNo)) : null);
  // Serah hanya dari catatan SA, dan hanya bila semua tahap selesai. Status done di WT tidak dihitung.
  const serah = acceptedSerah(job, t?.serah || '');
  const handed = !!serah;
  const handedDate = serah;
  const end = handed ? (handedDate || today) : today;
  const lateBy = job.target ? daysBetween((complete ? finishOf(job) : null) || end, job.target) : null;
  const revs = Object.entries(job.revs || {}).map(([id, r]) => ({ id, ...r, st: revSt(r) })).filter(r => !r.void);
  const st = job.stages?.vendor || {};
  return {
    ...job, divStates: divs, complete, handed, handedDate, active: !handed && !job.nonaktif, ready: !handed && complete && !job.nonaktif,
    late: lateBy !== null && lateBy > 0, lateBy, lateOpen: lateBy > 0 && !complete && !handed,
    noTarget: !handed && !job.target,
    atVendor: !handed && (job.divs || []).includes('vendor') && st.kirim?.s === 'done' && st.terima?.s !== 'done',
    openRevs: revs.filter(r => r.st !== 'ok'), revList: revs,
    days: job.inDate ? Math.max(0, daysBetween(end, job.inDate)) : null,
  };
}

export async function viewWork(ctx) {
  const { $, esc, api, setHead, perms, toast } = ctx;
  setHead('Work Tracker');
  const view = $('#view');
  view.innerHTML = `<div class="empty"><p class="muted">Memuat data Work Tracker…</p></div>`;

  // Data Service Advisor hanya terbaca untuk Owner & peran Service Advisor (RLS); peran lain tidak memuatnya sama sekali.
  const saAllowed = perms.owner || perms.can('sa');
  const [docs, sync, saDocs, saSync] = await Promise.all([api.listDocs('work'), api.lastSync('work'),
    saAllowed ? api.listDocs('sa').catch(() => []) : [], saAllowed ? api.lastSync('sa').catch(() => null) : null]);
  const hasSA = saDocs.length > 0;
  const SA = hasSA ? saForJob(saDocs) : null;
  const by = (coll) => docs.filter(d => d.coll === coll);
  const team = by('config').find(d => d.id === 'team')?.data?.members || {};
  const prof = by('config').find(d => d.id === 'profiles')?.data?.names || {};
  const people = Object.fromEntries(by('people').map(d => [d.id, d.data]));
  const who = (id) => !id ? '—' : people[id]?.name || prof[id] || (team[id] ? ROLE[team[id].role] || 'Anggota tim' : 'Anggota tim');

  const today = isoDay(new Date());
  const month = today.slice(0, 7);
  const handover = by('handover').map(d => d.data).filter(h => !h.batal);
  const jobs = by('jobs').map(d => enrich({ id: d.id, ...d.data }, today, handover));

  if (!jobs.length && !hasSA) {
    view.innerHTML = `<div class="empty"><h2>Belum ada data yang bisa kamu lihat</h2>
      <p class="muted">Data Work Tracker belum disalin, atau unit kamu tidak punya akses ke Work Tracker.</p></div>`;
    return;
  }

  const locs = LOCS.filter(l => jobs.some(j => j.loc === l));
  const st = { tab: 'ringkasan', loc: '', q: '', list: 'aktif', div: 'bodyworks', zone: 'cuci' };

  let mode = 'wt';
  const routeNow = location.hash.replace(/^#\/?/, '');
  try {
    if (hasSA && /(?:^|\/)sa$/.test(routeNow)) mode = 'sa';
    else if (hasSA && !routeNow.startsWith('m/work') && localStorage.getItem('rmoda-portal-wtmode') === 'sa') mode = 'sa';
  } catch (e) {}
  view.innerHTML = `
    ${hasSA ? `<div class="modebar" role="tablist" aria-label="Pilih aplikasi">
      <button role="tab" data-mode="wt" aria-selected="${mode === 'wt'}">Work Tracker</button>
      <button role="tab" data-mode="sa" aria-selected="${mode === 'sa'}">Service Advisor${SA.waiting ? ` <span class="mb-n" title="Konfirmasi menunggu jawaban">${SA.waiting}</span>` : ''}</button>
    </div>` : ''}
    <div id="wtPane" class="wt-pane" ${mode === 'wt' ? '' : 'hidden'}></div>
    ${hasSA ? `<div id="saPane" class="wt-pane" ${mode === 'sa' ? '' : 'hidden'}></div>` : ''}`;

  const scope = () => jobs.filter(j => !st.loc || j.loc === st.loc);
  const plate = (j) => `<span class="plate">${esc(j.plate || '—')}</span>`;
  const carLine = (j) => `${esc(j.car || '')}${j.color ? ` · <span class="muted">${esc(j.color)}</span>` : ''}`;
  const targetBadge = (j) => j.handed ? `<span class="badge ${j.late ? 'bad' : 'ok'}">Diserahkan ${esc(fmtDs(j.handedDate))}${j.late ? ' · telat ' + j.lateBy + ' hr' : ''}</span>`
    : j.ready ? `<span class="badge info">Selesai QC · Siap serah SA</span>`
    : j.lateOpen ? `<span class="badge bad">Lewat target ${esc(fmtDs(j.target))}</span>`
    : j.target ? `<span class="badge off">Target ${esc(fmtDs(j.target))}</span>` : `<span class="badge warn">Belum ada target</span>`;

  /* ---------- Ringkasan ---------- */
  function drawSummary() {
    const J = scope();
    const working = J.filter(j => j.active);
    const perLoc = locs.map(l => `${l} ${working.filter(j => j.loc === l).length}`).join(' · ');
    const doneMonth = J.filter(j => j.handed && j.handedDate.slice(0, 7) === month);
    const onTime = doneMonth.filter(j => j.target && !j.late).length;
    const avg = doneMonth.length ? Math.round(doneMonth.reduce((n, j) => n + (j.days || 0), 0) / doneMonth.length) : null;
    const tiles = [
      ['Sedang dikerjakan', working.length, st.loc ? 'di ' + st.loc : perLoc, ''],
      ['Lewat target', working.filter(j => j.lateOpen).length, 'perlu dikejar', 'bad'],
      ['Belum ada target', working.filter(j => !j.target).length, 'ditentukan Kepala Bengkel', 'warn'],
      ['Revisi belum OK', working.reduce((n, j) => n + j.openRevs.length, 0), 'lihat bagian Revisi', 'warn'],
      ['Di vendor', working.filter(j => j.atVendor).length, 'barang sedang di vendor', 'info'],
      ['Selesai bulan ini', doneMonth.length, doneMonth.length ? `${onTime} tepat waktu${avg !== null ? ' · rata-rata ' + avg + ' hari' : ''}` : 'belum ada serah terima', 'ok'],
    ];
    const load = Object.entries(DIVS).map(([k, d]) => {
      // Sama seperti aplikasi: semua mobil aktif yang punya divisi ini, termasuk yang sudah selesai di divisi ini
      const inDiv = working.filter(j => (j.divs || []).includes(k));
      const per = (j) => j.divStates.find(x => x.div === k);
      const ready = inDiv.filter(j => per(j)?.done).length;
      const late = inDiv.filter(j => j.lateOpen).length;
      const rows = d.stages.map(([sk, label]) => [label, inDiv.filter(j => per(j)?.cur?.k === sk).length]).filter(r => r[1]);
      if (ready) rows.push(['Selesai di divisi ini', ready, 'ok']);
      const max = Math.max(1, ...rows.map(r => r[1]));
      return `<section class="card wt-load"><header><h3><span class="wt-big">${inDiv.length}</span> ${d.label}</h3>${late ? `<span class="badge bad">${late} lewat target</span>` : ''}</header>
        ${rows.map(([l, n, c]) => `<div class="wt-meter ${c || ''}"><span>${esc(l)}</span><i><b style="width:${n / max * 100}%"></b></i><em>${n}</em></div>`).join('') || '<p class="muted tiny">Tidak ada mobil.</p>'}</section>`;
    }).join('');
    $('#wt').innerHTML = `
      <div class="wt-stats">${tiles.map(([l, n, s, t]) => `<div class="wt-stat ${t}"><small>${l}</small><b>${n}</b><span>${esc(s)}</span></div>`).join('')}</div>
      <h2 class="wt-h">Beban per divisi</h2>
      <div class="wt-loads">${load}</div>`;
  }

  /* ---------- Papan kerja ---------- */
  function drawBoard() {
    const J = scope().filter(j => j.active);
    const d = DIVS[st.div];
    const inDiv = J.filter(j => j.divStates.some(x => x.div === st.div && !x.done));
    $('#wt').innerHTML = `
      <div class="wt-seg" role="group" aria-label="Divisi">${Object.entries(DIVS).map(([k, x]) => {
        const n = J.filter(j => j.divStates.some(s => s.div === k && !s.done)).length;
        return `<button data-div="${k}" aria-pressed="${k === st.div}">${x.label} <span class="muted">${n}</span></button>`; }).join('')}</div>
      <div class="wt-board">${d.stages.map(([k, label], i) => {
        const cards = inDiv.filter(j => j.divStates.find(x => x.div === st.div).cur?.k === k)
          .sort((a, b) => (a.target || '9999').localeCompare(b.target || '9999'));
        return `<section class="wt-col"><header><span class="muted">${pad(i + 1)}</span> <b>${esc(label)}</b><span class="wt-n">${cards.length}</span></header>
          ${cards.map(j => `<button class="wt-card" data-job="${esc(j.id)}">
            <div>${plate(j)} <span class="chip">${esc(j.loc)}</span></div>
            <b>${carLine(j)}</b><small class="muted">${esc(j.customer || '')}</small>
            <div class="wt-tags">${targetBadge(j)}${j.openRevs.length ? `<span class="badge warn">${j.openRevs.length} revisi</span>` : ''}${j.days != null ? `<small class="muted">hari ke-${j.days}</small>` : ''}</div>
          </button>`).join('') || '<p class="muted tiny">Kosong</p>'}</section>`;
      }).join('')}</div>`;
  }

  /* ---------- Area bengkel (Cuci, Bongkar & Rakit, ... , Tunggu vendor) ---------- */
  // Label status sama dengan targetPill di aplikasi
  const statusPill = (j) => {
    if (j.handed) return !j.target ? '<span class="badge off">Tanpa target</span>' : j.late ? `<span class="badge bad">Telat ${j.lateBy} hari</span>` : '<span class="badge ok">Tepat waktu</span>';
    if (j.complete) return '<span class="badge ok">Selesai QC · Siap serah SA</span>';
    if (!j.target) return '<span class="badge warn">Belum ada target</span>';
    if (j.lateBy > 0) return `<span class="badge bad">Lewat ${j.lateBy} hari</span>`;
    if (j.lateBy === 0) return '<span class="badge warn">Target hari ini</span>';
    if (j.lateBy === -1) return '<span class="badge warn">Target besok</span>';
    return `<span class="badge off">Target ${esc(fmtDs(j.target))}</span>`;
  };
  function drawArea() {
    const J = scope().filter(j => j.active).map(j => ({ j, z: zoneOf(j) }));
    const n = (id) => J.filter(a => a.z === id).length;
    const z = ZONES.find(x => x[0] === st.zone) || ZONES[0];
    // Urutan sama dengan denah di aplikasi: tanggal masuk, lalu no. job
    const list = J.filter(a => a.z === z[0]).map(a => a.j)
      .sort((a, b) => (a.inDate || '').localeCompare(b.inDate || '') || a.id.localeCompare(b.id));
    const late = list.filter(j => j.lateOpen).length;
    $('#wt').innerHTML = `
      <p class="lead">${J.length} mobil sedang dikerjakan${st.loc ? ' di ' + esc(st.loc) : ''}. Tiap mobil ada di satu area, sesuai tahap yang sedang berjalan.</p>
      <div class="wz-grid" role="group" aria-label="Area bengkel">${ZONES.map(([id, l, c]) =>
        `<button class="wz-btn" data-zone="${id}" aria-pressed="${id === z[0]}"><i style="background:${c}"></i><span>${esc(l)}</span><b>${n(id)}</b></button>`).join('')}</div>
      <h2 class="wt-h"><i class="wz-dot" style="background:${z[2]}"></i>${esc(z[1])} <span class="muted">${list.length} mobil</span>${late ? ` <span class="badge bad">${late} lewat target</span>` : ''}</h2>
      <p class="muted tiny">${z[0] === 'ready' ? 'Semua tahap di semua divisi sudah selesai, tinggal serah terima ke customer.' : z[0] === 'vendor' ? 'Barang sudah dikirim ke vendor (tahap Kirim, Dikerjakan vendor, atau Diterima kembali sedang berjalan).' : 'Mobil yang tahap berjalannya ada di area ini.'}</p>
      <div class="tablewrap"><table class="tbl wt-tbl"><thead><tr><th>Mobil</th><th>Customer</th><th>Lokasi</th><th>Posisi</th><th>Masuk</th><th>Status</th></tr></thead>
      <tbody>${list.map(j => `<tr data-job="${esc(j.id)}" tabindex="0" class="${j.lateOpen ? 'wz-late' : ''}">
        <td>${plate(j)}<br><b>${carLine(j)}</b><br><small class="muted">${esc(j.no || j.id)}</small></td>
        <td>${esc(j.customer || '—')}</td><td>${esc(j.loc || '—')}</td>
        <td><small>${esc(posText(j) || 'Belum ada divisi')}</small></td>
        <td><small>${esc(fmtDs(j.inDate))}</small>${j.days != null ? `<br><small class="muted">${j.days} hr</small>` : ''}</td>
        <td>${statusPill(j)}${j.openRevs.length ? `<br><span class="badge warn">${j.openRevs.length} revisi belum OK</span>` : ''}${j.atVendor && j.vendorName ? `<br><small class="muted">Vendor: ${esc(j.vendorName)}</small>` : ''}</td></tr>`).join('')
        || `<tr><td colspan="6" class="muted">Tidak ada mobil di area ini.</td></tr>`}</tbody></table></div>`;
  }

  /* ---------- Tim & Peran (khusus Owner, sama dengan aplikasi; lihat saja) ---------- */
  function drawTeam() {
    const ids = [...new Set(Object.keys(people).concat(Object.keys(team)))];
    const nm = (id) => (team[id]?.name || '').trim() || (people[id]?.name || '').trim() || prof[id] || 'Anggota tim';
    const rows = ids.map(id => ({ id, m: team[id] || { role: '' }, p: people[id] || {} }))
      .filter(x => !st.loc || !x.m.loc || x.m.loc === st.loc)
      .sort((a, b) => (a.m.loc || '').localeCompare(b.m.loc || '') || (a.m.role || 'zz').localeCompare(b.m.role || 'zz') || nm(a.id).localeCompare(nm(b.id)));
    const cnt = (r) => rows.filter(x => x.m.role === r).length;
    $('#wt').innerHTML = `
      <p class="lead">${rows.length} orang${st.loc ? ' (lokasi ' + esc(st.loc) + ' atau semua lokasi)' : ''} · ${cnt('sa')} Service Advisor · ${cnt('kabeng')} Kepala Bengkel · ${cnt('kadiv')} Kepala Divisi${rows.length - cnt('sa') - cnt('kabeng') - cnt('kadiv') ? ` · ${rows.length - cnt('sa') - cnt('kabeng') - cnt('kadiv')} belum diatur` : ''}</p>
      <div class="tablewrap"><table class="tbl"><thead><tr><th>Nama</th><th>Peran</th><th>Divisi</th><th>Lokasi</th><th>Pertama membuka</th></tr></thead>
      <tbody>${rows.map(({ id, m, p }) => `<tr>
        <td><b>${esc(nm(id))}</b>${m.name && p.name && m.name.trim() !== p.name.trim() ? `<br><small class="muted">Ditulis sendiri: ${esc(p.name)}</small>` : ''}</td>
        <td>${m.role && ROLE[m.role] ? esc(ROLE[m.role]) : '<span class="badge warn">Belum diatur (hanya lihat)</span>'}</td>
        <td>${m.role === 'kadiv' ? esc(m.div === 'all' ? 'Semua divisi' : DIVS[m.div || 'bodyworks']?.label || m.div) : '<span class="muted">—</span>'}</td>
        <td>${m.role && m.loc ? esc(m.loc) : m.role ? '<span class="muted">Semua lokasi</span>' : '<span class="muted">—</span>'}</td>
        <td><small>${esc(fmtD(p.joinedAt))}</small></td></tr>`).join('') || `<tr><td colspan="5" class="muted">Belum ada anggota tim.</td></tr>`}</tbody></table></div>
      <h2 class="wt-h">Hak tiap peran</h2>
      <div class="tablewrap"><table class="tbl"><thead><tr><th>Peran</th><th>Boleh</th></tr></thead><tbody>
        <tr><td><b>Service Advisor</b></td><td>Input mobil masuk &amp; work order, ubah data mobil, hapus mobil yang belum serah terima. Melihat semua progres. Bila lokasinya diatur, hanya untuk mobil di lokasi itu.</td></tr>
        <tr><td><b>Kepala Bengkel</b></td><td>Menentukan target selesai &amp; prioritas, centang tahapan semua divisi, catat &amp; cek revisi sampai QC final. Serah terima dicatat Service Advisor. Bila lokasinya diatur, hanya untuk mobil di lokasi itu.</td></tr>
        <tr><td><b>Kepala Divisi</b></td><td>Centang tahapan &amp; catat revisi di divisinya saja.</td></tr>
        <tr><td><b>Owner</b></td><td>Semua, termasuk mengatur peran dan menghapus data.</td></tr>
      </tbody></table></div>
      <p class="muted tiny">Peran diatur di aplikasi RMODA Studio di Claude (menu Tim &amp; Peran).</p>`;
  }

  /* ---------- Daftar mobil ---------- */
  function drawList() {
    const q = st.q.toLowerCase();
    const J = scope().filter(j => (st.list === 'aktif' ? j.active : !j.active))
      .filter(j => !q || [j.plate, j.car, j.customer, j.no, j.woNo, j.phone].join(' ').toLowerCase().includes(q))
      .sort((a, b) => st.list === 'aktif' ? (a.target || '9999').localeCompare(b.target || '9999') : (b.handedDate || '').localeCompare(a.handedDate || ''));
    const nAct = scope().filter(j => j.active).length, nDone = scope().length - nAct;
    $('#wt').innerHTML = `
      <div class="toolbar">
        <div class="wt-seg" role="group" aria-label="Status"><button data-list="aktif" aria-pressed="${st.list === 'aktif'}">Dikerjakan ${nAct}</button><button data-list="selesai" aria-pressed="${st.list === 'selesai'}">Sudah serah terima ${nDone}</button></div>
        <input class="inp" id="wtq" placeholder="Cari nopol, customer, mobil, no. job" value="${esc(st.q)}" aria-label="Cari mobil">
      </div>
      <div class="tablewrap"><table class="tbl wt-tbl"><thead><tr><th>Mobil</th><th>Customer</th><th>Lokasi</th><th>Progres divisi</th><th>Masuk</th><th>Status</th></tr></thead>
      <tbody>${J.map(j => `<tr data-job="${esc(j.id)}" tabindex="0">
        <td>${plate(j)}<br><b>${carLine(j)}</b><br><small class="muted">${esc(j.no)}</small></td>
        <td>${esc(j.customer || '—')}</td><td>${esc(j.loc)}</td>
        <td>${j.divStates.map(s => `<div class="wt-prog"><span>${DIVS[s.div].label}</span><i><b style="width:${s.pct}%"></b></i><small>${s.done ? 'Selesai' : esc(s.cur.label)}</small></div>`).join('') || '<span class="muted">—</span>'}</td>
        <td><small>${esc(fmtDs(j.inDate))}</small>${j.days != null ? `<br><small class="muted">${j.days} hr</small>` : ''}</td>
        <td>${targetBadge(j)}${j.openRevs.length ? `<br><span class="badge warn">${j.openRevs.length} revisi</span>` : ''}</td></tr>`).join('')
        || `<tr><td colspan="6" class="muted">Tidak ada mobil yang cocok.</td></tr>`}</tbody></table></div>`;
    const inp = $('#wtq'); inp.oninput = () => { st.q = inp.value; const pos = inp.selectionStart; drawList(); const n = $('#wtq'); n.focus(); n.setSelectionRange(pos, pos); };
  }

  /* ---------- Revisi ---------- */
  function drawRevs() {
    const rows = scope().flatMap(j => j.revList.map(r => ({ j, r })))
      .sort((a, b) => (a.r.st === 'ok') - (b.r.st === 'ok') || (b.r.at || '').localeCompare(a.r.at || ''));
    const open = rows.filter(x => x.r.st !== 'ok' && x.j.active);
    $('#wt').innerHTML = `
      <p class="lead">${open.length} revisi belum OK pada mobil yang sedang dikerjakan, dari ${rows.length} revisi tercatat.</p>
      <div class="tablewrap"><table class="tbl"><thead><tr><th>Mobil</th><th>Pekerjaan &amp; catatan</th><th>Divisi</th><th>Dicatat</th><th>Status</th></tr></thead>
      <tbody>${rows.map(({ j, r }) => `<tr data-job="${esc(j.id)}" tabindex="0">
        <td>${plate(j)}<br><small>${carLine(j)}</small></td>
        <td><b>${esc(r.itemT || '—')}</b><br><small class="muted">${esc(r.note || '')}</small></td>
        <td>${esc(DIVS[r.div]?.label || r.div || '—')}</td>
        <td><small>${esc(fmtDT(r.at))}<br>${esc(who(r.by))}</small></td>
        <td>${r.st === 'ok' ? `<span class="badge ok">OK</span><br><small class="muted">${esc(fmtDs(r.okAt))}</small>` : (r.st === 'fixed' ? `<span class="badge warn">Menunggu dicek</span>` : `<span class="badge bad">Belum diperbaiki</span>`)}</td></tr>`).join('')
        || `<tr><td colspan="5" class="muted">Belum ada revisi.</td></tr>`}</tbody></table></div>`;
  }

  /* ---------- Detail mobil ---------- */
  function openJob(id) {
    const j = jobs.find(x => x.id === id); if (!j) return;
    const dlg = $('#dlg'); dlg.classList.add('dlg--wide');
    const logs = Object.values(j.log || {}).sort((a, b) => (b.at || '').localeCompare(a.at || ''));
    const items = j.woItems || [];
    dlg.innerHTML = `<div class="dlg">
      <div class="wt-dh"><div>${plate(j)} <span class="chip">${esc(j.loc)}</span> <span class="muted tiny">${esc(j.no)}${j.woNo ? ' · WO ' + esc(j.woNo) : ''}</span>
        <h2>${carLine(j)}${j.year ? ` <span class="muted">${esc(j.year)}</span>` : ''}</h2></div>
        <button class="iconbtn" data-close aria-label="Tutup">×</button></div>
      <div class="wt-facts">
        <div><small>Customer</small><b>${esc(j.customer || '—')}</b><span class="muted">${esc(j.phone || '')}</span></div>
        <div><small>Masuk</small><b>${esc(fmtD(j.inDate))}</b><span class="muted">${j.days != null ? j.days + ' hari' : ''}</span></div>
        <div><small>Target</small><b>${esc(fmtD(j.target))}</b><span class="muted">${j.target0 && j.target0 !== j.target ? 'awal ' + esc(fmtDs(j.target0)) : ''}</span></div>
        <div><small>Status</small>${targetBadge(j)}${j.priority && PRI[j.priority] ? ` <span class="badge ${PRI[j.priority][0]}">${PRI[j.priority][1]}</span>` : ''}</div>
      </div>
      ${j.note ? `<p class="note">${esc(j.note)}</p>` : ''}
      ${SA ? saJobHtml(j) : ''}
      <h3>Tahapan</h3>
      ${j.divStates.map(s => `<div class="wt-steps"><b>${DIVS[s.div].label}</b><ol>${s.list.map(x =>
        `<li class="${x.s === 'done' ? 'is-done' : x.s === 'skip' ? 'is-skip' : s.cur?.k === x.k ? 'is-cur' : ''}" title="${x.at ? esc(fmtDT(x.at) + ' · ' + who(x.by)) : ''}">${esc(x.label)}</li>`).join('')}</ol></div>`).join('') || '<p class="muted">Belum ada divisi.</p>'}
      ${items.length ? `<h3>Daftar pekerjaan (WO)</h3><ul class="wt-items">${items.map(it => `<li><span class="chip">${esc(DIVS[it.div]?.label || it.div || '—')}</span> ${esc(it.t)}</li>`).join('')}</ul>` : ''}
      ${j.revList.length ? `<h3>Revisi</h3><ul class="wt-items">${j.revList.map(r => `<li>${r.st === 'ok' ? '<span class="badge ok">OK</span>' : r.st === 'fixed' ? '<span class="badge warn">Menunggu dicek</span>' : '<span class="badge bad">Belum diperbaiki</span>'} ${esc(r.itemT || '')}${r.note ? ` — <span class="muted">${esc(r.note)}</span>` : ''}</li>`).join('')}</ul>` : ''}
      <h3>Riwayat</h3>
      <ul class="wt-log">${logs.map(l => `<li><small class="muted">${esc(fmtDT(l.at))} · ${esc(who(l.by))}</small><span>${esc(l.t)}</span></li>`).join('') || '<li class="muted">Belum ada riwayat.</li>'}</ul>
    </div>`;
    dlg.onclick = (e) => {
      if (e.target === dlg || e.target.closest('[data-close]')) return dlg.close();
      const t = e.target.closest('[data-wt-trx],[data-wt-konf]'); if (!t) return;
      dlg.close(); setMode('sa').then(s => t.dataset.wtTrx ? s?.openTrx(t.dataset.wtTrx) : s?.openKonf(t.dataset.wtKonf));
    };
    dlg.onclose = () => dlg.classList.remove('dlg--wide');
    if (!dlg.open) dlg.showModal(); else dlg.scrollTop = 0;
  }

  /* Pembayaran & Konfirmasi dari Service Advisor (sama dengan payPill / konfJobHtml aplikasi) */
  function saJobHtml(j) {
    const x = SA.payOf(j), t = SA.trxOf(j), K = SA.konfOf(j);
    if (!x && !t && !K.length) return '';
    const cls = x && (x.s === 'Lunas' || x.s === 'Lunas di muka') ? 'ok' : x && x.s === 'DP' ? 'warn' : 'off';
    const wait = K.some(k => k.status === 'menunggu');
    return `${x ? `<h3>Pembayaran</h3><div class="wt-tags"><span class="badge ${cls}">${esc(x.s)}</span>${x.l > 0 ? `<span class="badge off">Lebih bayar ${esc(x.rp(x.l))}</span>` : ''}${x.sisa > 0 ? `<span class="muted tiny">sisa ${esc(x.rp(x.sisa))}</span>` : ''}
        ${t ? `<button class="btn btn--s" data-wt-trx="${esc(t.id)}">Buka transaksi SA →</button>` : ''}</div>` : ''}
      ${K.length ? `<h3>Konfirmasi (${K.length}) ${wait ? '<span class="badge bad">Belum dijawab</span>' : ''}</h3>
        <ul class="wt-items">${K.map(k => `<li><button class="sa-linkrow" data-wt-konf="${esc(k.id)}"><b>#${esc(k.no)}</b> · ${esc(k.kategori || '')} <span class="badge ${(SA.KST[k.status] || ['', 'off'])[1]}">${esc((SA.KST[k.status] || [k.status])[0])}</span><br><span>${esc(k.q || '')}</span>${k.jawab ? `<br><small class="muted">Jawab (${esc(k.jawabOleh || '')}): ${esc(k.jawab)}</small>` : ''}</button></li>`).join('')}</ul>` : ''}`;
  }

  /* Mode Work Tracker | Service Advisor */
  let saApi = null;
  const W = {
    job: (id) => jobs.find(x => x.id === id), all: () => jobs, complete: (x) => !!x.complete,
    saMembers: () => Object.entries(team).filter(([, m]) => m && m.role === 'sa').map(([id, m]) => ({ id, name: (m.name || people[id]?.name || prof[id] || '').trim(), loc: m.loc || '' })),
  };
  async function setMode(m) {
    mode = m;
    try { localStorage.setItem('rmoda-portal-wtmode', m); } catch (e) {}
    view.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-selected', b.dataset.mode === m));
    $('#wtPane').hidden = m !== 'wt';
    const pane = $('#saPane'); if (pane) pane.hidden = m !== 'sa';
    setHead(m === 'sa' ? 'Service Advisor' : 'Work Tracker', m === 'sa' ? `<span class="badge info">Lihat saja</span>` : '');
    if (m !== 'sa' || !pane) return null;
    if (!saApi) {
      pane.innerHTML = `<div class="empty"><p class="muted">Memuat Service Advisor…</p></div>`;
      try {
        const mod = await import(`./sa.js?v=${ctx.mv || 1}`);
        saApi = mod.viewSa(ctx, pane, { saDocs, sync: saSync, W, gate, refresh, openJob: (id) => { setMode('wt'); boardApi?.open(id); } });
      } catch (e) { pane.innerHTML = `<div class="empty"><h2>Service Advisor belum bisa dibuka</h2><p class="muted">${esc(e.message)}</p></div>`; return null; }
    }
    return saApi;
  }

  let boardApi = null;
  const { openGate } = await import(`./gate.js?v=${ctx.mv || 42}`);
  const assignments = ctx.me ? await api.myRoles(ctx.me.id).catch(() => []) : [];
  const gate = openGate({ api, me: ctx.me, assignments, roles: ctx.ref?.roles || [] });
  await gate.load();
  const refresh = () => viewWork(ctx);
  view.onclick = (e) => {
    const mb = e.target.closest('[data-mode]'); if (!mb) return;
    const next = mb.dataset.mode === 'sa' ? '#/m/work/sa' : '#/m/work';
    if (location.hash !== next) history.replaceState(null, '', next);
    setMode(mb.dataset.mode);
    document.dispatchEvent(new Event('portal:nav'));
    window.scrollTo?.(0, 0);
  };
  if (jobs.length || gate.demo || gate.writable('work')) {
    const { mountBoard } = await import(`./board.js?v=${ctx.mv || 42}`);
    boardApi = mountBoard({ $, esc, toast, jobs, who, SA, sync, today, gate, refresh, team });
  } else {
    $('#wtPane').innerHTML = `<div class="empty"><h2>Belum ada mobil</h2><p class="muted">Data Work Tracker belum disalin, atau unit ini tidak punya akses.</p></div>`;
  }
  if (mode === 'sa') setMode('sa');
}

/* Ringkasan singkat untuk Beranda portal */
export async function workHomeSummary(api) {
  const [docs, sync] = await Promise.all([api.listDocs('work'), api.lastSync('work')]);
  const today = isoDay(new Date());
  const handover = docs.filter(d => d.coll === 'handover').map(d => d.data).filter(h => !h.batal);
  const jobs = docs.filter(d => d.coll === 'jobs').map(d => enrich({ id: d.id, ...d.data }, today, handover));
  if (!jobs.length) return null;
  const active = jobs.filter(j => j.active);
  const late = active.filter(j => j.lateOpen).sort((a, b) => (a.target || '').localeCompare(b.target || ''));
  return {
    syncAt: sync?.at || null,
    active: active.length,
    late: late.map(j => ({ id: j.id, plate: j.plate, car: j.car, loc: j.loc, target: fmtDs(j.target), lateBy: j.lateBy })),
    noTarget: active.filter(j => !j.target).length,
    openRevs: active.reduce((n, j) => n + j.openRevs.length, 0),
    ready: active.filter(j => j.ready).length,
  };
}
export async function workFeed(api) {
  const docs = await api.listDocs('work');
  const today = isoDay(new Date());
  const handover = docs.filter(d => d.coll === 'handover').map(d => d.data).filter(h => !h.batal);
  const jobs = docs.filter(d => d.coll === 'jobs').map(d => enrich({ id: d.id, ...d.data }, today, handover));
  const events = [];
  for (const j of jobs) for (const l of Object.values(j.log || {})) if (l && l.t) events.push({ at: l.at || '', title: l.t, meta: [j.plate, j.loc].filter(Boolean).join(' · '), job: j.id });
  events.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return events.slice(0, 6);
}
export { fmtDT, enrich, DIVS, LOCS };
