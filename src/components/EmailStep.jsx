import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Check, CheckCheck, SkipForward, Archive, Inbox, Mail, Plus, ExternalLink, ChevronDown, Trash2 } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Composer } from './QuoTextsStep';

// Work email step: a Gmail inbox laid out like the Quo texts inbox.
// Left: Needs reply / Suggest archive / You replied last. Right: the thread + reply box.
// Archive suggestions come from Gmail's own categories and headers (no AI).
// AI drafts only happen when Jude taps "Draft with AI". Nothing sends until he taps Send.

const DRAFT_KEY = 'hub-gmail-drafts';
const ACCT_KEY = 'hub-gmail-account';
const draftKey = (t) => `${t.id}:${t.at}`;
function readDrafts() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch { return {}; } }
function saveDraft(t, value) {
  try {
    const all = readDrafts();
    if (value) all[draftKey(t)] = value; else delete all[draftKey(t)];
    localStorage.setItem(DRAFT_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

function ago(iso) {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}
function stamp(iso) {
  const d = new Date(iso), now = new Date();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const days = Math.floor((new Date(now.toDateString()) - new Date(d.toDateString())) / 864e5);
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Yesterday ${time}`;
  if (days < 7) return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${time}`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`;
}

export default function EmailStep({ scope = 'work' }) {
  const personal = scope === 'personal';
  const { session } = useAuth();
  const token = session?.access_token || '';
  const location = useLocation();
  const [accounts, setAccounts] = useState(null);
  const acctKey = `${ACCT_KEY}-${scope}`;
  const [account, setAccount] = useState(() => { try { return localStorage.getItem(acctKey) || ''; } catch { return ''; } });
  const [state, setState] = useState({ loading: false, error: null, setup: false, reconnect: false, threads: [] });
  const [selectedId, setSelectedId] = useState(null);
  const [threadCache, setThreadCache] = useState({}); // id → { loading, messages, error }
  const [drafts, setDrafts] = useState({});
  const [gone, setGone] = useState({}); // archived / sent this session
  const [undo, setUndo] = useState(null); // { ids, label }
  const [cleared, setCleared] = useState(0);
  const [notice, setNotice] = useState(() => new URLSearchParams(location.search).get('gmail'));
  const loadId = useRef(0);

  const api = useCallback(async (action, { query = {}, body } = {}) => {
    const qs = new URLSearchParams({ action, ...query }).toString();
    const r = await fetch(`/api/gmail?${qs}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(data.error || `Error ${r.status}`), { setup: data.setup, reconnect: data.reconnect });
    return data;
  }, [token]);

  // Connected inboxes
  useEffect(() => {
    if (!token) return;
    api('accounts').then((d) => {
      // Work step: Google sign-in inboxes. Personal step: the app-password inbox.
      const mine = (d.accounts || []).filter((x) => (personal ? x.kind === 'imap' : x.kind !== 'imap'));
      setAccounts(mine);
      setAccount((a) => (mine.some((x) => x.email === a) ? a : mine[0]?.email || ''));
    }).catch((e) => { setAccounts([]); setState((s) => ({ ...s, error: e.message, setup: !!e.setup })); });
  }, [token, api]);

  useEffect(() => { try { if (account) localStorage.setItem(acctKey, account); } catch { /* ignore */ } }, [account, acctKey]);

  const load = useCallback(async () => {
    if (!account) return;
    const id = ++loadId.current;
    // Last inbox for this account (this browser): show it instantly, then refresh in the background.
    const cacheKey = `hub-inbox-cache-${account}`;
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(cacheKey) || 'null'); } catch { /* ignore */ }
    setState((s) => ({ ...s, loading: true, error: null, reconnect: false, ...(cached?.threads && !s.threads.length ? { threads: cached.threads, tags: cached.tags || [] } : {}) }));
    try {
      const d = await api('inbox', { query: { account } });
      if (id !== loadId.current) return;
      setState({ loading: false, error: null, setup: false, reconnect: false, threads: d.threads || [], tags: d.tags || [] });
      try { localStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), threads: d.threads || [], tags: d.tags || [] })); } catch { /* full or blocked */ }
      const cache = readDrafts();
      const restored = {};
      for (const t of d.threads || []) { const c = cache[draftKey(t)]; if (c) restored[t.id] = { ...c, loading: false }; }
      setDrafts(restored);
      setGone({});
    } catch (e) {
      if (id !== loadId.current) return;
      setState((s) => ({ ...s, loading: false, error: e.message, setup: !!e.setup, reconnect: !!e.reconnect }));
    }
  }, [api, account]);

  useEffect(() => { load(); setSelectedId(null); setThreadCache({}); }, [load]);

  const connect = async () => {
    try {
      const { url } = await api('connect', { query: { returnTo: location.pathname } });
      window.location.href = url;
    } catch (e) { setState((s) => ({ ...s, error: e.message, setup: !!e.setup })); }
  };

  // Groups
  const open = state.threads.filter((t) => !gone[t.id]);
  const groups = useMemo(() => [
    { key: 'reply', title: 'Needs reply', items: open.filter((t) => t.bucket === 'reply' && drafts[t.id]?.needsReply !== false) },
    { key: 'money', title: 'Bills & money', items: open.filter((t) => t.bucket === 'money') },
    { key: 'archive', title: 'Suggest archive', items: open.filter((t) => t.bucket === 'archive' || (t.bucket === 'reply' && drafts[t.id]?.needsReply === false)), bulk: true },
    { key: 'waiting', title: 'You replied last', items: open.filter((t) => t.bucket === 'waiting') },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [state.threads, gone, drafts]);
  const order = groups.flatMap((g) => g.items);
  const selected = order.find((t) => t.id === selectedId) || order[0] || null;

  // Load the full thread when one is selected
  useEffect(() => {
    if (!selected || threadCache[selected.id]) return;
    const id = selected.id;
    setThreadCache((c) => ({ ...c, [id]: { loading: true } }));
    api('thread', { query: { account, id } })
      .then((d) => setThreadCache((c) => ({ ...c, [id]: { messages: d.messages } })))
      .catch((e) => setThreadCache((c) => ({ ...c, [id]: { error: e.message } })));
  }, [selected, threadCache, api, account]);

  const goNext = (t) => {
    const i = order.findIndex((x) => x.id === t.id);
    setSelectedId((order[i + 1] || order[i - 1] || null)?.id || null);
  };

  const archive = async (list, label, how = 'archive') => {
    if (list.length === 1) goNext(list[0]);
    setGone((g) => ({ ...g, ...Object.fromEntries(list.map((t) => [t.id, how === 'trash' ? 'deleted' : 'archived'])) }));
    setCleared((n) => n + list.length);
    setUndo({ ids: list.map((t) => t.id), label, how });
    try { await api(how, { body: { account, ids: list.map((t) => t.id) } }); }
    catch (e) { setState((s) => ({ ...s, error: `${how === 'trash' ? 'Delete' : 'Archive'} failed: ${e.message}` })); }
  };
  const undoArchive = async () => {
    const u = undo; setUndo(null);
    if (!u) return;
    setGone((g) => { const n = { ...g }; u.ids.forEach((id) => delete n[id]); return n; });
    setCleared((n) => Math.max(0, n - u.ids.length));
    try { await api(u.how === 'trash' ? 'untrash' : 'unarchive', { body: { account, ids: u.ids } }); }
    catch (e) { setState((s) => ({ ...s, error: `Undo failed: ${e.message}` })); }
  };
  useEffect(() => { if (!undo) return; const t = setTimeout(() => setUndo(null), 8000); return () => clearTimeout(t); }, [undo]);

  // Your Gmail labels: tap to add / remove (the suggested one is highlighted).
  const toggleTag = async (t, name) => {
    const has = (t.tags || []).includes(name);
    setState((s) => ({ ...s, threads: s.threads.map((x) => (x.id === t.id ? { ...x, tags: has ? (x.tags || []).filter((n) => n !== name) : [...(x.tags || []), name] } : x)) }));
    try { await api('tag', { body: { account, ids: [t.id], name, remove: has } }); }
    catch (e) { setState((s) => ({ ...s, error: `Label failed: ${e.message}` })); }
  };

  const draftFor = async (t) => {
    const msgs = threadCache[t.id]?.messages;
    if (!msgs) return;
    setDrafts((d) => ({ ...d, [t.id]: { ...(d[t.id] || {}), loading: true, err: null } }));
    try {
      const r = await api('draft', { body: { account, messages: msgs } });
      const value = { text: r.draft || '', needsReply: r.needs_reply };
      setDrafts((d) => ({ ...d, [t.id]: { ...value, loading: false } }));
      saveDraft(t, value);
    } catch (e) {
      setDrafts((d) => ({ ...d, [t.id]: { ...(d[t.id] || {}), loading: false, err: e.message } }));
    }
  };

  const send = async (t, text) => {
    const msgs = threadCache[t.id]?.messages || [];
    const theirs = [...msgs].reverse().find((m) => !m.mine);
    const last = msgs[msgs.length - 1];
    const to = theirs ? theirs.from : last?.to;
    if (!to) throw new Error('Could not tell who to reply to.');
    await api('send', { body: {
      account, threadId: t.id, to,
      subject: last?.subject || t.subject,
      inReplyTo: last?.messageId || '', references: last?.references || '',
      content: text,
    } });
    goNext(t);
    saveDraft(t, null);
    setDrafts((d) => ({ ...d, [t.id]: { text: '', loading: false } }));
    setGone((g) => ({ ...g, [t.id]: 'sent' }));
    setCleared((n) => n + 1);
  };

  /* ── states before the inbox ── */
  if (state.setup) {
    return (
      <Card>
        <h2 className="text-lg font-black text-primary mb-2">Set up Gmail</h2>
        <p className="text-sm text-primary">{state.error}</p>
        <p className="text-sm text-muted mt-2">Add the Google keys to the Hub server, restart it, then reload this page.</p>
      </Card>
    );
  }
  if (accounts === null) return <Card><p className="text-sm text-muted">Loading…</p></Card>;
  if (accounts.length === 0 && personal) {
    return (
      <Card>
        <Mail size={28} className="text-brand mb-2" />
        <h2 className="text-lg font-black text-primary mb-1">Connect your personal Gmail</h2>
        <ol className="text-sm text-primary space-y-1.5 list-decimal pl-5 mt-2">
          <li>Go to <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="text-brand underline">myaccount.google.com/apppasswords</a> (signed in to your personal Gmail).</li>
          <li>Name it <b>Hub</b> → Create. Google shows a 16-letter password.</li>
          <li>Paste it into <code className="bg-surface-alt px-1.5 py-0.5 rounded">hub/.env.local</code> over <code className="bg-surface-alt px-1.5 py-0.5 rounded">PUTAPPPASSWORDHERE</code>, save, and tell Claude to restart the server.</li>
        </ol>
        <p className="text-xs text-muted mt-3">If Google says app passwords aren't available, turn on 2-Step Verification for that account first.</p>
      </Card>
    );
  }
  if (accounts.length === 0) {
    return (
      <Card>
        <Mail size={28} className="text-brand mb-2" />
        <h2 className="text-lg font-black text-primary mb-1">Connect your work inbox</h2>
        <p className="text-sm text-muted mb-4">Sign in with Google once. The Hub can then show your inbox, archive, and send replies you approve.</p>
        {notice && <p className="text-sm font-bold text-amber-400 mb-3">{notice}</p>}
        {state.error && <p className="text-sm font-bold text-rose-400 mb-3">{state.error}</p>}
        <button onClick={connect} className="inline-flex items-center gap-2 bg-brand text-black font-black px-5 py-2.5 rounded-2xl hover:brightness-110 cursor-pointer">
          <Mail size={16} /> Connect Gmail
        </button>
      </Card>
    );
  }

  const replyCount = groups[0].items.length;
  const th = selected ? threadCache[selected.id] : null;

  return (
    <section className="border-y border-card-border bg-card overflow-hidden relative">
      {/* Account bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-card-border overflow-x-auto">
        {accounts.map((a) => (
          <button key={a.email} onClick={() => setAccount(a.email)}
            className={`shrink-0 text-xs font-bold px-3 py-1 rounded-full cursor-pointer ${a.email === account ? 'bg-primary text-card' : 'text-muted hover:bg-surface-alt'}`}>
            {a.email}
          </button>
        ))}
        {!personal && <button onClick={connect} title="Connect another inbox" className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-muted hover:text-primary px-2 py-1 rounded-full hover:bg-surface-alt cursor-pointer">
          <Plus size={12} /> Inbox
        </button>}
        {notice && <span className="text-xs font-bold text-amber-400 ml-2">{notice} <button onClick={() => setNotice(null)} className="underline cursor-pointer">ok</button></span>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] md:h-[calc(100vh-210px)] md:min-h-[420px]">
        {/* Left: list */}
        <aside className="min-w-0 border-b md:border-b-0 md:border-r border-card-border flex flex-col min-h-0 max-h-72 md:max-h-none">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-card-border">
            <p className="text-sm font-black text-primary flex-1">
              {state.loading && !state.threads.length ? 'Checking Gmail…' : replyCount ? `${replyCount} to reply` : 'All replied'}
              {cleared > 0 && <span className="text-muted font-bold"> · {cleared} cleared</span>}
            </p>
            <button onClick={load} disabled={state.loading} title="Check for new email"
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
                    <button onClick={() => archive(g.items, `${g.items.length} archived`)}
                      className="inline-flex items-center gap-1 text-[10px] font-black text-brand hover:underline cursor-pointer">
                      <CheckCheck size={11} /> Archive all
                    </button>
                  )}
                </div>
                {g.items.map((t) => (
                  <button key={t.id} onClick={() => setSelectedId(t.id)}
                    className={`w-full text-left px-4 py-2.5 border-l-4 cursor-pointer ${selected?.id === t.id ? 'bg-surface-alt border-brand' : 'border-transparent hover:bg-surface-alt/60'}`}>
                    <div className="flex items-baseline gap-2">
                      <p className={`flex-1 min-w-0 text-sm truncate ${t.unread ? 'font-black text-primary' : 'font-bold text-primary/90'}`}>
                        {g.key === 'waiting' ? `To ${t.contact}` : t.fromName}
                        {t.count > 1 && <span className="ml-1 text-[10px] text-muted font-bold">{t.count}</span>}
                      </p>
                      <span className="shrink-0 text-[11px] text-muted">{ago(t.at)}</span>
                    </div>
                    <p className="text-xs text-primary/80 truncate">{(t.tags || []).length > 0 && <span className="mr-1 rounded bg-surface-alt px-1 py-px text-[10px] font-bold text-muted">{t.tags[0]}</span>}{t.subject}</p>
                    <p className="text-xs text-muted truncate">{t.snippet}</p>
                  </button>
                ))}
              </div>
            ))}
            {!state.loading && order.length === 0 && !state.error && (
              <div className="p-6 text-center">
                <Check size={24} className="mx-auto mb-2 text-emerald-400" />
                <p className="text-sm font-black text-primary">Inbox zero.</p>
              </div>
            )}
          </div>
        </aside>

        {/* Right: thread */}
        <div className="min-h-0 min-w-0 flex flex-col">
          {state.error && (
            <div className="px-5 pt-3">
              <p className="text-sm font-bold text-rose-400">{state.error}</p>
              {state.reconnect && <button onClick={connect} className="mt-1 text-sm font-black text-brand underline cursor-pointer">Connect again</button>}
            </div>
          )}
          {selected ? (
            <EmailPane key={selected.id} t={selected} th={th} account={account} tags={state.tags || []} onTag={(name) => toggleTag(selected, name)}
              draft={drafts[selected.id]}
              setText={(text) => {
                setDrafts((d) => ({ ...d, [selected.id]: { ...(d[selected.id] || {}), text } }));
                saveDraft(selected, { text, needsReply: drafts[selected.id]?.needsReply });
              }}
              onRedraft={() => draftFor(selected)}
              onSend={(text) => send(selected, text)}
              onArchive={() => archive([selected], 'Archived')}
              onDelete={() => archive([selected], 'Deleted (in Trash 30 days)', 'trash')}
              onSkip={order.length > 1 ? () => goNext(selected) : null} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-muted">
              <Inbox size={28} className="mb-2" />
              <p className="text-sm font-bold">{state.loading ? 'Loading your inbox…' : 'Nothing left. Hit Done & Next below.'}</p>
            </div>
          )}
        </div>
      </div>

      {undo && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 bg-primary text-card text-sm font-bold px-4 py-2 rounded-2xl shadow-xl">
          {undo.label}
          <button onClick={undoArchive} className="font-black underline cursor-pointer">Undo</button>
        </div>
      )}
    </section>
  );
}

