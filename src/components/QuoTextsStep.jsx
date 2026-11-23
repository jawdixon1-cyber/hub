import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Send, Sparkles, ExternalLink, ChevronDown, Image as ImageIcon, Check, SkipForward, CheckCheck, Inbox, PhoneIncoming, PhoneOutgoing, PhoneMissed, Voicemail } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// Work text step: a Quo-style inbox of every open Quo thread (texts + calls).
// Left: the list, grouped Needs reply / Probably done / Waiting on them.
// Right: the chat, call summaries, and a Claude draft. Nothing sends until Jude taps Send.
// Send / Done / Skip jump to the next thread.

// Auth token for nested pieces (call details) that call /api/quo.
const ApiContext = createContext(null);
const lastText = (t) => [...t.messages].reverse().find((m) => m.type !== 'call');
const lastCallOf = (t) => [...t.messages].reverse().find((m) => m.type === 'call');
// One-line "what happened last" for list rows.
function lastLine(t) {
  if (t.viaCall) { const k = lastCallOf(t); if (k) return callLabel(k, t.name || t.guessedName); }
  const m = lastText(t);
  const body = m?.text ? `"${m.text}"` : '📷 Photo';
  return m?.dir === 'outgoing' ? `You: ${m?.text || 'Photo'}` : body;
}

const HIDE_KEY = 'hub-quo-hidden'; // { [lastMessageId]: true }. A new text brings the thread back.

