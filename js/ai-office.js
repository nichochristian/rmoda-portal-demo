// Team Project demo. Satu pintu pengirim: sendCommand.
// Demo hanya menulis antrian di localStorage. Tidak ada fetch, webhook, atau key.

const KEY = 'rmoda-portal-ai-commands';
const WORK_KEY = 'rmoda-portal-ai-work';
const PROJ_KEY = 'rmoda-portal-ai-projects';
const ASK_KEY = 'rmoda-portal-ai-agent-asks';
const TEAM_KEY = 'rmoda-portal-ai-team';
const LOG_KEY = 'rmoda-portal-ai-log';
const WEBO_KEY = 'rmoda-portal-webo-queue';
const ACCEPT_MS = 2000;
const WORK_MS = 3200;
const DONE_MS = 4500;
const KEEP = 40;

const AGENTS = {
  mars: { name: 'Mars', role: 'Strategi marketing', initials: 'Ma', cat: 'mkt', a: '#f6e2b8', b: '#e2b15a' },
  beras: { name: 'Beras', role: 'Strategi brand', initials: 'Be', cat: 'mkt', a: '#f3e7c2', b: '#c9a15a' },
  somia: { name: 'Somia', role: 'Media sosial', initials: 'So', cat: 'mkt', a: '#d7f0e4', b: '#7dcbab' },
  econ: { name: 'Econ', role: 'E-commerce', initials: 'Ec', cat: 'mkt', a: '#d9f0ea', b: '#6fbfa8' },
  kata: { name: 'Kata', role: 'Copywriter', initials: 'Ka', cat: 'kreatif', a: '#f8e7c8', b: '#d4b45c' },
  vira: { name: 'Vira', role: 'Video', initials: 'Vi', cat: 'kreatif', a: '#d9e4f8', b: '#8eaae0' },
  grady: { name: 'Grady', role: 'Desain', initials: 'Gr', cat: 'kreatif', a: '#f8d7e4', b: '#e09ab8' },
  expi: { name: 'Expi', role: 'PM EXPC', initials: 'Ex', cat: 'pm', a: '#f6d0cb', b: '#e08b84' },
  rmo: { name: 'Rmo', role: 'PM RMODA Studio', initials: 'Rm', cat: 'pm', a: '#f8d0cc', b: '#e7a19c' },
  flexo: { name: 'Flexo', role: 'PM Proflex', initials: 'Fx', cat: 'pm', a: '#d9e4f8', b: '#9bb0e0' },
  cuy: { name: 'Cuy', role: 'Executive Assistant', initials: 'Cu', cat: 'pm', a: '#e7e2d6', b: '#c4bba8' },
  herra: { name: 'Herra', role: 'HR', initials: 'He', cat: 'ops', a: '#f8d7e4', b: '#d7a0b8' },
  ordo: { name: 'Ordo', role: 'Produksi', initials: 'Or', cat: 'ops', a: '#e4dfd6', b: '#b7b0a4' },
  casper: { name: 'Casper', role: 'Inventori', initials: 'Ca', cat: 'ops', a: '#d7f0e4', b: '#8fbfa8' },
  sekura: { name: 'Sekura', role: 'Keamanan', initials: 'Sk', cat: 'ops', a: '#d9e4f8', b: '#8aa0c8' },
  webo: { name: 'Webo', role: 'Web', initials: 'We', cat: 'ops', a: '#e4e7f8', b: '#a0a8d0' },
  finci: { name: 'Finci', role: 'Keuangan', initials: 'Fi', cat: 'uang', a: '#f6e7c2', b: '#d4c07a' },
  lexa: { name: 'Lexa', role: 'Legal', initials: 'Lx', cat: 'uang', a: '#e4dfd6', b: '#c2b8a4' },
  lapangan: { name: 'Tim lapangan', role: 'Take video', initials: 'TL', cat: 'ops', a: '#e4dfd6', b: '#b7b0a4' },
};

const CATS = [
  ['all', 'Semua'],
  ['pm', 'PM'],
  ['mkt', 'Marketing'],
  ['kreatif', 'Kreatif'],
  ['ops', 'Operasional'],
  ['uang', 'Keuangan & Legal'],
];

const STEPS = {
  1: 'Riset Meta Ads', 2: 'Analisa Meta Ads', 3: 'Ide iklan', 4: 'Ide konten',
  5: 'Kalender konten', 6: 'Isi konten', 7: 'Script video', 8: 'Take video',
  9: 'Edit video', 10: 'Desain', 11: 'Approval Pak', 12: 'Jadwal tayang',
};
const GROUPS = [['riset', 'Riset & Ide'], ['produksi', 'Produksi'], ['approval', 'Approval'], ['tayang', 'Tayang']];
const GROUP_OF = (step) => (step <= 4 ? 'riset' : step <= 10 ? 'produksi' : step === 11 ? 'approval' : 'tayang');
const STATUS = { diterima: 'Diterima', kerja: 'Dikerjakan', tunggu: 'Menunggu persetujuan', revisi: 'Revisi', selesai: 'Selesai' };
const normStatus = (s) => (s === 'belum' || s === 'antre' || s === 'Antre' ? 'diterima' : (STATUS[s] ? s : 'diterima'));
const NAV = [
  ['', 'Beranda', 'Beranda'],
  ['project', 'Project', 'Project'],
  ['kalender', 'Kalender', 'Kalender'],
  ['setuju', 'Perlu persetujuan', 'Setujui'],
];
const BRANDS = [
  { id: 'academy', name: 'EXPC Academy' },
  { id: 'supplies', name: 'EXPC Supplies' },
  { id: 'rmoda', name: 'RMODA Studio', locs: ['BSD', 'Legok', 'Makassar'] },
  { id: 'proflex', name: 'Proflex' },
];

