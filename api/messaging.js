import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';

/**
 * /api/messaging?action=send|incoming|tag
 * Consolidated messaging endpoint: Twilio SMS + GHL tagging
 */
export default async function handler(req, res) {
  // CORS for incoming webhook
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query?.action || req.body?.action;

  if (action === 'ensure-bucket') return handleEnsureBucket(req, res);
  if (action === 'get-upload-url') return handleGetUploadUrl(req, res);

  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  if (action === 'send') return handleSend(req, res);
  if (action === 'incoming') return handleIncoming(req, res);
  if (action === 'tag') return handleTag(req, res);
  if (action === 'application') return handleApplication(req, res);

  return res.status(400).json({ error: 'action param required: send|incoming|tag|application|ensure-bucket|get-upload-url' });
}

/* ─── Create signed upload URL so anonymous clients can upload without RLS policies ─── */
async function handleGetUploadUrl(req, res) {
  const bucket = req.query?.bucket || req.body?.bucket || 'resumes';
  const filename = req.query?.filename || req.body?.filename || 'file';
  try {
    const db = getSupabaseAdmin();
    // Ensure bucket exists first
    const { data: existing } = await db.storage.getBucket(bucket);
    if (!existing) {
      await db.storage.createBucket(bucket, { public: true, fileSizeLimit: 10 * 1024 * 1024 });
    }
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
    const { data, error } = await db.storage.from(bucket).createSignedUploadUrl(path);
    if (error) return res.status(500).json({ error: error.message });
    const { data: pub } = db.storage.from(bucket).getPublicUrl(path);
    return res.status(200).json({ path, token: data.token, signedUrl: data.signedUrl, publicUrl: pub.publicUrl });
  } catch (err) {
    console.error('[getUploadUrl]', err);
    return res.status(500).json({ error: err.message || 'Failed to get upload URL' });
  }
}

/* ─── Ensure Supabase Storage bucket exists (for resumes) ─── */
async function handleEnsureBucket(req, res) {
  const name = req.query?.name || req.body?.name || 'resumes';
  try {
    const db = getSupabaseAdmin();
    const { data: existing, error: getErr } = await db.storage.getBucket(name);
    if (existing && !getErr) return res.status(200).json({ ok: true, created: false, name });
    const { error: createErr } = await db.storage.createBucket(name, {
      public: true,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png'],
    });
    if (createErr) return res.status(500).json({ ok: false, error: createErr.message });
    return res.status(200).json({ ok: true, created: true, name });
  } catch (err) {
    console.error('[ensureBucket]', err);
    return res.status(500).json({ ok: false, error: err.message || 'Failed to ensure bucket' });
  }
}

/* ─── Send SMS via Twilio ─── */
async function handleSend(req, res) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from) return res.status(500).json({ error: 'Twilio not configured' });

  const { to, message } = req.body || {};
  if (!to || !message) return res.status(400).json({ error: 'to and message required' });

  const digits = to.replace(/\D/g, '');
  const phone = digits.startsWith('1') ? `+${digits}` : `+1${digits}`;

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: phone, From: from, Body: message }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      console.error('[SMS] Twilio error:', data.message);
      return res.status(resp.status).json({ error: data.message || 'Failed to send' });
    }
    console.log(`[SMS] Sent to ${phone}: ${message.slice(0, 50)}...`);
    return res.status(200).json({ success: true, sid: data.sid });
  } catch (err) {
    console.error('[SMS] Error:', err);
    return res.status(500).json({ error: 'Failed to send SMS' });
  }
}

