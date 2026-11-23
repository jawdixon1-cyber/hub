import { addonTotals, pricedAddons } from '../src/lib/lightsAddonMath.js';
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

// ── Lights client presentation (no login) ──
// GET /api/app-state?key=lights-present&token=… → ONLY what the Present page shows for that one quote
// (no phone/email/address, no crew link, no other quotes). Pictures come one at a time with &img=…
// POST { years, addonIds } → records what they picked in lq-yes:<id> (the quote itself is never touched).
async function handleLightsPresent(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const token = String(req.query.token || '');
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return res.status(404).json({ error: 'Not found' });
  const db = getSupabaseAdmin();
  const { data: metaRow, error } = await db.from('app_state').select('key, value, org_id')
    .like('key', 'lq-meta:%').eq('value->>presentToken', token).maybeSingle();
  if (error) return res.status(500).json({ error: 'Lookup failed' });
  if (!metaRow) return res.status(404).json({ error: 'Not found' });
  const q = metaRow.value;
  const id = metaRow.key.slice('lq-meta:'.length);
  const org = metaRow.org_id ? { org_id: metaRow.org_id } : {};

  if (req.method === 'POST') {
    const years = [1, 2, 3].includes(Number(req.body?.years)) ? Number(req.body.years) : 1;
    const addonIds = (Array.isArray(req.body?.addonIds) ? req.body.addonIds : []).map(String).filter((x) => /^[A-Za-z0-9_-]{1,60}$/.test(x)).slice(0, 20);
    const { error: e } = await db.from('app_state').upsert({ key: `lq-yes:${id}`, value: { years, addonIds, at: new Date().toISOString() }, ...org }, { onConflict: 'key' });
    if (e) return res.status(500).json({ error: 'Could not save' });
    return res.json({ ok: true });
  }

  const { data: baRow } = await db.from('app_state').select('value').eq('key', `lq-ba:${id}`).maybeSingle();
  const ba = baRow?.value || {};
  const sendImg = (dataUrl) => {
    const m = /^data:(image\/[a-z+]+);base64,(.+)$/s.exec(String(dataUrl || ''));
    if (!m) return res.status(404).end();
    res.setHeader('Content-Type', m[1]);
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    return res.status(200).send(Buffer.from(m[2], 'base64'));
  };
  // One picture: side:<n> (house photo) · prev:<n> (mockup) · night · k:<name> (before/after or add-on photo of THIS quote)
  if (req.query.img != null) {
    const im = String(req.query.img);
    let path = null;
    if (/^side:\d{1,2}$/.test(im)) path = `p:value->angles->${Number(im.slice(5))}->>plain`;
    else if (/^prev:\d{1,2}$/.test(im)) path = `p:value->previews->${Number(im.slice(5))}->>image`;
    else if (im === 'night') path = 'p:value->>nightPhoto';
    if (path) {
      const { data: ph } = await db.from('app_state').select(path).eq('key', `lq-data:${id}`).maybeSingle();
      return sendImg(ph?.p);
    }
    if (/^k:[A-Za-z0-9_-]{1,80}$/.test(im)) {
      const { data: ph } = await db.from('app_state').select('value').eq('key', `lq-img:${id}:${im.slice(2)}`).maybeSingle();
      return sendImg(ph?.value?.src);
    }
    return res.status(404).end();
  }

  // The plan without photos, cached by the photos row's timestamp. Read one side at a time —
  // a big quote's whole photos row is too slow to pull at once.
  const [{ data: stampRow }, { data: cacheRow }] = await Promise.all([
    db.from('app_state').select('updated_at').eq('key', `lq-data:${id}`).maybeSingle(),
    db.from('app_state').select('value').eq('key', `lq-presentplan:${id}`).maybeSingle(),
  ]);
  const stamp = String(stampRow?.updated_at || '');
  let plan = cacheRow?.value && cacheRow.value.stamp === stamp && stamp ? cacheRow.value : null;
  if (!plan) {
    // One side at a time (in parallel the database times out on big quotes); stop at the first empty slot.
    const pick = async (sel) => {
      const { data, error: e } = await db.from('app_state').select(sel).eq('key', `lq-data:${id}`).maybeSingle();
      if (e) throw e;
      return data;
    };
    const sides = [];
    for (let i = 0; i < 30; i++) {
      const a = await pick(`w:value->angles->${i}->w, h:value->angles->${i}->h, lines:value->angles->${i}->lines, jumps:value->angles->${i}->jumps, outlets:value->angles->${i}->outlets, inlines:value->angles->${i}->inlines, show:value->angles->${i}->show`);
      if (!a || a.w == null) break;
      sides.push({ ai: i, w: a.w, h: a.h, lines: a.lines || [], jumps: a.jumps || [], outlets: a.outlets || [], inlines: a.inlines || [], show: !!a.show });
    }
    let previews = 0;
    while (previews < 20 && (await pick(`x:value->previews->${previews}->id`))?.x != null) previews++;
    const counts = { night: (await pick('n:value->nightPhoto'))?.n };
    plan = { stamp, sides, previews, night: !!counts.night };
    if (stamp) await db.from('app_state').upsert({ key: `lq-presentplan:${id}`, value: plan, ...org }, { onConflict: 'key' });
  }
  const url = (im) => `/api/app-state?key=lights-present&token=${encodeURIComponent(token)}&img=${encodeURIComponent(im)}&v=${encodeURIComponent(stamp)}`;
  const kUrl = (k) => (typeof k === 'string' && k.startsWith(`lq-img:${id}:`) ? url(`k:${k.slice(`lq-img:${id}:`.length)}`) : '');
  const { data: suppliesRow } = await db.from('app_state').select('value').eq('key', 'greenteam-lightsSupplies').maybeSingle();
  // Roofline materials + what the add-ons that start added use (bush/tree mini strands…)
  const mats = { ...(q.materials && typeof q.materials === 'object' ? q.materials : {}) };
  Object.entries(addonTotals(ba.addons)).forEach(([k, n]) => { mats[k] = (Number(mats[k]) || 0) + n; });
  const supplies = (Array.isArray(suppliesRow?.value) ? suppliesRow.value : []).filter((x) => mats[x.id])
    .map((x) => ({ id: x.id, name: x.name, image: x.image ? `/api/app-state?key=lights-item-img&id=${encodeURIComponent(x.id)}` : '' }));
  return res.json({
    q: {
      client: q.client || '', quoted: q.quoted || '', total: q.total || 0, installDate: q.installDate || '', takedownDate: q.takedownDate || '',
      materials: mats,
      angles: plan.sides.map((s) => ({ ...s, plain: url(`side:${s.ai}`) })),
      previews: Array.from({ length: plan.previews }, (_, i) => ({ image: url(`prev:${i}`) })),
      nightPhoto: plan.night ? url('night') : '',
    },
    ba: {
      heroY: ba.heroY, adjust: ba.adjust, perks: ba.perks || [], offers: ba.offers || [],
      pairs: (ba.pairs || []).map((x) => ({ label: x.label || '', before: kUrl(x.before), after: kUrl(x.after) })).filter((x) => x.before && x.after),
      addons: pricedAddons(ba.addons, ba.perStrand).map((x) => ({ id: x.id, label: x.label, sub: x.sub, price: x.price, strands: x.strands, on: x.on, photo: kUrl(x.photo) })),
    },
    supplies,
  });
}

