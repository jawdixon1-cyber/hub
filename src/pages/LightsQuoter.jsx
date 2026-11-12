import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Lightbulb, Sparkles, Copy, Check, FolderOpen, Trash2, Plus } from 'lucide-react';
import LightsMeasurePhotos from '../components/LightsMeasurePhotos';
import LightsMockup from '../components/LightsMockup';
import LightsExtras from '../components/LightsExtras';
import { extrasStrands, STRAND_FT as EXTRA_STRAND_FT } from '../lib/lightsExtras';
import { DESIGNS } from '../lib/lightsDesigns';
import { kindOf } from '../lib/lightsMaterials';
import JobberClientPicker from '../components/JobberClientPicker';
import LightsBusiness, { QuoteMaterialsCard } from '../components/LightsBusiness';
import { DRAFT_ID, putQuote, getQuote, deleteQuote, listQuotes, getLocalQuote, setLightsOrg, cloudHas, warmQuotes } from '../lib/lightsStore';
import { useAuth } from '../contexts/AuthContext';
import { useJobberList, quoteStage, STAGE_LABEL } from '../lib/jobberLights';

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
// Clip color: picked per line, else white on gutters / guard (matches the gutter), wire color on shingle / metal.
const runsOf = (angles, wire) => angles.flatMap((a) => (a.lines || []).map((l) => {
  const mount = l.mount || 'gutter';
  const w = l.color || wire;
  return { ft: Number(l.feet) || 0, mount, wire: w, clip: l.clip || (mount === 'gutter' || mount === 'guard' ? 'white' : w) };
}));

// Zip (jump) lines measured in Measure: feet + color for zip cord.
const zipsOf = (angles) => angles.flatMap((a) => (a.jumps || []).map((j) => ({ ft: Number(j.feet) || 0, color: j.color || 'white' })));

