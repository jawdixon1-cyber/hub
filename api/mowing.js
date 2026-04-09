/**
 * Consolidated Mowing API
 * GET  → Schedule (fetches recurring jobs from Jobber, computes upcoming visits)
 * POST → Notify  (sends service reminders via GHL SMS)
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { findContactByPhone, findContactByEmail, sendSMS } from '../lib/ghl.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKENS_PATH = join(__dirname, '..', '.jobber-tokens.json');
const JOBBER_GRAPHQL_URL = 'https://api.getjobber.com/api/graphql';

/* ══════════════════════════════════════════════════════════
   SHARED: Jobber Token helpers (from schedule.js)
   ══════════════════════════════════════════════════════════ */

async function readTokenData() {
  try {
    const { getSupabaseAdmin } = await import('../lib/supabaseAdmin.js');
    const db = getSupabaseAdmin();
    const { data } = await db.from('app_tokens').select('value, org_id').eq('key', 'jobber').maybeSingle();
    if (data?.value?.access_token) { data.value._org_id = data.org_id; return data.value; }
  } catch {}
  try {
    if (existsSync(TOKENS_PATH)) {
      const data = JSON.parse(readFileSync(TOKENS_PATH, 'utf8'));
      if (data?.access_token) return data;
    }
  } catch {}
  return null;
}

async function saveTokenData(tokenData) {
  try {
    const { writeFileSync } = await import('fs');
    writeFileSync(TOKENS_PATH, JSON.stringify(tokenData, null, 2));
  } catch {}
  try {
    const { getSupabaseAdmin } = await import('../lib/supabaseAdmin.js');
    const db = getSupabaseAdmin();
    const payload = { key: 'jobber', value: tokenData, updated_at: new Date().toISOString() };
    if (tokenData._org_id) payload.org_id = tokenData._org_id;
    await db.from('app_tokens').upsert(payload, { onConflict: 'key' });
  } catch {}
}

async function refreshAccessToken(tokenData) {
  const clientId = (process.env.JOBBER_CLIENT_ID || '').trim();
  const clientSecret = (process.env.JOBBER_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret || !tokenData?.refresh_token) return null;
  const res = await fetch('https://api.getjobber.com/api/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: tokenData.refresh_token }),
  });
  if (!res.ok) return null;
  const tokens = await res.json();
  const updated = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || tokenData.refresh_token,
    expires_at: Date.now() + (tokens.expires_in || 7200) * 1000,
    connected_at: tokenData.connected_at,
    refreshed_at: new Date().toISOString(),
  };
  await saveTokenData(updated);
  return updated.access_token;
}

let refreshPromise = null;

async function getToken() {
  const tokenData = await readTokenData();
  if (!tokenData?.access_token) return null;
  if (tokenData.expires_at && Date.now() > tokenData.expires_at - 60000) {
    if (!refreshPromise) refreshPromise = refreshAccessToken(tokenData).finally(() => { refreshPromise = null; });
    const newToken = await refreshPromise;
    if (newToken) return newToken;
  }
  return tokenData.access_token;
}

