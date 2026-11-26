import { Fragment, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Lightbulb, Sparkles, Copy, Check, FolderOpen, Trash2, Plus, Layers } from 'lucide-react';
import LightsMeasurePhotos from '../components/LightsMeasurePhotos';
import LightsMockup from '../components/LightsMockup';
import LightsQuotePreview from '../components/LightsQuotePreview';
import LightsExtras from '../components/LightsExtras';
import { extrasStrands, STRAND_FT as EXTRA_STRAND_FT } from '../lib/lightsExtras';
import LightsAddons from '../components/LightsAddons';
import LightsOffers from '../components/LightsOffers';
import LightsPairs from '../components/LightsPairs';
import { DESIGNS } from '../lib/lightsDesigns';
import { kindOf } from '../lib/lightsMaterials';
import JobberClientPicker from '../components/JobberClientPicker';
import LightsEstimate from './LightsEstimate';
import LightsBusiness, { QuoteMaterialsCard } from '../components/LightsBusiness';
import { openCrewView, ensureCrewToken, getExtrasMeta, DRAFT_ID, putQuote, getQuote, deleteQuote, listQuotes, listCovers, getLocalQuote, setLightsOrg, cloudHas, warmQuotes, cloudSavedAt, patchQuoteMeta } from '../lib/lightsStore';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/AppStoreContext';
import { useJobberList, quoteStage, STAGE_LABEL, nameKey } from '../lib/jobberLights';

// Christmas lights quoter: roofline per foot + strands each, with one minimum
// for the whole lights job. Prices are remembered in this browser.
const PRICES_KEY = 'lights-quoter-prices-v2';
const DEFAULT_PRICES = { easy: '6', medium: '8', hard: '10', perStrand: '35', minimum: '600' };
const LEVELS = [
  { key: 'easy', label: 'Easy', hint: '1-story, simple roofline', range: '$6–8/ft' },
  { key: 'medium', label: 'Medium', hint: '2-story or some peaks', range: '$8–10/ft' },
  { key: 'hard', label: 'Hard', hint: 'Steep, tall, lots of peaks', range: '$10–15/ft' },
];

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const money = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const dollars = (n) => `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`; // list view: whole dollars