function Card({ children }) {
  return <section className="rounded-3xl border border-card-border bg-card p-5 sm:p-6">{children}</section>;
}

function EmailPane({ t, th, account, tags = [], onTag, draft, setText, onRedraft, onSend, onArchive, onDelete, onSkip }) {
  const scroller = useRef(null);
  const [expanded, setExpanded] = useState({});
  useEffect(() => { const el = scroller.current; if (el) el.scrollTop = el.scrollHeight; }, [th?.messages?.length]);
  const msgs = th?.messages || [];
  const gmailLink = `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(account)}#all/${t.id}`;

  return (
    <>
      <div className="flex items-start justify-between gap-3 px-5 py-3 border-b border-card-border">
        <div className="min-w-0">
          <p className="text-lg font-black text-primary leading-snug">{t.subject}</p>
          <p className="text-xs text-muted">{t.bucket === 'waiting' ? `You replied last · ${t.contact}` : t.fromName} · {stamp(t.at)}</p>
          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {tags.map((name) => {
                const on = (t.tags || []).includes(name);
                const sug = !on && t.suggest === name;
                return (
                  <button key={name} onClick={() => onTag?.(name)} title={on ? 'Remove this Gmail label' : sug ? 'Suggested: tap to add this Gmail label' : 'Add this Gmail label'}
                    className={`rounded-full px-2.5 py-1 text-xs font-bold cursor-pointer border ${on ? 'bg-black text-white border-black dark:bg-white dark:text-black dark:border-white' : sug ? 'border-brand text-brand-text bg-brand/10 ring-2 ring-brand/30' : 'border-card-border text-muted hover:text-primary'}`}>
                    {on ? '✓ ' : sug ? '✨ ' : ''}{name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          <button onClick={onArchive} title="Archive in Gmail (still in All Mail). Nothing is sent."
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-bold text-white hover:bg-emerald-700 cursor-pointer">
            <Archive size={15} /> Archive
          </button>
          <button onClick={onDelete} title="Delete: moves it to Gmail's Trash (gone for good after 30 days). Undo right after."
            className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 dark:border-red-500/40 px-3 py-2 text-sm font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 cursor-pointer">
            <Trash2 size={15} /> Delete
          </button>
          <a href={gmailLink} target="_blank" rel="noopener noreferrer" title="Open in Gmail (to delete, etc.)"
            className="inline-flex items-center gap-1 text-xs font-bold text-muted hover:text-primary px-2 py-2 rounded-lg hover:bg-surface-alt">
            <ExternalLink size={12} /> Gmail
          </a>
        </div>
      </div>

      <div ref={scroller} className="flex-1 min-h-[200px] overflow-y-auto px-5 py-4 space-y-3">
        {th?.loading && <p className="text-sm text-muted">Loading email…</p>}
        {th?.error && <p className="text-sm font-bold text-rose-400">{th.error}</p>}
        {msgs.map((m, i) => {
          const isLast = i === msgs.length - 1;
          const open = isLast || expanded[m.id];
          return (
            <div key={m.id} className={`rounded-2xl border border-card-border p-3 ${m.mine ? 'bg-sky-600/10' : 'bg-surface-alt/50'}`}>
              <button onClick={() => !isLast && setExpanded((e) => ({ ...e, [m.id]: !e[m.id] }))}
                className={`w-full flex items-baseline gap-2 text-left ${isLast ? 'cursor-default' : 'cursor-pointer'}`}>
                <span className="flex-1 min-w-0 text-sm font-black text-primary truncate">{m.mine ? 'You' : m.fromName}</span>
                <span className="shrink-0 text-[11px] text-muted">{stamp(m.at)}</span>
                {!isLast && <ChevronDown size={12} className={`text-muted ${open ? '' : '-rotate-90'}`} />}
              </button>
              {open
                ? <p className="mt-2 text-sm text-primary whitespace-pre-wrap break-words">{m.text || '(no text)'}</p>
                : <p className="text-xs text-muted truncate">{m.text}</p>}
            </div>
          );
        })}
      </div>

      <div className="border-t border-card-border px-5 py-3">
        {th?.messages ? (
          <Composer draft={draft} setText={setText} onRedraft={onRedraft} onSend={onSend}
            placeholder={t.bucket === 'waiting' ? 'Type a follow-up' : 'Type your reply'}>
            <button onClick={onArchive} title="Archive in Gmail. Nothing is sent."
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl hover:bg-surface-alt hover:text-emerald-400 cursor-pointer">
              <Archive size={13} /> Archive
            </button>
            <button onClick={onDelete} title="Move to Gmail's Trash (gone for good after 30 days)."
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl hover:bg-surface-alt hover:text-red-500 cursor-pointer">
              <Trash2 size={13} /> Delete
            </button>
            {onSkip && (
              <button onClick={onSkip} title="Leave it in the inbox and go to the next one"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl hover:bg-surface-alt hover:text-primary cursor-pointer">
                <SkipForward size={13} /> Skip
              </button>
            )}
          </Composer>
        ) : (
          <p className="text-xs text-muted">Loading…</p>
        )}
      </div>
    </>
  );
}
