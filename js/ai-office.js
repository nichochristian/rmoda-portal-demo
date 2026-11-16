// AI Office demo. Satu pintu pengirim: sendCommand.
// Demo hanya menulis antrian di localStorage. Tidak ada fetch, webhook, atau key.

const KEY = 'rmoda-portal-ai-commands';
const DEC_KEY = 'rmoda-portal-ai-decisions';
const EXTRA_KEY = 'rmoda-portal-ai-extra';
const ACCEPT_MS = 2000;
const DONE_MS = 4500;
const KEEP = 40;

const WORDS = {
  rmoda: ['assets/logo/rmoda-wordmark-onlight.png', 'assets/logo/rmoda-wordmark-ondark.png', 'RMODA Studio'],
  supplies: ['assets/logo/expc-supplies-wordmark-onlight.png', 'assets/logo/expc-supplies-wordmark-ondark.png', 'EXPC Supplies'],
  academy: ['assets/logo/expc-academy-wordmark-onlight.png', 'assets/logo/expc-academy-wordmark-ondark.png', 'EXPC Academy'],
  proflex: ['assets/logo/proflex-wordmark-onlight.png', 'assets/logo/proflex-wordmark-ondark.png', 'Proflex'],
};

const BRANDS = [
  { id: 'expc', name: 'EXPC', pm: 'Expi', line: 'Academy dan Supplies', live: true, logos: ['academy', 'supplies'] },
  { id: 'rmoda', name: 'RMODA Studio', pm: 'Rmo', line: 'Produksi bengkel', live: false, logos: ['rmoda'] },
  { id: 'proflex', name: 'Proflex', pm: 'Flexo', line: 'Film dan grafik', live: false, logos: ['proflex'] },
  { id: 'cuy', name: 'Cuy', pm: 'Cuy', line: 'Keuangan dan teknologi', live: false, logos: [] },
];

const STAGES = [
  ['ide', 'Ide', 'Mars'],
  ['kalender', 'Kalender', 'Somia'],
  ['script', 'Isi & Script', 'Kata'],
  ['take', 'Take video', 'Tim lapangan'],
  ['edit', 'Edit', 'Vira'],
  ['desain', 'Desain', 'Grady'],
  ['approval', 'Antrian approval Pak', 'Pak Nicholas'],
  ['posting', 'Posting', 'Somia'],
];

const STAGE = Object.fromEntries(STAGES.map(([id, label, pic]) => [id, { label, pic }]));

const BASE = [
  { id: 'c1', title: 'Reels: ide tips ceramic', type: 'Reels', account: '@expcacademy.id', stage: 'ide', day: 0 },
  { id: 'c2', title: 'Feed: before after poles', type: 'Feed', account: '@expcacademy.id', stage: 'kalender', day: 1 },
  { id: 'c3', title: 'Reels: unboxing film PPF', type: 'Reels', account: 'EXPC Supplies', stage: 'script', day: 2, script: 'Hook: roll baru masuk. Tiga kalimat manfaat, lalu ajakan cek katalog. Caption contoh, belum final.' },
  { id: 'c4', title: 'Story: behind kelas', type: 'Story', account: '@expcacademy.id', stage: 'take', day: 1, late: true },
  { id: 'c5', title: 'Reels: 3 kesalahan coating', type: 'Reels', account: '@expcacademy.id', stage: 'edit', day: 3 },
  { id: 'c6', title: 'Feed: katalog film PPF', type: 'Feed', account: 'EXPC Supplies', stage: 'desain', day: 3 },
  { id: 'c7', title: 'Story: kelas batch contoh', type: 'Story', account: '@expcacademy.id', stage: 'approval', day: 4 },
  { id: 'c8', title: 'Reels: cara daftar kelas', type: 'Reels', account: '@expcacademy.id', stage: 'approval', day: 4 },
  { id: 'c9', title: 'Feed: stok ready', type: 'Feed', account: 'EXPC Supplies', stage: 'posting', day: 5 },
  { id: 'c10', title: 'Story: reminder kelas', type: 'Story', account: '@expcacademy.id', stage: 'posting', day: 6 },
];

