import { Router } from 'express';

const router = Router();

/*
 * Messaging API — Twilio SMS integration
 *
 * When Twilio is configured, set these env vars:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_PHONE_NUMBER  (your business number, e.g. +18035551234)
 *
 * For now, all routes return stubs so the UI can be built and tested.
 */

function getTwilioClient() {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) return null;
  // Dynamic import so the app doesn't crash if twilio isn't installed yet
  try {
    const twilio = require('twilio');
    return twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  } catch {
    return null;
  }
}

// POST /api/messages/send  { to: "+18035551234", body: "Hello!" }
router.post('/send', async (req, res) => {
  const { to, body } = req.body;
  if (!to || !body) return res.status(400).json({ error: 'to and body are required' });

  const client = getTwilioClient();
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!client || !from) {
    // Stub mode — return a fake message
    return res.json({
      id: Date.now().toString(),
      to,
      body,
      from: '+10000000000',
      status: 'sent',
      createdAt: new Date().toISOString(),
      stub: true,
    });
  }

  try {
    const message = await client.messages.create({ body, from, to });
    res.json({
      id: message.sid,
      to: message.to,
      body: message.body,
      from: message.from,
      status: message.status,
      createdAt: message.dateCreated,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/webhook — Twilio incoming message webhook
router.post('/webhook', (req, res) => {
  const { From, Body, MessageSid } = req.body;
  console.log(`[SMS] Incoming from ${From}: ${Body}`);

  // TODO: Store in Supabase, push to frontend via websocket/polling
  // For now, just acknowledge
  res.type('text/xml').send('<Response></Response>');
});

// GET /api/messages/status — Check if Twilio is configured
router.get('/status', (req, res) => {
  const configured = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER);
  res.json({
    configured,
    phoneNumber: configured ? process.env.TWILIO_PHONE_NUMBER : null,
  });
});

export default router;
