/**
 * Mowing Schedule API
 * Fetches active recurring jobs from Jobber with client details,
 * computes upcoming visit dates from RRULE, and returns structured schedule data.
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKENS_PATH = join(__dirname, '..', '..', '.jobber-tokens.json');
const JOBBER_GRAPHQL_URL = 'https://api.getjobber.com/api/graphql';

/* ── Token helpers (shared pattern from dominate.js) ── */

async function readTokenData() {
  try {
    const { getSupabaseAdmin } = await import('../../lib/supabaseAdmin.js');
    const db = getSupabaseAdmin();
    const { data } = await db.from('app_tokens').select('value').eq('key', 'jobber').maybeSingle();
    if (data?.value?.access_token) return data.value;
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
    const { getSupabaseAdmin } = await import('../../lib/supabaseAdmin.js');
    const db = getSupabaseAdmin();
    await db.from('app_tokens').upsert({ key: 'jobber', value: tokenData, updated_at: new Date().toISOString() }, { onConflict: 'key' });
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

/* ── RRULE → upcoming dates ── */

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

  // startDate may be ISO timestamp (2026-03-10T04:00:00Z) or date string
  const startStr = startDate.includes('T') ? startDate.split('T')[0] : startDate;
  const start = new Date(startStr + 'T12:00:00'); // noon to avoid TZ shifts

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endWindow = new Date(today);
  endWindow.setDate(endWindow.getDate() + weeksAhead * 7);

  // If start is in the future, begin from start
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

  // Find the first occurrence on or after today
  const daysBetween = parsed.interval * 7;
  const diffMs = today - start;
  const diffDays = Math.floor(diffMs / 86400000);
  const cyclesPassed = Math.max(0, Math.floor(diffDays / daysBetween));
  const nextStart = new Date(start);
  nextStart.setDate(nextStart.getDate() + cyclesPassed * daysBetween);

  // If nextStart is before today, advance one more cycle
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

/* ── Fetch recurring jobs with full client details ── */

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

/* ── Transform to schedule entries ── */

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
        dayOfWeek: new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }),
      });
    }
  }

  // Sort by date, then client name
  visits.sort((a, b) => a.date.localeCompare(b.date) || a.clientName.localeCompare(b.clientName));
  return visits;
}

/* ── Cache ── */

let cachedSchedule = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/* ── Handler ── */

export default async function handler(req, res) {
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
