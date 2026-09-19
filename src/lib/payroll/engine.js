/* ─── Payroll engine ───
 *
 * One pure function: computeWeek(input) → result. No I/O, no dates from the
 * clock, integer cents throughout. The UI and the tests both call this, so
 * what you see on screen is exactly what gets snapshotted at finalize.
 *
 * The two rules everything else hangs off:
 *   1. Base pay follows the week the hours were worked.
 *   2. Bonus accounting follows the job until the job is complete.
 *
 * Mismatch guard: eligible labor is DERIVED from the eligible job set. There
 * is no code path where a job's revenue enters the pool without its labor, or
 * its labor without its revenue.
 */

import { toCents, toHundredths, laborCents, pctToBps, applyBps, allocate } from './money.js';

/**
 * @typedef {Object} Employee   { id, name, active, hourly_rate }
 * @typedef {Object} Job        { id, name, revenue, cog, status:'wip'|'complete', completed_on, bonus_week_ending, bonus_processed_run_id }
 * @typedef {Object} TimeEntry  { id, employee_id, job_id, worked_on, week_ending, hours, kind:'production'|'non_production', hourly_rate_snapshot }
 * @typedef {Object} PayItem    { id, employee_id, type, amount, description, week_ending, paid_run_id }
 * @typedef {Object} Settings   { target_pct, allocation_method }
 */

export const BONUS_TYPES = ['review_bonus', 'referral_bonus', 'performance_bonus', 'other_bonus'];
export const PAY_ITEM_LABELS = {
  review_bonus: 'Review Bonus',
  referral_bonus: 'Referral Bonus',
  performance_bonus: 'Performance Bonus',
  other_bonus: 'Other Bonus',
  reimbursement: 'Reimbursement',
  correction: 'Correction / Adjustment',
};

/**
 * @param {Object} p
 * @param {string} p.weekEnding  'YYYY-MM-DD'
 * @param {string|null} [p.runId]  current run id, so jobs already stamped by THIS run stay eligible
 * @param {Employee[]} p.employees
 * @param {Job[]} p.jobs
 * @param {TimeEntry[]} p.timeEntries  every entry the org has (engine filters)
 * @param {PayItem[]} p.payItems       every item the org has (engine filters)
 * @param {Settings} p.settings
 */