const task = (id, row) => ({ id, kind: 'konten', day: 0, copy: '', script: '', ...row });
const SEEDS = [
  {
    id: 'p-fase2', name: 'Fase 2 Team Project EXPC', goal: 'Kerja fase 2 bersama tim EXPC Academy.', due: '20 Des',
    scope: 'one', brands: [{ id: 'academy' }], pm: 'expi', agents: ['kata', 'grady', 'vira', 'webo'],
    tasks: [
      task('p-fase2-1', { title: 'Riset kebutuhan fase 2', step: 1, status: 'diterima', due: '2 Des', agent: 'expi', day: 0, copy: 'Contoh riset. Kebutuhan kelas dan halaman fase 2.' }),
      task('p-fase2-2', { title: 'Teks landing fase 2', step: 6, status: 'kerja', due: '6 Des', agent: 'kata', day: 2, copy: 'Contoh teks. Ajakan ikut fase 2, tanpa nama brand baru.' }),
      task('p-fase2-3', { title: 'Desain sampul fase 2', step: 10, status: 'kerja', due: '8 Des', agent: 'grady', day: 3, copy: 'Contoh desain. Judul fase 2, tanpa wajah.' }),
      task('p-fase2-4', { title: 'Video penjelasan fase 2', step: 9, status: 'revisi', due: '10 Des', agent: 'vira', day: 4, note: 'Perpendek jadi di bawah 30 detik.', copy: 'Contoh video. Penjelasan singkat fase 2.' }),
      task('p-fase2-5', { title: 'Halaman web fase 2', step: 10, status: 'tunggu', due: '12 Des', agent: 'webo', day: 5, copy: 'Contoh halaman. Mohon disetujui Pak sebelum tayang.' }),
      task('p-fase2-6', { title: 'Jadwal tayang fase 2', step: 12, status: 'selesai', due: '1 Des', agent: 'expi', day: 6, copy: 'Sudah masuk jadwal. Contoh.' }),
    ],
  },
  {
    id: 'p-des', name: 'Konten rutin EXPC Des', goal: 'Konten kelas dan produk rutin bulan Desember.', due: '31 Des',
    scope: 'one', brands: [{ id: 'academy' }], pm: 'expi', agents: ['mars', 'somia', 'kata', 'vira', 'grady'],
    tasks: [
      task('p-des-1', { title: 'Riset iklan kelas coating', step: 1, status: 'kerja', due: '18 Nov', agent: 'mars', day: 0, kind: 'iklan', copy: 'Contoh riset. Orang mencari kelas coating.' }),
      task('p-des-2', { title: 'Kalender konten minggu ini', step: 5, status: 'kerja', due: '17 Nov', agent: 'somia', day: 1, copy: 'Contoh. Senin Reels, Rabu Feed, Jumat Story.' }),
      task('p-des-3', { title: 'Caption Reels 3 kesalahan', step: 6, status: 'kerja', due: '18 Nov', agent: 'kata', day: 2, copy: 'Contoh caption. Tiga kesalahan saat coating.' }),
      task('p-des-4', { title: 'Edit Reels kesalahan coating', step: 9, status: 'kerja', due: '20 Nov', agent: 'vira', day: 4, copy: 'Contoh. Video di bawah 30 detik.' }),
      task('p-des-5', { title: 'Story pengumuman kelas', step: 11, status: 'tunggu', due: '21 Nov', agent: 'expi', day: 5, copy: 'Kelas coating batch contoh dibuka. Mohon dilihat Pak.' }),
      task('p-des-6', { title: 'Feed reminder kelas', step: 12, status: 'selesai', due: '16 Nov', agent: 'somia', day: 6, copy: 'Sudah masuk jadwal tayang. Contoh.' }),
    ],
  },
  {
    id: 'p-jan', name: 'Kelas EXPC Jan', goal: 'Ajakan dan materi kelas Januari.', due: '15 Jan',
    scope: 'one', brands: [{ id: 'academy' }], pm: 'expi', agents: ['somia', 'kata', 'vira'],
    tasks: [
      task('p-jan-1', { title: 'Ide konten kelas Januari', step: 4, status: 'kerja', due: '2 Des', agent: 'somia', day: 1, copy: 'Contoh ide. Jadwal kelas dan ajakan daftar.' }),
      task('p-jan-2', { title: 'Script cara daftar kelas', step: 7, status: 'kerja', due: '5 Des', agent: 'kata', day: 3, script: 'Contoh script. Tiga langkah daftar, tutup dengan ajakan.' }),
      task('p-jan-3', { title: 'Persetujuan materi kelas', step: 11, status: 'tunggu', due: '8 Des', agent: 'expi', day: 5, copy: 'Materi kelas Januari. Mohon disetujui Pak.' }),
    ],
  },
  {
    id: 'p-mks', name: 'Iklan Meta RMODA Makassar', goal: 'Iklan Meta untuk coating dan PPF di Makassar.', due: '30 Nov',
    scope: 'one', brands: [{ id: 'rmoda', loc: 'Makassar' }], pm: 'rmo', agents: ['mars', 'kata', 'vira', 'grady'],
    tasks: [
      task('p-mks-1', { title: 'Riset iklan coating Makassar', step: 1, status: 'kerja', due: '18 Nov', agent: 'mars', day: 0, kind: 'iklan', copy: 'Contoh. Pencarian coating dan PPF di Makassar.' }),
      task('p-mks-2', { title: 'Copy iklan Meta coating', step: 6, status: 'kerja', due: '18 Nov', agent: 'kata', day: 2, kind: 'iklan', copy: 'Coating di Makassar. Booking minggu ini. Contoh.' }),
      task('p-mks-3', { title: 'Edit iklan PPF Makassar', step: 9, status: 'kerja', due: '20 Nov', agent: 'vira', day: 4, kind: 'iklan', copy: 'Contoh. Kota disebut di detik pertama.' }),
      task('p-mks-4', { title: 'Iklan Meta coating Makassar', step: 11, status: 'tunggu', due: '21 Nov', agent: 'rmo', day: 5, kind: 'iklan', copy: 'Coating Makassar, ajakan chat. Mohon disetujui Pak.', script: 'Teks: Coating Makassar.' }),
      task('p-mks-5', { title: 'Story promo akhir pekan', step: 12, status: 'selesai', due: '16 Nov', agent: 'somia', day: 6, copy: 'Sudah masuk jadwal tayang. Contoh.' }),
    ],
  },
  {
    id: 'p-rebrand', name: 'Rebrand brand', goal: 'Contoh project netral untuk RMODA Studio. Nama brand baru tidak ditulis.', due: '28 Feb',
    scope: 'one', brands: [{ id: 'rmoda' }], pm: 'rmo', agents: ['mars', 'grady', 'kata'],
    tasks: [
      task('p-rebrand-1', { title: 'Riset arah visual', step: 1, status: 'kerja', due: '10 Des', agent: 'mars', day: 0, copy: 'Contoh riset. Tanpa nama brand baru.' }),
      task('p-rebrand-2', { title: 'Teks pengantar', step: 6, status: 'diterima', due: '12 Des', agent: 'kata', day: 2, copy: 'Contoh teks netral untuk RMODA Studio.' }),
      task('p-rebrand-3', { title: 'Persetujuan arah', step: 11, status: 'tunggu', due: '20 Des', agent: 'rmo', day: 5, copy: 'Arah visual contoh. Mohon dilihat Pak.' }),
    ],
  },
];

const WEBO_SEED = [
  { id: 'w1', page: 'Team Project', device: 'HP 390x844', file: '', note: 'Daftar project terasa rapat di HP.', priority: 'Biasa', status: 'Dikerjakan', createdAt: 1 },
  { id: 'w2', page: 'Work Tracker', device: 'Desktop 1440x900', file: 'papan.png', note: 'Kolom papan kepotong di layar lebar.', priority: 'Penting', status: 'Siap dicek di demo', createdAt: 2 },
  { id: 'w3', page: 'Beranda', device: 'HP 390x844', file: '', note: 'Angka ringkasan sudah dicek Pak.', priority: 'Biasa', status: 'Diterima', createdAt: 3 },
];

const st = { brand: 'academy', loc: 'Makassar', view: '', projectId: '', tab: 'papan', drawer: '', revise: '', reviseErr: '', form: null, ask: false, cat: 'all', teamEdit: '', pick: null };
let ctx = null;
let timer = 0;

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id' + Date.now());
const known = (id) => ['academy', 'supplies', 'rmoda', 'proflex', 'cuy', 'expc'].includes(id);
const dayName = (i) => ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'][i];

function readJson(key, fallback) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || 'null');
    return raw == null ? fallback : raw;
  } catch {
    return fallback;
  }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
