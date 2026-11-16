import { api, DEMO, LEVELS, LEVEL_LABEL, buildPerms, acceptImports } from './api.js?v=45';
import { viewWork } from './work.js?v=45';
import { viewCrm } from './crm.js?v=42';
import { viewAiOffice } from './ai-office.js?v=53';

// Satu nomor versi untuk semua file, supaya browser tidak menyimpan salinan lama.
const MV = 53;
const LAZY = {
  setoran: { view: 'viewSetoran', home: 'setoranHomeSummary', css: true },
  hrd:     { view: 'viewHrd',     home: 'hrdHomeSummary',     css: true },
  proflex: { view: 'viewProflex', home: 'proflexHomeSummary', css: true },
  expc:    { view: 'viewExpc',    home: 'expcHomeSummary',    css: false },
};

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (d) => d ? new Date(d).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const STATUS = { invited: ['Diundang', 'warn'], active: ['Aktif', 'ok'], disabled: ['Nonaktif', 'off'] };
const IMPORT_STATUS = { pending: ['Siap', 'ok'], needs_check: ['Perlu dicek', 'warn'], invited: ['Sudah dibuat', 'info'], skipped: ['Dilewati', 'off'] };
const MODULE_STATE = { work: 'Lihat saja · tersinkron', crm: 'Lihat saja · tersinkron', setoran: 'Lihat saja · tersinkron', hrd: 'Lihat saja · tersinkron',
  proflex: 'Lihat saja · tersinkron', expc: 'Lihat saja · tersinkron', docs: 'Tahap 4' };
