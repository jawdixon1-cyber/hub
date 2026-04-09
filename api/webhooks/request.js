import { getSupabaseAdmin } from '../../lib/supabaseAdmin.js';

/**
 * POST /api/webhooks/request
 * Receives form submissions from the website and creates a new request.
 *
 * Auth: requires ?token=<WEBHOOK_SECRET> query param to prevent spam.
 * The org is identified by ?org=<org_slug> (e.g. "heyjudes").
 *
 * Accepts both JSON and form-urlencoded payloads.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  // Verify webhook token
  const token = req.query?.token || req.headers['x-webhook-token'];
  const expectedToken = process.env.WEBHOOK_SECRET;
  if (!expectedToken || token !== expectedToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Resolve org from slug
  const orgSlug = req.query?.org;
  if (!orgSlug) {
    return res.status(400).json({ error: 'org query param required' });
  }

  const db = getSupabaseAdmin();

  const { data: org, error: orgErr } = await db
    .from('organizations')
    .select('id')
    .eq('slug', orgSlug)
    .maybeSingle();

  if (orgErr || !org) {
    return res.status(404).json({ error: 'Organization not found' });
  }

  // Parse body (support both JSON and form-urlencoded)
  const body = req.body || {};

  // Map form fields to request columns
  const services = [];
  if (body.mowing === 'on' || body.mowing === true || body.mowing === 'true') services.push('mowing');
  if (body['yard-cleanup'] === 'on' || body['yard-cleanup'] === true || body.yard_cleanup === 'true') services.push('yard-cleanup');
  if (body.landscaping === 'on' || body.landscaping === true || body.landscaping === 'true') services.push('landscaping');
  // Also accept a comma-separated services field
  if (body.services && typeof body.services === 'string') {
    services.push(...body.services.split(',').map(s => s.trim()).filter(Boolean));
  }

  const request = {
    org_id: org.id,
    first_name: body.fname || body.first_name || body.firstName || null,
    last_name: body.lname || body.last_name || body.lastName || null,
    email: body.email || null,
    phone: body.phone || null,
    street: body.street || body.address || null,
    city: body.city || null,
    state: body.state || null,
    zip: body.zip || body.postal_code || null,
    services,
    source: body.source || body.lead_source || null,
    source_other: body['source-other'] || body.source_other || null,
    sms_consent: body.sms_consent === 'on' || body.sms_consent === true || body.sms_consent === 'true',
    notes: body.notes || body.message || null,
    raw_payload: body,
    status: 'new',
  };

  const { data, error } = await db.from('requests').insert(request).select('id').single();

  if (error) {
    console.error('[Webhook] Failed to create request:', error.message);
    return res.status(500).json({ error: 'Failed to create request' });
  }

  console.log(`[Webhook] New request created: ${data.id} for org ${orgSlug}`);
  return res.status(201).json({ success: true, id: data.id });
}
