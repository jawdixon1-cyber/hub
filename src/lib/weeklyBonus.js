/* ─── Weekly bonus math ───
 * Pure functions, no I/O. Minutes in, dollars out.
 *
 * Every week: labor % = production wages ÷ (revenue − COGS). Under the
 * target, the gap is a pool split by production minutes. Hours on unfinished
 * jobs are paid but held out of that math.
 *
 * An unfinished job carries per-person minutes, COGS and payments week to week. The week
 * it's done it gets its own calc over every week it touched (same rule), and
 * its pool is split by each person's minutes on the job. Rates come from the
 * week row's snapshot so old weeks never move. */

const r2 = (n) => Math.round(n * 100) / 100;
const wage = (minutes, rate) => (minutes / 60) * rate;
// Overtime: hours past 40 in the week are paid at time and a half.
export const OT_AFTER_MINUTES = 40 * 60;
const payHours = (minutes) => Math.round((minutes / 60) * 100) / 100; // payroll hours, 2 decimals

/* ─── Christmas lights ───
 * Lights work is paid on its own plan and kept out of the lawn bonus entirely:
 *  - every lights hour is paid at the person's normal rate (install, takedown, service, training);
 *  - each day, completed INSTALL value picks a tier (whole day's value × %), and that
 *    crew pool is split by each person's lights hours that day;
 *  - the working lead (Ethan) gets another 1% of the day's install value.
 * A job line is lights if its title says light(s)/lite(s); takedown/removal/service
 * lines are lights hours but not install value. Each day's tier resets. */
// First week (by week-ending date) on this plan. Earlier weeks keep their original math, so paid weeks never move.
export const LIGHTS_PLAN_FROM = '2026-11-07';
export const LIGHTS_LEAD_PCT = 0.01;
// Labor targets, as a share of the season's install value: installs 14%, removal 6% (20% all-in, per the guide).
export const LIGHTS_INSTALL_TARGET = 0.14;
export const LIGHTS_REMOVAL_TARGET = 0.06;
export const LIGHTS_TIERS = [[5000, 0.05], [4000, 0.03], [3000, 0.02], [2000, 0.01]];
export const LIGHTS_LEAD = /^ethan\b/i;
export const isLightsJob = (name) => /\b(lights?|lites?)\b/i.test(name || '');
export const isLightsInstall = (name) => isLightsJob(name) && !/\b(remov\w*|take ?downs?|takedowns?|service|repairs?)\b/i.test(name || '');
export const lightsTier = (value) => LIGHTS_TIERS.find(([min]) => value >= min)?.[1] || 0;
export const nextLightsTier = (value) => [...LIGHTS_TIERS].reverse().find(([min]) => value < min) || null;

/** Lights math for each day of a week row. `leadId` = the working lead's person id. */
export function computeLights(days, leadId) {
  const out = [];
  for (const [d, day] of Object.entries(days || {}).sort(([a], [b]) => a.localeCompare(b))) {
    const jobs = (day.jobs || []).filter((j) => isLightsJob(j.name));
    const mins = Object.fromEntries(Object.entries(day.lights_minutes || {}).map(([pid, m]) => [pid, Number(m) || 0]).filter(([, m]) => m > 0));
    if (!jobs.length && !Object.keys(mins).length) continue;
    const revenue = r2(jobs.reduce((s, j) => s + (Number(j.revenue) || 0), 0));
    const cogs = r2(jobs.reduce((s, j) => s + (Number(j.cogs) || 0), 0));
    const install = r2(jobs.filter((j) => isLightsInstall(j.name)).reduce((s, j) => s + (Number(j.revenue) || 0), 0));
    const minutes = Object.values(mins).reduce((s, m) => s + m, 0);
    const pct = lightsTier(install);
    const pool = r2(install * pct);
    const shares = splitPool(pool, mins);
    const leadWorked = !!(leadId && mins[leadId]);
    const lead = leadWorked ? r2(install * LIGHTS_LEAD_PCT) : 0;
    const warnings = [];
    if (install > 0 && !minutes) warnings.push('Enter who worked lights this day: the bonus is split by lights hours.');
    if (install > 0 && minutes && !leadWorked) warnings.push(leadId ? 'Ethan has no lights hours this day, so no lead bonus.' : 'No team member named Ethan, so no lead bonus.');
    // A day with any install value is an install day; lights hours with no install (takedown, service) are removal.
    out.push({ date: d, kind: install > 0 ? 'install' : 'removal', jobs: jobs.map((j) => j.name), revenue, cogs, install, minutes, byPerson: mins, pct, pool, shares, leadId: leadWorked ? leadId : null, lead, warnings });
  }
  return out;
}

