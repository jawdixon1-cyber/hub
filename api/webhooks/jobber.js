// Jobber webhook receiver — keeps hub_visits / hub_jobs in sync in near-real-time.
// Jobber POSTs an event when a visit/job is created, updated, or destroyed.
// We verify the HMAC signature, fetch the latest state via GraphQL, and upsert.
//
// Setup:
//   1. In your Jobber developer dashboard, create webhooks for:
//        VISIT_CREATE, VISIT_UPDATE, VISIT_DESTROY,
//        JOB_CREATE,   JOB_UPDATE,   JOB_DESTROY
//   2. Set callback URL to: https://hub.heyjudeslawncare.com/api/webhooks/jobber
//   3. Copy the signing secret into JOBBER_WEBHOOK_SECRET env var on Vercel.
//
// Jobber sends:
//   { data: { webHookEvent: { topic, itemId, accountId, occuredAt } } }
// Header X-Jobber-Hmac-SHA256 is base64(HMAC-SHA256(secret, rawBody))

import crypto from 'crypto';
import { getSupabaseAdmin } from '../../lib/supabaseAdmin.js';
import { jobberQuery, JobberDisconnectedError } from '../../lib/jobberClient.js';

export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  return await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function verifySignature(rawBody, header, secret) {
  if (!secret) return true; // dev mode: skip verification if not configured
  if (!header) return false;
  const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  // Constant-time compare
  const a = Buffer.from(computed);
  const b = Buffer.from(header);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const VISIT_QUERY = `
  query GetVisit($id: EncodedId!) {
    visit(id: $id) {
      id title startAt endAt completedAt
      property { address { street1 street2 city province postalCode } }
      job {
        id jobNumber jobType jobStatus title total startAt endAt
        visitSchedule { startDate endDate recurrenceSchedule { calendarRule } }
        client { id firstName lastName companyName }
      }
    }
  }
`;

const JOB_QUERY = `
  query GetJob($id: EncodedId!) {
    job(id: $id) {
      id jobNumber jobType jobStatus title total startAt endAt
      visitSchedule { startDate endDate recurrenceSchedule { calendarRule } }
      client { id firstName lastName companyName }
    }
  }
`;

function parseRecurrence(calendarRule) {
  if (!calendarRule) return { label: null, visitsPerMonth: null };
  const freqMatch = calendarRule.match(/FREQ=(\w+)/);
  const intervalMatch = calendarRule.match(/INTERVAL=(\d+)/);
  const freq = freqMatch ? freqMatch[1] : null;
  const interval = intervalMatch ? parseInt(intervalMatch[1]) : 1;
  if (freq !== 'WEEKLY') return { label: 'Recurring', visitsPerMonth: null };
  if (interval === 1) return { label: 'W', visitsPerMonth: 30 / 7 };
  if (interval === 2) return { label: 'EOW', visitsPerMonth: 30 / 14 };
  return { label: `Every ${interval} weeks`, visitsPerMonth: 30 / (7 * interval) };
}

function formatAddress(addr) {
  if (!addr) return null;
  return [addr.street1, addr.street2, addr.city, addr.province, addr.postalCode]
    .filter(Boolean).join(', ') || null;
}

async function ensureContact(supabase, jobberClient) {
  if (!jobberClient?.id) return null;
  const name = [jobberClient.firstName, jobberClient.lastName].filter(Boolean).join(' ')
    || jobberClient.companyName || 'Unknown';
  const { data: existing } = await supabase
    .from('contacts').select('id').eq('jobber_client_id', jobberClient.id).maybeSingle();
  if (existing?.id) return existing.id;
  const { data, error } = await supabase
    .from('contacts')
    .upsert({ name, jobber_client_id: jobberClient.id }, { onConflict: 'jobber_client_id' })
    .select('id').single();
  if (error) throw new Error(`contact upsert: ${error.message}`);
  return data.id;
}

async function upsertJob(supabase, jobberJob, contactId) {
  if (!jobberJob?.id) return null;
  const typeMap = { ONE_OFF: 'one_off', RECURRING: 'recurring' };
  const statusMap = { ACTIVE: 'active', ARCHIVED: 'archived', LATE: 'active', UPCOMING: 'active', TODAY: 'active', ACTION_REQUIRED: 'active', ON_HOLD: 'active', UNSCHEDULED: 'active', REQUIRES_INVOICING: 'completed', LATE_TO_INVOICE: 'completed', INVOICED: 'completed' };
  const calendarRule = jobberJob.visitSchedule?.recurrenceSchedule?.calendarRule || null;
  const { label: freqLabel, visitsPerMonth } = parseRecurrence(calendarRule);
  const row = {
    contact_id: contactId,
    title: jobberJob.title || null,
    type: typeMap[jobberJob.jobType] || 'one_off',
    status: statusMap[jobberJob.jobStatus] || 'active',
    job_number: jobberJob.jobNumber ? String(jobberJob.jobNumber) : null,
    total_amount: jobberJob.total != null ? Number(jobberJob.total) : null,
    start_date: jobberJob.visitSchedule?.startDate || (jobberJob.startAt ? jobberJob.startAt.slice(0, 10) : null),
    end_date: jobberJob.visitSchedule?.endDate || (jobberJob.endAt ? jobberJob.endAt.slice(0, 10) : null),
    calendar_rule: calendarRule,
    frequency_label: freqLabel,
    visits_per_month: visitsPerMonth,
    source: 'jobber',
    source_id: jobberJob.id,
  };
  const { data, error } = await supabase
    .from('hub_jobs').upsert(row, { onConflict: 'source,source_id' }).select('id').single();
  if (error) throw new Error(`hub_jobs upsert: ${error.message}`);
  return data.id;
}

async function handleVisit(supabase, topic, itemId) {
  if (topic === 'VISIT_DESTROY') {
    const { error } = await supabase.from('hub_visits').delete().eq('source', 'jobber').eq('source_id', itemId);
    if (error) throw new Error(`hub_visits delete: ${error.message}`);
    return { deleted: itemId };
  }
  const data = await jobberQuery(VISIT_QUERY, { id: itemId });
  const v = data.visit;
  if (!v) {
    // Visit no longer exists — treat as delete
    await supabase.from('hub_visits').delete().eq('source', 'jobber').eq('source_id', itemId);
    return { gone: itemId };
  }
  const contactId = await ensureContact(supabase, v.job?.client);
  const jobId = await upsertJob(supabase, v.job, contactId);
  const row = {
    job_id: jobId,
    contact_id: contactId,
    title: v.title || null,
    start_at: v.startAt || null,
    end_at: v.endAt || null,
    completed_at: v.completedAt || null,
    address: formatAddress(v.property?.address),
    status: v.completedAt ? 'completed' : 'scheduled',
    source: 'jobber',
    source_id: v.id,
  };
  const { error } = await supabase
    .from('hub_visits').upsert(row, { onConflict: 'source,source_id' });
  if (error) throw new Error(`hub_visits upsert: ${error.message}`);
  return { upserted: v.id };
}

async function handleJob(supabase, topic, itemId) {
  if (topic === 'JOB_DESTROY') {
    const { error } = await supabase.from('hub_jobs').delete().eq('source', 'jobber').eq('source_id', itemId);
    if (error) throw new Error(`hub_jobs delete: ${error.message}`);
    return { deleted: itemId };
  }
  const data = await jobberQuery(JOB_QUERY, { id: itemId });
  const job = data.job;
  if (!job) {
    await supabase.from('hub_jobs').delete().eq('source', 'jobber').eq('source_id', itemId);
    return { gone: itemId };
  }
  const contactId = await ensureContact(supabase, job.client);
  await upsertJob(supabase, job, contactId);
  return { upserted: job.id };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Jobber sync is paused. We accept the request (so Jobber doesn't see failures
  // and retry forever) but skip the upsert. Re-enable with JOBBER_SYNC_ENABLED=true.
  if (process.env.JOBBER_SYNC_ENABLED !== 'true') {
    return res.status(200).json({ paused: true });
  }

  const rawBody = await readRawBody(req);
  const sig = req.headers['x-jobber-hmac-sha256'];
  const secret = process.env.JOBBER_WEBHOOK_SECRET;

  if (!verifySignature(rawBody, sig, secret)) {
    console.warn('[Jobber Webhook] Invalid signature');
    return res.status(401).json({ error: 'invalid signature' });
  }

  let payload;
  try { payload = JSON.parse(rawBody); }
  catch { return res.status(400).json({ error: 'invalid JSON' }); }

  const event = payload?.data?.webHookEvent || {};
  const topic = event.topic;
  const itemId = event.itemId;

  if (!topic || !itemId) {
    console.warn('[Jobber Webhook] Missing topic/itemId', payload);
    return res.status(200).json({ ok: true, ignored: 'no-topic' });
  }

  // ACK immediately so Jobber doesn't retry while we work.
  // We still process synchronously because Vercel kills work after the response on Hobby —
  // on Pro this is fine; if processing exceeds 10s, switch to background queue.
  try {
    const supabase = getSupabaseAdmin();
    let result;
    if (topic.startsWith('VISIT_')) result = await handleVisit(supabase, topic, itemId);
    else if (topic.startsWith('JOB_')) result = await handleJob(supabase, topic, itemId);
    else result = { skipped: topic };

    console.log(`[Jobber Webhook] ${topic} ${itemId}:`, result);
    return res.status(200).json({ ok: true, topic, ...result });
  } catch (err) {
    if (err instanceof JobberDisconnectedError || err.code === 'JOBBER_DISCONNECTED') {
      console.error('[Jobber Webhook] Jobber disconnected — event dropped:', topic, itemId);
      // 200 so Jobber doesn't retry forever; cron will catch up when reconnected.
      return res.status(200).json({ ok: false, error: 'jobber disconnected', willRetryViaCron: true });
    }
    console.error('[Jobber Webhook] Error:', err.message);
    // 500 so Jobber retries — they retry up to ~12 times with backoff.
    return res.status(500).json({ ok: false, error: err.message });
  }
}
