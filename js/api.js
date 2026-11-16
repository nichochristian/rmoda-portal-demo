// Lapisan data portal. Dua mode:
//  - Supabase (produksi): data di database, akses dikunci Row Level Security.
//  - Demo: data contoh di localStorage browser ini, untuk mencoba tampilan.
import { demoDocs, demoSyncAt, demoSaveDoc, demoSources, demoSetSource } from './demo-docs.js?v=45';
// Pendaftaran publik dimatikan. Tidak ada signUp. Akun baru hanya lewat undangan owner.
const CFG = window.PORTAL_CONFIG || {};
export const DEMO = !CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY;

export const LEVELS = ['none', 'view', 'edit', 'approve'];
export const LEVEL_LABEL = { none: 'Tidak ada', view: 'Lihat', edit: 'Ubah', approve: 'Approve' };
const rank = (l) => Math.max(0, LEVELS.indexOf(l || 'none'));

/* ------------------------------------------------------------------ */
/* Supabase                                                            */
/* ------------------------------------------------------------------ */
let sb = null;
async function client() {
  if (!sb) {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
    sb = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, detectSessionInUrl: true, autoRefreshToken: true },
    });
  }
  return sb;
}
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

const supa = {
  async session() { const c = await client(); return (await c.auth.getSession()).data.session; },
  async signIn() {
    const c = await client();
    await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
  },
  async signOut() { const c = await client(); await c.auth.signOut(); },
  async claim() { const c = await client(); return must(await c.rpc('claim_membership')); },
  async ref() {
    const c = await client();
    const [units, modules, roles] = await Promise.all([
      c.from('units').select('*').order('sort'),
      c.from('modules').select('*').order('sort'),
      c.from('roles').select('*').order('name'),
    ]);
    return { units: must(units), modules: must(modules), roles: must(roles) };
  },
  async myRoles(memberId) {
    const c = await client();
    const q = await c.from('member_roles').select('unit_id, role_id, scope').eq('member_id', memberId);
    if (q.error && /scope/.test(q.error.message || '')) return must(await c.from('member_roles').select('unit_id, role_id').eq('member_id', memberId));
    return must(q);
  },
  async listMembers() {
    const c = await client();
    return must(await c.from('members').select('*, member_roles(unit_id, role_id)').order('name'))
      .map(m => ({ ...m, assignments: m.member_roles || [] }));
  },
  async saveMember(m, actorId) {
    const c = await client();
    const row = { email: m.email.trim().toLowerCase(), name: m.name.trim(), note: m.note || null, hrd_ref: m.hrd_ref || null };
    if ('see_all_units' in m) row.see_all_units = !!m.see_all_units;
    let saved;
    if (m.id) saved = must(await c.from('members').update(row).eq('id', m.id).select().single());
    else saved = must(await c.from('members').insert({ ...row, status: 'invited', created_by: actorId }).select().single());
    must(await c.from('member_roles').delete().eq('member_id', saved.id));
    if (m.assignments.length) must(await c.from('member_roles').insert(m.assignments.map(a => ({ member_id: saved.id, unit_id: a.unit_id, role_id: a.role_id }))));
    return saved;
  },
  async setStatus(id, status) {
    const c = await client();
    return must(await c.rpc('set_member_status', { p_id: id, p_status: status }));
  },
  async setOwnerFlag(id, flag) {
    const c = await client();
    must(await c.rpc('set_owner_flag', { p_id: id, p_flag: !!flag }));
  },
  async portalFlags() {
    const c = await client();
    const r = await c.from('portal_flags').select('read_only,changed_at,note').eq('id', 1).maybeSingle();
    if (r.error) return { read_only: false };
    return r.data || { read_only: false };
  },
  async setReadOnly(on, note) {
    const c = await client();
    return must(await c.rpc('set_portal_read_only', { p_on: !!on, p_note: note || null }));
  },
  async replaceMember(oldId, email, name) {
    const c = await client();
    return must(await c.rpc('replace_member', { old_id: oldId, new_email: email.trim().toLowerCase(), new_name: name.trim() }));
  },
  async invite(ids) {
    const c = await client();
    const { data, error } = await c.functions.invoke('invite', { body: { member_ids: ids } });
    if (error) throw new Error(error.message);
    return data.results;
  },
  async saveRole(r) {
    const c = await client();
    const row = { name: r.name.trim(), description: r.description || null, permissions: r.permissions };
    return r.id ? must(await c.from('roles').update(row).eq('id', r.id).select().single())
                : must(await c.from('roles').insert(row).select().single());
  },
  async deleteRole(id) { const c = await client(); must(await c.from('roles').delete().eq('id', id)); },
  async listImports() { const c = await client(); return must(await c.from('import_candidates').select('*').order('display_name')); },
  async updateImport(id, patch) { const c = await client(); return must(await c.from('import_candidates').update(patch).eq('id', id).select().single()); },
  async audit(limit = 200) {
    const c = await client();
    return must(await c.from('audit_log').select('*').order('at', { ascending: false }).limit(limit));
  },
  async exportAll() {
    const c = await client();
    const out = {};
    for (const t of ['units', 'modules', 'roles', 'members', 'member_roles', 'import_candidates', 'audit_log', 'app_docs', 'sync_runs']) {
      out[t] = must(await c.from(t).select('*'));
    }
    return out;
  },
  /* Salinan data aplikasi Claude (Tahap 2). RLS hanya mengembalikan unit yang boleh dilihat. */
  async listDocs(app, coll) {
    const c = await client(); const out = []; const size = 1000;
    for (let from = 0; ; from += size) {
      let qy = c.from('app_docs').select('coll,id,unit_id,data,version,updated_at').eq('app', app);
      if (coll) qy = qy.eq('coll', coll);
      const page = must(await qy.order('coll').order('id').range(from, from + size - 1));
      out.push(...page); if (page.length < size) break;
    }
    return out;
  },
  async lastSync(app) {
    const c = await client();
    return must(await c.from('sync_runs').select('*').eq('app', app).order('at', { ascending: false }).limit(1))[0] || null;
  },
  /* Sinkron lewat browser dimatikan. Laptop memakai sync_push.py dengan akun sinkron. */
  async syncCollection() {
    throw new Error('Sinkron lewat browser dimatikan. Pakai skrip sync_push.py di laptop.');
  },
  async logSync(app, by, source, counts) {
    const c = await client(); must(await c.from('sync_runs').insert({ app, by, source, counts }));
  },

  /* Tahap 3: menulis dari portal. RLS: butuh izin 'edit' (atau tingkat dokumen bila lebih tinggi). */
  async putDoc(app, coll, id, data, { unit_id = null, min_level = 'view' } = {}) {
    const c = await client(); const now = new Date().toISOString();
    const existing = await c.from('app_docs').select('id').eq('app', app).eq('coll', coll).eq('id', id).maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data) {
      return must(await c.from('app_docs').update({ data, updated_at: now })
        .eq('app', app).eq('coll', coll).eq('id', id).select('coll,id,unit_id,data,version,updated_at').single());
    }
    return must(await c.from('app_docs').insert({ app, coll, id, data, unit_id, min_level, updated_at: now, synced_at: now })
      .select('coll,id,unit_id,data,version,updated_at').single());
  },
  /* Ubah sebagian isi data (gabung dangkal) tanpa mengubah unit / tingkat. */
  async patchDoc(app, coll, id, patch) {
    const c = await client();
    const cur = must(await c.from('app_docs').select('data').eq('app', app).eq('coll', coll).eq('id', id).single());
    const data = { ...(cur?.data || {}), ...patch };
    for (const k of Object.keys(patch)) if (patch[k] === undefined) delete data[k];
    return must(await c.from('app_docs').update({ data, updated_at: new Date().toISOString() })
      .eq('app', app).eq('coll', coll).eq('id', id).select('coll,id,unit_id,data,version,updated_at').single());
  },
  async deleteDoc() {
    throw new Error('Penghapusan data dimatikan.');
  },
  async portalSources() {
    try {
      const c = await client();
      const r = await c.from('app_settings').select('app,value').eq('key', 'portal_is_source');
      if (r.error) return { work: false, sa: false };
      const out = { work: false, sa: false };
      for (const row of r.data || []) out[row.app] = row.value === true;
      return out;
    } catch (e) { return { work: false, sa: false }; }
  },
  async setPortalSource(app, on) {
    const c = await client();
    const v = must(await c.rpc('set_portal_source', { p_app: app, p_on: !!on }));
    return { ...(await this.portalSources()), [app]: v === true || v === 'true' };
  },
  async savePortalDoc(app, coll, id, data, opt = {}) {
    const c = await client();
    return must(await c.rpc('portal_save_doc', {
      p_app: app, p_coll: coll, p_id: id, p_unit: opt.unit_id || null, p_data: data,
      p_action: opt.action, p_div: opt.div || null,
    }));
  },
  /* 'copy' = salinan dari Claude (perubahan di portal = uji coba), 'live' = portal tempat kerja utama */
  async appMode(app) {
    const c = await client();
    const r = await c.from('app_modes').select('mode,changed_at').eq('app', app).maybeSingle();
    return r.error ? { mode: 'copy' } : (r.data || { mode: 'copy' });
  },
  async setAppMode(app, mode, by) {
    const c = await client();
    return must(await c.from('app_modes').upsert({ app, mode, changed_at: new Date().toISOString(), changed_by: by }).select().single());
  },
};