// ── Lights price-range estimate (client link /estimate/:token, no login) ──
// le-meta:<id> = { token, client, address, low, high, lines, … } · le-img:<id>:<photo|warm|multi> = { src }
// GET → only what the page shows (first name, range, picture links; no phone/notes) · &img=photo|warm|multi → that picture
// POST { color } → records "yes, get my exact quote" in le-yes:<id> (the estimate itself is never touched).
async function handleLightsEstimate(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const token = String(req.query.token || '');
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return res.status(404).json({ error: 'Not found' });
  const db = getSupabaseAdmin();
  const { data: row, error } = await db.from('app_state').select('key, value, org_id, updated_at')
    .like('key', 'le-meta:%').eq('value->>token', token).maybeSingle();
  if (error) return res.status(500).json({ error: 'Lookup failed' });
  if (!row || row.value?.off) return res.status(404).json({ error: 'Not found' });
  const e = row.value;
  const id = row.key.slice('le-meta:'.length);
  if (req.method === 'POST' && req.body?.view) {
    const ua = String(req.headers['user-agent'] || '');
    if (/bot|crawl|spider|preview|facebookexternalhit|whatsapp|slack|telegram|curl/i.test(ua)) return res.json({ ok: true });
    const device = /iphone/i.test(ua) ? 'iPhone' : /ipad/i.test(ua) ? 'iPad' : /android/i.test(ua) ? 'Android' : /mac os/i.test(ua) ? 'Mac' : /windows/i.test(ua) ? 'Windows' : 'Other';
    const { data: vr } = await db.from('app_state').select('value').eq('key', `le-views:${id}`).maybeSingle();
    const now = new Date().toISOString();
    const prev = vr?.value || {};
    const value = { count: (prev.count || 0) + 1, first: prev.first || now, last: now, list: [...(prev.list || []), { at: now, device }].slice(-50) };
    await db.from('app_state').upsert({ key: `le-views:${id}`, value, ...(row.org_id ? { org_id: row.org_id } : {}) }, { onConflict: 'key' });
    return res.json({ ok: true });
  }
  if (req.method === 'POST') {
    const color = ['warm', 'multi'].includes(req.body?.color) ? req.body.color : '';
    const declined = req.body?.decline === true;
    // le-yes holds their answer: { yes: true } = wants the consultation, { declined: true } = not interested
    const { error: w } = await db.from('app_state').upsert({ key: `le-yes:${id}`, value: declined ? { declined: true, at: new Date().toISOString() } : { color, at: new Date().toISOString() }, ...(row.org_id ? { org_id: row.org_id } : {}) }, { onConflict: 'key' });
    if (w) return res.status(500).json({ error: 'Could not save' });
    return res.json({ ok: true });
  }
  if (req.query.img != null) {
    const im = String(req.query.img);
    if (!['photo', 'warm', 'multi'].includes(im)) return res.status(404).end();
    const { data: ph } = await db.from('app_state').select('value').eq('key', `le-img:${id}:${im}`).maybeSingle();
    const m = /^data:(image\/[a-z+]+);base64,(.+)$/s.exec(String(ph?.value?.src || ''));
    if (!m) return res.status(404).end();
    res.setHeader('Content-Type', m[1]);
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    return res.status(200).send(Buffer.from(m[2], 'base64'));
  }
  const v = encodeURIComponent(String(e.imgStamp || row.updated_at || ''));
  const url = (im) => `/api/app-state?key=lights-estimate&token=${encodeURIComponent(token)}&img=${im}&v=${v}`;
  const { data: yes } = await db.from('app_state').select('value').eq('key', `le-yes:${id}`).maybeSingle();
  return res.json({
    first: String(e.client || '').trim().split(/\s+/)[0] || '',
    street: String(e.address || '').split(',')[0].trim(),
    low: Number(e.low) || 0, high: Number(e.high) || 0,
    photo: e.has?.photo ? url('photo') : '', warm: e.has?.warm ? url('warm') : '', multi: e.has?.multi ? url('multi') : '',
    said: yes?.value?.at && !yes.value.declined ? { color: yes.value.color || '' } : null,
    declined: !!yes?.value?.declined,
  });
}