const ICON = {
  home: '<path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  work: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16M14 9h4M14 13h4"/>',
  sa: '<path d="M8 3h6l2 2h4v16H4V5h4z"/><path d="M9 3.5h5V7H9zM8 12h8M8 16h5"/>',
  crm: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.6c1.8.8 3 2.6 3.5 5.4"/>',
  setoran: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>',
  hrd: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.4-4 4.4-6 8-6s6.6 2 8 6"/>',
  proflex: '<path d="M4 7 12 3l8 4v10l-8 4-8-4z"/><path d="m4 7 8 4 8-4M12 11v10"/>',
  expc: '<path d="M6 3h12l-1 7H7z"/><path d="M7 10v9a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-9"/>',
  docs: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  admin: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5 1.6 0 3 .5 4.1 1.4"/><circle cx="18" cy="17" r="2.5"/><path d="M18 12.5v2M18 19.5v2M13.5 17h2M20.5 17h2"/>',
  roles: '<path d="M12 3 4 6v6c0 4.4 3.4 8.3 8 9 4.6-.7 8-4.6 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  invite: '<path d="M3 6h18v12H3z"/><path d="m3 7 9 6 9-6"/>',
  audit: '<path d="M12 7v5l3 2"/><circle cx="12" cy="12" r="9"/>',
  export: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  out: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  ai: '<circle cx="7" cy="8" r="2.2"/><circle cx="17" cy="8" r="2.2"/><circle cx="12" cy="16.5" r="2.2"/><path d="M8.8 9.4 11 14.2M15.2 9.4 13 14.2"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k] || ''}</svg>`;

const S = { me: null, perms: null, ref: null, brand: 'rmoda' };

/* Empat brand. Warna aksen dipasang lewat data-brand di <html>. */
const BRANDS = [
  { id: 'rmoda', name: 'RMODA Studio', line: 'Detailing, coating, PPF, bodywork', branches: 'BSD · Legok · Makassar', logo: 'assets/logo/rmoda-mark.png', wordmark: 'assets/logo/rmoda-wordmark-onlight.png', wordmarkDark: 'assets/logo/rmoda-wordmark-ondark.png', expc: '',
    items: [
      { href: 'm/work', route: 'm/work', icon: 'work', label: 'Work Tracker', module: 'work' },
      { href: 'm/work/sa', route: 'm/work/sa', icon: 'sa', label: 'Service Advisor', module: 'work' },
      { href: 'm/crm', route: 'm/crm', icon: 'crm', label: 'CRM', module: 'crm' },
      { href: 'm/setoran', route: 'm/setoran', icon: 'setoran', label: 'Setoran', module: 'setoran' },
      { href: 'm/hrd', route: 'm/hrd', icon: 'hrd', label: 'HRD', module: 'hrd' },
    ] },
  { id: 'supplies', name: 'EXPC Supplies', line: 'Stok, invoice, dan tagihan distributor', branches: 'Gudang & penjualan', logo: 'assets/logo/expc-supplies-mark.png', wordmark: 'assets/logo/expc-supplies-wordmark-onlight.png', wordmarkDark: 'assets/logo/expc-supplies-wordmark-ondark.png', expc: 'sup',
    items: [{ href: 'm/expc', route: 'm/expc', icon: 'expc', label: 'EXPC Supplies', module: 'expc' }] },
  { id: 'academy', name: 'EXPC Academy', line: 'Kelas detailing dan invoice academy', branches: 'Kelas', logo: 'assets/logo/expc-academy-mark-onlight.png', logoDark: 'assets/logo/expc-academy-mark-ondark.png', wordmark: 'assets/logo/expc-academy-wordmark-onlight.png', wordmarkDark: 'assets/logo/expc-academy-wordmark-ondark.png', expc: 'aca',
    items: [{ href: 'm/expc', route: 'm/expc', icon: 'expc', label: 'EXPC Academy', module: 'expc' }] },
  { id: 'proflex', name: 'Proflex', line: 'Stok film PPF, invoice, dan pelanggan', branches: 'Film & grafik', logo: 'assets/logo/proflex-mark-onlight.png', logoDark: 'assets/logo/proflex-mark-ondark.png', wordmark: 'assets/logo/proflex-wordmark-onlight.png', wordmarkDark: 'assets/logo/proflex-wordmark-ondark.png', expc: '',
    items: [{ href: 'm/proflex', route: 'm/proflex', icon: 'proflex', label: 'Proflex', module: 'proflex' }] },
];
const brandById = (id) => BRANDS.find(b => b.id === id) || BRANDS[0];
const currentBrand = () => brandById(S.brand);
function themeIsDark(force) {
  return force ? force === 'dark' : document.documentElement.dataset.theme !== 'light';
}
function brandLogo(b, force) {
  return themeIsDark(force) && b.logoDark ? b.logoDark : b.logo;
}
function brandWord(b, force) {
  return (themeIsDark(force) && b.wordmarkDark) || b.wordmark || brandLogo(b, force);
}
function paintLogos() {
  $$('[data-logo-for]').forEach(img => { img.src = brandLogo(brandById(img.dataset.logoFor)); });
  $$('[data-word-for]').forEach(img => { img.src = brandWord(brandById(img.dataset.wordFor)); });
}
const KBD = /Mac|iPhone|iPad/.test(navigator.platform || '') || /Mac/.test(navigator.userAgent) ? '⌘K' : 'Ctrl K';

function loadTheme() {
  let saved = null;
  try { saved = localStorage.getItem('portal-theme'); } catch (e) {}
  const mobile = matchMedia('(max-width: 860px)').matches;
  applyTheme(saved || (mobile ? 'system' : 'dark'), { persist: !!saved });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (document.documentElement.dataset.themeMode === 'system') applyTheme('system', { persist: false });
  });
}
function applyTheme(mode, { persist } = { persist: true }) {
  const systemDark = matchMedia('(prefers-color-scheme: dark)').matches;
  const resolved = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themeMode = mode;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = resolved === 'light' ? '#f6f5f2' : '#0c0d10';
  if (persist) try { localStorage.setItem('portal-theme', mode); } catch (e) {}
  paintThemeBtn();
  try { paintLogos(); } catch (e) {}
}
const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z"/></svg>';
function paintThemeBtn() {
  const b = $('#themeBtn'); if (!b) return;
  const dark = document.documentElement.dataset.theme !== 'light';
  b.innerHTML = dark ? SUN : MOON;
  b.title = dark ? 'Tema terang' : 'Tema gelap';
  b.setAttribute('aria-label', b.title);
}
function loadBrand() {
  try { S.brand = brandById(localStorage.getItem('portal-brand')).id; } catch (e) { S.brand = 'rmoda'; }
  document.documentElement.dataset.brand = S.brand;
  rememberExpc(currentBrand());
}
function rememberExpc(brand) {
  if (!brand.expc) return;
  try { sessionStorage.setItem('portal-expc-biz', brand.expc); } catch (e) {}
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */
async function boot() {
  loadTheme();
  loadBrand();
  const root = $('#root');
  try {
    const session = await api.session();
    if (!session) return renderLogin();
    const me = await api.claim();
    if (!me) return renderNoAccess(session.user?.email);
    S.me = me;
    S.ref = await api.ref();
    S.perms = buildPerms(me, await api.myRoles(me.id), S.ref.roles);
    try { S.flags = await api.portalFlags(); } catch { S.flags = { read_only: false }; }
    renderShell();
    addEventListener('hashchange', route);
    route();
  } catch (e) {
    root.innerHTML = `<div class="center"><div class="card narrow"><h1>Portal tidak bisa dibuka</h1><p class="muted">${esc(e.message)}</p>
      <button class="btn" onclick="location.reload()">Coba lagi</button></div></div>`;
  }
}

function demoBanner() {
  return DEMO ? `<div class="demo">Mode demo. Angka di layar ini contoh, hanya tersimpan di browser ini.</div>` : '';
}

function renderLogin() {
  const marks = BRANDS.map(b => `<li><img src="${brandWord(b, 'dark')}" alt="${esc(b.name)}"></li>`).join('');
  $('#root').innerHTML = `${demoBanner()}
  <div class="center login">
    <div class="login__photo" aria-hidden="true"><p>RMODA Studio · BSD · Legok · Makassar</p></div>
    <div class="login__panel">
      <img class="login__logo" src="assets/logo/rmoda-wordmark-ondark.png" alt="RMODA Studio">
      <p class="login__kicker">Portal internal</p>
      <h1>Masuk untuk tim bengkel</h1>
      <p class="muted">Portal internal untuk staf. Tidak ada pendaftaran sendiri. Masuk dengan akun Google yang sudah diundang.</p>
      <button class="btn btn--google" id="google"><svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z"/></svg>Masuk dengan Google</button>
      <p class="tiny muted">Belum bisa masuk? Minta owner menambahkan email kamu di menu Tim &amp; Peran.</p>
      <ul class="login__brands">${marks}</ul>
    </div>
  </div>`;
  $('#google').onclick = () => api.signIn();
}

function renderNoAccess(email) {
  $('#root').innerHTML = `<div class="center"><div class="card narrow">
    <h1>Akses belum diberikan</h1>
    <p class="muted">Email <b>${esc(email || '')}</b> belum terdaftar atau sudah dinonaktifkan. Hubungi owner untuk diundang ke portal.</p>
    <button class="btn" id="out">Keluar dan pakai akun lain</button></div></div>`;
  $('#out').onclick = async () => { await api.signOut(); location.reload(); };
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */
function navLink(href, ic, label) {
  return `<a class="nav__a" href="#/${href}" data-route="${href}">${icon(ic)}<span>${label}</span></a>`;
}
function brandNavHtml() {
  const p = S.perms;
  const b = currentBrand();
  const items = b.items.filter(it => p.can(it.module));
  const adminView = p.can('admin', null, 'view');
  return `${navLink('beranda', 'home', 'Beranda')}
    <p class="nav__h">Tools admin</p>
    <p class="nav__sub">${esc(b.name)}</p>
    ${items.map(it => navLink(it.href, it.icon, it.label)).join('') || '<p class="nav__empty">Belum ada modul</p>'}
    ${adminView ? `<p class="nav__h">Kelola</p>
      ${navLink('tim', 'admin', 'Tim &amp; Peran')}
      ${navLink('peran', 'roles', 'Daftar Peran')}
      ${navLink('undangan', 'invite', 'Undangan &amp; Impor')}
      ${p.owner ? navLink('aktivitas', 'audit', 'Aktivitas') + navLink('export', 'export', 'Export data') : ''}` : ''}
    <p class="nav__h nav__space">Kantor AI</p>
    ${navLink('ai-office', 'ai', 'Kantor AI')}`;
}
function paintBrandBtn() {
  const b = currentBrand();
  const img = $('#brandLogo');
  if (!img) return;
  img.src = brandLogo(b);
  img.alt = b.name;
  $('#brandName').textContent = b.name;
  $('#brandLine').textContent = b.branches;
  const k = $('#kicker'); if (k && !$('#title').textContent) k.textContent = b.name;
  $$('.brandsw__opt').forEach(el => el.setAttribute('aria-selected', el.dataset.brand === b.id ? 'true' : 'false'));
}
function closeBrandPop() {
  const pop = $('#brandPop'), btn = $('#brandBtn');
  if (pop) pop.hidden = true;
  if (btn) btn.setAttribute('aria-expanded', 'false');
}
function setBrand(id) {
  const b = brandById(id);
  S.brand = b.id;
  try { localStorage.setItem('portal-brand', b.id); } catch (e) {}
  document.documentElement.dataset.brand = b.id;
  rememberExpc(b);
  paintBrandBtn();
  const nav = $('#nav'); if (nav) nav.innerHTML = brandNavHtml();
  closeBrandPop();
  syncNav();
}
function routeKey() { return location.hash.replace(/^#\/?/, '') || 'beranda'; }
function syncNav() {
  const h = routeKey();
  $$('.nav__a').forEach(a => {
    const r = a.dataset.route || '';
    let on = false;
    if (r === 'm/work/sa') on = h === 'm/work/sa';
    else if (r === 'm/work') on = h === 'm/work';
    else if (r === 'beranda') on = h === 'beranda';
    else on = h === r || h.startsWith(r + '/');
    a.classList.toggle('on', on);
  });
  $$('[data-dock]').forEach(a => a.classList.toggle('on', h === a.dataset.dock || (a.dataset.dock === 'm/work' && h.startsWith('m/work'))));
}
function closeSide() {
  $('#side')?.classList.remove('open');
  const scrim = $('#scrim'); if (scrim) scrim.hidden = true;
}

function paletteEntries() {
  const p = S.perms;
  const rows = [{ group: 'Umum', label: 'Beranda', hint: 'Ringkasan', href: '#/beranda', brand: S.brand, key: 'beranda home ringkasan' }];
  for (const b of BRANDS) {
    for (const it of b.items) {
      if (!p.can(it.module)) continue;
      rows.push({ group: b.name, label: it.label, hint: b.name, href: '#/' + it.href, brand: b.id, key: (b.name + ' ' + it.label + ' ' + b.line).toLowerCase() });
    }
  }
  [
    ['', 'Beranda Kantor AI', 'ringkasan'],
    ['alur', 'Alur konten', 'papan ide produksi'],
    ['kalender', 'Kalender', 'minggu iklan'],
    ['setuju', 'Perlu persetujuan', 'approval pak'],
  ].forEach(([sub, label, extra]) => rows.push({
    group: 'Kantor AI', label, hint: 'Kantor AI', href: '#/ai-office' + (sub ? '/' + sub : ''),
    key: ('kantor ai ' + label + ' ' + extra + ' expi rmo academy supplies makassar').toLowerCase(),
  }));
  if (p.can('admin', null, 'view')) {
    rows.push({ group: 'Kelola', label: 'Tim & Peran', hint: 'Pengguna', href: '#/tim', brand: S.brand, key: 'tim peran pengguna' });
    rows.push({ group: 'Kelola', label: 'Daftar Peran', hint: 'Izin', href: '#/peran', brand: S.brand, key: 'peran izin' });
    rows.push({ group: 'Kelola', label: 'Undangan & Impor', hint: 'Orang baru', href: '#/undangan', brand: S.brand, key: 'undangan impor' });
    if (p.owner) {
      rows.push({ group: 'Kelola', label: 'Aktivitas', hint: 'Riwayat', href: '#/aktivitas', brand: S.brand, key: 'aktivitas audit' });
      rows.push({ group: 'Kelola', label: 'Export data', hint: 'Unduh', href: '#/export', brand: S.brand, key: 'export unduh' });
    }
  }
  return rows;
}
let palIdx = 0;
function openPalette() {
  const box = $('#palette'); if (!box) return;
  box.hidden = false;
  const q = $('#palQ'); q.value = ''; palIdx = 0; drawPalette();
  setTimeout(() => q.focus(), 20);
}
function closePalette() { const box = $('#palette'); if (box) box.hidden = true; }
function drawPalette() {
  const q = ($('#palQ')?.value || '').trim().toLowerCase();
  const rows = paletteEntries().filter(r => !q || r.key.includes(q) || r.label.toLowerCase().includes(q));
  if (palIdx >= rows.length) palIdx = 0;
  const list = $('#palList'); if (!list) return;
  if (!rows.length) { list.innerHTML = '<p class="palette__empty">Tidak ada yang cocok.</p>'; return; }
  let html = '', group = '';
  rows.forEach((r, i) => {
    if (r.group !== group) { group = r.group; html += `<div class="palette__g">${esc(group)}</div>`; }
    html += `<button type="button" class="palette__item${i === palIdx ? ' is-on' : ''}" data-i="${i}"><span>${esc(r.label)}</span><small>${esc(r.hint)}</small></button>`;
  });
  list.innerHTML = html;
  list._rows = rows;
  list.querySelector('.is-on')?.scrollIntoView({ block: 'nearest' });
}
function runPalette(row) {
  if (!row) return;
  closePalette();
  if (row.brand && row.brand !== S.brand) setBrand(row.brand);
  if (location.hash !== row.href) location.hash = row.href;
  else route();
}

function renderShell() {
  const b = currentBrand();
  const opts = BRANDS.map(x => `<button type="button" class="brandsw__opt" role="option" data-brand="${x.id}" aria-selected="${x.id === b.id}">
      <img class="brandsw__word" src="${brandWord(x)}" data-word-for="${x.id}" alt="${esc(x.name)}">
      <small>${esc(x.line)}</small>
      <i class="brandsw__mark"></i></button>`).join('');
  const maint = S.flags?.read_only ? `<div class="maint">Portal sedang dipelihara: data hanya bisa dilihat, tidak bisa diubah. Tidak ada data yang dihapus.${S.perms.owner ? ' <button class="btn btn--s" id="maintOff" type="button">Matikan mode pemeliharaan</button>' : ''}</div>` : '';
  $('#root').innerHTML = `${demoBanner()}${maint}
  <div class="shell">
    <aside class="side" id="side">
      <div class="brandsw">
        <button type="button" class="brandsw__btn" id="brandBtn" aria-haspopup="listbox" aria-expanded="false" aria-label="Pilih brand">
          <img class="brandsw__logo" id="brandLogo" data-logo-for="${b.id}" src="${brandLogo(b)}" alt="${esc(b.name)}">
          <span class="brandsw__meta"><b id="brandName">${esc(b.name)}</b><small id="brandLine">${esc(b.branches)}</small></span>
          <svg class="brandsw__chev" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        </button>
        <div class="brandsw__pop" id="brandPop" hidden role="listbox">${opts}</div>
      </div>
      <nav class="nav" id="nav">${brandNavHtml()}</nav>
      <div class="side__me">
        <div class="avatar">${esc(S.me.name[0] || '?')}</div>
        <div class="side__who"><b>${esc(S.me.name)}</b><small>${esc(S.me.email)}</small></div>
        <button class="iconbtn" id="logout" title="Keluar" aria-label="Keluar">${icon('out')}</button>
      </div>
    </aside>
    <div class="main">
      <header class="top">
        <button class="iconbtn only-m" id="menu" aria-label="Menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
        <div class="top__title"><p class="top__kicker" id="kicker">${esc(b.name)}</p><h1 id="title"></h1></div>
        <button class="cmdk" id="cmdOpen" type="button" aria-label="Cari atau lompat"><svg class="cmdk__ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m20 20-3.5-3.5"/></svg><span>Cari atau lompat</span><kbd>${KBD}</kbd></button>
        <button class="iconbtn" id="themeBtn" type="button"></button>
        <div id="actions"></div>
      </header>
      <main class="content" id="view"></main>
    </div>
  </div>
  <nav class="dock" aria-label="Navigasi singkat">
    <a href="#/beranda" data-dock="beranda">Beranda</a>
    <a href="#/m/work" data-dock="m/work">Kerja</a>
    <button type="button" id="dockSearch">Cari</button>
    <button type="button" id="dockMenu">Menu</button>
  </nav>
  <div class="scrim" id="scrim" hidden></div>
  <div class="palette" id="palette" hidden>
    <div class="palette__panel" role="dialog" aria-modal="true" aria-label="Pencarian">
      <input class="palette__q" id="palQ" placeholder="Cari modul, brand, atau halaman" aria-label="Cari" autocomplete="off">
      <div class="palette__list" id="palList"></div>
      <div class="palette__foot"><span><kbd>↑</kbd><kbd>↓</kbd> pilih</span><span><kbd>Enter</kbd> buka</span><span><kbd>Esc</kbd> tutup</span></div>
    </div>
  </div>
  <dialog id="dlg"></dialog><div class="toast" id="toast" role="status"></div>`;
  $('#logout').onclick = async () => { await api.signOut(); location.hash = ''; location.reload(); };
  const maintOff = $('#maintOff');
  if (maintOff) maintOff.onclick = guard(() => setMaint(false));
  $('#menu').onclick = () => { $('#side').classList.toggle('open'); $('#scrim').hidden = !$('#side').classList.contains('open'); };
  $('#scrim').onclick = closeSide;
  $('#cmdOpen').onclick = openPalette;
  $('#dockSearch').onclick = openPalette;
  $('#dockMenu').onclick = () => { $('#side').classList.add('open'); $('#scrim').hidden = false; };
  $('#themeBtn').onclick = () => applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  paintThemeBtn();
  $('#brandBtn').onclick = () => {
    const pop = $('#brandPop'), open = pop.hidden;
    pop.hidden = !open;
    $('#brandBtn').setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  $('#brandPop').onclick = (e) => {
    const opt = e.target.closest('[data-brand]'); if (!opt) return;
    setBrand(opt.dataset.brand);
    if (location.hash !== '#/beranda') location.hash = '#/beranda';
    else route();
  };
  $('#palQ').oninput = () => { palIdx = 0; drawPalette(); };
  $('#palList').onclick = (e) => { const b = e.target.closest('[data-i]'); if (!b) return; runPalette($('#palList')._rows[+b.dataset.i]); };
  $('#palette').onclick = (e) => { if (e.target.id === 'palette') closePalette(); };
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.brandsw')) closeBrandPop();
  });
  document.addEventListener('keydown', (e) => {
    const typing = e.target.closest('input, textarea, select') && e.target.id !== 'palQ';
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#palette')?.hidden ? openPalette() : closePalette(); return; }
    if (e.key === 'Escape') {
      closePalette(); closeBrandPop(); closeSide();
      document.dispatchEvent(new CustomEvent('portal:key', { cancelable: true, detail: 'esc' }));
      return;
    }
    const box = $('#palette');
    if (box && !box.hidden) {
      const rows = $('#palList')?._rows || [];
      if (e.key === 'ArrowDown') { e.preventDefault(); palIdx = Math.min(rows.length - 1, palIdx + 1); drawPalette(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); palIdx = Math.max(0, palIdx - 1); drawPalette(); }
      else if (e.key === 'Enter') { e.preventDefault(); runPalette(rows[palIdx]); }
      return;
    }
    if (typing) return;
    const k = e.key.toLowerCase();
    if (k === 'j' || k === 'k' || k === 'enter' || k === 'c' || k === '[' || k === ']') {
      const ev = new CustomEvent('portal:key', { cancelable: true, detail: k });
      document.dispatchEvent(ev);
      if (ev.defaultPrevented) e.preventDefault();
    }
  });
  document.addEventListener('portal:nav', syncNav);
  syncNav();
}

function setHead(title, actions = '') {
  const t = $('#title'); if (t) t.textContent = title;
  const a = $('#actions'); if (a) a.innerHTML = actions;
  const k = $('#kicker'); if (k) k.textContent = currentBrand().name;
  document.title = title + ' · ' + currentBrand().name;
}
function toast(msg, bad, extra) {
  const t = $('#toast'); if (!t) return;
  const undo = extra && extra.undo;
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button" class="toast__undo">Urungkan</button>' : ''}`;
  t.className = 'toast show' + (bad ? ' bad' : '');
  clearTimeout(t._t);
  const btn = t.querySelector('.toast__undo');
  if (btn) btn.onclick = () => { clearTimeout(t._t); t.className = 'toast'; undo(); };
  t._t = setTimeout(() => { t.className = 'toast'; }, undo ? 5200 : 3200);
}
const guard = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, true); } };

