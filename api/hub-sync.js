// Hub sync layer — pulls data from external sources (Jobber today, others later)
// and writes to the canonical hub_* tables in Supabase.
//
// Source-agnostic by design: the UI never reads from Jobber. Replacing Jobber
// later means swapping this sync, not rewriting screens.
//
// Endpoints:
//   POST /api/hub-sync?source=jobber&entity=visits&since=YYYY-MM-DD
//   POST /api/hub-sync?source=jobber&entity=clients
//   POST /api/hub-sync?source=jobber&entity=all     (visits + clients, sequential)
//
// Designed to be called by:
//   - The owner's "Sync now" button
//   - An external cron (cron-job.org) every 10 min
//   - Webhook handlers (later)

import { jobberQuery, JobberDisconnectedError } from '../lib/jobberClient.js';
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js';

// ── Helpers ─────────────────────────────────────────────────────────

function formatAddress(addr) {
  if (!addr) return null;
  return [addr.street1, addr.street2, addr.city, addr.province, addr.postalCode]
    .filter(Boolean)
    .join(', ') || null;
}

async function getSyncCursor(supabase, key) {
  const { data } = await supabase.from('hub_sync_state').select('value').eq('key', key).maybeSingle();
  return data?.value?.last_synced_at || null;
}

async function setSyncCursor(supabase, key, isoString) {
  await supabase
    .from('hub_sync_state')
    .upsert({ key, value: { last_synced_at: isoString } }, { onConflict: 'key' });
}

// ── Jobber: clients → contacts ──────────────────────────────────────

const JOBBER_CLIENTS_QUERY = `
  query SyncClients($cursor: String) {
    clients(first: 50, after: $cursor) {
      nodes {
        id firstName lastName companyName
        phones { number }
        emails { address }
        billingAddress { street1 street2 city province postalCode }
      }
      pageInfo { endCursor hasNextPage }
    }
  }
`;

async function syncJobberClients(supabase) {
  let cursor = null;
  let totalUpserted = 0;
  let pages = 0;

  do {
    const data = await jobberQuery(JOBBER_CLIENTS_QUERY, { cursor });
    const nodes = data.clients?.nodes || [];
    pages++;

    if (nodes.length > 0) {
      const rows = nodes.map((c) => {
        const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.companyName || 'Unknown';
        return {
          name,
          phone: c.phones?.[0]?.number || null,
          email: c.emails?.[0]?.address || null,
          address_line1: c.billingAddress?.street1 || null,
          address_city: c.billingAddress?.city || null,
          address_state: c.billingAddress?.province || null,
          address_zip: c.billingAddress?.postalCode || null,
          jobber_client_id: c.id,
        };
      });

      const { error } = await supabase
        .from('contacts')
        .upsert(rows, { onConflict: 'jobber_client_id', ignoreDuplicates: false });
      if (error) throw new Error(`contacts upsert failed: ${error.message}`);
      totalUpserted += rows.length;
    }

    cursor = data.clients?.pageInfo?.hasNextPage ? data.clients.pageInfo.endCursor : null;
    // Pace pagination so Jobber doesn't throttle the sync mid-run.
    if (cursor) await new Promise((r) => setTimeout(r, 600));
  } while (cursor);

  await setSyncCursor(supabase, 'jobber_clients_last_sync', new Date().toISOString());
  return { upserted: totalUpserted, pages };
}

// ── Jobber: visits + parent jobs ────────────────────────────────────

// IMPORTANT: assignedUsers is excluded — Jobber throttles aggressively on that nested query.
// Assignments are fetched in a separate, smaller follow-up pass.
const JOBBER_VISITS_QUERY = `
  query SyncVisits($cursor: String, $startISO: ISO8601DateTime!, $endISO: ISO8601DateTime!) {
    visits(
      first: 50
      after: $cursor
      filter: { startAt: { after: $startISO, before: $endISO } }
    ) {
      nodes {
        id title startAt endAt completedAt
        property { address { street1 street2 city province postalCode } }
        job {
          id jobNumber jobType jobStatus title
          client { id firstName lastName companyName }
        }
      }
      pageInfo { endCursor hasNextPage }
    }
  }
`;