/* ------------------------------------------------------------------ */
/* Demo (localStorage)                                                 */
/* ------------------------------------------------------------------ */
const KEY = 'rmoda-portal-demo-v2';
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
const P = (o) => o;
function seed() {
  const roles = [
    { name: 'Owner', description: 'Semua unit dan modul, kelola pengguna, export semua data', is_system: true,
      permissions: P({ work: 'approve', crm: 'approve', setoran: 'approve', hrd: 'approve', proflex: 'approve', expc: 'approve', docs: 'approve', admin: 'approve', sa: 'approve' }) },
    { name: 'Kepala Unit', description: 'Semua modul di unitnya, termasuk approve/konfirmasi', is_system: true,
      permissions: P({ work: 'approve', crm: 'approve', setoran: 'approve', hrd: 'view', proflex: 'approve', expc: 'approve', docs: 'view' }) },
    { name: 'Service Advisor', description: 'Job, WO, dan CRM pelanggan', is_system: true, permissions: P({ work: 'edit', crm: 'edit', docs: 'view', sa: 'edit' }) },
    { name: 'Finance', description: 'Setoran, kas, invoice', is_system: true, permissions: P({ setoran: 'edit', work: 'view', proflex: 'edit', expc: 'edit', docs: 'view' }) },
    { name: 'Gudang', description: 'Stok, barang masuk/keluar, dan opname di cabangnya. Tidak melihat invoice atau kas.', is_system: true, permissions: P({ setoran: 'view', proflex: 'view', expc: 'view' }) },
    { name: 'HRD', description: 'Karyawan, absensi, gaji, kasbon, KPI', is_system: true, permissions: P({ hrd: 'edit', docs: 'view' }) },
    { name: 'Lihat saja', description: 'Bisa melihat, tidak bisa mengubah', is_system: true,
      permissions: P({ work: 'view', crm: 'view', setoran: 'view', proflex: 'view', expc: 'view', docs: 'view' }) },
  ].map(r => ({ id: uid(), created_at: new Date().toISOString(), ...r }));
  const R = Object.fromEntries(roles.map(r => [r.name, r.id]));
  const units = [
    { id: 'rmoda-bsd', name: 'RMODA BSD', grp: 'RMODA Studio', sort: 10 },
    { id: 'rmoda-legok', name: 'RMODA Legok', grp: 'RMODA Studio', sort: 20 },
    { id: 'rmoda-mks', name: 'RMODA Makassar', grp: 'RMODA Studio', sort: 30 },
    { id: 'proflex', name: 'Proflex', grp: 'Proflex', sort: 40 },
    { id: 'expc', name: 'EXPC', grp: 'EXPC', sort: 50 },
    { id: 'hq', name: 'HQ / Owner', grp: 'HQ', sort: 60 },
  ];
  const modules = [
    { id: 'work', name: 'Work Tracker', source: 'RMODA Studio', sort: 10 },
    { id: 'crm', name: 'CRM', source: 'RMODA Studio CRM', sort: 20 },
    { id: 'setoran', name: 'Setoran', source: 'RMODA Setoran', sort: 30 },
    { id: 'hrd', name: 'HRD', source: 'RMODA HRD', sort: 40 },
    { id: 'proflex', name: 'Proflex Graphics', source: 'Proflex Graphics', sort: 50 },
    { id: 'expc', name: 'EXPC', source: 'EXPC', sort: 60 },
    { id: 'docs', name: 'Dokumen', source: null, sort: 70 },
    { id: 'admin', name: 'Tim & Peran', source: null, sort: 80 },
  ];
  const now = new Date().toISOString();
  const mk = (name, email, status, assignments, extra = {}) => ({ id: uid(), name, email, status, is_owner: false, created_at: now,
    invited_at: now, activated_at: status === 'active' ? now : null, assignments, ...extra });
  const owner = mk('Fauzi Rahman', 'owner@demo.rmoda', 'active', units.map(u => ({ unit_id: u.id, role_id: R.Owner })), { is_owner: true });
  const members = [
    owner,
    mk('Contoh SA BSD', 'sa.bsd@demo.rmoda', 'active', [{ unit_id: 'rmoda-bsd', role_id: R['Service Advisor'] }]),
    mk('Contoh Finance', 'finance@demo.rmoda', 'active', [{ unit_id: 'rmoda-bsd', role_id: R.Finance }, { unit_id: 'rmoda-legok', role_id: R.Finance }, { unit_id: 'rmoda-mks', role_id: R.Finance }]),
    mk('Contoh Gudang EXPC', 'gudang.expc@demo.rmoda', 'invited', [{ unit_id: 'expc', role_id: R.Gudang }]),
    mk('Contoh Kepala Makassar', 'kepala.mks@demo.rmoda', 'disabled', [{ unit_id: 'rmoda-mks', role_id: R['Kepala Unit'] }], { disabled_at: now }),
  ];
  const imp = (source_app, display_name, email, unit_id, app_role, role) => ({ id: uid(), source_app, display_name, email, unit_id, app_role,
    role_id: role ? R[role] : null, member_id: null, status: email && role ? 'pending' : 'needs_check', artifact_user_id: 'u_demo' + Math.random().toString(36).slice(2, 8), created_at: now });
  const imports = [
    imp('work', 'Contoh Teknisi Lead', 'lead@demo.rmoda', 'rmoda-bsd', 'Leader', 'Kepala Unit'),
    imp('work', 'Contoh SA Legok', 'sa.legok@demo.rmoda', 'rmoda-legok', 'SA', 'Service Advisor'),
    imp('setoran', 'Contoh SA Legok', 'sa.legok@demo.rmoda', 'rmoda-legok', 'Setor', 'Finance'),
    imp('setoran', 'Contoh Kasir Makassar', '', 'rmoda-mks', 'Kasir', 'Finance'),
    imp('proflex', 'Contoh Admin Proflex', 'admin@demo.proflex', 'proflex', 'Admin', null),
    imp('expc', 'Contoh Admin Academy', 'academy@demo.expc', 'expc', 'Admin Academy', 'Finance'),
  ];
  return { units, modules, roles, members, imports, audit: [], meId: owner.id };
}
function load() { try { return JSON.parse(localStorage.getItem(KEY)) || seed(); } catch { return seed(); } }
function save(db) { localStorage.setItem(KEY, JSON.stringify(db)); }
function log(db, action, target, detail) { db.audit.unshift({ id: db.audit.length + 1, at: new Date().toISOString(), actor: db.meId, action, target, detail }); }

