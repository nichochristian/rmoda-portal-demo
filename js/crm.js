// Modul CRM (salinan dari aplikasi RMODA Studio CRM di Claude, lihat saja).
// Rumus reminder disalin dari aplikasi: pengingat tiap N bulan sejak tanggal selesai, per mobil.

const PRODUCTS = {
  dquartz: 'Fine Guard (D.Quartz Nanodiamond)', pro: 'Solid Guard (D.Quartz + C.Quartz Professional)',
  fr: 'Elite Finish (D.Quartz + C.Quartz Finest Reserve)', 'skin-ammo': 'PPF Proflex Ammo + C.Quartz Skin',
  'skin-hybrid': 'PPF Proflex Hybrid + C.Quartz Skin', 'skin-promatte': 'PPF Proflex Pro-Matte + C.Quartz Skin',
  'skin-elite': 'PPF Proflex Elite + C.Quartz Skin',
};
const OUT = { booking: ['Booking', 'ok'], noresp: ['Belum respon', 'warn'], later: ['Nanti dulu', 'info'], no: ['Tidak tertarik', 'off'] };
const LOCS = ['BSD', 'Legok', 'Makassar'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
const dayDiff = (a, b) => Math.round((parse(a) - parse(b)) / 864e5);
const fmt = (s) => { if (!s) return '—'; const d = parse(String(s).slice(0, 10)); return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`; };
function addMonths(s, n) {
  const [y, m, d] = s.split('-').map(Number); const t = new Date(y, m - 1 + n, 1);
  t.setDate(Math.min(d, new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate())); return iso(t);
}
const plateKey = (p) => String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const showPhone = (p) => p ? (String(p).startsWith('62') ? '0' + String(p).slice(2) : p) : '';
const prodName = (k) => PRODUCTS[k] || k || '—';

export async function viewCrm(ctx) {
  const { $, esc, api, setHead } = ctx;
  setHead('CRM', `<span class="badge info">Lihat saja</span>`);
  const view = $('#view');
  view.innerHTML = `<div class="empty"><p class="muted">Memuat data CRM…</p></div>`;
  const [docs, sync] = await Promise.all([api.listDocs('crm'), api.lastSync('crm')]);
  const cfg = docs.find(d => d.coll === 'config' && d.id === 'app')?.data || {};
  const months = Math.max(1, Number(cfg.months) || 6);
  const staff = cfg.staff || {};
  const customers = docs.filter(d => d.coll === 'customers').map(d => ({ id: d.id, ...d.data }));
  const jobs = docs.filter(d => d.coll === 'jobs').map(d => ({ id: d.id, ...d.data }));
  const custById = new Map(customers.map(c => [c.id, c]));
  const staffLoc = (n) => staff[n]?.loc || '';
  const jobLoc = (j) => j.loc || staffLoc(j.sa) || '';
  const now = iso(new Date());

  if (!jobs.length && !customers.length) {
    view.innerHTML = `<div class="empty"><h2>Belum ada data yang bisa kamu lihat</h2><p class="muted">Data CRM belum disalin, atau unit kamu tidak punya akses ke CRM.</p></div>`;
    return;
  }

  // Satu baris reminder per mobil (customer + plat), sama dengan aplikasi
  const groups = new Map();
  for (const j of jobs) { const k = j.custId + '~' + (plateKey(j.plate) || j.id); (groups.get(k) || groups.set(k, []).get(k)).push(j); }
  const veh = [];
  for (const [key, js] of groups) {
    js.sort((a, b) => (b.date + (b.createdAt || '')).localeCompare(a.date + (a.createdAt || '')));
    const latest = js[0], base = latest.date; if (!base) continue;
    const fu = latest.followups || [];
    const lastClosed = fu.reduce((m, f) => f.outcome !== 'noresp' ? Math.max(m, f.cycle || 0) : m, 0);
    let kNow = 0; while (addMonths(base, months * (kNow + 1)) <= now) kNow++;
    const owner = custById.get(latest.custId);
    const v = { key, jobs: js, latest, base, c: owner || { name: latest.certName || '(tanpa nama)', phone: '' },
      sa: owner?.sa || latest.sa || '', loc: jobLoc(latest), products: [...new Set(js.filter(j => j.date === base).map(j => prodName(j.product)))].join(' & ') };
    if (latest.remindOff) v.status = 'off';
    else if (kNow > lastClosed) { v.status = 'due'; v.cycle = kNow; v.dueDate = addMonths(base, months * (lastClosed + 1)); v.late = dayDiff(now, v.dueDate); v.tries = fu.filter(f => f.cycle === kNow && f.outcome === 'noresp'); }
    else { v.cycle = Math.max(kNow, lastClosed) + 1; v.dueDate = addMonths(base, months * v.cycle); v.status = dayDiff(v.dueDate, now) <= 30 && lastClosed < v.cycle ? 'soon' : 'idle'; }
    veh.push(v);
  }
  const sas = [...new Set([...(cfg.sas || []), ...Object.keys(staff), ...veh.map(v => v.sa)].filter(Boolean))].sort();
  const locs = LOCS.filter(l => veh.some(v => v.loc === l) || jobs.some(j => jobLoc(j) === l));
  const st = { tab: 'reminder', sa: '', loc: '', q: '', shown: 60, cf: '' };

  view.innerHTML = `
    <div class="wt-sync"><span>Salinan dari aplikasi <b>RMODA Studio CRM</b> di Claude${sync ? ` · diperbarui ${esc(fmt(sync.at))} ${esc(new Date(sync.at).toTimeString().slice(0, 5))}` : ''}.</span>
      <span class="muted">Follow up dan pembuatan e-certificate tetap di aplikasi Claude selama masa transisi.</span></div>
    <div class="wt-bar">
      <nav class="wt-tabs" role="tablist" aria-label="Bagian CRM">${[['reminder', 'Reminder'], ['cert', 'E-Certificate'], ['cust', 'Data Customer'], ['set', 'Pengaturan']].map(([k, l]) =>
        `<button role="tab" data-tab="${k}" aria-selected="${k === st.tab}">${l}</button>`).join('')}</nav>
      <div class="crm-filters">
        <div class="wt-seg" role="group" aria-label="Lokasi"><button data-loc="" aria-pressed="true">Semua lokasi</button>${locs.map(l => `<button data-loc="${l}" aria-pressed="false">${l}</button>`).join('')}</div>
        <select class="inp inp--s" id="crmSa" aria-label="Service advisor"><option value="">Semua SA</option>${sas.map(n => `<option>${esc(n)}</option>`).join('')}</select>
      </div>
    </div>
    <div id="wt"></div>`;

  const mineV = (v) => (!st.sa || v.sa === st.sa) && (!st.loc || v.loc === st.loc);
  const plate = (p) => `<span class="plate">${esc(p || '—')}</span>`;
  const car = (j) => esc([j.brand, j.model, j.year].filter(Boolean).join(' '));

  function drawReminder() {
    const due = veh.filter(v => v.status === 'due' && mineV(v)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const soon = veh.filter(v => v.status === 'soon' && mineV(v)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const row = (v) => {
      const pill = v.status === 'soon' ? `<span class="badge info">${dayDiff(v.dueDate, now)} hari lagi</span>`
        : v.late > 7 ? `<span class="badge bad">Terlambat ${v.late} hari</span>` : `<span class="badge warn">Jatuh tempo</span>`;
      const tries = v.tries?.length ? `<span class="badge off">Sudah dichat ${v.tries.length}x</span>` : '';
      return `<tr data-cust="${esc(v.latest.custId)}" tabindex="0"><td><b>${esc(v.c.name)}</b><br><small class="muted">${esc(showPhone(v.c.phone) || 'WA belum diisi')}</small></td>
        <td>${plate(v.latest.plate)}<br><small>${car(v.latest)}</small></td><td><small>${esc(v.products)}</small></td>
        <td><small>Selesai ${esc(fmt(v.base))}<br>Jatuh tempo ${esc(fmt(v.dueDate))}</small></td>
        <td>${esc(v.sa || '—')}<br><small class="muted">${esc(v.loc || '')}</small></td><td>${pill} ${tries}</td></tr>`;
    };
    const table = (rows, empty) => `<div class="tablewrap"><table class="tbl wt-tbl"><thead><tr><th>Customer</th><th>Mobil</th><th>Produk</th><th>Tanggal</th><th>SA</th><th>Status</th></tr></thead>
      <tbody>${rows.map(row).join('') || `<tr><td colspan="6" class="muted">${empty}</td></tr>`}</tbody></table></div>`;
    // Pantauan per SA bulan ini + follow up terakhir
    const ym = now.slice(0, 7), logs = [];
    for (const j of jobs) for (const f of j.followups || []) logs.push({ ...f, j });
    logs.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const names = st.sa ? [st.sa] : sas;
    $('#wt').innerHTML = `
      <div class="wt-stats">
        <div class="wt-stat bad"><small>Perlu dihubungi</small><b>${due.length}</b><span>reminder tiap ${months} bulan sejak selesai</span></div>
        <div class="wt-stat info"><small>Segera, 30 hari ke depan</small><b>${soon.length}</b><span>siapkan follow up</span></div>
        <div class="wt-stat ok"><small>Booking bulan ini</small><b>${logs.filter(f => String(f.at).startsWith(ym) && f.outcome === 'booking' && (!st.sa || f.by === st.sa)).length}</b><span>dari hasil follow up</span></div>
        <div class="wt-stat"><small>Sudah dihubungi bulan ini</small><b>${logs.filter(f => String(f.at).startsWith(ym) && (!st.sa || f.by === st.sa)).length}</b><span>semua hasil follow up</span></div>
      </div>
      <h2 class="wt-h">Perlu dihubungi (${due.length})</h2>${table(due, 'Tidak ada customer yang jatuh tempo.')}
      ${soon.length ? `<h2 class="wt-h">Segera, 30 hari ke depan (${soon.length})</h2>${table(soon, '')}` : ''}
      ${names.length ? `<h2 class="wt-h">Pantauan per SA, bulan ini</h2><div class="tablewrap"><table class="tbl"><thead><tr><th>SA</th><th>Lokasi</th><th>Perlu dihubungi</th><th>Sudah dihubungi</th><th>Booking</th></tr></thead><tbody>
        ${names.map(n => { const m = logs.filter(f => f.by === n && String(f.at).startsWith(ym));
          return `<tr><td>${esc(n)}</td><td>${esc(staffLoc(n) || '—')}</td><td>${veh.filter(v => v.status === 'due' && v.sa === n).length}</td><td>${m.length}</td><td>${m.filter(f => f.outcome === 'booking').length}</td></tr>`; }).join('')}</tbody></table></div>` : ''}
      ${logs.length ? `<h2 class="wt-h">Follow up terakhir</h2><div class="tablewrap"><table class="tbl"><thead><tr><th>Tanggal</th><th>Customer</th><th>Plat</th><th>SA</th><th>Hasil</th><th>Catatan</th></tr></thead><tbody>
        ${logs.filter(f => !st.sa || f.by === st.sa).slice(0, 25).map(f => `<tr><td><small>${esc(fmt(f.at))}</small></td><td>${esc(custById.get(f.j.custId)?.name || f.j.certName || '')}</td><td>${plate(f.j.plate)}</td><td>${esc(f.by || '—')}</td>
          <td><span class="badge ${OUT[f.outcome]?.[1] || 'off'}">${esc(OUT[f.outcome]?.[0] || f.outcome || '')}</span></td><td><small>${esc(f.note || '')}</small></td></tr>`).join('')}</tbody></table></div>` : ''}`;
  }

  function drawCerts() {
    const q = st.q.toLowerCase(), qk = plateKey(st.q);
    const list = jobs.filter(j => (!st.sa || j.sa === st.sa) && (!st.loc || jobLoc(j) === st.loc))
      .filter(j => !q || (j.certName || '').toLowerCase().includes(q) || (qk && plateKey(j.plate).includes(qk)) || `${j.brand} ${j.model}`.toLowerCase().includes(q))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const ym = now.slice(0, 7);
    $('#wt').innerHTML = `
      <div class="wt-stats">
        <div class="wt-stat"><small>Total sertifikat</small><b>${list.length}</b><span>${list.filter(j => !j.legacy).length} dibuat di aplikasi</span></div>
        <div class="wt-stat ok"><small>Selesai bulan ini</small><b>${list.filter(j => String(j.date).startsWith(ym)).length}</b><span>berdasarkan tanggal selesai</span></div>
      </div>
      <div class="toolbar"><input class="inp" id="crmQ" placeholder="Cari nama, plat, atau mobil" value="${esc(st.q)}" aria-label="Cari sertifikat"></div>
      <div class="tablewrap"><table class="tbl wt-tbl"><thead><tr><th>Selesai</th><th>Customer</th><th>Mobil</th><th>Produk</th><th>Garansi s/d</th><th>SA</th></tr></thead><tbody>
      ${list.slice(0, st.shown).map(j => `<tr data-cust="${esc(j.custId)}" tabindex="0"><td><small>${esc(fmt(j.date))}</small></td><td><b>${esc(j.certName || custById.get(j.custId)?.name || '')}</b></td>
        <td>${plate(j.plate)}<br><small>${car(j)}</small></td><td><small>${esc(prodName(j.product))}</small></td><td><small>${esc(j.expires ? fmt(j.expires) : '—')}</small></td>
        <td>${esc(j.sa || '—')}<br><small class="muted">${esc(jobLoc(j))}</small></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Tidak ada sertifikat yang cocok.</td></tr>'}</tbody></table></div>
      ${list.length > st.shown ? `<button class="btn" data-more>Tampilkan lebih banyak (${list.length - st.shown} lagi)</button>` : ''}`;
    bindSearch();
  }

  const byCust = new Map(); for (const j of jobs) (byCust.get(j.custId) || byCust.set(j.custId, []).get(j.custId)).push(j);
  function drawCustomers() {
    const q = st.q.trim().toLowerCase(), qk = plateKey(st.q), qd = st.q.replace(/\D/g, '');
    let list = customers.map(c => { const js = byCust.get(c.id) || []; const last = [c.last, ...js.map(j => j.date)].filter(Boolean).sort().pop() || ''; return { c, js, last, sa: c.sa || [...js].sort((a, b) => String(b.date).localeCompare(String(a.date))).find(j => j.sa)?.sa || '' }; });
    if (q) list = list.filter(({ c, js }) => (c.name || '').toLowerCase().includes(q) || (c.aka || []).some(a => String(a).toLowerCase().includes(q))
      || (qd.length > 2 && [c.phone, ...(c.phones || [])].some(p => String(p || '').includes(qd.replace(/^0/, ''))))
      || (qk && (js.some(j => plateKey(j.plate).includes(qk)) || (c.cars || []).some(v => plateKey(v.p).includes(qk))))
      || (c.cars || []).some(v => String(v.t || '').toLowerCase().includes(q)));
    if (st.sa) list = list.filter(x => x.sa === st.sa);
    if (st.cf === 'nophone') list = list.filter(x => !x.c.phone);
    if (st.cf === 'cert') list = list.filter(x => x.js.length);
    list.sort((a, b) => String(b.last || b.c.createdAt || '').localeCompare(String(a.last || a.c.createdAt || '')));
    $('#wt').innerHTML = `
      <div class="toolbar"><input class="inp" id="crmQ" placeholder="Cari nama, nomor WA, plat, atau mobil" value="${esc(st.q)}" aria-label="Cari customer">
        <div class="wt-seg" role="group" aria-label="Saring"><button data-cf="" aria-pressed="${!st.cf}">Semua</button><button data-cf="cert" aria-pressed="${st.cf === 'cert'}">Punya sertifikat</button><button data-cf="nophone" aria-pressed="${st.cf === 'nophone'}">WA belum ada</button></div></div>
      <p class="lead">${list.length} customer</p>
      <div class="tablewrap"><table class="tbl wt-tbl"><thead><tr><th>Customer</th><th>WhatsApp</th><th>Mobil</th><th>SA</th><th>Terakhir datang</th></tr></thead><tbody>
      ${list.slice(0, st.shown).map(({ c, js, sa, last }) => `<tr data-cust="${esc(c.id)}" tabindex="0"><td><b>${esc(c.name)}</b>${c.aka?.length ? `<br><small class="muted">${esc(c.aka.slice(0, 2).join(', '))}</small>` : ''}</td>
        <td><small>${esc(showPhone(c.phone) || '—')}</small></td>
        <td><small>${esc((c.cars || []).slice(0, 2).map(v => [v.t, v.p].filter(Boolean).join(' · ')).join(' / ') || '—')}${(c.cars || []).length > 2 ? ` +${c.cars.length - 2}` : ''}</small>${js.length ? `<br><span class="badge info">${js.length} sertifikat</span>` : ''}</td>
        <td>${esc(sa || '—')}</td><td><small>${esc(fmt(last))}</small></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Tidak ada customer yang cocok.</td></tr>'}</tbody></table></div>
      ${list.length > st.shown ? `<button class="btn" data-more>Tampilkan lebih banyak (${list.length - st.shown} lagi)</button>` : ''}`;
    bindSearch();
  }

  function openCust(id) {
    const c = custById.get(id); const js = (byCust.get(id) || []).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (!c && !js.length) return;
    const name = c?.name || js[0]?.certName || '(tanpa nama)';
    const hist = [...(c?.hist || [])].sort((a, b) => String(b.d).localeCompare(String(a.d)));
    const dlg = $('#dlg'); dlg.classList.add('dlg--wide');
    dlg.innerHTML = `<div class="dlg">
      <div class="wt-dh"><div><span class="muted tiny">${esc(id)}${c?.src ? ' · sumber ' + esc(c.src) : ''}</span><h2>${esc(name)}</h2></div><button class="iconbtn" data-close aria-label="Tutup">×</button></div>
      <div class="wt-facts">
        <div><small>WhatsApp</small><b>${esc(showPhone(c?.phone) || '—')}</b><span class="muted">${esc((c?.phones || []).map(showPhone).join(', '))}</span></div>
        <div><small>SA</small><b>${esc(c?.sa || js.find(j => j.sa)?.sa || '—')}</b></div>
        <div><small>Terakhir datang</small><b>${esc(fmt([c?.last, ...js.map(j => j.date)].filter(Boolean).sort().pop()))}</b></div>
        <div><small>Customer sejak</small><b>${esc(fmt(c?.createdAt))}</b></div>
      </div>
      ${c?.note ? `<p class="note">${esc(c.note)}</p>` : ''}
      ${(c?.cars || []).length ? `<h3>Mobil</h3><ul class="wt-items">${c.cars.map(v => `<li>${v.p ? `<span class="plate">${esc(v.p)}</span> ` : ''}${esc(v.t || '')}${v.c ? ` <span class="muted">· ${esc(v.c)}</span>` : ''}</li>`).join('')}</ul>` : ''}
      ${js.length ? `<h3>E-certificate</h3><ul class="wt-items">${js.map(j => `<li><span class="plate">${esc(j.plate || '—')}</span> ${esc(prodName(j.product))} <span class="muted">· selesai ${esc(fmt(j.date))}${j.expires ? ' · garansi s/d ' + esc(fmt(j.expires)) : ''}</span>
        ${(j.followups || []).map(f => `<br><small><span class="badge ${OUT[f.outcome]?.[1] || 'off'}">${esc(OUT[f.outcome]?.[0] || f.outcome)}</span> ${esc(fmt(f.at))} · ${esc(f.by || '')}${f.note ? ' — ' + esc(f.note) : ''}</small>`).join('')}</li>`).join('')}</ul>` : ''}
      ${hist.length ? `<h3>Riwayat pengerjaan</h3><ul class="wt-log">${hist.map(h => `<li><small class="muted">${esc(fmt(h.d))}${c.cars?.[h.v]?.t ? ' · ' + esc(c.cars[h.v].t) : ''}</small><span>${esc(h.w || '')}</span></li>`).join('')}</ul>` : ''}
    </div>`;
    dlg.onclick = (e) => { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); };
    dlg.onclose = () => dlg.classList.remove('dlg--wide');
    dlg.showModal();
  }

  // Pengaturan (sama dengan tab Pengaturan di aplikasi; lihat saja)
  const DEF_WA_CERT = 'Halo Bapak/Ibu {nama}, terima kasih sudah mempercayakan {mobil} ({plat}) ke RMODA Studio. Berikut kami kirimkan e-certificate garansi {produk}. Mohon disimpan ya.\n\nSalam,\n{sa} - RMODA Studio';
  const DEF_WA_REMIND = 'Halo Bapak/Ibu {nama}, saya {sa} dari RMODA Studio. Sudah {bulan} bulan sejak pengerjaan {produk} di {mobil} ({plat}) pada {tanggal}. Sudah waktunya maintenance supaya proteksinya tetap optimal. Kapan Bapak/Ibu ada waktu untuk kami jadwalkan?';
  function drawSettings() {
    const list = [...new Set([...(cfg.sas || []), ...Object.keys(staff)])];
    const certsBy = (n) => jobs.filter(j => j.sa === n).length;
    $('#wt').innerHTML = `
      <p class="lead">Berlaku untuk semua orang yang memakai aplikasi CRM. Untuk mengubahnya, buka tab Pengaturan di aplikasi Claude.</p>
      <h2 class="wt-h">Service advisor (${list.length})</h2>
      <div class="tablewrap"><table class="tbl"><thead><tr><th>Nama</th><th>Lokasi</th><th>Sertifikat dibuat</th></tr></thead><tbody>
        ${list.map(n => `<tr><td>${esc(n)}</td><td>${esc(staffLoc(n) || '—')}</td><td>${certsBy(n)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Belum ada SA terdaftar.</td></tr>'}</tbody></table></div>
      <h2 class="wt-h">Jadwal reminder</h2>
      <p>Ingatkan setiap <b>${months} bulan</b> sejak tanggal selesai.</p>
      <h2 class="wt-h">Pesan WhatsApp</h2>
      <p class="muted">Kata dalam kurung kurawal otomatis diganti: {nama} {mobil} {plat} {produk} {tanggal} {bulan} {sa}</p>
      <h3>Saat mengirim sertifikat</h3><p class="note" style="white-space:pre-wrap">${esc(cfg.waCert || DEF_WA_CERT)}</p>
      <h3>Saat reminder maintenance</h3><p class="note" style="white-space:pre-wrap">${esc(cfg.waRemind || DEF_WA_REMIND)}</p>`;
  }

  function bindSearch() {
    const inp = $('#crmQ'); if (!inp) return;
    inp.oninput = () => { st.q = inp.value; st.shown = 60; const pos = inp.selectionStart; draw(); const n = $('#crmQ'); n.focus(); n.setSelectionRange(pos, pos); };
  }
  const draw = () => ({ reminder: drawReminder, cert: drawCerts, cust: drawCustomers, set: drawSettings })[st.tab]();
  $('#crmSa').onchange = (e) => { st.sa = e.target.value; st.shown = 60; draw(); };
  view.onclick = (e) => {
    const t = e.target.closest('[data-tab],[data-loc],[data-cf],[data-more],[data-cust]'); if (!t) return;
    if (t.dataset.tab) { st.tab = t.dataset.tab; st.q = ''; st.shown = 60; view.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b === t)); }
    else if ('loc' in t.dataset) { st.loc = t.dataset.loc; view.querySelectorAll('[data-loc]').forEach(b => b.setAttribute('aria-pressed', b === t)); }
    else if ('cf' in t.dataset) st.cf = t.dataset.cf;
    else if ('more' in t.dataset) st.shown += 100;
    else if (t.dataset.cust) return openCust(t.dataset.cust);
    draw();
  };
  view.onkeydown = (e) => { if (e.key === 'Enter' && e.target.dataset?.cust) openCust(e.target.dataset.cust); };
  draw();
}

/* Ringkasan singkat untuk Beranda */
export async function crmHomeSummary(api) {
  const docs = await api.listDocs('crm');
  const cfg = docs.find(d => d.coll === 'config' && d.id === 'app')?.data || {};
  const months = Math.max(1, Number(cfg.months) || 6), now = iso(new Date());
  const jobs = docs.filter(d => d.coll === 'jobs').map(d => ({ id: d.id, ...d.data }));
  if (!jobs.length) return null;
  const groups = new Map();
  for (const j of jobs) { const k = j.custId + '~' + (plateKey(j.plate) || j.id); (groups.get(k) || groups.set(k, []).get(k)).push(j); }
  let due = 0, soon = 0;
  for (const js of groups.values()) {
    js.sort((a, b) => (b.date + (b.createdAt || '')).localeCompare(a.date + (a.createdAt || '')));
    const l = js[0]; if (!l.date || l.remindOff) continue;
    const fu = l.followups || []; const lastClosed = fu.reduce((m, f) => f.outcome !== 'noresp' ? Math.max(m, f.cycle || 0) : m, 0);
    let k = 0; while (addMonths(l.date, months * (k + 1)) <= now) k++;
    if (k > lastClosed) due++;
    else { const c = Math.max(k, lastClosed) + 1; if (dayDiff(addMonths(l.date, months * c), now) <= 30 && lastClosed < c) soon++; }
  }
  return { due, soon, customers: docs.filter(d => d.coll === 'customers').length };
}