function readWork() {
  const raw = readJson(WORK_KEY, {});
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}
function migrateWork() {
  const map = readWork();
  let dirty = false;
  Object.keys(map).forEach((id) => {
    const row = map[id];
    if (row && row.status && normStatus(row.status) !== row.status) {
      map[id] = { ...row, status: normStatus(row.status) };
      dirty = true;
    }
  });
  if (dirty) writeJson(WORK_KEY, map);
}
function brandRank(p) {
  const id = (p.brands || [])[0]?.id;
  if (id === 'academy') return 0;
  if (id === 'supplies') return 1;
  if (id === 'rmoda') return 2;
  return 3;
}
function baseProjects() {
  const saved = readJson(PROJ_KEY, []);
  const extra = Array.isArray(saved) ? saved.filter((p) => p && p.id && !SEEDS.some((s) => s.id === p.id)) : [];
  return [...SEEDS, ...extra];
}
function teamPatch(id) {
  const all = readJson(TEAM_KEY, {});
  return all && typeof all === 'object' ? (all[id] || null) : null;
}
function saveTeam(id, next) {
  const all = readJson(TEAM_KEY, {});
  const bag = all && typeof all === 'object' && !Array.isArray(all) ? all : {};
  bag[id] = { pm: next.pm, agents: next.agents };
  writeJson(TEAM_KEY, bag);
}
function withTeam(p) {
  const o = teamPatch(p.id);
  if (!o) return p;
  return { ...p, pm: o.pm || p.pm, agents: o.agents || p.agents };
}
function projects() {
  return baseProjects().map(withTeam).sort((a, b) => brandRank(a) - brandRank(b) || String(a.name).localeCompare(String(b.name), 'id'));
}
function addLog(projectId, text) {
  if (!projectId || !text) return;
  const list = readJson(LOG_KEY, []);
  const row = { id: uid(), projectId, text, createdAt: Date.now() };
  writeJson(LOG_KEY, [row, ...(Array.isArray(list) ? list : [])].slice(0, 80));
}
const SEED_LOGS = [
  { id: 'log-fase-1', projectId: 'p-fase2', text: 'Perintah ke Expi: Siapkan kalender fase 2', createdAt: Date.now() - 86400000 },
  { id: 'log-fase-2', projectId: 'p-fase2', text: 'Agent ditambah: Webo', createdAt: Date.now() - 7200000 },
];
function logsOf(projectId) {
  const saved = readJson(LOG_KEY, []);
  const extra = Array.isArray(saved) ? saved.filter((x) => x && x.projectId === projectId) : [];
  const seeds = SEED_LOGS.filter((x) => x.projectId === projectId);
  const ids = new Set(extra.map((x) => x.id));
  return [...extra, ...seeds.filter((x) => !ids.has(x.id))].sort((a, b) => b.createdAt - a.createdAt);
}
function findProject(id) { return projects().find((p) => p.id === id) || null; }
function tasksOf(p) {
  if (!p) return [];
  const map = readWork();
  return (p.tasks || []).map((t) => {
    const over = map[t.id] || {};
    return { ...t, ...over, status: normStatus(over.status || t.status), note: over.note || t.note || '' };
  });
}
function progressOf(p) {
  const list = tasksOf(p);
  const done = list.filter((t) => t.status === 'selesai').length;
  const wait = list.filter((t) => t.status === 'tunggu').length;
  return { done, wait, total: list.length, pct: list.length ? Math.round((done / list.length) * 100) : 0 };
}
function brandName(id) {
  return { academy: 'EXPC Academy', supplies: 'EXPC Supplies', rmoda: 'RMODA Studio', proflex: 'Proflex' }[id] || 'RMODA Studio';
}
function scopeLine(p) {
  return (p.brands || []).map((b) => brandName(b.id) + (b.loc ? ' ' + b.loc : '')).join(', ') || 'RMODA Studio';
}
function projectMatches(p) {
  if (st.brand === 'holdings') return true;
  return (p.brands || []).some((b) => b.id === st.brand && (st.brand !== 'rmoda' || !b.loc || b.loc === st.loc));
}
function visibleProjects() { return projects().filter(projectMatches); }
function allTasks() {
  return visibleProjects().flatMap((p) => tasksOf(p).map((t) => ({ ...t, project: p })));
}
function waiting() { return allTasks().filter((t) => t.status === 'tunggu'); }
function findTask(id) {
  for (const p of projects()) {
    const t = tasksOf(p).find((x) => x.id === id);
    if (t) return { project: p, task: t };
  }
  return null;
}
function currentProject() { return st.projectId ? findProject(st.projectId) : null; }

function loadCmds() {
  const raw = readJson(KEY, []);
  return Array.isArray(raw) ? raw.filter((x) => x && known(x.brand) && x.text && x.createdAt) : [];
}
export function commandStatus(item, now = Date.now()) {
  const age = now - Number(item.createdAt || 0);
  if (age >= DONE_MS) return 'Selesai';
  if (age >= WORK_MS) return 'Dikerjakan';
  if (age >= ACCEPT_MS) return 'Diterima';
  return 'Terkirim ke PM';
}
function commandChip(item) {
  return commandStatus(item) === 'Terkirim ke PM' ? 'Terkirim (demo)' : commandStatus(item);
}
export function sendCommand(brand, projectId, text) {
  if (text == null) { text = projectId; projectId = ''; }
  const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (!clean) return Promise.resolve({ ok: false, error: 'Tulis perintah dulu.' });
  if (!known(brand)) return Promise.resolve({ ok: false, error: 'Brand tidak dikenal.' });
  const item = { id: uid(), brand, projectId: projectId || '', text: clean, createdAt: Date.now() };
  if (!writeJson(KEY, [item, ...loadCmds()].slice(0, KEEP))) return Promise.resolve({ ok: false, error: 'Browser menolak menyimpan antrian demo.' });
  if (projectId) {
    const who = AGENTS[findProject(projectId)?.pm]?.name || 'PM';
    addLog(projectId, 'Perintah ke ' + who + ': ' + clean);
  }
  return Promise.resolve({ ok: true, item: { ...item, status: 'Terkirim (demo)' } });
}

function readWebo() {
  const raw = readJson(WEBO_KEY, null);
  if (Array.isArray(raw)) return raw;
  writeJson(WEBO_KEY, WEBO_SEED);
  return WEBO_SEED.slice();
}
function saveWebo(list) { writeJson(WEBO_KEY, list); }
export function addFixReport(row) {
  const item = { id: uid(), status: 'Diterima', createdAt: Date.now(), file: '', priority: 'Biasa', ...row };
  saveWebo([item, ...readWebo()].slice(0, 40));
  return item;
}
function readAsks() {
  const raw = readJson(ASK_KEY, []);
  return Array.isArray(raw) ? raw : [];
}

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
  proj: ico('<path d="M4 7h6l2 2h8v10H4z"/>'),
  cal: ico('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>'),
  ok: ico('<circle cx="12" cy="12" r="8"/><path d="m8.5 12 2.2 2.2 4.8-5"/>'),
};
const pmOfBrand = () => (st.brand === 'rmoda' ? 'Rmo' : st.brand === 'proflex' ? 'Flexo' : st.brand === 'holdings' ? 'Cuy' : 'Expi');
function commandBrand(p) {
  if (!p) return st.brand === 'holdings' || st.brand === 'proflex' ? (st.brand === 'proflex' ? 'proflex' : 'cuy') : (st.brand === 'rmoda' ? 'rmoda' : st.brand);
  const ids = [...new Set((p.brands || []).map((b) => b.id))];
  if (p.scope === 'multi' || ids.length !== 1) return 'cuy';
  return ids[0] || 'cuy';
}
function defaultPm(brands, mode) {
  const ids = [...new Set((brands || []).map((b) => b.id))];
  if (mode === 'multi' || ids.length !== 1) return 'cuy';
  if (ids[0] === 'rmoda') return 'rmo';
  if (ids[0] === 'proflex') return 'flexo';
  return 'expi';
}

