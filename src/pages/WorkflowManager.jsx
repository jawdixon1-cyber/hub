import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUp, ArrowDown, X, Plus, RefreshCw } from 'lucide-react';
import { useAppStore } from '../store/AppStoreContext';

// Start · 8 AM and End · 5 PM side by side: reorder steps, turn them off, add the special tools,
// and line up the steps both days share ("Sync order"). Each day keeps its own extras.
// Nothing changes until you tap something here; every change saves to that day's checklist.

// The special tools (a step with a live panel inside it).
const TOOLS = [
  { panel: 'weather', label: 'Weather check', icon: '🌤️', type: 'weather' },
  { panel: 'schedule', label: 'Schedule', icon: '📅' },
  { panel: 'texts', label: 'Work texts (Quo)', icon: '💬' },
  { panel: 'followups', label: 'Follow-ups', icon: '🔁' },
  { panel: 'leads', label: 'Requests / Leads', icon: '📥' },
  { panel: 'email', label: 'Work email', icon: '📧' },
  { panel: 'jobber', label: 'Jobber', icon: '🟢' },
  { panel: 'imessage', label: 'Personal texts', icon: '📱' },
  { panel: 'personal-email', label: 'Personal email', icon: '✉️' },
  { panel: 'personal', label: 'Personal text + email', icon: '🏠' },
  { panel: 'plan', label: 'Plan', icon: '🗓️' },
];
const toolOf = (i) => TOOLS.find((t) => (t.panel === 'weather' ? i.type === 'weather' : t.panel === i.panel));
// Same step on both days: same tool, or same name for plain steps.
const keyOf = (i) => (toolOf(i) ? `tool:${toolOf(i).panel}` : `${i.type === 'header' ? 'h' : 's'}:${String(i.text || '').replace(/^[^\w]+/u, '').trim().toLowerCase()}`);
const newId = () => `w${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

function Column({ title, list, setList, other }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= list.length) return; const n = [...list]; [n[i], n[j]] = [n[j], n[i]]; setList(n); };
  const remove = (i) => setList(list.filter((_, k) => k !== i));
  const add = (item) => { setList([...list, { id: newId(), done: false, links: [], indent: 0, type: 'item', ...item }]); setAdding(false); setName(''); };
  const has = (t) => list.some((i) => toolOf(i)?.panel === t.panel);
  const otherKeys = new Set((other || []).map(keyOf));
  return (
    <div className="rounded-xl border border-border-default bg-card p-4 space-y-2">
      <p className="text-lg font-bold text-primary">{title}</p>
      {list.map((i, k) => {
        const t = toolOf(i);
        const header = i.type === 'header';
        return (
          <div key={i.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${header ? 'bg-surface-alt mt-2' : 'border border-border-subtle'}`}>
            <span className="w-6 text-center">{t ? t.icon : header ? '▸' : '•'}</span>
            <span className={`flex-1 min-w-0 truncate text-sm ${header ? 'font-black uppercase tracking-wide text-secondary' : 'font-semibold text-primary'}`}>
              {i.text}{t && <span className="ml-1.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">TOOL</span>}
              {i.days?.length ? <span className="ml-1.5 text-[10px] font-bold text-muted">{i.days.join('/')}</span> : null}
              {!header && !otherKeys.has(keyOf(i)) && <span className="ml-1.5 text-[10px] font-bold text-amber-600">only here</span>}
            </span>
            <button onClick={() => move(k, -1)} title="Move up" className="p-1 text-muted hover:text-primary cursor-pointer"><ArrowUp size={14} /></button>
            <button onClick={() => move(k, 1)} title="Move down" className="p-1 text-muted hover:text-primary cursor-pointer"><ArrowDown size={14} /></button>
            <button onClick={() => remove(k)} title="Turn off (remove from this day)" className="p-1 text-muted hover:text-red-500 cursor-pointer"><X size={14} /></button>
          </div>
        );
      })}
      {adding ? (
        <div className="rounded-lg border border-dashed border-border-default p-3 space-y-2">
          <p className="text-xs font-bold text-muted uppercase tracking-wide">Add a tool</p>
          <div className="flex flex-wrap gap-1.5">
            {TOOLS.map((t) => (
              <button key={t.panel} disabled={has(t)} onClick={() => add(t.type === 'weather' ? { text: 'Weather Check', type: 'weather' } : { text: t.label, panel: t.panel })}
                className="rounded-full border border-border-default px-3 py-1 text-xs font-semibold text-primary hover:bg-surface-alt disabled:opacity-35 cursor-pointer">{t.icon} {t.label}</button>
            ))}
          </div>
          <p className="text-xs font-bold text-muted uppercase tracking-wide pt-1">Or a plain step / section</p>
          <div className="flex gap-1.5">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Delete 30 photos" className="flex-1 rounded-lg border border-border-default bg-card px-2 py-1.5 text-sm text-primary" />
            <button disabled={!name.trim()} onClick={() => add({ text: name.trim() })} className="rounded-lg bg-brand text-on-brand px-3 text-sm font-bold disabled:opacity-40 cursor-pointer">Step</button>
            <button disabled={!name.trim()} onClick={() => add({ text: name.trim(), type: 'header' })} className="rounded-lg border border-border-default px-3 text-sm font-bold text-primary disabled:opacity-40 cursor-pointer">Section</button>
          </div>
          <button onClick={() => setAdding(false)} className="text-xs text-muted hover:text-primary cursor-pointer">Cancel</button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-default py-2 text-sm font-semibold text-secondary hover:text-primary cursor-pointer"><Plus size={14} /> Add</button>
      )}
    </div>
  );
}

export default function WorkflowManager() {
  const navigate = useNavigate();
  const start = useAppStore((s) => s.ownerStartChecklist) || [];
  const setStart = useAppStore((s) => s.setOwnerStartChecklist);
  const end = useAppStore((s) => s.ownerEndChecklist) || [];
  const setEnd = useAppStore((s) => s.setOwnerEndChecklist);
  const [synced, setSynced] = useState('');

  // Put the steps End shares with Start into Start's order (End's own extras keep their spot after the step before them).
  const syncOrder = () => {
    const pos = new Map(start.map((i, k) => [keyOf(i), k]));
    const shared = end.filter((i) => pos.has(keyOf(i))).sort((a, b) => pos.get(keyOf(a)) - pos.get(keyOf(b)));
    let s = 0;
    const next = end.map((i) => (pos.has(keyOf(i)) ? shared[s++] : i));
    setEnd(next);
    setSynced('End now follows Start’s order for the steps they share.');
    setTimeout(() => setSynced(''), 4000);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-primary">Workflow manager</h1>
          <p className="text-sm text-secondary">Start and End side by side. ↑↓ reorder · ✕ turn off · + add a tool. <span className="text-amber-600 font-semibold">only here</span> = that day only.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={syncOrder} className="inline-flex items-center gap-1.5 rounded-lg bg-brand text-on-brand px-3 py-2 text-sm font-bold cursor-pointer"><RefreshCw size={14} /> Sync order (End follows Start)</button>
          <button onClick={() => navigate(-1)} className="rounded-lg border border-border-default px-3 py-2 text-sm font-semibold text-primary cursor-pointer">Done</button>
        </div>
      </div>
      {synced && <p className="text-sm font-semibold text-emerald-600">{synced}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <Column title="☀️ Start · 8 AM" list={start} setList={setStart} other={end} />
        <Column title="🌙 End · 5 PM" list={end} setList={setEnd} other={start} />
      </div>
    </div>
  );
}
