import { Router } from 'express';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getSupabaseAdmin } from './supabaseAdmin.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKENS_PATH = join(__dirname, '..', '..', '.jobber-tokens.json');

const router = Router();

const JOBBER_GRAPHQL_URL = 'https://api.getjobber.com/api/graphql';

async function getJobberToken() {
  if (process.env.JOBBER_API_TOKEN) return process.env.JOBBER_API_TOKEN;

  try {
    const raw = readFileSync(TOKENS_PATH, 'utf8');
    const tokens = JSON.parse(raw);
    if (tokens.access_token) {
      process.env.JOBBER_API_TOKEN = tokens.access_token;
      return tokens.access_token;
    }
  } catch {}

  return null;
}

async function jobberQuery(query, variables = {}) {
  const token = await getJobberToken();
  if (!token) throw new Error('Missing JOBBER_API_TOKEN. Connect Jobber at /api/jobber-auth');

  const res = await fetch(JOBBER_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-JOBBER-GRAPHQL-VERSION': '2025-01-20',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jobber API ${res.status}: ${text}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`Jobber GraphQL: ${json.errors[0].message}`);
  }

  return json.data;
}

// Fetch all quotes from Jobber (paginated)
async function fetchAllQuotes() {
  const allNodes = [];
  let cursor = null;
  let hasNext = true;

  while (hasNext) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const query = `{
      quotes(first: 100${after}) {
        nodes {
          id
          quoteNumber
          quoteStatus
          amounts { total }
          createdAt
          updatedAt
          sentAt
          lastTransitioned { approvedAt convertedAt }
          client {
            id
            firstName
            lastName
            phones { number }
            emails { address }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }`;
    const data = await jobberQuery(query);
    const nodes = data.quotes?.nodes || [];
    allNodes.push(...nodes);
    hasNext = data.quotes?.pageInfo?.hasNextPage || false;
    cursor = data.quotes?.pageInfo?.endCursor || null;
  }

  return allNodes;
}

