import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, Plus, Trash2, X } from 'lucide-react';
import { useAppStore } from '../store/AppStoreContext';

// Outreach campaigns on the Plans page: a named list of clients (snapshotted from a Plans filter)
// worked by call/text, with a status, follow-up date, notes and a log of every touch.
// Stored in the app store as planCampaigns: [{ id, name, createdAt, clientIds, entries }]
// where entries[clientId] = { status, nextAt, note, touches: [{ at, type }] }.

const STATUSES = [
  { id: 'new', label: 'New', cls: 'bg-slate-100 text-slate-600' },
  { id: 'attempted', label: 'Reached out', cls: 'bg-sky-50 text-sky-700' },
  { id: 'talked', label: 'Talked', cls: 'bg-indigo-50 text-indigo-700' },
  { id: 'interested', label: 'Interested', cls: 'bg-amber-50 text-amber-700' },
  { id: 'booked', label: 'Booked', cls: 'bg-lime-100 text-[#4d7c0f]' },
  { id: 'not', label: 'Not interested', cls: 'bg-slate-200 text-slate-600' },
  { id: 'noresp', label: 'No response', cls: 'bg-slate-200 text-slate-500' },
  { id: 'unqualified', label: 'Unqualified', cls: 'bg-orange-50 text-orange-700' },
  { id: 'dnc', label: 'Do not contact', cls: 'bg-red-50 text-red-700' },
];
const RANK = Object.fromEntries(STATUSES.map((s, i) => [s.id, i]));
// Day-one sequence (HSU): double dial, voicemail, text 1, text 2 with their design link.
// Then follow-ups: each one logged sets the next date (2, then 3, then 7 days); after the last, No response.
const SEQUENCE = [
  { id: 'call1', label: 'Call', icon: '📞' },
  { id: 'call2', label: 'Call again', icon: '📞' },
  { id: 'voicemail', label: 'Voicemail', icon: '🎙' },
  { id: 'sms1', label: 'Text 1', icon: '💬' },
  { id: 'sms2', label: 'Text 2 (link)', icon: '🔗' },
];
const SIMPLE_COLS = [
  { id: 'todo', label: 'To contact', bg: 'bg-slate-100' },
  { id: 'waiting', label: 'Waiting', bg: 'bg-sky-50' },
  { id: 'due', label: 'Follow up (due)', bg: 'bg-amber-50' },
  { id: 'warm', label: 'Interested', bg: 'bg-amber-50' },
  { id: 'done', label: 'Booked', bg: 'bg-lime-50' },
  { id: 'not', label: 'Not interested', bg: 'bg-red-50' },
  { id: 'unq', label: 'Unqualified', bg: 'bg-orange-50' },
];
const PIPELINE = [
  { id: 'new', label: 'New', bg: 'bg-slate-100' },
  { id: 'day1', label: 'Day 1', bg: 'bg-sky-50' },
  { id: 'following', label: 'Following up', bg: 'bg-amber-50' },
  { id: 'talked', label: 'Talked', bg: 'bg-indigo-50' },
  { id: 'interested', label: 'Interested', bg: 'bg-orange-50' },
  { id: 'booked', label: 'Booked', bg: 'bg-lime-100' },
  { id: 'lost', label: 'Lost', bg: 'bg-slate-200' },
];
const FOLLOW_UP_GAPS = [2, 3, 7]; // days until the next follow-up; the sequence counts as the first touch
const TOUCH_LABEL = {
  call1: 'Called', call2: 'Called again', voicemail: 'Left VM', sms1: 'Text 1', sms2: 'Text 2',
  contact: 'Contacted', 'fu-call': 'Follow-up call', 'fu-text': 'Follow-up text', talked: 'Talked',
  'no-answer': 'No answer', texted: 'Texted', // older log entries
};
const OPEN = (s) => !['booked', 'not', 'dnc', 'noresp', 'unqualified'].includes(s);
const plusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); }; // local YYYY-MM-DD

const DEFAULT_SCRIPT = {
  voicemail: "Hey {first}, had a bit of a crazy question to run by you. Give me a call back when you get a second.",
  sms1: "Hey {first}, exciting news: we're offering full-service holiday lighting! We don't have a whole lot of availability, but I'm reaching out to you first because you're one of our favorite clients to work with. I made this design for your home, let me know what you think.",
  sms2: '{link}',
};
const fill = (tpl, c, e) => (tpl || '').replaceAll('{first}', (c?.name || '').split(' ')[0]).replaceAll('{link}', e?.link || '');