const demo = {
  async session() { return localStorage.getItem(KEY + ':in') ? { user: { email: 'owner@demo.rmoda' } } : null; },
  async signIn() { localStorage.setItem(KEY + ':in', '1'); location.reload(); },
  async signOut() { localStorage.removeItem(KEY + ':in'); },
  async claim() { const db = load(); save(db); const m = db.members.find(x => x.id === db.meId); log(db, 'login', m.email); save(db); return m; },
  async ref() { const db = load(); return { units: db.units, modules: db.modules, roles: db.roles }; },
  async myRoles(id) { return load().members.find(m => m.id === id)?.assignments || []; },
  async listMembers() { return load().members.slice().sort((a, b) => a.name.localeCompare(b.name)); },
  async saveMember(m) {
    const db = load(); const email = m.email.trim().toLowerCase();
    if (db.members.some(x => x.email === email && x.id !== m.id)) throw new Error('Email sudah dipakai pengguna lain');
    let row = db.members.find(x => x.id === m.id);
    if (!row) { row = { id: uid(), status: 'invited', created_at: new Date().toISOString(), invited_at: null, is_owner: false }; db.members.push(row); }
    Object.assign(row, { email, name: m.name.trim(), note: m.note || null, assignments: m.assignments, ...('see_all_units' in m ? { see_all_units: !!m.see_all_units } : {}) });
    log(db, m.id ? 'UPDATE members' : 'INSERT members', email); save(db); return row;
  },
  async setStatus(id, status) {
    const db = load(); const m = db.members.find(x => x.id === id);
    if (m.is_owner && status === 'disabled' && db.members.filter(x => x.is_owner && x.status === 'active' && x.id !== id).length < 1) {
      throw new Error('Owner terakhir yang masih aktif tidak boleh dinonaktifkan');
    }
    m.status = status; m.disabled_at = status === 'disabled' ? new Date().toISOString() : null;
    log(db, 'status ' + status, m.email); save(db); return m;
  },
  async setOwnerFlag(id, flag) {
    const db = load(); const m = db.members.find(x => x.id === id);
    if (!flag && db.members.filter(x => x.is_owner && x.status === 'active' && x.id !== id).length < 1) {
      throw new Error('Owner terakhir tidak boleh dicabut');
    }
    m.is_owner = !!flag; log(db, 'owner ' + (flag ? 'ya' : 'tidak'), m.email); save(db);
  },
  async portalFlags() { return { read_only: !!load().readOnly }; },
  async setReadOnly(on, note) { const db = load(); db.readOnly = !!on; db.readOnlyNote = note || null; save(db); return !!on; },
  async replaceMember(oldId, email, name) {
    const db = load(); const old = db.members.find(x => x.id === oldId);
    if (old.is_owner) throw new Error('Owner tidak bisa diganti lewat menu ini');
    const n = { id: uid(), email: email.trim().toLowerCase(), name: name.trim(), status: 'invited', is_owner: false,
      created_at: new Date().toISOString(), invited_at: new Date().toISOString(), assignments: old.assignments.map(a => ({ ...a })) };
    db.members.push(n); old.status = 'disabled'; old.disabled_at = new Date().toISOString(); old.replaced_by = n.id;
    log(db, 'replace_member', n.email, { old: old.email }); save(db); return n;
  },
  async invite(ids) {
    const db = load();
    const res = ids.map(id => { const m = db.members.find(x => x.id === id); m.invited_at = new Date().toISOString(); log(db, 'invite', m.email); return { email: m.email, ok: m.status !== 'disabled', reason: m.status === 'disabled' ? 'nonaktif' : 'mode demo: email tidak benar-benar dikirim' }; });
    save(db); return res;
  },
  async saveRole(r) {
    const db = load();
    if (db.roles.some(x => x.name.toLowerCase() === r.name.trim().toLowerCase() && x.id !== r.id)) throw new Error('Nama peran sudah ada');
    let row = db.roles.find(x => x.id === r.id);
    if (!row) { row = { id: uid(), is_system: false, created_at: new Date().toISOString() }; db.roles.push(row); }
    const name = r.name.trim();
    const permissions = { ...(r.permissions || {}) };
    if (name === 'Service Advisor' && !['edit', 'approve'].includes(permissions.sa)) permissions.sa = 'edit';
    if (name === 'Owner') permissions.sa = 'approve';
    Object.assign(row, { name, description: r.description, permissions });
    log(db, r.id ? 'UPDATE roles' : 'INSERT roles', row.name); save(db); return row;
  },
  async deleteRole(id) {
    const db = load();
    if (db.members.some(m => m.assignments.some(a => a.role_id === id))) throw new Error('Peran masih dipakai pengguna');
    const r = db.roles.find(x => x.id === id); db.roles = db.roles.filter(x => x.id !== id); log(db, 'DELETE roles', r?.name); save(db);
  },
  async listImports() { return load().imports; },
  async updateImport(id, patch) { const db = load(); const r = db.imports.find(x => x.id === id); Object.assign(r, patch); save(db); return r; },
  async audit() { return load().audit; },
  async exportAll() { const db = load(); return { units: db.units, modules: db.modules, roles: db.roles, members: db.members, import_candidates: db.imports, audit_log: db.audit }; },
  async listDocs(app, coll) { return demoDocs(app, coll); },
  async lastSync(app) { return { app, at: demoSyncAt(), by: 'demo', source: 'contoh', counts: {} }; },
  async deleteDoc() { throw new Error('Penghapusan data dimatikan.'); },
  async portalSources() { return demoSources(); },
  async setPortalSource(app, on) { return demoSetSource(app, on); },
  async savePortalDoc(app, coll, id, data, opt = {}) { return demoSaveDoc(app, coll, id, data, opt.unit_id); },
  async syncCollection() { throw new Error('Sinkron lewat browser dimatikan. Pakai skrip sync_push.py di laptop.'); },
  async logSync() {},
};