// Fetch all recurring jobs from Jobber
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
          total
          startAt
          completedAt
          createdAt
          visitSchedule {
            startDate
            endDate
            recurrenceSchedule { calendarRule }
          }
          client {
            id
            firstName
            lastName
            phones { number }
            emails { address }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }`;
    const data = await jobberQuery(query);
    const nodes = data.jobs?.nodes || [];
    allNodes.push(...nodes);
    hasNext = data.jobs?.pageInfo?.hasNextPage || false;
    cursor = data.jobs?.pageInfo?.endCursor || null;
  }

  return allNodes;
}

// Estimate monthly value from visit total and recurrence rule
function estimateMonthlyValue(total, calendarRule) {
  if (!total || !calendarRule) return total || 0;

  // Parse RRULE-style calendar rule
  const freqMatch = calendarRule.match(/FREQ=(\w+)/);
  const intervalMatch = calendarRule.match(/INTERVAL=(\d+)/);
  const freq = freqMatch ? freqMatch[1] : 'WEEKLY';
  const interval = intervalMatch ? parseInt(intervalMatch[1]) : 1;

  // Calculate visits per month
  let visitsPerMonth;
  switch (freq) {
    case 'WEEKLY':
      visitsPerMonth = 4.33 / interval;
      break;
    case 'DAILY':
      visitsPerMonth = 30 / interval;
      break;
    case 'MONTHLY':
      visitsPerMonth = 1 / interval;
      break;
    default:
      visitsPerMonth = 4.33; // default to weekly
  }

  return Math.round(total * visitsPerMonth * 100) / 100;
}

// Ensure contact exists for a Jobber client
async function ensureContact(db, client) {
  if (!client) return null;

  const jobberId = client.id;
  const { data: existing } = await db
    .from('contacts')
    .select('id')
    .eq('jobber_client_id', jobberId)
    .maybeSingle();

  if (existing) return existing.id;

  const phones = (client.phones || []).map(p => p.number);
  const emails = (client.emails || []).map(e => e.address);

  // Try matching by phone or email
  for (const phone of phones) {
    const clean = phone.replace(/\D/g, '').slice(-10);
    if (!clean) continue;
    const { data } = await db
      .from('contacts')
      .select('id')
      .like('phone', `%${clean}`)
      .maybeSingle();
    if (data) {
      await db.from('contacts').update({ jobber_client_id: jobberId, updated_at: new Date().toISOString() }).eq('id', data.id);
      return data.id;
    }
  }

  for (const email of emails) {
    if (!email) continue;
    const { data } = await db
      .from('contacts')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle();
    if (data) {
      await db.from('contacts').update({ jobber_client_id: jobberId, updated_at: new Date().toISOString() }).eq('id', data.id);
      return data.id;
    }
  }

  // Create new contact
  const { data: created, error } = await db.from('contacts').insert({
    name: [client.firstName, client.lastName].filter(Boolean).join(' '),
    phone: phones[0] || null,
    email: emails[0]?.toLowerCase() || null,
    jobber_client_id: jobberId,
  }).select('id').single();

  if (error) {
    console.error('[Jobber Sync] Contact insert error:', error.message);
    return null;
  }
  return created.id;
}

async function runSync() {
  const db = getSupabaseAdmin();
  const syncStart = new Date().toISOString();
  const stats = { quotes: 0, recurring: 0, contacts: 0, errors: [] };

  try {
    // 1. Sync Quotes
    console.log('[Jobber Sync] Fetching quotes...');
    const quotes = await fetchAllQuotes();
    console.log(`[Jobber Sync] Got ${quotes.length} quotes`);

    for (const q of quotes) {
      try {
        const contactId = await ensureContact(db, q.client);
        if (contactId) stats.contacts++;

        const isApproved = q.quoteStatus === 'approved' || q.quoteStatus === 'converted';
        const approvedAt = q.lastTransitioned?.approvedAt || null;

        const quoteData = {
          jobber_quote_id: q.id,
          sent_at: q.sentAt || null,
          approved_at: isApproved ? (approvedAt || q.updatedAt) : null,
          total_value: q.amounts?.total ? parseFloat(q.amounts.total) : null,
          updated_at: new Date().toISOString(),
        };

        const { error } = await db
          .from('quotes')
          .upsert(quoteData, { onConflict: 'jobber_quote_id' });

        if (error) throw error;
        stats.quotes++;
      } catch (err) {
        stats.errors.push(`Quote ${q.quoteNumber}: ${err.message}`);
      }
    }

    // 2. Sync Recurring Jobs
    console.log('[Jobber Sync] Fetching recurring jobs...');
    const recurringJobs = await fetchRecurringJobs();
    console.log(`[Jobber Sync] Got ${recurringJobs.length} recurring jobs`);

    for (const job of recurringJobs) {
      try {
        const contactId = await ensureContact(db, job.client);

        const calRule = job.visitSchedule?.recurrenceSchedule?.calendarRule;
        const monthlyValue = estimateMonthlyValue(job.total, calRule);
        const isCanceled = job.jobStatus === 'cancelled' || job.jobStatus === 'archived';
        const startDate = job.visitSchedule?.startDate || job.startAt || job.createdAt;

        const rcData = {
          jobber_recurring_id: job.id,
          start_date: startDate,
          canceled_date: isCanceled ? (job.completedAt || job.updatedAt || syncStart) : null,
          monthly_value: monthlyValue,
          updated_at: new Date().toISOString(),
        };

        const { error } = await db
          .from('recurring_contracts')
          .upsert(rcData, { onConflict: 'jobber_recurring_id' });

        if (error) throw error;
        stats.recurring++;
      } catch (err) {
        stats.errors.push(`Job ${job.jobNumber}: ${err.message}`);
      }
    }

    // Update sync cursor
    await db.from('commander_sync_state')
      .update({ value: { last_synced_at: syncStart }, updated_at: syncStart })
      .eq('key', 'jobber_last_sync');

    console.log(`[Jobber Sync] Done. Quotes: ${stats.quotes}, Recurring: ${stats.recurring}, Errors: ${stats.errors.length}`);
  } catch (err) {
    stats.errors.push(`Sync error: ${err.message}`);
    console.error('[Jobber Sync] Fatal:', err.message);
  }

  return stats;
}

// POST /api/admin/jobber/sync (manual trigger)
router.post('/sync', async (req, res) => {
  const adminSecret = process.env.COMMANDER_ADMIN_SECRET;
  if (adminSecret) {
    const provided = req.headers['x-admin-secret'] || req.query.secret;
    if (provided !== adminSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const stats = await runSync();
    return res.json({ ok: true, stats });
  } catch (err) {
    console.error('[Jobber Sync] Error:', err);
    return res.status(500).json({ error: err.message });
  }
});

export { runSync };
export default router;
