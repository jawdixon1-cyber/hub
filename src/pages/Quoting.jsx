import { useState, lazy, Suspense, useEffect } from 'react';
import {
  Calculator, Trash2, ChevronDown, ChevronUp, Save,
  Settings, Plus, X, ArrowLeft, ArrowRight, Trees, Mountain,
  Ruler, TreePine, Shrub, Fence, Scissors, Leaf, MapPin, CheckCircle, Loader2, FileText, CircleDot, CalendarDays, Sprout,
  Search, User, Phone, Mail, Database,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../store/AppStoreContext';
import { genId, initialQuotingSettings } from '../data';
import useAddressAutocomplete from '../components/PropertyMapper/useAddressAutocomplete';
import { getNetSqft } from '../components/PropertyMapper/mapUtils';

const MapView = lazy(() => import('../components/PropertyMapper/MapView'));
const MeasurementList = lazy(() => import('../components/PropertyMapper/MeasurementList'));

const TAX_RATE = 0.07;
const SQ_FT_PER_YD_AT_1IN = 324;
const CREW_HOUR_RATE = 160;

// ─── Service definitions ───

const SERVICE_SECTIONS = [
  {
    label: 'MAINTENANCE',
    services: [
      { id: 'lawn', label: 'Lawn Maintenance', icon: Sprout, color: 'green' },
      { id: 'bushes', label: 'Bushes', icon: Shrub, color: 'green' },
      { id: 'leafMaint', label: 'Leaf Maintenance', icon: Leaf, color: 'amber' },
    ],
  },
  {
    label: 'ONE-TIME / YEARLY',
    services: [
      { id: 'aeration', label: 'Aeration', icon: CircleDot, color: 'green' },
      { id: 'overgrownLawn', label: 'Overgrown Lawn', icon: Fence, color: 'orange' },
      { id: 'leafCleanup', label: 'Leaf Cleanup', icon: Leaf, color: 'amber' },
    ],
  },
  {
    label: 'GROUNDCOVER',
    services: [
      { id: 'mulch', label: 'Mulch', icon: Trees, color: 'emerald' },
      { id: 'rock', label: 'Rock', icon: Mountain, color: 'slate' },
      { id: 'pine', label: 'Pine Needles', icon: TreePine, color: 'amber' },
    ],
  },
  {
    label: 'LANDSCAPING SOLUTIONS',
    services: [
      { id: 'edging', label: 'Edging', icon: Ruler, color: 'blue' },
    ],
  },
];

const SERVICE_OPTIONS = SERVICE_SECTIONS.flatMap((s) => s.services);

// ─── Utility ───

function num(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function fmt(n) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getVolumeDiscount(cubicYards, tiers) {
  if (!tiers || tiers.length === 0) return 0;
  const sorted = [...tiers].sort((a, b) => b.minYards - a.minYards);
  for (const tier of sorted) {
    if (cubicYards >= tier.minYards) return tier.discountPct / 100;
  }
  return 0;
}

function getActiveTierLabel(cubicYards, tiers) {
  if (!tiers || tiers.length === 0) return null;
  const sorted = [...tiers].sort((a, b) => b.minYards - a.minYards);
  for (const tier of sorted) {
    if (cubicYards >= tier.minYards && tier.discountPct > 0) {
      return `${tier.discountPct}% volume discount (${tier.minYards}+ yards)`;
    }
  }
  return null;
}

const ZERO_CALC = { quote: 0, materialCostTotal: 0, delivery: 0, equipment: 0, cogs: 0, labor: 0, material: 0, tax: 0 };

// ─── Calc functions ───

const DELIVERY_PER_LOAD = 50;
const YARDS_PER_LOAD = 6;

function calcMulch(m) {
  const sqft = num(m.sqft);
  const depth = num(m.depth);
  const materialCostPerYd = num(m.materialCostPerYd);
  const chargePerYd = num(m.chargePerYd);
  const diffMult = { easy: 1.0, moderate: 1.1, hard: 1.4 }[m.difficulty] || 1.0;

  const cubicYardsRaw = (sqft * depth) / SQ_FT_PER_YD_AT_1IN;
  const cubicYards = cubicYardsRaw * 1.1; // 10% material buffer
  const loads = cubicYards > 0 ? Math.ceil(cubicYards / YARDS_PER_LOAD) : 0;
  const delivery = loads * DELIVERY_PER_LOAD;
  const material = cubicYards * materialCostPerYd;
  const equipment = 0;
  const tax = (material + equipment + delivery) * TAX_RATE;
  const cogs = material + delivery + tax;
  const labor = cubicYards * chargePerYd * diffMult;
  const quote = cogs + labor;

  return { cubicYards, loads, material, equipment, delivery, tax, cogs, labor, quote, diffMult };
}

function calcRock(r) {
  const sqft = num(r.sqft);
  const depth = num(r.depth) || 3;
  const materialCostPerYd = num(r.materialCostPerYd);
  const chargePerYd = num(r.chargePerYd);
  const equipment = num(r.equipmentCost);
  const diffMult = { easy: 1.0, moderate: 1.1, hard: 1.4 }[r.difficulty] || 1.0;

  const cubicYardsRaw = (sqft * (depth / 12)) / 27;
  const cubicYards = cubicYardsRaw * 1.1; // 10% material buffer
  const loads = cubicYards > 0 ? Math.ceil(cubicYards / YARDS_PER_LOAD) : 0;
  const delivery = loads * DELIVERY_PER_LOAD;
  const material = cubicYards * materialCostPerYd;

  // Landscape fabric — always included, uses sqft with same 10% buffer
  const fabricSqft = sqft > 0 ? sqft * 1.1 : 0;
  const rollCoverage = num(r.fabricRollCoverage) || 900;
  const rollCost = num(r.fabricRollCost) || 32.06;
  const fabricRolls = fabricSqft > 0 ? Math.ceil(fabricSqft / rollCoverage) : 0;
  const fabricCost = fabricRolls * rollCost; // pre-tax, tax added in main tax line
  const fabricCharge = fabricSqft * (num(r.fabricChargePerSqft) || 0);

  const totalMaterial = material + fabricCost;
  const tax = (totalMaterial + equipment + delivery) * TAX_RATE;
  const labor = (cubicYards * chargePerYd * diffMult) + fabricCharge;
  const cogs = totalMaterial + delivery + tax + equipment;
  const quote = cogs + labor;

  return { cubicYards, loads, material, fabricCost, fabricRolls, fabricSqft, fabricCharge, totalMaterial, equipment, delivery, tax, labor, cogs, quote, diffMult };
}

function calcPine(p) {
  // Override mode
  if (p.override) {
    const quote = num(p.overridePrice);
    return { cogs: 0, quote, delivery: 0, profit: quote, override: true };
  }

  const bales = num(p.bales);
  const ourCost = num(p.ourCost) || 4.25;
  const laborPerBale = num(p.laborPerBale);
  const delivery = num(p.delivery);

  const cogs = bales * ourCost;
  const totalPerBale = ourCost + laborPerBale;
  const quote = (totalPerBale * bales) + delivery;
  const profit = quote - cogs;
  return { cogs, quote, delivery, profit, totalPerBale };
}

function calcEdging(e) {
  const linearFt = num(e.linearFeet);
  const unitLength = num(e.unitLength) || 1;
  const costPerUnit = num(e.costPerUnit);
  const chargePerFt = num(e.chargePerFoot);
  const delivery = num(e.delivery);
  const diffMult = { easy: 1.0, moderate: 1.1, hard: 1.4 }[e.difficulty] || 1.0;
  const unitsNeeded = linearFt > 0 ? Math.ceil(linearFt / unitLength) : 0;
  const material = unitsNeeded * costPerUnit;
  const tax = (material + delivery) * TAX_RATE;
  const cogs = material + delivery + tax;
  const labor = linearFt * chargePerFt * diffMult;
  const quote = cogs + labor;
  return { linearFt, unitsNeeded, material, delivery, tax, cogs, labor, quote, diffMult, equipment: 0 };
}

const DEFAULT_LAWN_TIERS = [
  { maxSqft: 8000, price: 55 },
  { maxSqft: 10000, price: 60 },
  { maxSqft: 15000, price: 70 },
  { maxSqft: 21000, price: 80 },
  { maxSqft: 30000, price: 90 },
  { maxSqft: 43000, price: 95 },
  { maxSqft: Infinity, price: 100 },
];

const DEFAULT_EOW_MULTIPLIER = 1.4;
const DEFAULT_LAWN_WEEKLY_MIN = 55;
const DEFAULT_LAWN_BIWEEKLY_MIN = 70;

function calcLawn(l, settings) {
  // Override mode — user sets prices directly
  if (l.override) {
    const weekly = num(l.overrideWeekly);
    const biweekly = num(l.overrideBiweekly);
    const quote = biweekly || weekly;
    return { weekly, biweekly, quote, material: 0, delivery: 0, equipment: 0, tax: 0, labor: quote, override: true };
  }

  const sqft = num(l.sqft);
  if (sqft <= 0) return { weekly: 0, biweekly: 0, quote: 0, material: 0, delivery: 0, equipment: 0, tax: 0, labor: 0 };

  const tiers = settings?.lawnTiers || DEFAULT_LAWN_TIERS;
  const eowMult = num(settings?.lawnEowMultiplier) || DEFAULT_EOW_MULTIPLIER;
  const weeklyMin = num(settings?.lawnWeeklyMin) || DEFAULT_LAWN_WEEKLY_MIN;
  const biweeklyMin = num(settings?.lawnBiweeklyMin) || DEFAULT_LAWN_BIWEEKLY_MIN;
  const difficultyMult = { easy: 1.0, moderate: 1.15, hard: 1.3 }[l.difficulty] || 1.0;

  // Find the matching tier
  const sorted = [...tiers].sort((a, b) => a.maxSqft - b.maxSqft);
  let tierPrice = sorted[sorted.length - 1].price;
  for (const tier of sorted) {
    if (sqft <= tier.maxSqft) { tierPrice = tier.price; break; }
  }

  const weeklyRaw = Math.max(tierPrice * difficultyMult, weeklyMin);
  const weekly = Math.round(weeklyRaw);
  const biweeklyRaw = Math.max(weekly * eowMult, biweeklyMin);
  const biweekly = Math.round(biweeklyRaw);

  const quote = biweekly;
  return { weekly, biweekly, quote, material: 0, delivery: 0, equipment: 0, tax: 0, labor: quote };
}

const DEFAULT_BUSH_PRICES = { small: 8, medium: 12, large: 18, xl: 50 };

function calcBushes(b, settings) {
  // Always 3x/year: Apr, Jul, Oct
  const VISITS_PER_YEAR = 3;

  // Override mode — user sets per-visit price directly
  if (b.override) {
    const perVisit = num(b.overridePerVisit);
    const monthly = Math.round((perVisit * VISITS_PER_YEAR) / 12);
    const quote = perVisit;
    return { smallTotal: 0, mediumTotal: 0, largeTotal: 0, totalCount: 0, perVisit, monthly, quote, material: 0, delivery: 0, equipment: 0, tax: 0, labor: quote, override: true };
  }

  const sm = num(b.small);
  const md = num(b.medium);
  const lg = num(b.large);
  const xlg = num(b.xl);
  const totalCount = sm + md + lg + xlg;
  if (totalCount <= 0) return { smallTotal: 0, mediumTotal: 0, largeTotal: 0, xlTotal: 0, totalCount: 0, monthly: 0, perVisit: 0, quote: 0, material: 0, delivery: 0, equipment: 0, tax: 0, labor: 0 };

  const prices = settings?.bushPrices || DEFAULT_BUSH_PRICES;

  const smallTotal = sm * (num(prices.small) || DEFAULT_BUSH_PRICES.small);
  const mediumTotal = md * (num(prices.medium) || DEFAULT_BUSH_PRICES.medium);
  const largeTotal = lg * (num(prices.large) || DEFAULT_BUSH_PRICES.large);
  const xlTotal = xlg * (num(prices.xl) || DEFAULT_BUSH_PRICES.xl);
  const perVisit = Math.max(smallTotal + mediumTotal + largeTotal + xlTotal, 35); // $35 minimum
  const monthly = Math.round((perVisit * VISITS_PER_YEAR) / 12);

  const quote = perVisit;
  return { smallTotal, mediumTotal, largeTotal, xlTotal, totalCount, perVisit, monthly, quote, material: 0, delivery: 0, equipment: 0, tax: 0, labor: quote };
}

const DEFAULT_OVERGROWN_MULTIPLIER = 2;

function calcOvergrownBushes(b, settings) {
  // Override mode
  if (b.override) {
    const quote = num(b.overridePrice);
    return { smallTotal: 0, mediumTotal: 0, largeTotal: 0, xlTotal: 0, totalCount: 0, overgrownCount: 0, quote, material: 0, delivery: 0, equipment: 0, tax: 0, labor: quote, override: true };
  }

  const sm = num(b.small);
  const md = num(b.medium);
  const lg = num(b.large);
  const xlg = num(b.xl);
  const overgrown = num(b.overgrown);
  const totalCount = sm + md + lg + xlg;
  if (totalCount <= 0) return { smallTotal: 0, mediumTotal: 0, largeTotal: 0, xlTotal: 0, totalCount: 0, overgrownCount: 0, quote: 0, material: 0, delivery: 0, equipment: 0, tax: 0, labor: 0 };

  const prices = settings?.bushPrices || DEFAULT_BUSH_PRICES;
  const multiplier = num(settings?.overgrownMultiplier) || DEFAULT_OVERGROWN_MULTIPLIER;

  const smallTotal = sm * (num(prices.small) || DEFAULT_BUSH_PRICES.small);
  const mediumTotal = md * (num(prices.medium) || DEFAULT_BUSH_PRICES.medium);
  const largeTotal = lg * (num(prices.large) || DEFAULT_BUSH_PRICES.large);
  const xlTotal = xlg * (num(prices.xl) || DEFAULT_BUSH_PRICES.xl);
  const basePrice = smallTotal + mediumTotal + largeTotal + xlTotal;

  // Overgrown surcharge: overgrown count × average bush price × multiplier
  const avgPrice = totalCount > 0 ? basePrice / totalCount : 0;
  const overgrownSurcharge = overgrown * avgPrice * (multiplier - 1);

  const quote = Math.max(basePrice + overgrownSurcharge, 50); // $50 minimum for one-time

  return { smallTotal, mediumTotal, largeTotal, xlTotal, totalCount, overgrownCount: overgrown, overgrownSurcharge: Math.round(overgrownSurcharge * 100) / 100, quote: Math.round(quote * 100) / 100, material: 0, delivery: 0, equipment: 0, tax: 0, labor: Math.round(quote * 100) / 100 };
}

const DEFAULT_REMOVAL_PRICES = { small: 35, medium: 65, large: 125, xl: 250 };

function calcBushRemoval(b) {
  if (b.override) {
    const quote = num(b.overridePrice);
    return { totalCount: 0, quote, material: 0, delivery: 0, equipment: 0, tax: 0, labor: quote, override: true };
  }

  const sm = num(b.small);
  const md = num(b.medium);
  const lg = num(b.large);
  const xlg = num(b.xl);
  const totalCount = sm + md + lg + xlg;
  if (totalCount <= 0) return { totalCount: 0, quote: 0, material: 0, delivery: 0, equipment: 0, tax: 0, labor: 0 };

  const smallTotal = sm * (num(b.smallPrice) || DEFAULT_REMOVAL_PRICES.small);
  const mediumTotal = md * (num(b.mediumPrice) || DEFAULT_REMOVAL_PRICES.medium);
  const largeTotal = lg * (num(b.largePrice) || DEFAULT_REMOVAL_PRICES.large);
  const xlTotal = xlg * (num(b.xlPrice) || DEFAULT_REMOVAL_PRICES.xl);
  const haulOff = num(b.haulOff);
  const quote = Math.max(smallTotal + mediumTotal + largeTotal + xlTotal + haulOff, 75);

  return { totalCount, smallTotal, mediumTotal, largeTotal, xlTotal, haulOff, quote: Math.round(quote * 100) / 100, material: 0, delivery: 0, equipment: 0, tax: 0, labor: Math.round(quote * 100) / 100 };
}

const DEFAULT_AERATION_BASE = 169;
const DEFAULT_AERATION_THRESHOLD = 10000;
const DEFAULT_AERATION_PER_1K = 15;

function calcAeration(a, settings) {
  // Overseeding sub-calc (used in both normal and override modes)
  const BAG_LBS = 50;
  const calcOverseed = (sqft) => {
    if (!a.includeOverseed) return { seedLbs: 0, overseedQuote: 0, overseedCogs: 0, overseedProfit: 0, overseedOverride: false };
    if (a.overrideOverseed) {
      const q = num(a.overrideOverseedPrice);
      return { seedLbs: 0, overseedQuote: q, overseedCogs: 0, overseedProfit: q, overseedOverride: true };
    }
    const seedRate = num(a.seedRate);
    const bagPrice = num(a.bagPrice);
    const ourBagCost = num(a.ourBagCost);
    const seedLbs = (sqft / 1000) * seedRate;
    // Customer price per lb (bag price + 7% tax / 50 lbs)
    const bagTotal = bagPrice + (bagPrice * TAX_RATE);
    const perLb = bagTotal / BAG_LBS;
    const overseedQuote = Math.round(perLb * seedLbs * 100) / 100;
    // Our cost per lb (our bag cost + 7% tax / 50 lbs)
    const ourBagTotal = ourBagCost + (ourBagCost * TAX_RATE);
    const ourPerLb = ourBagCost > 0 ? ourBagTotal / BAG_LBS : 0;
    const overseedCogs = Math.round(ourPerLb * seedLbs * 100) / 100;
    const overseedProfit = overseedQuote - overseedCogs;
    return { seedLbs: Math.round(seedLbs * 10) / 10, perLb: Math.round(perLb * 1000) / 1000, overseedQuote, overseedCogs, overseedProfit, overseedOverride: false };
  };

  // Override mode — single total price for aeration + seed
  if (a.override) {
    const quote = num(a.overridePrice);
    return { aerationPrice: quote, quote, material: 0, delivery: 0, equipment: 0, tax: 0, labor: quote, override: true, seedLbs: 0, overseedQuote: 0, overseedCogs: 0, overseedProfit: 0, overseedOverride: false };
  }

  const sqft = num(a.sqft);
  if (sqft <= 0) return { aerationPrice: 0, quote: 0, material: 0, delivery: 0, equipment: 0, tax: 0, labor: 0, seedLbs: 0, overseedQuote: 0, overseedCogs: 0, overseedProfit: 0 };

  const base = num(settings?.aerationBase) || DEFAULT_AERATION_BASE;
  const threshold = num(settings?.aerationThreshold) || DEFAULT_AERATION_THRESHOLD;
  const per1k = num(settings?.aerationPer1k) || DEFAULT_AERATION_PER_1K;

  const aerationPrice = sqft <= threshold
    ? base
    : base + ((sqft - threshold) / 1000) * per1k;

  const os = calcOverseed(sqft);
  const quote = Math.round((aerationPrice + os.overseedQuote) * 100) / 100;

  return { aerationPrice: Math.round(aerationPrice * 100) / 100, quote, material: 0, delivery: 0, equipment: 0, tax: 0, labor: quote, ...os };
}

function calcLeafMaint(lm) {
  // Override mode
  if (lm.override) {
    const perVisit = num(lm.overridePerVisit);
    return { perVisit, quote: perVisit, material: 0, delivery: 0, equipment: 0, tax: 0, labor: perVisit, override: true };
  }
  // Per-visit price = lawn mow price × multiplier (default 1.5x the mow rate)
  const perVisit = num(lm.perVisit);
  if (perVisit <= 0) return { perVisit: 0, quote: 0, material: 0, delivery: 0, equipment: 0, tax: 0, labor: 0 };
  return { perVisit, quote: perVisit, material: 0, delivery: 0, equipment: 0, tax: 0, labor: perVisit };
}

function calcLeafCleanup(lc) {
  // Rock Hill / Charlotte metro pricing — anchored on pro/business-owner data:
  // GreenPal pros (South): $200-$300 standard cleanup, leaf = 3x mow rate
  // LawnSite forums: $65-$90/man-hr, $150-$180 min on small lots
  // Clean Cut Landscaping CLT: $200-$1,000 published range
  // ECHO Means Business: $40+/man-hr floor for profitability
  // Mow rate ~$55-$70 mid yard → 3x = $165-$210 light cleanup
  const BASE_PRICE = {
    S:  { LIGHT: 150, MED: 200, HEAVY: 300, EXTREME: 425 },
    M:  { LIGHT: 200, MED: 300, HEAVY: 450, EXTREME: 650 },
    L:  { LIGHT: 300, MED: 450, HEAVY: 650, EXTREME: 925 },
    XL: { LIGHT: 425, MED: 625, HEAVY: 950, EXTREME: 1350 },
  };
  const FENCE_ADD = { NONE: 0, EASY_GATE: 25, TIGHT_GATE: 75 };
  const HAUL_LOAD_PRICE = 75;
  const HAUL_MIN_FEE = 50;
  const DIFFICULTY_MULT = { NORMAL: 1.0, HARD: 1.25 };
  const MIN_JOB_PRICE = 150;
  const ROUND_TO = 5;

  const base = (BASE_PRICE[lc.yardSize] || BASE_PRICE.M)[lc.leafVolume] || 350;
  const fenceFee = FENCE_ADD[lc.fenceAccess] || 0;
  const haulFee = lc.haulOff ? Math.max(num(lc.haulLoads) * HAUL_LOAD_PRICE, HAUL_MIN_FEE) : 0;
  const subtotal = base + fenceFee + haulFee;
  const multiplier = DIFFICULTY_MULT[lc.difficulty] || 1.0;
  const adjusted = subtotal * multiplier;
  const minApplied = adjusted < MIN_JOB_PRICE;
  const raw = Math.max(adjusted, MIN_JOB_PRICE);
  const quote = Math.ceil(raw / ROUND_TO) * ROUND_TO;

  return { quote, base, fenceFee, haulFee, multiplier, minApplied, material: 0, delivery: 0, equipment: 0, tax: 0, labor: quote };
}

function calcSummary(sections) {
  let totalQuote = 0, totalMaterial = 0, totalDelivery = 0, totalEquipment = 0, totalTax = 0, totalLabor = 0;
  for (const s of sections) {
    totalQuote += s.quote || 0;
    totalMaterial += s.material || 0;
    totalDelivery += s.delivery || 0;
    totalEquipment += s.equipment || 0;
    totalTax += s.tax || 0;
    totalLabor += s.labor || 0;
  }
  const totalExpenses = totalMaterial + totalEquipment + totalDelivery + totalTax;
  const profit = totalQuote - totalExpenses;
  return { totalQuote, totalMaterial, totalDelivery, totalEquipment, totalTax, totalLabor, totalExpenses, profit };
}

// ─── Reusable input components ───

function InputField({ label, value, onChange, placeholder, prefix, className = '' }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-secondary mb-1">{label}</label>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">{prefix}</span>}
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full rounded-lg border border-border-strong bg-card px-4 py-2.5 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand placeholder:text-placeholder-muted ${prefix ? 'pl-7' : ''}`}
        />
      </div>
    </div>
  );
}

function ReadonlyField({ label, value, className = '' }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-secondary mb-1">{label}</label>
      <div className="rounded-lg bg-surface-alt border border-border-subtle px-4 py-2.5 text-sm font-semibold text-primary">
        {value}
      </div>
    </div>
  );
}

// ─── Settings panel ───

function PricingSettings({ settings, onUpdate, ownerMode }) {
  const [open, setOpen] = useState(false);
  if (!ownerMode) return null;
  const s = { ...initialQuotingSettings, ...settings };

  const updateMulchType = (idx, field, val) => {
    const types = [...s.mulchTypes];
    types[idx] = { ...types[idx], [field]: field === 'pricePerYd' ? num(val) : val };
    onUpdate({ ...s, mulchTypes: types });
  };

  const updateTier = (idx, field, val) => {
    const tiers = [...s.volumeTiers];
    tiers[idx] = { ...tiers[idx], [field]: num(val) };
    onUpdate({ ...s, volumeTiers: tiers });
  };

  return (
    <div className="bg-card rounded-2xl shadow-sm border border-border-subtle">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between p-5 cursor-pointer">
        <div className="flex items-center gap-2">
          <Settings size={16} className="text-muted" />
          <h2 className="text-sm font-bold text-primary">Pricing Settings</h2>
        </div>
        {open ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-6">
          {/* Mulch types */}
          <div>
            <h3 className="text-xs font-bold text-secondary uppercase tracking-wide mb-2">Mulch Types &amp; Base Price/Yard</h3>
            <p className="text-xs text-muted mb-3">Supplier costs per cubic yard. Auto-fills Price/Yard when you pick a type.</p>
            <div className="space-y-2">
              {s.mulchTypes.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="text" value={t.label} onChange={(e) => updateMulchType(i, 'label', e.target.value)} placeholder="Type name" className="flex-1 rounded-lg border border-border-strong bg-card px-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand" />
                  <div className="relative w-24">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
                    <input type="text" inputMode="decimal" value={t.pricePerYd} onChange={(e) => updateMulchType(i, 'pricePerYd', e.target.value)} className="w-full rounded-lg border border-border-strong bg-card pl-6 pr-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand" />
                  </div>
                  <span className="text-xs text-muted">/yd</span>
                  <button onClick={() => onUpdate({ ...s, mulchTypes: s.mulchTypes.filter((_, j) => j !== i) })} className="p-1 text-red-400 hover:text-red-600 cursor-pointer"><X size={14} /></button>
                </div>
              ))}
            </div>
            <button onClick={() => onUpdate({ ...s, mulchTypes: [...s.mulchTypes, { label: '', pricePerYd: 0 }] })} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-text-strong hover:underline cursor-pointer"><Plus size={12} /> Add type</button>
          </div>

          {/* Volume discount tiers */}
          <div>
            <h3 className="text-xs font-bold text-secondary uppercase tracking-wide mb-2">Volume Discount Tiers</h3>
            <p className="text-xs text-muted mb-3">Auto-discount per-yard price at these volumes (applies to mulch).</p>
            <div className="space-y-2">
              {s.volumeTiers.slice().sort((a, b) => a.minYards - b.minYards).map((tier, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="relative w-24"><input type="text" inputMode="decimal" value={tier.minYards} onChange={(e) => updateTier(i, 'minYards', e.target.value)} className="w-full rounded-lg border border-border-strong bg-card px-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand" /></div>
                  <span className="text-xs text-muted">+ yards</span>
                  <span className="text-xs text-muted mx-1">&rarr;</span>
                  <div className="relative w-20"><input type="text" inputMode="decimal" value={tier.discountPct} onChange={(e) => updateTier(i, 'discountPct', e.target.value)} className="w-full rounded-lg border border-border-strong bg-card px-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand" /></div>
                  <span className="text-xs text-muted">% off</span>
                  <button onClick={() => onUpdate({ ...s, volumeTiers: s.volumeTiers.filter((_, j) => j !== i) })} className="p-1 text-red-400 hover:text-red-600 cursor-pointer"><X size={14} /></button>
                </div>
              ))}
            </div>
            <button onClick={() => { const last = s.volumeTiers[s.volumeTiers.length - 1]; onUpdate({ ...s, volumeTiers: [...s.volumeTiers, { minYards: (last?.minYards || 0) + 10, discountPct: 0 }] }); }} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-text-strong hover:underline cursor-pointer"><Plus size={12} /> Add tier</button>
          </div>

          {/* Lawn Care */}
          <div>
            <h3 className="text-xs font-bold text-secondary uppercase tracking-wide mb-2">Lawn Care Pricing Tiers</h3>
            <p className="text-xs text-muted mb-3">Weekly price per lot size tier (Rock Hill / Charlotte market rates).</p>
            <div className="space-y-2">
              {(s.lawnTiers || DEFAULT_LAWN_TIERS).map((tier, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-muted w-8">Up to</span>
                  <div className="relative w-24"><input type="text" inputMode="decimal" value={tier.maxSqft === Infinity ? '∞' : tier.maxSqft} onChange={(e) => { const tiers = [...(s.lawnTiers || DEFAULT_LAWN_TIERS)]; tiers[i] = { ...tiers[i], maxSqft: e.target.value === '∞' ? Infinity : num(e.target.value) }; onUpdate({ ...s, lawnTiers: tiers }); }} className="w-full rounded-lg border border-border-strong bg-card px-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand" /></div>
                  <span className="text-xs text-muted">sqft</span>
                  <span className="text-xs text-muted mx-1">&rarr;</span>
                  <div className="relative w-20">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
                    <input type="text" inputMode="decimal" value={tier.price} onChange={(e) => { const tiers = [...(s.lawnTiers || DEFAULT_LAWN_TIERS)]; tiers[i] = { ...tiers[i], price: num(e.target.value) }; onUpdate({ ...s, lawnTiers: tiers }); }} className="w-full rounded-lg border border-border-strong bg-card pl-6 pr-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand" />
                  </div>
                  <span className="text-xs text-muted">/cut</span>
                  <button onClick={() => { const tiers = [...(s.lawnTiers || DEFAULT_LAWN_TIERS)].filter((_, j) => j !== i); onUpdate({ ...s, lawnTiers: tiers }); }} className="p-1 text-red-400 hover:text-red-600 cursor-pointer"><X size={14} /></button>
                </div>
              ))}
            </div>
            <button onClick={() => { const tiers = [...(s.lawnTiers || DEFAULT_LAWN_TIERS)]; const last = tiers[tiers.length - 1]; onUpdate({ ...s, lawnTiers: [...tiers, { maxSqft: (last?.maxSqft === Infinity ? 50000 : (last?.maxSqft || 0)) + 10000, price: (last?.price || 50) + 10 }] }); }} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-text-strong hover:underline cursor-pointer"><Plus size={12} /> Add tier</button>
            <div className="grid grid-cols-3 gap-3 mt-4">
              <div><label className="block text-xs font-medium text-secondary mb-1">EOW Multiplier</label><input type="text" inputMode="decimal" value={s.lawnEowMultiplier ?? 1.4} onChange={(e) => onUpdate({ ...s, lawnEowMultiplier: num(e.target.value) })} className="w-full rounded-lg border border-border-strong bg-card px-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand" /></div>
              <div><label className="block text-xs font-medium text-secondary mb-1">Weekly Min</label><div className="relative"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-sm">$</span><input type="text" inputMode="decimal" value={s.lawnWeeklyMin ?? 55} onChange={(e) => onUpdate({ ...s, lawnWeeklyMin: num(e.target.value) })} className="w-full rounded-lg border border-border-strong bg-card pl-6 pr-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand" /></div></div>
              <div><label className="block text-xs font-medium text-secondary mb-1">EOW Min</label><div className="relative"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-sm">$</span><input type="text" inputMode="decimal" value={s.lawnBiweeklyMin ?? 70} onChange={(e) => onUpdate({ ...s, lawnBiweeklyMin: num(e.target.value) })} className="w-full rounded-lg border border-border-strong bg-card pl-6 pr-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand" /></div></div>
            </div>
          </div>

          {/* Bushes Pricing */}
          <div>
            <h3 className="text-xs font-bold text-secondary uppercase tracking-wide mb-2">Bushes Pricing (per bush)</h3>
            <div className="grid grid-cols-4 gap-3">
              <div><label className="block text-xs font-medium text-secondary mb-1">Small</label><div className="relative"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-sm">$</span><input type="text" inputMode="decimal" value={s.bushPrices?.small ?? DEFAULT_BUSH_PRICES.small} onChange={(e) => onUpdate({ ...s, bushPrices: { ...(s.bushPrices || DEFAULT_BUSH_PRICES), small: num(e.target.value) } })} className="w-full rounded-lg border border-border-strong bg-card pl-6 pr-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand" /></div></div>
              <div><label className="block text-xs font-medium text-secondary mb-1">Medium</label><div className="relative"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-sm">$</span><input type="text" inputMode="decimal" value={s.bushPrices?.medium ?? DEFAULT_BUSH_PRICES.medium} onChange={(e) => onUpdate({ ...s, bushPrices: { ...(s.bushPrices || DEFAULT_BUSH_PRICES), medium: num(e.target.value) } })} className="w-full rounded-lg border border-border-strong bg-card pl-6 pr-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand" /></div></div>
              <div><label className="block text-xs font-medium text-secondary mb-1">Large</label><div className="relative"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-sm">$</span><input type="text" inputMode="decimal" value={s.bushPrices?.large ?? DEFAULT_BUSH_PRICES.large} onChange={(e) => onUpdate({ ...s, bushPrices: { ...(s.bushPrices || DEFAULT_BUSH_PRICES), large: num(e.target.value) } })} className="w-full rounded-lg border border-border-strong bg-card pl-6 pr-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand" /></div></div>
              <div><label className="block text-xs font-medium text-secondary mb-1">XL</label><div className="relative"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-sm">$</span><input type="text" inputMode="decimal" value={s.bushPrices?.xl ?? DEFAULT_BUSH_PRICES.xl} onChange={(e) => onUpdate({ ...s, bushPrices: { ...(s.bushPrices || DEFAULT_BUSH_PRICES), xl: num(e.target.value) } })} className="w-full rounded-lg border border-border-strong bg-card pl-6 pr-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand" /></div></div>
            </div>
          </div>

          {/* Aeration Pricing */}
          <div>
            <h3 className="text-xs font-bold text-secondary uppercase tracking-wide mb-2">Aeration Pricing</h3>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="block text-xs font-medium text-secondary mb-1">Base Price</label><div className="relative"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-sm">$</span><input type="text" inputMode="decimal" value={s.aerationBase ?? DEFAULT_AERATION_BASE} onChange={(e) => onUpdate({ ...s, aerationBase: num(e.target.value) })} className="w-full rounded-lg border border-border-strong bg-card pl-6 pr-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand" /></div></div>
              <div><label className="block text-xs font-medium text-secondary mb-1">Up to (sqft)</label><input type="text" inputMode="decimal" value={s.aerationThreshold ?? DEFAULT_AERATION_THRESHOLD} onChange={(e) => onUpdate({ ...s, aerationThreshold: num(e.target.value) })} className="w-full rounded-lg border border-border-strong bg-card px-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand" /></div>
              <div><label className="block text-xs font-medium text-secondary mb-1">Per 1k over</label><div className="relative"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-sm">$</span><input type="text" inputMode="decimal" value={s.aerationPer1k ?? DEFAULT_AERATION_PER_1K} onChange={(e) => onUpdate({ ...s, aerationPer1k: num(e.target.value) })} className="w-full rounded-lg border border-border-strong bg-card pl-6 pr-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand" /></div></div>
            </div>
          </div>

          {/* Defaults */}
          <div>
            <h3 className="text-xs font-bold text-secondary uppercase tracking-wide mb-2">Defaults</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div><label className="block text-xs font-medium text-secondary mb-1">Base Delivery $</label><input type="text" inputMode="decimal" value={s.baseDeliveryFee} onChange={(e) => onUpdate({ ...s, baseDeliveryFee: num(e.target.value) })} className="w-full rounded-lg border border-border-strong bg-card px-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand" /></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───

export default function Quoting() {
  const { currentUser, ownerMode } = useAuth();
  const quotes = useAppStore((s) => s.quotes);
  const setQuotes = useAppStore((s) => s.setQuotes);
  const settings = useAppStore((s) => s.quotingSettings) || initialQuotingSettings;
  const setSettings = useAppStore((s) => s.setQuotingSettings);

  const mulchTypes = settings.mulchTypes || initialQuotingSettings.mulchTypes;
  const defaultMulchType = mulchTypes[0] || { label: 'Hardwood', pricePerYd: 30 };
  const rockTypes = settings.rockTypes || initialQuotingSettings.rockTypes;
  const defaultRockType = rockTypes[0] || { label: 'Pea Gravel', pricePerYd: 55 };

  const makeDefaults = () => ({
    lawn: { sqft: '', difficulty: 'easy', override: false, overrideWeekly: '', overrideBiweekly: '', overrideDisplay: 'eow' },
    bushes: { small: '', medium: '', large: '', xl: '', override: false, overridePerVisit: '', modes: { trimming: true, overgrown: false, removal: false } },
    aeration: { sqft: '', override: false, overridePrice: '', includeOverseed: false, seedRate: '8', bagPrice: '190', ourBagCost: '84', overrideOverseed: false, overrideOverseedPrice: '' },
    mulch: { sqft: '', depth: '', materialCostPerYd: String(defaultMulchType.pricePerYd), chargePerYd: '80', difficulty: 'easy', mulchType: defaultMulchType.label, crewSize: '2', estHours: '', crewRate: '17' },
    rock: { sqft: '', depth: '3', materialCostPerYd: String(defaultRockType.pricePerYd), chargePerYd: '150', difficulty: 'easy', equipmentCost: '', rockType: defaultRockType.label, fabricRollCoverage: '900', fabricRollCost: '32.06', fabricChargePerSqft: '0.75', crewSize: '2', estHours: '', crewRate: '17' },
    edging: { linearFeet: '', unitLength: '20', costPerUnit: '', chargePerFoot: '5', difficulty: 'easy', delivery: '' },
    pine: { bales: '', ourCost: '4.25', laborPerBale: '', delivery: '', override: false, overridePrice: '' },
    leafMaint: { perVisit: '', override: false, overridePerVisit: '' },
    leafCleanup: { yardSize: 'M', leafVolume: 'MED', fenceAccess: 'NONE', haulOff: false, haulLoads: '1', difficulty: 'NORMAL' },
    overgrownBushes: { small: '', medium: '', large: '', xl: '', overgrown: '', override: false, overridePrice: '' },
    bushRemoval: { small: '', medium: '', large: '', xl: '', haulOff: '', override: false, overridePrice: '' },
    other: { overgrownLawn: '' },
    annual: { enabled: false, lawnFrequency: 'weekly', mowingWeeks: '35', leafMaintVisits: '8', pineVisits: '1', leafVisits: '1', mulchVisits: '1', rockVisits: '1', edgingVisits: '1' },
  });

  // ─── Step state: 'list' | 'client' | 'measurements' | 'services' | 'calculator' ───
  const [step, setStep] = useState('list');
  const [quickMode, setQuickMode] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [clientLatLng, setClientLatLng] = useState(null);
  const [selectedServices, setSelectedServices] = useState(new Set());
  const [data, setData] = useState(makeDefaults);
  const [showSaved, setShowSaved] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [measurementsOpen, setMeasurementsOpen] = useState(false);
  const [measurements, setMeasurements] = useState({ measurements: [], mapCenter: null, mapAddress: '' });

  const addressAutocomplete = useAddressAutocomplete();
  const [clientSelected, setClientSelected] = useState(false);
  const [selectedClientInfo, setSelectedClientInfo] = useState(null); // { phone, email } from Jobber
  const savedClients = useAppStore((s) => s.clients) || [];
  const setSavedClients = useAppStore((s) => s.setClients);
  const agreements = useAppStore((s) => s.agreements) || [];

  // ─── Jobber live search (debounced, hits ?action=clients&q=...) ───
  const [jobberClients, setJobberClients] = useState([]);
  const [jobberLoading, setJobberLoading] = useState(false);
  useEffect(() => {
    const q = clientName.trim();
    if (q.length < 2 || clientSelected) { setJobberClients([]); return; }
    let cancelled = false;
    setJobberLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/jobber-data?action=clients&q=${encodeURIComponent(q)}`)
        .then((r) => r.ok ? r.json() : [])
        .then((data) => { if (!cancelled) setJobberClients(Array.isArray(data) ? data : []); })
        .catch(() => { if (!cancelled) setJobberClients([]); })
        .finally(() => { if (!cancelled) setJobberLoading(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [clientName, clientSelected]);

  // Find saved property data for current client name
  const savedProperty = (() => {
    if (!clientName.trim()) return null;
    const q = clientName.toLowerCase().trim();
    // Check clients store
    const fromClients = savedClients.find((c) => c.name?.toLowerCase().trim() === q);
    if (fromClients?.measurements?.length) return fromClients;
    // Check agreements
    const fromAgreement = agreements.find((a) => a.clientName?.toLowerCase().trim() === q);
    if (fromAgreement?.measurements?.length) return { measurements: fromAgreement.measurements, mapCenter: fromAgreement.mapCenter };
    return null;
  })();

  const toggleService = (id) => {
    setSelectedServices((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const has = (id) => selectedServices.has(id);

  const update = (section, field, val) => {
    setData((prev) => ({ ...prev, [section]: { ...prev[section], [field]: val } }));
  };

  const updateMulchType = (val) => {
    const type = mulchTypes.find((t) => t.label === val);
    setData((prev) => ({ ...prev, mulch: { ...prev.mulch, mulchType: val, materialCostPerYd: String(type?.pricePerYd || '') } }));
  };

  const updateRockType = (val) => {
    const type = rockTypes.find((t) => t.label === val);
    setData((prev) => ({ ...prev, rock: { ...prev.rock, rockType: val, materialCostPerYd: String(type?.pricePerYd || '') } }));
  };


  // Calculations (only for selected services)
  const lawnCalc = has('lawn') ? calcLawn(data.lawn, settings) : ZERO_CALC;
  const bushesCalc = (has('bushes') && data.bushes.modes?.trimming) ? calcBushes(data.bushes, settings) : ZERO_CALC;
  const aerationCalc = has('aeration') ? calcAeration(data.aeration, settings) : ZERO_CALC;
  const mulchCalc = has('mulch') ? calcMulch(data.mulch) : ZERO_CALC;
  const rockCalc = has('rock') ? calcRock(data.rock) : ZERO_CALC;
  const edgingCalc = has('edging') ? calcEdging(data.edging) : ZERO_CALC;
  const pineCalc = has('pine') ? calcPine(data.pine) : ZERO_CALC;
  const leafMaintCalc = has('leafMaint') ? calcLeafMaint(data.leafMaint) : ZERO_CALC;
  const leafCleanupCalc = has('leafCleanup') ? calcLeafCleanup(data.leafCleanup) : ZERO_CALC;
  const overgrownBushesCalc = (has('bushes') && data.bushes.modes?.overgrown) ? calcOvergrownBushes(data.overgrownBushes, settings) : ZERO_CALC;
  const bushRemovalCalc = (has('bushes') && data.bushes.modes?.removal) ? calcBushRemoval(data.bushRemoval) : ZERO_CALC;
  const otherCalcs = {
    quote: (has('overgrownLawn') ? num(data.other.overgrownLawn) : 0),
    materialCostTotal: 0, delivery: 0,
  };
  const summary = calcSummary([lawnCalc, bushesCalc, leafMaintCalc, aerationCalc, mulchCalc, rockCalc, edgingCalc, pineCalc, leafCleanupCalc, overgrownBushesCalc, bushRemovalCalc, otherCalcs]);

  // Compute annual total when annual contract is enabled
  const annualTotal = (() => {
    if (!data.annual.enabled) return null;
    let total = 0;
    if (has('lawn') && lawnCalc.quote > 0) {
      const weeks = num(data.annual.mowingWeeks) || 35;
      const isWeekly = data.annual.lawnFrequency === 'weekly';
      const perCut = isWeekly ? lawnCalc.weekly : lawnCalc.biweekly;
      total += perCut * (isWeekly ? weeks : Math.ceil(weeks / 2));
    }
    if (has('bushes') && bushesCalc.quote > 0) {
      total += bushesCalc.perVisit * 3; // 3x/year: Apr, Jul, Oct
    }
    if (has('leafMaint') && leafMaintCalc.quote > 0) {
      total += leafMaintCalc.perVisit * (num(data.annual.leafMaintVisits) || 8);
    }
    if (has('aeration') && aerationCalc.quote > 0) total += aerationCalc.quote;
    if (has('mulch') && mulchCalc.quote > 0) total += mulchCalc.quote * (num(data.annual.mulchVisits) || 1);
    if (has('rock') && rockCalc.quote > 0) total += rockCalc.quote * (num(data.annual.rockVisits) || 1);
    if (has('edging') && edgingCalc.quote > 0) total += edgingCalc.quote * (num(data.annual.edgingVisits) || 1);
    if (has('pine') && pineCalc.quote > 0) total += pineCalc.quote * (num(data.annual.pineVisits) || 1);
    if (has('leafCleanup') && leafCleanupCalc.quote > 0) total += leafCleanupCalc.quote * (num(data.annual.leafVisits) || 1);
    if (has('overgrownLawn')) total += num(data.other.overgrownLawn);
    if (overgrownBushesCalc.quote > 0) total += overgrownBushesCalc.quote;
    if (bushRemovalCalc.quote > 0) total += bushRemovalCalc.quote;
    return total;
  })();


  // ─── Actions ───

  const startNewQuote = () => {
    setQuickMode(false);
    setClientName('');
    setClientSelected(false);
    setClientAddress('');
    setClientLatLng(null);
    setSelectedServices(new Set());
    setData(makeDefaults());
    setMeasurements({ measurements: [], mapCenter: null, mapAddress: '' });
    addressAutocomplete.clear();
    setStep('client');
  };

  const startQuickQuote = () => {
    setQuickMode(true);
    setClientName('Quick Quote');
    setClientAddress('');
    setClientLatLng(null);
    setSelectedServices(new Set());
    setData(makeDefaults());
    setMeasurements({ measurements: [], mapCenter: null, mapAddress: '' });
    addressAutocomplete.clear();
    setStep('services');
  };

  const handleSave = () => {
    if (!clientName.trim()) return;
    const newQuote = {
      id: genId(),
      clientName: clientName.trim(),
      date: new Date().toISOString().slice(0, 10),
      services: [...selectedServices],
      lawn: has('lawn') ? { ...data.lawn } : null,
      bushes: has('bushes') ? { ...data.bushes } : null,
      leafMaint: has('leafMaint') ? { ...data.leafMaint } : null,
      aeration: has('aeration') ? { ...data.aeration } : null,
      mulch: has('mulch') ? { ...data.mulch } : null,
      rock: has('rock') ? { ...data.rock } : null,
      edging: has('edging') ? { ...data.edging } : null,
      pineNeedles: has('pine') ? { ...data.pine } : null,
      leafCleanup: has('leafCleanup') ? { ...data.leafCleanup } : null,
      overgrownBushes: (has('bushes') && data.bushes.modes?.overgrown) ? { ...data.overgrownBushes } : null,
      bushRemoval: (has('bushes') && data.bushes.modes?.removal) ? { ...data.bushRemoval } : null,
      otherServices: { ...data.other },
      annual: data.annual.enabled ? { ...data.annual } : null,
      total: data.annual.enabled ? annualTotal : summary.totalQuote,
      annualTotal: data.annual.enabled ? annualTotal : null,
      monthlyPayment: data.annual.enabled ? Math.round((annualTotal / 12) * 100) / 100 : null,
      createdBy: currentUser,
      measurements: measurements.measurements,
      mapCenter: measurements.mapCenter,
      mapAddress: measurements.mapAddress,
      clientAddress,
      clientLatLng,
    };
    setQuotes([newQuote, ...quotes]);

    // Save property + pricing data to clients store
    const clientKey = clientName.trim().toLowerCase();
    const clientPricing = {
      weeklyPrice: lawnCalc.weekly || 0,
      eowPrice: lawnCalc.biweekly || 0,
      quotedAt: new Date().toISOString(),
    };
    const clientData = {
      ...(measurements.measurements.length > 0 ? { measurements: measurements.measurements, mapCenter: measurements.mapCenter || clientLatLng } : {}),
      address: clientAddress,
      ...clientPricing,
    };
    const existing = savedClients.find((c) => c.name?.toLowerCase().trim() === clientKey);
    if (existing) {
      setSavedClients(savedClients.map((c) => c.name?.toLowerCase().trim() === clientKey
        ? { ...c, ...clientData }
        : c
      ));
    } else {
      setSavedClients([...savedClients, { id: genId(), name: clientName.trim(), ...clientData }]);
    }

    setStep('list');
  };

  const handleDelete = (id) => {
    setQuotes(quotes.filter((q) => q.id !== id));
    setConfirmDeleteId(null);
  };

  const handleLoadQuote = (q) => {
    setQuickMode(false);
    setClientName(q.clientName);
    setClientAddress(q.clientAddress || q.mapAddress || '');
    setClientLatLng(q.clientLatLng || q.mapCenter || null);
    const svcs = new Set(q.services || []);
    // Backward compat: detect services from data if services array missing
    if (svcs.size === 0) {
      if (q.lawn && (num(q.lawn.sqft) || q.lawn.override)) svcs.add('lawn');
      if (q.mulch && (num(q.mulch.sqft) || num(q.mulch.area))) svcs.add('mulch');
      if (q.rock && (num(q.rock.sqft) || num(q.rock.area))) svcs.add('rock');
      if (q.edging && num(q.edging.linearFeet)) svcs.add('edging');
      if (q.pineNeedles && num(q.pineNeedles.bales)) svcs.add('pine');
      if (q.leafCleanup) svcs.add('leafCleanup');
      if (q.bushes && (num(q.bushes.small) || num(q.bushes.medium) || num(q.bushes.large) || num(q.bushes.xl) || num(q.bushes.bushCount))) svcs.add('bushes');
      if (q.aeration && (num(q.aeration.sqft) || q.aeration.override)) svcs.add('aeration');
      if (num(q.otherServices?.overgrownLawn)) svcs.add('overgrownLawn');
      // Overgrown/removal bushes are now sub-modes of 'bushes'
      // They'll be restored via bushes.modes when loading
      // Backward compat: old "overgrown" → overgrownLawn
      if (num(q.otherServices?.overgrown)) svcs.add('overgrownLawn');
    }
    setSelectedServices(svcs);
    const defs = makeDefaults();
    setData({
      lawn: { ...defs.lawn, ...q.lawn },
      bushes: { ...defs.bushes, ...q.bushes },
      leafMaint: { ...defs.leafMaint, ...q.leafMaint },
      aeration: { ...defs.aeration, ...q.aeration },
      mulch: { ...defs.mulch, ...q.mulch },
      rock: { ...defs.rock, ...q.rock },
      edging: { ...defs.edging, ...q.edging },
      pine: { ...defs.pine, ...q.pineNeedles },
      leafCleanup: { ...defs.leafCleanup, ...q.leafCleanup },
      overgrownBushes: { ...defs.overgrownBushes, ...(q.overgrownBushes || {}) },
      bushRemoval: { ...defs.bushRemoval, ...(q.bushRemoval || {}) },
      other: { ...defs.other, ...q.otherServices, overgrownLawn: q.otherServices?.overgrownLawn || q.otherServices?.overgrown || '' },
      annual: { ...defs.annual, ...(q.annual || {}) },
    });
    setMeasurements({
      measurements: q.measurements || [],
      mapCenter: q.mapCenter || q.clientLatLng || null,
      mapAddress: q.mapAddress || q.clientAddress || '',
    });
    setStep('calculator');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ─── Render: List view ───

  const [showPastQuotes, setShowPastQuotes] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  if (step === 'list') {
    return (
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-end justify-between pt-8">
          <div>
            <h1 className="text-3xl font-bold text-primary tracking-tight">Quotes</h1>
            <p className="text-sm text-muted mt-1">Build a new quote or view past ones</p>
          </div>
          <div className="flex items-center gap-1">
            {ownerMode && (
              <button
                onClick={() => setShowSettings((v) => !v)}
                className="p-2 rounded-lg text-muted hover:text-primary hover:bg-surface-alt transition-colors cursor-pointer"
                title="Pricing settings"
              >
                <Settings size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Primary action card */}
        <div className="bg-card rounded-2xl border border-border-subtle p-6 space-y-3">
          <button
            onClick={startNewQuote}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-brand text-on-brand font-semibold hover:bg-brand-hover transition-colors cursor-pointer"
          >
            <Plus size={18} />
            New Quote
          </button>
          <button
            onClick={startQuickQuote}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-muted text-xs font-medium hover:text-primary hover:bg-surface-alt transition-colors cursor-pointer"
          >
            <Calculator size={13} />
            Quick Quote — skip to calculators
          </button>
        </div>

        {/* Past quotes link */}
        {quotes.length > 0 && (
          <button
            onClick={() => setShowPastQuotes((v) => !v)}
            className="w-full flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wider text-muted hover:text-primary transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <FileText size={12} />
              Past Quotes · {quotes.length}
            </span>
            <ChevronDown size={14} className={`transition-transform ${showPastQuotes ? 'rotate-180' : ''}`} />
          </button>
        )}

        {/* Expandable settings */}
        {showSettings && ownerMode && (
          <PricingSettings settings={settings} onUpdate={setSettings} ownerMode={ownerMode} />
        )}

        {/* Expandable past quotes */}
        {showPastQuotes && quotes.length > 0 && (
          <div className="space-y-2">
            {quotes.map((q) => (
              <div key={q.id} className="bg-card rounded-xl shadow-sm border border-border-subtle p-4 flex items-center justify-between gap-3 hover:bg-surface-alt transition-colors">
                <button onClick={() => handleLoadQuote(q)} className="flex-1 min-w-0 text-left cursor-pointer">
                  <h3 className="text-sm font-bold text-primary truncate">{q.clientName}</h3>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {(q.services || []).map((svc) => {
                      const def = SERVICE_OPTIONS.find((s) => s.id === svc);
                      return def ? <span key={svc} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-surface-alt text-secondary">{def.label}</span> : null;
                    })}
                  </div>
                  <p className="text-xs text-tertiary mt-1">
                    {q.date} &middot; {q.monthlyPayment ? `$${fmt(q.monthlyPayment)}/mo (Annual)` : `$${fmt(q.total)}`} &middot; by {q.createdBy}
                  </p>
                </button>
                {ownerMode && (
                  <button onClick={() => setConfirmDeleteId(q.id)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors cursor-pointer shrink-0" title="Delete quote">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {confirmDeleteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmDeleteId(null)}>
            <div className="bg-card rounded-2xl shadow-2xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-primary mb-2">Delete Quote?</h3>
              <p className="text-sm text-secondary mb-5">This will permanently remove this quote.</p>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setConfirmDeleteId(null)} className="px-4 py-2 rounded-lg border border-border-strong text-secondary text-sm font-medium hover:bg-surface transition-colors cursor-pointer">Cancel</button>
                <button onClick={() => handleDelete(confirmDeleteId)} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors cursor-pointer">Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Render: Client step ───

  if (step === 'client') {
    // ─── Build unified search results across all sources ───
    const buildMatches = () => {
      const q = clientName.toLowerCase().trim();
      if (q.length < 2) return [];
      const matches = [];
      const seen = new Set();
      // Jobber clients (highest priority — most complete data)
      for (const c of jobberClients) {
        const key = (c.name || '').toLowerCase();
        if (!key) continue;
        if (key.includes(q) && !seen.has(key)) {
          seen.add(key);
          const fullAddress = [c.address, c.city, c.state, c.zip].filter(Boolean).join(', ');
          matches.push({
            name: c.name,
            address: fullAddress,
            phone: c.phone,
            email: c.email,
            hasMap: false,
            source: 'jobber',
            data: c,
          });
        }
      }
      // Saved clients
      for (const c of savedClients) {
        const key = (c.name || '').toLowerCase();
        if (key.includes(q) && !seen.has(key)) {
          seen.add(key);
          matches.push({ name: c.name, address: c.address || '', hasMap: !!(c.measurements?.length), source: 'saved', data: c });
        }
      }
      // Agreements
      for (const a of agreements) {
        const key = (a.clientName || '').toLowerCase();
        if (key.includes(q) && !seen.has(key)) {
          seen.add(key);
          matches.push({ name: a.clientName, address: a.clientAddress || '', hasMap: !!(a.measurements?.length), source: 'contract', data: a });
        }
      }
      // Saved quotes
      for (const qo of quotes) {
        const key = (qo.clientName || '').toLowerCase();
        if (key.includes(q) && !seen.has(key)) {
          seen.add(key);
          matches.push({ name: qo.clientName, address: qo.clientAddress || qo.mapAddress || '', hasMap: !!(qo.measurements?.length), source: 'quote', data: qo });
        }
      }
      return matches.slice(0, 12);
    };

    const waitForPlaces = (timeout = 5000) => new Promise((resolve) => {
      const start = Date.now();
      (function check() {
        if (window.google?.maps?.places) return resolve(true);
        if (Date.now() - start > timeout) return resolve(false);
        setTimeout(check, 100);
      })();
    });

    // Use Places API (which is already proven to work for autocomplete)
    const geocodeAddress = async (address) => {
      const ready = await waitForPlaces();
      if (!ready) {
        console.warn('[Quoting] Google Places not loaded');
        return null;
      }
      return new Promise((resolve) => {
        const auto = new google.maps.places.AutocompleteService();
        auto.getPlacePredictions(
          { input: address, types: ['address'], componentRestrictions: { country: 'us' } },
          (predictions, status) => {
            if (status !== google.maps.places.PlacesServiceStatus.OK || !predictions?.length) {
              console.warn('[Quoting] No place predictions for:', address, status);
              return resolve(null);
            }
            const details = new google.maps.places.PlacesService(document.createElement('div'));
            details.getDetails(
              { placeId: predictions[0].place_id, fields: ['geometry', 'formatted_address'] },
              (place, dStatus) => {
                if (dStatus === google.maps.places.PlacesServiceStatus.OK && place?.geometry?.location) {
                  resolve({
                    lat: place.geometry.location.lat(),
                    lng: place.geometry.location.lng(),
                    formatted: place.formatted_address,
                  });
                } else {
                  console.warn('[Quoting] Place details failed:', dStatus);
                  resolve(null);
                }
              }
            );
          }
        );
      });
    };

    const handleSelectClient = async (m) => {
      setClientName(m.name);
      setClientSelected(true);
      if (m.address) setClientAddress(m.address);
      if (m.phone || m.email) setSelectedClientInfo({ phone: m.phone, email: m.email });
      else setSelectedClientInfo(null);

      let center = m.data.mapCenter || m.data.clientLatLng || null;

      // If no saved coords but we have an address (e.g. Jobber client), geocode it
      if (!center && m.address) {
        const geo = await geocodeAddress(m.address);
        if (geo) {
          center = { lat: geo.lat, lng: geo.lng };
          setClientLatLng(center);
          if (geo.formatted) setClientAddress(geo.formatted);
        }
      } else if (center) {
        setClientLatLng(center);
      }

      setMeasurements({
        measurements: m.hasMap ? (m.data.measurements || []) : [],
        mapCenter: center,
        mapAddress: m.address || '',
      });
    };

    const matches = buildMatches();
    const sourceBadge = {
      jobber: { label: 'Jobber', color: 'bg-blue-500/10 text-blue-600' },
      saved: { label: 'Saved', color: 'bg-purple-500/10 text-purple-600' },
      contract: { label: 'Contract', color: 'bg-amber-500/10 text-amber-600' },
      quote: { label: 'Quote', color: 'bg-slate-500/10 text-slate-600' },
    };

    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => setStep('list')} className="p-2 -ml-2 rounded-lg hover:bg-surface-alt transition-colors cursor-pointer">
            <ArrowLeft size={20} className="text-secondary" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-primary">New Quote</h1>
            <p className="text-xs text-tertiary">Step 1 of 4 — Find or add a client</p>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted">
            {jobberLoading ? (
              <><Loader2 size={11} className="animate-spin" /> Searching Jobber…</>
            ) : (
              <><Database size={11} /> Jobber live search</>
            )}
          </div>
        </div>

        {/* Selected client card OR search */}
        {clientSelected ? (
          <div className="bg-card rounded-2xl shadow-sm border border-brand/30 ring-1 ring-brand/20 overflow-hidden">
            <div className="bg-brand/5 px-5 py-3 flex items-center justify-between border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <CheckCircle size={16} className="text-brand" />
                <span className="text-xs font-bold uppercase tracking-wider text-brand">Selected Client</span>
              </div>
              <button
                onClick={() => {
                  setClientSelected(false);
                  setClientName('');
                  setClientAddress('');
                  setClientLatLng(null);
                  setSelectedClientInfo(null);
                  setMeasurements({ measurements: [], mapCenter: null, mapAddress: '' });
                  addressAutocomplete.clear();
                }}
                className="text-xs text-muted hover:text-primary cursor-pointer"
              >
                Change
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-brand-light flex items-center justify-center shrink-0">
                  <User size={18} className="text-brand-text-strong" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-primary truncate">{clientName}</h2>
                  {clientAddress && (
                    <p className="text-xs text-muted flex items-start gap-1 mt-0.5">
                      <MapPin size={11} className="mt-0.5 shrink-0" />
                      <span className="truncate">{clientAddress}</span>
                    </p>
                  )}
                </div>
              </div>
              {selectedClientInfo && (selectedClientInfo.phone || selectedClientInfo.email) && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-border-subtle/50">
                  {selectedClientInfo.phone && (
                    <a href={`tel:${selectedClientInfo.phone}`} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-surface-alt text-secondary hover:bg-surface-alt/70">
                      <Phone size={11} /> {selectedClientInfo.phone}
                    </a>
                  )}
                  {selectedClientInfo.email && (
                    <a href={`mailto:${selectedClientInfo.email}`} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-surface-alt text-secondary hover:bg-surface-alt/70">
                      <Mail size={11} /> {selectedClientInfo.email}
                    </a>
                  )}
                </div>
              )}
              {clientLatLng && (
                <p className="text-[11px] text-emerald-600 flex items-center gap-1">
                  <CheckCircle size={11} /> Location pinned
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-5 space-y-4">
            {/* Big search */}
            <div className="relative">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                autoFocus
                value={clientName}
                onChange={(e) => { setClientName(e.target.value); setClientSelected(false); }}
                placeholder="Search clients by name..."
                className="w-full rounded-xl border border-border-strong bg-surface pl-11 pr-4 py-3.5 text-base text-primary outline-none focus:ring-2 focus:ring-brand placeholder:text-muted"
              />
            </div>

            {/* Results */}
            {clientName.trim().length >= 2 && (
              matches.length > 0 ? (
                <div className="border border-border-subtle rounded-xl overflow-hidden divide-y divide-border-subtle/50 max-h-80 overflow-y-auto">
                  {matches.map((m, i) => {
                    const badge = sourceBadge[m.source] || sourceBadge.saved;
                    return (
                      <button
                        key={i}
                        onClick={() => handleSelectClient(m)}
                        className="w-full text-left px-4 py-3 hover:bg-surface-alt transition-colors cursor-pointer flex items-center gap-3"
                      >
                        <div className="w-9 h-9 rounded-full bg-surface-alt flex items-center justify-center shrink-0">
                          <User size={15} className="text-muted" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-primary truncate">{m.name}</p>
                          {m.address && <p className="text-[11px] text-muted truncate">{m.address}</p>}
                          {(m.phone || m.email) && (
                            <p className="text-[10px] text-muted truncate mt-0.5">
                              {[m.phone, m.email].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${badge.color}`}>{badge.label}</span>
                          {m.hasMap && <span className="text-[9px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">Mapped</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="border border-dashed border-border-subtle rounded-xl px-4 py-6 text-center">
                  <p className="text-sm text-muted">No matches found</p>
                  <button
                    onClick={() => { setClientSelected(true); setSelectedClientInfo(null); }}
                    className="mt-2 text-xs text-brand font-semibold hover:underline cursor-pointer"
                  >
                    + Use "{clientName}" as new client
                  </button>
                </div>
              )
            )}

            {clientName.trim().length < 2 && (
              <p className="text-[11px] text-muted text-center py-2">
                Type at least 2 characters to search across Jobber, saved clients, contracts, and past quotes
              </p>
            )}
          </div>
        )}

        {/* Address (only shown when client selected manually with no address) */}
        {clientSelected && !clientAddress && (
          <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-5">
            <label className="block text-xs font-medium text-secondary mb-1.5">Property Address</label>
            <div className="relative">
              <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={addressAutocomplete.search || clientAddress}
                onChange={(e) => {
                  setClientAddress(e.target.value);
                  addressAutocomplete.setSearch(e.target.value);
                }}
                placeholder="Start typing an address..."
                className="w-full rounded-xl border border-border-strong bg-surface pl-9 pr-10 py-2.5 text-sm text-primary outline-none focus:ring-2 focus:ring-brand placeholder:text-muted"
              />
              {addressAutocomplete.loading && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted animate-spin" />}
              {!addressAutocomplete.loading && clientLatLng && <CheckCircle size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" />}
            </div>
            {addressAutocomplete.suggestions.length > 0 && (
              <div className="mt-1 border border-border-subtle rounded-xl overflow-hidden">
                {addressAutocomplete.suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => { setClientAddress(s.displayName); setClientLatLng({ lat: s.lat, lng: s.lng }); addressAutocomplete.clear(); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-primary hover:bg-surface-alt transition-colors cursor-pointer border-b border-border-subtle/50 last:border-b-0"
                  >
                    {s.displayName}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Saved property indicator */}
        {savedProperty && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-center gap-3">
            <CheckCircle size={20} className="text-emerald-500 shrink-0" />
            <div>
              <p className="text-sm font-bold text-emerald-600">Property already mapped</p>
              <p className="text-xs text-muted">{savedProperty.measurements?.length} areas saved — you can skip to services</p>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          {savedProperty && (
            <button
              onClick={() => {
                setMeasurements({ measurements: savedProperty.measurements, mapCenter: savedProperty.mapCenter, mapAddress: clientAddress });
                if (savedProperty.mapCenter) setClientLatLng(savedProperty.mapCenter);
                setStep('services');
              }}
              disabled={!clientName.trim()}
              className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-brand text-on-brand font-semibold hover:bg-brand-hover transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Skip to Services <ArrowRight size={16} />
            </button>
          )}
          <button
            onClick={() => {
              if (clientLatLng) {
                setMeasurements((prev) => ({ ...prev, mapCenter: clientLatLng, mapAddress: clientAddress }));
              }
              if (savedProperty) {
                setMeasurements({ measurements: savedProperty.measurements, mapCenter: savedProperty.mapCenter || clientLatLng, mapAddress: clientAddress });
              }
              setStep('measurements');
            }}
            disabled={!clientName.trim()}
            className={`${savedProperty ? '' : 'flex-1'} inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl ${savedProperty ? 'border border-border-subtle text-secondary hover:bg-surface-alt' : 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:opacity-90'} font-semibold transition-opacity cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {savedProperty ? 'Re-map Property' : 'Next: Measure Property'} <ArrowRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  // ─── Render: Measurements step ───

  if (step === 'measurements') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep('client')} className="p-2 rounded-lg hover:bg-surface-alt transition-colors cursor-pointer">
            <ArrowLeft size={20} className="text-secondary" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-primary">Measure Property</h1>
            <p className="text-sm text-tertiary">Step 2 of 4: Draw areas on the map</p>
          </div>
        </div>

        {clientAddress && (
          <p className="text-sm text-secondary flex items-center gap-2">
            <MapPin size={14} className="text-muted" /> {clientAddress}
          </p>
        )}

        <div className="bg-card rounded-2xl shadow-sm border border-border-subtle overflow-hidden">
          <div style={{ height: '50vh' }}>
            <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-muted">Loading map...</div>}>
              <MapView
                key={measurements.mapCenter ? `${measurements.mapCenter.lat}-${measurements.mapCenter.lng}` : 'default'}
                center={measurements.mapCenter ? [measurements.mapCenter.lat, measurements.mapCenter.lng] : null}
                propertyAddress={clientAddress}
                onMeasurementsChange={(updater) => {
                  setMeasurements((prev) => {
                    const next = typeof updater === 'function' ? updater(prev.measurements) : updater;
                    return { ...prev, measurements: next };
                  });
                }}
                measurements={measurements.measurements}
              />
            </Suspense>
          </div>
        </div>

        <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-5">
          <h3 className="text-sm font-bold text-primary mb-3">Measurements</h3>
          <Suspense fallback={null}>
            <MeasurementList
              measurements={measurements.measurements}
              onUpdate={(id, changes) => {
                setMeasurements((prev) => ({
                  ...prev,
                  measurements: prev.measurements.map((m) => (m.id === id ? { ...m, ...changes } : m)),
                }));
              }}
              onDelete={(id) => {
                setMeasurements((prev) => ({
                  ...prev,
                  measurements: prev.measurements.filter((m) => m.id !== id),
                }));
              }}
            />
          </Suspense>
        </div>

        <button
          onClick={() => setStep('services')}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold hover:opacity-90 transition-opacity cursor-pointer"
        >
          Next: Select Services
          <ArrowRight size={16} />
        </button>
      </div>
    );
  }

  // ─── Render: Services step ───

  if (step === 'services') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep(quickMode ? 'list' : 'measurements')} className="p-2 rounded-lg hover:bg-surface-alt transition-colors cursor-pointer">
            <ArrowLeft size={20} className="text-secondary" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-primary">Select Services</h1>
            <p className="text-sm text-tertiary">{quickMode ? 'Step 1 of 2: Choose services' : 'Step 3 of 4: Choose services for this quote'}</p>
          </div>
        </div>

        <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-6">
          <label className="block text-sm font-semibold text-primary mb-3">What services does this quote include?</label>
          <div className="space-y-5">
            {SERVICE_SECTIONS.map((section) => (
              <div key={section.label}>
                <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-2">{section.label}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {section.services.map((svc) => {
                    const Icon = svc.icon;
                    const active = selectedServices.has(svc.id);
                    return (
                      <button
                        key={svc.id}
                        onClick={() => toggleService(svc.id)}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all cursor-pointer ${
                          active
                            ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 shadow-sm'
                            : 'border-border-subtle hover:border-border-strong hover:bg-surface-alt'
                        }`}
                      >
                        <Icon size={24} className={active ? 'text-emerald-600' : 'text-muted'} />
                        <span className={`text-sm font-medium ${active ? 'text-emerald-700 dark:text-emerald-300' : 'text-secondary'}`}>{svc.label}</span>
                        {active && (
                          <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={() => {
            // Auto-fill lawn sqft from measurements
            const excludes = measurements.measurements.filter((m) => m.category === 'exclude');
            const lawnAreas = measurements.measurements.filter((m) => (m.category || 'lawn') === 'lawn');
            if (lawnAreas.length > 0) {
              const lawnNet = lawnAreas.reduce((sum, m) => sum + getNetSqft(m, excludes), 0);
              if (lawnNet > 0) update('lawn', 'sqft', String(lawnNet));
            }
            setStep('calculator');
          }}
          disabled={selectedServices.size === 0}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next: Build Quote
          <ArrowRight size={16} />
        </button>
      </div>
    );
  }

  // ─── Render: Calculator step ───

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => setStep('services')} className="p-2 rounded-lg hover:bg-surface-alt transition-colors cursor-pointer">
          <ArrowLeft size={20} className="text-secondary" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-primary">{clientName}</h1>
          <p className="text-sm text-tertiary">{quickMode ? 'Step 2 of 2: Fill in the numbers' : 'Step 4 of 4: Fill in the numbers'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Only selected calculators */}
        <div className="lg:col-span-2 space-y-6">

          {/* Collapsible measurements reference panel */}
          {measurements.measurements.length > 0 && (
            <div className="bg-card rounded-2xl shadow-sm border border-border-subtle">
              <button
                onClick={() => setMeasurementsOpen((v) => !v)}
                className="w-full flex items-center justify-between p-5 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <MapPin size={16} className="text-muted" />
                  <h2 className="text-sm font-bold text-primary">Measurements Reference</h2>
                  <span className="text-xs text-muted">({measurements.measurements.length} area{measurements.measurements.length !== 1 ? 's' : ''})</span>
                </div>
                {measurementsOpen ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />}
              </button>
              {measurementsOpen && (() => {
                const catMeta = { lawn: { label: 'Lawn', color: '#22c55e' }, beds: { label: 'Beds', color: '#ef4444' }, exclude: { label: 'Exclude', color: '#6b7280' } };
                const groups = {};
                measurements.measurements.forEach((m) => {
                  const cat = m.category || 'lawn';
                  if (!groups[cat]) groups[cat] = [];
                  groups[cat].push(m);
                });
                const excludes = groups.exclude || [];
                const lawnNet = (groups.lawn || []).reduce((s, m) => s + getNetSqft(m, excludes), 0);
                const bedsNet = (groups.beds || []).reduce((s, m) => s + getNetSqft(m, excludes), 0);
                const netTotal = lawnNet + bedsNet;
                return (
                  <div className="px-5 pb-5 space-y-3">
                    {['lawn', 'beds', 'exclude'].map((catId) => {
                      const items = groups[catId];
                      if (!items || items.length === 0) return null;
                      const meta = catMeta[catId];
                      const catGross = items.reduce((s, m) => s + m.sqft, 0);
                      const isExclude = catId === 'exclude';
                      const catNet = isExclude ? catGross : items.reduce((s, m) => s + getNetSqft(m, excludes), 0);
                      return (
                        <div key={catId}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: meta.color }} />
                            <span className="text-xs font-bold text-secondary uppercase tracking-wide">{meta.label}</span>
                            <span className="text-xs font-semibold text-muted ml-auto">{isExclude ? '-' : ''}{(isExclude ? catGross : catNet).toLocaleString('en-US')} ft²</span>
                          </div>
                          {items.map((m) => (
                            <div key={m.id} className={`flex items-center gap-3 rounded-lg px-3 py-2 border mb-1 ${isExclude ? 'bg-gray-50 dark:bg-gray-900/20 border-gray-300 dark:border-gray-700' : 'bg-surface border-border-subtle'}`}>
                              <span className="w-4 h-4 rounded-sm shrink-0" style={{ backgroundColor: m.color }} />
                              <span className="flex-1 min-w-0 text-sm font-medium text-primary truncate">{m.label}</span>
                              <span className="text-sm font-semibold text-secondary whitespace-nowrap">{isExclude ? '-' : ''}{m.sqft.toLocaleString('en-US')} ft²</span>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between pt-2 border-t border-border-default">
                      <span className="text-sm font-bold text-primary">Net Total</span>
                      <span className="text-sm font-bold text-primary">{Math.max(0, netTotal).toLocaleString('en-US')} ft²</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── Annual Contract Toggle ── */}
          <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays size={18} className="text-blue-500" />
                <span className="text-sm font-bold text-primary">Annual Contract</span>
              </div>
              <button
                onClick={() => update('annual', 'enabled', !data.annual.enabled)}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                  data.annual.enabled
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-400'
                    : 'bg-surface-alt text-muted border-border-subtle hover:text-secondary'
                }`}
              >
                {data.annual.enabled ? 'Annual On' : 'Off'}
              </button>
            </div>
            {data.annual.enabled && (
              <div className="mt-4 space-y-3">
                <p className="text-xs text-muted">Total annual cost divided by 12 = flat monthly payment.</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {has('lawn') && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-secondary mb-1">Lawn Frequency</label>
                        <select value={data.annual.lawnFrequency} onChange={(e) => update('annual', 'lawnFrequency', e.target.value)} className="w-full rounded-lg border border-border-strong bg-card px-4 py-2.5 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand">
                          <option value="weekly">Weekly</option>
                          <option value="biweekly">Every Other Week</option>
                        </select>
                      </div>
                      <InputField label="Mowing Weeks/Year" value={data.annual.mowingWeeks} onChange={(v) => update('annual', 'mowingWeeks', v)} placeholder="35" />
                    </>
                  )}
                  {has('leafMaint') && <InputField label="Leaf Maint Visits/Year" value={data.annual.leafMaintVisits} onChange={(v) => update('annual', 'leafMaintVisits', v)} placeholder="8" />}
                </div>
                {(has('lawn') || has('leafMaint')) && (() => {
                  const isWeekly = data.lawn?.override
                    ? (data.lawn.overrideDisplay || 'eow') === 'weekly'
                    : data.annual.lawnFrequency === 'weekly';
                  const mowWeeks = num(data.annual.mowingWeeks) || 35;
                  const mowVisits = isWeekly ? mowWeeks : Math.ceil(mowWeeks / 2);
                  const leafVisits = num(data.annual.leafMaintVisits) || 8;
                  const totalVisits = (has('lawn') ? mowVisits : 0) + (has('leafMaint') ? leafVisits : 0);
                  return (
                    <div className="mt-3 flex flex-wrap gap-3 text-xs">
                      {has('lawn') && (
                        <div className="bg-surface-alt rounded-lg px-3 py-2 border border-border-subtle">
                          <span className="font-bold text-primary">Mowing</span>
                          <span className="text-muted ml-1">Mar – Oct · {mowVisits} visits ({isWeekly ? 'Weekly' : 'EOW'})</span>
                        </div>
                      )}
                      {has('leafMaint') && (
                        <div className="bg-surface-alt rounded-lg px-3 py-2 border border-border-subtle">
                          <span className="font-bold text-primary">Leaves</span>
                          <span className="text-muted ml-1">Nov – Feb · {leafVisits} visits (EOW)</span>
                        </div>
                      )}
                      <div className="bg-surface-alt rounded-lg px-3 py-2 border border-brand">
                        <span className="font-bold text-brand-text-strong">Total: {totalVisits} visits/year</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* ── Lawn Care ── */}
          {has('lawn') && (
            <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-primary flex items-center gap-2"><Sprout size={20} className="text-green-600" /> Lawn Maintenance</h2>
                <button
                  onClick={() => update('lawn', 'override', !data.lawn.override)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                    data.lawn.override
                      ? 'bg-brand-light text-brand-text-strong border-brand'
                      : 'bg-surface-alt text-muted border-border-subtle hover:text-secondary'
                  }`}
                >
                  {data.lawn.override ? 'Override On' : 'Override'}
                </button>
              </div>
              {data.lawn.override ? (
                <>
                  <p className="text-xs text-muted">Set your own prices instead of using the tier calculator.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <InputField label="Weekly Price" value={data.lawn.overrideWeekly} onChange={(v) => update('lawn', 'overrideWeekly', v)} placeholder="0" prefix="$" />
                    <InputField label="Every Other Week Price" value={data.lawn.overrideBiweekly} onChange={(v) => update('lawn', 'overrideBiweekly', v)} placeholder="0" prefix="$" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-secondary mb-1.5">Show in quote summary</p>
                    <div className="flex gap-2">
                      {[['weekly', 'Weekly'], ['eow', 'Every Other Week']].map(([val, label]) => (
                        <button
                          key={val}
                          onClick={() => update('lawn', 'overrideDisplay', val)}
                          className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                            (data.lawn.overrideDisplay || 'eow') === val
                              ? 'bg-brand-light text-brand-text-strong border-brand'
                              : 'bg-surface-alt text-muted border-border-subtle hover:text-secondary'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <InputField label="Mowable Sq Ft" value={data.lawn.sqft} onChange={(v) => update('lawn', 'sqft', v)} placeholder="0" />
                    <div>
                      <label className="block text-xs font-medium text-secondary mb-1">Difficulty</label>
                      <select value={data.lawn.difficulty} onChange={(e) => update('lawn', 'difficulty', e.target.value)} className="w-full rounded-lg border border-border-strong bg-card px-4 py-2.5 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand">
                        <option value="easy">Easy (1.0x)</option>
                        <option value="moderate">Moderate (1.15x)</option>
                        <option value="hard">Hard (1.3x)</option>
                      </select>
                    </div>
                  </div>
                  <div className="border-t border-border-subtle pt-4">
                    <div className="grid grid-cols-2 gap-3">
                      <ReadonlyField label="Weekly Price" value={`$${fmt(lawnCalc.weekly)}`} />
                      <ReadonlyField label="Every Other Week Price" value={`$${fmt(lawnCalc.biweekly)}`} />
                    </div>
                    {(lawnCalc.weekly <= (num(settings.lawnWeeklyMin) || 55)) && num(data.lawn.sqft) > 0 && (
                      <p className="text-[10px] text-muted mt-2">Minimum applied ($${fmt(num(settings.lawnWeeklyMin) || 55)} weekly / $${fmt(num(settings.lawnBiweeklyMin) || 70)} EOW)</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Bushes (Trimming / Overgrown / Removal) ── */}
          {has('bushes') && (
            <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-6 space-y-5">
              <h2 className="text-lg font-bold text-primary flex items-center gap-2"><Shrub size={20} className="text-green-600" /> Bushes</h2>

              {/* Sub-mode toggles */}
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'trimming', label: 'Trimming', color: 'green' },
                  { key: 'overgrown', label: 'Overgrown', color: 'orange' },
                  { key: 'removal', label: 'Removal', color: 'red' },
                ].map((mode) => (
                  <button
                    key={mode.key}
                    onClick={() => {
                      const modes = { ...(data.bushes.modes || { trimming: true, overgrown: false, removal: false }), [mode.key]: !(data.bushes.modes || {})[mode.key] };
                      update('bushes', 'modes', modes);
                    }}
                    className={`text-xs font-semibold px-4 py-2 rounded-full border transition-colors cursor-pointer ${
                      (data.bushes.modes || {})[mode.key]
                        ? `bg-${mode.color}-100 text-${mode.color}-700 border-${mode.color}-300 dark:bg-${mode.color}-900/40 dark:text-${mode.color}-300 dark:border-${mode.color}-700`
                        : 'bg-surface-alt text-muted border-border-subtle hover:text-secondary'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              {/* ── Trimming sub-section ── */}
              {data.bushes.modes?.trimming && (
                <div className="space-y-4 border-t border-border-subtle pt-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-primary flex items-center gap-2"><Scissors size={16} className="text-green-600" /> Trimming</h3>
                    <button
                      onClick={() => update('bushes', 'override', !data.bushes.override)}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                        data.bushes.override
                          ? 'bg-brand-light text-brand-text-strong border-brand'
                          : 'bg-surface-alt text-muted border-border-subtle hover:text-secondary'
                      }`}
                    >
                      {data.bushes.override ? 'Override On' : 'Override'}
                    </button>
                  </div>
                  <p className="text-[10px] text-muted">3× per year — Apr, Jul, Oct</p>
                  {data.bushes.override ? (
                    <>
                      <p className="text-xs text-muted">Set your own per-visit price.</p>
                      <InputField label="Per Visit Price" value={data.bushes.overridePerVisit} onChange={(v) => update('bushes', 'overridePerVisit', v)} placeholder="0" prefix="$" />
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-4 gap-3">
                        <InputField label={`Small ($${settings?.bushPrices?.small || DEFAULT_BUSH_PRICES.small}/ea)`} value={data.bushes.small} onChange={(v) => update('bushes', 'small', v)} placeholder="0" />
                        <InputField label={`Medium ($${settings?.bushPrices?.medium || DEFAULT_BUSH_PRICES.medium}/ea)`} value={data.bushes.medium} onChange={(v) => update('bushes', 'medium', v)} placeholder="0" />
                        <InputField label={`Large ($${settings?.bushPrices?.large || DEFAULT_BUSH_PRICES.large}/ea)`} value={data.bushes.large} onChange={(v) => update('bushes', 'large', v)} placeholder="0" />
                        <InputField label={`XL ($${settings?.bushPrices?.xl || DEFAULT_BUSH_PRICES.xl}/ea)`} value={data.bushes.xl} onChange={(v) => update('bushes', 'xl', v)} placeholder="0" />
                      </div>
                      {bushesCalc.totalCount > 0 && (
                        <div className="border-t border-border-subtle pt-4">
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <ReadonlyField label="Per Visit" value={`$${fmt(bushesCalc.perVisit)}`} />
                            <ReadonlyField label="Total Bushes" value={String(bushesCalc.totalCount)} />
                          </div>
                          {bushesCalc.perVisit === 35 && bushesCalc.totalCount > 0 && (
                            <p className="text-[10px] text-muted mt-2">$35 minimum applied</p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── Overgrown sub-section ── */}
              {data.bushes.modes?.overgrown && (
                <div className="space-y-4 border-t border-border-subtle pt-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-primary flex items-center gap-2"><Shrub size={16} className="text-orange-500" /> Overgrown</h3>
                    <button
                      onClick={() => update('overgrownBushes', 'override', !data.overgrownBushes.override)}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                        data.overgrownBushes.override
                          ? 'bg-brand-light text-brand-text-strong border-brand'
                          : 'bg-surface-alt text-muted border-border-subtle hover:text-secondary'
                      }`}
                    >
                      {data.overgrownBushes.override ? 'Override On' : 'Override'}
                    </button>
                  </div>
                  <p className="text-[10px] text-muted">One-time — same bush sizes, mark which are overgrown for {DEFAULT_OVERGROWN_MULTIPLIER}× surcharge</p>
                  {data.overgrownBushes.override ? (
                    <>
                      <p className="text-xs text-muted">Set your own total price for overgrown trimming.</p>
                      <InputField label="Total Price" value={data.overgrownBushes.overridePrice} onChange={(v) => update('overgrownBushes', 'overridePrice', v)} placeholder="0" prefix="$" />
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-4 gap-3">
                        <InputField label={`Small ($${settings?.bushPrices?.small || DEFAULT_BUSH_PRICES.small}/ea)`} value={data.overgrownBushes.small} onChange={(v) => update('overgrownBushes', 'small', v)} placeholder="0" />
                        <InputField label={`Medium ($${settings?.bushPrices?.medium || DEFAULT_BUSH_PRICES.medium}/ea)`} value={data.overgrownBushes.medium} onChange={(v) => update('overgrownBushes', 'medium', v)} placeholder="0" />
                        <InputField label={`Large ($${settings?.bushPrices?.large || DEFAULT_BUSH_PRICES.large}/ea)`} value={data.overgrownBushes.large} onChange={(v) => update('overgrownBushes', 'large', v)} placeholder="0" />
                        <InputField label={`XL ($${settings?.bushPrices?.xl || DEFAULT_BUSH_PRICES.xl}/ea)`} value={data.overgrownBushes.xl} onChange={(v) => update('overgrownBushes', 'xl', v)} placeholder="0" />
                      </div>
                      <InputField label={`# Overgrown (${DEFAULT_OVERGROWN_MULTIPLIER}× surcharge)`} value={data.overgrownBushes.overgrown} onChange={(v) => update('overgrownBushes', 'overgrown', v)} placeholder="0" />
                      {overgrownBushesCalc.totalCount > 0 && (
                        <div className="border-t border-border-subtle pt-3">
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <ReadonlyField label="Total Bushes" value={String(overgrownBushesCalc.totalCount)} />
                            {overgrownBushesCalc.overgrownSurcharge > 0 && <ReadonlyField label="Surcharge" value={`$${fmt(overgrownBushesCalc.overgrownSurcharge)}`} />}
                            <ReadonlyField label="Quote" value={`$${fmt(overgrownBushesCalc.quote)}`} />
                          </div>
                          {overgrownBushesCalc.quote === 50 && <p className="text-[10px] text-muted mt-2">$50 minimum applied</p>}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── Removal sub-section ── */}
              {data.bushes.modes?.removal && (
                <div className="space-y-4 border-t border-border-subtle pt-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-primary flex items-center gap-2"><Trash2 size={16} className="text-red-500" /> Removal</h3>
                    <button
                      onClick={() => update('bushRemoval', 'override', !data.bushRemoval.override)}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                        data.bushRemoval.override
                          ? 'bg-brand-light text-brand-text-strong border-brand'
                          : 'bg-surface-alt text-muted border-border-subtle hover:text-secondary'
                      }`}
                    >
                      {data.bushRemoval.override ? 'Override On' : 'Override'}
                    </button>
                  </div>
                  <p className="text-[10px] text-muted">One-time — physically removing bushes, roots and all</p>
                  {data.bushRemoval.override ? (
                    <>
                      <p className="text-xs text-muted">Set your own total price for bush removal.</p>
                      <InputField label="Total Price" value={data.bushRemoval.overridePrice} onChange={(v) => update('bushRemoval', 'overridePrice', v)} placeholder="0" prefix="$" />
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-4 gap-3">
                        <InputField label={`Small ($${DEFAULT_REMOVAL_PRICES.small}/ea)`} value={data.bushRemoval.small} onChange={(v) => update('bushRemoval', 'small', v)} placeholder="0" />
                        <InputField label={`Medium ($${DEFAULT_REMOVAL_PRICES.medium}/ea)`} value={data.bushRemoval.medium} onChange={(v) => update('bushRemoval', 'medium', v)} placeholder="0" />
                        <InputField label={`Large ($${DEFAULT_REMOVAL_PRICES.large}/ea)`} value={data.bushRemoval.large} onChange={(v) => update('bushRemoval', 'large', v)} placeholder="0" />
                        <InputField label={`XL ($${DEFAULT_REMOVAL_PRICES.xl}/ea)`} value={data.bushRemoval.xl} onChange={(v) => update('bushRemoval', 'xl', v)} placeholder="0" />
                      </div>
                      <InputField label="Haul-Off Fee" value={data.bushRemoval.haulOff} onChange={(v) => update('bushRemoval', 'haulOff', v)} placeholder="0" prefix="$" />
                      {bushRemovalCalc.totalCount > 0 && (
                        <div className="border-t border-border-subtle pt-3">
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <ReadonlyField label="Total Bushes" value={String(bushRemovalCalc.totalCount)} />
                            {bushRemovalCalc.haulOff > 0 && <ReadonlyField label="Haul-Off" value={`$${fmt(bushRemovalCalc.haulOff)}`} />}
                            <ReadonlyField label="Quote" value={`$${fmt(bushRemovalCalc.quote)}`} />
                          </div>
                          {bushRemovalCalc.quote === 75 && <p className="text-[10px] text-muted mt-2">$75 minimum applied</p>}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Leaf Maintenance ── */}
          {has('leafMaint') && (
            <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-primary flex items-center gap-2"><Leaf size={20} className="text-amber-500" /> Leaf Maintenance</h2>
                <button
                  onClick={() => update('leafMaint', 'override', !data.leafMaint.override)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                    data.leafMaint.override
                      ? 'bg-brand-light text-brand-text-strong border-brand'
                      : 'bg-surface-alt text-muted border-border-subtle hover:text-secondary'
                  }`}
                >
                  {data.leafMaint.override ? 'Override On' : 'Override'}
                </button>
              </div>
              <p className="text-[10px] text-muted">Recurring leaf blowing/cleanup — priced per visit</p>
              {data.leafMaint.override ? (
                <>
                  <p className="text-xs text-muted">Set your own per-visit price.</p>
                  <InputField label="Per Visit Price" value={data.leafMaint.overridePerVisit} onChange={(v) => update('leafMaint', 'overridePerVisit', v)} placeholder="0" prefix="$" />
                </>
              ) : (
                <InputField label="Per Visit Price" value={data.leafMaint.perVisit} onChange={(v) => update('leafMaint', 'perVisit', v)} placeholder="0" prefix="$" />
              )}
              {leafMaintCalc.perVisit > 0 && (
                <div className="border-t border-border-subtle pt-4">
                  <ReadonlyField label="Per Visit" value={`$${fmt(leafMaintCalc.perVisit)}`} />
                </div>
              )}
            </div>
          )}

          {/* ── Aeration ── */}
          {has('aeration') && (
            <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-primary flex items-center gap-2"><CircleDot size={20} className="text-green-600" /> Aeration</h2>
                <button
                  onClick={() => update('aeration', 'override', !data.aeration.override)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                    data.aeration.override
                      ? 'bg-brand-light text-brand-text-strong border-brand'
                      : 'bg-surface-alt text-muted border-border-subtle hover:text-secondary'
                  }`}
                >
                  {data.aeration.override ? 'Override On' : 'Override'}
                </button>
              </div>
              {data.aeration.override ? (
                <>
                  <p className="text-xs text-muted">Set total price for aeration & seed combined.</p>
                  <InputField label="Total Price (Aeration + Seed)" value={data.aeration.overridePrice} onChange={(v) => update('aeration', 'overridePrice', v)} placeholder="0" prefix="$" />
                </>
              ) : (
                <>
                  <InputField label="Lawn Sq Ft" value={data.aeration.sqft} onChange={(v) => update('aeration', 'sqft', v)} placeholder="0" />
                  {num(data.aeration.sqft) > 0 && (
                    <div className="border-t border-border-subtle pt-4">
                      <ReadonlyField label="Aeration Price" value={`$${fmt(aerationCalc.aerationPrice)}`} />
                      <p className="text-[10px] text-muted mt-2">
                        {num(data.aeration.sqft) <= (num(settings?.aerationThreshold) || DEFAULT_AERATION_THRESHOLD)
                          ? `Base rate: $${num(settings?.aerationBase) || DEFAULT_AERATION_BASE} (up to ${((num(settings?.aerationThreshold) || DEFAULT_AERATION_THRESHOLD) / 1000).toLocaleString()}k sqft)`
                          : `$${num(settings?.aerationBase) || DEFAULT_AERATION_BASE} base + $${num(settings?.aerationPer1k) || DEFAULT_AERATION_PER_1K}/1k sqft over ${((num(settings?.aerationThreshold) || DEFAULT_AERATION_THRESHOLD) / 1000).toLocaleString()}k`
                        }
                      </p>
                    </div>
                  )}
                </>
              )}

              {!data.aeration.override && (
                <>
                  {/* ── Overseeding toggle ── */}
                  <div className="border-t border-border-subtle pt-4">
                    <button
                      onClick={() => update('aeration', 'includeOverseed', !data.aeration.includeOverseed)}
                      className={`flex items-center gap-2 text-sm font-medium transition-colors cursor-pointer ${
                        data.aeration.includeOverseed ? 'text-brand-text-strong' : 'text-muted hover:text-secondary'
                      }`}
                    >
                      <div className={`w-9 h-5 rounded-full transition-colors relative ${data.aeration.includeOverseed ? 'bg-brand' : 'bg-gray-300 dark:bg-gray-600'}`}>
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${data.aeration.includeOverseed ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </div>
                      Include Seed
                    </button>
                  </div>

                  {data.aeration.includeOverseed && (
                    <div className="space-y-3 pl-1">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-secondary uppercase tracking-wide">Seed</p>
                        <button
                          onClick={() => update('aeration', 'overrideOverseed', !data.aeration.overrideOverseed)}
                          className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                            data.aeration.overrideOverseed
                              ? 'bg-brand-light text-brand-text-strong border-brand'
                              : 'bg-surface-alt text-muted border-border-subtle hover:text-secondary'
                          }`}
                        >
                          {data.aeration.overrideOverseed ? 'Override On' : 'Override'}
                        </button>
                      </div>
                      {data.aeration.overrideOverseed ? (
                        <InputField label="Seed Price" value={data.aeration.overrideOverseedPrice} onChange={(v) => update('aeration', 'overrideOverseedPrice', v)} placeholder="0" prefix="$" />
                      ) : (
                        <>
                          <div className="grid grid-cols-3 gap-3">
                            <InputField label="Lbs / 1,000 sqft" value={data.aeration.seedRate} onChange={(v) => update('aeration', 'seedRate', v)} placeholder="8" />
                            <InputField label="Bag Price (50 lb)" value={data.aeration.bagPrice} onChange={(v) => update('aeration', 'bagPrice', v)} prefix="$" placeholder="190" />
                            <InputField label="Our Bag Cost" value={data.aeration.ourBagCost} onChange={(v) => update('aeration', 'ourBagCost', v)} prefix="$" placeholder="0" />
                          </div>
                          {aerationCalc.seedLbs > 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <ReadonlyField label="Seed Needed" value={`${aerationCalc.seedLbs} lbs`} />
                              <ReadonlyField label="Seed Quote" value={`$${fmt(aerationCalc.overseedQuote)}`} />
                              <ReadonlyField label="Material Cost (incl. 7% tax)" value={`$${fmt(aerationCalc.overseedCogs)}`} />
                              <ReadonlyField label="Seed Profit" value={`$${fmt(aerationCalc.overseedProfit)}`} />
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Combined total */}
                  {aerationCalc.quote > 0 && (data.aeration.includeOverseed && aerationCalc.overseedQuote > 0) && (
                    <div className="border-t border-border-subtle pt-3">
                      <div className="flex justify-between text-sm font-bold">
                        <span className="text-primary">Aeration + Seed Total</span>
                        <span className="text-emerald-600">${fmt(aerationCalc.quote)}</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Mulch ── */}
          {has('mulch') && (
            <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-6 space-y-4">
              <h2 className="text-lg font-bold text-primary flex items-center gap-2"><Trees size={20} className="text-emerald-600" /> Mulch</h2>

              {/* ── Inputs ── */}
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Mulch Type</label>
                <select value={data.mulch.mulchType} onChange={(e) => updateMulchType(e.target.value)} className="w-full rounded-lg border border-border-strong bg-card px-4 py-2.5 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand">
                  {mulchTypes.map((t) => <option key={t.label} value={t.label}>{t.label} (${t.pricePerYd}/yd)</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <InputField label="Sqft" value={data.mulch.sqft} onChange={(v) => update('mulch', 'sqft', v)} placeholder="0" />
                <InputField label="Depth (in)" value={data.mulch.depth} onChange={(v) => update('mulch', 'depth', v)} placeholder="0" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <InputField label="Charge / Yard" value={data.mulch.chargePerYd} onChange={(v) => update('mulch', 'chargePerYd', v)} prefix="$" placeholder="65" />
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">Difficulty</label>
                  <select value={data.mulch.difficulty} onChange={(e) => update('mulch', 'difficulty', e.target.value)} className="w-full rounded-lg border border-border-strong bg-card px-4 py-2.5 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand">
                    <option value="easy">Easy (1.0x)</option>
                    <option value="moderate">Moderate (1.1x)</option>
                    <option value="hard">Hard (1.4x)</option>
                  </select>
                </div>
              </div>

              {/* ── Breakdown ── */}
              <div className="border-t border-border-subtle pt-3 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted">Yards needed (10% buffer)</span><span className="text-primary font-medium">{fmt(mulchCalc.cubicYards)} yd</span></div>
                <div className="flex justify-between"><span className="text-muted">Mulch material</span><span className="text-primary">${fmt(mulchCalc.material)}</span></div>
                <div className="flex justify-between"><span className="text-muted">Mulch delivery ({mulchCalc.loads} load{mulchCalc.loads !== 1 ? 's' : ''})</span><span className="text-primary">${fmt(mulchCalc.delivery)}</span></div>
                <div className="flex justify-between"><span className="text-muted">Tax (7%)</span><span className="text-primary">${fmt(mulchCalc.tax)}</span></div>
                <div className="flex justify-between font-semibold pt-1.5 border-t border-border-subtle"><span className="text-secondary">Your Cost</span><span className="text-red-400">${fmt(mulchCalc.cogs)}</span></div>
              </div>

              <div className="border-t border-border-subtle pt-3 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted">Mulch spread ({fmt(mulchCalc.cubicYards)} yd × ${data.mulch.chargePerYd}{mulchCalc.diffMult > 1 ? ` × ${mulchCalc.diffMult}x` : ''})</span><span className="text-primary">${fmt(mulchCalc.labor)}</span></div>
                <div className="flex justify-between font-semibold pt-1.5 border-t border-border-subtle"><span className="text-secondary">Your Revenue</span><span className="text-blue-400">${fmt(mulchCalc.labor)}</span></div>
              </div>

              {/* ── Quote ── */}
              <div className="border-t-2 border-emerald-500/30 pt-3">
                <div className="flex justify-between text-lg font-bold">
                  <span className="text-primary">Quote</span>
                  <span className="text-emerald-500">${fmt(mulchCalc.quote)}</span>
                </div>
                <p className="text-[10px] text-muted mt-1">Cost {'$'}{fmt(mulchCalc.cogs)} + Revenue {'$'}{fmt(mulchCalc.labor)}</p>
              </div>

              {/* ── Job Profit ── */}
              {mulchCalc.quote > 0 && (() => {
                const crewCost = num(data.mulch.crewSize) * num(data.mulch.estHours) * num(data.mulch.crewRate);
                const profit = mulchCalc.labor - crewCost;
                const profitPerHr = num(data.mulch.estHours) > 0 ? profit / num(data.mulch.estHours) : 0;
                return (
                  <div className="border-t border-border-subtle pt-4 space-y-3">
                    <p className="text-xs font-bold text-secondary uppercase tracking-wide">Job Profit</p>
                    <div className="grid grid-cols-3 gap-3">
                      <InputField label="Crew Size" value={data.mulch.crewSize} onChange={(v) => update('mulch', 'crewSize', v)} placeholder="2" />
                      <InputField label="Est. Hours" value={data.mulch.estHours} onChange={(v) => update('mulch', 'estHours', v)} placeholder="0" />
                      <InputField label="Rate/hr" value={data.mulch.crewRate} onChange={(v) => update('mulch', 'crewRate', v)} prefix="$" placeholder="17" />
                    </div>
                    {num(data.mulch.estHours) > 0 && (
                      <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between"><span className="text-muted">Crew cost ({data.mulch.crewSize} × {data.mulch.estHours}hr × ${data.mulch.crewRate})</span><span className="text-primary">${fmt(crewCost)}</span></div>
                        <div className="flex justify-between font-semibold"><span className="text-secondary">Your Profit</span><span className={profit >= 0 ? 'text-emerald-400' : 'text-red-400'}>${fmt(profit)}</span></div>
                        <div className="flex justify-between font-semibold"><span className="text-secondary">Profit / Hour</span><span className={profitPerHr >= 0 ? 'text-emerald-400' : 'text-red-400'}>${fmt(profitPerHr)}/hr</span></div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── Rock Installation ── */}
          {has('rock') && (
            <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-6 space-y-4">
              <h2 className="text-lg font-bold text-primary flex items-center gap-2"><Mountain size={20} className="text-slate-500" /> Rock</h2>

              {/* ── Inputs ── */}
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Rock Type</label>
                <select value={data.rock.rockType} onChange={(e) => updateRockType(e.target.value)} className="w-full rounded-lg border border-border-strong bg-card px-4 py-2.5 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand">
                  {rockTypes.map((t) => <option key={t.label} value={t.label}>{t.label} (${t.pricePerYd}/yd)</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <InputField label="Sqft" value={data.rock.sqft} onChange={(v) => update('rock', 'sqft', v)} placeholder="0" />
                <InputField label="Depth (in)" value={data.rock.depth} onChange={(v) => update('rock', 'depth', v)} placeholder="3" />
                <InputField label="Equipment" value={data.rock.equipmentCost} onChange={(v) => update('rock', 'equipmentCost', v)} prefix="$" placeholder="0" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <InputField label="Charge / Yard" value={data.rock.chargePerYd} onChange={(v) => update('rock', 'chargePerYd', v)} prefix="$" placeholder="150" />
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">Difficulty</label>
                  <select value={data.rock.difficulty} onChange={(e) => update('rock', 'difficulty', e.target.value)} className="w-full rounded-lg border border-border-strong bg-card px-4 py-2.5 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand">
                    <option value="easy">Easy (1.0x)</option>
                    <option value="moderate">Moderate (1.1x)</option>
                    <option value="hard">Hard (1.4x)</option>
                  </select>
                </div>
              </div>

              {/* ── Breakdown ── */}
              <div className="border-t border-border-subtle pt-3 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted">Yards needed (10% buffer)</span><span className="text-primary font-medium">{fmt(rockCalc.cubicYards)} yd</span></div>
                <div className="flex justify-between"><span className="text-muted">Rock material</span><span className="text-primary">${fmt(rockCalc.material)}</span></div>
                <div className="flex justify-between"><span className="text-muted">Fabric ({rockCalc.fabricRolls} roll{rockCalc.fabricRolls !== 1 ? 's' : ''})</span><span className="text-primary">${fmt(rockCalc.fabricCost)}</span></div>
                <div className="flex justify-between"><span className="text-muted">Delivery ({rockCalc.loads} load{rockCalc.loads !== 1 ? 's' : ''})</span><span className="text-primary">${fmt(rockCalc.delivery)}</span></div>
                {num(data.rock.equipmentCost) > 0 && <div className="flex justify-between"><span className="text-muted">Equipment</span><span className="text-primary">${fmt(num(data.rock.equipmentCost))}</span></div>}
                <div className="flex justify-between"><span className="text-muted">Tax (7%)</span><span className="text-primary">${fmt(rockCalc.tax)}</span></div>
                <div className="flex justify-between font-semibold pt-1.5 border-t border-border-subtle"><span className="text-secondary">Your Cost</span><span className="text-red-400">${fmt(rockCalc.cogs)}</span></div>
              </div>

              <div className="border-t border-border-subtle pt-3 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted">Rock spread ({fmt(rockCalc.cubicYards)} yd × ${data.rock.chargePerYd}{rockCalc.diffMult > 1 ? ` × ${rockCalc.diffMult}x` : ''})</span><span className="text-primary">${fmt(rockCalc.cubicYards * num(data.rock.chargePerYd) * (rockCalc.diffMult || 1))}</span></div>
                <div className="flex justify-between"><span className="text-muted">Fabric install ({fmt(rockCalc.fabricSqft)} sqft × $0.75)</span><span className="text-primary">${fmt(rockCalc.fabricCharge)}</span></div>
                <div className="flex justify-between font-semibold pt-1.5 border-t border-border-subtle"><span className="text-secondary">Your Revenue</span><span className="text-blue-400">${fmt(rockCalc.labor)}</span></div>
              </div>

              {/* ── Quote ── */}
              <div className="border-t-2 border-emerald-500/30 pt-3">
                <div className="flex justify-between text-lg font-bold">
                  <span className="text-primary">Quote</span>
                  <span className="text-emerald-500">${fmt(rockCalc.quote)}</span>
                </div>
                <p className="text-[10px] text-muted mt-1">Cost {'$'}{fmt(rockCalc.cogs)} + Revenue {'$'}{fmt(rockCalc.labor)}</p>
              </div>

              {/* ── Job Profit ── */}
              {rockCalc.quote > 0 && (() => {
                const crewCost = num(data.rock.crewSize) * num(data.rock.estHours) * num(data.rock.crewRate);
                const profit = rockCalc.labor - crewCost;
                const profitPerHr = num(data.rock.estHours) > 0 ? profit / num(data.rock.estHours) : 0;
                return (
                  <div className="border-t border-border-subtle pt-4 space-y-3">
                    <p className="text-xs font-bold text-secondary uppercase tracking-wide">Job Profit</p>
                    <div className="grid grid-cols-3 gap-3">
                      <InputField label="Crew Size" value={data.rock.crewSize} onChange={(v) => update('rock', 'crewSize', v)} placeholder="2" />
                      <InputField label="Est. Hours" value={data.rock.estHours} onChange={(v) => update('rock', 'estHours', v)} placeholder="0" />
                      <InputField label="Rate/hr" value={data.rock.crewRate} onChange={(v) => update('rock', 'crewRate', v)} prefix="$" placeholder="17" />
                    </div>
                    {num(data.rock.estHours) > 0 && (
                      <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between"><span className="text-muted">Crew cost ({data.rock.crewSize} × {data.rock.estHours}hr × ${data.rock.crewRate})</span><span className="text-primary">${fmt(crewCost)}</span></div>
                        <div className="flex justify-between font-semibold"><span className="text-secondary">Your Profit</span><span className={profit >= 0 ? 'text-emerald-400' : 'text-red-400'}>${fmt(profit)}</span></div>
                        <div className="flex justify-between font-semibold"><span className="text-secondary">Profit / Hour</span><span className={profitPerHr >= 0 ? 'text-emerald-400' : 'text-red-400'}>${fmt(profitPerHr)}/hr</span></div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── Edging ── */}
          {has('edging') && (
            <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-6 space-y-4">
              <h2 className="text-lg font-bold text-primary flex items-center gap-2"><Ruler size={20} className="text-blue-500" /> Edging</h2>

              {/* ── Job Info ── */}
              <div className="grid grid-cols-2 gap-3">
                <InputField label="Linear Feet" value={data.edging.linearFeet} onChange={(v) => update('edging', 'linearFeet', v)} placeholder="0" />
                <InputField label="Unit Length (ft/piece)" value={data.edging.unitLength} onChange={(v) => update('edging', 'unitLength', v)} placeholder="20" />
              </div>
              <ReadonlyField label="Units Needed" value={edgingCalc.unitsNeeded} />

              {/* ── COGS ── */}
              <div className="border-t border-border-subtle pt-4 space-y-3">
                <p className="text-xs font-bold text-secondary uppercase tracking-wide">COGS — What this job costs you</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <InputField label="Cost / Unit" value={data.edging.costPerUnit} onChange={(v) => update('edging', 'costPerUnit', v)} prefix="$" placeholder="0" />
                  <ReadonlyField label="Material" value={`$${fmt(edgingCalc.material)}`} />
                  <InputField label="Delivery" value={data.edging.delivery} onChange={(v) => update('edging', 'delivery', v)} prefix="$" placeholder="0" />
                </div>
                <div className="border-t border-border-subtle pt-3">
                  <ReadonlyField label="Tax (7%)" value={`$${fmt(edgingCalc.tax)}`} />
                  <div className="flex justify-between text-sm font-bold pt-2">
                    <span className="text-secondary">Total COGS</span>
                    <span className="text-red-400">${fmt(edgingCalc.cogs)}</span>
                  </div>
                </div>
              </div>

              {/* ── Labor ── */}
              <div className="border-t border-border-subtle pt-4 space-y-3">
                <p className="text-xs font-bold text-secondary uppercase tracking-wide">Revenue — What you charge</p>
                <div className="grid grid-cols-2 gap-3">
                  <InputField label="Charge / Foot" value={data.edging.chargePerFoot} onChange={(v) => update('edging', 'chargePerFoot', v)} prefix="$" placeholder="5" />
                  <div>
                    <label className="block text-xs font-medium text-secondary mb-1">Difficulty</label>
                    <select value={data.edging.difficulty} onChange={(e) => update('edging', 'difficulty', e.target.value)} className="w-full rounded-lg border border-border-strong bg-card px-4 py-2.5 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand">
                      <option value="easy">Easy — Straight runs (1.0x)</option>
                      <option value="moderate">Moderate — Some curves (1.1x)</option>
                      <option value="hard">Hard — Tight/curves/roots (1.4x)</option>
                    </select>
                  </div>
                </div>
                <div className="border-t border-border-subtle pt-3">
                  <div className="flex justify-between text-sm font-bold">
                    <span className="text-secondary">Your Revenue</span>
                    <span className="text-blue-400">${fmt(edgingCalc.labor)}</span>
                  </div>
                </div>
              </div>

              {/* ── Quote Total ── */}
              <div className="border-t-2 border-emerald-500/30 pt-4">
                <div className="flex justify-between text-lg font-bold">
                  <span className="text-primary">Quote</span>
                  <span className="text-emerald-500">${fmt(edgingCalc.quote)}</span>
                </div>
                <p className="text-[10px] text-muted mt-1">Cost {'$'}{fmt(edgingCalc.cogs)} + Revenue {'$'}{fmt(edgingCalc.labor)}</p>
              </div>
            </div>
          )}

          {/* ── Pine Needles ── */}
          {has('pine') && (
            <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-primary flex items-center gap-2"><TreePine size={20} className="text-amber-600" /> Pine Needles</h2>
                <button
                  onClick={() => update('pine', 'override', !data.pine.override)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                    data.pine.override
                      ? 'bg-brand-light text-brand-text-strong border-brand'
                      : 'bg-surface-alt text-muted border-border-subtle hover:text-secondary'
                  }`}
                >
                  {data.pine.override ? 'Override On' : 'Override'}
                </button>
              </div>
              {data.pine.override ? (
                <>
                  <p className="text-xs text-muted">Set your own pine needles price.</p>
                  <InputField label="Pine Needles Price" value={data.pine.overridePrice} onChange={(v) => update('pine', 'overridePrice', v)} placeholder="0" prefix="$" />
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <InputField label="Bales" value={data.pine.bales} onChange={(v) => update('pine', 'bales', v)} placeholder="0" />
                    <InputField label="Our Cost / Bale" value={data.pine.ourCost} onChange={(v) => update('pine', 'ourCost', v)} prefix="$" placeholder="4.25" />
                    <InputField label="Labor / Bale" value={data.pine.laborPerBale} onChange={(v) => update('pine', 'laborPerBale', v)} prefix="$" placeholder="0" />
                    <InputField label="Delivery" value={data.pine.delivery} onChange={(v) => update('pine', 'delivery', v)} prefix="$" placeholder="0" />
                  </div>
                  {num(data.pine.bales) > 0 && num(data.pine.laborPerBale) > 0 && (
                    <div className="grid grid-cols-3 gap-3 pt-2 border-t border-border-subtle">
                      <ReadonlyField label="Quote" value={`$${fmt(pineCalc.quote)}`} />
                      <ReadonlyField label="Material Cost" value={`$${fmt(pineCalc.cogs)}`} />
                      <ReadonlyField label="Profit" value={`$${fmt(pineCalc.profit)}`} />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Leaf Cleanup ── */}
          {has('leafCleanup') && (
            <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-6 space-y-4">
              <h2 className="text-lg font-bold text-primary flex items-center gap-2"><Leaf size={20} className="text-amber-600" /> Leaf Cleanup</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">Yard Size</label>
                  <select value={data.leafCleanup.yardSize} onChange={(e) => update('leafCleanup', 'yardSize', e.target.value)} className="w-full rounded-lg border border-border-strong bg-card px-4 py-2.5 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand">
                    <option value="S">Small</option>
                    <option value="M">Medium</option>
                    <option value="L">Large</option>
                    <option value="XL">Extra Large</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">Leaf Volume</label>
                  <select value={data.leafCleanup.leafVolume} onChange={(e) => update('leafCleanup', 'leafVolume', e.target.value)} className="w-full rounded-lg border border-border-strong bg-card px-4 py-2.5 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand">
                    <option value="LIGHT">Light</option>
                    <option value="MED">Medium</option>
                    <option value="HEAVY">Heavy</option>
                    <option value="EXTREME">Extreme</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">Fence Access</label>
                  <select value={data.leafCleanup.fenceAccess} onChange={(e) => update('leafCleanup', 'fenceAccess', e.target.value)} className="w-full rounded-lg border border-border-strong bg-card px-4 py-2.5 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand">
                    <option value="NONE">None</option>
                    <option value="EASY_GATE">Easy Gate (+$25)</option>
                    <option value="TIGHT_GATE">Tight Gate (+$75)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">Difficulty</label>
                  <select value={data.leafCleanup.difficulty} onChange={(e) => update('leafCleanup', 'difficulty', e.target.value)} className="w-full rounded-lg border border-border-strong bg-card px-4 py-2.5 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand">
                    <option value="NORMAL">Normal (1.0x)</option>
                    <option value="HARD">Hard (1.25x)</option>
                  </select>
                </div>
              </div>

              {/* Haul-Off Toggle */}
              <div className="border-t border-border-subtle pt-4 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <div className={`relative w-10 h-5 rounded-full transition-colors ${data.leafCleanup.haulOff ? 'bg-emerald-500' : 'bg-gray-600'}`}
                    onClick={() => setData(prev => ({ ...prev, leafCleanup: { ...prev.leafCleanup, haulOff: !prev.leafCleanup.haulOff } }))}>
                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${data.leafCleanup.haulOff ? 'translate-x-5' : ''}`} />
                  </div>
                  <span className="text-sm font-semibold text-primary">Haul-Off</span>
                </label>
                {data.leafCleanup.haulOff && (
                  <div className="max-w-[200px]">
                    <label className="block text-xs font-medium text-secondary mb-1">Loads ($75/load, $50 min)</label>
                    <select value={data.leafCleanup.haulLoads} onChange={(e) => update('leafCleanup', 'haulLoads', e.target.value)} className="w-full rounded-lg border border-border-strong bg-card px-4 py-2.5 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand">
                      <option value="0.5">0.5</option>
                      <option value="1">1</option>
                      <option value="1.5">1.5</option>
                      <option value="2">2</option>
                      <option value="2.5">2.5</option>
                      <option value="3">3</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Calculated results */}
              <div className="border-t border-border-subtle pt-4 space-y-3">
                <p className="text-xs font-bold text-secondary uppercase tracking-wide">Calculated</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <ReadonlyField label="Base Price" value={`$${fmt(leafCleanupCalc.base)}`} />
                  <ReadonlyField label="Fence Fee" value={`$${fmt(leafCleanupCalc.fenceFee)}`} />
                  <ReadonlyField label="Haul Fee" value={`$${fmt(leafCleanupCalc.haulFee)}`} />
                </div>
                {leafCleanupCalc.multiplier > 1 && (
                  <p className="text-[10px] text-muted">Hard difficulty: {leafCleanupCalc.multiplier}x multiplier applied</p>
                )}
                {leafCleanupCalc.minApplied && (
                  <p className="text-[10px] text-muted">Minimum job price ($150) applied</p>
                )}
                <ReadonlyField label="Leaf Cleanup Quote" value={`$${fmt(leafCleanupCalc.quote)}`} className="max-w-[200px]" />
              </div>
            </div>
          )}

          {/* ── Other services (flat $) ── */}
          {has('overgrownLawn') && (
            <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-6 space-y-4">
              <h2 className="text-lg font-bold text-primary">Other Services</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {has('overgrownLawn') && <InputField label="Overgrown Lawn" value={data.other.overgrownLawn} onChange={(v) => update('other', 'overgrownLawn', v)} prefix="$" placeholder="0" />}
              </div>
            </div>
          )}
        </div>

        {/* Right: Summary */}
        <div className="lg:col-span-1">
          <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-6 space-y-4 lg:sticky lg:top-24">
            <h2 className="text-lg font-bold text-primary">Quote Summary</h2>

            {/* Per-service breakdown table */}
            {(() => {
              const isAnnual = data.annual.enabled;
              const lines = [];
              let totalCost = 0;

              if (has('lawn') && lawnCalc.quote > 0) {
                const isWeekly = data.lawn.override
                  ? (data.lawn.overrideDisplay || 'eow') === 'weekly'
                  : data.annual.lawnFrequency === 'weekly';
                const perCut = isWeekly ? lawnCalc.weekly : lawnCalc.biweekly;
                if (isAnnual) {
                  const weeks = num(data.annual.mowingWeeks) || 35;
                  const cuts = isWeekly ? weeks : Math.ceil(weeks / 2);
                  const annual = perCut * cuts;
                  lines.push({ label: 'Lawn Maintenance', per: perCut, times: cuts, timesLabel: isWeekly ? `${cuts} cuts` : `${cuts} cuts (EOW)`, quote: annual, cost: 0 });
                } else {
                  lines.push({ label: `Lawn Maintenance${data.lawn.override ? ' (Override)' : ''}`, detail: `W: $${fmt(lawnCalc.weekly)} / EOW: $${fmt(lawnCalc.biweekly)}`, quote: lawnCalc.biweekly, cost: 0 });
                }
              }
              if (has('bushes') && bushesCalc.quote > 0) {
                if (isAnnual) {
                  const annual = bushesCalc.perVisit * 3;
                  lines.push({ label: 'Bush Maintenance', per: bushesCalc.perVisit, times: 3, timesLabel: '3×/yr', quote: annual, cost: 0 });
                } else {
                  lines.push({ label: `Bush Maintenance${data.bushes.override ? ' (Override)' : ''}`, detail: '3×/yr (Apr, Jul, Oct) · Per Visit', quote: bushesCalc.perVisit, cost: 0 });
                }
              }
              if (has('leafMaint') && leafMaintCalc.quote > 0) {
                if (isAnnual) {
                  const visits = num(data.annual.leafMaintVisits) || 8;
                  const annual = leafMaintCalc.perVisit * visits;
                  lines.push({ label: 'Leaf Maintenance', per: leafMaintCalc.perVisit, times: visits, timesLabel: `${visits}×/yr`, quote: annual, cost: 0 });
                } else {
                  lines.push({ label: `Leaf Maintenance${data.leafMaint.override ? ' (Override)' : ''}`, detail: 'Per Visit', quote: leafMaintCalc.perVisit, cost: 0 });
                }
              }
              if (has('aeration') && (aerationCalc.aerationPrice > 0 || aerationCalc.quote > 0)) {
                const osCost = (data.aeration.includeOverseed && aerationCalc.overseedCogs) ? aerationCalc.overseedCogs : 0;
                totalCost += osCost;
                if (isAnnual) {
                  lines.push({ label: data.aeration.includeOverseed ? 'Aeration + Seed' : 'Aeration', per: aerationCalc.quote, times: 1, timesLabel: '1×/yr', quote: aerationCalc.quote, cost: osCost });
                } else {
                  const ap = aerationCalc.aerationPrice || aerationCalc.quote;
                  lines.push({ label: `Aeration${data.aeration.override ? ' (Override)' : ''}`, quote: ap, cost: 0 });
                  if (data.aeration.includeOverseed && aerationCalc.overseedQuote > 0) {
                    lines.push({ label: `  Seed${data.aeration.overrideOverseed ? ' (Override)' : ''}`, detail: aerationCalc.seedLbs > 0 ? `${aerationCalc.seedLbs} lbs seed` : null, quote: aerationCalc.overseedQuote, cost: osCost, indent: true });
                  }
                }
              }
              if (has('mulch') && mulchCalc.quote > 0) {
                const mCostPer = mulchCalc.material + mulchCalc.delivery + mulchCalc.tax + (mulchCalc.equipment || 0);
                const visits = isAnnual ? (num(data.annual.mulchVisits) || 1) : 1;
                totalCost += mCostPer * visits;
                lines.push(isAnnual
                  ? { label: 'Mulch', per: mulchCalc.quote, times: visits, timesLabel: `${visits}×/yr`, quote: mulchCalc.quote * visits, cost: mCostPer * visits }
                  : { label: 'Mulch', quote: mulchCalc.quote, cost: mCostPer });
              }
              if (has('rock') && rockCalc.quote > 0) {
                const rCostPer = rockCalc.material + rockCalc.delivery + rockCalc.tax + (rockCalc.equipment || 0);
                const visits = isAnnual ? (num(data.annual.rockVisits) || 1) : 1;
                totalCost += rCostPer * visits;
                lines.push(isAnnual
                  ? { label: 'Rock', per: rockCalc.quote, times: visits, timesLabel: `${visits}×/yr`, quote: rockCalc.quote * visits, cost: rCostPer * visits }
                  : { label: 'Rock', quote: rockCalc.quote, cost: rCostPer });
              }
              if (has('edging') && edgingCalc.quote > 0) {
                const eCostPer = edgingCalc.material + edgingCalc.delivery + edgingCalc.tax;
                const visits = isAnnual ? (num(data.annual.edgingVisits) || 1) : 1;
                totalCost += eCostPer * visits;
                lines.push(isAnnual
                  ? { label: 'Edging', per: edgingCalc.quote, times: visits, timesLabel: `${visits}×/yr`, quote: edgingCalc.quote * visits, cost: eCostPer * visits }
                  : { label: 'Edging', quote: edgingCalc.quote, cost: eCostPer });
              }
              if (has('pine') && pineCalc.quote > 0) {
                const pCostPer = pineCalc.cogs || 0;
                const visits = isAnnual ? (num(data.annual.pineVisits) || 1) : 1;
                totalCost += pCostPer * visits;
                lines.push(isAnnual
                  ? { label: 'Pine Needles', per: pineCalc.quote, times: visits, timesLabel: `${visits}×/yr`, quote: pineCalc.quote * visits, cost: pCostPer * visits }
                  : { label: `Pine Needles${data.pine.override ? ' (Override)' : ''}`, detail: !data.pine.override && num(data.pine.bales) > 0 ? `${data.pine.bales} bales` : null, quote: pineCalc.quote, cost: pCostPer });
              }
              if (has('leafCleanup') && leafCleanupCalc.quote > 0) {
                const visits = isAnnual ? (num(data.annual.leafVisits) || 1) : 1;
                lines.push(isAnnual
                  ? { label: 'Leaf Cleanup', per: leafCleanupCalc.quote, times: visits, timesLabel: `${visits}×/yr`, quote: leafCleanupCalc.quote * visits, cost: 0 }
                  : { label: 'Leaf Cleanup', quote: leafCleanupCalc.quote, cost: 0 });
              }
              if (has('overgrownLawn') && num(data.other.overgrownLawn) > 0) {
                const q = num(data.other.overgrownLawn);
                lines.push(isAnnual
                  ? { label: 'Overgrown Lawn', per: q, times: 1, timesLabel: '1×', quote: q, cost: 0 }
                  : { label: 'Overgrown Lawn', quote: q, cost: 0 });
              }
              if (overgrownBushesCalc.quote > 0) {
                const q = overgrownBushesCalc.quote;
                lines.push(isAnnual
                  ? { label: `Overgrown Bushes${data.overgrownBushes.override ? ' (Override)' : ''}`, per: q, times: 1, timesLabel: '1×', quote: q, cost: 0 }
                  : { label: `Overgrown Bushes${data.overgrownBushes.override ? ' (Override)' : ''}`, detail: overgrownBushesCalc.totalCount > 0 ? `${overgrownBushesCalc.totalCount} bushes (${overgrownBushesCalc.overgrownCount || 0} overgrown)` : null, quote: q, cost: 0 });
              }
              if (bushRemovalCalc.quote > 0) {
                const q = bushRemovalCalc.quote;
                lines.push(isAnnual
                  ? { label: `Bush Removal${data.bushRemoval.override ? ' (Override)' : ''}`, per: q, times: 1, timesLabel: '1×', quote: q, cost: 0 }
                  : { label: `Bush Removal${data.bushRemoval.override ? ' (Override)' : ''}`, detail: bushRemovalCalc.totalCount > 0 ? `${bushRemovalCalc.totalCount} bushes removed` : null, quote: q, cost: 0 });
              }

              const totalQuote = lines.reduce((s, l) => s + l.quote, 0);
              const totalProfit = totalQuote - totalCost;

              if (lines.length === 0) return <p className="text-sm text-muted italic">No services calculated yet.</p>;

              // ── Annual view ──
              if (isAnnual) {
                const monthly = totalQuote / 12;
                const monthlyCost = totalCost / 12;
                const monthlyProfit = monthly - monthlyCost;
                return (
                  <div className="space-y-3">
                    {/* Monthly payment hero */}
                    <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-300 dark:border-blue-700 px-5 py-4 text-center">
                      <p className="text-xs text-secondary mb-1">Monthly Payment</p>
                      <p className="text-3xl font-bold text-blue-600">${fmt(monthly)}</p>
                      <p className="text-[11px] text-muted mt-1">${fmt(totalQuote)}/yr &divide; 12 months</p>
                    </div>

                    {/* Header row */}
                    <div className="grid grid-cols-[1fr_50px_65px_65px] gap-1 text-[10px] font-bold text-muted uppercase tracking-wider">
                      <span>Service</span>
                      <span className="text-right">Freq</span>
                      <span className="text-right">Annual</span>
                      <span className="text-right">Cost</span>
                    </div>

                    {/* Service rows */}
                    <div className="space-y-1.5">
                      {lines.map((l, i) => (
                        <div key={i}>
                          <div className="grid grid-cols-[1fr_50px_65px_65px] gap-1 items-center">
                            <span className="text-xs font-medium text-primary truncate">{l.label}</span>
                            <span className="text-[10px] text-right text-muted">{l.timesLabel}</span>
                            <span className="text-xs text-right font-semibold text-primary">${fmt(l.quote)}</span>
                            <span className="text-xs text-right text-muted">{l.cost > 0 ? `$${fmt(l.cost)}` : '\u2014'}</span>
                          </div>
                          {l.per > 0 && l.times > 1 && <p className="text-[10px] text-muted mt-0.5">${fmt(l.per)} each</p>}
                        </div>
                      ))}
                    </div>

                    {/* Annual totals */}
                    <div className="border-t-2 border-border-subtle pt-3 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="font-bold text-primary">Annual Total</span>
                        <span className="font-bold text-primary">${fmt(totalQuote)}</span>
                      </div>
                      {totalCost > 0 && (
                        <>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted">Annual Cost</span>
                            <span className="text-muted">${fmt(totalCost)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="font-bold text-primary">Annual Profit</span>
                            <span className={`font-bold ${totalProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>${fmt(totalProfit)}</span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Monthly breakdown */}
                    <div className="rounded-xl bg-surface-alt border border-border-subtle px-4 py-3 space-y-1.5">
                      <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Monthly Breakdown</p>
                      <div className="flex justify-between text-sm">
                        <span className="text-primary font-semibold">Revenue</span>
                        <span className="text-primary font-semibold">${fmt(monthly)}</span>
                      </div>
                      {totalCost > 0 && (
                        <>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted">Cost</span>
                            <span className="text-muted">${fmt(monthlyCost)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="font-semibold text-primary">Profit</span>
                            <span className={`font-semibold ${monthlyProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>${fmt(monthlyProfit)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              }

              // ── Standard (non-annual) view ──
              return (
                <div className="space-y-3">
                  {/* Total Quote */}
                  <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-300 dark:border-emerald-700 px-5 py-4 text-center">
                    <p className="text-xs text-secondary mb-1">Total Quote</p>
                    <p className="text-2xl font-bold text-emerald-600">${fmt(totalQuote)}</p>
                  </div>

                  {/* Header row */}
                  <div className="grid grid-cols-[1fr_70px_70px_70px] gap-1 text-[10px] font-bold text-muted uppercase tracking-wider">
                    <span>Service</span>
                    <span className="text-right">Quote</span>
                    <span className="text-right">Cost</span>
                    <span className="text-right">Profit</span>
                  </div>

                  {/* Service rows */}
                  <div className="space-y-1.5">
                    {lines.map((l, i) => (
                      <div key={i}>
                        <div className="grid grid-cols-[1fr_70px_70px_70px] gap-1 items-center">
                          <span className={`text-xs font-medium ${l.indent ? 'text-muted' : 'text-primary'} truncate`}>{l.label}</span>
                          <span className="text-xs text-right font-semibold text-primary">${fmt(l.quote)}</span>
                          <span className="text-xs text-right text-muted">{l.cost > 0 ? `$${fmt(l.cost)}` : '\u2014'}</span>
                          <span className={`text-xs text-right font-semibold ${(l.quote - l.cost) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>${fmt(l.quote - l.cost)}</span>
                        </div>
                        {l.detail && <p className="text-[10px] text-muted mt-0.5">{l.detail}</p>}
                      </div>
                    ))}
                  </div>

                  {/* Totals */}
                  <div className="border-t-2 border-border-subtle pt-3">
                    <div className="grid grid-cols-[1fr_70px_70px_70px] gap-1 items-center">
                      <span className="text-sm font-bold text-primary">TOTAL</span>
                      <span className="text-sm text-right font-bold text-primary">${fmt(totalQuote)}</span>
                      <span className="text-sm text-right font-bold text-muted">${fmt(totalCost)}</span>
                      <span className={`text-sm text-right font-bold ${totalProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>${fmt(totalProfit)}</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            <button onClick={handleSave} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold hover:opacity-90 transition-opacity cursor-pointer">
              <Save size={16} /> Save Quote
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
