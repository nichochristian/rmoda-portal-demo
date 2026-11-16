// Kantor AI demo. Satu pintu pengirim: sendCommand.
// Demo hanya menulis antrian di localStorage. Tidak ada fetch, webhook, atau key.

const KEY = 'rmoda-portal-ai-commands';
const WORK_KEY = 'rmoda-portal-ai-work';
const ACCEPT_MS = 2000;
const DONE_MS = 4500;
const KEEP = 40;

const AGENTS = {
  mars: { name: 'Mars', role: 'Riset dan ide', initials: 'Ma', a: '#f6e2b8', b: '#e2b15a' },
  somia: { name: 'Somia', role: 'Kalender', initials: 'So', a: '#d7f0e4', b: '#7dcbab' },
  kata: { name: 'Kata', role: 'Tulisan dan script', initials: 'Ka', a: '#f3e7c2', b: '#d4b45c' },
  vira: { name: 'Vira', role: 'Edit video', initials: 'Vi', a: '#d9e4f8', b: '#8eaae0' },
  grady: { name: 'Grady', role: 'Desain', initials: 'Gr', a: '#f8d7e4', b: '#e09ab8' },
  expi: { name: 'Expi', role: 'Pengatur EXPC', initials: 'Ex', a: '#f6d0cb', b: '#e08b84' },
  rmo: { name: 'Rmo', role: 'Pengatur RMODA', initials: 'Rm', a: '#f8d0cc', b: '#e7a19c' },
  lapangan: { name: 'Tim lapangan', role: 'Take video', initials: 'TL', a: '#e4dfd6', b: '#b7b0a4' },
};

const STEPS = {
  1: 'Riset Meta Ads',
  2: 'Analisa Meta Ads',
  3: 'Ide iklan',
  4: 'Ide konten',
  5: 'Kalender konten',
  6: 'Isi konten',
  7: 'Script video',
  8: 'Take video',
  9: 'Edit video',
  10: 'Desain',
  11: 'Approval Pak',
  12: 'Jadwal tayang',
};

const GROUPS = [
  ['riset', 'Riset & Ide'],
  ['produksi', 'Produksi'],
  ['approval', 'Approval'],
  ['tayang', 'Tayang'],
];
const GROUP_OF = (step) => (step <= 4 ? 'riset' : step <= 10 ? 'produksi' : step === 11 ? 'approval' : 'tayang');

const STATUS = {
  belum: 'Belum mulai',
  kerja: 'Dikerjakan',
  tunggu: 'Menunggu Pak',
  revisi: 'Revisi',
  selesai: 'Selesai',
};

const NAV = [
  ['', 'Beranda', 'Beranda'],
  ['alur', 'Alur konten', 'Alur'],
  ['kalender', 'Kalender', 'Kalender'],
  ['setuju', 'Perlu persetujuan', 'Setujui'],
];

const BRANDS = [
  { id: 'academy', name: 'EXPC Academy', pm: 'Expi', live: true },
  { id: 'supplies', name: 'EXPC Supplies', pm: 'Expi', live: true },
  { id: 'rmoda', name: 'RMODA Studio', pm: 'Rmo', live: true, locs: ['BSD', 'Legok', 'Makassar'] },
];

const job = (brand, n, row) => ({ id: brand + '-' + n, brand, kind: 'konten', day: 0, copy: '', script: '', ...row });