const TEAM = [
  { id: 'expi', name: 'Expi', role: 'Manager / PM EXPC', tint: '#f0b4ae', out: 14, done: 11, week: 7, hours: 1, last: 'Menyatukan urutan approval minggu ini.', tasks: ['Memeriksa semua pekerjaan tim, siap atau belum.', 'Menandai konten yang masih menunggu Pak.', 'Mengecek caption Supplies sebelum posting.'] },
  { id: 'mars', name: 'Mars', role: 'Marketing Strategist', tint: '#f3d7a1', out: 9, done: 6, week: 4, hours: 5, last: 'Mengusulkan angle Reels tips ceramic.', tasks: ['Menyusun ide konten kelas minggu ini.', 'Membandingkan strategi Academy dan Supplies.'] },
  { id: 'somia', name: 'Somia', role: 'Social Media Manager', tint: '#b7dcc8', out: 16, done: 12, week: 8, hours: 3, last: 'Mengunci slot Reels Kamis di kalender.', tasks: ['Menyusun kalender konten mingguan dua akun.', 'Mengecek slot Story yang masih kosong.'] },
  { id: 'kata', name: 'Kata', role: 'Copywriter', tint: '#ead9a2', out: 11, done: 8, week: 5, hours: 4, last: 'Menulis draf caption unboxing film PPF.', tasks: ['Mengisi caption Reels unboxing.', 'Merapikan script cara daftar kelas.'] },
  { id: 'vira', name: 'Vira', role: 'Video Creator', tint: '#c5d4f2', out: 8, done: 5, week: 3, hours: 2, last: 'Memotong hook Reels 3 kesalahan coating.', tasks: ['Edit video Reels coating, durasi di bawah 30 detik.', 'Menunggu bahan Story behind kelas.'] },
  { id: 'grady', name: 'Grady', role: 'Graphic Designer', tint: '#f0c3d4', out: 10, done: 7, week: 4, hours: 6, last: 'Menyusun thumbnail katalog film PPF.', tasks: ['Desain Feed katalog film PPF.', 'Siapkan thumbnail Reels yang sudah diedit.'] },
  { id: 'econ', name: 'Econ', role: 'E-commerce Specialist', tint: '#c9e2c4', out: 7, done: 4, week: 3, hours: 20, last: 'Memperbarui judul listing Tokopedia contoh.', tasks: ['Menjaga listing Tokopedia dan marketplace EXPC Supplies.', 'Mencatat order contoh yang belum dibalas.'] },
];

const FUNNEL = [
  ['Reach', 48200],
  ['Engagement', 6100],
  ['Profile visit', 2400],
  ['DM/WA', 860],
  ['Daftar kelas/Order', 74],
];

const REACH7 = [4200, 5100, 4800, 6300, 5900, 7100, 6800];
const REACH30 = [3200, 2800, 4100, 3600, 4500, 3900, 5200, 4800, 4300, 6100, 5400, 4700, 6600, 5800, 5100, 7200, 6400, 5900, 6800, 6200, 5400, 7100, 6600, 6000, 7400, 6900, 6300, 7800, 7100, 6800];

const VIEWS = ['overview', 'ceo', 'jadwal', 'funnel', 'insights', 'konten', 'tim', 'todo', 'script', 'editor', 'chat'];
const NAV = [
  ['overview', 'Overview'],
  ['ceo', 'CEO Check'],
  ['jadwal', 'Jadwal mingguan'],
  ['funnel', 'Funnel'],
  ['insights', 'IG Insights'],
  ['konten', 'Konten saya'],
];
const WORK = [
  ['tim', 'Tim'],
  ['todo', 'To-do'],
  ['script', 'Script'],
  ['editor', 'Editor & Thumbnail'],
];

const st = { brand: 'expc', q: '', range: '7', newOpen: false };
let timer = 0;
let ctx = null;

const brandOf = (id) => BRANDS.find((b) => b.id === id) || BRANDS[0];
const known = (id) => BRANDS.some((b) => b.id === id);
const dark = () => document.documentElement.dataset.theme !== 'light';
const word = (id) => {
  const row = WORDS[id];
  return `<img data-word-for="${id}" src="${dark() ? row[1] : row[0]}" alt="${row[2]}">`;
};
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id' + Date.now());
const read = (key) => {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]');
    return raw;
  } catch {
    return key === DEC_KEY ? {} : [];
  }
};
const weekMonday = () => {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
};
const dayName = (i) => ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'][i];
const todayIndex = () => (new Date().getDay() + 6) % 7;

