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
    // Read existing applications
    const { data: row, error: readErr } = await db
      .from('app_state')
      .select('value')
      .eq('key', 'greenteam-applications')
      .maybeSingle();

    if (readErr) {
      console.error('[Application Webhook] Read failed:', readErr.message);
    }

    const existing = row?.value || [];
    existing.push(application);

    // Upsert back
    const { error } = await db
      .from('app_state')
      .upsert({ key: 'greenteam-applications', value: existing }, { onConflict: 'key' });

    if (error) {
      console.error('[Application Webhook] Upsert failed:', error.message, error.details, error.hint);
      // Try insert if upsert fails
      const { error: insertErr } = await db
        .from('app_state')
        .insert({ key: 'greenteam-applications', value: [application] });
      if (insertErr) {
        console.error('[Application Webhook] Insert also failed:', insertErr.message);
        return res.status(500).json({ error: 'Failed to save application', detail: error.message });
      }
    }

    console.log(`[Application Webhook] New application from: ${body.name || 'Unknown'}`);
    return res.status(201).json({ success: true, id: application.id });
  } catch (err) {
    console.error('[Application Webhook] Error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