function side(esc) {
  const n = waiting().length;
  const links = NAV.map(([id, label, short]) => {
    const on = id === 'project' ? st.view === 'project' : st.view === id;
    const icon = id === '' ? ICO.home : id === 'project' ? ICO.proj : id === 'kalender' ? ICO.cal : ICO.ok;
    const badge = id === 'setuju' ? `<span class="kai-count${n ? '' : ' is-zero'}">${n}</span>` : '';
    return `<a href="#/ai-office${id ? '/' + id : ''}" class="${on ? 'on' : ''}"${on ? ' aria-current="page"' : ''}>${icon}<span class="kai-lab">${esc(label)}</span><span class="kai-short">${esc(short)}</span>${badge}</a>`;
  }).join('');
  const pills = `<button type="button" class="kai-hold" data-brand="holdings" aria-pressed="${st.brand === 'holdings'}">Holdings (semua brand)</button>`
    + BRANDS.filter((b) => b.id !== 'proflex').map((b) => `<button type="button" data-brand="${b.id}" aria-pressed="${st.brand === b.id}">${esc(b.name)}</button>`).join('')
    + '<button type="button" disabled>Proflex · Segera</button>';
  const locs = st.brand === 'rmoda'
    ? `<div class="kai-locs" role="group" aria-label="Cabang">${['BSD', 'Legok', 'Makassar'].map((l) => `<button type="button" data-loc="${l}" aria-pressed="${st.loc === l}">${l}</button>`).join('')}</div>`
    : '';
  return `<aside class="ai-side"><div class="kai-pills" role="group" aria-label="Pilih brand">${pills}</div>${locs}<nav class="ai-nav" aria-label="Team Project">${links}</nav><a class="kai-foot" href="#/ai-office/perbaikan">Permintaan perbaikan</a></aside>`;
}

function cmdBar(esc) {
  const project = currentProject();
  const who = project ? (AGENTS[project.pm]?.name || 'Cuy') : pmOfBrand();
  const brand = commandBrand(project);
  const last = loadCmds().find((x) => (project ? x.projectId === project.id : x.brand === brand));
  const chip = last ? commandChip(last) : 'Demo';
  const narrow = window.matchMedia('(max-width: 860px)').matches;
  const ph = narrow ? 'Tulis perintah...' : `Perintah ke ${who}...`;
  return `<form class="kai-cmd" data-brand="${brand}" data-project="${project ? project.id : ''}">
    <span class="kai-demo" id="kaiDemo" title="Contoh. Belum dikirim ke agen sungguhan.">${esc(chip === 'Demo' ? 'Demo' : chip)}</span>
    <label class="kai-sr" for="kaiCmd">Perintah</label>
    <input class="inp" id="kaiCmd" maxlength="500" placeholder="${ph}" aria-describedby="kaiDemo">
    <button class="btn" type="submit">Kirim</button>
  </form>`;
}

function home(esc) {
  if (st.brand === 'holdings') return holdings(esc);
  const list = allTasks();
  const nums = [
    [waiting().length, 'perlu persetujuan'],
    [list.filter((t) => t.status === 'kerja').length, 'sedang dikerjakan'],
    [visibleProjects().length, 'project'],
  ];
  const place = st.brand === 'rmoda' ? 'RMODA Studio ' + st.loc : brandName(st.brand);
  const date = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
  return `<header class="kai-hello"><p class="kai-kicker">${esc(place)}</p><h2>${greet()}, Pak Nicholas</h2><p class="muted">${esc(date)}. Angka di bawah ini contoh.</p></header>
    <div class="kai-metrics">${nums.map(([n, l]) => `<article><b>${n}</b><span>${l}</span></article>`).join('')}</div>
    ${projectCards(esc, visibleProjects().slice(0, 2))}
    <a class="btn btn--primary kai-go" href="#/ai-office/project">Lihat project</a>`;
}

function holdings(esc) {
  const cards = [
    ['rmoda', 'RMODA Studio', false],
    ['academy', 'EXPC Academy', false],
    ['supplies', 'EXPC Supplies', false],
    ['proflex', 'Proflex', true],
  ].map(([id, name, soon]) => {
    const list = projects().filter((p) => (p.brands || []).some((b) => b.id === id));
    const active = list.filter((p) => progressOf(p).pct < 100).length;
    const wait = list.reduce((n, p) => n + progressOf(p).wait, 0);
    const pct = list.length ? Math.round(list.reduce((n, p) => n + progressOf(p).pct, 0) / list.length) : 0;
    return `<article class="kai-brand"><header><b>${esc(name)}</b>${soon ? '<span class="kai-st">Segera</span>' : ''}</header>
      <p><b>${active}</b> project aktif</p><p><b>${wait}</b> perlu persetujuan</p>
      <p class="kai-prog" aria-label="Progres ${pct}%"><i style="width:${pct}%"></i></p><small>${pct}% progres</small></article>`;
  }).join('');
  const feed = activity(esc);
  return `<header class="kai-hello"><p class="kai-kicker">Portal Holdings</p><h2>Semua brand</h2><p class="muted">Ringkasan lintas brand. Contoh, hanya di browser ini.</p></header>
    <button type="button" class="btn btn--primary kai-go" data-new="1">Buat project</button>
    <div class="kai-holdgrid">${cards}</div>
    <section class="kai-block"><h3>Project lintas brand</h3>${projectCards(esc, projects())}</section>
    <section class="kai-block"><h3>Aktivitas agent terbaru</h3><ul class="kai-feed">${feed}</ul></section>`;
}

function activity(esc) {
  const rows = [];
  for (const p of projects()) {
    for (const t of tasksOf(p)) {
      if (t.status === 'selesai' || t.status === 'tunggu') {
        const who = AGENTS[t.agent]?.name || 'Agent';
        rows.push(`<li>${avatar(t.agent)}<span><b>${esc(who)}</b> ${t.status === 'selesai' ? 'selesai' : 'menunggu persetujuan'}: ${esc(t.title)} <small>${esc(p.name)}</small></span></li>`);
      }
    }
  }
  return rows.slice(0, 5).join('') || '<li>Belum ada aktivitas.</li>';
}

function projectCards(esc, list) {
  if (!list.length) return '<p class="kai-empty">Belum ada project.</p>';
  return `<div class="kai-projects">${list.map((p) => {
    const g = progressOf(p);
    const faces = (p.agents || []).slice(0, 4).map(avatar).join('');
    return `<a class="kai-pcard" href="#/ai-office/project/${p.id}">
      <header><b>${esc(p.name)}</b><span class="kai-step">${esc(scopeLine(p))}</span></header>
      <p>${esc(p.goal)}</p>
      <p class="kai-prog" aria-hidden="true"><i style="width:${g.pct}%"></i></p>
      <p class="kai-meta"><span>${g.pct}% progres</span><span>${g.wait} perlu persetujuan</span></p>
      <p class="kai-faces">${faces}</p>
    </a>`;
  }).join('')}</div>`;
}

function projectList(esc) {
  const place = st.brand === 'holdings' ? 'Semua brand' : (st.brand === 'rmoda' ? 'RMODA Studio ' + st.loc : brandName(st.brand));
  return `<header class="kai-hello"><p class="kai-kicker">${esc(place)}</p><h2>Project</h2><p class="muted">Satu project, satu papan. Contoh.</p></header>
    ${projectCards(esc, visibleProjects())}
    <button type="button" class="btn btn--primary kai-go" data-new="1">Buat project</button>`;
}
function crumb(esc) {
  const bits = [{ brand: 'holdings', label: 'Holdings' }];
  const project = currentProject();
  if (st.brand !== 'holdings') {
    bits.push({ brand: st.brand, loc: st.brand === 'rmoda' ? st.loc : '', label: brandName(st.brand) + (st.brand === 'rmoda' ? ' ' + st.loc : '') });
  } else if (project) {
    const b = (project.brands || [])[0];
    if (b) bits.push({ brand: b.id, loc: b.loc || '', label: brandName(b.id) + (b.loc ? ' ' + b.loc : '') });
  }
  if (project) bits.push({ brand: '', label: project.name });
  if (bits.length === 1 && !st.view) return `<nav class="kai-crumb" aria-label="Jejak"><span class="kai-crumb-now">Holdings</span></nav>`;
  return `<nav class="kai-crumb" aria-label="Jejak">${bits.map((b, i) => {
    const label = esc(b.label);
    const last = i === bits.length - 1;
    if (last) return `<span class="kai-crumb-now">${label}</span>`;
    return `<button type="button" data-crumb="${esc(b.brand)}" data-crumb-loc="${esc(b.loc || '')}">${label}</button>`;
  }).join('<span class="kai-crumb-sep" aria-hidden="true">&gt;</span>')}</nav>`;
}