function contents() {
  const extra = read(EXTRA_KEY);
  const rows = Array.isArray(extra) ? extra.filter((x) => x && x.id && x.title && STAGE[x.stage]) : [];
  return BASE.concat(rows);
}
function decisions() {
  const raw = read(DEC_KEY);
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}
function stageOf(item) {
  const d = decisions()[item.id];
  if (d === 'setuju') return 'posting';
  if (d === 'revisi') return 'edit';
  return item.stage;
}
function waiting() {
  return contents().filter((c) => stageOf(c) === 'approval');
}
function lateOnes() {
  return contents().filter((c) => c.late && stageOf(c) !== 'posting');
}
function posted() {
  return contents().filter((c) => stageOf(c) === 'posting');
}
function picOf(item) {
  return STAGE[stageOf(item)].pic;
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((x) => x && known(x.brand) && typeof x.text === 'string' && x.createdAt) : [];
  } catch {
    return [];
  }
}

export function commandStatus(item, now = Date.now()) {
  const age = now - Number(item.createdAt || 0);
  if (age >= DONE_MS) return 'Selesai';
  if (age >= ACCEPT_MS) return 'Diterima';
  return 'Antri';
}

// Nanti pengganti fungsi ini yang mengirim ke agent. Pemanggil UI tetap sama.
export function sendCommand(brand, text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (!clean) return Promise.resolve({ ok: false, error: 'Tulis perintah dulu.' });
  if (!known(brand)) return Promise.resolve({ ok: false, error: 'Brand tidak dikenal.' });
  const item = { id: uid(), brand, text: clean, createdAt: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify([item, ...load()].slice(0, KEEP)));
  } catch {
    return Promise.resolve({ ok: false, error: 'Browser menolak menyimpan antrian demo.' });
  }
  return Promise.resolve({ ok: true, item: { ...item, status: 'Antri' } });
}

const when = (ts) => new Date(ts).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const STCLS = { Antri: 'warn', Diterima: 'info', Selesai: 'ok' };
const num = (n) => Number(n).toLocaleString('id-ID');

function histHtml(esc, brand) {
  const rows = load().filter((x) => x.brand === brand).slice(0, 6);
  if (!rows.length) return '<p class="ai-empty">Belum ada perintah di browser ini.</p>';
  return `<ol class="ai-hist">${rows.map((x) => {
    const status = commandStatus(x);
    return `<li><span class="ai-hist__top"><span class="badge ${STCLS[status]}">${status}</span><time datetime="${new Date(x.createdAt).toISOString()}">${esc(when(x.createdAt))}</time></span><p>${esc(x.text)}</p></li>`;
  }).join('')}</ol>`;
}

function greet() {
  const h = new Date().getHours();
  if (h < 11) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 18) return 'Selamat sore';
  return 'Selamat malam';
}

function side(esc) {
  const b = brandOf(st.brand);
  const n = waiting().length;
  const link = ([id, label]) => {
    const on = st.view === id;
    const badge = id === 'ceo' ? `<span class="ai-count${n ? '' : ' is-zero'}">${n}</span>` : '';
    return `<a href="#/ai-office${id === 'overview' ? '' : '/' + id}" class="${on ? 'on' : ''}" ${on ? 'aria-current="page"' : ''}>${esc(label)}${badge}</a>`;
  };
  const brands = BRANDS.map((x) => `<button type="button" data-brand="${x.id}" aria-pressed="${x.id === b.id}">${esc(x.name)}</button>`).join('');
  return `<aside class="ai-side">
    <div class="ai-switch" role="group" aria-label="Pilih brand">${brands}</div>
    <nav class="ai-nav" aria-label="Menu AI Office">${NAV.map(link).join('')}</nav>
    <p class="ai-navh">AI Workspace</p>
    <nav class="ai-nav" aria-label="AI Workspace">${WORK.map(link).join('')}</nav>
    <div class="ai-ready">
      <p>${b.live ? 'Tim AI siap. Tanya progres atau kirim instruksi ke Expi dan tim.' : `Ruang ${esc(b.name)} masih segera. Perintah demo bisa diantri untuk ${esc(b.pm)}.`}</p>
      <a class="btn btn--primary" href="#/ai-office/chat">Buka chat</a>
    </div>
  </aside>`;
}