const today = () => new Date().toLocaleDateString('en-CA');
const daysUntil = (iso) => Math.round((new Date(iso + 'T12:00:00') - new Date(today() + 'T12:00:00')) / 86400000);
const inDays = (iso) => { const d = daysUntil(iso); return d <= 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`; };
const fmt = (iso) => (iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—');
// Calls and texts go through Quo (formerly OpenPhone) from the business number, via its app deep
// links (https://support.quo.com/core-concepts/integrations/deep-linking). These open the Quo
// mobile app; Quo doesn't support them on desktop.
const e164 = (phone) => { const d = (phone || '').replace(/\D/g, ''); return d.length === 10 ? `+1${d}` : d.length === 11 && d[0] === '1' ? `+${d}` : `+${d}`; };
const QUO_FROM = '+18039027447'; // Hey Jude's business line, so links land in the existing thread on that number
const smsHref = (phone, body) => `openphone://message?number=${encodeURIComponent(e164(phone))}&from=${encodeURIComponent(QUO_FROM)}${body ? `&text=${encodeURIComponent(body)}` : ''}`;
const telHref = (phone) => `openphone://dial?number=${encodeURIComponent(e164(phone))}&from=${encodeURIComponent(QUO_FROM)}&action=call`;
const ON_PHONE = typeof navigator !== 'undefined' && /iPhone|iPad|Android/i.test(navigator.userAgent);

// Call/text button. On a phone it opens Quo straight to that person. On a computer Quo's links don't
// work (the Mac app opened blank chats, or dropped text into the wrong thread), so it copies instead:
// the number for a call, the message (or number) for a text.
// Top-right of a board card: tap to copy their service address.
function CopyAddress({ address }) {
  const [copied, setCopied] = useState(false);
  if (!address) return null;
  const copy = async () => {
    try { await navigator.clipboard.writeText(address); } catch { return; }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy} title={address} className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${copied ? 'bg-lime-100 text-[#4d7c0f]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
      {copied ? 'Copied ✓' : '📍 Address'}
    </button>
  );
}

function QuoLink({ kind, phone, body, onDone, className, title, children }) {
  const [copied, setCopied] = useState(false);
  if (ON_PHONE) return <a href={kind === 'call' ? telHref(phone) : smsHref(phone, body)} onClick={onDone} title={title} className={className}>{children}</a>;
  const copy = async () => {
    const what = kind === 'text' && body ? body : phone;
    try { await navigator.clipboard.writeText(what); } catch { window.prompt('Copy this:', what); }
    setCopied(true); setTimeout(() => setCopied(false), 1500);
    onDone?.();
  };
  return (
    <button onClick={copy} title={kind === 'text' && body ? `Copies the text. Their number: ${phone}` : `Copies ${phone}`} className={className}>
      {copied ? (kind === 'text' && body ? 'Text copied ✓' : 'Number copied ✓') : children}
    </button>
  );
}

// One line on who they were: their (last) plan and $/mo, or their last job and its price.
function summary(c) {
  const plan = c.jobs.find((j) => j.recurring && j.active) || c.jobs.find((j) => j.recurring);
  const $ = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
  if (plan) return [plan.title, plan.freq, plan.monthly != null ? `${$(plan.monthly)}/mo` : null].filter(Boolean).join(' · ');
  const j = c.jobs[0];
  return j ? [j.title, j.total ? $(j.total) : null].filter(Boolean).join(' · ') : 'Added by you';
}

function newCampaign(name, clientIds) {
  return { id: `c${Date.now()}`, name, createdAt: new Date().toISOString(), clientIds, entries: {} };
}

export default function PlanCampaigns({ clients, setNote, audiences, planNotes }) {
  const campaigns = useAppStore((s) => s.planCampaigns) || [];
  const setCampaigns = useAppStore((s) => s.setPlanCampaigns);
  const [params, setParams] = useSearchParams();
  const openId = params.get('c') !== 'new' ? params.get('c') : null;
  const building = params.get('c') === 'new';
  const setOpenId = (id) => setParams(id ? { tab: 'campaigns', c: id } : { tab: 'campaigns' });
  const setBuilding = (on) => setParams(on ? { tab: 'campaigns', c: 'new' } : { tab: 'campaigns' });

  const open = campaigns.find((c) => c.id === openId);
  if (open) return <CampaignView campaign={open} clients={clients} setCampaigns={setCampaigns} setNote={setNote} audiences={audiences} planNotes={planNotes} onBack={() => setOpenId(null)} />;
  if (building) return (
    <NewCampaign audiences={audiences} planNotes={planNotes} onCancel={() => setBuilding(false)}
      onCreate={(name, ids) => { const c = newCampaign(name, ids); setCampaigns((all) => [...(all || []), c]); setOpenId(c.id); }} />
  );

  // Everyone whose follow-up date is today or earlier, across every campaign.
  const byClient = Object.fromEntries(clients.map((c) => [c.clientId, c]));
  const dueToday = campaigns.flatMap((cp) => cp.clientIds.map((id) => ({ cp, id, e: cp.entries[id] || {} })))
    .filter(({ e }) => e.nextAt && e.nextAt <= today() && OPEN(e.status || 'new'))
    .sort((a, b) => a.e.nextAt.localeCompare(b.e.nextAt));

  return (
    <div className="space-y-2">
      {dueToday.length > 0 && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3">
          <p className="mb-2 text-sm font-bold text-amber-900">⏰ {dueToday.length} follow-up{dueToday.length === 1 ? '' : 's'} due today</p>
          <div className="space-y-1">
            {dueToday.map(({ cp, id, e }) => (
              <button key={cp.id + id} onClick={() => setParams({ tab: 'campaigns', c: cp.id, w: id })} className="flex w-full items-center gap-3 rounded-lg bg-white px-3 py-1.5 text-left text-sm hover:bg-amber-100">
                <span className="w-44 shrink-0 truncate font-semibold">{byClient[id]?.name || 'Unknown'}</span>
                <span className="flex-1 truncate text-xs text-slate-500">{cp.name}</span>
                <span className={`shrink-0 text-xs font-semibold ${e.nextAt < today() ? 'text-red-600' : 'text-amber-700'}`}>{e.nextAt < today() ? `overdue since ${fmt(e.nextAt)}` : 'today'}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <button onClick={() => setBuilding(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#4d7c0f] px-3 py-2 text-sm font-bold text-white hover:bg-[#3f6212]"><Plus size={14} /> New campaign</button>
      {campaigns.length === 0 && (
        <p className="rounded-xl border bg-white px-4 py-10 text-center text-sm text-slate-500">No campaigns yet. Hit <b>New campaign</b> to pick who to reach out to.</p>
      )}
      {[...campaigns].reverse().map((c) => {
        const es = c.clientIds.map((id) => c.entries[id] || {}).filter((e) => e.status !== 'unqualified'); // unqualified don't count at all
        // Reached = anyone past "To contact": waiting/due on a follow-up, interested, booked, not interested, unqualified.
        const reached = es.filter((e) => (e.touches || []).length || !['new', 'attempted', undefined].includes(e.status)).length;
        const booked = es.filter((e) => e.status === 'booked').length;
        const due = es.filter((e) => e.nextAt && e.nextAt <= today() && OPEN(e.status || 'new')).length;
        return (
          <button key={c.id} onClick={() => setOpenId(c.id)} className="flex w-full items-center gap-4 rounded-xl border bg-white px-4 py-3 text-left hover:bg-slate-50">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{c.name}</p>
              <p className="text-xs text-slate-500">Started {fmt(c.createdAt)} · {c.clientIds.length} people</p>
            </div>
            <div className="flex shrink-0 items-center gap-3 text-right text-xs">
              <div><p className="text-lg font-extrabold tabular-nums">{reached}/{es.length}</p><p className="text-slate-500">reached out</p></div>
              <div className="rounded-lg bg-slate-100 px-2.5 py-1"><p className="text-lg font-extrabold tabular-nums">{es.length - reached}</p><p className="text-slate-500">left to contact</p></div>
              <div className={`rounded-lg px-2.5 py-1 ${due ? 'bg-amber-100' : 'bg-slate-100'}`}><p className={`text-lg font-extrabold tabular-nums ${due ? 'text-amber-700' : 'text-slate-400'}`}>{due}</p><p className="text-slate-500">follow up now</p></div>
              <div><p className="text-lg font-extrabold tabular-nums text-[#4d7c0f]">{booked}</p><p className="text-slate-500">booked</p></div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

const GROUPS = [
  { id: 'season', label: 'Next season', hint: 'season ended + 📅 + people you added' },
  { id: 'one-time', label: 'One-time', hint: 'one-off jobs, never on a plan' },
  { id: 'plan', label: 'On a plan', hint: 'current recurring clients' },
  { id: 'cancelled', label: 'Cancelled', hint: 'plans that ended for a reason' },
];

// Reasons left out of every new campaign by default (tap a chip to bring them back for one campaign).
const DEFAULT_SKIP_REASONS = ['Unhappy', 'Not sure yet', 'Budget got tight', 'No reason given', 'Moved / house sold', 'Stopped paying'];

// Pick groups → one list (deduped). Do-not-contact is always out; 👎 is out unless you say otherwise.
function NewCampaign({ audiences, planNotes, onCreate, onCancel }) {
  const [picked, setPicked] = useState(['season']);
  const [skipThumbsDown, setSkipThumbsDown] = useState(true);
  const [skipReasons, setSkipReasons] = useState(DEFAULT_SKIP_REASONS); // cancel reasons to leave out
  const cancelReasons = useMemo(() => {
    const t = {};
    for (const c of audiences.cancelled || []) { const r = planNotes[c.clientId]?.reason; if (r) t[r] = (t[r] || 0) + 1; }
    return Object.entries(t).sort((a, b) => b[1] - a[1]);
  }, [audiences, planNotes]);
  const [name, setName] = useState('');
  const [unpicked, setUnpicked] = useState(() => new Set()); // people you unchecked by hand
  const people = useMemo(() => {
    const seen = new Map();
    for (const g of picked) for (const c of audiences[g] || []) {
      if (skipThumbsDown && planNotes[c.clientId]?.takeBack === 'no') continue;
      if (skipReasons.includes(planNotes[c.clientId]?.reason)) continue;
      seen.set(c.clientId, c);
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [picked, skipThumbsDown, skipReasons, audiences, planNotes]);
  const chosen = people.filter((c) => !unpicked.has(c.clientId));
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const defaultName = `${picked.map((g) => GROUPS.find((x) => x.id === g).label).join(' + ') || 'Campaign'} – ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="mb-1 text-lg font-extrabold">New campaign</p>
      <p className="mb-3 text-xs text-slate-500">Pick who to include. Do-not-contact people are always left out.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {GROUPS.map((g) => (
          <label key={g.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 ${picked.includes(g.id) ? 'border-[#4d7c0f] bg-lime-50' : 'hover:bg-slate-50'}`}>
            <input type="checkbox" checked={picked.includes(g.id)} onChange={() => toggle(g.id)} className="h-4 w-4 accent-[#4d7c0f]" />
            <span className="flex-1"><span className="text-sm font-semibold">{g.label}</span> <span className="text-xs text-slate-500">{g.hint}</span></span>
            <span className="text-sm font-bold tabular-nums">{(audiences[g.id] || []).length}</span>
          </label>
        ))}
      </div>
      {cancelReasons.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-slate-500">Leave out people who cancelled because of… <span className="font-normal">(applies to anyone with that reason)</span></p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {cancelReasons.map(([r, n]) => {
              const out = skipReasons.includes(r);
              return (
                <button key={r} onClick={() => setSkipReasons((x) => (out ? x.filter((y) => y !== r) : [...x, r]))}
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${out ? 'border-red-300 bg-red-50 text-red-700 line-through' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{r} · {n}</button>
              );
            })}
          </div>
        </div>
      )}
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" title="Always left out, can't be changed here">
        <input type="checkbox" checked disabled className="h-4 w-4 accent-red-600" />
        <span className="font-semibold">Leave out Do not contact</span>
        <span className="text-xs">· {Object.values(planNotes).filter((n) => n?.dnc).length} people · always on</span>
      </div>
      <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" checked={skipThumbsDown} onChange={(e) => setSkipThumbsDown(e.target.checked)} className="h-4 w-4" />
        Leave out 👎 (people you wouldn't take back)
      </label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={defaultName} className="mt-3 w-full rounded-lg border px-3 py-2 text-sm" />
      <p className="mt-3 text-sm"><b className="tabular-nums">{chosen.length}</b> people{unpicked.size > 0 && people.length !== chosen.length ? <span className="text-slate-500"> ({people.length - chosen.length} unchecked)</span> : null}. Uncheck anyone you don't want to reach out to.</p>
      <div className="mt-2 max-h-80 overflow-y-auto rounded-lg border">
        {people.map((c) => {
          const on = !unpicked.has(c.clientId);
          return (
            <label key={c.clientId} className={`flex cursor-pointer items-center gap-3 border-b px-3 py-1.5 text-sm last:border-b-0 ${on ? '' : 'bg-slate-50 text-slate-400'}`}>
              <input type="checkbox" checked={on} onChange={() => setUnpicked((u) => { const n = new Set(u); if (on) n.add(c.clientId); else n.delete(c.clientId); return n; })} className="h-4 w-4 accent-[#4d7c0f]" />
              <span className={`w-44 shrink-0 truncate font-semibold ${on ? '' : 'line-through'}`}>{c.name}</span>
              <span className="truncate text-xs text-slate-500">{summary(c)}</span>
            </label>
          );
        })}
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={() => onCreate((name.trim() || defaultName), chosen.map((c) => c.clientId))} disabled={!chosen.length} className="rounded-lg bg-[#4d7c0f] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Create campaign</button>
        <button onClick={onCancel} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">Cancel</button>
      </div>
    </div>
  );
}

function CampaignView({ campaign, clients, setCampaigns, setNote, audiences, planNotes, onBack }) {
  const [addingPeople, setAddingPeople] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const editCampaign = (fn) => setCampaigns((all) => (all || []).map((c) => (c.id === campaign.id ? fn(c) : c)));
  const rename = () => {
    const name = window.prompt('Rename campaign', campaign.name);
    if (name && name.trim()) editCampaign((c) => ({ ...c, name: name.trim() }));
  };
  // Removing someone drops them from the list; their outreach log is kept in case you add them back.
  const removePerson = (id) => editCampaign((c) => ({ ...c, clientIds: c.clientIds.filter((x) => x !== id) }));
  const addPerson = (id) => editCampaign((c) => (c.clientIds.includes(id) ? c : { ...c, clientIds: [...c.clientIds, id] }));
  // Anyone in a campaign group who isn't in this one yet (do-not-contact is never in a group).
  const addable = useMemo(() => {
    const seen = new Map();
    for (const g of Object.keys(audiences || {})) for (const c of audiences[g]) if (!campaign.clientIds.includes(c.clientId)) seen.set(c.clientId, c);
    const q = addSearch.trim().toLowerCase();
    return [...seen.values()].filter((c) => !q || c.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
  }, [audiences, campaign.clientIds, addSearch]);
  const [sort, setSort] = useState('value');
  const [show, setShow] = useState('all');
  const [view, setView] = useState('simple');
  const [showStats, setShowStatsRaw] = useState(() => { try { return localStorage.getItem('hub-campaign-stats') === '1'; } catch { return false; } }); // chart + workflow, hidden by default to stay focused
  const setShowStats = (v) => { setShowStatsRaw(v); try { localStorage.setItem('hub-campaign-stats', v ? '1' : '0'); } catch { /* private mode */ } };
  const [workingId, setWorkingId] = useState(() => new URLSearchParams(window.location.search).get('w')); // card opened from the pipeline (or the due-today list)
  const byId = useMemo(() => Object.fromEntries(clients.map((c) => [c.clientId, c])), [clients]);

  const update = (clientId, fn) => setCampaigns((all) => (all || []).map((c) => {
    if (c.id !== campaign.id) return c;
    const cur = c.entries[clientId] || { status: 'new', touches: [] };
    return { ...c, entries: { ...c.entries, [clientId]: fn(cur) } };
  }));
  // Board actions remember the card's state just before, so one tap of Undo puts it back.
  const act = (clientId, fn) => update(clientId, (e) => { const { prev: _drop, ...before } = e; return { ...fn(before), prev: before }; });
  const undo = (clientId) => update(clientId, (e) => e.prev || e);
  const script = { ...DEFAULT_SCRIPT, ...(campaign.script || {}) };
  const [editingScript, setEditingScript] = useState(false);
  // Log a sequence step or follow-up and schedule the next follow-up from it.
  // Drag a card onto a column. Talked/Interested/Booked/Lost set the status; New/Day 1/Following up
  // pin the column until the next call or text is logged.
  const moveTo = (clientId, col) => update(clientId, (e) => {
    if (['talked', 'interested', 'booked'].includes(col)) return { ...e, status: col, stage: '' };
    if (col === 'lost') return { ...e, status: OPEN(e.status || 'new') ? 'not' : e.status, stage: '', nextAt: '' };
    return { ...e, status: col === 'new' ? 'new' : 'attempted', stage: col };
  });
  const [dragOver, setDragOver] = useState(null);
  // Simple board: one tap after any call/text. Waits 2, then 3, then 7 days; the 4th no-reply closes it.
  const gaps = campaign.gaps || FOLLOW_UP_GAPS; // wait (days) after contact 1, 2, 3; editable on the board
  const contacted = (clientId) => act(clientId, (e) => {
    const touches = [...(e.touches || []), { at: new Date().toISOString(), type: 'contact' }];
    const n = touches.length;
    const status = RANK.attempted > RANK[e.status || 'new'] ? 'attempted' : e.status || 'new';
    return n > gaps.length ? { ...e, stage: '', touches, status: 'noresp', nextAt: '' } : { ...e, stage: '', touches, status, nextAt: plusDays(gaps[n - 1]) };
  });
  // Interested but not booked yet (e.g. talking it over with his wife): stays warm, never times out to No response.
  const markInterested = (clientId) => act(clientId, (e) => ({ ...e, stage: '', status: 'interested', nextAt: plusDays(2) }));
  const checkedIn = (clientId) => act(clientId, (e) => ({ ...e, touches: [...(e.touches || []), { at: new Date().toISOString(), type: 'contact' }], nextAt: plusDays(2) }));
  const logTouch = (clientId, type) => update(clientId, (e) => {
    const touches = [...(e.touches || []), { at: new Date().toISOString(), type }];
    const status = e.status || 'new';
    const next = { ...e, stage: '', touches, status: type === 'talked' ? (RANK.talked > RANK[status] ? 'talked' : status) : (RANK.attempted > RANK[status] ? 'attempted' : status) };
    if (!OPEN(next.status)) return next;
    if (type === 'talked') return { ...next, nextAt: plusDays(2) };
    if (SEQUENCE.some((s) => s.id === type)) {
      const done = new Set(touches.map((t) => t.type));
      return SEQUENCE.every((s) => done.has(s.id)) || type === 'sms2' ? { ...next, nextAt: plusDays(FOLLOW_UP_GAPS[0]) } : next;
    }
    // follow-up call/text
    const fus = touches.filter((t) => t.type.startsWith('fu-')).length;
    return fus >= FOLLOW_UP_GAPS.length ? { ...next, status: 'noresp', nextAt: '' } : { ...next, nextAt: plusDays(FOLLOW_UP_GAPS[fus]) };
  });
  const setStatus = (clientId, status) => {
    update(clientId, (e) => ({ ...e, status }));
    if (status === 'dnc') setNote(clientId, { dnc: true });
  };
  const remove = () => {
    if (!window.confirm(`Delete the "${campaign.name}" campaign and its outreach log?`)) return;
    setCampaigns((all) => (all || []).filter((c) => c.id !== campaign.id));
    onBack();
  };

  const rows = useMemo(() => {
    const list = campaign.clientIds.map((id) => {
      const e = campaign.entries[id] || {};
      const touches = e.touches || [];
      return { id, c: byId[id], e, status: e.status || 'new', last: touches[touches.length - 1]?.at || '', count: touches.length };
    });
    const t = today();
    const open = (r) => OPEN(r.status);
    const shown = list.filter((r) => show === 'all' || (show === 'due' ? open(r) && r.e.nextAt && r.e.nextAt <= t : show === 'untouched' ? r.count === 0 : r.status === show));
    const name = (r) => r.c?.name || '';
    // What they're worth a month (their biggest plan), else their last job's price; and when we last served them.
    const worth = (r) => { const js = r.c?.jobs || []; const m = Math.max(0, ...js.filter((j) => j.recurring).map((j) => j.monthly || 0)); return m || parseFloat(js[0]?.total) || 0; };
    const lastSeen = (r) => r.c?.endedAt || r.c?.lastService || r.c?.addedAt || '';
    const cmp = {
      value: (a, b) => worth(b) - worth(a) || name(a).localeCompare(name(b)),
      recent: (a, b) => lastSeen(b).localeCompare(lastSeen(a)) || name(a).localeCompare(name(b)),
      next: (a, b) => (open(b) - open(a)) || (a.e.nextAt || '9999').localeCompare(b.e.nextAt || '9999') || name(a).localeCompare(name(b)),
      status: (a, b) => RANK[a.status] - RANK[b.status] || name(a).localeCompare(name(b)),
      last: (a, b) => (a.last || '').localeCompare(b.last || '') || name(a).localeCompare(name(b)),
      name: (a, b) => name(a).localeCompare(name(b)),
    }[sort];
    return shown.sort(cmp);
  }, [campaign, byId, sort, show]);

  const tally = useMemo(() => {
    const t = { untouched: 0, due: 0 };
    for (const id of campaign.clientIds) {
      const e = campaign.entries[id] || {};
      const s = e.status || 'new';
      t[s] = (t[s] || 0) + 1;
      if (!(e.touches || []).length) t.untouched += 1;
      if (e.nextAt && e.nextAt <= today() && OPEN(s)) t.due += 1;
    }
    return t;
  }, [campaign]);

  // Pipeline column for a person: from their status, else from what's been logged so far.
  const stageOf = (r) => {
    if (['booked', 'interested', 'talked'].includes(r.status)) return r.status;
    if (!OPEN(r.status)) return 'lost';
    if (r.e.stage) return r.e.stage; // dragged by hand; logging the next touch hands it back to the auto rules
    const done = new Set((r.e.touches || []).map((t) => t.type));
    if (!done.size) return 'new';
    return SEQUENCE.every((st) => done.has(st.id)) || done.has('sms2') ? 'following' : 'day1';
  };
  const nextStep = (r, stage) => {
    if (stage === 'new') return 'Start: Call';
    if (stage === 'day1') { const done = new Set((r.e.touches || []).map((t) => t.type)); const st = SEQUENCE.find((x) => !done.has(x.id)); return st ? `Next: ${st.label}` : ''; }
    if (stage === 'lost') return STATUSES.find((x) => x.id === r.status)?.label || '';
    if (stage === 'booked') return 'Booked 🎉';
    return r.e.nextAt ? `Follow up ${fmt(r.e.nextAt)}` : 'No follow-up set';
  };

  // One person's row: sequence/follow-up buttons, status, link, follow-up date, notes.
  const renderRow = ({ id, c, e, status, last, count }) => {
          const st = STATUSES.find((s) => s.id === status);
          const overdue = e.nextAt && e.nextAt <= today() && OPEN(status);
          return (
            <div key={id} className="border-b px-4 py-3 last:border-b-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{c?.name || 'Client not found in Jobber'}</p>
                  {c && <p className="truncate text-xs text-slate-600">{summary(c)}</p>}
                  <p className="text-xs text-slate-500">
                    {c?.phone || 'No phone'}
                    {' · '}{count ? `${count} touch${count === 1 ? '' : 'es'}, last ${fmt(last)} (${TOUCH_LABEL[e.touches[e.touches.length - 1].type] || ''})` : 'Not contacted yet'}
                  </p>
                </div>

                <select value={status} onChange={(ev) => setStatus(id, ev.target.value)} className={`rounded-full border-0 px-2.5 py-1 text-xs font-bold ${st.cls}`}>
                  {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                <button onClick={() => removePerson(id)} title="Remove from this campaign" className="rounded-lg p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-600"><X size={14} /></button>
              </div>
              {OPEN(status) && c?.phone && (() => {
                const done = new Set((e.touches || []).map((t) => t.type));
                const seqDone = SEQUENCE.every((st) => done.has(st.id)) || done.has('sms2');
                const fus = (e.touches || []).filter((t) => t.type.startsWith('fu-')).length;
                const btn = 'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold';
                const href = (st) => (st.id.startsWith('call') ? telHref(c.phone) : st.id === 'sms1' ? smsHref(c.phone, fill(script.sms1, c, e)) : st.id === 'sms2' ? smsHref(c.phone, fill(script.sms2, c, e)) : null);
                return (
                  <div className="mt-2 space-y-1.5">
                    {!seqDone ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-slate-400">Day 1:</span>
                        {SEQUENCE.map((st) => {
                          const h = href(st);
                          const cls = `${btn} ${done.has(st.id) ? 'bg-lime-100 text-[#4d7c0f]' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`;
                          const label = <>{done.has(st.id) ? '✓' : st.icon} {st.label}</>;
                          if (st.id === 'sms2' && !e.link) return <span key={st.id} className={`${btn} bg-slate-50 text-slate-400`} title="Paste their design link first">🔗 Text 2 (needs link)</span>;
                          return h
                            ? <QuoLink key={st.id} kind={st.id.startsWith('call') ? 'call' : 'text'} phone={c.phone} body={st.id === 'sms1' ? fill(script.sms1, c, e) : st.id === 'sms2' ? fill(script.sms2, c, e) : ''} onDone={() => logTouch(id, st.id)} className={cls}>{label}</QuoLink>
                            : <button key={st.id} onClick={() => logTouch(id, st.id)} title={fill(script.voicemail, c, e)} className={cls}>{label}</button>;
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-slate-400">Follow-up {Math.min(fus + 1, FOLLOW_UP_GAPS.length)} of {FOLLOW_UP_GAPS.length}:</span>
                        <QuoLink kind="call" phone={c.phone} onDone={() => logTouch(id, 'fu-call')} className={`${btn} bg-slate-100 text-slate-700 hover:bg-slate-200`}>📞 Call</QuoLink>
                        <QuoLink kind="text" phone={c.phone} onDone={() => logTouch(id, 'fu-text')} className={`${btn} bg-slate-100 text-slate-700 hover:bg-slate-200`}>💬 Text</QuoLink>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button onClick={() => logTouch(id, 'talked')} className={`${btn} bg-indigo-50 text-indigo-700 hover:bg-indigo-100`}>🗣 Talked to them</button>
                      <input value={e.link || ''} onChange={(ev) => update(id, (x) => ({ ...x, link: ev.target.value }))} placeholder="Paste their design link" className="w-48 rounded-md border px-2 py-0.5 text-[11px]" />
                      <label className={`ml-auto inline-flex items-center gap-1 text-[11px] font-semibold ${overdue ? 'text-amber-600' : 'text-slate-400'}`}>
                        Follow up
                        <input type="date" value={e.nextAt || ''} onChange={(ev) => update(id, (x) => ({ ...x, nextAt: ev.target.value }))} className="rounded-md border px-1.5 py-0.5 text-[11px] text-slate-700" />
                      </label>
                    </div>
                  </div>
                );
              })()}
              <input value={e.note || ''} onChange={(ev) => update(id, (x) => ({ ...x, note: ev.target.value }))} placeholder="Notes from the call/text" className="mt-2 w-full rounded-md border px-2 py-1 text-xs" />
            </div>
          );
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button onClick={onBack} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100"><ChevronLeft size={14} /> Campaigns</button>
        <button onClick={rename} title="Rename" className="text-lg font-extrabold hover:underline">{campaign.name}</button>
        <span className="text-xs text-slate-500">{campaign.clientIds.length} people · started {fmt(campaign.createdAt)}</span>
        <button onClick={() => setEditingScript((x) => !x)} className="ml-auto inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-50">✏️ Script</button>
        <button onClick={() => setAddingPeople((x) => !x)} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-50"><Plus size={13} /> Add people</button>
        <button onClick={remove} title="Delete campaign" className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>
      </div>

      {editingScript && (
        <div className="mb-3 space-y-2 rounded-xl border bg-white p-3">
          <p className="text-xs text-slate-500"><b>{'{first}'}</b> becomes their first name, <b>{'{link}'}</b> their design link. Saved for this campaign.</p>
          {[['voicemail', 'Voicemail (what to say)'], ['sms1', 'Text 1'], ['sms2', 'Text 2']].map(([k, l]) => (
            <label key={k} className="block text-xs font-semibold text-slate-600">{l}
              <textarea value={script[k]} onChange={(ev) => editCampaign((c) => ({ ...c, script: { ...script, [k]: ev.target.value } }))} rows={k === 'sms2' ? 1 : 3} className="mt-1 block w-full rounded-md border px-2 py-1 text-sm font-normal" />
            </label>
          ))}
        </div>
      )}

      {addingPeople && (
        <div className="mb-3 rounded-xl border bg-white p-3">
          <input autoFocus value={addSearch} onChange={(e) => setAddSearch(e.target.value)} placeholder="Search people not in this campaign" className="mb-2 w-full rounded-lg border px-3 py-1.5 text-sm" />
          <div className="max-h-64 overflow-y-auto">
            {addable.length === 0 && <p className="py-3 text-center text-xs text-slate-500">No one else to add.</p>}
            {addable.map((c) => (
              <div key={c.clientId} className="flex items-center gap-3 border-b px-1 py-1.5 text-sm last:border-b-0">
                <span className="w-44 shrink-0 truncate font-semibold">{c.name}</span>
                <span className="flex-1 truncate text-xs text-slate-500">{summary(c)}{planNotes[c.clientId]?.reason ? ` · ${planNotes[c.clientId].reason}` : ''}</span>
                <button onClick={() => addPerson(c.clientId)} className="rounded-md bg-[#4d7c0f] px-2.5 py-1 text-xs font-bold text-white">Add</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-3 inline-flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold">
        {[['simple', 'Board'], ['pipeline', 'Detailed'], ['list', 'List']].map(([v, l]) => (
          <button key={v} onClick={() => setView(v)} className={`rounded-md px-3 py-1 ${view === v ? 'bg-white shadow-sm' : 'text-slate-500'}`}>{l}</button>
        ))}
      </div>

      {(() => {
        const due = rows.filter((r) => r.e.nextAt && r.e.nextAt <= today() && OPEN(r.status));
        if (!due.length) return null;
        return (
          <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2">
            <span className="mr-1 text-sm font-bold text-amber-900">⏰ Due today:</span>
            {due.map((r) => (
              <button key={r.id} onClick={() => { setView('pipeline'); setWorkingId(r.id); }} className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-amber-900 hover:bg-amber-100">{r.c?.name || 'Unknown'}</button>
            ))}
          </div>
        );
      })()}

      <button onClick={() => setShowStats(!showStats)} className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800">
        {showStats ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Results & workflow
      </button>

      {showStats && (() => {
        // Campaign results: one stacked bar of where everyone stands.
        const all = campaign.clientIds.map((id) => campaign.entries[id] || {}).filter((e) => e.status !== 'unqualified');
        const seg = [
          { label: 'Yes (booked)', color: 'bg-[#4d7c0f]', n: all.filter((e) => e.status === 'booked').length },
          { label: 'Interested', color: 'bg-lime-400', n: all.filter((e) => e.status === 'interested').length },
          { label: 'Following up', color: 'bg-amber-400', n: all.filter((e) => OPEN(e.status || 'new') && e.status !== 'interested' && (e.touches || []).length).length },
          { label: 'Not contacted', color: 'bg-slate-300', n: all.filter((e) => OPEN(e.status || 'new') && e.status !== 'interested' && !(e.touches || []).length).length },
          { label: 'Not interested', color: 'bg-red-400', n: all.filter((e) => e.status === 'not' || e.status === 'dnc').length },
          { label: 'No response', color: 'bg-slate-500', n: all.filter((e) => e.status === 'noresp').length },
        ];
        const total = all.length || 1;
        return (
          <div className="mb-3 rounded-xl border bg-white p-3">
            <div className="flex h-4 overflow-hidden rounded-full bg-slate-100">
              {seg.map((x) => x.n > 0 && <div key={x.label} className={x.color} style={{ width: `${(x.n / total) * 100}%` }} title={`${x.label}: ${x.n}`} />)}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {seg.map((x) => (
                <span key={x.label} className="inline-flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${x.color}`} />
                  {x.label} <b className="tabular-nums">{x.n}</b> <span className="text-slate-400">{Math.round((x.n / total) * 100)}%</span>
                </span>
              ))}
            </div>
          </div>
        );
      })()}

      {view === 'simple' && (() => {
        // Simple board: To contact → Waiting (timer running) → Follow up (due) → Interested (booked) / Not interested (incl. no response).
        const col = (r) => {
          if (r.status === 'unqualified') return 'unq';
          if (r.status === 'not' || r.status === 'dnc' || r.status === 'noresp') return 'not';
          if (r.status === 'interested') return 'warm';
          if (!OPEN(r.status)) return 'done';
          if (!(r.e.touches || []).length) return 'todo';
          return r.e.nextAt && r.e.nextAt > today() ? 'waiting' : 'due';
        };
        const cols = SIMPLE_COLS.map((cl) => ({ ...cl, cards: rows.filter((r) => col(r) === cl.id) }));
        const setGap = (i, v) => editCampaign((c) => ({ ...c, gaps: gaps.map((g, k) => (k === i ? Math.max(1, Math.min(60, +v || 1)) : g)) }));
        return (
          <>
          {/* The workflow: contact, wait, contact… Each "✓ Contacted" starts the next wait. */}
          {showStats && <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-xl border bg-white px-3 py-2 text-xs">
            <span className="mr-1 font-bold text-slate-500">Workflow:</span>
            {gaps.map((g, i) => (
              <span key={i} className="inline-flex items-center gap-1.5">
                <span className="rounded-full bg-[#4d7c0f] px-2 py-0.5 font-bold text-white">Contact {i + 1}</span>
                <span className="inline-flex items-center gap-1 text-slate-500">→ wait
                  <input type="number" min="1" max="60" value={g} onChange={(ev) => setGap(i, ev.target.value)} className="w-10 rounded border px-1 py-0.5 text-center text-xs font-semibold text-slate-800" />
                  days →</span>
              </span>
            ))}
            <span className="rounded-full bg-[#4d7c0f] px-2 py-0.5 font-bold text-white">Contact {gaps.length + 1}</span>
            <span className="text-slate-500">→ no reply = Not interested</span>
          </div>}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {cols.map((cl) => (
              <div key={cl.id} className={`w-60 shrink-0 rounded-xl ${cl.bg} p-2`}>
                <p className="mb-2 flex items-center justify-between px-1 text-xs font-bold uppercase tracking-wide text-slate-600">{cl.label}<span className="tabular-nums">{cl.cards.length}</span></p>
                <div className="max-h-[70vh] space-y-1.5 overflow-y-auto">
                  {(cl.id === 'warm' ? [...cl.cards].sort((a, b) => (a.e.nextAt || '').localeCompare(b.e.nextAt || '')) : cl.cards).map((r) => {
                    const n = (r.e.touches || []).length;
                    const first = (r.c?.name || '').split(' ')[0];
                    const warm = r.status === 'interested';
                    const closed = !warm && (cl.id === 'done' || cl.id === 'not' || cl.id === 'unq');
                    return (
                      <div key={r.id} className="rounded-lg border bg-white p-2.5 shadow-sm">
                        <div className="flex items-start justify-between gap-1">
                          <p className="truncate text-sm font-semibold">{r.c?.name || 'Unknown'}</p>
                          <CopyAddress address={r.c?.address} />
                        </div>
                        {r.c?.address && <p className="truncate text-[11px] text-slate-400" title={r.c.address}>{r.c.address}</p>}
                        {r.c && <p className="truncate text-[11px] text-slate-500">{summary(r.c)}</p>}
                        {cl.id === 'waiting' && r.e.nextAt && (
                          <p className="mt-1.5 rounded-md bg-sky-100 px-2 py-1 text-center text-sm font-bold text-sky-800">
                            ⏳ Follow up {inDays(r.e.nextAt)} <span className="font-semibold text-sky-600">· {fmt(r.e.nextAt)}</span>
                          </p>
                        )}
                        {warm && (
                          <div className={`mt-1.5 rounded-md px-2 py-1 text-center text-sm font-bold ${r.e.nextAt && daysUntil(r.e.nextAt) <= 0 ? 'bg-amber-100 text-amber-800' : 'bg-lime-100 text-[#3f6212]'}`}>
                            🔥 Interested · check in {r.e.nextAt ? inDays(r.e.nextAt) : '—'}
                            <input type="date" value={r.e.nextAt || ''} onChange={(ev) => update(r.id, (x) => ({ ...x, nextAt: ev.target.value }))} className="mt-1 block w-full rounded border bg-white px-1 py-0.5 text-[11px] font-normal text-slate-700" title="Pick the day to check back in" />
                          </div>
                        )}
                        {warm && (
                          <div className="mt-1.5 flex gap-1">
                            <button onClick={() => checkedIn(r.id)} className="flex-1 rounded-md bg-[#4d7c0f] px-2 py-1 text-[11px] font-bold text-white hover:bg-[#3f6212]">✓ Checked in</button>
                          </div>
                        )}
                        {!warm && <p className="mt-0.5 text-[11px] text-slate-500">
                          {closed ? (STATUSES.find((x) => x.id === r.status)?.label) : n ? `Contact ${n + 1} of ${gaps.length + 1} · ${cl.id === 'waiting' ? 'waiting' : 'due now'}` : `Contact 1 of ${gaps.length + 1}`}
                        </p>}
                        {!closed && !warm && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            <button onClick={() => contacted(r.id)} className="flex-1 rounded-md bg-[#4d7c0f] px-2 py-1 text-[11px] font-bold text-white hover:bg-[#3f6212]">✓ Contacted</button>
                          </div>
                        )}
                        {!closed && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {!warm && <button onClick={() => markInterested(r.id)} className="flex-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-50">🔥 Interested</button>}
                            <button onClick={() => act(r.id, (e) => ({ ...e, status: 'booked', nextAt: '' }))} className="flex-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold text-[#4d7c0f] hover:bg-lime-50">Booked</button>
                            <button onClick={() => act(r.id, (e) => ({ ...e, status: 'not', nextAt: '' }))} className="flex-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-50">Not interested</button>
                            <button onClick={() => act(r.id, (e) => ({ ...e, status: 'unqualified', nextAt: '' }))} className="flex-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold text-orange-600 hover:bg-orange-50">Unqualified</button>
                          </div>
                        )}
                        {r.e.prev && <button onClick={() => undo(r.id)} className="mt-1 text-[11px] font-semibold text-slate-400 hover:text-slate-700">↶ Undo last</button>}
                        {first && !closed && <input value={r.e.note || ''} onChange={(ev) => update(r.id, (x) => ({ ...x, note: ev.target.value }))} placeholder="Note" className="mt-1.5 w-full rounded border px-1.5 py-0.5 text-[11px]" />}
                      </div>
                    );
                  })}
                  {cl.cards.length === 0 && <p className="px-1 py-3 text-center text-[11px] text-slate-400">—</p>}
                </div>
              </div>
            ))}
          </div>
          </>
        );
      })()}

      {view === 'pipeline' && (() => {
        const all = rows; // filters below are list-only; the board always shows everyone
        const cols = PIPELINE.map((p) => ({ ...p, cards: all.filter((r) => stageOf(r) === p.id) }));
        const working = all.find((r) => r.id === workingId);
        return (
          <>
            {working && (
              <div className="mb-3 overflow-hidden rounded-xl border-2 border-[#4d7c0f] bg-white">
                <div className="flex items-center justify-end bg-lime-50 px-2 py-1"><button onClick={() => setWorkingId(null)} className="rounded p-1 text-slate-500 hover:bg-white"><X size={14} /></button></div>
                {renderRow(working)}
              </div>
            )}
            <div className="flex gap-2 overflow-x-auto pb-2">
              {cols.map((col) => (
                <div key={col.id}
                  onDragOver={(ev) => { ev.preventDefault(); setDragOver(col.id); }}
                  onDragLeave={() => setDragOver((d) => (d === col.id ? null : d))}
                  onDrop={(ev) => { ev.preventDefault(); const id = ev.dataTransfer.getData('text/plain'); setDragOver(null); if (id) moveTo(id, col.id); }}
                  className={`flex w-52 shrink-0 flex-col rounded-xl ${col.bg} p-2 ${dragOver === col.id ? 'ring-2 ring-[#4d7c0f]' : ''}`}>
                  <p className="mb-2 flex items-center justify-between px-1 text-xs font-bold uppercase tracking-wide text-slate-600">{col.label}<span className="tabular-nums">{col.cards.length}</span></p>
                  <div className="space-y-1.5">
                    {col.cards.map((r) => {
                      const overdue = r.e.nextAt && r.e.nextAt <= today() && OPEN(r.status);
                      return (
                        <button key={r.id} draggable onDragStart={(ev) => ev.dataTransfer.setData('text/plain', r.id)} onClick={() => setWorkingId(r.id === workingId ? null : r.id)} className={`block cursor-grab active:cursor-grabbing w-full rounded-lg border bg-white px-2.5 py-2 text-left shadow-sm hover:border-[#4d7c0f] ${r.id === workingId ? 'border-[#4d7c0f] ring-1 ring-[#4d7c0f]' : ''}`}>
                          <p className="truncate text-sm font-semibold">{r.c?.name || 'Unknown'}</p>
                          {r.c && <p className="truncate text-[11px] text-slate-500">{summary(r.c)}</p>}
                          <p className={`mt-1 text-[11px] font-semibold ${overdue ? 'text-amber-600' : 'text-slate-500'}`}>{overdue ? '⏰ ' : ''}{nextStep(r, col.id)}</p>
                        </button>
                      );
                    })}
                    {col.cards.length === 0 && <p className="px-1 py-3 text-center text-[11px] text-slate-400">—</p>}
                  </div>
                </div>
              ))}
            </div>
          </>
        );
      })()}

      {view === 'list' && <div className="mb-3 flex flex-wrap gap-1.5">
        {[['all', 'All', campaign.clientIds.length], ['due', 'Follow-up due', tally.due], ['untouched', 'Not contacted yet', tally.untouched], ...STATUSES.filter((s) => s.id !== 'new').map((s) => [s.id, s.label, tally[s.id] || 0])].map(([id, label, n]) => (
          <button key={id} onClick={() => setShow(show === id ? 'all' : id)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${show === id ? 'border-[#4d7c0f] bg-[#4d7c0f] text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
            {label} <span className="tabular-nums opacity-70">{n}</span>
          </button>
        ))}
        <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-500">
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-lg border bg-white px-2 py-1 text-xs">
            <option value="value">Biggest $ first</option>
            <option value="recent">Most recent client first</option>
            <option value="next">Follow-up date</option>
            <option value="status">Status</option>
            <option value="last">Longest since contact</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>}

      {view === 'list' && <div className="overflow-hidden rounded-xl border bg-white">
        {rows.length === 0 && <p className="px-4 py-10 text-center text-sm text-slate-500">No one here.</p>}
        {rows.map((r) => renderRow(r))}
      </div>}
    </div>
  );
}
