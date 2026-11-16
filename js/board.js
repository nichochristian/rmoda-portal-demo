// Papan Work Tracker: tab divisi dan kolom tahap, gaya Linear.
// Geser kartu tidak mengubah tahap. Tahap hanya lewat tombol Selesai / Lewati.

import { DIVS, LOCS, UNIT_OF, woCode, coerceDiv, allows } from './rules.js?v=44';

const PRI = { TINGGI: ['bad', 'Tinggi'], SEDANG: ['warn', 'Sedang'], RINGAN: ['off', 'Ringan'] };
const ROLE = { sa: 'Service Advisor', kabeng: 'Kepala Bengkel', kadiv: 'Kepala Divisi', owner: 'Owner' };

const pad = (n) => String(n).padStart(2, '0');
const fmtDs = (s) => s ? new Date(String(s).slice(0, 10) + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '';
const fmtDT = (s) => { if (!s) return ''; const d = new Date(s); return `${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id' + Date.now());
const DROP = ['divStates', 'complete', 'handed', 'handedDate', 'active', 'ready', 'late', 'lateBy', 'lateOpen', 'noTarget', 'atVendor', 'openRevs', 'revList', 'days'];
const raw = (j) => { const o = { ...j }; delete o.id; for (const k of DROP) delete o[k]; return o; };
const ageDays = (at) => { if (!at) return 0; return Math.max(0, Math.floor((Date.now() - new Date(at).getTime()) / 864e5)); };

export function mountBoard(ctx) {
  const { $, esc, toast, who, SA, sync, today, gate, refresh } = ctx;
  let jobs = ctx.jobs;
  const root = $('#wtPane');
  if (!root) return null;
  const st = {
    view: 'papan', div: 'bodyworks', loc: '', q: '',
    list: 'aktif', sort: 'target', until: '',
    rev: 'open', rdiv: '', rsumber: '',
    sel: jobs[0]?.id || '', open: '',
  };

  const actor = () => gate?.actor?.() || { owner: true, name: 'Owner', sa: LOCS, kabeng: LOCS, kadiv: [], divs: [] };
  const can = (action, extra) => gate ? gate.can(action, { app: 'work', ...extra }) : false;
  const note = () => gate && !gate.writable('work') ? `<p class="board-note">${esc(gate.blockReason('work'))}</p>` : (gate?.demo ? '<p class="board-note">Mode demo: perubahan hanya tersimpan di browser ini.</p>' : '');

  function curDiv(j, div) {
    return (j.divStates || []).find((x) => x.div === div);
  }
  function otherDivs(j, div) {
    return (j.divs || []).filter((d) => d !== div && DIVS[d]).map((d) => DIVS[d].label);
  }
  function payLabel(j) {
    const x = SA?.payOf?.(j);
    return x?.s || '';
  }
  function filteredActive() {
    return jobs.filter((j) => j.active && !j.nonaktif && (!st.loc || j.loc === st.loc));
  }

  function cardHtml(j, div) {
    const p = curDiv(j, div);
    const late = j.lateOpen ? ' is-late' : '';
    const on = j.id === st.sel ? ' is-on' : '';
    const others = otherDivs(j, div);
    const pay = payLabel(j);
    const pri = j.priority && PRI[j.priority];
    const ready = j.ready ? 'Selesai QC · Siap serah SA' : (p?.cur?.label || '');
    return `<article class="issue${on}${late}" data-id="${esc(j.id)}" tabindex="0">
      <span class="issue__grip" aria-hidden="true"></span>
      <div class="issue__top"><span class="plate">${esc(j.plate || '—')}</span><span class="chip">${esc(j.loc || '')}</span></div>
      <b>${esc(j.car || 'Mobil')}</b>
      <p class="issue__meta">${esc(j.color || '')}${j.customer ? ` · ${esc(j.customer)}` : ''}</p>
      <p class="issue__stage">${esc(j.woNo || j.no || '')}${others.length ? ` · juga ${esc(others.join(', '))}` : ''}</p>
      <p class="issue__foot"><span>${j.target ? 'Target ' + esc(fmtDs(j.target)) : 'Tanpa target'}</span>${pri ? `<span class="badge ${pri[0]}">${pri[1]}</span>` : ''}</p>
      <p class="issue__foot"><span>${esc(ready)}</span>${pay ? `<span class="badge off">${esc(pay)}</span>` : ''}${j.openRevs?.length ? `<span class="badge warn">${j.openRevs.length} revisi</span>` : ''}${j.days != null ? `<small>${j.days} hr</small>` : ''}</p>
    </article>`;
  }

  function subnav() {
    const items = [['ringkasan', 'Dashboard'], ['papan', 'Papan Kerja'], ['daftar', 'Daftar Mobil'], ['revisi', 'Daftar Revisi'], ['tim', 'Tim & Peran']];
    const lihat = gate?.demo ? `<label class="lihat">Lihat sebagai <select id="lihatSebagai">${[['akun', 'Akun ini (Owner demo)'], ...gate.previews.map((p) => [p[0], p[1]])].map(([id, label]) => `<option value="${esc(id)}" ${((gate.previewId?.() || 'akun') === id || (!gate.previewId?.() && id === 'akun')) ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label>` : '';
    return `<div class="wt-sub"><div class="wt-seg" role="tablist">${items.map(([id, label]) => `<button type="button" data-view="${id}" aria-pressed="${st.view === id}">${label}</button>`).join('')}</div>${lihat}</div>${note()}`;
  }

  function render() {
    const syncTxt = sync?.at ? `Disalin ${esc(new Date(sync.at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }))}. ` : '';
    const body = st.view === 'daftar' ? daftarHtml() : st.view === 'revisi' ? revisiHtml() : st.view === 'tim' ? timHtml() : st.view === 'ringkasan' ? ringkasHtml() : papanHtml();
    root.innerHTML = `${subnav()}<p class="board-note">${syncTxt}Kartu duduk di tahap pertama yang belum selesai. Garis merah = lewat target.</p>${body}`;
    const q = root.querySelector('#wtQ');
    if (q) q.oninput = () => { st.q = q.value; const pos = q.selectionStart; render(); const n = root.querySelector('#wtQ'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } };
    if (st.open && st.view === 'papan') paintPeek(st.open, false);
  }

  function papanHtml() {
    const J = filteredActive();
    const d = DIVS[st.div];
    const onBoard = (j, div) => { const p = curDiv(j, div); return !!p && (!p.done || j.ready); };
    const colKey = (j, div) => { const p = curDiv(j, div); if (!p) return ''; if (j.ready || p.done) return p.list[p.list.length - 1]?.k || ''; return p.cur?.k || ''; };
    const inDiv = J.filter((j) => onBoard(j, st.div));
    return `<div class="cmdbar">
      <div class="wt-seg" role="tablist" aria-label="Divisi">${Object.entries(DIVS).map(([k, x]) => {
        const n = J.filter((j) => onBoard(j, k)).length;
        return `<button type="button" data-div="${k}" aria-pressed="${k === st.div}">${x.label} <span class="muted">${n}</span></button>`;
      }).join('')}</div>
      <div class="fchips">${['', ...LOCS].map((l) => `<button type="button" class="fchip" data-loc="${l}" aria-pressed="${st.loc === l}">${l ? esc(l) : 'Semua lokasi'}</button>`).join('')}</div>
      ${can('wt_masuk', { loc: st.loc || 'BSD' }) ? '<button type="button" class="btn btn--primary" id="btnMasuk">Mobil masuk</button>' : ''}
    </div>
    <div class="board">${d.stages.map(([k, label], i) => {
      const cards = inDiv.filter((j) => colKey(j, st.div) === k).sort((a, b) => (a.target || '9999').localeCompare(b.target || '9999') || String(a.plate).localeCompare(String(b.plate)));
      return `<section class="col" data-stage="${k}"><header><span class="muted">${pad(i + 1)}</span> <b>${esc(label)}</b><span class="col__n">${cards.length}</span></header><div class="col__body">${cards.map((j) => cardHtml(j, st.div)).join('') || '<p class="col__empty">Kosong</p>'}</div></section>`;
    }).join('')}</div>`;
  }

  function daftarHtml() {
    const q = st.q.trim().toLowerCase();
    let rows = jobs.filter((j) => !j.nonaktif && (!st.loc || j.loc === st.loc) && (st.list === 'aktif' ? j.active : j.handed));
    if (q) rows = rows.filter((j) => [j.plate, j.car, j.customer, j.no, j.woNo, j.phone].join(' ').toLowerCase().includes(q));
    if (st.until) rows = rows.filter((j) => j.target && j.target.slice(0, 10) <= st.until);
    rows = rows.slice().sort((a, b) => {
      if (st.list !== 'aktif') return (b.handedDate || '').localeCompare(a.handedDate || '');
      if (st.sort === 'lama') return (b.days || 0) - (a.days || 0);
      if (st.sort === 'masuk') return (b.inDate || '').localeCompare(a.inDate || '');
      return (a.target || '9999').localeCompare(b.target || '9999');
    });
    const nAct = jobs.filter((j) => j.active && !j.nonaktif && (!st.loc || j.loc === st.loc)).length;
    const nDone = jobs.filter((j) => j.handed && (!st.loc || j.loc === st.loc)).length;
    return `<div class="cmdbar">
      <div class="wt-seg"><button type="button" data-list="aktif" aria-pressed="${st.list === 'aktif'}">Dikerjakan ${nAct}</button><button type="button" data-list="selesai" aria-pressed="${st.list === 'selesai'}">Sudah serah terima ${nDone}</button></div>
      <select class="inp inp--s" id="wtSort" aria-label="Urutan"><option value="target" ${st.sort === 'target' ? 'selected' : ''}>Urut target selesai</option><option value="lama" ${st.sort === 'lama' ? 'selected' : ''}>Paling lama di bengkel</option><option value="masuk" ${st.sort === 'masuk' ? 'selected' : ''}>Masuk terbaru</option></select>
      <label class="lihat">Target s.d. <input class="inp inp--s" id="wtUntil" inputmode="numeric" autocomplete="off" placeholder="hh/bb/tttt" value="${esc(st.untilText || '')}" aria-label="Target sampai tanggal"></label>
      <div class="fchips">${['', ...LOCS].map((l) => `<button type="button" class="fchip" data-loc="${l}" aria-pressed="${st.loc === l}">${l ? esc(l) : 'Semua lokasi'}</button>`).join('')}</div>
      <input class="inp" id="wtQ" placeholder="Cari nopol, customer, mobil" value="${esc(st.q)}" aria-label="Cari mobil">
      ${can('wt_masuk', { loc: st.loc || 'BSD' }) ? '<button type="button" class="btn btn--primary" id="btnMasuk">Mobil masuk</button>' : ''}
    </div>
    <div class="m-cards">${rows.map((j) => `<button type="button" class="m-card${j.lateOpen ? ' is-late' : ''}" data-id="${esc(j.id)}"><span class="plate">${esc(j.plate || '')}</span> <b>${esc(j.car || '')}</b><small>${esc(j.customer || '')} · ${esc(j.loc || '')}</small><small>${esc((j.divStates || []).map((p) => DIVS[p.div].label + ' · ' + (p.done ? (j.ready ? 'Selesai QC · Siap serah SA' : 'Selesai') : p.cur.label)).join(' / ') || '')}</small><small>Masuk ${esc(fmtDs(j.inDate))} · ${j.days != null ? j.days + ' hr' : ''} · Target ${j.target ? esc(fmtDs(j.target)) : 'belum ada'}</small>${j.ready ? '<span class="badge info">Selesai QC · Siap serah SA</span>' : ''}${j.lateOpen ? '<span class="badge bad">Lewat</span>' : ''}</button>`).join('') || '<p class="muted">Tidak ada mobil.</p>'}</div>
    <div class="tablewrap desk-table"><table class="tbl wt-tbl"><thead><tr><th>Nopol</th><th>Mobil</th><th>Posisi sekarang</th><th>Masuk</th><th>Durasi</th><th>Target</th><th>Prioritas</th><th>Progres</th></tr></thead><tbody>
    ${rows.map((j) => { const pos = (j.divStates || []).map((p) => DIVS[p.div].label + ' · ' + (p.done ? 'Selesai' : p.cur.label)).join(' / '); return `<tr data-id="${esc(j.id)}" tabindex="0" class="${j.lateOpen ? 'is-late' : ''}"><td><span class="plate">${esc(j.plate || '')}</span><br><small class="muted">${esc(j.woNo || j.no || '')}</small></td><td><b>${esc(j.car || '')}</b><br><small>${esc(j.customer || '')} · ${esc(j.loc || '')}</small>${j.ready ? '<br><span class="badge info">Selesai QC · Siap serah SA</span>' : ''}</td><td><small>${esc(pos || '')}</small></td><td>${esc(fmtDs(j.inDate))}</td><td>${j.days != null ? j.days + ' hr' : ''}</td><td>${j.target ? esc(fmtDs(j.target)) : 'Belum ada'}${j.lateOpen ? ' <span class="badge bad">Lewat</span>' : ''}</td><td>${j.priority && PRI[j.priority] ? `<span class="badge ${PRI[j.priority][0]}">${PRI[j.priority][1]}</span>` : ''}</td><td>${(j.divStates || []).map((s) => `<div class="wt-prog"><span>${DIVS[s.div].label}</span><i><b style="width:${s.pct}%"></b></i></div>`).join('')}</td></tr>`; }).join('') || '<tr><td colspan="8" class="muted">Tidak ada mobil.</td></tr>'}
    </tbody></table></div>`;
  }

  function revisiHtml() {
    let rows = jobs.filter((j) => !j.nonaktif && (!st.loc || j.loc === st.loc)).flatMap((j) => (j.revList || []).map((r) => ({ j, r })));
    if (st.rdiv) rows = rows.filter((x) => x.r.div === st.rdiv);
    if (st.rsumber) rows = rows.filter((x) => (x.r.sumber || 'qc') === st.rsumber);
    const tabOf = (r) => r.st === 'ok' ? 'ok' : r.st === 'fixed' ? 'fixed' : 'open';
    const cnt = (k) => rows.filter((x) => k === 'semua' || tabOf(x.r) === k).length;
    const shown = rows.filter((x) => st.rev === 'semua' || tabOf(x.r) === st.rev).sort((a, b) => (b.r.at || '').localeCompare(a.r.at || ''));
    const tabs = [['open', 'Belum diperbaiki'], ['fixed', 'Menunggu dicek'], ['ok', 'OK'], ['semua', 'Semua']];
    return `<div class="cmdbar">
      <div class="wt-seg">${tabs.map(([k, l]) => `<button type="button" data-rev="${k}" aria-pressed="${st.rev === k}">${l} <span class="muted">${cnt(k)}</span></button>`).join('')}</div>
      <select class="inp inp--s" id="revDiv" aria-label="Divisi"><option value="">Semua divisi</option>${Object.entries(DIVS).map(([k, d]) => `<option value="${k}" ${st.rdiv === k ? 'selected' : ''}>${d.label}</option>`).join('')}</select>
      <div class="fchips">${['', ...LOCS].map((l) => `<button type="button" class="fchip" data-loc="${l}" aria-pressed="${st.loc === l}">${l ? esc(l) : 'Semua lokasi'}</button>`).join('')}</div>
      <select class="inp inp--s" id="revSumber" aria-label="Sumber"><option value="">Semua sumber</option><option value="qc" ${st.rsumber === 'qc' ? 'selected' : ''}>QC internal</option><option value="komplain" ${st.rsumber === 'komplain' ? 'selected' : ''}>Komplain customer</option></select>
    </div>
    <div class="tablewrap"><table class="tbl"><thead><tr><th>Mobil</th><th>Pekerjaan</th><th>Divisi</th><th>Sumber</th><th>Umur</th><th>Status</th></tr></thead><tbody>
    ${shown.map(({ j, r }) => { const u = ageDays(r.at); const red = r.st !== 'ok' && u > 2; return `<tr data-id="${esc(j.id)}"><td><span class="plate">${esc(j.plate || '')}</span> ${esc(j.loc || '')}</td><td><b>${esc(r.itemT || '—')}</b><br><small class="muted">${esc(r.note || '')}</small></td><td>${esc(DIVS[r.div]?.label || r.div || '')}</td><td>${r.sumber === 'komplain' ? 'Komplain customer' : 'QC internal'}</td><td class="${red ? 'sa-late' : ''}"><b>${u} hr</b></td><td>${r.st === 'ok' ? '<span class="badge ok">OK</span>' : r.st === 'fixed' ? '<span class="badge warn">Menunggu dicek</span>' : '<span class="badge bad">Belum diperbaiki</span>'}</td></tr>`; }).join('') || '<tr><td colspan="6" class="muted">Belum ada revisi.</td></tr>'}
    </tbody></table></div>`;
  }

  function ringkasHtml() {
    const J = filteredActive();
    const tiles = [
      ['Sedang dikerjakan', J.length],
      ['Lewat target', J.filter((j) => j.lateOpen).length],
      ['Selesai QC · Siap serah SA', J.filter((j) => j.ready).length],
      ['Belum ada target', J.filter((j) => j.noTarget).length],
      ['Revisi belum OK', J.reduce((n, j) => n + (j.openRevs?.length || 0), 0)],
      ['Di vendor', J.filter((j) => j.atVendor).length],
    ];
    return `<div class="fchips">${['', ...LOCS].map((l) => `<button type="button" class="fchip" data-loc="${l}" aria-pressed="${st.loc === l}">${l ? esc(l) : 'Semua lokasi'}</button>`).join('')}</div>
    <div class="wt-stats">${tiles.map(([l, n]) => `<div class="wt-stat"><small>${esc(l)}</small><b>${n}</b></div>`).join('')}</div>
    <div class="wt-loads">${Object.entries(DIVS).map(([k, d]) => {
      const inDiv = J.filter((j) => (j.divs || []).includes(k));
      return `<section class="card wt-load"><header><h3><span class="wt-big">${inDiv.length}</span> ${d.label}</h3></header><p class="muted tiny">${d.stages.length} tahap</p></section>`;
    }).join('')}</div>`;
  }

  function timHtml() {
    const team = ctx.team || {};
    const rows = Object.entries(team);
    return `<p class="lead">${rows.length} orang di salinan tim. Peran login portal (yang dikunci database) diatur di menu Tim &amp; Peran. Di sini Owner mengatur daftar operasional bengkel.</p>
    <div class="tablewrap"><table class="tbl"><thead><tr><th>Nama</th><th>Peran</th><th>Divisi</th><th>Lokasi</th><th></th></tr></thead><tbody>
    ${rows.map(([id, m]) => `<tr><td><b>${esc(m.name || id)}</b>${m.nonaktif ? ' <span class="badge off">Nonaktif</span>' : ''}</td><td>${esc(ROLE[m.role] || 'Belum diatur (hanya lihat)')}</td><td>${m.role === 'kadiv' ? esc(DIVS[m.div]?.label || m.div || '') : '—'}</td><td>${esc(m.loc || 'Semua lokasi')}</td><td>${can('set_tim') && !m.nonaktif ? `<button type="button" class="btn btn--s" data-tim="${esc(id)}">Ubah</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Belum ada tim.</td></tr>'}
    </tbody></table></div>
    ${can('set_tim') ? '<p><button type="button" class="btn" id="timAdd">Tambah anggota</button></p>' : ''}`;
  }

  function layer() {
    let scrim = document.getElementById('peekScrim');
    let peek = document.getElementById('peek');
    if (!scrim) {
      scrim = document.createElement('div'); scrim.id = 'peekScrim'; scrim.className = 'peek-scrim'; scrim.hidden = true; document.body.appendChild(scrim);
      scrim.addEventListener('click', closePeek);
    }
    if (!peek) {
      peek = document.createElement('aside'); peek.id = 'peek'; peek.className = 'peek'; peek.hidden = true; peek.setAttribute('aria-label', 'Detail mobil'); document.body.appendChild(peek);
    }
    return { scrim, peek };
  }
  function closePeek() {
    const peek = document.getElementById('peek'), scrim = document.getElementById('peekScrim');
    if (!peek) return;
    peek.hidden = true; if (scrim) scrim.hidden = true; st.open = '';
  }
  function paintPeek(id) {
    const j = jobs.find((x) => x.id === id); if (!j) return;
    st.open = id; st.sel = id;
    const { peek, scrim } = layer();
    const stages = (j.divStates || []).map((s) => `<div class="wt-steps"><b>${DIVS[s.div].label}</b> <small>${s.done ? 'selesai' : (s.list.filter((x) => x.s === 'done').length + '/' + s.list.filter((x) => x.s !== 'skip').length)}</small><ol>${s.list.map((x) => {
      const cur = s.cur?.k === x.k;
      const btns = [];
      if (can('wt_tick', { loc: j.loc, div: s.div }) && !j.handed) {
        if (x.s === 'todo' && cur) {
          btns.push(`<button type="button" class="btn btn--s" data-stage="${s.div}:${x.k}:done">Selesai</button>`);
          btns.push(`<button type="button" class="btn btn--s" data-stage="${s.div}:${x.k}:skip">Lewati</button>`);
        } else if (x.s === 'done' || x.s === 'skip') btns.push(`<button type="button" class="btn btn--s" data-stage="${s.div}:${x.k}:todo">Batalkan</button>`);
      }
      return `<li class="${x.s === 'done' ? 'is-done' : x.s === 'skip' ? 'is-skip' : cur ? 'is-cur' : ''}">${esc(x.label)}${x.at ? ` <small class="muted">${esc(fmtDT(x.at))}${x.by ? ' · ' + esc(who ? who(x.by) : x.by) : ''}</small>` : ''} ${btns.join(' ')}</li>`;
    }).join('')}</ol></div>`).join('');
    peek.innerHTML = `<header class="peek__h"><div><span class="plate">${esc(j.plate || '—')}</span><h2>${esc(j.car || '')}</h2><p class="muted">${esc(j.color || '')} ${esc(j.woNo || '')}</p></div><button type="button" class="iconbtn" data-peek-close aria-label="Tutup">×</button></header>
      <div class="peek__body">
        <p>${j.handed ? `<span class="badge ok">Diserahkan ${esc(fmtDs(j.handedDate))}</span>` : j.ready ? '<span class="badge info">Selesai QC · Siap serah SA</span>' : j.lateOpen ? '<span class="badge bad">Lewat target</span>' : '<span class="badge off">Dikerjakan</span>'}</p>
        <div class="peek__facts"><div><small>Customer</small><b>${esc(j.customer || '—')}</b></div><div><small>Lokasi</small><b>${esc(j.loc || '—')}</b></div><div><small>Masuk</small><b>${esc(j.inDate || '—')}</b></div><div><small>Target</small><b>${esc(j.target || 'Belum ada')}</b></div></div>
        <div class="fchips">
          ${can('wt_target', { loc: j.loc }) ? '<button type="button" class="btn btn--s" id="btnTarget">Atur target</button>' : ''}
          ${can('wt_edit', { loc: j.loc }) ? '<button type="button" class="btn btn--s" id="btnEdit">Edit WO</button>' : ''}
          ${can('wt_revisi', { loc: j.loc, div: (j.divs || [])[0] }) ? '<button type="button" class="btn btn--s" id="btnRev">Catat revisi</button>' : ''}
          ${can('wt_void', { loc: j.loc, handed: j.handed }) ? '<button type="button" class="btn btn--s" id="btnVoid">Tandai dibatalkan</button>' : ''}
          ${j.ready ? '<button type="button" class="btn btn--s" id="btnKeSa">Buka Serah Terima SA</button>' : ''}
        </div>
        <h3>Tahapan</h3>${stages || '<p class="muted">Belum ada divisi.</p>'}
        <h3>Revisi</h3>
        <ul class="wt-items">${(j.revList || []).map((r) => `<li>${r.st === 'ok' ? 'OK' : r.st === 'fixed' ? 'Menunggu dicek' : 'Belum diperbaiki'} · ${esc(r.itemT || '')}
          ${can('wt_revisi', { loc: j.loc, div: r.div }) && r.st === 'open' ? `<button type="button" class="btn btn--s" data-revst="${esc(r.id)}:fixed">Sudah diperbaiki</button>` : ''}
          ${can('wt_revisi_ok', { loc: j.loc }) && r.st === 'fixed' ? `<button type="button" class="btn btn--s" data-revst="${esc(r.id)}:ok">OK</button>` : ''}</li>`).join('') || '<li class="muted">Belum ada.</li>'}</ul>
        <h3>Riwayat target</h3>
        <ul class="wt-log">${(j.targetHist || []).map((h) => `<li><small class="muted">${esc(fmtDT(h.at))} · ${esc(h.by || '')}</small><span>${esc(h.from || '—')} → ${esc(h.to || '')}. ${esc(h.alasan || '')}</span></li>`).join('') || `<li class="muted">Target awal ${esc(j.target0 || j.target || 'belum ada')}.</li>`}</ul>
      </div>`;
    scrim.hidden = false; peek.hidden = false; peek.classList.add('is-in');
    root.querySelectorAll('.issue').forEach((el) => el.classList.toggle('is-on', el.dataset.id === id));
  }

  async function saveJob(j, data, action, div) {
    await gate.save('work', 'jobs', j.id, data, { action, loc: data.loc || j.loc, div, unit_id: UNIT_OF[data.loc || j.loc] || null, handed: j.handed });
    toast('Tersimpan di data contoh browser ini.');
    if (refresh) await refresh();
  }

  function openDlg(html, onok) {
    const dlg = document.getElementById('dlg');
    dlg.classList.add('dlg--wide');
    dlg.innerHTML = `<form class="dlg" id="wtForm">${html}<div class="composer__acts"><button type="button" class="btn" data-close>Batal</button><button class="btn btn--primary" type="submit">Simpan</button></div></form>`;
    dlg.onclick = (e) => { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); };
    dlg.onsubmit = async (e) => { e.preventDefault(); try { await onok(new FormData(e.target)); dlg.close(); } catch (err) { toast(err.message, true); } };
    if (!dlg.open) dlg.showModal();
  }

  function formMasuk() {
    openDlg(`<h3>Mobil masuk</h3>
      <label>File WO <input class="inp" name="file" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"></label>
      <div class="composer__grid">
        <input class="inp" name="plate" placeholder="Nopol" aria-label="Nopol">
        <input class="inp" name="car" placeholder="Tipe mobil" required aria-label="Tipe mobil">
        <input class="inp" name="customer" placeholder="Nama customer" required aria-label="Customer">
        <input class="inp" name="inDate" type="date" required value="${esc(today)}" aria-label="Tanggal masuk">
        <select class="inp" name="loc" required aria-label="Lokasi">${LOCS.map((l) => `<option>${l}</option>`).join('')}</select>
        <input class="inp" name="year" placeholder="Tahun" aria-label="Tahun">
        <input class="inp" name="color" placeholder="Warna" aria-label="Warna">
        <input class="inp" name="phone" placeholder="No. HP" aria-label="HP">
        <input class="inp" name="wo" placeholder="Kode WO, kosong = otomatis" aria-label="Kode WO">
      </div>
      <p class="muted tiny">Kategori divisi. SPPF dan Repaint/Cat masuk Bodyworks.</p>
      <div class="fchips">${Object.entries(DIVS).map(([k, d]) => `<label class="fchip"><input type="checkbox" name="div" value="${k}"> ${d.label}</label>`).join('')}</div>
      <input class="inp" name="vendor" placeholder="Nama vendor, bila ada" aria-label="Vendor">
      <textarea class="inp" name="note" placeholder="Catatan" aria-label="Catatan"></textarea>
      <textarea class="inp" name="items" placeholder="Daftar pekerjaan, satu baris satu pekerjaan" aria-label="Pekerjaan"></textarea>`, async (fd) => {
      const loc = fd.get('loc');
      if (!can('wt_masuk', { loc })) throw new Error('Hanya SA lokasi ini atau Owner yang mencatat mobil masuk.');
      const divs = fd.getAll('div').map(String);
      if (!divs.length) throw new Error('Pilih minimal satu divisi.');
      const plate = String(fd.get('plate') || '');
      const inDate = String(fd.get('inDate'));
      const items = String(fd.get('items') || '').split('\n').map((t) => t.trim()).filter(Boolean).map((t) => ({ t, div: coerceDiv(t, '') || divs[0] }));
      const id = 'job-' + uid();
      const n = jobs.length + 1;
      const data = {
        no: `RM-${today.slice(2, 4)}${today.slice(5, 7)}-${String(n).padStart(3, '0')}`,
        plate, car: fd.get('car'), customer: fd.get('customer'), inDate, loc, year: fd.get('year') || '', color: fd.get('color') || '', phone: fd.get('phone') || '',
        woNo: String(fd.get('wo') || '').trim() || woCode(plate, inDate),
        divs, stages: Object.fromEntries(divs.map((d) => [d, {}])),
        vendorName: fd.get('vendor') || '', note: fd.get('note') || '', woItems: items,
        woFile: fd.get('file') && fd.get('file').name ? { nama: fd.get('file').name } : null,
        log: { [uid()]: { at: new Date().toISOString(), by: actor().name, t: 'Mobil masuk' } },
      };
      await gate.save('work', 'jobs', id, data, { action: 'wt_masuk', loc, unit_id: UNIT_OF[loc] });
      toast('Mobil masuk tercatat.');
      if (refresh) await refresh();
    });
  }

  function formTarget(j) {
    openDlg(`<h3>Atur target dan prioritas</h3><p class="muted tiny">${esc(j.plate)} · ${esc(j.car)}</p>
      <label>Target selesai <input class="inp" type="date" name="target" value="${esc(j.target || '')}" required></label>
      <label>Prioritas <select class="inp" name="priority"><option value="">Tidak diisi</option>${Object.keys(PRI).map((k) => `<option ${j.priority === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      <label>Alasan bila target berubah <input class="inp" name="alasan" placeholder="Wajib bila tanggal bergeser"></label>`, async (fd) => {
      if (!can('wt_target', { loc: j.loc })) throw new Error('Hanya Kepala Bengkel atau Owner.');
      const data = raw(j);
      const to = String(fd.get('target'));
      const from = j.target || '';
      if (from && from !== to && String(fd.get('alasan') || '').trim().length < 3) throw new Error('Isi alasan perubahan target.');
      data.target0 = data.target0 || from || to;
      data.target = to;
      data.priority = fd.get('priority') || '';
      if (from !== to) {
        data.targetHist = [...(data.targetHist || []), { from, to, alasan: fd.get('alasan') || '', by: actor().name, at: new Date().toISOString() }];
        data.log = { ...(data.log || {}), [uid()]: { at: new Date().toISOString(), by: actor().name, t: `Target ${from || 'kosong'} menjadi ${to}` } };
      }
      await saveJob(j, data, 'wt_target');
    });
  }

  function formRev(j) {
    const items = (j.woItems || []).map((it) => it.t).filter(Boolean);
    openDlg(`<h3>Catat revisi</h3>
      <label>Pekerjaan <select class="inp" name="item">${items.map((t) => `<option>${esc(t)}</option>`).join('')}<option>Lainnya (divisi)</option></select></label>
      <label>Divisi <select class="inp" name="div">${(j.divs || []).filter((d) => DIVS[d]).map((d) => `<option value="${d}">${DIVS[d].label}</option>`).join('')}</select></label>
      <label>Sumber <select class="inp" name="sumber"><option value="qc">QC internal</option><option value="komplain">Komplain customer</option></select></label>
      <textarea class="inp" name="note" required placeholder="Yang perlu diperbaiki"></textarea>
      <label>Foto masalah <input class="inp" type="file" name="foto" accept="image/*"></label>`, async (fd) => {
      const div = String(fd.get('div'));
      if (!can('wt_revisi', { loc: j.loc, div })) throw new Error('Revisi ini di luar divisi atau lokasi kamu.');
      const data = raw(j);
      const id = uid();
      data.revs = { ...(data.revs || {}) };
      data.revs[id] = { status: 'open', itemT: fd.get('item'), note: fd.get('note'), div, sumber: fd.get('sumber'), at: new Date().toISOString(), by: actor().name, foto: fd.get('foto') && fd.get('foto').name ? fd.get('foto').name : '' };
      data.log = { ...(data.log || {}), [uid()]: { at: new Date().toISOString(), by: actor().name, t: 'Revisi dicatat' } };
      await saveJob(j, data, 'wt_revisi', div);
    });
  }

  async function setStage(j, div, key, s) {
    if (!can('wt_tick', { loc: j.loc, div })) throw new Error('Kamu tidak boleh mengubah tahap ini.');
    const data = raw(j);
    data.stages = { ...(data.stages || {}) };
    data.stages[div] = { ...(data.stages[div] || {}) };
    const label = DIVS[div].stages.find((x) => x[0] === key)?.[1] || key;
    const verb = s === 'done' ? 'selesai' : s === 'skip' ? 'dilewati' : 'dikembalikan';
    if (s === 'todo') data.stages[div][key] = { s: 'todo' };
    else data.stages[div][key] = { s, at: new Date().toISOString(), by: actor().name };
    data.log = { ...(data.log || {}), [uid()]: { at: new Date().toISOString(), by: actor().name, t: `${label} ${verb}` } };
    await saveJob(j, data, 'wt_tick', div);
  }

  async function setRevStatus(j, id, status) {
    const rev = (j.revs || {})[id] || (j.revList || []).find((r) => r.id === id);
    const div = rev?.div;
    if (status === 'ok' && !can('wt_revisi_ok', { loc: j.loc })) throw new Error('Hanya Kepala Bengkel yang menandai OK.');
    if (!can('wt_revisi', { loc: j.loc, div })) throw new Error('Di luar wewenang.');
    const data = raw(j);
    data.revs = { ...(data.revs || {}) };
    data.revs[id] = { ...(data.revs[id] || rev), status, ...(status === 'ok' ? { okAt: new Date().toISOString(), okBy: actor().name } : {}) };
    await saveJob(j, data, status === 'ok' ? 'wt_revisi_ok' : 'wt_revisi', div);
  }

  root.addEventListener('click', async (e) => {
    const viewBtn = e.target.closest('[data-view]');
    if (viewBtn) { st.view = viewBtn.dataset.view; closePeek(); render(); return; }
    const divBtn = e.target.closest('[data-div]');
    if (divBtn) { st.div = divBtn.dataset.div; render(); return; }
    const locBtn = e.target.closest('[data-loc]');
    if (locBtn) { st.loc = locBtn.dataset.loc; render(); return; }
    const listBtn = e.target.closest('[data-list]');
    if (listBtn) { st.list = listBtn.dataset.list; render(); return; }
    const revBtn = e.target.closest('[data-rev]');
    if (revBtn) { st.rev = revBtn.dataset.rev; render(); return; }
    if (e.target.id === 'btnMasuk') { formMasuk(); return; }
    const card = e.target.closest('[data-id]');
    if (card && (card.classList.contains('m-card') || !e.target.closest('button'))) { paintPeek(card.dataset.id); return; }
  });
  root.addEventListener('change', (e) => {
    if (e.target.id === 'wtSort') { st.sort = e.target.value; render(); }
    if (e.target.id === 'wtUntil') {
      st.untilText = e.target.value;
      const m = String(e.target.value || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      st.until = m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
      render();
    }
    if (e.target.id === 'revDiv') { st.rdiv = e.target.value; render(); }
    if (e.target.id === 'revSumber') { st.rsumber = e.target.value; render(); }
    if (e.target.id === 'lihatSebagai') { gate.setPreview(e.target.value === 'akun' ? '' : e.target.value); toast('Tampilan peran diganti. Di portal sungguhan, peran mengikuti akun yang masuk.'); render(); }
  });
  mountBoard._onPeek = async (e) => {
    if (!e.target.closest('#peek')) return;
    if (e.target.closest('[data-peek-close]')) { closePeek(); return; }
    const j = jobs.find((x) => x.id === st.open); if (!j) return;
    const stg = e.target.closest('[data-stage]');
    if (stg) { const [div, key, s] = stg.dataset.stage.split(':'); try { await setStage(j, div, key, s); } catch (err) { toast(err.message, true); } return; }
    const rs = e.target.closest('[data-revst]');
    if (rs) { const [id, status] = rs.dataset.revst.split(':'); try { await setRevStatus(j, id, status); } catch (err) { toast(err.message, true); } return; }
    if (e.target.id === 'btnTarget') formTarget(j);
    if (e.target.id === 'btnRev') formRev(j);
    if (e.target.id === 'btnEdit') document.dispatchEvent(new CustomEvent('portal:edit-wo', { detail: j.id }));
    if (e.target.id === 'btnKeSa') { location.hash = '#/m/work/sa'; }
    if (e.target.id === 'btnVoid') {
      if (!confirm('Tandai mobil ini Dibatalkan? Data tidak dihapus.')) return;
      const data = raw(j);
      data.nonaktif = true; data.statusBatal = 'Dibatalkan';
      try { await saveJob(j, data, 'wt_void'); closePeek(); } catch (err) { toast(err.message, true); }
    }
  };
  if (!mountBoard._peekBound) {
    document.body.addEventListener('click', (e) => mountBoard._onPeek?.(e));
    mountBoard._peekBound = true;
  }

  function onKey(e) {
    if (!root.isConnected || root.hidden || st.view !== 'papan') return;
    const ids = [...root.querySelectorAll('.issue')].map((el) => el.dataset.id);
    let i = ids.indexOf(st.sel);
    if (e.detail === 'j' || e.detail === 'k') {
      if (!ids.length) return;
      e.preventDefault();
      i = e.detail === 'j' ? Math.min(ids.length - 1, Math.max(0, i) + (e.detail === 'j' ? 1 : 0)) : Math.max(0, i - 1);
      if (e.detail === 'j' && i < 0) i = 0;
      st.sel = ids[Math.max(0, i)];
      root.querySelectorAll('.issue').forEach((el) => el.classList.toggle('is-on', el.dataset.id === st.sel));
    } else if (e.detail === 'enter' && st.sel) { e.preventDefault(); paintPeek(st.sel); }
    else if (e.detail === 'esc' && st.open) { e.preventDefault(); closePeek(); }
    else if (e.detail === 'c') { e.preventDefault(); if (can('wt_masuk', { loc: st.loc || actor().sa?.[0] || 'BSD' })) formMasuk(); }
  }
  if (mountBoard._off) mountBoard._off();
  document.addEventListener('portal:key', onKey);
  mountBoard._off = () => document.removeEventListener('portal:key', onKey);

  render();
  try {
    const openId = sessionStorage.getItem('portal-open-job');
    if (openId && jobs.some((j) => j.id === openId)) { sessionStorage.removeItem('portal-open-job'); paintPeek(openId); }
    if (sessionStorage.getItem('portal-open-new') === '1') { sessionStorage.removeItem('portal-open-new'); if (can('wt_masuk', { loc: 'BSD' })) formMasuk(); }
  } catch (e) {}

  return {
    open(id) { paintPeek(id); },
    close: closePeek,
    redraw(next) { if (next) jobs = next; render(); if (st.open) paintPeek(st.open); },
  };
}

// allows dipakai uji peran di layar; impor ulang supaya tidak terbuang saat di-tree-shake manual.
export { allows };