function soon(esc, b) {
  const logos = b.logos.map(word).join('');
  return `<article class="ai-soon">
    ${logos ? `<div class="ai-card__logos">${logos}</div>` : `<b class="ai-word">${esc(b.name)}</b>`}
    <h2>${esc(b.name)}</h2>
    <p>PM ${esc(b.pm)}. ${esc(b.line)}.</p>
    <span class="badge warn">Segera</span>
    <p class="muted">Ruang ini belum diisi. EXPC yang sudah bisa dicoba, dengan data contoh.</p>
  </article>`;
}

function piece(esc, item) {
  const stage = stageOf(item);
  return `<article class="ai-piece" data-stage="${stage}">
    <b>${esc(item.title)}</b>
    <small>${esc(item.type)} · ${esc(item.account)}</small>
    <small>PIC ${esc(picOf(item))} · ${esc(STAGE[stage].label)}${item.late && stage !== 'posting' ? ' · telat' : ''}</small>
  </article>`;
}

function overview(esc, b) {
  const date = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const logos = b.logos.map(word).join('');
  const metrics = [
    [waiting().length, 'menunggu Pak'],
    [contents().length, 'konten minggu ini'],
    [lateOnes().length, 'telat'],
    [posted().length, 'terposting'],
  ];
  return `<header class="ai-hello">
      <div>
        <h2>${greet()}, Pak Nicholas</h2>
        <p class="muted">${esc(date)}</p>
      </div>
      <p class="ai-ig"><i></i> Terhubung ke Instagram @expcacademy.id <span class="badge off">contoh</span></p>
    </header>
    <section class="ai-hero">
      <div class="ai-card__logos">${logos}</div>
      <h3>EXPC</h3>
      <p class="muted">Academy dan Supplies. Angka dan konten di bawah ini contoh.</p>
      <div class="ai-hero__row">
        <button type="button" class="btn btn--primary" id="aiNew">Buat proyek baru</button>
        <form class="ai-ask" data-brand="expc">
          <label for="aiAssist">AI Assistant</label>
          <input class="inp" id="aiAssist" name="text" placeholder="Tanya Expi atau kirim instruksi" maxlength="500">
          <button class="btn" type="submit">Kirim</button>
        </form>
      </div>
      <form class="ai-new" id="aiNewForm" hidden>
        <label for="aiTitle">Nama konten contoh</label>
        <input class="inp" id="aiTitle" maxlength="80" placeholder="Misalnya Reels: tips baru">
        <button class="btn btn--primary" type="submit">Simpan ke Ide</button>
        <p class="ai-hint">Tersimpan di browser ini, tahap Ide, PIC Mars.</p>
      </form>
      <p class="ai-err" id="aiAskErr" hidden role="alert"></p>
      <div data-live="expc">${histHtml(esc, 'expc')}</div>
    </section>
    <div class="ai-metrics">${metrics.map(([n, label]) => `<article class="ai-metric"><b>${n}</b><span>${esc(label)}</span><small>contoh</small></article>`).join('')}</div>`;
}