export function computeWeek({ weekEnding, runId = null, employees, jobs, timeEntries, payItems, settings }) {
  const targetBps = pctToBps(settings?.target_pct ?? 30);
  const empById = new Map(employees.map((e) => [e.id, e]));
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const warnings = [];

  // ── 1. Base pay: every entry in this week, every kind, every job status ──
  const weekEntries = timeEntries.filter((t) => t.week_ending === weekEnding);
  const perEmp = new Map(); // employee_id → accumulator
  const acc = (id) => {
    if (!perEmp.has(id)) {
      const e = empById.get(id);
      perEmp.set(id, {
        employee_id: id, name: e?.name ?? '(unknown employee)', active: e?.active ?? false,
        hourly_rate: toCents(e?.hourly_rate),
        production_hours: 0, non_production_hours: 0, base_wages: 0,
        eligible_hours: 0, eligible_labor: 0, production_bonus: 0,
        other_bonuses: 0, corrections: 0, reimbursements: 0, items: [],
        gross: 0, payout: 0, flags: [],
      });
    }
    return perEmp.get(id);
  };
  for (const t of weekEntries) {
    const a = acc(t.employee_id);
    const hh = toHundredths(t.hours);
    const rate = toCents(t.hourly_rate_snapshot);
    if (t.kind === 'production') a.production_hours += hh; else a.non_production_hours += hh;
    a.base_wages += laborCents(hh, rate);
    if (rate === 0) a.flags.push('Entry with $0 rate');
    if (t.kind === 'production' && !t.job_id) warnings.push({ level: 'warn', code: 'prod_no_job', msg: `${a.name}: production hours with no job (${t.worked_on})` });
    if (!t.kind) warnings.push({ level: 'error', code: 'no_kind', msg: `${a.name}: time entry missing production/non-production (${t.worked_on})` });
    if (empById.get(t.employee_id)?.active === false) warnings.push({ level: 'warn', code: 'inactive_emp', msg: `${a.name} is inactive but has hours this week` });
  }
  // employees active but with zero hours this week still appear (flagged)
  for (const e of employees) if (e.active && !perEmp.has(e.id)) { acc(e.id).flags.push('0 hours this week'); }

  // ── 2. Eligible job set: complete, bonus week ≤ this week, not consumed by another run ──
  const eligibleJobs = jobs.filter((j) =>
    j.status === 'complete'
    && j.bonus_week_ending && j.bonus_week_ending <= weekEnding
    && (!j.bonus_processed_run_id || j.bonus_processed_run_id === runId));
  const carriedForward = eligibleJobs.filter((j) => j.bonus_week_ending < weekEnding);
  for (const j of carriedForward) warnings.push({ level: 'info', code: 'carried_forward', msg: `"${j.name}" was completed week of ${j.bonus_week_ending} but never run — its bonus is included now` });

  // ── 3. Eligible labor: production entries on those jobs, ANY week ──
  const eligibleIds = new Set(eligibleJobs.map((j) => j.id));
  const eligibleEntries = timeEntries.filter((t) => t.kind === 'production' && t.job_id && eligibleIds.has(t.job_id));
  // guard — can't happen by construction, assert anyway
  for (const t of eligibleEntries) if (jobById.get(t.job_id)?.status !== 'complete') throw new Error('MISMATCH: WIP labor reached the bonus pool');

  const jobsOut = [];
  let completedRevenue = 0, completedCog = 0, eligibleLabor = 0, eligibleHours = 0;
  for (const j of eligibleJobs) {
    const rev = toCents(j.revenue), cog = toCents(j.cog), adj = rev - cog;
    const ents = eligibleEntries.filter((t) => t.job_id === j.id);
    let hh = 0, labor = 0;
    const byEmp = new Map();
    for (const t of ents) {
      const h = toHundredths(t.hours), c = laborCents(h, toCents(t.hourly_rate_snapshot));
      hh += h; labor += c;
      const b = byEmp.get(t.employee_id) || { employee_id: t.employee_id, name: empById.get(t.employee_id)?.name ?? '?', hours: 0, labor: 0, entries: [] };
      b.hours += h; b.labor += c; b.entries.push({ worked_on: t.worked_on, week_ending: t.week_ending, hours: h, rate: toCents(t.hourly_rate_snapshot), labor: c });
      byEmp.set(t.employee_id, b);
      const a = acc(t.employee_id); a.eligible_hours += h; a.eligible_labor += c;
    }
    const target = applyBps(adj, targetBps);
    const laborPctBps = adj > 0 ? Math.round((labor * 10000) / adj) : null;
    const contribution = Math.max(0, target - labor);
    if (rev === 0) warnings.push({ level: 'error', code: 'complete_no_revenue', msg: `"${j.name}" is complete with $0 revenue` });
    if (hh === 0) warnings.push({ level: 'warn', code: 'complete_no_hours', msg: `"${j.name}" is complete with no production hours` });
    completedRevenue += rev; completedCog += cog; eligibleLabor += labor; eligibleHours += hh;
    jobsOut.push({ id: j.id, name: j.name, revenue: rev, cog, adjusted: adj, hours: hh, labor, target, laborPctBps, beatTarget: labor < target, contribution, carriedForward: j.bonus_week_ending < weekEnding, employees: [...byEmp.values()] });
  }
  const completedAdjusted = completedRevenue - completedCog;
  const targetBudget = applyBps(completedAdjusted, targetBps);
  const laborPctBps = completedAdjusted > 0 ? Math.round((eligibleLabor * 10000) / completedAdjusted) : null;
  const pool = Math.max(0, targetBudget - eligibleLabor);

  // ── 4. WIP: held out, reported ──
  const wipJobs = jobs.filter((j) => j.status === 'wip');
  let wipRevenue = 0, wipCog = 0, wipHours = 0, wipLabor = 0;
  const wipOut = wipJobs.map((j) => {
    const ents = timeEntries.filter((t) => t.kind === 'production' && t.job_id === j.id);
    const hh = ents.reduce((s, t) => s + toHundredths(t.hours), 0);
    const labor = ents.reduce((s, t) => s + laborCents(toHundredths(t.hours), toCents(t.hourly_rate_snapshot)), 0);
    const rev = toCents(j.revenue), cog = toCents(j.cog);
    wipRevenue += rev; wipCog += cog; wipHours += hh; wipLabor += labor;
    return { id: j.id, name: j.name, revenue: rev, cog, adjusted: rev - cog, hours: hh, labor, started_on: j.started_on };
  });
  for (const j of jobs) if (!j.status) warnings.push({ level: 'error', code: 'job_no_status', msg: `"${j.name}" has no status` });
  for (const j of jobs) if (j.status === 'complete' && j.bonus_processed_run_id && j.bonus_processed_run_id !== runId && j.bonus_week_ending === weekEnding)
    warnings.push({ level: 'warn', code: 'already_processed', msg: `"${j.name}" bonus was already processed in another run — excluded` });

  // ── 5. Allocation ──
  const emps = [...perEmp.values()];
  const method = settings?.allocation_method || 'production_hours_share';
  const weights = emps.map((e) => (method === 'production_hours_share' ? e.eligible_hours : e.eligible_hours));
  const shares = allocate(pool, weights);
  emps.forEach((e, i) => { e.production_bonus = shares[i]; e.share_bps = eligibleHours > 0 ? Math.round((e.eligible_hours * 10000) / eligibleHours) : 0; });

  // ── 6. Pay items this week ──
  const weekItems = payItems.filter((p) => p.week_ending === weekEnding && (!p.paid_run_id || p.paid_run_id === runId));
  for (const p of weekItems) {
    const a = acc(p.employee_id); const amt = toCents(p.amount);
    if (!p.description) warnings.push({ level: 'warn', code: 'item_no_desc', msg: `${a.name}: ${PAY_ITEM_LABELS[p.type] || p.type} has no description` });
    if (p.type === 'reimbursement') a.reimbursements += amt;
    else if (p.type === 'correction') a.corrections += amt;
    else a.other_bonuses += amt;
    a.items.push({ id: p.id, type: p.type, amount: amt, description: p.description, item_date: p.item_date, reference: p.reference });
  }
  for (const p of payItems) if (p.week_ending === weekEnding && p.paid_run_id && p.paid_run_id !== runId)
    warnings.push({ level: 'warn', code: 'item_already_paid', msg: `A ${PAY_ITEM_LABELS[p.type]} for this week was already paid in another run — excluded` });

  // ── 7. Totals ──
  let totals = { production_hours: 0, non_production_hours: 0, base_wages: 0, production_bonus: 0, other_bonuses: 0, corrections: 0, reimbursements: 0, gross: 0, payout: 0 };
  for (const e of emps) {
    e.total_hours = e.production_hours + e.non_production_hours;
    e.gross = e.base_wages + e.production_bonus + e.other_bonuses + e.corrections;
    e.payout = e.gross + e.reimbursements;
    if (e.hourly_rate === 0 && e.total_hours > 0) e.flags.push('No hourly rate set');
    if (e.total_hours > 6000) e.flags.push('Over 60 hours');
    if (e.total_hours > 0 && e.total_hours < 400) e.flags.push('Under 4 hours');
    for (const k of Object.keys(totals)) totals[k] += e[k] ?? 0;
  }
  emps.sort((a, b) => a.name.localeCompare(b.name));

  return {
    weekEnding, targetBps, method,
    employees: emps,
    completed: { revenue: completedRevenue, cog: completedCog, adjusted: completedAdjusted, hours: eligibleHours, labor: eligibleLabor, laborPctBps, targetBudget, pool, jobs: jobsOut },
    wip: { count: wipJobs.length, revenue: wipRevenue, cog: wipCog, adjusted: wipRevenue - wipCog, hours: wipHours, labor: wipLabor, jobs: wipOut },
    totals,
    warnings,
    eligibleJobIds: [...eligibleIds],
    payItemIds: weekItems.map((p) => p.id),
  };
}