const DATA = {
  academy: [
    job('aca', 1, { title: 'Riset iklan kelas coating', step: 1, status: 'kerja', due: '18 Nov', agent: 'mars', day: 0, kind: 'iklan', copy: 'Contoh riset. Orang mencari kelas coating. Banyak yang tanya harga dan lama belajar.' }),
    job('aca', 2, { title: 'Analisa iklan minggu lalu', step: 2, status: 'selesai', due: '16 Nov', agent: 'mars', day: 0, kind: 'iklan', copy: 'Contoh. Iklan Reels dilihat banyak orang, yang daftar masih sedikit.' }),
    job('aca', 3, { title: 'Ide konten before after murid', step: 4, status: 'belum', due: '19 Nov', agent: 'mars', day: 1, kind: 'konten', copy: 'Contoh ide. Bandingkan mobil sebelum dan sesudah latihan murid.' }),
    job('aca', 4, { title: 'Kalender konten minggu ini', step: 5, status: 'kerja', due: '17 Nov', agent: 'somia', day: 1, kind: 'konten', copy: 'Contoh. Senin Reels, Rabu Feed, Jumat Story.' }),
    job('aca', 5, { title: 'Caption Reels 3 kesalahan coating', step: 6, status: 'kerja', due: '18 Nov', agent: 'kata', day: 2, kind: 'konten', copy: 'Contoh caption. Tiga kesalahan saat coating, lalu ajakan ikut kelas praktik.' }),
    job('aca', 6, { title: 'Script cara daftar kelas', step: 7, status: 'kerja', due: '19 Nov', agent: 'kata', day: 3, kind: 'konten', script: 'Contoh script. Hook: mau coating rapi? Lalu tiga langkah daftar. Tutup dengan ajakan hari ini.' }),
    job('aca', 7, { title: 'Footage kelas batch', step: 8, status: 'belum', due: '20 Nov', agent: 'lapangan', day: 3, kind: 'konten', copy: 'Tim lapangan belum mengunggah rekaman. Contoh.' }),
    job('aca', 8, { title: 'Edit Reels kesalahan coating', step: 9, status: 'kerja', due: '20 Nov', agent: 'vira', day: 4, kind: 'konten', copy: 'Contoh. Video dipotong di bawah 30 detik, teks besar di awal.' }),
    job('aca', 9, { title: 'Thumbnail kelas 3 hari', step: 10, status: 'kerja', due: '20 Nov', agent: 'grady', day: 4, kind: 'konten', copy: 'Contoh. Gambar judul kelas, wajah tidak dipakai.' }),
    job('aca', 10, { title: 'Story pengumuman kelas', step: 11, status: 'tunggu', due: '21 Nov', agent: 'expi', day: 5, kind: 'konten', copy: 'Kelas coating batch contoh dibuka. Mohon dilihat Pak sebelum tayang.' }),
    job('aca', 11, { title: 'Reels ajakan daftar kelas', step: 11, status: 'tunggu', due: '21 Nov', agent: 'expi', day: 5, kind: 'iklan', copy: 'Daftar kelas 3 hari. Tempat terbatas. Contoh iklan untuk disetujui.', script: 'Teks di layar: Daftar hari ini.' }),
    job('aca', 12, { title: 'Feed reminder kelas', step: 12, status: 'selesai', due: '16 Nov', agent: 'somia', day: 6, kind: 'konten', copy: 'Sudah masuk jadwal tayang. Contoh.' }),
  ],
  supplies: [
    job('sup', 1, { title: 'Riset iklan film PPF', step: 1, status: 'kerja', due: '18 Nov', agent: 'mars', day: 0, kind: 'iklan', copy: 'Contoh. Pembeli mencari film PPF dan harga per meter.' }),
    job('sup', 2, { title: 'Ide konten unboxing roll', step: 4, status: 'belum', due: '19 Nov', agent: 'mars', day: 1, kind: 'konten' }),
    job('sup', 3, { title: 'Kalender produk minggu ini', step: 5, status: 'kerja', due: '17 Nov', agent: 'somia', day: 1, kind: 'konten', copy: 'Contoh. Feed katalog, Reels unboxing, Story stok.' }),
    job('sup', 4, { title: 'Caption katalog film PPF', step: 6, status: 'kerja', due: '18 Nov', agent: 'kata', day: 2, kind: 'konten', copy: 'Contoh caption. Jenis film, kegunaan, dan ajakan cek stok.' }),
    job('sup', 5, { title: 'Script unboxing 20 detik', step: 7, status: 'kerja', due: '19 Nov', agent: 'kata', day: 2, kind: 'konten', script: 'Contoh script. Buka roll, sebut nama film, tutup dengan stok ready.' }),
    job('sup', 6, { title: 'Edit video unboxing', step: 9, status: 'kerja', due: '20 Nov', agent: 'vira', day: 4, kind: 'konten' }),
    job('sup', 7, { title: 'Gambar katalog film', step: 10, status: 'kerja', due: '20 Nov', agent: 'grady', day: 4, kind: 'konten' }),
    job('sup', 8, { title: 'Iklan stok film PPF', step: 11, status: 'tunggu', due: '21 Nov', agent: 'expi', day: 5, kind: 'iklan', copy: 'Stok film PPF ready. Contoh teks iklan, mohon disetujui Pak.' }),
    job('sup', 9, { title: 'Story stok ready', step: 12, status: 'selesai', due: '16 Nov', agent: 'somia', day: 6, kind: 'konten', copy: 'Sudah dijadwalkan. Contoh.' }),
  ],
  'rmoda-Makassar': [
    job('mks', 1, { title: 'Riset iklan coating Makassar', step: 1, status: 'kerja', due: '18 Nov', agent: 'mars', day: 0, kind: 'iklan', copy: 'Contoh. Orang di Makassar mencari coating dan PPF untuk mobil harian.' }),
    job('mks', 2, { title: 'Analisa iklan PPF sekitar Makassar', step: 2, status: 'selesai', due: '16 Nov', agent: 'mars', day: 0, kind: 'iklan', copy: 'Contoh. Iklan yang langsung sebut kota dan hasil lebih sering diklik.' }),
    job('mks', 3, { title: 'Ide iklan PPF full body Makassar', step: 3, status: 'kerja', due: '18 Nov', agent: 'mars', day: 1, kind: 'iklan', copy: 'Contoh ide. Mobil kota, PPF full body, ajakan chat.' }),
    job('mks', 4, { title: 'Kalender iklan minggu ini', step: 5, status: 'kerja', due: '17 Nov', agent: 'somia', day: 1, kind: 'iklan', copy: 'Contoh. Dua iklan Meta dan satu story promo.' }),
    job('mks', 5, { title: 'Copy iklan Meta coating Makassar', step: 6, status: 'kerja', due: '18 Nov', agent: 'kata', day: 2, kind: 'iklan', copy: 'Coating di Makassar. Hasil lebih rapi, booking minggu ini. Contoh.' }),
    job('mks', 6, { title: 'Script 15 detik PPF Makassar', step: 7, status: 'kerja', due: '19 Nov', agent: 'kata', day: 2, kind: 'iklan', script: 'Contoh. Mobil masuk bengkel. PPF dipasang. Teks: PPF full body Makassar. Ajak chat.' }),
    job('mks', 7, { title: 'Footage mobil customer Makassar', step: 8, status: 'belum', due: '20 Nov', agent: 'lapangan', day: 3, kind: 'iklan' }),
    job('mks', 8, { title: 'Edit iklan PPF Makassar', step: 9, status: 'kerja', due: '20 Nov', agent: 'vira', day: 4, kind: 'iklan', copy: 'Contoh. Potongan 15 detik, kota disebut di detik pertama.' }),
    job('mks', 9, { title: 'Gambar iklan coating Makassar', step: 10, status: 'kerja', due: '20 Nov', agent: 'grady', day: 4, kind: 'iklan', copy: 'Contoh. Judul besar, nama kota, tanpa wajah orang.' }),
    job('mks', 10, { title: 'Iklan Meta coating Makassar', step: 11, status: 'tunggu', due: '21 Nov', agent: 'rmo', day: 5, kind: 'iklan', copy: 'Coating Makassar, ajakan chat WA. Contoh iklan, mohon disetujui Pak.', script: 'Teks: Coating Makassar. Booking minggu ini.' }),
    job('mks', 11, { title: 'Iklan PPF full body Makassar', step: 11, status: 'tunggu', due: '21 Nov', agent: 'rmo', day: 5, kind: 'iklan', copy: 'PPF full body untuk mobil harian Makassar. Contoh, mohon dilihat Pak.' }),
    job('mks', 12, { title: 'Story promo akhir pekan', step: 12, status: 'selesai', due: '16 Nov', agent: 'somia', day: 6, kind: 'konten', copy: 'Sudah masuk jadwal tayang. Contoh.' }),
  ],
  'rmoda-BSD': [
    job('bsd', 1, { title: 'Riset iklan coating BSD', step: 1, status: 'kerja', due: '18 Nov', agent: 'mars', day: 0, kind: 'iklan', copy: 'Contoh. Pencarian coating di BSD ramai di sore hari.' }),
    job('bsd', 2, { title: 'Copy iklan Meta coating BSD', step: 6, status: 'kerja', due: '19 Nov', agent: 'kata', day: 2, kind: 'iklan', copy: 'Coating di bengkel BSD. Contoh ajakan booking.' }),
    job('bsd', 3, { title: 'Edit iklan BSD', step: 9, status: 'kerja', due: '20 Nov', agent: 'vira', day: 4, kind: 'iklan' }),
    job('bsd', 4, { title: 'Iklan Meta coating BSD', step: 11, status: 'tunggu', due: '21 Nov', agent: 'rmo', day: 5, kind: 'iklan', copy: 'Contoh iklan jual coating BSD. Mohon disetujui Pak.' }),
  ],
  'rmoda-Legok': [
    job('lgk', 1, { title: 'Riset iklan PPF Legok', step: 1, status: 'kerja', due: '18 Nov', agent: 'mars', day: 0, kind: 'iklan', copy: 'Contoh. Pemilik mobil di Legok bertanya PPF harian.' }),
    job('lgk', 2, { title: 'Script iklan PPF Legok', step: 7, status: 'kerja', due: '19 Nov', agent: 'kata', day: 2, kind: 'iklan', script: 'Contoh. Sebut Legok di awal, lalu hasil PPF, lalu ajakan datang.' }),
    job('lgk', 3, { title: 'Iklan PPF Legok', step: 11, status: 'tunggu', due: '21 Nov', agent: 'rmo', day: 5, kind: 'iklan', copy: 'Contoh iklan PPF Legok untuk disetujui Pak.' }),
    job('lgk', 4, { title: 'Story hasil PPF', step: 12, status: 'selesai', due: '16 Nov', agent: 'somia', day: 6, kind: 'konten', copy: 'Sudah dijadwalkan. Contoh.' }),
  ],
};