export const api = DEMO ? demo : supa;

/* ------------------------------------------------------------------ */
/* Hak akses di sisi tampilan (database tetap memeriksa ulang)          */
/* ------------------------------------------------------------------ */
export function buildPerms(member, assignments, roles) {
  const byId = Object.fromEntries(roles.map(r => [r.id, r]));
  const perms = {}; // unit -> module -> level
  for (const a of assignments) {
    const r = byId[a.role_id]; if (!r) continue;
    perms[a.unit_id] ||= {};
    for (const [mod, lvl] of Object.entries(r.permissions || {})) {
      if (rank(lvl) > rank(perms[a.unit_id][mod])) perms[a.unit_id][mod] = lvl;
    }
  }
  return {
    owner: !!member?.is_owner,
    can(module, unit, lvl = 'view') {
      if (member?.is_owner) return true;
      const units = unit && !member?.see_all_units ? [unit] : Object.keys(perms);
      return units.some(u => rank(perms[u]?.[module]) >= rank(lvl));
    },
    units() { return Object.keys(perms); },
  };
}

/* Gabungkan kandidat impor per email → satu pengguna dengan semua perannya */
export async function acceptImports(rows, actorId) {
  const members = await api.listMembers();
  const groups = new Map();
  for (const r of rows) {
    const key = (r.email || '').trim().toLowerCase();
    if (!key || !r.role_id || !r.unit_id) continue;
    if (!groups.has(key)) groups.set(key, { name: r.display_name, email: key, rows: [] });
    groups.get(key).rows.push(r);
  }
  const created = [];
  for (const g of groups.values()) {
    const existing = members.find(m => m.email === g.email);
    const assignments = [...(existing?.assignments || [])];
    for (const r of g.rows) if (!assignments.some(a => a.unit_id === r.unit_id && a.role_id === r.role_id)) assignments.push({ unit_id: r.unit_id, role_id: r.role_id });
    const saved = await api.saveMember({ id: existing?.id, email: g.email, name: existing?.name || g.name, assignments }, actorId);
    for (const r of g.rows) await api.updateImport(r.id, { member_id: saved.id, status: 'invited' });
    created.push(saved);
  }
  return created;
}
