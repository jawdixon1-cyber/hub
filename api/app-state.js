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
  const history = () => mine.map((r) => ({ id: r.id, name: r.name, contact: r.contacts?.[0]?.name || '', at: r.at })).reverse();

  if (req.method === 'GET') return res.json({ name: link.name || '', submissions: history() });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const b = req.body?.lead || {};
  const clip = (v, n = 300) => String(v ?? '').trim().slice(0, n);
  const lead = {
    id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    via: token, from: link.name || 'Referral', at: new Date().toISOString(),
    name: clip(b.name, 120),
    contacts: [{ name: clip(b.contactName, 80), phone: clip(b.phone, 40), pitch: true }],
    address: clip(b.address, 200),
    bestTime: clip(b.bestTime, 120),
    angle: clip(b.angle, 500),
    money: clip(b.money, 200),
  };
  if (!lead.name && !lead.contacts[0].name) return res.status(400).json({ error: 'Add a name' });
  if (mine.length >= 500) return res.status(429).json({ error: 'Too many submissions' });
  const { error } = await db.from('app_state').upsert({ key: REFER_INBOX, value: [...inbox, lead], org_id: linksRow.org_id, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) return res.status(500).json({ error: 'Could not save' });
  mine.push(lead);
  return res.json({ ok: true, submissions: history() });
}

// ── Lights crew view ──
// GET /api/app-state?key=lights-crew&token=… → only what the crew needs for that one job.
async function handleLightsCrew(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const token = String(req.query.token || '');
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return res.status(404).json({ error: 'Not found' });
  const db = getSupabaseAdmin();
  const { data: metaRow, error } = await db.from('app_state').select('key, value')
    .like('key', 'lq-meta:%').eq('value->>crewToken', token).maybeSingle();
  if (error) return res.status(500).json({ error: 'Lookup failed' });
  if (!metaRow) return res.status(404).json({ error: 'Not found' });
  const q = metaRow.value;
  const id = metaRow.key.slice('lq-meta:'.length);
  const [{ data: photoRow }, { data: suppliesRow }] = await Promise.all([
    db.from('app_state').select('value').eq('key', `lq-data:${id}`).maybeSingle(),
    db.from('app_state').select('value').eq('key', 'greenteam-lightsSupplies').maybeSingle(),
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
  const sides = (photoRow?.value?.angles || []).filter((a) => a.plain).map((a) => ({
    plain: a.plain, w: a.w, h: a.h,
    lines: a.lines || [], jumps: a.jumps || [], outlets: a.outlets || [], inlines: a.inlines || [],
  }));
  res.setHeader('Cache-Control', 'no-store');
  return res.json({
    client: q.client || '',
    address: [q.clientInfo?.address, q.clientInfo?.city, q.clientInfo?.state === 'South Carolina' ? 'SC' : q.clientInfo?.state].filter(Boolean).join(', '),
    installDate: q.installDate || '',
    takedownDate: q.takedownDate || '',
    power: q.power || '',
    powerPhoto: photoRow?.value?.powerPhoto || '',
    gutterGuard: q.disc?.gutterGuard || '',
    style: q.style || '',
    extras: q.extras || [],
    materials,
    sides,
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