/** Split `pool` by `weights` ({id: minutes}); last share absorbs rounding. */
export function splitPool(pool, weights) {
  const ids = Object.keys(weights).filter((id) => weights[id] > 0);
  const total = ids.reduce((s, id) => s + weights[id], 0);
  if (pool <= 0 || total <= 0) return {};
  const out = {}; let given = 0;
  ids.forEach((id, i) => {
    const share = i === ids.length - 1 ? r2(pool - given) : r2((pool * weights[id]) / total);
    out[id] = share; given += share;
  });
  return out;
}

/** Bonus pool for one bucket of work. */
export function bonusFor({ revenue, cogs, prodWages, targetPct }) {
  const margin = revenue - cogs;
  const laborPct = margin > 0 ? prodWages / margin : null;
  const pool = margin > 0 ? Math.max(0, r2(margin * (targetPct / 100) - prodWages)) : 0;
  return { revenue, cogs, margin, prodWages: r2(prodWages), laborPct, pool, under: laborPct != null && laborPct <= targetPct / 100 };
}

/** Rate for a person in a given week: the week row's snapshot, else current. */
function rateFor(weeks, people, weekEnding, pid) {
  const snap = weeks[weekEnding]?.people?.[pid]?.rate;
  if (snap != null) return Number(snap) || 0;
  return Number(people.find((p) => p.id === pid)?.hourly_rate) || 0;
}

/** Full calc for a job across every week it touched. */
export function computeJob(job, { weeks, people, targetPct }) {
  const byPerson = {}; let prodWages = 0, cogs = 0, minutes = 0, paid = 0;
  const perWeek = [];
  for (const [w, h] of Object.entries(job.holds || {})) {
    let wMin = 0, wWages = 0;
    for (const [pid, m] of Object.entries(h.people || {})) {
      const min = Number(m) || 0; if (!min) continue;
      const wg = wage(min, rateFor(weeks, people, w, pid));
      byPerson[pid] = { minutes: (byPerson[pid]?.minutes || 0) + min, wages: (byPerson[pid]?.wages || 0) + wg };
      wMin += min; wWages += wg;
    }
    const c = Number(h.cogs) || 0, pd = Number(h.revenue) || 0;
    perWeek.push({ week_ending: w, minutes: wMin, wages: r2(wWages), cogs: c, paid: pd });
    prodWages += wWages; cogs += c; minutes += wMin; paid += pd;
  }
  // Job revenue = everything paid on it across the weeks (+ any legacy lump on the row).
  const revenue = r2(paid + (Number(job.revenue) || 0));
  const calc = bonusFor({ revenue, cogs, prodWages, targetPct });
  const shares = splitPool(calc.pool, Object.fromEntries(Object.entries(byPerson).map(([pid, v]) => [pid, v.minutes])));
  // Revenue share per week, pro-rata by minutes — for the records, not the payout.
  perWeek.sort((a, b) => a.week_ending.localeCompare(b.week_ending));
  for (const pw of perWeek) pw.revenueShare = minutes > 0 ? r2((revenue * pw.minutes) / minutes) : 0;
  return { id: job.id, name: job.name, done: !!job.done_week, done_week: job.done_week, ...calc, minutes, byPerson, shares, perWeek };
}

/**
 * Everything for one week.
 * @param weekEnding  'YYYY-MM-DD'
 * @param row         the weekly_log row for this week (may be null/partial)
 * @param weeks       { week_ending: row } for rate snapshots of past weeks
 * @param people      current people list [{id, name, hourly_rate, active}]
 * @param jobs        all weekly_log_jobs rows
 * @param targetPct   e.g. 30
 */
