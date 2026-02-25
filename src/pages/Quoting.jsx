import { useState } from 'react';
import {
  Calculator, Trash2, ChevronDown, ChevronUp, Save,
  Settings, Plus, X, ArrowLeft, ArrowRight, Trees, Mountain,
  Ruler, TreePine, Shrub, Fence, Scissors, Leaf,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../store/AppStoreContext';
import { genId, initialQuotingSettings } from '../data';

const TAX_RATE = 0.07;
const SQ_FT_PER_YD_AT_1IN = 324;
const CREW_HOUR_RATE = 160;

// ─── Service definitions ───

const SERVICE_SECTIONS = [
  {
    label: 'MAINTENANCE',
    services: [
      { id: 'lawn', label: 'Lawn Care', icon: Scissors, color: 'green' },
    ],
  },
  {
    label: 'CLEANUP',
    services: [
      { id: 'bushes', label: 'Bushes', icon: Shrub, color: 'green' },
      { id: 'overgrown', label: 'Overgrown Area', icon: Fence, color: 'orange' },
      { id: 'leafCleanup', label: 'Leaf Cleanup', icon: Leaf, color: 'amber' },
    ],
  },
  {
    label: 'LANDSCAPING',
    services: [
      { id: 'mulch', label: 'Mulch', icon: Trees, color: 'emerald' },
      { id: 'rock', label: 'Rock', icon: Mountain, color: 'slate' },
      { id: 'edging', label: 'Edging', icon: Ruler, color: 'blue' },
      { id: 'pine', label: 'Pine Needles', icon: TreePine, color: 'amber' },
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

const ZERO_CALC = { quote: 0, materialCostTotal: 0, delivery: 0, equipment: 0 };

// ─── Calc functions ───

function calcMulch(m) {
  const sqft = num(m.sqft);
  const depth = num(m.depth);
  const materialCostPerYd = num(m.materialCostPerYd);
  const chargePerYd = num(m.chargePerYd);
  const delivery = num(m.delivery);

  const cubicYards = (sqft * depth) / SQ_FT_PER_YD_AT_1IN;
  const material = cubicYards * materialCostPerYd;
  const equipment = 0;
  const tax = (material + equipment + delivery) * TAX_RATE;
  const labor = cubicYards * chargePerYd;
  const quote = material + equipment + delivery + tax + labor;

  return { cubicYards, material, equipment, delivery, tax, labor, quote };
}

function calcRock(r) {
  const sqft = num(r.sqft);
  const depth = num(r.depth) || 3;
  const pricePerYd = num(r.pricePerYd);
  const chargePerYd = num(r.chargePerYd);
  const equipment = num(r.equipmentCost);
  const delivery = num(r.delivery);

  const cubicFeet = sqft * (depth / 12);
  const cubicYardsRaw = cubicFeet / 27;
  const cubicYardsWithWaste = cubicYardsRaw * 1.15;
  const cubicYards = Math.round(cubicYardsWithWaste * 4) / 4;
  const rockMaterial = cubicYards * pricePerYd;

  // Landscape fabric
  let fabricCost = 0;
  let fabricRollsNeeded = 0;
  if (r.includeFabric && sqft > 0) {
    const coverage = num(r.fabricCoverage) || 1;
    fabricRollsNeeded = Math.ceil(sqft / coverage);
    fabricCost = fabricRollsNeeded * num(r.fabricCostPerRoll);
  }

  const material = rockMaterial + fabricCost;
  const tax = (material + equipment + delivery) * TAX_RATE;
  const labor = cubicYards * chargePerYd;
  const quote = material + equipment + delivery + tax + labor;

  return { cubicYards, rockMaterial, fabricCost, fabricRollsNeeded, material, equipment, delivery, tax, labor, quote };
}

function calcPine(p) {
  const bales = num(p.bales);
  const balePrice = num(p.balePrice);
  const svcCost = num(p.serviceCostPerBale);
  const delivery = num(p.delivery);
  const materialSubtotal = bales * balePrice;
  const materialTax = materialSubtotal * TAX_RATE;
  const materialCostTotal = materialSubtotal + materialTax;
  const quote = bales * (balePrice + svcCost) + materialTax + delivery;
  return { materialTax, materialCostTotal, quote, delivery };
}

function calcEdging(e) {
  const linearFt = num(e.linearFeet);
  const unitLength = num(e.unitLength) || 1;
  const costPerUnit = num(e.costPerUnit);
  const servicePerFt = num(e.servicePerFoot);
  const delivery = num(e.delivery);
  const unitsNeeded = Math.ceil(linearFt / unitLength);
  const materialSubtotal = unitsNeeded * costPerUnit;
  const materialTax = materialSubtotal * TAX_RATE;
  const materialCostTotal = materialSubtotal + materialTax;
  const serviceTotal = linearFt * servicePerFt;
  const quote = materialSubtotal + materialTax + serviceTotal + delivery;
  return { linearFt, unitsNeeded, materialSubtotal, materialTax, materialCostTotal, serviceTotal, material: materialSubtotal, tax: materialTax, labor: serviceTotal, equipment: 0, quote, delivery };
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
  const defaultMulchType = mulchTypes[0] || { label: 'Hardwood', pricePerYd: 36 };

  const makeDefaults = () => ({
    lawn: { sqft: '', difficulty: 'moderate' },
    mulch: { sqft: '', depth: '', materialCostPerYd: String(defaultMulchType.pricePerYd), chargePerYd: '', delivery: '', mulchType: defaultMulchType.label },
    rock: { sqft: '', depth: '3', pricePerYd: '', chargePerYd: '', equipmentCost: '', delivery: '', includeFabric: false, fabricCoverage: '', fabricCostPerRoll: '' },
    edging: { linearFeet: '', unitLength: '20', costPerUnit: '', servicePerFoot: '', delivery: '' },
    pine: { bales: '', balePrice: '', serviceCostPerBale: '', delivery: '' },
    leafCleanup: { yardSize: 'M', leafVolume: 'MED', fenceAccess: 'NONE', haulOff: false, haulLoads: '1', difficulty: 'NORMAL' },
    other: { bushes: '', overgrown: '' },
  });

  // ─── Step state: 'list' | 'setup' | 'calculator' ───
  const [step, setStep] = useState('list');
  const [clientName, setClientName] = useState('');
  const [selectedServices, setSelectedServices] = useState(new Set());
  const [data, setData] = useState(makeDefaults);
  const [showSaved, setShowSaved] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

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


  // Calculations (only for selected services)
  const lawnCalc = has('lawn') ? calcLawn(data.lawn, settings) : ZERO_CALC;
  const mulchCalc = has('mulch') ? calcMulch(data.mulch) : ZERO_CALC;
  const rockCalc = has('rock') ? calcRock(data.rock) : ZERO_CALC;
  const edgingCalc = has('edging') ? calcEdging(data.edging) : ZERO_CALC;
  const pineCalc = has('pine') ? calcPine(data.pine) : ZERO_CALC;
  const leafCleanupCalc = has('leafCleanup') ? calcLeafCleanup(data.leafCleanup) : ZERO_CALC;
  const otherCalcs = {
    quote: (has('bushes') ? num(data.other.bushes) : 0) + (has('overgrown') ? num(data.other.overgrown) : 0),
    materialCostTotal: 0, delivery: 0,
  };
  const summary = calcSummary([lawnCalc, mulchCalc, rockCalc, edgingCalc, pineCalc, leafCleanupCalc, otherCalcs]);


  // ─── Actions ───

  const startNewQuote = () => {
    setClientName('');
    setSelectedServices(new Set());
    setData(makeDefaults());
    setStep('setup');
  };

  const handleSave = () => {
    if (!clientName.trim()) return;
    const newQuote = {
      id: genId(),
      clientName: clientName.trim(),
      date: new Date().toISOString().slice(0, 10),
      services: [...selectedServices],
      lawn: has('lawn') ? { ...data.lawn } : null,
      mulch: has('mulch') ? { ...data.mulch } : null,
      rock: has('rock') ? { ...data.rock } : null,
      edging: has('edging') ? { ...data.edging } : null,
      pineNeedles: has('pine') ? { ...data.pine } : null,
      leafCleanup: has('leafCleanup') ? { ...data.leafCleanup } : null,
      otherServices: { ...data.other },
      total: summary.totalQuote,
      createdBy: currentUser,
    };
    setQuotes([newQuote, ...quotes]);
    setStep('list');
  };

  const handleDelete = (id) => {
    setQuotes(quotes.filter((q) => q.id !== id));
    setConfirmDeleteId(null);
  };

  const handleLoadQuote = (q) => {
    setClientName(q.clientName);
    const svcs = new Set(q.services || []);
    // Backward compat: detect services from data if services array missing
    if (svcs.size === 0) {
      if (q.lawn && num(q.lawn.sqft)) svcs.add('lawn');
      if (q.mulch && (num(q.mulch.sqft) || num(q.mulch.area))) svcs.add('mulch');
      if (q.rock && (num(q.rock.sqft) || num(q.rock.area))) svcs.add('rock');
      if (q.edging && num(q.edging.linearFeet)) svcs.add('edging');
      if (q.pineNeedles && num(q.pineNeedles.bales)) svcs.add('pine');
      if (q.leafCleanup) svcs.add('leafCleanup');
      if (num(q.otherServices?.bushes)) svcs.add('bushes');
      if (num(q.otherServices?.overgrown)) svcs.add('overgrown');
    }
    setSelectedServices(svcs);
    const defs = makeDefaults();
    setData({
      lawn: { ...defs.lawn, ...q.lawn },
      mulch: { ...defs.mulch, ...q.mulch },
      rock: { ...defs.rock, ...q.rock },
      edging: { ...defs.edging, ...q.edging },
      pine: { ...defs.pine, ...q.pineNeedles },
      leafCleanup: { ...defs.leafCleanup, ...q.leafCleanup },
      other: { ...defs.other, ...q.otherServices },
    });
    setStep('calculator');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ─── Render: List view ───

  if (step === 'list') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
              <Calculator size={20} className="text-emerald-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-primary">Quoting</h1>
              <p className="text-sm text-tertiary">{quotes.length} saved {quotes.length === 1 ? 'quote' : 'quotes'}</p>
            </div>
          </div>
          <button
            onClick={startNewQuote}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold hover:opacity-90 transition-opacity cursor-pointer"
          >
            <Plus size={16} />
            New Quote
          </button>
        </div>

        <PricingSettings settings={settings} onUpdate={setSettings} ownerMode={ownerMode} />

        {quotes.length === 0 ? (
          <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-12 text-center">
            <Calculator size={40} className="text-muted mx-auto mb-4" />
            <p className="text-base font-semibold text-secondary mb-1">No quotes yet</p>
            <p className="text-sm text-muted mb-6">Create your first quote to get started.</p>
            <button onClick={startNewQuote} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold hover:opacity-90 transition-opacity cursor-pointer">
              <Plus size={16} /> New Quote
            </button>
          </div>
        ) : (
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
                    {q.date} &middot; ${fmt(q.total)} &middot; by {q.createdBy}
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

  // ─── Render: Setup step ───

  if (step === 'setup') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep('list')} className="p-2 rounded-lg hover:bg-surface-alt transition-colors cursor-pointer">
            <ArrowLeft size={20} className="text-secondary" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-primary">New Quote</h1>
            <p className="text-sm text-tertiary">Step 1: Client &amp; services</p>
          </div>
        </div>

        <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-6 space-y-5">
          <InputField label="Client Name" value={clientName} onChange={setClientName} placeholder="Enter client name..." />

          <div>
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
        </div>

        <button
          onClick={() => setStep('calculator')}
          disabled={!clientName.trim() || selectedServices.size === 0}
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
        <button onClick={() => setStep('setup')} className="p-2 rounded-lg hover:bg-surface-alt transition-colors cursor-pointer">
          <ArrowLeft size={20} className="text-secondary" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-primary">{clientName}</h1>
          <p className="text-sm text-tertiary">Step 2: Fill in the numbers</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Only selected calculators */}
        <div className="lg:col-span-2 space-y-6">

          {/* ── Lawn Care ── */}
          {has('lawn') && (
            <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-6 space-y-4">
              <h2 className="text-lg font-bold text-primary flex items-center gap-2"><Scissors size={20} className="text-green-600" /> Lawn Care</h2>
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
            </div>
          )}

          {/* ── Mulch ── */}
          {has('mulch') && (
            <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-6 space-y-4">
              <h2 className="text-lg font-bold text-primary flex items-center gap-2"><Trees size={20} className="text-emerald-600" /> Mulch</h2>

              {/* Mulch type selector */}
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Mulch Type</label>
                <select value={data.mulch.mulchType} onChange={(e) => updateMulchType(e.target.value)} className="w-full rounded-lg border border-border-strong bg-card px-4 py-2.5 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand">
                  {mulchTypes.map((t) => <option key={t.label} value={t.label}>{t.label} (${t.pricePerYd}/yd)</option>)}
                </select>
              </div>

              {/* Inputs */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <InputField label="Square Feet" value={data.mulch.sqft} onChange={(v) => update('mulch', 'sqft', v)} placeholder="0" />
                <InputField label="Depth (inches)" value={data.mulch.depth} onChange={(v) => update('mulch', 'depth', v)} placeholder="0" />
                <InputField label="Material Cost / Yard" value={data.mulch.materialCostPerYd} onChange={(v) => update('mulch', 'materialCostPerYd', v)} prefix="$" placeholder="0" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <InputField label="Your Charge / Yard" value={data.mulch.chargePerYd} onChange={(v) => update('mulch', 'chargePerYd', v)} prefix="$" placeholder="0" />
                <InputField label="Delivery Fee" value={data.mulch.delivery} onChange={(v) => update('mulch', 'delivery', v)} prefix="$" placeholder="0" />
              </div>

              {/* Calculated results */}
              <div className="border-t border-border-subtle pt-4 space-y-3">
                <p className="text-xs font-bold text-secondary uppercase tracking-wide">Calculated</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <ReadonlyField label="Cubic Yards Needed" value={fmt(mulchCalc.cubicYards)} />
                  <ReadonlyField label="Material Cost" value={`$${fmt(mulchCalc.material)}`} />
                  <ReadonlyField label="Tax (7%)" value={`$${fmt(mulchCalc.tax)}`} />
                </div>
              </div>
            </div>
          )}

          {/* ── Rock Installation ── */}
          {has('rock') && (
            <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-6 space-y-4">
              <h2 className="text-lg font-bold text-primary flex items-center gap-2"><Mountain size={20} className="text-slate-500" /> Rock Installation</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <InputField label="Square Feet" value={data.rock.sqft} onChange={(v) => update('rock', 'sqft', v)} placeholder="0" />
                <InputField label="Depth (inches)" value={data.rock.depth} onChange={(v) => update('rock', 'depth', v)} placeholder="3" />
                <InputField label="Material Cost / Yard" value={data.rock.pricePerYd} onChange={(v) => update('rock', 'pricePerYd', v)} prefix="$" placeholder="0" />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <InputField label="Your Charge / Yard" value={data.rock.chargePerYd} onChange={(v) => update('rock', 'chargePerYd', v)} prefix="$" placeholder="0" />
                <InputField label="Equipment Cost" value={data.rock.equipmentCost} onChange={(v) => update('rock', 'equipmentCost', v)} prefix="$" placeholder="0" />
                <InputField label="Delivery Fee" value={data.rock.delivery} onChange={(v) => update('rock', 'delivery', v)} prefix="$" placeholder="0" />
              </div>

              {/* Landscape Fabric Toggle */}
              <div className="border-t border-border-subtle pt-4 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <div className={`relative w-10 h-5 rounded-full transition-colors ${data.rock.includeFabric ? 'bg-emerald-500' : 'bg-gray-600'}`}
                    onClick={() => setData(prev => ({ ...prev, rock: { ...prev.rock, includeFabric: !prev.rock.includeFabric } }))}>
                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${data.rock.includeFabric ? 'translate-x-5' : ''}`} />
                  </div>
                  <span className="text-sm font-semibold text-primary">Include Landscape Fabric</span>
                </label>
                {data.rock.includeFabric && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <ReadonlyField label="Square Feet Needed" value={data.rock.sqft || '0'} />
                    <InputField label="Coverage per Roll (sqft)" value={data.rock.fabricCoverage} onChange={(v) => update('rock', 'fabricCoverage', v)} placeholder="0" />
                    <InputField label="Cost per Roll" value={data.rock.fabricCostPerRoll} onChange={(v) => update('rock', 'fabricCostPerRoll', v)} prefix="$" placeholder="0" />
                  </div>
                )}
              </div>

              {/* Calculated results */}
              <div className="border-t border-border-subtle pt-4 space-y-3">
                <p className="text-xs font-bold text-secondary uppercase tracking-wide">Calculated</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <ReadonlyField label="Cubic Yards Needed" value={rockCalc.cubicYards.toFixed(2)} />
                  <ReadonlyField label="Rock Material" value={`$${fmt(rockCalc.rockMaterial)}`} />
                  {data.rock.includeFabric && <ReadonlyField label={`Fabric (${rockCalc.fabricRollsNeeded} rolls)`} value={`$${fmt(rockCalc.fabricCost)}`} />}
                  <ReadonlyField label="Total Material" value={`$${fmt(rockCalc.material)}`} />
                  <ReadonlyField label="Tax (7%)" value={`$${fmt(rockCalc.tax)}`} />
                </div>
                <p className="text-[10px] text-muted">Includes 15% waste &middot; Rounded to nearest 0.25 yard</p>
              </div>
            </div>
          )}

          {/* ── Edging ── */}
          {has('edging') && (
            <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-6 space-y-4">
              <h2 className="text-lg font-bold text-primary flex items-center gap-2"><Ruler size={20} className="text-blue-500" /> Edging</h2>
              <div className="rounded-lg bg-surface-alt border border-border-subtle px-4 py-3 text-xs text-secondary space-y-1">
                <p className="font-semibold text-primary text-xs mb-1">Pricing Reference</p>
                <p>Easy, straight runs, soft soil &rarr; <span className="font-semibold text-primary">$4/ft</span></p>
                <p>Normal job &rarr; <span className="font-semibold text-primary">$5/ft</span></p>
                <p>Curves, tight access, harder soil &rarr; <span className="font-semibold text-primary">$6+/ft</span></p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <InputField label="Linear Feet Needed" value={data.edging.linearFeet} onChange={(v) => update('edging', 'linearFeet', v)} placeholder="0" />
                <InputField label="Unit Length (ft/piece)" value={data.edging.unitLength} onChange={(v) => update('edging', 'unitLength', v)} placeholder="20" />
                <InputField label="Cost/Unit" value={data.edging.costPerUnit} onChange={(v) => update('edging', 'costPerUnit', v)} prefix="$" placeholder="0" />
                <InputField label="Service $/Foot" value={data.edging.servicePerFoot} onChange={(v) => update('edging', 'servicePerFoot', v)} prefix="$" placeholder="0" />
                <InputField label="Delivery" value={data.edging.delivery} onChange={(v) => update('edging', 'delivery', v)} prefix="$" placeholder="0" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t border-border-subtle">
                <ReadonlyField label="Units Needed" value={edgingCalc.unitsNeeded} />
                <ReadonlyField label="Material Subtotal" value={`$${fmt(edgingCalc.materialSubtotal)}`} />
                <ReadonlyField label="Material Tax" value={`$${fmt(edgingCalc.materialTax)}`} />
                <ReadonlyField label="Total Material Cost" value={`$${fmt(edgingCalc.materialCostTotal)}`} />
                <ReadonlyField label="Delivery" value={`$${fmt(edgingCalc.delivery)}`} />
                <ReadonlyField label="Service Total" value={`$${fmt(edgingCalc.serviceTotal)}`} />
              </div>
              <div className="pt-2 border-t border-border-subtle">
                <ReadonlyField label="Edging Quote" value={`$${fmt(edgingCalc.quote)}`} className="max-w-[200px]" />
              </div>
            </div>
          )}

          {/* ── Pine Needles ── */}
          {has('pine') && (
            <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-6 space-y-4">
              <h2 className="text-lg font-bold text-primary flex items-center gap-2"><TreePine size={20} className="text-amber-600" /> Pine Needles</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <InputField label="Bales" value={data.pine.bales} onChange={(v) => update('pine', 'bales', v)} placeholder="0" />
                <InputField label="Bale Price" value={data.pine.balePrice} onChange={(v) => update('pine', 'balePrice', v)} prefix="$" placeholder="0" />
                <InputField label="Service/Bale" value={data.pine.serviceCostPerBale} onChange={(v) => update('pine', 'serviceCostPerBale', v)} prefix="$" placeholder="0" />
                <InputField label="Delivery" value={data.pine.delivery} onChange={(v) => update('pine', 'delivery', v)} prefix="$" placeholder="0" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t border-border-subtle">
                <ReadonlyField label="Material Tax" value={`$${fmt(pineCalc.materialTax)}`} />
                <ReadonlyField label="Material Cost" value={`$${fmt(pineCalc.materialCostTotal)}`} />
                <ReadonlyField label="Pine Quote" value={`$${fmt(pineCalc.quote)}`} />
              </div>
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
          {(has('bushes') || has('overgrown')) && (
            <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-6 space-y-4">
              <h2 className="text-lg font-bold text-primary">Other Services</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {has('bushes') && <InputField label="Bushes" value={data.other.bushes} onChange={(v) => update('other', 'bushes', v)} prefix="$" placeholder="0" />}
                {has('overgrown') && <InputField label="Overgrown Area" value={data.other.overgrown} onChange={(v) => update('other', 'overgrown', v)} prefix="$" placeholder="0" />}
              </div>
            </div>
          )}
        </div>

        {/* Right: Summary */}
        <div className="lg:col-span-1">
          <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-6 space-y-4 lg:sticky lg:top-24">
            <h2 className="text-lg font-bold text-primary">Quote Summary</h2>

            {/* Total Quote */}
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-300 dark:border-emerald-700 px-5 py-4 text-center">
              <p className="text-xs text-secondary mb-1">Total Quote</p>
              <p className="text-2xl font-bold text-emerald-600">${fmt(summary.totalQuote)}</p>
            </div>

            {/* Per-service breakdowns */}
            {has('lawn') && lawnCalc.quote > 0 && (
              <div>
                <p className="text-xs font-bold text-secondary uppercase tracking-wide mb-2">Lawn Care</p>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs"><span className="text-secondary">Difficulty</span><span className="text-primary capitalize">{data.lawn.difficulty}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-secondary">Weekly</span><span className="text-primary">${fmt(lawnCalc.weekly)}</span></div>
                  <div className="flex justify-between text-sm font-semibold border-t border-border-subtle pt-1 mt-1"><span className="text-primary">Every Other Week</span><span className="text-emerald-600">${fmt(lawnCalc.biweekly)}</span></div>
                </div>
              </div>
            )}

            {has('mulch') && mulchCalc.quote > 0 && (
              <div>
                <p className="text-xs font-bold text-secondary uppercase tracking-wide mb-2">Mulch</p>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs"><span className="text-secondary">Material</span><span className="text-primary">${fmt(mulchCalc.material)}</span></div>
                  {mulchCalc.equipment > 0 && <div className="flex justify-between text-xs"><span className="text-secondary">Equipment</span><span className="text-primary">${fmt(mulchCalc.equipment)}</span></div>}
                  <div className="flex justify-between text-xs"><span className="text-secondary">Delivery</span><span className="text-primary">${fmt(mulchCalc.delivery)}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-secondary">Tax</span><span className="text-primary">${fmt(mulchCalc.tax)}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-secondary">Service</span><span className="text-primary">${fmt(mulchCalc.labor)}</span></div>
                  <div className="flex justify-between text-sm font-semibold border-t border-border-subtle pt-1 mt-1"><span className="text-primary">Mulch Quote</span><span className="text-emerald-600">${fmt(mulchCalc.quote)}</span></div>
                </div>
              </div>
            )}

            {has('rock') && rockCalc.quote > 0 && (
              <div>
                <p className="text-xs font-bold text-secondary uppercase tracking-wide mb-2">Rock</p>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs"><span className="text-secondary">Material</span><span className="text-primary">${fmt(rockCalc.material)}</span></div>
                  {rockCalc.equipment > 0 && <div className="flex justify-between text-xs"><span className="text-secondary">Equipment</span><span className="text-primary">${fmt(rockCalc.equipment)}</span></div>}
                  <div className="flex justify-between text-xs"><span className="text-secondary">Delivery</span><span className="text-primary">${fmt(rockCalc.delivery)}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-secondary">Tax</span><span className="text-primary">${fmt(rockCalc.tax)}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-secondary">Service</span><span className="text-primary">${fmt(rockCalc.labor)}</span></div>
                  <div className="flex justify-between text-sm font-semibold border-t border-border-subtle pt-1 mt-1"><span className="text-primary">Rock Quote</span><span className="text-emerald-600">${fmt(rockCalc.quote)}</span></div>
                </div>
              </div>
            )}

            {has('edging') && edgingCalc.quote > 0 && (
              <div>
                <p className="text-xs font-bold text-secondary uppercase tracking-wide mb-2">Edging</p>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs"><span className="text-secondary">Material</span><span className="text-primary">${fmt(edgingCalc.material)}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-secondary">Delivery</span><span className="text-primary">${fmt(edgingCalc.delivery)}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-secondary">Tax</span><span className="text-primary">${fmt(edgingCalc.tax)}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-secondary">Service</span><span className="text-primary">${fmt(edgingCalc.labor)}</span></div>
                  <div className="flex justify-between text-sm font-semibold border-t border-border-subtle pt-1 mt-1"><span className="text-primary">Edging Quote</span><span className="text-emerald-600">${fmt(edgingCalc.quote)}</span></div>
                </div>
              </div>
            )}

            {has('pine') && pineCalc.quote > 0 && (
              <div>
                <p className="text-xs font-bold text-secondary uppercase tracking-wide mb-2">Pine Needles</p>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs"><span className="text-secondary">Material</span><span className="text-primary">${fmt(pineCalc.materialCostTotal)}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-secondary">Delivery</span><span className="text-primary">${fmt(pineCalc.delivery)}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-secondary">Tax</span><span className="text-primary">${fmt(pineCalc.materialTax)}</span></div>
                  <div className="flex justify-between text-sm font-semibold border-t border-border-subtle pt-1 mt-1"><span className="text-primary">Pine Quote</span><span className="text-emerald-600">${fmt(pineCalc.quote)}</span></div>
                </div>
              </div>
            )}

            {has('leafCleanup') && leafCleanupCalc.quote > 0 && (
              <div>
                <p className="text-xs font-bold text-secondary uppercase tracking-wide mb-2">Leaf Cleanup</p>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs"><span className="text-secondary">Base</span><span className="text-primary">${fmt(leafCleanupCalc.base)}</span></div>
                  {leafCleanupCalc.fenceFee > 0 && <div className="flex justify-between text-xs"><span className="text-secondary">Fence Fee</span><span className="text-primary">${fmt(leafCleanupCalc.fenceFee)}</span></div>}
                  {leafCleanupCalc.haulFee > 0 && <div className="flex justify-between text-xs"><span className="text-secondary">Haul Fee</span><span className="text-primary">${fmt(leafCleanupCalc.haulFee)}</span></div>}
                  {leafCleanupCalc.multiplier > 1 && <div className="flex justify-between text-xs"><span className="text-secondary">Difficulty</span><span className="text-primary">{leafCleanupCalc.multiplier}x (Hard)</span></div>}
                  {leafCleanupCalc.minApplied && <div className="flex justify-between text-xs"><span className="text-secondary">Note</span><span className="text-primary">Min applied</span></div>}
                  <div className="flex justify-between text-sm font-semibold border-t border-border-subtle pt-1 mt-1"><span className="text-primary">Leaf Cleanup Quote</span><span className="text-emerald-600">${fmt(leafCleanupCalc.quote)}</span></div>
                </div>
              </div>
            )}

            {otherCalcs.quote > 0 && (
              <div>
                <p className="text-xs font-bold text-secondary uppercase tracking-wide mb-2">Other Services</p>
                <div className="space-y-1">
                  {has('bushes') && num(data.other.bushes) > 0 && <div className="flex justify-between text-xs"><span className="text-secondary">Bushes</span><span className="text-primary">${fmt(num(data.other.bushes))}</span></div>}
                  {has('overgrown') && num(data.other.overgrown) > 0 && <div className="flex justify-between text-xs"><span className="text-secondary">Overgrown</span><span className="text-primary">${fmt(num(data.other.overgrown))}</span></div>}
                  <div className="flex justify-between text-sm font-semibold border-t border-border-subtle pt-1 mt-1"><span className="text-primary">Other Quote</span><span className="text-emerald-600">${fmt(otherCalcs.quote)}</span></div>
                </div>
              </div>
            )}

            {/* Combined Expenses */}
            <div className="border-t-2 border-border-subtle pt-3">
              <p className="text-xs font-bold text-secondary uppercase tracking-wide mb-2">Combined Expenses</p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm"><span className="text-secondary">Material</span><span className="font-medium text-primary">${fmt(summary.totalMaterial)}</span></div>
                {summary.totalEquipment > 0 && <div className="flex justify-between text-sm"><span className="text-secondary">Equipment</span><span className="font-medium text-primary">${fmt(summary.totalEquipment)}</span></div>}
                <div className="flex justify-between text-sm"><span className="text-secondary">Delivery</span><span className="font-medium text-primary">${fmt(summary.totalDelivery)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-secondary">Tax (7%)</span><span className="font-medium text-primary">${fmt(summary.totalTax)}</span></div>
              </div>
              <div className="border-t border-border-subtle mt-2 pt-2">
                <div className="flex justify-between text-sm font-semibold"><span className="text-primary">Total Expenses</span><span className="text-primary">${fmt(summary.totalExpenses)}</span></div>
              </div>
            </div>

            {/* Estimated Profit */}
            <div className="border-t border-border-subtle pt-3">
              <div className="flex justify-between text-base font-bold"><span className="text-primary">Estimated Profit</span><span className={summary.totalLabor >= 0 ? 'text-emerald-600' : 'text-red-500'}>${fmt(summary.totalLabor)}</span></div>
            </div>

            <button onClick={handleSave} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold hover:opacity-90 transition-opacity cursor-pointer">
              <Save size={16} /> Save Quote
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