function team(esc) {
  const q = st.q.trim().toLowerCase();
  const rows = TEAM.filter((a) => !q || (a.name + ' ' + a.role).toLowerCase().includes(q));
  const card = (a) => {
    const on = a.hours < 24 * 7;
    const ago = a.hours < 1 ? 'baru saja' : a.hours < 24 ? a.hours + ' jam lalu' : Math.round(a.hours / 24) + ' hari lalu';
    return `<article class="ai-agent" style="--tint:${a.tint}">
      <header class="ai-agent__top">
        <span class="ai-av" aria-hidden="true">${esc(a.name.slice(0, 2))}</span>
        <div>
          <h3>${esc(a.name)} <i class="ai-dot ${on ? '' : 'is-off'}" aria-hidden="true"></i> <span class="ai-state">${on ? 'Aktif' : 'Diam'}</span></h3>
          <p>${esc(a.role)}</p>
        </div>
      </header>
      <ul class="ai-tasks">${a.tasks.slice(0, 3).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      <dl class="ai-stat3">
        <div><dt>output</dt><dd>${a.out}</dd></div>
        <div><dt>selesai</dt><dd>${a.done}</dd></div>
        <div><dt>7 hari</dt><dd>${a.week}</dd></div>
      </dl>
      <p class="ai-ago">Terakhir kerja: ${esc(ago)}</p>
      <p class="ai-last"><b>Hasil terakhir.</b> ${esc(a.last)}</p>
    </article>`;
  };
  return `<header class="ai-head">
      <h2>Tim AI EXPC</h2>
      <p class="muted">Expi dan tim, satu tempat. Titik hijau artinya aktif dalam 7 hari terakhir.</p>
      <label class="ai-search">Cari agent<input class="inp" id="aiQ" value="${esc(st.q)}" placeholder="Nama atau peran"></label>
    </header>
    <div class="ai-agents">${rows.map(card).join('') || '<p class="ai-empty">Tidak ada agent yang cocok.</p>'}</div>`;
}

function kanban(esc) {
  const cols = STAGES.map(([id, label]) => {
    const items = contents().filter((c) => stageOf(c) === id);
    return `<section class="ai-kcol"><header><b>${esc(label)}</b><span>${items.length}</span></header>${items.map((c) => piece(esc, c)).join('') || '<p class="ai-empty">Kosong</p>'}</section>`;
  }).join('');
  return `<header class="ai-head"><h2>Konten saya</h2><p class="muted">Alur rutin, data contoh. Tiap kartu menampilkan tahap dan PIC.</p></header><div class="ai-flow">${STAGES.map(([, label, pic]) => `<span>${esc(label)}<small>${esc(pic)}</small></span>`).join('')}</div><div class="ai-kanban">${cols}</div>`;
}

function ceo(esc) {
  const wait = waiting();
  const late = lateOnes();
  const done = posted();
  const row = (c, actions) => `<article class="ai-check">
    <div><b>${esc(c.title)}</b><p class="muted">${esc(c.type)} · ${esc(c.account)} · PIC ${esc(picOf(c))}</p></div>
    ${actions ? `<div class="ai-check__go"><button type="button" class="btn btn--primary" data-decide="setuju" data-id="${esc(c.id)}">Setujui</button><button type="button" class="btn" data-decide="revisi" data-id="${esc(c.id)}">Minta revisi</button></div>` : ''}
  </article>`;
  return `<header class="ai-head"><h2>CEO Check</h2><p class="muted">Ringkas untuk Pak. Tombol hanya mengubah contoh di browser ini, tidak mengirim ke agent.</p></header>
    <section class="ai-block"><h3>Menunggu keputusan <span class="ai-count">${wait.length}</span></h3>${wait.map((c) => row(c, true)).join('') || '<p class="ai-empty">Tidak ada yang menunggu.</p>'}</section>
    <section class="ai-block"><h3>Telat</h3>${late.map((c) => row(c, false)).join('') || '<p class="ai-empty">Tidak ada yang telat.</p>'}</section>
    <section class="ai-block"><h3>Hasil minggu ini</h3>${done.map((c) => row(c, false)).join('') || '<p class="ai-empty">Belum ada yang terposting.</p>'}</section>`;
}

function jadwal(esc) {
  const monday = weekMonday();
  const cols = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const items = contents().filter((c) => c.day === i);
    const accounts = ['@expcacademy.id', 'EXPC Supplies'];
    const body = accounts.map((acc) => {
      const mine = items.filter((c) => c.account === acc);
      const short = acc === '@expcacademy.id' ? 'Academy' : 'Supplies';
      return `<div class="ai-slot"><b title="${esc(acc)}">${short}</b>${mine.map((c) => `<p data-stage="${stageOf(c)}"><span>${esc(c.type)}</span> ${esc(STAGE[stageOf(c)].label)}</p>`).join('') || '<p class="muted">Kosong</p>'}</div>`;
    }).join('');
    return `<section class="ai-day ${i === todayIndex() ? 'is-today' : ''}"><header>${dayName(i)}<small>${d.getDate()}</small></header>${body}</section>`;
  }).join('');
  return `<header class="ai-head"><h2>Jadwal mingguan</h2><p class="muted">Slot Reels, Feed, dan Story untuk @expcacademy.id (Academy) dan EXPC Supplies. Warna mengikuti tahap, nama tahap tetap tertulis. Data contoh.</p></header><div class="ai-week">${cols}</div>`;
}