async function jobberQuery(query, tokenOverride = null) {
  const token = tokenOverride || await getToken();
  if (!token) throw new Error('No Jobber token');
  const res = await fetch(JOBBER_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-JOBBER-GRAPHQL-VERSION': '2025-01-20' },
    body: JSON.stringify({ query }),
  });
  if (res.status === 401 && !tokenOverride) {
    const tokenData = await readTokenData();
    if (tokenData) {
      refreshPromise = null;
      const newToken = await refreshAccessToken(tokenData);
      if (newToken) return jobberQuery(query, newToken);
    }
    throw new Error('Jobber token expired');
  }
  if (!res.ok) throw new Error(`Jobber ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

/* ══════════════════════════════════════════════════════════
   SCHEDULE: RRULE parsing & recurring job fetching
   ══════════════════════════════════════════════════════════ */

function parseRRule(rule) {
  if (!rule) return null;
  const freqMatch = rule.match(/FREQ=(\w+)/);
  const intervalMatch = rule.match(/INTERVAL=(\d+)/);
  const byDayMatch = rule.match(/BYDAY=([A-Z,]+)/);
  return {
    freq: freqMatch?.[1] || 'WEEKLY',
    interval: parseInt(intervalMatch?.[1] || '1', 10),
    byDay: byDayMatch?.[1]?.split(',') || null,
  };
}

function generateUpcomingDates(startDate, rrule, weeksAhead = 4) {
  if (!startDate || !rrule) return [];
  const parsed = parseRRule(rrule);
  if (!parsed || parsed.freq !== 'WEEKLY') return [];

  const startStr = startDate.includes('T') ? startDate.split('T')[0] : startDate;
  const start = new Date(startStr + 'T12:00:00');

  const now = new Date();
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
  const today = new Date(todayStr + 'T00:00:00');
  const endWindow = new Date(today);
  endWindow.setDate(endWindow.getDate() + weeksAhead * 7);

  if (start >= today) {
    const dates = [];
    const current = new Date(start);
    const daysBetween = parsed.interval * 7;
    while (current <= endWindow && dates.length < 20) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + daysBetween);
    }
    return dates;
  }

  const daysBetween = parsed.interval * 7;
  const diffMs = today - start;
  const diffDays = Math.floor(diffMs / 86400000);
  const cyclesPassed = Math.max(0, Math.floor(diffDays / daysBetween));
  const nextStart = new Date(start);
  nextStart.setDate(nextStart.getDate() + cyclesPassed * daysBetween);

  if (nextStart < today) nextStart.setDate(nextStart.getDate() + daysBetween);

  const dates = [];
  const current = new Date(nextStart);
  while (current <= endWindow && dates.length < 20) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + daysBetween);
  }
  return dates;
}

function getFrequencyLabel(rrule) {
  if (!rrule) return 'Unknown';
  const parsed = parseRRule(rrule);
  if (!parsed) return 'Unknown';
  if (parsed.freq === 'WEEKLY' && parsed.interval === 1) return 'Weekly';
  if (parsed.freq === 'WEEKLY' && parsed.interval === 2) return 'Biweekly';
  if (parsed.freq === 'MONTHLY') return 'Monthly';
  return `Every ${parsed.interval} weeks`;
}

async function fetchRecurringJobs() {
  const allNodes = [];
  let cursor = null;
  let hasNext = true;

  while (hasNext) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const query = `{
      jobs(first: 100, filter: { jobType: RECURRING }${after}) {
        nodes {
          id
          jobNumber
          jobStatus
          title
          instructions
          total
          startAt
          visitSchedule {
            startDate
            endDate
            recurrenceSchedule { calendarRule }
          }
          client {
            id
            firstName
            lastName
            phones { number primary }
            emails { address primary }
          }
          property {
            address { street1 street2 city province postalCode }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }`;
    const data = await jobberQuery(query);
    allNodes.push(...(data.jobs?.nodes || []));
    hasNext = data.jobs?.pageInfo?.hasNextPage || false;
    cursor = data.jobs?.pageInfo?.endCursor || null;
  }

  return allNodes;
}

function buildSchedule(jobs, weeksAhead = 4) {
  const visits = [];

  for (const job of jobs) {
    if (job.jobStatus === 'cancelled' || job.jobStatus === 'archived' || job.jobStatus === 'completed') continue;

    const rrule = job.visitSchedule?.recurrenceSchedule?.calendarRule;
    const startDate = job.visitSchedule?.startDate;
    const upcomingDates = generateUpcomingDates(startDate, rrule, weeksAhead);
    const frequency = getFrequencyLabel(rrule);

    const primaryPhone = job.client?.phones?.find(p => p.primary)?.number || job.client?.phones?.[0]?.number || null;
    const primaryEmail = job.client?.emails?.find(e => e.primary)?.address || job.client?.emails?.[0]?.address || null;
    const addr = job.property?.address;
    const address = addr ? [addr.street1, addr.street2].filter(Boolean).join(' ') + ', ' + [addr.city, addr.province, addr.postalCode].filter(Boolean).join(' ') : null;

    for (const date of upcomingDates) {
      visits.push({
        id: `${job.id}-${date}`,
        jobId: job.id,
        jobNumber: job.jobNumber,
        date,
        clientName: `${job.client?.firstName || ''} ${job.client?.lastName || ''}`.trim(),
        clientId: job.client?.id,
        address,
        phone: primaryPhone,
        email: primaryEmail,
        frequency,
        title: job.title || 'Lawn Maintenance',
        notes: job.instructions || null,
        total: job.total,
        dayOfWeek: new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' }),
      });
    }
  }

  visits.sort((a, b) => a.date.localeCompare(b.date) || a.clientName.localeCompare(b.clientName));
  return visits;
}

let cachedSchedule = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function handleSchedule(req, res) {
  try {
    const { refresh, weeks } = req.query;
    if (refresh === '1') {
      cachedSchedule = null;
      cacheTime = 0;
    }

    const weeksAhead = Math.min(parseInt(weeks || '4', 10), 12);

    if (cachedSchedule && Date.now() - cacheTime < CACHE_TTL) {
      return res.json(cachedSchedule);
    }

    console.log('[MowingSchedule] Fetching recurring jobs from Jobber...');
    const jobs = await fetchRecurringJobs();
    console.log(`[MowingSchedule] Found ${jobs.length} recurring jobs`);

    const visits = buildSchedule(jobs, weeksAhead);
    console.log(`[MowingSchedule] Generated ${visits.length} upcoming visits`);

    const result = {
      visits,
      totalJobs: jobs.filter(j => j.jobStatus !== 'cancelled' && j.jobStatus !== 'archived').length,
      generatedAt: new Date().toISOString(),
    };

    cachedSchedule = result;
    cacheTime = Date.now();

    return res.json(result);
  } catch (err) {
    console.error('[MowingSchedule] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}

/* ══════════════════════════════════════════════════════════
   NOTIFY: GHL SMS notifications
   ══════════════════════════════════════════════════════════ */

async function getSupabase() {
  const { getSupabaseAdmin } = await import('../lib/supabaseAdmin.js');
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
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York' });
}

async function sendVisitNotification(visit, settings = {}) {
  const dedupeKey = `${visit.jobId}-${visit.date}`;

  const log = await getNotificationLog();
  const existing = log.find(e => e.dedupeKey === dedupeKey && e.status === 'sent');
  if (existing) {
    return { success: false, error: 'Already sent', dedupeKey, skipped: true };
  }

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

  const firstName = visit.clientName?.split(' ')[0] || 'Valued Customer';
  const template = settings.messageTemplate || DEFAULT_TEMPLATE;
  const message = renderTemplate(template, {
    firstName,
    serviceDate: formatDate(visit.date),
    companyName: "Hey Jude's Lawn Care",
    address: visit.address || '',
  });

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

async function handleNotify(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  try {
    const { action, visit, visits, testPhone } = req.body;
    const settings = await getMowingSettings();

    if (action === 'test') {
      if (!testPhone) return res.status(400).json({ error: 'testPhone required' });
      const contact = await findContactByPhone(testPhone);
      if (!contact) return res.status(404).json({ error: 'Phone not found in GHL contacts' });
      const template = settings.messageTemplate || DEFAULT_TEMPLATE;
      const message = renderTemplate(template, {
        firstName: 'Jude',
        serviceDate: formatDate(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())),
        companyName: "Hey Jude's Lawn Care",
        address: '123 Test St',
      });
      const result = await sendSMS(contact.id, message);
      return res.json({ ...result, message });
    }

    if (action === 'send' && visit) {
      const result = await sendVisitNotification(visit, settings);
      return res.json(result);
    }

    if (action === 'batch' && visits?.length) {
      const results = [];
      for (const v of visits) {
        const result = await sendVisitNotification(v, settings);
        results.push(result);
        await new Promise(r => setTimeout(r, 200));
      }
      const sent = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success && !r.skipped).length;
      const skipped = results.filter(r => r.skipped).length;
      return res.json({ sent, failed, skipped, total: results.length, results });
    }

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

/* ══════════════════════════════════════════════════════════
   ROUTER: GET → schedule, POST → notify
   ══════════════════════════════════════════════════════════ */

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return handleSchedule(req, res);
  }
  if (req.method === 'POST') {
    return handleNotify(req, res);
  }
  return res.status(405).json({ error: 'Method not allowed. Use GET (schedule) or POST (notify).' });
}
