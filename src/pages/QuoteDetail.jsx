import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ExternalLink, Phone, MessageSquare, Mail, MapPin, Eye, Link2, Send, X, Pencil, Hammer, Copy, CheckCircle2, Clock, PenLine, Printer, Trash2, Pin } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { QuotePill } from './QuotesList';
import NewQuote from './NewQuote';

// One quote, laid out like Jobber's quote page. Reads Jobber; archive + notes write to Jobber.
const money = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const phoneFmt = (p) => { const d = String(p || '').replace(/\D/g, '').slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p || ''; };
const when = (iso, o = {}) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', ...o }) : '—');

export default function QuoteDetail({ id, onBack, onChanged, openText, openEmail }) {
  const { session } = useAuth();
  const token = session?.access_token || '';
  const [qt, setQt] = useState(null);
  const [editing, setEditing] = useState(false);
  const [converting, setConverting] = useState(false);
  const [editNote, setEditNote] = useState(null); // { id, message }
  const nav = useNavigate();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [menu, setMenu] = useState(false);
  const [note, setNote] = useState('');
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [link, setLink] = useState(null); // { url, response }
  const [textOpen, setTextOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const getLink = async (fresh) => {
    if (link && !fresh) return link;
    const r = await fetch('/api/jobber-data?action=quote-link', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ id }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Could not make a link');
    setLink(d); return d;
  };
  useEffect(() => { if (token) getLink().catch(() => {}); }, [token, id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (openText && qt) setTextOpen(true); if (openEmail && qt) setEmailOpen(true); }, [openText, openEmail, qt]);
  const load = () => {
    if (!token) return;
    fetch(`/api/jobber-data?action=quote-detail&id=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((x) => x.json()).then((d) => (d.error ? setErr(d.error) : (setErr(''), setQt(d)))).catch(() => setErr('Could not reach Jobber'));
  };
  useEffect(load, [id, token]);
  const hubStatus = async (status) => {
    setMenu(false); setErr('');
    const r = await fetch('/api/jobber-data?action=quote-hub-status', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ id, status }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(d.error || 'Could not save'); return; }
    getLink(true).catch(() => {}); load(); onChanged?.();
  };
  const act = async (op, body = {}) => {
    setBusy(op); setErr(''); setMenu(false);
    try {
      const x = await fetch('/api/jobber-data?action=quote-action', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ id, op, ...body }) });
      const d = await x.json();
      if (!x.ok) throw new Error(d.error || 'Jobber said no');
      load(); onChanged?.();
      return true;
    } catch (e) { setErr(e.message); return false; } finally { setBusy(''); }
  };
  const a = qt?.amounts || {};
  if (editing && qt) {
    return <NewQuote edit={qt} onBack={() => setEditing(false)} onCreated={(d) => { setEditing(false); load(); onChanged?.(); if (d.text) setTextOpen(true); if (d.email) setEmailOpen(true); window.scrollTo({ top: 0 }); }} />;
  }
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-secondary hover:text-primary cursor-pointer"><ArrowLeft size={15} /> All quotes</button>
      {err && <p className="rounded-lg bg-red-500/10 text-red-400 px-3 py-2 text-sm">{err}</p>}
      {copied && <p className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 rounded-full bg-card border border-border-default px-4 py-2 text-sm text-primary shadow-2xl">Quote link copied</p>}
      {!qt && !err && <p className="py-16 text-center text-sm text-muted">Loading quote from Jobber…</p>}
      {qt && (
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="space-y-4 min-w-0">
            <div className="rounded-xl border border-border-subtle bg-card p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">{link?.response?.status === 'approved' ? <QuotePill s="approved" /> : qt.status === 'draft' && link?.sent ? <QuotePill s="awaiting_response" /> : <QuotePill s={qt.status} />}{qt.viewedAt && <span className="inline-flex items-center gap-1 text-xs text-tertiary"><Eye size={12} /> Seen {when(qt.viewedAt, { hour: 'numeric', minute: '2-digit' })}</span>}</div>
                <div className="flex items-center gap-2">
                  {qt.status !== 'archived' && qt.status !== 'converted' && <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle px-3 py-2 text-sm font-semibold text-primary hover:bg-surface-alt cursor-pointer"><Pencil size={14} /> Edit</button>}
                  <div className="relative">
                    <button onClick={() => setMenu((m) => !m)} className="inline-flex items-center gap-1 rounded-lg border border-border-subtle px-3 py-2 text-sm font-semibold text-primary hover:bg-surface-alt cursor-pointer">More <ChevronDown size={14} /></button>
                    {menu && (
                      <div className="absolute right-0 top-full mt-1 z-20 w-60 rounded-xl border border-border-subtle bg-card shadow-2xl py-1.5 text-sm">
                        {qt.status !== 'archived' && qt.status !== 'converted' && <button onClick={() => { setMenu(false); setConverting(true); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer"><Hammer size={15} /> Convert to Job</button>}
                        <button onClick={() => { setMenu(false); nav(`/quotes?new=1&similar=${encodeURIComponent(id)}`); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer"><Copy size={15} /> Create Similar Quote</button>
                        <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Send as…</p>
                        <button onClick={() => { setMenu(false); setTextOpen(true); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer"><MessageSquare size={15} /> Text (Quo)</button>
                        <button onClick={() => { setMenu(false); setEmailOpen(true); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer"><Mail size={15} /> Email</button>
                        <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Mark as…</p>
                        <button onClick={() => hubStatus('awaiting')} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer"><Clock size={15} /> Awaiting Response</button>
                        <button onClick={() => hubStatus('approved')} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer"><CheckCircle2 size={15} /> Approved</button>
                        {link?.response && <button onClick={() => hubStatus('clear')} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer"><X size={15} /> Clear Hub approval</button>}
                        <div className="my-1 border-t border-border-subtle" />
                        {link && <a href={link.url} target="_blank" rel="noreferrer" onClick={() => setMenu(false)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer"><Eye size={15} /> Preview as Client</a>}
                        {link && <a href={link.url} target="_blank" rel="noreferrer" onClick={() => setMenu(false)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer"><PenLine size={15} /> Collect Signature</a>}
                        {link && <a href={`${link.url}${link.url.includes('?') ? '&' : '?'}print=1`} target="_blank" rel="noreferrer" onClick={() => setMenu(false)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer"><Printer size={15} /> Print or Save PDF</a>}
                        <button onClick={async () => { setMenu(false); try { const l = await getLink(); await navigator.clipboard.writeText(l.url); setErr(''); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch (e) { setErr(e.message); } }} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer"><Link2 size={15} /> Copy quote link</button>
                        <a href={qt.url} target="_blank" rel="noreferrer" onClick={() => setMenu(false)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer"><ExternalLink size={15} /> Open in Jobber</a>
                        {qt.status === 'draft'
                          ? <a href={qt.url} target="_blank" rel="noreferrer" onClick={() => setMenu(false)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer text-red-400"><Trash2 size={15} /> Delete (in Jobber)</a>
                          : qt.status !== 'archived' && <button onClick={() => { setMenu(false); setConfirmArchive(true); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer"><Trash2 size={15} /> Archive</button>}
                      </div>
                    )}
                  </div>
                  {qt.status !== 'archived' && qt.status !== 'converted' && link?.response?.status !== 'approved' && (
                    <>
                      <button onClick={() => setEmailOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border-default px-3 py-2 text-sm font-semibold text-primary hover:bg-surface-alt cursor-pointer"><Mail size={14} /> Email</button>
                      <button onClick={() => setTextOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#7DC243] px-3 py-2 text-sm font-bold text-black hover:brightness-110 cursor-pointer"><MessageSquare size={14} /> {qt.status === 'draft' && !link?.sent ? 'Send Quote' : 'Resend'}</button>
                    </>
                  )}
                  {(qt.status === 'approved' || link?.response?.status === 'approved') && <button onClick={() => setConverting(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#7DC243] px-3 py-2 text-sm font-bold text-black hover:brightness-110 cursor-pointer"><Hammer size={14} /> Convert to Job</button>}
                </div>
              </div>
              {confirmArchive && (
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-surface-alt p-3 text-sm">
                  <span className="text-primary">Archive quote #{qt.number} in Jobber?</span>
                  <button onClick={async () => { if (await act('archive')) setConfirmArchive(false); }} disabled={!!busy} className="rounded-lg bg-red-600 px-3 py-1 font-bold text-white cursor-pointer disabled:opacity-50">{busy === 'archive' ? 'Archiving…' : 'Archive'}</button>
                  <button onClick={() => setConfirmArchive(false)} className="text-secondary cursor-pointer">Cancel</button>
                </div>
              )}
              {link?.response && (
                <div className={`mt-3 rounded-lg px-3 py-2 text-sm ${link.response.status === 'approved' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
                  {link.response.status === 'approved' ? `✅ Approved in Hub ${link.response.signed ? '(signed)' : `by ${link.response.name}`}` : `✏️ Changes requested${link.response.name ? ` by ${link.response.name}` : ''}`} · {when(link.response.at, { hour: 'numeric', minute: '2-digit' })}
                  {link.response.note && <span className="block mt-1 text-secondary">“{link.response.note}”</span>}
                  {link.response.optional?.length > 0 && <span className="block mt-1">Added optional: {link.response.optional.map((x) => `${x.name} (${money(x.total)})`).join(', ')}{link.response.total ? ` · new total ${money(link.response.total)}` : ''}</span>}
                  {link.response.signature && <img src={link.response.signature} alt="signature" className="mt-2 h-14 rounded bg-white px-2" />}
                </div>
              )}
              <p className="mt-3 text-sm text-tertiary">Quote #{qt.number}</p>
              <h2 className="text-3xl font-black text-primary">{qt.client}</h2>
              {qt.title && <p className="mt-1 text-lg text-secondary">{qt.title}</p>}
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-border-subtle p-4">
                  {qt.hubClientId ? <Link to={`/clients/${qt.hubClientId}`} className="font-bold text-primary hover:underline">{qt.client}</Link> : <p className="font-bold text-primary">{qt.client}</p>}
                  {qt.address && <a href={`https://maps.google.com/?q=${encodeURIComponent(qt.address)}`} target="_blank" rel="noreferrer" className="mt-1.5 flex items-start gap-1.5 text-sm text-secondary hover:text-primary"><MapPin size={14} className="mt-0.5 shrink-0" />{qt.address}</a>}
                  {qt.phone && <div className="mt-1.5 flex items-center gap-3 text-sm"><a href={`tel:${qt.phone}`} className="flex items-center gap-1.5 text-brand hover:underline"><Phone size={14} />{phoneFmt(qt.phone)}</a><a href={`sms:${qt.phone}`} className="flex items-center gap-1 text-xs text-secondary hover:text-primary"><MessageSquare size={13} /> Text</a></div>}
                  {qt.email && <a href={`mailto:${qt.email}`} className="mt-1.5 flex items-center gap-1.5 text-sm text-brand hover:underline truncate"><Mail size={14} />{qt.email}</a>}
                </div>
                <div className="text-sm divide-y divide-border-subtle">
                  {[['Created', when(qt.createdAt)], ['Sent', when(link?.sent?.at || qt.sentAt)], ['Last change', when(qt.changedAt)], ['Salesperson', qt.salesperson || '—'], ...(a.depositAmount ? [['Required deposit', money(a.depositAmount)]] : [])].map(([l, v]) => (
                    <div key={l} className="flex justify-between py-2"><span className="text-tertiary">{l}</span><span className="text-primary font-semibold">{v}</span></div>
                  ))}
                  {qt.request && <Link to={`/leads?r=${encodeURIComponent(qt.request.id)}`} className="flex justify-between py-2"><span className="text-tertiary">Request</span><span className="text-brand font-semibold">{qt.request.title || 'Open'}</span></Link>}
                  {qt.jobs.map((j) => <a key={j.id} href={j.jobberWebUri} target="_blank" rel="noreferrer" className="flex justify-between py-2"><span className="text-tertiary">Job #{j.jobNumber}</span><span className="text-brand font-semibold inline-flex items-center gap-1">{String(j.jobStatus || '').replace(/_/g, ' ')} <ExternalLink size={11} /></span></a>)}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border-subtle bg-card p-5">
              <p className="text-xl font-black text-primary">Product / Service</p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-tertiary border-b border-border-subtle"><th className="text-left py-2 font-semibold">Line item</th><th className="text-right py-2 font-semibold">Qty</th><th className="text-right py-2 font-semibold">Unit price</th><th className="text-right py-2 font-semibold">Total</th></tr></thead>
                  <tbody>
                    {qt.lineItems.map((l, i) => (l.textOnly ? (
                      <tr key={i} className="border-b border-border-subtle"><td colSpan={4} className="py-2.5 text-sm text-secondary whitespace-pre-wrap">{l.description || l.name}</td></tr>
                    ) : (
                      <tr key={i} className="border-b border-border-subtle align-top">
                        <td className="py-2.5 pr-3"><p className="font-semibold text-primary">{l.name}{l.optional && <span className="ml-2 text-xs text-tertiary">(optional)</span>}{l.optional && link?.response?.optional?.some((x) => x.id === l.id) && <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">client added</span>}</p>{l.description && <p className="text-xs text-tertiary whitespace-pre-wrap mt-0.5">{l.description}</p>}</td>
                        <td className="py-2.5 text-right text-secondary">{l.qty}</td>
                        <td className="py-2.5 text-right text-secondary">{money(l.unit)}</td>
                        <td className="py-2.5 text-right font-semibold text-primary">{money(l.total)}</td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 ml-auto max-w-xs text-sm space-y-1">
                {a.subtotal != null && <p className="flex justify-between text-secondary"><span>Subtotal</span><span>{money(a.subtotal)}</span></p>}
                {!!a.discountAmount && <p className="flex justify-between text-secondary"><span>Discount</span><span>−{money(a.discountAmount)}</span></p>}
                {!!a.taxAmount && <p className="flex justify-between text-secondary"><span>Tax</span><span>{money(a.taxAmount)}</span></p>}
                <p className="flex justify-between text-lg font-black text-primary border-t border-border-subtle pt-1"><span>Total</span><span>{money(a.total)}</span></p>
                {!!a.depositAmount && <p className="flex justify-between text-secondary"><span>Required deposit</span><span>{money(a.depositAmount)}</span></p>}
              </div>
              {qt.message && <p className="mt-4 text-sm text-secondary whitespace-pre-wrap border-t border-border-subtle pt-3">{qt.message}</p>}
              {qt.disclaimer && <div className="mt-4 border-t border-border-subtle pt-3"><p className="text-sm font-bold text-primary">Contract / Disclaimer</p><p className="mt-1 text-sm text-secondary whitespace-pre-wrap">{qt.disclaimer}</p></div>}
            </div>
          </div>

          <div className="rounded-xl border border-border-subtle bg-card p-4 h-fit">
            <p className="text-lg font-black text-primary">Notes</p>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Leave an internal note for yourself or a team member" rows={3} className="mt-2 w-full rounded-lg border border-border-subtle bg-surface-alt px-3 py-2 text-sm text-primary" />
            {note.trim() && <button onClick={async () => { if (await act('note', { message: note })) setNote(''); }} disabled={!!busy} className="mt-2 rounded-lg bg-brand px-3 py-1.5 text-sm font-bold text-white cursor-pointer disabled:opacity-50">{busy === 'note' ? 'Saving…' : 'Save note'}</button>}
            <div className="mt-3 space-y-3">
              {qt.notes.slice().sort((x, y) => (y.pinned ? 1 : 0) - (x.pinned ? 1 : 0)).map((n) => (
                <div key={n.id} className="group border-t border-border-subtle pt-2">
                  {editNote?.id === n.id ? (
                    <>
                      <textarea autoFocus rows={3} value={editNote.message} onChange={(e) => setEditNote({ ...editNote, message: e.target.value })} className="w-full rounded-lg border border-border-default bg-surface px-2 py-1.5 text-sm text-primary" />
                      <div className="mt-1 flex gap-2"><button onClick={async () => { if (await act('note-edit', { noteId: n.id, message: editNote.message })) setEditNote(null); }} disabled={!!busy} className="rounded-md bg-[#7DC243] px-2.5 py-1 text-xs font-bold text-black cursor-pointer disabled:opacity-50">{busy === 'note-edit' ? 'Saving…' : 'Save'}</button><button onClick={() => setEditNote(null)} className="text-xs text-secondary cursor-pointer">Cancel</button></div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-start gap-2">
                        <p className="flex-1 text-sm text-primary whitespace-pre-wrap">{n.pinned && <Pin size={12} className="inline mr-1 text-[#7DC243]" />}{n.message}</p>
                        <span className="flex gap-1.5 opacity-0 group-hover:opacity-100">
                          <button onClick={() => act('note-pin', { noteId: n.id, pinned: !n.pinned })} title={n.pinned ? 'Unpin' : 'Pin'} className="text-muted hover:text-primary cursor-pointer"><Pin size={13} /></button>
                          <button onClick={() => setEditNote({ id: n.id, message: n.message })} title="Edit" className="text-muted hover:text-primary cursor-pointer"><Pencil size={13} /></button>
                        </span>
                      </div>
                      <p className="text-[11px] text-muted mt-1">{when(n.createdAt, { hour: 'numeric', minute: '2-digit' })}</p>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {textOpen && qt && <TextQuote qt={qt} token={token} getLink={getLink} onClose={() => setTextOpen(false)} onSent={() => { setTextOpen(false); load(); getLink(true).catch(() => {}); onChanged?.(); }} />}
      {converting && qt && <ConvertJob qt={qt} token={token} picked={link?.response?.optional || []} onClose={() => setConverting(false)} onDone={() => { setConverting(false); load(); onChanged?.(); }} />}
      {emailOpen && qt && <EmailQuote qt={qt} token={token} getLink={getLink} onClose={() => setEmailOpen(false)} onSent={() => { setEmailOpen(false); load(); getLink(true).catch(() => {}); onChanged?.(); }} />}
    </div>
  );
}

// Convert to Job — like Jobber's: title, which lines go on the job, first visit (or schedule later), billing reminder.
function ConvertJob({ qt, token, picked, onClose, onDone }) {
  const pickedIds = new Set(picked.map((x) => x.id));
  const [title, setTitle] = useState(qt.title || '');
  const [lineIds, setLineIds] = useState(() => new Set(qt.lineItems.filter((l) => !l.optional || pickedIds.has(l.id)).map((l) => l.id)));
  const [later, setLater] = useState(false);
  const [date, setDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [anytime, setAnytime] = useState(true);
  const [time, setTime] = useState('09:00');
  const [minutes, setMinutes] = useState(120);
  const [team, setTeam] = useState([]);
  const [assign, setAssign] = useState([]);
  const [instructions, setInstructions] = useState('');
  const [remind, setRemind] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  useEffect(() => {
    fetch(`/api/jobber-today?range=${new Date().toLocaleDateString('en-CA')}&days=1`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).then((d) => setTeam(d.team || [])).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const total = qt.lineItems.filter((l) => lineIds.has(l.id) && !l.textOnly).reduce((n, l) => n + (Number(l.total) || 0), 0);
  const go = async () => {
    setErr(''); setBusy(true);
    try {
      const r = await fetch('/api/jobber-data?action=quote-convert', { method: 'POST', headers: auth, body: JSON.stringify({ id: qt.id, title, lineIds: [...lineIds], instructions, remindInvoice: remind }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Jobber said no');
      let visitErr = '';
      if (!later) {
        const v = await fetch('/api/jobber-today?schedule=1', { method: 'POST', headers: auth, body: JSON.stringify({ op: 'visit-create', jobId: d.job.id, date, time: anytime ? '' : time, allDay: anytime, minutes, title }) });
        const vd = await v.json().catch(() => ({}));
        if (!v.ok || vd.error) visitErr = vd.error || 'visit not added';
        const vid = vd.out?.createdVisits?.[0]?.id;
        if (!visitErr && assign.length && vid) await fetch('/api/jobber-today?schedule=1', { method: 'POST', headers: auth, body: JSON.stringify({ op: 'visit-assign', id: vid, userIds: assign }) }).catch(() => {});
      }
      setDone({ ...d.job, visitErr });
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const f = 'mt-1 w-full rounded-lg border border-border-default bg-surface px-3 py-2 text-sm text-primary';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-xl border border-border-default bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><p className="text-lg font-bold text-primary flex items-center gap-2"><Hammer size={18} /> Convert quote #{qt.number} to a job</p><button onClick={onClose} className="text-muted hover:text-primary cursor-pointer"><X size={18} /></button></div>
        {done ? (
          <div className="mt-4 space-y-3">
            <p className="rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-300">✅ Job #{done.jobNumber} created in Jobber{later ? ' — schedule it from Schedule.' : done.visitErr ? '' : ' with its first visit.'}</p>
            {done.visitErr && <p className="rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-300">Job made, but the visit didn't save: {done.visitErr}. Add it from Schedule.</p>}
            <div className="flex justify-end gap-2"><a href={done.jobberWebUri} target="_blank" rel="noreferrer" className="rounded-lg border border-border-default px-3 py-2 text-sm font-semibold text-primary">Open job in Jobber</a><button onClick={onDone} className="rounded-lg bg-[#7DC243] px-3 py-2 text-sm font-bold text-black cursor-pointer">Done</button></div>
          </div>
        ) : (
          <>
            <label className="mt-3 block text-xs text-tertiary">Job title<input value={title} onChange={(e) => setTitle(e.target.value)} className={f} /></label>
            <p className="mt-4 text-xs font-semibold text-tertiary">Line items on the job</p>
            <div className="mt-1 rounded-lg border border-border-subtle divide-y divide-border-subtle">
              {qt.lineItems.map((l) => (
                <label key={l.id} className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={lineIds.has(l.id)} onChange={(e) => setLineIds((s0) => { const n = new Set(s0); if (e.target.checked) n.add(l.id); else n.delete(l.id); return n; })} className="w-4 h-4 accent-[#7DC243]" />
                  <span className="flex-1 text-primary truncate">{l.textOnly ? (l.description || l.name) : l.name}{l.optional && <span className="ml-1.5 text-xs text-tertiary">(optional{pickedIds.has(l.id) ? ' · client added' : ''})</span>}</span>
                  {!l.textOnly && <span className="text-secondary">{money(l.total)}</span>}
                </label>
              ))}
            </div>
            <p className="mt-1 text-right text-xs text-tertiary">Lines total {money(total)} (before discount)</p>
            <p className="mt-4 text-xs font-semibold text-tertiary">First visit</p>
            <label className="mt-1 flex items-center gap-2 text-sm text-primary cursor-pointer"><input type="checkbox" checked={later} onChange={(e) => setLater(e.target.checked)} className="w-4 h-4 accent-[#7DC243]" /> Schedule later</label>
            {!later && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="text-xs text-tertiary">Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={f} /></label>
                <label className="text-xs text-tertiary">Assign<select value="" onChange={(e) => { const v = e.target.value; if (v) setAssign((x) => (x.includes(v) ? x : [...x, v])); }} className={`${f} cursor-pointer`}><option value="">{assign.length ? team.filter((t) => assign.includes(t.id)).map((t) => t.name.split(' ')[0]).join(', ') : 'Nobody yet'}</option>{team.filter((t) => !assign.includes(t.id)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
                <label className="col-span-2 flex items-center gap-2 text-sm text-primary cursor-pointer"><input type="checkbox" checked={anytime} onChange={(e) => setAnytime(e.target.checked)} className="w-4 h-4 accent-[#7DC243]" /> Anytime</label>
                {!anytime && <label className="text-xs text-tertiary">Start time<input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={f} /></label>}
                {!anytime && <label className="text-xs text-tertiary">Length<select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className={`${f} cursor-pointer`}>{[30, 60, 90, 120, 180, 240, 360, 480].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} hr`}</option>)}</select></label>}
                {assign.length > 0 && <button onClick={() => setAssign([])} className="col-span-2 text-left text-xs text-secondary underline cursor-pointer">Clear assigned</button>}
              </div>
            )}
            <label className="mt-3 block text-xs text-tertiary">Instructions for the crew<textarea rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} className={f} /></label>
            <label className="mt-3 flex items-center gap-2 text-sm text-primary cursor-pointer"><input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} className="w-4 h-4 accent-[#7DC243]" /> Remind me to invoice when I close the job</label>
            {err && <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{err}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={onClose} className="rounded-lg border border-border-default px-3 py-2 text-sm font-semibold text-primary cursor-pointer">Cancel</button>
              <button onClick={go} disabled={busy || !lineIds.size} className="inline-flex items-center gap-1.5 rounded-lg bg-[#7DC243] px-3 py-2 text-sm font-bold text-black cursor-pointer disabled:opacity-40"><Hammer size={14} /> {busy ? 'Creating…' : 'Create Job'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Email the quote link from Jude's own email app (opens a ready-to-send email).
function EmailQuote({ qt, token, getLink, onClose, onSent }) {
  const [to, setTo] = useState(qt.email || '');
  const [subject, setSubject] = useState(`Your quote from Hey Jude's${qt.title ? ` — ${qt.title}` : ''}`);
  const [body, setBody] = useState('');
  const first = String(qt.client || '').split(' ')[0];
  useEffect(() => {
    getLink().then((l) => setBody(`Hi ${first},\n\nHere's your quote from Hey Jude's Lawn Care${qt.title ? ` for ${qt.title.toLowerCase()}` : ''} — ${money(qt.amounts?.total)}.\n\nView and approve it here:\n${l.url}\n\nThanks!\nJude\nHey Jude's Lawn Care`)).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const open = async () => {
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    await fetch('/api/jobber-data?action=quote-sent', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ id: qt.id, to, via: 'email' }) }).catch(() => {});
    onSent();
  };
  const f = 'mt-1 w-full rounded-lg border border-border-default bg-surface px-3 py-2 text-sm text-primary';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border-default bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><p className="text-lg font-bold text-primary flex items-center gap-2"><Mail size={18} /> Email quote #{qt.number}</p><button onClick={onClose} className="text-muted hover:text-primary cursor-pointer"><X size={18} /></button></div>
        <p className="mt-1 text-xs text-tertiary">Opens your email app with this ready to send — the link goes to your Hub quote page.</p>
        <label className="mt-3 block text-xs text-tertiary">To<input value={to} onChange={(e) => setTo(e.target.value)} className={f} /></label>
        <label className="mt-3 block text-xs text-tertiary">Subject<input value={subject} onChange={(e) => setSubject(e.target.value)} className={f} /></label>
        <label className="mt-3 block text-xs text-tertiary">Message<textarea rows={8} value={body || 'Making link…'} onChange={(e) => setBody(e.target.value)} className={f} /></label>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border-default px-3 py-2 text-sm font-semibold text-primary cursor-pointer">Cancel</button>
          <button onClick={open} disabled={!body || !to.includes('@')} className="inline-flex items-center gap-1.5 rounded-lg bg-[#7DC243] px-3 py-2 text-sm font-bold text-black cursor-pointer disabled:opacity-40"><Mail size={14} /> Open email</button>
        </div>
      </div>
    </div>
  );
}

// Text the quote link from Jude's Quo number.
function TextQuote({ qt, token, getLink, onClose, onSent }) {
  const [to, setTo] = useState(qt.phone || '');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  const [sending, setSending] = useState(false);
  const first = String(qt.client || '').split(' ')[0];
  useEffect(() => {
    getLink().then((l) => {
      setMsg(`Hey ${first}! Here's your quote from Hey Jude's${qt.title ? ` for ${qt.title.toLowerCase()}` : ''} — ${money(qt.amounts?.total)}. Tap to view & approve:\n${l.url}`);
    }).catch((e) => setErr(e.message)).finally(() => setBusy(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const send = async () => {
    setErr(''); setSending(true);
    try {
      const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
      const th = await fetch('/api/quo?action=thread', { method: 'POST', headers: auth, body: JSON.stringify({ phone: to }) }).then((r) => r.json());
      if (th.error || !th.phoneNumberId) throw new Error(th.error || 'Quo is not connected');
      const r = await fetch('/api/quo?action=send', { method: 'POST', headers: auth, body: JSON.stringify({ phoneNumberId: th.phoneNumberId, to: th.to, content: msg }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Quo did not send it');
      await fetch('/api/jobber-data?action=quote-sent', { method: 'POST', headers: auth, body: JSON.stringify({ id: qt.id, to: th.to, via: 'text' }) }).catch(() => {});
      onSent();
    } catch (e) { setErr(e.message); } finally { setSending(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border-default bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><p className="text-lg font-bold text-primary flex items-center gap-2"><MessageSquare size={18} /> Text quote #{qt.number}</p><button onClick={onClose} className="text-muted hover:text-primary cursor-pointer"><X size={18} /></button></div>
        <p className="mt-1 text-xs text-tertiary">Sends from your Quo number. They tap the link to view and approve in Hub.</p>
        <label className="mt-3 block text-xs text-tertiary">To<input value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full rounded-lg border border-border-default bg-surface px-3 py-2 text-sm text-primary" /></label>
        <label className="mt-3 block text-xs text-tertiary">Message<textarea rows={6} value={busy ? 'Making link…' : msg} onChange={(e) => setMsg(e.target.value)} className="mt-1 w-full rounded-lg border border-border-default bg-surface px-3 py-2 text-sm text-primary" /></label>
        {err && <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{err}</p>}
        <div className="mt-4 flex items-center gap-2">
          <span className="mr-auto inline-flex items-center gap-1 text-xs text-muted"><Link2 size={12} /> link opens your Hub quote page</span>
          <button onClick={onClose} className="rounded-lg border border-border-default px-3 py-2 text-sm font-semibold text-primary cursor-pointer">Cancel</button>
          <button onClick={send} disabled={busy || sending || !msg.trim() || String(to).replace(/\D/g, '').length < 10} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-sm font-bold text-white cursor-pointer disabled:opacity-40"><Send size={14} /> {sending ? 'Sending…' : 'Send text'}</button>
        </div>
      </div>
    </div>
  );
}
