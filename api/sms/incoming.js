import { getSupabaseAdmin } from '../../lib/supabaseAdmin.js';

/**
 * POST /api/sms/incoming
 * Twilio webhook for incoming SMS messages.
 * Stores the message in app_state under greenteam-incoming-sms.
 * The Messages page polls this to show incoming texts.
 */
export default async function handler(req, res) {
  // Twilio sends form-urlencoded
  if (req.method !== 'POST') return res.status(405).end();

  const from = req.body?.From || '';
  const body = req.body?.Body || '';
  const sid = req.body?.MessageSid || '';

  if (!from || !body) {
    // Return TwiML empty response
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send('<Response></Response>');
  }

  // Strip +1 prefix for storage
  const phone = from.replace(/^\+1/, '');

  const message = {
    id: sid || crypto.randomUUID(),
    phone,
    from,
    body,
    direction: 'inbound',
    createdAt: new Date().toISOString(),
    read: false,
  };

  try {
    const db = getSupabaseAdmin();

    // Get existing incoming messages
    const { data: row } = await db
      .from('app_state')
      .select('value, org_id')
      .eq('key', 'greenteam-incoming-sms')
      .maybeSingle();

    const existing = row?.value || [];
    existing.push(message);

    // Keep last 500 messages max
    const trimmed = existing.slice(-500);

    if (row) {
      await db.from('app_state').update({ value: trimmed }).eq('key', 'greenteam-incoming-sms');
    } else {
      // Find org_id from any existing row
      const { data: sample } = await db.from('app_state').select('org_id').limit(1).maybeSingle();
      const payload = { key: 'greenteam-incoming-sms', value: trimmed };
      if (sample?.org_id) payload.org_id = sample.org_id;
      await db.from('app_state').insert(payload);
    }

    console.log(`[SMS Incoming] From ${from}: ${body.slice(0, 50)}`);
  } catch (err) {
    console.error('[SMS Incoming] Error saving:', err);
  }

  // Return empty TwiML so Twilio doesn't retry
  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send('<Response></Response>');
}
