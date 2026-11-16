// AI Office demo. Satu pintu pengirim: sendCommand.
// Demo hanya menulis antrian di localStorage. Tidak ada fetch, webhook, atau key.

const KEY = 'rmoda-portal-ai-commands';
const ACCEPT_MS = 2000;
const DONE_MS = 4500;
const KEEP = 40;

const WORDS = {
  rmoda: ['assets/logo/rmoda-wordmark-onlight.png', 'assets/logo/rmoda-wordmark-ondark.png', 'RMODA Studio'],
  supplies: ['assets/logo/expc-supplies-wordmark-onlight.png', 'assets/logo/expc-supplies-wordmark-ondark.png', 'EXPC Supplies'],
  academy: ['assets/logo/expc-academy-wordmark-onlight.png', 'assets/logo/expc-academy-wordmark-ondark.png', 'EXPC Academy'],
  proflex: ['assets/logo/proflex-wordmark-onlight.png', 'assets/logo/proflex-wordmark-ondark.png', 'Proflex'],
};

// Peran EXPC dan Flexo yang tidak disebut di brief ditandai sebagai contoh di data ini.
const OFFICES = [
  {
    id: 'rmoda',
    name: 'RMODA Studio',
    pm: 'Rmo',
    line: 'Produksi bengkel',
    logos: ['rmoda'],
    team: [
      ['Ordo', 'produksi'],
      ['Casper', 'inventory'],
      ['Herra', 'HR'],
      ['Beras', 'strategi'],
      ['Grady', 'desain'],
      ['Webo', 'web'],
    ],
    projects: [
      ['Antrian bodywork BSD', 62],
      ['Stok coating Legok', 38],
    ],
    decision: 'Setujui lembur Sabtu untuk 4 mobil contoh di BSD?',
    result: 'Ordo menyusun ulang urutan cuci dan poles.',
  },
  {
    id: 'expc',
    name: 'EXPC',
    pm: 'Expi',
    line: 'Supplies dan Academy',
    logos: ['supplies', 'academy'],
    team: [
      ['Mars', 'operasi'],
      ['Kata', 'katalog'],
      ['Vira', 'academy'],
      ['Grady', 'desain'],
      ['Somia', 'pelanggan'],
      ['Econ', 'keuangan'],
    ],
    projects: [
      ['Katalog supplies', 54],
      ['Kelas academy batch contoh', 27],
    ],
    decision: 'Tetapkan harga contoh distributor untuk film PPF?',
    result: 'Econ menandai 3 invoice contoh yang belum lunas.',
  },
  {
    id: 'proflex',
    name: 'Proflex',
    pm: 'Flexo',
    line: 'Film dan stok',
    logos: ['proflex'],
    team: [
      ['Flexo', 'stok film'],
    ],
    projects: [
      ['Opname roll film', 71],
    ],
    decision: 'Turunkan minimum stok contoh menjadi 4 roll?',
    result: 'Flexo mencatat 2 roll contoh di bawah minimum.',
  },
  {
    id: 'cuy',
    name: 'Cuy',
    pm: 'Cuy',
    line: 'Keuangan dan teknologi',
    logos: [],
    team: [
      ['Finci', 'finance'],
      ['Webo', 'teknologi'],
      ['Lexa', 'legal'],
      ['Sekura', 'security'],
    ],
    projects: [
      ['Rekap kas contoh', 84],
      ['Tinjauan akses portal', 41],
    ],
    decision: 'Setujui batas pengeluaran contoh bulan ini?',
    result: 'Sekura menutup akses contoh yang tidak dipakai.',
  },
];

const known = (brand) => OFFICES.some((o) => o.id === brand);

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : 'cmd' + Date.now();
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
  const next = [item, ...load()].slice(0, KEEP);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    return Promise.resolve({ ok: false, error: 'Browser menolak menyimpan antrian demo.' });
  }
  return Promise.resolve({ ok: true, item: { ...item, status: 'Antri' } });
}

const dark = () => document.documentElement.dataset.theme !== 'light';
const word = (id) => {
  const row = WORDS[id];
  return `<img data-word-for="${id}" src="${dark() ? row[1] : row[0]}" alt="${row[2]}">`;
};
const when = (ts) => new Date(ts).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const ST = { Antri: 'warn', Diterima: 'info', Selesai: 'ok' };

