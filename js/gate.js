// Saklar sumber dan pemeriksaan peran di sisi layar.
// Mode demo selalu boleh menulis ke data contoh di browser.
// Portal sungguhan hanya menulis bila Owner sudah menyalakan portal_is_source untuk app itu.

import { DEMO } from './api.js?v=45';
import { allows, actorFromMember, PREVIEW } from './rules.js?v=45';

const PREVIEW_KEY = 'rmoda-lihat-sebagai';

export function openGate({ api, me, assignments, roles }) {
  const real = actorFromMember(me, assignments, roles);
  let sources = { work: false, sa: false };
  let preview = null;
  if (DEMO) {
    try { preview = JSON.parse(sessionStorage.getItem(PREVIEW_KEY) || 'null'); } catch (e) { preview = null; }
  }
  const gate = {
    demo: DEMO,
    real,
    sources,
    previews: PREVIEW,
    actor() { return DEMO && preview ? preview : real; },
    setPreview(id) {
      if (!DEMO) return;
      if (!id || id === 'akun') { preview = null; sessionStorage.removeItem(PREVIEW_KEY); return; }
      const row = PREVIEW.find((p) => p[0] === id);
      preview = row ? row[2] : null;
      if (preview) sessionStorage.setItem(PREVIEW_KEY, JSON.stringify({ ...preview, id }));
      else sessionStorage.removeItem(PREVIEW_KEY);
    },
    previewId() { return preview?.id || (preview?.owner ? 'owner' : ''); },
    async load() {
      try { sources = await api.portalSources(); } catch (e) { sources = { work: false, sa: false }; }
      gate.sources = sources;
      return sources;
    },
    writable(app) { return DEMO || !!sources[app]; },
    can(action, ctx = {}) {
      const who = action === 'set_source' ? real : gate.actor();
      if (action !== 'set_source' && !gate.writable(ctx.app)) return false;
      return allows(who, action, ctx);
    },
    blockReason(app) {
      if (gate.writable(app)) return '';
      return 'Portal belum menjadi sumber data. Staf tetap bekerja di aplikasi Claude. Saklar hanya dinyalakan Owner setelah Pak menyetujui.';
    },
    async save(app, coll, id, data, opt = {}) {
      if (!gate.writable(app)) throw new Error(gate.blockReason(app));
      if (!allows(gate.actor(), opt.action, opt)) throw new Error('Peran ini tidak boleh melakukan aksi tersebut.');
      return api.savePortalDoc(app, coll, id, data, opt);
    },
    async setSource(app, on) {
      if (!allows(real, 'set_source', {})) throw new Error('Hanya Owner yang boleh mengubah saklar sumber.');
      const next = await api.setPortalSource(app, !!on);
      sources = { ...sources, [app]: !!on, ...(next && typeof next === 'object' && !Array.isArray(next) ? next : {}) };
      gate.sources = sources;
      return sources;
    },
  };
  return gate;
}
