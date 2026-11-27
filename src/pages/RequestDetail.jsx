import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CalendarPlus, ChevronDown, ExternalLink, Pencil, Phone, MessageSquare, Mail, MapPin, Truck, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Pill } from './RequestsList';

// One request, laid out like Jobber's request page. Everything here reads/writes Jobber directly.

const phoneFmt = (p) => { const d = String(p || '').replace(/\D/g, '').slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p || ''; };
const when = (iso, opts = {}) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', ...opts }) : '');
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function RequestDetail({ id, onBack, onChanged }) {
  const { session } = useAuth();
  const token = session?.access_token || '';
  const [r, setR] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [menu, setMenu] = useState(false);
  const [sched, setSched] = useState(null); // { date, time, minutes, instructions }
  const [note, setNote] = useState('');
  const [title, setTitle] = useState(null);

  const load = () => {
    if (!token) return;
    fetch(`/api/jobber-data?action=request-detail&id=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((x) => x.json()).then((d) => (d.error ? setErr(d.error) : (setErr(''), setR(d)))).catch(() => setErr('Could not reach Jobber'));
  };
  useEffect(load, [id, token]);

  const act = async (op, body = {}) => {
    setBusy(op); setErr(''); setMenu(false);
    try {
      const x = await fetch('/api/jobber-data?action=request-action', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ id, op, ...body }) });
      const d = await x.json();
      if (!x.ok) throw new Error(d.error || 'Jobber said no');
      load(); onChanged?.();
      return true;
    } catch (e) { setErr(e.message); return false; } finally { setBusy(''); }
  };

  const archived = r?.status === 'archived';
  const a = r?.assessment;
  const answers = (r?.answers || []).filter((s) => s.items.length && s.label !== 'Contact information');

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-secondary hover:text-primary cursor-pointer"><ArrowLeft size={15} /> All requests</button>
      {err && <p className="rounded-lg bg-red-500/10 text-red-400 px-3 py-2 text-sm">{err}</p>}
      {!r && !err && <p className="py-16 text-center text-sm text-muted">Loading request from Jobber…</p>}
      {r && (
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="space-y-4 min-w-0">
            {/* Header */}
            <div className="rounded-xl border border-border-subtle bg-card p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <Pill s={r.status} />
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <button onClick={() => setMenu((m) => !m)} className="inline-flex items-center gap-1 rounded-lg border border-border-subtle px-3 py-2 text-sm font-semibold text-primary hover:bg-surface-alt cursor-pointer">More <ChevronDown size={14} /></button>
                    {menu && (
                      <div className="absolute right-0 top-full mt-1 z-20 w-56 rounded-xl border border-border-subtle bg-card shadow-2xl py-1.5 text-sm">
                        <Link to={`/quotes?new=1&client=${encodeURIComponent(r.clientId || '')}&request=${encodeURIComponent(r.id)}`} onClick={() => setMenu(false)} className="block px-3 py-2 text-secondary hover:bg-surface-alt hover:text-primary">Convert to Quote</Link>
                        <a href={r.url} target="_blank" rel="noreferrer" onClick={() => setMenu(false)} className="flex items-center justify-between px-3 py-2 text-secondary hover:bg-surface-alt hover:text-primary">Convert to Job <ExternalLink size={12} /></a>
                        <div className="my-1 border-t border-border-subtle" />
                        <button onClick={() => act(archived ? 'unarchive' : 'archive')} disabled={!!busy} className="w-full text-left px-3 py-2 text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer">{archived ? 'Unarchive' : 'Archive'}</button>
                        <button onClick={() => { setMenu(false); window.print(); }} className="w-full text-left px-3 py-2 text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer">Print</button>
                        <a href={r.url} target="_blank" rel="noreferrer" onClick={() => setMenu(false)} className="flex items-center justify-between px-3 py-2 text-secondary hover:bg-surface-alt hover:text-primary">Open in Jobber <ExternalLink size={12} /></a>
                      </div>
                    )}
                  </div>
                  {!a && !archived && (
                    <button onClick={() => setSched({ date: ymd(new Date(Date.now() + 86400000)), time: '09:00', minutes: 60, instructions: '' })} className="inline-flex items-center gap-1.5 rounded-lg bg-[#7DC243] px-3 py-2 text-sm font-bold text-black hover:brightness-110 cursor-pointer">
                      <CalendarPlus size={15} /> Schedule Assessment
                    </button>
                  )}
                </div>
              </div>

              {title == null ? (
                <h2 className="mt-3 text-3xl font-black text-primary flex items-center gap-3">{r.title || 'Untitled request'}
                  <button onClick={() => setTitle(r.title)} title="Edit title" className="text-muted hover:text-primary cursor-pointer"><Pencil size={16} /></button>
                </h2>
              ) : (
                <div className="mt-3 flex gap-2">
                  <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className="flex-1 rounded-lg border border-border-subtle bg-surface-alt px-3 py-2 text-lg font-bold text-primary" />
                  <button onClick={async () => { if (await act('title', { title })) setTitle(null); }} className="rounded-lg bg-brand px-3 text-sm font-bold text-white cursor-pointer">Save</button>
                  <button onClick={() => setTitle(null)} className="rounded-lg border border-border-subtle px-3 text-sm text-secondary cursor-pointer">Cancel</button>
                </div>
              )}

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-border-subtle p-4">
                  {r.hubClientId
                    ? <Link to={`/clients/${r.hubClientId}`} className="font-bold text-primary hover:underline">{r.client}</Link>
                    : <p className="font-bold text-primary">{r.client}</p>}
                  {r.address && <a href={`https://maps.google.com/?q=${encodeURIComponent(r.address)}`} target="_blank" rel="noreferrer" className="mt-1.5 flex items-start gap-1.5 text-sm text-secondary hover:text-primary"><MapPin size={14} className="mt-0.5 shrink-0" />{r.address}</a>}
                  {r.phone && (
                    <div className="mt-1.5 flex items-center gap-3 text-sm">
                      <a href={`tel:${r.phone}`} className="flex items-center gap-1.5 text-brand hover:underline"><Phone size={14} />{phoneFmt(r.phone)}</a>
                      <a href={`sms:${r.phone}`} className="flex items-center gap-1 text-xs text-secondary hover:text-primary"><MessageSquare size={13} /> Text</a>
                    </div>
                  )}
                  {r.email && <a href={`mailto:${r.email}`} className="mt-1.5 flex items-center gap-1.5 text-sm text-brand hover:underline truncate"><Mail size={14} />{r.email}</a>}
                </div>
                <div className="text-sm divide-y divide-border-subtle">
                  <div className="flex justify-between py-2"><span className="text-tertiary">Requested</span><span className="text-primary font-semibold">{when(r.createdAt)}</span></div>
                  <div className="flex justify-between py-2"><span className="text-tertiary">Salesperson</span><span className="text-primary font-semibold">{r.salesperson || '—'}</span></div>
                  <div className="flex justify-between py-2"><span className="text-tertiary">Came from</span><span className="text-primary font-semibold">{r.source === 'internal' ? 'Added by hand' : r.source === 'Hubb' ? 'Hub' : r.source === 'embedded_inline' ? 'Website form' : r.source || '—'}</span></div>
                  {[...r.quotes.map((q) => [`Quote #${q.quoteNumber}`, q.jobberWebUri, q.quoteStatus]), ...r.jobs.map((j) => [`Job #${j.jobNumber}`, j.jobberWebUri, j.jobStatus])].map(([l, u, s]) => (
                    <a key={l} href={u} target="_blank" rel="noreferrer" className="flex justify-between py-2 hover:text-primary"><span className="text-tertiary">{l}</span><span className="text-brand font-semibold inline-flex items-center gap-1">{String(s || '').replace(/_/g, ' ')} <ExternalLink size={11} /></span></a>
                  ))}
                </div>
              </div>
            </div>

            {/* Overview: what they filled in */}
            <div className="rounded-xl border border-border-subtle bg-card p-5">
              <p className="text-xl font-black text-primary">Overview</p>
              {!answers.length && <p className="mt-2 text-sm text-muted">No form answers.</p>}
              {answers.map((sec, i) => (
                <div key={i} className="mt-3">
                  <p className="font-bold text-primary text-sm">{sec.label}</p>
                  {sec.items.map((it, j) => (
                    <div key={j} className="mt-1.5">
                      <p className="text-xs text-tertiary">{it.label}</p>
                      <p className="text-sm text-primary whitespace-pre-wrap">{it.answer || '—'}</p>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* On-site assessment */}
            <div className="rounded-xl border border-border-subtle bg-card p-5">
              <p className="text-xl font-black text-primary">On-site assessment</p>
              {a ? (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-border-subtle p-4">
                  <div>
                    <p className="font-semibold text-primary">{when(a.startAt, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</p>
                    {a.instructions && <p className="text-sm text-secondary mt-1 whitespace-pre-wrap">{a.instructions}</p>}
                    {a.isComplete && <p className="text-xs text-emerald-500 mt-1">✓ Completed {when(a.completedAt)}</p>}
                  </div>
                  {!a.isComplete && (
                    <button onClick={() => act('assessment-complete', { assessmentId: a.id })} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle px-3 py-2 text-sm font-semibold text-primary hover:bg-surface-alt cursor-pointer disabled:opacity-50"><Check size={14} /> Mark complete</button>
                  )}
                </div>
              ) : (
                <button onClick={() => !archived && setSched({ date: ymd(new Date(Date.now() + 86400000)), time: '09:00', minutes: 60, instructions: '' })} className="mt-3 w-full rounded-lg border-2 border-dashed border-border-subtle py-8 text-center text-sm text-secondary hover:text-primary cursor-pointer">
                  <Truck size={22} className="mx-auto mb-2 opacity-60" />Visit the property to assess the job before you do the work
                </button>
              )}
              {sched && (
                <div className="mt-3 rounded-lg border border-border-subtle bg-surface-alt p-4 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="text-xs text-tertiary">Date<input type="date" value={sched.date} onChange={(e) => setSched({ ...sched, date: e.target.value })} className="mt-1 w-full rounded-lg border border-border-subtle bg-card px-2 py-1.5 text-sm text-primary" /></label>
                    <label className="text-xs text-tertiary">Start<input type="time" value={sched.time} onChange={(e) => setSched({ ...sched, time: e.target.value })} className="mt-1 w-full rounded-lg border border-border-subtle bg-card px-2 py-1.5 text-sm text-primary" /></label>
                    <label className="text-xs text-tertiary">Length<select value={sched.minutes} onChange={(e) => setSched({ ...sched, minutes: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-border-subtle bg-card px-2 py-1.5 text-sm text-primary">{[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} hr`}</option>)}</select></label>
                  </div>
                  <textarea value={sched.instructions} onChange={(e) => setSched({ ...sched, instructions: e.target.value })} placeholder="Instructions (optional)" rows={2} className="w-full rounded-lg border border-border-subtle bg-card px-3 py-2 text-sm text-primary" />
                  <div className="flex gap-2">
                    <button onClick={async () => { if (await act('assessment', sched)) setSched(null); }} disabled={!!busy} className="rounded-lg bg-[#7DC243] px-4 py-2 text-sm font-bold text-black cursor-pointer disabled:opacity-50">{busy === 'assessment' ? 'Scheduling…' : 'Schedule in Jobber'}</button>
                    <button onClick={() => setSched(null)} className="rounded-lg border border-border-subtle px-4 py-2 text-sm text-secondary cursor-pointer">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="rounded-xl border border-border-subtle bg-card p-4 h-fit">
            <p className="text-lg font-black text-primary">Notes</p>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Leave an internal note for yourself or a team member" rows={3} className="mt-2 w-full rounded-lg border border-border-subtle bg-surface-alt px-3 py-2 text-sm text-primary" />
            {note.trim() && <button onClick={async () => { if (await act('note', { message: note })) setNote(''); }} disabled={!!busy} className="mt-2 rounded-lg bg-brand px-3 py-1.5 text-sm font-bold text-white cursor-pointer disabled:opacity-50">{busy === 'note' ? 'Saving…' : 'Save note'}</button>}
            <div className="mt-3 space-y-3">
              {r.notes.map((n) => (
                <div key={n.id} className="border-t border-border-subtle pt-2">
                  <p className="text-sm text-primary whitespace-pre-wrap">{n.message}</p>
                  <p className="text-[11px] text-muted mt-1">{when(n.createdAt, { hour: 'numeric', minute: '2-digit' })}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