// ── /estimate/<token> → the live heyjudeslawncare.com/lights/ page, with its bottom "get a quote"
// section swapped for THIS client's house + rough price range. (Always matches the current landing page.)
const SITE = 'https://heyjudeslawncare.com';
let lightsPageCache = { at: 0, html: '' };
const escHtml = (t) => String(t || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Estimate page order (built for people who already asked for a price): trust first, their price last.
// Cuts the "ER visits / ladder" section (that one talks DIYers out of doing it themselves).
// Leaves the page as-is if the site's section markers ever change.
function reorderEstimateSections(html) {
  const marks = ['<!-- 3. THE HOOK', '<!-- 1b. THE FEAR', '<!-- 2. CONTRAST', '<!-- 2b. PROOF', '<!-- 7. PROOF', '<!-- 7b. MEET JUDE', '<!-- 8. LOCK YOUR PRICE', '<!-- 9. FAQ', '<section class="final" id="quote">'];
  const at = marks.map((m) => html.indexOf(m));
  if (at.some((i) => i < 0) || at.some((i, k) => k && i <= at[k - 1])) return html;
  const part = (k) => html.slice(at[k], at[k + 1]);
  const [hook, , contrast, close, proofMore, meet, plans, faq] = marks.slice(0, -1).map((_, k) => part(k));
  const split = proofMore.indexOf('<section style="padding:10px 0 0">');
  const proof = split > 0 ? proofMore.slice(0, split) : proofMore;
  const more = split > 0 ? proofMore.slice(split) : '';
  const jobs = `<!-- REAL JOBS (Hub) -->
  <section style="padding-top:10px">
    <div class="wrap">
      <div class="sec-head rv"><h2>A few jobs we&#8217;ve done this season.</h2><p>Real photos. No AI.</p></div>
      <div class="hje-jobs">
        <figure><img src="${SITE}/wp-content/uploads/2026/11/hero-real-install.jpg" alt="A home we lit in cool white and blue" loading="lazy"><span>📷 Real install</span></figure>
        <figure><img src="/lights-jobs/job-3.jpg" alt="A home we lit in warm white this season, with our yard sign" loading="lazy"><span>📷 Real install</span></figure>
        <figure><img src="/lights-jobs/job-1.jpg" alt="A home we lit in cool white this season" loading="lazy"><span>📷 Real install</span></figure>
      </div>
    </div>
  </section>
  <style>
    .hje-jobs{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
    .hje-jobs figure{position:relative;margin:0;border-radius:18px;overflow:hidden;border:1px solid rgba(255,255,255,.1);aspect-ratio:4/3;background:#000}
    .hje-jobs img,.hje-jobs video{width:100%;height:100%;object-fit:cover;object-position:center;display:block}
    .hje-jobs span{position:absolute;left:10px;top:10px;background:#f6f3ee;color:#07090f;font:700 12px Poppins,system-ui,sans-serif;padding:5px 9px;border-radius:999px}
    @media (max-width:700px){.hje-jobs{grid-template-columns:1fr}}
  </style>
`;
  return html.slice(0, at[0]) + [proof, jobs, contrast, hook, close, meet, more, plans, faq].join('\n') + html.slice(at[at.length - 1]);
}
async function handleEstimatePage(req, res) {
  const token = String(req.query.token || '');
  const db = getSupabaseAdmin();
  const row = /^[A-Za-z0-9_-]{20,}$/.test(token)
    ? (await db.from('app_state').select('key, value, updated_at').like('key', 'le-meta:%').eq('value->>token', token).maybeSingle()).data : null;
  if (!row || row.value?.off) return res.status(404).send('<!doctype html><meta name="viewport" content="width=device-width"><p style="font-family:sans-serif;padding:40px;text-align:center">This link is no longer active.</p>');
  const e = row.value;
  if (!lightsPageCache.html || Date.now() - lightsPageCache.at > 10 * 60e3) {
    const r = await fetch(`${SITE}/lights/`).catch(() => null);
    const page = r?.ok ? await r.text() : '';
    if (page.includes('id="quote"')) lightsPageCache = { at: Date.now(), html: page };
  }
  let html = lightsPageCache.html;
  if (!html) return res.status(502).send('Could not load the page. Try again in a minute.');

  const tok = encodeURIComponent(token);
  const v = encodeURIComponent(String(e.imgStamp || row.updated_at || ''));
  const img = (k) => (e.has?.[k] ? `/api/app-state?key=lights-estimate&amp;token=${tok}&amp;img=${k}&amp;v=${v}` : '');
  const traced = (Array.isArray(e.lines) ? e.lines : []).filter((l) => Array.isArray(l.points) && l.points.length > 1);
  const linesSvg = traced.length ? `<svg class="hje-lines" viewBox="0 0 1000 1000" preserveAspectRatio="none">${traced.map((l) => `<polyline points="${l.points.map((q) => `${Number(q.x) || 0},${Number(q.y) || 0}`).join(' ')}" />`).join('')}</svg>` : '';
  const mock = img('warm') ? 'warm' : img('multi') ? 'multi' : '';
  const looks = mock ? [[mock, 'Mockup of your house']] : [['photo', 'Your roofline']].filter(([k]) => img(k)); // mockup when there is one, else their photo with the lines
  const heroImg = img('warm') || img('multi') || img('photo'); // mockup across the top when there is one
  const first = escHtml(String(e.client || '').trim().split(/\s+/)[0]);
  const street = escHtml(String(e.address || '').split(',')[0].trim());
  const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
  const pics = looks.length ? `<div class="hje-pic">${looks.map(([k, label], i) => `<figure data-look="${k}"${i ? ' hidden' : ''}><img src="${img(k)}" alt="${label}">${k === 'photo' ? linesSvg : ''}${k === 'photo' ? '' : '<span class="hje-badge">✨ Mockup preview</span>'}</figure>`).join('')}</div>
        ${looks.length > 1 ? `<div class="hje-tabs">${looks.map(([k, label], i) => `<button type="button" data-look="${k}"${i ? '' : ' class="on"'}>${label}</button>`).join('')}</div>` : ''}
        <p class="hje-small">${mock ? 'Mockup of your house. Your exact design is planned to the foot at your consultation.' : 'Here&#8217;s your house and what this estimate is based on: the lit rooflines are traced in gold.'}</p>` : '';
  // Bottom bar: no price up top (it's the payoff at the end) — just point them to it.
  const sticky = `<div class="hje-sticky" hidden><div><b>Your rough estimate is ready</b><span>Based on a photo of your house · scroll down to see it</span></div><button type="button" class="btn btn-go hje-yes2">See it ↓</button></div>`;
  const smsTo = '+18039027447'; // Biz # in Quo
  const smsYes = `Hi Jude, it's ${String(e.client || '').trim().split(/\s+/)[0] || 'me'}${e.address ? ` at ${String(e.address).split(',')[0].trim()}` : ''}. I'd like to schedule my free design consultation 🎄`;
  const smsNo = `Hi Jude, it's ${String(e.client || '').trim().split(/\s+/)[0] || 'me'}. I saw my rough estimate, thanks! I'm not interested right now, so no need to follow up.`;
  const smsRevise = `Hi Jude, it's ${String(e.client || '').trim().split(/\s+/)[0] || 'me'}. I'd like to revise my estimate: `;
  const sms = (body) => `sms:${smsTo}?&body=${encodeURIComponent(body)}`;
  const section = `<section class="final" id="quote">
    <div class="wrap">
      <div class="sec-head rv">
        <h2>${first ? `${first}, here&#8217;s your mockup and rough estimate.` : 'Here&#8217;s your mockup and rough estimate.'}</h2>
        ${street ? `<p>📍 ${street}</p>` : ''}
      </div>
      <div class="box rv"><div class="box-in hje">
        <div class="hje-range">
          <div class="hje-card hje-main">
            ${pics}
            <p class="hje-eyebrow" style="margin-top:18px!important">Your rough estimate</p>
            <p class="hje-price">${money(e.low)} – ${money(e.high)}</p>
            <p class="hje-rough">From a photo · not a quote</p>
            <p class="hje-card-h hje-sub">Everything included</p>
            <ul class="hje-incl">${['Commercial-grade lights', 'Full plan before you buy', 'Install', 'Maintenance', 'Storage', 'Jan. takedown guarantee', 'Hidden, color-matched wire', 'Fully insured ($1M)'].map((t) => `<li>${t}</li>`).join('')}</ul>
            <p class="hje-trust">★★★★★ <b>5.0</b> · 195 Google reviews</p>
            <p class="hje-after">Ready for the next step? At your free design consultation we bring light samples, measure your roof, show you a detailed plan and mockup, talk through anything else you&#8217;d like lit (if you want it) and go over your exact price.</p>
            <div class="hje-choice">
              <a class="btn btn-go hje-yes" href="${sms(smsYes)}">✅ Accept</a>
              <div class="hje-choice2">
                <a class="hje-no" href="${sms(smsRevise)}"><span>Revise scope</span><small>Add or remove areas to change the price</small></a>
                <a class="hje-no" href="${sms(smsNo)}"><span>Decline</span><small>Opt out · no follow-up messages</small></a>
              </div>
            </div>
            <p class="hje-small" style="margin-top:10px">Each button opens a text to Jude, already written. Just hit send.</p>
          </div>
          
        </div>
      </div></div>
    </div>
  </section>
  <style>
    #quote .box,#quote .box-in{background:transparent!important;box-shadow:none!important;border:0!important;padding:0!important}
    .hje{display:flex;flex-direction:column;gap:14px;text-align:center;color:#f6f3ee}
    .hje-pic img{box-shadow:0 10px 40px rgba(0,0,0,.5)}
    .hje-pic img{width:100%;display:block;border-radius:14px}
    .hje-pic figure{position:relative;margin:0}
    #quote .hje-rough{display:inline-block;background:rgba(255,207,107,.12);border:1px solid rgba(255,207,107,.45);color:#ffcf6b;font-weight:700;font-size:13px;border-radius:999px;padding:5px 12px;margin:0 auto 14px!important}
    #quote .hje-incl li::before{content:'✓'!important;display:block!important;position:absolute;left:0;top:0;color:#00DF00;font-weight:900;background:none!important;width:auto!important;height:auto!important}
    #quote .hje-incl li::after{display:none!important}
    .hje-card{background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.02));border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:22px 18px;margin:0 auto 14px;max-width:560px;text-align:center}
    .hje-card.hje-main{padding:12px 12px 22px;max-width:760px}
    .hje-main .hje-pic img{border-radius:14px}
    .hje-main .hje-small{margin:10px 6px 0!important}
    .hje-card-next{border:2px solid rgba(0,223,0,.45);background:linear-gradient(180deg,rgba(0,223,0,.08),rgba(0,223,0,.02))}
    #quote .hje-card-h{font-weight:900;font-size:22px;line-height:1.2;margin:0 0 16px!important;text-align:center!important;color:#f6f3ee}
    #quote .hje-card .hje-price{margin:6px 0 10px}
    #quote .hje-card .hje-rough{margin:0!important}
    #quote .hje-card-h.hje-sub{font-size:18px;margin:22px 0 12px!important;padding-top:20px;border-top:1px solid rgba(255,255,255,.1)}
    #quote .hje-incl{list-style:none;padding:0;margin:0 auto 14px!important;display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;text-align:left}
    #quote .hje-incl li{position:relative;padding-left:24px;font-size:15px;font-weight:600;color:#f6f3ee;line-height:1.3}
    @media (max-width:520px){#quote .hje-incl{grid-template-columns:1fr;max-width:290px}.hje-steps{grid-template-columns:1fr!important}}
    #quote .hje-trust{font-size:13px;opacity:.8;margin:0!important;text-align:center!important;color:#f6f3ee}
    #quote .hje-card .hje-yes{margin-top:20px!important}
    #quote .hje-after{font-size:13px!important;opacity:.75;margin:12px auto 0!important;max-width:420px!important;text-align:center!important;line-height:1.5;color:#f6f3ee}
    .hje-steps{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .hje-steps div{display:flex;align-items:center;gap:10px;background:rgba(0,0,0,.25);border-radius:12px;padding:12px;text-align:left;font-size:15px;font-weight:600;line-height:1.3;color:#f6f3ee}
    .hje-steps b{font-size:18px}
    .hje-lines{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
    .hje-lines polyline{fill:none;stroke:#ffcf6b;stroke-width:4;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke;filter:drop-shadow(0 0 4px rgba(255,207,107,.8))}
    .hje-pic figure[hidden]{display:none}
    .hje-badge{position:absolute;left:12px;top:12px;background:rgba(7,9,15,.82);color:#f6f3ee;font:700 12px Poppins,system-ui,sans-serif;padding:6px 10px;border-radius:999px}
    .hje-badge.real{background:#f6f3ee;color:#07090f}
    .hje-tabs{display:flex;gap:8px}
    .hje-tabs button{flex:1;border-radius:999px;padding:10px;font:700 14px Poppins,system-ui,sans-serif;cursor:pointer;background:transparent;color:inherit;border:1px solid rgba(127,127,127,.4)}
    .hje-tabs button{color:#f6f3ee!important}
    .hje-tabs button.on{background:#B3121F;color:#fff;border-color:#B3121F}
    .hje-small{font-size:12px;opacity:.7;margin:0}
    .hje-range{padding:6px 0 4px}
    .hje-eyebrow{font-size:12px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:#ffcf6b;margin:0}
    .hje-price{font-size:clamp(34px,8vw,52px);font-weight:900;margin:6px 0}
    #quote .hje-note{font-size:13px!important;opacity:.7;max-width:480px!important;margin:0 auto 24px!important;text-align:center!important;line-height:1.5}
    #quote .box::before,#quote .box::after,#quote .box-in::before,#quote .box-in::after{display:none!important}
    .hje-yes{width:100%;border:0;cursor:pointer;font-size:18px}
    .hje-yes[hidden],.hje-done[hidden],.hje-no[hidden]{display:none}
    .hje-choice{display:flex;flex-direction:column;gap:10px;margin-top:18px}
    .hje-choice2{display:flex;gap:10px}
    #quote .hje-choice .hje-yes{margin:0!important;padding:16px!important;display:flex;align-items:center;justify-content:center;text-decoration:none}
    #quote .hje-no small{display:block;font-size:11px;font-weight:600;opacity:.7;margin-top:2px}
    #quote .hje-no{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;line-height:1.2;text-decoration:none;background:transparent;border:1px solid rgba(255,255,255,.3);border-radius:14px;color:#f6f3ee;font:700 16px Poppins,system-ui,sans-serif;cursor:pointer;padding:14px}
    #quote .hje-sms{color:#ffcf6b;font-weight:700}
    .hje-choice[hidden]{display:none}
    .hje-big{font-size:20px;font-weight:800;margin:0 0 4px}
    .hje-done{background:rgba(0,180,0,.12);border-radius:12px;padding:14px}
    .hje-plan{font-weight:800;font-size:18px;margin:4px 0 2px}
    .hje-sticky{position:fixed;left:0;right:0;bottom:0;z-index:9999;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px calc(10px + env(safe-area-inset-bottom));background:rgba(7,9,15,.94);color:#f6f3ee;border-top:1px solid rgba(255,255,255,.12);font-family:Poppins,system-ui,sans-serif}
    .hje-sticky[hidden]{display:none}
    .hje-sticky div{display:flex;flex-direction:column;line-height:1.15}
    .hje-sticky b{font-size:17px}
    .hje-sticky span{font-size:11px;opacity:.7}
    .hje-sticky button{border:0;cursor:pointer;white-space:nowrap;padding:12px 16px}
    .sec-head p.two,.sec-head .two{white-space:normal!important;text-wrap:balance}
    .hje-tier{font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;opacity:.6;margin:0 0 6px}
    .hero .ctas .btn{white-space:normal!important;text-align:center;justify-content:center}
    @media (max-width:600px){.hero .ctas{flex-direction:column!important;gap:10px!important}.hero .ctas .btn{width:100%!important;flex:none!important}}
    @media (max-width:520px){.hero .lead{font-size:16px!important}.hero h1.hje-h1{font-size:34px!important;line-height:1.08!important}}
    .hje-sticky b{white-space:nowrap}
    @media (max-width:520px){.hje-sticky b{font-size:14px;white-space:normal}.hje-sticky span{font-size:11px}.hje-sticky button{font-size:14px!important;padding:12px 14px!important}}
    #quote{scroll-margin-top:70px;background:none!important}
    .hje-herobadge{position:absolute;right:16px;top:78px;z-index:3;background:#f6f3ee;color:#07090f;font:700 12px Poppins,system-ui,sans-serif;padding:6px 10px;border-radius:999px}
    .tri{align-items:stretch!important}
    .tri>.col{height:auto!important;align-self:stretch!important}
  </style>
  ${sticky}
  <script>
  (function(){
    var root=document.getElementById('quote'); if(!root) return;
    var api='/api/app-state?key=lights-estimate&token=${tok}';
    root.querySelectorAll('.hje-tabs button').forEach(function(b){b.addEventListener('click',function(){
      root.querySelectorAll('.hje-tabs button').forEach(function(x){x.classList.toggle('on',x===b)});
      root.querySelectorAll('.hje-pic figure').forEach(function(im){im.hidden=im.dataset.look!==b.dataset.look});
    })});
    var bar=document.querySelector('.hje-sticky'), yes2=bar&&bar.querySelector('.hje-yes2');
    function tick(){if(!bar)return;var r=root.getBoundingClientRect();bar.hidden=window.scrollY<window.innerHeight*0.6||(r.bottom>0&&r.top<window.innerHeight)}
    document.addEventListener('scroll',tick,{passive:true,capture:true}); window.addEventListener('resize',tick); tick();
    if(yes2)yes2.addEventListener('click',function(){root.scrollIntoView({behavior:'smooth'})});
    var pv=/[?&]preview=1/.test(location.search);
    if(pv){
      var pvb=document.createElement('div'); pvb.textContent='Preview: this visit is not counted as them opening it';
      pvb.style.cssText='position:fixed;left:0;right:0;top:0;z-index:99999;background:#ffcf6b;color:#111;font:700 13px system-ui;text-align:center;padding:6px';
      document.body.appendChild(pvb);
    } else {
      fetch(api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({view:1})}).catch(function(){});
    }
  })();
  </script>`;

  // site files live on heyjudeslawncare.com; this page is served from the Hub (rewrite BEFORE adding our own /api links)
  html = html.replace(/(src|href|poster|action)="\/(?!\/)/g, `$1="${SITE}/`)
    .replace(/srcset="[^"]*"/g, (m) => m.replace(/(srcset="|,\s*)\/(?!\/)/g, `$1${SITE}/`))
    .replace(/url\((['"]?)\/(?!\/)/g, `url($1${SITE}/`)
    .replace(/<script[^>]*(stats\.wp\.com|bilmur|jetpack-stats)[\s\S]*?<\/script>/g, '')
    .replace(/<title>[^<]*<\/title>/, () => `<title>${first ? `${first}'s` : 'Your'} Christmas lights · Hey Jude's</title><meta name="robots" content="noindex,nofollow">`)
    .replace(/<link rel="canonical"[^>]*>/, '')
    // text-message link preview = THEIR mockup (or photo) + their name
    .replace(/<meta (property|name)="(og:[a-z_:]+|twitter:[a-z0-9_:]+)"[^>]*>\s*/g, '')
    .replace('</head>', () => {
      const host = req.headers['x-forwarded-host'] || req.headers.host || 'hub.heyjudeslawncare.com';
      const prevImg = heroImg ? `https://${host}${heroImg}` : `${SITE}/wp-content/uploads/2026/11/lights-share.jpg`;
      const t = first ? `${first}, here's your Christmas lights rough estimate 🎄` : 'Your Christmas lights rough estimate 🎄';
      return `<meta property="og:type" content="website"><meta property="og:title" content="${escHtml(t)}"><meta property="og:description" content="Your rough estimate from Hey Jude's">`
        + `<meta property="og:image" content="${prevImg}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${prevImg}"></head>`;
    })
    // their page already has their price: drop the site's "Get my free design / Call us" buttons + sticky bar
    .replace(/\s*All you do is contact us\./, '')
    // comparison cards: say who each box is
    .replace('on your roof — in SC and NC, it can land on you.', () => 'on your roof — in SC and NC, they can hold you liable 💸')
    .replace('<h2>Not just lights on a roof.</h2>', () => '<h2>What&#8217;s included.</h2>')
    .replace('<h3>Just hung</h3>', () => '<p class="hje-tier">Most companies</p><h3>Just hung</h3>')
    .replace('<h3>Full service</h3>', () => '<p class="hje-tier">Some companies</p><h3>Full service</h3>')
    .replace('<p class="plus">Full service, plus</p>', () => '<p class="plus">World-class service</p>')
    .replace('Most companies hang lights. Some do full service. We do full service, plus.', () => 'Most companies hang lights. Some do full service. We do world-class service.')
    .replace('Read all our Google reviews', () => 'Read all Google reviews')
    .replace('We provide the lights, design, hang, maintain, take down, store them, and more.', () => 'We provide the lights, design, hang, maintain, take down, store them &amp; more.')
    .replace('<div class="bg" role="img" aria-label="A home we lit in cool white and blue"></div>', (m) => (heroImg
      ? `<div class="bg" role="img" aria-label="Your house" style="background-image:url('${heroImg.replace(/&amp;/g, '&')}')!important"></div>`
      : m))
    .replace('<h1>Your house, lit up for Christmas.</h1>', (m) => (heroImg && first ? `<h1 class="hje-h1" style="text-wrap:balance">${first}, let&#8217;s make your home a winter wonderland.</h1>` : m))
    // "Full service, plus" says what we DO (tight wires, plan first, insured, 5.0★); the other columns lose their ✗ lines
    .replace(/<ul class="rich">[\s\S]*?<\/ul>/, () => `<ul class="rich">
            <li><b>📐 Full plan before you buy</b><span>Every bulb mapped — you see it before you pay</span></li>
            <li><b>🎯 Hidden, color-matched wire</b><span>No cords showing — just clean light</span></li>
            <li><b>🛡️ Fully insured</b><span>$1M liability coverage</span></li>
            <li><b>⭐ Perfect 5.0★ rating</b><span>195 Google reviews</span></li>
            <li><b>🗓️ Jan. takedown guarantee</b><span>Down in January or your money back — weather permitting</span></li>
          </ul>`)
    .replace(/(<h3>Just hung<\/h3>\s*<ul>[\s\S]*?)<\/ul>/, (m, head) => `${head.replace(/\s*<li class="n">[^<]*<\/li>/g, '')}</ul>`)
    .replace('before you spend&nbsp;a&nbsp;dime.', () => 'before you commit.')
    .replace('<h2>Lock in your price.</h2>', () => '<h2>What if you do a multi-year agreement?</h2>')
    // "Full service" column: just the 3 ✓s, then "some companies aren't, we are"
    .replace(/(<h3>Full service<\/h3>\s*<ul>[\s\S]*?)<li class="n">Sometimes not insured<\/li>\s*<li class="n">Hard to reach<\/li>\s*<\/ul>/, (m, head) => `${head.replace(/<li class="y">Design<\/li>[\s\S]*<li class="y">Take down &amp; store<\/li>/, ['Design', 'Install', 'Maintain', 'Take down', 'Store'].map((t) => `<li class="y">${t}</li>`).join('\n            '))}</ul>`)
    .replace(/<!-- 9b\. SIGN DEAL -->\s*<section[\s\S]*?<\/section>/, '') // door hanger / yard sign $50 off (asks them to use the form)
    .replace(/<div class="sticky" id="hjl-sticky">[\s\S]*?<\/div>/, '')
    .replace(/<a class="btn [^"]*"[^>]*>[\s\S]*?<\/a>/g, (m) => (/google\.com/.test(m) ? m : ''))
    // hero buttons: jump to their estimate, or to what's included
    .replace(/<div class="ctas">\s*<\/div>/, () => '<div class="ctas"><a class="btn btn-go" href="#quote">See my mockup &amp; estimate ↓</a><a class="btn btn-ghost" href="#included">What&#8217;s included</a></div>')
    .replace(/<div class="ctas">\s*<\/div>/g, '')
    .replace(/(<!-- 2\. CONTRAST[^>]*-->)/, (m) => `${m}<a id="included" style="position:relative;top:-70px;display:block"></a>`)
    .replace(/<section class="final" id="quote">[\s\S]*?<\/section>/, () => section) // their house + range at the bottom
    // the plan + before/after up top is another client's — say so (their own house is at the bottom)
    .replace('<span class="tag">Before</span><span class="tag r">After</span>', () => '<span class="tag">Before · AI night view</span><span class="tag r">After · AI mockup</span>')
    .replace('Get a plan and mockup during your quote.', () => 'A real client&#8217;s plan and mockup from their design consultation.')
    .replace('<span class="tag">The plan</span>', () => '<span class="tag">Real client · the plan</span>')
    // 5. FAQ: they already have a price, so "it depends" becomes "why a range"
    .replace(/<details><summary>How much does it cost\?<\/summary><p>[\s\S]*?<\/p><\/details>/, '<details open><summary>Why a range and not one price?</summary><p>We measured your roofline from a photo, so for now it&#8217;s a range. At your free design consultation we measure your roof, show you samples and a detailed mockup, and give you one exact price for everything: lights, install, maintenance, takedown and storage. Multi-year plans save 5&#8211;10%.</p></details>');
  html = reorderEstimateSections(html);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).send(html);
}

// ── /lights-start → short "get my rough estimate" form for C9 roofline leads (no login) ──
// Submitting creates (or reuses, by phone) the Jobber client + a Christmas Lights request, and drops a
// ready-to-build estimate into the Hub's Lights estimate page (le-meta:<id> with form:true, photo in le-img).
const LIGHTS_FORM_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Free Christmas lights estimate · Hey Jude's</title><meta name="robots" content="noindex">
<meta property="og:title" content="Get your rough Christmas lights estimate 🎄"><meta property="og:description" content="Takes 1 minute. Jude sends you a mockup of your home with a rough estimate.">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}body{margin:0;background:#07090f;color:#f6f3ee;font-family:Poppins,system-ui,sans-serif}
.w{max-width:520px;margin:0 auto;padding:22px 16px 40px}
.logo{height:46px;display:block;margin:0 auto 18px}
h1{font-size:30px;line-height:1.1;font-weight:900;margin:0 0 8px;text-align:center;text-wrap:balance}
@media (max-width:480px){h1{font-size:23px}}
.sub{color:#a9b0bf;text-align:center;margin:0 0 22px;font-size:15px}
.card{background:#111621;border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:18px;margin-bottom:14px}
label.f{display:block;font-weight:700;font-size:14px;margin:0 0 6px}
input[type=text],input[type=tel],input[type=email],select{width:100%;background:#07090f;color:#f6f3ee;border:1px solid rgba(255,255,255,.18);border-radius:12px;padding:13px 12px;font:16px Poppins,system-ui,sans-serif;margin-bottom:12px}
.row{display:flex;gap:8px}.row>*{flex:1}
.q{font-weight:800;font-size:17px;margin:0 0 4px}.qs{color:#a9b0bf;font-size:13px;margin:0 0 12px}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chips label{flex:1 1 40%;display:flex;align-items:center;justify-content:center;gap:6px;border:1px solid rgba(255,255,255,.2);border-radius:12px;padding:12px 8px;font-weight:700;cursor:pointer;user-select:none}
.chips input{display:none}.chips input:checked+span{color:#07090f}.chips label:has(input:checked){background:#00DF00;border-color:#00DF00;color:#07090f}
.photo{display:flex;align-items:center;justify-content:center;gap:8px;border:2px dashed rgba(255,255,255,.25);border-radius:14px;padding:16px;font-weight:700;cursor:pointer;text-align:center}
.thumbs{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px}.thumbs:empty{display:none}.thumbs div{position:relative}.thumbs img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;display:block}.thumbs button{position:absolute;top:3px;right:3px;width:22px;height:22px;padding:0;margin:0;border-radius:50%;background:rgba(0,0,0,.7);color:#fff;font-size:13px;line-height:22px}
button{width:100%;border:0;border-radius:14px;background:#00DF00;color:#04170a;font:800 18px Poppins,system-ui,sans-serif;padding:16px;cursor:pointer;margin-top:6px}
button:disabled{opacity:.6}
.err{color:#ff6b6b;font-weight:700;text-align:center;min-height:20px}
.done{text-align:center;padding:30px 10px}.done h2{font-size:26px;margin:0 0 8px}
.hp{position:absolute;left:-9999px}
.pac-container{background:#111621;border:1px solid rgba(255,255,255,.18);border-radius:12px;margin-top:4px;font-family:Poppins,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.5)}.pac-item{color:#a9b0bf;border-top:1px solid rgba(255,255,255,.08);padding:8px 10px;cursor:pointer}.pac-item:hover,.pac-item-selected{background:#1b2232}.pac-item-query{color:#f6f3ee;font-size:14px}.pac-icon{display:none}.pac-logo:after{filter:invert(1);opacity:.6}
</style></head><body><div class="w">
<img class="logo" src="https://heyjudeslawncare.com/wp-content/uploads/2026/11/hey-judes-holiday-logo.png" alt="Hey Jude's">
<div id="form">
<h1>Get your rough Christmas lights estimate 🎄</h1>
<p class="sub">Takes 1 minute. Then Jude will send you a mockup of your home with a rough estimate.</p>
<div class="card">
<div class="row"><div><label class="f" for="n">First name</label><input id="n" type="text" autocomplete="given-name" placeholder="First"></div>
<div><label class="f" for="ln">Last name</label><input id="ln" type="text" autocomplete="family-name" placeholder="Last"></div></div>
<label class="f" for="p">Mobile phone</label><input id="p" type="tel" inputmode="numeric" autocomplete="tel" placeholder="803-555-1234">
<label class="f" for="em">Email</label><input id="em" type="email" autocomplete="email" placeholder="you@email.com">
<label class="f" for="s">Street address</label><input id="s" type="text" autocomplete="off" placeholder="Start typing your address">
<div class="row"><div><label class="f" for="c">City</label><input id="c" type="text" autocomplete="address-level2" placeholder="Rock Hill"></div>
<div style="flex:.5"><label class="f" for="st">State</label><select id="st"><option>SC</option><option>NC</option></select></div>
<div style="flex:.7"><label class="f" for="z">Zip</label><input id="z" type="text" inputmode="numeric" autocomplete="postal-code" placeholder="29730"></div></div>
<input class="hp" id="hp" type="text" tabindex="-1" autocomplete="off">
</div>
<div class="card"><p class="q">Which sides of the roofline?</p><p class="qs">C9 bulbs along the roofline. Pick every side you want lit.</p>
<div class="chips" id="sides">
<label><input type="checkbox" value="Front" checked><span>Front</span></label><label><input type="checkbox" value="Left side"><span>Left side</span></label>
<label><input type="checkbox" value="Right side"><span>Right side</span></label><label><input type="checkbox" value="Back"><span>Back</span></label></div></div>
<div class="card"><p class="q">Preferred mockup color</p><p class="qs">We&#8217;ll show your house lit up in this color.</p>
<div class="chips" id="color">
<label><input type="radio" name="col" value="Warm white" checked><span>Warm white</span></label><label><input type="radio" name="col" value="Multicolor"><span>Multicolor</span></label>
<label><input type="radio" name="col" value="Candy cane"><span>Candy cane</span></label>
<label><input type="radio" name="col" value="Custom"><span>Custom</span></label>
<label><input type="radio" name="col" value="Not sure"><span>Not sure</span></label></div>
<input id="cc" type="text" placeholder="Your colors, e.g. red &amp; white, or blue + white" style="margin:10px 0 0;display:none" maxlength="80"></div>
<div class="card"><p class="q">Photos of your house <span style="font-weight:600;color:#a9b0bf">(optional)</span></p><p class="qs">Front first, then any other sides you picked (up to 4). Try to fit the <b>whole side</b> in each photo, so stand back or across the street.</p>
<div class="thumbs" id="thumbs"></div>
<label class="photo" id="ph"><span id="phl">📷 Add photos</span><input id="pf" type="file" accept="image/*" multiple hidden></label></div>
<p class="err" id="err"></p>
<button id="go">Send me my rough estimate →</button>
</div>
<div id="ok" class="done" hidden><h2>Thank you! 🎄</h2><p class="sub">Jude will send you a mockup of your home with a rough estimate soon.</p><p style="margin:26px 0 10px;font-weight:700">Want to learn more about the service?</p><a href="https://heyjudeschristmaslights.com" style="display:block;background:#00DF00;color:#04170a;font-weight:800;font-size:17px;padding:15px;border-radius:14px;text-decoration:none">Click here →</a></div>
</div>
<script>
(function(){
  var photos=[];
  function $(i){return document.getElementById(i)}
  function draw(){
    $('thumbs').innerHTML=photos.map(function(p,i){return '<div><img src="'+p+'" alt=""><button type="button" data-i="'+i+'">×</button></div>'}).join('');
    $('phl').textContent=photos.length?(photos.length<4?'📷 Add more':'Max 4 photos'):'📷 Add photos';
  }
  [].forEach.call(document.querySelectorAll('#color input'),function(r){r.addEventListener('change',function(){var on=r.value==='Custom'&&r.checked;$('cc').style.display=on?'block':'none';if(on)$('cc').focus();});});
  $('p').addEventListener('input',function(){
    var d=this.value.replace(/\\D/g,''); if(d.length===11&&d[0]==='1') d=d.slice(1); d=d.slice(0,10);
    this.value=d.length>6?d.slice(0,3)+'-'+d.slice(3,6)+'-'+d.slice(6):d.length>3?d.slice(0,3)+'-'+d.slice(3):d;
  });
  $('thumbs').addEventListener('click',function(e){var i=e.target.getAttribute('data-i'); if(i!==null){photos.splice(+i,1);draw();}});
  function shrink(f){return new Promise(function(ok){var r=new FileReader(); r.onload=function(){ var im=new Image(); im.onload=function(){
      var k=Math.min(1,1400/Math.max(im.width,im.height)), c=document.createElement('canvas');
      c.width=Math.round(im.width*k); c.height=Math.round(im.height*k); c.getContext('2d').drawImage(im,0,0,c.width,c.height);
      ok(c.toDataURL('image/jpeg',.78)); }; im.onerror=function(){ok('')}; im.src=r.result; }; r.readAsDataURL(f);});}
  $('pf').addEventListener('change',function(){
    var fs=[].slice.call(this.files||[]).slice(0,4-photos.length); this.value='';
    Promise.all(fs.map(shrink)).then(function(a){photos=photos.concat(a.filter(Boolean)).slice(0,4);draw();});
  });
  $('go').addEventListener('click',function(){
    var b=this, d={ first:$('n').value.trim(), last:$('ln').value.trim(), email:$('em').value.trim(), phone:$('p').value.trim(), street:$('s').value.trim(), city:$('c').value.trim(), state:$('st').value, zip:$('z').value.trim(),
      sides:[].slice.call(document.querySelectorAll('#sides input:checked')).map(function(x){return x.value}),
      color:(document.querySelector('#color input:checked')||{}).value||'', customColor:$('cc').value.trim(), photos:photos, hp:$('hp').value };
    var digits=d.phone.replace(/\\D/g,'');
    if(!d.first||!d.last||digits.length<10||!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(d.email)||!d.street||!d.city){ $('err').textContent='Please fill in your name, phone, email and address.'; return; }
    if(!d.sides.length){ $('err').textContent='Pick at least one side.'; return; }
    if(d.color==='Custom'&&!d.customColor){ $('err').textContent='Tell us your colors (or pick another option).'; return; }
    $('err').textContent=''; b.disabled=true; b.textContent='Sending…';
    fetch('/api/app-state?key=lights-form',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)})
      .then(function(r){return r.json().then(function(j){ if(!r.ok) throw new Error(j.error||'Something went wrong'); return j; })})
      .then(function(){ $('form').hidden=true; $('ok').hidden=false; window.scrollTo(0,0); })
      .catch(function(e){ $('err').textContent=e.message+' You can also text Jude at (803) 843-0699.'; b.disabled=false; b.textContent='Send me my rough estimate →'; });
  });
})();
</script>
<script>
function hjPlaces(){
  try{
    var g=google.maps, el=document.getElementById('s');
    // Rock Hill, SC area first (about 35 miles around), US only
    var near=new g.LatLngBounds({lat:34.45,lng:-81.6},{lat:35.4,lng:-80.45});
    var ac=new g.places.Autocomplete(el,{bounds:near,strictBounds:false,componentRestrictions:{country:'us'},types:['address'],fields:['address_components']});
    ac.addListener('place_changed',function(){
      var c=(ac.getPlace()||{}).address_components||[], get=function(t,short){var x=c.filter(function(a){return a.types.indexOf(t)>=0})[0];return x?(short?x.short_name:x.long_name):''};
      var street=(get('street_number')+' '+get('route')).trim(); if(street) el.value=street;
      var city=get('locality')||get('sublocality')||get('postal_town')||get('administrative_area_level_3'); if(city) document.getElementById('c').value=city;
      var st=get('administrative_area_level_1',true), sel=document.getElementById('st');
      if(st){ if(![].some.call(sel.options,function(o){return o.value===st})){var o=document.createElement('option');o.value=o.textContent=st;sel.appendChild(o);} sel.value=st; }
      var z=get('postal_code'); if(z) document.getElementById('z').value=z;
    });
    el.addEventListener('keydown',function(e){ if(e.key==='Enter') e.preventDefault(); });
  }catch(e){}
}
</script>
<script async src="https://maps.googleapis.com/maps/api/js?key=AIzaSyB9NZOyude8C_I92b1OHqa-V09E84Vsuso&libraries=places&callback=hjPlaces"></script>
</body></html>`;

async function handleLightsForm(req, res) {
  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
    return res.status(200).send(LIGHTS_FORM_HTML);
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const b = req.body || {};
  if (b.hp) return res.json({ ok: true }); // bot filled the hidden field
  const clean = (v, n = 120) => String(v || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
  const firstName = clean(b.first, 40); const lastName = clean(b.last, 40); const name = `${firstName} ${lastName}`.trim(); const email = clean(b.email, 120).toLowerCase(); const street = clean(b.street); const city = clean(b.city, 60);
  const state = /^[A-Z]{2}$/.test(String(b.state || '')) ? b.state : 'SC'; const zip = clean(b.zip, 10);
  const digits = String(b.phone || '').replace(/\D/g, '').slice(-10);
  const sides = (Array.isArray(b.sides) ? b.sides : []).filter((x) => ['Front', 'Left side', 'Right side', 'Back'].includes(x));
  const color = b.color === 'Custom' && clean(b.customColor, 80) ? `Custom: ${clean(b.customColor, 80)}`
    : ['Warm white', 'Multicolor', 'Candy cane', 'Not sure'].includes(b.color) ? b.color : 'Not sure';
  const photos = (Array.isArray(b.photos) ? b.photos : [b.photo]).map(String)
    .filter((x) => /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(x) && x.length < 2_500_000).slice(0, 4);
  const photo = photos[0] || '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email.' });
  if (!firstName || !lastName || digits.length !== 10 || !street || !city || !sides.length) return res.status(400).json({ error: 'Please fill in your name, phone and address.' });

  const pretty = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  const title = `Christmas Lights · C9 roofline · ${sides.join(', ')} · ${color}`;
  let clientId = ''; let propertyId = ''; let requestUrl = ''; let jobberError = '';
  try {
    const { jobberQuery } = await import('../lib/jobberClient.js');
    const found = await jobberQuery(`query($s:String){ clients(first:10, searchTerm:$s){ nodes{ id firstName lastName isArchived phones{ number } emails{ address } properties{ id } } } }`, { s: digits });
    // Reuse a client ONLY when the phone AND the first + last name match. One phone can sit on several
    // clients (a spouse, a landlord, Jude's own number on a client as a 2nd contact), so phone alone isn't enough.
    const norm = (v) => String(v || '').toLowerCase().replace(/[^a-z]/g, '');
    const match = (found?.clients?.nodes || []).find((c) => !c.isArchived
      && norm(c.firstName) === norm(firstName) && norm(c.lastName) === norm(lastName)
      && (c.phones || []).some((p) => String(p.number).replace(/\D/g, '').slice(-10) === digits));
    if (match) {
      clientId = match.id; propertyId = match.properties?.[0]?.id || '';
      // Only ADD what's missing (their email); never change what's already on the client.
      if (!(match.emails || []).some((e) => String(e.address).toLowerCase() === email)) {
        await jobberQuery(`mutation($id:EncodedId!,$i:ClientEditInput!){ clientEdit(clientId:$id, input:$i){ userErrors{ message } } }`,
          { id: clientId, i: { emailsToAdd: [{ address: email, primary: !(match.emails || []).length, description: 'MAIN' }] } }).catch(() => null);
      }
    }
    else {
      const made = await jobberQuery(`mutation($i:ClientCreateInput!){ clientCreate(input:$i){ client{ id properties{ id } } userErrors{ message } } }`, { i: {
        firstName, lastName,
        phones: [{ number: pretty, primary: true, smsAllowed: true, description: 'MOBILE' }],
        emails: [{ address: email, primary: true, description: 'MAIN' }],
        properties: [{ address: { street1: street, city, province: state, postalCode: zip || undefined, country: 'United States' } }],
      } });
      const errs = made?.clientCreate?.userErrors || [];
      if (errs.length) throw new Error(errs.map((e) => e.message).join('; '));
      clientId = made.clientCreate.client.id; propertyId = made.clientCreate.client.properties?.[0]?.id || '';
    }
    const rq = await jobberQuery(`mutation($i:RequestCreateInput!){ requestCreate(input:$i){ request{ id jobberWebUri } userErrors{ message } } }`, { i: {
      clientId, ...(propertyId ? { propertyId } : {}), title,
    } });
    const rErrs = rq?.requestCreate?.userErrors || [];
    if (rErrs.length) throw new Error(rErrs.map((e) => e.message).join('; '));
    requestUrl = rq.requestCreate.request.jobberWebUri || '';
  } catch (err) {
    jobberError = String(err.message || err).slice(0, 300); // still save the lead in the Hub below
  }

  const db = getSupabaseAdmin();
  const { data: orgRow } = await db.from('app_state').select('org_id').like('key', 'lq-meta:%').not('org_id', 'is', null).limit(1).maybeSingle();
  const org = orgRow?.org_id ? { org_id: orgRow.org_id } : {};
  const id = `le-${Date.now()}`;
  const address = `${street}, ${city}, ${state}${zip ? ` ${zip}` : ''}`;
  // first photo = the one the estimate reads; the rest are extra angles Jude can switch to in the builder
  for (const [i, src] of photos.entries()) await db.from('app_state').upsert({ key: `le-img:${id}:${i ? `x${i}` : 'photo'}`, value: { src }, ...org }, { onConflict: 'key' });
  const meta = { id, client: name, phone: pretty, email, address, sides, color, lines: [], notes: '', confidence: '', has: { photo: !!photo }, extraPhotos: Math.max(0, photos.length - 1),
    form: true, jobberRequestUrl: requestUrl, jobberError, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), imgStamp: Date.now() };
  const { error } = await db.from('app_state').upsert({ key: `le-meta:${id}`, value: meta, ...org }, { onConflict: 'key' });
  if (error && !requestUrl) return res.status(500).json({ error: 'Could not send. Try again.' });
  return res.json({ ok: true });
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
    // C9 roofline lead form (no login): /lights-start.
    if (req.query.key === 'lights-form') {
      return handleLightsForm(req, res);
    }
    // Lights price-range estimate (no login): /estimate/:token.
    if (req.query.key === 'estimate-page') {
      return handleEstimatePage(req, res);
    }
    if (req.query.key === 'lights-estimate') {
      return handleLightsEstimate(req, res);
    }
    // Client presentation (no login): one quote's Present page by its secret share token.
    if (req.query.key === 'lights-present') {
      return handleLightsPresent(req, res);
    }
    // GET ?key=lights-item-img&id=<supply id> → that material's picture (public; Jobber pulls it as the expense receipt).
    if (req.query.key === 'lights-item-img') {
      const iid = String(req.query.id || '');
      if (!/^[a-z0-9-]{1,60}$/i.test(iid)) return res.status(404).end();
      const { data } = await getSupabaseAdmin().from('app_state').select('value').eq('key', 'greenteam-lightsSupplies').maybeSingle();
      const it = (Array.isArray(data?.value) ? data.value : []).find((x) => x.id === iid);
      const m = String(it?.image || '').match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
      if (!m) return res.status(404).end();
      res.setHeader('Content-Type', m[1]);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(Buffer.from(m[2], 'base64'));
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