const st = { brand: 'academy', loc: 'Makassar', view: '', drawer: '', revise: '' };
let ctx = null;
let timer = 0;

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id' + Date.now());
const known = (id) => ['academy', 'supplies', 'rmoda', 'expc', 'proflex', 'cuy'].includes(id);
const pmOf = () => (st.brand === 'rmoda' ? 'Rmo' : 'Expi');
const dataKey = () => (st.brand === 'rmoda' ? 'rmoda-' + st.loc : st.brand);

function readWork() {
  try {
    const raw = JSON.parse(localStorage.getItem(WORK_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}
function saveWork(map) {
  try { localStorage.setItem(WORK_KEY, JSON.stringify(map)); } catch { /* browser menolak */ }
}
function tasks() {
  const map = readWork();
  return (DATA[dataKey()] || []).map((t) => ({ ...t, ...(map[t.id] || {}) }));
}
function waiting() {
  return tasks().filter((t) => t.status === 'tunggu');
}

function loadCmds() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((x) => x && known(x.brand) && x.text && x.createdAt) : [];
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
export function sendCommand(brand, text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (!clean) return Promise.resolve({ ok: false, error: 'Tulis perintah dulu.' });
  if (!known(brand)) return Promise.resolve({ ok: false, error: 'Brand tidak dikenal.' });
  const item = { id: uid(), brand, text: clean, createdAt: Date.now() };
  try { localStorage.setItem(KEY, JSON.stringify([item, ...loadCmds()].slice(0, KEEP))); }
  catch { return Promise.resolve({ ok: false, error: 'Browser menolak menyimpan antrian demo.' }); }
  return Promise.resolve({ ok: true, item: { ...item, status: 'Antri' } });
}

const dayName = (i) => ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'][i];
function greet() {
  const h = new Date().getHours();
  if (h < 11) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 18) return 'Selamat sore';
  return 'Selamat malam';
}
const avatar = (id) => {
  const a = AGENTS[id] || AGENTS.lapangan;
  return `<span class="kai-av" style="--a:${a.a};--b:${a.b}" title="${a.name}">${a.initials}</span>`;
};
const ico = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICO = {
  home: ico('<path d="M4 11 12 4l8 7v8H4z"/><path d="M10 19v-5h4v5"/>'),
  flow: ico('<path d="M4 7h6v4H4zM14 7h6v4h-6zM9 13h6v4H9z"/><path d="M7 11v2h5M17 11v2h-5"/>'),
  cal: ico('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>'),
  ok: ico('<circle cx="12" cy="12" r="8"/><path d="m8.5 12 2.2 2.2 4.8-5"/>'),
};

function side(esc) {
  const n = waiting().length;
  const links = NAV.map(([id, label, short]) => {
    const on = st.view === id;
    const icon = id === '' ? ICO.home : id === 'alur' ? ICO.flow : id === 'kalender' ? ICO.cal : ICO.ok;
    const badge = id === 'setuju' ? `<span class="kai-count${n ? '' : ' is-zero'}">${n}</span>` : '';
    return `<a href="#/ai-office${id ? '/' + id : ''}" class="${on ? 'on' : ''}"${on ? ' aria-current="page"' : ''}>${icon}<span class="kai-lab">${esc(label)}</span><span class="kai-short">${esc(short)}</span>${badge}</a>`;
  }).join('');
  const pills = BRANDS.map((b) => `<button type="button" data-brand="${b.id}" aria-pressed="${st.brand === b.id}">${esc(b.name)}</button>`).join('')
    + '<button type="button" disabled>Proflex · Segera</button>';
  const locs = st.brand === 'rmoda'
    ? `<div class="kai-locs" role="group" aria-label="Cabang">${['BSD', 'Legok', 'Makassar'].map((l) => `<button type="button" data-loc="${l}" aria-pressed="${st.loc === l}">${l}</button>`).join('')}</div>`
    : '';
  return `<aside class="ai-side"><div class="kai-pills" role="group" aria-label="Pilih brand">${pills}</div>${locs}<nav class="ai-nav" aria-label="Kantor AI">${links}</nav></aside>`;
}

function cmdBar(esc) {
  const who = pmOf();
  const where = st.brand === 'rmoda' ? ' untuk ' + st.loc : '';
  const last = loadCmds().find((x) => x.brand === (st.brand === 'rmoda' ? 'rmoda' : st.brand));
  const chip = last ? commandStatus(last) : 'Demo';
  return `<form class="kai-cmd" data-brand="${st.brand === 'rmoda' ? 'rmoda' : st.brand}">
    <span class="kai-demo" id="kaiDemo" title="Contoh. Belum terkirim ke agen.">${esc(chip === 'Demo' ? 'Demo' : chip)}</span>
    <label class="kai-sr" for="kaiCmd">Perintah</label>
    <input class="inp" id="kaiCmd" maxlength="500" placeholder="Beri perintah ke ${who}${where}..." aria-describedby="kaiDemo">
    <button class="btn" type="submit">Kirim</button>
  </form>`;
}

function home(esc) {
  const list = tasks();
  const nums = [
    [waiting().length, 'menunggu Pak'],
    [list.filter((t) => t.status === 'kerja').length, 'sedang dikerjakan'],
    [list.filter((t) => t.status === 'selesai').length, 'sudah selesai'],
  ];
  const people = st.brand === 'rmoda'
    ? ['rmo', 'mars', 'somia', 'kata', 'vira', 'grady']
    : ['expi', 'mars', 'somia', 'kata', 'vira', 'grady'];
  const date = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
  const place = st.brand === 'rmoda' ? 'RMODA ' + st.loc : BRANDS.find((b) => b.id === st.brand).name;
  return `<header class="kai-hello"><p class="kai-kicker">${esc(place)}</p><h2>${greet()}, Pak Nicholas</h2><p class="muted">${esc(date)}. Angka di bawah ini contoh.</p></header>
    <div class="kai-metrics">${nums.map(([n, l]) => `<article><b>${n}</b><span>${l}</span></article>`).join('')}</div>
    <section class="kai-team"><h3>Tim yang mengerjakan</h3><ul>${people.map((id) => `<li>${avatar(id)}<span><b>${AGENTS[id].name}</b><small>${AGENTS[id].role}</small></span></li>`).join('')}<li>${avatar('lapangan')}<span><b>Tim lapangan</b><small>Take video</small></span></li></ul></section>
    ${waiting().length ? '<a class="btn btn--primary kai-go" href="#/ai-office/setuju">Lihat persetujuan</a>' : '<p class="muted">Tidak ada yang menunggu persetujuan.</p>'}`;
}

function card(esc, t) {
  const a = AGENTS[t.agent] || AGENTS.lapangan;
  return `<article class="kai-card">
    <header><b>${esc(t.title)}</b><span class="kai-step">${esc(STEPS[t.step] || '')}</span></header>
    <p class="kai-who">${avatar(t.agent)}<span>${esc(a.name)}</span></p>
    <p class="kai-meta"><span class="kai-st kai-st--${t.status}">${STATUS[t.status]}</span><span>Tenggat ${esc(t.due)}</span></p>
    <button type="button" class="btn kai-look" data-open="${esc(t.id)}">Lihat hasil</button>
  </article>`;
}

function board(esc) {
  const list = tasks();
  const cols = GROUPS.map(([id, name]) => {
    const items = list.filter((t) => GROUP_OF(t.step) === id);
    return `<section class="kai-col"><header><b>${esc(name)}</b><span>${items.length}</span></header>${items.map((t) => card(esc, t)).join('') || '<p class="muted">Kosong</p>'}</section>`;
  }).join('');
  return `<header class="kai-hello"><h2>Alur konten</h2><p class="muted">Empat bagian. Geser ke samping di HP.</p></header><div class="kai-board">${cols}</div>`;
}

function calendar(esc) {
  const list = tasks();
  const days = Array.from({ length: 7 }, (_, i) => {
    const items = list.filter((t) => t.day === i);
    const body = items.map((t) => `<p class="kai-slot kai-slot--${t.status}"><b>${esc(t.kind === 'iklan' ? 'Iklan' : 'Konten')}</b> ${esc(t.title)}</p>`).join('') || '<p class="muted">Kosong</p>';
    return `<section class="kai-day"><header>${dayName(i)}</header>${body}</section>`;
  }).join('');
  return `<header class="kai-hello"><h2>Kalender</h2><p class="muted">Minggu ini. Warna mengikuti status. Contoh.</p></header><div class="kai-week">${days}</div>`;
}

function approve(esc) {
  const list = waiting();
  const row = (t) => `<article class="kai-approve">
    <div>${avatar(t.agent)}<div><b>${esc(t.title)}</b><p class="muted">${esc(STEPS[t.step])} · tenggat ${esc(t.due)}</p><p>${esc(t.copy || t.script || 'Belum ada hasil contoh.')}</p></div></div>
    <div class="kai-actions">
      <button type="button" class="btn btn--primary" data-yes="${esc(t.id)}">Setujui</button>
      <button type="button" class="btn" data-no="${esc(t.id)}">Minta revisi</button>
      ${st.revise === t.id ? `<label class="kai-note">Catatan<textarea class="inp" data-note="${esc(t.id)}" rows="2" maxlength="240" placeholder="Apa yang perlu diperbaiki?"></textarea><button type="button" class="btn" data-save="${esc(t.id)}">Simpan catatan</button></label>` : ''}
    </div>
  </article>`;
  return `<header class="kai-hello"><h2>Perlu persetujuan</h2><p class="muted">Setujui atau minta revisi. Hanya tersimpan di browser ini.</p></header>
    <div class="kai-list">${list.map(row).join('') || '<p class="kai-empty">Tidak ada yang menunggu.</p>'}</div>`;
}

function sheet(esc) {
  const t = tasks().find((x) => x.id === st.drawer);
  if (!t) return '';
  const a = AGENTS[t.agent] || AGENTS.lapangan;
  return `<div class="kai-shade" data-close="1"></div>
    <aside class="kai-sheet" role="dialog" aria-modal="true" aria-label="Hasil">
      <header><div><p class="kai-step">${esc(STEPS[t.step])}</p><h2>${esc(t.title)}</h2><p class="kai-who">${avatar(t.agent)}<span>${esc(a.name)} · ${STATUS[t.status]}</span></p></div><button type="button" class="iconbtn" data-close="1" aria-label="Tutup">×</button></header>
      <div class="kai-ph" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="m8 15 3-3 2 2 3-4 2 5"/></svg><span>Contoh gambar</span></div>
      ${t.copy ? `<section><h3>Teks</h3><p>${esc(t.copy)}</p></section>` : ''}
      ${t.script ? `<section><h3>Script</h3><p>${esc(t.script)}</p></section>` : ''}
      ${t.note ? `<section><h3>Catatan revisi</h3><p>${esc(t.note)}</p></section>` : ''}
      ${!t.copy && !t.script ? '<p class="muted">Hasil contoh belum diisi untuk tugas ini.</p>' : ''}
      ${t.status === 'tunggu' ? `<div class="kai-actions"><button type="button" class="btn btn--primary" data-yes="${esc(t.id)}">Setujui</button><button type="button" class="btn" data-no="${esc(t.id)}">Minta revisi</button></div>` : ''}
    </aside>`;
}

function arm() {
  clearTimeout(timer);
  if (!document.getElementById('kaiShell') || !ctx) return;
  const brand = st.brand === 'rmoda' ? 'rmoda' : st.brand;
  if (!loadCmds().some((x) => x.brand === brand && commandStatus(x) !== 'Selesai')) return;
  timer = setTimeout(() => {
    const el = document.getElementById('kaiDemo');
    const last = loadCmds().find((x) => x.brand === brand);
    if (el && last) el.textContent = commandStatus(last);
    arm();
  }, 500);
}

function bind() {
  const { esc } = ctx;
  const root = document.getElementById('view');
  root.querySelectorAll('.kai-pills [data-brand]').forEach((btn) => {
    btn.onclick = () => { st.brand = btn.dataset.brand; st.drawer = ''; st.revise = ''; paint(); };
  });
  root.querySelectorAll('[data-loc]').forEach((btn) => {
    btn.onclick = () => { st.loc = btn.dataset.loc; st.drawer = ''; paint(); };
  });
  root.querySelectorAll('[data-open]').forEach((btn) => { btn.onclick = () => { st.drawer = btn.dataset.open; paint(); }; });
  root.querySelectorAll('[data-close]').forEach((btn) => { btn.onclick = () => { st.drawer = ''; paint(); }; });
  root.querySelectorAll('[data-yes]').forEach((btn) => {
    btn.onclick = () => {
      const map = readWork();
      map[btn.dataset.yes] = { status: 'selesai', step: 12 };
      saveWork(map);
      st.drawer = '';
      paint();
    };
  });
  root.querySelectorAll('[data-no]').forEach((btn) => {
    btn.onclick = () => {
      st.revise = btn.dataset.no;
      st.drawer = '';
      if (location.hash !== '#/ai-office/setuju') location.hash = '#/ai-office/setuju';
      else paint();
    };
  });
  root.querySelectorAll('[data-save]').forEach((btn) => {
    btn.onclick = () => {
      const box = root.querySelector(`[data-note="${btn.dataset.save}"]`);
      const note = (box?.value || '').replace(/\s+/g, ' ').trim();
      if (!note) return;
      const map = readWork();
      map[btn.dataset.save] = { status: 'revisi', note };
      saveWork(map);
      st.revise = '';
      paint();
    };
  });
  const form = root.querySelector('.kai-cmd');
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const box = form.querySelector('input');
      const res = await sendCommand(form.dataset.brand, box.value);
      const demo = document.getElementById('kaiDemo');
      if (!res.ok) { if (demo) demo.textContent = res.error; return; }
      box.value = '';
      if (demo) demo.textContent = 'Antri';
      arm();
    };
  }
  root.querySelectorAll('.ai-nav').forEach((bar) => {
    const on = bar.querySelector('a.on');
    if (!on || bar.scrollWidth <= bar.clientWidth + 2) return;
    const fade = 40;
    const view = bar.clientWidth;
    const max = Math.max(0, bar.scrollWidth - view);
    const navLeft = bar.getBoundingClientRect().left;
    const rect = on.getBoundingClientRect();
    const itemLeft = rect.left - navLeft + bar.scrollLeft;
    let target = itemLeft - fade;
    if (itemLeft + rect.width - target > view - fade) target = itemLeft + rect.width - (view - fade);
    bar.scrollLeft = Math.max(0, Math.min(max, target));
  });
  arm();
}

function paint() {
  const { esc, setHead } = ctx;
  setHead('Kantor AI');
  const root = document.getElementById('view');
  if (!root) return;
  const body = st.view === 'alur' ? board(esc) : st.view === 'kalender' ? calendar(esc) : st.view === 'setuju' ? approve(esc) : home(esc);
  root.innerHTML = `<div class="kai-shell" id="kaiShell" data-kai="${st.brand}">${side(esc)}<div class="kai-main"><div class="kai-scroll">${body}</div>${cmdBar(esc)}</div>${sheet(esc)}</div>`;
  bind();
}

export function viewAiOffice(next, sub) {
  ctx = next;
  st.view = ['alur', 'kalender', 'setuju'].includes(sub) ? sub : '';
  paint();
}