async function setMaint(on) {
  const msg = on
    ? 'Nyalakan mode pemeliharaan? Staf hanya bisa melihat. Data tidak dihapus. Salinan dari Claude tetap jalan.'
    : 'Matikan mode pemeliharaan? Staf bisa mengubah data lagi.';
  if (!confirm(msg)) return;
  await api.setReadOnly(on, on ? 'pemeliharaan' : null);
  S.flags = await api.portalFlags();
  toast(on ? 'Portal sekarang hanya bisa dilihat.' : 'Portal bisa diubah lagi.');
  renderShell();
  route();
}

function route() {
  const dlg = document.getElementById('dlg');
  if (dlg?.open) dlg.close();
  const h = routeKey();
  syncNav();
  closeSide();
  closeBrandPop();
  const [page, arg] = h.split('/');
  const views = { beranda: viewHome, m: viewModule, tim: viewMembers, peran: viewRoles, undangan: viewImports, aktivitas: viewAudit, export: viewExport, 'ai-office': (sub) => viewAiOffice({ $, esc, setHead }, sub) };
  const view = $('#view');
  if (view) view.classList.remove('is-in');
  (views[page] || viewHome)(arg);
  if (view) requestAnimationFrame(() => view.classList.add('is-in'));
}

/* ------------------------------------------------------------------ */
/* Beranda & modul                                                      */
/* ------------------------------------------------------------------ */
/* Katalog aplikasi di Beranda: bahasa sehari-hari, warna per aplikasi */
const APPS = {
  work:    { desc: 'Posisi mobil di bengkel, papan kerja per divisi, dan revisi.', color: '#d5001c', ready: true },
  crm:     { desc: 'Reminder maintenance, e-certificate, dan data customer.', color: '#2563eb', ready: true },
  setoran: { desc: 'Setoran foto, invoice, konfirmasi, dan stok bahan per cabang.', color: '#15803d', ready: true },
  hrd:     { desc: 'Rekrutmen, karyawan, absensi, KPI, gaji, uang makan, kasbon, BPJS & THR.', color: '#7c3aed', ready: true },
  proflex: { desc: 'Stok film PPF, invoice, pelanggan, dan barang masuk.', color: '#ea580c', ready: true },
  expc:    { desc: 'Stok & invoice Supplies, tagihan distributor, dan Academy.', color: '#0d9488', ready: true },
  docs:    { desc: 'Dokumen dan arsip perusahaan.', color: '#475569' },
};
const rp = (n) => 'Rp' + Math.round(Number(n) || 0).toLocaleString('id-ID');
// Isi kartu Beranda per aplikasi: [angka, label, merah?]
const HOME_STATS = {
  expc: (s) => [[s.unpaid, 'invoice belum lunas'], s.overdue ? [s.overdue, 'lewat tempo', true] : null,
    s.lowStock || s.outOfStock ? [(s.lowStock || 0) + (s.outOfStock || 0), 'stok menipis/habis'] : null].filter(Boolean),
  proflex: (s) => [[s.unpaid, 'invoice belum lunas'], s.overdue ? [s.overdue, 'lewat tempo', true] : null,
    s.lowStock ? [s.lowStock, 'stok di bawah minimum', !!s.outOfStock] : null].filter(Boolean),
  setoran: (s) => [s.baru ? [s.baru, 'setoran baru'] : null, s.konf ? [s.konf, 'konfirmasi menunggu'] : null,
    s.invoiceLate ? [s.invoiceLate, 'invoice lewat tempo', true] : [s.invoice, 'invoice belum lunas']].filter(Boolean),
  hrd: (s) => [[s.active, 'karyawan aktif'], s.openRequests ? [s.openRequests, 'posisi dicari', true] : null,
    s.kasbon != null ? [rp(s.kasbon), 'kasbon berjalan'] : (s.training ? [s.training, 'training'] : null)].filter(Boolean),
};
const greet = () => { const h = new Date().getHours(); return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam'; };
const ago = (iso) => { if (!iso) return ''; const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? 'baru saja' : m < 60 ? `${m} menit lalu` : m < 1440 ? `${Math.round(m / 60)} jam lalu` : fmt(iso); };

async function viewHome() {
  setHead('Beranda');
  const p = S.perms;
  const brand = currentBrand();
  const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const actions = brand.items.filter(it => it.href !== 'm/work/sa' && p.can(it.module));
  const skel = '<div class="today__n"><span class="skel"></span><small>memuat</small></div>';
  $('#view').innerHTML = `
    <header class="brandhead">
      <img class="brandhead__word" data-word-for="${brand.id}" src="${brandWord(brand)}" alt="${esc(brand.name)}">
      <div>
        <p class="brandhead__kicker">${esc(brand.name)}</p>
        <h2>${greet()}, ${esc(S.me.name.split(' ')[0])}</h2>
        <p class="muted">${esc(brand.line)}. ${esc(today)}.</p>
      </div>
    </header>
    <section class="today" id="today" aria-label="Hari ini">${skel}${skel}${skel}${skel}</section>
    <div class="home-grid">
      <section>
        <h3 class="home-h">Perlu perhatian <span class="muted only-keys">J dan K untuk memilih</span></h3>
        <div class="issuelist" id="attnList"><div class="irow irow--skel"><span class="skel"></span></div><div class="irow irow--skel"><span class="skel"></span></div><div class="irow irow--skel"><span class="skel"></span></div></div>
      </section>
      <aside class="home-side">
        <h3 class="home-h">Gerakan terakhir</h3>
        <ol class="feed" id="feed"><li><span class="skel"></span></li><li><span class="skel"></span></li><li><span class="skel"></span></li></ol>
        <h3 class="home-h">Langkah cepat</h3>
        <div class="quick">
          ${actions.map(it => `<a href="#/${it.href}">${icon(it.icon)}<span><b>${esc(it.label)}</b><small>Buka modul</small></span></a>`).join('')}
          <a href="#/ai-office">${icon('ai')}<span><b>Kantor AI</b><small>Pantau dan setujui</small></span></a>
          ${brand.id === 'rmoda' && p.can('work') ? `<button type="button" id="homeNew">${icon('work')}<span><b>Mobil baru</b><small>Catat di papan, tombol C</small></span></button>` : ''}
          <button type="button" id="homeSearch">${icon('docs')}<span><b>Cari modul</b><small>${KBD}</small></span></button>
          ${brand.id === 'rmoda' && p.can('admin', null, 'view') ? `<a href="#/tim">${icon('admin')}<span><b>Tim</b><small id="qMembers">Pengguna</small></span></a>` : ''}
        </div>
      </aside>
    </div>`;
  $('#homeSearch')?.addEventListener('click', openPalette);
  $('#homeNew')?.addEventListener('click', () => { try { sessionStorage.setItem('portal-open-new', '1'); } catch (e) {} location.hash = '#/m/work'; });
  $('#attnList').onclick = (e) => {
    const row = e.target.closest('[data-go]'); if (!row) return;
    if (row.dataset.job) { try { sessionStorage.setItem('portal-open-job', row.dataset.job); } catch (err) {} }
    if (location.hash === row.dataset.go) route(); else location.hash = row.dataset.go;
  };
  fillHome(brand, p);
}

function homeSelect(delta) {
  const list = $('#attnList'); if (!list || !list.isConnected) return false;
  const rows = [...list.querySelectorAll('.irow[data-go]')]; if (!rows.length) return false;
  let i = rows.findIndex(r => r.classList.contains('is-on'));
  i = Math.max(0, Math.min(rows.length - 1, (i < 0 ? 0 : i) + delta));
  rows.forEach((r, n) => r.classList.toggle('is-on', n === i));
  rows[i].scrollIntoView({ block: 'nearest' });
  return true;
}
if (!window.__homeKeys) {
  window.__homeKeys = true;
  document.addEventListener('portal:key', (e) => {
    const list = document.querySelector('#attnList');
    if (!list || !list.isConnected) return;
    if (e.detail === 'j' && homeSelect(1)) e.preventDefault();
    else if (e.detail === 'k' && homeSelect(-1)) e.preventDefault();
    else if (e.detail === 'enter') {
      const row = list.querySelector('.irow.is-on');
      if (row) { e.preventDefault(); row.click(); }
    }
  });
}

function fillToday(nums) {
  const el = $('#today'); if (!el) return;
  el.innerHTML = nums.map(([n, label, tone]) => `<div class="today__n ${tone || ''}"><b>${esc(String(n))}</b><small>${esc(label)}</small></div>`).join('');
}
function fillAttn(rows) {
  const el = $('#attnList'); if (!el) return;
  if (!rows.length) { el.innerHTML = '<div class="empty empty--slim"><p class="muted">Tidak ada yang mendesak hari ini.</p></div>'; return; }
  el.innerHTML = rows.map((r, i) => `<button type="button" class="irow${i === 0 ? ' is-on' : ''}" data-go="${esc(r.go || '#/m/work')}" data-job="${esc(r.job || '')}">
      <span class="dot ${r.tone || 'warn'}"></span>
      <span class="irow__main"><b>${esc(r.title)}</b><small>${esc(r.sub || '')}</small></span>
      <span class="irow__meta">${esc(r.meta || '')}</span>
    </button>`).join('');
}
function fillFeed(rows) {
  const el = $('#feed'); if (!el) return;
  if (!rows.length) { el.innerHTML = '<li class="muted">Belum ada gerakan tercatat.</li>'; return; }
  el.innerHTML = rows.map(r => `<li><b>${esc(r.title)}</b><small>${esc(r.meta || '')}${r.at ? ' · ' + esc(ago(r.at)) : ''}</small></li>`).join('');
}
async function fillHome(brand, p) {
  if (brand.id === 'rmoda' && p.can('work')) {
    try {
      const { workHomeSummary, workFeed } = await import('./work.js?v=41');
      const [w, feed] = await Promise.all([workHomeSummary(api), workFeed(api)]);
      if (!$('#today')) return;
      if (!w) { fillToday([[0, 'mobil dikerjakan', ''], [0, 'lewat target', ''], [0, 'siap diambil', ''], [0, 'revisi', '']]); fillAttn([]); }
      else {
        fillToday([
          [w.active, 'sedang dikerjakan', ''],
          [w.late.length, 'lewat target', w.late.length ? 'is-bad' : ''],
          [w.ready, 'siap diambil', ''],
          [w.openRevs, 'revisi belum OK', w.openRevs ? 'is-warn' : ''],
        ]);
        const rows = [
          ...w.late.slice(0, 5).map(j => ({ title: j.plate || 'Mobil', sub: j.car || '', meta: `${j.loc} · lewat target ${j.target}`, tone: 'bad', job: j.id, go: '#/m/work' })),
        ];
        if (w.noTarget) rows.push({ title: `${w.noTarget} mobil`, sub: 'Belum punya target selesai', meta: 'Kepala Bengkel', tone: 'warn', go: '#/m/work' });
        if (w.openRevs) rows.push({ title: `${w.openRevs} revisi`, sub: 'Belum dinyatakan OK', meta: 'Work Tracker', tone: 'warn', go: '#/m/work' });
        fillAttn(rows);
      }
      fillFeed(feed || []);
    } catch (e) { fillToday([['—', 'Work Tracker', '']]); fillAttn([]); fillFeed([]); }
  } else {
    const main = brand.items.find(it => p.can(it.module));
    if (!main) { fillToday([['—', 'Belum ada akses', '']]); fillAttn([]); fillFeed([]); return; }
    const id = main.module;
    try {
      const mod = await import(`./${id}.js?v=${MV}`);
      const sum = await mod[LAZY[id]?.home]?.(api);
      const chips = sum ? (HOME_STATS[id]?.(sum) || []).slice(0, 4) : [];
      fillToday(chips.length ? chips.map(([n, label, bad]) => [n, label, bad ? 'is-bad' : '']) : [[sum ? 'Ada' : '0', 'data ' + brand.name, '']]);
      fillAttn((chips.length ? chips : []).map(([n, label, bad]) => ({ title: String(n) + ' ' + label, sub: brand.name, meta: 'Buka modul', tone: bad ? 'bad' : 'warn', go: '#/' + main.href })));
      fillFeed([{ title: 'Ringkasan ' + brand.name, meta: chips.map(([n, label]) => n + ' ' + label).join(', ') }]);
    } catch (e) { fillToday([['—', brand.name, '']]); fillAttn([]); fillFeed([]); }
  }
  if (p.can('admin', null, 'view')) {
    api.listMembers().then(ms => { const el = $('#qMembers'); if (el) el.textContent = `${ms.filter(m => m.status !== 'disabled').length} pengguna`; }).catch(() => {});
  }
}

function viewModule(id) {
  const m = S.ref.modules.find(x => x.id === id);
  if (!m || !S.perms.can(id)) return viewHome();
  if (id === 'work') return guard(viewWork)({ $, esc, api, setHead, perms: S.perms, toast, mv: MV, me: S.me, ref: S.ref });
  if (id === 'crm') return guard(viewCrm)({ $, esc, api, setHead, perms: S.perms, toast });
  const lazy = LAZY[id];
  if (lazy) {
    setHead(m.name); $('#view').innerHTML = `<div class="empty"><p class="muted">Memuat ${esc(m.name)}…</p></div>`;
    if (lazy.css && !document.querySelector(`link[data-mod="${id}"]`)) document.head.insertAdjacentHTML('beforeend', `<link rel="stylesheet" data-mod="${id}" href="css/${id}.css?v=${MV}">`);
    return import(`./${id}.js?v=${MV}`).then(mod => guard(mod[lazy.view])({ $, esc, api, setHead, perms: S.perms, toast }))
      .catch(e => { $('#view').innerHTML = `<div class="empty"><h2>${esc(m.name)} belum bisa dibuka</h2><p class="muted">${esc(e.message)}</p></div>`; });
  }
  setHead(m.name);
  $('#view').innerHTML = `<div class="empty">${icon(id)}<h2>${esc(m.name)}</h2>
    <p class="muted">${m.source ? `Data dari aplikasi <b>${esc(m.source)}</b> di Claude akan disinkronkan ke sini di Tahap 2. Sampai saat itu, tetap bekerja di aplikasi yang sekarang.` : 'Bagian ini menyusul di Tahap 4.'}</p>
    <span class="badge warn">${MODULE_STATE[id] || ''}</span></div>`;
}

/* ------------------------------------------------------------------ */
/* Tim & Peran                                                         */
/* ------------------------------------------------------------------ */
const unitName = (id) => S.ref.units.find(u => u.id === id)?.name || id;
const roleName = (id) => roleLabel(S.ref.roles.find(r => r.id === id)?.name) || '—';

async function viewMembers() {
  const canEdit = S.perms.can('admin', null, 'edit');
  setHead('Tim & Peran', canEdit ? `<button class="btn btn--primary" id="add">+ Pengguna baru</button>` : '');
  const members = await api.listMembers();
  const st = { q: '', status: '', unit: '' };
  $('#view').innerHTML = `
    <div class="toolbar">
      <input class="inp" id="q" placeholder="Cari nama atau email" aria-label="Cari">
      <select class="inp" id="fs" aria-label="Status"><option value="">Semua status</option><option value="active">Aktif</option><option value="invited">Diundang</option><option value="disabled">Nonaktif</option></select>
      <select class="inp" id="fu" aria-label="Unit"><option value="">Semua unit</option>${S.ref.units.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select>
      ${canEdit ? `<button class="btn" id="invAll">Kirim undangan ke semua yang belum</button>` : ''}
    </div>
    <div class="stats" id="stats"></div>
    <div class="tablewrap"><table class="tbl"><thead><tr><th>Nama</th><th>Unit &amp; peran</th><th>Status</th><th>Terakhir diundang</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>`;
  const draw = () => {
    const list = members.filter(m => (!st.q || (m.name + ' ' + m.email).toLowerCase().includes(st.q)) && (!st.status || m.status === st.status) && (!st.unit || m.assignments.some(a => a.unit_id === st.unit)));
    const c = (s) => members.filter(m => m.status === s).length;
    $('#stats').innerHTML = `<span><b>${members.length}</b> pengguna</span><span><b>${c('active')}</b> aktif</span><span><b>${c('invited')}</b> menunggu login</span><span><b>${c('disabled')}</b> nonaktif</span>`;
    $('#rows').innerHTML = list.map(m => `<tr>
      <td><b>${esc(m.name)}</b>${m.is_owner ? ' <span class="badge info">Owner</span>' : ''}<br><small class="muted">${esc(m.email)}</small></td>
      <td>${m.assignments.map(a => `<span class="chip">${esc(unitName(a.unit_id))} · ${esc(roleName(a.role_id))}</span>`).join(' ') || '<span class="muted">—</span>'}</td>
      <td><span class="badge ${STATUS[m.status][1]}">${STATUS[m.status][0]}</span>${m.replaced_by ? '<br><small class="muted">digantikan</small>' : ''}</td>
      <td><small>${fmt(m.invited_at)}</small></td>
      <td class="acts">${canEdit && !(m.is_owner && !S.perms.owner) ? `
        <button class="btn btn--s" data-a="edit" data-id="${m.id}">Ubah</button>
        ${m.status !== 'disabled' ? `<button class="btn btn--s" data-a="invite" data-id="${m.id}">${m.status === 'active' ? 'Kirim ulang' : 'Kirim undangan'}</button>` : ''}
        ${m.status !== 'disabled' && m.id !== S.me.id && !m.is_owner ? `<button class="btn btn--s" data-a="replace" data-id="${m.id}">Ganti orang</button>` : ''}
        ${m.status !== 'disabled' && m.id !== S.me.id ? `<button class="btn btn--s btn--danger" data-a="off" data-id="${m.id}">Nonaktifkan</button>` : ''}
        ${m.status === 'disabled' ? `<button class="btn btn--s" data-a="on" data-id="${m.id}">Aktifkan lagi</button>` : ''}` : ''}</td></tr>`).join('')
      || `<tr><td colspan="5" class="muted">Tidak ada pengguna yang cocok.</td></tr>`;
  };
  draw();
  $('#q').oninput = (e) => { st.q = e.target.value.toLowerCase(); draw(); };
  $('#fs').onchange = (e) => { st.status = e.target.value; draw(); };
  $('#fu').onchange = (e) => { st.unit = e.target.value; draw(); };
  if (!canEdit) return;
  $('#add').onclick = () => memberDialog();
  $('#invAll').onclick = guard(async () => {
    const ids = members.filter(m => m.status === 'invited').map(m => m.id);
    if (!ids.length) return toast('Semua pengguna sudah aktif.');
    if (!confirm(`Kirim email undangan ke ${ids.length} pengguna yang belum login?`)) return;
    const res = await api.invite(ids); toast(`${res.filter(r => r.ok).length} undangan terkirim.`); viewMembers();
  });
  $('#rows').onclick = guard(async (e) => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const m = members.find(x => x.id === b.dataset.id);
    if (b.dataset.a === 'edit') return memberDialog(m);
    if (b.dataset.a === 'replace') return replaceDialog(m);
    if (b.dataset.a === 'invite') { const [r] = await api.invite([m.id]); toast(r.ok ? `Undangan terkirim ke ${m.email}.` + (r.reason ? ` (${r.reason})` : '') : `Gagal: ${r.reason}`, !r.ok); return viewMembers(); }
    if (b.dataset.a === 'off') {
      const extra = m.is_owner ? ' Ini akun owner. Pastikan masih ada owner lain yang aktif.' : '';
      if (!confirm(`Nonaktifkan ${m.name}? Dia tidak bisa masuk portal lagi. Data dan riwayatnya tetap tersimpan.${extra}`)) return;
      await api.setStatus(m.id, 'disabled'); toast(`${m.name} dinonaktifkan.`); return viewMembers();
    }
    if (b.dataset.a === 'on') { await api.setStatus(m.id, m.activated_at ? 'active' : 'invited'); toast(`${m.name} diaktifkan lagi.`); return viewMembers(); }
  });
}

