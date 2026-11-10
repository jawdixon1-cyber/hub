import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Lightbulb, Sparkles, Copy, Check, FolderOpen, Trash2, Plus } from 'lucide-react';
import LightsMeasurePhotos from '../components/LightsMeasurePhotos';
import LightsMockup from '../components/LightsMockup';
import JobberClientPicker from '../components/JobberClientPicker';
import LightsBusiness from '../components/LightsBusiness';
import { DRAFT_ID, putQuote, getQuote, deleteQuote, listQuotes } from '../lib/lightsStore';

// Christmas lights quoter: roofline per foot + strands each, with one minimum
// for the whole lights job. Prices are remembered in this browser.
const PRICES_KEY = 'lights-quoter-prices-v2';
const DEFAULT_PRICES = { easy: '6', medium: '8', hard: '10', perStrand: '35', minimum: '600' };
const LEVELS = [
  { key: 'easy', label: 'Easy', hint: '1-story, simple roofline', range: '$6–8/ft' },
  { key: 'medium', label: 'Medium', hint: '2-story or some peaks', range: '$8–10/ft' },
  { key: 'hard', label: 'Hard', hint: 'Steep, tall, lots of peaks', range: '$10+/ft · go $12–15 if needed' },
];

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const money = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

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
  const [counterOpen, setCounterOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState(() => (params.get('tab') === 'strands' ? 'strands' : 'roofs'));
  // Main views: all quotes (default), one quote, supplies
  const [view, setView] = useState(() => params.get('view') || (params.get('q') ? 'quote' : 'quotes'));
  const [editing, setEditing] = useState(() => !!params.get('q')); // Quotes tab: gallery vs one open quote
  const [angles, setAngles] = useState([EMPTY_SIDE]);
  const [previews, setPreviews] = useState([]); // finished show photos for the client
  const [quoted, setQuoted] = useState(''); // what Jude actually quoted / sold it for
  const [style, setStyle] = useState(() => localStorage.getItem('lights-mockup-design') || 'warm'); // light color for this quote
  const [savedId, setSavedId] = useState(null); // which saved client quote this is
  const [clientInfo, setClientInfo] = useState(null); // Jobber client picked from search
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState([]);
  const [listOpen, setListOpen] = useState(false);
  const [flash, setFlash] = useState('');
  const [confirmNew, setConfirmNew] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const autosaveTimer = useRef(null);
  const [lastSaved, setLastSaved] = useState(null);

  const snapshot = () => ({ client, clientInfo, feet, strands, count, angles, previews, quoted, style, savedId });
  const apply = (d) => {
    setClient(d.client || '');
    setClientInfo(d.clientInfo || null);
    setFeet({ ...EMPTY_FEET, ...(d.feet || {}) });
    setStrands(d.strands || '');
    setCount({ ...EMPTY_COUNT, ...(d.count || {}) });
    setAngles(d.angles?.length ? d.angles.map((a) => ({ ...EMPTY_SIDE, ...a })) : [EMPTY_SIDE]);
    setPreviews(d.previews || []);
    setQuoted(d.quoted || '');
    if (d.style) setStyle(d.style);
    setSavedId(d.savedId ?? (d.id && d.id !== DRAFT_ID ? d.id : null));
  };
  const refreshList = () => listQuotes().then(setSaved).catch(() => {});

  // Restore the quote in progress, so a refresh never loses work.
  useEffect(() => {
    // A client quote in the URL (?q=...) wins; otherwise pick up the draft.
    const fromUrl = params.get('q');
    (fromUrl ? getQuote(fromUrl).then((d) => d || getQuote(DRAFT_ID)) : getQuote(DRAFT_ID))
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
    if (view === 'quote' && editing && tab !== 'roofs') next.tab = tab;
    setParams(next, { replace: true });
  }, [loaded, savedId, tab, view, editing, setParams]);

  // Fresh list whenever the gallery shows.
  useEffect(() => { if (view === 'quote' && !editing) refreshList(); }, [view, editing]);

  // Autosave the quote in progress.
  useEffect(() => {
    if (!loaded) return;
    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      const now = new Date().toISOString();
      const id = client.trim() ? (savedId || (clientInfo ? `jobber-${clientInfo.id}` : `lq-${Date.now()}`)) : null;
      try {
        await putQuote({ id: DRAFT_ID, ...snapshot(), savedId: id, savedAt: now });
        if (id) {
          // keep tracker fields (status, sent date, light style) set on the Supplies page
          const prev = await getQuote(id).catch(() => null);
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
  }, [loaded, client, clientInfo, feet, strands, count, angles, previews, quoted, style, savedId]);

  useEffect(() => {
    localStorage.setItem(PRICES_KEY, JSON.stringify(prices));
  }, [prices]);

  const setPrice = (k) => (v) => setPrices((p) => ({ ...p, [k]: v }));
  const q = calcLightsQuote({ feet, strands, ...prices });
  const setLevelFeet = (k) => (v) => setFeet((f) => ({ ...f, [k]: v }));

  const reset = () => { setClient(''); setFeet(EMPTY_FEET); setStrands(''); setCount(EMPTY_COUNT); setAngles([EMPTY_SIDE]); setSavedId(null); setClientInfo(null); setPreviews([]); setQuoted(''); };
  const say = (msg) => { setFlash(msg); setTimeout(() => setFlash(''), 2500); };

  const openQuote = async (id) => {
    const d = await getQuote(id);
    if (d) { apply({ ...d, savedId: id }); setListOpen(false); say(`Opened ${d.client}`); }
  };
  const removeQuote = async (id) => {
    await deleteQuote(id);
    if (savedId === id) setSavedId(null);
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
  const sc = countStrands(count);
  const setC = (k) => (v) => setCount((c) => ({ ...c, [k]: v }));

  const copy = async () => {
    const lines = [`Christmas Lights quote${client ? ` for ${client}` : ''}`];
    LEVELS.forEach((l) => {
      if (q.roofParts[l.key] > 0) lines.push(`Roofline, ${l.label.toLowerCase()}: ${num(feet[l.key])} ft — ${money(q.roofParts[l.key])}`);
    });
    if (q.strand > 0) lines.push(`Strands: ${num(strands)} — ${money(q.strand)}`);
    if (q.topUp > 0) lines.push(`Minimum adjustment — ${money(q.topUp)}`);
    lines.push(`Total: ${money(num(quoted) || q.total)} (install, takedown & storage included)`);
    await navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={`${view === 'quote' && editing ? 'max-w-2xl' : 'max-w-4xl'} mx-auto space-y-5`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
          <Lightbulb size={24} className="text-brand" /> Lights
        </h1>
        <div className="flex gap-1 bg-surface-alt rounded-lg p-1">
          {[['quotes', 'Dashboard'], ['quote', 'Quotes'], ['jobs', 'Jobs'], ['supplies', 'Material']].map(([id, label]) => (
            <button
              key={id}
              onClick={() => { setView(id); if (id === 'quote') setEditing(false); }}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold max-w-[180px] truncate cursor-pointer ${view === id ? 'bg-card text-primary shadow-sm' : 'text-secondary hover:text-primary'}`}
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
          {view === 'quotes' && (
            <button onClick={() => { reset(); setView('quote'); setEditing(true); }} className="inline-flex items-center gap-1.5 rounded-lg bg-brand text-on-brand text-sm font-semibold px-4 py-2 hover:bg-brand-hover cursor-pointer">
              <Plus size={15} /> New quote
            </button>
          )}
          <LightsBusiness view={view} onOpen={async (id) => { await openQuote(id); setView('quote'); setEditing(true); }} />
        </>
      )}

      {/* Quotes tab: gallery of saved quotes */}
      {view === 'quote' && !editing && (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          <button
            onClick={() => { reset(); setEditing(true); }}
            className="aspect-[4/3] rounded-xl border-2 border-dashed border-border-strong hover:border-border-brand flex flex-col items-center justify-center gap-1 text-secondary hover:text-primary cursor-pointer"
          >
            <Plus size={22} /> <span className="text-sm font-semibold">New quote</span>
          </button>
          {saved.map((sq) => {
            // Show photo first: a finished mockup from Client preview, then a ticked show photo, then any photo
            const sides = sq.angles || [];
            const photo = sq.previews?.[0]?.image || sides.find((a) => a.ai?.image)?.ai.image
              || sides.find((a) => a.show && a.plain)?.plain || sides.find((a) => a.plain)?.plain;
            const ft = ['easy', 'medium', 'hard'].reduce((t, k) => t + num(sq.feet?.[k]), 0);
            return (
              <div key={sq.id} className="group relative rounded-xl border border-border-default bg-card overflow-hidden hover:border-border-strong transition-colors">
                <button onClick={async () => { await openQuote(sq.id); setEditing(true); }} className="block w-full text-left cursor-pointer">
                  {photo
                    ? <img src={photo} alt={sq.client} className="w-full aspect-[4/3] object-cover" />
                    : <div className="w-full aspect-[4/3] bg-surface-alt flex items-center justify-center text-muted"><Lightbulb size={28} /></div>}
                  <div className="px-3 py-2">
                    <p className="text-sm font-semibold text-primary truncate">{sq.client || 'No name'}</p>
                    <p className="text-[11px] text-muted truncate">
                      {ft ? `${ft} ft · ` : ''}{new Date(sq.savedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      {sq.status && sq.status !== 'draft' && ` · ${sq.status[0].toUpperCase()}${sq.status.slice(1)}`}
                    </p>
                    <p className="text-base font-bold text-brand-text">{money(sq.total || 0)}</p>
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

      <div className="flex gap-1 bg-surface-alt rounded-xl p-1">
        {[
          { id: 'roofs', label: 'Roofs', icon: Lightbulb, amt: q.roof },
          { id: 'strands', label: 'Strands', icon: Sparkles, amt: q.strand },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors ${tab === t.id ? 'bg-card text-primary shadow-sm' : 'text-secondary hover:text-primary'}`}
          >
            <t.icon size={15} className={tab === t.id ? 'text-brand' : ''} /> {t.label}
            {t.amt > 0 && <span className="text-xs font-normal text-muted">{money(t.amt)}</span>}
          </button>
        ))}
      </div>
      {/* Kept mounted when hidden so photos and lines survive switching tabs */}
      <div className={tab === 'roofs' ? 'space-y-5' : 'hidden'}>
        <LightsMeasurePhotos angles={angles} setAngles={setAngles} onApply={(t) => setFeet({ easy: t.easy ? String(t.easy) : '', medium: t.medium ? String(t.medium) : '', hard: t.hard ? String(t.hard) : '' })}>
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-3 gap-2">
              {LEVELS.map((l) => {
                const on = num(feet[l.key]) > 0;
                return (
                  <div key={l.key} className={`rounded-lg border p-3 space-y-2 transition-colors ${on ? 'border-border-brand bg-brand-light' : 'border-border-default'}`}>
                    <div>
                      <p className={`text-sm font-semibold ${on ? 'text-brand-text-strong' : 'text-primary'}`}>{l.label}</p>
                      <p className="text-[11px] text-muted">{l.hint}</p>
                      <p className="text-[11px] font-medium text-brand-text">{l.range}</p>
                    </div>
                    <Field label="Feet" value={feet[l.key]} onChange={setLevelFeet(l.key)} placeholder="0" />
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-xs">$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={prices[l.key]}
                        onChange={(e) => setPrice(l.key)(e.target.value)}
                        className="w-full rounded-md border border-border-strong bg-card pl-6 pr-8 py-1.5 text-xs text-primary outline-none focus:ring-2 focus:ring-ring-brand"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted text-xs">/ft</span>
                    </div>
                    <p className="text-right text-sm font-bold text-primary">{money(q.roofParts[l.key])}</p>
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
              </span>
            </div>
          </div>
        </LightsMeasurePhotos>

        <LightsMockup angles={angles} setAngles={setAngles} client={client} previews={previews} setPreviews={setPreviews} designId={style} setDesignId={setStyle} />
      </div>

      <div className={tab === 'strands' ? 'space-y-5' : 'hidden'}>
        <div className="rounded-xl border border-border-default bg-card p-4 space-y-3">
          <p className="text-sm font-semibold text-primary flex items-center gap-2">
            <Sparkles size={16} className="text-brand" /> Strands <span className="text-xs font-normal text-muted">trees, bushes, railings</span>
          </p>
          <div className="grid grid-cols-3 gap-3 items-end">
            <Field label="Number of strands" value={strands} onChange={setStrands} placeholder="0" />
            <Field label="Price / strand" value={prices.perStrand} onChange={setPrice('perStrand')} prefix="$" />
            <div className="text-right pb-2.5 text-lg font-bold text-primary">{money(q.strand)}</div>
          </div>

          <button onClick={() => setCounterOpen((o) => !o)} className="text-sm font-medium text-brand-text hover:underline cursor-pointer">
            {counterOpen ? '− Hide strand counter' : '+ How many strands do we need?'}
          </button>

          {counterOpen && (
            <div className="rounded-lg bg-surface-alt border border-border-subtle p-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Railings / fence / walkway (ft)" value={count.linearFt} onChange={setC('linearFt')} placeholder="0" />
                <Field label="Tree trunks, total height (ft)" value={count.trunkFt} onChange={setC('trunkFt')} placeholder="0" />
              </div>
              <div>
                <p className="text-xs font-medium text-secondary mb-1">Bushes (how many)</p>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Small · under 3 ft" value={count.bush_small} onChange={setC('bush_small')} placeholder="0" />
                  <Field label="Medium · 3–5 ft" value={count.bush_medium} onChange={setC('bush_medium')} placeholder="0" />
                  <Field label="Large · over 5 ft" value={count.bush_large} onChange={setC('bush_large')} placeholder="0" />
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-secondary mb-1">Small trees, fully wrapped (how many)</p>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Small · under 6 ft" value={count.tree_small} onChange={setC('tree_small')} placeholder="0" />
                  <Field label="Medium · 6–10 ft" value={count.tree_medium} onChange={setC('tree_medium')} placeholder="0" />
                  <Field label="Large · over 10 ft" value={count.tree_large} onChange={setC('tree_large')} placeholder="0" />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 pt-1">
                <p className="text-xs text-muted">
                  Railings {sc.linear} · Trunks {sc.trunks} · Bushes {sc.bushes} · Trees {sc.trees}
                  <br />1 strand ≈ 25 ft. Bushes 1/2/4, trees 4/8/15, trunks 1 per 4 ft.
                </p>
                <button
                  onClick={() => setStrands(String(sc.total))}
                  disabled={sc.total <= 0}
                  className="shrink-0 rounded-lg bg-brand text-on-brand text-sm font-semibold px-4 py-2 hover:bg-brand-hover disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  Use {sc.total} strands
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 items-stretch">
        <Field label="Job minimum" value={prices.minimum} onChange={setPrice('minimum')} prefix="$" />
        <div className="col-span-2 rounded-xl bg-brand-light border border-border-brand px-5 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-brand-text-strong">Lights total</p>
            <p className="text-[11px] text-secondary">
              {q.topUp > 0 ? `Includes ${money(q.topUp)} to reach the minimum` : 'Install, takedown & storage'}
            </p>
          </div>
          <span className="text-3xl font-bold text-brand-text">{money(q.total)}</span>
        </div>
      </div>

      {/* What Jude actually quoted / sold it for */}
      <div className="rounded-xl border border-border-default bg-card px-5 py-3 flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-[160px]">
          <p className="text-sm font-semibold text-primary">Quoted them at</p>
          <p className="text-[11px] text-muted">
            {num(quoted) > 0 && q.total > 0
              ? `${num(quoted) < q.total ? `${money(q.total - num(quoted))} under` : num(quoted) > q.total ? `${money(num(quoted) - q.total)} over` : 'Same as'} the calculator · ${q.roofFt > 0 ? `${money(num(quoted) / q.roofFt)}/ft` : ''}`
              : 'What you actually quoted or sold it for'}
          </p>
        </div>
        <div className="relative w-40">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
          <input
            value={quoted}
            inputMode="decimal"
            placeholder={String(Math.round(q.total || 0))}
            onChange={(e) => setQuoted(e.target.value.replace(/[^0-9.]/g, ''))}
            className="w-full rounded-lg border border-border-strong bg-card pl-7 pr-3 py-2 text-xl font-bold text-primary text-right outline-none focus:ring-2 focus:ring-ring-brand placeholder:text-placeholder-muted"
          />
        </div>
      </div>

      <button
        onClick={copy}
        disabled={q.total <= 0}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand text-on-brand font-semibold py-3 hover:bg-brand-hover disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
      >
        {copied ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy quote</>}
      </button>
        </>
      )}
    </div>
  );
}
