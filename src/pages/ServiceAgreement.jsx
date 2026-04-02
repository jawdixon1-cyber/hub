import { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { ArrowLeft, ArrowRight, Search, Check, Plus, FileText, Loader2, Pencil, MapPin, CheckCircle, SkipForward, Trash2, RefreshCw, ChevronDown } from 'lucide-react';
import { useAppStore } from '../store/AppStoreContext';
import { genId } from '../data';
import { generateAgreementHTML } from '../utils/generateAgreement';
import { getNetSqft, computeNetTotals } from '../components/PropertyMapper/mapUtils';
import useAddressAutocomplete from '../components/PropertyMapper/useAddressAutocomplete';
import { getTimezone } from '../utils/timezone';

const MapView = lazy(() => import('../components/PropertyMapper/MapView'));
const MeasurementList = lazy(() => import('../components/PropertyMapper/MeasurementList'));

/* ─── Constants ─── */

const TAX_RATE = 0.07;
const SQ_FT_PER_YD_AT_1IN = 324;

/* ─── Calculators ─── */

const LAWN_TIERS = [
  { maxSqft: 8000, price: 55 }, { maxSqft: 10000, price: 60 }, { maxSqft: 15000, price: 70 },
  { maxSqft: 21000, price: 80 }, { maxSqft: 30000, price: 90 }, { maxSqft: 43000, price: 95 },
  { maxSqft: Infinity, price: 100 },
];

function calcLawnPrice(sqft, difficulty = 'easy') {
  if (!sqft || sqft <= 0) return 0;
  const mult = { easy: 1.0, moderate: 1.15, hard: 1.3 }[difficulty] || 1.0;
  let tierPrice = 100;
  for (const t of LAWN_TIERS) { if (sqft <= t.maxSqft) { tierPrice = t.price; break; } }
  return Math.round(Math.max(tierPrice * mult, 55));
}

function calcHedgePrice(bushes) {
  const total = (bushes.small || 0) * 8 + (bushes.medium || 0) * 12 + (bushes.large || 0) * 18 + (bushes.xl || 0) * 50;
  return Math.max(total, total > 0 ? 35 : 0);
}

function calcAerationPrice(sqft, seedRate = 8, pricePerBag = 200) {
  if (!sqft || sqft <= 0) return { aerationPrice: 0, overseedQuote: 0, seedLbs: 0, bags: 0, perLb: 0, total: 0 };
  const aerationPrice = sqft <= 10000 ? 169 : 169 + ((sqft - 10000) / 1000) * 15;
  const seedLbs = (sqft / 1000) * seedRate;
  const bags = Math.ceil(seedLbs / 50);
  const perLb = pricePerBag / 50;
  const overseedQuote = Math.round(seedLbs * perLb * 100) / 100;
  return { aerationPrice: Math.round(aerationPrice * 100) / 100, overseedQuote, seedLbs: Math.round(seedLbs), bags, perLb, total: Math.round((aerationPrice + overseedQuote) * 100) / 100 };
}

function calcMulchPrice(sqft, depth = 3, materialCostPerYd = 40, chargePerYd = 35) {
  if (!sqft || sqft <= 0) return { cubicYards: 0, total: 0 };
  const cubicYards = (sqft * depth / SQ_FT_PER_YD_AT_1IN) * 1.1;
  const loads = Math.ceil(cubicYards / 6);
  const delivery = loads * 50;
  const material = cubicYards * materialCostPerYd;
  const tax = (material + delivery) * TAX_RATE;
  const labor = cubicYards * chargePerYd;
  return { cubicYards: Math.round(cubicYards * 10) / 10, loads, total: Math.round((material + delivery + tax + labor) * 100) / 100 };
}

function calcPinePrice(bales, laborPerBale = 6, delivery = 50) {
  if (!bales || bales <= 0) return { total: 0 };
  const total = Math.round(((4.25 + laborPerBale) * bales + delivery) * 100) / 100;
  return { total };
}

function fmt(n) { return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

/* ─── Term & Proration ─── */

// Fixed cycle: March 1 → February 28/29
// Service seasons (0-indexed months)
const SERVICE_SEASONS = {
  lawn:     { months: [2,3,4,5,6,7,8,9], visitsPerMonth: 4 },       // Mar-Oct, weekly
  leaf:     { months: [10,11,0,1], visitsPerMonth: 4 },               // Nov-Feb, weekly
  hedge:    { months: [3,6,9], visitsPerMonth: null, onePerMonth: true }, // Apr,Jul,Oct — 1 visit each
  aeration: { months: [8,9], oneTime: true },                          // Sep-Oct window
  mulch:    { months: [2,3,4], oneTime: true },                        // Mar-May window
  pine:     { months: [2,3,4], oneTime: true },                        // Mar-May window
  sticks:   { months: [0,1,2,3,4,5,6,7,8,9,10,11] },                 // year-round, included
};

function calcTerm(startDateStr, services, getPrice, getVisitsForSvc) {
  if (!startDateStr) return null;
  const start = new Date(startDateStr + 'T00:00:00');
  const startMonth = start.getMonth();
  const startYear = start.getFullYear();

  // Cycle: March 1 → February 28
  // Find the current cycle's March 1
  let cycleStartYear = startYear;
  if (startMonth < 2) cycleStartYear -= 1; // Jan/Feb = still in previous year's cycle
  const cycleStart = new Date(cycleStartYear, 2, 1); // March 1
  const cycleEnd = new Date(cycleStartYear + 1, 1, 28); // Feb 28 (close enough)

  const isFullCycle = startMonth === 2 && start.getDate() <= 7; // Starting in early March = full cycle
  const remainingMs = cycleEnd - start;
  // Count calendar months from start to cycle end
  let remainingMonths = (cycleEnd.getFullYear() - start.getFullYear()) * 12 + (cycleEnd.getMonth() - start.getMonth());
  if (cycleEnd.getDate() >= start.getDate()) remainingMonths += 1; // include partial last month
  remainingMonths = Math.max(remainingMonths, 1);

  const fmtDate = (d) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const startFmt = fmtDate(start);
  const endFmt = fmtDate(cycleEnd);
  const firstBilling = fmtDate(start);

  // Calculate full year totals
  let fullYearTotal = 0;
  const breakdown = [];

  for (const svc of services) {
    if (svc.calcType === 'included') {
      breakdown.push({ id: svc.id, name: svc.name, included: true, fullAnnual: 0, proratedAnnual: 0, fullVisits: 0, remainingVisits: 0, status: 'included' });
      continue;
    }

    const price = getPrice(svc.id);
    const fullVisits = getVisitsForSvc(svc);
    const fullAnnual = svc.priceLabel === '/visit' ? price * fullVisits : price;
    fullYearTotal += fullAnnual;

    if (isFullCycle) {
      breakdown.push({ id: svc.id, name: svc.name, included: false, fullAnnual, proratedAnnual: fullAnnual, fullVisits, remainingVisits: fullVisits, price, status: 'full' });
      continue;
    }

    // Calculate remaining visits by walking months from start to cycle end
    const season = SERVICE_SEASONS[svc.id];
    if (!season) {
      breakdown.push({ id: svc.id, name: svc.name, included: false, fullAnnual, proratedAnnual: fullAnnual, fullVisits, remainingVisits: fullVisits, price, status: 'full' });
      continue;
    }

    let remainingVisits = 0;
    let status = 'partial';

    if (season.oneTime) {
      // Check if any season month is still ahead
      const hasWindow = season.months.some((m) => {
        if (m > startMonth) return true;
        if (m === startMonth && start.getDate() <= 15) return true;
        // Months that wrap (e.g. Jan/Feb in a cycle starting March)
        if (m < 2 && startMonth >= 2) return true; // Jan/Feb always ahead if we started Mar+
        return false;
      });
      remainingVisits = hasWindow ? 1 : 0;
      status = hasWindow ? 'remaining' : 'done';
    } else if (season.onePerMonth) {
      // Hedge: count remaining specific months
      remainingVisits = season.months.filter((m) => {
        if (m > startMonth) return true;
        if (m === startMonth && start.getDate() <= 15) return true;
        if (m < 2 && startMonth >= 2) return true;
        return false;
      }).length;
      status = remainingVisits === season.months.length ? 'full' : remainingVisits > 0 ? 'partial' : 'done';
    } else {
      // Recurring: count remaining months in season × visits per month
      const vpm = season.visitsPerMonth || 4;
      let seasonMonthsLeft = 0;
      season.months.forEach((m) => {
        if (m > startMonth) seasonMonthsLeft++;
        else if (m === startMonth && start.getDate() <= 15) seasonMonthsLeft++;
        else if (m < 2 && startMonth >= 2) seasonMonthsLeft++; // Jan/Feb wrap
      });
      remainingVisits = seasonMonthsLeft * vpm;
      status = remainingVisits >= fullVisits ? 'full' : remainingVisits > 0 ? 'partial' : 'done';
    }

    const proratedAnnual = svc.priceLabel === '/visit' ? price * remainingVisits : (remainingVisits > 0 ? price : 0);
    breakdown.push({ id: svc.id, name: svc.name, included: false, fullAnnual, proratedAnnual, fullVisits, remainingVisits, price, status });
  }

  const proratedTotal = breakdown.reduce((s, b) => s + (b.proratedAnnual || 0), 0);
  const fullMonthly = Math.round(fullYearTotal / 12);
  const proratedMonthly = remainingMonths > 0 ? Math.round(proratedTotal / remainingMonths) : 0;

  return {
    startFmt, endFmt, firstBilling, months: 12,
    isFullCycle, remainingMonths, breakdown,
    fullYearTotal: Math.round(fullYearTotal * 100) / 100,
    proratedTotal: Math.round(proratedTotal * 100) / 100,
    fullMonthly, proratedMonthly,
  };
}

/* ─── Service Definitions ─── */

const LAWN_SERVICES = [
  {
    id: 'lawn', name: 'Lawn & Leaf Maintenance', frequency: 'Weekly', season: 'Year-round', visitsPerYear: 50,
    bullets: ['Mow, trim, edge, blow, weed beds (Mar–Oct)', 'Blow leaves, mulch into lawn, trim, weed beds (Nov–Feb)'],
    priceLabel: '/visit', calcType: 'lawn',
    linkedIds: ['leaf'], // leaf is bundled with lawn
  },
  {
    id: 'aeration', name: 'Aeration & Overseeding', frequency: '1x per year', season: 'Fall (recommended)', visitsPerYear: 1,
    bullets: ['Core aerate + overseed at 8 lbs/1,000 sqft with LESCO Tall Fescue'],
    priceLabel: '', calcType: 'aeration',
  },
];

const BED_SERVICES = [
  {
    id: 'hedge', name: 'Hedge Trimming', frequency: '3x per year', season: 'Apr, Jul, Oct', visitsPerYear: 3,
    bullets: ['Shape and trim all shrubs, bushes, and hedges'],
    priceLabel: '/visit', calcType: 'hedge',
  },
  {
    id: 'mulch', name: 'Mulch Installation', frequency: '1x per year', season: 'Spring', visitsPerYear: 1,
    bullets: ['Weed beds, install mulch at 3" depth, edge beds, clean up'],
    priceLabel: '', calcType: 'mulch',
  },
  {
    id: 'pine', name: 'Pine Needle Installation', frequency: '1x per year', season: 'Spring', visitsPerYear: 1,
    bullets: ['Weed beds, install pine needles, clean up'],
    priceLabel: '', calcType: 'pine',
  },
];

// Always included when any service is selected
const ALWAYS_INCLUDED = {
  id: 'sticks', name: 'Stick Removal', frequency: 'Every visit', season: 'Year-round', visitsPerYear: 50,
  bullets: ['Pick up and haul away all sticks every visit'],
  priceLabel: 'Included', calcType: 'included',
};

const ALL_SERVICES = [...LAWN_SERVICES, ...BED_SERVICES];
const ALL_WITH_STICKS = [...ALL_SERVICES, ALWAYS_INCLUDED];

// Full bullets for the agreement PDF
const FULL_BULLETS = {
  lawn: ['Mow entire lawn at the proper height for your grass type (Mar–Oct)', 'String trim where mowers can\'t reach', 'Edge along all sidewalks, driveways, and curbs', 'Edge around landscape beds', 'Blow all clippings off hard surfaces', 'Blow all leaves off beds, porches, walkways, driveways (Nov–Feb)', 'Mulch leaves into the lawn to return nutrients to the soil', 'Keep beds and the entire property looking clean year-round'],
  leaf: ['Blow all leaves off landscape beds, porches, walkways, driveways, and hard surfaces', 'Mulch leaves into the lawn to return nutrients to the soil', 'Trim grass as needed', 'Keep beds and the entire property looking clean'],
  aeration: ['Core aerate the entire lawn with commercial-grade equipment', 'Thickens your lawn with LESCO Tall Fescue Select Blend (Certified Tag) — a professional-grade seed trusted on golf courses and athletic fields. Certified for purity (no weeds, no filler) and bred for density, drought tolerance, and disease resistance, it establishes a cleaner, fuller lawn than store-bought blends'],
  sticks: ['Pick up all sticks on the property every visit', 'Haul away and dispose of off-site'],
  hedge: ['Shape and trim all shrubs, bushes, and hedges on the property', 'Remove all clippings and debris from beds and surrounding areas', 'Maintain natural shape while keeping growth in check'],
  mulch: ['Weed all landscape beds before installation', 'Install fresh mulch in all landscape beds at 3 inches deep', 'Edge beds cleanly before installation', 'Clean up all walkways, driveways, and hard surfaces after installation'],
  pine: ['Weed all landscape beds before installation', 'Install fresh pine needles in all landscape beds', 'Clean up all walkways, driveways, and hard surfaces after installation'],
};

const PLAN_TIERS = [
  { id: 'total-care', name: 'Total Care', addonPerMonth: 0, description: 'All selected services bundled into one predictable monthly payment', extras: [] },
  { id: 'total-care-plus', name: 'Total Care Plus', addonPerMonth: 100, popular: true, description: 'Includes everything in Total Care +', extras: ['Leaf Upgrade (Nov–Feb): Haul off all leaves instead of mulching', 'Seasonal Bed Refresh (Fall): Turn and fluff existing mulch'] },
  { id: 'total-care-premium', name: 'Total Care Premium', addonPerMonth: 220, description: 'Includes everything in Total Care Plus +', extras: ['Up to 2 priority touch-up visits per year', 'Up to 3 storm cleanup visits per year', '48-hour priority requests'] },
];

/* ─── Agreement Card (list view) ─── */

function AgreementCard({ agreement: a, onDelete, onRegenerate, onEdit }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-card rounded-2xl border border-border-subtle overflow-hidden">
      <button onClick={() => setExpanded(!expanded)} className="w-full text-left p-5 flex items-center justify-between cursor-pointer hover:bg-surface-alt/30 transition-colors">
        <div>
          <p className="text-sm font-bold text-primary">{a.clientName}</p>
          <p className="text-xs text-muted">{a.clientAddress}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-bold text-brand-text">${a.monthlyPrice}/mo</p>
            <p className="text-xs text-muted">{new Date(a.createdAt).toLocaleDateString()}</p>
          </div>
          <ChevronDown size={14} className={`text-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-3 border-t border-border-subtle/50">
          {/* Services */}
          {a.services?.length > 0 && (
            <div className="pt-3 space-y-1">
              {a.services.map((s, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-secondary">{s.name}</span>
                  <span className="font-semibold text-primary">${Number(s.price || 0).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Plan + term */}
          <div className="text-xs text-muted space-y-1">
            {a.planTier && <p>Plan: {a.planTier.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</p>}
            {a.annualTotal && <p>Annual: ${Number(a.annualTotal).toFixed(2)}</p>}
            {a.termStart && <p>Started: {a.termStart}</p>}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => onEdit(a)}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-brand text-on-brand text-xs font-semibold hover:bg-brand-hover cursor-pointer"
            >
              <Pencil size={13} /> Edit
            </button>
            <button
              onClick={() => onRegenerate(a)}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-brand/30 text-brand-text text-xs font-semibold hover:bg-brand-light/20 cursor-pointer"
            >
              <RefreshCw size={13} /> PDF
            </button>
            <button
              onClick={() => { if (confirm(`Delete contract for ${a.clientName}?`)) onDelete(a.id); }}
              className="px-4 py-2 rounded-xl border border-red-500/30 text-red-500 text-xs font-semibold hover:bg-red-500/10 cursor-pointer"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Client Search Hook ─── */

function useJobberSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (query.trim().length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/jobber-clients?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) setResults(await res.json());
        else setResults([]);
      } catch { setResults([]); }
      setLoading(false);
    }, 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);
  return { query, setQuery, results, loading };
}

/* ─── Editable Price ─── */

function EditablePrice({ value, onChange, label, anchorValue }) {
  const [editing, setEditing] = useState(false);
  const [temp, setTemp] = useState('');
  const ref = useRef(null);
  const startEdit = () => { setTemp(String(value || '')); setEditing(true); setTimeout(() => ref.current?.select(), 0); };
  const commit = () => { const v = parseFloat(temp); if (!isNaN(v) && v >= 0) onChange(Math.round(v * 100) / 100); setEditing(false); };
  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted">$</span>
        <input ref={ref} type="number" value={temp} onChange={(e) => setTemp(e.target.value)}
          onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
          autoFocus className="w-20 rounded-lg border border-brand px-2 py-1 text-sm text-right font-bold text-primary outline-none focus:ring-1 focus:ring-brand" />
        {label && <span className="text-[10px] text-muted">{label}</span>}
      </div>
    );
  }
  return (
    <div className="text-right">
      {anchorValue != null && anchorValue > value && <p className="text-[10px] text-muted line-through">${fmt(anchorValue)}{label}</p>}
      <button onClick={startEdit} className="inline-flex items-center gap-1 cursor-pointer group">
        <span className="text-sm font-bold text-brand-text">${fmt(value)}</span>
        {label && <span className="text-[10px] text-muted">{label}</span>}
        <Pencil size={10} className="text-muted/40 group-hover:text-muted" />
      </button>
    </div>
  );
}

/* ─── Reusable Components (defined outside to prevent remount on re-render) ─── */

function FormInput({ label, value, onChange, placeholder, type = 'number', className = '' }) {
  return (
    <div className={className}>
      <label className="block text-[11px] font-medium text-muted mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-lg border border-border-default px-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-brand placeholder:text-muted/50" />
    </div>
  );
}

function ServiceToggle({ svc, active, onToggle }) {
  return (
    <button onClick={() => onToggle(svc.id)} className={`w-full text-left px-4 py-3 rounded-xl border transition-colors cursor-pointer ${active ? 'border-brand bg-brand-light/20' : 'border-border-subtle hover:border-border-strong'}`}>
      <div className="flex items-center gap-3">
        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${active ? 'bg-brand border-brand' : 'border-border-strong'}`}>
          {active && <Check size={12} className="text-on-brand" />}
        </div>
        <div>
          <p className="text-sm font-semibold text-primary">{svc.name}</p>
          <p className="text-[10px] text-muted">{svc.frequency} · {svc.season}</p>
        </div>
      </div>
    </button>
  );
}

/* ─── Override Toggle (outside main component) ─── */

function OverrideToggle({ enabled, onToggle, overrideValue, onChangeOverride }) {
  return (
    <div className="flex items-center gap-3 pt-3 border-t border-border-subtle mt-3">
      <button
        onClick={onToggle}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer ${enabled ? 'bg-brand' : 'bg-border-strong'}`}
      >
        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
      </button>
      <span className="text-[11px] text-muted">Override price</span>
      {enabled && (
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-xs text-muted">$</span>
          <input
            type="number"
            value={overrideValue}
            onChange={(e) => onChangeOverride(e.target.value)}
            className="w-24 rounded-lg border border-brand px-2 py-1 text-sm text-right font-bold text-primary outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ─── */

export default function ServiceAgreement({ editId, onDone }) {
  const agreements = useAppStore((s) => s.agreements);
  const setAgreements = useAppStore((s) => s.setAgreements);

  const [step, setStep] = useState(editId ? '_init' : 'list');
  const search = useJobberSearch();
  const addressAutocomplete = useAddressAutocomplete();

  // Editing existing agreement
  const [editingId, setEditingId] = useState(null);

  // Client
  const [client, setClient] = useState({ name: '', phone: '', email: '', address: '', cityStateZip: 'Rock Hill, SC 29732' });
  const [clientLatLng, setClientLatLng] = useState(null);

  // Selected services (just IDs)
  const [enabledIds, setEnabledIds] = useState(new Set());

  // Map measurements
  const [measurements, setMeasurements] = useState([]);
  const [mapCenter, setMapCenter] = useState(null);

  // Per-service calculator inputs
  const [calc, setCalc] = useState({
    // Property
    lawnSqftManual: '',
    bedSqftManual: '',
    difficulty: 'easy',
    lawnPriceType: 'weekly', // 'weekly' | 'eow'
    // Aeration
    seedRate: '8', bagPrice: '200',
    // Hedge
    hedgeMonths: ['Apr', 'Jul', 'Oct'],
    bushesSmall: '', bushesMedium: '', bushesLarge: '', bushesXl: '',
    // Mulch
    mulchSqft: '', mulchDepth: '3', mulchMaterialCost: '40', mulchChargePerYd: '35',
    // Pine
    pineBales: '', pineLaborPerBale: '6', pineDelivery: '50',
  });

  // Per-service overrides
  const [overrides, setOverrides] = useState({
    lawn: { enabled: false, price: '' },
    leaf: { enabled: false, price: '' },
    aeration: { enabled: false, price: '' },
    hedge: { enabled: false, price: '' },
    mulch: { enabled: false, price: '' },
    pine: { enabled: false, price: '' },
  });

  const setC = (field, val) => setCalc((p) => ({ ...p, [field]: val }));
  const toggleOverride = (id) => setOverrides((p) => ({ ...p, [id]: { ...p[id], enabled: !p[id].enabled } }));
  const setOverridePrice = (id, val) => setOverrides((p) => ({ ...p, [id]: { ...p[id], price: val } }));

  // Plan & term
  const [selectedPlan, setSelectedPlan] = useState('total-care');
  const [monthlyPrice, setMonthlyPrice] = useState('');
  const [autoMonthly, setAutoMonthly] = useState(true);
  const [termMonths, setTermMonths] = useState(12);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);

  const toggle = (id) => setEnabledIds((prev) => {
    const n = new Set(prev);
    const svc = ALL_SERVICES.find((s) => s.id === id);
    if (n.has(id)) {
      n.delete(id);
      // Remove linked services (e.g. leaf when lawn is toggled off)
      if (svc?.linkedIds) svc.linkedIds.forEach((lid) => n.delete(lid));
    } else {
      n.add(id);
      // Add linked services (e.g. leaf when lawn is toggled on)
      if (svc?.linkedIds) svc.linkedIds.forEach((lid) => n.add(lid));
    }
    return n;
  });
  const isOn = (id) => enabledIds.has(id);

  // Auto-load agreement if editId prop is provided
  useEffect(() => {
    if (editId && step === '_init') {
      const a = (agreements || []).find((ag) => ag.id === editId);
      if (a) {
        loadAgreementFromProp(a);
      } else {
        setStep('list');
      }
    }
  }, [editId]);

  const loadAgreementFromProp = (a) => {
    setEditingId(a.id);
    setClient({ name: a.clientName || '', phone: a.clientPhone || '', email: a.clientEmail || '', address: a.clientAddress || '', cityStateZip: a.clientCityStateZip || 'Rock Hill, SC 29732' });
    const ids = new Set((a.services || []).map((s) => s.id).filter(Boolean));
    setEnabledIds(ids);
    const newOverrides = {};
    for (const s of (a.services || [])) {
      if (s.id && s.price != null) {
        newOverrides[s.id] = { enabled: true, price: String(s.price), weeklyOverride: String(s.price), eowOverride: '' };
      }
    }
    setOverrides((prev) => ({ ...prev, ...newOverrides }));
    if (a.measurements) setMeasurements(a.measurements);
    if (a.mapCenter) setClientLatLng(a.mapCenter);
    setSelectedPlan(a.planTier || 'total-care');
    setMonthlyPrice(String(a.monthlyPrice || ''));
    setAutoMonthly(false);
    setStartDate(a.termStart || new Date().toISOString().split('T')[0]);
    setStep('services');
  };

  // Determine if measure step is needed
  const needsMeasure = true; // Always allow property measurement

  // Property sqft: from map measurements or manual input
  const { mapLawnSqft, mapBedSqft } = useMemo(() => {
    if (!measurements || measurements.length === 0) return { mapLawnSqft: 0, mapBedSqft: 0 };
    const totals = computeNetTotals(measurements);
    return { mapLawnSqft: totals.lawn || 0, mapBedSqft: totals.beds || 0 };
  }, [measurements]);

  const lawnSqft = mapLawnSqft > 0 ? mapLawnSqft : (parseFloat(calc.lawnSqftManual) || 0);
  const bedSqft = mapBedSqft > 0 ? mapBedSqft : (parseFloat(calc.bedSqftManual) || 0);

  // Calculated prices from calculator inputs
  const prices = useMemo(() => {
    const lawnWeekly = calcLawnPrice(lawnSqft, calc.difficulty);
    const lawnEow = lawnSqft > 0 ? Math.round(lawnWeekly * 1.5) : 0;
    const selectedLawnPrice = calc.lawnPriceType === 'eow' ? lawnEow : lawnWeekly;
    const leafPerVisit = lawnWeekly; // leaf uses same price as lawn
    const hedgePrice = calcHedgePrice({
      small: parseInt(calc.bushesSmall) || 0, medium: parseInt(calc.bushesMedium) || 0,
      large: parseInt(calc.bushesLarge) || 0, xl: parseInt(calc.bushesXl) || 0,
    });
    const aeration = calcAerationPrice(lawnSqft, parseFloat(calc.seedRate) || 8, parseFloat(calc.bagPrice) || 200);
    const mulch = calcMulchPrice(parseFloat(calc.mulchSqft) || 0, parseFloat(calc.mulchDepth) || 3, parseFloat(calc.mulchMaterialCost) || 40, parseFloat(calc.mulchChargePerYd) || 35);
    const pine = calcPinePrice(parseInt(calc.pineBales) || 0, parseFloat(calc.pineLaborPerBale) || 6, parseFloat(calc.pineDelivery) || 50);
    return {
      lawn: selectedLawnPrice,
      lawnWeekly,
      lawnEow,
      leaf: leafPerVisit,
      sticks: 0,
      hedge: hedgePrice,
      aeration: aeration.total,
      aerationDetail: aeration,
      mulch: mulch.total,
      mulchDetail: mulch,
      pine: pine.total,
    };
  }, [lawnSqft, calc]);

  const getPrice = (id) => {
    if (id === 'lawn' || id === 'leaf') {
      // Leaf uses same price as lawn
      const isEow = calc.lawnPriceType === 'eow';
      if (overrides.lawn?.enabled) {
        return parseFloat(isEow ? overrides.lawn.eowOverride : overrides.lawn.weeklyOverride) || 0;
      }
      return isEow ? (prices.lawnEow || 0) : (prices.lawnWeekly || 0);
    }
    if (overrides[id]?.enabled && overrides[id]?.price !== '') {
      return parseFloat(overrides[id].price) || 0;
    }
    return prices[id] || 0;
  };

  // Get visits per year (lawn depends on weekly vs EOW)
  // Weeks remaining from start date to Feb 28
  const weeksInTerm = useMemo(() => {
    if (!startDate) return 52;
    const s = new Date(startDate + 'T00:00:00');
    const endYear = s.getMonth() < 2 ? s.getFullYear() : s.getFullYear() + 1;
    const end = new Date(endYear, 1, 28);
    return Math.max(1, Math.round((end - s) / (7 * 24 * 60 * 60 * 1000)));
  }, [startDate]);

  const getVisits = (svc) => {
    if (svc.id === 'lawn') return calc.lawnPriceType === 'eow' ? Math.round(weeksInTerm / 2) : weeksInTerm;
    if (svc.id === 'leaf') return 0; // included in lawn visits
    if (svc.id === 'hedge') return calc.hedgeMonths.length;
    return svc.visitsPerYear;
  };

  // Annual totals
  const annualTotal = useMemo(() => {
    return ALL_SERVICES.filter((s) => isOn(s.id) && s.calcType !== 'included')
      .reduce((sum, svc) => {
        const p = getPrice(svc.id);
        return sum + (svc.priceLabel === '/visit' ? p * getVisits(svc) : p);
      }, 0);
  }, [enabledIds, prices, overrides, calc.lawnPriceType, weeksInTerm]);

  // Auto-monthly — uses proration if mid-cycle
  useEffect(() => {
    if (!autoMonthly) return;
    if (startDate && annualTotal > 0) {
      const enabledSvcs = [...ALL_SERVICES.filter((s) => isOn(s.id)), ...(enabledIds.size > 0 ? [ALWAYS_INCLUDED] : [])];
      const term = calcTerm(startDate, enabledSvcs, getPrice, getVisits);
      if (term) {
        setMonthlyPrice(String(term.isFullCycle ? term.fullMonthly : term.proratedMonthly));
      } else {
        setMonthlyPrice(String(Math.round(annualTotal / 12)));
      }
    } else if (annualTotal > 0) {
      setMonthlyPrice(String(Math.round(annualTotal / 12)));
    }
  }, [annualTotal, autoMonthly, startDate]);

  // How many months to bill over (actual term, not always 12)
  const billingMonths = useMemo(() => {
    if (!startDate) return 12;
    const enabledSvcs = [...ALL_SERVICES.filter((s) => isOn(s.id)), ...(enabledIds.size > 0 ? [ALWAYS_INCLUDED] : [])];
    const term = calcTerm(startDate, enabledSvcs, getPrice, getVisits);
    return term ? (term.isFullCycle ? 12 : term.remainingMonths) : 12;
  }, [startDate, enabledIds, prices, overrides, calc.lawnPriceType]);

  const endDate = useMemo(() => {
    if (!startDate) return '';
    const d = new Date(startDate + 'T00:00:00'); d.setMonth(d.getMonth() + termMonths); d.setDate(d.getDate() - 1);
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: getTimezone() });
  }, [startDate, termMonths]);

  const startDateFmt = useMemo(() => {
    if (!startDate) return '';
    return new Date(startDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: getTimezone() });
  }, [startDate]);

  const selectClient = (c) => {
    const addr = c.address || '';
    const csz = [c.city, c.state, c.zip].filter(Boolean).join(', ') || 'Rock Hill, SC 29732';
    setClient({ name: c.name, phone: c.phone || '', email: c.email || '', address: addr, cityStateZip: csz });
    search.setQuery('');
    // Geocode the address for map
    if (addr) {
      const fullAddr = `${addr}, ${csz}`;
      addressAutocomplete.setSearch(fullAddr);
      // Wait for suggestions then auto-select first
      setTimeout(() => {
        const svc = window.google?.maps?.places ? new window.google.maps.places.AutocompleteService() : null;
        if (!svc) return;
        svc.getPlacePredictions({ input: fullAddr, types: ['address'], componentRestrictions: { country: 'us' } }, (predictions) => {
          if (!predictions?.[0]) return;
          const details = new window.google.maps.places.PlacesService(document.createElement('div'));
          details.getDetails({ placeId: predictions[0].place_id, fields: ['geometry'] }, (place) => {
            if (place?.geometry) {
              setClientLatLng({ lat: place.geometry.location.lat(), lng: place.geometry.location.lng() });
            }
          });
        });
        addressAutocomplete.clear();
      }, 100);
    }
  };

  const handleGenerate = () => {
    const enabled = [...ALL_SERVICES.filter((s) => isOn(s.id)), ...(enabledIds.size > 0 ? [ALWAYS_INCLUDED] : [])];
    const plan = PLAN_TIERS.find((p) => p.id === selectedPlan);
    const term = calcTerm(startDate, enabled, getPrice, getVisits);
    const termEndDate = term ? term.endFmt : '';
    const termMonthsActual = term ? (term.isFullCycle ? 12 : term.remainingMonths) : 12;
    const termStartFmt = term ? term.startFmt : '';

    // Calculate actual weeks from start to Feb 28
    const startD = new Date(startDate + 'T00:00:00');
    const startYear = startD.getFullYear();
    const cycleEndYear = startD.getMonth() < 2 ? startYear : startYear + 1;
    const cycleEnd = new Date(cycleEndYear, 1, 28);
    const weeksRemaining = Math.max(1, Math.round((cycleEnd - startD) / (7 * 24 * 60 * 60 * 1000)));
    const isEow = calc.lawnPriceType === 'eow';
    const actualLawnVisits = isEow ? Math.round(weeksRemaining / 2) : weeksRemaining;

    // Dynamic bullets based on calculator
    const seedRate = parseFloat(calc.seedRate) || 8;
    const hedgeMonthsStr = calc.hedgeMonths.join(', ');
    const dynamicBullets = {
      lawn: ['Mow entire lawn at the proper height for your grass type (Mar–Oct)', 'String trim where mowers can\'t reach', 'Edge along all sidewalks, driveways, and curbs', 'Edge around landscape beds', 'Blow all clippings off hard surfaces', 'Blow all leaves off beds, porches, walkways, driveways (Nov–Feb)', 'Mulch leaves into the lawn to return nutrients to the soil', 'Keep beds and the entire property looking clean year-round'],
      leaf: FULL_BULLETS.leaf,
      aeration: ['Core aerate the entire lawn with commercial-grade equipment', `Overseed at ${seedRate} lbs per 1,000 sq ft`, 'Thickens your lawn with LESCO Tall Fescue Select Blend (Certified Tag) — a professional-grade seed trusted on golf courses and athletic fields. Certified for purity (no weeds, no filler) and bred for density, drought tolerance, and disease resistance, it establishes a cleaner, fuller lawn than store-bought blends'],
      hedge: [`Shape and trim all shrubs, bushes, and hedges on the property (${hedgeMonthsStr})`, 'Remove all clippings and debris from beds and surrounding areas', 'Maintain natural shape while keeping growth in check'],
      sticks: FULL_BULLETS.sticks,
      mulch: ['Weed all landscape beds before installation', `Install fresh mulch in all landscape beds at ${calc.mulchDepth || 3} inches deep`, 'Edge beds cleanly before installation', 'Clean up all walkways, driveways, and hard surfaces after installation'],
      pine: FULL_BULLETS.pine,
    };

    // Dynamic frequency/season per service
    const getDynamicFreq = (s) => {
      if (s.id === 'lawn') return isEow ? 'Every other week' : 'Weekly';
      if (s.id === 'hedge') return `${calc.hedgeMonths.length}x per year`;
      return s.frequency;
    };
    const getDynamicSeason = (s) => {
      if (s.id === 'lawn') return 'Year-round';
      if (s.id === 'hedge') return hedgeMonthsStr;
      return s.season;
    };
    const getDynamicVisits = (s) => {
      if (s.id === 'lawn') return actualLawnVisits;
      if (s.id === 'leaf') return 0;
      if (s.id === 'hedge') return calc.hedgeMonths.length;
      return s.visitsPerYear;
    };

    const html = generateAgreementHTML({
      client,
      services: enabled.map((s) => ({
        name: s.name, frequency: getDynamicFreq(s), season: getDynamicSeason(s),
        bullets: dynamicBullets[s.id] || s.bullets,
        price: getPrice(s.id), priceLabel: s.priceLabel,
        visitsPerYear: getDynamicVisits(s), calcType: s.calcType,
      })),
      plans: PLAN_TIERS.map((p) => ({
        name: p.name,
        monthlyPrice: `$${fmt(Math.round(annualTotal / termMonthsActual) + p.addonPerMonth)}`,
        description: p.description,
        extras: p.extras,
        popular: p.popular || false,
      })),
      term: { startDate: termStartFmt, endDate: termEndDate, months: termMonthsActual },
      weeksRemaining: actualLawnVisits,
      hedgeMonths: hedgeMonthsStr,
      isEow,
    });
    const win = window.open('', '_blank'); win.document.write(html); win.document.close();
    const agreementData = {
      id: editingId || genId(),
      clientName: client.name, clientPhone: client.phone, clientEmail: client.email,
      clientAddress: client.address, clientCityStateZip: client.cityStateZip,
      services: enabled.map((s) => ({
        id: s.id, name: s.name, price: getPrice(s.id), priceLabel: s.priceLabel,
        frequency: getDynamicFreq(s), season: getDynamicSeason(s), visitsPerYear: getDynamicVisits(s), calcType: s.calcType,
      })),
      planTier: selectedPlan, monthlyPrice: parseFloat(monthlyPrice) || 0,
      termStart: startDate, termMonths: termMonthsActual,
      annualTotal: Math.round(annualTotal * 100) / 100,
      lawnSqft: lawnSqft || 0,
      bedSqft: bedSqft || 0,
      mulchDepth: calc.mulchDepth || '3',
      seedRate: calc.seedRate || '8',
      hedgeMonths: calc.hedgeMonths,
      measurements: measurements.length > 0 ? measurements : [],
      mapCenter: clientLatLng || null,
      createdAt: editingId ? ((agreements || []).find((a) => a.id === editingId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (editingId) {
      // Update existing
      setAgreements((agreements || []).map((a) => a.id === editingId ? agreementData : a));
    } else {
      // Create new
      setAgreements([agreementData, ...(agreements || [])]);
    }
    // Keep editing — don't reset. User can navigate back manually.
    setEditingId(agreementData.id);
  };

  const startNew = () => {
    setEditingId(null);
    setClient({ name: '', phone: '', email: '', address: '', cityStateZip: 'Rock Hill, SC 29732' });
    setClientLatLng(null);
    setEnabledIds(new Set());
    setMeasurements([]);
    setMapCenter(null);
    setCalc({ lawnSqftManual: '', difficulty: 'easy', lawnPriceType: 'weekly', leafPerVisit: '', seedRate: '8', bagPrice: '200', bushesSmall: '', bushesMedium: '', bushesLarge: '', bushesXl: '', mulchSqft: '', mulchDepth: '3', mulchMaterialCost: '40', mulchChargePerYd: '35', pineBales: '', pineLaborPerBale: '6', pineDelivery: '50' });
    setOverrides({ lawn: { enabled: false, price: '' }, leaf: { enabled: false, price: '' }, aeration: { enabled: false, price: '' }, hedge: { enabled: false, price: '' }, mulch: { enabled: false, price: '' }, pine: { enabled: false, price: '' } });
    setSelectedPlan('total-care'); setMonthlyPrice(''); setAutoMonthly(true); setStartDate(new Date().toISOString().split('T')[0]); setTermMonths(12);
    addressAutocomplete.clear();
    setStep('client');
  };

  // Load an existing agreement for editing
  const loadAgreement = (a) => {
    setEditingId(a.id);
    setClient({ name: a.clientName || '', phone: a.clientPhone || '', email: a.clientEmail || '', address: a.clientAddress || '', cityStateZip: a.clientCityStateZip || 'Rock Hill, SC 29732' });
    // Enable the services that were in the agreement
    const ids = new Set((a.services || []).map((s) => s.id).filter(Boolean));
    setEnabledIds(ids);
    // Set overrides from saved prices
    const newOverrides = {};
    for (const s of (a.services || [])) {
      if (s.id && s.price != null) {
        newOverrides[s.id] = { enabled: true, price: String(s.price), weeklyOverride: String(s.price), eowOverride: '' };
      }
    }
    setOverrides((prev) => ({ ...prev, ...newOverrides }));
    // Restore measurements and map data
    if (a.measurements) setMeasurements(a.measurements);
    if (a.mapCenter) setClientLatLng(a.mapCenter);
    setSelectedPlan(a.planTier || 'total-care');
    setMonthlyPrice(String(a.monthlyPrice || ''));
    setAutoMonthly(false);
    setStartDate(a.termStart || new Date().toISOString().split('T')[0]);
    setStep('calculate');
  };

  // ─── LIST ───
  if (step === 'list') {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-primary">Contracts</h1>
          <button onClick={startNew} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand text-on-brand text-sm font-semibold hover:bg-brand-hover cursor-pointer">
            <Plus size={16} /> New
          </button>
        </div>
        {(!agreements || agreements.length === 0) ? (
          <div className="text-center py-16">
            <FileText size={48} className="text-muted/30 mx-auto mb-4" />
            <p className="text-muted text-sm">No contracts yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {agreements.map((a) => (
              <AgreementCard key={a.id} agreement={a} onEdit={loadAgreement} onDelete={(id) => setAgreements((agreements || []).filter((x) => x.id !== id))} onRegenerate={(ag) => {
                const plan = PLAN_TIERS.find((p) => p.id === ag.planTier);
                const termStart = ag.termStart ? new Date(ag.termStart + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
                const html = generateAgreementHTML({
                  client: { name: ag.clientName, phone: ag.clientPhone || '', email: ag.clientEmail || '', address: ag.clientAddress || '', cityStateZip: ag.clientCityStateZip || 'Rock Hill, SC 29732' },
                  services: (ag.services || []).map((s) => ({
                    name: s.name, frequency: s.frequency || '', season: s.season || '', bullets: FULL_BULLETS[s.id] || [s.name],
                    price: s.price, priceLabel: s.priceLabel || '',
                    visitsPerYear: s.visitsPerYear || 1, calcType: s.calcType || 'item',
                  })),
                  plans: PLAN_TIERS.map((p) => ({ name: p.name, monthlyPrice: `$${fmt(Math.round((ag.annualTotal || 0) / 12) + p.addonPerMonth)}`, description: p.description, extras: p.extras, popular: p.popular || false })),
                  term: { startDate: termStart, endDate: '', months: ag.termMonths || 12 },
                });
                const win = window.open('', '_blank'); win.document.write(html); win.document.close();
              }} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── STEP 1: CLIENT ───
  if (step === 'client') {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep('list')} className="p-2 rounded-lg hover:bg-surface-alt cursor-pointer"><ArrowLeft size={20} className="text-secondary" /></button>
          <div><h1 className="text-xl font-bold text-primary">New Contract</h1><p className="text-xs text-muted">Step 1: Client</p></div>
        </div>
        <div className="bg-card rounded-2xl border border-border-subtle p-5">
          <label className="block text-xs font-medium text-muted mb-2">Search Jobber</label>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input type="text" value={search.query} onChange={(e) => search.setQuery(e.target.value)} placeholder="Type a name..."
              className="w-full rounded-xl border border-border-default bg-card pl-9 pr-10 py-2.5 text-sm text-primary outline-none focus:ring-2 focus:ring-brand placeholder:text-muted" />
            {search.loading && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted animate-spin" />}
          </div>
          {search.results.length > 0 && (
            <div className="mt-2 border border-border-default rounded-xl overflow-hidden max-h-48 overflow-y-auto">
              {search.results.map((c) => (
                <button key={c.id} onClick={() => selectClient(c)} className="w-full text-left px-4 py-3 hover:bg-surface-alt cursor-pointer border-b border-border-subtle/50 last:border-0">
                  <p className="text-sm font-medium text-primary">{c.name}</p>
                  <p className="text-xs text-muted">{c.address}{c.city ? `, ${c.city}` : ''}</p>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="bg-card rounded-2xl border border-border-subtle p-5 space-y-4">
          {[{ k: 'name', l: 'Full Name' }, { k: 'phone', l: 'Phone' }, { k: 'email', l: 'Email' }].map(({ k, l }) => (
            <FormInput key={k} label={l} value={client[k]} onChange={(v) => setClient((p) => ({ ...p, [k]: v }))} type="text" />
          ))}

          {/* Address with autocomplete for geocoding */}
          <div className="relative">
            <label className="block text-[11px] font-medium text-muted mb-1">Service Address</label>
            <div className="relative">
              <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={addressAutocomplete.search || client.address}
                onChange={(e) => {
                  setClient((p) => ({ ...p, address: e.target.value }));
                  addressAutocomplete.setSearch(e.target.value);
                }}
                placeholder="Start typing an address..."
                className="w-full rounded-lg border border-border-default pl-9 pr-10 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-brand placeholder:text-muted/50"
              />
              {addressAutocomplete.loading && (
                <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted animate-spin" />
              )}
              {!addressAutocomplete.loading && clientLatLng && (
                <CheckCircle size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" />
              )}
            </div>

            {addressAutocomplete.suggestions.length > 0 && (
              <div className="absolute z-50 mt-1 w-full bg-card border border-border-strong rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {addressAutocomplete.suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setClient((p) => ({ ...p, address: s.displayName }));
                      setClientLatLng({ lat: s.lat, lng: s.lng });
                      addressAutocomplete.clear();
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-primary hover:bg-surface-alt transition-colors cursor-pointer border-b border-border-subtle last:border-b-0"
                  >
                    {s.displayName}
                  </button>
                ))}
              </div>
            )}

            {addressAutocomplete.error && (
              <p className="text-xs text-red-500 mt-1">{addressAutocomplete.error}</p>
            )}

            {clientLatLng && (
              <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                <CheckCircle size={12} /> Location saved
              </p>
            )}
          </div>

          <FormInput label="City / State / Zip" value={client.cityStateZip} onChange={(v) => setClient((p) => ({ ...p, cityStateZip: v }))} type="text" />
        </div>
        <button onClick={() => setStep('services')} disabled={!client.name.trim()}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-brand text-on-brand font-semibold hover:bg-brand-hover cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
          Next: Select Services <ArrowRight size={16} />
        </button>
      </div>
    );
  }

  // ─── STEP 2: SELECT SERVICES ───
  if (step === 'services') {
    const nextStep = () => {
      if (needsMeasure) {
        // Set map center from client geocode
        if (clientLatLng) setMapCenter(clientLatLng);
        setStep('measure');
      } else {
        setStep('calculate');
      }
    };

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep('client')} className="p-2 rounded-lg hover:bg-surface-alt cursor-pointer"><ArrowLeft size={20} className="text-secondary" /></button>
          <div><h1 className="text-xl font-bold text-primary">Select Services</h1><p className="text-xs text-muted">Step 2: What is {client.name.split(' ')[0]} getting?</p></div>
        </div>

        {/* Lawn Section */}
        <div>
          <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-2">Lawn</p>
          <div className="space-y-2">
            {LAWN_SERVICES.map((svc) => <ServiceToggle key={svc.id} svc={svc} active={isOn(svc.id)} onToggle={toggle} />)}
          </div>
        </div>

        {/* Beds & Extras */}
        <div>
          <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-2">Beds & Extras</p>
          <div className="space-y-2">
            {BED_SERVICES.filter((svc) => svc.id !== 'leaf').map((svc) => <ServiceToggle key={svc.id} svc={svc} active={isOn(svc.id)} onToggle={toggle} />)}
          </div>
        </div>

        <button onClick={nextStep} disabled={enabledIds.size === 0}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-brand text-on-brand font-semibold hover:bg-brand-hover cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
          {needsMeasure ? 'Next: Measure Property' : 'Next: Calculate'} <ArrowRight size={16} />
        </button>
      </div>
    );
  }

  // ─── STEP 3: MEASURE (only if lawn or aeration selected) ───
  if (step === 'measure') {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep('services')} className="p-2 rounded-lg hover:bg-surface-alt cursor-pointer"><ArrowLeft size={20} className="text-secondary" /></button>
          <div>
            <h1 className="text-xl font-bold text-primary">Measure Property</h1>
            <p className="text-xs text-muted">Step 3: Draw lawn areas on the map</p>
          </div>
        </div>

        {client.address && (
          <p className="text-sm text-secondary flex items-center gap-2">
            <MapPin size={14} className="text-muted" /> {client.address}
          </p>
        )}

        <div className="bg-card rounded-2xl shadow-sm border border-border-subtle overflow-hidden">
          <div style={{ height: '50vh' }}>
            <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-muted">Loading map...</div>}>
              <MapView
                center={mapCenter ? [mapCenter.lat, mapCenter.lng] : null}
                onMeasurementsChange={(updater) => {
                  setMeasurements((prev) => {
                    const next = typeof updater === 'function' ? updater(prev) : updater;
                    return next;
                  });
                }}
                measurements={measurements}
              />
            </Suspense>
          </div>
        </div>

        <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-5">
          <h3 className="text-sm font-bold text-primary mb-3">Measurements</h3>
          <Suspense fallback={null}>
            <MeasurementList
              measurements={measurements}
              onUpdate={(id, changes) => {
                setMeasurements((prev) => prev.map((m) => (m.id === id ? { ...m, ...changes } : m)));
              }}
              onDelete={(id) => {
                setMeasurements((prev) => prev.filter((m) => m.id !== id));
              }}
            />
          </Suspense>
          {mapLawnSqft > 0 && (
            <div className="mt-3 pt-3 border-t border-border-subtle">
              <p className="text-sm font-bold text-brand-text">Net Lawn: {mapLawnSqft.toLocaleString()} sq ft</p>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => {
              setMeasurements([]);
              setStep('calculate');
            }}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-border-strong text-secondary font-semibold hover:bg-surface-alt cursor-pointer"
          >
            <SkipForward size={16} /> Skip
          </button>
          <button
            onClick={() => setStep('calculate')}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-brand text-on-brand font-semibold hover:bg-brand-hover cursor-pointer"
          >
            Next: Calculate <ArrowRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  // ─── STEP 4: CALCULATE (per-service cards + plan + term) ───
  if (step === 'calculate') {
    const enabledServices = [...ALL_SERVICES.filter((s) => isOn(s.id)), ...(enabledIds.size > 0 ? [ALWAYS_INCLUDED] : [])];
    const backStep = needsMeasure ? 'measure' : 'services';
    const stepNum = needsMeasure ? 4 : 3;
    const totalSteps = needsMeasure ? 5 : 4;

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep(backStep)} className="p-2 rounded-lg hover:bg-surface-alt cursor-pointer"><ArrowLeft size={20} className="text-secondary" /></button>
          <div><h1 className="text-xl font-bold text-primary">Calculate</h1><p className="text-xs text-muted">Step {stepNum}: Price each service for {client.name.split(' ')[0]}</p></div>
        </div>

        {/* ── Property ── */}
        <div className="bg-card rounded-2xl border border-border-subtle p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-bold text-muted uppercase tracking-widest">Property</p>
            {(lawnSqft > 0 || bedSqft > 0) && <p className="text-xs text-muted">{(lawnSqft + bedSqft).toLocaleString()} total sq ft</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              {mapLawnSqft > 0 ? (
                <div className="rounded-xl bg-emerald-500/10 p-3 text-center">
                  <p className="text-lg font-bold text-emerald-500">{mapLawnSqft.toLocaleString()}</p>
                  <p className="text-[10px] text-muted">Lawn sq ft</p>
                </div>
              ) : (
                <FormInput label="Lawn sq ft" value={calc.lawnSqftManual} onChange={(v) => setC('lawnSqftManual', v)} placeholder="e.g. 8000" />
              )}
            </div>
            <div>
              {mapBedSqft > 0 ? (
                <div className="rounded-xl bg-red-500/10 p-3 text-center">
                  <p className="text-lg font-bold text-red-400">{mapBedSqft.toLocaleString()}</p>
                  <p className="text-[10px] text-muted">Bed sq ft</p>
                </div>
              ) : (
                <FormInput label="Bed sq ft" value={calc.bedSqftManual} onChange={(v) => setC('bedSqftManual', v)} placeholder="e.g. 500" />
              )}
            </div>
          </div>
        </div>

        {/* ── Services — clean list with tap-to-edit prices ── */}
        <div className="space-y-3">
          {/* Lawn & Leaf */}
          {isOn('lawn') && (() => {
            const isEow = calc.lawnPriceType === 'eow';
            const totalVisits = isEow ? 26 : 52;
            const displayPrice = overrides.lawn.enabled
              ? parseFloat(isEow ? overrides.lawn.eowOverride : overrides.lawn.weeklyOverride) || 0
              : (isEow ? prices.lawnEow : prices.lawnWeekly);
            return (
              <div className="bg-card rounded-2xl border border-border-subtle p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-primary">Lawn & Leaf</p>
                    <p className="text-[10px] text-muted">Year-round · {totalVisits} visits/yr</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-brand-text">${fmt(displayPrice)}<span className="text-xs font-normal text-muted">/visit</span></p>
                    <p className="text-[10px] text-muted">${fmt(displayPrice * totalVisits)}/yr</p>
                  </div>
                </div>

                {/* Frequency toggle */}
                <div className="flex gap-2">
                  {[{ id: 'weekly', label: 'Weekly (52)', price: prices.lawnWeekly }, { id: 'eow', label: 'Every Other Week (26)', price: prices.lawnEow }].map((opt) => (
                    <button key={opt.id} onClick={() => setC('lawnPriceType', opt.id)}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-all ${calc.lawnPriceType === opt.id ? 'bg-brand text-on-brand' : 'bg-surface-alt text-muted hover:text-secondary'}`}>
                      {opt.label}{opt.price > 0 ? ` $${fmt(opt.price)}` : ''}
                    </button>
                  ))}
                </div>

                {/* Override */}
                {overrides.lawn.enabled && (
                  <div className="grid grid-cols-2 gap-3">
                    <FormInput label="Weekly $" value={overrides.lawn.weeklyOverride || ''} onChange={(v) => setOverrides((p) => ({ ...p, lawn: { ...p.lawn, weeklyOverride: v, price: calc.lawnPriceType === 'weekly' ? v : (p.lawn.eowOverride || v) } }))} placeholder="50" />
                    <FormInput label="EOW $" value={overrides.lawn.eowOverride || ''} onChange={(v) => setOverrides((p) => ({ ...p, lawn: { ...p.lawn, eowOverride: v, price: calc.lawnPriceType === 'eow' ? v : (p.lawn.weeklyOverride || v) } }))} placeholder="70" />
                  </div>
                )}
                <button onClick={() => toggleOverride('lawn')} className="text-[10px] text-muted hover:text-secondary cursor-pointer">{overrides.lawn.enabled ? 'Use calculated price' : 'Override price'}</button>
              </div>
            );
          })()}

          {/* Aeration & Overseeding */}
          {isOn('aeration') && (() => {
            const seedRate = parseFloat(calc.seedRate) || 8;
            const bagPrice = parseFloat(calc.bagPrice) || 85;
            const seedLbs = lawnSqft > 0 ? (lawnSqft / 1000) * seedRate : 0;
            const bags = Math.ceil(seedLbs / 50);
            const aerPrice = overrides.aeration.enabled ? (parseFloat(overrides.aeration.price) || 0) : prices.aeration;
            return (
              <div className="bg-card rounded-2xl border border-border-subtle p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-primary">Aeration & Overseeding</p>
                    <p className="text-[10px] text-muted">1x per year · Fall</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-brand-text">${fmt(aerPrice)}</p>
                  </div>
                </div>

                {/* What we charge */}
                <div className="rounded-xl bg-surface-alt border border-border-subtle p-3 space-y-1.5">
                  <p className="text-[10px] font-bold text-muted uppercase tracking-widest">Charging</p>
                  <div className="flex justify-between text-[11px]"><span className="text-muted">Aeration</span><span className="text-primary font-semibold">${fmt(prices.aerationDetail.aerationPrice)}</span></div>
                  <div className="flex justify-between text-[11px]"><span className="text-muted">Overseeding ({prices.aerationDetail.seedLbs > 0 ? `${prices.aerationDetail.seedLbs} lbs` : '—'})</span><span className="text-primary font-semibold">${fmt(prices.aerationDetail.overseedQuote)}</span></div>
                  <div className="flex justify-between text-[11px] pt-1.5 border-t border-border-subtle/30"><span className="font-bold text-primary">Client pays</span><span className="text-brand-text font-bold">${fmt(aerPrice)}</span></div>
                </div>

                {/* Our costs */}
                {prices.aerationDetail.seedLbs > 0 && (() => {
                  const seedCogs = prices.aerationDetail.bags * 85;
                  return (
                    <div className="rounded-xl bg-surface-alt border border-border-subtle p-3 space-y-1.5">
                      <p className="text-[10px] font-bold text-muted uppercase tracking-widest">COGS</p>
                      <div className="flex justify-between text-[11px]"><span className="text-muted">Seed ({prices.aerationDetail.seedLbs} lbs / {prices.aerationDetail.bags} bags)</span><span className="text-primary font-semibold">${fmt(seedCogs)}</span></div>
                      <div className="flex justify-between text-[11px] pt-1.5 border-t border-border-subtle/30"><span className="font-bold text-red-400">Total COGS</span><span className="text-red-400 font-bold">-${fmt(seedCogs)}</span></div>
                      <div className="flex justify-between text-[11px]"><span className="font-bold text-emerald-500">Revenue before labor</span><span className="text-emerald-500 font-bold">${fmt(aerPrice - seedCogs)}</span></div>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-2 gap-3">
                  <FormInput label="Seed rate (lbs/1k sqft)" value={calc.seedRate} onChange={(v) => setC('seedRate', v)} />
                  <FormInput label="Charge per 50lb bag spread" value={calc.bagPrice} onChange={(v) => setC('bagPrice', v)} />
                </div>
                <OverrideToggle enabled={overrides.aeration.enabled} onToggle={() => toggleOverride('aeration')} overrideValue={overrides.aeration.price} onChangeOverride={(v) => setOverridePrice('aeration', v)} />
              </div>
            );
          })()}

          {/* Hedge Trimming */}
          {isOn('hedge') && (() => {
            const hedgePrice = overrides.hedge.enabled ? (parseFloat(overrides.hedge.price) || 0) : prices.hedge;
            const hedgeVisits = calc.hedgeMonths.length;
            const allMonths = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            const toggleMonth = (m) => setC('hedgeMonths', calc.hedgeMonths.includes(m) ? calc.hedgeMonths.filter((x) => x !== m) : [...calc.hedgeMonths, m]);
            return (
              <div className="bg-card rounded-2xl border border-border-subtle p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-primary">Hedge Trimming</p>
                    <p className="text-[10px] text-muted">{hedgeVisits}x per year · {calc.hedgeMonths.join(', ')}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-brand-text">${fmt(hedgePrice)}<span className="text-xs font-normal text-muted">/visit</span></p>
                    {hedgePrice > 0 && hedgeVisits > 0 && <p className="text-[10px] text-muted">${fmt(hedgePrice * hedgeVisits)}/yr</p>}
                  </div>
                </div>

                {/* Month picker */}
                <div>
                  <p className="text-[10px] font-medium text-muted mb-2">Months</p>
                  <div className="flex flex-wrap gap-1.5">
                    {allMonths.map((m) => (
                      <button key={m} onClick={() => toggleMonth(m)}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${calc.hedgeMonths.includes(m) ? 'bg-brand text-on-brand' : 'bg-surface-alt text-muted hover:text-secondary'}`}>
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  <FormInput label="Small" value={calc.bushesSmall} onChange={(v) => setC('bushesSmall', v)} placeholder="0" />
                  <FormInput label="Medium" value={calc.bushesMedium} onChange={(v) => setC('bushesMedium', v)} placeholder="0" />
                  <FormInput label="Large" value={calc.bushesLarge} onChange={(v) => setC('bushesLarge', v)} placeholder="0" />
                  <FormInput label="XL" value={calc.bushesXl} onChange={(v) => setC('bushesXl', v)} placeholder="0" />
                </div>
                <OverrideToggle enabled={overrides.hedge.enabled} onToggle={() => toggleOverride('hedge')} overrideValue={overrides.hedge.price} onChangeOverride={(v) => setOverridePrice('hedge', v)} />
              </div>
            );
          })()}

          {/* Mulch Installation */}
          {isOn('mulch') && (() => {
            const yds = prices.mulchDetail.cubicYards;
            const matPerYd = parseFloat(calc.mulchMaterialCost) || 40;
            const laborPerYd = parseFloat(calc.mulchChargePerYd) || 35;
            const loads = Math.ceil(yds / 6);
            const matCost = yds * matPerYd;
            const delivery = loads * 50;
            const tax = (matCost + delivery) * 0.07;
            const laborCost = yds * laborPerYd;
            const mulchPrice = overrides.mulch.enabled ? (parseFloat(overrides.mulch.price) || 0) : prices.mulch;
            return (
              <div className="bg-card rounded-2xl border border-border-subtle p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-primary">Mulch Installation</p>
                    <p className="text-[10px] text-muted">1x per year · Spring</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-brand-text">${fmt(mulchPrice)}</p>
                    {yds > 0 && <p className="text-[10px] text-muted">{yds} cubic yards</p>}
                  </div>
                </div>

                {/* What we charge */}
                <div className="rounded-xl bg-surface-alt border border-border-subtle p-3 space-y-1.5">
                  <p className="text-[10px] font-bold text-muted uppercase tracking-widest">Charging</p>
                  <div className="flex justify-between text-[11px]"><span className="text-muted">Mulch ({yds > 0 ? `${yds} yds` : '—'})</span><span className="text-primary font-semibold">{yds > 0 ? `$${fmt(matCost)}` : '—'}</span></div>
                  <div className="flex justify-between text-[11px]"><span className="text-muted">Delivery</span><span className="text-primary font-semibold">{yds > 0 ? `$${fmt(delivery)}` : '—'}</span></div>
                  <div className="flex justify-between text-[11px]"><span className="text-muted">Tax</span><span className="text-primary font-semibold">${fmt(tax)}</span></div>
                  <div className="flex justify-between text-[11px]"><span className="text-muted">Labor</span><span className="text-primary font-semibold">{yds > 0 ? `$${fmt(laborCost)}` : '—'}</span></div>
                  <div className="flex justify-between text-[11px] pt-1.5 border-t border-border-subtle/30"><span className="font-bold text-primary">Client pays</span><span className="text-brand-text font-bold">${fmt(mulchPrice)}</span></div>
                </div>

                {/* Our costs */}
                {yds > 0 && (() => {
                  const mulchCogs = matCost + delivery + tax;
                  return (
                    <div className="rounded-xl bg-surface-alt border border-border-subtle p-3 space-y-1.5">
                      <p className="text-[10px] font-bold text-muted uppercase tracking-widest">COGS</p>
                      <div className="flex justify-between text-[11px]"><span className="text-muted">Material</span><span className="text-primary font-semibold">${fmt(matCost)}</span></div>
                      <div className="flex justify-between text-[11px]"><span className="text-muted">Delivery</span><span className="text-primary font-semibold">${fmt(delivery)}</span></div>
                      <div className="flex justify-between text-[11px]"><span className="text-muted">Tax</span><span className="text-primary font-semibold">${fmt(tax)}</span></div>
                      <div className="flex justify-between text-[11px] pt-1.5 border-t border-border-subtle/30"><span className="font-bold text-red-400">Total COGS</span><span className="text-red-400 font-bold">-${fmt(mulchCogs)}</span></div>
                      <div className="flex justify-between text-[11px]"><span className="font-bold text-emerald-500">Revenue before labor</span><span className="text-emerald-500 font-bold">${fmt(mulchPrice - mulchCogs)}</span></div>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-2 gap-3">
                  <FormInput label="Bed sq ft" value={calc.mulchSqft} onChange={(v) => setC('mulchSqft', v)} placeholder="e.g. 500" />
                  <FormInput label="Depth (inches)" value={calc.mulchDepth} onChange={(v) => setC('mulchDepth', v)} />
                  <FormInput label="Material $/yd" value={calc.mulchMaterialCost} onChange={(v) => setC('mulchMaterialCost', v)} />
                  <FormInput label="Labor $/yd" value={calc.mulchChargePerYd} onChange={(v) => setC('mulchChargePerYd', v)} />
                </div>
                <OverrideToggle enabled={overrides.mulch.enabled} onToggle={() => toggleOverride('mulch')} overrideValue={overrides.mulch.price} onChangeOverride={(v) => setOverridePrice('mulch', v)} />
              </div>
            );
          })()}

          {/* Pine Needle Installation */}
          {isOn('pine') && (() => {
            const bales = parseInt(calc.pineBales) || 0;
            const laborPerBale = parseFloat(calc.pineLaborPerBale) || 6;
            const delivery = parseFloat(calc.pineDelivery) || 50;
            const matCost = bales * 4.25;
            const laborCost = bales * laborPerBale;
            const pinePrice = overrides.pine.enabled ? (parseFloat(overrides.pine.price) || 0) : prices.pine;
            return (
              <div className="bg-card rounded-2xl border border-border-subtle p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-primary">Pine Needles</p>
                    <p className="text-[10px] text-muted">1x per year · Spring</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-brand-text">${fmt(pinePrice)}</p>
                  </div>
                </div>

                {/* What we charge */}
                <div className="rounded-xl bg-surface-alt border border-border-subtle p-3 space-y-1.5">
                  <p className="text-[10px] font-bold text-muted uppercase tracking-widest">Charging</p>
                  <div className="flex justify-between text-[11px]"><span className="text-muted">Pine ({bales > 0 ? `${bales} bales` : '—'})</span><span className="text-primary font-semibold">{bales > 0 ? `$${fmt(matCost + laborCost)}` : '—'}</span></div>
                  <div className="flex justify-between text-[11px]"><span className="text-muted">Delivery</span><span className="text-primary font-semibold">${fmt(delivery)}</span></div>
                  <div className="flex justify-between text-[11px] pt-1.5 border-t border-border-subtle/30"><span className="font-bold text-primary">Client pays</span><span className="text-brand-text font-bold">${fmt(pinePrice)}</span></div>
                </div>

                {/* Our costs */}
                {bales > 0 && (() => {
                  const pineCogs = matCost;
                  return (
                    <div className="rounded-xl bg-surface-alt border border-border-subtle p-3 space-y-1.5">
                      <p className="text-[10px] font-bold text-muted uppercase tracking-widest">COGS</p>
                      <div className="flex justify-between text-[11px]"><span className="text-muted">Material ({bales} bales x $4.25)</span><span className="text-primary font-semibold">${fmt(pineCogs)}</span></div>
                      <div className="flex justify-between text-[11px] pt-1.5 border-t border-border-subtle/30"><span className="font-bold text-red-400">Total COGS</span><span className="text-red-400 font-bold">-${fmt(pineCogs)}</span></div>
                      <div className="flex justify-between text-[11px]"><span className="font-bold text-emerald-500">Revenue before labor</span><span className="text-emerald-500 font-bold">${fmt(pinePrice - pineCogs)}</span></div>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-3 gap-3">
                  <FormInput label="Bales" value={calc.pineBales} onChange={(v) => setC('pineBales', v)} placeholder="0" />
                  <FormInput label="Labor/bale $" value={calc.pineLaborPerBale} onChange={(v) => setC('pineLaborPerBale', v)} />
                  <FormInput label="Delivery $" value={calc.pineDelivery} onChange={(v) => setC('pineDelivery', v)} />
                </div>
                <OverrideToggle enabled={overrides.pine.enabled} onToggle={() => toggleOverride('pine')} overrideValue={overrides.pine.price} onChangeOverride={(v) => setOverridePrice('pine', v)} />
              </div>
            );
          })()}

          {/* Stick Removal — always included */}
          {enabledIds.size > 0 && (
            <div className="flex items-center justify-between px-5 py-3 rounded-2xl bg-surface-alt/50 border border-border-subtle/50">
              <p className="text-xs text-muted">Stick Removal · Every visit</p>
              <p className="text-xs font-bold text-brand-text">Included</p>
            </div>
          )}
        </div>

        {/* ── Price Breakdown ── */}
        <div className="bg-card rounded-2xl border border-brand/20 p-5 space-y-3">
          <p className="text-[11px] font-bold text-muted uppercase tracking-widest">Price Breakdown</p>
          {enabledServices.filter((s) => s.calcType !== 'included').map((svc) => {
            const price = getPrice(svc.id);
            const visits = getVisits(svc);
            const annual = svc.priceLabel === '/visit' ? price * visits : price;

            // Detail lines for services with cost breakdowns
            let details = [];
            if (svc.id === 'aeration' && lawnSqft > 0 && prices.aerationDetail) {
              const seedLbs = (lawnSqft / 1000) * (parseFloat(calc.seedRate) || 8);
              const bags = Math.ceil(seedLbs / 50);
              details = [
                `Aeration: $${fmt(prices.aerationDetail.aerationPrice)}`,
                `Seed: ${Math.round(seedLbs)} lbs (${bags} x 50lb bag${bags !== 1 ? 's' : ''} @ $${fmt(parseFloat(calc.bagPrice) || 200)}/bag)`,
                `Overseed cost: $${fmt(prices.aerationDetail.overseedQuote)}`,
              ];
            }
            if (svc.id === 'mulch' && prices.mulchDetail && prices.mulchDetail.cubicYards > 0) {
              const yds = prices.mulchDetail.cubicYards;
              const matCost = yds * (parseFloat(calc.mulchMaterialCost) || 40);
              const laborCost = yds * (parseFloat(calc.mulchChargePerYd) || 35);
              const loads = Math.ceil(yds / 6);
              const delivery = loads * 50;
              const tax = (matCost + delivery) * 0.07;
              details = [
                `${yds} cubic yards @ ${calc.mulchDepth || 3}" depth`,
                `Material: $${fmt(matCost)} (${yds} yds x $${fmt(parseFloat(calc.mulchMaterialCost) || 40)}/yd)`,
                `Delivery: $${fmt(delivery)}`,
                `Tax: $${fmt(tax)}`,
                `Labor: $${fmt(laborCost)} (${yds} yds x $${fmt(parseFloat(calc.mulchChargePerYd) || 35)}/yd)`,
              ];
            }
            if (svc.id === 'pine' && (parseInt(calc.pineBales) || 0) > 0) {
              const bales = parseInt(calc.pineBales) || 0;
              const laborPerBale = parseFloat(calc.pineLaborPerBale) || 6;
              const delivery = parseFloat(calc.pineDelivery) || 50;
              details = [
                `${bales} bales @ $4.25/bale = $${fmt(bales * 4.25)}`,
                `Labor: $${fmt(bales * laborPerBale)} (${bales} x $${fmt(laborPerBale)}/bale)`,
                `Delivery: $${fmt(delivery)}`,
              ];
            }
            if (svc.id === 'hedge') {
              const sm = parseInt(calc.bushesSmall) || 0;
              const md = parseInt(calc.bushesMedium) || 0;
              const lg = parseInt(calc.bushesLarge) || 0;
              const xl = parseInt(calc.bushesXl) || 0;
              const parts = [];
              if (sm) parts.push(`${sm} small ($${sm * 8})`);
              if (md) parts.push(`${md} medium ($${md * 12})`);
              if (lg) parts.push(`${lg} large ($${lg * 18})`);
              if (xl) parts.push(`${xl} XL ($${xl * 50})`);
              if (parts.length) {
                details = [parts.join(' · '), `${calc.hedgeMonths.length}x/yr: $${fmt(price)}/visit x ${calc.hedgeMonths.length} = $${fmt(price * calc.hedgeMonths.length)}`];
              }
            }

            return (
              <div key={svc.id} className="py-2 border-b border-border-subtle/30 last:border-0">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-primary">{svc.name}</p>
                    <p className="text-[10px] text-muted">{svc.priceLabel === '/visit' ? `$${fmt(price)}/visit x ${visits}` : svc.frequency}</p>
                  </div>
                  <p className="text-sm font-bold text-primary">${fmt(annual)}</p>
                </div>
                {details.length > 0 && (
                  <div className="mt-2 pl-3 border-l-2 border-border-subtle/30 space-y-0.5">
                    {details.map((d, i) => <p key={i} className="text-[10px] text-muted">{d}</p>)}
                  </div>
                )}
              </div>
            );
          })}
          {enabledIds.size > 0 && (
            <div className="flex items-center justify-between py-2 border-b border-border-subtle/30">
              <p className="text-sm text-muted">Stick Removal</p>
              <p className="text-sm font-bold text-brand-text">Included</p>
            </div>
          )}
          <div className="pt-2 space-y-1">
            <div className="flex justify-between items-center">
              <p className="text-xs text-muted">Annual Total</p>
              <p className="text-2xl font-black text-primary">${fmt(annualTotal)}</p>
            </div>
            {annualTotal > 0 && (
              <div className="flex justify-between items-center">
                <p className="text-xs text-muted">Monthly</p>
                <p className="text-lg font-bold text-brand-text">${fmt(Math.round(annualTotal / billingMonths))}/mo <span className="text-[10px] text-muted font-normal">({billingMonths} mo)</span></p>
              </div>
            )}
          </div>
        </div>

        {/* ── Plan tiers — compact ── */}
        <div className="flex gap-2">
          {PLAN_TIERS.map((plan) => {
            const planMonthly = Math.round(annualTotal / billingMonths) + plan.addonPerMonth;
            return (
              <div key={plan.id} className={`flex-1 rounded-xl p-3 text-center ${plan.popular ? 'border border-border-subtle/50 bg-brand-light/5' : 'border border-border-subtle/50'}`}>
                <p className="text-[10px] font-bold text-muted">{plan.name}</p>
                <p className="text-sm font-black text-brand-text mt-1">${fmt(planMonthly)}</p>
                <p className="text-[9px] text-muted">/mo</p>
              </div>
            );
          })}
        </div>

        {/* ── Start date ── */}
        <div className="bg-card rounded-2xl border border-border-subtle p-5 space-y-3">
          <FormInput label="Start Date" value={startDate} onChange={(v) => setStartDate(v)} type="date" />
          {startDate && (() => {
            const enabledSvcs = [...ALL_SERVICES.filter((s) => isOn(s.id)), ...(enabledIds.size > 0 ? [ALWAYS_INCLUDED] : [])];
            const term = calcTerm(startDate, enabledSvcs, getPrice, getVisits);
            if (!term) return null;
            return (
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted">Cycle</span>
                  <span className="font-semibold text-primary">{term.startFmt} → {term.endFmt}</span>
                </div>
                {!term.isFullCycle && (
                  <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-amber-500 font-bold">Year 1 ({term.remainingMonths} mo)</span>
                      <span className="font-bold text-brand-text">${fmt(term.proratedMonthly)}/mo</span>
                    </div>
                    <p className="text-[10px] text-muted">Renews at ${fmt(term.fullMonthly)}/mo</p>
                  </div>
                )}
                {term.isFullCycle && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted">Monthly</span>
                    <span className="text-lg font-bold text-brand-text">${fmt(term.fullMonthly)}/mo</span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        <button onClick={handleGenerate} disabled={!startDate}
          className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-brand text-on-brand font-black text-lg hover:bg-brand-hover cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98]">
          <FileText size={20} /> {editingId ? 'Save & Generate Contract' : 'Generate Contract'}
        </button>

        {onDone && (
          <button onClick={onDone}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-muted hover:text-secondary hover:bg-surface-alt cursor-pointer transition-colors">
            <ArrowLeft size={16} /> Back to Clients
          </button>
        )}
      </div>
    );
  }

  return null;
}