function funnel(esc) {
  const max = FUNNEL[0][1];
  return `<header class="ai-head"><h2>Funnel</h2><p class="muted">Angka contoh, dari jangkauan sampai daftar kelas atau order.</p></header>
    <ol class="ai-funnel">${FUNNEL.map(([label, n]) => `<li><span>${esc(label)}</span><i><b style="width:${Math.max(8, n / max * 100)}%"></b></i><strong>${num(n)}</strong><small>contoh</small></li>`).join('')}</ol>`;
}

function insights(esc) {
  const series = st.range === '30' ? REACH30 : REACH7;
  const max = Math.max(...series);
  const cards = [
    ['Followers', '12.840'],
    ['Reach', '48.200'],
    ['Engagement rate', '3,4%'],
    ['Top post', 'Reels: 3 kesalahan coating'],
  ];
  return `<header class="ai-head"><h2>IG Insights</h2><p class="muted">Akun contoh @expcacademy.id. Semua angka di halaman ini contoh.</p></header>
    <div class="ai-metrics">${cards.map(([k, v]) => `<article class="ai-metric"><b>${esc(v)}</b><span>${esc(k)}</span><small>contoh</small></article>`).join('')}</div>
    <section class="ai-block">
      <div class="ai-head__row"><h3>Reach ${st.range} hari</h3><div class="ai-seg" role="group" aria-label="Rentang"><button type="button" data-range="7" aria-pressed="${st.range === '7'}">7 hari</button><button type="button" data-range="30" aria-pressed="${st.range === '30'}">30 hari</button></div></div>
      <div class="ai-bars" aria-hidden="true">${series.map((n) => `<i style="--h:${Math.max(8, n / max * 100)}%"></i>`).join('')}</div>
      <p class="ai-hint">Grafik contoh. Angka tertinggi ${num(max)}.</p>
    </section>`;
}

function listPage(esc, title, sub, rows) {
  return `<header class="ai-head"><h2>${esc(title)}</h2><p class="muted">${esc(sub)}</p></header><div class="ai-list">${rows.map((c) => piece(esc, c)).join('') || '<p class="ai-empty">Belum ada.</p>'}</div>`;
}

function todo(esc) {
  return listPage(esc, 'To-do', 'Pekerjaan yang belum terposting. Data contoh.', contents().filter((c) => stageOf(c) !== 'posting'));
}
function script(esc) {
  const rows = contents().filter((c) => c.script || stageOf(c) === 'script');
  return `<header class="ai-head"><h2>Script</h2><p class="muted">Caption dan script dari Kata. Teks di bawah ini contoh.</p></header>
    ${rows.map((c) => `<article class="ai-script"><h3>${esc(c.title)}</h3><p>${esc(c.script || 'Script belum ditulis. Masih di tahap ' + STAGE[stageOf(c)].label + '.')}</p><small>PIC ${esc(picOf(c))}</small></article>`).join('')}`;
}
function editor(esc) {
  return listPage(esc, 'Editor & Thumbnail', 'Antrean edit Vira dan desain Grady. Data contoh.', contents().filter((c) => ['edit', 'desain'].includes(stageOf(c))));
}

function chat(esc, b) {
  return `<header class="ai-head"><h2>Chat ${esc(b.pm)}</h2><p class="note" role="status">Mode demo. Perintah masuk antrian browser ini, belum terkirim ke agent sungguhan.</p></header>
    <form class="ai-ask ai-ask--stack" data-brand="${b.id}">
      <label for="aiChat">Beri perintah ke ${esc(b.pm)}</label>
      <textarea class="inp" id="aiChat" name="text" rows="3" maxlength="500" placeholder="Tulis instruksi untuk ${esc(b.pm)}"></textarea>
      <button class="btn btn--primary" type="submit">Kirim</button>
      <p class="ai-err" hidden role="alert"></p>
    </form>
    <div data-live="${b.id}">${histHtml(esc, b.id)}</div>`;
}

