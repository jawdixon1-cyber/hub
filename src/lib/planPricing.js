/* ─── Maintenance plan pricing ───
 *
 * The visit is the atom. You price what a visit is worth; the monthly bill is
 * derived from it, never the other way round. That ordering is what makes the
 * per-visit value exact instead of a reverse-engineered average — which matters
 * because the bonus calc runs on it.
 *
 * Two plans:
 *   growing    — lawn + sticks + leaves + bed weeds, Mar 1–Nov 30, billed over 9 months
 *   yearRound  — lawn + sticks + leaves + bed weeds, billed over 12
 *
 * Sticks are included in every visit at no separate charge.
 *
 * The seasonal transfer: on a November visit the crew does leaves, not mowing.
 * So lawn and leaves are priced per visit but counted over their own seasons,
 * never stacked on the same visit. Price them the same and the blend collapses
 * to that one number, which is the flat-labor case Jude describes.
 */

/* A month is 4.333 weeks, not 4. Dividing a monthly price by 4 overstates every
 * visit by 8.3% and quietly inflates the bonus pool, so the visit counts here
 * are the real ones. */
const r2 = (n) => Math.round(n * 100) / 100;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export const VISITS = {
  yearRound: { weekly: 52, eow: 26, billingMonths: 12 },
  growing:   { weekly: 39, eow: 20, billingMonths: 9 },   // Mar 1–Nov 30 ≈ 39.3 weeks
};

/* Leaf season is 10 weeks: 10 weekly visits or 5 every-other-week ones.
 * Only year-round plans see them. */
export const DEFAULT_LEAF_VISITS = { weekly: 10, eow: 5 };

/* Growing season ends Nov 30, so it only gets the leaf weeks from mid-October
 * on — about 6 weekly or 3 every-other-week visits. */
export const DEFAULT_GROWING_LEAF_VISITS = { weekly: 6, eow: 3 };

/* Every-other-week mowing is two weeks of growth, so a visit costs 1.5× the
 * weekly price. You only ever enter the weekly price. */
export const EOW_MOW_MULTIPLIER = 1.5;

/* Bed weeds follow the same rule: two weeks of growth between EOW visits. */
export const EOW_WEED_MULTIPLIER = 1.5;

/* Bed weeding is priced off time, not a guess: bed sqft → minutes → labor $.
 * Both defaults are editable on the Plan tab and saved to quoting settings. */
export const DEFAULT_BED_RATE = 100;       // $ per man-hour
export const DEFAULT_BED_MIN_PER_1K = 10;  // minutes for one guy per 1,000 sqft of kept-up beds

/** Weekly per-visit bed weeding price, rounded up to the dollar. */
export function bedWeedsPerVisit(sqft, { rate = DEFAULT_BED_RATE, minPer1k = DEFAULT_BED_MIN_PER_1K } = {}) {
  const minutes = (num(sqft) / 1000) * num(minPer1k);
  return Math.ceil((minutes / 60) * num(rate));
}


/**
 * @param plan       'growing' | 'yearRound'
 * @param frequency  'weekly' | 'eow'
 * @param lawn       $ per weekly mowing visit (EOW visits are EOW_MOW_MULTIPLIER×)
 * @param leaves     $ per leaf visit (year-round only)
 * @param weeds      $ per weekly visit for bed weeds (EOW is EOW_WEED_MULTIPLIER×)
 * @param leafVisits override the leaf-visit count
 */
export function pricePlan({ plan = 'yearRound', frequency = 'weekly', lawn = 0, leaves = 0, weeds = 0, leafVisits } = {}) {
  const table = VISITS[plan] || VISITS.yearRound;
  const totalVisits = table[frequency] ?? table.weekly;
  const months = table.billingMonths;
  const eow = frequency === 'eow';
  const L = num(lawn) * (eow ? EOW_MOW_MULTIPLIER : 1), F = num(leaves), W = num(weeds) * (eow ? EOW_WEED_MULTIPLIER : 1);

  // Growing season only catches the front of leaf season (it ends Nov 30).
  const leafDefaults = plan === 'growing' ? DEFAULT_GROWING_LEAF_VISITS : DEFAULT_LEAF_VISITS;
  const leafN = Math.min(leafVisits == null ? (leafDefaults[frequency] ?? 0) : num(leafVisits), totalVisits);
  const mowN = totalVisits - leafN;

  const lawnTotal = r2(L * mowN);
  const leafTotal = r2(F * leafN);
  const weedTotal = r2(W * totalVisits);
  const annual = r2(lawnTotal + leafTotal + weedTotal);

  return {
    plan, frequency, totalVisits, months, mowVisits: mowN, leafVisits: leafN,
    perVisit: r2(annual / totalVisits),     // what one visit is worth — the bonus number
    monthly: r2(annual / months),
    annual,
    parts: { lawn: lawnTotal, leaves: leafTotal, weeds: weedTotal },
    flat: L === F,                           // same price both seasons → truly flat per visit
  };
}

/** What one visit of an existing monthly client is worth. The fix for ÷4 / ÷2. */
export function perVisitFromMonthly(monthly, frequency = 'weekly', plan = 'yearRound') {
  const table = VISITS[plan] || VISITS.yearRound;
  const visits = table[frequency] ?? table.weekly;
  if (!visits) return 0;
  return r2((num(monthly) * table.billingMonths) / visits);
}
