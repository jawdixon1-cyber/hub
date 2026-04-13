/**
 * POST /api/sms/send
 * Send an SMS via Twilio.
 * Body: { to, message }
 * to: phone number (will be formatted to E.164)
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!sid || !token || !from) {
    return res.status(500).json({ error: 'Twilio not configured' });
  }

  const { to, message } = req.body || {};
  if (!to || !message) return res.status(400).json({ error: 'to and message required' });

  // Format phone to E.164
  const digits = to.replace(/\D/g, '');
  const phone = digits.startsWith('1') ? `+${digits}` : `+1${digits}`;

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: phone, From: from, Body: message }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      console.error('[SMS] Twilio error:', data.message || data);
      return res.status(resp.status).json({ error: data.message || 'Failed to send SMS' });
    }

    console.log(`[SMS] Sent to ${phone}: ${message.slice(0, 50)}...`);
    return res.status(200).json({ success: true, sid: data.sid });
  } catch (err) {
    console.error('[SMS] Error:', err);
    return res.status(500).json({ error: 'Failed to send SMS' });
  }
}
