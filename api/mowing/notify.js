/**
 * Mowing Notification API
 * Sends service reminders to customers via GHL SMS.
 * Tracks send status to prevent duplicates.
 */

import { findContactByPhone, findContactByEmail, sendSMS } from '../ghl/service.js';

/* ── Supabase helper for notification log ── */

async function getSupabase() {
  const { getSupabaseAdmin } = await import('../../lib/supabaseAdmin.js');
  return getSupabaseAdmin();
}

async function getNotificationLog() {
  try {
    const db = await getSupabase();
    const { data } = await db.from('app_state').select('value').eq('key', 'greenteam-mowingNotifications').maybeSingle();
    return data?.value || [];
  } catch {
    return [];
  }
}

async function saveNotificationLog(log) {
  try {
    const db = await getSupabase();
    await db.from('app_state').upsert({ key: 'greenteam-mowingNotifications', value: log }, { onConflict: 'key' });
  } catch (err) {
    console.error('[MowingNotify] Failed to save log:', err.message);
  }
}

async function getMowingSettings() {
  try {
    const db = await getSupabase();
    const { data } = await db.from('app_state').select('value').eq('key', 'greenteam-mowingSettings').maybeSingle();
    return data?.value || {};
  } catch {
    return {};
  }
}

/* ── Template rendering ── */

const DEFAULT_TEMPLATE = "Hi {{firstName}}, this is a reminder that Hey Jude's Lawn Care is scheduled to service your property on {{serviceDate}}. Thank you for choosing us!";

function renderTemplate(template, vars) {
  let msg = template || DEFAULT_TEMPLATE;
  for (const [key, val] of Object.entries(vars)) {
    msg = msg.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val || '');
  }
  return msg.trim();
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

/* ── Send notification for a single visit ── */

async function sendVisitNotification(visit, settings = {}) {
  const dedupeKey = `${visit.jobId}-${visit.date}`;

  // Check for duplicate
  const log = await getNotificationLog();
  const existing = log.find(e => e.dedupeKey === dedupeKey && e.status === 'sent');
  if (existing) {
    return { success: false, error: 'Already sent', dedupeKey, skipped: true };
  }

  // Find GHL contact
  let ghlContact = null;
  if (visit.phone) {
    ghlContact = await findContactByPhone(visit.phone);
  }
  if (!ghlContact && visit.email) {
    ghlContact = await findContactByEmail(visit.email);
  }

  if (!ghlContact) {
    const entry = {
      dedupeKey,
      visitId: visit.id,
      clientName: visit.clientName,
      date: visit.date,
      status: 'failed',
      error: 'Contact not found in GHL',
      sentAt: new Date().toISOString(),
    };
    log.push(entry);
    await saveNotificationLog(log);
    return { success: false, error: 'Contact not found in GHL', dedupeKey };
  }

  // Render message
  const firstName = visit.clientName?.split(' ')[0] || 'Valued Customer';
  const template = settings.messageTemplate || DEFAULT_TEMPLATE;
  const message = renderTemplate(template, {
    firstName,
    serviceDate: formatDate(visit.date),
    companyName: "Hey Jude's Lawn Care",
    address: visit.address || '',
  });

  // Send SMS
  const result = await sendSMS(ghlContact.id, message);

  const entry = {
    dedupeKey,
    visitId: visit.id,
    clientName: visit.clientName,
    date: visit.date,
    ghlContactId: ghlContact.id,
    status: result.success ? 'sent' : 'failed',
    messageId: result.messageId || null,
    error: result.error || null,
    message,
    sentAt: new Date().toISOString(),
  };
  log.push(entry);
  await saveNotificationLog(log);

  return { success: result.success, dedupeKey, messageId: result.messageId, error: result.error };
}

/* ── Handler ── */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  try {
    const { action, visit, visits, testPhone } = req.body;
    const settings = await getMowingSettings();

    // Test send — send to owner's phone
    if (action === 'test') {
      if (!testPhone) return res.status(400).json({ error: 'testPhone required' });
      const contact = await findContactByPhone(testPhone);
      if (!contact) return res.status(404).json({ error: 'Phone not found in GHL contacts' });
      const template = settings.messageTemplate || DEFAULT_TEMPLATE;
      const message = renderTemplate(template, {
        firstName: 'Jude',
        serviceDate: formatDate(new Date().toISOString().split('T')[0]),
        companyName: "Hey Jude's Lawn Care",
        address: '123 Test St',
      });
      const result = await sendSMS(contact.id, message);
      return res.json({ ...result, message });
    }

    // Single visit notification
    if (action === 'send' && visit) {
      const result = await sendVisitNotification(visit, settings);
      return res.json(result);
    }

    // Batch send for multiple visits
    if (action === 'batch' && visits?.length) {
      const results = [];
      for (const v of visits) {
        const result = await sendVisitNotification(v, settings);
        results.push(result);
        // Rate limit: 200ms between sends
        await new Promise(r => setTimeout(r, 200));
      }
      const sent = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success && !r.skipped).length;
      const skipped = results.filter(r => r.skipped).length;
      return res.json({ sent, failed, skipped, total: results.length, results });
    }

    // Get notification log
    if (action === 'log') {
      const log = await getNotificationLog();
      return res.json({ log });
    }

    return res.status(400).json({ error: 'Invalid action. Use: test, send, batch, or log' });
  } catch (err) {
    console.error('[MowingNotify] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
