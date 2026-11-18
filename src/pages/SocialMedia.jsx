import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Plus, Trash2, Video, GripVertical } from 'lucide-react';
import { DndContext, PointerSensor, TouchSensor, KeyboardSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAppStore } from '../store/AppStoreContext';
import { useAuth } from '../contexts/AuthContext';

// Social media: video ideas moving Idea → Filmed → Posted, run on the seminar's weekly system
// (Z's Seminar, Canva, Oct 2026): 2 job-site videos, 3 before/afters, 1 testimonial, stories 5+ days
// a week; pick filming jobs ahead with the hook written; one-sentence captions ending in the phone
// number; post to IG + FB + the local FB group and track views.
// Saved in the shared store (greenteam-socialIdeas), merged by id so two tabs can't wipe each other.


// The weekly cadence. Stories count days with at least one story posted.
const FORMATS = {
  story: { label: 'Story', goal: 5, note: 'days this week' },
  video: { label: 'Job video', goal: 2, note: 'at 2 job sites' },
  beforeafter: { label: 'Before/after', goal: 3, note: 'this week' },
  testimonial: { label: 'Testimonial', goal: 1, note: 'if you can get it' },
};

// Christmas lights season (Nov–Dec): the videos that bring in lights calls.
const LIGHTS_IDEAS = [
  { f: 'video', t: 'Day-to-night reveal: same angle, daylight then lights on' },
  { f: 'video', t: 'Install time-lapse: the whole roofline in 20 seconds' },
  { f: 'video', t: 'How we measure your house (lines on the photo)' },
  { f: 'video', t: 'Custom-cut C9s: cutting the wire to fit the roofline' },
  { f: 'beforeafter', t: 'Dark house vs lit house, street name in the caption' },
  { f: 'beforeafter', t: 'Mockup vs the real finished house' },
  { f: 'testimonial', t: "Client's reaction the first time the lights turn on" },
  { f: 'story', t: 'Crew on the roof: "lights going up in [neighborhood] today"' },
  { f: 'story', t: 'Truck and ladders in the driveway' },
  { f: 'story', t: "Lights boxed and labeled for tonight's job" },
  { f: 'story', t: "Drive-by of every house we've lit this year" },
];
const lightsSeason = () => { const m = new Date().getMonth(); return m === 10 || m === 11; };

const PLAYBOOK = [
  { f: 'story', t: 'Crew working: "leaves coming off in [neighborhood] today"' },
  { f: 'story', t: 'Finished job with the yard sign in the shot' },
  { f: 'story', t: 'Quick video of finished work with a call to action' },
  { f: 'story', t: 'Selfie with the crew at the job site' },
  { f: 'story', t: 'The driveway shot: truck, trailer, equipment' },
  { f: 'story', t: 'Business win: new wrap, new machine' },
  { f: 'story', t: "The client's dog, a frog, something fun" },
  { f: 'story', t: 'Happy holidays plus your seasonal service' },
  { f: 'video', t: 'Job walkthrough video' },
  { f: 'video', t: 'How we do it: the process start to finish' },
  { f: 'video', t: 'Time-lapse / video montage' },
  { f: 'video', t: "What neighborhood we're in this week" },
  { f: 'beforeafter', t: 'Before and after with the branded frame' },
  { f: 'beforeafter', t: 'Before and after slideshow' },
  { f: 'testimonial', t: 'Video testimonial: interview a happy client on camera' },
];