/** Finalization checklist keys, in order. Every one must be true to finalize. */
export const FINAL_CHECKLIST = [
  ['hours_reviewed', 'All employee hours reviewed'],
  ['hours_classified', 'Production vs non-production hours classified'],
  ['wip_reviewed', 'All WIP jobs reviewed'],
  ['complete_marked', 'All completed jobs marked complete'],
  ['revenue_entered', 'Revenue entered on every completed job'],
  ['cog_entered', 'COG entered on every completed job'],
  ['wip_excluded', 'WIP labor is not included in the bonus calculation'],
  ['carry_forward_ok', 'Prior-week WIP that completed this week is carried forward correctly'],
  ['bonus_math_reviewed', 'Production bonus math reviewed'],
  ['reviews_checked', 'Customer review bonuses checked'],
  ['reimbursements_checked', 'Reimbursements checked'],
  ['other_bonuses_checked', 'Referral / other bonuses checked'],
  ['rates_correct', 'Employee pay rates correct'],
  ['totals_reviewed', 'Final payroll totals reviewed'],
];

export const OTHER_PAY_CHECKLIST = [
  ['reviews', 'Checked customer reviews for employee bonuses'],
  ['reimbursements', 'Checked employee reimbursements'],
  ['referrals', 'Checked referral bonuses'],
  ['other', 'Checked other bonuses / incentives'],
  ['corrections', 'Checked payroll corrections from prior week'],
];

/** 'YYYY-MM-DD' of the week-ending day (0=Sun..6=Sat) on or after `dateStr`. */
export function weekEndingFor(dateStr, weekEndingDay = 0) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const diff = (weekEndingDay - dt.getUTCDay() + 7) % 7;
  dt.setUTCDate(dt.getUTCDate() + diff);
  return dt.toISOString().slice(0, 10);
}
export function addDaysISO(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d)); dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
