// Modul Setoran (salinan dari aplikasi RMODA Setoran di Claude, lihat saja).
// Rumus status disalin dari aplikasi: invoice belum lunas / lewat tempo, konfirmasi, stok perlu order, pengingat gudang.
// Akses dijaga database (RLS): setoran non-invoice, peran & permintaan akses hanya tersalin untuk Owner.

const CABANG = ['BSD', 'Legok', 'Makassar'];
const JENIS = [
  ['WO', 'Form WO / booking'], ['BAYAR', 'Bukti bayar customer'], ['NOTA', 'Nota pengeluaran'], ['PETTY', 'Petty cash'],
  ['KASBON', 'Kasbon'], ['UM', 'Uang makan (PDF)'], ['GAJI', 'Gaji (PDF)'], ['BK', 'Barang keluar'], ['BM', 'Barang masuk'],
  ['OP', 'Stock opname'], ['LAIN', 'Dokumen lain'],
];
const JK = Object.fromEntries(JENIS);
const STATUS = ['Baru', 'Diunduh', 'Selesai', 'Foto ulang'];
const ST_B = { Baru: 'info', Diunduh: 'warn', Selesai: 'ok', 'Foto ulang': 'bad' };
const TIM = { GUDANG: 'Gudang', KASIR: 'Finance' };
const PENANYA = ['Casper', 'Finci'];
const ROLES = { KASIR: 'Finance', GUDANG: 'Gudang', ADMIN: 'Owner' };
const STOK_B = { Habis: 'bad', 'Perlu order': 'warn', Aman: 'ok', 'Tanpa data': 'off' };
const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isIso = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const tglP = (s) => { if (!isIso(s)) return '—'; const [y, m, d] = s.split('-'); return `${+d} ${BLN[+m - 1]} ${y}`; };
const tglS = (s) => { if (!isIso(s)) return '—'; const [, m, d] = s.split('-'); return `${+d} ${BLN[+m - 1]}`; };
const tglH = (s) => { if (!isIso(s)) return '—'; const [y, m, d] = s.split('-').map(Number); return HARI[new Date(y, m - 1, d).getDay()] + ', ' + tglP(s); };
const wkt = (ms) => { if (!ms) return '—'; const d = new Date(ms); return `${d.getDate()} ${BLN[d.getMonth()]}, ${pad(d.getHours())}.${pad(d.getMinutes())}`; };
const fmtQ = (v) => v === '' || v == null ? '–' : Number(v).toLocaleString('id-ID');
const weekStartIso = (d) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return isoOf(x); };
function lastWorkday(y, m) { const d = new Date(y, m + 1, 0); while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1); return d; }
function prevWorkday(d) { const x = new Date(d); do { x.setDate(x.getDate() - 1); } while (x.getDay() === 0 || x.getDay() === 6); return x; }

/* ---------- rumus dari aplikasi ---------- */
const isInv = (u) => ['BM', 'NOTA'].includes(u.jenis) && u.bayar && u.bayar.st;
const telat = (u, today) => isInv(u) && u.bayar.st === 'belum' && isIso(u.bayar.jt) && u.bayar.jt < today;
const isRiw = (k) => k.status === 'Dijawab' || k.status === 'Selesai';
const effMin = (it, mins) => { const o = mins && mins[it.kode || it.nama]; const v = o != null && o !== '' ? Number(o) : Number(it.min); return isFinite(v) && v > 0 ? v : 0; };
function stokSt(it, mins) { if (it.qty === '' || it.qty == null) return 'Tanpa data'; const q = Number(it.qty), m = effMin(it, mins); if (q <= 0) return 'Habis'; if (m && q <= m) return 'Perlu order'; return 'Aman'; }
const katOf = (it) => (it.kategori || '').trim() || 'Tanpa kategori';

// Stok per lokasi: potongan daftar barang versi terbaru (meta), minus barang terarsip yang stoknya tidak > 0
function opnameOf(docs) {
  const meta = {}, parts = {}, mins = {}, arsip = {};
  for (const d of docs) {
    const x = d.data || {};
    if (d.id.startsWith('meta-')) meta[d.id.slice(5)] = x;
    else if (d.id.startsWith('min-')) mins[d.id.slice(4)] = x.map || {};
    else if (d.id.startsWith('arsip-')) arsip[d.id.slice(6)] = new Set(x.keys || Object.keys(x.map || {}).filter(k => x.map[k]));
    else if (x.lokasi && Array.isArray(x.items)) (parts[x.lokasi] = parts[x.lokasi] || []).push([x.i || 0, x.items, x.ver]);
  }
  const items = {};
  for (const l of Object.keys(meta)) {
    const ar = arsip[l] || new Set();
    items[l] = (parts[l] || []).filter(p => p[2] === meta[l].ver).sort((a, b) => a[0] - b[0]).flatMap(p => p[1])
      .filter(it => !(ar.has(it.kode || it.nama) && !(Number(it.qty) > 0)));
  }
  return { meta, items, mins };
}
const stokWarn = (op, l) => (op.items[l] || []).filter(it => ['Habis', 'Perlu order'].includes(stokSt(it, op.mins[l] || {}))).length;

