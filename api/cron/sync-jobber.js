// Hourly safety-net Jobber sync.
// Webhooks handle near-real-time updates; this cron catches anything missed
// (webhook failed, Jobber was disconnected briefly, signature mismatch, etc).
// Window is intentionally narrow — webhooks cover the rest.

import { getSupabaseAdmin } from '../../lib/supabaseAdmin.js';
import { syncJobberVisits, refreshLaborAggregates, syncJobberClients } from '../jobber-data.js';
import { JobberDisconnectedError } from '../../lib/jobberClient.js';

export default async function handler(req, res) {
  // Nightly: catch up any client changed in Jobber in the last ~day that a webhook missed (always on).
  let clients = null;
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'unauthorized' });
  try { clients = await syncJobberClients(getSupabaseAdmin(), new Date(Date.now() - 26 * 3600e3).toISOString()); }
  catch (err) { clients = { error: err.message }; }
  // Jobber sync is paused — Boost is now the source of truth for clients/jobs.
  // To re-enable, remove this guard and put the cron back in vercel.json.
  if (process.env.JOBBER_SYNC_ENABLED !== 'true') {
    return res.status(200).json({ clients, visits: { paused: true } });
  }
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const supabase = getSupabaseAdmin();
  const startedAt = Date.now();
  const out = {};
  try {
    // Tight window — webhooks handle real-time, this just catches stragglers.
    out.visits = await syncJobberVisits(supabase, 7, 14);
  } catch (err) {
    console.error('[Cron] visit sync failed:', err.message);
    if (err instanceof JobberDisconnectedError || err.code === 'JOBBER_DISCONNECTED') {
      return res.status(200).json({ ok: false, error: 'jobber disconnected', skip: true });
    }
    return res.status(500).json({ ok: false, error: err.message });
  }
  // Labor aggregates refresh — keeps Recurring Clients page Labor % current.
  // Failures here don't block the visit sync result.
  try {
    out.labor = await refreshLaborAggregates(supabase, 90);
  } catch (err) {
    console.warn('[Cron] labor aggregate refresh failed:', err.message);
    out.labor = { error: err.message, code: err.code };
  }
  const ms = Date.now() - startedAt;
  console.log(`[Cron] Jobber sync done in ${ms}ms`, out);
  return res.json({ ok: true, ...out, durationMs: ms });
}
