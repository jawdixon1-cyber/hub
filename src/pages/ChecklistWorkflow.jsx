import { useEffect, useMemo, useState, lazy, Suspense, Fragment } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, ExternalLink, CheckCircle2, RotateCcw, Pencil } from 'lucide-react';
import { useAppStore } from '../store/AppStoreContext';
import { useAuth } from '../contexts/AuthContext';
const RouteMapInner = lazy(() => import('../components/RouteMapInner'));

const WeatherStep = lazy(() => import('../components/WeatherStep'));
const QuoTextsStep = lazy(() => import('../components/QuoTextsStep'));
const EmailStep = lazy(() => import('../components/EmailStep'));
const JobberStep = lazy(() => import('../components/JobberStep'));
const PersonalStep = lazy(() => import('../components/PersonalStep'));
const PlanPage = lazy(() => import('./Plan'));
const ChecklistEditorModal = lazy(() => import('../components/ChecklistEditorModal'));

const DETAILS_KEY = 'greenteam-checklist-details';
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const isItemForToday = (item) => !item.days || item.days.length === 0 || item.days.includes(DAY_NAMES[new Date().getDay()]);

function readAll() {
  try {
    const raw = localStorage.getItem(DETAILS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function writeAll(data) {
  try { localStorage.setItem(DETAILS_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

// Strip markdown links to plain text and extract URL parts
function parseLinks(text) {
  const parts = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) parts.push({ type: 'text', value: text.slice(lastIndex, m.index) });
    parts.push({ type: 'link', label: m[1], url: m[2] });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) parts.push({ type: 'text', value: text.slice(lastIndex) });
  return parts;
}

// Section title on the team checklist; the owner (not in Team view) can tap it to rename.
function SectionLabel({ value, canEdit, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  const cls = 'pt-5 pb-1 text-sm font-black uppercase tracking-wider text-muted';
  if (editing) {
    return (
      <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { const t = draft.trim(); setEditing(false); if (t && t !== value) onSave(t); else setDraft(value); }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
        className={`${cls} mt-5 pt-0 bg-transparent outline-none border-b-2 border-primary w-full`} />
    );
  }
  return canEdit
    ? <p onClick={() => setEditing(true)} title="Tap to rename this section" className={`${cls} cursor-text hover:text-primary`}>{value}</p>
    : <p className={cls}>{value}</p>;
}

function EditableTitle({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const t = draft.trim();
          setEditing(false);
          if (t && t !== value) onSave(t);
          else setDraft(value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') { setDraft(value); setEditing(false); }
        }}
        className="flex-1 bg-transparent outline-none text-2xl sm:text-3xl font-black text-primary tracking-tight leading-tight border-b-2 border-primary"
      />
    );
  }
  // Render the saved text but parse markdown links inline.
  const parts = parseLinks(value);
  return (
    <h1
      onClick={() => setEditing(true)}
      className="flex-1 text-2xl sm:text-3xl font-black text-primary tracking-tight leading-tight cursor-text hover:bg-surface-alt rounded-lg px-1 -mx-1"
      title="Tap to rename"
    >
      {renderText(parts)}
    </h1>
  );
}

function renderText(parts) {
  return parts.map((p, i) =>
    p.type === 'text'
      ? <span key={i}>{p.value}</span>
      : <a key={i} href={p.url} target="_blank" rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-brand font-black underline decoration-2 underline-offset-4 hover:opacity-80">
          {p.label}
        </a>
  );
}

export default function ChecklistWorkflow() {
  const { kind, stepIndex } = useParams();
  const navigate = useNavigate();
  const idx = Math.max(0, parseInt(stepIndex || '0', 10));

  const ownerStartChecklist = useAppStore((s) => s.ownerStartChecklist);
  const setOwnerStartChecklist = useAppStore((s) => s.setOwnerStartChecklist);
  const ownerEndChecklist = useAppStore((s) => s.ownerEndChecklist);
  const setOwnerEndChecklist = useAppStore((s) => s.setOwnerEndChecklist);
  const teamChecklist = useAppStore((s) => s.teamChecklist);
  const setTeamChecklist = useAppStore((s) => s.setTeamChecklist);
  const teamEndChecklist = useAppStore((s) => s.teamEndChecklist);
  const setTeamEndChecklist = useAppStore((s) => s.setTeamEndChecklist);
  const { user, ownerMode, currentUser } = useAuth();
  const userEmail = (user?.email || 'anon').toLowerCase();

  // Owner ('start', 'end') uses shared done state on the list itself.
  // Team ('team-start', 'team-end', 'team-today') uses per-user done state
  // in localStorage. 'team-today' is a virtual combined view of Open + Close.
  const isTeam = kind === 'team-start' || kind === 'team-end' || kind === 'team-today';
  const isCombined = kind === 'team-today';

  // For combined view, tag each item with which underlying list it lives in
  // so writes dispatch to the right place.
  const list = (() => {
    if (isCombined) {
      return [
        ...teamChecklist.map((i) => ({ ...i, __section: 'open' })),
        ...teamEndChecklist.map((i) => ({ ...i, __section: 'close' })),
      ];
    }
    if (kind === 'team-start') return teamChecklist;
    if (kind === 'team-end') return teamEndChecklist;
    if (kind === 'end') return ownerEndChecklist;
    return ownerStartChecklist;
  })();

  // setList for combined view dispatches to the correct underlying setter
  // based on each item's __section tag. For single-source views, set directly.
  const setList = (newList) => {
    if (!isCombined) {
      const direct = (
        kind === 'team-start' ? setTeamChecklist
        : kind === 'team-end' ? setTeamEndChecklist
        : kind === 'end' ? setOwnerEndChecklist
        : setOwnerStartChecklist
      );
      return direct(newList);
    }
    // Split combined list back into the two underlying lists.
    const stripTag = ({ __section, ...rest }) => rest;
    setTeamChecklist(newList.filter((i) => i.__section === 'open').map(stripTag));
    setTeamEndChecklist(newList.filter((i) => i.__section === 'close').map(stripTag));
  };

  // Per-user team done state — keyed by user+section+date so it resets each day.
  // Combined view reads/writes both 'team-start' and 'team-end' maps.
  const today = new Date().toLocaleDateString('en-CA');
  const openKey  = `boost-team-done-${userEmail}-team-start-${today}`;
  const closeKey = `boost-team-done-${userEmail}-team-end-${today}`;
  const [teamDoneMap, setTeamDoneMap] = useState(() => {
    if (!isTeam) return {};
    try {
      if (isCombined) {
        const open = JSON.parse(localStorage.getItem(openKey) || '{}');
        const close = JSON.parse(localStorage.getItem(closeKey) || '{}');
        return { ...open, ...close };
      }
      const k = kind === 'team-end' ? closeKey : openKey;
      return JSON.parse(localStorage.getItem(k) || '{}');
    } catch { return {}; }
  });
  // Persist done state to the correct localStorage key(s).
  useEffect(() => {
    if (!isTeam) return;
    try {
      if (isCombined) {
        const openIds = new Set(teamChecklist.map((i) => i.id));
        const closeIds = new Set(teamEndChecklist.map((i) => i.id));
        const openMap = {}, closeMap = {};
        for (const [id, v] of Object.entries(teamDoneMap)) {
          if (openIds.has(id)) openMap[id] = v;
          else if (closeIds.has(id)) closeMap[id] = v;
        }
        localStorage.setItem(openKey, JSON.stringify(openMap));
        localStorage.setItem(closeKey, JSON.stringify(closeMap));
      } else {
        const k = kind === 'team-end' ? closeKey : openKey;
        localStorage.setItem(k, JSON.stringify(teamDoneMap));
      }
    } catch { /* ignore */ }
  }, [openKey, closeKey, teamDoneMap, isTeam, isCombined, kind, teamChecklist, teamEndChecklist]);

  // Only step through actual items (not headers), and only those scheduled for today.
  // For team kinds, overlay per-user done state from localStorage.
  const steps = useMemo(() => {
    const filtered = list.filter((i) => i.type !== 'header' && isItemForToday(i));
    if (!isTeam) return filtered;
    return filtered.map((i) => ({ ...i, done: !!teamDoneMap[i.id], doneAt: typeof teamDoneMap[i.id] === 'number' ? teamDoneMap[i.id] : null }));
  }, [list, isTeam, teamDoneMap]);
  const total = steps.length;
  // Each step's section header (e.g. "💼 Work" / "🏠 Personal"), shown as a label in the step list.
  const stepHeader = useMemo(() => {
    const m = {}; let h = null;
    for (const i of list) { if (i.type === 'header') h = i.text; else m[i.id] = h; }
    return m;
  }, [list]);
  // Same, but the header item itself (so the owner can rename a section).
  const stepHeaderItem = useMemo(() => {
    const m = {}; let h = null;
    for (const i of list) { if (i.type === 'header') h = i; else m[i.id] = h; }
    return m;
  }, [list]);

  // First undone real step index, or last step if all done.
  const firstUndoneIdx = useMemo(() => {
    if (steps.length === 0) return 0;
    const idx = steps.findIndex((s) => !s.done);
    return idx === -1 ? (isTeam && !isCombined ? steps.length : steps.length - 1) : idx;
  }, [steps]);

  useEffect(() => {
    if (stepIndex != null) return;
    if (steps.length === 0) return;
    navigate(`/workflow/${kind}/${firstUndoneIdx}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, steps.length, kind]);

  const item = steps[idx];

  // Find header that this item falls under
  const headerForItem = useMemo(() => {
    if (!item) return null;
    let lastHeader = null;
    for (const i of list) {
      if (i.type === 'header') lastHeader = i;
      if (i.id === item.id) break;
    }
    return lastHeader;
  }, [list, item]);

  const all = readAll();
  const initial = item ? (all[item.id] || { sop: '', subItems: [] }) : { sop: '', subItems: [] };

  const [subItems, setSubItems] = useState(initial.subItems);
  const [showFullEditor, setShowFullEditor] = useState(false);
  // Team lists show as one checklist; the proof card shows after they tap Finish (or reopen a finished list).
  const [finished, setFinished] = useState(() => isTeam && !isCombined && steps.length > 0 && steps.every((x) => x.done));

  // Reset local sub-items state when navigating to a new step
  useEffect(() => {
    const fresh = readAll()[item?.id] || { sop: '', subItems: [] };
    setSubItems(fresh.subItems);
  }, [item?.id]);

  // Persist sub-item check state
  useEffect(() => {
    if (!item) return;
    const data = readAll();
    data[item.id] = { ...(data[item.id] || { sop: '' }), subItems };
    writeAll(data);
  }, [item?.id, subItems]);

  if (isTeam && !isCombined) {
    const allDone = steps.length > 0 && steps.every((x) => x.done);
    if (finished && allDone) return <TeamDoneCard kind={kind} steps={steps} name={currentUser || userEmail.split('@')[0]} />;
    const toggle = (id) => setTeamDoneMap((m) => { const n = { ...m }; if (n[id]) delete n[id]; else n[id] = Date.now(); return n; });
    const left = steps.filter((x) => !x.done).length;
    const plain = (t) => (t || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    return (
      <div className="px-3 py-4 max-w-md mx-auto">
        <h1 className="text-3xl font-black text-primary">{kind === 'team-start' ? 'Start of Day' : 'End of Day'}</h1>
        <p className="text-base font-semibold text-muted mb-4">Tap each one when it's done</p>
        {kind === 'team-start' && <ReviewJobs name={currentUser} />}
        <div>
          {steps.map((x, n) => (
            <Fragment key={x.id}>
            {stepHeader[x.id] && stepHeader[x.id] !== stepHeader[steps[n - 1]?.id] && (
              <SectionLabel value={stepHeader[x.id]} canEdit={ownerMode}
                onSave={(t) => { const h = stepHeaderItem[x.id]; if (h) setList(list.map((i) => (i.id === h.id ? { ...i, text: t } : i))); }} />
            )}
            <button onClick={() => toggle(x.id)}
              className="w-full text-left py-3 flex items-center gap-3 cursor-pointer">
              <span className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 ${x.done ? 'bg-emerald-400 border-emerald-400 text-black' : 'border-border-strong'}`}>
                {x.done && <Check size={20} strokeWidth={3.5} />}
              </span>
              <span className={`flex-1 text-base font-semibold ${x.done ? 'text-muted line-through' : 'text-primary'}`}>{plain(x.text)}</span>
            </button>
            </Fragment>
          ))}
        </div>
        <button onClick={() => allDone && setFinished(true)} disabled={!allDone}
          className="mt-5 w-full rounded-2xl bg-brand text-on-brand py-4 text-lg font-black disabled:opacity-40 cursor-pointer">
          {allDone ? 'Finish ✓' : `${left} left`}
        </button>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="px-4 py-12 max-w-3xl mx-auto text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-emerald-400/15 text-emerald-300 flex items-center justify-center">
          <CheckCircle2 size={48} strokeWidth={2.5} />
        </div>
        <h1 className="text-3xl font-black text-primary tracking-tight mb-2">
          {kind === 'end' ? 'End of Day complete' : kind === 'team-start' ? 'Start of Day complete' : kind === 'team-end' ? 'End of Day complete' : 'Start of Day complete'}
        </h1>
        <p className="text-base font-bold text-muted mb-8">
          Nice. {total} steps done. Go get it.
        </p>
        <Link to="/" className="inline-flex items-center gap-2 bg-brand text-black font-black px-6 py-3 rounded-2xl hover:brightness-110">
          <ArrowLeft size={16} /> Back to home
        </Link>
      </div>
    );
  }

  const sop = (readAll()[item.id] || {}).sop || '';
  const subDone = subItems.filter((s) => s.done).length;
  const subTotal = subItems.length;
  const pct = Math.round(((idx + 1) / total) * 100);

  const toggleSub = (id) => setSubItems((arr) => arr.map((s) => s.id === id ? { ...s, done: !s.done } : s));
  const resetSubs = () => setSubItems((arr) => arr.map((s) => ({ ...s, done: false })));

  const markAndNext = () => {
    if (isTeam) {
      // Per-user team completion — only this user's localStorage updates.
      setTeamDoneMap((m) => ({ ...m, [item.id]: Date.now() }));
    } else {
      // Owner mode: shared done state on the list itself.
      setList(list.map((i) => i.id === item.id ? { ...i, done: true } : i));
    }
    setSubItems((arr) => arr.map((s) => ({ ...s, done: false })));
    navigate(`/workflow/${kind}/${idx + 1}`);
  };

  const skipNext = () => navigate(`/workflow/${kind}/${idx + 1}`);
  const prev = () => idx > 0 && navigate(`/workflow/${kind}/${idx - 1}`);

  const titleParts = parseLinks(item.text);
  // Steps with a big live panel (the Quo inbox) get the full width; the step list collapses to the top bar.
  const wide = ownerMode && !isTeam && ['texts', 'email', 'jobber', 'personal', 'plan'].includes(item.panel);

  // Short label for the step list (strip markdown links, trim to ~25 chars).
  const shortLabel = (t) => {
    const plain = (t || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
    return plain.length > 30 ? plain.slice(0, 28) + '…' : plain || 'Step';
  };

  // Section label for the current step (in combined view).
  const sectionLabel = isCombined && item?.__section
    ? (item.__section === 'open' ? '☀ Open' : '🌙 Close')
    : null;

  return (
    <div className={`px-4 sm:px-6 py-6 max-w-6xl mx-auto grid grid-cols-1 ${wide ? '' : 'lg:grid-cols-[260px_1fr]'} gap-6`}>
      {/* Top progress bar: replaces the side stepper on small screens, and on wide steps (Quo inbox) */}
      <div className={wide ? '' : 'lg:hidden'}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted">
            {sectionLabel || (kind === 'end' ? 'End of Day · 5 PM' : kind === 'team-start' ? 'Start of Day' : kind === 'team-end' ? 'End of Day' : kind === 'team-today' ? 'Today' : 'Start of Day · 8 AM')} · {idx + 1}/{total}
          </p>
          <button
            onClick={() => setShowFullEditor(true)}
            className={`${ownerMode ? '' : 'hidden '}text-muted hover:text-primary p-1 rounded-lg hover:bg-surface-alt cursor-pointer`}
            title="Edit checklist"
          >
            <Pencil size={14} />
          </button>
        </div>
        {wide ? (
          // Wide steps: the step list as a row of chips (checks, current, next).
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {steps.map((s, i) => {
              const active = i === idx;
              return (
                <button key={s.id} onClick={() => navigate(`/workflow/${kind}/${i}`)}
                  className={`shrink-0 inline-flex items-center gap-1.5 pl-1.5 pr-3 py-1 rounded-full text-xs cursor-pointer ${
                    active ? 'bg-primary text-card font-black'
                      : s.done ? 'text-tertiary hover:bg-surface-alt font-medium'
                        : 'text-primary bg-surface-alt/60 hover:bg-surface-alt font-bold'
                  }`}>
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black ${
                    active ? 'bg-card text-primary' : s.done ? 'bg-emerald-500 text-white' : 'border border-card-border text-tertiary'
                  }`}>
                    {s.done ? <Check size={10} strokeWidth={3} /> : i + 1}
                  </span>
                  <span className={s.done && !active ? 'line-through opacity-60' : ''}>{shortLabel(s.text)}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="h-1.5 rounded-full bg-surface-alt overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${total > 0 ? ((idx + 1) / total) * 100 : 0}%` }}
            />
          </div>
        )}
      </div>

      {/* Side stepper — desktop only */}
      <aside className={`hidden ${wide ? '' : 'lg:block'} lg:sticky lg:top-4 lg:self-start`}>
        <div className="rounded-2xl border border-card-border bg-card p-3">
          <div className="flex items-center justify-between px-2 pt-1 pb-2">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted">
              {kind === 'end' ? 'End of Day · 5 PM' : kind === 'team-start' ? 'Start of Day' : kind === 'team-end' ? 'End of Day' : kind === 'team-today' ? 'Today' : 'Start of Day · 8 AM'} · {idx + 1}/{total}
            </p>
            <button
              onClick={() => setShowFullEditor(true)}
              className={`${ownerMode ? '' : 'hidden '}text-muted hover:text-primary p-1 rounded-lg hover:bg-surface-alt cursor-pointer`}
              title="Edit the whole checklist"
            >
              <Pencil size={13} />
            </button>
          </div>
          <div className="lg:max-h-[calc(100vh-160px)] lg:overflow-y-auto flex lg:block gap-1 overflow-x-auto">
            {steps.map((s, i) => {
              const active = i === idx;
              const done = s.done;
              // Combined view: drop a divider when section flips from open → close.
              const prev = steps[i - 1];
              const showDivider = isCombined && prev && prev.__section !== s.__section;
              const isFirstOfSection = isCombined && (!prev || prev.__section !== s.__section);
              return (
                <Fragment key={s.id}>
                  {!isCombined && stepHeader[s.id] && stepHeader[s.id] !== (prev ? stepHeader[prev.id] : null) && (
                    <p className="px-3 pt-3 pb-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-muted">{stepHeader[s.id]}</p>
                  )}
                  {(isCombined && (i === 0 || showDivider)) && (
                    <p className="px-3 pt-3 pb-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-muted">
                      {s.__section === 'open' ? '☀ Open' : '🌙 Close'}
                    </p>
                  )}
                <button
                  onClick={() => navigate(`/workflow/${kind}/${i}`)}
                  className={`shrink-0 lg:w-full text-left flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors ${
                    active
                      ? 'bg-primary text-card font-black'
                      : done
                        ? 'text-tertiary hover:bg-surface-alt font-medium'
                        : 'text-primary hover:bg-surface-alt font-medium'
                  }`}
                >
                  <span className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-black ${
                    active
                      ? 'bg-card text-primary'
                      : done
                        ? 'bg-emerald-500 text-white'
                        : 'border-2 border-card-border text-tertiary'
                  }`}>
                    {done ? <Check size={12} strokeWidth={3} /> : i + 1}
                  </span>
                  <span className={`flex-1 truncate ${done && !active ? 'line-through opacity-60' : ''}`}>
                    {shortLabel(s.text)}
                  </span>
                </button>
                </Fragment>
              );
            })}
          </div>
        </div>
      </aside>

      {/* Main step content */}
      <div className="min-w-0">
      {/* Step title — tap to rename */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <EditableTitle
          value={item.text}
          onSave={(t) => setList(list.map((i) => i.id === item.id ? { ...i, text: t } : i))}
        />
        <Link
          to={`/checklist/${kind}/${item.id}`}
          className={`${ownerMode ? '' : 'hidden '}shrink-0 mt-1 text-muted hover:text-primary p-1.5 rounded-lg hover:bg-surface-alt cursor-pointer`}
          title="Edit this step's details · SOP, sub-checklist, links"
        >
          <Pencil size={14} />
        </Link>
      </div>

      {/* Special: weather step renders the live weather card inline */}
      {item.type === 'weather' && (
        <div className="mb-6">
          <Suspense fallback={<p className="text-sm text-tertiary">Loading weather…</p>}>
            <WeatherStep hideContinue />
          </Suspense>
        </div>
      )}

      {/* Live panels (owner only). Added to a step with an explicit tap, never automatically. */}
      {ownerMode && !isTeam && item.panel === 'texts' && (
        <div className="mb-6">
          <Suspense fallback={<p className="text-sm text-tertiary">Loading texts…</p>}>
            <QuoTextsStep />
          </Suspense>
          <button
            onClick={() => setList(list.map((i) => i.id === item.id ? { ...i, panel: undefined } : i))}
            className="mt-3 text-[11px] font-bold text-muted hover:text-primary cursor-pointer"
          >
            Remove Quo texts from this step
          </button>
        </div>
      )}
      {ownerMode && !isTeam && item.panel === 'email' && (
        <div className="mb-6">
          <Suspense fallback={<p className="text-sm text-tertiary">Loading email…</p>}>
            <EmailStep />
          </Suspense>
          <button
            onClick={() => setList(list.map((i) => i.id === item.id ? { ...i, panel: undefined } : i))}
            className="mt-3 text-[11px] font-bold text-muted hover:text-primary cursor-pointer"
          >
            Remove Gmail from this step
          </button>
        </div>
      )}
      {ownerMode && !isTeam && item.panel === 'jobber' && (
        <div className="mb-6">
          <Suspense fallback={<p className="text-sm text-tertiary">Loading Jobber…</p>}>
            <JobberStep />
          </Suspense>
          <button
            onClick={() => setList(list.map((i) => i.id === item.id ? { ...i, panel: undefined } : i))}
            className="mt-3 text-[11px] font-bold text-muted hover:text-primary cursor-pointer"
          >
            Remove Jobber dashboard from this step
          </button>
        </div>
      )}
      {ownerMode && !isTeam && item.panel === 'personal' && (
        <div className="mb-6">
          <Suspense fallback={<p className="text-sm text-tertiary">Loading…</p>}>
            <PersonalStep />
          </Suspense>
          <button
            onClick={() => setList(list.map((i) => i.id === item.id ? { ...i, panel: undefined } : i))}
            className="mt-3 text-[11px] font-bold text-muted hover:text-primary cursor-pointer"
          >
            Remove personal inbox from this step
          </button>
        </div>
      )}
      {ownerMode && !isTeam && item.panel === 'plan' && (
        <div className="mb-6">
          <Suspense fallback={<p className="text-sm text-tertiary">Loading plan…</p>}>
            <PlanPage embedded />
          </Suspense>
          <button
            onClick={() => setList(list.map((i) => i.id === item.id ? { ...i, panel: undefined } : i))}
            className="mt-3 text-[11px] font-bold text-muted hover:text-primary cursor-pointer"
          >
            Remove the planner from this step
          </button>
        </div>
      )}
      {ownerMode && !isTeam && !item.panel && item.type !== 'weather' && /^plan\b/i.test(item.text.trim()) && (
        <button
          onClick={() => setList(list.map((i) => i.id === item.id ? { ...i, panel: 'plan' } : i))}
          className="mb-6 mr-2 inline-flex items-center gap-1.5 text-sm font-black text-brand bg-brand/10 hover:bg-brand/15 px-3 py-2 rounded-2xl cursor-pointer"
        >
          + Show my planner here
        </button>
      )}
      {ownerMode && !isTeam && !item.panel && item.type !== 'weather' && /\bpersonal\b/i.test(item.text) && (
        <button
          onClick={() => setList(list.map((i) => i.id === item.id ? { ...i, panel: 'personal' } : i))}
          className="mb-6 mr-2 inline-flex items-center gap-1.5 text-sm font-black text-brand bg-brand/10 hover:bg-brand/15 px-3 py-2 rounded-2xl cursor-pointer"
        >
          + Show my iMessages and personal email here
        </button>
      )}
      {ownerMode && !isTeam && !item.panel && item.type !== 'weather' && /\bjobber\b/i.test(item.text) && (
        <button
          onClick={() => setList(list.map((i) => i.id === item.id ? { ...i, panel: 'jobber' } : i))}
          className="mb-6 mr-2 inline-flex items-center gap-1.5 text-sm font-black text-brand bg-brand/10 hover:bg-brand/15 px-3 py-2 rounded-2xl cursor-pointer"
        >
          + Show my Jobber day here
        </button>
      )}
      {ownerMode && !isTeam && !item.panel && item.type !== 'weather' && !/\bpersonal\b/i.test(item.text) && /\bemails?\b/i.test(item.text) && (
        <button
          onClick={() => setList(list.map((i) => i.id === item.id ? { ...i, panel: 'email' } : i))}
          className="mb-6 mr-2 inline-flex items-center gap-1.5 text-sm font-black text-brand bg-brand/10 hover:bg-brand/15 px-3 py-2 rounded-2xl cursor-pointer"
        >
          + Show my Gmail inbox here
        </button>
      )}
      {ownerMode && !isTeam && !item.panel && item.type !== 'weather' && !/\bpersonal\b/i.test(item.text) && /\btexts?\b/i.test(item.text) && (
        <button
          onClick={() => setList(list.map((i) => i.id === item.id ? { ...i, panel: 'texts' } : i))}
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-black text-brand bg-brand/10 hover:bg-brand/15 px-3 py-2 rounded-2xl cursor-pointer"
        >
          + Show my Quo texts here (with drafted replies)
        </button>
      )}

      {/* Links (from item + stored detail) */}
      {(() => {
        // Prefer edited links (from details) when present; fall back to seeded item.links.
        const editedLinks = readAll()[item.id]?.links;
        const allLinks = (editedLinks && editedLinks.length > 0) ? editedLinks : (item.links || []);
        if (allLinks.length === 0) return null;
        return (
          <div className="flex flex-wrap gap-2 mb-6">
            {allLinks.map((l) => {
              const isInternal = l.url?.startsWith('/');
              if (isInternal) {
                return (
                  <Link key={l.id} to={l.url}
                    className="inline-flex items-center gap-1.5 text-sm font-black text-brand bg-brand/10 hover:bg-brand/15 px-3 py-2 rounded-2xl">
                    <ExternalLink size={14} /> {l.label}
                  </Link>
                );
              }
              return (
                <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-black text-brand bg-brand/10 hover:bg-brand/15 px-3 py-2 rounded-2xl">
                  <ExternalLink size={14} /> {l.label}
                </a>
              );
            })}
          </div>
        );
      })()}

      {/* SOP */}
      {sop.trim() && (
        <section className="rounded-3xl border border-card-border bg-card p-5 sm:p-6 mb-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-black uppercase tracking-[0.18em] text-muted">How to do it</h2>
            <Link to={`/checklist/${kind}/${item.id}`} className="text-xs font-bold text-muted hover:text-primary cursor-pointer">
              Edit
            </Link>
          </div>
          <p className="text-base text-primary leading-relaxed whitespace-pre-wrap">{sop}</p>
        </section>
      )}

      {/* Sub-checklist — clickable shortcut buttons that open their link(s) */}
      {subItems.length > 0 && (
        <section className="rounded-3xl border border-card-border bg-card p-5 sm:p-6 mb-5">
          <h2 className="text-xs font-black uppercase tracking-[0.18em] text-muted mb-3">Shortcuts</h2>
          <div className="space-y-2">
            {subItems.map((s) => {
              const links = s.links || [];
              const primary = links[0] || null;
              const onClick = (e) => {
                if (!primary) return;
                e.preventDefault();
                if (primary.url?.startsWith('/')) navigate(primary.url);
                else window.open(primary.url, '_blank', 'noopener,noreferrer');
              };
              return (
                <div key={s.id} className="rounded-2xl border border-card-border bg-surface-alt hover:bg-surface-strong overflow-hidden">
                  <button
                    onClick={onClick}
                    disabled={!primary}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left ${primary ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    <ExternalLink size={16} className={`shrink-0 ${primary ? 'text-brand' : 'text-muted'}`} />
                    <span className="flex-1 text-sm sm:text-base font-bold text-primary">{s.text}</span>
                    {!primary && <span className="text-[10px] font-bold text-muted uppercase tracking-wider">no link</span>}
                  </button>
                  {links.length > 1 && (
                    <div className="flex flex-wrap gap-1.5 px-4 pb-3 -mt-1">
                      {links.slice(1).map((l) => {
                        const isInternal = l.url?.startsWith('/');
                        const cls = "inline-flex items-center gap-1.5 text-xs font-black text-brand bg-brand/10 hover:bg-brand/15 px-2.5 py-1 rounded-xl";
                        return isInternal
                          ? <Link key={l.id} to={l.url} className={cls}><ExternalLink size={11} />{l.label}</Link>
                          : <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" className={cls}><ExternalLink size={11} />{l.label}</a>;
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Empty state if no SOP and no sub-items */}
      {ownerMode && !sop.trim() && subItems.length === 0 && (
        <p className="text-xs text-muted mb-5">
          <Link to={`/checklist/${kind}/${item.id}`} className="hover:text-primary">+ Add instructions</Link>
        </p>
      )}

      {/* Action bar */}
      <div className="sticky bottom-4 z-10 flex items-center gap-2">
        <button
          onClick={prev}
          disabled={idx === 0}
          className="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded-2xl text-muted hover:text-primary bg-card border border-card-border disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          title="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <button
          onClick={markAndNext}
          className="flex-1 inline-flex items-center justify-center gap-2 bg-brand text-black font-black px-5 py-4 sm:py-4 rounded-2xl hover:brightness-110 cursor-pointer text-sm sm:text-base"
        >
          {idx + 1 === total ? 'Done & Finish' : 'Done & Next'}
          <ArrowRight size={16} />
        </button>
      </div>
      </div>

      {showFullEditor && (
        <Suspense fallback={null}>
          <ChecklistEditorModal
            onClose={() => setShowFullEditor(false)}
            items={list}
            setItems={setList}
            title={kind === 'end' ? 'Edit End of Day' : kind === 'team-start' ? 'Edit Team Open' : kind === 'team-end' ? 'Edit Team Close' : 'Edit Start of Day'}
            kind={kind}
          />
        </Suspense>
      )}
    </div>
  );
}

// Crew finished Open or Close: a proof card they screenshot and attach in Jobber.
// Only shows when every step is checked; skipped steps send them back first.
function TeamDoneCard({ kind, steps, name }) {
  const isOpen = kind === 'team-start';
  const tz = { timeZone: 'America/New_York' };
  const time = (t) => new Date(t).toLocaleTimeString('en-US', { ...tz, hour: 'numeric', minute: '2-digit' });
  const finished = Math.max(0, ...steps.map((s) => s.doneAt || 0)) || Date.now();
  const date = new Date(finished).toLocaleDateString('en-US', { ...tz, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="px-3 py-6 max-w-md mx-auto">
      <div className="rounded-3xl border-2 border-emerald-400 bg-emerald-400/10 p-5">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-emerald-400 text-black flex items-center justify-center shrink-0">
            <Check size={34} strokeWidth={3.5} />
          </div>
          <div>
            <p className="text-xs font-black tracking-widest text-emerald-300">COMPLETE</p>
            <h1 className="text-2xl font-black text-primary leading-tight">{isOpen ? 'Start of Day' : 'End of Day'}</h1>
          </div>
        </div>
        <div className="mt-4 rounded-2xl bg-black/30 p-4">
          <p className="text-xl font-black text-primary">{name}</p>
          <p className="text-sm font-semibold text-secondary">{date}</p>
          <p className="text-sm font-semibold text-secondary">Finished at {time(finished)}</p>
        </div>
        <ul className="mt-4 space-y-1.5">
          {steps.map((s, i) => (
            <li key={s.id} className="flex gap-2 text-sm text-primary">
              <Check size={16} strokeWidth={3} className="text-emerald-300 shrink-0 mt-0.5" />
              <span className="flex-1">{i + 1}. {s.text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')}</span>
              {s.doneAt && <span className="text-xs text-muted shrink-0">{time(s.doneAt)}</span>}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-center text-xs font-bold text-emerald-300">All {steps.length} steps done ✓ Hey Jude's Lawn Care</p>
      </div>
      <div className="mt-4 rounded-2xl border border-border-default bg-card p-4 text-sm text-primary">
        <p className="font-black mb-1">📸 Last step</p>
        <p className="text-secondary">Screenshot this screen and add it to Jobber.</p>
      </div>
      <Link to="/" className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-surface-alt text-primary font-bold px-6 py-3 rounded-2xl">
        <ArrowLeft size={16} /> Back to home
      </Link>
    </div>
  );
}

function routeLink(list) {
  const p = list.filter((x) => x.lat && x.lng).map((x) => `${x.lat},${x.lng}`);
  if (!p.length) return null;
  const dest = p[p.length - 1];
  const way = p.slice(0, -1).slice(-9).join('|');
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}${way ? `&waypoints=${encodeURIComponent(way)}` : ''}&travelmode=driving`;
}

// Start of Day: today's Jobber stops, in route order. Shows your own crew's stops when
// your name is on any; otherwise everyone's, grouped by crew. No money, no phone numbers.
function ReviewJobs({ name: myName }) {
  const { session, isOwner } = useAuth();
  const token = session?.access_token || '';
  const [st, setSt] = useState({ loading: true, stops: [], error: null });
  // Owner: pick whose route to see first (the list loads in the background meanwhile).
  const [pick, setPick] = useState(null);
  useEffect(() => {
    if (!token) return undefined;
    let alive = true;
    const url = '/api/jobber-today?crew=1';
    // Show the last list this phone loaded today right away, then refresh it (slow signal = no wait).
    const ck = `review-jobs:${url}:${new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })}`;
    let had = false;
    try { const c = JSON.parse(localStorage.getItem(ck) || 'null'); if (c) { had = true; setSt({ loading: false, stops: c, error: null }); } } catch { /* ignore */ }
    if (!had) setSt((x) => ({ ...x, loading: true }));
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || `Error ${r.status}`); return d; })
      .then((d) => d.stops || [])
      .then((stops) => { try { localStorage.setItem(ck, JSON.stringify(stops)); } catch { /* ignore */ } if (alive) setSt({ loading: false, stops, error: null }); })
      .catch((e) => alive && !had && setSt({ loading: false, stops: [], error: e.message }));
    return () => { alive = false; };
  }, [token]);

  // The crew only — not the owner.
  const meFirst = (myName || '').split(' ')[0].toLowerCase();
  const crewNames = [...new Set(st.stops.flatMap((x) => x.crew))].filter((c) => { const f = c.split(' ')[0].toLowerCase(); return f !== 'jude' && f !== meFirst; }).sort();
  const name = isOwner ? pick : myName;
  const first = (name || '').split(' ')[0].toLowerCase();
  const mine = first ? st.stops.filter((x) => x.crew.some((c) => c.split(' ')[0].toLowerCase() === first)) : [];
  const groups = {};
  for (const x of (mine.length ? mine : st.stops)) {
    const k = mine.length ? 'Your stops' : (x.crew.join(' + ') || 'Not assigned');
    (groups[k] = groups[k] || []).push(x);
  }
  // Job name without the "Client Name - " Jobber puts in front; falls back to the client.
  const jobName = (x) => (x.title && x.title !== x.client ? x.title.replace(/^[^-–]+\s[-–]\s/, '') : x.client);
  const time = (x) => (x.allDay ? '' : new Date(x.startAt).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }));

  return (
    <div className="mb-2">
      <p className="pt-1 pb-1 text-sm font-black uppercase tracking-wider text-muted">Review jobs</p>
      {isOwner && crewNames.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 py-1">
          <span className="text-sm font-bold text-secondary">Whose route?</span>
          {crewNames.map((c) => (
            <button key={c} onClick={() => setPick(c)}
              className={`px-4 py-2 rounded-full text-base font-bold cursor-pointer ${pick === c ? 'bg-amber-400 text-black' : 'bg-surface-alt text-primary'}`}>{c.split(' ')[0]}</button>
          ))}
        </div>
      )}
      {isOwner && !crewNames.length && st.loading && <p className="text-sm text-muted py-2">Loading today's jobs…</p>}
      {isOwner && !crewNames.length && !st.loading && !st.error && <p className="text-sm text-muted py-2">No jobs today.</p>}
      {isOwner && st.error && !crewNames.length && <p className="text-sm text-red-400 py-2">Couldn't load jobs. Check Jobber.</p>}
      {isOwner && !pick ? null : <>
      {st.loading && <p className="text-sm text-muted py-2">Loading today's jobs…</p>}
      {st.error && <p className="text-sm text-red-400 py-2">Couldn't load jobs. Check Jobber.</p>}
      {!st.loading && !st.error && st.stops.length === 0 && <p className="text-sm text-muted py-2">No jobs today.</p>}
      {Object.entries(groups).map(([k, list]) => (
        <div key={k} className="mb-2">
          <p className="text-sm font-bold text-primary mt-2">{k} · {list.length} stop{list.length === 1 ? '' : 's'}</p>
          {list.some((x) => x.lat && x.lng) && (
            <div className="mt-2 mb-1">
              <div className="h-64 rounded-xl overflow-hidden border border-border relative z-0">
                <Suspense fallback={<div className="h-full grid place-items-center text-sm text-muted">Loading map…</div>}>
                  <RouteMapInner stops={list.map((x, i) => ({ ...x, n: i + 1, job: jobName(x) })).filter((x) => x.lat && x.lng)} />
                </Suspense>
              </div>
              <a href={routeLink(list)} target="_blank" rel="noreferrer"
                className="inline-block mt-2 px-3 py-1.5 rounded-full bg-amber-400 text-black text-sm font-bold">Drive the route in Google Maps</a>
            </div>
          )}
          <ol>
            {list.map((x, i) => (
              <li key={x.id} className="py-1.5 flex gap-3">
                <span className="w-6 text-base font-black text-muted shrink-0">{i + 1}.</span>
                <div className="min-w-0">
                  <p className="text-base font-bold text-primary">{jobName(x)}{time(x) && <span className="text-muted font-normal"> · {time(x)}</span>}</p>
                  {jobName(x) !== x.client && <p className="text-sm font-semibold text-secondary">{x.client}</p>}
                  {x.address && <a href={`https://maps.apple.com/?q=${encodeURIComponent(x.address)}`} className="text-sm text-muted underline">{x.address}</a>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      ))}
      </>}
    </div>
  );
}