const weekStart = () => { const d = new Date(); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); d.setHours(0, 0, 0, 0); return d; };
const newId = () => `vid-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const dayLabel = (iso) => new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' });

export default function SocialMedia() {
  const ideas = useAppStore((s) => s.socialIdeas) || [];
  const setIdeas = useAppStore((s) => s.setSocialIdeas);
  const [draft, setDraft] = useState('');
  const [openId, setOpenId] = useState(null);

  const add = (t = draft, f = 'story', extra = {}) => {
    const title = String(t).trim();
    if (!title) return;
    const top = Math.min(0, ...ideas.filter((x) => typeof x.order === 'number').map((x) => x.order)) - 1;
    setIdeas([{ id: newId(), title, script: '', link: '', status: 'idea', format: f, order: top, createdAt: new Date().toISOString(), ...extra }, ...ideas]);
    if (t === draft) setDraft('');
  };
  const patch = (id, p) => setIdeas(ideas.map((i) => (i.id === id ? { ...i, ...p, updatedAt: new Date().toISOString() } : i)));
  const remove = (id) => setIdeas(ideas.filter((i) => i.id !== id));
  const ord = (i) => (typeof i.order === 'number' ? i.order : -new Date(i.createdAt || 0).getTime() / 1e12);
  const list = ideas.filter((i) => (i.status || 'idea') === 'idea').sort((a, b) => ord(a) - ord(b));
  // Drag to reorder: grab the ⠿ handle (press-and-hold on a phone).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const from = list.findIndex((x) => x.id === active.id);
    const to = list.findIndex((x) => x.id === over.id);
    const moved = arrayMove(list, from, to);
    const pos = Object.fromEntries(moved.map((x, n) => [x.id, n]));
    setIdeas(ideas.map((x) => (x.id in pos ? { ...x, order: pos[x.id] } : x)));
  };
  const [showGuide, setShowGuide] = useState(false);

  // Upcoming Jobber jobs (next 7 days) to pick this week's filming jobs from.
  const { session } = useAuth();
  const token = session?.access_token || '';
  const [upcoming, setUpcoming] = useState({ loading: true, visits: [], error: null });
  useEffect(() => {
    if (!token) return;
    fetch('/api/plan-day?upcoming=1', { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || `Error ${r.status}`); return d; })
      .then((d) => setUpcoming({ loading: false, visits: d.visits || [], error: null }))
      .catch((e) => setUpcoming({ loading: false, visits: [], error: e.message }));
  }, [token]);
  const since = weekStart();
  const filming = ideas.filter((i) => i.jobDate && new Date(i.jobDate) >= since).sort((a, b) => new Date(a.jobDate) - new Date(b.jobDate));
  const [pickJobs, setPickJobs] = useState(false);

  return (
    <div className="px-3 sm:px-6 py-4 sm:py-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <Video size={26} className="text-brand" />
        <h1 className="text-2xl sm:text-3xl font-black text-primary tracking-tight">Social media</h1>
      </div>

      {/* Add an idea */}
      <div className="flex items-start gap-2 mb-4">
        <AutoText value={draft} onChange={setDraft} onEnter={() => add()}
          placeholder="New video idea…"
          className="flex-1 min-w-0 bg-card border border-card-border rounded-2xl px-4 py-3 text-base text-primary outline-none focus:border-brand" />
        <button onClick={() => add()} disabled={!draft.trim()}
          className="inline-flex items-center gap-1.5 bg-brand text-black font-black px-5 py-3 rounded-2xl hover:brightness-110 cursor-pointer disabled:opacity-40">
          <Plus size={18} /> Add
        </button>
      </div>

      {/* Our ideas: each with a script and an inspiration link */}
      <div className="space-y-2 mb-10">
        {list.length === 0 && <p className="text-sm text-muted px-1">No ideas yet. Type one above, or grab one from Video ideas below.</p>}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={list.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {list.map((i) => <IdeaCard key={i.id} idea={i} open={openId === i.id} onToggle={() => setOpenId(openId === i.id ? null : i.id)} patch={(p) => patch(i.id, p)} remove={() => remove(i.id)} />)}
          </SortableContext>
        </DndContext>
      </div>

      {/* Video ideas to steal (lights season + the seminar) */}
      <section className="rounded-3xl border border-card-border bg-card p-4 mb-4">
        <button onClick={() => setShowGuide((v) => !v)} className="w-full flex items-center justify-between cursor-pointer">
          <p className="text-sm font-black text-primary">Video ideas to steal</p>
          <span className="text-xs font-bold text-muted">{showGuide ? 'Hide' : 'Show ideas'}</span>
        </button>
        {showGuide && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[...(lightsSeason() ? LIGHTS_IDEAS : []), ...PLAYBOOK].map((p) => (
              <button key={p.t} onClick={() => add(p.t, p.f)} title="Add to my ideas"
                className="text-xs text-left text-primary bg-surface-alt hover:bg-brand/15 hover:text-brand px-2.5 py-1.5 rounded-xl cursor-pointer">+ {p.t}</button>
            ))}
          </div>
        )}
      </section>

      {/* Filming jobs this week (picked ahead, hook written before you get there) */}
      <section className="rounded-3xl border border-card-border bg-card p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-black text-primary">Filming jobs this week</p>
          <button onClick={() => setPickJobs((v) => !v)} className="text-xs font-black text-brand cursor-pointer">{pickJobs ? 'Done' : '+ Pick a job'}</button>
        </div>
        {filming.map((i) => (
          <div key={i.id} className="py-1.5">
            <p className="text-sm font-bold text-primary">{dayLabel(i.jobDate)} · {i.jobClient || i.title}</p>
            <input value={i.hook || ''} onChange={(e) => patch(i.id, { hook: e.target.value })} placeholder="Write the hook before you get there…"
              className="w-full mt-1 bg-surface-alt rounded-xl px-3 py-1.5 text-sm text-primary outline-none focus:ring-1 focus:ring-brand" />
          </div>
        ))}
        {filming.length === 0 && !pickJobs && <p className="text-xs text-muted">Pick 2 jobs to film this week. Someone else holds the phone.</p>}
        {pickJobs && (
          <div className="mt-2 max-h-64 overflow-y-auto border-t border-card-border pt-2">
            {upcoming.loading && <p className="text-xs text-muted">Loading your Jobber week…</p>}
            {upcoming.error && <p className="text-xs text-rose-400">{upcoming.error}</p>}
            {upcoming.visits.filter((v) => !filming.some((i) => i.jobVisitId === v.id)).map((v) => (
              <button key={v.id} onClick={() => add(`Job walkthrough: ${v.client || v.title}`, 'video', { jobDate: v.start, jobClient: v.client || v.title, jobVisitId: v.id })}
                className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-surface-alt cursor-pointer">
                <span className="w-24 shrink-0 text-xs font-bold text-muted">{dayLabel(v.start)}</span>
                <span className="flex-1 text-sm text-primary truncate">{v.client || v.title}</span>
                <span className="text-xs font-black text-brand">🎥 Film</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// One idea: title, inspiration link, script.
function IdeaCard({ idea: i, open, onToggle, patch, remove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: i.id });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined, position: 'relative' };
  const link = /^https?:\/\//i.test(i.link || '') ? i.link : (i.link ? `https://${i.link}` : '');
  return (
    <div ref={setNodeRef} style={style} className={`rounded-2xl bg-card border p-3 ${isDragging ? 'border-brand shadow-xl opacity-90' : 'border-card-border'}`}>
      <div className="flex items-start gap-2">
        <button {...attributes} {...listeners} title="Drag to reorder" aria-label="Drag to reorder"
          className="shrink-0 -ml-1 mt-0.5 p-0.5 text-muted hover:text-primary cursor-grab active:cursor-grabbing touch-none">
          <GripVertical size={16} />
        </button>
        {open ? (
          <AutoText value={i.title} onChange={(v) => patch({ title: v })}
            className="flex-1 min-w-0 bg-surface-alt rounded-xl px-3 py-2 text-sm font-bold text-primary outline-none focus:ring-1 focus:ring-brand" />
        ) : (
        <button onClick={onToggle} className="flex-1 min-w-0 text-left cursor-pointer">
          <p className="text-sm font-bold text-primary whitespace-pre-wrap break-words">{i.title}</p>
          {!open && (i.script || i.link || (i.clips || []).length > 0) && <p className="text-[11px] text-muted">{[i.script ? 'Script ✓' : '', i.link ? 'Inspiration ✓' : '', (i.clips || []).length ? `Clips ${(i.clips || []).filter((c) => c.done).length}/${(i.clips || []).length}` : ''].filter(Boolean).join(' · ')}</p>}
        </button>
        )}
        {link && !open && <a href={link} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs font-bold text-brand hover:underline pt-0.5">Inspiration ↗</a>}
        {open && <button onClick={onToggle} className="shrink-0 text-xs font-black text-brand px-2 py-2 cursor-pointer">Done</button>}
      </div>
      {open && (
        <div className="mt-2 space-y-2">
          <input value={i.link || ''} onChange={(e) => patch({ link: e.target.value.trim() })} placeholder="Inspiration link (TikTok, Reel, YouTube…)"
            className="w-full bg-surface-alt rounded-xl px-3 py-2 text-sm text-primary outline-none focus:ring-1 focus:ring-brand" />
          <ScriptBox idea={i} onChange={(script) => patch({ script })} />
          <ClipList
            clips={i.clips || []}
            onAdd={(t) => patch({ clips: [...(i.clips || []), { id: `c-${Date.now().toString(36)}`, text: t, done: false }] })}
            onToggle={(c) => patch({ clips: (i.clips || []).map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)) })}
            onRemove={(c) => patch({ clips: (i.clips || []).filter((x) => x.id !== c.id) })} />
          <div className="flex justify-end">
            <button onClick={remove} className="inline-flex items-center gap-1 text-xs font-bold text-muted hover:text-rose-400 cursor-pointer"><Trash2 size={13} /> Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Script for one video: just a box to write it in.
function ScriptBox({ idea, onChange }) {
  return (
    <div>
      <span className="text-[11px] font-black uppercase tracking-wider text-muted">Script</span>
      <AutoText value={idea.script || ''} onChange={onChange} minRows={4}
        placeholder="Hook, shots, what to say…"
        className="mt-1 w-full bg-surface-alt rounded-xl px-3 py-2 text-sm text-primary outline-none focus:ring-1 focus:ring-brand" />
    </div>
  );
}

// Text box that grows to fit what's typed (wraps instead of running off the side).
// onEnter: Enter submits, Shift+Enter adds a new line.
function AutoText({ value, onChange, onEnter, minRows = 1, className = '', placeholder }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea ref={ref} value={value} rows={minRows} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (onEnter && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEnter(); } }}
      className={`${className} resize-none overflow-hidden`} />
  );
}

