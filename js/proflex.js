// Modul Proflex Graphics (salinan dari aplikasi Proflex Graphics di Claude, lihat saja).
// Menu sama dengan aplikasi: Dashboard, Konfirmasi, Produk & Stok, Barang Masuk, Invoice, Barang Keluar, Pelanggan,
// Stock Opname, Arus Kas, Pengeluaran, Laporan, Laba Rugi, Log Aktivitas, Tim & Peran, Pengaturan.
// Rumus stok, invoice, HPP FIFO, arus kas, pengeluaran, dan laba rugi disalin dari aplikasi supaya angkanya sama.
// Data HPP, saldo, mutasi bank, konfirmasi, tim, dan laba hanya ada di database untuk Owner (min_level 'owner');
// menu Keuangan/Owner dan kolom HPP/laba hanya tampil kalau dokumennya memang terbaca (M.owner).

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const pad = (n, l = 2) => String(n).padStart(l, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const rp = (n) => 'Rp' + Math.round(n || 0).toLocaleString('id-ID');
const rpS = (n) => (n < 0 ? '−' : '') + rp(Math.abs(n));
const diffDays = (a, b) => Math.round((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 864e5);
const fmtD = (s) => { if (!s) return '—'; const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
const fmtM = (m) => m ? `${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}` : '—';
const lastDay = (m) => m + '-' + pad(new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate());
const nextMonth = (m) => { const d = new Date(+m.slice(0, 4), +m.slice(5, 7), 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
const sum = (xs, f) => xs.reduce((s, x) => s + (+f(x) || 0), 0);
const rpShort = (n) => { n = Math.round(n || 0); if (Math.abs(n) >= 1e9) return 'Rp' + (n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M'; if (Math.abs(n) >= 1e6) return 'Rp' + (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt'; return rp(n); };
const rpShortS = (n) => (n < 0 ? '−' : '') + rpShort(Math.abs(n));
const fmtDT = (s) => { if (!s) return '—'; const d = new Date(s); if (isNaN(d)) return '—'; return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const prevMonth = (m) => { const d = new Date(+m.slice(0, 4), +m.slice(5, 7) - 2, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };

/* ---------------- kategori pengeluaran (sama dengan aplikasi) ---------------- */
const EXP_CATS = [
  ['Gaji', 'beban'], ['Ongkir ke pelanggan', 'beban'], ['Sewa / storage', 'beban'], ['Biaya admin / jasa', 'beban'],
  ['Listrik & internet', 'beban'], ['Operasional', 'beban'], ['Peralatan', 'beban'], ['Marketing', 'beban'],
  ['Transport', 'beban'], ['Pajak & biaya bank', 'beban'], ['Refund pelanggan', 'beban'], ['Lainnya', 'beban'],
  ['Pembelian stok / supplier', 'stok'], ['Bea masuk & impor', 'stok'], ['Ongkir pembelian (supplier ke gudang)', 'stok'],
  ['Dividen', 'pemilik'], ['Tarik pemilik', 'pemilik'], ['Reimburse ke owner', 'reimb'],
];
const REIMB = 'Reimburse ke owner';
const expGroup = (c) => (EXP_CATS.find(x => x[0] === c) || [c, 'beban'])[1];
const EXP_GROUPS = { beban: 'Beban operasional', stok: 'Pembelian stok (masuk HPP)', pemilik: 'Dividen & ambil pemilik', reimb: 'Reimburse ke owner (bukan beban baru)' };
const SHIPCAT = 'Ongkir ke pelanggan';
const shipOf = (o) => o && o.cat === SHIPCAT ? { custName: o.custName || '', invNo: o.invNo || '', resi: o.resi || '' } : {};
const shipTxt = (p) => [p.custName ? 'ke ' + p.custName : '', p.invNo || '', p.resi ? 'resi ' + p.resi : ''].filter(Boolean).join(' · ');
/* peran bawaan aplikasi (dipakai kalau config/team belum pernah disimpan) */
const PERMS = [['produk', 'Produk', 'tambah, ubah, import'], ['masuk', 'Barang masuk', 'catat penerimaan'], ['invoice', 'Invoice', 'buat & batalkan'], ['bayar', 'Pembayaran', 'catat pembayaran'],
  ['pelanggan', 'Pelanggan', 'tambah & ubah'], ['opname', 'Stock opname', 'hitung & kirim'], ['kas', 'Arus kas', 'lihat & catat kas']];
const DEFAULT_ROLES = [{ id: 'admin', name: 'Admin Penuh', perms: PERMS.map(p => p[0]) }, { id: 'gudang', name: 'Admin Gudang', perms: ['produk', 'masuk', 'opname'] },
  { id: 'kasir', name: 'Kasir / Sales', perms: ['invoice', 'bayar', 'pelanggan'] }, { id: 'lihat', name: 'Lihat Saja', perms: [] }];
function normCat(c, text) {
  const t = String(text || '').toLowerCase();
  if (c === 'Ongkos kirim') return /ppf|\bpl\s?f?\s?\d|\bplf\s?\d|\bls-?\d|supplier|impor/.test(t) ? 'Ongkir pembelian (supplier ke gudang)' : 'Ongkir ke pelanggan';
  if (c === 'Sewa tempat') return 'Sewa / storage';
  if (c === 'Pajak & biaya bank' && /soli|prio/.test(t)) return 'Biaya admin / jasa';
  if (c === 'Gaji' && /storage/.test(t) && !/gaji/.test(t)) return 'Sewa / storage';
  if (EXP_CATS.some(x => x[0] === c)) return c;
  return 'Lainnya';
}
const MON_WORDS = [['jan', 1], ['feb', 2], ['mar', 3], ['apr', 4], ['mei', 5], ['may', 5], ['jun', 6], ['jul', 7], ['agu', 8], ['aug', 8], ['sep', 9], ['okt', 10], ['oct', 10], ['nov', 11], ['des', 12], ['dec', 12]];
function guessPeriod(text, date) {
  const t = String(text || '').toLowerCase(), m = t.match(/(?:^|[^a-z])(jan|feb|mar|apr|mei|may|jun|jul|agu|aug|sep|okt|oct|nov|des|dec)(?:[a-z]*)\s*'?(20\d\d|\d\d)?(?![\d])/);
  if (!m) return '';
  const mo = MON_WORDS.find(x => x[0] === m[1])[1];
  const y = m[2] ? (m[2].length === 2 ? 2000 + +m[2] : +m[2]) : +String(date).slice(0, 4);
  let p = y + '-' + pad(mo);
  if (!m[2] && p > String(date).slice(0, 7)) p = (y - 1) + '-' + pad(mo);
  return p;
}
const guessPeriodFor = (cat, desc, date) => ['Gaji', 'Sewa / storage', 'Biaya admin / jasa'].includes(cat) ? guessPeriod(desc, date) : '';

/* ---------------- model: semua angka dihitung di sini ---------------- */
export function proflexModel(docs, TODAY = isoOf(new Date())) {
  const by = (c) => docs.filter(d => d.coll === c).map(d => ({ id: d.id, ...d.data }));
  const one = (c, id) => docs.find(d => d.coll === c && d.id === id)?.data || null;
  const products = by('products'), customers = by('customers'), invoices = by('invoices'), receipts = by('receipts');
  const opname = by('opname'), returns = by('returns'), cash = by('cash'), banksheet = by('banksheet');
  const company = Object.assign({ name: 'Proflex Graphics', prefix: 'INV/PFX/' }, one('config', 'company') || {});
  const costsDoc = one('fin', 'costs'), landed = one('fin', 'landed'), balances = one('fin', 'balances'), bankSync = one('fin', 'banksync');
  const accDoc = one('ownercfg', 'accounts'), bankcat = one('ownercfg', 'bankcat'), teamDoc = one('ownercfg', 'team');
  const members = by('team'), konf = by('konfirmasi');
  // tim & peran (teamCfg di aplikasi)
  const roles = Array.isArray(teamDoc?.roles) && teamDoc.roles.length ? teamDoc.roles : DEFAULT_ROLES;
  const team = { roles, members: teamDoc?.members || {}, defaultRole: roles.some(r => r.id === teamDoc?.defaultRole) ? teamDoc.defaultRole : roles[0].id };
  const roleById = (id) => roles.find(r => r.id === id) || roles.find(r => r.id === team.defaultRole) || roles[0];
  // nama pelaku: nama panggilan dari Tim & Peran; admin terdaftar di koleksi team; selain itu Owner (Owner tidak mendaftar)
  const who = (id) => !id ? '—' : team.members[id]?.label || (members.some(m => m.id === id) ? 'Admin' : 'Owner');
  const owner = !!(costsDoc || landed || balances || banksheet.length);
  const costs = costsDoc?.costs || {}, opening = balances?.opening || {};
  const Pm = (id) => products.find(p => p.id === id);

  // ---- stok (computeStock) ----
  const STK = {};
  products.forEach(p => STK[p.id] = +p.opening || 0);
  receipts.forEach(r => (r.lines || []).forEach(l => STK[l.pid] = (STK[l.pid] || 0) + (+l.qty || 0)));
  invoices.forEach(i => { if (i.void) return; (i.items || []).forEach(it => { if (!it.ret) STK[it.pid] = (STK[it.pid] || 0) - (+it.qty || 0); }); });
  opname.forEach(o => { if (o.status !== 'approved') return; (o.lines || []).forEach(l => { if (l.physical != null && l.physical !== l.system) STK[l.pid] = (STK[l.pid] || 0) + (l.physical - l.system); }); });
  const stk = (p) => STK[p.id] || 0;
  const stockState = (p) => { const s = stk(p); if (s <= 0) return ['bad', 'Habis']; if (s < (+p.min || 0)) return ['warn', 'Menipis']; return ['ok', 'Aman']; };
  const activeProducts = products.filter(p => p.active !== false).sort((a, b) => (a.sku || '').localeCompare(b.sku || ''));

  function movesFor(pid) {
    const mv = [], p = Pm(pid);
    if (p && +p.opening) mv.push({ date: (p.createdAt || '').slice(0, 10), at: p.createdAt || '', type: 'IN', label: 'Stok awal', ref: '—', qty: +p.opening });
    receipts.forEach(r => (r.lines || []).forEach(l => { if (l.pid === pid) mv.push({ date: r.date, at: r.createdAt || r.date, type: 'IN', label: 'Masuk', ref: r.no, qty: +l.qty }); }));
    invoices.forEach(i => { if (i.void) return; (i.items || []).forEach(it => { if (it.pid === pid && !it.ret) mv.push({ date: i.date, at: i.createdAt || i.date, type: 'OUT', label: 'Keluar', ref: i.no, qty: -it.qty }); }); });
    opname.forEach(o => { if (o.status !== 'approved') return; (o.lines || []).forEach(l => { if (l.pid === pid && l.physical != null && l.physical !== l.system) mv.push({ date: (o.approvedAt || o.date).slice(0, 10), at: o.approvedAt || o.date, type: 'ADJ', label: 'Penyesuaian', ref: o.no, qty: l.physical - l.system }); }); });
    return mv.sort((a, b) => (b.date + b.at).localeCompare(a.date + a.at));
  }

  // ---- HPP FIFO (hanya Owner; tanpa data fin semuanya 0) ----
  const start = landed?.start || '2026-10-01';
  const baseCost = (pid) => +(costs[pid] || 0);
  function landedOf(g) {
    const L = landed?.receipts?.[g.id]; if (!L) return null;
    const rate = L.cur === 'IDR' ? 1 : (+L.rate || 0);
    const units = (g.lines || []).reduce((s, l) => s + (+l.qty || 0), 0);
    const extra = (L.extras || []).reduce((s, x) => s + (+x.amount || 0) * (x.cur && x.cur !== 'IDR' ? rate : 1), 0);
    const per = units ? extra / units : 0, unit = {};
    (g.lines || []).forEach(l => { const pr = L.lines ? L.lines[l.pid] : null; if (pr != null && pr !== '' && rate > 0) unit[l.pid] = Math.round(+pr * rate + per); });
    return { unit, complete: (g.lines || []).every(l => unit[l.pid] != null) };
  }
  const F = (() => {
    const layers = {}, last = {}, line = {}, est = {};
    const push = (pid, q, u, e) => { if (q <= 0) return; (layers[pid] = layers[pid] || []).push({ q, u, est: !!e }); last[pid] = u; };
    const take = (pid, q) => {
      const ls = layers[pid] = layers[pid] || []; let left = q, c = 0, e = false;
      while (left > 0 && ls.length) { const L = ls[0], n = Math.min(L.q, left); c += n * L.u; if (L.est) e = true; L.q -= n; left -= n; if (L.q <= 0) ls.shift(); }
      if (left > 0) { const u = last[pid] != null ? last[pid] : baseCost(pid); c += left * u; e = true; }
      return { c, e };
    };
    const ev = [];
    products.forEach(p => { const d = (p.createdAt || '').slice(0, 10); if (+p.opening && d >= start) ev.push({ date: d, at: p.createdAt || '', k: 0, fn: () => push(p.id, +p.opening, baseCost(p.id), !baseCost(p.id)) }); });
    receipts.forEach(g => { if ((g.date || '') < start) return; const lo = landedOf(g);
      ev.push({ date: g.date, at: g.createdAt || g.date, k: 1, fn: () => (g.lines || []).forEach(l => { const u = lo && lo.unit[l.pid] != null ? lo.unit[l.pid] : null; push(l.pid, +l.qty || 0, u != null ? u : (last[l.pid] != null ? last[l.pid] : baseCost(l.pid)), u == null); }) }); });
    invoices.forEach(i => { if (i.void || (i.date || '') < start) return;
      ev.push({ date: i.date, at: i.createdAt || i.date, k: 2, fn: () => (i.items || []).forEach((it, idx) => { if (it.ret) { line[i.id + '|' + idx] = 0; return; } const r = take(it.pid, +it.qty || 0); line[i.id + '|' + idx] = r.c; if (r.e) est[i.id] = true; }) }); });
    opname.forEach(o => { if (o.status !== 'approved') return; const d = (o.approvedAt || o.date || '').slice(0, 10); if (d < start) return;
      ev.push({ date: d, at: o.approvedAt || o.date, k: 3, fn: () => (o.lines || []).forEach(l => { if (l.physical == null || l.physical === l.system) return; const dq = l.physical - l.system;
        if (dq > 0) { const ls = layers[l.pid]; push(l.pid, dq, ls && ls.length ? ls[0].u : (last[l.pid] != null ? last[l.pid] : baseCost(l.pid)), false); } else take(l.pid, -dq); }) }); });
    products.forEach(p => { const before = movesFor(p.id).filter(m => m.date < start).reduce((s, m) => s + m.qty, 0);
      if (before > 0) { const u = landed?.opening?.[p.id] != null ? +landed.opening[p.id] : baseCost(p.id); push(p.id, before, u, !u); } });
    ev.sort((a, b) => (a.date + a.at).localeCompare(b.date + b.at) || a.k - b.k).forEach(x => x.fn());
    return { layers, last, line, est };
  })();
  const cost = (pid) => { const ls = F.layers[pid]; if (ls && ls.length) return ls[0].u; if (F.last[pid] != null) return F.last[pid]; return baseCost(pid); };
  const stockValue = (pid) => (F.layers[pid] || []).reduce((s, L) => s + L.q * L.u, 0);
  const inBook = (inv) => (inv.date || '') >= start;
  const itemCost = (inv, idx) => { const it = (inv.items || [])[idx]; if (!it || it.ret) return 0; if (inBook(inv) && !inv.void) { const v = F.line[inv.id + '|' + idx]; if (v != null) return v; } return it.qty * baseCost(it.pid); };
  const invCost = (inv) => (!inBook(inv) || inv.void) ? (inv.items || []).reduce((s, it) => s + (it.ret ? 0 : it.qty * baseCost(it.pid)), 0) : (inv.items || []).reduce((s, it, idx) => s + itemCost(inv, idx), 0);

  // ---- invoice (invTotals) ----
  function invTotals(inv) {
    const items = inv.items || [];
    const sub = items.reduce((s, it) => s + it.qty * it.price * (1 - (it.disc || 0) / 100), 0);
    const gross = items.reduce((s, it) => s + it.qty * it.price, 0);
    const ship = Math.max(0, Math.round(+inv.ship || 0));
    const pre = Math.max(0, Math.round(sub - (inv.discTotal || 0))) + ship;
    const total = Math.max(0, pre + (+inv.rounding || 0));
    const paid = (inv.payments || []).reduce((s, p) => s + (+p.amount || 0), 0);
    const c = owner ? invCost(inv) : 0;
    const remaining = inv.void ? 0 : Math.max(0, total - paid);
    const status = inv.void ? 'batal' : remaining <= 0 ? 'lunas' : paid > 0 ? 'sebagian' : 'belum';
    const overdue = !inv.void && status !== 'lunas' && inv.due < TODAY;
    return { sub: Math.round(sub), gross, itemDisc: Math.round(gross - sub), ship, pre, rounding: total - pre, total, paid, remaining, status, overdue, cost: c, profit: total - ship - c };
  }
  const inv = invoices.map(i => ({ i, t: invTotals(i) }));
  const live = inv.filter(x => !x.i.void);

  // ---- rekening, mutasi bank, arus kas (Owner) ----
  const accounts = accDoc?.list?.length ? accDoc.list : [{ id: 'bank', name: 'Rekening bank', kind: 'bank' }, { id: 'kas', name: 'Kas tunai', kind: 'tunai' }];
  const Acc = (id) => accounts.find(a => a.id === id);
  const accName = (id) => Acc(id)?.name || (id === 'owner' ? 'Uang owner' : '—');
  const defaultAcc = (method) => { const as = accounts.filter(a => a.active !== false); const want = method === 'Tunai' ? 'tunai' : 'bank'; return ((as.find(a => a.kind === want) || as[0] || accounts[0]) || {}).id || ''; };
  const payAcc = (p) => (p.acc && Acc(p.acc)) ? p.acc : defaultAcc(p.method);
  const sheetAcc = accDoc?.sheetAcc && Acc(accDoc.sheetAcc) ? accDoc.sheetAcc : defaultAcc('Transfer');
  const liveCash = cash.filter(c => !c.void);
  const sheetRows = (() => {
    const acc = sheetAcc, norm = (v) => String(v || '').toUpperCase().replace(/\s+/g, '');
    const pays = []; live.forEach(({ i }) => (i.payments || []).forEach(p => { if (payAcc(p) === acc) pays.push({ no: norm(i.no), a: +p.amount || 0, d: p.date, used: false }); }));
    const out = [];
    [...banksheet].sort((a, b) => String(a.id).localeCompare(String(b.id))).forEach(doc => (doc.rows || []).forEach(x => out.push(Object.assign({}, x, { sid: doc.id + '-' + x.r, tab: doc.tab || '', acc, dup: false }))));
    if (pays.length) {
      out.forEach(x => {
        if (x.t !== 'in') return;
        const n = norm(x.s), nos = [...new Set(pays.filter(p => p.no && n.includes(p.no)).map(p => p.no))];
        if (nos.length === 1) { const p = pays.find(p => !p.used && p.no === nos[0] && Math.abs(p.a - x.a) < 1); if (p) { p.used = true; x.dup = true; } }
        else if (nos.length > 1) { const free = pays.filter(p => !p.used && nos.includes(p.no)); if (free.length && Math.abs(sum(free, p => p.a) - x.a) < 1) { free.forEach(p => { p.used = true; }); x.dup = true; } }
      });
      const pairs = [];
      out.forEach(x => { if (x.dup || x.t !== 'in') return; pays.forEach(p => { if (p.used || !p.d || Math.abs(p.a - x.a) >= 1) return; const dd = Math.abs(diffDays(p.d, x.d)); if (dd <= 3) pairs.push({ x, p, dd }); }); });
      pairs.sort((a, b) => a.dd - b.dd).forEach(q => { if (q.x.dup || q.p.used) return; q.x.dup = true; q.p.used = true; });
    }
    const seen = {}; out.forEach(x => { const b = x.d + '|' + x.t + '|' + Math.round(+x.a || 0) + '|' + String(x.s || x.k || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 60); let h = 5381; for (let i = 0; i < b.length; i++) h = ((h << 5) + h + b.charCodeAt(i)) >>> 0; seen[b] = (seen[b] || 0) + 1; x.key = 'm' + h.toString(36) + '_' + seen[b]; });
    return out;
  })();
  const bankMeta = (key) => bankcat?.rows?.[key] || null;
  const ledger = (() => {
    const rows = [];
    live.forEach(({ i }) => (i.payments || []).forEach(p => rows.push({ date: p.date, at: String(p.at || p.date), kind: 'pay', dir: 'in', amount: +p.amount || 0, acc: payAcc(p), cat: 'Pembayaran invoice', desc: (i.custName || '') + (p.note ? ' · ' + p.note : ''), ref: i.no, invId: i.id, by: p.by })));
    sheetRows.forEach(x => { if (x.dup) return; const mt = x.t === 'out' ? bankMeta(x.key) : null;
      rows.push({ date: x.d, at: x.d + 'T00:' + pad(x.r, 6), kind: 'sheet', dir: x.t === 'in' ? 'in' : 'out', amount: +x.a || 0, acc: x.acc, cat: x.t === 'out' ? (mt && Array.isArray(mt.split) && mt.split.length > 1 ? 'Beberapa kategori' : (mt && mt.cat) || normCat(x.c, (x.s || '') + ' ' + (x.k || ''))) : (x.c || 'Lainnya'), desc: x.s || x.k || '', ref: '', sid: x.sid, pend: !!x.p, by: null }); });
    liveCash.filter(c => c.acc !== 'owner').forEach(c => rows.push({ date: c.date, at: String(c.createdAt || c.date), kind: c.type, dir: c.type === 'in' ? 'in' : c.type === 'out' ? 'out' : 'move', amount: +c.amount || 0, acc: c.acc, toAcc: c.toAcc, cat: c.cat || (c.type === 'move' ? 'Pindah rekening' : 'Lainnya'), desc: c.desc || '', ref: '', id: c.id, by: c.by }));
    return rows.sort((a, b) => (a.date + a.at).localeCompare(b.date + b.at));
  })();
  const rowEff = (r, a) => { if (!a) return r.dir === 'in' ? r.amount : r.dir === 'out' ? -r.amount : 0; if (r.dir === 'move') return (r.toAcc === a ? r.amount : 0) - (r.acc === a ? r.amount : 0); if (r.acc !== a) return 0; return r.dir === 'in' ? r.amount : -r.amount; };
  const rowTouches = (r, a) => !a || r.acc === a || (r.dir === 'move' && r.toAcc === a);
  const openingOf = (a) => a ? (+opening[a] || 0) : accounts.reduce((s, x) => s + (+opening[x.id] || 0), 0);
  const balanceOf = (a) => openingOf(a) + ledger.reduce((s, r) => s + rowEff(r, a), 0);
  const inPer = (d, P) => { d = String(d || '').slice(0, 10); return d >= P.from && d <= P.to; };
  // m: 'YYYY-MM' atau periode {from,to} (sama dengan flow() di aplikasi)
  const flow = (m, a) => { let i = 0, o = 0, ni = 0, no = 0; ledger.forEach(r => { if (m && (typeof m === 'string' ? String(r.date).slice(0, 7) !== m : !inPer(r.date, m))) return; if (!rowTouches(r, a)) return; const e = rowEff(r, a || ''); if (e > 0) { i += e; ni++; } else if (e < 0) { o -= e; no++; } }); return { in: i, out: o, nIn: ni, nOut: no }; };

  // ---- pengeluaran & laba rugi ----
  function expParts(amount, meta, baseCat, desc, date) {
    const sp = meta && Array.isArray(meta.split) ? meta.split.filter(s => +s.amount > 0) : [];
    if (sp.length && Math.abs(sum(sp, s => s.amount) - amount) < 1) return sp.map(s => Object.assign({ cat: s.cat || baseCat, amount: +s.amount, note: s.note || '', period: s.period || guessPeriodFor(s.cat || baseCat, desc, date) || String(date).slice(0, 7) }, shipOf(Object.assign({ cat: s.cat || baseCat }, s))));
    const cat = (meta && meta.cat) || baseCat;
    return [Object.assign({ cat, amount, period: (meta && meta.period) || guessPeriodFor(cat, desc, date) || String(date).slice(0, 7) }, shipOf(Object.assign({}, meta || {}, { cat })))];
  }
  const expRows = (() => {
    const rows = [];
    sheetRows.forEach(x => { if (x.t !== 'out') return; const meta = bankMeta(x.key), desc = x.s || x.k || '', base = normCat(x.c, (x.s || '') + ' ' + (x.k || ''));
      rows.push({ src: 'bank', id: x.key, sid: x.sid, date: x.d, at: x.d + 'T00:' + pad(x.r, 6), amount: +x.a || 0, acc: x.acc, desc, bankText: x.k || '', vendor: (meta && meta.vendor) || '', note: (meta && meta.note) || '', meta, pend: !!x.p, parts: expParts(+x.a || 0, meta, base, desc, x.d) }); });
    liveCash.forEach(c => { if (c.type !== 'out') return; const base = normCat(c.cat, c.desc);
      rows.push({ src: 'kas', id: c.id, date: c.date, at: String(c.createdAt || c.date), amount: +c.amount || 0, acc: c.acc, desc: c.desc || '', bankText: '', vendor: c.vendor || '', note: c.note || '', meta: c, by: c.by, ownerPaid: c.acc === 'owner', payer: c.payer || '', parts: expParts(+c.amount || 0, c, base, c.desc, c.date) }); });
    rows.forEach(r => { const cs = [...new Set(r.parts.map(p => p.cat))]; r.cats = cs; r.cat = cs.length > 1 ? 'Beberapa kategori' : cs[0]; r.period = r.parts[0].period; r.settles = r.cat === REIMB && r.meta && Array.isArray(r.meta.settles) ? r.meta.settles : []; });
    const byId = {}; rows.forEach(r => { if (r.ownerPaid) byId[r.id] = r; });
    rows.forEach(r => r.settles.forEach(id => { const o = byId[id]; if (o && !o.settledBy) o.settledBy = r; }));
    rows.forEach(r => { if (r.cat !== REIMB) return; const linked = sum(r.settles.map(id => byId[id]).filter(Boolean), o => o.amount), rest = r.amount - linked;
      if (rest >= 1) { const per = r.parts[0].period; r.parts = (linked > 0 ? [{ cat: REIMB, amount: linked, period: per }] : []).concat([{ cat: 'Lainnya', amount: rest, period: per }]); } });
    return rows.sort((a, b) => (b.date + b.at).localeCompare(a.date + a.at));
  })();
  function lrCompute(from, to) {
    const Fr = from < start ? start : from, inR = (d) => { d = String(d || '').slice(0, 10); return d >= Fr && d <= to; };
    const mF = Fr.slice(0, 7), mT = to.slice(0, 7), inM = (m) => m >= mF && m <= mT && m >= start.slice(0, 7);
    const xs = live.filter(x => inR(x.i.date));
    let gross = 0, disc = 0, ship = 0, hpp = 0, est = 0;
    xs.forEach(({ i, t }) => { gross += t.gross; ship += t.ship; disc += t.gross - (t.total - t.ship); hpp += t.cost; if (F.est[i.id]) est++; });
    const sales = gross - disc, beban = {}, stok = {}, pemilik = {};
    const fullMonth = from.slice(8) === '01' && to === lastDay(to.slice(0, 7));
    expRows.forEach(r => r.parts.forEach(p => { const g = expGroup(p.cat);
      if (g === 'beban') { if (fullMonth ? inM(p.period) : (inR(r.date) && p.period >= start.slice(0, 7))) beban[p.cat] = (beban[p.cat] || 0) + p.amount; }
      else if (inR(r.date)) { const B = g === 'stok' ? stok : pemilik; B[p.cat] = (B[p.cat] || 0) + p.amount; } }));
    const other = {};
    sheetRows.forEach(x => { if (x.t === 'in' && !x.dup && inR(x.d) && x.c === 'Bunga bank') other['Bunga bank'] = (other['Bunga bank'] || 0) + (+x.a || 0); });
    liveCash.forEach(c => { if (c.type === 'in' && inR(c.date) && c.cat !== 'Setoran modal') other[c.cat || 'Lainnya'] = (other[c.cat || 'Lainnya'] || 0) + (+c.amount || 0); });
    const totBeban = sum(Object.values(beban), v => v), totOther = sum(Object.values(other), v => v);
    const labaKotor = sales + ship - hpp, laba = labaKotor - totBeban + totOther;
    return { invs: xs.length, gross, disc, sales, ship, hpp, est, labaKotor, beban, totBeban, other, totOther, laba, stok, pemilik };
  }

  // ---- barang keluar (outRows) ----
  const outRows = (() => {
    const rows = [];
    invoices.forEach(i => { if (i.void) return; (i.items || []).forEach((it, idx) => { const val = it.qty * it.price * (1 - (it.disc || 0) / 100);
      rows.push({ date: i.date, at: i.createdAt || i.date, kind: it.ret ? 'Sisa retur' : val > 0 ? 'Penjualan' : 'Tanpa biaya', ret: !!it.ret, ref: i.no, invId: i.id, to: i.custName || '—', pid: it.pid, name: it.name, sku: it.sku, unit: it.unit || '', qty: +it.qty || 0, val, inv: i, idx, note: i.note || '' }); }); });
    opname.forEach(o => { if (o.status !== 'approved') return; (o.lines || []).forEach(l => { if (l.physical == null || l.physical >= l.system) return; const p = Pm(l.pid);
      rows.push({ date: (o.approvedAt || o.date || '').slice(0, 10), at: o.approvedAt || o.date, kind: 'Selisih opname', ref: o.no, to: '— (stok hilang/rusak)', pid: l.pid, name: p ? p.name : l.name, sku: p ? p.sku : l.sku, unit: p ? p.unit : '', qty: l.system - l.physical, val: 0 }); }); });
    return rows.sort((a, b) => (b.date + b.at).localeCompare(a.date + a.at));
  })();
  const outCost = (r) => owner ? (r.inv ? itemCost(r.inv, r.idx) : r.qty * cost(r.pid)) : 0;

  // ---- info mutasi bank (sheetInfo) ----
  const sheetInfo = (() => {
    const ds = banksheet.filter(d => (d.rows || []).length); if (!ds.length) return null;
    return { tabs: ds.map(d => d.tab || d.id).join(', '), n: sheetRows.length, dup: sheetRows.filter(x => x.dup).length, pend: sheetRows.filter(x => x.p).length, syncedAt: ds.map(d => String(d.syncedAt || '')).sort().pop(), acc: sheetAcc };
  })();

  // ---- log aktivitas (pLog; arsip hapus permanen tidak disalin ke portal) ----
  const logEvents = (() => {
    const ev = [];
    invoices.forEach(i => { ev.push({ at: i.createdAt, by: i.by, what: 'Membuat invoice ' + i.no + ' untuk ' + (i.custName || 'Pembeli umum') + ' (' + rp(invTotals(Object.assign({}, i, { void: false })).total) + ')' });
      (i.payments || []).forEach(p => ev.push({ at: p.at || p.date, by: p.by, what: 'Mencatat pembayaran ' + rp(p.amount) + ' untuk ' + i.no }));
      if (i.void) ev.push({ at: i.voidAt, by: i.voidBy, what: 'Membatalkan invoice ' + i.no + ' — ' + (i.voidReason || '') }); });
    receipts.forEach(r => ev.push({ at: r.createdAt, by: r.by, what: 'Mencatat barang masuk ' + r.no + ' dari ' + (r.supplier || '—') + ' (' + (r.lines || []).length + ' SKU)' }));
    opname.forEach(o => { ev.push({ at: o.createdAt, by: o.by, what: 'Memulai stock opname ' + o.no + ' (' + (o.scope || '') + ')' }); if (o.submittedAt) ev.push({ at: o.submittedAt, by: o.by, what: 'Mengirim stock opname ' + o.no + ' untuk persetujuan' }); if (o.approvedAt) ev.push({ at: o.approvedAt, by: o.approvedBy, what: 'Menyetujui stock opname ' + o.no }); });
    products.forEach(p => { if (p.createdAt) ev.push({ at: p.createdAt, by: p.by, what: 'Menambah produk ' + p.sku + ' ' + p.name }); if (p.updatedAt) ev.push({ at: p.updatedAt, by: p.updatedBy, what: 'Terakhir mengubah produk ' + p.sku + (p.active === false ? ' (diarsipkan)' : '') }); });
    customers.forEach(c => { if (c.createdAt) ev.push({ at: c.createdAt, by: c.by, what: 'Menambah pelanggan ' + c.name }); });
    returns.forEach(r => ev.push({ at: r.createdAt, by: r.by, what: 'Mencatat retur ' + r.no + ' dari ' + (r.custName || '—') + ' (' + r.name + ', ' + r.goodM + ' m bisa dipakai, ' + r.badM + ' m rusak)' }));
    banksheet.forEach(d => { if (d.syncedAt) ev.push({ at: d.syncedAt, by: null, what: 'Sinkron otomatis mutasi bank dari Google Sheet (tab ' + (d.tab || d.id) + ', ' + (d.rows || []).length + ' baris)' }); });
    cash.forEach(c => { const w = c.type === 'out' ? 'kas keluar ' + rp(c.amount) + ' dari ' + accName(c.acc) + ' (' + (c.cat || '') + ': ' + (c.desc || '') + ')' : c.type === 'in' ? 'kas masuk lain ' + rp(c.amount) + ' ke ' + accName(c.acc) + ' (' + (c.cat || '') + ': ' + (c.desc || '') + ')' : 'pemindahan ' + rp(c.amount) + ' dari ' + accName(c.acc) + ' ke ' + accName(c.toAcc);
      ev.push({ at: c.createdAt, by: c.by, what: 'Mencatat ' + w + (c.void ? ', kemudian dihapus' : '') }); if (c.void) ev.push({ at: c.voidAt, by: c.voidBy, what: 'Menghapus catatan ' + w }); });
    return ev.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  })();

  // ---- ringkasan ----
  const low = activeProducts.filter(p => stk(p) < (+p.min || 0)).sort((a, b) => stk(a) / (a.min || 1) - stk(b) / (b.min || 1));
  const habis = activeProducts.filter(p => stk(p) <= 0);
  const unpaid = live.filter(x => x.t.status !== 'lunas');
  const overdue = unpaid.filter(x => x.t.overdue);
  return {
    TODAY, owner, company, products, activeProducts, customers, invoices, receipts, returns, opname, inv, live, Pm, stk, stockState, movesFor,
    cost, stockValue, F, start, invTotals, itemCost, accounts, accName, payAcc, sheetRows, ledger, balanceOf, flow, bankSync, lrCompute,
    expRows, outRows, outCost, sheetInfo, logEvents, openingOf, rowEff, rowTouches, inPer, opening, who, team, roleById, members, konf, accDoc,
    low, habis, unpaid, overdue,
    piutang: sum(unpaid, x => x.t.remaining), overdueAmt: sum(overdue, x => x.t.remaining),
  };
}

/* ---------------- tampilan ---------------- */
/* grafik batang dua seri (barChart / salesChart di aplikasi) */
function barChart(data, ka, kb, la, lb, ca, cb, aria, lastLbl) {
  const max = Math.max(1, ...data.map(d => Math.max(d[ka], d[kb])));
  const steps = [1e5, 2e5, 5e5, 1e6, 2e6, 5e6, 1e7, 2e7, 5e7, 1e8, 2e8, 5e8, 1e9];
  const step = steps.find(s => max / s <= 5) || 1e9, top = Math.ceil(max / step) * step;
  const lbl = (v) => v >= 1e6 ? (v / 1e6).toLocaleString('id-ID') + ' jt' : (v / 1e3).toLocaleString('id-ID') + ' rb';
  const N = data.length, W = 720, H = 240, L = 62, B = 26, T = 14, cw = (W - L - 8) / N;
  const y = (v) => T + (H - T - B) * (1 - Math.max(0, v) / top);
  let g = '';
  for (let v = 0; v <= top + 1; v += step) g += `<line x1="${L}" x2="${W - 4}" y1="${y(v)}" y2="${y(v)}" class="pfx-grid"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" class="pfx-ax">${lbl(v)}</text>`;
  data.forEach((d, i) => {
    const x = L + i * cw + cw * 0.18, bw = cw * 0.3;
    g += `<rect x="${x}" y="${y(d[ka])}" width="${bw}" height="${y(0) - y(d[ka])}" rx="3" style="fill:${ca}"><title>${la} ${rp(d[ka])}</title></rect>`;
    g += `<rect x="${x + bw + 4}" y="${y(d[kb])}" width="${bw}" height="${y(0) - y(Math.max(0, d[kb]))}" rx="3" style="fill:${cb}"><title>${lb} ${rp(d[kb])}</title></rect>`;
    g += `<text x="${L + i * cw + cw / 2}" y="${H - 8}" text-anchor="middle" class="pfx-ax">${MONTHS[+d.m.slice(5, 7) - 1]}${i === N - 1 && lastLbl ? ' (berjalan)' : ''}</text>`;
    if (d[ka]) g += `<text x="${x + bw / 2}" y="${y(d[ka]) - 5}" text-anchor="middle" class="pfx-val">${rpShort(d[ka]).replace('Rp', '')}</text>`;
  });
  return `<svg class="pfx-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${aria}">${g}</svg>`;
}
const legend = (items) => `<div class="pfx-legend">${items.map(([c, l]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')}</div>`;
const bar = (v, max) => `<span class="pfx-bar" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, max ? v / max * 100 : 0))}%"></i></span>`;

export async function viewProflex(ctx) {
  const { $, esc, api, setHead } = ctx;
  setHead('Proflex Graphics', `<span class="badge info">Lihat saja</span>`);
  const view = $('#view');
  view.innerHTML = `<div class="empty"><p class="muted">Memuat data Proflex…</p></div>`;
  const [docs, sync] = await Promise.all([api.listDocs('proflex'), api.lastSync('proflex')]);
  const M = proflexModel(docs);
  if (!M.products.length && !M.invoices.length && !M.customers.length) {
    view.innerHTML = `<div class="empty"><h2>Belum ada data yang bisa kamu lihat</h2><p class="muted">Data Proflex belum disalin, atau akun kamu tidak punya akses ke Proflex.</p></div>`;
    return;
  }
  const { TODAY } = M, curM = TODAY.slice(0, 7);
  const st = { tab: 'ring', q: '', invf: '', ctype: '', month: curM, kasM: curM, acc: '', expM: curM, expG: '', expC: '', lrM: curM < M.start.slice(0, 7) ? M.start.slice(0, 7) : curM, outM: curM, outP: '', konfF: '', opId: '' };
  const custLabel = (i) => i?.custName || 'Pembeli umum';
  const pill = (t) => t.status === 'batal' ? '<span class="badge off">Dibatalkan</span>' : t.status === 'lunas' ? '<span class="badge ok">Lunas</span>'
    : t.overdue ? '<span class="badge bad">Jatuh tempo</span>' : t.status === 'sebagian' ? '<span class="badge warn">Bayar sebagian</span>' : '<span class="badge off">Belum bayar</span>';
  const stockPill = (p) => { const [c, l] = M.stockState(p); return `<span class="badge ${c}">${l}</span>`; };
  const stat = (label, val, hint, cls = '') => `<div class="wt-stat ${cls}"><small>${label}</small><b>${val}</b><span>${hint || ''}</span></div>`;
  const ownTag = '<span class="badge info">Khusus Owner</span>';
  const num = 'style="text-align:right;white-space:nowrap"';
  const months = []; for (let m = M.start.slice(0, 7); m <= curM; m = nextMonth(m)) months.push(m);
  // daftar bulan dari bulan ini mundur sampai bulan data paling awal (kasMonthPicker / expMonthPicker)
  const monthsBack = (dates) => { let first = curM; dates.forEach(d => { const m = String(d || '').slice(0, 7); if (/^\d{4}-\d{2}$/.test(m) && m < first) first = m; }); const out = []; for (let m = curM, k = 0; k < 60; k++) { out.push(m); if (m <= first) break; m = prevMonth(m); } return out; };
  const monthSel = (id, list, cur, extra = '') => `<label class="muted tiny" for="${id}">Periode</label><select class="inp inp--s" id="${id}">${extra}${list.map(x => `<option value="${x}" ${x === cur ? 'selected' : ''}>${fmtM(x)}${x === curM ? ' (bulan ini)' : ''}</option>`).join('')}</select>`;
  const perOf = (m) => ({ from: m + '-01', to: lastDay(m), label: fmtM(m) });
  const OPS = { draft: ['off', 'Sedang dihitung'], submitted: ['warn', 'Menunggu Owner'], approved: ['ok', 'Disetujui'] };
  const konfOpen = M.konf.filter(k => k.status !== 'answered');

  const NAV = [
    ['Harian', [['ring', 'Dashboard'], ...(M.owner ? [['konf', 'Konfirmasi']] : []), ['stok', 'Produk & Stok'], ['masuk', 'Barang Masuk'], ['inv', 'Invoice'], ['keluar', 'Barang Keluar'], ['cust', 'Pelanggan'], ['opname', 'Stock Opname']]],
    ...(M.owner ? [['Keuangan', [['arus', 'Arus Kas'], ['biaya', 'Pengeluaran'], ['laporan', 'Laporan'], ['lr', 'Laba Rugi'], ['fin', 'Ringkasan keuangan']]],
      ['Owner', [['log', 'Log Aktivitas'], ['tim', 'Tim & Peran'], ['set', 'Pengaturan']]]] : []),
  ];
  const counts = { konf: konfOpen.length || null, inv: M.overdue.length || null, opname: M.opname.filter(o => o.status === 'submitted').length || null };

  view.innerHTML = `
    <div class="wt-sync"><span>Salinan dari aplikasi <b>Proflex Graphics</b> di Claude${sync ? ` · diperbarui ${esc(fmtD(isoOf(new Date(sync.at))))} ${esc(new Date(sync.at).toTimeString().slice(0, 5))}` : ''}.</span>
      <span class="muted">Invoice, pembayaran, barang masuk, opname, dan kas tetap dicatat di aplikasi Claude selama masa transisi.</span></div>
    <nav class="sa-nav pfx-nav" aria-label="Menu Proflex">${NAV.map(([g, items]) => `<div class="sa-navg"><span class="sa-navh">${g}</span>${items.map(([k, l]) =>
      `<button data-tab="${k}" aria-pressed="${k === st.tab}">${l}${counts[k] ? `<span class="sa-n ${k === 'opname' ? '' : 'is-bad'}">${counts[k]}</span>` : ''}</button>`).join('')}</div>`).join('')}</nav>
    <div id="pfx" class="pfx-main"></div>`;

  const invTable = (rows, opts = {}) => `<div class="tablewrap"><table class="tbl wt-tbl"><thead><tr><th>No. invoice</th><th>Tanggal</th><th>Pelanggan</th><th>Jatuh tempo</th><th ${num}>Total</th><th ${num}>Sisa</th>${M.owner && !opts.compact ? `<th ${num}>Laba kotor</th>` : ''}<th>Status</th></tr></thead><tbody>
    ${rows.map(({ i, t }) => `<tr data-inv="${esc(i.id)}" tabindex="0"><td><b>${esc(i.no)}</b></td><td><small>${esc(fmtD(i.date))}</small></td><td>${esc(custLabel(i))}</td>
      <td><small>${esc(fmtD(i.due))}${t.overdue ? `<br><span style="color:var(--red)">${diffDays(TODAY, i.due)} hari lewat</span>` : ''}</small></td>
      <td ${num}>${rp(t.total)}</td><td ${num}>${t.remaining ? `<b>${rp(t.remaining)}</b>` : '<span class="muted">—</span>'}</td>
      ${M.owner && !opts.compact ? `<td ${num}>${i.void ? '—' : rp(t.profit)}</td>` : ''}<td>${pill(t)}</td></tr>`).join('') || `<tr><td colspan="8" class="muted">${opts.empty || 'Tidak ada invoice.'}</td></tr>`}</tbody></table></div>`;
  const salesSeries = (endM) => { const out = []; let m = endM; for (let k = 0; k < 6; k++) { out.unshift(m); m = prevMonth(m); }
    return out.map(m => { const xs = M.live.filter(x => String(x.i.date).slice(0, 7) === m).map(x => x.t); return { m, omzet: sum(xs, t => t.total), laba: sum(xs, t => t.profit) }; }); };
  const salesChart = (endM = curM) => barChart(salesSeries(endM), 'omzet', 'laba', 'Omzet', 'Laba kotor', 'var(--info)', 'var(--ok)', 'Grafik omzet dan laba kotor 6 bulan', endM === curM);
  const panel = (title, body, extra = '') => `<section class="pfx-panel"><div class="pfx-ph"><h2 class="wt-h">${title}</h2>${extra}</div>${body}</section>`;

  /* ---------- Dashboard ---------- */
  function drawRing() {
    const month = M.live.filter(x => String(x.i.date).startsWith(curM));
    const recent = [...M.live].sort((a, b) => (b.i.date + (b.i.createdAt || '')).localeCompare(a.i.date + (a.i.createdAt || ''))).slice(0, 8);
    const R = M.owner ? M.lrCompute(curM + '-01', lastDay(curM)) : null;
    const units = M.activeProducts.reduce((s, p) => s + M.stk(p), 0);
    const stockVal = M.activeProducts.reduce((s, p) => s + M.stockValue(p.id), 0);
    $('#pfx').innerHTML = `
      ${konfOpen.length && M.owner ? `<button class="sa-alert bad" data-tab="konf">${konfOpen.length} pertanyaan Konfirmasi Agent belum dijawab admin — buka ›</button>` : ''}
      <div class="wt-stats">
        ${stat('Stok menipis / habis', `${M.low.length} SKU`, `${M.habis.length} SKU habis`, M.low.length ? 'bad' : 'ok')}
        ${stat('Belum lunas', M.unpaid.length, `${rp(M.piutang)} sisa tagihan`, M.unpaid.length ? 'warn' : 'ok')}
        ${stat('Lewat jatuh tempo', M.overdue.length, rp(M.overdueAmt), M.overdue.length ? 'bad' : '')}
        ${stat(`Penjualan ${fmtM(curM)}`, rp(sum(month, x => x.t.total)), `${month.length} invoice`, 'info')}
        ${stat('Total SKU', M.activeProducts.length, `${units.toLocaleString('id-ID')} unit di gudang`)}
        ${R ? stat(`Laba kotor ${fmtM(curM)} ${ownTag}`, rp(R.labaKotor), (R.sales + R.ship) ? `margin ${Math.round(R.labaKotor / (R.sales + R.ship) * 100)}%${R.est ? ' · ada HPP estimasi' : ''}` : '', 'ok') : ''}
        ${R ? stat(`Laba bersih ${fmtM(curM)} ${ownTag}`, rpS(R.laba), `setelah beban ${rp(R.totBeban)}`, R.laba >= 0 ? 'ok' : 'bad') : ''}
        ${R ? stat(`Nilai persediaan ${ownTag}`, rp(stockVal), 'dihitung dari HPP') : ''}
      </div>
      ${M.owner && M.invoices.length ? panel('Omzet & laba kotor 6 bulan', salesChart(), legend([['var(--info)', 'Omzet'], ['var(--ok)', 'Laba kotor']])) : ''}
      <h2 class="wt-h">Stok di bawah minimum (${M.low.length})</h2>
      <div class="tablewrap"><table class="tbl wt-tbl"><thead><tr><th>Produk</th><th ${num}>Stok</th><th ${num}>Minimum</th><th>Status</th></tr></thead><tbody>
        ${M.low.map(p => `<tr data-prod="${esc(p.id)}" tabindex="0"><td><b>${esc(p.name)}</b><br><small class="muted">${esc(p.sku)}${p.loc ? ' · ' + esc(p.loc) : ''}</small></td><td ${num}><b>${M.stk(p)}</b> ${esc(p.unit || '')}</td><td ${num}>${p.min || 0}</td><td>${stockPill(p)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Semua stok di atas batas minimum.</td></tr>'}</tbody></table></div>
      <h2 class="wt-h">Tagihan lewat jatuh tempo (${M.overdue.length})</h2>
      ${invTable([...M.overdue].sort((a, b) => a.i.due.localeCompare(b.i.due)), { compact: true, empty: 'Tidak ada tagihan yang lewat jatuh tempo.' })}
      <h2 class="wt-h">Penjualan terbaru</h2>${invTable(recent, { compact: true, empty: 'Belum ada invoice.' })}
      ${M.opname.some(o => o.status === 'submitted') ? `<p class="note">${M.opname.filter(o => o.status === 'submitted').length} stock opname menunggu persetujuan Owner di aplikasi Claude.</p>` : ''}`;
  }

  /* ---------- Konfirmasi (Owner) ---------- */
  const konfLast = (k) => { const t = k.thread || []; return t.length ? t[t.length - 1] : null; };
  const konfAgent = (k) => (k && (k.agentName || k.name)) || 'Agent';
  const konfSt = (k) => k.status === 'answered' ? '<span class="badge ok">Sudah dijawab</span>' : '<span class="badge bad">Menunggu jawaban</span>';
  function drawKonf() {
    const all = [...M.konf].sort((a, b) => (a.status === 'answered') - (b.status === 'answered') || String((konfLast(b) || {}).at || b.createdAt || '').localeCompare(String((konfLast(a) || {}).at || a.createdAt || '')));
    const f = st.konfF, list = all.filter(k => !f || (f === 'open' ? k.status !== 'answered' : k.status === 'answered'));
    const done = all.length - konfOpen.length;
    $('#pfx').innerHTML = `
      <div class="wt-stats">${stat('Menunggu jawaban', konfOpen.length, 'semua admin', konfOpen.length ? 'bad' : '')}${stat('Sudah dijawab', done, '')}${stat('Total pertanyaan', all.length, '')}</div>
      <p class="note">Klarifikasi Agent ke admin; terkirim otomatis saat pemeriksaan Agent menemukan data yang kurang atau berbeda. Menjawab tetap di aplikasi Claude.</p>
      <div class="toolbar"><div class="wt-seg" role="group" aria-label="Saring status">${[['', 'Semua'], ['open', 'Menunggu jawaban'], ['done', 'Sudah dijawab']].map(([v, l]) => `<button data-konff="${v}" aria-pressed="${f === v}">${l}</button>`).join('')}</div></div>
      <div class="tablewrap"><table class="tbl wt-tbl"><thead><tr><th>No.</th><th>Dikirim</th><th>Dari</th><th>Untuk</th><th>Pertanyaan</th><th>Status</th><th>Terakhir</th></tr></thead><tbody>
      ${list.map(k => { const last = konfLast(k); return `<tr data-konf="${esc(k.id)}" tabindex="0"><td><b>${esc(k.no || '')}</b></td><td><small>${esc(fmtDT(k.createdAt))}</small></td><td>${esc(konfAgent(k))}</td><td>${esc(M.who(k.to))}</td>
        <td><span class="pfx-clamp">${esc(k.q || '')}</span>${k.ref ? `<br><small class="muted">Ref: ${esc(k.ref)}</small>` : ''}</td><td>${konfSt(k)}</td>
        <td><small class="muted">${last ? (last.role === 'admin' ? 'Dijawab ' : esc(konfAgent(k)) + ' ') + esc(fmtDT(last.at)) : '—'}</small></td></tr>`; }).join('')
        || `<tr><td colspan="7" class="muted">${all.length ? 'Tidak ada pertanyaan dengan status ini.' : 'Belum ada pertanyaan dari Agent.'}</td></tr>`}</tbody></table></div>`;
  }

  /* ---------- Produk & Stok ---------- */
  function drawStok() {
    const q = st.q.toLowerCase();
    const rows = M.activeProducts.filter(p => !q || ((p.name || '') + (p.sku || '')).toLowerCase().includes(q));
    $('#pfx').innerHTML = `
      <div class="toolbar"><input class="inp" id="pfxQ" placeholder="Cari nama atau SKU" value="${esc(st.q)}" aria-label="Cari produk"></div>
      <div class="tablewrap"><table class="tbl wt-tbl"><thead><tr><th>Produk</th><th>Lokasi</th><th ${num}>Stok</th><th ${num}>Min</th><th ${num}>Harga jual</th>
        ${M.owner ? `<th ${num}>HPP</th><th ${num}>Margin</th><th ${num}>Nilai stok</th>` : ''}<th>Status</th></tr></thead><tbody>
      ${rows.map(p => { const hp = M.owner ? M.cost(p.id) : 0; return `<tr data-prod="${esc(p.id)}" tabindex="0"><td><b>${esc(p.name)}</b><br><small class="muted">${esc(p.sku)} · ${esc(p.cat || '')}</small></td>
        <td>${esc(p.loc || '—')}</td><td ${num}><b>${M.stk(p)}</b> ${esc(p.unit || '')}</td><td ${num}>${p.min || 0}</td><td ${num}>${rp(p.price)}</td>
        ${M.owner ? `<td ${num}>${hp ? rp(hp) : '<span class="muted">belum diisi</span>'}</td><td ${num}>${hp && p.price ? Math.round((p.price - hp) / p.price * 100) + '%' : '—'}</td><td ${num}>${rp(M.stockValue(p.id))}</td>` : ''}
        <td>${stockPill(p)}</td></tr>`; }).join('') || '<tr><td colspan="9" class="muted">Tidak ada produk yang cocok.</td></tr>'}</tbody></table></div>
      <p class="lead">${rows.length} SKU · ${rows.reduce((s, p) => s + M.stk(p), 0).toLocaleString('id-ID')} unit${M.owner ? ` · nilai persediaan ${rp(rows.reduce((s, p) => s + M.stockValue(p.id), 0))} (HPP FIFO)` : ''}. Klik baris untuk kartu stok.</p>`;
    bindSearch();
  }

  /* ---------- Invoice ---------- */
  function drawInv() {
    const q = st.q.toLowerCase();
    const list = [...M.inv].sort((a, b) => (b.i.date + (b.i.createdAt || '')).localeCompare(a.i.date + (a.i.createdAt || ''))).filter(x => {
      if (q && !((x.i.no || '') + (x.i.custName || '')).toLowerCase().includes(q)) return false;
      if (st.invf === 'open') return x.t.status !== 'lunas' && x.t.status !== 'batal';
      if (st.invf === 'overdue') return x.t.overdue;
      if (st.invf === 'lunas') return x.t.status === 'lunas';
      return true; });
    $('#pfx').innerHTML = `
      <div class="wt-stats">${stat('Invoice terbit', M.live.length, 'semua waktu')}${stat('Belum lunas', M.unpaid.length, rp(M.piutang) + ' sisa tagihan', M.unpaid.length ? 'warn' : '')}${stat('Lewat jatuh tempo', M.overdue.length, rp(M.overdueAmt), M.overdue.length ? 'bad' : '')}</div>
      <div class="toolbar"><input class="inp" id="pfxQ" placeholder="Cari no. invoice atau pelanggan" value="${esc(st.q)}" aria-label="Cari invoice">
        <div class="wt-seg" role="group" aria-label="Saring status">${[['', 'Semua'], ['open', 'Belum lunas'], ['overdue', 'Jatuh tempo'], ['lunas', 'Lunas']].map(([v, l]) => `<button data-invf="${v}" aria-pressed="${st.invf === v}">${l}</button>`).join('')}</div></div>
      ${invTable(list, { empty: 'Tidak ada invoice yang cocok.' })}`;
    bindSearch();
  }

  /* ---------- Barang Keluar ---------- */
  function drawKeluar() {
    const all = M.outRows, P = st.outM === 'all' ? null : perOf(st.outM), q = st.q.toLowerCase();
    const rows = all.filter(r => (!P || M.inPer(r.date, P)) && (!st.outP || r.pid === st.outP) && (!q || (r.to + ' ' + r.name + ' ' + r.sku + ' ' + r.ref).toLowerCase().includes(q)));
    const units = rows.reduce((s, r) => s + (r.ret ? 0 : r.qty), 0), refs = new Set(rows.map(r => r.ref)).size, custs = new Set(rows.filter(r => r.invId).map(r => r.to)).size;
    const hpp = M.owner ? sum(rows, r => M.outCost(r)) : 0;
    const prods = [...new Map(all.map(r => [r.pid, r.name])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
    const byP = {}, byC = {};
    rows.forEach(r => { const k = r.ret ? r.pid + '|ret' : r.pid; byP[k] = byP[k] || { name: r.name, unit: r.unit, q: 0 }; byP[k].q += r.qty; if (r.invId) { byC[r.to] = byC[r.to] || { q: 0, n: new Set() }; if (!r.ret) byC[r.to].q += r.qty; byC[r.to].n.add(r.ref); } });
    const pList = Object.values(byP).sort((a, b) => b.q - a.q), cList = Object.entries(byC).sort((a, b) => b[1].q - a[1].q);
    const maxP = Math.max(1, ...pList.map(x => x.q)), maxC = Math.max(1, ...cList.map(x => x[1].q));
    const kindPill = (k) => `<span class="badge ${k === 'Penjualan' ? 'off' : k === 'Tanpa biaya' || k === 'Sisa retur' ? 'info' : 'warn'}">${k}</span>`;
    $('#pfx').innerHTML = `
      <div class="toolbar">${monthSel('pfxOutM', monthsBack(all.map(r => r.date)), st.outM, `<option value="all" ${st.outM === 'all' ? 'selected' : ''}>Semua tanggal</option>`)}
        <select class="inp inp--s" id="pfxOutP" aria-label="Produk"><option value="">Semua produk</option>${prods.map(([id, n]) => `<option value="${esc(id)}" ${st.outP === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
        <input class="inp" id="pfxQ" placeholder="Cari pelanggan, produk, no. invoice" value="${esc(st.q)}" aria-label="Cari barang keluar"></div>
      <div class="wt-stats">${stat('Barang keluar', units.toLocaleString('id-ID') + ' unit', P ? P.label : 'Semua tanggal')}${stat('Transaksi', refs, 'invoice dan opname')}${stat('Pelanggan', custs, 'yang menerima barang')}${M.owner ? stat(`Nilai HPP keluar ${ownTag}`, rp(hpp), 'FIFO dari barang masuk') : ''}</div>
      ${rows.length ? `<div class="pfx-grid2">
        ${panel('Per produk', `<div class="pfx-list">${pList.map(x => `<div class="pfx-row"><span class="pfx-grow">${esc(x.name)}</span>${bar(x.q, maxP)}<b class="pfx-amt">${x.q} ${esc(x.unit)}</b></div>`).join('')}</div>`)}
        ${panel('Per pelanggan', `<div class="pfx-list">${cList.map(([n, x]) => `<div class="pfx-row"><span class="pfx-grow">${esc(n)}<br><small class="muted">${x.n.size} invoice</small></span>${bar(x.q, maxC)}<b class="pfx-amt">${x.q}</b></div>`).join('') || '<p class="muted">—</p>'}</div>`)}</div>` : ''}
      <h2 class="wt-h">Daftar barang keluar (${rows.length})</h2>
      <div class="tablewrap"><table class="tbl wt-tbl"><thead><tr><th>Tanggal</th><th>Ke</th><th>Produk</th><th ${num}>Qty</th><th>Jenis</th>${M.owner ? `<th ${num}>HPP</th>` : ''}</tr></thead><tbody>
      ${rows.map(r => `<tr ${r.invId ? `data-inv="${esc(r.invId)}" tabindex="0"` : ''}><td><small>${esc(fmtD(r.date))}</small></td><td><b>${esc(r.to)}</b><br><small class="muted">${esc(r.ref)}</small></td>
        <td>${esc(r.name)}<br><small class="muted">${esc(r.sku || '')}</small></td><td ${num}><b>${r.qty}</b> ${esc(r.unit)}</td><td>${kindPill(r.kind)}${r.note ? `<br><small class="muted">${esc(r.note)}</small>` : ''}</td>
        ${M.owner ? `<td ${num}>${rp(M.outCost(r))}</td>` : ''}</tr>`).join('') || '<tr><td colspan="6" class="muted">Belum ada barang keluar di periode ini.</td></tr>'}</tbody></table></div>
      <p class="lead">Barang keluar dicatat otomatis dari invoice (termasuk invoice Rp0 untuk barang pengganti/gratis) dan dari selisih kurang di stock opname. Invoice yang dibatalkan tidak dihitung.</p>`;
    $('#pfxOutM').onchange = (e) => { st.outM = e.target.value; draw(); };
    $('#pfxOutP').onchange = (e) => { st.outP = e.target.value; draw(); };
    bindSearch();
  }

  /* ---------- Pelanggan ---------- */
  function drawCust() {
    const q = st.q.toLowerCase().split(/\s+/).filter(Boolean);
    const shown = M.customers.filter(c => (!st.ctype || c.type === st.ctype) && q.every(w => ((c.name || '') + ' ' + (c.phone || '') + ' ' + (c.addr || '')).toLowerCase().includes(w)))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    const types = [...new Set(['Bengkel', 'Reseller', 'Retail', ...M.customers.map(c => c.type).filter(Boolean)])];
    $('#pfx').innerHTML = `
      <div class="wt-stats">${stat('Pelanggan', M.customers.length, 'semua')}${types.map(t => stat(esc(t), M.customers.filter(c => c.type === t).length, 'pelanggan')).join('')}</div>
      <div class="toolbar"><input class="inp" id="pfxQ" placeholder="Cari nama, telepon, atau kota" value="${esc(st.q)}" aria-label="Cari pelanggan">
        <div class="wt-seg" role="group" aria-label="Tipe"><button data-ctype="" aria-pressed="${!st.ctype}">Semua tipe</button>${types.map(t => `<button data-ctype="${esc(t)}" aria-pressed="${st.ctype === t}">${esc(t)}</button>`).join('')}</div></div>
      <div class="tablewrap"><table class="tbl wt-tbl"><thead><tr><th>Nama</th><th>Tipe</th><th>Telepon</th><th>Termin</th><th ${num}>Invoice</th><th ${num}>Total belanja</th><th ${num}>Piutang</th></tr></thead><tbody>
      ${shown.map(c => { const xs = M.live.filter(x => x.i.custId === c.id).map(x => x.t); const open = sum(xs, t => t.remaining), od = xs.some(t => t.overdue);
        return `<tr data-cust="${esc(c.id)}" tabindex="0"><td><b>${esc(c.name)}</b><br><small class="muted">${esc(String(c.addr || '').slice(0, 80))}</small></td><td><span class="badge info">${esc(c.type || '—')}</span></td>
          <td><small>${esc(c.phone || '—')}</small></td><td>${c.term ? c.term + ' hari' : 'Tunai'}</td><td ${num}>${xs.length}</td><td ${num}>${rp(sum(xs, t => t.total))}</td>
          <td ${num}>${open ? `<b style="color:${od ? 'var(--red)' : 'var(--warn)'}">${rp(open)}</b>` : '<span class="muted">—</span>'}</td></tr>`; }).join('') || '<tr><td colspan="7" class="muted">Tidak ada pelanggan yang cocok.</td></tr>'}</tbody></table></div>`;
    bindSearch();
  }

  /* ---------- Barang Masuk (penerimaan + retur) ---------- */
  function drawMasuk() {
    const rs = [...M.receipts].sort((a, b) => (b.date + (b.createdAt || '')).localeCompare(a.date + (a.createdAt || '')));
    $('#pfx').innerHTML = `
      <h2 class="wt-h">Penerimaan barang (${rs.length})</h2>
      <div class="tablewrap"><table class="tbl"><thead><tr><th>No.</th><th>Tanggal</th><th>Supplier</th><th>Barang</th><th ${num}>Qty</th></tr></thead><tbody>
      ${rs.map(r => `<tr><td><b>${esc(r.no)}</b>${r.sj ? `<br><small class="muted">SJ ${esc(r.sj)}</small>` : ''}</td><td><small>${esc(fmtD(r.date))}</small></td><td>${esc(r.supplier || '—')}</td>
        <td><small>${(r.lines || []).map(l => esc(l.name || M.Pm(l.pid)?.name || l.sku) + ' × ' + l.qty).join('<br>')}</small></td><td ${num}>${sum(r.lines || [], l => l.qty)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Belum ada barang masuk.</td></tr>'}</tbody></table></div>
      <h2 class="wt-h">Retur dari pelanggan (${M.returns.length})</h2>
      <div class="tablewrap"><table class="tbl"><thead><tr><th>No.</th><th>Tanggal</th><th>Pelanggan</th><th>Barang</th><th>Alasan</th><th>Penyelesaian</th></tr></thead><tbody>
      ${M.returns.map(r => `<tr><td><b>${esc(r.no)}</b><br><small class="muted">${esc(r.invNo || '')}</small></td><td><small>${esc(fmtD(r.date))}</small></td><td>${esc(r.custName || '—')}</td>
        <td><small>${esc(r.name || '')} · ${r.qty || 0} ${esc(r.unit || '')}${r.rollLen ? `<br>bagus ${r.goodM || 0} m · rusak ${r.badM || 0} m dari ${r.rollLen} m` : ''}</small></td><td><small>${esc(r.reason || '—')}</small></td>
        <td><small>${esc({ ganti: 'Diganti barang baru', refund: 'Refund / potong tagihan', none: 'Belum diselesaikan' }[r.settle] || r.settle || '—')}</small></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Belum ada retur.</td></tr>'}</tbody></table></div>`;
  }

  /* ---------- Stock Opname ---------- */
  const opDiffVal = (o) => (o.lines || []).reduce((s, l) => s + ((l.physical ?? l.system) - l.system) * M.cost(l.pid), 0);
  function drawOpname() {
    const ops = [...M.opname].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    $('#pfx').innerHTML = `
      <p class="note">Alurnya: mulai opname per kategori → hitung fisik → kirim ke Owner → Owner setujui, lalu stok disesuaikan. Semua langkah dilakukan di aplikasi Claude.</p>
      <div class="tablewrap"><table class="tbl wt-tbl"><thead><tr><th>No.</th><th>Tanggal</th><th>Cakupan</th><th ${num}>SKU</th><th ${num}>Selisih</th>${M.owner ? `<th ${num}>Nilai selisih</th>` : ''}<th>Oleh</th><th>Status</th></tr></thead><tbody>
      ${ops.map(o => { const v = M.owner ? opDiffVal(o) : 0; return `<tr data-op="${esc(o.id)}" tabindex="0"><td><b>${esc(o.no)}</b></td><td><small>${esc(fmtD(o.date))}</small></td><td>${esc(o.scope || '')}</td><td ${num}>${(o.lines || []).length}</td>
        <td ${num}>${(o.lines || []).filter(l => l.physical != null && l.physical !== l.system).length}</td>${M.owner ? `<td ${num}>${v ? `<span style="color:${v < 0 ? 'var(--red)' : 'var(--ok)'}">${rpS(v)}</span>` : '—'}</td>` : ''}
        <td>${M.owner ? esc(M.who(o.by)) : '—'}</td><td><span class="badge ${(OPS[o.status] || ['off'])[0]}">${esc((OPS[o.status] || ['', o.status])[1])}</span></td></tr>`; }).join('') || '<tr><td colspan="8" class="muted">Belum ada stock opname.</td></tr>'}</tbody></table></div>`;
  }

  /* ---------- Arus Kas (Owner) ---------- */
  function drawArus() {
    const led = M.ledger, a = st.acc && M.accounts.some(x => x.id === st.acc) ? st.acc : '', P = perOf(st.kasM);
    let bal = M.openingOf(a), startBal = null; const rows = [];
    led.forEach(r => { if (!M.rowTouches(r, a)) return; const e = M.rowEff(r, a); if (M.inPer(r.date, P)) { if (startBal === null) startBal = bal; rows.push({ r, e, bal: bal + e }); } else if (String(r.date).slice(0, 10) > P.to && startBal === null) startBal = bal; bal += e; });
    if (startBal === null) startBal = bal;
    const f = M.flow(P, a), endBal = startBal + f.in - f.out, si = M.sheetInfo;
    let rec = '';
    if (si && M.bankSync?.years) { const ys = Object.keys(M.bankSync.years).sort(), y = M.bankSync.years[ys[ys.length - 1]] || {};
      if (typeof y.lastBalance === 'number' && String(M.bankSync.syncedAt || '') >= String(si.syncedAt || '')) { const diff = M.balanceOf(si.acc) - y.lastBalance; rec = Math.abs(diff) < 1 ? ' <span class="badge ok">Saldo cocok dengan bank</span>' : ` <span class="badge warn">Selisih ${rpS(diff)} dari saldo bank ${rp(y.lastBalance)}</span>`; } }
    const accs = M.accounts.filter(x => x.active !== false || M.balanceOf(x.id) !== 0);
    const series = []; for (let m = curM, k = 0; k < 6; k++) { series.unshift(m); m = prevMonth(m); }
    const cs = series.map(m => { const x = M.flow(m, ''); return { m, kas: x.in, out: x.out }; });
    $('#pfx').innerHTML = `
      <div class="toolbar">${monthSel('pfxKasM', monthsBack(led.map(r => r.date)), st.kasM)}
        <select class="inp inp--s" id="pfxAcc" aria-label="Rekening"><option value="">Semua rekening</option>${M.accounts.map(x => `<option value="${esc(x.id)}" ${a === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
      ${si ? `<p class="note">Mutasi bank dari Google Sheet <b>Cashflow Proflex</b> (tab ${esc(si.tabs)}) masuk otomatis ke <b>${esc(M.accName(si.acc))}</b>: ${si.n} baris${si.pend ? `, ${si.pend} pending` : ''}${si.dup ? `, ${si.dup} tidak dihitung ulang karena sudah tercatat di invoice` : ''}. Sinkron terakhir ${esc(fmtDT(si.syncedAt))}.${rec}</p>` : ''}
      <h2 class="wt-h">Saldo saat ini</h2>
      <div class="wt-stats">${accs.map(x => { const b = M.balanceOf(x.id); return stat(esc(x.name), rpS(b), x.kind === 'tunai' ? 'Kas tunai' : 'Rekening bank', b < 0 ? 'bad' : ''); }).join('')}${stat('Total', rpS(M.balanceOf('')), `${accs.length} rekening`, 'info')}</div>
      <div class="wt-stats">${stat('Kas masuk ' + P.label, rp(f.in), f.nIn + ' transaksi', 'ok')}${stat('Kas keluar ' + P.label, rp(f.out), f.nOut + ' transaksi', f.out ? 'bad' : '')}${stat('Selisih ' + P.label, rpS(f.in - f.out), f.in - f.out >= 0 ? 'masuk lebih besar' : 'keluar lebih besar')}</div>
      ${led.length ? panel('Kas masuk & kas keluar 6 bulan', barChart(cs, 'kas', 'out', 'Kas masuk', 'Kas keluar', 'var(--ok)', 'var(--red)', 'Grafik kas masuk dan kas keluar 6 bulan', true), legend([['var(--ok)', 'Kas masuk'], ['var(--red)', 'Kas keluar']])) : ''}
      <h2 class="wt-h">Mutasi ${esc(P.label)}${a ? ' · ' + esc(M.accName(a)) : ''} (${rows.length})</h2>
      <div class="tablewrap"><table class="tbl wt-tbl"><thead><tr><th>Tanggal</th><th>Keterangan</th><th>Kategori</th><th>Rekening</th><th ${num}>Masuk</th><th ${num}>Keluar</th><th ${num}>Saldo</th></tr></thead><tbody>
      ${rows.slice().reverse().map(({ r, e, bal }) => { const attr = r.kind === 'pay' ? `data-inv="${esc(r.invId)}"` : r.kind === 'sheet' ? `data-bank="${esc(r.sid)}"` : `data-cash="${esc(r.id)}"`;
        return `<tr ${attr} tabindex="0"><td><small>${esc(fmtD(r.date))}</small></td><td>${esc(r.desc || '—')}${r.ref ? `<br><small class="muted">${esc(r.ref)}</small>` : ''}${r.dir === 'move' && !a ? `<br><small class="muted">${rp(r.amount)} dipindahkan</small>` : ''}${r.kind === 'sheet' ? `<br><small class="muted">Mutasi bank${r.pend ? ' · pending' : ''}</small>` : ''}</td>
          <td><span class="badge off">${esc(r.cat)}</span></td><td><small>${r.dir === 'move' ? esc(M.accName(r.acc)) + ' → ' + esc(M.accName(r.toAcc)) : esc(M.accName(r.acc))}</small></td>
          <td ${num} class="pfx-in">${e > 0 ? rp(e) : ''}</td><td ${num} class="pfx-out">${e < 0 ? rp(-e) : ''}</td><td ${num}>${rpS(bal)}</td></tr>`; }).join('') || '<tr><td colspan="7" class="muted">Belum ada uang masuk atau keluar pada periode ini.</td></tr>'}</tbody></table></div>
      <p class="lead">Saldo awal ${esc(P.label)} <b>${rpS(startBal)}</b> · saldo akhir <b>${rpS(endBal)}</b>. Pembayaran invoice masuk otomatis ke sini.${si ? ` Transaksi rekening ${esc(M.accName(si.acc))} masuk dari mutasi bank.` : ''} Klik baris untuk rincian.</p>`;
    $('#pfxKasM').onchange = (e) => { st.kasM = e.target.value; draw(); };
    $('#pfxAcc').onchange = (e) => { st.acc = e.target.value; draw(); };
  }

  /* ---------- Pengeluaran (Owner) ---------- */
  const accLabel = (r) => r.ownerPaid ? 'Uang owner' + (r.payer ? ' · ' + r.payer : '') : M.accName(r.acc);
  const reimbPill = (r) => !r.ownerPaid ? '' : r.settledBy ? `<span class="badge ok">Sudah di-reimburse ${esc(fmtD(r.settledBy.date))}</span>` : '<span class="badge warn">Belum di-reimburse</span>';
  function drawBiaya() {
    const all = M.expRows, P = perOf(st.expM), q = st.q.toLowerCase();
    const inP = all.filter(r => M.inPer(r.date, P));
    const rows = inP.filter(r => (!st.expG || r.parts.some(p => expGroup(p.cat) === st.expG)) && (!st.expC || r.cats.includes(st.expC)) && (!q || (r.desc + ' ' + r.vendor + ' ' + r.note + ' ' + r.cat + ' ' + r.bankText).toLowerCase().includes(q)));
    const parts = []; inP.forEach(r => r.parts.forEach(p => parts.push(p)));
    const byG = (g) => sum(parts.filter(p => expGroup(p.cat) === g), p => p.amount), tot = sum(inP.filter(r => !r.ownerPaid), r => r.amount);
    const open = all.filter(r => r.ownerPaid && !r.settledBy), payers = {}; open.forEach(r => { const k = r.payer || 'Owner'; payers[k] = (payers[k] || 0) + r.amount; });
    const byCat = {}; parts.forEach(p => { byCat[p.cat] = (byCat[p.cat] || 0) + p.amount; });
    const catPanels = Object.keys(EXP_GROUPS).map(g => { const cs = Object.entries(byCat).filter(([c]) => expGroup(c) === g).sort((a, b) => b[1] - a[1]); if (!cs.length) return ''; const mx = Math.max(...cs.map(x => x[1]));
      return panel(EXP_GROUPS[g], `<div class="pfx-list">${cs.map(([c, v]) => `<button class="pfx-row pfx-rowbtn" data-expc="${esc(c)}"><span class="pfx-grow">${esc(c)}</span>${bar(v, mx)}<b class="pfx-amt">${rp(v)}</b></button>`).join('')}</div>`, `<b>${rp(sum(cs, x => x[1]))}</b>`); }).join('');
    const review = inP.filter(r => r.src === 'bank' && r.cats.includes('Lainnya') && !(r.meta && (r.meta.cat || r.meta.split))).length;
    $('#pfx').innerHTML = `
      <div class="toolbar">${monthSel('pfxExpM', monthsBack(all.map(r => r.date)), st.expM)}
        <select class="inp inp--s" id="pfxExpG" aria-label="Kelompok"><option value="">Semua kelompok</option>${Object.entries(EXP_GROUPS).map(([k, v]) => `<option value="${k}" ${st.expG === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <select class="inp inp--s" id="pfxExpC" aria-label="Kategori"><option value="">Semua kategori</option>${EXP_CATS.map(([c]) => `<option ${st.expC === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <input class="inp" id="pfxQ" placeholder="Cari keterangan atau penerima" value="${esc(st.q)}" aria-label="Cari pengeluaran"></div>
      <div class="wt-stats">${stat('Uang perusahaan keluar', rp(tot), `${inP.filter(r => !r.ownerPaid).length} transaksi · ${P.label}`)}${stat('Beban operasional', rp(byG('beban')), 'mengurangi laba', 'bad')}${stat('Pembelian stok', rp(byG('stok')), 'masuk HPP lewat Barang Masuk')}${stat('Dividen & ambil pemilik', rp(byG('pemilik')), 'bukan beban')}</div>
      ${open.length ? panel('Uang owner yang belum di-reimburse', `<div class="pfx-list">${open.map(r => `<div class="pfx-row" data-exp="${esc(r.src + ':' + r.id)}" tabindex="0"><span class="pfx-grow">${esc(r.desc)}<br><small class="muted">${esc(fmtD(r.date))} · dibayar ${esc(r.payer || 'owner')} · ${esc(r.cat)}</small></span><b class="pfx-amt">${rp(r.amount)}</b></div>`).join('')}</div>
        <p class="lead">${Object.entries(payers).map(([k, v]) => `Perusahaan berutang <b>${rp(v)}</b> ke ${esc(k)}`).join(' · ')}.</p>`, `<b style="color:var(--warn)">${rp(sum(open, r => r.amount))}</b>`) : ''}
      ${review ? `<p class="note"><b>${review} mutasi bank</b> masih berkategori <b>Lainnya</b>. Kategorinya bisa dipilih Owner di aplikasi Claude supaya laba rugi akurat.</p>` : ''}
      ${catPanels ? `<div class="pfx-grid2">${catPanels}</div>` : ''}
      <h2 class="wt-h">Daftar pengeluaran (${rows.length}${st.expC || st.expG || q ? ', difilter' : ''})</h2>
      <div class="tablewrap"><table class="tbl wt-tbl"><thead><tr><th>Tanggal</th><th>Keterangan</th><th>Kategori</th><th>Sumber</th><th ${num}>Jumlah</th></tr></thead><tbody>
      ${rows.map(r => { const other = r.parts.some(p => p.period !== String(r.date).slice(0, 7)); const g = r.cats.every(c => expGroup(c) === 'beban') ? 'off' : r.cats.some(c => ['pemilik', 'reimb'].includes(expGroup(c))) ? 'warn' : 'info';
        return `<tr data-exp="${esc(r.src + ':' + r.id)}" tabindex="0"><td><small>${esc(fmtD(r.date))}</small></td>
          <td>${esc(r.desc || '—')}${r.vendor ? `<br><small class="muted">ke ${esc(r.vendor)}</small>` : ''}${r.parts.filter(p => shipTxt(p)).map(p => `<br><small class="muted">${esc(shipTxt(p))}${r.parts.length > 1 ? ' · ' + rp(p.amount) : ''}</small>`).join('')}${r.note ? `<br><small class="muted">${esc(r.note)}</small>` : ''}</td>
          <td><span class="badge ${g}">${esc(r.cat)}</span>${other ? `<br><small class="muted">untuk ${[...new Set(r.parts.map(p => fmtM(p.period)))].join(', ')}</small>` : ''}${r.settles.length ? `<br><small class="muted">mengganti ${r.settles.length} pengeluaran owner</small>` : ''}</td>
          <td><small class="muted">${r.ownerPaid ? 'Dibayar pakai uang owner' : r.src === 'bank' ? 'Mutasi bank' + (r.pend ? ' · pending' : '') : 'Dicatat manual'}<br>${esc(accLabel(r))}</small>${reimbPill(r) ? '<br>' + reimbPill(r) : ''}</td>
          <td ${num}><b>${rp(r.amount)}</b></td></tr>`; }).join('') || '<tr><td colspan="5" class="muted">Belum ada pengeluaran pada periode ini.</td></tr>'}</tbody></table></div>
      <p class="lead">Transfer keluar dari rekening bank masuk otomatis dari mutasi di Google Sheet. Pengeluaran tunai atau dari rekening lain dicatat manual di aplikasi Claude.</p>`;
    $('#pfxExpM').onchange = (e) => { st.expM = e.target.value; draw(); };
    $('#pfxExpG').onchange = (e) => { st.expG = e.target.value; draw(); };
    $('#pfxExpC').onchange = (e) => { st.expC = e.target.value; draw(); };
    bindSearch();
  }

  /* ---------- Laba Rugi (Owner) ---------- */
  const lrLine = (l, v, o = {}) => `<tr><td style="${o.sub ? 'padding-left:28px' : ''}">${o.b ? `<b>${l}</b>` : o.sub ? `<span class="muted">${l}</span>` : l}</td><td ${num}>${o.b ? '<b>' : ''}${o.neg && v ? '−' : ''}${rp(Math.abs(v))}${o.b ? '</b>' : ''}</td></tr>`;
  function drawLR() {
    const m = st.lrM, R = M.lrCompute(m + '-01', lastDay(m));
    const per = months.map(x => ({ m: x, r: M.lrCompute(x + '-01', lastDay(x)) }));
    const bebanL = Object.entries(R.beban).sort((a, b) => b[1] - a[1]);
    $('#pfx').innerHTML = `
      <div class="toolbar">${monthSel('pfxLrM', months.slice().reverse(), m)}</div>
      <div class="wt-stats">
        ${stat('Penjualan bersih', rp(R.sales + R.ship), `${R.invs} invoice`, 'info')}
        ${stat('Laba kotor', rp(R.labaKotor), (R.sales + R.ship) ? `${Math.round(R.labaKotor / (R.sales + R.ship) * 100)}% dari penjualan` : '', 'ok')}
        ${stat('Beban operasional', rp(R.totBeban), `${bebanL.length} kategori`, 'bad')}
        ${stat('Laba bersih', rpS(R.laba), fmtM(m), R.laba >= 0 ? 'ok' : 'bad')}
      </div>
      ${R.est ? `<p class="note"><b>${R.est} invoice</b> masih memakai HPP estimasi karena HPP barang masuknya belum diisi lengkap di aplikasi.</p>` : ''}
      <div class="pfx-grid2">
        ${panel(`Laba rugi · ${fmtM(m)}`, `<div class="tablewrap"><table class="tbl"><tbody>
          ${lrLine('Penjualan kotor', R.gross)}${R.disc ? lrLine('Diskon', R.disc, { sub: 1, neg: 1 }) : ''}${R.ship ? lrLine('Ongkir ditagih ke pelanggan', R.ship, { sub: 1 }) : ''}
          ${lrLine('Penjualan bersih', R.sales + R.ship, { b: 1 })}${lrLine('HPP barang terjual (FIFO)', R.hpp, { neg: 1 })}${lrLine('Laba kotor', R.labaKotor, { b: 1 })}
          ${bebanL.map(([c, v]) => lrLine(esc(c), v, { sub: 1, neg: 1 })).join('')}${lrLine('Total beban operasional', R.totBeban, { b: 1, neg: 1 })}
          ${Object.entries(R.other).map(([c, v]) => lrLine(esc(c) + ' (pendapatan lain)', v, { sub: 1 })).join('')}
          <tr><td><b>Laba bersih</b></td><td ${num}><b style="color:${R.laba >= 0 ? 'var(--ok)' : 'var(--red)'}">${rpS(R.laba)}</b></td></tr></tbody></table></div>`)}
        ${panel('Tidak masuk laba rugi', `<div class="tablewrap"><table class="tbl"><tbody>${Object.entries(R.stok).map(([c, v]) => lrLine(esc(c), v)).join('') || '<tr><td class="muted" colspan="2">Tidak ada pembelian stok</td></tr>'}${Object.entries(R.pemilik).map(([c, v]) => lrLine(esc(c), v)).join('')}</tbody></table></div>
          <p class="lead">Pembelian stok, bea masuk, dan ongkir dari supplier masuk ke HPP per roll lewat Barang Masuk, lalu menjadi biaya saat barangnya terjual. Dividen adalah pembagian laba, bukan biaya.</p>`)}
      </div>
      ${per.length > 1 ? `<h2 class="wt-h">Per bulan <small class="muted">mulai ${esc(fmtD(M.start))}</small></h2><div class="tablewrap"><table class="tbl"><thead><tr><th></th>${per.map(x => `<th ${num}>${fmtM(x.m)}</th>`).join('')}</tr></thead><tbody>
        ${[['Penjualan bersih', r => r.sales + r.ship], ['HPP', r => -r.hpp], ['<b>Laba kotor</b>', r => r.labaKotor], ['Beban operasional', r => -r.totBeban], ['Pendapatan lain', r => r.totOther], ['<b>Laba bersih</b>', r => r.laba]]
          .map(([l, fn]) => `<tr><td>${l}</td>${per.map(x => `<td ${num}>${rpShortS(fn(x.r))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}
      <p class="lead">Penjualan dihitung dari tanggal invoice (bukan tanggal uang masuk). Beban dihitung dari <b>untuk bulan</b> di menu Pengeluaran. Buku dimulai ${esc(fmtD(M.start))}, transaksi sebelumnya tidak ikut. Sebaiknya angka ini dicek ulang dengan akuntan sebelum dipakai untuk pajak.</p>`;
    $('#pfxLrM').onchange = (e) => { st.lrM = e.target.value; draw(); };
  }

  /* ---------- Laporan (Owner) ---------- */
  function drawLaporan() {
    const all = M.live;
    if (!all.length) { $('#pfx').innerHTML = '<div class="empty"><p class="muted">Laporan muncul setelah ada invoice.</p></div>'; return; }
    const byP = {};
    all.forEach(x => (x.i.items || []).forEach((it, idx) => { const k = it.ret ? it.pid + '|ret' : it.pid; byP[k] = byP[k] || { q: 0, rev: 0, prof: 0, name: it.name }; const r = it.qty * it.price * (1 - (it.disc || 0) / 100); byP[k].q += it.qty; byP[k].rev += r; byP[k].prof += r - M.itemCost(x.i, idx); }));
    const top = Object.entries(byP).sort((a, b) => b[1].rev - a[1].rev).slice(0, 10), maxRev = (top[0] && top[0][1].rev) || 1;
    const aging = {};
    all.filter(x => x.t.remaining > 0).forEach(({ i, t }) => { const c = custLabel(i); aging[c] = aging[c] || [0, 0, 0, 0]; const late = diffDays(TODAY, i.due); aging[c][late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : 3] += t.remaining; });
    const cats = [...new Set(['Umum', ...M.products.map(p => p.cat).filter(Boolean)])];
    const byCat = cats.map(c => { const ps = M.activeProducts.filter(p => p.cat === c); return { c, v: sum(ps, p => M.stockValue(p.id)), u: sum(ps, p => M.stk(p)), n: ps.length }; }).filter(x => x.n);
    const catMax = Math.max(1, ...byCat.map(x => x.v)), totalStock = sum(byCat, x => x.v);
    const omzet = sum(all, x => x.t.total), laba = sum(all, x => x.t.profit), noCost = M.activeProducts.filter(p => !M.cost(p.id)).length;
    $('#pfx').innerHTML = `
      ${noCost ? `<p class="note">${noCost} produk belum punya HPP, jadi laba kotor dan nilai persediaan belum lengkap.</p>` : ''}
      <div class="wt-stats">${stat('Omzet total', rp(omzet), `${all.length} invoice`)}${stat('Laba kotor', rp(laba), omzet ? `margin ${Math.round(laba / omzet * 100)}%` : '', 'ok')}${stat('Rata-rata per invoice', rp(omzet / all.length), '')}${stat('Nilai persediaan', rp(totalStock), 'HPP × stok')}</div>
      ${panel('Omzet & laba kotor per bulan', salesChart(), legend([['var(--info)', 'Omzet'], ['var(--ok)', 'Laba kotor']]))}
      <div class="pfx-grid2">
        ${panel('Produk terlaris (omzet)', `<div class="tablewrap"><table class="tbl"><thead><tr><th>Produk</th><th ${num}>Terjual</th><th ${num}>Omzet</th><th></th><th ${num}>Margin</th></tr></thead><tbody>
          ${top.map(([pid, v]) => `<tr><td>${esc(pid.endsWith('|ret') ? v.name : M.Pm(pid)?.name || v.name)}</td><td ${num}>${v.q.toLocaleString('id-ID')}</td><td ${num}>${rp(v.rev)}</td><td>${bar(v.rev, maxRev)}</td><td ${num}>${v.rev ? Math.round(v.prof / v.rev * 100) + '%' : '—'}</td></tr>`).join('')}</tbody></table></div>`)}
        ${panel('Nilai persediaan per kategori', `<div class="pfx-list">${byCat.map(x => `<div class="pfx-row"><span class="pfx-grow">${esc(x.c)}<br><small class="muted">${x.u.toLocaleString('id-ID')} unit · ${x.n} SKU</small></span>${bar(x.v, catMax)}<b class="pfx-amt">${rp(x.v)}</b></div>`).join('')}</div>`)}
      </div>
      <h2 class="wt-h">Umur piutang <small class="muted">sisa tagihan per pelanggan</small></h2>
      <div class="tablewrap"><table class="tbl"><thead><tr><th>Pelanggan</th><th ${num}>Belum jatuh tempo</th><th ${num}>1–30 hari</th><th ${num}>31–60 hari</th><th ${num}>&gt; 60 hari</th><th ${num}>Total</th></tr></thead><tbody>
      ${Object.entries(aging).sort((a, b) => sum(b[1], v => v) - sum(a[1], v => v)).map(([c, a]) => `<tr><td>${esc(c)}</td>${a.map((v, k) => `<td ${num}>${v ? (k >= 2 ? `<b style="color:var(--red)">${rp(v)}</b>` : rp(v)) : '<span class="muted">—</span>'}</td>`).join('')}<td ${num}><b>${rp(sum(a, v => v))}</b></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Tidak ada piutang.</td></tr>'}</tbody></table></div>`;
  }

  /* ---------- Ringkasan keuangan (Owner, tampilan lama) ---------- */
  function drawFin() {
    const m = st.month, R = M.lrCompute(m + '-01', lastDay(m));
    const accs = M.accounts.filter(a => a.active !== false || M.balanceOf(a.id) !== 0);
    const f = M.flow(m, '');
    const aging = {};
    M.unpaid.forEach(({ i, t }) => { const c = custLabel(i); aging[c] = aging[c] || [0, 0, 0, 0]; const late = diffDays(TODAY, i.due); aging[c][late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : 3] += t.remaining; });
    const stockVal = M.activeProducts.reduce((s, p) => s + M.stockValue(p.id), 0);
    $('#pfx').innerHTML = `
      <p class="note">Ringkasan satu halaman. Rinciannya ada di menu Arus Kas, Pengeluaran, Laporan, dan Laba Rugi. Buku dimulai ${esc(fmtD(M.start))}.</p>
      <div class="toolbar">${monthSel('pfxMonth', months.slice().reverse(), m)}</div>
      <div class="wt-stats">
        ${stat('Penjualan bersih', rp(R.sales + R.ship), `${R.invs} invoice`, 'info')}
        ${stat('Laba kotor', rp(R.labaKotor), (R.sales + R.ship) ? `${Math.round(R.labaKotor / (R.sales + R.ship) * 100)}% dari penjualan` : '', 'ok')}
        ${stat('Beban operasional', rp(R.totBeban), `${Object.keys(R.beban).length} kategori`, 'bad')}
        ${stat('Laba bersih', rpS(R.laba), fmtM(m), R.laba >= 0 ? 'ok' : 'bad')}
      </div>
      <h2 class="wt-h">Saldo rekening saat ini</h2>
      <div class="wt-stats">${accs.map(a => stat(esc(a.name), rpS(M.balanceOf(a.id)), a.kind === 'tunai' ? 'Kas tunai' : 'Rekening bank', M.balanceOf(a.id) < 0 ? 'bad' : '')).join('')}${stat('Total', rpS(M.balanceOf('')), `${accs.length} rekening`, 'info')}</div>
      <p class="lead">Arus kas ${fmtM(m)}: masuk ${rp(f.in)} (${f.nIn} transaksi) · keluar ${rp(f.out)} (${f.nOut} transaksi) · selisih ${rpS(f.in - f.out)}.</p>
      <h2 class="wt-h">Umur piutang</h2>
      <div class="tablewrap"><table class="tbl"><thead><tr><th>Pelanggan</th><th ${num}>Belum jatuh tempo</th><th ${num}>1–30 hari</th><th ${num}>31–60 hari</th><th ${num}>&gt; 60 hari</th><th ${num}>Total</th></tr></thead><tbody>
      ${Object.entries(aging).sort((a, b) => sum(b[1], v => v) - sum(a[1], v => v)).map(([c, a]) => `<tr><td>${esc(c)}</td>${a.map((v, k) => `<td ${num}>${v ? (k >= 2 ? `<b style="color:var(--red)">${rp(v)}</b>` : rp(v)) : '<span class="muted">—</span>'}</td>`).join('')}<td ${num}><b>${rp(sum(a, v => v))}</b></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Tidak ada piutang.</td></tr>'}</tbody></table></div>
      <p class="lead">Nilai persediaan (HPP × stok): <b>${rp(stockVal)}</b>.</p>`;
    $('#pfxMonth').onchange = (e) => { st.month = e.target.value; drawFin(); };
  }

  /* ---------- Log Aktivitas (Owner) ---------- */
  function drawLog() {
    const ev = M.logEvents;
    $('#pfx').innerHTML = `
      <p class="note">Disusun dari catatan di setiap data (sama seperti aplikasi). Penghapusan permanen produk/invoice tidak tampil di sini karena arsip hapus tidak disalin ke portal.</p>
      <h2 class="wt-h">Log aktivitas <small class="muted">${ev.length} catatan</small></h2>
      <ul class="wt-log pfx-log">${ev.slice(0, 300).map(l => `<li><small class="muted">${esc(fmtDT(l.at))} · ${esc(M.who(l.by))}</small><span>${esc(l.what)}</span></li>`).join('') || '<li class="muted">Belum ada aktivitas.</li>'}</ul>`;
  }

  /* ---------- Tim & Peran (Owner) ---------- */
  function drawTim() {
    const T = M.team, mem = [...M.members].sort((a, b) => String(b.lastSeen || '').localeCompare(String(a.lastSeen || '')));
    const used = (id) => mem.filter(m => M.roleById((T.members[m.id] || {}).role || T.defaultRole).id === id).length;
    $('#pfx').innerHTML = `
      <h2 class="wt-h">Anggota tim <small class="muted">${mem.length} admin</small></h2>
      <div class="tablewrap"><table class="tbl wt-tbl"><thead><tr><th>Nama</th><th>Peran</th><th>Terakhir masuk</th><th>Pertama masuk</th></tr></thead><tbody>
        <tr><td><b>Owner</b><br><small class="muted">Pemilik aplikasi</small></td><td><span class="badge ok">Owner · akses penuh</span></td><td>—</td><td>—</td></tr>
        ${mem.map(m => { const cm = T.members[m.id] || {}; return `<tr><td><b>${esc(cm.label || 'Admin (belum ada nama)')}</b>${cm.role ? '' : ' <span class="badge info">Baru</span>'}</td><td>${esc(M.roleById(cm.role || T.defaultRole).name)}</td><td>${esc(fmtD(m.lastSeen))}</td><td>${esc(fmtD(m.firstSeen))}</td></tr>`; }).join('')}
      </tbody></table></div>
      <h2 class="wt-h">Peran & izin</h2>
      <div class="tablewrap"><table class="tbl pfx-perm"><thead><tr><th>Peran</th>${PERMS.map(p => `<th>${p[1]}<br><small class="muted">${p[2]}</small></th>`).join('')}</tr></thead><tbody>
        ${T.roles.map(r => `<tr><td><b>${esc(r.name)}</b><br><small class="muted">${used(r.id)} anggota${r.id === T.defaultRole ? ' · peran admin baru' : ''}</small></td>${PERMS.map(p => `<td class="pfx-c">${(r.perms || []).includes(p[0]) ? '<span class="pfx-yes" aria-label="boleh">✓</span>' : '<span class="muted" aria-label="tidak">—</span>'}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>
      <p class="lead">Semua peran bisa melihat stok, invoice, dan pelanggan; centang menentukan apa yang boleh dicatat atau diubah di aplikasi. HPP, laba, saldo rekening, Laporan, Log Aktivitas, Pengaturan, persetujuan opname, dan menu ini hanya untuk Owner. Mengubah peran dan nama panggilan dilakukan di aplikasi Claude.</p>`;
  }

  /* ---------- Pengaturan (Owner, lihat saja) ---------- */
  function drawSet() {
    const co = Object.assign({ name: 'Proflex Graphics', tagline: '', phone: '', address: '', bank: '', prefix: 'INV/PFX/' }, M.company);
    const f = (l, v) => `<div><small>${l}</small><b>${esc(v || '—')}</b></div>`;
    $('#pfx').innerHTML = `
      <h2 class="wt-h">Data usaha <small class="muted">kop invoice</small></h2>
      <div class="wt-facts">${f('Nama usaha', co.name)}${f('Keterangan singkat', co.tagline)}${f('No. WA / telepon', co.phone)}${f('Awalan nomor invoice', co.prefix)}${f('Alamat', co.address)}${f('Info rekening pembayaran', co.bank)}</div>
      <h2 class="wt-h">Rekening & kas</h2>
      <div class="tablewrap"><table class="tbl wt-tbl"><thead><tr><th>Nama rekening</th><th>Jenis</th><th ${num}>Saldo awal</th><th ${num}>Saldo saat ini</th><th>Status</th></tr></thead><tbody>
        ${M.accounts.map(a => `<tr><td><b>${esc(a.name)}</b>${a.id === M.sheetInfo?.acc ? '<br><small class="muted">menerima mutasi bank dari Google Sheet</small>' : ''}</td><td>${a.kind === 'tunai' ? 'Kas tunai' : 'Rekening bank / e-wallet'}</td>
          <td ${num}>${rpS(M.openingOf(a.id))}</td><td ${num}>${rpS(M.balanceOf(a.id))}</td><td>${a.active !== false ? '<span class="badge ok">Aktif</span>' : '<span class="badge off">Tidak aktif</span>'}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="lead">Saldo awal adalah uang yang sudah ada di rekening sebelum transaksi pertama dicatat. Setelah itu saldo bergerak sendiri dari pembayaran invoice, mutasi bank, kas masuk lain, dan kas keluar.</p>
      <p class="note">Untuk menambah Admin: klik <b>Share</b> di aplikasi Claude, undang email Admin dengan akses <b>Editor</b>, lalu atur perannya di menu Tim & Peran. Mengubah data usaha dan rekening dilakukan di aplikasi Claude.</p>`;
  }

  /* ---------- detail (dialog) ---------- */
  function openDlg(html) {
    const dlg = $('#dlg'); dlg.classList.add('dlg--wide');
    dlg.innerHTML = `<div class="dlg">${html}</div>`;
    dlg.onclick = (e) => { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); };
    dlg.onclose = () => dlg.classList.remove('dlg--wide');
    dlg.showModal();
  }
  const head = (sub, title) => `<div class="wt-dh"><div><span class="muted tiny">${sub}</span><h2>${title}</h2></div><button class="iconbtn" data-close aria-label="Tutup">×</button></div>`;
  const factList = (rows) => `<ul class="wt-log">${rows.filter(Boolean).map(([l, v]) => `<li><small class="muted">${l}</small><span>${v}</span></li>`).join('')}</ul>`;

  function openInv(id) {
    const x = M.inv.find(x => x.i.id === id); if (!x) return; const { i, t } = x;
    openDlg(`${head(`${esc(fmtD(i.date))} · ${pill(t)}`, esc(i.no))}
      <div class="wt-facts">
        <div><small>Pelanggan</small><b>${esc(custLabel(i))}</b><span class="muted">${esc(i.custPhone && i.custPhone !== '—' ? i.custPhone : '')}</span></div>
        <div><small>Jatuh tempo</small><b>${esc(fmtD(i.due))}</b>${t.overdue ? `<span style="color:var(--red)">${diffDays(TODAY, i.due)} hari lewat</span>` : ''}</div>
        <div><small>Total</small><b>${rp(t.total)}</b></div><div><small>Sisa tagihan</small><b>${rp(t.remaining)}</b></div>
        ${M.owner && !i.void ? `<div><small>HPP · laba kotor</small><b>${rp(t.profit)}</b><span class="muted">HPP ${rp(t.cost)}</span></div>` : ''}
      </div>
      ${i.void ? `<p class="note">Dibatalkan. Alasan: ${esc(i.voidReason || '—')}.</p>` : ''}
      <h3>Barang</h3><div class="tablewrap"><table class="tbl"><thead><tr><th>Item</th><th ${num}>Qty</th><th ${num}>Harga</th><th ${num}>Disk</th><th ${num}>Jumlah</th></tr></thead><tbody>
      ${(i.items || []).map(it => `<tr><td>${esc(it.name)}<br><small class="muted">${esc(it.sku || '')}${it.ret ? ' · dari roll retur' : ''}</small></td><td ${num}>${it.qty} ${esc(it.unit || '')}</td><td ${num}>${rp(it.price)}</td><td ${num}>${it.disc ? it.disc + '%' : '—'}</td><td ${num}>${rp(it.qty * it.price * (1 - (it.disc || 0) / 100))}</td></tr>`).join('')}
      <tr><td colspan="4">Subtotal</td><td ${num}>${rp(t.gross)}</td></tr>${t.itemDisc ? `<tr><td colspan="4">Diskon item</td><td ${num}>−${rp(t.itemDisc)}</td></tr>` : ''}
      ${i.discTotal ? `<tr><td colspan="4">Diskon</td><td ${num}>−${rp(i.discTotal)}</td></tr>` : ''}${t.ship ? `<tr><td colspan="4">Ongkos kirim</td><td ${num}>${rp(t.ship)}</td></tr>` : ''}
      ${t.rounding ? `<tr><td colspan="4">Pembulatan</td><td ${num}>${rpS(t.rounding)}</td></tr>` : ''}<tr><td colspan="4"><b>Total</b></td><td ${num}><b>${rp(t.total)}</b></td></tr></tbody></table></div>
      <h3>Pembayaran</h3>${(i.payments || []).length ? `<ul class="wt-log">${i.payments.map(p => `<li><small class="muted">${esc(fmtD(p.date))} · ${esc(p.method || '')} → ${esc(M.accName(M.payAcc(p)))}</small><span><b>${rp(p.amount)}</b>${p.note ? ' · ' + esc(p.note) : ''}</span></li>`).join('')}</ul>` : '<p class="muted">Belum ada pembayaran.</p>'}
      ${i.note ? `<p class="note">Catatan: ${esc(i.note)}</p>` : ''}`);
  }
  function openProd(id) {
    const p = M.Pm(id); if (!p) return;
    const mv = M.movesFor(id).slice(0, 60); let bal = M.stk(p);
    const rows = mv.map(m => { const r = `<tr><td><small>${esc(fmtD(m.date))}</small></td><td><span class="badge ${{ IN: 'info', OUT: 'off', ADJ: 'warn' }[m.type]}">${m.label}</span></td><td>${esc(m.ref)}</td><td ${num}>${m.qty > 0 ? '+' : ''}${m.qty}</td><td ${num}>${bal}</td></tr>`; bal -= m.qty; return r; }).join('');
    const hp = M.owner ? M.cost(id) : 0;
    const retLeft = M.returns.filter(r => r.pid === id).map(r => { let used = 0; M.live.forEach(({ i }) => (i.items || []).forEach(it => { if (it.ret === r.id) used += +it.qty || 0; })); return { r, left: Math.max(0, (+r.goodM || 0) - used) }; }).filter(x => x.left > 0);
    openDlg(`${head(esc(p.sku), esc(p.name))}
      <div class="wt-facts"><div><small>Stok sekarang</small><b>${M.stk(p)} ${esc(p.unit || '')}</b>${stockPill(p)}</div><div><small>Minimum</small><b>${p.min || 0}</b></div>
        <div><small>Harga jual</small><b>${rp(p.price)}</b></div><div><small>Lokasi</small><b>${esc(p.loc || '—')}</b></div>
        ${M.owner ? `<div><small>HPP keluar berikutnya</small><b>${hp ? rp(hp) : '—'}</b><span class="muted">${hp && p.price ? 'margin ' + Math.round((p.price - hp) / p.price * 100) + '% · FIFO' : ''}</span></div>` : ''}</div>
      ${retLeft.length ? `<p class="note">Sisa roll retur (tidak termasuk stok roll): ${retLeft.map(x => esc(x.r.no) + ' ' + x.left + ' m').join(', ')}</p>` : ''}
      <h3>Kartu stok</h3><div class="tablewrap"><table class="tbl"><thead><tr><th>Tanggal</th><th>Jenis</th><th>Referensi</th><th ${num}>Qty</th><th ${num}>Saldo</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="muted">Belum ada mutasi.</td></tr>'}</tbody></table></div>`);
  }
  function openCust(id) {
    const c = M.customers.find(x => x.id === id); if (!c) return;
    const xs = M.inv.filter(x => x.i.custId === id).sort((a, b) => String(b.i.date).localeCompare(String(a.i.date)));
    const lv = xs.filter(x => !x.i.void).map(x => x.t);
    openDlg(`${head(esc(c.type || ''), esc(c.name))}
      <div class="wt-facts"><div><small>Telepon</small><b>${esc(c.phone || '—')}</b></div><div><small>Termin</small><b>${c.term ? c.term + ' hari' : 'Tunai'}</b></div>
        <div><small>Total belanja</small><b>${rp(sum(lv, t => t.total))}</b><span class="muted">${lv.length} invoice</span></div><div><small>Piutang</small><b>${rp(sum(lv, t => t.remaining))}</b></div></div>
      ${c.addr ? `<p class="note">${esc(c.addr)}</p>` : ''}
      <h3>Invoice</h3>${invTable(xs, { compact: true, empty: 'Belum ada invoice.' })}`);
  }
  function openOp(id) {
    const o = M.opname.find(x => x.id === id); if (!o) return;
    const lines = o.lines || [], counted = lines.filter(l => l.physical != null).length, nd = lines.filter(l => l.physical != null && l.physical !== l.system).length;
    const stt = { draft: 'Sedang dihitung', submitted: 'Menunggu persetujuan Owner', approved: `Disetujui ${M.owner ? M.who(o.approvedBy) + ', ' : ''}${fmtD(o.approvedAt)}. Stok sudah disesuaikan.` }[o.status] || o.status;
    openDlg(`${head(`${esc(fmtD(o.date))} · ${esc(o.scope || '')}`, esc(o.no))}
      <div class="wt-facts"><div><small>Sudah dihitung</small><b>${counted} / ${lines.length}</b><span class="muted">SKU</span></div><div><small>SKU selisih</small><b>${nd}</b><span class="muted">${esc(stt)}</span></div>
        ${M.owner ? `<div><small>Nilai selisih</small><b>${rpS(opDiffVal(o))}</b><span class="muted">berdasarkan HPP</span></div>` : ''}</div>
      <h3>Lembar hitung</h3><div class="tablewrap"><table class="tbl"><thead><tr><th>SKU</th><th>Produk</th><th ${num}>Stok sistem</th><th ${num}>Fisik</th><th ${num}>Selisih</th>${M.owner ? `<th ${num}>Nilai</th>` : ''}</tr></thead><tbody>
      ${lines.map(l => { const p = M.Pm(l.pid), d = l.physical == null ? null : l.physical - l.system; return `<tr><td><small>${esc(p ? p.sku : l.sku)}</small></td><td>${esc(p ? p.name : l.name)}${p?.loc ? `<br><small class="muted">${esc(p.loc)}</small>` : ''}</td><td ${num}>${l.system}</td><td ${num}>${l.physical ?? '—'}</td>
        <td ${num}>${d === null ? '<span class="muted">—</span>' : d === 0 ? '<span class="muted">0</span>' : `<b style="color:${d > 0 ? 'var(--ok)' : 'var(--red)'}">${d > 0 ? '+' : ''}${d}</b>`}</td>${M.owner ? `<td ${num}>${d ? rpS(d * M.cost(l.pid)) : '—'}</td>` : ''}</tr>`; }).join('')}</tbody></table></div>`);
  }
  function openKonf(id) {
    const k = M.konf.find(x => x.id === id); if (!k) return;
    const atts = (m) => { const a = [].concat(m.attachments || m.files || m.att || []).filter(x => x && typeof x === 'object'); if (!a.length) return '';
      return `<div class="pfx-atts">${a.map(x => { const th = [x.thumb, x.thumbnail].find(v => typeof v === 'string' && /^data:image\/(png|jpe?g|gif|webp);/.test(v));
        return `<span class="pfx-att">${th ? `<img src="${esc(th)}" alt="">` : ''}<small>${esc(x.name || x.filename || 'Lampiran')}</small></span>`; }).join('')}</div>`; };
    openDlg(`${head(`${konfSt(k)} · dari ${esc(konfAgent(k))} untuk ${esc(M.who(k.to))} · ${esc(fmtDT(k.createdAt))}`, 'Konfirmasi ' + esc(k.no || ''))}
      ${k.ref ? `<p class="lead">Referensi: <b>${esc(k.ref)}</b></p>` : ''}
      <div class="pfx-thread">${(k.thread || []).map(m => `<div class="pfx-msg ${m.role === 'admin' ? 'is-admin' : ''}"><small class="muted"><b>${m.role === 'admin' ? 'Jawaban ' + esc(M.who(m.by)) : esc(m.name || konfAgent(k))}</b> · ${esc(fmtDT(m.at))}</small><p>${esc(m.text || '')}</p>${atts(m)}</div>`).join('') || `<div class="pfx-msg"><p>${esc(k.q || '')}</p></div>`}</div>
      ${atts(k)}
      <p class="muted tiny">Menjawab pertanyaan dilakukan di aplikasi Claude. File lampiran asli tidak disalin ke portal.</p>`);
  }
  function openBank(sid) {
    const x = M.sheetRows.find(r => r.sid === sid); if (!x) return;
    openDlg(`${head(esc(fmtD(x.d)) + (x.p ? ' · pending' : ''), (x.t === 'in' ? 'Mutasi bank · masuk ' : 'Mutasi bank · keluar ') + rp(x.a))}
      ${factList([['Rekening', esc(M.accName(x.acc))], ['Kategori', esc(x.c || '—')], ['Catatan admin', esc(x.s || '—')], ['Keterangan bank', esc(x.k || '—')], ['Sumber', `Google Sheet Cashflow Proflex · tab ${esc(x.tab)} · baris ${esc(x.r)}`]])}
      ${x.dup ? '<p class="note">Baris ini tidak dihitung lagi di Arus Kas karena pembayarannya sudah dicatat lewat invoice.</p>' : ''}`);
  }
  function openCash(id) {
    const c = M.ledger.find(r => r.id === id && r.kind !== 'pay' && r.kind !== 'sheet'); if (!c) return;
    openDlg(`${head(esc(fmtD(c.date)), (c.dir === 'in' ? 'Kas masuk lain ' : c.dir === 'out' ? 'Kas keluar ' : 'Pindah rekening ') + rp(c.amount))}
      ${factList([['Kategori', esc(c.cat)], ['Keterangan', esc(c.desc || '—')], ['Rekening', c.dir === 'move' ? esc(M.accName(c.acc)) + ' → ' + esc(M.accName(c.toAcc)) : esc(M.accName(c.acc))], ['Dicatat', esc(M.who(c.by))]])}`);
  }
  function openExp(ref) {
    const ix = ref.indexOf(':'), src = ref.slice(0, ix), id = ref.slice(ix + 1), r = M.expRows.find(x => x.src === src && x.id === id); if (!r) return;
    const its = r.settles.map(sid => M.expRows.find(x => x.src === 'kas' && x.id === sid)).filter(Boolean), tot = sum(its, x => x.amount);
    openDlg(`${head(esc(fmtD(r.date)) + (r.pend ? ' · pending' : ''), (r.src === 'bank' ? 'Pengeluaran · mutasi bank ' : 'Pengeluaran · dicatat manual ') + rp(r.amount))}
      ${factList([
        ['Kategori', r.parts.map(p => `<div>${esc(p.cat)}${p.note ? ' — ' + esc(p.note) : ''}${shipTxt(p) ? ' — ' + esc(shipTxt(p)) : ''} <span class="muted">· ${EXP_GROUPS[expGroup(p.cat)]}${r.parts.length > 1 ? ' · ' + rp(p.amount) : ''} · untuk ${fmtM(p.period)}</span></div>`).join('')],
        ['Keterangan', esc(r.desc || '—')], r.bankText && r.bankText !== r.desc ? ['Keterangan bank', esc(r.bankText)] : null, ['Dibayar ke', esc(r.vendor || '—')], r.note ? ['Catatan', esc(r.note)] : null,
        ['Dibayar dari', esc(accLabel(r)) + (r.ownerPaid ? `<div>${reimbPill(r)}</div>${r.settledBy ? `<div class="muted">Diganti lewat: ${esc(r.settledBy.desc || '—')} (${rp(r.settledBy.amount)}, ${esc(accLabel(r.settledBy))})</div>` : `<div class="muted">Perusahaan masih berutang ${rp(r.amount)} ke ${esc(r.payer || 'owner')}.</div>`}` : '')],
        its.length ? ['Mengganti', its.map(x => `<div>${esc(fmtD(x.date))} · ${esc(x.desc)} · <b>${rp(x.amount)}</b> <span class="muted">(dibayar ${esc(x.payer || 'owner')})</span></div>`).join('') + (Math.abs(tot - r.amount) >= 1 ? `<div class="muted">Total yang diganti ${rp(tot)}, transfer ${rp(r.amount)} (selisih ${rpS(r.amount - tot)}).</div>` : '')] : null,
        r.src === 'kas' ? ['Dicatat', esc(M.who(r.by)) + ', ' + esc(fmtDT(r.meta.createdAt))] : ['Sumber', 'Google Sheet Cashflow Proflex'],
      ])}
      <p class="muted tiny">Nota/lampiran tidak disalin ke portal. Kategori diubah di aplikasi Claude.</p>`);
  }

  function bindSearch() {
    const inp = $('#pfxQ'); if (!inp) return;
    inp.oninput = () => { st.q = inp.value; const pos = inp.selectionStart; draw(); const n = $('#pfxQ'); n.focus(); n.setSelectionRange(pos, pos); };
  }
  const VIEWS = { ring: drawRing, konf: drawKonf, stok: drawStok, masuk: drawMasuk, inv: drawInv, keluar: drawKeluar, cust: drawCust, opname: drawOpname,
    arus: drawArus, biaya: drawBiaya, laporan: drawLaporan, lr: drawLR, fin: drawFin, log: drawLog, tim: drawTim, set: drawSet };
  const OWNER_ONLY = ['konf', 'arus', 'biaya', 'laporan', 'lr', 'fin', 'log', 'tim', 'set'];
  const draw = () => { if (!VIEWS[st.tab] || (!M.owner && OWNER_ONLY.includes(st.tab))) st.tab = 'ring'; VIEWS[st.tab](); };
  const openRow = (t) => t.dataset.inv ? openInv(t.dataset.inv) : t.dataset.prod ? openProd(t.dataset.prod) : t.dataset.cust ? openCust(t.dataset.cust)
    : t.dataset.op ? openOp(t.dataset.op) : t.dataset.konf ? openKonf(t.dataset.konf) : t.dataset.bank ? openBank(t.dataset.bank)
    : t.dataset.cash ? openCash(t.dataset.cash) : t.dataset.exp ? openExp(t.dataset.exp) : null;
  const ROW = '[data-inv],[data-prod],[data-cust],[data-op],[data-konf],[data-bank],[data-cash],[data-exp]';
  view.onclick = (e) => {
    const t = e.target.closest('[data-tab],[data-invf],[data-ctype],[data-konff],[data-expc],' + ROW); if (!t) return;
    if (t.dataset.tab) { st.tab = t.dataset.tab; st.q = ''; view.querySelectorAll('.pfx-nav [data-tab]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tab === st.tab)); }
    else if ('invf' in t.dataset) st.invf = t.dataset.invf;
    else if ('ctype' in t.dataset) st.ctype = t.dataset.ctype;
    else if ('konff' in t.dataset) st.konfF = t.dataset.konff;
    else if ('expc' in t.dataset) st.expC = st.expC === t.dataset.expc ? '' : t.dataset.expc;
    else return openRow(t);
    draw();
  };
  view.onkeydown = (e) => { const r = e.target.closest?.('[tabindex]'); if (e.key === 'Enter' && r && r.matches(ROW)) openRow(r); };
  draw();
}

/* Ringkasan singkat untuk Beranda */
export async function proflexHomeSummary(api) {
  const [docs, sync] = await Promise.all([api.listDocs('proflex'), api.lastSync('proflex').catch(() => null)]);
  if (!docs.length) return null;
  const M = proflexModel(docs);
  if (!M.products.length && !M.invoices.length) return null;
  return {
    lowStock: M.low.length, outOfStock: M.habis.length,
    unpaid: M.unpaid.length, unpaidAmount: M.piutang,
    overdue: M.overdue.length, overdueAmount: M.overdueAmt,
    lowItems: M.low.slice(0, 4).map(p => ({ sku: p.sku, name: p.name, stock: M.stk(p), min: +p.min || 0 })),
    overdueItems: M.overdue.slice(0, 4).map(({ i, t }) => ({ no: i.no, cust: i.custName || '', due: i.due, remaining: t.remaining })),
    stats: [
      { label: 'stok menipis/habis', value: M.low.length, tone: M.low.length ? 'bad' : '' },
      { label: 'invoice belum lunas', value: M.unpaid.length, tone: '' },
      { label: 'lewat jatuh tempo', value: M.overdue.length, tone: M.overdue.length ? 'bad' : '' },
    ],
    syncAt: sync?.at || null,
  };
}