// Numbered step title, same look as the steps inside the photo/mockup cards.
function StepHead({ title, sub }) {
  return (
    <div>
      <p className="text-lg font-bold text-primary">{title}</p>
      {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
    </div>
  );
}
// Each roof line's feet, mount and wire color (Mark up) — materials count clips + wire line by line.
// Clip color: picked per line, else white on gutters (matches the gutter), wire color on gutter guard / shingle / metal.
const runsOf = (angles, wire) => angles.flatMap((a) => (a.lines || []).map((l) => {
  const mount = l.mount || 'gutter';
  const w = l.color || wire;
  return { ft: Number(l.feet) || 0, mount, wire: w, clip: mount === 'shingle' || mount === 'guard' ? 'black' : l.clip === 'black' ? 'black' : 'white' }; // shingle tabs always black; gutter clips white unless set black (black gutters)
}));

// Zip (jump) lines measured in Measure: feet + color for zip cord.
const zipsOf = (angles) => angles.flatMap((a) => (a.jumps || []).map((j) => ({ ft: Number(j.feet) || 0, color: j.color || 'white' })));

const WIZARD = ['', 'Discovery', 'Photos', 'Plan', 'Measure', 'Difficulty', 'Add-ons', 'Materials', 'Lights', 'Mockup', 'Dates', 'Present', 'Offers', 'Summary', 'Production'];
// The order you walk the steps in. Step numbers stay the same (saved confirmations use them);
// Materials (7) is shown inside Plan (3): one step, one lock, one Confirm (2026-11-12).
const STEP_ORDER = [1, 2, 3, 4, 5, 7, 6, 9, 10, 12, 11, 13, 14]; // 14 Production: strands + team view // 11 Present (just the button), then 13 Summary (their decision, links, Jobber quote)
const _so = STEP_ORDER; // Materials (7) is its own step after Difficulty; Extras (6) replaced by Add-ons in Present; Lights (8) dropped — the Plan already shows the lines
// Add-ons skip the sales steps: Photos → Plan → Measure → Materials → Summary (price + Jobber approval) → Production.
const ADDON_ORDER = [2, 3, 4, 7, 13, 14];
let ACTIVE_ORDER = STEP_ORDER; // set each render from the open quote
const nextStep = (n) => ACTIVE_ORDER[ACTIVE_ORDER.indexOf(n) + 1];
const prevStep = (n) => ACTIVE_ORDER[ACTIVE_ORDER.indexOf(n) - 1];
// Back / Next at the bottom of each wizard step.
function StepNav({ step, onGo, ok, changed, onConfirm, onUndo }) {
  const next = WIZARD[nextStep(step)];
  return (
    <div className="flex items-center gap-3 pt-2">
      {prevStep(step) && (
        <button onClick={() => onGo(prevStep(step))} className="rounded-xl border border-border-strong px-5 py-3 text-sm font-semibold text-secondary hover:text-primary cursor-pointer">← {WIZARD[prevStep(step)]}</button>
      )}
      {ok ? (
        <>
          <span className="ml-auto inline-flex items-center gap-1.5 text-sm font-bold text-brand-text">✓ Confirmed</span>
          <button onClick={onUndo} className="text-xs text-muted hover:text-primary cursor-pointer">Undo</button>
          {next && <button onClick={() => onGo(nextStep(step))} className="rounded-xl border border-border-brand px-5 py-3 text-base font-bold text-brand-text hover:bg-brand-light cursor-pointer">Next: {next} →</button>}
        </>
      ) : (
        <button onClick={onConfirm} className="ml-auto rounded-xl bg-brand px-6 py-3 text-base font-bold text-on-brand hover:bg-brand-hover cursor-pointer">
          ✓ {changed ? 'Changed — confirm again' : 'Confirm'}{next ? ` · next: ${next}` : ''}
        </button>
      )}
    </div>
  );
}
function PartHead({ title, sub }) {
  return (
    <div className="pt-4 border-t-2 border-border-strong">
      <p className="text-xl font-bold text-primary">{title}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

function Field({ label, value, onChange, prefix, placeholder }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-secondary mb-1">{label}</span>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">{prefix}</span>}
        <input
          type="text"
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full rounded-lg border border-border-strong bg-card px-4 py-2.5 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand placeholder:text-placeholder-muted ${prefix ? 'pl-7' : ''}`}
        />
      </div>
    </label>
  );
}

// Strand counter rules of thumb (1 strand = 100 mini lights, about 25 ft).
const STRAND_FT = 25;          // railings, fences, porch, walkways: feet ÷ 25
const TRUNK_FT_PER_STRAND = 4; // tree trunk wrap, ~4 in spacing: 1 strand per 4 ft of trunk
const BUSH_STRANDS = { small: 1, medium: 2, large: 4 }; // under 3 ft / 3–5 ft / over 5 ft
const TREE_STRANDS = { small: 4, medium: 8, large: 15 }; // full wrap incl. branches: under 6 ft / 6–10 ft / over 10 ft

// Strand counter — hidden for now, kept for when strands come back.
// eslint-disable-next-line no-unused-vars
function countStrands(c) {
  const linear = Math.ceil(num(c.linearFt) / STRAND_FT);
  const trunks = Math.ceil(num(c.trunkFt) / TRUNK_FT_PER_STRAND);
  const bushes = Object.keys(BUSH_STRANDS).reduce((t, k) => t + num(c[`bush_${k}`]) * BUSH_STRANDS[k], 0);
  const trees = Object.keys(TREE_STRANDS).reduce((t, k) => t + num(c[`tree_${k}`]) * TREE_STRANDS[k], 0);
  return { linear, trunks, bushes, trees, total: linear + trunks + bushes + trees };
}

const EMPTY_COUNT = { linearFt: '', trunkFt: '', bush_small: '', bush_medium: '', bush_large: '', tree_small: '', tree_medium: '', tree_large: '' };

const EMPTY_FEET = { easy: '', medium: '', hard: '' };
const EMPTY_SIDE = { plain: '', marked: '', lines: [], w: 0, h: 0 };

function calcLightsQuote({ feet, strands, perStrand, minimum, ...prices }) {
  const roofParts = Object.fromEntries(LEVELS.map((l) => [l.key, num(feet[l.key]) * num(prices[l.key])]));
  const roof = Object.values(roofParts).reduce((a, b) => a + b, 0);
  const roofFt = LEVELS.reduce((t, l) => t + num(feet[l.key]), 0);
  const strand = num(strands) * num(perStrand);
  const base = roof + strand;
  const topUp = base > 0 ? Math.max(0, num(minimum) - base) : 0;
  return { roof, roofParts, roofFt, strand, base, topUp, total: base + topUp };
}

// Multi-year plan discount, % off each season (must match LQ_OFF in api/jobber-data.js)
const PLAN_OFF = { 1: 0, 2: 5, 3: 10 };

// Link a saved quote to a Jobber client: their lights requests up top, or search all of Jobber.
function LinkPicker({ initial, requests, onPick }) {
  const [q, setQ] = useState(initial || '');
  const [picked, setPicked] = useState(null);
  const seen = new Set();
  const sugg = (requests || []).filter((r) => r.clientId && r.status !== 'archived')
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .filter((r) => (seen.has(r.clientId) ? false : seen.add(r.clientId)))
    .map((r) => ({ key: r.id, id: r.clientId, name: r.clientName, address: r.street, city: r.city, phone: r.phone, email: r.email, sub: `${new Date(r.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${r.title}` }));
  return <JobberClientPicker value={q} picked={picked} onType={setQ} onPick={(c) => { setPicked(c); if (c) onPick(c); }}
    suggestions={sugg} suggestionsTitle="Christmas lights requests in Jobber" />;
}

// When a quote was made: its id is lq-<ms timestamp>; older ones fall back to last saved.
const createdOf = (sq) => { if (sq?.createdAt) return new Date(sq.createdAt).getTime(); const m = /^lq-(\d{12,})/.exec(sq?.id || ''); return m ? Number(m[1]) : new Date(sq?.savedAt || 0).getTime(); }; // createdAt: set for quotes added after the fact (e.g. from an old Jobber quote)

export default function LightsQuoter() {
  const navigate = useNavigate();
  const { orgId } = useAuth();
  setLightsOrg(orgId);
  // Quotes saved on this computer before quotes synced to the account.
  const [qView, setQView] = useState(() => localStorage.getItem('lights-quotes-view') || 'list');
  useEffect(() => { localStorage.setItem('lights-quotes-view', qView); }, [qView]);
  const [opening, setOpening] = useState(''); // quote being loaded from the account
  const jobberQuotes = useJobberList('lights-quotes', 'quotes', true).quotes;
  const jobberRequests = useJobberList('lights-requests', 'requests', true).requests;
  const stageOf = (sq) => {
    if (sq.gift) return { key: 'gift' }; // our house, giveaways: no price, never counts toward $/ft or sales
    const st = quoteStage(sq, jobberQuotes, jobberRequests);
    // Accepted only when YOU mark it (they tap Accept → text you → you mark it). Page taps alone don't count.
    if (st.key !== 'sold' && sq.qStage === 'accepted') return { key: 'accepted', jq: { years: Number(sq.planYears) || 1 } };
    if (st.key === 'sold') {
      // Everything they bought (main quote + add-on quotes): pay = sum of the won quotes, plan = the longest term.
      const cid = sq.clientInfo?.id; const nk = nameKey(sq.clientInfo?.name || sq.client);
      const won = (jobberQuotes || []).filter((q) => (q.status === 'approved' || q.status === 'converted') && ((cid && q.clientId === cid) || nameKey(q.clientName) === nk));
      // Roofline = the first quote's roofline lines; everything else (wreaths, bushes, add-on quotes) = add-ons.
      const first = won.slice().sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))[0];
      const total = won.reduce((t, q) => t + (Number(q.total) || 0), 0);
      const roof = Number(first?.roof ?? first?.total) || 0;
      const firstAddons = Number(first?.addons) || 0; // wreath/bush lines on the main quote
      const extraQuotes = Math.max(0, total - (Number(first?.total) || 0)); // separate add-on quotes in Jobber
      return { ...st, jq: { ...st.jq, total, roof, addons: Math.max(0, total - roof), firstAddons, extraQuotes, years: Math.max(1, ...won.map((q) => q.years || 1)), clientKey: cid || nk } };
    }
    return st;
  };
  // Rescue: any full quote still held in this page's memory (photos included) gets
  // saved to the account. Upload only — never deletes or replaces anything.
  const [prices, setPrices] = useState(() => {
    try {
      return { ...DEFAULT_PRICES, ...JSON.parse(localStorage.getItem(PRICES_KEY) || '{}') };
    } catch {
      return DEFAULT_PRICES;
    }
  });
  const [client, setClient] = useState('');
  const [feet, setFeet] = useState(EMPTY_FEET);
  const [strands, setStrands] = useState('');
  const [count, setCount] = useState(EMPTY_COUNT);
  const [params, setParams] = useSearchParams();
  // Main views: all quotes (default), one quote, supplies
  const [view, setView] = useState(() => params.get('view') || (params.get('q') ? 'quote' : 'jobs'));
  const [editing, setEditing] = useState(() => !!params.get('q')); // Quotes tab: gallery vs one open quote
  const [wstep, setWstep] = useState(() => { const st = (params.get('q') && Math.min(14, Math.max(1, Number(params.get('step')) || 1))) || 1; return st === 8 ? 9 : st; }); // quote wizard step; a reload stays on it (?step=)
  const goStep = (n) => { setWstep(n);
    window.scrollTo({ top: 0, behavior: 'smooth' }); document.querySelector('main')?.scrollTo?.({ top: 0, behavior: 'smooth' }); };
  const [angles, setAngles] = useState([EMPTY_SIDE]);
  const [previews, setPreviews] = useState([]); // finished show photos for the client
  const [quoted, setQuoted] = useState(''); // what Jude actually quoted / sold it for
  const [qStage, setQStage] = useState(''); // only 'unqualified' — Sent / Sold come from Jobber
  const [style, setStyle] = useState(() => localStorage.getItem('lights-mockup-design') || 'warm'); // light color for this quote
  const [savedId, setSavedId] = useState(null); // which saved client quote this is
  const [materials, setMaterials] = useState({}); // what the job will take (itemId -> qty)
  // What the add-ons put into `materials` last time ({ itemId: qty }) — so a change swaps the old amount for the new one.
  const allSupplies = useAppStore((st) => st.lightsSupplies) || []; // for naming add-on materials
  // "Ready to present?" also shows the price bump + offers (they live in lq-ba, set in the Offers step).
  const [present, setPresent] = useState(null);
  useEffect(() => {
    if (wstep !== 13 || !savedId) return undefined;
    let off = false;
    getExtrasMeta(savedId).then((v) => { if (!off) setPresent({ id: savedId, v }); }).catch(() => {});
    return () => { off = true; };
  }, [wstep, savedId]);
  const [addonMats, setAddonMats] = useState({});
  const addonMatsRef = useRef({});
  const applyAddonMats = (next) => {
    const prev = addonMatsRef.current || {};
    if (JSON.stringify(prev) === JSON.stringify(next)) return;
    addonMatsRef.current = next; setAddonMats(next);
    setMaterials((m) => {
      const out = { ...m };
      new Set([...Object.keys(prev), ...Object.keys(next)]).forEach((id) => {
        const v = (Number(out[id]) || 0) - (Number(prev[id]) || 0) + (Number(next[id]) || 0);
        if (v > 0) out[id] = v; else delete out[id];
      });
      return out;
    });
  };
  const [matNotes, setMatNotes] = useState({}); // notes per material (carry to the job)
  const [wire, setWire] = useState('white'); // socket wire / zip / shingle tab color
  const [power, setPower] = useState(''); // where the outlet is — ask at the meeting
  const [powerPhoto, setPowerPhoto] = useState(''); // photo of the outlet
  const [nightPhoto, setNightPhoto] = useState(''); // house at night, no lights (before/after slider)
  const [disc, setDisc] = useState({}); // discovery answers: { decorate, pro, proNote, notes }
  const [installDate, setInstallDate] = useState(''); // install date offered to them (YYYY-MM-DD)
  const [takedownDate, setTakedownDate] = useState(''); // takedown date (YYYY-MM-DD)
  const [matOk, setMatOk] = useState('');
  const [linesOk, setLinesOk] = useState(''); // plan as it was when you confirmed where the lights go
  const [stepsOk, setStepsOk] = useState({});
  const [customColor, setCustomColor] = useState(''); // what 'Custom' means, typed in Discovery
  const [planLocked, setPlanLocked] = useState(false); // Plan step locked: lines can't be drawn, moved or deleted
  const [crewToken, setCrewToken] = useState(''); // secret for the no-login Crew view link
  const [presentToken, setPresentToken] = useState(''); // secret for the client's exact-price page (/estimate/<token>)
  const [pageCopied, setPageCopied] = useState('');
  // Opens of their exact-price page (lq-views:<id>), shown in the Present step.
  const [pageViews, setPageViews] = useState(null);
  useEffect(() => {
    if (wstep !== 13 || !savedId) return undefined;
    let off = false;
    const load = () => supabase.from('app_state').select('value').eq('key', `lq-views:${savedId}`).maybeSingle().then(({ data }) => { if (!off) setPageViews(data?.value || null); });
    load();
    const t = setInterval(load, 30000);
    return () => { off = true; clearInterval(t); };
  }, [wstep, savedId]);
  const [crewCopied, setCrewCopied] = useState(false);
  const [extras, setExtras] = useState([]); // columns, railings, trees, bushes… [{ id, side, x, y, type, run, around, wraps, width, strands, label }] // { stepNumber: true } — confirmed steps (6 + 7 use matOk / linesOk so changes un-confirm)
  const [clientInfo, setClientInfo] = useState(null); // Jobber client picked from search
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState([]);
  const [listOpen, setListOpen] = useState(false);
  const [flash, setFlash] = useState('');
  const [linking, setLinking] = useState(null);
  const [qFilter, setQFilter] = useState('all');
  const [openDeal, setOpenDeal] = useState(''); // list row expanded to show its options + add-ons
  const [attaching, setAttaching] = useState(null); // quote being moved into another deal // list filter: all | sold | out | declined // saved quote being linked to a Jobber client from the list
  const [confirmNew, setConfirmNew] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const autosaveTimer = useRef(null);
  const [lastSaved, setLastSaved] = useState(null);

  // A locked plan locks its materials too: no quantity or wire-color changes until it's unlocked.
  const matSet = planLocked ? () => {} : setMaterials;
  const wireSet = planLocked ? () => {} : setWire;
  // Deal info (options / add-ons): kept as-is through every save so the editor never wipes it.
  const [dealMeta, setDealMeta] = useState({});
  // Add-ons start on Photos (they skip Discovery and the sales steps)
  useEffect(() => { if (dealMeta.kind === 'addon' && !ADDON_ORDER.includes(wstep)) setWstep(2); }, [dealMeta.kind, wstep]);
  const snapshot = () => ({ ...dealMeta, client, clientInfo, feet, strands, count, angles, previews, quoted, qStage, style, materials, matNotes, wire, power, powerPhoto, nightPhoto, disc, installDate, takedownDate, matOk, linesOk, stepsOk, stepsV: 2, extras, crewToken, presentToken, customColor, planLocked, savedId, addonMats });
  // The cloud version this device is working from — if another device saves after it,
  // this device's copy is stale and must not overwrite (that's how removed photos came back).
  const baseSaved = useRef('');
  const apply = (d) => {
    baseSaved.current = d.savedAt || '';
    setDealMeta({ group: d.group || null, kind: d.kind || null, chosenId: d.chosenId || null, scopeName: d.scopeName || '', gift: !!d.gift, planYears: d.planYears || null, feetOverride: d.feetOverride || null, ...(d.createdAt ? { createdAt: d.createdAt } : {}) });
    setClient(d.client || '');
    setClientInfo(d.clientInfo || null);
    setFeet({ ...EMPTY_FEET, ...(d.feet || {}) });
    setStrands(d.strands || '');
    setCount({ ...EMPTY_COUNT, ...(d.count || {}) });
    setAngles(d.angles?.length ? d.angles.map((a) => ({ ...EMPTY_SIDE, ...a })) : [EMPTY_SIDE]);
    setPreviews(d.previews || []);
    setQuoted(d.quoted || '');
    setQStage(d.qStage || '');
    setMaterials(d.materials || {});
    setAddonMats(d.addonMats || {}); addonMatsRef.current = d.addonMats || {};
    setMatNotes(d.matNotes || {});
    setWire(d.wire || 'white');
    setPower(d.power || '');
    setPowerPhoto(d.powerPhoto || '');
    setNightPhoto(d.nightPhoto || '');
    setDisc(d.disc || {});
    setInstallDate(d.installDate || '');
    setTakedownDate(d.takedownDate || '');
    setMatOk(d.matOk || '');
    setLinesOk(d.linesOk || '');
    // Quotes confirmed before Extras (step 6) was added: their steps 6+ move up one.
    setStepsOk(d.stepsV === 2 ? d.stepsOk || {} : Object.fromEntries(Object.entries(d.stepsOk || {}).map(([k, v]) => [Number(k) >= 6 ? Number(k) + 1 : Number(k), v])));
    setExtras(d.extras || []);
    setCrewToken(d.crewToken || '');
    setPresentToken(d.presentToken || '');
    setCustomColor(d.customColor || '');
    setPlanLocked(!!d.planLocked);
    if (d.style) setStyle(d.style);
    setSavedId(d.savedId ?? (d.id && d.id !== DRAFT_ID ? d.id : null));
  };
  const [covers, setCovers] = useState({}); // gallery cover photos, loaded after the list
  const refreshList = () => listQuotes().then((list) => { setSaved(list); warmQuotes(list); listCovers().then(setCovers).catch(() => {}); }).catch(() => {});
  // (Removed: an automatic "rescue" that re-uploaded this device's copies. When the
  // device copy was old it overwrote newer work in the cloud — that's how Pam's lines
  // got wiped twice. Device-only quotes go up through the "Sync" button instead.)

  // Restore the quote in progress, so a refresh never loses work.
  useEffect(() => {
    // A client quote in the URL (?q=...) wins; otherwise pick up the draft.
    const fromUrl = params.get('q');
    const fromDraft = () => getQuote(DRAFT_ID).then(async (d) => {
      // The draft is only this device's copy. If it belongs to a saved quote, take the
      // cloud version whenever it's newer, so an old device never brings back old work.
      if (!d?.savedId) return d;
      // Deleted (gone from the cloud)? Start blank instead of re-creating it.
      if ((await cloudHas(d.savedId)) === false) return null;
      const cloud = await getQuote(d.savedId).catch(() => null);
      return cloud && String(cloud.savedAt || '') >= String(d.savedAt || '') ? { ...cloud, savedId: cloud.id } : d;
    });
    (fromUrl ? getQuote(fromUrl).then((d) => d || fromDraft()) : fromDraft())
      .then((d) => { if (d) apply(d.id && d.id !== DRAFT_ID ? { ...d, savedId: d.id } : d); })
      .catch(() => {})
      .finally(() => setLoaded(true));
    refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on open
  }, []);

  // Keep the URL on the open client + tab, so a reload lands on the same screen.
  useEffect(() => {
    if (!loaded) return;
    const next = {};
    if (view !== 'quotes') next.view = view;
    if (view === 'quote' && editing && savedId) { next.q = savedId; if (wstep > 1) next.step = String(wstep); }
    setParams(next, { replace: true });
  }, [loaded, savedId, view, editing, wstep, setParams]);

  // Fresh list whenever the gallery shows.
  useEffect(() => { if (view === 'quote' && !editing) refreshList(); }, [view, editing]);

  // Autosave the quote in progress — but not the first run after opening (that's just
  // what was loaded; saving it back could overwrite newer work from another device).
  const skipFirstSave = useRef(true);
  // Only save when something actually changed. The fingerprint skips the big photo
  // data (length only), so it's cheap; opening a quote just records its fingerprint.
  const lastSig = useRef('');
  const sigNow = () => JSON.stringify([dealMeta, client, clientInfo?.id, feet, prices, // prices: a $/ft change re-saves the price Present shows
    strands, count, quoted, qStage, style, materials, matNotes, wire, power, powerPhoto?.length || 0, nightPhoto?.length || 0, disc, installDate, takedownDate, matOk, linesOk.length, stepsOk, extras, crewToken, presentToken, customColor, planLocked, savedId,
    angles.map(({ plain, marked, ai, ...rest }) => [plain?.length || 0, marked?.length || 0, ai?.image?.length || 0, rest]),
    previews.map((x) => [x.id, x.image?.length || 0])]);
  useEffect(() => {
    if (!loaded) return;
    if (skipFirstSave.current) { skipFirstSave.current = false; lastSig.current = sigNow(); return; }
    const sig = sigNow();
    if (sig === lastSig.current) return; // nothing really changed (e.g. a re-render after opening)
    lastSig.current = sig;
    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      const now = new Date().toISOString();
      const id = client.trim() ? (savedId || (clientInfo ? `jobber-${clientInfo.id}` : `lq-${Date.now()}`)) : null;
      try {
        // Another device saved this quote since we loaded it? Don't overwrite it with our old copy —
        // load theirs instead.
        if (id && savedId === id) {
          const cloudAt = await cloudSavedAt(id);
          if (cloudAt && baseSaved.current && cloudAt > baseSaved.current) {
            const fresh = await getQuote(id).catch(() => null);
            if (fresh) { skipFirstSave.current = true; apply({ ...fresh, savedId: id }); say('Updated from your other device'); return; }
          }
        }
        await putQuote({ id: DRAFT_ID, ...snapshot(), savedId: id, savedAt: now });
        if (id) {
          baseSaved.current = now;
          // keep tracker fields (status, sent date, light style) set on the Supplies page
          const prev = await getLocalQuote(id).catch(() => null);
          await putQuote({ ...(prev || {}), id, ...snapshot(), savedId: id, total: num(quoted) || q.total, calcTotal: q.total, savedAt: now });
          if (id !== savedId) setSavedId(id);
          setLastSaved(now);
          refreshList();
        }
      } catch (e) {
        console.error('[lights] save failed', e);
        say(`Could not save to the cloud — ${e?.message || 'check your connection'}. Your work is kept on this device.`);
      }
    }, 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, dealMeta, client, clientInfo, feet, strands, count, angles, previews, quoted, qStage, style, materials, matNotes, wire, power, powerPhoto, nightPhoto, disc, installDate, takedownDate, matOk, linesOk, stepsOk, extras, crewToken, presentToken, customColor, planLocked, savedId, addonMats, prices]);

  useEffect(() => {
    localStorage.setItem(PRICES_KEY, JSON.stringify(prices));
  }, [prices]);

  // Coming back to Hub (app reopened / tab clicked): pick up a newer version saved on another device.
  useEffect(() => {
    const check = async () => {
      if (document.visibilityState !== 'visible' || !savedId) return;
      const cloudAt = await cloudSavedAt(savedId);
      if (!cloudAt || !baseSaved.current || cloudAt <= baseSaved.current) return;
      const fresh = await getQuote(savedId).catch(() => null);
      if (fresh) { clearTimeout(autosaveTimer.current); skipFirstSave.current = true; apply({ ...fresh, savedId }); say('Updated from your other device'); }
    };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => { document.removeEventListener('visibilitychange', check); window.removeEventListener('focus', check); };
  }, [savedId]);

  const setPrice = (k) => (v) => setPrices((p) => ({ ...p, [k]: v }));
  // Strands come from the Extras step (old quotes: the typed strand count).
  const strandCount = extras.length ? extrasStrands(extras) : num(strands);
  const q = calcLightsQuote({ feet, strands: strandCount, ...prices });

  // Step confirms. Materials (6) and Lights (7) remember what they looked like, so a change un-confirms them.
  const matSig = JSON.stringify(Object.entries(materials || {}).filter(([, v]) => Number(v) > 0).sort());
  const linesSig = JSON.stringify(angles.map((a) => [a.lines || [], a.jumps || [], a.outlets || []]));
  const isOk = (n) => (n === 7 ? !!matOk && matOk === matSig : n === 3 ? !!stepsOk[3] : n === 8 ? !!linesOk && linesOk === linesSig : !!stepsOk[n]);
  const confirmStep = (n) => {
    if (n === 7) setMatOk(matSig); else if (n === 8) setLinesOk(linesSig); else setStepsOk((o) => ({ ...o, [n]: true }));
    if (nextStep(n)) goStep(nextStep(n));
  };
  const unconfirm = (n) => { if (n === 7) setMatOk(''); else if (n === 8) setLinesOk(''); else setStepsOk((o) => { const c = { ...o }; delete c[n]; return c; }); };
  const nav = (n) => <StepNav step={n} onGo={goStep} ok={isOk(n)} changed={(n === 7 && !!matOk) || (n === 8 && !!linesOk)} onConfirm={() => confirmStep(n)} onUndo={() => unconfirm(n)} />;
  // Reorder photos; Extras markers follow their photo.
  const moveSide = (from, to) => {
    const order = angles.map((_, i) => i);
    const [x] = order.splice(from, 1);
    order.splice(to, 0, x);
    setAngles(order.map((i) => angles[i]));
    setExtras((xs) => xs.map((e) => ({ ...e, side: order.indexOf(e.side) })));
  };
  // Crew view link: plan + materials, no login, no prices. Made once per quote.
  const crewLink = async () => {
    let t = crewToken;
    if (!t) {
      const b = new Uint8Array(18);
      crypto.getRandomValues(b);
      t = btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      setCrewToken(t);
    }
    const origin = 'https://hub.heyjudeslawncare.com'; // team links always use the Hey Jude's address
    const url = `${origin}/crew/${t}`;
    try { await navigator.clipboard.writeText(url); } catch { /* shown below */ }
    setCrewCopied(url);
    setTimeout(() => setCrewCopied(false), 6000);
  };
  const reset = () => { setDealMeta({}); setWstep(1); setClient(''); setFeet(EMPTY_FEET); setStrands(''); setCount(EMPTY_COUNT); setAngles([EMPTY_SIDE]); setSavedId(null); setClientInfo(null); setPreviews([]); setQuoted(''); setQStage(''); setMaterials({}); setMatNotes({}); setWire('white'); setPower(''); setPowerPhoto(''); setNightPhoto(''); setDisc({}); setInstallDate(''); setTakedownDate(''); setMatOk(''); setLinesOk(''); setStepsOk({}); setExtras([]); setCrewToken(''); setPresentToken(''); setCustomColor(''); setAddonMats({}); addonMatsRef.current = {}; };
  const say = (msg) => { setFlash(msg); setTimeout(() => setFlash(''), 2500); };

  const openQuote = async (id) => {
    setWstep(1);
    const d = await getQuote(id);
    // Opening isn't an edit: skip the autosave that loading would trigger (it re-saved
    // quotes with recalculated totals just from being looked at).
    if (d) { clearTimeout(autosaveTimer.current); skipFirstSave.current = true; apply({ ...d, savedId: id }); setListOpen(false); say(`Opened ${d.client}`); }
  };
  const removeQuote = async (id) => {
    // Deleting the quote that's open: clear the builder too, or autosave would
    // immediately save it again as a brand-new (empty) quote for the same client.
    const wasOpen = savedId === id;
    if (wasOpen) { clearTimeout(autosaveTimer.current); skipFirstSave.current = true; reset(); }
    await deleteQuote(id);
    // The draft on this device pointed at it — drop that too.
    if (wasOpen) putQuote({ id: DRAFT_ID, savedId: null, client: '', savedAt: new Date().toISOString() }).catch(() => {});
    setConfirmDel(null);
    refreshList();
  };
  const pickClient = async (c) => {
    if (!c) { setClientInfo(null); setClient(''); return; }
    setClientInfo(c);
    setClient(c.name);
    const existing = saved.find((sq) => sq.id === `jobber-${c.id}`);
    if (existing && existing.id !== savedId) say(`${c.name} already has a saved lights quote — open it from Saved quotes`);
  };

  const newQuote = () => {
    if (!confirmNew) { setConfirmNew(true); setTimeout(() => setConfirmNew(false), 3000); return; }
    setConfirmNew(false);
    reset();
  };

  return (
    <div className={`${view === 'quotes' ? 'max-w-none' : view === 'quote' && editing ? 'max-w-2xl' : 'max-w-4xl'} mx-auto space-y-5`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
          <Lightbulb size={24} className="text-brand" /> Lights
        </h1>
        <div className="flex gap-1 bg-surface-alt rounded-lg p-1 max-w-full overflow-x-auto">
          {[['estimate', 'Rough Estimate'], ['quotes', 'Pipeline'], ['quote', 'Quotes'], ['jobs', 'Jobs'], ['supplies', 'Material'], ['sales', 'Sales']].map(([id, label]) => (
            <button
              key={id}
              onClick={() => { setView(id); if (id === 'quote') setEditing(false); }}
              className={`shrink-0 px-3 py-1.5 rounded-md text-sm font-semibold max-w-[180px] truncate cursor-pointer ${view === id ? 'bg-card text-primary shadow-sm' : 'text-secondary hover:text-primary'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={`flex items-center gap-1 ${view === 'quote' && editing ? '' : 'invisible'}`}>
          <button onClick={() => setEditing(false)} className="px-2 py-1.5 rounded-lg text-sm text-muted hover:text-primary hover:bg-surface-alt cursor-pointer">← All quotes</button>
          <button
            onClick={() => { setListOpen((o) => !o); refreshList(); }}
            hidden
            title="Saved quotes"
            className={`relative p-2 rounded-lg cursor-pointer transition-colors ${listOpen ? 'bg-surface-alt text-primary' : 'text-muted hover:text-primary hover:bg-surface-alt'}`}
          >
            <FolderOpen size={18} />
          </button>
          <button
            onClick={newQuote}
            title={confirmNew ? 'Click again to clear' : 'New quote'}
            className={`inline-flex items-center gap-1 p-2 rounded-lg cursor-pointer transition-colors ${confirmNew ? 'bg-red-500/15 text-red-500' : 'text-muted hover:text-primary hover:bg-surface-alt'}`}
          >
            <Plus size={18} />
            {confirmNew && <span className="text-xs font-semibold pr-1">Clear?</span>}
          </button>
        </div>
      </div>

      {view === 'estimate' && <LightsEstimate />}
      {view !== 'quote' && view !== 'estimate' && (
        <>
          <LightsBusiness view={view} onNew={view === 'quotes' ? () => { reset(); setView('quote'); setEditing(true); } : null} onOpen={async (id, step) => { await openQuote(id); if (step) setWstep(step); setView('quote'); setEditing(true); }} />
        </>
      )}


      {/* Quotes tab: New quote, pending quotes, then sold ones (tagged). Unqualified are hidden. */}
      {view === 'quote' && !editing && (() => {
        // Average $/ft = SOLD deals only: what they pay per season (Jobber, plan discount included) ÷ feet
        // of the agreed scope + add-ons. Gifts, old scopes and quotes with no feet measured are left out.
        const byId = Object.fromEntries(saved.map((x) => [x.id, x]));
        const ftOf = (x) => num(x.feetOverride) || ['easy', 'medium', 'hard'].reduce((u, k) => u + num(x.feet?.[k]), 0);
        const soldDeals = saved.filter((sq) => !(sq.group && byId[sq.group])).map((sq) => ({ sq, st: stageOf(sq) }))
          .filter(({ st }) => st.key === 'sold' || st.key === 'accepted');
        const withFt = soldDeals.map(({ sq, st }) => {
          const agreed = byId[sq.chosenId] || sq;
          const yrs = Number(agreed.planYears) || st.jq?.years || 1; const off = 1 - (PLAN_OFF[yrs] || 0) / 100;
          const roofAdds = saved.filter((x) => x.group === sq.id && x.kind === 'addon' && ftOf(x) > 0); // add-ons with feet = more roofline
          const ft = [agreed, ...roofAdds].reduce((t, x) => t + ftOf(x), 0);
          const pay = (st.jq?.total ? num(st.jq.roof ?? st.jq.total) : num(agreed.total) * off) + roofAdds.reduce((t, x) => t + num(x.total) * off, 0); // roofline only
          return { ft, pay };
        }).filter((d) => d.ft > 0 && d.pay > 0);
        const sum = { ft: withFt.reduce((t, d) => t + d.ft, 0), $: withFt.reduce((t, d) => t + d.pay, 0), n: withFt.length, sold: soldDeals.length };
        return (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {sum.ft > 0 ? <p className="text-sm text-secondary">Average <b className="text-brand-text text-base">{money(sum.$ / sum.ft)}/ft</b> <span className="text-xs text-muted">across {sum.n} of {sum.sold} sold{sum.sold > sum.n ? ` (${sum.sold - sum.n} have no feet measured)` : ''} · {Math.round(sum.ft)} ft · {dollars(sum.$)} roofline/season</span></p> : <span />}
            <div className="flex rounded-lg bg-surface-alt p-0.5">
              {[['gallery', 'Gallery'], ['list', 'List']].map(([k, label]) => (
                <button key={k} onClick={() => setQView(k)} className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer ${qView === k ? 'bg-card text-primary shadow-sm' : 'text-muted hover:text-primary'}`}>{label}</button>
              ))}
            </div>
          </div>
        );
      })()}
      {view === 'quote' && !editing && qView === 'list' && (() => {
        // Filter: Sold (sold or accepted) · Out (sent, follow up, not in Jobber yet) · Declined (archived / unqualified)
        const bucket = (k) => (k === 'gift' ? 'gift' : k === 'sold' || k === 'accepted' ? 'sold' : k === 'unqualified' ? 'declined' : 'out');
        const counts = saved.filter((sq) => !sq.group || !saved.some((x) => x.id === sq.group)).reduce((c, sq) => { const b = bucket(stageOf(sq).key); c[b] = (c[b] || 0) + 1; return c; }, {});
        // Deals: a main quote + its options (other scopes; one is ✓ agreed) + add-ons. Only the agreed option + add-ons count.
        const ids = new Set(saved.map((x) => x.id));
        const membersOf = (id) => saved.filter((x) => x.group === id);
        const dealOf = (sq) => {
          const mem = membersOf(sq.id);
          const opts = [sq, ...mem.filter((x) => x.kind !== 'addon')];
          const agreed = opts.find((x) => x.id === sq.chosenId) || sq;
          const addons = mem.filter((x) => x.kind === 'addon');
          const ftOf = (x) => num(x.feetOverride) || ['easy', 'medium', 'hard'].reduce((t, k) => t + num(x.feet?.[k]), 0); // typed-in feet (old jobs) win
          return { opts, agreed, addons, mem, ft: [agreed, ...addons].reduce((t, x) => t + ftOf(x), 0), total: [agreed, ...addons].reduce((t, x) => t + num(x.total), 0), ftOf };
        };
        const mains = saved.filter((sq) => !sq.group || !ids.has(sq.group));
        const rows = mains.filter((sq) => { const b = bucket(stageOf(sq).key); return qFilter === 'all' ? b !== 'declined' && b !== 'gift' : b === qFilter; })
          .sort((a, b) => createdOf(b) - createdOf(a)); // newest first
        const open = async (id) => { setOpening(id); try { await openQuote(id); setEditing(true); } finally { setOpening(''); } };
        // Numbers for one deal row (shared by the rows and the totals line)
        const rowNums = (sq0) => {
          const deal = dealOf(sq0);
          const sq = { ...sq0, total: deal.total }; // deal total (agreed option + add-ons)
          const st0 = stageOf(sq0);
          const sold = st0.key === 'sold';
          const ft = deal.ft;
          // Plan comes from their Jobber quote (the "N Season term" line); plan price = what they actually pay per season.
          const yrs = Number(deal.agreed.planYears) || st0.jq?.years || 1; // your pick in Present wins, else Jobber's term line
          // Roofline price (what $/ft uses); add-ons shown on their own line
          const off = 1 - (PLAN_OFF[yrs] || 0) / 100;
          // Hub add-ons follow the deal's plan. With feet = more roofline; without = wreath/bushes → Add-ons.
          const hubAdd = deal.addons.map((x) => ({ ft: deal.ftOf(x), pay: num(x.total) * off }));
          const hubRoofAdd = hubAdd.filter((a) => a.ft > 0).reduce((t, a) => t + a.pay, 0);
          const hubOtherAdd = hubAdd.filter((a) => !(a.ft > 0)).reduce((t, a) => t + a.pay, 0);
          const baseRoof = st0.jq?.total ? num(st0.jq.roof ?? st0.jq.total) : num(deal.agreed.total) * off;
          // Jobber's separate add-on quotes count only when there's no Hub add-on for them (no double counting)
          const jobberAdd = st0.jq?.total ? num(st0.jq.firstAddons ?? st0.jq.addons) + (deal.addons.length ? 0 : num(st0.jq.extraQuotes)) : 0;
          const planPrice = baseRoof + hubRoofAdd;
          const addonsPrice = jobberAdd + hubOtherAdd;
          return { deal, sq, st0, sold, ft, yrs, planPrice, addonsPrice };
        };

        // Multi-year plans (sold): yearly recurring + what's locked in over the remaining seasons.
        // Multi-year plans straight from Jobber (every sold lights quote with an N-season term), one per client.
        const byClient = {};
        (jobberQuotes || []).filter((q) => q.status === 'approved' || q.status === 'converted').forEach((q) => {
          const k = q.clientId || nameKey(q.clientName);
          const c = byClient[k] || (byClient[k] = { name: q.clientName, years: 1, total: 0 });
          c.years = Math.max(c.years, q.years || 1); c.total += Number(q.total) || 0;
        });
        const plans = Object.values(byClient).filter((c) => c.years > 1);
        const perSeason = plans.reduce((t, c) => t + c.total, 0);
        const locked = plans.reduce((t, c) => t + c.total * c.years, 0);
        return (
          <>
          {plans.length > 0 && (
            <div className="mb-3 rounded-xl border border-sky-500/30 bg-sky-500/5 px-4 py-2.5 text-sm text-secondary">
              🔁 <b className="text-primary">{plans.length} on multi-year plans</b> · <b className="text-primary">{dollars(perSeason)}</b>/season recurring · {dollars(locked)} locked in <span className="text-muted">(names on Sales)</span>
            </div>
          )}
          {linking && (
            <div className="fixed inset-0 z-[80] bg-black/50 flex items-start justify-center pt-24 px-4" onClick={() => setLinking(null)}>
              <div className="w-full max-w-lg rounded-2xl bg-card border border-border-subtle p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-primary">Link “{linking.client}” to Jobber</h3>
                <p className="text-xs text-secondary">Pick their client in Jobber. After this, Sold / Sent comes straight from their Jobber quote.</p>
                <LinkPicker initial={linking.client} requests={jobberRequests} onPick={async (c) => {
                  try { await patchQuoteMeta(linking.id, { clientInfo: c }); say(`Linked ${c.name} ✓`); refreshList(); }
                  catch (e) { say(`Couldn't link: ${e.message}`); }
                  setLinking(null);
                }} />
              </div>
            </div>
          )}
          {attaching && (() => {
            const others = mains.filter((m) => m.id !== attaching.id && m.group !== attaching.id);
            const same = (m) => nameKey(m.clientInfo?.name || m.client).slice(0, 5) === nameKey(attaching.clientInfo?.name || attaching.client).slice(0, 5);
            const put = async (m, kind) => {
              // Anything already inside this quote's deal moves along with it
              for (const x of saved.filter((y) => y.group === attaching.id)) await patchQuoteMeta(x.id, { group: m.id });
              await patchQuoteMeta(attaching.id, { group: m.id, kind });
              if (kind === 'option' && !m.chosenId) await patchQuoteMeta(m.id, { chosenId: m.id });
              setAttaching(null); setOpenDeal(m.id); refreshList();
            };
            return (
              <div className="fixed inset-0 z-[80] bg-black/50 flex items-start justify-center pt-20 px-4" onClick={() => setAttaching(null)}>
                <div className="w-full max-w-lg rounded-2xl bg-card border border-border-subtle p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
                  <h3 className="text-lg font-bold text-primary">Put “{attaching.client}” inside another deal</h3>
                  <p className="text-xs text-secondary"><b>Other scope</b> = a different version of the same job (only the ✓ agreed one counts). <b>Add-on</b> = extra work on top (always counts).</p>
                  <div className="max-h-80 overflow-y-auto divide-y divide-border-subtle">
                    {[...others.filter(same), ...others.filter((m) => !same(m))].map((m) => (
                      <div key={m.id} className="flex items-center gap-2 py-2">
                        <span className="flex-1 min-w-0 text-sm text-primary truncate">{m.client} <span className="text-muted">· {dollars(num(m.total))}</span></span>
                        <button onClick={() => put(m, 'option')} className="px-2 py-1 rounded-md border border-border-default text-[11px] font-semibold text-primary hover:bg-surface-alt cursor-pointer">Other scope</button>
                        <button onClick={() => put(m, 'addon')} className="px-2 py-1 rounded-md bg-sky-500/15 text-[11px] font-semibold text-sky-400 hover:bg-sky-500/25 cursor-pointer">Add-on</button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
          <div className="mb-2">
            <select value={qFilter} onChange={(e) => setQFilter(e.target.value)}
              className="rounded-lg border border-border-default bg-card px-3 py-1.5 text-sm font-semibold text-primary cursor-pointer">
              {[['all', 'All', (counts.sold || 0) + (counts.out || 0)], ['sold', 'Sold', counts.sold || 0], ['out', 'Pending', counts.out || 0], ['declined', 'Declined', counts.declined || 0], ['gift', '🎁 Gifts', counts.gift || 0]].map(([k, l, c]) => (
                <option key={k} value={k}>{l} ({c})</option>
              ))}
            </select>
          </div>
          <div className="rounded-xl border border-border-default bg-card overflow-hidden">
            <div className="hidden sm:grid grid-cols-[minmax(0,2fr)_80px_110px_60px_60px_44px_70px_150px_36px] gap-3 px-4 py-2 border-b border-border-subtle text-[10px] font-bold uppercase tracking-wide text-muted">
              <span>Client</span><span className="text-right">Total</span><span className="text-right">Roofline</span><span className="text-right">Feet</span><span className="text-right">$/ft</span><span>Term</span><span className="text-right">Add-ons</span><span>Status</span><span />
            </div>
            <button onClick={() => { reset(); setEditing(true); }} className="w-full flex items-center gap-2 px-4 py-2.5 border-b border-border-subtle text-sm font-semibold text-brand-text hover:bg-surface-alt cursor-pointer"><Plus size={14} /> New quote</button>
            {rows.map((sq0) => {
              const { deal, sq, st0, sold, ft, yrs, planPrice, addonsPrice } = rowNums(sq0);
              return (
                <Fragment key={sq.id}>
                <div onClick={() => !opening && open(deal.agreed.id)}
                  className={`group grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,2fr)_80px_110px_60px_60px_44px_70px_150px_36px] gap-3 items-center px-4 py-2.5 border-b border-border-subtle last:border-b-0 hover:bg-surface-alt cursor-pointer ${sold ? 'opacity-75' : ''}`}>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="min-w-0">
                        {/* Their real name from Jobber; a business name sits under it, small and gray */}
                        <span className="block text-sm font-semibold text-primary truncate">{opening === deal.agreed.id ? 'Opening…' : (jobberQuotes || []).find((q) => sq0.clientInfo?.id && q.clientId === sq0.clientInfo.id)?.clientName || sq0.clientInfo?.name || sq.client || 'No name'}</span>
                        {(() => {
                          // Business name from Jobber; else the name you typed on the quote when it's not just their name (e.g. "State Farm")
                          const co = (jobberQuotes || []).find((q) => sq0.clientInfo?.id && q.clientId === sq0.clientInfo.id && q.companyName)?.companyName;
                          const typed = nameKey(sq.client); const real = nameKey(sq0.clientInfo?.name);
                          const sub = co || (sq0.clientInfo?.name && typed && !real.includes(typed) && !typed.includes(real) ? sq.client : '');
                          return sub ? <span className="block text-[11px] text-muted truncate">{sub}</span> : null;
                        })()}
                      </span>
                      {deal.mem.length > 0 && (
                        <button onClick={(e) => { e.stopPropagation(); setOpenDeal(openDeal === sq.id ? '' : sq.id); }}
                          className="shrink-0 px-1.5 py-0.5 rounded-md bg-surface-alt border border-border-subtle text-[10px] font-bold text-secondary hover:text-primary cursor-pointer">
                          {[deal.opts.length > 1 && `${deal.opts.length} options`, deal.addons.length && `+${deal.addons.length} add-on${deal.addons.length > 1 ? 's' : ''}`].filter(Boolean).join(' · ')} {openDeal === sq.id ? '▴' : '▾'}
                        </button>
                      )}
                    </span>
                    {/* Phone: the details under the name */}
                    <span className="sm:hidden block text-xs text-muted truncate">{ft ? `${ft} ft` : 'No feet yet'}{ft > 0 && num(sq.total) > 0 ? ` · ${money(num(sq.total) / ft)}/ft` : ''} · {(STAGE_LABEL[stageOf(sq).key] || ['Pending'])[0]}{!sq.clientInfo?.id ? ' · ⚠ Not linked' : ''}</span>
                  </span>
                  {/* Final price per season = roofline + add-ons */}
                  <span className="text-right tabular-nums text-sm font-bold text-brand-text">{st0.key === 'gift' ? <span className="text-pink-400">Gift</span> : planPrice + addonsPrice > 0 ? dollars(planPrice + addonsPrice) : '—'}</span>
                  {/* Price = what they pay per season; on a plan, the full price shows small underneath */}
                  {/* Full price on top; on a multi-season plan it's crossed out and the per-season price shows under it */}
                  <span className="hidden sm:block text-right tabular-nums leading-tight">{(() => {
                    const full = yrs > 1 && PLAN_OFF[yrs] ? planPrice / (1 - PLAN_OFF[yrs] / 100) : planPrice;
                    if (st0.key === 'gift') return <span className="block text-sm font-semibold text-pink-400">Gift</span>;
                    if (!(planPrice > 0)) return <span className="block text-sm text-muted">—</span>;
                    return yrs > 1 ? <>
                      <span className="block text-xs text-muted line-through">{dollars(full)}</span>
                      <span className="block text-sm font-semibold text-primary">{dollars(planPrice)}<span className="text-[10px] font-semibold text-secondary">/season</span></span>
                    </> : <span className="block text-sm font-semibold text-primary">{dollars(planPrice)}</span>;
                  })()}</span>
                  {/* Feet: tap to type what you measured (old jobs measured before this tool) */}
                  <span className="hidden sm:block text-right" onClick={(e) => e.stopPropagation()}>
                    <input key={`${deal.agreed.id}-${deal.agreed.feetOverride || ''}`} defaultValue={ft || ''} placeholder="—" inputMode="decimal"
                      title={deal.agreed.feetOverride ? 'Typed in by you — clear it to use the measured feet' : 'Tap to type the feet you measured'}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                      onBlur={async (e) => {
                        const v = parseFloat(e.target.value); const measured = ['easy', 'medium', 'hard'].reduce((t, k) => t + num(deal.agreed.feet?.[k]), 0);
                        const next = Number.isFinite(v) && v > 0 && v !== measured ? v : null;
                        if ((next || null) === (deal.agreed.feetOverride || null)) return;
                        await patchQuoteMeta(deal.agreed.id, { feetOverride: next }); refreshList();
                      }}
                      className={`w-14 bg-transparent text-sm text-right tabular-nums rounded px-1 hover:bg-surface-alt focus:bg-surface-alt focus:outline-none ${deal.agreed.feetOverride ? 'text-sky-400' : 'text-secondary'}`} />
                  </span>
                  <span className="hidden sm:block text-sm text-secondary text-right tabular-nums">{st0.key !== 'gift' && ft > 0 && planPrice > 0 ? `$${(planPrice / ft).toFixed(2)}` : '—'}</span>
                  <span className="hidden sm:block">{yrs > 1 && <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-sky-500/15 text-sky-400 whitespace-nowrap">{yrs} yr</span>}</span>
                  <span className="hidden sm:block text-right text-sm tabular-nums text-sky-400">{st0.key !== 'gift' && addonsPrice > 0 ? dollars(addonsPrice) : <span className="text-muted">—</span>}</span>
                  <span className="hidden sm:flex flex-col items-start gap-0.5">{(() => {
                    const st = stageOf(sq); const [label, cls] = STAGE_LABEL[st.key] || ['Pending', 'bg-yellow-500/15 text-yellow-400'];
                    return <>
                      {/* One status dropdown: Sold / Sent / Follow up come from Jobber; Accepted, Declined, Gift are yours to set */}
                      <select value={sq0.gift ? 'gift' : sq0.qStage === 'accepted' ? 'accepted' : sq0.qStage === 'unqualified' ? 'declined' : 'auto'}
                        onClick={(e) => e.stopPropagation()}
                        onChange={async (e) => {
                          const v = e.target.value;
                          await patchQuoteMeta(sq0.id, { gift: v === 'gift', qStage: v === 'accepted' ? 'accepted' : v === 'declined' ? 'unqualified' : '' });
                          refreshList();
                        }}
                        className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold cursor-pointer border-0 outline-none appearance-none pr-4 ${cls}`}
                        style={{ backgroundImage: 'none' }}>
                        <option value="auto">{['accepted', 'gift', 'unqualified'].includes(st.key) ? 'From Jobber' : `${label}${st.key === 'follow' ? ` · ${st.days}d` : ''}`} ▾</option>
                        <option value="accepted">✓ Accepted</option>
                        <option value="declined">✕ Declined</option>
                        <option value="gift">🎁 Gift</option>
                      </select>
                      {!sq.clientInfo?.id && <button onClick={(e) => { e.stopPropagation(); setLinking(sq); }} className="mt-0.5 px-2 py-0.5 rounded-md border border-amber-500/60 text-[10px] font-bold text-amber-500 hover:bg-amber-500/10 whitespace-nowrap cursor-pointer" title="Pick their client in Jobber">🔗 Link to Jobber</button>}
                    </>;
                  })()}</span>
                  <span className="hidden sm:flex justify-end" onClick={(e) => e.stopPropagation()}>
                    {confirmDel === sq.id
                      ? <span className="flex items-center gap-1 whitespace-nowrap text-[11px]">
                          <button onClick={() => setConfirmDel(null)} className="rounded px-1.5 py-0.5 text-muted hover:text-primary cursor-pointer">Cancel</button>
                          <button onClick={() => removeQuote(sq.id)} className="rounded bg-red-600 px-1.5 py-0.5 font-semibold text-white hover:bg-red-700 cursor-pointer">Delete</button>
                        </span>
                      : <span className="flex items-center gap-0.5">
                          <button onClick={() => setAttaching(sq0)} className="p-1 text-muted hover:text-primary cursor-pointer" title="Put this quote inside another deal (as another scope or an add-on)"><Layers size={13} /></button>
                          <button onClick={() => setConfirmDel(sq.id)} className="p-1 text-muted hover:text-red-500 cursor-pointer" title="Delete"><Trash2 size={13} /></button>
                        </span>}
                  </span>
                </div>
                {openDeal === sq.id && (
                  // Each piece of the deal on its own row, lined up under the same columns (plain gray, no extra colors)
                  <div className="border-b border-border-subtle bg-surface-alt/30">
                    {[...deal.opts.map((x) => ({ x, kind: 'option' })), ...deal.addons.map((x) => ({ x, kind: 'addon' }))].map(({ x, kind }) => {
                      const agreed = kind === 'option' && x.id === deal.agreed.id;
                      const y = Number(deal.agreed.planYears) || stageOf(sq0).jq?.years || 1;
                      const per = num(x.total) * (1 - (PLAN_OFF[y] || 0) / 100);
                      const xf = deal.ftOf(x);
                      const dim = kind === 'option' && !agreed;
                      return (
                        <div key={x.id} onClick={() => open(x.id)}
                          className={`group/sub grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,2fr)_80px_110px_60px_60px_44px_70px_150px_36px] gap-3 items-center px-4 py-1.5 text-xs cursor-pointer hover:bg-surface-alt ${dim ? 'opacity-50' : ''}`}>
                          <span className="min-w-0 pl-4 truncate text-secondary">
                            <span className={`mr-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${kind === 'addon' ? 'bg-sky-500/15 text-sky-400' : agreed ? 'bg-emerald-500/15 text-emerald-500' : 'bg-surface-alt text-muted'}`}>{kind === 'addon' ? '➕ ADD-ON' : agreed ? '✓ MAIN' : 'NOT CHOSEN'}</span>{x.scopeName || (kind === 'option' ? 'Main quote' : 'Add-on')}
                          </span>
                          <span className="hidden sm:block" />
                          <span className="text-right tabular-nums text-secondary">{num(x.total) > 0 ? dollars(per) : '—'}</span>
                          <span className="hidden sm:block text-right tabular-nums text-secondary">{xf || '—'}</span>
                          <span className="hidden sm:block text-right tabular-nums text-muted">{xf > 0 && per > 0 ? `$${(per / xf).toFixed(2)}` : ''}</span>
                          <span className="hidden sm:block" />
                          <span className="hidden sm:block" />
                          <span className="hidden sm:flex gap-3 text-[11px] text-muted opacity-0 group-hover/sub:opacity-100" onClick={(e) => e.stopPropagation()}>
                            {dim && <button onClick={async () => { await patchQuoteMeta(sq.id, { chosenId: x.id }); refreshList(); }} className="hover:text-primary underline cursor-pointer">Use this one</button>}
                            {x.id !== sq.id && <button onClick={async () => { await patchQuoteMeta(x.id, { group: null, kind: null }); if (sq.chosenId === x.id) await patchQuoteMeta(sq.id, { chosenId: null }); refreshList(); }} className="hover:text-primary underline cursor-pointer">Take out</button>}
                          </span>
                          <span className="hidden sm:block" />
                        </div>
                      );
                    })}
                  </div>
                )}
                </Fragment>
              );
            })}
            {/* Totals for what's showing (gifts don't count) */}
            {(() => {
              const t = rows.map(rowNums).filter((r) => r.st0.key !== 'gift').reduce((a, r) => ({ total: a.total + r.planPrice + r.addonsPrice, roof: a.roof + r.planPrice, add: a.add + r.addonsPrice, ft: a.ft + (r.ft > 0 && r.planPrice > 0 ? r.ft : 0), roofFt: a.roofFt + (r.ft > 0 && r.planPrice > 0 ? r.planPrice : 0) }), { total: 0, roof: 0, add: 0, ft: 0, roofFt: 0 });
              return (
                <div className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,2fr)_80px_110px_60px_60px_44px_70px_150px_36px] gap-3 items-center px-4 py-3 border-t-2 border-border-default bg-surface-alt/50 text-sm font-bold">
                  <span className="text-primary">Totals <span className="text-xs font-normal text-muted">· {rows.length} shown · per season</span></span>
                  <span className="text-right tabular-nums text-brand-text">{dollars(t.total)}</span>
                  <span className="hidden sm:block text-right tabular-nums text-primary">{dollars(t.roof)}</span>
                  <span className="hidden sm:block text-right tabular-nums text-primary">{Math.round(t.ft)}</span>
                  <span className="hidden sm:block text-right tabular-nums text-secondary">{t.ft > 0 ? `$${(t.roofFt / t.ft).toFixed(2)}` : '—'}</span>
                  <span className="hidden sm:block" />
                  <span className="hidden sm:block text-right tabular-nums text-sky-400">{dollars(t.add)}</span>
                  <span className="hidden sm:block" /><span className="hidden sm:block" />
                </div>
              );
            })()}
          </div>
          </>
        );
      })()}
      {view === 'quote' && !editing && qView === 'gallery' && (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          <button
            onClick={() => { reset(); setEditing(true); }}
            className="aspect-[4/3] rounded-xl border-2 border-dashed border-border-strong hover:border-border-brand flex flex-col items-center justify-center gap-1 text-secondary hover:text-primary cursor-pointer"
          >
            <Plus size={22} /> <span className="text-sm font-semibold">New quote</span>
          </button>
          {saved.filter((sq) => stageOf(sq).key !== 'unqualified')
            .sort((a, b) => createdOf(b) - createdOf(a)) // newest first
            .map((sq) => {
            const sold = stageOf(sq).key === 'sold';
            // Show photo first: a finished mockup from Client preview, then a ticked show photo, then any photo
            const sides = sq.angles || [];
            const photo = covers[sq.id] || sq.cover || sq.previews?.[0]?.image || sides.find((a) => a.ai?.image)?.ai.image
              || sides.find((a) => a.show && a.plain)?.plain || sides.find((a) => a.plain)?.plain;
            const ft = ['easy', 'medium', 'hard'].reduce((t, k) => t + num(sq.feet?.[k]), 0);
            return (
              <div key={sq.id} className="group relative rounded-xl border border-border-default bg-card overflow-hidden hover:border-border-strong transition-colors">
                <button
                  onClick={async () => { setOpening(sq.id); try { await openQuote(sq.id); setEditing(true); } finally { setOpening(''); } }}
                  disabled={!!opening}
                  className="relative block w-full text-left cursor-pointer"
                >
                  {opening === sq.id && <span className="absolute inset-0 z-10 bg-black/50 flex items-center justify-center text-white text-sm font-semibold">Opening…</span>}
                  {sold && <span className="absolute top-2 left-2 z-[1] px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500 text-white">Sold</span>}
                  {photo
                    ? <img src={photo} alt={sq.client} className="w-full aspect-[4/3] object-cover" />
                    : <div className="w-full aspect-[4/3] bg-surface-alt flex items-center justify-center text-muted"><Lightbulb size={28} /></div>}
                  <div className="px-3 py-2">
                    <p className="text-sm font-semibold text-primary truncate">{sq.client || 'No name'}</p>
                    <p className="text-[11px] text-muted truncate">
                      {ft ? `${ft} ft · ` : ''}{new Date(createdOf(sq)).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      {sq.status && sq.status !== 'draft' && ` · ${sq.status[0].toUpperCase()}${sq.status.slice(1)}`}
                    </p>
                    <p className="text-base font-bold text-brand-text">{money(sq.total || 0)}{ft > 0 && num(sq.total) > 0 && <span className="ml-1.5 text-xs font-semibold text-secondary">{money(num(sq.total) / ft)}/ft</span>}</p>
                  </div>
                </button>
                {confirmDel === sq.id ? (
                  <button onClick={() => removeQuote(sq.id)} className="absolute top-2 right-2 rounded-md bg-red-600 text-white text-[11px] font-semibold px-2 py-1 cursor-pointer">Delete for good?</button>
                ) : (
                  <button onClick={() => setConfirmDel(sq.id)} className="absolute top-2 right-2 p-1.5 rounded-md bg-black/50 text-white opacity-0 group-hover:opacity-100 hover:bg-red-600 cursor-pointer" title="Delete"><Trash2 size={13} /></button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {view === 'quote' && editing && listOpen && (
        <div className="rounded-xl border border-border-default bg-card p-2 space-y-1">
          {!saved.length && <p className="text-sm text-muted p-2">No saved quotes yet. Type a client name and hit Save quote.</p>}
          {saved.map((sq) => (
            <div key={sq.id} className={`flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface-alt ${sq.id === savedId ? 'bg-surface-alt' : ''}`}>
              <button onClick={() => openQuote(sq.id)} className="flex-1 text-left cursor-pointer">
                <p className="text-sm font-semibold text-primary">{sq.client}</p>
                <p className="text-[11px] text-muted">{new Date(sq.savedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {(sq.angles || []).filter((a) => a.plain).length} photo side(s)</p>
              </button>
              <span className="text-sm font-bold text-brand-text">{money(sq.total || 0)}</span>
              {confirmDel === sq.id ? (
                <button onClick={() => removeQuote(sq.id)} className="text-xs font-semibold text-red-500 cursor-pointer">Delete for good?</button>
              ) : (
                <button onClick={() => setConfirmDel(sq.id)} className="p-1 text-muted hover:text-red-500 cursor-pointer" title="Delete"><Trash2 size={14} /></button>
              )}
            </div>
          ))}
        </div>
      )}

      {view === 'quote' && editing && (
        <>
      <JobberClientPicker
        value={client}
        picked={clientInfo}
        onType={setClient}
        onPick={pickClient}
        status={flash || (savedId && lastSaved ? '✓ Saved' : '')}
        suggestionsTitle="Christmas lights requests in Jobber"
        suggestions={(() => {
          // Every lights request in Jobber (newest first), one per client; ones without a Hub quote yet on top.
          const quoted = new Set(saved.flatMap((sq) => [sq.clientInfo?.id, nameKey(sq.clientInfo?.name || sq.client)]).filter(Boolean));
          const seen = new Set();
          return (jobberRequests || []).filter((r) => r.status !== 'archived' && r.clientId)
            .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
            .filter((r) => (seen.has(r.clientId) ? false : seen.add(r.clientId)))
            .map((r) => {
              const has = quoted.has(r.clientId) || quoted.has(nameKey(r.clientName));
              return { key: r.id, id: r.clientId, name: r.clientName, address: r.street, city: r.city, phone: r.phone, email: r.email,
                sub: `${new Date(r.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${r.title}`, tag: has ? 'has a quote' : '', has };
            })
            .sort((a, b) => Number(a.has) - Number(b.has));
        })()}
      />

      {/* Deal: another scope (copy of this quote to change) or an add-on (new piece of work for the same client) */}
      {savedId && clientInfo && (() => {
        const main = dealMeta.group || savedId;
        const newScope = async () => {
          const id = `lq-${Date.now()}`;
          const n = saved.filter((x) => x.id === main || x.group === main).filter((x) => x.kind !== 'addon').length + 1;
          await putQuote({ ...snapshot(), id, savedId: id, group: main, kind: 'option', chosenId: null, scopeName: `Scope ${n}`, presentToken: '', crewToken: '', savedAt: new Date().toISOString() });
          await refreshList(); await openQuote(id); say(`Scope ${n} made — change it, then mark it agreed from the list`);
        };
        const newAddon = () => {
          const c = client; const ci = clientInfo; const id = `lq-${Date.now()}`;
          reset();
          setDealMeta({ group: main, kind: 'addon', scopeName: 'Add-on' });
          setSavedId(id); setClient(c); setClientInfo(ci);
          say('New add-on for the same deal — it counts on top of their quote');
        };
        return (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {dealMeta.kind && <span className={`px-2 py-0.5 rounded-md font-bold ${dealMeta.kind === 'addon' ? 'bg-sky-500/15 text-sky-400' : 'bg-surface-alt text-secondary'}`}>{dealMeta.kind === 'addon' ? 'Add-on' : dealMeta.scopeName || 'Other scope'}</span>}
            <input value={dealMeta.scopeName || ''} onChange={(e) => setDealMeta((m) => ({ ...m, scopeName: e.target.value }))} placeholder="Name this version (e.g. Front only)"
              className="w-56 rounded-md border border-border-default bg-card px-2 py-1 text-xs text-primary" />
            <button onClick={newScope} className="px-2.5 py-1 rounded-md border border-border-default font-semibold text-primary hover:bg-surface-alt cursor-pointer">＋ Other scope</button>
            <button onClick={newAddon} className="px-2.5 py-1 rounded-md bg-sky-500/15 font-semibold text-sky-400 hover:bg-sky-500/25 cursor-pointer">＋ Add-on</button>
          </div>
        );
      })()}

      {/* Wizard: one step at a time. Other steps stay mounted (hidden) so lines still refill materials. */}
      {(() => {
        const lines = angles.flatMap((a) => a.lines || []);
        ACTIVE_ORDER = dealMeta.kind === 'addon' ? ADDON_ORDER : STEP_ORDER;
        const allTabs = [
          [1, 'Discovery', !!(disc.pain?.trim() || disc.pleasure?.trim())],
          [2, 'Photos', angles.some((a) => a.plain)],
          [3, 'Plan', lines.length > 0],
          [4, 'Measure', lines.length > 0 && lines.every((l) => Number(l.feet) > 0)],
          [5, 'Difficulty', q.roof > 0],
          [7, 'Materials', !!matOk],
          [6, 'Add-ons', false],
          [9, 'Mockup', previews.length > 0],
          [10, 'Dates', !!installDate && !!takedownDate],
          [12, 'Offers', false],
          [11, 'Present', false],
          [13, 'Summary', false],
          [14, 'Production', false],
        ];
        const tabs = allTabs.filter(([n]) => ACTIVE_ORDER.includes(n));
        return (
          <div className="sticky top-0 z-30 -mx-2 mt-4 px-2 py-2 bg-surface/95 backdrop-blur">
          {/* Steps grouped into the parts of a visit: Meet → Roofline → Add-ons → Present */}
          <div className="flex flex-wrap gap-1 rounded-xl border border-border-default bg-card p-1 shadow-lg">
            {(dealMeta.kind === 'addon'
              ? [['Add-on plan', [2, 3, 4, 7]], ['Approve', [13]], ['Production', [14]]]
              : [['Meet', [1, 2]], ['Roofline', [3, 4, 5, 7]], ['Add-ons', [6]], ['Prep', [9, 10, 12]], ['Present', [11, 13]], ['Production', [14]]]).map(([group, ns], gi) => {
              const here = ns.includes(wstep);
              const allOk = ns.every((n) => n === 11 || n === 13 || n === 14 || isOk(n));
              return (
                <div key={group} className={`rounded-lg border px-1 pt-1 pb-0.5 transition-colors ${here ? 'border-brand/60 bg-brand/5' : 'border-border-subtle bg-surface-alt/20'}`} style={{ flex: '1 1 auto' }} /* width by label length, so no step name gets cut off */>
                  <p className={`px-1 whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.12em] ${here ? 'text-brand-text' : allOk && !['Present', 'Prep', 'Production'].includes(group) ? 'text-brand-text/70' : 'text-muted'}`}>{gi + 1} · {group}</p>
                  <div className="flex gap-0.5">
                    {tabs.filter(([n]) => ns.includes(n)).map(([n, label]) => {
                      const ti = tabs.findIndex(([m]) => m === n);
                      return (
                        <button key={n} onClick={() => goStep(n)}
                          className={`flex-1 flex flex-col items-center justify-center gap-1 rounded-md px-1 py-1.5 text-[10px] tracking-tight leading-none font-semibold cursor-pointer transition-colors ${wstep === n ? 'bg-surface-alt text-primary' : isOk(n) ? 'text-brand-text' : 'text-muted hover:text-primary'}`}>
                          {/* Locked plan → Plan shows a lock */}
                          <span className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold ${planLocked && n === 3 ? 'bg-yellow-400 text-black' : isOk(n) ? 'bg-brand text-on-brand' : wstep === n ? 'bg-primary text-surface' : 'bg-surface-alt text-muted'}`}>{planLocked && n === 3 ? '🔒' : isOk(n) ? '✓' : ti + 1}</span>
                          <span className="whitespace-nowrap">{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        );
      })()}

      <div className={wstep === 1 ? 'space-y-5' : 'hidden'}>

      {/* 1 · Discovery */}
      {(() => {
        // Gutter vs shingle feet from the lines drawn on every side.
        const mountFt = { gutter: 0, guard: 0, shingle: 0, magnet: 0 };
        angles.forEach((a) => (a.lines || []).forEach((l) => { mountFt[l.mount in mountFt ? l.mount : 'gutter'] += Number(l.feet) || 0; }));
        return (
          <>
          <div className={`rounded-xl border border-border-default bg-card p-4 space-y-3`}>
            <StepHead n={1} title="Discovery" sub="With them. A general guide — ask, listen, jot down what you hear." />

            {/* Questions — a general guide, not a form */}
            <div className="space-y-3">
              <ul className="rounded-xl border border-border-default bg-surface-alt/30 p-4 space-y-2">
                {['How do you typically decorate for Christmas?', 'Have you had it professionally done before?', 'What do you love about how it looks? What bugs you about doing it?'].map((t) => (
                  <li key={t} className="flex gap-2.5 text-base font-semibold text-primary"><span className="text-muted">•</span>{t}</li>
                ))}
              </ul>
              {[['pain', 'Pain points', 'What bugs them — ladders, time, cheap lights that broke, last company flaked'],
                ['pleasure', 'Pleasure points', 'What they love — the look they want, kids, neighbors, hosting']].map(([k, label, ph]) => (
                <div key={k} className="space-y-1.5">
                  <p className="text-base font-semibold text-primary">{label}</p>
                  <textarea value={disc[k] || ''} onChange={(e) => setDisc((d) => ({ ...d, [k]: e.target.value }))} rows={3} placeholder={ph}
                    className="w-full rounded-lg border border-border-strong bg-card px-3 py-2 text-sm text-primary outline-none focus:border-brand" />
                </div>
              ))}
              {disc.notes?.trim() && (
                <div className="space-y-1.5">
                  <p className="text-base font-semibold text-primary">Notes</p>
                  <textarea value={disc.notes} onChange={(e) => setDisc((d) => ({ ...d, notes: e.target.value }))} rows={2}
                    className="w-full rounded-lg border border-border-strong bg-card px-3 py-2 text-sm text-primary outline-none focus:border-brand" />
                </div>
              )}
            </div>

          </div>

          <div className={`rounded-xl border border-border-default bg-card p-4 space-y-3`}>
            <StepHead n={2} title="Questionnaire" sub="Their answers, then your picks." />
            <div className="space-y-3">
              <QuoteMaterialsCard part="questions" start={1} only={['power', 'design']} value={materials} onChange={matSet} notes={matNotes} onNotes={setMatNotes} wire={wire} onWire={wireSet} power={power} onPower={setPower} powerPhoto={powerPhoto} onPowerPhoto={setPowerPhoto} quote={{ feet, style, count, strands: strandCount, materials, wire, mountFt, runs: runsOf(angles, wire), zips: zipsOf(angles), peaks: angles.reduce((t, x) => t + (x.peaks || []).length, 0) }} designs={DESIGNS} design={style} onDesign={setStyle} customColor={customColor} onCustomColor={setCustomColor} />
              <div className="rounded-xl border border-border-default bg-surface-alt/30 p-4 space-y-3">
                <p className="flex items-center gap-2.5 text-base font-semibold text-primary">
                  <span className="w-6 h-6 shrink-0 rounded-full bg-surface-alt text-xs font-bold text-secondary flex items-center justify-center">3</span>
                  Do they have gutter guards?
                </p>
                <div className="grid gap-2 grid-cols-2">
                  {[['yes', 'Yes'], ['no', 'No']].map(([k, label]) => {
                    const on = disc.gutterGuard === k;
                    return (
                      <button key={k} onClick={() => setDisc((d) => ({ ...d, gutterGuard: on ? '' : k }))}
                        className={`inline-flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-2.5 text-sm font-semibold cursor-pointer transition-colors ${on ? 'border-white/50 bg-surface-alt text-primary' : 'border-border-default text-secondary hover:border-border-strong hover:text-primary'}`}>
                        {on && <span>✓</span>}{label}
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* Your picks — wire, plugs, timer (swaps the materials to match) */}
              <QuoteMaterialsCard part="questions" start={4} only={['timer']} value={materials} onChange={matSet} notes={matNotes} onNotes={setMatNotes} wire={wire} onWire={wireSet} power={power} onPower={setPower} quote={{ feet, style, count, strands: strandCount, materials, wire, mountFt, runs: runsOf(angles, wire), zips: zipsOf(angles), peaks: angles.reduce((t, x) => t + (x.peaks || []).length, 0) }} />
            </div>
          </div>
          </>
        );
      })()}

        {nav(1)}
      </div>
      <div className={wstep === 2 ? 'space-y-5' : 'hidden'}>
      {/* Photos (upload, like on the phone) */}
      <div id="step-4" className="scroll-mt-32"><LightsMeasurePhotos mode="photos" angles={angles} setAngles={setAngles} onApply={() => {}} onMove={moveSide} /></div>

        {nav(2)}
      </div>
      <div className={wstep === 3 ? 'space-y-5' : 'hidden'}>
      {/* Measure & rate, price per foot, total */}
      {/* Lock the plan so a stray tap can't draw, move or delete lines */}
      <div className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${planLocked ? 'border-yellow-500/40 bg-yellow-500/10' : 'border-border-default bg-card'}`}>
        <p className="text-sm text-secondary">{planLocked ? <><b className="text-yellow-300">🔒 Plan locked</b> — lines and materials can't be changed.</> : <><b className="text-primary">🔓 Plan unlocked</b> — lock it when the lines are right.</>}</p>
        <button onClick={() => setPlanLocked((v) => !v)} className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-semibold cursor-pointer ${planLocked ? 'bg-surface-alt text-primary hover:bg-surface' : 'bg-yellow-400 text-black hover:bg-yellow-300'}`}>{planLocked ? 'Unlock' : 'Lock plan'}</button>
      </div>
      <div id="step-5" className={`scroll-mt-32 ${planLocked ? 'pointer-events-none select-none' : ''}`}><LightsMeasurePhotos angles={angles} setAngles={planLocked ? () => {} : setAngles} onMove={planLocked ? () => {} : moveSide} onApply={(t) => setFeet({ easy: t.easy ? String(t.easy) : '', medium: t.medium ? String(t.medium) : '', hard: t.hard ? String(t.hard) : '' })} /></div>
        {/* Materials + the Confirm button show right below (the Materials block renders on the Plan step) */}
        {nav(3)}
      </div>
      <div className={wstep === 4 ? 'space-y-5' : 'hidden'}>
      {/* Measure: log each line's feet */}
      <LightsMeasurePhotos mode="measure" angles={angles} setAngles={setAngles} onApply={(t) => setFeet({ easy: t.easy ? String(t.easy) : '', medium: t.medium ? String(t.medium) : '', hard: t.hard ? String(t.hard) : '' })} />
        {nav(4)}
      </div>
      <div className={wstep === 5 ? 'space-y-5' : 'hidden'}>
      {/* Difficulty: rate each line, then price per foot, total */}
      <LightsMeasurePhotos mode="rate" angles={angles} setAngles={setAngles} onApply={(t) => setFeet({ easy: t.easy ? String(t.easy) : '', medium: t.medium ? String(t.medium) : '', hard: t.hard ? String(t.hard) : '' })} />
          <div className="rounded-xl border border-border-default bg-card p-4 space-y-3">
            <StepHead n={6} title="Price per foot" sub="Pick the $/ft for each difficulty — the feet come from your lines." />
            <div className="grid grid-cols-3 gap-2">
              {LEVELS.map((l) => {
                const on = num(feet[l.key]) > 0;
                return (
                  <div key={l.key} className={`rounded-lg border p-3 space-y-2.5 transition-colors ${on ? 'border-border-brand bg-brand-light' : 'border-border-default'}`}>
                    {/* 1. Difficulty */}
                    <p className={`text-lg font-bold ${on ? 'text-brand-text-strong' : 'text-primary'}`}>{l.label}</p>
                    {/* 2. Your price */}
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-base">$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={prices[l.key]}
                        onChange={(e) => setPrice(l.key)(e.target.value)}
                        className="w-full rounded-lg border border-border-strong bg-card pl-7 pr-10 py-2.5 text-lg font-bold text-primary outline-none focus:ring-2 focus:ring-ring-brand"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted text-sm">/ft</span>
                    </div>
                    {/* 3. Range */}
                    <p className="text-xs text-muted">Range <b className="text-brand-text">{l.range}</b></p>
                    {/* 4. Footage (from your lines) */}
                    <p className="text-sm text-secondary"><b className="text-primary">{num(feet[l.key]) || 0} ft</b> {l.label.toLowerCase()}</p>
                    {/* 5. Math */}
                    <p className="text-xs text-muted tabular-nums">{num(feet[l.key]) || 0} ft × ${num(prices[l.key]) || 0}/ft</p>
                    {/* 6. Quote */}
                    <p className="text-xl font-bold text-primary tabular-nums border-t border-border-subtle pt-2">{money(q.roofParts[l.key])}</p>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between rounded-lg bg-brand-light border border-border-brand px-4 py-3">
              <span className="text-sm text-secondary">
                {q.roofFt} ft of roofline
                {q.roofFt > 0 && <> · avg <span className="font-semibold text-brand-text">{money(q.roof / q.roofFt)}/ft</span></>}
              </span>
              <span className="text-right">
                <span className="block text-[11px] font-medium text-brand-text-strong">Roof quote</span>
                <span className="text-2xl font-bold text-brand-text">{money(q.roof)}</span>
                {q.roof > 0 && (
                  <span className="block text-xs text-secondary mt-0.5" title="20% under and over, rounded to $50">
                    Tell them <b className="text-primary">{money(Math.round((q.roof * 0.8) / 50) * 50)} – {money(Math.round((q.roof * 1.2) / 50) * 50)}</b>
                  </span>
                )}
              </span>
            </div>
          </div>
  

      {/* 6 · Total — calculator total next to what Jude is quoting them */}
      <div className="rounded-xl border border-border-default bg-card p-4 space-y-3">
        <StepHead n={7} title="Total" />
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-brand-light border border-border-brand px-5 py-3">
            <p className="text-xs font-semibold text-brand-text-strong">Lights total</p>
            <p className="text-3xl font-bold text-brand-text">{money(q.total)}</p>
          </div>
          <div className="rounded-xl border border-border-strong px-5 py-3">
            <p className="text-xs font-semibold text-primary">What I'm quoting</p>
            <div className="relative">
              <span className="absolute left-0 top-1/2 -translate-y-1/2 text-2xl font-bold text-muted">$</span>
              <input
                value={quoted}
                inputMode="decimal"
                placeholder={String(Math.round(q.total || 0))}
                onChange={(e) => setQuoted(e.target.value.replace(/[^0-9.]/g, ''))}
                className="w-full bg-transparent pl-6 text-3xl font-bold text-primary outline-none placeholder:text-placeholder-muted"
              />
            </div>
          </div>
        </div>
        {(() => {
          const p = num(quoted) || q.total;
          return p > 0 ? (
            <p className="text-sm text-secondary">
              Terms: <b className="text-primary">1 yr {money(Math.round(p))}</b> · <b className="text-primary">2 yr {money(Math.round(p * 0.95))}/yr</b> <span className="text-muted">(5% off)</span> · <b className="text-primary">3 yr {money(Math.round(p * 0.9))}/yr</b> <span className="text-muted">(10% off)</span>
            </p>
          ) : null;
        })()}
      </div>

        {nav(5)}
      </div>
      <div className={wstep === 6 ? 'space-y-5' : 'hidden'}>
      {/* Add-ons: anything besides the roofline they want quoted (trees, doors, garages…) + free extras.
          (Old per-photo Extras still count toward materials on quotes that have them.) */}
      <div className="rounded-xl border border-border-default bg-card p-4 space-y-3">
        <StepHead n={6} title="Add-ons" sub="Anything besides the roofline they want quoted — trees, doors, garages, bushes." />
        <LightsAddons key={savedId || 'none'} quoteId={savedId} onMaterials={applyAddonMats} />
      </div>
        {nav(6)}
      </div>
      <div className={wstep === 7 ? 'space-y-5' : 'hidden'}>
      {/* Materials — its own step, right after Difficulty */}
      {(() => {
        // Gutter vs shingle feet from the lines drawn on every side.
        const mountFt = { gutter: 0, guard: 0, shingle: 0, magnet: 0 };
        angles.forEach((a) => (a.lines || []).forEach((l) => { mountFt[l.mount in mountFt ? l.mount : 'gutter'] += Number(l.feet) || 0; }));
        // What the plan needs, in plain words — before the item-by-item list.
        const runs = runsOf(angles, wire);
        const zips = zipsOf(angles);
        const peaks = angles.reduce((t, x) => t + (x.peaks || []).length, 0);
        const sum = (arr, f) => arr.reduce((t, r) => t + (f(r) ? r.ft : 0), 0);
        const r1 = (x) => Math.round(x * 10) / 10;
        const lightsFt = sum(runs, () => true);
        const zipFt = sum(zips, () => true);
        const byColor = (arr, key, test = () => true) => ['white', 'black', 'green'].map((c) => [c, sum(arr, (r) => test(r) && (r[key] || 'white') === c)]).filter(([, f]) => f > 0);
        const colors = (pairs, unit = '') => pairs.map(([c, f]) => `${Math.ceil(f)}${unit} ${c}`).join(' · ');
        const isFlex = (r) => r.mount === 'gutter';
        const isTab = (r) => r.mount === 'shingle' || r.mount === 'guard'; // gutter guard → shingle tabs
        const nm = (re) => (it) => re.test(it?.name || '');
        // Each group: what the plan needs (want = the number the items should add up to), then its items.
        const L = Math.ceil(lightsFt);
        const clipParts = [
          ['flex', isFlex], ['shingle tab', isTab], ['magnet', (r) => r.mount === 'magnet'],
        ].flatMap(([name, f]) => byColor(runs, 'clip', f).map(([c, ft]) => `${Math.ceil(ft)} ${name === 'flex' && c === 'black' ? 'best clip' : name}${name === 'magnet' ? '' : ` ${c}`}`)); // black gutters use the black C9 Best Clip (no black flex clip)
        // Sections: everything that runs the length of the lights adds up to the same feet.
        const lightsSec = `Lights · ${r1(lightsFt)} ft`;
        const groups = [
          { section: lightsSec, label: 'Bulbs', amt: `${L}`, detail: '1 per ft', want: L, test: (it) => kindOf(it) === 'bulb' },
          { section: lightsSec, label: 'Socket wire', amt: `${L} ft`, detail: colors(byColor(runs, 'wire'), ' ft'), want: L, test: nm(/socket\s*wire/i) },
          { section: lightsSec, label: 'Clips', amt: `${L}`, detail: clipParts.join(' · '), want: L, test: (it) => /clip|shingle tab/i.test(it?.name || '') && !(peaks > 0 && /\bo\s*clips?\b/i.test(it?.name || '')) }, // any clip (flex, tab, magnet, all-in-one); O clips get their own row when there are peaks
          { section: lightsSec, label: 'O clips', amt: `${peaks}`, detail: '+1 per peak', want: peaks, test: nm(/\bo\s*clips?\b/i), show: peaks > 0 },
          { section: `Zip cord · ${zipFt > 0 ? `${r1(zipFt)} ft` : '50 ft'}`, label: 'Zip cord', amt: zipFt > 0 ? `${Math.ceil(zipFt)} ft` : '50 ft', detail: zipFt > 0 ? colors(byColor(zips, 'color'), ' ft') : 'no zip lines measured — default', want: zipFt > 0 ? Math.ceil(zipFt) : 50, test: nm(/zip/i) },
          // Add-ons (trees, doors, wreaths…) — what they use from Material, plus any old per-photo Extras strands.
          ...(() => {
            const sup = allSupplies;
            const nameOf = (id) => sup.find((x) => x.id === id)?.name || '';
            const want = (re) => Object.entries(addonMats || {}).reduce((t, [id, qn]) => t + (re.test(nameOf(id)) ? Number(qn) || 0 : 0), 0);
            const minis = want(/mini/i) + (extras.length ? strandCount : 0);
            const wreaths = want(/wreath/i); const bows = want(/\bbow\b/i); const garland = want(/garland/i);
            const sec = 'Add-ons';
            return [
              { section: sec, label: 'Mini strands', amt: `${minis}`, detail: `${EXTRA_STRAND_FT} ft each · trees, bushes, windows, doors`, want: minis, test: (it) => kindOf(it) === 'mini', show: minis > 0 },
              { section: sec, label: 'Wreaths', amt: `${wreaths}`, detail: '', want: wreaths, test: nm(/wreath/i), show: wreaths > 0 },
              { section: sec, label: 'Bows', amt: `${bows}`, detail: '', want: bows, test: nm(/\bbow\b/i), show: bows > 0 },
              { section: sec, label: 'Garland', amt: `${garland}`, detail: '9 ft each', want: garland, test: nm(/garland/i), show: garland > 0 },
            ];
          })(),
          { section: 'Power', label: 'Plugs', amt: '10 + 10', detail: 'male + female · always black', test: nm(/plug/i) },
          { section: 'Power', label: 'Timer', amt: '1', detail: '', test: nm(/timer/i) },
        ].filter((g) => g.show !== false);
        return (
          <div className="rounded-xl border border-border-default bg-card p-4 space-y-4">
            <StepHead n={8} title="Materials" sub="Each thing your plan needs, with the items for it right under it." />
            {planLocked && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-2">
                <p className="text-sm text-yellow-300">🔒 Plan locked — materials are locked too.</p>
                <button onClick={() => setPlanLocked(false)} className="shrink-0 px-3 py-1.5 rounded-lg text-sm font-semibold cursor-pointer bg-surface-alt text-primary hover:bg-surface">Unlock</button>
              </div>
            )}
            <div className={planLocked ? 'pointer-events-none select-none opacity-80' : ''}>
            <QuoteMaterialsCard part="materials" quoteId={savedId} groups={groups} value={materials} onChange={matSet} notes={matNotes} onNotes={setMatNotes} wire={wire} onWire={wireSet} power={power} onPower={setPower} quote={{ feet, style, count, strands: strandCount, materials, wire, mountFt, runs: runsOf(angles, wire), zips: zipsOf(angles), peaks: angles.reduce((t, x) => t + (x.peaks || []).length, 0) }} />
            </div>
          </div>
        );
      })()}


        {nav(7)}
      </div>
      <div className={wstep === 8 ? 'space-y-5' : 'hidden'}>
      {/* Where the lights go — confirm what the presentation will show */}
      <LightsMockup part="lines" angles={angles} setAngles={setAngles} client={client} previews={previews} setPreviews={setPreviews} designId={style} />
        {nav(8)}
      </div>
      <div className={wstep === 9 ? 'space-y-5' : 'hidden'}>
      {/* Mockup: where the lights go, show photos for ChatGPT, client preview */}
      <LightsMockup part="mockup" angles={angles} setAngles={setAngles} client={client} previews={previews} setPreviews={setPreviews} designId={style} nightPhoto={nightPhoto} setNightPhoto={setNightPhoto} extras={extras} customColor={customColor} />
      {/* Before / afters for the Present page — one per side */}
      <div className="rounded-xl border border-border-default bg-card p-4 space-y-3">
        <p className="text-base font-bold text-primary">Before / after photos</p>
        <LightsPairs key={savedId || 'none'} quoteId={savedId} />
      </div>
        {nav(9)}
      </div>
      <div className={wstep === 10 ? 'space-y-5' : 'hidden'}>

      {/* Dates: install + takedown (shows on the presentation) */}
      <div className="rounded-xl border border-border-default bg-card p-4 space-y-3">
        <StepHead title="Dates" sub="Shows on the presentation. Price and date are good today only." />
        <div className="grid gap-3 sm:grid-cols-2">
          {[['Install', installDate, setInstallDate], ['Takedown', takedownDate, setTakedownDate]].map(([label, val, set]) => (
            <label key={label} className="block rounded-xl border border-border-default bg-surface-alt/30 p-3 space-y-1.5">
              <span className="text-sm font-semibold text-primary">{label}</span>
              <input type="date" value={val} onChange={(e) => set(e.target.value)}
                className="block w-full rounded-lg border border-border-strong bg-card px-3 py-2 text-base text-primary outline-none focus:ring-2 focus:ring-ring-brand [color-scheme:dark]" />
            </label>
          ))}
        </div>
      </div>

        {nav(10)}
      </div>
      <div className={wstep === 12 ? 'space-y-5' : 'hidden'}>
      {/* Price bump + offers — right before presenting */}
      <div className="rounded-xl border border-border-default bg-card p-4 space-y-3">
        <StepHead n={12} title="Offers & bumps" sub="Tap bonuses to sweeten the deal, and add a price bump if you need one." />
        <LightsOffers key={savedId || 'none'} quoteId={savedId} basePrice={num(quoted) || q.total} />
      </div>

        {nav(12)}
      </div>
      <div className={wstep === 13 ? 'space-y-5' : 'hidden'}>
      {/* One card: what they're getting, then their decision + plan */}
      <div className="rounded-xl border-2 border-border-brand bg-card p-4 space-y-5">
      {/* Summary of what you put in */}
      {(() => {
        const design = DESIGNS.find((d) => d.id === style);
        // Last check before presenting: who, what color, materials confirmed, any bump / offers.
        const ba = present?.id === savedId ? present.v : null;
        const offerList = (ba?.offers || []).filter((o) => o.on !== false && Number(o.amount) > 0);
        void offerList; // price bump + offers live on the Offers step
        const ftTotal = ['easy', 'medium', 'hard'].reduce((t, k) => t + num(feet[k]), 0);
        const mats = Object.entries(materials || {}).filter(([, v]) => num(v) > 0)
          .map(([id, v]) => { const it = allSupplies.find((x) => x.id === id); return [it?.name || id, num(v), it?.image || '']; });
        const included = ['Roofline', ...((ba?.perks || []).map((p) => String(p.title || '').replace(/^[^\w]+\s*/u, '')).filter(Boolean)), ...((ba?.offers || []).filter((o) => o.on !== false && o.kind === 'free').map((o) => o.label).filter(Boolean))]; // the main pieces only, not the full service list
        const Row = ({ k, children }) => (
          <div className="flex items-start justify-between gap-3 border-b border-border-subtle py-2">
            <span className="text-sm text-muted shrink-0">{k}</span>
            <div className="text-sm font-semibold text-primary text-right">{children}</div>
          </div>
        );
        return (
          <div className="space-y-1">
            <StepHead title="Summary" sub="What they're getting." />
            <Row k="Light color">{design?.label || <span className="text-red-400">—</span>}</Row>
            <Row k="Feet">{ftTotal ? `${Math.round(ftTotal * 10) / 10} ft` : <span className="text-red-400">—</span>}</Row>
            <Row k="Materials">{mats.length ? <ul className="space-y-1">{mats.map(([n, v, img]) => (
              <li key={n} className="flex items-center justify-end gap-2">
                <span>{n} <span className="text-muted font-normal">× {v}</span></span>
                {img ? <img src={img} alt="" className="w-9 h-9 rounded-md object-cover bg-white shrink-0" /> : <span className="w-9 h-9 rounded-md bg-surface-alt shrink-0" />}
              </li>
            ))}</ul> : <span className="text-red-400">—</span>}</Row>
            <Row k="Add-ons">{(ba?.addons || []).filter((a) => a.on !== false).length
              ? <ul className="space-y-0.5">{(ba?.addons || []).filter((a) => a.on !== false).map((a) => <li key={a.id}>{a.label}{a.sub ? <span className="text-muted font-normal"> · {a.sub}</span> : null}{Number(a.price) > 0 ? <span className="text-muted font-normal"> · {money(Number(a.price))}</span> : null}</li>)}</ul>
              : <span className="text-muted font-normal">None</span>}</Row>
            <Row k="What's included"><ul className="space-y-0.5">{included.map((x) => <li key={x}>{x}</li>)}</ul></Row>
          </div>
        );
      })()}

      <LightsMockup part="lines" title="Plan photos" sub="Every side with your lines. Tap one to see it big, or download." angles={angles} setAngles={setAngles} client={client} previews={previews} setPreviews={setPreviews} designId={style} />
      </div>

      {/* Their decision: status + plan, saved on the quote (the Quotes list reads this) */}
      {(() => {
        const parent = dealMeta.kind === 'addon' ? saved.find((x) => x.id === dealMeta.group) : null;
        const parentYrs = parent ? (Number(parent.planYears) || stageOf(parent).jq?.years || 1) : null;
        const yrs = parentYrs || Number(dealMeta.planYears) || 1;
        const status = dealMeta.gift ? 'gift' : qStage === 'accepted' ? 'accepted' : qStage === 'unqualified' ? 'declined' : 'out';
        const setStatus = (v) => { setQStage(v === 'accepted' ? 'accepted' : v === 'declined' ? 'unqualified' : ''); setDealMeta((m) => ({ ...m, gift: v === 'gift' })); };
        const per = num(q.total) * (1 - (PLAN_OFF[yrs] || 0) / 100);
        const chip = (on) => `px-3 py-2 rounded-lg text-sm font-semibold cursor-pointer ${on ? 'bg-brand text-on-brand' : 'bg-surface-alt text-primary hover:bg-surface'}`;
        return (
          <div className="rounded-xl border border-border-default bg-card p-4 space-y-3">
            <StepHead title="Their decision" sub="Set this after they tell you (text, call, in person). The Quotes list uses it." />
            <div className="flex flex-wrap gap-2">
              {[['out', 'Pending'], ['accepted', '✓ Accepted'], ['declined', '✕ Declined'], ['gift', '🎁 Gift']].map(([k, l]) => (
                <button key={k} onClick={() => setStatus(k)} className={chip(status === k)}>{l}</button>
              ))}
            </div>
            {status !== 'gift' && <>
              <p className="text-xs font-bold uppercase tracking-wide text-muted pt-1">Plan</p>
              {parent ? <p className="text-sm text-primary">Add-on — follows <b>{parent.client}</b>’s plan: <b>{yrs} season{yrs > 1 ? 's' : ''}{PLAN_OFF[yrs] ? ` · ${PLAN_OFF[yrs]}% off` : ''}</b></p> : <div className="flex flex-wrap gap-2">
                {[1, 2, 3].map((y) => (
                  <button key={y} onClick={() => setDealMeta((m) => ({ ...m, planYears: y }))} className={chip(yrs === y)}>
                    {y} season{y > 1 ? 's' : ''}{PLAN_OFF[y] ? ` · ${PLAN_OFF[y]}% off` : ''}
                  </button>
                ))}
              </div>}
              {(() => { const jq = savedId && clientInfo ? quoteStage({ id: savedId, client, clientInfo }, jobberQuotes, jobberRequests).jq : null;
                return jq?.quoteNumber ? <p className="text-sm text-secondary">Signed in Jobber: <b className="text-primary">{money(num(jq.total))}</b>{(jq.years || 1) > 1 ? `/season for ${jq.years} seasons` : ''} <span className="text-muted">(quote #{jq.quoteNumber})</span>
                  {(() => { const ft = num(dealMeta.feetOverride) || ['easy', 'medium', 'hard'].reduce((t, k) => t + num(feet[k]), 0); const roof = num(jq.roof ?? jq.total);
                    return ft > 0 ? <span className="block mt-0.5"><b className="text-primary">${(roof / ft).toFixed(2)}/ft</b> <span className="text-muted">(roofline {money(roof)} ÷ {Math.round(ft * 10) / 10} ft)</span></span> : null; })()}</p> : null; })()}
              {num(q.total) > 0 && !(savedId && clientInfo && quoteStage({ id: savedId, client, clientInfo }, jobberQuotes, jobberRequests).jq?.quoteNumber) && <p className="text-sm text-secondary">{yrs > 1 ? <><span className="line-through text-muted">{dollars(q.total)}</span> → </> : null}<b className="text-primary">{dollars(per)}</b>{yrs > 1 ? `/season for ${yrs} seasons` : ''}{(() => { const ft = num(dealMeta.feetOverride) || ['easy', 'medium', 'hard'].reduce((t, k) => t + num(feet[k]), 0); return ft > 0 ? <> · <b className="text-primary">${(per / ft).toFixed(2)}/ft</b></> : null; })()} <span className="text-muted">({parent ? (feet && ['easy', 'medium', 'hard'].some((k) => num(feet[k]) > 0) ? 'counts as extra roofline' : 'counts as an add-on — add feet if it’s more roofline') : 'roofline, before add-ons'})</span></p>}
            </>}
            {/* What their Jobber quote will say + Create in Jobber */}
            <LightsQuotePreview quoteId={savedId} years={Number(dealMeta.planYears) || 1} onYears={(y) => setDealMeta((m) => ({ ...m, planYears: y }))}
              linked={savedId && clientInfo ? (() => { const st = quoteStage({ id: savedId, client, clientInfo }, jobberQuotes, jobberRequests); return st.jq?.quoteNumber ? st.jq : null; })() : null} />
          </div>
        );
      })()}



      {/* Client's exact-price page: the rough-estimate page look, with their real price, 1/2/3-year pick and add-ons. Accept drafts the Jobber quote. */}
      <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4 flex flex-col gap-3">
        <div className="flex-1 min-w-[200px]">
          <p className="text-base font-bold text-primary">🎄 Exact-price page</p>
          <p className="text-xs text-muted">Text them this when they can't meet: their mockup, exact price, 1/2/3-year pick and add-ons. Accept makes the Jobber quote as a draft for you to send.</p>
          {pageCopied && <p className="text-xs text-brand-text mt-1 break-all">Copied: {pageCopied}</p>}
          {presentToken && (() => {
            const theirs = (pageViews?.list || []).filter((v) => !v.me).reverse();
            const ago = (iso) => { const m = Math.round((Date.now() - new Date(iso)) / 6e4); return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
            return (
              <div className="mt-2 text-xs">
                <p className="font-bold text-primary">{theirs.length ? `👀 They opened it ${theirs.length}× · last ${ago(theirs[0].at)}` : '👀 Not opened yet'}{pageViews?.mine ? <span className="font-normal text-muted"> · you {pageViews.mine}×</span> : null}</p>
                {theirs.slice(0, 5).map((v) => <p key={v.at} className="text-muted">{ago(v.at)} · {v.device}{v.app ? ` · ${v.app}` : ''}{v.city ? ` · ${v.city}` : ''}</p>)}
              </div>
            );
          })()}
        </div>
        {(() => {
          const make = () => {
            let t = presentToken;
            if (!t) { const b = new Uint8Array(18); crypto.getRandomValues(b); t = btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); setPresentToken(t); }
            return t;
          };
          const pageUrl = (t) => `https://hub.heyjudeslawncare.com/estimate/${t}`;
          return (
            <div className="flex gap-2">
              <button disabled={!savedId} title={savedId ? '' : 'Pick the client first so the quote saves'} onClick={async () => { const u = pageUrl(make()); try { await navigator.clipboard.writeText(u); } catch { /* shown below */ } setPageCopied(u); setTimeout(() => setPageCopied(''), 6000); }}
                className="flex-1 rounded-lg bg-emerald-600 text-white px-3 py-2 text-sm font-bold hover:bg-emerald-700 disabled:opacity-40 cursor-pointer">{pageCopied ? '✓ Link copied' : '📋 Copy their link'}</button>
              <button disabled={!savedId} onClick={() => { const t = make(); setTimeout(() => window.open(`/estimate/${t}?preview=1`, '_blank'), presentToken ? 0 : 2500); }}
                className="rounded-lg border border-border-strong px-3 py-2 text-sm font-bold text-primary hover:bg-surface-alt disabled:opacity-40 cursor-pointer">👀 Preview</button>
            </div>
          );
        })()}
      </div>
      </div>

        <div className="flex items-center gap-3 pt-2">
          <button onClick={() => goStep(prevStep(13))} className="rounded-xl border border-border-strong px-5 py-3 text-sm font-semibold text-secondary hover:text-primary cursor-pointer">← {WIZARD[prevStep(13)]}</button>
          <button onClick={() => goStep(14)} className="ml-auto rounded-xl bg-brand px-6 py-3 text-base font-bold text-on-brand hover:bg-brand-hover cursor-pointer">Production →</button>
        </div>
      </div>

      {/* Production: the crew's team view (strands, plan with feet, materials) */}
      <div className={wstep === 14 ? 'space-y-5' : 'hidden'}>
      {/* Crew view: send the team the plan + materials */}
      <div className="rounded-xl border border-border-default bg-card p-4 flex flex-col gap-3">
        <div>
          <p className="text-base font-bold text-primary">Team view</p>
          <p className="text-xs text-muted">The plan (with feet) + materials for your team. No login, no prices.</p>
          {crewCopied && <p className="text-xs text-brand-text mt-1 break-all">Copied: {crewCopied}</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={crewLink} disabled={!savedId} title={savedId ? '' : 'Pick the client first so the quote saves'} className="flex-1 rounded-lg bg-brand text-on-brand px-3 py-2 text-sm font-bold hover:bg-brand-hover disabled:opacity-40 cursor-pointer">
            {crewCopied ? '✓ Link copied' : '📋 Copy team link'}
          </button>
          <button onClick={() => openCrewView(savedId, crewToken).then(setCrewToken).catch((e) => say(`Couldn't open team view: ${e.message}`))}
            disabled={!savedId} className="rounded-lg border border-border-strong px-3 py-2 text-sm font-bold text-primary hover:bg-surface-alt disabled:opacity-40 cursor-pointer">👀 Open</button>
        </div>
      </div>
        {crewToken
          ? <div className="rounded-xl border border-border-default overflow-hidden bg-card">
              <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle">
                <p className="text-sm font-bold text-primary">Their phone · strands &amp; team view</p>
                <a href={`/crew/${crewToken}`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand-text hover:underline">Open full screen ↗</a>
              </div>
              {/* What the crew sees on their phone — it's the real page, so edits here save for them too */}
              {wstep === 14 && (
                <div className="py-5 flex justify-center bg-surface-alt/40">
                  <div className="rounded-[44px] border-[10px] border-neutral-800 bg-black shadow-2xl overflow-hidden" style={{ width: 390 + 20, height: 820 }}>
                    <iframe title="Team view on their phone" src={`/crew/${crewToken}`} className="block bg-surface" style={{ width: 390, height: 800, border: 0 }} />
                  </div>
                </div>
              )}
            </div>
          : <div className="rounded-xl border border-dashed border-border-default p-6 text-center space-y-2">
              <p className="text-sm text-secondary">No team view yet for this job.</p>
              <button onClick={async () => { try { setCrewToken(await ensureCrewToken(savedId, crewToken)); } catch (e) { say(`Couldn't make it: ${e.message}`); } }} disabled={!savedId} className="rounded-lg bg-brand text-on-brand px-4 py-2 text-sm font-bold disabled:opacity-40 cursor-pointer">Make the team view</button>
            </div>}
        <div className="flex items-center gap-3 pt-2">
          <button onClick={() => goStep(13)} className="rounded-xl border border-border-strong px-5 py-3 text-sm font-semibold text-secondary hover:text-primary cursor-pointer">← Summary</button>
        </div>
      </div>

      {/* Present: just the button */}
      <div className={wstep === 11 ? 'space-y-5' : 'hidden'}>
      <button
        onClick={() => savedId && navigate(`/lights-presentation/${savedId}`)}
        disabled={!savedId}
        title={savedId ? '' : 'Pick the client first so the quote saves'}
        className="w-full rounded-2xl py-6 text-xl font-bold text-white shadow-lg hover:brightness-110 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
        style={{ background: '#B3121F' }}
      >▶ Present</button>
        {nav(11)}
      </div>
        </>
      )}
    </div>
  );
}