// Clips to get for one idea: a quick checklist of shots to grab.
function ClipList({ clips, onAdd, onToggle, onRemove }) {
  const [v, setV] = useState('');
  const submit = () => { if (v.trim()) { onAdd(v.trim()); setV(''); } };
  return (
    <div>
      <span className="text-[11px] font-black uppercase tracking-wider text-muted">Clips to get</span>
      {clips.map((c) => (
        <div key={c.id} className="flex items-start gap-2 py-1 group">
          <button onClick={() => onToggle(c)} className={`mt-0.5 shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center cursor-pointer ${c.done ? 'bg-brand border-brand' : 'border-card-border hover:border-brand'}`}>
            {c.done && <span className="text-black text-xs font-black">✓</span>}
          </button>
          <p className={`flex-1 text-sm whitespace-pre-wrap break-words ${c.done ? 'text-tertiary line-through' : 'text-primary'}`}>{c.text}</p>
          <button onClick={() => onRemove(c)} title="Delete" className="shrink-0 sm:opacity-0 sm:group-hover:opacity-100 p-0.5 text-muted hover:text-rose-400 cursor-pointer"><Trash2 size={13} /></button>
        </div>
      ))}
      <div className="flex items-start gap-1.5">
        <Plus size={14} className="text-muted shrink-0 mt-2" />
        <AutoText value={v} onChange={setV} onEnter={submit} placeholder="Add a clip to get…"
          className="flex-1 bg-transparent text-sm text-primary outline-none placeholder:text-muted py-1.5" />
      </div>
    </div>
  );
}
