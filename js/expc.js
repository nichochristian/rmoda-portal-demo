// Modul EXPC (salinan dari aplikasi EXPC di Claude, lihat saja).
// Dua bisnis dalam satu aplikasi: EXPC Detailing Supplies (gudang & penjualan) dan EXPC Detailing Academy (kelas).
// Rumus stok, total invoice, status bayar, dan arus kas disalin dari aplikasi supaya angkanya sama.
// Bagian keuangan Owner (HPP, saldo, laba kotor) hanya muncul bila dokumennya ada; database (RLS) hanya
// mengirimnya ke Owner.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const MEMBER = { network: 'EXPC Network', student: 'EXPC Student', partner: 'Partner EXPC' };
const KIND = { titip: 'Stock Distributor - SCW masuk', beli: 'Beli · kirim dari distributor', ambil: 'Beli dari Stock Distributor - SCW', retur: 'Stock Distributor - SCW dikembalikan' };
const DEFAULT_ACCS = [{ id: 'bank', name: 'Rekening bank', kind: 'bank' }, { id: 'kas', name: 'Kas tunai', kind: 'tunai' }];
const BANK760 = 'bank';

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const rp = (n) => 'Rp' + Math.round(n || 0).toLocaleString('id-ID');
const rpS = (n) => (n < 0 ? '−' : '') + rp(Math.abs(n));
const nf = (n) => Math.round(n || 0).toLocaleString('id-ID');
const fmtD = (s) => s ? new Date(String(s).slice(0, 10) + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const fmtDT = (s) => { if (!s) return '—'; const d = new Date(s); return `${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const diffDays = (a, b) => Math.round((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 864e5);
const mLabel = (m) => MONTHS[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4);
const sum = (xs, f) => xs.reduce((s, x) => s + (+f(x) || 0), 0);

/* ---------- data & rumus (sama dengan aplikasi) ---------- */
function load(docs) {
  const by = (c) => docs.filter(d => d.coll === c).map(d => ({ ...d.data, id: d.id }));
  const one = (c, id) => docs.find(d => d.coll === c && d.id === id)?.data || null;
  const fin = { costs: one('fin', 'costs'), balances: one('fin', 'balances'), banksync: one('fin', 'banksync'), payables: one('fin', 'payables') };
  const paid = fin.payables?.paid || {};
  const D = {
    products: by('products'), invoices: by('invoices'), customers: by('customers'), receipts: by('receipts'),
    opname: by('opname'), bundles: by('bundles'), scwinv: by('scwinv'), cash: by('cash'), konf: by('konfirmasi'),
    company: one('config', 'company'), accounts: one('config', 'accounts'), expmeta: one('config', 'expmeta'), fin,
    aca: { services: by('aca_services'), promos: by('aca_promos'), customers: by('aca_customers'), invoices: by('aca_invoices'), company: one('aca_config', 'company') },
  };
  // HPP (Owner saja): riwayat berlaku per tanggal
  const costs = fin.costs?.costs || {}, hist = {};
  Object.keys(fin.costs?.hist || {}).forEach(k => { if (Array.isArray(fin.costs.hist[k])) hist[k] = fin.costs.hist[k].slice().sort((x, y) => String(x.from || '').localeCompare(String(y.from || ''))); });
  const pkgCosts = fin.costs?.pkg || {};
  D.hasCost = !!fin.costs;
  D.costAt = (pid, d) => {
    const h = hist[pid]; if (!h || !h.length) return +(costs[pid] || 0);
    d = String(d || '').slice(0, 10); let c = +h[0].cost || 0;
    for (const e of h) { if (String(e.from || '') <= d) c = +e.cost || 0; else break; }
    return c;
  };
  const pkgOver = (bid, pid) => { const a = bid && pkgCosts[bid]; const e = Array.isArray(a) ? a.find(x => x.pid === pid) : null; return e ? (+e.cost || 0) : null; };
  const itemBid = (it) => it.bid || (it.pkg ? (D.bundles.find(b => b.name === it.pkg) || {}).id : '') || '';
  D.itemCost = (it, d) => { const o = pkgOver(itemBid(it), it.pid); return o === null ? D.costAt(it.pid, d) : o; };
  D.pkgCost = (bid, pid) => { const o = pkgOver(bid, pid); return o === null ? D.costAt(pid, iso(new Date())) : o; };
  D.paid = paid;
  return D;
}

function computeStock(D) {
  const own = {}, cons = {}, moves = {}, ev = [], sold = [], auto = {}, ds = {};
  const log = (pid, e) => { e.own = own[pid] || 0; e.cons = cons[pid] || 0; (moves[pid] = moves[pid] || []).push(e); };
  D.products.forEach(p => { const q = +p.opening || 0; if (!q) return; const c = p.openingKind !== 'own';
    ev.push({ k: '', f() { if (c) cons[p.id] = (cons[p.id] || 0) + q; else own[p.id] = (own[p.id] || 0) + q; log(p.id, { date: (p.createdAt || '').slice(0, 10), label: 'Stok awal' + (c ? ' (Stock Distributor - SCW)' : ' (Stock EXPC)'), ref: '—', dOwn: c ? 0 : q, dCons: c ? q : 0 }); } }); });
  D.receipts.forEach(r => { const k = KIND[r.kind] ? r.kind : 'titip';
    ev.push({ k: String(r.date || '') + '|' + String(r.createdAt || ''), f() { (r.lines || []).forEach(l => { const q = +l.qty || 0, pid = l.pid; if (!q) return; let dO = 0, dC = 0;
      if (k === 'beli') dO = q; else if (k === 'ambil') { dO = q; dC = -q; } else if (k === 'retur') dC = -q; else dC = q;
      own[pid] = (own[pid] || 0) + dO; cons[pid] = (cons[pid] || 0) + dC;
      log(pid, { date: r.date, label: KIND[k], ref: r.no, dOwn: dO, dCons: dC }); }); } }); });
  D.invoices.forEach(i => { if (i.void) return;
    ev.push({ k: String(i.date || '') + '|' + String(i.createdAt || ''), f() { (i.items || []).forEach(it => { const q = +it.qty || 0, pid = it.pid; if (!q) return;
      if (it.ds) { sold.push({ i, it, src: 'ds', qty: q }); (ds[i.id] = ds[i.id] || []).push({ pid, qty: q, it }); log(pid, { date: i.date, label: 'Dropship · ' + q + ' dikirim langsung distributor', ref: i.no, dOwn: 0, dCons: 0 }); return; }
      const a = Math.min(Math.max(own[pid] || 0, 0), q), short = q - a;   // stok milik dulu, kurangnya dari Stock Distributor - SCW
      own[pid] = (own[pid] || 0) - a; cons[pid] = (cons[pid] || 0) - short;
      if (a > 0) sold.push({ i, it, src: 'own', qty: a }); if (short > 0) { sold.push({ i, it, src: 'cons', qty: short }); (auto[i.id] = auto[i.id] || []).push({ pid, qty: short, it }); }
      log(pid, { date: i.date, label: 'Keluar' + (short > 0 ? ' · ' + short + ' dari Stock Distributor - SCW' : ''), ref: i.no, dOwn: -a, dCons: -short }); }); } }); });
  D.opname.forEach(o => { if (o.status !== 'approved') return; const at = String(o.approvedAt || o.date || '');
    ev.push({ k: at.slice(0, 10) + '|' + at, f() { (o.lines || []).forEach(l => { if (l.physical == null || l.physical === l.system) return; const d = l.physical - l.system, pid = l.pid, toOwn = o.adjTo === 'own'; let dO = 0, dC = 0;
      if (d > 0) { if (toOwn) dO = d; else dC = d; }
      else { const n = -d, first = Math.max((toOwn ? own[pid] : cons[pid]) || 0, 0), take = Math.min(first, n), rest = n - take; if (toOwn) { dO = -take; dC = -rest; } else { dC = -take; dO = -rest; } }
      own[pid] = (own[pid] || 0) + dO; cons[pid] = (cons[pid] || 0) + dC;
      log(pid, { date: at.slice(0, 10), label: 'Penyesuaian opname', ref: o.no, dOwn: dO, dCons: dC }); }); } }); });
  ev.sort((a, b) => a.k < b.k ? -1 : a.k > b.k ? 1 : 0).forEach(e => e.f());
  D.products.forEach(p => { p.own = own[p.id] || 0; p.cons = cons[p.id] || 0; p.stk = p.own + p.cons; p.moves = moves[p.id] || [];
    p.state = p.stk <= 0 ? ['bad', 'Habis'] : p.stk < (+p.min || 0) ? ['warn', 'Menipis'] : ['ok', 'Aman']; });
  D.sold = sold; D.auto = auto; D.ds = ds;
}

function supTotals(inv, D, today) {
  const items = inv.items || [];
  const sub = items.reduce((s, it) => s + it.qty * it.price * (1 - (it.disc || 0) / 100), 0);
  const gross = items.reduce((s, it) => s + it.qty * it.price, 0);
  const ship = Math.max(0, Math.round(+inv.shipping || 0));
  const pre = Math.max(0, Math.round(sub - (inv.discTotal || 0))) + ship;
  const total = Math.max(0, pre + (+inv.rounding || 0));
  const paid = (inv.payments || []).reduce((s, p) => s + (+p.amount || 0), 0);
  const remaining = inv.void ? 0 : Math.max(0, total - paid);
  const status = inv.void ? 'batal' : remaining <= 0 ? 'lunas' : paid > 0 ? 'sebagian' : 'belum';
  const overdue = !inv.void && status !== 'lunas' && inv.due < today;
  const cost = D.hasCost ? items.reduce((s, it) => s + it.qty * D.itemCost(it, inv.date), 0) : null;
  return { sub: Math.round(sub), gross, itemDisc: Math.round(gross - sub), ship, pre, rounding: total - pre, total, paid, remaining, status, overdue, cost, profit: cost === null ? null : total - ship - cost };
}
function acaTotals(inv, today) {
  const items = inv.items || [];
  const sub = items.reduce((s, it) => s + (+it.qty || 0) * (+it.price || 0) * (1 - (+it.disc || 0) / 100), 0);
  const gross = items.reduce((s, it) => s + (+it.qty || 0) * (+it.price || 0), 0);
  const total = Math.max(0, Math.round(sub - (inv.discTotal || 0)));
  const paid = (inv.payments || []).reduce((s, p) => s + (+p.amount || 0), 0);
  const remaining = inv.void ? 0 : Math.max(0, total - paid);
  const status = inv.void ? 'batal' : remaining <= 0 ? 'lunas' : paid > 0 ? 'sebagian' : 'belum';
  const overdue = !inv.void && status !== 'lunas' && inv.due < today;
  return { sub: Math.round(sub), gross, itemDisc: Math.round(gross - sub), ship: 0, pre: total, rounding: 0, total, paid, remaining, status, overdue, cost: null, profit: null };
}

/* rekening & arus kas: kas gabungan Supplies + Academy; pembayaran ke rekening bank 760 masuk lewat mutasi bank */
function cashLedger(D) {
  const accs = (D.accounts && Array.isArray(D.accounts.list) && D.accounts.list.length) ? D.accounts.list : DEFAULT_ACCS;
  const Acc = (id) => accs.find(a => a.id === id);
  const active = accs.filter(a => a.active !== false);
  const defaultAcc = (m) => { const want = m === 'Tunai' ? 'tunai' : 'bank'; return ((active.find(a => a.kind === want) || active[0] || accs[0]) || {}).id || ''; };
  const payAcc = (p) => (p.acc && Acc(p.acc)) ? p.acc : defaultAcc(p.method);
  const rows = [];
  const addPays = (list, biz) => list.filter(i => !i.void).forEach(i => (i.payments || []).forEach(p => { if (payAcc(p) === BANK760) return;
    rows.push({ date: p.date, at: String(p.at || p.date), dir: 'in', amount: +p.amount || 0, acc: payAcc(p), cat: 'Pembayaran invoice', desc: (i.custName || 'Tanpa nama') + (p.note ? ' · ' + p.note : ''), ref: i.no, biz }); }));
  addPays(D.invoices, 'Supplies'); addPays(D.aca.invoices, 'Academy');
  const bm = (id) => (D.expmeta && D.expmeta.rows && D.expmeta.rows[id]) || null;
  const metaCat = (c) => { const m = c.type === 'out' && c.src === 'sheet760' ? bm(c.id) : null; return m ? (Array.isArray(m.split) && m.split.length > 1 ? 'Beberapa kategori' : m.cat) : null; };
  D.cash.filter(c => !c.void && c.acc !== 'owner').forEach(c => rows.push({ date: c.date, at: String(c.createdAt || c.date), dir: c.type === 'in' ? 'in' : c.type === 'out' ? 'out' : 'move',
    amount: +c.amount || 0, acc: c.acc, toAcc: c.toAcc, cat: metaCat(c) || c.cat || (c.type === 'move' ? 'Pindah rekening' : 'Lainnya'), desc: c.desc || '', ref: c.invNo || '',
    biz: c.invBiz ? (c.invBiz === 'sup' ? 'Supplies' : 'Academy') : c.biz === 'sup' ? 'Supplies' : c.biz === 'aca' ? 'Academy' : '' }));
  rows.sort((a, b) => (a.date + a.at).localeCompare(b.date + b.at));
  const eff = (r, a) => { if (!a) return r.dir === 'in' ? r.amount : r.dir === 'out' ? -r.amount : 0; if (r.dir === 'move') return (r.toAcc === a ? r.amount : 0) - (r.acc === a ? r.amount : 0); if (r.acc !== a) return 0; return r.dir === 'in' ? r.amount : -r.amount; };
  const opening = D.fin.balances?.opening || null;
  const openingOf = (a) => opening ? (a ? (+opening[a] || 0) : accs.reduce((s, x) => s + (+opening[x.id] || 0), 0)) : 0;
  const balanceOf = (a) => opening ? openingOf(a) + rows.reduce((s, r) => s + eff(r, a), 0) : null;
  const touches = (r, a) => !a || r.acc === a || (r.dir === 'move' && r.toAcc === a);
  // sama dengan flow() di aplikasi: m = 'YYYY-MM', {from,to}, atau kosong (semua waktu)
  const flow = (m, a) => { let i = 0, o = 0, ni = 0, no = 0; rows.forEach(r => { const d = String(r.date || '').slice(0, 10);
    if (m && (typeof m === 'string' ? d.slice(0, 7) !== m : (d < m.from || d > m.to))) return; if (!touches(r, a)) return; const e = eff(r, a || '');
    if (e > 0) { i += e; ni++; } else if (e < 0) { o -= e; no++; } }); return { in: i, out: o, nIn: ni, nOut: no }; };
  return { rows, accs, accName: (id) => Acc(id)?.name || '—', balanceOf, openingOf, eff, touches, flow, hasBalance: !!opening };
}

/* ---------- Pengeluaran & Laba Rugi (sama dengan aplikasi: expRows + lrCompute) ---------- */
const EXP_CATS = { 'Gaji': 'beban', 'Ongkir ke pelanggan': 'beban', 'Packaging': 'beban', 'Sewa / storage': 'beban', 'Biaya admin / jasa': 'beban', 'Listrik & internet': 'beban',
  'Operasional': 'beban', 'Konsumsi': 'beban', 'Peralatan': 'beban', 'Marketing': 'beban', 'Transport': 'beban', 'Biaya bank': 'beban', 'Refund pelanggan': 'beban',
  'Selisih saldo bank': 'beban', 'Lainnya': 'beban', 'Pembelian stok': 'stok', 'Ongkir pembelian (supplier ke gudang)': 'stok', 'Dividen': 'pemilik', 'Tarik pemilik': 'pemilik',
  'Pindah ke rekening lain': 'pindah', 'Reimburse ke owner': 'reimb' };
const REIMB = 'Reimburse ke owner';
const expGroup = (c) => EXP_CATS[c] || 'beban';
function normCat(c, text) {
  const t = String(text || '').toLowerCase();
  if (c === 'Ongkos kirim') return /\bscw\b|supplier|distributor/.test(t) ? 'Ongkir pembelian (supplier ke gudang)' : 'Ongkir ke pelanggan';
  if (c === 'Sewa tempat') return 'Sewa / storage';
  if (c === 'Pembelian stok' && /ongkir/.test(t)) return 'Ongkir pembelian (supplier ke gudang)';
  return EXP_CATS[c] ? c : 'Lainnya';
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
function expParts(amount, meta, baseCat, desc, date) {
  const sp = meta && Array.isArray(meta.split) ? meta.split.filter(s => +s.amount > 0) : [];
  const shipOf = (o) => o && o.cat === 'Ongkir ke pelanggan' ? { custName: o.custName || '', invNo: o.invNo || '', resi: o.resi || '' } : {};
  if (sp.length && Math.abs(sum(sp, s => s.amount) - amount) < 1) return sp.map(s => Object.assign({ cat: s.cat || baseCat, amount: +s.amount, note: s.note || '', period: s.period || guessPeriodFor(s.cat || baseCat, desc, date) || String(date).slice(0, 7) }, shipOf(Object.assign({ cat: s.cat || baseCat }, s))));
  const cat = (meta && meta.cat) || baseCat;
  return [Object.assign({ cat, amount, period: (meta && meta.period) || guessPeriodFor(cat, desc, date) || String(date).slice(0, 7) }, shipOf(Object.assign({}, meta || {}, { cat })))];
}
function expRows(D) {
  const bankMeta = (key) => (D.expmeta && D.expmeta.rows && D.expmeta.rows[key]) || null;
  const rows = [];
  D.cash.filter(c => !c.void && c.type === 'out').forEach(c => { const isBank = c.src === 'sheet760', meta = isBank ? (bankMeta(c.id) || {}) : c;
    const desc = String(c.desc || '').replace(/\s*\(mutasi bank\)\s*$/, ''), base = normCat(c.cat, desc + ' ' + (c.bankDesc || ''));
    rows.push({ src: isBank ? 'bank' : 'kas', id: c.id, date: c.date, at: String(c.createdAt || c.date), amount: +c.amount || 0, acc: c.acc, desc, bankText: c.bankDesc || '',
      vendor: meta.vendor || '', note: meta.note || '', nota: meta.nota, meta: isBank ? meta : c, ownerPaid: !isBank && c.acc === 'owner', payer: c.payer || '',
      biz: (isBank && meta.biz !== undefined && meta.biz !== null) ? meta.biz : (c.biz || ''), parts: expParts(+c.amount || 0, meta, base, desc, c.date) }); });
  rows.forEach(r => { r.cats = [...new Set(r.parts.map(p => p.cat))]; r.cat = r.cats.length > 1 ? 'Beberapa kategori' : r.cats[0]; r.settles = r.cat === REIMB && Array.isArray(r.meta?.settles) ? r.meta.settles : []; });
  const byId = {}; rows.forEach(r => { if (r.ownerPaid) byId[r.id] = r; });
  rows.forEach(r => r.settles.forEach(id => { const o = byId[id]; if (o && !o.settledBy) o.settledBy = r; }));
  rows.forEach(r => { if (r.cat !== REIMB) return; const linked = sum(r.settles.map(id => byId[id]).filter(Boolean), o => o.amount), rest = r.amount - linked;
    if (rest >= 1) { const per = r.parts[0].period; r.parts = (linked > 0 ? [{ cat: REIMB, amount: linked, period: per }] : []).concat([{ cat: 'Lainnya', amount: rest, period: per }]); } });
  return rows.sort((a, b) => (b.date + b.at).localeCompare(a.date + a.at));
}
const EXP_GROUPS = { beban: 'Beban operasional', stok: 'Pembelian stok (masuk HPP)', pemilik: 'Dividen & ambil pemilik', pindah: 'Pindah dana (bukan beban)', reimb: 'Reimburse ke owner (bukan beban baru)' };
const BIZ_OPTS = [['sup', 'Supplies'], ['aca', 'Academy'], ['', 'Bersama / belum ditentukan']];
const bizLabel = (b) => (BIZ_OPTS.find(x => x[0] === (b || '')) || BIZ_OPTS[2])[1];
const shipTxt = (p) => [p.custName ? 'ke ' + p.custName : '', p.invNo || '', p.resi ? 'resi ' + p.resi : ''].filter(Boolean).join(' · ');
const lastDay = (m) => m + '-' + pad(new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate());
/* Laba rugi Supplies untuk rentang tanggal; beban bersama (tanpa usaha) ikut dihitung seperti bawaan aplikasi */
const lrStart = (D) => { let m0 = '9999-12'; D.invoices.forEach(i => { if (!i.void && i.date && i.date.slice(0, 7) < m0) m0 = i.date.slice(0, 7); }); return (m0 === '9999-12' ? iso(new Date()).slice(0, 7) : m0) + '-01'; };
function lrCompute(D, from, to, shared = true) {
  const start = lrStart(D);
  const F = from < start ? start : from, inR = (d) => { d = String(d || '').slice(0, 10); return d >= F && d <= to; };
  const mF = F.slice(0, 7), mT = to.slice(0, 7), inM = (m) => m >= mF && m <= mT && m >= start.slice(0, 7);
  const bizOk = (b) => b === 'sup' || (shared && !b);
  let gross = 0, disc = 0, ship = 0, hpp = 0, n = 0, est = 0;
  D.inv.forEach(i => { if (i.void || !inR(i.date)) return; const t = i.t; n++; gross += t.gross; ship += t.ship; disc += t.gross - (t.total - t.ship); hpp += t.cost || 0; if (!(t.cost > 0) && t.total > 0) est++; });
  const sales = gross - disc, beban = {}, stok = {}, pemilik = {};
  const fullMonth = from.slice(8) === '01' && to === lastDay(to.slice(0, 7));
  D.exp.forEach(r => { if (!bizOk(r.biz)) return; r.parts.forEach(p => { const g = expGroup(p.cat); if (g === 'pindah') return;
    if (g === 'beban') { if (fullMonth ? inM(p.period) : (inR(r.date) && p.period >= start.slice(0, 7))) beban[p.cat] = (beban[p.cat] || 0) + p.amount; }
    else if (inR(r.date)) { const B = g === 'stok' ? stok : pemilik; B[p.cat] = (B[p.cat] || 0) + p.amount; } }); });
  const other = {}; D.cash.forEach(c => { if (c.void || c.type !== 'in' || c.invId || !inR(c.date) || !bizOk(c.biz || '')) return;
    const k = /bunga|jasa giro/i.test((c.cat || '') + ' ' + (c.desc || '') + ' ' + (c.bankDesc || '')) ? 'Bunga bank' : c.cat === 'Pengembalian dana' ? 'Pengembalian dana' : null; if (k) other[k] = (other[k] || 0) + (+c.amount || 0); });
  const totBeban = sum(Object.values(beban), v => v), totOther = sum(Object.values(other), v => v), labaKotor = sales + ship - hpp;
  return { F, n, gross, disc, est, sales, ship, hpp, labaKotor, beban, totBeban, other, totOther, stok, pemilik, laba: labaKotor - totBeban + totOther };
}

/* status invoice distributor (sama dengan scwStatus di aplikasi): lunas bila ditandai lunas di invoice itu,
   atau semua baris pembelian yang ditagihnya sudah ditandai lunas (fin/payables) */
let PAID = {};
function scwStatus(v) {
  const keys = v.keys || [], paid = keys.filter(k => PAID[k]).length;
  if (v.pay && v.pay.date) return { st: 'lunas', src: 'inv', n: keys.length, paid };
  if (keys.length && paid === keys.length) return { st: 'lunas', src: 'rows', n: keys.length, paid };
  return { st: 'belum', n: keys.length, paid };
}
const scwOpen = (v) => scwStatus(v).st !== 'lunas';
const scwPaidDate = (v) => { if (v.pay && v.pay.date) return v.pay.date; const ds = (v.keys || []).map(k => (PAID[k] || {}).date).filter(Boolean).sort(); return ds[ds.length - 1] || ''; };

/* Rincian hutang per penjualan (purchases() di aplikasi): pembelian dari distributor, nilai dari HPP pada tanggalnya */
const BUYK = { beli: 'Beli · kirim dari distributor', ambil: 'Beli dari Stock Distributor - SCW', auto: 'Terjual dari Stock Distributor - SCW', ds: 'Dropship · dikirim distributor ke pembeli' };
function purchases(D) {
  const out = [], Pm = (id) => D.products.find(p => p.id === id), cust = (i) => i.custName || 'Pembeli umum';
  D.receipts.forEach(r => { const k = KIND[r.kind] ? r.kind : 'titip'; if (k !== 'beli' && k !== 'ambil') return;
    out.push({ key: r.id, date: r.date, at: String(r.createdAt || r.date), ref: r.no, kind: k, lines: (r.lines || []).map(l => { const p = Pm(l.pid); return { pid: l.pid, name: p ? p.name : l.name, sku: p ? p.sku : l.sku, qty: +l.qty || 0, cost: D.costAt(l.pid, r.date) }; }) }); });
  D.invoices.forEach(i => { const d = D.ds[i.id]; if (i.void || !d || !d.length) return;
    out.push({ key: 'ds_' + i.id, date: i.date, at: String(i.createdAt || i.date), ref: i.no, kind: 'ds', inv: i.id, cust: cust(i), lines: d.map(x => ({ pid: x.pid, name: x.it.name, sku: x.it.sku, qty: x.qty, cost: D.itemCost(x.it, i.date) })) }); });
  D.invoices.forEach(i => { const a = D.auto[i.id]; if (i.void || !a || !a.length) return;
    out.push({ key: 'inv_' + i.id, date: i.date, at: String(i.createdAt || i.date), ref: i.no, kind: 'auto', inv: i.id, cust: i.custName, lines: a.map(x => ({ pid: x.pid, name: x.it.name, sku: x.it.sku, qty: x.qty, cost: D.itemCost(x.it, i.date) })) }); });
  out.forEach(x => { x.amount = sum(x.lines, l => l.qty * l.cost); x.units = sum(x.lines, l => l.qty); x.nocost = x.lines.some(l => !l.cost); x.paid = D.paid[x.key] || null; });
  return out.sort((a, b) => (b.date + b.at).localeCompare(a.date + a.at));
}

/* Academy: promo terbesar yang berlaku untuk jasa pada tanggal itu */
function acaPromo(D, sv, date) {
  const list = +sv.price || 0; let best = null;
  D.aca.promos.forEach(p => {
    const live = p.active !== false && (!p.from || p.from <= date) && (!p.to || p.to >= date);
    const forIt = !(p.sids && p.sids.length) || p.sids.includes(sv.id);
    if (!live || !forIt) return;
    const pct = p.type === 'price' ? (list > 0 ? Math.max(0, Math.min(100, (1 - (+p.value || 0) / list) * 100)) : 0) : Math.max(0, Math.min(100, +p.value || 0));
    if (pct > 0 && (!best || pct > best.pct)) best = { p, pct: Math.round(pct * 100) / 100 };
  });
  return best;
}

function prepareAll(docs, today) {
  const D = load(docs);
  PAID = D.paid;
  computeStock(D);
  D.inv = D.invoices.map(i => ({ ...i, t: supTotals(i, D, today) }))
    .sort((a, b) => (b.date + (b.createdAt || '')).localeCompare(a.date + (a.createdAt || '')));
  D.acaInv = D.aca.invoices.map(i => ({ ...i, t: acaTotals(i, today) }))
    .sort((a, b) => (b.date + (b.createdAt || '')).localeCompare(a.date + (a.createdAt || '')));
  D.active = D.products.filter(p => p.active !== false).sort((a, b) => (a.sku || '').localeCompare(b.sku || ''));
  D.low = D.active.filter(p => p.stk < (+p.min || 0)).sort((a, b) => a.stk / (a.min || 1) - b.stk / (b.min || 1));
  D.out = D.active.filter(p => p.stk <= 0);
  D.exp = expRows(D);
  return D;
}

/* ================================================================== */
export async function viewExpc(ctx) {
  const { $, esc, api, setHead } = ctx;
  if (!document.querySelector('link[data-expc-css]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'css/expc.css?v=41'; l.dataset.expcCss = '1'; document.head.appendChild(l);
  }
  setHead('EXPC', `<span class="badge info">Lihat saja</span>`);
  const view = $('#view');
  view.innerHTML = `<div class="empty"><p class="muted">Memuat data EXPC…</p></div>`;
  const [docs, sync] = await Promise.all([api.listDocs('expc'), api.lastSync('expc')]);
  const today = iso(new Date()), curM = today.slice(0, 7);
  const D = prepareAll(docs, today);
  const hasSup = D.products.length || D.invoices.length;
  const hasAca = D.aca.services.length || D.aca.invoices.length || D.aca.customers.length;
  if (!hasSup && !hasAca) {
    view.innerHTML = `<div class="empty"><h2>Belum ada data yang bisa kamu lihat</h2>
      <p class="muted">Data EXPC belum disalin, atau unit kamu tidak punya akses ke EXPC.</p></div>`;
    return;
  }
  const L = cashLedger(D);
  const ownerFin = D.hasCost || L.hasBalance || !!D.fin.banksync;
  const own = (t) => `${t}<span class="ex-own" title="Hanya terlihat oleh Owner">Owner</span>`;
  const firstM = [...D.invoices.map(i => i.date), ...L.rows.map(r => r.date)].filter(Boolean).map(d => d.slice(0, 7)).sort()[0] || curM;
  const monthList = []; { const d = new Date(curM + '-01T00:00:00'); for (let k = 0; k < 36; k++) { const m = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; monthList.push(m); if (m <= firstM) break; d.setMonth(d.getMonth() - 1); } }

  // Menu sama dengan aplikasi (dikelompokkan seperti menu samping di aplikasi). 'own' = hanya Owner.
  const SUP_NAV = [
    ['g-dash', 'Ringkasan', [['ringkasan', 'Dashboard']]],
    ['g-konf', 'Konfirmasi', [['konfirmasi', 'Konfirmasi', 'own']]],
    ['g-jual', 'Jual', [['invoice', 'Invoice & Pembayaran'], ['paket', 'Paket'], ['pelanggan', 'Pelanggan']]],
    ['g-stok', 'Stok', [['stok', 'Produk & Stok'], ['masuk', 'Barang Masuk'], ['keluar', 'Barang Keluar'], ['opname', 'Stock Opname']]],
    ['g-scw', 'Tagihan Distributor', [['distributor', 'Invoice masuk'], ['beli', 'Rincian hutang per penjualan', 'own']]],
    ['g-uang', 'Uang', [['kas', 'Arus Kas'], ['biaya', 'Pengeluaran']]],
    ['g-lap', 'Laporan', [['laporan', 'Laporan', 'own'], ['labarugi', 'Laba Rugi', 'own'], ['keuangan', 'Ringkasan keuangan', 'own']]],
    ['g-lain', 'Lainnya', [['aktivitas', 'Log Aktivitas', 'own'], ['pengaturan', 'Pengaturan', 'own']]],
  ];
  const ACA_NAV = [
    ['g-dash', 'Ringkasan', [['ringkasan', 'Dashboard']]],
    ['g-inv', 'Invoice & Pembayaran', [['invoice', 'Invoice & Pembayaran']]],
    ['g-kas', 'Arus Kas', [['kas', 'Arus Kas']]],
    ['g-jasa', 'Jasa & Promo', [['jasa', 'Daftar Jasa'], ['promo', 'Promo']]],
    ['g-plg', 'Pelanggan', [['pelanggan', 'Pelanggan']]],
    ['g-lap', 'Laporan', [['laporan', 'Laporan', 'own'], ['aktivitas', 'Log Aktivitas', 'own'], ['pengaturan', 'Pengaturan', 'own']]],
  ];
  const navOf = () => (st.biz === 'sup' ? SUP_NAV : ACA_NAV).map(([g, l, ps]) => [g, l, ps.filter(x => !x[2] || ownerFin)]).filter(x => x[2].length);
  let preferBiz = '';
  try { preferBiz = sessionStorage.getItem('portal-expc-biz') || ''; } catch (e) {}
  const st = { biz: preferBiz === 'aca' && hasAca ? 'aca' : preferBiz === 'sup' && hasSup ? 'sup' : (hasSup ? 'sup' : 'aca'), tab: 'ringkasan', q: '', cat: '', stat: '', invf: '', month: curM, shown: 60,
    tsrc: '', tview: 'rinci', tsort: 'new', buyF: 'open', scwF: 'open', expBiz: 'all', expGroup: '', expCat: '', lrShared: true, konfF: '', acc: '' };

  view.innerHTML = `
    <div class="wt-sync">
      <span>Salinan dari aplikasi <b>EXPC</b> di Claude${sync ? ` · diperbarui ${esc(fmtDT(sync.at))}` : ''}.</span>
      <span class="muted">Untuk membuat invoice, mencatat barang, atau mengubah data, tetap pakai aplikasi di Claude selama masa transisi.</span>
    </div>
    <div class="wt-bar">
      <div class="wt-seg" role="group" aria-label="Bisnis">
        ${hasSup ? `<button data-biz="sup" aria-pressed="${st.biz === 'sup'}">Supplies</button>` : ''}
        ${hasAca ? `<button data-biz="aca" aria-pressed="${st.biz === 'aca'}">Academy</button>` : ''}
      </div>
      <nav class="wt-tabs" role="tablist" aria-label="Bagian EXPC" id="exTabs"></nav>
    </div>
    <div id="exSub"></div>
    <div id="wt"></div>`;

  const drawTabs = () => { const nav = navOf(), g = nav.find(x => x[2].some(p => p[0] === st.tab)) || nav[0];
    $('#exTabs').innerHTML = nav.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${k === g[0]}">${l}</button>`).join('');
    $('#exSub').innerHTML = g[2].length > 1 ? `<div class="wt-seg ex-sub" role="group" aria-label="${esc(g[1])}">${g[2].map(([k, l, o]) => `<button data-page="${k}" aria-pressed="${k === st.tab}">${o ? own(l) : l}</button>`).join('')}</div>` : ''; };

  /* ---------- bagian umum ---------- */
  const tile = (l, v, s, t = '') => `<div class="wt-stat ${t}"><small>${l}</small><b>${v}</b><span>${s || ''}</span></div>`;
  const pill = (t) => t.status === 'batal' ? '<span class="badge off">Dibatalkan</span>' : t.status === 'lunas' ? '<span class="badge ok">Lunas</span>'
    : t.overdue ? '<span class="badge bad">Jatuh tempo</span>' : t.status === 'sebagian' ? '<span class="badge warn">Bayar sebagian</span>' : '<span class="badge off">Belum bayar</span>';
  const table = (head, rows, empty, cls = '') => `<div class="tablewrap"><table class="tbl ${cls}"><thead><tr>${head.map(h => Array.isArray(h) ? `<th class="ex-n">${h[0]}</th>` : `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.join('') || `<tr><td colspan="${head.length}" class="muted">${empty}</td></tr>`}</tbody></table></div>`;
  const monthSel = () => `<select class="inp inp--s" id="exMonth" aria-label="Periode">${monthList.map(m => `<option value="${m}" ${m === st.month ? 'selected' : ''}>${mLabel(m)}${m === curM ? ' (bulan ini)' : ''}</option>`).join('')}</select>`;
  const custName = (i) => i.custName || 'Pembeli umum';
  const invList = () => st.biz === 'sup' ? D.inv : D.acaInv;
  const invRow = (i, short) => `<tr data-inv="${esc(i.id)}" tabindex="0"><td><b class="ex-sku">${esc(i.no)}</b><br><small class="muted">${esc(fmtD(i.date))}</small></td>
    <td>${esc(custName(i))}${i.member && MEMBER[i.member] ? `<br><span class="badge info">${MEMBER[i.member]}</span>` : ''}</td>
    ${short ? '' : `<td><small>${esc(fmtD(i.due))}</small></td>`}
    <td class="ex-n">${rp(i.t.total)}</td>${short ? '' : `<td class="ex-n">${i.t.remaining ? rp(i.t.remaining) : '<span class="muted">—</span>'}</td>`}
    ${!short && D.hasCost && st.biz === 'sup' ? `<td class="ex-n">${i.void || i.t.profit === null ? '—' : rpS(i.t.profit)}</td>` : ''}
    <td>${pill(i.t)}</td></tr>`;

  /* ---------- Supplies: Ringkasan ---------- */
  function supSummary() {
    const live = D.inv.filter(i => !i.void);
    const month = live.filter(i => (i.date || '').startsWith(curM)), todays = live.filter(i => i.date === today);
    const unpaid = live.filter(i => i.t.status !== 'lunas'), overdue = unpaid.filter(i => i.t.overdue);
    const consPs = D.active.filter(p => p.cons > 0);
    const scw = D.scwinv.filter(scwOpen);
    const outToday = D.cash.filter(c => !c.void && c.type === 'out' && c.date === today);
    const mIn = L.rows.filter(r => r.dir === 'in' && (r.date || '').startsWith(curM)), mOut = L.rows.filter(r => r.dir === 'out' && (r.date || '').startsWith(curM));
    const tiles = D.hasCost ? (() => {
      // Sama dengan Dashboard Owner di aplikasi
      const omzet = sum(month, i => i.t.total), prevM = monthList[1] || '', prevOmzet = sum(live.filter(i => (i.date || '').startsWith(prevM) && prevM), i => i.t.total);
      const delta = prevOmzet ? Math.round((omzet - prevOmzet) / prevOmzet * 100) : null;
      const R = lrCompute(D, curM + '-01', lastDay(curM));
      const consVal = sum(consPs, p => p.cons * D.costAt(p.id, today)), stokVal = sum(D.active, p => Math.max(0, p.own) * D.costAt(p.id, today));
      return [
        tile(own('Omzet ' + mLabel(curM)), rp(omzet), month.length + ' invoice' + (delta === null ? '' : ` · ${delta >= 0 ? '+' : ''}${delta}% vs ${MONTHS[+prevM.slice(5, 7) - 1]}`), 'info'),
        tile(own('Laba kotor ' + mLabel(curM)), rpS(R.labaKotor), (R.sales + R.ship) ? 'Margin ' + Math.round(R.labaKotor / (R.sales + R.ship) * 100) + '%' + (R.est ? ' · ada HPP nol' : '') : '—', 'ok'),
        tile(own('Laba bersih ' + mLabel(curM)), rpS(R.laba), 'setelah beban ' + rp(R.totBeban), R.laba >= 0 ? 'ok' : 'bad'),
        tile('Kas masuk ' + mLabel(curM), rp(sum(mIn, r => r.amount)), mIn.length + ' transaksi', 'ok'),
        tile('Kas keluar ' + mLabel(curM), rp(sum(mOut, r => r.amount)), mOut.length + ' transaksi', mOut.length ? 'bad' : ''),
        ...(L.hasBalance ? [tile(own('Saldo kas & rekening'), rpS(L.balanceOf('')), L.accs.filter(a => a.active !== false).length + ' rekening, saat ini')] : []),
        tile('Piutang saat ini', rp(sum(unpaid, i => i.t.remaining)), overdue.length + ' lewat jatuh tempo', overdue.length ? 'warn' : ''),
        tile(own('Nilai persediaan'), rp(stokVal), 'Stock EXPC, dari HPP'),
        tile('Stock Distributor - SCW di gudang', nf(sum(consPs, p => p.cons)) + ' unit', consPs.length + ' SKU · senilai ' + rp(consVal)),
        tile('Belum dibayar ke distributor', rp(sum(scw, v => +v.total || 0)), scw.length + ' invoice belum lunas', scw.length ? 'warn' : ''),
        tile('Stok menipis / habis', D.low.length + ' SKU', D.out.length + ' SKU habis', D.low.length ? 'bad' : ''),
      ];
    })() : [
      tile('Invoice hari ini', todays.length, rp(sum(todays, i => i.t.total))),
      tile('Penjualan ' + mLabel(curM), rp(sum(month, i => i.t.total)), month.length + ' invoice', 'info'),
      tile('Kas keluar hari ini', outToday.length, rp(sum(outToday, c => c.amount))),
      tile('Belum lunas', unpaid.length, rp(sum(unpaid, i => i.t.remaining)) + ' sisa tagihan', unpaid.length ? 'warn' : ''),
      tile('Lewat jatuh tempo', overdue.length, rp(sum(overdue, i => i.t.remaining)), overdue.length ? 'bad' : 'ok'),
      tile('Stok menipis', D.low.length + ' SKU', D.out.length + ' SKU habis', D.low.length || D.out.length ? 'bad' : 'ok'),
      tile('Total SKU', D.active.length, nf(sum(D.active, p => p.stk)) + ' unit di gudang'),
      tile('Stock Distributor - SCW', nf(sum(D.active, p => Math.max(0, p.cons))) + ' unit', consPs.length + ' SKU belum dibeli'),
      tile('Belum dibayar ke distributor', rp(sum(scw, v => +v.total || 0)), scw.length + ' invoice distributor belum lunas', scw.length ? 'warn' : ''),
    ];
    const lowRows = [...D.low, ...D.out.filter(p => !D.low.includes(p))].slice(0, 12).map(p => `<tr data-prod="${esc(p.id)}" tabindex="0"><td><b>${esc(p.name)}</b><br><span class="ex-sku">${esc(p.sku)}</span></td>
      <td class="ex-n"><b>${nf(p.stk)}</b> <span class="muted">/ min ${nf(p.min || 0)}</span></td><td><span class="badge ${p.state[0]}">${p.state[1]}</span></td></tr>`);
    const dueRows = overdue.sort((a, b) => a.due.localeCompare(b.due)).map(i => `<tr data-inv="${esc(i.id)}" tabindex="0"><td><b>${esc(custName(i))}</b><br><span class="ex-sku">${esc(i.no)}</span></td>
      <td><small>${esc(fmtD(i.due))}</small><br><span class="badge bad">${diffDays(today, i.due)} hari lewat</span></td><td class="ex-n"><b>${rp(i.t.remaining)}</b></td></tr>`);
    const openRows = unpaid.filter(i => !i.t.overdue).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 10).map(i => `<tr data-inv="${esc(i.id)}" tabindex="0"><td><b>${esc(custName(i))}</b><br><span class="ex-sku">${esc(i.no)}</span></td>
      <td><small>jatuh tempo ${esc(fmtD(i.due))}</small></td><td class="ex-n">${rp(i.t.remaining)}</td></tr>`);
    $('#wt').innerHTML = `<div class="wt-stats">${tiles.join('')}</div>
      <div class="ex-grid2">
        <section><h2 class="wt-h">Stok di bawah minimum / habis</h2>${table(['Produk', ['Stok'], 'Status'], lowRows, 'Semua stok di atas batas minimum.', 'wt-tbl')}</section>
        <section><h2 class="wt-h">Tagihan lewat jatuh tempo (${overdue.length})</h2>${table(['Pelanggan', 'Jatuh tempo', ['Sisa']], dueRows, 'Tidak ada tagihan yang lewat jatuh tempo.', 'wt-tbl')}
          ${openRows.length ? `<h2 class="wt-h">Belum lunas, belum jatuh tempo</h2>${table(['Pelanggan', 'Tanggal', ['Sisa']], openRows, '', 'wt-tbl')}` : ''}</section>
      </div>
      <h2 class="wt-h">Invoice terbaru</h2>${table(['No. invoice', 'Pelanggan', ['Total'], 'Status'], D.inv.slice(0, 8).map(i => invRow(i, true)), 'Belum ada invoice.', 'wt-tbl')}`;
  }

  /* ---------- Supplies: Produk & Stok ---------- */
  function supStock() {
    const q = st.q.toLowerCase();
    const cats = [...new Set(D.products.map(p => p.cat).filter(Boolean))].sort();
    const base = st.stat === 'Diarsipkan' ? D.products.filter(p => p.active === false) : D.active;
    const rows = base.filter(p => (!q || ((p.name || '') + ' ' + (p.sku || '')).toLowerCase().includes(q)) && (!st.cat || p.cat === st.cat)
      && (!st.stat || st.stat === 'Diarsipkan' || p.state[1] === st.stat));
    const hc = D.hasCost;
    $('#wt').innerHTML = `<div class="toolbar">
        <input class="inp" id="exQ" placeholder="Cari nama atau SKU" value="${esc(st.q)}" aria-label="Cari produk">
        <select class="inp inp--s" id="exCat" aria-label="Kategori"><option value="">Semua kategori</option>${cats.map(c => `<option ${c === st.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <select class="inp inp--s" id="exStat" aria-label="Status"><option value="">Semua status</option>${['Aman', 'Menipis', 'Habis', 'Diarsipkan'].map(c => `<option ${c === st.stat ? 'selected' : ''}>${c}</option>`).join('')}</select>
      </div>
      <p class="note">Semua Stock = Stock EXPC (sudah dibeli) + Stock Distributor - SCW (masih milik distributor). Klik baris untuk kartu stok.</p>
      ${table(['SKU / Produk', 'Lokasi', ['Semua stock'], ['Stock EXPC'], ['Stock SCW'], ['Min'], ['Harga jual'], ...(hc ? [[own('HPP')], [own('Nilai Stock EXPC')]] : []), 'Status'],
        rows.slice(0, st.shown).map(p => `<tr data-prod="${esc(p.id)}" tabindex="0"><td><b>${esc(p.name)}</b><br><span class="ex-sku">${esc(p.sku)}</span> <small class="muted">· ${esc(p.cat || '')}</small></td>
          <td>${esc(p.loc || '—')}</td><td class="ex-n"><b>${nf(p.stk)}</b> <small class="muted">${esc(p.unit || '')}</small></td><td class="ex-n">${p.own ? nf(p.own) : '<span class="muted">—</span>'}</td>
          <td class="ex-n">${p.cons ? nf(p.cons) : '<span class="muted">—</span>'}</td><td class="ex-n muted">${nf(p.min || 0)}</td><td class="ex-n">${rp(p.price)}</td>
          ${hc ? `<td class="ex-n">${D.costAt(p.id, today) ? rp(D.costAt(p.id, today)) : '<span class="muted">belum diisi</span>'}</td><td class="ex-n">${rp(Math.max(0, p.own) * D.costAt(p.id, today))}</td>` : ''}
          <td><span class="badge ${p.state[0]}">${p.state[1]}</span></td></tr>`), 'Tidak ada produk yang cocok.', 'wt-tbl')}
      ${rows.length > st.shown ? `<button class="ex-more" data-more>Tampilkan ${Math.min(60, rows.length - st.shown)} lagi (dari ${rows.length})</button>` : ''}
      <p class="muted tiny">${rows.length} SKU · ${nf(sum(rows, p => p.stk))} unit: ${nf(sum(rows, p => Math.max(0, p.own)))} Stock EXPC, ${nf(sum(rows, p => Math.max(0, p.cons)))} Stock Distributor - SCW.</p>`;
    bindSearch(supStock);
  }

  /* ---------- Invoice (Supplies & Academy) ---------- */
  function invoices() {
    const q = st.q.toLowerCase(), all = invList(), live = all.filter(i => !i.void);
    const open = live.filter(i => i.t.status !== 'lunas'), od = open.filter(i => i.t.overdue);
    const rows = all.filter(i => (!q || ((i.no || '') + ' ' + (i.custName || '')).toLowerCase().includes(q))
      && (st.invf === 'open' ? (i.t.status !== 'lunas' && i.t.status !== 'batal') : st.invf === 'overdue' ? i.t.overdue : st.invf === 'lunas' ? i.t.status === 'lunas' : st.invf === 'batal' ? i.void : true));
    const profitCol = D.hasCost && st.biz === 'sup';
    $('#wt').innerHTML = `<div class="wt-stats">
        ${tile('Invoice terbit', live.length, 'semua waktu')}
        ${tile('Belum lunas', open.length, rp(sum(open, i => i.t.remaining)) + ' sisa tagihan', open.length ? 'warn' : '')}
        ${tile('Lewat jatuh tempo', od.length, rp(sum(od, i => i.t.remaining)), od.length ? 'bad' : 'ok')}
        ${tile('Dibatalkan', all.length - live.length, 'tidak dihitung')}
      </div>
      <div class="toolbar"><input class="inp" id="exQ" placeholder="Cari no. invoice atau pelanggan" value="${esc(st.q)}" aria-label="Cari invoice">
        <div class="wt-seg" role="group" aria-label="Status">${[['', 'Semua'], ['open', 'Belum lunas'], ['overdue', 'Jatuh tempo'], ['lunas', 'Lunas'], ['batal', 'Dibatalkan']].map(([v, l]) => `<button data-invf="${v}" aria-pressed="${st.invf === v}">${l}</button>`).join('')}</div></div>
      ${table(['No. invoice', 'Pelanggan', 'Jatuh tempo', ['Total'], ['Sisa'], ...(profitCol ? [[own('Laba kotor')]] : []), 'Status'], rows.slice(0, st.shown).map(i => invRow(i)), all.length ? 'Tidak ada invoice yang cocok.' : 'Belum ada invoice.', 'wt-tbl')}
      ${rows.length > st.shown ? `<button class="ex-more" data-more>Tampilkan ${Math.min(60, rows.length - st.shown)} lagi (dari ${rows.length})</button>` : ''}`;
    bindSearch(invoices);
  }

  /* ---------- Pelanggan ---------- */
  function customers() {
    const q = st.q.toLowerCase();
    const list = st.biz === 'sup' ? D.customers : D.aca.customers, inv = invList().filter(i => !i.void);
    const stats = new Map(); inv.forEach(i => { const s = stats.get(i.custId) || { n: 0, total: 0, rem: 0, last: '' }; s.n++; s.total += i.t.total; s.rem += i.t.remaining; if ((i.date || '') > s.last) s.last = i.date; stats.set(i.custId, s); });
    const rows = list.filter(c => !q || [c.name, c.phone, c.type, c.addr].join(' ').toLowerCase().includes(q))
      .map(c => ({ c, s: stats.get(c.id) || { n: 0, total: 0, rem: 0, last: '' } }))
      .sort((a, b) => b.s.total - a.s.total || (a.c.name || '').localeCompare(b.c.name || ''));
    const grp = (c) => st.biz === 'sup' ? (MEMBER[c.member] ? `<span class="badge info">${MEMBER[c.member]}</span>` : '') : (c.group ? `<span class="badge info">${esc(c.group)}</span>` : '');
    $('#wt').innerHTML = `<div class="toolbar"><input class="inp" id="exQ" placeholder="Cari nama, WA, tipe, alamat" value="${esc(st.q)}" aria-label="Cari pelanggan"><span class="muted tiny">${list.length} pelanggan</span></div>
      ${table(['Pelanggan', 'Tipe', ['Invoice'], ['Total belanja'], ['Belum dibayar'], 'Terakhir'], rows.slice(0, st.shown).map(({ c, s }) => `<tr><td><b>${esc(c.name || '—')}</b> ${grp(c)}<br><small class="muted">${esc(c.phone || '')}${c.term ? ' · termin ' + c.term + ' hari' : ''}</small></td>
        <td>${esc(c.type || '—')}</td><td class="ex-n">${s.n || '<span class="muted">—</span>'}</td><td class="ex-n">${s.total ? rp(s.total) : '<span class="muted">—</span>'}</td>
        <td class="ex-n">${s.rem ? `<b>${rp(s.rem)}</b>` : '<span class="muted">—</span>'}</td><td><small>${s.last ? esc(fmtD(s.last)) : '—'}</small></td></tr>`), 'Tidak ada pelanggan yang cocok.')}
      ${rows.length > st.shown ? `<button class="ex-more" data-more>Tampilkan ${Math.min(60, rows.length - st.shown)} lagi (dari ${rows.length})</button>` : ''}`;
    bindSearch(customers);
  }

  /* ---------- Barang Masuk ---------- */
  function receipts() {
    const R = D.receipts.slice().sort((a, b) => (b.date + (b.createdAt || '')).localeCompare(a.date + (a.createdAt || '')));
    const mR = R.filter(r => (r.date || '').startsWith(st.month));
    $('#wt').innerHTML = `<div class="toolbar">${monthSel()}</div>
      <div class="wt-stats">${tile('Penerimaan ' + mLabel(st.month), mR.length, nf(sum(mR, r => sum(r.lines || [], l => l.qty))) + ' unit masuk', 'info')}
        ${tile('Semua penerimaan', R.length, 'semua waktu')}</div>
      ${table(['No. / Tanggal', 'Jenis', 'Pemasok', 'Barang', ['Unit']], mR.map(r => `<tr><td><b class="ex-sku">${esc(r.no)}</b><br><small class="muted">${esc(fmtD(r.date))}</small></td>
        <td><small>${esc(KIND[r.kind] || KIND.titip)}</small></td><td>${esc(r.supplier || '—')}${r.sj ? `<br><small class="muted">SJ ${esc(r.sj)}</small>` : ''}</td>
        <td><small>${(r.lines || []).slice(0, 4).map(l => esc(l.name) + ' ×' + nf(l.qty)).join('<br>')}${(r.lines || []).length > 4 ? `<br><span class="muted">+${r.lines.length - 4} barang lain</span>` : ''}</small></td>
        <td class="ex-n">${nf(sum(r.lines || [], l => l.qty))}</td></tr>`), 'Tidak ada barang masuk di periode ini.')}`;
  }

  /* ---------- Tagihan Distributor: Invoice masuk (pScw di aplikasi) ---------- */
  function distributor() {
    const V = D.scwinv.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.at || '').localeCompare(String(a.at || '')));
    const open = V.filter(scwOpen), done = V.filter(v => !scwOpen(v)), f = st.scwF || 'open';
    const list = f === 'open' ? open.slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))) : f === 'paid' ? done : V;
    $('#wt').innerHTML = `<div class="wt-stats">${tile('Belum lunas', open.length + ' invoice', rp(sum(open, v => +v.total || 0)), open.length ? 'warn' : 'ok')}
        ${tile('Sudah lunas', done.length + ' invoice', rp(sum(done, v => +v.total || 0)))}</div>
      <div class="toolbar"><div class="wt-seg" role="group" aria-label="Status">${[['open', 'Belum lunas (' + open.length + ')'], ['paid', 'Lunas (' + done.length + ')'], ['all', 'Semua']].map(([v, l]) => `<button data-set="scwF:${v}" aria-pressed="${f === v}">${l}</button>`).join('')}</div></div>
      <p class="note">Invoice yang masuk dari distributor (SCW, dll.). Lunas bila sudah ditandai lunas, atau semua baris pembelian yang ditagih sudah ditandai lunas. File invoice tetap dibuka di aplikasi Claude.</p>
      ${table(['No. invoice', 'Tanggal', 'Distributor', 'Barang', ['Total'], 'Status'], list.map(v => { const s2 = scwStatus(v), nfl = (v.files || []).length;
        return `<tr data-scw="${esc(v.id)}" tabindex="0"><td><b class="ex-sku">${esc(v.no || '—')}</b>${v.period ? `<br><small class="muted">periode ${esc(mLabel(v.period))}</small>` : ''}${nfl ? `<br><small class="muted">${nfl} file</small>` : ''}</td>
        <td><small>${esc(fmtD(v.date))}</small></td><td>${esc(v.supplier || 'SCW')}</td>
        <td><small>${(v.items || []).filter(it => !it.fee).slice(0, 3).map(it => esc(it.name) + ' ×' + nf(it.qty)).join('<br>')}${(v.items || []).filter(it => !it.fee).length > 3 ? `<br><span class="muted">+${(v.items || []).filter(it => !it.fee).length - 3} lainnya</span>` : ''}</small></td>
        <td class="ex-n"><b>${rp(v.total)}</b></td><td>${s2.st === 'lunas' ? `<span class="badge ok">Lunas</span><br><small class="muted">${esc(fmtD(scwPaidDate(v)))}</small>` : '<span class="badge warn">Belum lunas</span>'}${s2.n ? `<br><small class="muted">${s2.paid}/${s2.n} baris lunas</small>` : ''}</td></tr>`; }),
        f === 'open' ? (V.length ? 'Semua invoice sudah lunas.' : 'Belum ada invoice distributor.') : 'Tidak ada invoice di sini.')}`;
  }

  /* ---------- Arus Kas (kas gabungan Supplies + Academy, pArus di aplikasi) ---------- */
  function cash() {
    const P = { from: st.month + '-01', to: lastDay(st.month) }, a = st.acc && L.accs.some(x => x.id === st.acc) ? st.acc : '';
    let bal = L.openingOf(a), startBal = null; const rr = [];
    L.rows.forEach(r => { if (!L.touches(r, a)) return; const e = L.eff(r, a), d = String(r.date || '').slice(0, 10);
      if (d >= P.from && d <= P.to) { if (startBal === null) startBal = bal; rr.push({ r, e, bal: bal + e }); } else if (d > P.to && startBal === null) startBal = bal; bal += e; });
    if (startBal === null) startBal = bal;
    const f = L.flow(P, a), rows = rr.slice().reverse();
    const byCat = {}; rr.filter(x => x.e < 0).forEach(({ r, e }) => { byCat[r.cat] = (byCat[r.cat] || 0) - e; });
    const cats = Object.entries(byCat).sort((x, y) => y[1] - x[1]);
    const saldo = L.hasBalance ? `<h2 class="wt-h">${own('Saldo saat ini')}</h2><div class="wt-stats">${L.accs.filter(x => x.active !== false || L.balanceOf(x.id) !== 0).map(x => tile(esc(x.name), rpS(L.balanceOf(x.id)), x.kind === 'tunai' ? 'Kas tunai' : 'Rekening bank', L.balanceOf(x.id) < 0 ? 'bad' : '')).join('')}
      ${tile('Total', rpS(L.balanceOf('')), L.accs.length + ' rekening', 'info')}</div>` : '';
    $('#wt').innerHTML = `<div class="toolbar">${monthSel()}<select class="inp inp--s" data-st="acc" aria-label="Rekening"><option value="">Semua rekening</option>${L.accs.map(x => `<option value="${esc(x.id)}" ${a === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
        <span class="muted tiny">Kas gabungan Supplies + Academy.</span></div>
      ${saldo}
      <div class="wt-stats">${tile('Kas masuk ' + mLabel(st.month), rp(f.in), f.nIn + ' transaksi', 'ok')}
        ${tile('Kas keluar ' + mLabel(st.month), rp(f.out), f.nOut + ' transaksi', f.out ? 'bad' : '')}
        ${tile('Selisih ' + mLabel(st.month), rpS(f.in - f.out), f.in - f.out >= 0 ? 'masuk lebih besar' : 'keluar lebih besar')}
        ${L.hasBalance ? tile(own('Saldo awal → akhir'), rpS(startBal + f.in - f.out), 'awal periode ' + rpS(startBal)) : ''}</div>
      ${cats.length ? `<h2 class="wt-h">Kas keluar per kategori</h2>${table(['Kategori', ['Jumlah'], ['Porsi']], cats.map(([c, v]) => `<tr><td>${esc(c)}</td><td class="ex-n">${rp(v)}</td><td class="ex-n">${f.out ? Math.round(v / f.out * 100) : 0}%</td></tr>`), '')}` : ''}
      <h2 class="wt-h">Mutasi ${mLabel(st.month)}</h2>
      ${table(['Tanggal', 'Keterangan', 'Kategori', 'Rekening', ['Masuk'], ['Keluar'], ...(L.hasBalance ? [[own('Saldo')]] : [])], rows.slice(0, st.shown).map(({ r, e, bal: b }) => `<tr><td><small>${esc(fmtD(r.date))}</small></td>
        <td>${esc(r.desc || '—')}${r.ref || r.biz ? `<br><small class="muted">${esc(r.ref || '')}${r.biz ? ` <span class="chip">${r.biz}</span>` : ''}</small>` : ''}</td>
        <td><span class="badge off">${esc(r.cat)}</span></td><td><small>${r.dir === 'move' ? esc(L.accName(r.acc)) + ' → ' + esc(L.accName(r.toAcc)) : esc(L.accName(r.acc))}</small></td>
        <td class="ex-n ex-in">${e > 0 ? rp(e) : ''}</td><td class="ex-n ex-out">${e < 0 ? rp(-e) : ''}</td>${L.hasBalance ? `<td class="ex-n">${rpS(b)}</td>` : ''}</tr>`), 'Tidak ada mutasi di periode ini.')}
      ${rows.length > st.shown ? `<button class="ex-more" data-more>Tampilkan ${Math.min(60, rows.length - st.shown)} lagi (dari ${rows.length})</button>` : ''}`;
  }

  /* ---------- Keuangan (Owner) ---------- */
  function finance() {
    const live = D.inv.filter(i => !i.void);
    const months = []; { const d = new Date(curM + '-01T00:00:00'); for (let k = 0; k < 6; k++) { months.unshift(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); d.setMonth(d.getMonth() - 1); } }
    const per = months.map(m => { const xs = live.filter(i => (i.date || '').startsWith(m)), R = D.hasCost ? lrCompute(D, m + '-01', lastDay(m)) : null;
      return { m, n: xs.length, omzet: sum(xs, i => i.t.total), R, laba: R ? R.labaKotor : null, paid: sum(L.rows.filter(r => r.dir === 'in' && (r.date || '').startsWith(m)), r => r.amount), out: sum(L.rows.filter(r => r.dir === 'out' && (r.date || '').startsWith(m)), r => r.amount) }; });
    const cur = per[per.length - 1];
    const curR = cur.R, bebanL = curR ? Object.entries(curR.beban).sort((a, b) => b[1] - a[1]) : [];
    const stokVal = D.hasCost ? sum(D.active, p => Math.max(0, p.own) * D.costAt(p.id, today)) : null;
    const consVal = D.hasCost ? sum(D.active.filter(p => p.cons > 0), p => p.cons * D.costAt(p.id, today)) : null;
    const noCost = D.hasCost ? D.active.filter(p => !D.costAt(p.id, today)).length : 0;
    const bs = D.fin.banksync;
    $('#wt').innerHTML = `<p class="note">Bagian ini hanya terlihat oleh Owner, sama seperti di aplikasi. Laba kotor = penjualan bersih (termasuk ongkir yang ditagih) − HPP barang pada tanggal invoice. Laba bersih = laba kotor − beban operasional Supplies dan beban bersama (menurut bulan bebannya) + pendapatan lain.</p>
      <div class="wt-stats">
        ${tile('Omzet ' + mLabel(curM), rp(cur.omzet), cur.n + ' invoice', 'info')}
        ${curR ? tile('Laba kotor ' + mLabel(curM), rpS(curR.labaKotor), (curR.sales + curR.ship) ? 'margin ' + Math.round(curR.labaKotor / (curR.sales + curR.ship) * 100) + '%' + (curR.est ? ' · ada HPP nol' : '') : '—', curR.labaKotor >= 0 ? 'ok' : 'bad') : ''}
        ${curR ? tile('Laba bersih ' + mLabel(curM), rpS(curR.laba), 'setelah beban ' + rp(curR.totBeban), curR.laba >= 0 ? 'ok' : 'bad') : ''}
        ${L.hasBalance ? tile('Saldo kas & rekening', rpS(L.balanceOf('')), L.accs.length + ' rekening, saat ini') : ''}
        ${stokVal !== null ? tile('Nilai persediaan', rp(stokVal), 'Stock EXPC, dari HPP' + (noCost ? ` · ${noCost} SKU HPP belum diisi` : '')) : ''}
        ${consVal !== null ? tile('Stock Distributor - SCW di gudang', rp(consVal), 'nilai dari HPP, belum jadi utang') : ''}
        ${bs ? tile('Mutasi bank terakhir', bs.lastBalance != null ? rp(bs.lastBalance) : '—', 'saldo menurut sheet · ' + esc(fmtD(bs.lastDate)), 'info') : ''}
      </div>
      ${bebanL.length ? `<h2 class="wt-h">Beban operasional ${mLabel(curM)}</h2>${table(['Kategori', ['Jumlah']], [...bebanL.map(([c, v]) => `<tr><td>${esc(c)}</td><td class="ex-n">${rp(v)}</td></tr>`), `<tr><td><b>Total</b></td><td class="ex-n"><b>${rp(curR.totBeban)}</b></td></tr>`], '')}` : ''}
      <h2 class="wt-h">6 bulan terakhir</h2>
      ${table(['Bulan', ['Invoice'], ['Omzet'], ...(D.hasCost ? [['Laba kotor'], ['Margin'], ['Beban'], ['Laba bersih']] : []), ['Kas masuk'], ['Kas keluar']], per.slice().reverse().map(x => `<tr><td>${mLabel(x.m)}${x.m === curM ? ' <span class="muted">(berjalan)</span>' : ''}</td>
        <td class="ex-n">${x.n}</td><td class="ex-n">${rp(x.omzet)}</td>${x.R ? `<td class="ex-n">${rpS(x.R.labaKotor)}</td><td class="ex-n">${(x.R.sales + x.R.ship) ? Math.round(x.R.labaKotor / (x.R.sales + x.R.ship) * 100) + '%' : '—'}</td><td class="ex-n">${rp(x.R.totBeban)}</td><td class="ex-n">${rpS(x.R.laba)}</td>` : ''}
        <td class="ex-n ex-in">${rp(x.paid)}</td><td class="ex-n ex-out">${rp(x.out)}</td></tr>`), '')}
      <p class="muted tiny">Kas masuk/keluar adalah kas gabungan Supplies + Academy (rekening dan kas tunai).</p>`;
  }

  /* ---------- Academy ---------- */
  const upcoming = (sv) => (sv.schedules || []).filter(b => b && b.from && (b.to || b.from) >= today).sort((a, b) => a.from.localeCompare(b.from));
  const svName = (id) => D.aca.services.find(s => s.id === id)?.name || '—';
  function acaSummary() {
    const live = D.acaInv.filter(i => !i.void), open = live.filter(i => i.t.status !== 'lunas'), od = open.filter(i => i.t.overdue);
    const month = live.filter(i => (i.date || '').startsWith(curM));
    const sessions = D.aca.services.filter(s => s.active !== false).flatMap(s => upcoming(s).map(b => ({ s, b }))).sort((a, b) => a.b.from.localeCompare(b.b.from));
    const promos = D.aca.promos.filter(p => p.active !== false && (!p.to || p.to >= today) && (!p.from || p.from <= today));
    // Peserta terdaftar per jadwal (bila invoice menyimpan jadwal kelas)
    const seats = (s, b) => sum(live, i => sum((i.items || []).filter(it => it.sid === s.id && it.batch?.from === b.from), it => it.qty));
    $('#wt').innerHTML = `<div class="wt-stats">
        ${tile('Penjualan ' + mLabel(curM), rp(sum(month, i => i.t.total)), month.length + ' invoice', 'info')}
        ${tile('Belum lunas', open.length, rp(sum(open, i => i.t.remaining)) + ' sisa tagihan', open.length ? 'warn' : '')}
        ${tile('Lewat jatuh tempo', od.length, rp(sum(od, i => i.t.remaining)), od.length ? 'bad' : 'ok')}
        ${tile('Jadwal kelas mendatang', sessions.length, sessions[0] ? 'berikutnya ' + fmtD(sessions[0].b.from) : 'belum ada jadwal')}
        ${tile('Promo berjalan', promos.length, promos.length ? 'lihat menu Promo' : 'tidak ada promo')}
        ${tile('Jasa / kelas aktif', D.aca.services.filter(s => s.active !== false).length, D.aca.customers.length + ' pelanggan')}
      </div>
      <h2 class="wt-h">Jadwal kelas mendatang</h2>
      ${table(['Tanggal', 'Kelas', ['Kapasitas'], ['Harga']], sessions.map(({ s, b }) => { const n = seats(s, b), pr = acaPromo(D, s, b.from);
        return `<tr><td><b>${esc(fmtD(b.from))}</b>${b.to && b.to !== b.from ? `<br><small class="muted">s/d ${esc(fmtD(b.to))}</small>` : ''}<br><small class="muted">${diffDays(b.from, today) <= 0 ? 'sedang berjalan' : diffDays(b.from, today) + ' hari lagi'}</small></td>
        <td><b>${esc(s.name)}</b><br><span class="ex-sku">${esc(s.code || '')}</span></td><td class="ex-n">${s.cap ? (n ? n + ' / ' : '') + s.cap + ' ' + esc(s.unit || '') : '—'}</td>
        <td class="ex-n">${pr ? `${rp(s.price * (1 - pr.pct / 100))}<br><small class="muted"><s>${rp(s.price)}</s></small>` : rp(s.price)}</td></tr>`; }), 'Belum ada jadwal kelas mendatang.')}
      ${open.length ? `<h2 class="wt-h">Tagihan belum lunas</h2>${table(['No. invoice', 'Pelanggan', ['Total'], 'Status'], open.map(i => invRow(i, true)), '', 'wt-tbl')}` : ''}
      ${!D.aca.invoices.length ? '<p class="note">Belum ada invoice Academy yang tersalin.</p>' : ''}`;
  }
  function acaServices() {
    const S = D.aca.services.slice().sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')));
    $('#wt').innerHTML = `${table(['Kode / Jasa', 'Kategori', ['Harga normal'], ['Harga hari ini'], 'Jadwal mendatang'], S.map(s => { const pr = acaPromo(D, s, today), up = upcoming(s);
        return `<tr><td><b>${esc(s.name)}</b><br><span class="ex-sku">${esc(s.code || '')}</span>${s.active === false ? ' <span class="badge off">Nonaktif</span>' : ''}${s.desc ? `<br><small class="muted">${esc(s.desc)}</small>` : ''}</td>
          <td><small>${esc(s.cat || '—')}</small>${s.cap ? `<br><small class="muted">maks ${s.cap} ${esc(s.unit || '')}/sesi</small>` : ''}</td><td class="ex-n">${rp(s.price)}</td>
          <td class="ex-n">${pr ? `<b>${rp(s.price * (1 - pr.pct / 100))}</b><br><span class="badge ok">${esc(pr.p.name)}</span>` : '<span class="muted">sama</span>'}</td>
          <td><small>${up.map(b => esc(fmtD(b.from)) + (b.to && b.to !== b.from ? ' – ' + esc(fmtD(b.to)) : '')).join('<br>') || '<span class="muted">—</span>'}</small></td></tr>`; }), 'Belum ada jasa.')}`;
  }

  /* ================= Menu tambahan (salinan halaman aplikasi, lihat saja) ================= */
  const bar = (v, max, cls = '') => `<span class="ex-bar ${cls}"><i style="width:${max > 0 ? Math.max(0, Math.min(100, v / max * 100)) : 0}%"></i></span>`;
  const rpShort = (n) => { n = Math.round(n || 0); if (Math.abs(n) >= 1e9) return 'Rp' + (n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M'; if (Math.abs(n) >= 1e6) return 'Rp' + (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt'; return rp(n); };
  const rpShortS = (n) => (n < 0 ? '−' : '') + rpShort(Math.abs(n));
  const fmtPct = (d) => (Math.round((+d || 0) * 100) / 100).toLocaleString('id-ID');
  const seg = (key, opts) => `<div class="wt-seg" role="group">${opts.map(([v, l]) => `<button data-set="${key}:${v}" aria-pressed="${(st[key] || '') === v}">${l}</button>`).join('')}</div>`;
  const more = (n) => n > st.shown ? `<button class="ex-more" data-more>Tampilkan ${Math.min(60, n - st.shown)} lagi (dari ${n})</button>` : '';
  const inMonth = (d) => String(d || '').slice(0, 7) === st.month;
  const Pm = (id) => D.products.find(p => p.id === id);
  const costNow = (pid) => D.costAt(pid, today);
  const accName = (id) => L.accName(id);
  const custLbl = (i) => (i && i.custName) || 'Pembeli umum';

  /* ---------- Barang Keluar (pTerjual) ---------- */
  const SRC = { own: ['Stock EXPC', 'ok'], cons: ['Stock Distributor - SCW', 'info'], ds: ['Dropship', 'off'] };
  const SORTS = { rinci: [['new', 'Tanggal terbaru'], ['old', 'Tanggal terlama'], ['name', 'Nama produk A–Z'], ['qty', 'Qty terbanyak'], ['total', 'Nilai terbesar'], ['cust', 'Pelanggan A–Z']],
    produk: [['qty', 'Qty terbanyak'], ['total', 'Nilai terbesar'], ['name', 'Nama produk A–Z'], ['sku', 'SKU A–Z'], ['new', 'Terakhir terjual']] };
  function sortSold(xs, k, view) {
    const by = { new: (a, b) => view === 'produk' ? b.last.localeCompare(a.last) : (b.date + b.at).localeCompare(a.date + a.at) || a.name.localeCompare(b.name),
      old: (a, b) => (a.date + a.at).localeCompare(b.date + b.at) || a.name.localeCompare(b.name),
      name: (a, b) => a.name.localeCompare(b.name) || (b.date || '').localeCompare(a.date || ''), sku: (a, b) => a.sku.localeCompare(b.sku),
      qty: (a, b) => b.qty - a.qty || a.name.localeCompare(b.name), total: (a, b) => b.total - a.total || a.name.localeCompare(b.name),
      cust: (a, b) => a.cust.localeCompare(b.cust) || (b.date + b.at).localeCompare(a.date + a.at) }[k] || (() => 0);
    return xs.slice().sort(by);
  }
  function supSold() {
    const q = st.q.toLowerCase().trim(), hc = D.hasCost, view = st.tview === 'produk' ? 'produk' : 'rinci';
    if (!SORTS[view].some(x => x[0] === st.tsort)) st.tsort = SORTS[view][0][0];
    const all = D.sold.filter(x => inMonth(x.i.date)).map(x => { const it = x.it, net = (+it.price || 0) * (1 - (+it.disc || 0) / 100), c = hc ? D.itemCost(it, x.i.date) : 0;
      return { date: x.i.date, at: x.i.createdAt || '', invId: x.i.id, no: x.i.no || '', cust: custLbl(x.i), pid: it.pid, sku: it.sku || '', name: it.name || '', unit: it.unit || '', pkg: it.pkg || '', src: x.src, qty: x.qty, net, total: Math.round(net * x.qty), cost: c * x.qty }; })
      .filter(r => !q || (r.sku + ' ' + r.name + ' ' + r.cust + ' ' + r.no + ' ' + r.pkg).toLowerCase().includes(q));
    const rows = st.tsrc ? all.filter(r => r.src === st.tsrc) : all, qs = (s2) => sum(all.filter(r => r.src === s2), r => r.qty), units = (n) => nf(n) + ' unit';
    let body;
    if (view === 'produk') {
      const m = {}; rows.forEach(r => { const g = m[r.pid] = m[r.pid] || { pid: r.pid, sku: r.sku, name: r.name, qty: 0, own: 0, cons: 0, ds: 0, total: 0, cost: 0, inv: new Set(), last: '' };
        g.qty += r.qty; g[r.src] += r.qty; g.total += r.total; g.cost += r.cost; g.inv.add(r.invId); if (r.date > g.last) g.last = r.date; });
      const gs = sortSold(Object.values(m), st.tsort, 'produk');
      body = table(['#', 'Produk', ['Qty'], ['Stock EXPC'], ['Stock SCW'], ['Dropship'], ['Invoice'], ['Nilai'], ...(hc ? [[own('Laba kotor')]] : []), 'Terakhir'],
        gs.slice(0, st.shown).map((g, k) => `<tr${g.pid ? ` data-prod="${esc(g.pid)}" tabindex="0"` : ''}><td class="muted">${k + 1}</td><td>${esc(g.name)}<br><span class="ex-sku">${esc(g.sku)}</span></td><td class="ex-n"><b>${nf(g.qty)}</b></td>
          <td class="ex-n">${g.own || '<span class="muted">—</span>'}</td><td class="ex-n">${g.cons || '<span class="muted">—</span>'}</td><td class="ex-n">${g.ds || '<span class="muted">—</span>'}</td><td class="ex-n">${g.inv.size}</td><td class="ex-n">${rp(g.total)}</td>
          ${hc ? `<td class="ex-n">${rpS(Math.round(g.total - g.cost))}</td>` : ''}<td><small>${esc(fmtD(g.last))}</small></td></tr>`), all.length ? 'Tidak ada yang cocok dengan filter.' : 'Belum ada barang terjual di periode ini.', 'wt-tbl') + more(gs.length);
    } else {
      const rs = sortSold(rows, st.tsort, 'rinci');
      body = table(['#', 'Tanggal', 'No. invoice', 'Pelanggan', 'Produk', 'Sumber', ['Qty'], ['Harga net'], ['Jumlah'], ...(hc ? [[own('Laba kotor')]] : [])],
        rs.slice(0, st.shown).map((r, k) => `<tr data-inv="${esc(r.invId)}" tabindex="0"><td class="muted">${k + 1}</td><td><small>${esc(fmtD(r.date))}</small></td><td><span class="ex-sku">${esc(r.no)}</span></td><td>${esc(r.cust)}</td>
          <td>${esc(r.name)}<br><small class="muted"><span class="ex-sku">${esc(r.sku)}</span>${r.pkg ? ' · Paket: ' + esc(r.pkg) : ''}</small></td><td><span class="badge ${SRC[r.src][1]}">${SRC[r.src][0]}</span></td>
          <td class="ex-n"><b>${nf(r.qty)}</b></td><td class="ex-n">${rp(r.net)}</td><td class="ex-n">${rp(r.total)}</td>${hc ? `<td class="ex-n">${rpS(Math.round(r.total - r.cost))}</td>` : ''}</tr>`),
        all.length ? 'Tidak ada yang cocok dengan filter.' : 'Belum ada barang terjual di periode ini.', 'wt-tbl') + more(rs.length);
    }
    $('#wt').innerHTML = `<div class="wt-stats">${tile('Total terjual', units(sum(all, r => r.qty)), rp(sum(all, r => r.total)) + ' · ' + mLabel(st.month), 'info')}
        ${tile('Dari Stock EXPC', units(qs('own')), 'stok milik sendiri')}${tile('Dari Stock Distributor - SCW', units(qs('cons')), 'otomatis jadi pembelian')}${tile('Dropship', units(qs('ds')), 'dikirim langsung distributor')}</div>
      <div class="toolbar">${monthSel()}<input class="inp" id="exQ" placeholder="Cari produk, pelanggan, invoice" value="${esc(st.q)}" aria-label="Cari"></div>
      <div class="toolbar">${seg('tsrc', [['', 'Semua'], ['own', 'Stock EXPC'], ['cons', 'Stock Distributor - SCW'], ['ds', 'Dropship']])}${seg('tview', [['rinci', 'Rincian'], ['produk', 'Per produk']])}
        <select class="inp inp--s" data-st="tsort" aria-label="Urutkan">${SORTS[view].map(([v, l]) => `<option value="${v}" ${st.tsort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      ${body}
      ${rows.length ? `<p class="muted tiny">${rows.length} baris · ${units(sum(rows, r => r.qty))} · ${rp(sum(rows, r => r.total))}. Harga net = harga setelah diskon per barang (belum termasuk diskon total, ongkir, dan pembulatan invoice). Barang dari invoice yang dibatalkan tidak dihitung.</p>` : ''}`;
    bindSearch(draw);
  }

  /* ---------- Rincian hutang per penjualan (pBeli, Owner) ---------- */
  function supBeli() {
    const all = purchases(D), open = all.filter(x => !x.paid), mk = curM;
    const list = all.filter(x => st.buyF === 'open' ? !x.paid : st.buyF === 'paid' ? !!x.paid : true);
    const cps = D.active.filter(p => p.cons > 0), mAll = all.filter(x => String(x.date || '').slice(0, 7) === mk);
    $('#wt').innerHTML = `<div class="wt-stats">${tile(own('Belum dibayar ke distributor'), rp(sum(open, x => x.amount)), open.length + ' pembelian', open.length ? 'warn' : '')}
        ${tile(own('Pembelian ' + mLabel(mk)), rp(sum(mAll, x => x.amount)), mAll.length + ' pembelian')}
        ${tile('Stock Distributor - SCW di gudang', nf(sum(cps, p => p.cons)) + ' unit', cps.length + ' SKU · senilai ' + rp(sum(cps, p => p.cons * costNow(p.id))))}</div>
      <div class="toolbar">${seg('buyF', [['open', 'Belum dibayar'], ['paid', 'Lunas'], ['', 'Semua']])}</div>
      ${table(['Tanggal', 'Referensi', 'Jenis', ['Isi'], ['Jumlah'], 'Status'], list.slice(0, st.shown).map(x => `<tr data-buy="${esc(x.key)}" tabindex="0"><td><small>${esc(fmtD(x.date))}</small></td>
        <td><span class="ex-sku">${esc(x.ref)}</span>${x.cust ? `<br><small class="muted">${esc(x.cust)}</small>` : ''}</td><td><small>${BUYK[x.kind]}</small></td><td class="ex-n">${x.lines.length} SKU · ${nf(x.units)} unit</td>
        <td class="ex-n">${rp(x.amount)}${x.nocost ? '<br><small class="muted">ada HPP kosong</small>' : ''}</td>
        <td>${x.paid ? `<span class="badge ok">Lunas</span><br><small class="muted">${esc(fmtD(x.paid.date))}</small>` : '<span class="badge warn">Belum dibayar</span>'}</td></tr>`),
        all.length ? 'Tidak ada pembelian di saringan ini.' : 'Belum ada pembelian. Pembelian muncul saat barang dibeli dari distributor atau barang Stock Distributor - SCW terjual.', 'wt-tbl')}
      ${more(list.length)}
      <p class="muted tiny">Jumlah dihitung dari HPP yang berlaku pada tanggalnya. Klik baris untuk rincian. Pembayarannya sendiri tercatat di Arus Kas.</p>
      <h2 class="wt-h">Stock Distributor - SCW yang masih di gudang (${cps.length} SKU)</h2>
      ${table(['SKU', 'Produk', ['Stock SCW'], ['Stock EXPC'], [own('HPP')], [own('Nilai Stock SCW')]], cps.map(p => { const hp = costNow(p.id); return `<tr data-prod="${esc(p.id)}" tabindex="0"><td><span class="ex-sku">${esc(p.sku)}</span></td><td>${esc(p.name)}</td>
        <td class="ex-n"><b>${nf(p.cons)}</b> <small class="muted">${esc(p.unit || '')}</small></td><td class="ex-n">${p.own || '<span class="muted">—</span>'}</td><td class="ex-n">${hp ? rp(hp) : '<span class="muted">belum diisi</span>'}</td><td class="ex-n">${rp(p.cons * hp)}</td></tr>`; }), 'Tidak ada barang Stock Distributor - SCW.', 'wt-tbl')}`;
  }

  /* ---------- Paket (pPaket) ---------- */
  function bundleInfo(b) {
    let normal = 0, price = 0, c = 0, avail = Infinity, missing = 0;
    (b.items || []).forEach(it => { const p = Pm(it.pid); if (!p || p.active === false) { missing++; return; } const q = +it.qty || 0; normal += q * (+p.price || 0); price += q * (+it.net || 0); c += q * (D.hasCost ? D.pkgCost(b.id, it.pid) : 0); if (q > 0) avail = Math.min(avail, Math.floor(Math.max(0, p.stk) / q)); });
    if (!isFinite(avail)) avail = 0;
    return { normal, price, cost: c, avail, missing, n: (b.items || []).length };
  }
  function supPaket() {
    const list = D.bundles.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')), hc = D.hasCost;
    $('#wt').innerHTML = `<p class="note">Paket berisi beberapa barang dengan harga khusus. Saat membuat invoice di aplikasi, semua barang paket masuk ke invoice dengan harga normal dan diskonnya, dan stok berkurang per barang.</p>
      ${table(['Paket', ['Harga normal'], ['Harga paket'], ['Hemat'], ...(hc ? [[own('HPP')], [own('Laba / paket')]] : []), ['Stok cukup untuk'], 'Status'], list.map(b => { const f = bundleInfo(b), hemat = f.normal - f.price;
        return `<tr data-bun="${esc(b.id)}" tabindex="0"><td><b>${esc(b.name)}</b><br><small class="muted">${f.n} barang${f.missing ? ` · <span class="ex-out">${f.missing} sudah tidak aktif</span>` : ''}</small></td>
          <td class="ex-n">${rp(f.normal)}</td><td class="ex-n"><b>${rp(f.price)}</b></td>
          <td class="ex-n">${hemat > 0 ? rp(hemat) + ` <small class="muted">(${fmtPct(hemat / f.normal * 100)}%)</small>` : hemat < 0 ? `<small class="muted">naik</small> +${rp(-hemat)}` : '—'}</td>
          ${hc ? `<td class="ex-n">${rp(f.cost)}</td><td class="ex-n">${rp(f.price - f.cost)}</td>` : ''}<td class="ex-n">${f.avail} paket</td>
          <td>${b.active === false ? '<span class="badge off">Nonaktif</span>' : f.avail > 0 ? '<span class="badge ok">Aktif</span>' : '<span class="badge bad">Stok kurang</span>'}</td></tr>`; }), 'Belum ada paket.', 'wt-tbl')}`;
  }

  /* ---------- Pengeluaran (pBiaya) ---------- */
  const expOpen = () => D.exp.filter(r => r.ownerPaid && !r.settledBy);
  function supExp() {
    const q = st.q.toLowerCase();
    const inP = D.exp.filter(r => inMonth(r.date) && (st.expBiz === 'all' || r.biz === (st.expBiz === 'none' ? '' : st.expBiz)));
    const rows = inP.filter(r => (!st.expGroup || r.parts.some(p => expGroup(p.cat) === st.expGroup)) && (!st.expCat || r.cats.includes(st.expCat)) && (!q || (r.desc + ' ' + r.vendor + ' ' + r.note + ' ' + r.cat + ' ' + r.bankText).toLowerCase().includes(q)));
    const parts = []; inP.forEach(r => r.parts.forEach(p => parts.push(p)));
    const byG = (g) => sum(parts.filter(p => expGroup(p.cat) === g), p => p.amount), tot = sum(inP.filter(r => !r.ownerPaid), r => r.amount);
    const open = expOpen(), payers = {}; open.forEach(r => { const k = r.payer || 'Owner'; payers[k] = (payers[k] || 0) + r.amount; });
    const byCat = {}; parts.forEach(p => { byCat[p.cat] = (byCat[p.cat] || 0) + p.amount; });
    const panels = Object.keys(EXP_GROUPS).map(g => { const cs = Object.entries(byCat).filter(([c]) => expGroup(c) === g).sort((a, b) => b[1] - a[1]); if (!cs.length) return ''; const mx = Math.max(...cs.map(x => x[1]));
      return `<section><h2 class="wt-h">${EXP_GROUPS[g]} · ${rp(sum(cs, x => x[1]))}</h2>${table(['Kategori', '', ['Jumlah']], cs.map(([c, v]) => `<tr data-set="expCat:${esc(c)}" tabindex="0"><td>${esc(c)}</td><td>${bar(v, mx)}</td><td class="ex-n">${rp(v)}</td></tr>`), '', 'wt-tbl')}</section>`; }).join('');
    const review = inP.filter(r => r.src === 'bank' && r.cats.includes('Lainnya') && !(r.meta && (r.meta.cat || r.meta.split))).length;
    const cats = [...new Set([...Object.keys(EXP_CATS), ...Object.keys(byCat)])];
    $('#wt').innerHTML = `<div class="toolbar">${monthSel()}
        <select class="inp inp--s" data-st="expBiz" aria-label="Usaha"><option value="all">Semua usaha</option>${BIZ_OPTS.map(([k, l]) => `<option value="${k || 'none'}" ${st.expBiz === (k || 'none') ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <select class="inp inp--s" data-st="expGroup" aria-label="Kelompok"><option value="">Semua kelompok</option>${Object.entries(EXP_GROUPS).map(([k, v]) => `<option value="${k}" ${st.expGroup === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <select class="inp inp--s" data-st="expCat" aria-label="Kategori"><option value="">Semua kategori</option>${cats.map(c => `<option ${st.expCat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <input class="inp" id="exQ" placeholder="Cari keterangan atau penerima" value="${esc(st.q)}" aria-label="Cari pengeluaran"></div>
      <div class="wt-stats">${tile('Uang perusahaan keluar', rp(tot), inP.filter(r => !r.ownerPaid).length + ' transaksi · ' + mLabel(st.month))}
        ${tile('Beban operasional', rp(byG('beban')), 'mengurangi laba', 'bad')}${tile('Pembelian stok', rp(byG('stok')), 'sudah masuk HPP produk')}${tile('Dividen & ambil pemilik', rp(byG('pemilik')), 'bukan beban')}</div>
      ${open.length ? `<h2 class="wt-h">Uang owner yang belum di-reimburse · ${rp(sum(open, r => r.amount))}</h2>${table(['Tanggal', 'Keterangan', 'Kategori', ['Jumlah']], open.map(r => `<tr data-exp="${esc(r.src + ':' + r.id)}" tabindex="0"><td><small>${esc(fmtD(r.date))}</small></td><td>${esc(r.desc)}<br><small class="muted">dibayar ${esc(r.payer || 'owner')}</small></td><td>${esc(r.cat)}</td><td class="ex-n">${rp(r.amount)}</td></tr>`), '', 'wt-tbl')}
        <p class="muted tiny">${Object.entries(payers).map(([k, v]) => `Perusahaan berutang ${rp(v)} ke ${esc(k)}`).join(' · ')}.</p>` : ''}
      ${review ? `<p class="note"><b>${review} mutasi bank</b> masih berkategori <b>Lainnya</b>. Kategorinya diatur Owner di aplikasi supaya laba rugi akurat.</p>` : ''}
      ${panels ? `<div class="ex-grid2">${panels}</div>` : ''}
      <h2 class="wt-h">Daftar pengeluaran (${rows.length} transaksi${st.expCat || st.expGroup || q ? ', difilter' : ''})</h2>
      ${table(['Tanggal', 'Keterangan', 'Kategori', 'Sumber', ['Jumlah']], rows.slice(0, st.shown).map(r => { const other = r.parts.some(p => p.period !== String(r.date).slice(0, 7));
        return `<tr data-exp="${esc(r.src + ':' + r.id)}" tabindex="0"><td><small>${esc(fmtD(r.date))}</small></td>
          <td>${esc(r.desc || '—')}${r.vendor ? `<br><small class="muted">ke ${esc(r.vendor)}</small>` : ''}${r.parts.filter(p => shipTxt(p)).map(p => `<br><small class="muted">${esc(shipTxt(p))}${r.parts.length > 1 ? ' · ' + rp(p.amount) : ''}</small>`).join('')}${r.note ? `<br><small class="muted">${esc(r.note)}</small>` : ''}</td>
          <td><span class="badge ${r.cats.every(c => expGroup(c) === 'beban') ? 'off' : r.cats.some(c => ['pemilik', 'reimb'].includes(expGroup(c))) ? 'warn' : 'info'}">${esc(r.cat)}</span>${other ? `<br><small class="muted">untuk ${[...new Set(r.parts.map(p => mLabel(p.period)))].join(', ')}</small>` : ''}${r.settles.length ? `<br><small class="muted">mengganti ${r.settles.length} pengeluaran owner</small>` : ''}</td>
          <td><small class="muted">${r.ownerPaid ? 'Dibayar pakai uang owner' : r.src === 'bank' ? 'Mutasi bank' : 'Dicatat manual'}<br>${esc(r.ownerPaid ? 'Uang owner' + (r.payer ? ' · ' + r.payer : '') : accName(r.acc))}<br>${esc(bizLabel(r.biz))}</small>
            ${r.ownerPaid ? (r.settledBy ? `<br><span class="badge ok">Sudah di-reimburse ${esc(fmtD(r.settledBy.date))}</span>` : '<br><span class="badge warn">Belum di-reimburse</span>') : ''}</td>
          <td class="ex-n"><b>${rp(r.amount)}</b>${r.nota && r.nota.id ? '<br><small class="muted">ada nota</small>' : ''}</td></tr>`; }), 'Belum ada pengeluaran pada periode ini.', 'wt-tbl')}
      ${more(rows.length)}
      <p class="muted tiny">Transfer keluar dari rekening BCA 760 masuk otomatis dari mutasi bank. Kategori, bulan beban, dan pemecahan transfer diatur Owner di aplikasi.</p>`;
    bindSearch(draw);
  }

  /* ---------- Stock Opname (pOpname) ---------- */
  const OP_ST = { draft: ['off', 'Sedang dihitung'], submitted: ['warn', 'Menunggu Owner'], approved: ['ok', 'Disetujui'] };
  function supOpname() {
    const hc = D.hasCost;
    $('#wt').innerHTML = `<p class="note">Alur di aplikasi: 1 · mulai opname per kategori → 2 · hitung fisik, isi jumlah → 3 · kirim ke Owner → 4 · Owner setujui, stok disesuaikan.</p>
      ${table(['No.', 'Tanggal', 'Cakupan', ['SKU'], ['Selisih'], ...(hc ? [[own('Nilai selisih')]] : []), 'Status'], D.opname.slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).map(o => {
        const ls = o.lines || [], diff = ls.filter(l => l.physical != null && l.physical !== l.system), val = sum(ls, l => ((l.physical ?? l.system) - l.system) * costNow(l.pid)), s2 = OP_ST[o.status] || OP_ST.draft;
        return `<tr data-op="${esc(o.id)}" tabindex="0"><td><span class="ex-sku">${esc(o.no)}</span></td><td><small>${esc(fmtD(o.date))}</small></td><td>${esc(o.scope || '—')}</td><td class="ex-n">${ls.length}</td><td class="ex-n">${diff.length}</td>
          ${hc ? `<td class="ex-n ${val < 0 ? 'ex-out' : val > 0 ? 'ex-in' : ''}">${val ? rpS(val) : '—'}</td>` : ''}<td><span class="badge ${s2[0]}">${s2[1]}</span></td></tr>`; }), 'Belum ada stock opname.', 'wt-tbl')}`;
  }

  /* ---------- Laporan Supplies (pLaporan, Owner) ---------- */
  function series(n, invs, profitOf) {
    const out = [], d0 = new Date(today + 'T00:00:00');
    for (let k = n - 1; k >= 0; k--) { const d = new Date(d0.getFullYear(), d0.getMonth() - k, 1), m = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      const xs = invs.filter(i => String(i.date || '').slice(0, 7) === m), f = L.flow(m); out.push({ m, n: xs.length, omzet: sum(xs, i => i.t.total), laba: profitOf ? sum(xs, profitOf) : 0, kas: f.in, out: f.out }); }
    return out;
  }
  const outByCat = () => { const m = {}; D.cash.filter(c => !c.void && c.type === 'out').forEach(c => { const k = c.cat || 'Lainnya'; m[k] = m[k] || { v: 0, n: 0 }; m[k].v += +c.amount || 0; m[k].n++; }); return Object.entries(m).sort((a, b) => b[1].v - a[1].v); };
  const agingRows = (all) => { const ag = {}; all.filter(i => i.t.remaining > 0).forEach(i => { const c = i.custName; ag[c] = ag[c] || [0, 0, 0, 0]; const late = diffDays(today, i.due); ag[c][late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : 3] += i.t.remaining; });
    return Object.entries(ag).sort((a, b) => sum(b[1], v => v) - sum(a[1], v => v)).map(([c, a]) => `<tr><td>${esc(c || '—')}</td>${a.map((v, k) => `<td class="ex-n ${v && k >= 2 ? 'ex-out' : ''}">${v ? rp(v) : '<span class="muted">—</span>'}</td>`).join('')}<td class="ex-n"><b>${rp(sum(a, v => v))}</b></td></tr>`); };
  const agingTable = (all) => `<h2 class="wt-h">Umur piutang (sisa tagihan per pelanggan)</h2>${table(['Pelanggan', ['Belum jatuh tempo'], ['1–30 hari'], ['31–60 hari'], ['> 60 hari'], ['Total']], agingRows(all), 'Tidak ada piutang.', 'wt-tbl')}`;
  const cashBlock = (withLaba, all) => { const fAll = L.flow(''), oList = outByCat(), oMax = Math.max(1, ...oList.map(x => x[1].v));
    const rek = series(12, all, withLaba ? (i => i.t.profit || 0) : null).reverse().filter(d => d.n || d.kas || d.out);
    return `<div class="wt-stats">${tile('Kas masuk total', rpShort(fAll.in), fAll.nIn + ' transaksi', 'ok')}${tile('Kas keluar total', rpShort(fAll.out), fAll.nOut + ' transaksi', fAll.out ? 'bad' : '')}
        ${tile('Selisih kas', rpShortS(fAll.in - fAll.out), 'masuk dikurangi keluar')}${L.hasBalance ? tile(own('Saldo kas & rekening'), rpShortS(L.balanceOf('')), 'termasuk saldo awal') : ''}</div>
      <h2 class="wt-h">Rekap 12 bulan</h2>${table(['Bulan', ['Invoice'], ['Omzet'], ...(withLaba ? [['Laba kotor']] : []), ['Kas masuk'], ['Kas keluar'], ['Selisih kas']], rek.map(d => `<tr><td>${mLabel(d.m)}</td><td class="ex-n">${d.n}</td><td class="ex-n">${rp(d.omzet)}</td>${withLaba ? `<td class="ex-n">${rp(d.laba)}</td>` : ''}<td class="ex-n ex-in">${rp(d.kas)}</td><td class="ex-n ex-out">${rp(d.out)}</td><td class="ex-n"><b>${rpS(d.kas - d.out)}</b></td></tr>`), 'Belum ada transaksi 12 bulan terakhir.', 'wt-tbl')}
      <h2 class="wt-h">Kas keluar per kategori</h2>${table(['Kategori', ['Transaksi'], '', ['Jumlah']], oList.map(([m, x]) => `<tr><td>${esc(m)}</td><td class="ex-n">${x.n}</td><td>${bar(x.v, oMax, 'bad')}</td><td class="ex-n">${rp(x.v)}</td></tr>`), 'Belum ada kas keluar.', 'wt-tbl')}`; };
  function supReport() {
    const all = D.inv.filter(i => !i.void);
    if (!all.length) { $('#wt').innerHTML = L.rows.length ? cashBlock(true, all) : '<div class="empty"><p class="muted">Laporan muncul setelah ada invoice atau transaksi kas.</p></div>'; return; }
    const byP = {}; all.forEach(i => (i.items || []).forEach(it => { const k = it.pid; byP[k] = byP[k] || { q: 0, rev: 0, prof: 0, name: it.name }; const r = it.qty * it.price * (1 - (it.disc || 0) / 100); byP[k].q += it.qty; byP[k].rev += r; byP[k].prof += r - it.qty * D.itemCost(it, i.date); }));
    const top = Object.entries(byP).sort((a, b) => b[1].rev - a[1].rev).slice(0, 10), maxRev = (top[0] && top[0][1].rev) || 1;
    const DEF_CATS = ['Cuci', 'Dekontaminasi', 'Poles & Pad', 'Microfiber', 'Proteksi', 'Interior & Ban', 'Alat'];
    const byCat = [...new Set([...DEF_CATS, ...D.products.map(p => p.cat).filter(Boolean)])].map(c => { const ps = D.active.filter(p => p.cat === c); return { c, v: sum(ps, p => Math.max(0, p.own) * costNow(p.id)), u: sum(ps, p => Math.max(0, p.own)), n: ps.length }; }).filter(x => x.n);
    const catMax = Math.max(1, ...byCat.map(x => x.v)), totalStock = sum(byCat, x => x.v);
    const omzet = sum(all, i => i.t.total), laba = sum(all, i => i.t.profit || 0), noCost = D.active.filter(p => !costNow(p.id)).length;
    $('#wt').innerHTML = `${noCost ? `<p class="note">${noCost} produk belum punya HPP, jadi laba kotor dan nilai persediaan belum lengkap.</p>` : ''}
      <div class="wt-stats">${tile('Omzet total', rpShort(omzet), all.length + ' invoice', 'info')}${tile(own('Laba kotor'), rpShort(laba), omzet ? 'Margin ' + Math.round(laba / omzet * 100) + '%' : '', 'ok')}
        ${tile('Rata-rata per invoice', rpShort(omzet / all.length), '')}${tile(own('Nilai persediaan'), rpShort(totalStock), 'HPP × Stock EXPC')}</div>
      ${cashBlock(true, all)}
      <div class="ex-grid2"><section><h2 class="wt-h">Produk terlaris (omzet)</h2>${table(['Produk', ['Terjual'], ['Omzet'], '', ['Margin']], top.map(([pid, v]) => `<tr><td>${esc(Pm(pid) ? Pm(pid).name : v.name)}</td><td class="ex-n">${nf(v.q)}</td><td class="ex-n">${rp(v.rev)}</td><td>${bar(v.rev, maxRev)}</td><td class="ex-n">${v.rev ? Math.round(v.prof / v.rev * 100) + '%' : '—'}</td></tr>`), '', 'wt-tbl')}</section>
        <section><h2 class="wt-h">Nilai persediaan per kategori</h2>${table(['Kategori', ['Unit'], '', ['Nilai']], byCat.map(x => `<tr><td>${esc(x.c)}<br><small class="muted">${x.n} SKU</small></td><td class="ex-n">${nf(x.u)}</td><td>${bar(x.v, catMax)}</td><td class="ex-n">${rp(x.v)}</td></tr>`), '', 'wt-tbl')}</section></div>
      ${agingTable(all)}
      <p class="muted tiny">Grafik batang di aplikasi diganti tabel rekap di sini. Kas masuk/keluar adalah kas gabungan Supplies + Academy.</p>`;
  }

  /* ---------- Laba Rugi (pLabaRugi, Owner) ---------- */
  function supLR() {
    const start = lrStart(D), mk = st.month < start.slice(0, 7) ? start.slice(0, 7) : st.month, R = lrCompute(D, mk + '-01', lastDay(mk), st.lrShared);
    const line = (l, v, o = {}) => `<tr${o.b ? ' class="ex-lr-b"' : ''}><td${o.sub ? ' class="ex-lr-sub"' : ''}>${l}</td><td class="ex-n ${o.neg ? 'ex-out' : ''}">${o.neg && v ? '−' : ''}${rp(Math.abs(v))}</td></tr>`;
    const bebanL = Object.entries(R.beban).sort((a, b) => b[1] - a[1]);
    const months = []; for (let m = start.slice(0, 7); m <= curM;) { months.push(m); const d = new Date(+m.slice(0, 4), +m.slice(5, 7), 1); m = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
    const per = months.map(m => ({ m, r: lrCompute(D, m + '-01', lastDay(m), st.lrShared) }));
    const trow = (l, f) => `<tr><td>${l}</td>${per.map(x => `<td class="ex-n">${rpShortS(f(x.r))}</td>`).join('')}</tr>`;
    $('#wt').innerHTML = `<div class="toolbar">${monthSel()}<label class="tiny"><input type="checkbox" data-st="lrShared" ${st.lrShared ? 'checked' : ''}> Ikutkan beban bersama (yang belum ditentukan usahanya)</label></div>
      ${mk !== st.month ? `<p class="note">Laba rugi dihitung mulai ${esc(fmtD(start))}; ditampilkan ${mLabel(mk)}.</p>` : ''}
      <div class="wt-stats">${tile('Penjualan bersih', rp(R.sales + R.ship), R.n + ' invoice', 'info')}${tile('Laba kotor', rp(R.labaKotor), R.sales + R.ship ? Math.round(R.labaKotor / (R.sales + R.ship) * 100) + '% dari penjualan' : '', 'ok')}
        ${tile('Beban operasional', rp(R.totBeban), bebanL.length + ' kategori', 'bad')}${tile('Laba bersih', rpS(R.laba), mLabel(mk), R.laba >= 0 ? 'ok' : 'bad')}</div>
      ${R.est ? `<p class="note"><b>${R.est} invoice</b> HPP-nya masih nol. Isi HPP produknya di aplikasi supaya laba akurat.</p>` : ''}
      <div class="ex-grid2"><section><h2 class="wt-h">Laba Rugi · ${mLabel(mk)}</h2>${table(['', ['']], [line('Penjualan kotor', R.gross), R.disc ? line('Diskon', R.disc, { sub: 1, neg: 1 }) : '', R.ship ? line('Ongkir ditagih ke pelanggan', R.ship, { sub: 1 }) : '',
          line('Penjualan bersih', R.sales + R.ship, { b: 1 }), line('HPP barang terjual', R.hpp, { neg: 1 }), line('Laba kotor', R.labaKotor, { b: 1 }),
          ...bebanL.map(([c, v]) => line(esc(c), v, { sub: 1, neg: 1 })), line('Total beban operasional', R.totBeban, { b: 1, neg: 1 }),
          ...Object.entries(R.other).map(([c, v]) => line(esc(c) + ' (pendapatan lain)', v, { sub: 1 })),
          `<tr class="ex-lr-total"><td>Laba bersih</td><td class="ex-n ${R.laba >= 0 ? 'ex-in' : 'ex-out'}">${rpS(R.laba)}</td></tr>`].filter(Boolean), '', 'ex-lr')}</section>
        <section><h2 class="wt-h">Tidak masuk laba rugi</h2>${table(['', ['']], [...Object.entries(R.stok).map(([c, v]) => line(esc(c), v)), ...Object.entries(R.pemilik).map(([c, v]) => line(esc(c), v))], 'Tidak ada pembelian stok', 'ex-lr')}
          <p class="muted tiny">Pembelian stok dan ongkir dari supplier sudah tercermin di HPP produk, lalu menjadi biaya saat barangnya terjual. Dividen adalah pembagian laba, bukan biaya.</p></section></div>
      ${per.length > 1 ? `<h2 class="wt-h">Per bulan (mulai ${esc(fmtD(start))})</h2>${table(['', ...per.map(x => [mLabel(x.m)])], [trow('Penjualan bersih', r => r.sales + r.ship), trow('HPP', r => -r.hpp), trow('<b>Laba kotor</b>', r => r.labaKotor), trow('Beban operasional', r => -r.totBeban), trow('Pendapatan lain', r => r.totOther), trow('<b>Laba bersih</b>', r => r.laba)], '', 'wt-tbl')}` : ''}
      <p class="muted tiny">Penjualan dihitung dari tanggal invoice (bukan tanggal uang masuk). Beban dihitung dari "untuk bulan" di menu Pengeluaran, khusus usaha Supplies${st.lrShared ? ' ditambah beban bersama' : ''}. Sebaiknya angka ini dicek ulang dengan akuntan sebelum dipakai untuk pajak.</p>`;
  }

  /* ---------- Log Aktivitas (pLog, Owner) ---------- */
  function actLog() {
    const ev = [], cashW = (c) => c.type === 'out' ? 'kas keluar ' + rp(c.amount) + ' dari ' + accName(c.acc) + ' (' + (c.cat || '') + ': ' + (c.desc || '') + ')' : c.type === 'in' ? 'kas masuk lain ' + rp(c.amount) + ' ke ' + accName(c.acc) + ' (' + (c.cat || '') + ': ' + (c.desc || '') + ')' : 'pemindahan ' + rp(c.amount) + ' dari ' + accName(c.acc) + ' ke ' + accName(c.toAcc);
    const pays = (i) => { (i.payments || []).forEach(p => ev.push({ at: p.at || p.date, what: 'Mencatat pembayaran ' + rp(p.amount) + ' (' + p.method + ') untuk ' + i.no }));
      (i.paymentsRemoved || []).forEach(p => { ev.push({ at: p.at || p.date, what: 'Mencatat pembayaran ' + rp(p.amount) + ' (' + p.method + ') untuk ' + i.no + ', kemudian dihapus' }); ev.push({ at: p.removedAt, what: 'Menghapus pembayaran ' + rp(p.amount) + ' dari ' + i.no }); }); };
    if (st.biz === 'sup') {
      D.invoices.forEach(i => { ev.push({ at: i.createdAt, what: 'Membuat invoice ' + i.no + (i.custName ? ' untuk ' + i.custName : '') + ' (' + rp(supTotals({ ...i, void: false }, D, today).total) + ')' }); pays(i); if (i.void) ev.push({ at: i.voidAt, what: 'Membatalkan invoice ' + i.no + ' — ' + (i.voidReason || '') }); });
      D.cash.forEach(c => { const w = cashW(c); ev.push({ at: c.createdAt, what: 'Mencatat ' + w + (c.void ? ', kemudian dihapus' : '') }); if (c.void) ev.push({ at: c.voidAt, what: 'Menghapus catatan ' + w }); });
      D.receipts.forEach(r => ev.push({ at: r.createdAt, what: 'Mencatat ' + (KIND[r.kind] || KIND.titip).toLowerCase() + ' ' + r.no + ' · ' + r.supplier + ' (' + (r.lines || []).length + ' SKU)' }));
      Object.entries(D.paid || {}).forEach(([k, v]) => { if (v && v.at) ev.push({ at: v.at, what: 'Menandai lunas pembelian ' + (k.indexOf('ds_') === 0 ? 'dropship invoice ' + ((D.invoices.find(i => i.id === k.slice(3)) || {}).no || k.slice(3)) : k.indexOf('inv_') === 0 ? 'dari invoice ' + ((D.invoices.find(i => i.id === k.slice(4)) || {}).no || k.slice(4)) : ((D.receipts.find(r => r.id === k) || {}).no || k)) }); });
      D.opname.forEach(o => { ev.push({ at: o.createdAt, what: 'Memulai stock opname ' + o.no + ' (' + o.scope + ')' }); if (o.submittedAt) ev.push({ at: o.submittedAt, what: 'Mengirim stock opname ' + o.no + ' untuk persetujuan' }); if (o.approvedAt) ev.push({ at: o.approvedAt, what: 'Menyetujui stock opname ' + o.no }); });
      D.products.forEach(p => { if (p.createdAt) ev.push({ at: p.createdAt, what: 'Menambah produk ' + p.sku + ' ' + p.name }); if (p.updatedAt) ev.push({ at: p.updatedAt, what: 'Terakhir mengubah produk ' + p.sku + (p.active === false ? ' (diarsipkan)' : '') }); });
      D.customers.forEach(c => { if (c.createdAt) ev.push({ at: c.createdAt, what: 'Menambah pelanggan ' + c.name }); });
      D.bundles.forEach(b => { if (b.createdAt) ev.push({ at: b.createdAt, what: 'Membuat paket ' + b.name }); if (b.updatedAt && b.updatedAt !== b.createdAt) ev.push({ at: b.updatedAt, what: 'Terakhir mengubah paket ' + b.name + ' (harga paket ' + rp(bundleInfo(b).price) + (b.active === false ? ', nonaktif' : '') + ')' }); });
      D.scwinv.forEach(v => { if (v.at) ev.push({ at: v.at, what: 'Mengunggah invoice ' + (v.supplier || 'SCW') + ' ' + v.no + ' (' + rp(v.total) + ', periode ' + (v.period ? mLabel(v.period) : '—') + ')' }); if (v.updatedAt && v.updatedAt !== v.at) ev.push({ at: v.updatedAt, what: 'Mengubah invoice SCW ' + v.no }); });
    } else {
      D.aca.promos.forEach(p => { ev.push({ at: p.createdAt, what: 'Membuat promo ' + p.name + ' (' + promoValue(p) + ')' }); if (p.updatedAt) ev.push({ at: p.updatedAt, what: 'Mengubah promo ' + p.name }); });
      D.aca.invoices.forEach(i => { ev.push({ at: i.createdAt, what: 'Membuat invoice ' + i.no + ' untuk ' + i.custName + ' (' + rp(acaTotals({ ...i, void: false }, today).total) + ')' }); pays(i); if (i.void) ev.push({ at: i.voidAt, what: 'Membatalkan invoice ' + i.no + '. Alasan: ' + (i.voidReason || '') }); });
      D.cash.forEach(c => { const w = cashW(c); ev.push({ at: c.createdAt, what: 'Mencatat ' + w + (c.void ? ', kemudian dihapus' : '') }); if (c.void) ev.push({ at: c.voidAt, what: 'Menghapus catatan ' + w }); });
      D.aca.services.forEach(p => { if (p.createdAt) ev.push({ at: p.createdAt, what: 'Menambah jasa ' + p.name + ' (' + rp(p.price) + ')' }); if (p.updatedAt) ev.push({ at: p.updatedAt, what: 'Terakhir mengubah jasa ' + p.name + (p.active === false ? ' (diarsipkan)' : ' · harga ' + rp(p.price)) }); });
      D.aca.customers.forEach(c => { if (c.createdAt) ev.push({ at: c.createdAt, what: 'Menambah pelanggan ' + c.name }); });
    }
    ev.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
    $('#wt').innerHTML = `<p class="muted tiny">${ev.length} catatan, terbaru di atas (aplikasi menampilkan 300 terakhir). Nama pengguna tidak ikut disalin ke portal${st.biz === 'sup' ? ', dan penghapusan permanen (dari tempat sampah) tidak ditampilkan' : ''}.</p>
      ${table(['Waktu', 'Aktivitas'], ev.slice(0, Math.min(300, st.shown)).map(l => `<tr><td class="nowrap"><small class="ex-sku">${esc(fmtDT(l.at))}</small></td><td>${esc(l.what)}</td></tr>`), 'Belum ada aktivitas.', 'wt-tbl')}
      ${Math.min(300, ev.length) > st.shown ? more(Math.min(300, ev.length)) : ''}`;
  }

  /* ---------- Pengaturan (pSettings, Owner; lihat saja) ---------- */
  function settings() {
    const co = Object.assign(st.biz === 'sup' ? { name: 'EXPC Detailing Supplies', tagline: 'Perlengkapan car detailing', prefix: 'INV/EXPC/' } : {}, (st.biz === 'sup' ? D.company : D.aca.company) || {});
    const bs = D.fin.banksync, f = (l, v) => `<div><small>${l}</small><b>${v ? esc(v) : '<span class="muted">—</span>'}</b></div>`;
    $('#wt').innerHTML = `<h2 class="wt-h">Data usaha</h2>
      <div class="wt-facts">${f('Nama usaha', co.name)}${f('Keterangan singkat', co.tagline)}${f('No. WA / telepon', co.phone)}${f('Awalan nomor invoice', co.prefix)}${f('Alamat', co.address)}${f('Info rekening pembayaran', co.bank)}</div>
      <h2 class="wt-h">${own('Rekening & kas')}</h2>
      ${table(['Nama rekening', 'Jenis', ['Saldo awal'], 'Status'], L.accs.map(a => `<tr><td>${esc(a.name)}</td><td>${a.kind === 'tunai' ? 'Kas tunai' : 'Rekening bank / e-wallet'}</td><td class="ex-n">${L.hasBalance ? rp(L.openingOf(a.id)) : '—'}</td><td>${a.active !== false ? '<span class="badge ok">Aktif</span>' : '<span class="badge off">Nonaktif</span>'}</td></tr>`), 'Belum ada rekening.')}
      <p class="muted tiny">Saldo awal adalah uang yang sudah ada di rekening sebelum transaksi pertama dicatat. Rekening dipakai bersama Supplies dan Academy.</p>
      ${bs ? `<h2 class="wt-h">${own('Sinkron mutasi rekening 760')}</h2><div class="wt-facts">${f('Sinkron terakhir', fmtDT(bs.syncedAt))}${f('Saldo menurut sheet', bs.lastBalance != null ? rpS(bs.lastBalance) : '')}${f('Baris terakhir', bs.lastDate ? fmtD(bs.lastDate) + (bs.lastPending ? ' (pending)' : '') : '')}</div>` : ''}
      <p class="note">Mengubah data usaha, rekening, dan akses pengguna tetap dilakukan di aplikasi Claude (menu Pengaturan, hanya Owner).</p>`;
  }

  /* ---------- Konfirmasi (pKonf; portal: Owner memantau semua) ---------- */
  const konfLast = (k) => { const t = k.thread || []; return t.length ? t[t.length - 1] : null; };
  const konfAgent = (k) => (k && (k.agentName || k.name)) || 'Agent';
  const konfSt = (k) => k.status === 'answered' ? '<span class="badge ok">Sudah dijawab</span>' : '<span class="badge bad">Menunggu jawaban</span>';
  function konf() {
    const mine = D.konf.slice().sort((a, b) => (a.status === 'answered') - (b.status === 'answered') || String((konfLast(b) || {}).at || b.createdAt || '').localeCompare(String((konfLast(a) || {}).at || a.createdAt || '')));
    const f = st.konfF || '', list = mine.filter(k => !f || (f === 'open' ? k.status !== 'answered' : k.status === 'answered')), open = mine.filter(k => k.status !== 'answered').length;
    $('#wt').innerHTML = `<div class="wt-stats">${tile('Menunggu jawaban', open, 'semua admin', open ? 'bad' : '')}${tile('Sudah dijawab', mine.length - open, '')}${tile('Total pertanyaan', mine.length, '')}</div>
      <div class="toolbar">${seg('konfF', [['', 'Semua'], ['open', 'Menunggu jawaban'], ['done', 'Sudah dijawab']])}</div>
      <p class="note">Klarifikasi Agent ke admin; terkirim otomatis saat pemeriksaan Agent menemukan data yang kurang atau berbeda. Menjawab tetap di aplikasi Claude.</p>
      ${table(['No.', 'Dikirim', 'Dari', 'Pertanyaan', 'Status', 'Terakhir'], list.map(k => { const last = konfLast(k);
        return `<tr data-konf="${esc(k.id)}" tabindex="0"><td><span class="ex-sku">${esc(k.no || '')}</span></td><td class="nowrap"><small>${esc(fmtDT(k.createdAt))}</small></td><td>${esc(konfAgent(k))}</td>
          <td><span class="ex-clamp">${esc(k.q || '')}</span>${k.ref ? `<br><small class="muted">Ref: ${esc(k.ref)}</small>` : ''}</td><td>${konfSt(k)}</td>
          <td class="nowrap"><small class="muted">${last ? (last.role === 'admin' ? 'Dijawab ' : esc(konfAgent(k)) + ' ') + esc(fmtDT(last.at)) : '—'}</small></td></tr>`; }),
        mine.length ? 'Tidak ada pertanyaan dengan status ini.' : 'Belum ada pertanyaan dari Agent.', 'wt-tbl')}`;
  }

  /* ---------- Academy: Promo (pPromo) ---------- */
  const promoState = (p) => p.active === false ? ['off', 'Nonaktif'] : p.to && p.to < today ? ['off', 'Selesai'] : p.from && p.from > today ? ['info', 'Akan datang'] : ['ok', 'Berlaku'];
  const promoValue = (p) => p.type === 'price' ? 'Harga jadi ' + rp(p.value) : String(+p.value || 0).replace('.', ',') + '%';
  function acaPromo() {
    const rank = { Berlaku: 0, 'Akan datang': 1, Selesai: 2, Nonaktif: 3 };
    const list = D.aca.promos.slice().sort((a, b) => rank[promoState(a)[1]] - rank[promoState(b)[1]] || String(b.from || '').localeCompare(String(a.from || '')));
    const used = {}; D.aca.invoices.forEach(i => { if (i.void) return; (i.items || []).forEach(it => { if (!it.promoId) return; const u = used[it.promoId] = used[it.promoId] || { n: 0, cut: 0 };
      u.n += +it.qty || 0; u.cut += (+it.qty || 0) * ((+it.normal || 0) ? (+it.normal - (+it.price || 0)) + (+it.price || 0) * (+it.disc || 0) / 100 : (+it.price || 0) * (+it.disc || 0) / 100); }); });
    const live = list.filter(p => promoState(p)[1] === 'Berlaku');
    const targets = (p) => { if (!(p.sids && p.sids.length)) return 'Semua jasa'; const n = p.sids.map(svName).filter(x => x !== '—'); return n.length <= 2 ? n.join(', ') : n.slice(0, 2).join(', ') + ' +' + (n.length - 2) + ' lainnya'; };
    $('#wt').innerHTML = `<div class="wt-stats">${tile('Promo berlaku hari ini', live.length, live.length ? live.map(p => esc(p.name)).slice(0, 2).join(', ') : 'tidak ada', live.length ? 'ok' : '')}${tile('Total promo', list.length, 'termasuk yang sudah selesai')}</div>
      <p class="note">Promo dipakai otomatis saat membuat invoice di aplikasi: bila tanggal invoice ada di periode promo, harga atau diskon terisi sendiri. Bila ada beberapa promo untuk jasa yang sama, dipakai potongan terbesar.</p>
      ${table(['Promo', 'Berlaku untuk', ['Potongan'], 'Periode', ['Terpakai'], 'Status'], list.map(p => { const s2 = promoState(p), u = used[p.id] || { n: 0, cut: 0 };
        return `<tr><td><b>${esc(p.name)}</b>${p.note ? `<br><small class="muted">${esc(p.note)}</small>` : ''}</td><td><small>${esc(targets(p))}</small></td><td class="ex-n">${promoValue(p)}</td>
          <td class="nowrap"><small>${p.from ? esc(fmtD(p.from)) : 'kapan saja'} – ${p.to ? esc(fmtD(p.to)) : 'tanpa batas'}</small></td><td class="ex-n">${u.n ? u.n + ' kali · −' + rp(u.cut) : '<span class="muted">—</span>'}</td>
          <td><span class="badge ${s2[0]}">${s2[1]}</span></td></tr>`; }), 'Belum ada promo.', 'wt-tbl')}`;
  }

  /* ---------- Academy: Laporan (pLaporan, Owner) ---------- */
  function acaReport() {
    const all = D.acaInv.filter(i => !i.void);
    if (!all.length && !L.rows.length) { $('#wt').innerHTML = '<div class="empty"><p class="muted">Laporan muncul setelah ada invoice atau transaksi kas.</p></div>'; return; }
    const lineAmt = (it) => (+it.qty || 0) * (+it.price || 0) * (1 - (+it.disc || 0) / 100);
    const m = {}; all.forEach(i => (i.items || []).forEach(it => { const k = it.sid || it.name; m[k] = m[k] || { q: 0, rev: 0, name: it.name, sid: it.sid }; m[k].q += +it.qty || 0; m[k].rev += lineAmt(it); }));
    const top = Object.values(m).sort((a, b) => b.rev - a.rev).slice(0, 10), maxRev = (top[0] && top[0].rev) || 1;
    const byCat = {}; all.forEach(i => (i.items || []).forEach(it => { const p = D.aca.services.find(s => s.id === it.sid); const c = (p && p.cat) || it.cat || 'Lainnya'; byCat[c] = (byCat[c] || 0) + lineAmt(it); }));
    const catList = Object.entries(byCat).sort((a, b) => b[1] - a[1]), catMax = Math.max(1, ...catList.map(x => x[1]));
    const omzet = sum(all, i => i.t.total), piutang = sum(all, i => i.t.remaining);
    $('#wt').innerHTML = `<div class="wt-stats">${tile('Omzet total', rpShort(omzet), all.length + ' invoice', 'info')}${tile('Piutang', rpShort(piutang), omzet ? Math.round(piutang / omzet * 100) + '% dari omzet' : '', piutang ? 'warn' : '')}</div>
      ${cashBlock(false, all)}
      <div class="ex-grid2"><section><h2 class="wt-h">Jasa terlaris (omzet)</h2>${table(['Jasa', ['Terjual'], ['Omzet'], ''], top.map(v => { const p = v.sid && D.aca.services.find(s => s.id === v.sid); return `<tr><td>${esc(p ? p.name : v.name)}</td><td class="ex-n">${nf(v.q)}</td><td class="ex-n">${rp(v.rev)}</td><td>${bar(v.rev, maxRev)}</td></tr>`; }), 'Belum ada invoice.', 'wt-tbl')}</section>
        <section><h2 class="wt-h">Omzet per kategori jasa</h2>${table(['Kategori', '', ['Omzet']], catList.map(([c, v]) => `<tr><td>${esc(c)}</td><td>${bar(v, catMax)}</td><td class="ex-n">${rp(v)}</td></tr>`), 'Belum ada invoice.', 'wt-tbl')}</section></div>
      ${agingTable(all)}
      <p class="muted tiny">Kas masuk/keluar adalah kas gabungan Supplies + Academy, sama dengan aplikasi.</p>`;
  }

  /* ---------- popup tambahan ---------- */
  function openBuy(key) {
    const x = purchases(D).find(v => v.key === key); if (!x) return;
    const link = D.scwinv.find(v => (v.keys || []).includes(key));
    openDlg(`<div class="wt-dh"><div><span class="ex-sku">${esc(x.ref)}</span> ${x.paid ? '<span class="badge ok">Lunas</span>' : '<span class="badge warn">Belum dibayar</span>'}<h2>${BUYK[x.kind]}</h2><span class="muted tiny">${esc(fmtD(x.date))}${x.cust ? ' · invoice untuk ' + esc(x.cust) : ''}</span></div><button class="iconbtn" data-close aria-label="Tutup">×</button></div>
      ${x.kind === 'ds' ? '<p class="note">Dropship: barang tidak lewat gudang EXPC, dikirim langsung oleh distributor ke pembeli. Otomatis dihitung sebagai dibeli dari distributor.</p>' : ''}
      ${x.kind === 'auto' ? '<p class="note">Barang ini terjual saat Stock EXPC habis, jadi diambil dari Stock Distributor - SCW dan otomatis dihitung sebagai dibeli dari distributor.</p>' : ''}
      ${x.nocost ? '<p class="note">Ada barang yang HPP-nya belum diisi, jadi jumlahnya belum lengkap.</p>' : ''}
      ${table(['Produk', ['Qty'], [own('HPP')], ['Jumlah']], x.lines.map(l => `<tr><td>${esc(l.name)}<br><span class="ex-sku">${esc(l.sku || '')}</span></td><td class="ex-n">${nf(l.qty)}</td><td class="ex-n">${l.cost ? rp(l.cost) : '<span class="muted">belum diisi</span>'}</td><td class="ex-n">${rp(l.qty * l.cost)}</td></tr>`), '')}
      <div class="ex-tot"><span><b>Total</b></span><span><b>${rp(x.amount)}</b></span></div>
      ${link ? `<p class="muted tiny">Ditagih di invoice distributor ${esc(link.no)} (${esc(fmtD(link.date))}).</p>` : ''}
      ${x.paid ? `<p class="muted tiny">Ditandai lunas ${esc(fmtD(x.paid.date))}${x.paid.scwNo ? ' lewat invoice ' + esc(x.paid.scwNo) : ''}${x.paid.note ? ' · ' + esc(x.paid.note) : ''}.</p>` : ''}`);
  }
  function openBundle(id) {
    const b = D.bundles.find(x => x.id === id); if (!b) return; const f = bundleInfo(b);
    openDlg(`<div class="wt-dh"><div><h2>${esc(b.name)}</h2></div><button class="iconbtn" data-close aria-label="Tutup">×</button></div>
      <div class="wt-facts"><div><small>Harga paket</small><b>${rp(f.price)}</b><span class="muted">normal ${rp(f.normal)}</span></div><div><small>Stok cukup untuk</small><b>${f.avail} paket</b><span class="muted">${b.active === false ? 'Paket nonaktif' : 'saat ini'}</span></div>
        ${D.hasCost ? `<div><small>${own('HPP paket')}</small><b>${rp(f.cost)}</b><span class="muted">laba ${rp(f.price - f.cost)}</span></div>` : ''}</div>
      ${table(['Barang', ['Qty'], ['Harga normal'], ['Disk'], ['Jumlah']], (b.items || []).map(it => { const p = Pm(it.pid); if (!p) return '<tr><td colspan="5" class="muted">Produk sudah dihapus</td></tr>'; const price = +p.price || 0, net = +it.net || 0;
        return `<tr><td>${esc(p.name)}<br><span class="ex-sku">${esc(p.sku)}</span>${p.active === false ? ' <small class="muted">· tidak aktif</small>' : ''}</td><td class="ex-n">${nf(it.qty)} <small class="muted">${esc(p.unit || '')}</small></td><td class="ex-n">${rp(price)}</td><td class="ex-n">${price > net ? fmtPct((1 - net / price) * 100) + '%' : '—'}</td><td class="ex-n">${rp(it.qty * net)}</td></tr>`; }), '')}`);
  }
  function openExp(ref) {
    const i = ref.indexOf(':'), r = D.exp.find(x => x.src === ref.slice(0, i) && x.id === ref.slice(i + 1)); if (!r) return;
    const row = (l, v) => `<div><small>${l}</small><b>${v}</b></div>`;
    const settled = r.settles.map(id => D.exp.find(x => x.src === 'kas' && x.id === id)).filter(Boolean);
    openDlg(`<div class="wt-dh"><div><span class="muted tiny">${r.src === 'bank' ? 'Pengeluaran · mutasi bank' : 'Pengeluaran · dicatat manual'}</span><h2>${rp(r.amount)}</h2><span class="muted tiny">${esc(fmtD(r.date))}</span></div><button class="iconbtn" data-close aria-label="Tutup">×</button></div>
      <div class="wt-facts">${row('Keterangan', esc(r.desc || '—'))}${r.bankText && r.bankText !== r.desc ? row('Keterangan bank', esc(r.bankText)) : ''}${row('Dibayar ke', esc(r.vendor || '—'))}${r.note ? row('Catatan', esc(r.note)) : ''}
        ${row('Usaha', esc(bizLabel(r.biz)))}${row('Dibayar dari', esc(r.ownerPaid ? 'Uang owner' + (r.payer ? ' · ' + r.payer : '') : accName(r.acc)))}${row('Nota', r.nota && r.nota.id ? 'ada (buka di aplikasi)' : '<span class="muted">Belum ada</span>')}</div>
      ${table(['Kategori', 'Kelompok', 'Untuk bulan', ['Jumlah']], r.parts.map(p => `<tr><td>${esc(p.cat)}${p.note ? ' — ' + esc(p.note) : ''}${shipTxt(p) ? `<br><small class="muted">${esc(shipTxt(p))}</small>` : ''}</td><td><small>${EXP_GROUPS[expGroup(p.cat)]}</small></td><td>${mLabel(p.period)}</td><td class="ex-n">${rp(p.amount)}</td></tr>`), '')}
      ${r.ownerPaid ? `<p class="note">${r.settledBy ? `Sudah di-reimburse lewat ${esc(r.settledBy.desc || '—')} (${rp(r.settledBy.amount)}, ${esc(fmtD(r.settledBy.date))}).` : `Perusahaan masih berutang ${rp(r.amount)} ke ${esc(r.payer || 'owner')}.`}</p>` : ''}
      ${settled.length ? `<h3>Mengganti pengeluaran owner</h3><ul class="wt-log">${settled.map(x => `<li><small class="muted">${esc(fmtD(x.date))}</small><span>${esc(x.desc)} · <b>${rp(x.amount)}</b></span></li>`).join('')}</ul>` : ''}`);
  }
  function openOpname(id) {
    const o = D.opname.find(x => x.id === id); if (!o) return; const s2 = OP_ST[o.status] || OP_ST.draft, hc = D.hasCost;
    openDlg(`<div class="wt-dh"><div><span class="ex-sku">${esc(o.no)}</span> <span class="badge ${s2[0]}">${s2[1]}</span><h2>Stock opname · ${esc(o.scope || '')}</h2><span class="muted tiny">${esc(fmtD(o.date))}${o.approvedAt ? ' · disetujui ' + esc(fmtDT(o.approvedAt)) : ''}${o.adjTo ? ' · selisih ke ' + (o.adjTo === 'own' ? 'Stock EXPC' : 'Stock Distributor - SCW') : ''}</span></div><button class="iconbtn" data-close aria-label="Tutup">×</button></div>
      ${table(['Produk', ['Sistem'], ['Fisik'], ['Selisih'], ...(hc ? [[own('Nilai')]] : [])], (o.lines || []).map(l => { const d = l.physical == null ? null : l.physical - l.system;
        return `<tr><td>${esc(l.name || (Pm(l.pid) || {}).name || '')}<br><span class="ex-sku">${esc(l.sku || (Pm(l.pid) || {}).sku || '')}</span></td><td class="ex-n">${nf(l.system)}</td><td class="ex-n">${l.physical == null ? '<span class="muted">belum diisi</span>' : nf(l.physical)}</td>
          <td class="ex-n ${d > 0 ? 'ex-in' : d < 0 ? 'ex-out' : ''}">${d ? (d > 0 ? '+' : '') + nf(d) : '—'}</td>${hc ? `<td class="ex-n">${d ? rpS(d * costNow(l.pid)) : '—'}</td>` : ''}</tr>`; }), 'Tidak ada baris.')}`);
  }
  function openKonf(id) {
    const k = D.konf.find(x => x.id === id); if (!k) return;
    const files = (xs) => (xs || []).length ? `<br><small class="muted">Lampiran: ${xs.map(f => esc(f.name || 'file')).join(', ')}</small>` : '';
    openDlg(`<div class="wt-dh"><div><span class="ex-sku">${esc(k.no || '')}</span> ${konfSt(k)}<h2>Konfirmasi</h2><span class="muted tiny">Dari ${esc(konfAgent(k))} · ${esc(fmtDT(k.createdAt))}${k.ref ? ' · Ref: ' + esc(k.ref) : ''}</span></div><button class="iconbtn" data-close aria-label="Tutup">×</button></div>
      <ul class="wt-log">${(k.thread || []).map(m => `<li><small class="muted">${m.role === 'admin' ? 'Jawaban admin' : esc(m.name || konfAgent(k))} · ${esc(fmtDT(m.at))}</small><span class="ex-pre">${esc(m.text || '')}${files(m.files || m.attachments)}</span></li>`).join('') || `<li><span class="ex-pre">${esc(k.q || '')}</span></li>`}</ul>
      ${files(k.files || k.attachments)}`);
  }
  function openScw(id) {
    const v = D.scwinv.find(x => x.id === id); if (!v) return; const s2 = scwStatus(v), hc = D.hasCost, P = hc ? purchases(D) : [];
    openDlg(`<div class="wt-dh"><div><span class="ex-sku">${esc(v.no || '')}</span> ${s2.st === 'lunas' ? '<span class="badge ok">Lunas</span>' : '<span class="badge warn">Belum lunas</span>'}<h2>${esc(v.supplier || 'SCW')}</h2><span class="muted tiny">tgl invoice ${esc(fmtD(v.date))}${v.period ? ' · periode ' + esc(mLabel(v.period)) : ''}</span></div><button class="iconbtn" data-close aria-label="Tutup">×</button></div>
      ${table(['Barang', ['Qty'], ['Harga'], ['Disk'], ['Jumlah']], (v.items || []).map(it => `<tr><td>${esc(it.name)}${it.fee ? ' <span class="chip">biaya</span>' : ''}</td><td class="ex-n">${it.fee ? '' : nf(it.qty)}</td><td class="ex-n">${it.fee ? '' : rp(it.price)}</td><td class="ex-n">${it.disc ? (+it.disc).toLocaleString('id-ID') + '%' : '—'}</td><td class="ex-n">${rp(it.total)}</td></tr>`), '')}
      <div class="ex-tot"><span><b>Total</b></span><span><b>${rp(v.total)}</b></span></div>
      ${s2.st === 'lunas' ? `<p class="muted tiny">Dibayar ${esc(fmtD(scwPaidDate(v)))}${s2.src === 'rows' ? ' (semua baris pembelian sudah ditandai lunas)' : ''}.</p>` : ''}
      ${v.note ? `<p class="note">${esc(v.note)}</p>` : ''}
      ${(v.keys || []).length ? `<h3>Baris pembelian yang ditagih (${s2.paid}/${s2.n} lunas)</h3><ul class="wt-log">${v.keys.map(k => { const x = P.find(y => y.key === k); return `<li><small class="muted">${x ? esc(fmtD(x.date)) + ' · ' + BUYK[x.kind] : esc(k)}</small><span>${x ? esc(x.ref) + ' · ' + nf(x.units) + ' unit' + (hc ? ' · ' + rp(x.amount) : '') : ''} ${PAID[k] ? '<span class="badge ok">Lunas</span>' : '<span class="badge warn">Belum</span>'}</span></li>`; }).join('')}</ul>` : ''}
      ${(v.files || []).length ? `<p class="muted tiny">File: ${v.files.map(f => esc(f.name || 'file')).join(', ')} (dibuka di aplikasi Claude).</p>` : ''}`);
  }
  /* ---------- popup ---------- */
  function openDlg(html) {
    const dlg = $('#dlg'); dlg.classList.add('dlg--wide');
    dlg.innerHTML = `<div class="dlg">${html}</div>`;
    dlg.onclick = (e) => { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); };
    dlg.onclose = () => dlg.classList.remove('dlg--wide');
    dlg.showModal();
  }
  function openProduct(id) {
    const p = D.products.find(x => x.id === id); if (!p) return;
    const hp = D.hasCost ? D.costAt(p.id, today) : null;
    const dq = (v) => v ? `<span class="${v > 0 ? 'ex-in' : 'ex-out'}">${v > 0 ? '+' : ''}${nf(v)}</span>` : '<span class="muted">—</span>';
    openDlg(`<div class="wt-dh"><div><span class="ex-sku">${esc(p.sku)}</span> <span class="chip">${esc(p.cat || '')}</span><h2>${esc(p.name)}</h2></div><button class="iconbtn" data-close aria-label="Tutup">×</button></div>
      <div class="wt-facts">
        <div><small>Semua Stock</small><b>${nf(p.stk)} ${esc(p.unit || '')}</b><span class="badge ${p.state[0]}">${p.state[1]}</span></div>
        <div><small>Stock EXPC</small><b>${nf(p.own)}</b><span class="muted">sudah dibeli</span></div>
        <div><small>Stock Distributor - SCW</small><b>${nf(p.cons)}</b><span class="muted">milik distributor</span></div>
        <div><small>Minimum</small><b>${nf(p.min || 0)}</b><span class="muted">${esc(p.loc ? 'rak ' + p.loc : '')}</span></div>
        <div><small>Harga jual</small><b>${rp(p.price)}</b></div>
        ${hp !== null ? `<div><small>${own('HPP')}</small><b>${hp ? rp(hp) : '—'}</b><span class="muted">${hp && p.price ? 'margin ' + Math.round((p.price - hp) / p.price * 100) + '%' : 'belum diisi'}</span></div>` : ''}
      </div>
      <h3>Kartu stok</h3>
      ${table(['Tanggal', 'Keterangan', 'Ref', ['EXPC'], ['SCW'], ['Saldo']], p.moves.slice().reverse().slice(0, 80).map(m => `<tr><td><small>${esc(fmtD(m.date))}</small></td><td><small>${esc(m.label)}</small></td><td><span class="ex-sku">${esc(m.ref)}</span></td>
        <td class="ex-n">${dq(m.dOwn)}</td><td class="ex-n">${dq(m.dCons)}</td><td class="ex-n"><b>${nf(m.own + m.cons)}</b></td></tr>`), 'Belum ada pergerakan stok.')}`);
  }
  function openInvoice(id) {
    const i = invList().find(x => x.id === id); if (!i) return; const t = i.t;
    const co = (st.biz === 'sup' ? D.company : D.aca.company) || {};
    openDlg(`<div class="wt-dh"><div><span class="ex-sku">${esc(i.no)}</span> ${pill(t)}<h2>${esc(custName(i))}</h2><span class="muted tiny">${esc(co.name || '')}</span></div><button class="iconbtn" data-close aria-label="Tutup">×</button></div>
      <div class="wt-facts">
        <div><small>Tanggal</small><b>${esc(fmtD(i.date))}</b></div>
        <div><small>Jatuh tempo</small><b>${esc(fmtD(i.due))}</b>${t.overdue ? `<span class="badge bad">${diffDays(today, i.due)} hari lewat</span>` : ''}</div>
        <div><small>Pelanggan</small><b>${esc(custName(i))}</b><span class="muted">${esc(i.custPhone || '')}</span></div>
        ${i.member && MEMBER[i.member] ? `<div><small>Member</small><b>${MEMBER[i.member]}</b></div>` : ''}
      </div>
      ${i.void ? `<p class="note">Invoice dibatalkan${i.voidReason ? ': ' + esc(i.voidReason) : ''}${i.voidAt ? ' · ' + esc(fmtDT(i.voidAt)) : ''}.</p>` : ''}
      ${i.note ? `<p class="note">${esc(i.note)}</p>` : ''}
      <h3>Barang / jasa</h3>
      ${table(['Item', ['Qty'], ['Harga'], ['Disk'], ['Subtotal']], (i.items || []).map(it => `<tr><td>${esc(it.name)}${it.sku ? `<br><span class="ex-sku">${esc(it.sku)}</span>` : ''}${it.pkg ? ` <span class="chip">${esc(it.pkg)}</span>` : ''}${it.ds ? ' <span class="badge info">Dropship</span>' : ''}${it.promo ? `<br><small class="muted">Promo: ${esc(it.promo)}</small>` : ''}</td>
        <td class="ex-n">${nf(it.qty)} <small class="muted">${esc(it.unit || '')}</small></td><td class="ex-n">${rp(it.price)}</td><td class="ex-n">${it.disc ? (+it.disc).toLocaleString('id-ID') + '%' : '—'}</td>
        <td class="ex-n">${rp((+it.qty || 0) * (+it.price || 0) * (1 - (+it.disc || 0) / 100))}</td></tr>`), 'Tidak ada item.')}
      <div class="ex-tot"><span>Subtotal</span><span>${rp(t.gross)}</span>${t.itemDisc ? `<span>Diskon item</span><span>−${rp(t.itemDisc)}</span>` : ''}${i.discTotal ? `<span>Diskon total</span><span>−${rp(i.discTotal)}</span>` : ''}
        ${t.ship ? `<span>Ongkos kirim</span><span>${rp(t.ship)}</span>` : ''}${t.rounding ? `<span>Pembulatan</span><span>${rpS(t.rounding)}</span>` : ''}
        <span><b>Total</b></span><span><b>${rp(t.total)}</b></span><span>Dibayar</span><span>${rp(t.paid)}</span><span><b>Sisa</b></span><span><b>${rp(t.remaining)}</b></span>
        ${t.profit !== null && !i.void ? `<span>${own('Laba kotor')}</span><span>${rpS(t.profit)}</span>` : ''}</div>
      <h3>Pembayaran</h3>
      <ul class="wt-log">${(i.payments || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).map(p => `<li><small class="muted">${esc(fmtD(p.date))} · ${esc(p.method || '')} · ${esc(L.accName(p.acc) === '—' ? (p.acc || '') : L.accName(p.acc))}</small><span><b>${rp(p.amount)}</b>${p.note ? ' — ' + esc(p.note) : ''}</span></li>`).join('') || '<li class="muted">Belum ada pembayaran.</li>'}</ul>`);
  }

  /* ---------- kontrol ---------- */
  function bindSearch(redraw) {
    const inp = $('#exQ'); if (inp) inp.oninput = () => { st.q = inp.value; st.shown = 60; const pos = inp.selectionStart; redraw(); const n = $('#exQ'); n.focus(); n.setSelectionRange(pos, pos); };
    const c = $('#exCat'); if (c) c.onchange = () => { st.cat = c.value; redraw(); };
    const s = $('#exStat'); if (s) s.onchange = () => { st.stat = s.value; redraw(); };
  }
  const SUP = { ringkasan: supSummary, konfirmasi: konf, stok: supStock, invoice: invoices, paket: supPaket, pelanggan: customers, masuk: receipts, keluar: supSold,
    opname: supOpname, distributor, beli: supBeli, kas: cash, biaya: supExp, laporan: supReport, labarugi: supLR, keuangan: finance, aktivitas: actLog, pengaturan: settings };
  const ACA = { ringkasan: acaSummary, invoice: invoices, kas: cash, jasa: acaServices, promo: acaPromo, pelanggan: customers, laporan: acaReport, aktivitas: actLog, pengaturan: settings };
  const draw = () => {
    const map = st.biz === 'sup' ? SUP : ACA; if (!map[st.tab] || !navOf().some(g => g[2].some(p => p[0] === st.tab))) st.tab = 'ringkasan';
    drawTabs(); map[st.tab]();
    const m = $('#exMonth'); if (m) m.onchange = () => { st.month = m.value; st.shown = 60; draw(); };
    view.querySelectorAll('#wt select[data-st]').forEach(el => { el.onchange = () => { st[el.dataset.st] = el.value; st.shown = 60; draw(); }; });
    view.querySelectorAll('#wt input[type=checkbox][data-st]').forEach(el => { el.onchange = () => { st[el.dataset.st] = el.checked; draw(); }; });
  };
  const OPEN = { prod: openProduct, inv: openInvoice, buy: openBuy, bun: openBundle, exp: openExp, op: openOpname, konf: openKonf, scw: openScw };
  view.onclick = (e) => {
    const t = e.target.closest('[data-biz],[data-tab],[data-page],[data-invf],[data-set],[data-more],[data-prod],[data-inv],[data-buy],[data-bun],[data-exp],[data-op],[data-konf],[data-scw]'); if (!t) return;
    const reset = () => Object.assign(st, { q: '', cat: '', stat: '', invf: '', tsrc: '', expCat: '', expGroup: '', shown: 60 });
    if (t.dataset.biz) { st.biz = t.dataset.biz; try { sessionStorage.setItem('portal-expc-biz', st.biz); } catch (e) {} st.tab = 'ringkasan'; reset(); view.querySelectorAll('[data-biz]').forEach(b => b.setAttribute('aria-pressed', b === t)); }
    else if (t.dataset.tab) { const g = navOf().find(x => x[0] === t.dataset.tab); if (!g) return; st.tab = g[2][0][0]; reset(); }
    else if (t.dataset.page) { st.tab = t.dataset.page; reset(); }
    else if ('invf' in t.dataset) { st.invf = t.dataset.invf; st.shown = 60; }
    else if (t.dataset.set) { const i = t.dataset.set.indexOf(':'), k = t.dataset.set.slice(0, i), v = t.dataset.set.slice(i + 1); st[k] = v; st.shown = 60; if (k === 'tview') st.tsort = v === 'produk' ? 'qty' : 'new'; }
    else if ('more' in t.dataset) st.shown += 60;
    else { for (const k in OPEN) if (t.dataset[k]) return OPEN[k](t.dataset[k]); return; }
    draw();
  };
  view.onkeydown = (e) => { if (e.key !== 'Enter') return; const d = e.target.dataset || {}; for (const k in OPEN) if (d[k]) return OPEN[k](d[k]); };
  draw();
}

/* Ringkasan singkat untuk Beranda portal */
export async function expcHomeSummary(api) {
  const [docs, sync] = await Promise.all([api.listDocs('expc'), api.lastSync('expc')]);
  const today = iso(new Date());
  const D = prepareAll(docs, today);
  if (!D.products.length && !D.invoices.length && !D.aca.services.length) return null;
  const live = D.inv.filter(i => !i.void), unpaid = live.filter(i => i.t.status !== 'lunas'), overdue = unpaid.filter(i => i.t.overdue);
  const month = live.filter(i => (i.date || '').startsWith(today.slice(0, 7)));
  const acaOpen = D.acaInv.filter(i => !i.void && i.t.status !== 'lunas');
  return {
    syncAt: sync?.at || null,
    unpaid: unpaid.length + acaOpen.length,
    unpaidAmount: sum(unpaid, i => i.t.remaining) + sum(acaOpen, i => i.t.remaining),
    overdue: overdue.length + acaOpen.filter(i => i.t.overdue).length,
    lowStock: D.low.length,
    outOfStock: D.out.length,
    monthSales: sum(month, i => i.t.total),
    monthInvoices: month.length,
    scwOpen: D.scwinv.filter(scwOpen).length,
    scwOpenAmount: sum(D.scwinv.filter(scwOpen), v => +v.total || 0),
  };
}
