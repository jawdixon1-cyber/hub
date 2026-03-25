import { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { ArrowLeft, ArrowRight, Search, Check, Plus, FileText, Loader2, Pencil, MapPin, CheckCircle, SkipForward } from 'lucide-react';
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
const ANCHOR_MARKUP = 1.2;

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

function calcAerationPrice(sqft, seedRate = 8, bagPrice = 200) {
  if (!sqft || sqft <= 0) return { aerationPrice: 0, overseedQuote: 0, total: 0 };
  const aerationPrice = sqft <= 10000 ? 169 : 169 + ((sqft - 10000) / 1000) * 15;
  const seedLbs = (sqft / 1000) * seedRate;
  const perLb = (bagPrice + bagPrice * TAX_RATE) / 50;
  const overseedQuote = Math.round(perLb * seedLbs * 100) / 100;
  return { aerationPrice: Math.round(aerationPrice * 100) / 100, overseedQuote, total: Math.round((aerationPrice + overseedQuote) * 100) / 100 };
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

/* ─── Term Calculator ─── */

// Contract always runs 12 months: 1st of start month → last day of month before
function calcTerm(startDateStr) {
  if (!startDateStr) return null;
  const start = new Date(startDateStr + 'T00:00:00');
  const startMonth = start.getMonth();
  const startYear = start.getFullYear();

  // Contract starts on 1st of the start month
  const contractStart = new Date(startYear, startMonth, 1);
  // Contract ends 12 months later, last day of the month before
  const contractEnd = new Date(startYear + 1, startMonth, 0); // day 0 = last day of prev month

  const startFmt = contractStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: getTimezone() });
  const endFmt = contractEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: getTimezone() });

  // First billing date is the actual start date
  const firstBilling = start.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: getTimezone() });

  return { startFmt, endFmt, firstBilling, months: 12 };
}

/* ─── Service Definitions ─── */

const LAWN_SERVICES = [
  {
    id: 'lawn', name: 'Lawn Maintenance', frequency: 'Weekly', season: 'Mar - Oct', visitsPerYear: 32,
    bullets: ['Mow, trim, edge, blow, weed beds every visit'],
    priceLabel: '/visit', calcType: 'lawn',
  },
  {
    id: 'aeration', name: 'Aeration & Overseeding', frequency: '1x per year', season: 'Fall (recommended)', visitsPerYear: 1,
    bullets: ['Core aerate + overseed at 8 lbs/1,000 sqft with LESCO Tall Fescue'],
    priceLabel: '', calcType: 'aeration',
  },
];

const BED_SERVICES = [
  {
    id: 'leaf', name: 'Leaf Maintenance', frequency: 'Weekly', season: 'Nov - Feb', visitsPerYear: 18,
    bullets: ['Blow leaves, mulch into lawn, trim, weed beds every visit'],
    priceLabel: '/visit', calcType: 'leaf',
  },
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
  lawn: ['Mow entire lawn at the proper height for your grass type', 'String trim where mowers can\'t reach', 'Edge along all sidewalks, driveways, and curbs', 'Edge around landscape beds', 'Blow all clippings off hard surfaces', 'Weed all landscape beds during each visit'],
  leaf: ['Blow all leaves off landscape beds, porches, walkways, driveways, and hard surfaces', 'Mulch leaves into the lawn to return nutrients to the soil', 'Trim grass as needed', 'Keep beds and the entire property looking clean', 'Weed all landscape beds during each visit'],
  aeration: ['Core aerate the entire lawn with commercial-grade equipment', 'Overseed at 8 lbs per 1,000 sq ft using LESCO Tall Fescue Select Blend', 'Provide clear aftercare instructions for watering'],
  sticks: ['Pick up all sticks on the property every visit', 'Haul away and dispose of off-site'],
  hedge: ['Shape and trim all shrubs, bushes, and hedges on the property', 'Remove all clippings and debris from beds and surrounding areas', 'Maintain natural shape while keeping growth in check'],
  mulch: ['Weed all landscape beds before installation', 'Install fresh mulch in all landscape beds at 3 inches deep', 'Edge beds cleanly before installation', 'Clean up all walkways, driveways, and hard surfaces after installation'],
  pine: ['Weed all landscape beds before installation', 'Install fresh pine needles in all landscape beds', 'Clean up all walkways, driveways, and hard surfaces after installation'],
};

