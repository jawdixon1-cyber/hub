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
