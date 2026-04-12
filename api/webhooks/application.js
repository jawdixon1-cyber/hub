import { getSupabaseAdmin } from '../../lib/supabaseAdmin.js';

/**
 * POST /api/webhooks/application
 * Receives job application submissions from the website hiring page.
 * Appends to the greenteam-applications array in app_state.
 *
 * No auth required — this is a public form endpoint.
 * CORS enabled for cross-origin submissions from the website.
 */
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const body = req.body || {};

  const application = {
    id: crypto.randomUUID(),
    submittedAt: new Date().toISOString(),
    status: 'new',
    data: body,
  };

  const db = getSupabaseAdmin();

  try {
    // Find the org_id from an existing app_state row
    const { data: sample } = await db
      .from('app_state')
      .select('org_id')
      .limit(1)
      .maybeSingle();
    const orgId = sample?.org_id || null;

    // Read existing applications
    let query = db.from('app_state').select('value').eq('key', 'greenteam-applications');
    if (orgId) query = query.eq('org_id', orgId);
    const { data: row, error: readErr } = await query.maybeSingle();

    if (readErr) {
      console.error('[Application Webhook] Read failed:', readErr.message);
    }

    const existing = row?.value || [];
    existing.push(application);

    // Upsert back
    const payload = { key: 'greenteam-applications', value: existing };
    if (orgId) payload.org_id = orgId;

    // Try update first, then insert
    let error;
    if (row) {
      let q = db.from('app_state').update({ value: existing }).eq('key', 'greenteam-applications');
      if (orgId) q = q.eq('org_id', orgId);
      const result = await q;
      error = result.error;
    } else {
      const result = await db.from('app_state').insert(payload);
      error = result.error;
    }

    if (error) {
      console.error('[Application Webhook] Upsert failed:', error.message, error.details, error.hint);
      return res.status(500).json({ error: 'Failed to save application', detail: error.message });
    }

    console.log(`[Application Webhook] New application from: ${body.name || 'Unknown'}`);
    return res.status(201).json({ success: true, id: application.id });
  } catch (err) {
    console.error('[Application Webhook] Error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
