import { Buffer } from 'node:buffer';
// Server-side proxy for app_state + team auth + GHL — bypasses RLS using service role key
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';
import { promises as dns } from 'dns';
import ghlHandler from '../lib/ghlHandler.js';

// ── Email MX validation ──
async function validateEmail(email) {
  const trimmed = (email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return { valid: false, error: 'Invalid email format' };
  const domain = trimmed.split('@')[1];
  try {
    const records = await dns.resolveMx(domain);
    if (!records || records.length === 0) return { valid: false, error: `Email domain "${domain}" cannot receive email` };
    return { valid: true };
  } catch { return { valid: false, error: `Email domain "${domain}" does not exist` }; }
}

// ── Team auth handler ──
async function handleTeamAuth(req, res) {
  const db = getSupabaseAdmin();
  const { action } = req.body;

  switch (action) {
    case 'create': {
      const { email, password, displayName } = req.body;
      if (!email || !password || !displayName) return res.status(400).json({ error: 'email, password, and displayName are required' });
      const emailCheck = await validateEmail(email);
      if (!emailCheck.valid) return res.status(400).json({ error: emailCheck.error });
      const { data, error } = await db.auth.admin.createUser({ email: email.trim().toLowerCase(), password, email_confirm: true, user_metadata: { display_name: displayName.trim(), role: 'member' } });
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ success: true, user: { id: data.user.id, email: data.user.email, name: data.user.user_metadata?.display_name } });
    }
    case 'list': {
      const { data, error } = await db.auth.admin.listUsers();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ users: (data?.users || []).map((u) => ({ id: u.id, email: u.email, name: u.user_metadata?.display_name || null, role: u.user_metadata?.role || null, createdAt: u.created_at, lastSignIn: u.last_sign_in_at || null })) });
    }
    case 'resetPassword':
    case 'changePassword': {
      const { userId, newPassword } = req.body;
      if (!userId || !newPassword) return res.status(400).json({ error: 'userId and newPassword are required' });
      const { error } = await db.auth.admin.updateUserById(userId, { password: newPassword });
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ success: true });
    }
    case 'delete': {
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ error: 'userId is required' });
      const { error } = await db.auth.admin.deleteUser(userId);
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ success: true });
    }
    case 'updateApplicantOnboarding': {
      // Patch a single applicant's onboarding object. Lets the applicant themselves
      // save check-offs (Jobber activated, payroll done, emergency contact, etc.)
      // without needing RLS write access to the full app_state row.
      const { applicantId, patch } = req.body;
      if (!applicantId || !patch) return res.status(400).json({ error: 'applicantId and patch required' });
      const { data: row } = await db.from('app_state').select('value, org_id').eq('key', 'greenteam-applications').maybeSingle();
      const current = row?.value || [];
      const next = current.map((a) => a.id === applicantId ? { ...a, onboarding: { ...(a.onboarding || {}), ...patch } } : a);
      const payload = { key: 'greenteam-applications', value: next, updated_at: new Date().toISOString() };
      if (row?.org_id) payload.org_id = row.org_id;
      const { error } = await db.from('app_state').upsert(payload, { onConflict: 'key' });
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true });
    }
    case 'applicantSignAgreement': {
      // Applicant signs the team agreement — appends to greenteam-signedAgreements.
      const { record } = req.body;
      if (!record || !record.memberEmail) return res.status(400).json({ error: 'record with memberEmail required' });
      const { data: row } = await db.from('app_state').select('value, org_id').eq('key', 'greenteam-signedAgreements').maybeSingle();
      const current = Array.isArray(row?.value) ? row.value : [];
      const next = [...current, record];
      const payload = { key: 'greenteam-signedAgreements', value: next, updated_at: new Date().toISOString() };
      if (row?.org_id) payload.org_id = row.org_id;
      const { error } = await db.from('app_state').upsert(payload, { onConflict: 'key' });
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true });
    }
    case 'promoteApplicantToMember': {
      // Flip a user's role from 'applicant' to 'member' so they get Hub access instead of /onboard.
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: 'email required' });
      const { data: existing } = await db.auth.admin.listUsers();
      const found = (existing?.users || []).find((u) => u.email?.toLowerCase() === email.trim().toLowerCase());
      if (!found) return res.status(404).json({ error: 'User not found' });
      const { error } = await db.auth.admin.updateUserById(found.id, {
        user_metadata: { ...found.user_metadata, role: 'member' },
      });
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ success: true, userId: found.id });
    }
    case 'createApplicantLogin': {
      // Creates a Supabase auth user for a job applicant so they can self-onboard at /onboard.
      // Returns a generated temp password the owner can share via their own SMS.
      const { email, applicantName, applicantId } = req.body;
      if (!email || !applicantId) return res.status(400).json({ error: 'email and applicantId required' });
      const emailCheck = await validateEmail(email);
      if (!emailCheck.valid) return res.status(400).json({ error: emailCheck.error });
      // Fixed default password — everyone gets the same for easy onboarding
      const password = 'Password123!';
      // If the user already exists (re-drag), update password instead of creating
      let userId = null;
      try {
        const { data: existing } = await db.auth.admin.listUsers();
        const found = (existing?.users || []).find((u) => u.email?.toLowerCase() === email.trim().toLowerCase());
        if (found) {
          const { error: upErr } = await db.auth.admin.updateUserById(found.id, { password, user_metadata: { ...found.user_metadata, display_name: applicantName || found.user_metadata?.display_name || email, role: 'applicant', applicantId } });
          if (upErr) return res.status(400).json({ error: upErr.message });
          userId = found.id;
        }
      } catch {}
      if (!userId) {
        const { data, error } = await db.auth.admin.createUser({
          email: email.trim().toLowerCase(),
          password,
          email_confirm: true,
          user_metadata: { display_name: applicantName || email, role: 'applicant', applicantId },
        });
        if (error) return res.status(400).json({ error: error.message });
        userId = data.user.id;
      }
      return res.json({ success: true, userId, email: email.trim().toLowerCase(), password });
    }
    default: return res.status(400).json({ error: `Unknown action: ${action}` });
  }
}