function main(esc) {
  const b = brandOf(st.brand);
  if (!b.live && st.view !== 'chat') return soon(esc, b);
  if (st.view === 'tim') return team(esc);
  if (st.view === 'konten') return kanban(esc);
  if (st.view === 'ceo') return ceo(esc);
  if (st.view === 'jadwal') return jadwal(esc);
  if (st.view === 'funnel') return funnel(esc);
  if (st.view === 'insights') return insights(esc);
  if (st.view === 'todo') return todo(esc);
  if (st.view === 'script') return script(esc);
  if (st.view === 'editor') return editor(esc);
  if (st.view === 'chat') return chat(esc, b);
  return overview(esc, b);
}

function arm() {
  clearTimeout(timer);
  const root = document.getElementById('aiShell');
  if (!root) return;
  if (!load().some((x) => commandStatus(x) !== 'Selesai')) return;
  timer = setTimeout(() => {
    if (!document.getElementById('aiShell') || !ctx) return;
    document.querySelectorAll('[data-live]').forEach((el) => { el.innerHTML = histHtml(ctx.esc, el.dataset.live); });
    arm();
  }, 500);
}

function bind() {
  const { esc } = ctx;
  const root = document.getElementById('view');
  root.querySelectorAll('.ai-switch [data-brand]').forEach((btn) => {
    btn.onclick = () => { st.brand = btn.dataset.brand; paint(); };
  });
  const q = root.querySelector('#aiQ');
  if (q) q.oninput = () => { st.q = q.value; const pos = q.selectionStart; paint(); const n = document.querySelector('#aiQ'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } };
  const newer = root.querySelector('#aiNew');
  if (newer) newer.onclick = () => { st.newOpen = !st.newOpen; const form = document.getElementById('aiNewForm'); if (form) form.hidden = !st.newOpen; };
  const formNew = root.querySelector('#aiNewForm');
  if (formNew) {
    formNew.hidden = !st.newOpen;
    formNew.onsubmit = (e) => {
      e.preventDefault();
      const title = formNew.querySelector('input').value.replace(/\s+/g, ' ').trim();
      if (!title) return;
      const day = todayIndex();
      const extra = contents().filter((c) => !BASE.some((b) => b.id === c.id));
      extra.push({ id: uid(), title, type: 'Reels', account: '@expcacademy.id', stage: 'ide', day });
      try { localStorage.setItem(EXTRA_KEY, JSON.stringify(extra)); } catch { return; }
      st.newOpen = false;
      location.hash = '#/ai-office/konten';
    };
  }
  root.querySelectorAll('.ai-ask').forEach((form) => {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const box = form.querySelector('input, textarea');
      const err = form.querySelector('.ai-err') || document.getElementById('aiAskErr');
      const res = await sendCommand(form.dataset.brand, box.value);
      if (!res.ok) {
        if (err) { err.hidden = false; err.textContent = res.error; }
        return;
      }
      if (err) err.hidden = true;
      box.value = '';
      document.querySelectorAll(`[data-live="${form.dataset.brand}"]`).forEach((el) => { el.innerHTML = histHtml(esc, form.dataset.brand); });
      arm();
    };
  });
  root.querySelectorAll('[data-decide]').forEach((btn) => {
    btn.onclick = () => {
      const map = decisions();
      map[btn.dataset.id] = btn.dataset.decide;
      try { localStorage.setItem(DEC_KEY, JSON.stringify(map)); } catch { return; }
      paint();
    };
  });
  root.querySelectorAll('[data-range]').forEach((btn) => {
    btn.onclick = () => { st.range = btn.dataset.range; paint(); };
  });
  arm();
}

function paint() {
  const { esc, setHead } = ctx;
  setHead('AI Office');
  const root = document.getElementById('view');
  if (!root) return;
  root.innerHTML = `<div class="ai-shell" id="aiShell">${side(esc)}<div class="ai-main">${main(esc)}</div></div>`;
  bind();
}

export function viewAiOffice(next, sub) {
  ctx = next;
  st.view = VIEWS.includes(sub) ? sub : 'overview';
  paint();
}