const roleLabel = (name) => name === 'Kepala Unit' ? 'Kepala Bengkel' : (name || '');
function assignmentRow(a = {}) {
  const roles = S.ref.roles.filter((r) => r.name !== 'Kepala Unit');
  const kabeng = S.ref.roles.find((r) => r.name === 'Kepala Bengkel');
  const selected = S.ref.roles.find((r) => r.id === a.role_id)?.name === 'Kepala Unit' && kabeng ? kabeng.id : a.role_id;
  return `<div class="arow">
    <select class="inp" name="unit" aria-label="Unit">${S.ref.units.map(u => `<option value="${u.id}" ${u.id === a.unit_id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>
    <select class="inp" name="role" aria-label="Peran">${roles.map(r => `<option value="${r.id}" ${r.id === selected ? 'selected' : ''}>${esc(roleLabel(r.name))}</option>`).join('')}</select>
    <button type="button" class="iconbtn" data-del aria-label="Hapus baris">×</button></div>`;
}

function openDialog(html, onSubmit) {
  const d = $('#dlg');
  d.innerHTML = `<form method="dialog" class="dlg" id="dform">${html}</form>`;
  d.showModal();
  $('#dform').onsubmit = async (e) => {
    if (e.submitter?.value === 'cancel') return;
    e.preventDefault();
    const btn = e.submitter; if (btn) btn.disabled = true;
    try { await onSubmit(new FormData(e.target), e.target); d.close(); }
    catch (err) { toast(err.message, true); }
    finally { if (btn) btn.disabled = false; }
  };
}

function memberDialog(m) {
  const isNew = !m;
  m = m || { name: '', email: '', assignments: [{}] };
  openDialog(`
    <h2>${isNew ? 'Pengguna baru' : 'Ubah pengguna'}</h2>
    <label class="f">Nama<input class="inp" name="name" required value="${esc(m.name)}"></label>
    <label class="f">Email Google<input class="inp" name="email" type="email" required value="${esc(m.email)}" ${m.status === 'active' ? 'readonly title="Email akun yang sudah aktif tidak bisa diganti. Pakai Ganti orang."' : ''}></label>
    <div class="f"><span>Unit &amp; peran</span><div id="arows">${(m.assignments.length ? m.assignments : [{}]).map(assignmentRow).join('')}</div>
      <button type="button" class="btn btn--s" id="addrow">+ Tambah unit / peran</button>
      <p class="tiny muted">Satu orang bisa punya beberapa peran, misalnya Finance di BSD dan Legok.</p></div>
    ${S.perms.owner ? `<label class="check"><input type="checkbox" name="owner" ${m.is_owner ? 'checked' : ''}> Jadikan owner (akses penuh ke semua unit)</label>
    <label class="check"><input type="checkbox" name="allunits" ${m.see_all_units ? 'checked' : ''}> Boleh melihat data semua cabang</label>` : ''}
    ${isNew ? `<label class="check"><input type="checkbox" name="send" checked> Langsung kirim email undangan</label>` : ''}
    <div class="dlg__acts"><button class="btn" value="cancel" formnovalidate>Batal</button><button class="btn btn--primary" value="ok">Simpan</button></div>`,
    async (fd, form) => {
      const assignments = $$('.arow', form).map(r => ({ unit_id: $('[name=unit]', r).value, role_id: $('[name=role]', r).value }))
        .filter((a, i, arr) => arr.findIndex(b => b.unit_id === a.unit_id && b.role_id === a.role_id) === i);
      if (!assignments.length) throw new Error('Pilih minimal satu unit dan peran');
      const payload = { id: m.id, name: fd.get('name'), email: fd.get('email'), assignments };
      const wantOwner = S.perms.owner && fd.get('owner') === 'on';
      if (S.perms.owner) payload.see_all_units = fd.get('allunits') === 'on';
      const saved = await api.saveMember(payload, S.me.id);
      if (S.perms.owner && wantOwner !== !!m.is_owner) {
        if (!wantOwner && !confirm('Cabut tanda owner? Pastikan masih ada owner lain.')) toast('Tanda owner tidak diubah.');
        else await api.setOwnerFlag(saved.id, wantOwner);
      }
      if (fd.get('send') === 'on') await api.invite([saved.id]);
      toast(isNew ? `${saved.name} ditambahkan${fd.get('send') === 'on' ? ' dan diundang' : ''}.` : 'Perubahan disimpan.');
      viewMembers();
    });
  const rows = $('#arows');
  $('#addrow').onclick = () => rows.insertAdjacentHTML('beforeend', assignmentRow());
  rows.onclick = (e) => { if (e.target.closest('[data-del]') && $$('.arow', rows).length > 1) e.target.closest('.arow').remove(); };
}

function replaceDialog(m) {
  openDialog(`
    <h2>Ganti ${esc(m.name)}</h2>
    <p class="muted">Semua unit dan peran di bawah pindah ke orang baru. ${esc(m.name)} langsung dinonaktifkan; data dan riwayatnya tetap tersimpan.</p>
    <div class="chips">${m.assignments.map(a => `<span class="chip">${esc(unitName(a.unit_id))} · ${esc(roleName(a.role_id))}</span>`).join(' ')}</div>
    <label class="f">Nama pengganti<input class="inp" name="name" required></label>
    <label class="f">Email Google pengganti<input class="inp" name="email" type="email" required></label>
    <label class="check"><input type="checkbox" name="send" checked> Langsung kirim email undangan</label>
    <div class="dlg__acts"><button class="btn" value="cancel" formnovalidate>Batal</button><button class="btn btn--primary" value="ok">Ganti &amp; pindahkan peran</button></div>`,
    async (fd) => {
      const n = await api.replaceMember(m.id, fd.get('email'), fd.get('name'));
      if (fd.get('send') === 'on') await api.invite([n.id]);
      toast(`Peran ${m.name} pindah ke ${n.name}.`);
      viewMembers();
    });
}

/* ------------------------------------------------------------------ */
/* Daftar peran                                                        */
/* ------------------------------------------------------------------ */
async function viewRoles() {
  const canEdit = S.perms.can('admin', null, 'edit');
  setHead('Daftar Peran', canEdit ? `<button class="btn btn--primary" id="add">+ Peran baru</button>` : '');
  const mods = roleModules();
  const members = await api.listMembers();
  const used = (id) => members.filter(m => m.status !== 'disabled' && m.assignments.some(a => a.role_id === id)).length;
  const roleRows = S.ref.roles.filter((r) => r.name !== 'Kepala Unit');
  $('#view').innerHTML = `<div class="tablewrap"><table class="tbl matrix"><thead><tr><th>Peran</th>${mods.map(m => `<th>${esc(m.name)}</th>`).join('')}<th>Dipakai</th><th></th></tr></thead>
    <tbody>${roleRows.map(r => `<tr><td><b>${esc(roleLabel(r.name))}</b><br><small class="muted">${esc(r.name === 'Kepala Bengkel' ? 'Termasuk yang dulu tercatat sebagai Kepala Unit di impor tim.' : (r.description || ''))}</small></td>
      ${mods.map(m => { const l = r.permissions?.[m.id] || 'none'; return `<td><span class="lv lv--${l}">${l === 'none' ? '·' : LEVEL_LABEL[l]}</span></td>`; }).join('')}
      <td>${used(r.id)} orang</td>
      <td class="acts">${canEdit ? `<button class="btn btn--s" data-a="edit" data-id="${r.id}">Ubah</button>${!r.is_system ? `<button class="btn btn--s btn--danger" data-a="del" data-id="${r.id}">Hapus</button>` : ''}` : ''}</td></tr>`).join('')}</tbody></table></div>
    <p class="note">Lihat = hanya membaca. Ubah = boleh mengubah isi data yang sudah ada, tidak bisa menghapus atau memindahkan dokumen. Approve = boleh mengonfirmasi. Setiap orang hanya melihat cabang yang diberikan, kecuali owner mencentang “semua cabang”. Peran Gudang hanya stok, barang masuk/keluar, dan opname.</p>`;
  if (!canEdit) return;
  $('#add').onclick = () => roleDialog();
  $('#view').onclick = guard(async (e) => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const r = S.ref.roles.find(x => x.id === b.dataset.id);
    if (b.dataset.a === 'edit') return roleDialog(r);
    if (!confirm(`Hapus peran "${r.name}"?`)) return;
    await api.deleteRole(r.id); S.ref = await api.ref(); toast('Peran dihapus.'); viewRoles();
  });
}

const EXTRA_MODULES = [{ id: 'sa', name: 'SA (transaksi)' }];
function roleModules() {
  const ids = new Set((S.ref?.modules || []).map(m => m.id));
  return (S.ref?.modules || []).concat(EXTRA_MODULES.filter(m => !ids.has(m.id)));
}

function roleDialog(r) {
  const isNew = !r;
  r = r || { name: '', description: '', permissions: {} };
  const saLock = r.name === 'Owner' ? 'approve' : r.name === 'Service Advisor' ? 'edit' : null;
  openDialog(`
    <h2>${isNew ? 'Peran baru' : 'Ubah peran'}</h2>
    <label class="f">Nama peran<input class="inp" name="name" required value="${esc(r.name)}" placeholder="Contoh: Kasir Makassar"></label>
    <label class="f">Keterangan<input class="inp" name="description" value="${esc(r.description || '')}"></label>
    <div class="f"><span>Izin per aplikasi</span>
      <table class="tbl perm"><tbody>${roleModules().map(m => {
        const locked = m.id === 'sa' && saLock;
        const cur = locked || r.permissions?.[m.id] || 'none';
        return `<tr><td>${esc(m.name)}</td><td>${LEVELS.map(l => `<label class="seg"><input type="radio" name="p_${m.id}" value="${l}" ${cur === l ? 'checked' : ''} ${locked ? 'disabled' : ''}><span>${LEVEL_LABEL[l]}</span></label>`).join('')}</td></tr>`;
      }).join('')}</tbody></table></div>
    ${r.name === 'Gudang' ? '<p class="tiny muted">Gudang hanya membuka stok, barang masuk/keluar, dan opname. Invoice dan kas tetap tertutup.</p>' : ''}
    ${saLock ? '<p class="tiny muted">Izin SA (transaksi) pada peran ini dikunci supaya tidak hilang saat disimpan.</p>' : ''}
    <div class="dlg__acts"><button class="btn" value="cancel" formnovalidate>Batal</button><button class="btn btn--primary" value="ok">Simpan peran</button></div>`,
    async (fd) => {
      const permissions = {};
      for (const m of roleModules()) { const l = fd.get('p_' + m.id); if (l && l !== 'none') permissions[m.id] = l; }
      for (const [k, v] of Object.entries(r.permissions || {})) {
        if (!roleModules().some(m => m.id === k) && v && v !== 'none') permissions[k] = v;
      }
      if (saLock) permissions.sa = saLock;
      await api.saveRole({ id: r.id, name: fd.get('name'), description: fd.get('description'), permissions });
      S.ref = await api.ref(); toast('Peran disimpan.'); viewRoles();
    });
}

/* ------------------------------------------------------------------ */
/* Undangan & impor dari Tim & Peran aplikasi Claude                    */
/* ------------------------------------------------------------------ */
const APP_NAME = { work: 'RMODA Studio', crm: 'CRM', setoran: 'Setoran', hrd: 'HRD', proflex: 'Proflex', expc: 'EXPC' };

async function viewImports() {
  const canEdit = S.perms.can('admin', null, 'edit');
  setHead('Undangan & Impor');
  let rows = await api.listImports();
  $('#view').innerHTML = `
    <p class="lead">Daftar ini diambil dari menu <b>Tim &amp; Peran</b> dan daftar <b>Share</b> tiap aplikasi di Claude. Cek emailnya, cocokkan perannya, lalu terima. Orang yang memakai beberapa aplikasi otomatis digabung jadi satu pengguna.</p>
    <div class="toolbar">${canEdit ? `<button class="btn btn--primary" id="accept">Terima semua yang siap</button><button class="btn" id="acceptInv">Terima &amp; kirim undangan</button>` : ''}<span class="muted" id="sum"></span></div>
    <div class="tablewrap"><table class="tbl"><thead><tr><th>Aplikasi</th><th>Nama</th><th>Email</th><th>Unit</th><th>Peran di aplikasi</th><th>Peran di portal</th><th>Status</th></tr></thead><tbody id="rows"></tbody></table></div>`;
  const draw = () => {
    const ready = rows.filter(r => r.status === 'pending').length, check = rows.filter(r => r.status === 'needs_check').length;
    $('#sum').textContent = `${ready} siap · ${check} perlu dicek · ${rows.filter(r => r.status === 'invited').length} sudah dibuat`;
    $('#rows').innerHTML = rows.map(r => {
      const locked = !canEdit || r.status === 'invited';
      return `<tr data-id="${r.id}">
      <td><span class="chip">${esc(APP_NAME[r.source_app] || r.source_app)}</span></td>
      <td><b>${esc(r.display_name)}</b></td>
      <td><input class="inp inp--s" data-f="email" type="email" value="${esc(r.email || '')}" placeholder="email belum ada" ${locked ? 'disabled' : ''}></td>
      <td><select class="inp inp--s" data-f="unit_id" ${locked ? 'disabled' : ''}>${S.ref.units.map(u => `<option value="${u.id}" ${u.id === r.unit_id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></td>
      <td>${esc(r.app_role || '—')}</td>
      <td><select class="inp inp--s" data-f="role_id" ${locked ? 'disabled' : ''}><option value="">— pilih —</option>${S.ref.roles.map(x => `<option value="${x.id}" ${x.id === r.role_id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></td>
      <td><span class="badge ${IMPORT_STATUS[r.status][1]}">${IMPORT_STATUS[r.status][0]}</span>
        ${!locked && r.status !== 'skipped' ? `<button class="linkbtn" data-skip>lewati</button>` : ''}${!locked && r.status === 'skipped' ? `<button class="linkbtn" data-unskip>pakai lagi</button>` : ''}</td></tr>`;
    }).join('') || `<tr><td colspan="7" class="muted">Belum ada data impor. Daftar ini diisi saat tim dari aplikasi Claude diimpor.</td></tr>`;
  };
  draw();
  if (!canEdit) return;
  const recheck = (r) => r.status === 'skipped' || r.status === 'invited' ? r.status : (r.email && r.role_id && r.unit_id ? 'pending' : 'needs_check');
  $('#rows').onchange = guard(async (e) => {
    const tr = e.target.closest('tr'); const r = rows.find(x => x.id === tr.dataset.id);
    r[e.target.dataset.f] = e.target.value.trim() || null; r.status = recheck(r);
    await api.updateImport(r.id, { email: r.email, unit_id: r.unit_id, role_id: r.role_id, status: r.status }); draw();
  });
  $('#rows').onclick = guard(async (e) => {
    const tr = e.target.closest('tr'); if (!tr) return; const r = rows.find(x => x.id === tr.dataset.id);
    if (e.target.matches('[data-skip]')) { r.status = 'skipped'; } else if (e.target.matches('[data-unskip]')) { r.status = 'needs_check'; r.status = recheck(r); } else return;
    await api.updateImport(r.id, { status: r.status }); draw();
  });
  const accept = (send) => guard(async () => {
    const ready = rows.filter(r => r.status === 'pending');
    if (!ready.length) return toast('Belum ada baris yang siap. Lengkapi email dan peran dulu.', true);
    const created = await acceptImports(ready, S.me.id);
    if (send) await api.invite(created.map(m => m.id));
    toast(`${created.length} pengguna dibuat${send ? ' dan diundang' : ''}.`);
    rows = await api.listImports(); draw();
  });
  $('#accept').onclick = accept(false);
  $('#acceptInv').onclick = accept(true);
}

/* ------------------------------------------------------------------ */
/* Aktivitas & export (owner)                                           */
/* ------------------------------------------------------------------ */
async function viewAudit() {
  if (!S.perms.owner) return viewHome();
  setHead('Aktivitas');
  const [rows, members] = await Promise.all([api.audit(), api.listMembers()]);
  const who = (id) => members.find(m => m.id === id)?.name || 'Sistem';
  $('#view').innerHTML = `<div class="tablewrap"><table class="tbl"><thead><tr><th>Waktu</th><th>Oleh</th><th>Aksi</th><th>Target</th></tr></thead>
    <tbody>${rows.map(r => `<tr><td><small>${fmt(r.at)}</small></td><td>${esc(who(r.actor))}</td><td>${esc(r.action)}</td><td>${esc(r.target || '')}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Belum ada aktivitas.</td></tr>'}</tbody></table></div>`;
}

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const toCSV = (rows) => {
  if (!rows.length) return '';
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
  const cell = (v) => { const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n');
};

function viewExport() {
  if (!S.perms.owner) return viewHome();
  setHead('Export data');
  const ro = !!S.flags?.read_only;
  $('#view').innerHTML = `<div class="card">
    <h2>Export semua data</h2>
    <p class="muted">Unduh salinan yang terlihat oleh akun ini. Untuk cadangan lengkap, jalankan skrip di laptop (pg_dump). Skrip itu hanya menambah file baru dan tidak menghapus data. Langkahnya ada di panduan perbaikan keamanan.</p>
    <div class="toolbar"><button class="btn btn--primary" id="json">Unduh semua (JSON)</button><button class="btn" id="csv">Unduh pengguna (CSV, buka di Excel)</button></div></div>
    <div class="card" style="margin-top:16px">
    <h2>Mode pemeliharaan</h2>
    <p class="muted">Saat dinyalakan, staf hanya bisa melihat. Tidak ada data yang dihapus. Salinan dari Claude tetap jalan. Hanya owner yang bisa mengubah saklar ini.</p>
    <p><span class="badge ${ro ? 'warn' : 'ok'}">${ro ? 'Sedang hanya baca' : 'Portal bisa diubah'}</span></p>
    <button class="btn ${ro ? '' : 'btn--primary'}" id="maintToggle">${ro ? 'Matikan mode pemeliharaan' : 'Nyalakan mode pemeliharaan'}</button></div>`;
  const stamp = new Date().toISOString().slice(0, 10);
  $('#json').onclick = guard(async () => { download(`portal-rmoda-${stamp}.json`, JSON.stringify(await api.exportAll(), null, 2), 'application/json'); toast('File diunduh.'); });
  $('#maintToggle').onclick = guard(() => setMaint(!S.flags?.read_only));
  $('#csv').onclick = guard(async () => {
    const ms = await api.listMembers();
    const rows = ms.map(m => ({ nama: m.name, email: m.email, status: STATUS[m.status][0], owner: m.is_owner ? 'ya' : '', unit_peran: m.assignments.map(a => `${unitName(a.unit_id)}: ${roleName(a.role_id)}`).join('; '), diundang: m.invited_at || '', aktif_sejak: m.activated_at || '' }));
    download(`pengguna-portal-${stamp}.csv`, '﻿' + toCSV(rows), 'text/csv'); toast('File diunduh.');
  });
}

boot();