async function syncJobberVisits(supabase, sinceDays = 60, untilDays = 90) {
  // Window: from `sinceDays` ago to `untilDays` from now. Covers history + future schedule.
  const now = new Date();
  const startISO = new Date(now.getTime() - sinceDays * 86400000).toISOString();
  const endISO = new Date(now.getTime() + untilDays * 86400000).toISOString();

  let cursor = null;
  let totalVisits = 0;
  let totalJobs = 0;
  let totalAssignments = 0;
  let pages = 0;

  // Cache contact lookups to avoid spamming Supabase mid-loop
  const contactByJobberId = new Map();
  const ensureContact = async (jobberClient) => {
    if (!jobberClient?.id) return null;
    if (contactByJobberId.has(jobberClient.id)) return contactByJobberId.get(jobberClient.id);
    const name = [jobberClient.firstName, jobberClient.lastName].filter(Boolean).join(' ') || jobberClient.companyName || 'Unknown';
    const { data: existing } = await supabase
      .from('contacts')
      .select('id')
      .eq('jobber_client_id', jobberClient.id)
      .maybeSingle();
    let contactId = existing?.id || null;
    if (!contactId) {
      const { data: inserted, error } = await supabase
        .from('contacts')
        .upsert({ name, jobber_client_id: jobberClient.id }, { onConflict: 'jobber_client_id' })
        .select('id')
        .single();
      if (error) throw new Error(`contact upsert failed for ${jobberClient.id}: ${error.message}`);
      contactId = inserted.id;
    }
    contactByJobberId.set(jobberClient.id, contactId);
    return contactId;
  };

  // Cache job lookups too
  const jobBySourceId = new Map();
  const ensureJob = async (jobberJob, contactId) => {
    if (!jobberJob?.id) return null;
    if (jobBySourceId.has(jobberJob.id)) return jobBySourceId.get(jobberJob.id);
    const typeMap = { ONE_OFF: 'one_off', RECURRING: 'recurring' };
    const statusMap = { ACTIVE: 'active', ARCHIVED: 'archived', LATE: 'active', UPCOMING: 'active', TODAY: 'active', ACTION_REQUIRED: 'active', ON_HOLD: 'active', UNSCHEDULED: 'active', REQUIRES_INVOICING: 'completed', LATE_TO_INVOICE: 'completed', INVOICED: 'completed' };
    const row = {
      contact_id: contactId,
      title: jobberJob.title || null,
      type: typeMap[jobberJob.jobType] || 'one_off',
      status: statusMap[jobberJob.jobStatus] || 'active',
      job_number: jobberJob.jobNumber ? String(jobberJob.jobNumber) : null,
      source: 'jobber',
      source_id: jobberJob.id,
    };
    const { data, error } = await supabase
      .from('hub_jobs')
      .upsert(row, { onConflict: 'source,source_id' })
      .select('id')
      .single();
    if (error) throw new Error(`hub_jobs upsert failed for ${jobberJob.id}: ${error.message}`);
    jobBySourceId.set(jobberJob.id, data.id);
    totalJobs++;
    return data.id;
  };

  do {
    const data = await jobberQuery(JOBBER_VISITS_QUERY, { cursor, startISO, endISO });
    const nodes = data.visits?.nodes || [];
    pages++;

    for (const v of nodes) {
      const contactId = await ensureContact(v.job?.client);
      const jobId = await ensureJob(v.job, contactId);

      const visitRow = {
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
      const { error: visitErr } = await supabase
        .from('hub_visits')
        .upsert(visitRow, { onConflict: 'source,source_id' });
      if (visitErr) throw new Error(`hub_visits upsert failed for ${v.id}: ${visitErr.message}`);
      totalVisits++;
    }

    cursor = data.visits?.pageInfo?.hasNextPage ? data.visits.pageInfo.endCursor : null;
    if (cursor) await new Promise((r) => setTimeout(r, 600));
  } while (cursor);

  await setSyncCursor(supabase, 'jobber_visits_last_sync', new Date().toISOString());
  return { visits: totalVisits, jobs: totalJobs, assignments: totalAssignments, pages, range: { from: startISO, to: endISO } };
}

// ── Router ──────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Use GET or POST' });
  }
  const source = (req.query.source || 'jobber').toLowerCase();
  const entity = (req.query.entity || 'all').toLowerCase();

  if (source !== 'jobber') {
    return res.status(400).json({ error: `Unknown source "${source}". Only "jobber" supported today.` });
  }

  const supabase = getSupabaseAdmin();
  const startedAt = Date.now();
  const result = {};

  try {
    if (entity === 'clients' || entity === 'all') {
      result.clients = await syncJobberClients(supabase);
    }
    if (entity === 'visits' || entity === 'all') {
      const sinceDays = parseInt(req.query.sinceDays || '60', 10);
      const untilDays = parseInt(req.query.untilDays || '90', 10);
      result.visits = await syncJobberVisits(supabase, sinceDays, untilDays);
    }
    result.durationMs = Date.now() - startedAt;
    return res.json({ ok: true, source, entity, ...result });
  } catch (err) {
    console.error('[hub-sync]', err.message);
    if (err instanceof JobberDisconnectedError || err.code === 'JOBBER_DISCONNECTED') {
      return res.status(401).json({ ok: false, error: err.message, code: 'JOBBER_DISCONNECTED' });
    }
    return res.status(500).json({ ok: false, error: err.message, partial: result });
  }
}