function detail(esc) {
  const p = currentProject();
  if (!p) return `<header class="kai-hello"><h2>Project tidak ada</h2><a href="#/ai-office/project">Kembali ke daftar</a></header>`;
  const tabs = [['papan', 'Papan'], ['file', 'File & hasil'], ['riwayat', 'Riwayat']].map(([id, label]) =>
    `<button type="button" data-tab="${id}" aria-pressed="${st.tab === id}">${label}</button>`).join('');
  const body = st.tab === 'file' ? files(esc, p) : st.tab === 'riwayat' ? history(esc, p) : board(esc, p);
  return `<header class="kai-hello">
    <p class="kai-kicker">${esc(scopeLine(p))}</p><h2>${esc(p.name)}</h2>
    <p>${esc(p.goal)}</p><p class="muted">Tenggat ${esc(p.due || 'belum diisi')}</p></header>
    ${teamBlock(esc, p)}
    <div class="kai-tabs" role="tablist">${tabs}</div>${body}`;
}
function teamBlock(esc, p) {
  const pm = AGENTS[p.pm] || AGENTS.cuy;
  const members = (p.agents || []).filter((id) => id && id !== p.pm);
  const chips = members.map((id) => {
    const a = AGENTS[id] || AGENTS.lapangan;
    return `<span class="kai-chip">${avatar(id)}<span><b>${esc(a.name)}</b><small>${esc(a.role)}</small></span><button type="button" class="kai-x" data-lepas="${id}">Lepas</button></span>`;
  }).join('');
  const empty = members.length ? '' : '<p class="muted">Belum ada anggota. Tambah agent untuk mulai.</p>';
  const picker = st.teamEdit === 'add' ? memberPicker(esc, p) : '';
  const pmBox = st.teamEdit === 'pm' ? `<form class="kai-form" id="kaiPmForm"><label class="kai-field">PM baru<select class="inp" name="pm">${['expi', 'rmo', 'flexo', 'cuy'].map((id) => `<option value="${id}" ${p.pm === id ? 'selected' : ''}>${AGENTS[id].name}</option>`).join('')}</select></label><div class="kai-actions"><button class="btn btn--primary" type="submit">Simpan</button><button type="button" class="btn" data-teamcancel="1">Batal</button></div></form>` : '';
  return `<section class="kai-teamblock"><h3>Tim</h3>
    <div class="kai-chips"><span class="kai-chip kai-chip-pm">${avatar(p.pm)}<span><b>${esc(pm.name)}</b><small>PM</small></span></span>${chips}</div>
    ${empty}
    ${st.teamEdit ? '' : `<div class="kai-actions"><button type="button" class="btn" data-addagent="1">+ Tambah agent</button><button type="button" class="btn" data-gantipm="1">Ganti PM</button><button type="button" class="btn" data-ask="1">+ Minta agent baru</button></div>`}
    ${picker}${pmBox}${askBox(esc)}</section>`;
}
function memberPicker(esc, p) {
  const cat = st.cat || 'all';
  const chosen = new Set(st.pick || []);
  const filters = CATS.map(([id, label]) => `<button type="button" data-cat="${id}" aria-pressed="${cat === id}">${label}</button>`).join('');
  const cards = Object.entries(AGENTS).filter(([id, a]) => id !== 'lapangan' && id !== p.pm && (cat === 'all' || a.cat === cat)).map(([id, a]) =>
    `<article class="kai-agent">${avatar(id)}<b>${esc(a.name)}</b><small>${esc(a.role)}</small>
      <button type="button" class="btn" data-member="${id}" aria-pressed="${chosen.has(id)}">${chosen.has(id) ? 'Terpilih' : 'Pilih'}</button></article>`).join('');
  return `<div class="kai-filters">${filters}</div><div class="kai-agents">${cards}<button type="button" class="kai-agent kai-ask" data-ask="1"><b>+ Minta agent baru</b><small>Catatan ke Cuy, bukan agent baru</small></button></div>
    <div class="kai-actions"><button type="button" class="btn btn--primary" data-saveteam="1">Simpan</button><button type="button" class="btn" data-teamcancel="1">Batal</button></div>`;
}
function askBox(esc) {
  if (!st.ask) return '';
  const asks = readAsks().slice(0, 2).map((a) => `<p class="muted">${esc(a.note)} · ${esc(a.status)}</p>`).join('');
  return `<label class="kai-field">Catatan untuk Cuy<textarea class="inp" id="kaiAsk" rows="2" maxlength="240" placeholder="Agent seperti apa yang dibutuhkan?"></textarea></label><button type="button" class="btn" data-asksave="1">Kirim catatan</button>${asks}`;
}

function board(esc, project) {
  const list = project ? tasksOf(project) : allTasks();
  const cols = GROUPS.map(([id, name]) => {
    const items = list.filter((t) => GROUP_OF(t.step) === id);
    return `<section class="kai-col"><header><b>${esc(name)}</b><span>${items.length}</span></header>${items.map((t) => card(esc, t)).join('') || '<p class="muted">Kosong</p>'}</section>`;
  }).join('');
  const head = project ? '' : `<header class="kai-hello"><h2>Papan</h2></header>`;
  return `${head}<div class="kai-board">${cols}</div>`;
}

function statusBadge(t) {
  const key = normStatus(t.status);
  return `<span class="kai-st kai-st--${key}">${STATUS[key] || key}</span>`;
}
function reviseBox(esc, id) {
  if (st.revise !== id) return '';
  return `<form class="kai-rev" data-revform="${esc(id)}">
    <label class="kai-field">Apa yang perlu diperbaiki?<textarea class="inp" data-note="${esc(id)}" maxlength="240" rows="3"></textarea><span class="kai-countline"><span data-left>0</span>/240</span></label>
    ${st.reviseErr === id ? '<p class="kai-err">Tulis dulu apa yang perlu diperbaiki.</p>' : ''}
    <div class="kai-actions"><button type="submit" class="btn btn--primary">Kirim revisi</button><button type="button" class="btn" data-batal="${esc(id)}">Batal</button></div>
  </form>`;
}
function decide(esc, t) {
  if (normStatus(t.status) !== 'tunggu') return '';
  return `<div class="kai-actions"><button type="button" class="btn btn--primary" data-yes="${esc(t.id)}">Setujui</button><button type="button" class="btn" data-no="${esc(t.id)}">Minta revisi</button>${reviseBox(esc, t.id)}</div>`;
}
function card(esc, t) {
  const a = AGENTS[t.agent] || AGENTS.lapangan;
  const key = normStatus(t.status);
  return `<article class="kai-card">
    <header><b>${esc(t.title)}</b><span class="kai-step">${esc(STEPS[t.step] || '')}</span></header>
    <p class="kai-who">${avatar(t.agent)}<span>${esc(a.name)}</span></p>
    <p class="kai-meta"><span class="kai-st kai-st--${key}">${STATUS[key]}</span><span>Tenggat ${esc(t.due || '')}</span></p>
    ${t.status === 'revisi' && t.note ? `<p class="kai-noteview">${esc(t.note)}</p>` : ''}
    <button type="button" class="btn kai-look" data-open="${esc(t.id)}">Lihat hasil</button>
    ${decide(esc, t)}
  </article>`;
}