function load(docs) {
  const by = (c) => docs.filter(d => d.coll === c);
  // Aplikasi hanya memuat 800 setoran terbaru
  const ups = by('upload').map(d => ({ ...d.data, id: d.id })).sort((a, b) => (b.waktu || 0) - (a.waktu || 0)).slice(0, 800);
  const cek = by('cek').map(d => ({ ...d.data, id: d.id }));
  const konf = by('konfirmasi').map(d => ({ ...d.data, id: d.id }));
  const op = opnameOf(by('opname'));
  const nama = Object.fromEntries(by('nama').map(d => [d.id, d.data?.nama]));
  const peran = by('peran').map(d => ({ id: d.id, ...d.data }));
  const minta = by('minta').map(d => ({ id: d.id, ...d.data }));
  return { ups, cek, konf, op, nama, peran, minta };
}

export async function viewSetoran(ctx) {
  const { $, esc, api, setHead, perms } = ctx;
  setHead('Setoran', `<span class="badge info">Lihat saja</span>`);
  const view = $('#view');
  view.innerHTML = `<div class="empty"><p class="muted">Memuat data Setoran…</p></div>`;
  const [docs, sync] = await Promise.all([api.listDocs('setoran'), api.lastSync('setoran')]);
  const D = load(docs);
  const { ups, konf, op } = D;
  if (!ups.length && !konf.length && !Object.keys(op.meta).length) {
    view.innerHTML = `<div class="empty"><h2>Belum ada data yang bisa kamu lihat</h2><p class="muted">Data Setoran belum disalin, atau unit kamu tidak punya akses ke Setoran.</p></div>`;
    return;
  }
  const now = new Date(), today = isoOf(now), ws = weekStartIso(now);
  const owner = !!perms?.owner;
  const hasAll = owner || ups.some(u => !isInv(u)); // setoran non-invoice hanya tersalin untuk Owner
  // Pengingat gudang memakai ringkasan "cek" (staf) atau data setoran lengkap (Owner)
  const gud = [...D.cek, ...ups.filter(u => ['BK', 'OP'].includes(u.jenis))];
  const nm = (id) => (id && D.nama[id]) || (id ? 'Pengguna' : '—');
  const locs = CABANG.filter(c => ups.some(u => u.cabang === c) || konf.some(k => k.lokasi === c) || op.meta[c] || gud.some(u => u.cabang === c));
  const tabs = [['ring', 'Ringkasan'], ...(hasAll ? [['foto', 'Setoran']] : []), ['inv', 'Invoice'], ['konf', 'Konfirmasi'], ['stok', 'Stok bahan'], ...(owner && D.peran.length ? [['akses', 'Pengguna']] : [])];
  const st = { tab: 'ring', loc: '', jenis: '', status: 'Baru', tgl: '', inv: 'belum', kv: 'aktif', tim: '', pen: '', sf: 'order', kat: '', q: '', shown: 60, sloc: locs.find(l => op.meta[l]) || locs[0] || 'BSD' };

  view.innerHTML = `
    <div class="wt-sync"><span>Salinan dari aplikasi <b>RMODA Setoran</b> di Claude${sync ? ` · diperbarui ${esc(tglP(isoOf(new Date(sync.at))))} ${esc(new Date(sync.at).toTimeString().slice(0, 5))}` : ''}.</span>
      <span class="muted">Setor foto, tandai lunas, dan jawab konfirmasi tetap di aplikasi Claude selama masa transisi.</span></div>
    <div class="wt-bar">
      <nav class="wt-tabs" role="tablist" aria-label="Bagian Setoran">${tabs.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${k === st.tab}">${l}</button>`).join('')}</nav>
      ${locs.length > 1 ? `<div class="wt-seg" role="group" aria-label="Lokasi" id="stLoc"><button data-loc="" aria-pressed="true">Semua lokasi</button>${locs.map(l => `<button data-loc="${l}" aria-pressed="false">${l}</button>`).join('')}</div>` : ''}
    </div>
    <div id="wt"></div>`;

  const inLoc = (c) => !st.loc || c === st.loc;
  const badge = (s) => `<span class="badge ${ST_B[s] || 'off'}">${esc(s || '—')}</span>`;
  const pay = (u) => !isInv(u) ? '' : u.bayar.st === 'lunas' ? `<span class="badge ok">Lunas${u.bayar.tgl ? ' ' + esc(tglS(u.bayar.tgl)) : ''}</span>`
    : `<span class="badge ${telat(u, today) ? 'bad' : 'warn'}">${telat(u, today) ? 'Lewat tempo' : 'Belum lunas'}${u.bayar.jt ? ' · ' + esc(tglS(u.bayar.jt)) : ''}</span>`;
  const seg = (key, opts, label) => `<div class="wt-seg" role="group" aria-label="${label}">${opts.map(([v, l]) => `<button data-set="${key}" data-val="${esc(v)}" aria-pressed="${st[key] === v}">${l}</button>`).join('')}</div>`;
  const more = (n) => n > st.shown ? `<button class="btn" data-more>Tampilkan lebih banyak (${n - st.shown} lagi)</button>` : '';
  const upRow = (u) => `<tr data-up="${esc(u.id)}" tabindex="0"><td><b>${esc(JK[u.jenis] || u.jenis)}</b>${u.catatan ? `<br><small class="muted">${esc(u.catatan)}</small>` : ''}</td>
    <td>${esc(u.cabang)}<br><small class="muted">${esc(tglS(u.tanggal))}</small></td><td><small>${esc(nm(u.penyetorId))}<br>setor ${esc(wkt(u.waktu))}</small></td>
    <td><small>${(u.files || []).length} file</small></td><td>${badge(u.status)} ${pay(u)}</td></tr>`;
  const upTable = (rows, empty, head = true) => `<div class="tablewrap"><table class="tbl wt-tbl">${head ? '<thead><tr><th>Jenis</th><th>Lokasi</th><th>Penyetor</th><th>File</th><th>Status</th></tr></thead>' : ''}
    <tbody>${rows || `<tr><td colspan="5" class="muted">${empty}</td></tr>`}</tbody></table></div>`;

  // Pengingat gudang per cabang (rumus "pengingat" aplikasi)
  function gudang(c) {
    const mine = gud.filter(u => u.cabang === c);
    const bk = mine.some(u => u.jenis === 'BK' && u.tanggal === today);
    const H = isoOf(lastWorkday(now.getFullYear(), now.getMonth())), H1 = isoOf(prevWorkday(lastWorkday(now.getFullYear(), now.getMonth())));
    const opMonth = mine.some(u => u.jenis === 'OP' && String(u.tanggal).slice(0, 7) === today.slice(0, 7) && u.tanggal >= H1);
    const spot = mine.some(u => u.jenis === 'OP' && u.tanggal >= ws);
    const late18 = now.getHours() >= 18;
    return { bk, spot, opMonth, H, H1, late18 };
  }

  function drawRing() {
    const U = ups.filter(u => inLoc(u.cabang)), K = konf.filter(k => inLoc(k.lokasi));
    const belum = U.filter(u => isInv(u) && u.bayar.st === 'belum'), lt = belum.filter(u => telat(u, today));
    const menunggu = K.filter(k => k.status === 'Menunggu jawaban');
    const L = locs.filter(inLoc);
    const order = L.reduce((a, l) => a + stokWarn(op, l), 0);
    const ulang = U.filter(u => u.status === 'Foto ulang' && !u.diganti);
    $('#wt').innerHTML = `
      <div class="wt-stats">
        ${hasAll ? `<div class="wt-stat info"><small>Setoran baru</small><b>${U.filter(u => u.status === 'Baru').length}</b><span>belum diunduh Owner</span></div>` : ''}
        <div class="wt-stat ${lt.length ? 'bad' : 'warn'}"><small>Invoice belum lunas</small><b>${belum.length}</b><span>${lt.length} lewat jatuh tempo</span></div>
        <div class="wt-stat ${menunggu.length ? 'bad' : 'ok'}"><small>Konfirmasi menunggu jawaban</small><b>${menunggu.length}</b><span>pertanyaan ke Gudang / Finance</span></div>
        <div class="wt-stat warn"><small>Stok perlu order</small><b>${order}</b><span>habis atau di bawah batas minimum</span></div>
      </div>
      ${ulang.length ? `<p class="note">${ulang.length} setoran diminta foto ulang dan belum diganti.</p>` : ''}
      ${(() => { const n = D.minta.filter(m => !((D.peran.find(p => p.id === m.id) || {}).roles || []).filter(r => ROLES[r]).length).length; return owner && n ? `<p class="note">${n} orang baru menunggu diberi peran di aplikasi Claude.</p>` : ''; })()}
      <h2 class="wt-h">Per lokasi</h2>
      <div class="tablewrap"><table class="tbl"><thead><tr><th>Lokasi</th>${hasAll ? '<th>Setoran baru</th>' : ''}<th>Invoice belum lunas</th><th>Konfirmasi menunggu</th><th>Stok perlu order</th><th>Barang keluar hari ini</th><th>Spot check minggu ini</th><th>Opname bulanan</th></tr></thead><tbody>
      ${L.map(c => {
        const g = gudang(c), m = op.meta[c];
        const b = belum.filter(u => u.cabang === c), bt = b.filter(u => telat(u, today)).length;
        const opm = g.opMonth ? '<span class="badge ok">Sudah</span>' : today === g.H ? '<span class="badge bad">Hari ini</span>' : today === g.H1 ? '<span class="badge warn">Besok</span>' : `<small class="muted">Jadwal ${esc(tglS(g.H))}</small>`;
        return `<tr><td><b>${c}</b></td>${hasAll ? `<td>${U.filter(u => u.cabang === c && u.status === 'Baru').length}</td>` : ''}
          <td>${b.length}${bt ? ` <span class="badge bad">${bt} lewat tempo</span>` : ''}</td>
          <td>${menunggu.filter(k => k.lokasi === c).length}</td>
          <td>${m ? `${stokWarn(op, c)}<br><small class="muted">data ${esc(wkt(m.waktu))}</small>` : '<small class="muted">Belum ada data</small>'}</td>
          <td>${g.bk ? '<span class="badge ok">Sudah disetor</span>' : `<span class="badge ${g.late18 ? 'bad' : 'warn'}">Belum${g.late18 ? ', lewat 18.00' : ''}</span>`}</td>
          <td>${g.spot ? '<span class="badge ok">Sudah</span>' : '<span class="badge warn">Belum</span>'}</td><td>${opm}</td></tr>`;
      }).join('')}</tbody></table></div>
      <p class="note">Pengingat gudang memakai aturan aplikasi: foto Barang Keluar setiap hari (batas 18.00), spot check sekali seminggu (mulai Senin), dan opname bulanan pada hari kerja terakhir bulan ini.</p>`;
  }

  function drawFoto() {
    const base = ups.filter(u => inLoc(u.cabang) && (!st.jenis || u.jenis === st.jenis) && (!st.tgl || u.tanggal === st.tgl));
    const list = base.filter(u => !st.status || u.status === st.status)
      .sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)) || String(a.cabang).localeCompare(String(b.cabang)) || String(a.jenis).localeCompare(String(b.jenis)) || a.waktu - b.waktu);
    const shown = list.slice(0, st.shown); let rows = '', k1 = '';
    for (const u of shown) {
      const k = u.tanggal + '|' + u.cabang;
      if (k !== k1) { rows += `<tr class="st-grp"><td colspan="5"><b>${esc(tglH(u.tanggal))} · ${esc(u.cabang)}</b> <small class="muted">${list.filter(x => x.tanggal === u.tanggal && x.cabang === u.cabang).length} setoran</small></td></tr>`; k1 = k; }
      rows += upRow(u);
    }
    $('#wt').innerHTML = `
      <div class="toolbar">
        <select class="inp inp--s" id="stJenis" aria-label="Jenis"><option value="">Semua jenis</option>${JENIS.map(([k, l]) => `<option value="${k}" ${st.jenis === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input class="inp inp--s" type="date" id="stTgl" value="${esc(st.tgl)}" aria-label="Tanggal dokumen">
        ${st.tgl ? '<button class="btn" data-clrtgl>Semua tanggal</button>' : ''}
      </div>
      <div class="toolbar">${seg('status', [['', `Semua ${base.length}`], ...STATUS.map(s => [s, `${s} ${base.filter(u => u.status === s).length}`])], 'Status')}</div>
      <p class="lead">${list.length} setoran · ${list.reduce((a, u) => a + (u.files || []).length, 0)} file</p>
      ${upTable(rows, 'Tidak ada setoran dengan filter ini.')}${more(list.length)}`;
    $('#stJenis').onchange = (e) => { st.jenis = e.target.value; st.shown = 60; draw(); };
    $('#stTgl').onchange = (e) => { st.tgl = e.target.value; st.shown = 60; draw(); };
  }

  function drawInv() {
    const all = ups.filter(u => inLoc(u.cabang) && isInv(u));
    const belum = all.filter(u => u.bayar.st === 'belum'), lunas = all.filter(u => u.bayar.st === 'lunas');
    const list = st.inv === 'belum'
      ? belum.sort((a, b) => String(a.bayar.jt || '9999').localeCompare(String(b.bayar.jt || '9999')) || String(a.tanggal).localeCompare(String(b.tanggal)))
      : lunas.sort((a, b) => String(b.bayar.tgl || '').localeCompare(String(a.bayar.tgl || '')));
    $('#wt').innerHTML = `
      <div class="wt-stats">
        <div class="wt-stat warn"><small>Belum lunas</small><b>${belum.length}</b><span>Barang masuk & nota pengeluaran</span></div>
        <div class="wt-stat bad"><small>Lewat jatuh tempo</small><b>${belum.filter(u => telat(u, today)).length}</b><span>belum dibayar</span></div>
        <div class="wt-stat ok"><small>Sudah lunas</small><b>${lunas.length}</b><span>ditandai Finance</span></div>
      </div>
      <div class="toolbar">${seg('inv', [['belum', `Belum lunas ${belum.length}`], ['lunas', `Lunas ${lunas.length}`]], 'Status bayar')}</div>
      ${upTable(list.slice(0, st.shown).map(upRow).join(''), st.inv === 'belum' ? 'Semua invoice sudah lunas.' : 'Belum ada invoice lunas.')}${more(list.length)}`;
  }

  function drawKonf() {
    const base = konf.filter(k => inLoc(k.lokasi) && (!st.tim || k.tim === st.tim) && (!st.pen || k.penanya === st.pen));
    const riw = st.kv === 'riwayat';
    const list = base.filter(k => riw ? isRiw(k) : !isRiw(k)).sort((a, b) => riw
      ? ((b.dijawabPada || b.ditutupPada || b.dibuat) - (a.dijawabPada || a.ditutupPada || a.dibuat)) : a.dibuat - b.dibuat);
    const kb = (s) => `<span class="badge ${s === 'Selesai' ? 'ok' : s === 'Dijawab' ? 'info' : 'bad'}">${esc(s)}</span>`;
    const live = (k) => (k.lampiran || []).filter(x => !x.ditarik);
    $('#wt').innerHTML = `
      <div class="toolbar">${seg('kv', [['aktif', `Belum dijawab ${base.filter(k => !isRiw(k)).length}`], ['riwayat', `Riwayat ${base.filter(isRiw).length}`]], 'Tampilan')}
        ${seg('tim', [['', 'Semua tim'], ['GUDANG', 'Gudang'], ['KASIR', 'Finance']], 'Tim')}
        ${seg('pen', [['', 'Semua penanya'], ...PENANYA.map(p => [p, p])], 'Penanya')}</div>
      <div class="tablewrap"><table class="tbl wt-tbl"><thead><tr><th>Pertanyaan</th><th>Tim / lokasi</th><th>Tgl setoran</th><th>${riw ? 'Jawaban' : 'Ditanya'}</th><th>Status</th></tr></thead><tbody>
      ${list.slice(0, st.shown).map(k => `<tr data-konf="${esc(k.id)}" tabindex="0"><td><b>${esc(k.pertanyaan)}</b><br><small class="muted">Penanya ${esc(k.penanya || '—')}</small></td>
        <td>${esc(TIM[k.tim] || k.tim || '—')}<br><small class="muted">${esc(k.lokasi || '')}</small></td><td><small>${esc(tglS(k.tanggal))}</small></td>
        <td><small>${riw ? (k.jawaban ? esc(k.jawaban.length > 140 ? k.jawaban.slice(0, 140) + '…' : k.jawaban) + `<br><span class="muted">${esc(k.penjawab || '—')} · ${esc(wkt(k.dijawabPada))}</span>` : live(k).length ? '(jawaban berupa lampiran)' : 'Ditutup tanpa jawaban') : esc(wkt(k.dibuat))}</small>${live(k).length ? ` <span class="badge off">${live(k).length} lampiran</span>` : ''}</td>
        <td>${kb(k.status)}${riw ? `<br><small class="muted">${k.status === 'Dijawab' ? 'Belum dibaca agent' : 'Sudah dibaca agent'}</small>` : ''}</td></tr>`).join('')
        || `<tr><td colspan="5" class="muted">${riw ? 'Riwayat masih kosong.' : 'Tidak ada pertanyaan yang menunggu jawaban.'}</td></tr>`}</tbody></table></div>${more(list.length)}`;
  }

  function drawStok() {
    const SL = locs.filter(l => op.meta[l]);
    const lok = st.loc && op.meta[st.loc] ? st.loc : (SL.includes(st.sloc) ? st.sloc : SL[0]);
    if (!lok) { $('#wt').innerHTML = `<div class="empty"><p class="muted">Stok ${esc(st.loc || '')} belum ada. Gudang mengunggah data stok dari Accurate di aplikasi Claude.</p></div>`; return; }
    st.sloc = lok;
    const meta = op.meta[lok], all = op.items[lok] || [], mins = op.mins[lok] || {};
    const withSt = all.map(it => ({ it, s: stokSt(it, mins) })), cnt = (s) => withSt.filter(x => x.s === s).length;
    const kats = [...new Set(all.map(katOf))].sort(), ql = st.q.trim().toLowerCase();
    const rank = { Habis: 0, 'Perlu order': 1, 'Tanpa data': 2, Aman: 3 };
    const list = withSt.filter(x => (st.sf === 'semua' || (st.sf === 'order' ? ['Habis', 'Perlu order'].includes(x.s) : x.s === st.sf)) && (!st.kat || katOf(x.it) === st.kat)
      && (!ql || (x.it.nama + ' ' + x.it.kode).toLowerCase().includes(ql))).sort((a, b) => rank[a.s] - rank[b.s] || String(a.it.nama).localeCompare(String(b.it.nama)));
    const old = (Date.now() - (meta.waktu || 0)) / 36e5 > 30;
    const noMin = all.filter(it => !effMin(it, mins)).length;
    $('#wt').innerHTML = `
      ${!st.loc && SL.length > 1 ? `<div class="toolbar">${seg('sloc', SL.map(l => [l, l]), 'Lokasi stok')}</div>` : ''}
      <p class="note">Stok ${esc(lok)} per ${esc(wkt(meta.waktu))} dari Accurate${meta.sumber ? ' (' + esc(meta.sumber) + ')' : ''}.${old ? ' Data belum diperbarui hari ini.' : ''}</p>
      <div class="wt-stats">
        <div class="wt-stat bad"><small>Perlu order</small><b>${cnt('Habis') + cnt('Perlu order')}</b><span>habis + di bawah minimum</span></div>
        <div class="wt-stat warn"><small>Habis</small><b>${cnt('Habis')}</b><span>stok 0 atau kurang</span></div>
        <div class="wt-stat"><small>Semua bahan</small><b>${all.length}</b><span>${noMin} belum punya batas minimum</span></div>
      </div>
      <div class="toolbar">${seg('sf', [['order', 'Perlu order'], ['Habis', 'Habis'], ['semua', 'Semua']], 'Saring stok')}
        <input class="inp" id="stQ" placeholder="Cari nama / kode bahan" value="${esc(st.q)}" aria-label="Cari bahan">
        <select class="inp inp--s" id="stKat" aria-label="Kategori"><option value="">Semua kategori</option>${kats.map(k => `<option ${st.kat === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div>
      <div class="tablewrap"><table class="tbl"><thead><tr><th>Bahan</th><th>Kategori</th><th>Stok</th><th>Minimum</th><th>Status</th></tr></thead><tbody>
      ${list.slice(0, st.shown).map(({ it, s }) => `<tr><td><b>${esc(it.nama)}</b><br><small class="muted">${esc(it.kode || '')}</small></td><td><small>${esc(katOf(it))}</small></td>
        <td>${esc(fmtQ(it.qty))} <small class="muted">${esc(it.satuan || '')}</small></td><td>${effMin(it, mins) ? esc(fmtQ(effMin(it, mins))) : '–'}</td><td><span class="badge ${STOK_B[s]}">${s}</span></td></tr>`).join('')
        || `<tr><td colspan="5" class="muted">${st.sf === 'order' ? 'Tidak ada bahan yang perlu diorder.' : 'Tidak ada bahan dengan filter ini.'}</td></tr>`}</tbody></table></div>${more(list.length)}`;
    const q = $('#stQ');
    q.oninput = () => { st.q = q.value; st.shown = 60; const p = q.selectionStart; draw(); const n = $('#stQ'); n.focus(); n.setSelectionRange(p, p); };
    $('#stKat').onchange = (e) => { st.kat = e.target.value; st.shown = 60; draw(); };
  }

  function drawAkses() {
    const users = D.peran.filter(p => (p.roles || []).length).sort((a, b) => nm(a.id).localeCompare(nm(b.id)));
    const pend = D.minta.filter(m => !((D.peran.find(p => p.id === m.id) || {}).roles || []).length).sort((a, b) => (b.waktu || 0) - (a.waktu || 0));
    $('#wt').innerHTML = `
      ${pend.length ? `<p class="note">${pend.length} orang menunggu diberi peran di aplikasi Claude.</p>` : ''}
      <div class="tablewrap"><table class="tbl"><thead><tr><th>Nama</th><th>Tugas</th><th>Lokasi</th></tr></thead><tbody>
      ${users.map(p => `<tr><td><b>${esc(nm(p.id))}</b></td><td>${(p.roles || []).map(r => `<span class="badge info">${esc(ROLES[r] || r)}</span>`).join(' ')}</td><td><small>${esc((p.cabangs || [p.cabang]).filter(Boolean).join(', '))}</small></td></tr>`).join('')
        || '<tr><td colspan="3" class="muted">Belum ada pengguna.</td></tr>'}</tbody></table></div>
      ${pend.length ? `<h2 class="wt-h">Menunggu peran</h2><ul class="wt-items">${pend.map(m => `<li>${esc(nm(m.id))} <span class="muted">· minta akses ${esc(wkt(m.waktu))}</span></li>`).join('')}</ul>` : ''}`;
  }

  function openDlg(html) {
    const dlg = $('#dlg'); dlg.classList.add('dlg--wide');
    dlg.innerHTML = `<div class="dlg">${html}</div>`;
    dlg.onclick = (e) => { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); else { const t = e.target.closest('[data-up]'); if (t) openUp(t.dataset.up); } };
    dlg.onclose = () => dlg.classList.remove('dlg--wide');
    if (!dlg.open) dlg.showModal();
  }
  function openUp(id) {
    const u = ups.find(x => x.id === id); if (!u) return;
    const b = isInv(u) ? u.bayar : null;
    openDlg(`<div class="wt-dh"><div><span class="muted tiny">${esc(u.id)}</span><h2>${esc(JK[u.jenis] || u.jenis)}</h2></div><button class="iconbtn" data-close aria-label="Tutup">×</button></div>
      <div class="wt-facts">
        <div><small>Lokasi</small><b>${esc(u.cabang)}</b></div>
        <div><small>Tanggal dokumen</small><b>${esc(tglH(u.tanggal))}</b></div>
        <div><small>Penyetor</small><b>${esc(nm(u.penyetorId))}</b><span class="muted">${esc(wkt(u.waktu))}</span></div>
        <div><small>Status</small><b>${badge(u.status)}</b></div>
        ${b ? `<div><small>Pembayaran</small><b>${pay(u)}</b><span class="muted">${b.st === 'lunas' ? 'dibayar ' + esc(tglP(b.tgl)) + (b.olehId ? ' · ' + esc(nm(b.olehId)) : '') : b.jt ? 'jatuh tempo ' + esc(tglP(b.jt)) : 'tanpa jatuh tempo'}</span></div>` : ''}
      </div>
      ${u.status === 'Foto ulang' ? `<p class="note">Diminta foto ulang: ${esc(u.alasanUlang || '—')}</p>` : ''}
      ${u.catatan ? `<p class="note">Catatan: ${esc(u.catatan)}</p>` : ''}
      ${b?.catatan ? `<p class="note">Catatan lunas: ${esc(b.catatan)}</p>` : ''}
      <h3>File (${(u.files || []).length})</h3><ul class="wt-items">${(u.files || []).map((f, i) => `<li>${i + 1}. ${esc(f.name || 'file')} <span class="muted">· ${f.type === 'application/pdf' ? 'PDF' : 'Foto'}${f.size ? ' · ' + Math.max(1, Math.round(f.size / 1024)) + ' KB' : ''}${f.bukti ? ' · bukti bayar' : ''}</span></li>`).join('')}</ul>
      <p class="muted tiny">Foto dan PDF hanya bisa dibuka di aplikasi Claude.</p>
      ${u.diganti ? '<p class="muted">Sudah diganti dengan setoran foto baru.</p>' : ''}
      ${(u.log || []).length ? `<h3>Riwayat</h3><ul class="wt-log">${[...u.log].reverse().map(l => `<li><small class="muted">${esc(wkt(l.waktu))} · ${esc(nm(l.olehId))}</small><span>${esc(l.aksi || '')}</span></li>`).join('')}</ul>` : ''}`);
  }
  function openKonf(id) {
    const k = konf.find(x => x.id === id); if (!k) return;
    const u = k.uploadId ? ups.find(x => x.id === k.uploadId) : null;
    const lam = k.lampiran || [];
    openDlg(`<div class="wt-dh"><div><span class="muted tiny">${esc(k.id)}</span><h2>Konfirmasi</h2></div><button class="iconbtn" data-close aria-label="Tutup">×</button></div>
      <div class="wt-facts">
        <div><small>Status</small><b>${esc(k.status)}</b></div><div><small>Tim</small><b>${esc(TIM[k.tim] || k.tim || '—')}</b></div>
        <div><small>Lokasi</small><b>${esc(k.lokasi || '—')}</b></div><div><small>Penanya</small><b>${esc(k.penanya || '—')}</b></div>
        <div><small>Tgl setoran</small><b>${esc(tglP(k.tanggal))}</b></div><div><small>Ditanya</small><b>${esc(wkt(k.dibuat))}</b></div>
      </div>
      <h3>Pertanyaan</h3><p>${esc(k.pertanyaan)}</p>
      <h3>Jawaban</h3>${k.jawaban ? `<p>${esc(k.jawaban)}</p><p class="muted">${esc(k.penjawab || '—')} · ${esc(wkt(k.dijawabPada))}${k.status === 'Menunggu jawaban' ? ' · jawaban sebelumnya, ditanya ulang' : ''}</p>` : `<p class="muted">${k.status === 'Selesai' ? 'Ditutup tanpa jawaban.' : 'Belum dijawab.'}</p>`}
      ${lam.length ? `<h3>Lampiran</h3><ul class="wt-items">${lam.map(x => `<li>${esc(x.name || 'file')} <span class="muted">· ${esc(nm(x.olehId))} · ${esc(wkt(x.waktu))}${x.ditarik ? ' · ditarik' : ''}</span></li>`).join('')}</ul>` : ''}
      ${u ? `<p><button class="btn" data-up="${esc(u.id)}">Lihat setoran terkait: ${esc(tglS(u.tanggal))} · ${esc(u.cabang)} · ${esc(JK[u.jenis] || u.jenis)}</button></p>` : k.uploadId ? '<p class="muted">Setoran terkait tidak tersedia.</p>' : ''}`);
  }

  const draw = () => ({ ring: drawRing, foto: drawFoto, inv: drawInv, konf: drawKonf, stok: drawStok, akses: drawAkses })[st.tab]();
  view.onclick = (e) => {
    const t = e.target.closest('[data-tab],[data-loc],[data-set],[data-more],[data-up],[data-konf],[data-clrtgl]'); if (!t) return;
    if (t.dataset.tab) { st.tab = t.dataset.tab; st.q = ''; st.shown = 60; view.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b === t)); }
    else if ('loc' in t.dataset) { st.loc = t.dataset.loc; st.shown = 60; view.querySelectorAll('[data-loc]').forEach(b => b.setAttribute('aria-pressed', b === t)); }
    else if (t.dataset.set) { st[t.dataset.set] = t.dataset.val; st.shown = 60; }
    else if ('more' in t.dataset) st.shown += 100;
    else if ('clrtgl' in t.dataset) st.tgl = '';
    else if (t.dataset.up) return openUp(t.dataset.up);
    else if (t.dataset.konf) return openKonf(t.dataset.konf);
    draw();
  };
  view.onkeydown = (e) => { if (e.key !== 'Enter') return; const d = e.target.dataset || {}; if (d.up) openUp(d.up); else if (d.konf) openKonf(d.konf); };
  draw();
}

/* Ringkasan singkat untuk Beranda */
export async function setoranHomeSummary(api) {
  const D = load(await api.listDocs('setoran'));
  if (!D.ups.length && !D.konf.length && !Object.keys(D.op.meta).length) return null;
  const today = isoOf(new Date());
  const belum = D.ups.filter(u => isInv(u) && u.bayar.st === 'belum');
  return {
    konf: D.konf.filter(k => k.status === 'Menunggu jawaban').length,
    invoice: belum.length,
    invoiceLate: belum.filter(u => telat(u, today)).length,
    stok: Object.keys(D.op.meta).reduce((a, l) => a + stokWarn(D.op, l), 0),
    // Kartu Owner di aplikasi: semua setoran berstatus Baru (semua lokasi); null bila data Owner tidak terlihat
    baru: D.ups.some(u => !isInv(u)) ? D.ups.filter(u => u.status === 'Baru').length : null,
  };
}