// ── Main handler ──
// ── Lights referral form (e.g. Mom) ──
// GET  /api/app-state?key=lights-refer&token=…  → { name, submissions } (only what this link sent)
// POST /api/app-state?key=lights-refer&token=…  { lead } → saved to the referral inbox (Jude adds them to the pipeline)
const REFER_LINKS = 'greenteam-lightsReferLinks';
const REFER_INBOX = 'greenteam-lightsReferrals';
async function handleLightsRefer(req, res) {
  const token = String(req.query.token || '');
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return res.status(404).json({ error: 'Not found' });
  const db = getSupabaseAdmin();
  const { data: linksRow } = await db.from('app_state').select('value, org_id').eq('key', REFER_LINKS).maybeSingle();
  const link = (Array.isArray(linksRow?.value) ? linksRow.value : []).find((l) => l.token === token && !l.off);
  if (!link) return res.status(404).json({ error: 'Not found' });
  const { data: inboxRow } = await db.from('app_state').select('value').eq('key', REFER_INBOX).maybeSingle();
  const inbox = Array.isArray(inboxRow?.value) ? inboxRow.value : [];
  const mine = inbox.filter((r) => r.via === token);
  res.setHeader('Cache-Control', 'no-store');
  // Her referrals = Cold-leads pipeline leads tagged "Referred by <link name>" + any she sent that aren't
  // in the pipeline yet. Status comes from the pipeline: Won = sold ($50), Not interested = no, else pending.
  const { data: leadsRow } = await db.from('app_state').select('value').eq('key', 'greenteam-lightsColdLeads').maybeSingle();
  const leads = (Array.isArray(leadsRow?.value) ? leadsRow.value : []).filter((l) => l.referredBy && l.referredBy === link.name && l.name);
  const stage = (st) => (st === 'won' ? 'sold' : st === 'not_interested' ? 'no' : 'pending');
  const history = () => [
    ...mine.filter((r) => !leads.some((l) => l.id === r.id)).map((r) => ({ id: r.id, name: r.name, contact: r.contacts?.[0]?.name || '', at: r.at, stage: 'pending' })),
    ...leads.map((l) => ({ id: l.id, name: l.name, contact: '', at: l.log?.[0]?.at || l.createdAt || '', stage: stage(l.status) })),
  ].sort((x, y) => String(y.at || '').localeCompare(String(x.at || '')));

  // Leaderboard across everyone with a link: sold (Won) and pending, from the pipeline. First names only.
  const leaderboard = () => {
    const allLeads = Array.isArray(leadsRow?.value) ? leadsRow.value : [];
    const people = (Array.isArray(linksRow?.value) ? linksRow.value : []).filter((l) => !l.off && l.name);
    return people.map((p) => {
      const theirs = allLeads.filter((l) => l.referredBy === p.name && l.name);
      const waiting = inbox.filter((r) => r.via === p.token && !theirs.some((l) => l.id === r.id)).length;
      // others see first names only
      return { name: p.token === token ? p.name : p.name.split(' ')[0], me: p.token === token, sold: theirs.filter((l) => l.status === 'won').length, pending: theirs.filter((l) => l.status !== 'won' && l.status !== 'not_interested').length + waiting, sent: theirs.length + waiting };
    }).filter((p) => p.sent > 0) // nobody shows until they've sent one
      .sort((x, y) => (y.sold - x.sold) || (y.pending - x.pending) || x.name.localeCompare(y.name));
  };

  if (req.method === 'GET') return res.json({ name: link.name || '', submissions: history(), leaderboard: leaderboard() });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const b = req.body?.lead || {};
  const clip = (v, n = 300) => String(v ?? '').trim().slice(0, n);
  const lead = {
    id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    via: token, from: link.name || 'Referral', at: new Date().toISOString(),
    name: clip(b.name, 120),
    contacts: [{ name: clip(b.contactName, 80), phone: clip(b.phone, 40), pitch: true }, ...(clip(b.partnerName, 80) ? [{ name: clip(b.partnerName, 80), phone: '' }] : [])],
    address: clip(b.address, 200),
    bestTime: clip(b.bestTime, 120),
    angle: clip(b.angle, 500),
    money: clip(b.money, 200),
    note: clip(b.note, 600),
  };
  if (!lead.name && !lead.contacts[0].name) return res.status(400).json({ error: 'Add a name' });
  if (mine.length >= 500) return res.status(429).json({ error: 'Too many submissions' });
  const { error } = await db.from('app_state').upsert({ key: REFER_INBOX, value: [...inbox, lead], org_id: linksRow.org_id, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) return res.status(500).json({ error: 'Could not save' });
  mine.push(lead);
  return res.json({ ok: true, submissions: history(), leaderboard: leaderboard() });
}

// ── Lights crew view ──
// GET /api/app-state?key=lights-crew&token=… → only what the crew needs for that one job.
async function handleLightsCrew(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const token = String(req.query.token || '');
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return res.status(404).json({ error: 'Not found' });
  const db = getSupabaseAdmin();
  const { data: metaRow, error } = await db.from('app_state').select('key, value, org_id')
    .like('key', 'lq-meta:%').eq('value->>crewToken', token).maybeSingle();
  if (error) return res.status(500).json({ error: 'Lookup failed' });
  if (!metaRow) return res.status(404).json({ error: 'Not found' });
  const q = metaRow.value;
  const id = metaRow.key.slice('lq-meta:'.length);
  // POST: the crew saves what they actually measured on the roof → its own row (the quote is never touched).
  // Body: { actual: { "<side>-<line>": "28.5", "z<side>-<jump>": "12" }, by: "name" }
  if (req.method === 'POST') {
    // Body: { actual: { "<side>-<line>": "28.5", "z<side>-<jump>": "12" }, parts: { "<side>-<line>": [pieces] }, done: { "<side>-<line>": true } }
    // Merged into what's saved, so two crew phones don't wipe each other's numbers.
    const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
    const num = (v) => /^\d{0,4}(\.\d{0,2})?$/.test(String(v ?? ''));
    const actual = Object.fromEntries(Object.entries(obj(req.body?.actual))
      .filter(([k, v]) => /^(z|c|zc)?\d{1,2}-\d{1,3}$/.test(k) && num(v))
      .slice(0, 400).map(([k, v]) => [k, String(v)]));
    const parts = Object.fromEntries(Object.entries(obj(req.body?.parts))
      .filter(([k, v]) => /^c?\d{1,2}-\d{1,3}$/.test(k) && Array.isArray(v) && v.length <= 40)
      .slice(0, 400)
      .map(([k, v]) => [k, v.map((p) => (p?.m === 's' ? { m: 's', run: num(p.run) ? String(p.run ?? '') : '', deg: num(p.deg) ? String(p.deg ?? '') : '' } : { m: 't', ft: num(p?.ft) ? String(p?.ft ?? '') : '' }))]));
    const done = Object.fromEntries(Object.entries(obj(req.body?.done))
      .filter(([k]) => /^c?\d{1,2}-\d{1,3}$/.test(k)).slice(0, 400).map(([k, v]) => [k, !!v]));
    // groups: drawn lines the crew joined into one wire — replaced whole when sent.
    const groups = Array.isArray(req.body?.groups)
      ? req.body.groups.filter((g) => Array.isArray(g)).slice(0, 200)
        .map((g) => [...new Set(g.filter((k) => /^\d{1,2}-\d{1,3}$/.test(String(k))).map(String))].slice(0, 40)).filter((g) => g.length > 1)
      : null;
    const org = metaRow.org_id ? { org_id: metaRow.org_id } : {};
    // Crew photos taken on site: one row per photo. { pic: { pid, data } } adds one, { delPic: pid } removes one.
    if (req.body?.pic) {
      const { pid, data, thumb } = req.body.pic;
      const jpg = (x) => /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(String(x)) && x.length < 4_000_000;
      if (!/^[a-z0-9]{6,16}$/.test(String(pid)) || !jpg(data) || (thumb && !jpg(thumb))) return res.status(400).json({ error: 'Bad photo' });
      const { error: ep } = await db.from('app_state').upsert({ key: `lq-crewpic:${id}:${pid}`, value: { data, ...(thumb ? { thumb } : {}) }, ...org }, { onConflict: 'key' });
      if (ep) return res.status(500).json({ error: 'Save failed' });
      return res.json({ ok: true });
    }
    if (req.body?.delPic) {
      if (!/^[a-z0-9]{6,16}$/.test(String(req.body.delPic))) return res.status(400).json({ error: 'Bad photo' });
      await db.from('app_state').delete().eq('key', `lq-crewpic:${id}:${req.body.delPic}`);
      return res.json({ ok: true });
    }
    // The strands the crew drew on their photos — replaced whole.
    // { map: { photos: [{ pid, no, w, h, lines: [{ id, s, pts: [{x,y}], a: 'male'|'in', b: 'female'|'out' }] }], seq } }
    if (req.body?.map) {
      const m = req.body.map;
      const n = (v) => Math.round(Number(v) || 0);
      const photos = (Array.isArray(m.photos) ? m.photos : []).slice(0, 60)
        .filter((p) => /^[a-z0-9]{6,16}$/.test(String(p?.pid)))
        .map((p) => ({
          pid: String(p.pid), no: Math.min(99, Math.max(1, n(p.no))), w: n(p.w), h: n(p.h),
          lines: (Array.isArray(p.lines) ? p.lines : []).slice(0, 80).map((l) => {
            const pts = (Array.isArray(l?.pts) ? l.pts : []).slice(0, 60).map((q) => ({ x: n(q?.x), y: n(q?.y) }));
            const id = Math.min(999, Math.max(0, n(l?.id)));
            if (l?.k === 'zip') return { id, k: 'zip', s: 0, a: '', b: '', pts }; // zip cord, no lights
            return { id, s: Math.min(999, Math.max(1, n(l?.s))), pts, a: l?.a === 'in' ? 'in' : 'male', b: l?.b === 'out' ? 'out' : l?.b === 'female' ? 'female' : '' };
          }).filter((l) => l.pts.length >= 2),
        }));
      const value = { photos, seq: Math.min(999, n(m.seq)), savedAt: new Date().toISOString() };
      const { error: em } = await db.from('app_state').upsert({ key: `lq-crewmap:${id}`, value, ...org }, { onConflict: 'key' });
      if (em) return res.status(500).json({ error: 'Save failed' });
      return res.json({ ok: true });
    }
    const { data: prevRow } = await db.from('app_state').select('value').eq('key', `lq-actual:${id}`).maybeSingle();
    const prev = prevRow?.value || {};
    const value = {
      actual: Object.fromEntries(Object.entries({ ...(prev.actual || {}), ...actual }).filter(([, v]) => v !== '')),
      parts: { ...(prev.parts || {}), ...parts },
      done: { ...(prev.done || {}), ...done },
      groups: groups || prev.groups || [],
      by: String(req.body?.by || prev.by || '').slice(0, 40), savedAt: new Date().toISOString(),
    };
    const { error: e2 } = await db.from('app_state').upsert({ key: `lq-actual:${id}`, value, ...(metaRow.org_id ? { org_id: metaRow.org_id } : {}) }, { onConflict: 'key' });
    if (e2) return res.status(500).json({ error: 'Save failed' });
    return res.json({ ok: true, savedAt: value.savedAt });
  }
  // GET …&cpic=<pid> → one crew photo.
  if (req.query.cpic != null) {
    const pid = String(req.query.cpic);
    if (!/^[a-z0-9]{6,16}$/.test(pid)) return res.status(404).end();
    // &t=1 → the small thumbnail (falls back to the photo for older uploads).
    const want = req.query.t ? 'p:value->>thumb' : 'p:value->>data';
    let { data: ph } = await db.from('app_state').select(want).eq('key', `lq-crewpic:${id}:${pid}`).maybeSingle();
    if (req.query.t && !ph?.p) ({ data: ph } = await db.from('app_state').select('p:value->>data').eq('key', `lq-crewpic:${id}:${pid}`).maybeSingle());
    const m = /^data:(image\/[a-z+]+);base64,(.+)$/s.exec(ph?.p || '');
    if (!m) return res.status(404).end();
    res.setHeader('Content-Type', m[1]);
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    return res.status(200).send(Buffer.from(m[2], 'base64'));
  }
  // GET …&photo=<angle index | power>&v=… → one plan photo as an image (cached on the phone).
  if (req.query.photo != null) {
    const ix = String(req.query.photo);
    if (!/^(\d{1,2}|power)$/.test(ix)) return res.status(404).end();
    const path = ix === 'power' ? 'p:value->>powerPhoto' : `p:value->angles->${Number(ix)}->>plain`;
    const { data: ph } = await db.from('app_state').select(path).eq('key', `lq-data:${id}`).maybeSingle();
    const m = /^data:(image\/[a-z+]+);base64,(.+)$/s.exec(ph?.p || '');
    if (!m) return res.status(404).end();
    res.setHeader('Content-Type', m[1]);
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    return res.status(200).send(Buffer.from(m[2], 'base64'));
  }
  // The plan without photos, cached in its own small row and rebuilt only when the quote's photos row changes
  // (pulling every photo out of the database takes 5–8 s).
  const [{ data: stampRow }, { data: cacheRow }] = await Promise.all([
    db.from('app_state').select('updated_at').eq('key', `lq-data:${id}`).maybeSingle(),
    db.from('app_state').select('value').eq('key', `lq-crewplan:${id}`).maybeSingle(),
  ]);
  const stamp = String(stampRow?.updated_at || '');
  let plan = cacheRow?.value && cacheRow.value.stamp === stamp && stamp ? cacheRow.value : null;
  if (!plan) {
    const { data: photoRow } = await db.from('app_state').select('value').eq('key', `lq-data:${id}`).maybeSingle();
    const v = photoRow?.value || {};
    plan = {
      stamp,
      hasPower: !!v.powerPhoto,
      sides: (v.angles || []).map((a, ai) => ({ a, ai })).filter(({ a }) => a.plain).map(({ a, ai }) => ({
        ai, w: a.w, h: a.h, lines: a.lines || [], jumps: a.jumps || [], outlets: a.outlets || [], inlines: a.inlines || [],
      })),
    };
    if (stamp) await db.from('app_state').upsert({ key: `lq-crewplan:${id}`, value: plan, ...(metaRow.org_id ? { org_id: metaRow.org_id } : {}) }, { onConflict: 'key' });
  }
  const photoUrl = (ix) => `/api/app-state?key=lights-crew&token=${encodeURIComponent(token)}&photo=${ix}&v=${encodeURIComponent(stamp)}`;
  const [{ data: suppliesRow }, { data: actualRow }, { data: mapRow }] = await Promise.all([
    db.from('app_state').select('value').eq('key', 'greenteam-lightsSupplies').maybeSingle(),
    db.from('app_state').select('value').eq('key', `lq-actual:${id}`).maybeSingle(),
    db.from('app_state').select('value').eq('key', `lq-crewmap:${id}`).maybeSingle(),
  ]);
  const supplies = Array.isArray(suppliesRow?.value) ? suppliesRow.value : [];
  // Same as the quote screen: a timer + 10 male / 10 female plugs (black) unless the quote already has that kind.
  const mats = { ...(q.materials || {}) };
  const nameOf = (id) => supplies.find((s) => s.id === id)?.name || '';
  [[/timer/i, 1], [/\bmale\b/i, 10, /female/i], [/female/i, 10]].forEach(([re, qty, not]) => {
    const match = (n) => re.test(n) && !(not && not.test(n));
    if (Object.keys(mats).some((id) => match(nameOf(id)))) return;
    const it = supplies.find((s) => match(s.name) && /black/i.test(s.name)) || supplies.find((s) => match(s.name));
    if (it) mats[it.id] = qty;
  });
  const materials = Object.entries(mats)
    .filter(([, qty]) => Number(qty) > 0)
    .map(([itemId, qty]) => {
      const it = supplies.find((s) => s.id === itemId);
      return { id: itemId, name: it?.name || itemId, unit: it?.unit || 'ea', qty: Number(qty), image: it?.image || '', note: q.matNotes?.[itemId] || '' };
    });
  const sides = plan.sides.map(({ ai, ...sd }) => ({ plain: photoUrl(ai), ...sd }));
  res.setHeader('Cache-Control', 'no-store');
  return res.json({
    client: q.client || '',
    address: [q.clientInfo?.address, q.clientInfo?.city, q.clientInfo?.state === 'South Carolina' ? 'SC' : q.clientInfo?.state].filter(Boolean).join(', '),
    installDate: q.installDate || '',
    takedownDate: q.takedownDate || '',
    power: q.power || '',
    powerPhoto: plan.hasPower ? photoUrl('power') : '',
    gutterGuard: q.disc?.gutterGuard || '',
    style: q.style || '',
    customColor: q.customColor || '',
    extras: q.extras || [],
    materials,
    sides,
    actual: actualRow?.value?.actual || {},
    parts: actualRow?.value?.parts || {},
    done: actualRow?.value?.done || {},
    groups: actualRow?.value?.groups || [],
    wire: q.wire || '',
    crewMap: mapRow?.value || { photos: [], seq: 0 },
    actualSavedAt: actualRow?.value?.savedAt || '',
  });
}

export default async function handler(req, res) {
  try {
    // Team auth: POST to /api/app-state?key=team-auth OR POST to /api/team-auth
    if (req.method === 'POST' && (req.query.key === 'team-auth' || req.url?.includes('team-auth'))) {
      return handleTeamAuth(req, res);
    }

    // GHL proxy: any method to /api/app-state?key=ghl&action=...
    if (req.query.key === 'ghl') {
      return ghlHandler(req, res);
    }

    // Crew view (no login): one lights job's plan + materials, by its secret crew token. No prices.
    if (req.query.key === 'lights-crew') {
      return handleLightsCrew(req, res);
    }
    if (req.query.key === 'lights-refer') {
      return handleLightsRefer(req, res);
    }
    // /refer/<token> → the app's page, with its own link preview (texts show this instead of "Management App").
    if (req.query.key === 'refer-page') {
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const origin = `https://${host}`;
      let html = '';
      try { html = await (await fetch(`${origin}/index.html`)).text(); } catch { html = ''; }
      if (!html) return res.redirect(302, `/index.html`);
      const title = 'Hook a friend up 🎁';
      const desc = 'Give a friend $50 off their Christmas lights — get $50 when Jude sells.';
      const img = `${origin}/refer-og.jpg?v=3`; // bump v when the image changes (texts cache it)
      const meta = `<meta property="og:title" content="${title}"><meta property="og:description" content="${desc}"><meta property="og:image" content="${img}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:type" content="website"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${img}"><meta name="description" content="${desc}">`;
      html = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>${meta}`);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
      return res.status(200).send(html);
    }

    const db = getSupabaseAdmin();
    const { key } = req.query;

    if (!key) return res.status(400).json({ error: 'key param required' });

    if (req.method === 'GET') {
      const { data, error } = await db.from('app_state').select('value').eq('key', key).maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ value: data?.value ?? null });
    }

    if (req.method === 'PUT') {
      const { value } = req.body;
      const { error } = await db.from('app_state').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true });
    }

    // Also handle POST for team-auth via body action
    if (req.method === 'POST' && req.body?.action) {
      return handleTeamAuth(req, res);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