function files(esc, p) {
  const list = tasksOf(p).filter((t) => t.copy || t.script);
  if (!list.length) return '<p class="kai-empty">Belum ada hasil contoh.</p>';
  return `<div class="kai-list">${list.map((t) => `<article class="kai-approve"><div>${avatar(t.agent)}<div><b>${esc(t.title)}</b><p>${esc(t.copy || t.script)}</p>${statusBadge(t)}</div></div>
    <button type="button" class="btn kai-look" data-open="${esc(t.id)}">Lihat hasil</button>${t.status === 'revisi' && t.note ? `<p class="kai-noteview">${esc(t.note)}</p>` : ''}${decide(esc, t)}</article>`).join('')}</div>`;
}

function history(esc, p) {
  const list = logsOf(p.id);
  if (!list.length) return '<p class="kai-empty">Belum ada aktivitas di project ini.</p>';
  return `<ul class="kai-feed">${list.map((x) => {
    const time = new Date(x.createdAt).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    return `<li><span><b>${esc(x.text)}</b><small> · ${esc(time)}</small></span></li>`;
  }).join('')}</ul>`;
}

function calendar(esc) {
  const list = allTasks();
  const days = Array.from({ length: 7 }, (_, i) => {
    const items = list.filter((t) => t.day === i);
    const body = items.map((t) => `<p class="kai-slot kai-slot--${t.status}"><b>${esc(t.kind === 'iklan' ? 'Iklan' : 'Konten')}</b> ${esc(t.title)}</p>`).join('') || '<p class="muted">Kosong</p>';
    return `<section class="kai-day"><header>${dayName(i)}</header>${body}</section>`;
  }).join('');
  return `<header class="kai-hello"><h2>Kalender</h2><p class="muted">Minggu ini, dari project yang tampil. Contoh.</p></header><div class="kai-week">${days}</div>`;
}

function approve(esc) {
  const list = waiting();
  const row = (t) => `<article class="kai-approve">
    <div>${avatar(t.agent)}<div><b>${esc(t.title)}</b><p class="muted">${esc(t.project?.name || '')} · ${esc(STEPS[t.step] || '')}</p><p>${esc(t.copy || t.script || 'Belum ada hasil contoh.')}</p></div></div>
    ${decide(esc, t)}
  </article>`;
  return `<header class="kai-hello"><h2>Perlu persetujuan</h2><p class="muted">Setujui atau minta revisi. Hanya tersimpan di browser ini.</p></header>
    <div class="kai-list">${list.map(row).join('') || '<p class="kai-empty">Tidak ada yang menunggu.</p>'}</div>`;
}

function blankForm() {
  const brand = st.brand === 'holdings' ? 'academy' : st.brand;
  const brands = [{ id: brand === 'proflex' ? 'academy' : brand, loc: brand === 'rmoda' ? st.loc : '' }];
  return { step: 1, name: '', goal: '', due: '', mode: 'one', brands, pm: defaultPm(brands, 'one'), pmTouched: false, agents: [], cat: 'all' };
}
function formBrands(draft) {
  return draft.mode === 'one' ? draft.brands.slice(0, 1) : draft.brands;
}