function histHtml(esc, brand) {
  const rows = load().filter((x) => x.brand === brand).slice(0, 5);
  if (!rows.length) return '<p class="ai-empty">Belum ada perintah di browser ini.</p>';
  return `<ol class="ai-hist">${rows.map((x) => {
    const st = commandStatus(x);
    return `<li><span class="ai-hist__top"><span class="badge ${ST[st]}">${st}</span><time datetime="${new Date(x.createdAt).toISOString()}">${esc(when(x.createdAt))}</time></span><p>${esc(x.text)}</p></li>`;
  }).join('')}</ol>`;
}

let timer = 0;

export function viewAiOffice({ $, esc, setHead }) {
  setHead('AI Office');
  const root = $('#view');
  const card = (o) => `<article class="ai-card" data-office="${o.id}">
    <header class="ai-card__h">
      <div class="ai-card__logos">${o.logos.length ? o.logos.map(word).join('') : `<b class="ai-word">${esc(o.name)}</b>`}</div>
      <div>
        <h2>${esc(o.name)}</h2>
        <p class="muted">PM ${esc(o.pm)} · ${esc(o.line)}</p>
      </div>
    </header>
    <section>
      <h3>Tim agent</h3>
      <ul class="ai-team">${o.team.map(([n, r]) => `<li><b>${esc(n)}</b><span>${esc(r)}</span></li>`).join('')}</ul>
    </section>
    <section>
      <h3>Project berjalan</h3>
      <div class="ai-projs">${o.projects.map(([n, pct]) => `<div class="ai-proj"><header><span>${esc(n)}</span><b>${pct}%</b></header><i class="ai-bar" aria-hidden="true"><b style="width:${pct}%"></b></i></div>`).join('')}</div>
    </section>
    <section>
      <h3>Keputusan</h3>
      <p class="ai-flag"><b>Perlu keputusan Pak</b><span>${esc(o.decision)}</span></p>
    </section>
    <section>
      <h3>Hasil terbaru</h3>
      <p class="ai-result">${esc(o.result)} <span class="muted">Contoh, belum dari agent sungguhan.</span></p>
    </section>
    <form class="ai-cmd" data-brand="${o.id}">
      <label for="cmd-${o.id}">Beri perintah ke ${esc(o.pm)}</label>
      <textarea class="inp" id="cmd-${o.id}" name="text" rows="3" maxlength="500" placeholder="Tulis perintah untuk ${esc(o.pm)}"></textarea>
      <p class="ai-err" hidden role="alert"></p>
      <div class="ai-cmd__row">
        <button class="btn btn--primary" type="submit">Kirim</button>
        <p class="ai-hint">Demo. Perintah masuk antrian browser ini, belum terkirim ke agent sungguhan.</p>
      </div>
    </form>
    <section aria-live="polite" data-hist="${o.id}">${histHtml(esc, o.id)}</section>
  </article>`;

  root.innerHTML = `<div class="ai-page" id="aiOffice">
    <header class="ai-lead">
      <p class="ai-kicker">Kantor agent</p>
      <p class="note" role="status">Mode demo. Proyek, keputusan, dan hasil di halaman ini data contoh. Kirim hanya menyimpan antrian di browser ini. Tidak ada perintah yang terkirim ke agent sungguhan.</p>
    </header>
    <div class="ai-grid">${OFFICES.map(card).join('')}</div>
  </div>`;

  const paint = () => {
    if (!root.querySelector('#aiOffice')) return;
    for (const o of OFFICES) {
      const slot = root.querySelector(`[data-hist="${o.id}"]`);
      if (slot) slot.innerHTML = histHtml(esc, o.id);
    }
  };
  const arm = () => {
    clearTimeout(timer);
    const pending = load().some((x) => commandStatus(x) !== 'Selesai');
    if (!pending || !root.querySelector('#aiOffice')) return;
    timer = setTimeout(() => { paint(); arm(); }, 500);
  };
  root.querySelectorAll('.ai-cmd').forEach((form) => {
    const box = form.querySelector('textarea');
    box.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') form.requestSubmit();
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = form.querySelector('.ai-err');
      const res = await sendCommand(form.dataset.brand, box.value);
      if (!res.ok) {
        err.hidden = false;
        err.textContent = res.error;
        box.setAttribute('aria-invalid', 'true');
        return;
      }
      err.hidden = true;
      box.removeAttribute('aria-invalid');
      box.value = '';
      paint();
      arm();
    });
  });
  arm();
}