const WIZARD = ['', 'Discovery', 'Photos', 'Plan', 'Measure', 'Difficulty', 'Extras', 'Materials', 'Lights', 'Mockup', 'Dates', 'Present'];
// Back / Next at the bottom of each wizard step.
function StepNav({ step, onGo, ok, changed, onConfirm, onUndo }) {
  const next = WIZARD[step + 1];
  return (
    <div className="flex items-center gap-3 pt-2">
      {step > 1 && (
        <button onClick={() => onGo(step - 1)} className="rounded-xl border border-border-strong px-5 py-3 text-sm font-semibold text-secondary hover:text-primary cursor-pointer">← {WIZARD[step - 1]}</button>
      )}
      {ok ? (
        <>
          <span className="ml-auto inline-flex items-center gap-1.5 text-sm font-bold text-brand-text">✓ Confirmed</span>
          <button onClick={onUndo} className="text-xs text-muted hover:text-primary cursor-pointer">Undo</button>
          {next && <button onClick={() => onGo(step + 1)} className="rounded-xl border border-border-brand px-5 py-3 text-base font-bold text-brand-text hover:bg-brand-light cursor-pointer">Next: {next} →</button>}
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
  const stageOf = (sq) => quoteStage(sq, jobberQuotes, jobberRequests);
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
  const [view, setView] = useState(() => params.get('view') || (params.get('q') ? 'quote' : 'quotes'));
  const [editing, setEditing] = useState(() => !!params.get('q')); // Quotes tab: gallery vs one open quote
  const [wstep, setWstep] = useState(1); // quote wizard step 1–8
  const goStep = (n) => { setWstep(n); window.scrollTo({ top: 0, behavior: 'smooth' }); document.querySelector('main')?.scrollTo?.({ top: 0, behavior: 'smooth' }); };
  const [angles, setAngles] = useState([EMPTY_SIDE]);
  const [previews, setPreviews] = useState([]); // finished show photos for the client
  const [quoted, setQuoted] = useState(''); // what Jude actually quoted / sold it for
  const [qStage, setQStage] = useState(''); // only 'unqualified' — Sent / Sold come from Jobber
  const [style, setStyle] = useState(() => localStorage.getItem('lights-mockup-design') || 'warm'); // light color for this quote
  const [savedId, setSavedId] = useState(null); // which saved client quote this is
  const [materials, setMaterials] = useState({}); // what the job will take (itemId -> qty)
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
  const [extras, setExtras] = useState([]); // columns, railings, trees, bushes… [{ id, side, x, y, type, run, around, wraps, width, strands, label }] // { stepNumber: true } — confirmed steps (6 + 7 use matOk / linesOk so changes un-confirm)
  const [clientInfo, setClientInfo] = useState(null); // Jobber client picked from search
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState([]);
  const [listOpen, setListOpen] = useState(false);
  const [flash, setFlash] = useState('');
  const [confirmNew, setConfirmNew] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const autosaveTimer = useRef(null);
  const [lastSaved, setLastSaved] = useState(null);

  const snapshot = () => ({ client, clientInfo, feet, strands, count, angles, previews, quoted, qStage, style, materials, matNotes, wire, power, powerPhoto, nightPhoto, disc, installDate, takedownDate, matOk, linesOk, stepsOk, stepsV: 2, extras, savedId });
  const apply = (d) => {
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
    if (d.style) setStyle(d.style);
    setSavedId(d.savedId ?? (d.id && d.id !== DRAFT_ID ? d.id : null));
  };
  const refreshList = () => listQuotes().then((list) => { setSaved(list); warmQuotes(list); }).catch(() => {});
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
    if (view === 'quote' && editing && savedId) next.q = savedId;
    setParams(next, { replace: true });
  }, [loaded, savedId, view, editing, setParams]);

  // Fresh list whenever the gallery shows.
  useEffect(() => { if (view === 'quote' && !editing) refreshList(); }, [view, editing]);

  // Autosave the quote in progress — but not the first run after opening (that's just
  // what was loaded; saving it back could overwrite newer work from another device).
  const skipFirstSave = useRef(true);
  // Only save when something actually changed. The fingerprint skips the big photo
  // data (length only), so it's cheap; opening a quote just records its fingerprint.
  const lastSig = useRef('');
  const sigNow = () => JSON.stringify([client, clientInfo?.id, feet, strands, count, quoted, qStage, style, materials, matNotes, wire, power, powerPhoto?.length || 0, nightPhoto?.length || 0, disc, installDate, takedownDate, matOk, linesOk.length, stepsOk, extras, savedId,
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
        await putQuote({ id: DRAFT_ID, ...snapshot(), savedId: id, savedAt: now });
        if (id) {
          // keep tracker fields (status, sent date, light style) set on the Supplies page
          const prev = await getLocalQuote(id).catch(() => null);
          await putQuote({ ...(prev || {}), id, ...snapshot(), savedId: id, total: num(quoted) || q.total, calcTotal: q.total, savedAt: now });
          if (id !== savedId) setSavedId(id);
          setLastSaved(now);
          refreshList();
        }
      } catch {
        say('Could not save — browser storage may be full');
      }
    }, 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, client, clientInfo, feet, strands, count, angles, previews, quoted, qStage, style, materials, matNotes, wire, power, powerPhoto, nightPhoto, disc, installDate, takedownDate, matOk, linesOk, stepsOk, extras, savedId]);

  useEffect(() => {
    localStorage.setItem(PRICES_KEY, JSON.stringify(prices));
  }, [prices]);

  const setPrice = (k) => (v) => setPrices((p) => ({ ...p, [k]: v }));
  // Strands come from the Extras step (old quotes: the typed strand count).
  const strandCount = extras.length ? extrasStrands(extras) : num(strands);
  const q = calcLightsQuote({ feet, strands: strandCount, ...prices });

  // Step confirms. Materials (6) and Lights (7) remember what they looked like, so a change un-confirms them.
  const matSig = JSON.stringify(Object.entries(materials || {}).filter(([, v]) => Number(v) > 0).sort());
  const linesSig = JSON.stringify(angles.map((a) => [a.lines || [], a.jumps || [], a.outlets || []]));
  const isOk = (n) => (n === 7 ? !!matOk && matOk === matSig : n === 8 ? !!linesOk && linesOk === linesSig : !!stepsOk[n]);
  const confirmStep = (n) => {
    if (n === 7) setMatOk(matSig); else if (n === 8) setLinesOk(linesSig); else setStepsOk((o) => ({ ...o, [n]: true }));
    if (n < 11) goStep(n + 1);
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
  const reset = () => { setWstep(1); setClient(''); setFeet(EMPTY_FEET); setStrands(''); setCount(EMPTY_COUNT); setAngles([EMPTY_SIDE]); setSavedId(null); setClientInfo(null); setPreviews([]); setQuoted(''); setQStage(''); setMaterials({}); setMatNotes({}); setWire('white'); setPower(''); setPowerPhoto(''); setNightPhoto(''); setDisc({}); setInstallDate(''); setTakedownDate(''); setMatOk(''); setLinesOk(''); setStepsOk({}); setExtras([]); };
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
          {[['quotes', 'Pipeline'], ['quote', 'Quotes'], ['jobs', 'Jobs'], ['supplies', 'Material'], ['sales', 'Sales']].map(([id, label]) => (
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

      {view !== 'quote' && (
        <>
          <LightsBusiness view={view} onNew={view === 'quotes' ? () => { reset(); setView('quote'); setEditing(true); } : null} onOpen={async (id) => { await openQuote(id); setView('quote'); setEditing(true); }} />
        </>
      )}


      {/* Quotes tab: New quote, pending quotes, then sold ones (tagged). Unqualified are hidden. */}
      {view === 'quote' && !editing && (() => {
        // Average $/ft across every real quote (pending + sold) — total $ ÷ total ft.
        const real = saved.filter((sq) => stageOf(sq).key !== 'unqualified');
        const sum = real.reduce((t, sq) => {
          const ft = ['easy', 'medium', 'hard'].reduce((u, k) => u + num(sq.feet?.[k]), 0);
          return ft > 0 && num(sq.total) > 0 ? { ft: t.ft + ft, $: t.$ + num(sq.total), n: t.n + 1 } : t;
        }, { ft: 0, $: 0, n: 0 });
        return (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {sum.ft > 0 ? <p className="text-sm text-secondary">Average <b className="text-brand-text text-base">{money(sum.$ / sum.ft)}/ft</b> <span className="text-xs text-muted">across {sum.n} quotes · {Math.round(sum.ft)} ft · {money(sum.$)}</span></p> : <span />}
            <div className="flex rounded-lg bg-surface-alt p-0.5">
              {[['gallery', 'Gallery'], ['list', 'List']].map(([k, label]) => (
                <button key={k} onClick={() => setQView(k)} className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer ${qView === k ? 'bg-card text-primary shadow-sm' : 'text-muted hover:text-primary'}`}>{label}</button>
              ))}
            </div>
          </div>
        );
      })()}
      {view === 'quote' && !editing && qView === 'list' && (() => {
        const rows = saved.filter((sq) => stageOf(sq).key !== 'unqualified')
          .sort((a, b) => (stageOf(a).key === 'sold') - (stageOf(b).key === 'sold'));
        const open = async (id) => { setOpening(id); try { await openQuote(id); setEditing(true); } finally { setOpening(''); } };
        return (
          <div className="rounded-xl border border-border-default bg-card overflow-hidden">
            <div className="grid grid-cols-[minmax(0,2fr)_70px_100px_80px_80px_70px_36px] gap-3 px-4 py-2 border-b border-border-subtle text-[10px] font-bold uppercase tracking-wide text-muted">
              <span>Client</span><span className="text-right">Feet</span><span className="text-right">Price</span><span className="text-right">$/ft</span><span>Status</span><span>Date</span><span />
            </div>
            <button onClick={() => { reset(); setEditing(true); }} className="w-full flex items-center gap-2 px-4 py-2.5 border-b border-border-subtle text-sm font-semibold text-brand-text hover:bg-surface-alt cursor-pointer"><Plus size={14} /> New quote</button>
            {rows.map((sq) => {
              const sold = stageOf(sq).key === 'sold';
              const ft = ['easy', 'medium', 'hard'].reduce((t, k) => t + num(sq.feet?.[k]), 0);
              return (
                <div key={sq.id} onClick={() => !opening && open(sq.id)}
                  className={`group grid grid-cols-[minmax(0,2fr)_70px_100px_80px_80px_70px_36px] gap-3 items-center px-4 py-2.5 border-b border-border-subtle last:border-b-0 hover:bg-surface-alt cursor-pointer ${sold ? 'opacity-75' : ''}`}>
                  <span className="text-sm font-semibold text-primary truncate">{opening === sq.id ? 'Opening…' : sq.client || 'No name'}</span>
                  <span className="text-sm text-secondary text-right tabular-nums">{ft || '—'}</span>
                  <span className="text-sm font-bold text-brand-text text-right tabular-nums">{money(sq.total || 0)}</span>
                  <span className="text-sm text-secondary text-right tabular-nums">{ft > 0 && num(sq.total) > 0 ? money(num(sq.total) / ft) : '—'}</span>
                  <span>{sold
                    ? <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500 text-white">Sold</span>
                    : <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-yellow-500/15 text-yellow-400">Pending</span>}</span>
                  <span className="text-xs text-muted">{new Date(sq.savedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                  <span className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                    {confirmDel === sq.id
                      ? <button onClick={() => removeQuote(sq.id)} className="text-[10px] font-semibold text-red-500 whitespace-nowrap cursor-pointer">Delete?</button>
                      : <button onClick={() => setConfirmDel(sq.id)} className="p-1 text-muted opacity-0 group-hover:opacity-100 hover:text-red-500 cursor-pointer" title="Delete"><Trash2 size={13} /></button>}
                  </span>
                </div>
              );
            })}
          </div>
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
            .sort((a, b) => (stageOf(a).key === 'sold') - (stageOf(b).key === 'sold')) // pending first, then sold
            .map((sq) => {
            const sold = stageOf(sq).key === 'sold';
            // Show photo first: a finished mockup from Client preview, then a ticked show photo, then any photo
            const sides = sq.angles || [];
            const photo = sq.cover || sq.previews?.[0]?.image || sides.find((a) => a.ai?.image)?.ai.image
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
                      {ft ? `${ft} ft · ` : ''}{new Date(sq.savedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
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
      />

      {/* Wizard: one step at a time. Other steps stay mounted (hidden) so lines still refill materials. */}
      {(() => {
        const lines = angles.flatMap((a) => a.lines || []);
        const tabs = [
          [1, 'Discovery', !!(disc.pain?.trim() || disc.pleasure?.trim())],
          [2, 'Photos', angles.some((a) => a.plain)],
          [3, 'Plan', lines.length > 0],
          [4, 'Measure', lines.length > 0 && lines.every((l) => Number(l.feet) > 0)],
          [5, 'Difficulty', q.roof > 0],
          [6, 'Extras', extras.length > 0],
          [7, 'Materials', Object.values(materials || {}).some((v) => Number(v) > 0)],
          [8, 'Lights', !!linesOk],
          [9, 'Mockup', previews.length > 0],
          [10, 'Dates', !!installDate && !!takedownDate],
          [11, 'Present', false],
        ];
        return (
          <div className="sticky top-0 z-30 -mx-2 mt-4 px-2 py-2 bg-surface/95 backdrop-blur">
          <div className="flex sm:grid sm:grid-cols-11 gap-0.5 overflow-x-auto rounded-xl border border-border-default bg-card p-1 shadow-lg">
            {tabs.map(([n, label]) => (
              <button key={n} onClick={() => goStep(n)}
                className={`min-w-[66px] sm:min-w-0 shrink-0 flex flex-col items-center justify-center gap-1 rounded-lg px-0.5 py-1.5 text-[11px] leading-none font-semibold cursor-pointer transition-colors ${wstep === n ? 'bg-surface-alt text-primary' : isOk(n) ? 'text-brand-text' : 'text-muted hover:text-primary'}`}>
                <span className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold ${isOk(n) ? 'bg-brand text-on-brand' : wstep === n ? 'bg-primary text-surface' : 'bg-surface-alt text-muted'}`}>{isOk(n) ? '✓' : n}</span>
                <span className="max-w-full truncate">{label}</span>
              </button>
            ))}
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
              <QuoteMaterialsCard part="questions" start={1} only={['power', 'design']} value={materials} onChange={setMaterials} notes={matNotes} onNotes={setMatNotes} wire={wire} onWire={setWire} power={power} onPower={setPower} powerPhoto={powerPhoto} onPowerPhoto={setPowerPhoto} quote={{ feet, style, count, strands: strandCount, materials, wire, mountFt, runs: runsOf(angles, wire), zips: zipsOf(angles), peaks: angles.reduce((t, x) => t + (x.peaks || []).length, 0) }} designs={DESIGNS} design={style} onDesign={setStyle} />
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
              <QuoteMaterialsCard part="questions" start={4} only={['timer']} value={materials} onChange={setMaterials} notes={matNotes} onNotes={setMatNotes} wire={wire} onWire={setWire} power={power} onPower={setPower} quote={{ feet, style, count, strands: strandCount, materials, wire, mountFt, runs: runsOf(angles, wire), zips: zipsOf(angles), peaks: angles.reduce((t, x) => t + (x.peaks || []).length, 0) }} />
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
      <div id="step-5" className="scroll-mt-32"><LightsMeasurePhotos angles={angles} setAngles={setAngles} onApply={(t) => setFeet({ easy: t.easy ? String(t.easy) : '', medium: t.medium ? String(t.medium) : '', hard: t.hard ? String(t.hard) : '' })} /></div>

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
      {/* Extras: columns, railings, trees, bushes — priced per strand */}
      <LightsExtras angles={angles} extras={extras} setExtras={setExtras} perStrand={prices.perStrand} setPerStrand={setPrice('perStrand')} />
        {nav(6)}
      </div>
      <div className={wstep === 7 ? 'space-y-5' : 'hidden'}>
      {/* Materials */}
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
        const byColor = (arr, key, test = () => true) => ['white', 'black'].map((c) => [c, sum(arr, (r) => test(r) && (r[key] || 'white') === c)]).filter(([, f]) => f > 0);
        const colors = (pairs, unit = '') => pairs.map(([c, f]) => `${Math.ceil(f)}${unit} ${c}`).join(' · ');
        const isFlex = (r) => r.mount === 'gutter' || r.mount === 'guard';
        const nm = (re) => (it) => re.test(it?.name || '');
        // Each group: what the plan needs (want = the number the items should add up to), then its items.
        const L = Math.ceil(lightsFt);
        const clipParts = [
          ['flex', isFlex], ['shingle tab', (r) => r.mount === 'shingle'], ['magnet', (r) => r.mount === 'magnet'],
        ].flatMap(([name, f]) => byColor(runs, 'clip', f).map(([c, ft]) => `${Math.ceil(ft)} ${name}${name === 'magnet' ? '' : ` ${c}`}`));
        // Sections: everything that runs the length of the lights adds up to the same feet.
        const lightsSec = `Lights · ${r1(lightsFt)} ft`;
        const groups = [
          { section: lightsSec, label: 'Bulbs', amt: `${L}`, detail: '1 per ft', want: L, test: (it) => kindOf(it) === 'bulb' },
          { section: lightsSec, label: 'Socket wire', amt: `${L} ft`, detail: colors(byColor(runs, 'wire'), ' ft'), want: L, test: nm(/socket\s*wire/i) },
          { section: lightsSec, label: 'Clips', amt: `${L}`, detail: clipParts.join(' · '), want: L, test: nm(/flex|shingle tab|magnet/i) },
          { section: lightsSec, label: 'O clips', amt: `${peaks}`, detail: '+1 per peak', want: peaks, test: nm(/\bo\s*clips?\b/i), show: peaks > 0 },
          { section: `Zip cord · ${zipFt > 0 ? `${r1(zipFt)} ft` : '50 ft'}`, label: 'Zip cord', amt: zipFt > 0 ? `${Math.ceil(zipFt)} ft` : '50 ft', detail: zipFt > 0 ? colors(byColor(zips, 'color'), ' ft') : 'no zip lines measured — default', want: zipFt > 0 ? Math.ceil(zipFt) : 50, test: nm(/zip/i) },
          { section: `Extras · ${extras.length} item${extras.length === 1 ? '' : 's'}`, label: 'Mini strands', amt: `${strandCount}`, detail: `${EXTRA_STRAND_FT} ft each · columns, railings, trees, bushes`, want: strandCount, test: (it) => kindOf(it) === 'mini', show: strandCount > 0 },
          { section: 'Power', label: 'Plugs', amt: '10 + 10', detail: 'male + female · always black', test: nm(/plug/i) },
          { section: 'Power', label: 'Timer', amt: '1', detail: '', test: nm(/timer/i) },
        ].filter((g) => g.show !== false);
        return (
          <div className="rounded-xl border border-border-default bg-card p-4 space-y-4">
            <StepHead n={8} title="Materials" sub="Each thing your plan needs, with the items for it right under it." />
            <QuoteMaterialsCard part="materials" quoteId={savedId} groups={groups} value={materials} onChange={setMaterials} notes={matNotes} onNotes={setMatNotes} wire={wire} onWire={setWire} power={power} onPower={setPower} quote={{ feet, style, count, strands: strandCount, materials, wire, mountFt, runs: runsOf(angles, wire), zips: zipsOf(angles), peaks: angles.reduce((t, x) => t + (x.peaks || []).length, 0) }} />
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
      <LightsMockup part="mockup" angles={angles} setAngles={setAngles} client={client} previews={previews} setPreviews={setPreviews} designId={style} nightPhoto={nightPhoto} setNightPhoto={setNightPhoto} extras={extras} />
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
      <div className={wstep === 11 ? 'space-y-5' : 'hidden'}>
      {/* Summary of what you put in */}
      {(() => {
        const price = num(quoted) || q.total;
        const design = DESIGNS.find((d) => d.id === style);
        const rows = [
          ['Client', client || '—'],
          ['Light color', design?.label || '—'],
          ['Power', power?.trim() || '—'],
          ['Gutter guards', disc.gutterGuard === 'yes' ? 'Yes' : disc.gutterGuard === 'no' ? 'No' : '—'],
          ['Extras', extras.length ? `${extras.length} item${extras.length === 1 ? '' : 's'} · ${strandCount} strands` : 'None'],
          ['Price', price > 0 ? money(Math.round(price)) : '—'],
          ['2-yr / 3-yr', price > 0 ? `${money(Math.round(price * 0.95))}/yr · ${money(Math.round(price * 0.9))}/yr` : '—'],
          ['Install date', installDate ? new Date(`${installDate}T12:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : '—'],
          ['Materials', isOk(7) ? 'Confirmed' : '—'],
          ['Takedown date', takedownDate ? new Date(`${takedownDate}T12:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : '—'],
        ];
        return (
          <div className="rounded-xl border border-border-default bg-card p-4">
            <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {rows.map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3 border-b border-border-subtle py-1.5">
                  <span className="text-sm text-muted">{k}</span>
                  <span className={`text-sm font-semibold text-right ${v === '—' ? 'text-red-400' : 'text-primary'}`}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Last thing: present */}
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