function formView(esc) {
  const d = st.form;
  if (d.step === 2) return agentStep(esc, d);
  const one = d.mode !== 'multi';
  const selected = new Set(d.brands.map((b) => b.id));
  const loc = (d.brands.find((b) => b.id === 'rmoda') || {}).loc || '';
  const checks = BRANDS.map((b) => `<label><input type="checkbox" data-brandbox="${b.id}" ${selected.has(b.id) ? 'checked' : ''}> ${esc(b.name)}</label>`).join('');
  const pick = BRANDS.map((b) => `<option value="${b.id}" ${d.brands[0]?.id === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('');
  const locs = ['', 'BSD', 'Legok', 'Makassar'].map((l) => `<option value="${l}" ${loc === l ? 'selected' : ''}>${l || 'Semua cabang'}</option>`).join('');
  const pms = ['expi', 'rmo', 'flexo', 'cuy'].map((id) => `<option value="${id}" ${d.pm === id ? 'selected' : ''}>${AGENTS[id].name}</option>`).join('');
  return `<header class="kai-hello"><h2>Buat project</h2><p class="muted">Langkah 1 dari 2. Contoh, tersimpan di browser ini.</p></header>
    <form class="kai-form" id="kaiForm">
      <label class="kai-field">Nama<input class="inp" name="name" maxlength="80" value="${esc(d.name)}" required></label>
      <fieldset class="kai-field"><legend>Cakupan</legend>
        <label><input type="radio" name="mode" value="one" ${one ? 'checked' : ''}> Satu brand</label>
        <label><input type="radio" name="mode" value="multi" ${one ? '' : 'checked'}> Lintas brand</label>
      </fieldset>
      ${one ? `<label class="kai-field">Brand<select class="inp" name="brand">${pick}</select></label>` : `<div class="kai-checks">${checks}</div>`}
      <label class="kai-field">Cabang RMODA Studio<select class="inp" name="loc">${locs}</select></label>
      <label class="kai-field">Tujuan<textarea class="inp" name="goal" rows="2" maxlength="240">${esc(d.goal)}</textarea></label>
      <label class="kai-field">Tenggat<input class="inp" name="due" maxlength="40" value="${esc(d.due)}" placeholder="misal 31 Des"></label>
      <label class="kai-field">PM<select class="inp" name="pm">${pms}</select></label>
      <button class="btn btn--primary" type="submit">Lanjut</button>
    </form>`;
}

function agentStep(esc, d) {
  const cat = st.cat || 'all';
  const filters = CATS.map(([id, label]) => `<button type="button" data-cat="${id}" aria-pressed="${cat === id}">${label}</button>`).join('');
  const chosen = new Set(d.agents);
  const cards = Object.entries(AGENTS).filter(([id, a]) => id !== 'lapangan' && (cat === 'all' || a.cat === cat)).map(([id, a]) =>
    `<article class="kai-agent">${avatar(id)}<b>${esc(a.name)}</b><small>${esc(a.role)}</small>
      <button type="button" class="btn" data-pick="${id}" aria-pressed="${chosen.has(id)}">${chosen.has(id) ? 'Terpilih' : 'Pilih'}</button></article>`).join('');
  const asks = readAsks().slice(0, 3).map((a) => `<p class="muted">${esc(a.note)} · ${esc(a.status)}</p>`).join('');
  return `<header class="kai-hello"><h2>Pilih agent</h2><p class="muted">Langkah 2 dari 2. PM tetap ${esc(AGENTS[d.pm]?.name || 'Cuy')}.</p></header>
    <div class="kai-filters" role="group" aria-label="Kategori">${filters}</div>
    <div class="kai-agents">${cards}<button type="button" class="kai-agent kai-ask" data-ask="1"><b>+ Minta agent baru</b><small>Catatan ke Cuy, bukan agent baru</small></button></div>
    ${st.ask ? `<label class="kai-field">Catatan untuk Cuy<textarea class="inp" id="kaiAsk" rows="2" maxlength="240" placeholder="Agent seperti apa yang dibutuhkan?"></textarea></label><button type="button" class="btn" data-asksave="1">Kirim catatan</button>` : ''}
    ${asks}
    <button type="button" class="btn btn--primary kai-go" data-saveproj="1">Simpan project</button>`;
}

function fixes(esc) {
  const list = readWebo();
  const row = (item) => `<article class="kai-approve"><div><div><b>${esc(item.note)}</b>
    <p class="muted">${esc(item.page)} · ${esc(item.device)} · ${esc(item.priority)}${item.file ? ' · ' + esc(item.file) : ''}</p>
    <p><span class="kai-st kai-st--${item.status === 'Live' ? 'selesai' : item.status === 'Siap dicek di demo' ? 'tunggu' : 'kerja'}">${esc(item.status)}</span></p></div></div>
    ${item.status === 'Siap dicek di demo' ? `<button type="button" class="btn btn--primary" data-live="${esc(item.id)}">Setujui untuk live</button>` : ''}</article>`;
  return `<header class="kai-hello"><h2>Permintaan perbaikan</h2><p class="muted">Antrean Webo. Contoh di browser ini.</p></header>
    <div class="kai-list">${list.map(row).join('') || '<p class="kai-empty">Antrean kosong.</p>'}</div>`;
}

function sheet(esc) {
  const found = st.drawer ? findTask(st.drawer) : null;
  if (!found) return '';
  const t = found.task;
  const a = AGENTS[t.agent] || AGENTS.lapangan;
  return `<div class="kai-shade" data-close="1"></div>
    <aside class="kai-sheet" role="dialog" aria-modal="true" aria-label="Hasil">
      <header><div><p class="kai-step">${esc(STEPS[t.step] || '')}</p><h2>${esc(t.title)}</h2><p class="kai-who">${avatar(t.agent)}<span>${esc(a.name)} · ${STATUS[t.status]}</span></p></div><button type="button" class="iconbtn" data-close="1" aria-label="Tutup">×</button></header>
      <div class="kai-ph" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="m8 15 3-3 2 2 3-4 2 5"/></svg><span>Contoh gambar</span></div>
      ${t.copy ? `<section><h3>Teks</h3><p>${esc(t.copy)}</p></section>` : ''}
      ${t.script ? `<section><h3>Script</h3><p>${esc(t.script)}</p></section>` : ''}
      ${!t.copy && !t.script ? '<p class="muted">Hasil contoh belum diisi.</p>' : ''}
      ${decide(esc, t)}
    </aside>`;
}

function readForm(form, prev) {
  const data = new FormData(form);
  const mode = data.get('mode') === 'multi' ? 'multi' : 'one';
  let brands = [];
  if (mode === 'one') brands = [{ id: String(data.get('brand') || 'academy'), loc: '' }];
  else brands = [...form.querySelectorAll('[data-brandbox]:checked')].map((el) => ({ id: el.dataset.brandbox, loc: '' }));
  const loc = String(data.get('loc') || '');
  brands = brands.map((b) => (b.id === 'rmoda' ? { ...b, loc } : b));
  if (!brands.length) brands = prev.brands;
  const pmTouched = prev.pmTouched || String(data.get('pm') || '') !== prev.pm;
  const pm = pmTouched ? String(data.get('pm') || prev.pm) : defaultPm(brands, mode);
  return { ...prev, name: String(data.get('name') || ''), goal: String(data.get('goal') || ''), due: String(data.get('due') || ''), mode, brands, pm, pmTouched };
}

function saveProject(draft) {
  const id = uid();
  const agents = draft.agents.length ? draft.agents : [draft.pm];
  const lead = agents[0] || draft.pm;
  const tasks = [
    task(id + '-1', { title: 'Riset awal', step: 1, status: 'diterima', due: draft.due || 'Minggu ini', agent: agents.includes('mars') ? 'mars' : lead, day: 0, copy: 'Contoh riset untuk project baru.' }),
    task(id + '-2', { title: 'Kalender', step: 5, status: 'diterima', due: draft.due || 'Minggu ini', agent: agents.includes('somia') ? 'somia' : lead, day: 1 }),
    task(id + '-3', { title: 'Persetujuan', step: 11, status: 'diterima', due: draft.due || 'Minggu ini', agent: draft.pm, day: 5, copy: 'Menunggu dilihat Pak. Contoh.' }),
  ];
  const item = { id, name: draft.name, goal: draft.goal, due: draft.due, scope: draft.mode, brands: draft.brands, pm: draft.pm, agents, tasks };
  const saved = readJson(PROJ_KEY, []);
  writeJson(PROJ_KEY, [item, ...(Array.isArray(saved) ? saved : [])]);
  return id;
}

function approveTask(id) {
  const found = findTask(id);
  const map = readWork();
  map[id] = { ...(map[id] || {}), status: 'selesai', step: 12 };
  writeJson(WORK_KEY, map);
  if (found) addLog(found.project.id, 'Pak menyetujui "' + found.task.title + '"');
  st.drawer = '';
  st.revise = '';
  ctx.toast?.('Disetujui');
  paint();
}
function sendRevisi(id, note) {
  if (!note) { st.reviseErr = id; paint(); return; }
  const found = findTask(id);
  const map = readWork();
  map[id] = { ...(map[id] || {}), status: 'revisi', note };
  writeJson(WORK_KEY, map);
  const who = AGENTS[found?.task.agent]?.name || 'agent';
  if (found) addLog(found.project.id, 'Pak minta revisi "' + found.task.title + '": ' + note);
  st.revise = '';
  st.reviseErr = '';
  ctx.toast?.('Revisi dikirim ke ' + who);
  paint();
}
function saveMembers() {
  const p = currentProject();
  if (!p) return;
  const before = new Set((p.agents || []).filter((id) => id !== p.pm));
  const next = st.pick || [];
  next.filter((id) => !before.has(id)).forEach((id) => addLog(p.id, 'Agent ditambah: ' + (AGENTS[id]?.name || id)));
  saveTeam(p.id, { pm: p.pm, agents: next });
  st.teamEdit = '';
  st.pick = null;
  paint();
}
function dropMember(id) {
  const p = currentProject();
  if (!p || id === p.pm) return;
  const name = AGENTS[id]?.name || id;
  if (!confirm('Lepas ' + name + ' dari project ini?')) return;
  saveTeam(p.id, { pm: p.pm, agents: (p.agents || []).filter((x) => x !== id && x !== p.pm) });
  addLog(p.id, 'Agent dilepas: ' + name);
  paint();
}
function arm() {
  clearTimeout(timer);
  if (!document.getElementById('kaiShell') || !ctx) return;
  const project = currentProject();
  const brand = commandBrand(project);
  const pending = loadCmds().some((x) => (project ? x.projectId === project.id : x.brand === brand) && commandStatus(x) !== 'Selesai');
  if (!pending) return;
  timer = setTimeout(() => {
    const el = document.getElementById('kaiDemo');
    const last = loadCmds().find((x) => (project ? x.projectId === project.id : x.brand === brand));
    if (el && last) el.textContent = commandChip(last);
    if (st.tab === 'riwayat') paint();
    else arm();
  }, 500);
}

function bind() {
  const { esc } = ctx;
  const root = document.getElementById('view');
  root.querySelectorAll('.kai-pills [data-brand]').forEach((btn) => {
    btn.onclick = () => {
      st.brand = btn.dataset.brand;
      st.drawer = '';
      st.form = null;
      st.projectId = '';
      if (location.hash !== '#/ai-office') location.hash = '#/ai-office';
      else paint();
    };
  });
  root.querySelectorAll('[data-loc]').forEach((btn) => { btn.onclick = () => { st.loc = btn.dataset.loc; st.drawer = ''; paint(); }; });
  root.querySelectorAll('[data-open]').forEach((btn) => { btn.onclick = () => { st.drawer = btn.dataset.open; paint(); }; });
  root.querySelectorAll('[data-close]').forEach((btn) => { btn.onclick = () => { st.drawer = ''; paint(); }; });
  root.querySelectorAll('[data-new]').forEach((btn) => { btn.onclick = () => { st.form = blankForm(); st.ask = false; paint(); }; });
  root.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.onclick = () => {
      const tab = btn.dataset.tab;
      location.hash = '#/ai-office/project/' + st.projectId + (tab === 'papan' ? '' : '/' + tab);
    };
  });
  root.querySelectorAll('[data-yes]').forEach((btn) => { btn.onclick = () => approveTask(btn.dataset.yes); });
  root.querySelectorAll('[data-no]').forEach((btn) => {
    btn.onclick = () => { st.revise = btn.dataset.no; st.reviseErr = ''; paint(); };
  });
  root.querySelectorAll('[data-batal]').forEach((btn) => {
    btn.onclick = () => { st.revise = ''; st.reviseErr = ''; paint(); };
  });
  root.querySelectorAll('[data-note]').forEach((box) => {
    box.oninput = () => {
      const left = box.parentElement?.querySelector('[data-left]');
      if (left) left.textContent = String(box.value.length);
    };
  });
  root.querySelectorAll('[data-revform]').forEach((form) => {
    form.onsubmit = (e) => {
      e.preventDefault();
      const box = form.querySelector('[data-note]');
      sendRevisi(form.dataset.revform, (box?.value || '').replace(/\s+/g, ' ').trim());
    };
  });
  root.querySelectorAll('[data-crumb]').forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.crumb;
      st.drawer = '';
      st.form = null;
      st.teamEdit = '';
      st.projectId = '';
      if (!id || id === 'holdings') st.brand = 'holdings';
      else { st.brand = id; if (btn.dataset.crumbLoc) st.loc = btn.dataset.crumbLoc; }
      if (location.hash !== '#/ai-office') location.hash = '#/ai-office';
      else paint();
    };
  });
  root.querySelectorAll('[data-addagent]').forEach((btn) => {
    btn.onclick = () => {
      const p = currentProject();
      st.teamEdit = 'add';
      st.pick = (p?.agents || []).filter((id) => id !== p?.pm);
      st.ask = false;
      paint();
    };
  });
  root.querySelectorAll('[data-gantipm]').forEach((btn) => { btn.onclick = () => { st.teamEdit = 'pm'; st.ask = false; paint(); }; });
  root.querySelectorAll('[data-teamcancel]').forEach((btn) => { btn.onclick = () => { st.teamEdit = ''; st.pick = null; paint(); }; });
  root.querySelectorAll('[data-member]').forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.member;
      const list = st.pick || [];
      st.pick = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
      paint();
    };
  });
  root.querySelectorAll('[data-saveteam]').forEach((btn) => { btn.onclick = () => saveMembers(); });
  root.querySelectorAll('[data-lepas]').forEach((btn) => { btn.onclick = () => dropMember(btn.dataset.lepas); });
  const pmForm = root.querySelector('#kaiPmForm');
  if (pmForm) {
    pmForm.onsubmit = (e) => {
      e.preventDefault();
      const p = currentProject();
      if (!p) return;
      const pm = new FormData(pmForm).get('pm');
      if (!pm || pm === p.pm) { st.teamEdit = ''; paint(); return; }
      saveTeam(p.id, { pm, agents: (p.agents || []).filter((id) => id !== pm) });
      addLog(p.id, 'PM diganti: ' + (AGENTS[pm]?.name || pm));
      st.teamEdit = '';
      paint();
    };
  }
  root.querySelectorAll('[data-live]').forEach((btn) => {
    btn.onclick = () => {
      const list = readWebo().map((item) => (item.id === btn.dataset.live ? { ...item, status: 'Live' } : item));
      saveWebo(list);
      paint();
    };
  });
  const made = root.querySelector('#kaiForm');
  if (made) {
    made.onchange = (e) => {
      st.form = readForm(made, st.form);
      const pm = made.querySelector('[name="pm"]');
      if (pm && !st.form.pmTouched) pm.value = st.form.pm;
      if (e.target.name === 'mode') paint();
    };
    made.onsubmit = (e) => {
      e.preventDefault();
      const next = readForm(made, st.form);
      if (!next.name.trim() || !next.goal.trim()) return;
      if (!next.brands.length) return;
      st.form = { ...next, step: 2 };
      paint();
    };
  }
  root.querySelectorAll('[data-cat]').forEach((btn) => { btn.onclick = () => { st.cat = btn.dataset.cat; paint(); }; });
  root.querySelectorAll('[data-pick]').forEach((btn) => {
    btn.onclick = () => {
      if (!st.form) return;
      const id = btn.dataset.pick;
      const has = st.form.agents.includes(id);
      st.form.agents = has ? st.form.agents.filter((x) => x !== id) : [...st.form.agents, id];
      paint();
    };
  });
  root.querySelectorAll('[data-ask]').forEach((btn) => { btn.onclick = () => { st.ask = !st.ask; paint(); }; });
  root.querySelectorAll('[data-asksave]').forEach((btn) => {
    btn.onclick = () => {
      const note = (root.querySelector('#kaiAsk')?.value || '').replace(/\s+/g, ' ').trim();
      if (!note) return;
      const item = { id: uid(), note, to: 'cuy', status: 'Menunggu persetujuan Pak', createdAt: Date.now() };
      writeJson(ASK_KEY, [item, ...readAsks()].slice(0, 20));
      st.ask = false;
      paint();
    };
  });
  root.querySelectorAll('[data-saveproj]').forEach((btn) => {
    btn.onclick = () => {
      const id = saveProject(st.form);
      st.form = null;
      location.hash = '#/ai-office/project/' + id;
    };
  });
  const form = root.querySelector('.kai-cmd');
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const box = form.querySelector('input');
      const res = await sendCommand(form.dataset.brand, form.dataset.project, box.value);
      const demo = document.getElementById('kaiDemo');
      if (!res.ok) { if (demo) demo.textContent = res.error; return; }
      box.value = '';
      if (demo) demo.textContent = 'Terkirim (demo)';
      arm();
    };
  }
  arm();
}

function paint() {
  const { esc, setHead } = ctx;
  const titles = { project: 'Project', kalender: 'Kalender', setuju: 'Perlu persetujuan', perbaikan: 'Permintaan perbaikan' };
  setHead(st.form ? 'Buat project' : st.projectId ? (currentProject()?.name || 'Project') : (st.brand === 'holdings' && !st.view ? 'Holdings' : (titles[st.view] || 'Team Project')));
  const root = document.getElementById('view');
  if (!root) return;
  const page = st.form ? formView(esc)
    : st.projectId ? detail(esc)
      : st.view === 'project' ? projectList(esc)
        : st.view === 'kalender' ? calendar(esc)
          : st.view === 'setuju' ? approve(esc)
            : st.view === 'perbaikan' ? fixes(esc)
              : home(esc);
  const showCmd = !st.form && st.view !== 'perbaikan';
  const body = (st.form ? '' : crumb(esc)) + page;
  root.innerHTML = `<div class="kai-shell" id="kaiShell" data-kai="${st.brand}">${side(esc)}<div class="kai-main"><div class="kai-scroll">${body}</div>${showCmd ? cmdBar(esc) : ''}</div>${sheet(esc)}</div>`;
  bind();
}

export function viewAiOffice(next) {
  ctx = next;
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  st.view = parts[1] || '';
  st.projectId = parts[1] === 'project' ? (parts[2] || '') : '';
  st.tab = parts[3] === 'file' || parts[3] === 'riwayat' ? parts[3] : 'papan';
  st.form = null;
  st.drawer = '';
  st.ask = false;
  st.teamEdit = '';
  st.pick = null;
  st.revise = '';
  st.reviseErr = '';
  paint();
}
migrateWork();
