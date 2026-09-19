/* ─── Payroll data access ───
 * Thin Supabase wrappers. Every write goes through here so the UI never
 * builds queries. Amounts cross this boundary as dollars (numeric(10,2));
 * the engine works in cents. */

import { supabase } from '../supabase.js';
import { toDollars } from './money.js';

const T = {
  settings: 'payroll_settings', employees: 'payroll_employees', jobs: 'payroll_jobs',
  time: 'payroll_time_entries', items: 'payroll_pay_items', runs: 'payroll_runs', runEmps: 'payroll_run_employees',
};
const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

export async function loadAll(orgId) {
  const [settings, employees, jobs, timeEntries, payItems, runs] = await Promise.all([
    supabase.from(T.settings).select('*').eq('org_id', orgId).maybeSingle().then(ok),
    supabase.from(T.employees).select('*').eq('org_id', orgId).order('name').then(ok),
    supabase.from(T.jobs).select('*').eq('org_id', orgId).order('created_at', { ascending: false }).then(ok),
    supabase.from(T.time).select('*').eq('org_id', orgId).order('worked_on', { ascending: false }).then(ok),
    supabase.from(T.items).select('*').eq('org_id', orgId).order('item_date', { ascending: false }).then(ok),
    supabase.from(T.runs).select('*').eq('org_id', orgId).order('week_ending', { ascending: false }).then(ok),
  ]);
  return {
    settings: settings || { org_id: orgId, target_pct: 30, default_hourly_rate: 0, week_ending_day: 0, allocation_method: 'production_hours_share' },
    employees, jobs, timeEntries, payItems, runs,
  };
}

export const saveSettings = (orgId, patch) =>
  supabase.from(T.settings).upsert({ org_id: orgId, ...patch }, { onConflict: 'org_id' }).select().single().then(ok);

export const upsertEmployee = (orgId, e) =>
  supabase.from(T.employees).upsert({ ...e, org_id: orgId }).select().single().then(ok);

export const upsertJob = (orgId, j) =>
  supabase.from(T.jobs).upsert({ ...j, org_id: orgId }).select().single().then(ok);
export const deleteJob = (id) => supabase.from(T.jobs).delete().eq('id', id).then(ok);

export const upsertTimeEntry = (orgId, t) =>
  supabase.from(T.time).upsert({ ...t, org_id: orgId }).select().single().then(ok);
export const deleteTimeEntry = (id) => supabase.from(T.time).delete().eq('id', id).then(ok);

export const upsertPayItem = (orgId, p) =>
  supabase.from(T.items).upsert({ ...p, org_id: orgId }).select().single().then(ok);
export const deletePayItem = (id) => supabase.from(T.items).delete().eq('id', id).then(ok);

export const upsertRun = (orgId, r) =>
  supabase.from(T.runs).upsert({ ...r, org_id: orgId }, { onConflict: 'org_id,week_ending' }).select().single().then(ok);

export const loadRunEmployees = (runId) =>
  supabase.from(T.runEmps).select('*').eq('run_id', runId).order('employee_name').then(ok);

/**
 * Finalize: snapshot the engine result, freeze per-employee rows, stamp jobs
 * and pay items as consumed by this run. Done as sequential writes (Supabase
 * client has no multi-table transaction); order is chosen so a failure
 * part-way leaves the run still 'draft'.
 */
export async function finalizeRun(orgId, run, result, checklist) {
  const rows = result.employees.map((e) => ({
    run_id: run.id, org_id: orgId, employee_id: e.employee_id, employee_name: e.name,
    hourly_rate: toDollars(e.hourly_rate),
    production_hours: e.production_hours / 100, non_production_hours: e.non_production_hours / 100,
    base_wages: toDollars(e.base_wages), production_bonus: toDollars(e.production_bonus),
    other_bonuses: toDollars(e.other_bonuses), corrections: toDollars(e.corrections),
    reimbursements: toDollars(e.reimbursements), gross_compensation: toDollars(e.gross), total_payout: toDollars(e.payout),
    detail: e,
  }));
  await supabase.from(T.runEmps).delete().eq('run_id', run.id).then(ok);
  if (rows.length) await supabase.from(T.runEmps).insert(rows).then(ok);
  if (result.eligibleJobIds.length)
    await supabase.from(T.jobs).update({ bonus_processed_run_id: run.id }).in('id', result.eligibleJobIds).then(ok);
  if (result.payItemIds.length)
    await supabase.from(T.items).update({ paid_run_id: run.id }).in('id', result.payItemIds).then(ok);
  return supabase.from(T.runs).update({
    status: 'finalized', snapshot: result, checklist, finalized_at: new Date().toISOString(),
    target_pct: result.targetBps / 100, allocation_method: result.method,
  }).eq('id', run.id).select().single().then(ok);
}

/** Reopen: un-stamp jobs and items so they're eligible again; keep the old snapshot for audit. */
export async function reopenRun(run) {
  await supabase.from(T.jobs).update({ bonus_processed_run_id: null }).eq('bonus_processed_run_id', run.id).then(ok);
  await supabase.from(T.items).update({ paid_run_id: null }).eq('paid_run_id', run.id).then(ok);
  return supabase.from(T.runs).update({ status: 'draft', reopened_at: new Date().toISOString() }).eq('id', run.id).select().single().then(ok);
}