export function computeWeek({ weekEnding, row, weeks, people, jobs, targetPct, feePct = 0 }) {
  const days = row?.days || {};
  const revenue = Object.values(days).reduce((s, d) => s + (Number(d.revenue) || 0), 0);
  // Processing fees are built into our prices, so they count in COGS as a % of finished revenue.
  const fees = r2(revenue * (Number(feePct) || 0) / 100);
  const cogs = Object.values(days).reduce((s, d) => s + (Number(d.cogs) || 0), 0) + fees;

  // Christmas lights come out of the lawn math: their revenue, COGS (and fees) and hours.
  const leadId = [...people, ...Object.entries(row?.people || {}).map(([id, e]) => ({ id, name: e.name }))].find((p) => LIGHTS_LEAD.test(p.name || ''))?.id || null;
  const lightsDays = weekEnding >= LIGHTS_PLAN_FROM ? computeLights(days, leadId) : [];
  const lightsRevenue = r2(lightsDays.reduce((s, x) => s + x.revenue, 0));
  const lightsCogs = r2(lightsDays.reduce((s, x) => s + x.cogs, 0));
  const lawnRevenue = r2(revenue - lightsRevenue);
  const lawnFees = r2(lawnRevenue * (Number(feePct) || 0) / 100);
  const lawnCogs = r2(cogs - fees - lightsCogs + lawnFees);
  const lightsBonusOf = (pid) => r2(lightsDays.reduce((s, x) => s + (x.shares[pid] || 0), 0));
  const leadBonusOf = (pid) => r2(lightsDays.reduce((s, x) => s + (x.leadId === pid ? x.lead : 0), 0));

  // Hours on unfinished jobs this week, per person (paid, but not production).
  const jobMinutes = {};
  for (const j of jobs) for (const [pid, m] of Object.entries(j.holds?.[weekEnding]?.people || {})) jobMinutes[pid] = (jobMinutes[pid] || 0) + (Number(m) || 0);

  // Current roster, plus anyone who only exists in this week's snapshot (left the team since).
  const snapOnly = Object.entries(row?.people || {}).filter(([pid]) => !people.some((p) => p.id === pid)).map(([pid, e]) => ({ id: pid, name: e.name || pid, hourly_rate: e.rate, active: false }));
  const rows = [...people.filter((p) => p.active || row?.people?.[p.id]), ...snapOnly].map((p) => {
    const e = row?.people?.[p.id] || {};
    const rate = e.rate != null ? Number(e.rate) : Number(p.hourly_rate) || 0;
    const prod = Number(e.prod_minutes) || 0, np = Number(e.np_minutes) || 0, onJobs = jobMinutes[p.id] || 0;
    // Lights hours: saved on the person, else summed from the days.
    const lights = e.lights_minutes != null ? Number(e.lights_minutes) || 0 : Object.values(days).reduce((s, d) => s + (Number(d.lights_minutes?.[p.id]) || 0), 0);
    const total = prod + np + onJobs + lights;
    const otH = payHours(Math.max(0, total - OT_AFTER_MINUTES));
    const base = { id: p.id, name: p.name, rate, prod_minutes: prod, np_minutes: np, job_minutes: onJobs, lights_minutes: lights, total_minutes: total,
      ot_minutes: Math.max(0, total - OT_AFTER_MINUTES), prod_wages: r2(wage(prod, rate)), lights_bonus: lightsBonusOf(p.id), lead_bonus: leadBonusOf(p.id) };
    if (!lights) {
      // Pay is figured the way ADP does it: hours rounded to 2 decimals, regular
      // up to 40 at the rate, the rest at time and a half. The OT premium stays
      // out of production wages so overtime never shrinks the bonus.
      const regH = payHours(Math.min(total, OT_AFTER_MINUTES));
      const regPay = r2(regH * rate), otPay = r2(otH * rate * 1.5);
      return { ...base, reg_hours: regH, ot_hours: otH, reg_pay: regPay, ot_pay: otPay, ot_premium: r2(otH * rate * 0.5), lights_hours: 0, lights_pay: 0, other_hours: payHours(total), wages: r2(regPay + otPay) };
    }
    // Lights hours are paid at the person's normal rate, so pay is the usual regular + OT. The lights
    // bonus is a promised formula bonus, so it raises the overtime rate: OT hours also get half of
    // (lights bonus ÷ all hours) on top — usually a few dollars, and only in a week past 40.
    const totalH = payHours(total), regH = payHours(Math.min(total, OT_AFTER_MINUTES));
    const regPay = r2(regH * rate), otPay = r2(otH * rate * 1.5);
    const lightsBonus = base.lights_bonus + base.lead_bonus;
    const bonusOt = totalH > 0 && otH > 0 ? r2(otH * 0.5 * (lightsBonus / totalH)) : 0;
    return { ...base, reg_hours: regH, ot_hours: otH, reg_pay: regPay, ot_pay: otPay, ot_premium: r2(otH * rate * 0.5), bonus_ot: bonusOt,
      lights_hours: payHours(lights), lights_pay: r2(wage(lights, rate)), other_hours: r2(totalH - payHours(lights)), regular_rate: totalH > 0 ? r2(rate + lightsBonus / totalH) : rate,
      wages: r2(regPay + otPay + bonusOt) };
  });

  const week = bonusFor({ revenue: lawnRevenue, cogs: lawnCogs, prodWages: rows.reduce((s, p) => s + p.prod_wages, 0), targetPct });
  const weekShares = splitPool(week.pool, Object.fromEntries(rows.map((p) => [p.id, p.prod_minutes])));

  const doneJobs = jobs.filter((j) => j.done_week === weekEnding).map((j) => computeJob(j, { weeks, people, targetPct }));
  const openJobs = jobs.filter((j) => !j.done_week || j.done_week > weekEnding).filter((j) => j.opened_week <= weekEnding).map((j) => computeJob(j, { weeks, people, targetPct }));

  for (const p of rows) {
    p.week_bonus = weekShares[p.id] || 0;
    p.job_bonus = r2(doneJobs.reduce((s, j) => s + (j.shares[p.id] || 0), 0));
    // Extra bonuses (reviews etc.) are added by hand; they're pay, not production labor.
    p.extras = (row?.people?.[p.id]?.extras || []).filter((e) => Number(e.amount));
    p.extra_bonus = r2(p.extras.reduce((s, e) => s + Number(e.amount), 0));
    p.bonus = r2(p.week_bonus + p.job_bonus + p.extra_bonus + p.lights_bonus + p.lead_bonus);
    p.total_pay = r2(p.wages + p.bonus);
  }
  const sum = (k) => r2(rows.reduce((s, p) => s + p[k], 0));
  // What each lights day cost in pay (hours at each person's rate + crew bonus + lead), install vs removal.
  const rateOf = (pid) => rows.find((p) => p.id === pid)?.rate || 0;
  for (const x of lightsDays) x.labor = r2(Object.entries(x.byPerson).reduce((s, [pid, m]) => s + wage(m, rateOf(pid)), 0) + x.pool + x.lead);
  const lightsLaborOf = (kind) => r2(lightsDays.filter((x) => x.kind === kind).reduce((s, x) => s + x.labor, 0));
  const jobsRevenue = r2(doneJobs.reduce((s, j) => s + j.revenue, 0));
  const jobsCogs = r2(doneJobs.reduce((s, j) => s + j.cogs, 0));
  const jobsProdWages = r2(doneJobs.reduce((s, j) => s + j.prodWages, 0));
  const lightsPay = sum('lights_pay');
  return {
    weekEnding, targetPct, feePct: Number(feePct) || 0, fees, lawnFees, revenue, cogs, people: rows, week, weekShares, doneJobs, openJobs,
    lights: { days: lightsDays, leadId, revenue: lightsRevenue, cogs: lightsCogs, install: r2(lightsDays.reduce((s, x) => s + x.install, 0)),
      pool: r2(lightsDays.reduce((s, x) => s + x.pool, 0)), lead: r2(lightsDays.reduce((s, x) => s + x.lead, 0)), minutes: rows.reduce((s, p) => s + p.lights_minutes, 0), pay: lightsPay },
    totals: {
      revenue: r2(revenue + jobsRevenue), cogs: r2(cogs + jobsCogs), jobsRevenue, jobsCogs, jobsProdWages,
      all_prod_wages: r2(rows.reduce((s, p) => s + p.prod_wages, 0) + jobsProdWages + lightsPay), // week + finished jobs + lights hourly, for all-in labor %
      lights_minutes: rows.reduce((s, p) => s + p.lights_minutes, 0), lights_pay: lightsPay, lights_bonus: sum('lights_bonus'), lead_bonus: sum('lead_bonus'),
      // Lawn only (lights taken out) — what the labor % and the past-weeks chart compare to the target.
      lawn_revenue: r2(lawnRevenue + jobsRevenue), lawn_cogs: r2(lawnCogs + jobsCogs), lawn_prod_wages: r2(rows.reduce((s, p) => s + p.prod_wages, 0) + jobsProdWages),
      // Lights on their own: money in, and everything paid for it (hourly + crew bonus + lead bonus).
      lights_revenue: lightsRevenue, lights_cogs: lightsCogs, lights_labor: r2(lightsPay + sum('lights_bonus') + sum('lead_bonus')),
      lights_install: r2(lightsDays.reduce((s, x) => s + x.install, 0)), lights_install_labor: lightsLaborOf('install'), lights_removal_labor: lightsLaborOf('removal'),
      prod_minutes: rows.reduce((s, p) => s + p.prod_minutes, 0), np_minutes: rows.reduce((s, p) => s + p.np_minutes, 0),
      job_minutes: rows.reduce((s, p) => s + p.job_minutes, 0), total_minutes: rows.reduce((s, p) => s + p.total_minutes, 0),
      np_wages: r2(rows.reduce((s, p) => s + wage(p.np_minutes, p.rate), 0)), // non-prod hours at each person's rate (shop, errands — work you assign)
      wages: sum('wages'), prod_wages: sum('prod_wages'), week_bonus: sum('week_bonus'), job_bonus: sum('job_bonus'), extra_bonus: sum('extra_bonus'), bonus: sum('bonus'), total_pay: sum('total_pay'),
      employer_taxes: r2(Number(row?.employer_taxes) || 0),
    },
  };
}