/* ─── Incoming SMS webhook from Twilio ─── */
async function handleIncoming(req, res) {
  const from = req.body?.From || '';
  const body = req.body?.Body || '';
  const sid = req.body?.MessageSid || '';

  if (!from || !body) {
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send('<Response></Response>');
  }

  const phone = from.replace(/^\+1/, '');
  const message = {
    id: sid || crypto.randomUUID(),
    phone, from, body,
    direction: 'inbound',
    createdAt: new Date().toISOString(),
    read: false,
  };

  try {
    const db = getSupabaseAdmin();
    const { data: row } = await db.from('app_state').select('value, org_id').eq('key', 'greenteam-incoming-sms').maybeSingle();
    const existing = row?.value || [];
    existing.push(message);
    const trimmed = existing.slice(-500);

    if (row) {
      await db.from('app_state').update({ value: trimmed }).eq('key', 'greenteam-incoming-sms');
    } else {
      const { data: sample } = await db.from('app_state').select('org_id').limit(1).maybeSingle();
      const payload = { key: 'greenteam-incoming-sms', value: trimmed };
      if (sample?.org_id) payload.org_id = sample.org_id;
      await db.from('app_state').insert(payload);
    }
    console.log(`[SMS Incoming] From ${from}: ${body.slice(0, 50)}`);
  } catch (err) {
    console.error('[SMS Incoming] Error:', err);
  }

  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send('<Response></Response>');
}

/* ─── Tag applicant in GHL ─── */
async function handleTag(req, res) {
  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GHL_API_KEY not configured' });

  const { phone, name, email, status } = req.body || {};
  if (!phone || !status) return res.status(400).json({ error: 'phone and status required' });

  const GHL = 'https://rest.gohighlevel.com/v1';
  const tag = `applicant-${status}`;
  const allTags = ['applicant', tag];
  const statusTags = ['applicant-contacted', 'applicant-hired', 'applicant-rejected'];
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

  try {
    const searchRes = await fetch(`${GHL}/contacts/lookup?phone=${encodeURIComponent(phone)}`, { headers });
    const searchData = await searchRes.json();
    const existing = searchData?.contacts?.[0];

    if (existing) {
      const cleaned = (existing.tags || []).filter((t) => !statusTags.includes(t));
      const newTags = [...new Set([...cleaned, ...allTags])];
      await fetch(`${GHL}/contacts/${existing.id}`, { method: 'PUT', headers, body: JSON.stringify({ tags: newTags }) });
      return res.status(200).json({ success: true, contactId: existing.id, tag });
    } else {
      const [firstName, ...rest] = (name || 'Applicant').split(' ');
      const createRes = await fetch(`${GHL}/contacts/`, {
        method: 'POST', headers,
        body: JSON.stringify({ phone, firstName, lastName: rest.join(' '), email: email || undefined, tags: allTags, source: 'hub-application' }),
      });
      const createData = await createRes.json();
      return res.status(201).json({ success: true, contactId: createData?.contact?.id, tag });
    }
  } catch (err) {
    console.error('[GHL] Error:', err);
    return res.status(500).json({ error: 'Failed to update GHL contact' });
  }
}

/* ─── Application submission ─── */
async function handleApplication(req, res) {
  const body = req.body || {};
  const application = { id: crypto.randomUUID(), submittedAt: new Date().toISOString(), status: 'new', data: body };
  const db = getSupabaseAdmin();

  try {
    const { data: sample } = await db.from('app_state').select('org_id').limit(1).maybeSingle();
    const orgId = sample?.org_id || null;

    let query = db.from('app_state').select('value').eq('key', 'greenteam-applications');
    if (orgId) query = query.eq('org_id', orgId);
    const { data: row } = await query.maybeSingle();

    const existing = row?.value || [];
    existing.push(application);

    const payload = { key: 'greenteam-applications', value: existing };
    if (orgId) payload.org_id = orgId;

    let error;
    if (row) {
      let q = db.from('app_state').update({ value: existing }).eq('key', 'greenteam-applications');
      if (orgId) q = q.eq('org_id', orgId);
      error = (await q).error;
    } else {
      error = (await db.from('app_state').insert(payload)).error;
    }

    if (error) return res.status(500).json({ error: 'Failed to save application', detail: error.message });

    console.log(`[Application] New from: ${body.name || 'Unknown'}`);
    return res.status(201).json({ success: true, id: application.id });
  } catch (err) {
    console.error('[Application] Error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