const PLAN_TIERS = [
  { id: 'total-care', name: 'Total Care', description: 'All selected services bundled into one predictable monthly payment', extras: [] },
  { id: 'total-care-plus', name: 'Total Care Plus', description: 'Includes everything in Total Care +', extras: ['Leaf Upgrade (Nov-Feb): Haul off all leaves instead of mulching', 'Seasonal Bed Refresh (Fall): Turn and fluff existing mulch'] },
  { id: 'total-care-premium', name: 'Total Care Premium', description: 'Includes everything in Total Care Plus +', extras: ['Up to 2 priority touch-up visits per year', 'Up to 3 storm cleanup visits per year', '48-hour priority requests'] },
];

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

export default function ServiceAgreement() {
  const agreements = useAppStore((s) => s.agreements);
  const setAgreements = useAppStore((s) => s.setAgreements);

  const [step, setStep] = useState('list');
  const search = useJobberSearch();
  const addressAutocomplete = useAddressAutocomplete();

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
    // Lawn
    lawnSqftManual: '',
    difficulty: 'easy',
    lawnPriceType: 'weekly', // 'weekly' | 'eow'
    // Leaf
    leafPerVisit: '',
    // Aeration
    seedRate: '8', bagPrice: '200',
    // Hedge
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
  const [startDate, setStartDate] = useState('');

  const toggle = (id) => setEnabledIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const isOn = (id) => enabledIds.has(id);

  // Determine if measure step is needed
  const needsMeasure = isOn('lawn') || isOn('aeration');

  // Lawn sqft: from map measurements or manual input
  const mapLawnSqft = useMemo(() => {
    if (!measurements || measurements.length === 0) return 0;
    const totals = computeNetTotals(measurements);
    return totals.lawn || 0;
  }, [measurements]);

  const lawnSqft = mapLawnSqft > 0 ? mapLawnSqft : (parseFloat(calc.lawnSqftManual) || 0);

  // Calculated prices from calculator inputs
  const prices = useMemo(() => {
    const lawnWeekly = calcLawnPrice(lawnSqft, calc.difficulty);
    const lawnEow = lawnSqft > 0 ? Math.round(lawnWeekly * 1.5) : 0;
    const selectedLawnPrice = calc.lawnPriceType === 'eow' ? lawnEow : lawnWeekly;
    const leafPerVisit = parseFloat(calc.leafPerVisit) || lawnWeekly;
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
    if (id === 'lawn') {
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
  const getVisits = (svc) => {
    if (svc.id === 'lawn') return calc.lawnPriceType === 'eow' ? 16 : 32;
    return svc.visitsPerYear;
  };

  // Annual totals
  const annualTotal = useMemo(() => {
    return ALL_SERVICES.filter((s) => isOn(s.id) && s.calcType !== 'included')
      .reduce((sum, svc) => {
        const p = getPrice(svc.id);
        return sum + (svc.priceLabel === '/visit' ? p * getVisits(svc) : p);
      }, 0);
  }, [enabledIds, prices, overrides, calc.lawnPriceType]);

  const anchorAnnualTotal = useMemo(() => {
    return ALL_SERVICES.filter((s) => isOn(s.id) && s.calcType !== 'included')
      .reduce((sum, svc) => {
        const p = Math.round(getPrice(svc.id) * ANCHOR_MARKUP * 100) / 100;
        return sum + (svc.priceLabel === '/visit' ? p * getVisits(svc) : p);
      }, 0);
  }, [enabledIds, prices, overrides]);

  const annualSavings = anchorAnnualTotal - annualTotal;

  // Auto-monthly = annual / 12
  useEffect(() => {
    if (autoMonthly && annualTotal > 0) {
      setMonthlyPrice(String(Math.round(annualTotal / 12)));
    }
  }, [annualTotal, autoMonthly]);

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
    const term = calcTerm(startDate);
    const termEndDate = term ? term.endFmt : '';
    const termMonthsActual = 12;
    const termStartFmt = term ? term.startFmt : '';

    const html = generateAgreementHTML({
      client,
      services: enabled.map((s) => ({
        name: s.name, frequency: s.frequency, season: s.season,
        bullets: FULL_BULLETS[s.id] || s.bullets,
        price: getPrice(s.id), priceLabel: s.priceLabel,
        anchorPrice: s.calcType !== 'included' ? Math.round(getPrice(s.id) * ANCHOR_MARKUP * 100) / 100 : null,
        visitsPerYear: getVisits(s), calcType: s.calcType,
      })),
      plan: plan ? { name: plan.name, monthlyPrice: `$${fmt(parseFloat(monthlyPrice) || 0)}`, description: plan.description, extras: plan.extras } : null,
      term: { startDate: termStartFmt, endDate: termEndDate, months: termMonthsActual },
      annualSavings: Math.round(annualSavings * 100) / 100,
    });
    const win = window.open('', '_blank'); win.document.write(html); win.document.close();
    setAgreements([{
      id: genId(), clientName: client.name, clientAddress: client.address,
      services: enabled.map((s) => ({ name: s.name, price: getPrice(s.id) })),
      planTier: selectedPlan, monthlyPrice: parseFloat(monthlyPrice) || 0,
      termStart: startDate, termMonths: termMonthsActual, annualTotal: Math.round(annualTotal * 100) / 100,
      createdAt: new Date().toISOString(),
    }, ...(agreements || [])]);
  };

  const startNew = () => {
    setClient({ name: '', phone: '', email: '', address: '', cityStateZip: 'Rock Hill, SC 29732' });
    setClientLatLng(null);
    setEnabledIds(new Set());
    setMeasurements([]);
    setMapCenter(null);
    setCalc({ lawnSqftManual: '', difficulty: 'easy', lawnPriceType: 'weekly', leafPerVisit: '', seedRate: '8', bagPrice: '200', bushesSmall: '', bushesMedium: '', bushesLarge: '', bushesXl: '', mulchSqft: '', mulchDepth: '3', mulchMaterialCost: '40', mulchChargePerYd: '35', pineBales: '', pineLaborPerBale: '6', pineDelivery: '50' });
    setOverrides({ lawn: { enabled: false, price: '' }, leaf: { enabled: false, price: '' }, aeration: { enabled: false, price: '' }, hedge: { enabled: false, price: '' }, mulch: { enabled: false, price: '' }, pine: { enabled: false, price: '' } });
    setSelectedPlan('total-care'); setMonthlyPrice(''); setAutoMonthly(true); setStartDate(''); setTermMonths(12);
    addressAutocomplete.clear();
    setStep('client');
  };

  // ─── LIST ───
  if (step === 'list') {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-primary">Agreements</h1>
          <button onClick={startNew} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand text-on-brand text-sm font-semibold hover:bg-brand-hover cursor-pointer">
            <Plus size={16} /> New
          </button>
        </div>
        {(!agreements || agreements.length === 0) ? (
          <div className="text-center py-16">
            <FileText size={48} className="text-muted/30 mx-auto mb-4" />
            <p className="text-muted text-sm">No agreements yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {agreements.map((a) => (
              <div key={a.id} className="bg-card rounded-2xl border border-border-subtle p-5 flex items-center justify-between">
                <div><p className="text-sm font-bold text-primary">{a.clientName}</p><p className="text-xs text-muted">{a.clientAddress}</p></div>
                <div className="text-right"><p className="text-sm font-bold text-brand-text">${a.monthlyPrice}/mo</p><p className="text-xs text-muted">{new Date(a.createdAt).toLocaleDateString('en-US', { timeZone: getTimezone() })}</p></div>
              </div>
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
          <div><h1 className="text-xl font-bold text-primary">New Agreement</h1><p className="text-xs text-muted">Step 1: Client</p></div>
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
            {BED_SERVICES.map((svc) => <ServiceToggle key={svc.id} svc={svc} active={isOn(svc.id)} onToggle={toggle} />)}
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

        {/* ── Lawn Maintenance Card ── */}
        {isOn('lawn') && (
          <div className="bg-card rounded-2xl border border-border-subtle p-5">
            <div className="flex items-start justify-between gap-6">
              <div className="flex-1 space-y-4">
                <p className="text-[11px] font-bold text-muted uppercase tracking-widest">Lawn Maintenance</p>

                {/* Sqft display */}
                {mapLawnSqft > 0 ? (
                  <p className="text-xs text-secondary">
                    <span className="font-semibold text-brand-text">{mapLawnSqft.toLocaleString()} sq ft</span> from map
                  </p>
                ) : (
                  <FormInput label="Lawn Sq Ft (manual)" value={calc.lawnSqftManual} onChange={(v) => setC('lawnSqftManual', v)} placeholder="e.g. 8000" />
                )}

                {/* Difficulty */}
                <div>
                  <label className="block text-[11px] font-medium text-muted mb-1">Difficulty</label>
                  <div className="flex gap-2">
                    {['easy', 'moderate', 'hard'].map((d) => (
                      <button
                        key={d}
                        onClick={() => setC('difficulty', d)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize cursor-pointer transition-colors ${calc.difficulty === d ? 'bg-brand text-on-brand' : 'bg-surface-alt text-secondary hover:bg-border-subtle'}`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Weekly / EOW selection */}
                {lawnSqft > 0 && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setC('lawnPriceType', 'weekly')}
                      className={`flex-1 px-3 py-2.5 rounded-xl text-sm font-semibold cursor-pointer transition-colors ${calc.lawnPriceType === 'weekly' ? 'bg-brand text-on-brand' : 'border border-border-strong text-secondary hover:bg-surface-alt'}`}
                    >
                      Weekly ${fmt(prices.lawnWeekly)}
                    </button>
                    <button
                      onClick={() => setC('lawnPriceType', 'eow')}
                      className={`flex-1 px-3 py-2.5 rounded-xl text-sm font-semibold cursor-pointer transition-colors ${calc.lawnPriceType === 'eow' ? 'bg-brand text-on-brand' : 'border border-border-strong text-secondary hover:bg-surface-alt'}`}
                    >
                      EOW ${fmt(prices.lawnEow)}
                    </button>
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                {(() => {
                  const isEow = calc.lawnPriceType === 'eow';
                  const visits = isEow ? 16 : 32;
                  const displayPrice = overrides.lawn.enabled
                    ? parseFloat(isEow ? overrides.lawn.eowOverride : overrides.lawn.weeklyOverride) || 0
                    : (isEow ? prices.lawnEow : prices.lawnWeekly);
                  return <>
                    <p className="text-2xl font-bold text-brand-text">${fmt(displayPrice)}</p>
                    <p className="text-[10px] text-muted">/{isEow ? 'EOW visit' : 'visit'}</p>
                    {lawnSqft > 0 && (
                      <p className="text-[10px] text-muted mt-1">× {visits} = ${fmt(displayPrice * visits)}/yr</p>
                    )}
                  </>;
                })()}
              </div>
            </div>
            {/* Override — shows weekly + EOW inputs */}
            <div className="mt-3 pt-3 border-t border-border-subtle/50">
              <label className="flex items-center gap-2 cursor-pointer">
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${overrides.lawn.enabled ? 'bg-brand border-brand' : 'border-border-strong'}`}>
                  {overrides.lawn.enabled && <Check size={10} className="text-on-brand" />}
                </div>
                <span className="text-[11px] text-muted" onClick={() => toggleOverride('lawn')}>Override price</span>
              </label>
              {overrides.lawn.enabled && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <FormInput label="Weekly Override" value={overrides.lawn.weeklyOverride || ''} onChange={(v) => setOverrides((p) => ({ ...p, lawn: { ...p.lawn, weeklyOverride: v, price: calc.lawnPriceType === 'weekly' ? v : (p.lawn.eowOverride || v) } }))} placeholder="e.g. 50" />
                  <FormInput label="EOW Override" value={overrides.lawn.eowOverride || ''} onChange={(v) => setOverrides((p) => ({ ...p, lawn: { ...p.lawn, eowOverride: v, price: calc.lawnPriceType === 'eow' ? v : (p.lawn.weeklyOverride || v) } }))} placeholder="e.g. 70" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Leaf Maintenance Card ── */}
        {isOn('leaf') && (
          <div className="bg-card rounded-2xl border border-border-subtle p-5">
            <div className="flex items-start justify-between gap-6">
              <div className="flex-1 space-y-4">
                <p className="text-[11px] font-bold text-muted uppercase tracking-widest">Leaf Maintenance</p>
                <FormInput label="Per Visit Price" value={calc.leafPerVisit} onChange={(v) => setC('leafPerVisit', v)} placeholder={prices.lawnWeekly ? String(prices.lawnWeekly) : 'e.g. 50'} />
                <p className="text-[10px] text-muted">Defaults to lawn weekly price if left blank</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-2xl font-bold text-brand-text">${fmt(overrides.leaf.enabled ? (parseFloat(overrides.leaf.price) || 0) : prices.leaf)}</p>
                <p className="text-[10px] text-muted">/visit</p>
                <p className="text-[10px] text-muted mt-1">x 18 = ${fmt((overrides.leaf.enabled ? (parseFloat(overrides.leaf.price) || 0) : prices.leaf) * 18)}/yr</p>
              </div>
            </div>
            <OverrideToggle enabled={overrides.leaf.enabled} onToggle={() => toggleOverride('leaf')} overrideValue={overrides.leaf.price} onChangeOverride={(v) => setOverridePrice('leaf', v)} />
          </div>
        )}

        {/* ── Aeration & Overseeding Card ── */}
        {isOn('aeration') && (
          <div className="bg-card rounded-2xl border border-border-subtle p-5">
            <div className="flex items-start justify-between gap-6">
              <div className="flex-1 space-y-4">
                <p className="text-[11px] font-bold text-muted uppercase tracking-widest">Aeration & Overseeding</p>
                <p className="text-xs text-secondary">
                  Lawn: <span className="font-semibold text-brand-text">{lawnSqft > 0 ? `${lawnSqft.toLocaleString()} sq ft` : 'not set'}</span>
                  {mapLawnSqft > 0 && <span className="text-muted"> (from map)</span>}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <FormInput label="Seed Rate (lbs/1k)" value={calc.seedRate} onChange={(v) => setC('seedRate', v)} />
                  <FormInput label="Bag Price (50lb)" value={calc.bagPrice} onChange={(v) => setC('bagPrice', v)} />
                </div>
                {lawnSqft > 0 && (
                  <p className="text-[10px] text-muted">
                    Aeration: ${fmt(prices.aerationDetail.aerationPrice)} + Overseed: ${fmt(prices.aerationDetail.overseedQuote)}
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-2xl font-bold text-brand-text">${fmt(overrides.aeration.enabled ? (parseFloat(overrides.aeration.price) || 0) : prices.aeration)}</p>
                <p className="text-[10px] text-muted">total</p>
              </div>
            </div>
            <OverrideToggle enabled={overrides.aeration.enabled} onToggle={() => toggleOverride('aeration')} overrideValue={overrides.aeration.price} onChangeOverride={(v) => setOverridePrice('aeration', v)} />
          </div>
        )}

        {/* ── Hedge Trimming Card ── */}
        {isOn('hedge') && (
          <div className="bg-card rounded-2xl border border-border-subtle p-5">
            <div className="flex items-start justify-between gap-6">
              <div className="flex-1 space-y-4">
                <p className="text-[11px] font-bold text-muted uppercase tracking-widest">Hedge Trimming</p>
                <div className="grid grid-cols-4 gap-2">
                  <FormInput label="Small" value={calc.bushesSmall} onChange={(v) => setC('bushesSmall', v)} placeholder="0" />
                  <FormInput label="Medium" value={calc.bushesMedium} onChange={(v) => setC('bushesMedium', v)} placeholder="0" />
                  <FormInput label="Large" value={calc.bushesLarge} onChange={(v) => setC('bushesLarge', v)} placeholder="0" />
                  <FormInput label="XL" value={calc.bushesXl} onChange={(v) => setC('bushesXl', v)} placeholder="0" />
                </div>
                <p className="text-[10px] text-muted">$8/sm · $12/md · $18/lg · $50/xl · $35 min</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-2xl font-bold text-brand-text">${fmt(overrides.hedge.enabled ? (parseFloat(overrides.hedge.price) || 0) : prices.hedge)}</p>
                <p className="text-[10px] text-muted">/visit</p>
                {prices.hedge > 0 && (
                  <p className="text-[10px] text-muted mt-1">x 3 = ${fmt((overrides.hedge.enabled ? (parseFloat(overrides.hedge.price) || 0) : prices.hedge) * 3)}/yr</p>
                )}
              </div>
            </div>
            <OverrideToggle enabled={overrides.hedge.enabled} onToggle={() => toggleOverride('hedge')} overrideValue={overrides.hedge.price} onChangeOverride={(v) => setOverridePrice('hedge', v)} />
          </div>
        )}

        {/* ── Mulch Installation Card ── */}
        {isOn('mulch') && (
          <div className="bg-card rounded-2xl border border-border-subtle p-5">
            <div className="flex items-start justify-between gap-6">
              <div className="flex-1 space-y-4">
                <p className="text-[11px] font-bold text-muted uppercase tracking-widest">Mulch Installation</p>
                <div className="grid grid-cols-2 gap-3">
                  <FormInput label="Bed Sq Ft" value={calc.mulchSqft} onChange={(v) => setC('mulchSqft', v)} placeholder="e.g. 500" />
                  <FormInput label="Depth (inches)" value={calc.mulchDepth} onChange={(v) => setC('mulchDepth', v)} />
                  <FormInput label="Material $/yd" value={calc.mulchMaterialCost} onChange={(v) => setC('mulchMaterialCost', v)} />
                  <FormInput label="Labor $/yd" value={calc.mulchChargePerYd} onChange={(v) => setC('mulchChargePerYd', v)} />
                </div>
                {prices.mulchDetail.cubicYards > 0 && (
                  <p className="text-[10px] text-muted">{prices.mulchDetail.cubicYards} yds · {prices.mulchDetail.loads} load{prices.mulchDetail.loads !== 1 ? 's' : ''}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-2xl font-bold text-brand-text">${fmt(overrides.mulch.enabled ? (parseFloat(overrides.mulch.price) || 0) : prices.mulch)}</p>
                <p className="text-[10px] text-muted">total</p>
              </div>
            </div>
            <OverrideToggle enabled={overrides.mulch.enabled} onToggle={() => toggleOverride('mulch')} overrideValue={overrides.mulch.price} onChangeOverride={(v) => setOverridePrice('mulch', v)} />
          </div>
        )}

        {/* ── Pine Needle Installation Card ── */}
        {isOn('pine') && (
          <div className="bg-card rounded-2xl border border-border-subtle p-5">
            <div className="flex items-start justify-between gap-6">
              <div className="flex-1 space-y-4">
                <p className="text-[11px] font-bold text-muted uppercase tracking-widest">Pine Needle Installation</p>
                <div className="grid grid-cols-3 gap-3">
                  <FormInput label="Bales" value={calc.pineBales} onChange={(v) => setC('pineBales', v)} placeholder="0" />
                  <FormInput label="Labor/Bale ($)" value={calc.pineLaborPerBale} onChange={(v) => setC('pineLaborPerBale', v)} />
                  <FormInput label="Delivery ($)" value={calc.pineDelivery} onChange={(v) => setC('pineDelivery', v)} />
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-2xl font-bold text-brand-text">${fmt(overrides.pine.enabled ? (parseFloat(overrides.pine.price) || 0) : prices.pine)}</p>
                <p className="text-[10px] text-muted">total</p>
              </div>
            </div>
            <OverrideToggle enabled={overrides.pine.enabled} onToggle={() => toggleOverride('pine')} overrideValue={overrides.pine.price} onChangeOverride={(v) => setOverridePrice('pine', v)} />
          </div>
        )}

        {/* ── Stick Removal ── */}
        <div className="bg-card rounded-2xl border border-border-subtle p-5">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-[11px] font-bold text-muted uppercase tracking-widest">Stick Removal</p>
              <p className="text-[10px] text-muted mt-1">Every visit · Year-round</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-2xl font-bold text-brand-text">Included</p>
            </div>
          </div>
        </div>

        {/* ── Summary ── */}
        <div className="bg-card rounded-2xl border border-border-subtle p-5 space-y-3">
          <p className="text-[11px] font-bold text-muted uppercase tracking-widest">Summary</p>
          {enabledServices.filter((s) => s.calcType !== 'included').map((svc) => {
            const price = getPrice(svc.id);
            const anchor = Math.round(price * ANCHOR_MARKUP * 100) / 100;
            const annual = svc.priceLabel === '/visit' ? price * svc.visitsPerYear : price;
            return (
              <div key={svc.id} className="flex items-center justify-between">
                <span className="text-xs text-primary">{svc.name}</span>
                <div className="text-right">
                  <span className="text-[10px] text-muted line-through mr-2">${fmt(anchor)}{svc.priceLabel}</span>
                  <span className="text-xs font-bold text-brand-text">${fmt(price)}{svc.priceLabel}</span>
                </div>
              </div>
            );
          })}
          <div className="border-t border-border-subtle pt-3 space-y-1">
            <div className="flex justify-between"><span className="text-xs text-muted">Annual (contract)</span><span className="text-sm font-bold text-primary">${fmt(annualTotal)}</span></div>
            <div className="flex justify-between"><span className="text-xs text-muted">Annual (individual)</span><span className="text-sm text-muted line-through">${fmt(anchorAnnualTotal)}</span></div>
            {annualSavings > 0 && <div className="flex justify-between"><span className="text-xs text-muted">Client saves</span><span className="text-sm font-bold text-emerald-500">${fmt(annualSavings)}/yr</span></div>}
          </div>
        </div>

        {/* ── Plan ── */}
        <div className="bg-card rounded-2xl border border-border-subtle p-5 space-y-4">
          <p className="text-[11px] font-bold text-muted uppercase tracking-widest">Plan</p>
          <div className="space-y-2">
            {PLAN_TIERS.map((plan) => (
              <button key={plan.id} onClick={() => setSelectedPlan(plan.id)}
                className={`w-full text-left px-4 py-3 rounded-xl border cursor-pointer ${selectedPlan === plan.id ? 'border-brand bg-brand-light/20' : 'border-border-subtle hover:border-border-strong'}`}>
                <p className="text-sm font-bold text-primary">{plan.name}</p>
                {plan.extras.length > 0 && <p className="text-[10px] text-muted">+ {plan.extras.length} extras</p>}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-[11px] font-medium text-muted mb-1">Monthly Price</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted">$</span>
              <input type="number" value={monthlyPrice} onChange={(e) => { setMonthlyPrice(e.target.value); setAutoMonthly(false); }}
                className="w-32 rounded-lg border border-border-default px-3 py-2 text-sm font-bold text-primary outline-none focus:ring-2 focus:ring-brand" />
              <span className="text-xs text-muted">/month</span>
              {!autoMonthly && <button onClick={() => setAutoMonthly(true)} className="text-[10px] text-muted underline cursor-pointer">auto</button>}
            </div>
          </div>
        </div>

        {/* ── Term ── */}
        <div className="bg-card rounded-2xl border border-border-subtle p-5 space-y-4">
          <p className="text-[11px] font-bold text-muted uppercase tracking-widest">Term</p>
          <FormInput label="Start Date" value={startDate} onChange={(v) => setStartDate(v)} type="date" />

          {startDate && (() => {
            const term = calcTerm(startDate);
            if (!term) return null;
            return (
              <div className="rounded-xl bg-surface-alt/50 p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs text-muted">Contract period</span>
                  <span className="text-xs font-semibold text-primary">{term.startFmt} → {term.endFmt}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-muted">Duration</span>
                  <span className="text-xs font-semibold text-primary">12 months</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-muted">First billing</span>
                  <span className="text-xs font-semibold text-primary">{term.firstBilling}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-border-subtle">
                  <span className="text-xs text-muted">Monthly price</span>
                  <span className="text-lg font-bold text-brand-text">${fmt(parseFloat(monthlyPrice) || 0)}/mo</span>
                </div>
              </div>
            );
          })()}
        </div>

        <button onClick={handleGenerate} disabled={!startDate}
          className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-brand text-on-brand font-bold text-lg hover:bg-brand-hover cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
          <FileText size={20} /> Generate Agreement
        </button>
      </div>
    );
  }

  return null;
}