function readHidden() {
  try { return JSON.parse(localStorage.getItem(HIDE_KEY) || '{}'); } catch { return {}; }
}
function writeHidden(map) {
  try { localStorage.setItem(HIDE_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

// Draft a few threads at a time instead of firing every Claude call at once.
let running = 0;
const waiting = [];
async function queued(fn) {
  if (running >= 3) await new Promise((r) => waiting.push(r));
  running++;
  try { return await fn(); } finally { running--; waiting.shift()?.(); }
}

function ago(iso) {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function prettyPhone(p) {
  const d = String(p).replace(/\D/g, '').slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p;
}

// "Waiting on them" threads get a follow-up draft once our text is this old.
const FOLLOW_UP_DAYS = 2;
const daysSince = (iso) => (Date.now() - new Date(iso)) / 864e5;
const isStale = (t) => t.kind === 'waiting' && daysSince(t.lastAt) >= FOLLOW_UP_DAYS;

// Drafts are only made when Jude taps "Draft it for me", and kept per thread state
// (thread id + last activity) so a refresh never pays for the same draft twice.
const DRAFT_KEY = 'hub-quo-drafts';
const draftKey = (t) => `${t.id}:${t.lastMessageId}`;
function readDraftCache() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch { return {}; }
}
function saveDraft(t, value) {
  try {
    const all = readDraftCache();
    if (value) all[draftKey(t)] = value; else delete all[draftKey(t)];
    localStorage.setItem(DRAFT_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

// "Today 2:31 PM", "Yesterday 9:05 AM", "Mon 4:10 PM", "Nov 3, 11:20 AM"
function stamp(iso) {
  const d = new Date(iso), now = new Date();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const days = Math.floor((new Date(now.toDateString()) - new Date(d.toDateString())) / 864e5);
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Yesterday ${time}`;
  if (days < 7) return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${time}`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`;
}

const hasBlanks = (s) => /\[[^\]]+\]/.test(s || '');

// source: 'quo' (business line) or 'imessage' (Jude's own phone, via the Messages app on his Mac).
// Follow-up stats for one thread: what they want, how often they've reached out,
// how many times you've tried since they last answered, and a priority score.
const SERVICES = [
  ['🌲 Christmas lights', /christmas|lights?\b|holiday/i, 3],
  ['🍃 Leaves', /leaf|leaves|cleanup|clean up|blow/i, 2.5],
  ['🌱 Aeration', /aerat|overseed|seed/i, 2],
  ['🌳 Bushes', /bush|hedge|shrub|trim/i, 2],
  ['🌿 Mowing', /mow|lawn|grass|cut/i, 1.5],
];
function followStats(t) {
  const msgs = t.messages || [];
  // What they asked about: their own words first (your texts mention lights in the signature), then call summaries.
  const theirText = msgs.filter((m) => m.dir === 'incoming').map((m) => m.text || '').join(' ') + ' ' + (t.lastCall?.summary || []).join(' ');
  const svc = SERVICES.find(([, re]) => re.test(theirText));
  const theirs = msgs.filter((m) => m.dir === 'incoming');
  const lastTheirs = theirs.length ? new Date(theirs[theirs.length - 1].at) : new Date(0);
  const tries = msgs.filter((m) => m.dir === 'outgoing' && new Date(m.at) > lastTheirs).length;
  const days = Math.max(0, Math.floor((Date.now() - new Date(t.lastAt)) / 864e5));
  const score = (svc?.[2] || 1) * 2 + Math.min(theirs.length, 6) * 0.5 - tries * 0.8 - days * 0.05;
  return { service: svc?.[0] || null, theirs: theirs.length, tries, days, score, gaveUp: tries >= 4 };
}

export default function QuoTextsStep({ source = 'quo', mode = 'inbox' }) {
  const isIM = source === 'imessage';
  const base = isIM ? '/api/imessage' : '/api/quo';
  const { session } = useAuth();
  const token = session?.access_token || '';
  const [state, setState] = useState({ loading: true, error: null, setup: false, threads: [], failed: 0 });
  const [hidden, setHidden] = useState(readHidden);
  const [handled, setHandled] = useState({}); // id → 'done'
  const [drafts, setDrafts] = useState({});   // id → { text, needsReply, loading, err }
  const [selectedId, setSelectedId] = useState(null);
  const [cleared, setCleared] = useState(0);  // sent + done this session
  const loadId = useRef(0);

  const api = useCallback(async (action, body) => {
    const r = await fetch(`${base}?action=${action}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(data.error || `Error ${r.status}`); e.setup = data.setup; throw e; }
    return data;
  }, [token]);

  const draftFor = useCallback(async (t) => {
    setDrafts((d) => ({ ...d, [t.id]: { ...(d[t.id] || {}), loading: true, err: null } }));
    try {
      const r = await queued(() => api('draft', { messages: t.messages, name: t.name || t.guessedName, kind: t.viaCall ? (t.kind === 'waiting' ? 'waiting' : 'call') : t.kind }));
      setDrafts((d) => ({ ...d, [t.id]: { text: r.draft || '', needsReply: r.needs_reply, loading: false, err: null } }));
      saveDraft(t, { text: r.draft || '', needsReply: r.needs_reply });
    } catch (e) {
      setDrafts((d) => ({ ...d, [t.id]: { ...(d[t.id] || {}), text: d[t.id]?.text || '', loading: false, err: e.message } }));
    }
  }, [api]);

  const load = useCallback(async () => {
    const id = ++loadId.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api('inbox');
      if (id !== loadId.current) return;
      const threads = data.threads || [];
      setState({ loading: false, error: null, setup: false, threads, failed: data.failed || 0 });
      // No auto-drafting. Bring back any drafts already made for these exact threads.
      const cache = readDraftCache();
      const keep = {};
      const restored = {};
      for (const t of threads) {
        const c = cache[draftKey(t)];
        if (c) { keep[draftKey(t)] = c; restored[t.id] = { ...c, loading: false, err: null }; }
      }
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(keep)); } catch { /* ignore */ }
      setDrafts(restored);
    } catch (e) {
      if (id !== loadId.current) return;
      setState((s) => ({ ...s, loading: false, error: e.message, setup: !!e.setup }));
    }
  }, [api]);

  useEffect(() => { if (token) load(); }, [token, load]);

  // Grouped list, in the order Jude works through it.
  const open = state.threads.filter((t) => !hidden[t.lastMessageId] && !handled[t.id]);
  const byRecent = (a, b) => new Date(b.lastAt) - new Date(a.lastAt);
  // Follow-up due: we texted/called last, 2–14 days ago, with no answer.
  const needsFollowUp = (t) => isStale(t) && daysSince(t.lastAt) <= 14;
  const groups = useMemo(() => {
    const reply = open.filter((t) => t.kind === 'reply' && drafts[t.id]?.needsReply !== false).sort(byRecent);
    const probablyDone = open.filter((t) => t.kind === 'reply' && drafts[t.id]?.needsReply === false).sort(byRecent);
    const followUp = open.filter((t) => needsFollowUp(t)).sort(byRecent);
    const waitingOn = open.filter((t) => t.kind === 'waiting' && !needsFollowUp(t)).sort(byRecent);
    // Follow-ups mode: everyone you're waiting on (last 30 days), best leads first.
    if (mode === 'followups') {
      const waiting = open.filter((t) => t.kind === 'waiting' && daysSince(t.lastAt) <= 30)
        .map((t) => ({ t, s: followStats(t) })).sort((a, b) => b.s.score - a.s.score);
      return [
        { key: 'followup', title: 'Follow up · best first', items: waiting.filter((x) => !x.s.gaveUp).map((x) => x.t) },
        { key: 'gaveup', title: 'Tried 4+ times · let go?', items: waiting.filter((x) => x.s.gaveUp).map((x) => x.t), bulk: true },
      ];
    }
    // Inbox mode: only what needs you now. Follow-ups live in their own step.
    void followUp; void waitingOn;
    return [
      { key: 'reply', title: 'Needs reply', items: reply },
      { key: 'done', title: 'Probably no reply needed', items: probablyDone, bulk: true },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.threads, hidden, handled, drafts]);
  const order = groups.flatMap((g) => g.items);
  const selected = order.find((t) => t.id === selectedId) || order[0] || null;

  // Move to the thread after `t` (or before it if it was last).
  const goNext = (t) => {
    const i = order.findIndex((x) => x.id === t.id);
    const next = order[i + 1] || order[i - 1] || null;
    setSelectedId(next?.id || null);
  };

  const markDone = (t, advance = true) => {
    if (advance) goNext(t);
    const next = { ...readHidden(), [t.lastMessageId]: true };
    setHidden(next); writeHidden(next);
    setHandled((h) => ({ ...h, [t.id]: 'done' }));
    setCleared((n) => n + 1);
    api('done', { conversationId: t.id }).catch((e) => setState((s) => ({ ...s, error: `Hidden here, but Quo didn't mark it done: ${e.message}` })));
  };

  // Sending keeps the thread open in Quo; here it moves to "Waiting on them".
  const sendTo = async (t, text) => {
    await api('send', isIM ? { chatGuid: t.chatGuid, content: text } : { phoneNumberId: t.phoneNumberId, to: t.phone, content: text });
    goNext(t);
    const sentMsg = { id: `sent-${Date.now()}`, dir: 'outgoing', text, media: [], at: new Date().toISOString() };
    setState((st) => ({ ...st, threads: st.threads.map((x) => x.id === t.id ? { ...x, kind: 'waiting', viaCall: false, lastAt: sentMsg.at, messages: [...x.messages, sentMsg] } : x) }));
    setDrafts((d) => ({ ...d, [t.id]: { text: '', loading: false } }));
    saveDraft(t, null);
    setCleared((n) => n + 1);
  };

  if (state.setup) {
    return (
      <section className="rounded-3xl border border-card-border bg-card p-5 sm:p-6">
        {isIM ? (
          <>
            <h2 className="text-lg font-black text-primary mb-2">Connect iMessage</h2>
            <ol className="text-sm text-primary space-y-1.5 list-decimal pl-5">
              <li>Open <b>System Settings → Privacy &amp; Security → Full Disk Access</b>.</li>
              <li>Turn on <b>Terminal</b> (add it with + if it's not listed).</li>
              <li>Tell Claude to restart the Hub server, then hit Refresh.</li>
            </ol>
            <p className="text-xs text-muted mt-2">{state.error}</p>
          </>
        ) : (
          <>
            <h2 className="text-lg font-black text-primary mb-2">Connect Quo</h2>
            <p className="text-sm text-primary">Add <code className="bg-surface-alt px-1.5 py-0.5 rounded">QUO_API_KEY</code> to the Hub server, restart it, then refresh.</p>
          </>
        )}
        <button onClick={load} className="mt-4 inline-flex items-center gap-1.5 text-sm font-black text-brand bg-brand/10 hover:bg-brand/15 px-3 py-2 rounded-2xl cursor-pointer">
          <RefreshCw size={14} /> Refresh
        </button>
      </section>
    );
  }

  const replyCount = groups[0].items.length;

  return (
    <ApiContext.Provider value={token}>
    <section className="border-y border-card-border bg-card overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-[250px_1fr] md:h-[calc(100vh-210px)] md:min-h-[420px]">

        {/* ── Left: the list ── */}
        <aside className="min-w-0 border-b md:border-b-0 md:border-r border-card-border flex flex-col min-h-0 max-h-72 md:max-h-none">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-card-border">
            <p className="text-sm font-black text-primary flex-1">
              {state.loading ? 'Checking Quo…' : mode === 'followups' ? `${order.length} to follow up` : replyCount ? `${replyCount} to reply` : 'All replied'}
              {cleared > 0 && <span className="text-muted font-bold"> · {cleared} cleared</span>}
            </p>
            <button onClick={load} disabled={state.loading} title="Check for new texts"
              className="text-muted hover:text-primary p-1 rounded-lg hover:bg-surface-alt cursor-pointer disabled:opacity-40">
              <RefreshCw size={14} className={state.loading ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {groups.map((g) => g.items.length > 0 && (
              <div key={g.key}>
                <div className="sticky top-0 z-[1] bg-card flex items-center justify-between px-4 pt-3 pb-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.15em] text-muted">{g.title} · {g.items.length}</p>
                  {g.bulk && (
                    <button onClick={() => g.items.forEach((t) => markDone(t, false))}
                      className="inline-flex items-center gap-1 text-[10px] font-black text-brand hover:underline cursor-pointer">
                      <CheckCheck size={11} /> Mark all done
                    </button>
                  )}
                </div>
                {g.items.map((t) => (
                  <ListRow key={t.id} t={t} stats={mode === 'followups' ? followStats(t) : null} active={selected?.id === t.id} followUp={mode !== 'followups' && needsFollowUp(t)}
                    drafting={drafts[t.id]?.loading} onClick={() => setSelectedId(t.id)} />
                ))}
              </div>
            ))}
            {!state.loading && order.length === 0 && (
              <div className="p-6 text-center">
                <Check size={24} className="mx-auto mb-2 text-emerald-400" />
                <p className="text-sm font-black text-primary">Quo inbox is clear.</p>
              </div>
            )}
          </div>
        </aside>

        {/* ── Right: the selected thread ── */}
        <div className="min-h-0 min-w-0 flex flex-col">
          {state.error && <p className="text-sm font-bold text-rose-400 px-5 pt-3">{state.error}</p>}
          {selected ? (
            <ThreadPane key={selected.id} t={selected} isIM={isIM} followUp={needsFollowUp(selected)}
              draft={drafts[selected.id]}
              setText={(text) => {
                setDrafts((d) => ({ ...d, [selected.id]: { ...(d[selected.id] || {}), text } }));
                saveDraft(selected, { ...(drafts[selected.id] || {}), text, loading: undefined, err: undefined });
              }}
              onRedraft={() => draftFor(selected)}
              onSend={(text) => sendTo(selected, text)}
              onDone={() => markDone(selected)}
              onSkip={order.length > 1 ? () => goNext(selected) : null} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-muted">
              <Inbox size={28} className="mb-2" />
              <p className="text-sm font-bold">{state.loading ? 'Loading your Quo inbox…' : 'Nothing open. Hit Done & Next below.'}</p>
            </div>
          )}
        </div>
      </div>
    </section>
    </ApiContext.Provider>
  );
}

function ListRow({ t, stats, active, followUp, drafting, onClick }) {
  const isCall = t.viaCall;
  return (
    <button onClick={onClick}
      className={`w-full text-left px-4 py-2.5 border-l-4 cursor-pointer ${active ? 'bg-surface-alt border-brand' : 'border-transparent hover:bg-surface-alt/60'}`}>
      <div className="flex items-baseline gap-2">
        <p className="flex-1 min-w-0 text-sm font-bold text-primary truncate">
          {t.name || t.guessedName || prettyPhone(t.phone)}
          {!t.name && t.guessedName && <span className="ml-1 text-[9px] font-black uppercase text-muted">guess</span>}
        </p>
        <span className="shrink-0 text-[11px] text-muted">{ago(t.lastAt).replace(' ago', '')}</span>
      </div>
      <p className="text-xs text-muted truncate">
        {followUp && <span className="font-black text-amber-400">Follow-up · </span>}
        {isCall && '📞 '}{lastLine(t)}
      </p>
      {stats && (
        <p className="mt-0.5 text-[11px] text-muted">
          {stats.service && <span className="mr-1 rounded bg-brand/15 px-1.5 py-px font-bold text-brand-text">{stats.service}</span>}
          they reached out {stats.theirs}× · <b className={stats.tries >= 3 ? 'text-amber-500' : ''}>you tried {stats.tries}×</b> · {stats.days}d
        </p>
      )}
      {drafting && <p className="text-[10px] text-brand font-bold mt-0.5">Drafting…</p>}
    </button>
  );
}

function ThreadPane({ t, isIM, followUp, draft, setText, onRedraft, onSend, onDone, onSkip }) {
  const scroller = useRef(null);
  // Start at the newest message, like a chat app.
  useEffect(() => { const el = scroller.current; if (el) el.scrollTop = el.scrollHeight; }, [t.id]);

  return (
    <>
      {/* Who */}
      <div className="flex items-start justify-between gap-3 px-5 py-3 border-b border-card-border">
        <div className="min-w-0">
          <p className="text-lg font-black text-primary truncate">
            {t.name || t.guessedName || prettyPhone(t.phone)}
            {!t.name && t.guessedName && <span className="ml-2 text-[10px] font-black uppercase tracking-wider text-muted align-middle">guess</span>}
            {!t.isClient && !t.isContact && !t.guessedName && <span className="ml-2 text-[10px] font-black uppercase tracking-wider text-amber-400 align-middle">new number</span>}
          </p>
          <p className="text-xs text-muted">
            {(t.name || t.guessedName) ? `${prettyPhone(t.phone)} · ` : ''}
            {followUp
              ? <span className="font-black text-amber-400">Follow-up · no reply in {Math.floor(daysSince(t.lastAt))} days</span>
              : t.kind === 'waiting' ? `Waiting on them · ${ago(t.lastAt)}` : ago(t.lastAt)}
          </p>
        </div>
        <a href={isIM ? `sms:${t.phone}` : `openphone://message?number=${encodeURIComponent(t.phone)}`} title={isIM ? 'Open in Messages' : 'Open in Quo'}
          className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-muted hover:text-primary px-2 py-1 rounded-lg hover:bg-surface-alt">
          <ExternalLink size={12} /> {isIM ? 'Messages' : 'Quo'}
        </a>
      </div>

      {/* Chat (scrolls) */}
      <div ref={scroller} className="flex-1 min-h-[200px] overflow-y-auto px-5 py-4">
        <Conversation messages={t.messages} initial={30} />
        {t.viaCall && t.lastCall?.summary?.length > 0 && (
          <div className="mt-3 rounded-2xl bg-surface-alt p-3 text-sm text-primary">
            <p className="text-[10px] font-black uppercase tracking-wider text-muted mb-1">📞 Last call summary</p>
            <ul className="list-disc pl-5 space-y-0.5">{t.lastCall.summary.map((x, i) => <li key={i}>{x}</li>)}</ul>
            {t.lastCall.nextSteps?.length > 0 && (
              <>
                <p className="text-[10px] font-black uppercase tracking-wider text-amber-400 mt-2 mb-1">Next steps</p>
                <ul className="list-disc pl-5 space-y-0.5">{t.lastCall.nextSteps.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </>
            )}
          </div>
        )}
      </div>

      {/* Reply box + actions (always visible) */}
      <div className="border-t border-card-border px-5 py-3">
        <Composer draft={draft} setText={setText} onRedraft={onRedraft} onSend={onSend}
          placeholder={t.kind === 'waiting' ? 'Type a follow-up' : 'Type your reply'}>
          <button onClick={onDone} title={isIM ? 'Hide it until they text again. Nothing is sent.' : 'Mark done in Quo. Nothing is sent.'}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl hover:bg-surface-alt hover:text-emerald-400 cursor-pointer">
            <Check size={13} /> Done
          </button>
          {onSkip && (
            <button onClick={onSkip} title="Leave it open and go to the next one"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl hover:bg-surface-alt hover:text-primary cursor-pointer">
              <SkipForward size={13} /> Skip
            </button>
          )}
        </Composer>
      </div>
    </>
  );
}

function fmtDur(sec) {
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return m ? `${m}m ${s}s` : `${s}s`;
}
const isMissed = (k) => !k.duration && k.dir === 'incoming';
function callLabel(k, name) {
  if (isMissed(k)) return 'Missed call';
  return `${k.dir === 'incoming' ? `${name ? name.split(' ')[0] : 'They'} called` : 'You called'} · ${fmtDur(k.duration)}`;
}

// A call in the timeline. Tap to load Quo's AI summary, next steps, voicemail and transcript.
function CallItem({ call: k }) {
  const token = useContext(ApiContext);
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const Icon = isMissed(k) ? PhoneMissed : k.dir === 'incoming' ? PhoneIncoming : PhoneOutgoing;

  const toggle = async () => {
    setOpen((o) => !o);
    if (info) return;
    try {
      const r = await fetch(`/api/quo?action=call&id=${encodeURIComponent(k.id)}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
      setInfo(d);
    } catch (e) { setErr(e.message); }
  };

  return (
    <div className="flex flex-col items-center my-1">
      <button onClick={toggle}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-primary bg-surface-alt border border-card-border rounded-full px-3 py-1.5 hover:border-brand cursor-pointer">
        <Icon size={13} className={isMissed(k) ? 'text-rose-400' : 'text-brand'} />
        {callLabel(k)} · {stamp(k.at)}
        <ChevronDown size={12} className={`text-muted transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && (
        <div className="mt-2 w-full max-w-[95%] rounded-2xl border border-card-border bg-card p-3 text-sm text-primary">
          {!info && !err && <p className="text-xs text-muted">Loading call…</p>}
          {err && <p className="text-xs font-bold text-rose-400">{err}</p>}
          {info && (
            <>
              {info.voicemail && (
                <div className="mb-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted mb-1 inline-flex items-center gap-1"><Voicemail size={11} /> Voicemail</p>
                  <p className="italic">"{info.voicemail.transcript || 'No transcript'}"</p>
                  {info.voicemail.url && <a href={info.voicemail.url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-brand underline">Play voicemail</a>}
                </div>
              )}
              {info.summary.length > 0 ? (
                <>
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted mb-1">AI summary</p>
                  <ul className="list-disc pl-5 space-y-0.5">{info.summary.map((x, i) => <li key={i}>{x}</li>)}</ul>
                </>
              ) : !info.voicemail && <p className="text-xs text-muted">No summary for this call.</p>}
              {info.nextSteps.length > 0 && (
                <>
                  <p className="text-[10px] font-black uppercase tracking-wider text-amber-400 mt-2 mb-1">Next steps</p>
                  <ul className="list-disc pl-5 space-y-0.5">{info.nextSteps.map((x, i) => <li key={i}>{x}</li>)}</ul>
                </>
              )}
              {info.transcript.length > 0 && (
                <>
                  <button onClick={() => setShowTranscript((v) => !v)} className="mt-2 text-xs font-bold text-muted hover:text-primary cursor-pointer">
                    {showTranscript ? 'Hide transcript' : 'Show full transcript'}
                  </button>
                  {showTranscript && (
                    <div className="mt-2 max-h-72 overflow-y-auto space-y-1 pr-1">
                      {info.transcript.map((d, i) => (
                        <p key={i} className="text-xs"><span className={`font-black ${d.jude ? 'text-sky-400' : 'text-primary'}`}>{d.jude ? 'You' : 'Them'}:</span> {d.text}</p>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// A text thread as chat bubbles. Shows the last `initial` messages, with a tap to see the rest.
// Full-screen photo on the same page. Click anywhere or press Esc to close.
function PhotoViewer({ url, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out">
      <img src={url} alt="Photo" className="max-w-full max-h-full object-contain rounded-xl shadow-2xl" />
      <span className="absolute top-4 right-5 text-white/80 text-sm font-bold">Esc or click to close</span>
    </div>
  );
}

function Conversation({ messages, initial = 2 }) {
  const [showAll, setShowAll] = useState(false);
  const [photo, setPhoto] = useState(null); // full-screen photo viewer
  if (!messages.length) return <p className="text-xs text-muted">Nothing in this thread yet.</p>;
  const shown = showAll ? messages : messages.slice(-initial);
  return (
    <>
    {photo && <PhotoViewer url={photo} onClose={() => setPhoto(null)} />}
    <>
        {messages.length > initial && !showAll && (
          <button onClick={() => setShowAll(true)} className="mb-2 text-xs font-bold text-muted hover:text-primary inline-flex items-center gap-1 cursor-pointer">
            <ChevronDown size={12} /> Earlier messages ({messages.length - initial})
          </button>
        )}
        <div className={`space-y-1.5 ${showAll ? 'max-h-80 overflow-y-auto pr-1' : ''}`}>
          {shown.map((m) => m.type === 'call' ? <CallItem key={m.id} call={m} /> : (
            <div key={m.id} className={`flex flex-col ${m.dir === 'incoming' ? 'items-start' : 'items-end'}`}>
              <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
                m.dir === 'incoming' ? 'bg-surface-alt text-primary rounded-bl-md' : 'bg-sky-600/70 text-white rounded-br-md'
              }`}>
                {m.text}
                {Array.isArray(m.media) && m.media.length > 0 && (
                  <div className={`flex flex-wrap gap-1.5 ${m.text ? 'mt-2' : ''}`}>
                    {m.media.map((x, i) => (/^image\//.test(x.type) || !x.type) ? (
                      <button key={i} onClick={() => setPhoto(x.url)} className="cursor-zoom-in">
                        <img src={x.url} alt="Photo" loading="lazy" className="h-28 w-28 object-cover rounded-xl" />
                      </button>
                    ) : (
                      <a key={i} href={x.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs underline">
                        <ImageIcon size={11} /> Attachment
                      </a>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-[10px] text-muted mt-0.5 px-1">{m.dir === 'outgoing' ? 'You · ' : ''}{stamp(m.at)}</span>
            </div>
          ))}
        </div>
    </>
    </>
  );
}

// Text box + Send + New draft. Used by the main queue card and inside opened list rows.
export function Composer({ draft, setText, onRedraft, onSend, placeholder = 'Type your reply', compact = false, children }) {
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState(null);
  const text = draft?.text || '';
  const loading = !!draft?.loading;
  const canSend = text.trim() && !sending && !loading && !hasBlanks(text);

  const send = async () => {
    if (!canSend) return;
    setSending(true); setErr(null);
    try { await onSend(text.trim()); } catch (e) { setErr(e.message); setSending(false); }
  };

  return (
    <>
      <div className="relative">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
          placeholder={loading ? 'Writing a draft…' : placeholder}
          rows={3}
          className={`w-full bg-surface-alt border-2 border-brand/40 focus:border-brand rounded-2xl px-4 py-3 ${compact ? 'text-sm' : 'text-base'} text-primary outline-none resize-none`}
        />
        {loading && <Sparkles size={16} className="absolute right-3 top-3 text-brand animate-pulse" />}
      </div>
      {hasBlanks(text) && <p className="text-xs font-bold text-amber-400 mt-1">Fill in the [brackets] first.</p>}
      {draft && draft.needsReply === false && !text && !loading && <p className="text-xs font-bold text-emerald-400 mt-1">Claude doesn't think this needs a text. Type one if you want.</p>}
      {(err || draft?.err) && <p className="text-xs font-bold text-rose-400 mt-1">{err || draft.err}</p>}

      {compact ? (
        <div className="flex items-center gap-2 mt-2">
          <button onClick={send} disabled={!canSend}
            className="inline-flex items-center gap-1.5 bg-brand text-black font-black text-sm px-4 py-2 rounded-xl hover:brightness-110 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
            <Send size={14} /> {sending ? 'Sending…' : 'Send'}
          </button>
          <button onClick={onRedraft} disabled={loading} className="inline-flex items-center gap-1 text-sm font-bold text-muted px-3 py-2 rounded-xl hover:bg-surface-alt hover:text-primary cursor-pointer disabled:opacity-40">
            <Sparkles size={13} /> {draft ? 'New draft' : 'Draft it for me'}
          </button>
          {children}
        </div>
      ) : (
        <>
          <button onClick={send} disabled={!canSend}
            className="mt-2 w-full inline-flex items-center justify-center gap-2 bg-brand text-black font-black text-base py-2.5 rounded-2xl hover:brightness-110 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
            <Send size={16} /> {sending ? 'Sending…' : 'Send'}
          </button>
          <div className="flex items-center justify-center gap-1 mt-2 text-sm font-bold text-muted">
            <button onClick={onRedraft} disabled={loading}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl cursor-pointer disabled:opacity-40 ${
                draft ? 'hover:bg-surface-alt hover:text-primary' : 'text-brand bg-brand/10 hover:bg-brand/15'
              }`}>
              <Sparkles size={13} /> {loading ? 'Drafting…' : draft ? 'New AI draft' : 'Draft with AI'}
            </button>
            {children}
          </div>
        </>
      )}
    </>
  );
}
