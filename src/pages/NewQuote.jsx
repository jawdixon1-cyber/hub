import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, GripVertical, ArrowUp, ArrowDown, X, ChevronDown, Mail, MessageSquare, Hammer, Send, Eye, FileText } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// New quote — same layout as Jobber's New Quote screen; saving creates it in Jobber.
const money = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const blank = (textOnly = false) => ({ key: Math.random().toString(36).slice(2), name: '', description: '', quantity: 1, unitPrice: '', productOrServiceId: null, optional: false, textOnly });
const DISCLAIMER = 'This quote is valid for 14 days. Approve within that window to lock in this price and reserve your spot on our schedule.';

// Jobber-style box with a small label on top once it has a value.
function Box({ label, value, onChange, className = '', type = 'text', inputProps = {}, area, rows = 4, right, alwaysUp }) {
  const [focus, setFocus] = useState(false);
  const up = alwaysUp || focus || (value !== '' && value != null);
  const cls = `w-full bg-transparent text-sm text-primary outline-none ${right ? 'text-right' : ''}`;
  return (
    <label className={`relative block rounded-lg border bg-surface ${focus ? 'border-[#7DC243]' : 'border-border-default'} px-3 ${up ? 'pt-[18px] pb-1.5' : 'py-2.5'} cursor-text ${className}`}>
      <span className={`absolute left-3 pointer-events-none transition-all ${up ? 'top-1 text-[11px] text-tertiary' : 'top-2.5 text-sm text-muted'}`}>{label}</span>
      {area
        ? <textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} className={`${cls} resize-y`} {...inputProps} />
        : <input type={type} value={value} onChange={(e) => onChange(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} className={cls} {...inputProps} />}
    </label>
  );
}
const link = 'text-sm font-semibold text-[#7DC243] underline underline-offset-2 cursor-pointer hover:brightness-110';
const ghost = 'rounded-md border border-border-default px-2.5 py-1 text-xs font-semibold text-[#7DC243] cursor-pointer hover:bg-surface-alt';

// edit = a quote from action=quote-detail → same screen, pre-filled, saves changes back to Jobber.
const pct = (part, whole) => (Number(whole) > 0 && Number(part) > 0 ? String(Math.round((Number(part) / Number(whole)) * 10000) / 100) : null);
const fromEdit = (q) => (q.lineItems || []).map((l) => ({ key: l.id, id: l.id, name: l.name, description: l.description || '', quantity: l.qty ?? 1, unitPrice: l.unit ?? '', productOrServiceId: l.productId || null, optional: !!l.optional, textOnly: !!l.textOnly }));

export default function NewQuote({ init = {}, nextNumber, onBack, onCreated, edit }) {
  const [tplOpen, setTplOpen] = useState(false);
  const [templates, setTemplates] = useState(null);
  const { session } = useAuth();
  const auth = { Authorization: `Bearer ${session?.access_token || ''}` };
  const [title, setTitle] = useState(edit?.title || '');
  const [client, setClient] = useState(edit ? { id: edit.clientId, name: edit.client, phone: edit.phone, email: edit.email, properties: [{ id: 'current', address: edit.address }], requests: [] } : null);
  const [cq, setCq] = useState('');
  const [found, setFound] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [clientMenu, setClientMenu] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [view, setView] = useState(edit?.view ? { showLineItemQty: edit.view.qty, showLineItemUnitCosts: edit.view.unit, showLineItemTotalCosts: edit.view.line, showTotals: edit.view.totals } : { showLineItemQty: false, showLineItemUnitCosts: false, showLineItemTotalCosts: true, showTotals: true }); // Jobber's defaults
  const [propertyId, setPropertyId] = useState(edit ? 'current' : '');
  const [requestId, setRequestId] = useState(init.requestId || '');
  const [number, setNumber] = useState(edit ? String(edit.number) : nextNumber ? String(nextNumber) : '');
  const [lines, setLines] = useState(() => (edit ? fromEdit(edit) : [blank()]));
  const [products, setProducts] = useState([]);
  const [pickFor, setPickFor] = useState(null);
  const [discount, setDiscount] = useState(edit ? pct(edit.amounts?.discountAmount, edit.amounts?.subtotal) : null); // null = not added
  const [deposit, setDeposit] = useState(edit ? pct(edit.amounts?.depositAmount, edit.amounts?.total) : null);
  const [message, setMessage] = useState(edit?.message ? edit.message : null);
  const [disclaimer, setDisclaimer] = useState(edit ? edit.disclaimer || '' : DISCLAIMER);
  const [showDisclaimer, setShowDisclaimer] = useState(edit ? !!edit.disclaimer : true);
  const [note, setNote] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMenu, setSaveMenu] = useState(false);
  const [err, setErr] = useState('');
  const [tried, setTried] = useState(false);
  const dragKey = useRef(null);

  useEffect(() => { if (!edit && nextNumber && !number) setNumber(String(nextNumber)); }, [nextNumber]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fetch('/api/jobber-data?action=products').then((r) => r.json()).then((d) => setProducts(d.items || [])).catch(() => {}); }, []);
  const loadClient = async (id) => {
    setErr(''); setPickerOpen(false);
    const d = await fetch(`/api/jobber-data?action=client-properties&id=${encodeURIComponent(id)}`, { headers: auth }).then((r) => r.json()).catch(() => ({ error: 'Could not reach Jobber' }));
    if (d.error) { setErr(d.error); return; }
    const hit = found.find((c) => c.id === id);
    setClient({ ...d, phone: d.phone || hit?.phone, email: d.email || hit?.email }); setCq(''); setErr('');
    setPropertyId(d.properties.length === 1 ? d.properties[0].id : '');
    if (init.requestId && d.requests.some((r) => r.id === init.requestId)) { setRequestId(init.requestId); setTitle((t) => t || d.requests.find((r) => r.id === init.requestId)?.title || ''); }
  };
  useEffect(() => { if (init.clientId) loadClient(init.clientId); }, [init.clientId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Fill lines + extras from a template or another quote (Create Similar Quote).
  const applySource = (src) => {
    const prod = (name) => products.find((p) => p.name.trim().toLowerCase() === String(name || '').trim().toLowerCase());
    const ls = (src.lineItems || []).map((l) => {
      const p = !l.textOnly ? prod(l.name) : null;
      // Templates often store $0 — use the price from Products & Services, like picking the item would.
      const unit = Number(l.unit) ? l.unit : p ? (p.unitPrice || p.price || '') : (l.unit ?? '');
      return { ...blank(!!l.textOnly), name: l.name || '', description: l.description || '', quantity: l.qty ?? 1, unitPrice: unit, productOrServiceId: l.productId || p?.id || null, optional: !!l.optional };
    });
    if (ls.length) setLines(ls);
    if (src.title != null && src.title !== '') setTitle(src.title);
    if (src.message) setMessage(src.message);
    if (src.disclaimer) { setDisclaimer(src.disclaimer); setShowDisclaimer(true); }
    if (src.deposit != null) setDeposit(String(src.deposit));
    if (src.amounts) { setDiscount(pct(src.amounts.discountAmount, src.amounts.subtotal)); setDeposit(pct(src.amounts.depositAmount, src.amounts.total)); }
    if (src.view) setView({ showLineItemQty: src.view.qty, showLineItemUnitCosts: src.view.unit, showLineItemTotalCosts: src.view.line, showTotals: src.view.totals });
  };
  useEffect(() => {
    if (!init.similarId || !session?.access_token) return;
    fetch(`/api/jobber-data?action=quote-detail&id=${encodeURIComponent(init.similarId)}`, { headers: auth }).then((r) => r.json()).then((d) => {
      if (d.error) { setErr(d.error); return; }
      applySource(d);
      if (d.clientId) loadClient(d.clientId).then(() => { if (d.propertyId) setPropertyId(d.propertyId); });
    }).catch(() => setErr('Could not load that quote'));
  }, [init.similarId, session?.access_token]); // eslint-disable-line react-hooks/exhaustive-deps
  const openTemplates = () => {
    setTplOpen((v) => !v);
    if (!templates) fetch('/api/jobber-data?action=quote-templates', { headers: auth }).then((r) => r.json()).then((d) => setTemplates(d.templates || [])).catch(() => setTemplates([]));
  };
  useEffect(() => {
    if (!pickerOpen) return undefined;
    const t0 = cq.trim();
    const t = setTimeout(() => {
      fetch(`/api/jobber-data?action=clients&q=${encodeURIComponent(t0 || 'a')}`).then((r) => r.json()).then((d) => setFound(Array.isArray(d) ? d.slice(0, 12) : [])).catch(() => {});
    }, t0 ? 250 : 0);
    return () => clearTimeout(t);
  }, [cq, pickerOpen]);

  const move = (key, dir) => setLines((ls) => { const i = ls.findIndex((x) => x.key === key); const j = i + dir; if (i < 0 || j < 0 || j >= ls.length) return ls; const a = [...ls]; [a[i], a[j]] = [a[j], a[i]]; return a; });
  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const lineTotal = (l) => (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0);
  const subtotal = useMemo(() => lines.filter((l) => !l.optional && !l.textOnly).reduce((t, l) => t + lineTotal(l), 0), [lines]);
  const disc = subtotal * (Number(discount) || 0) / 100;
  const total = subtotal - disc;
  const dep = total * (Number(deposit) || 0) / 100;
  const property = client?.properties.find((p) => p.id === propertyId);

  const save = async (opts = {}) => {
    setErr(''); setTried(true); setSaveMenu(false);
    if (!client) { setErr('Client is required'); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (!propertyId) { setErr('Property is required'); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (!lines.some((l) => l.name.trim())) { setErr('Add at least one line item'); return; }
    setSaving(true);
    if (edit) {
      try {
        const r = await fetch('/api/jobber-data?action=quote-update', {
          method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: edit.id, title, quoteNumber: number, message: message || '', disclaimer: showDisclaimer ? disclaimer : '',
            depositPercent: deposit || 0, discountPercent: discount || 0, clientView: view,
            lineItems: lines.map((l) => ({ ...l, unitPrice: Number(l.unitPrice) || 0 })),
          }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Jobber said no');
        if (note) await fetch('/api/jobber-data?action=quote-action', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: edit.id, op: 'note', message: note }) }).catch(() => {});
        onCreated?.({ ...d, id: edit.id, text: !!opts.text, email: !!opts.email });
      } catch (e) { setErr(e.message); } finally { setSaving(false); }
      return;
    }
    try {
      const r = await fetch('/api/jobber-data?action=quote-create', {
        method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client.id, propertyId, requestId: requestId || undefined, title, quoteNumber: number,
          message: message || '', disclaimer: showDisclaimer ? disclaimer : '', note: note || '',
          depositPercent: deposit || 0, discountPercent: discount || 0, awaiting: !!opts.awaiting, clientView: view,
          lineItems: lines.map((l) => ({ ...l, unitPrice: Number(l.unitPrice) || 0 })),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Jobber said no');
      if (opts.openJobber && d.url) window.open(d.url, '_blank', 'noopener');
      onCreated?.({ ...d, text: !!opts.text, email: !!opts.email });
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };

  const section = 'rounded-xl border border-border-subtle bg-card';
  return (
    <div className="-mx-1 pb-24">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4"><FileText size={18} className="text-[#E5739A]" /><h1 className="text-xl font-bold text-primary">{edit ? `Edit Quote #${edit.number}` : init.similarId ? 'New Quote (copy)' : 'New Quote'}</h1>
        {!edit && (
          <div className="relative ml-auto">
            <button onClick={openTemplates} className={ghost}>Use a template</button>
            {tplOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 w-72 max-h-80 overflow-y-auto rounded-xl border border-border-default bg-card shadow-2xl py-1.5 text-sm">
                {!templates && <p className="px-3 py-2 text-muted">Loading your Jobber templates…</p>}
                {templates?.length === 0 && <p className="px-3 py-2 text-muted">No quote templates in Jobber yet.</p>}
                {templates?.map((t) => (
                  <button key={t.id} onClick={() => { applySource(t); setTplOpen(false); }} className="block w-full text-left px-3 py-2 hover:bg-surface-alt cursor-pointer">
                    <span className="block font-semibold text-primary">{t.name}</span>
                    <span className="block text-xs text-tertiary truncate">{t.lineItems.filter((l) => !l.textOnly).map((l) => l.name).join(', ')}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <Box label="Title" value={title} onChange={setTitle} className="mb-3" />

      <div className="grid gap-4 lg:grid-cols-2 pb-6 border-b border-border-subtle">
        <div className="relative self-start">
          {!client ? (
            <>
              <div className={`rounded-lg border bg-surface px-3 py-2.5 ${pickerOpen ? 'border-[#7DC243]' : tried && !client ? 'border-red-400' : 'border-border-default'}`}>
                <input value={cq} onChange={(e) => setCq(e.target.value)} onFocus={() => setPickerOpen(true)} onBlur={() => setTimeout(() => setPickerOpen(false), 150)} placeholder="Select a client" className="w-full bg-transparent text-sm text-primary outline-none" />
              </div>
              {tried && !client && <p className="mt-1 text-xs text-red-400">ⓘ Client is required</p>}
              {pickerOpen && (
                <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-lg border border-border-default bg-card shadow-2xl overflow-hidden">
                  <div className="max-h-64 overflow-y-auto">
                    {found.map((c) => (
                      <button key={c.id} onMouseDown={(e) => e.preventDefault()} onClick={() => loadClient(c.id)} className="flex w-full items-start justify-between gap-3 text-left px-3 py-2 hover:bg-surface-alt cursor-pointer">
                        <span className="min-w-0">
                          <span className="block text-sm font-bold text-primary">{c.name}</span>
                          <span className="block text-xs text-secondary truncate">{[c.address, c.city, [c.state, c.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</span>
                          <span className="block text-xs text-secondary truncate">{[c.email, c.phone].filter(Boolean).join(' · ')}</span>
                        </span>
                      </button>
                    ))}
                    {!found.length && <p className="px-3 py-3 text-sm text-muted">Searching…</p>}
                  </div>
                  <a href="/clients/new" className="flex items-center gap-2 border-t border-border-subtle px-3 py-2.5 text-sm font-semibold text-[#7DC243] hover:bg-surface-alt"><Plus size={15} /> Create new client</a>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-lg border border-border-default p-5">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 text-base font-bold text-primary">{client.name}<span className="w-2 h-2 rounded-full bg-[#7DC243]" /></p>
                {!init.clientId && !edit && (
                  <div className="relative">
                    <button onClick={() => setClientMenu((v) => !v)} className="px-1 text-lg leading-none text-secondary hover:text-primary cursor-pointer">⋯</button>
                    {clientMenu && (
                      <div className="absolute right-0 top-full mt-1 z-30 w-44 rounded-lg border border-border-default bg-card shadow-xl py-1 text-sm">
                        <button onClick={() => { setClientMenu(false); setClient(null); setPropertyId(''); setRequestId(''); }} className="block w-full text-left px-3 py-2 text-primary hover:bg-surface-alt cursor-pointer">Change client</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {client.properties.length > 1 && (
                <div className="mt-3">
                  <select value={propertyId} onChange={(e) => { setPropertyId(e.target.value); setErr(''); }} className={`w-full rounded-lg border bg-surface px-3 py-3 text-sm cursor-pointer ${tried && !propertyId ? 'border-red-400' : 'border-border-default'} ${propertyId ? 'text-primary' : 'text-muted'}`}>
                    <option value="">Select a property</option>
                    {client.properties.map((p) => <option key={p.id} value={p.id}>{p.address}</option>)}
                  </select>
                  {tried && !propertyId && <p className="mt-2 text-xs text-red-400">ⓘ Property is required</p>}
                </div>
              )}
              {property && (() => { const [street, ...rest] = String(property.address).split(', '); return <p className="mt-3 text-sm text-primary">{street}<br />{rest.join(', ')}</p>; })()}
              <div className="mt-3 text-sm">
                {client.phone && <a href={`tel:${client.phone}`} className="block w-fit text-[#7DC243] underline underline-offset-2">{client.phone}</a>}
                {client.email && <a href={`mailto:${client.email}`} className="block w-fit text-[#7DC243] underline underline-offset-2">{client.email}</a>}
              </div>
              {client.requests?.length > 0 && (
                <select value={requestId} onChange={(e) => setRequestId(e.target.value)} className="mt-3 w-full rounded-lg border border-border-default bg-surface px-3 py-2 text-sm text-secondary cursor-pointer">
                  <option value="">No linked request</option>{client.requests.map((r) => <option key={r.id} value={r.id}>Request: {r.title}</option>)}
                </select>
              )}
            </div>
          )}
        </div>
        <div className="text-sm divide-y divide-border-subtle">
          <div className="grid grid-cols-[1fr_1.7fr] items-center py-2">
            <span className="text-secondary">Quote #</span>
            <input value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))} className="rounded-lg border border-border-default bg-surface px-3 py-2 text-primary" />
          </div>
          <div className="grid grid-cols-[1fr_1.7fr] items-center py-3">
            <span className="text-secondary">Salesperson</span>
            <span><span className="inline-flex items-center gap-2 rounded-full bg-surface-strong px-4 py-2 text-sm font-semibold text-primary">Salesperson <span className="h-3.5 w-px bg-border-strong" /> Jude</span></span>
          </div>
        </div>
      </div>


      {/* Line items */}
      <div className={`${section} p-4 mt-5`}>
        <p className="text-lg font-bold text-primary mb-3">Service / Material</p>
        <div className="space-y-4">
          {lines.map((l) => {
            const q = l.name.trim().toLowerCase();
            const matches = products.filter((p) => !q || p.name.toLowerCase().includes(q)).slice(0, 8);
            return (
              <div key={l.key} onDragOver={(e) => e.preventDefault()}
                onDrop={() => { const from = dragKey.current; dragKey.current = null; if (!from || from === l.key) return; setLines((ls) => { const a = [...ls]; const [m] = a.splice(a.findIndex((x) => x.key === from), 1); a.splice(a.findIndex((x) => x.key === l.key), 0, m); return a; }); }}
                className="relative group">
                <span draggable onDragStart={() => { dragKey.current = l.key; }} className="absolute -left-3.5 top-3 text-muted cursor-grab opacity-0 group-hover:opacity-100"><GripVertical size={15} /></span>
                {l.textOnly ? (
                  <div className="flex gap-2"><Box label="Text" value={l.description} onChange={(v) => setLine(l.key, { description: v, name: v.split('\n')[0].slice(0, 80) || 'Text' })} area rows={3} className="flex-1" />
                    <span className="self-start mt-1 flex items-center gap-1"><span className="flex flex-col"><button onClick={() => move(l.key, -1)} title="Move up" className="text-muted hover:text-primary cursor-pointer disabled:opacity-20" disabled={lines[0]?.key === l.key}><ArrowUp size={15} /></button><button onClick={() => move(l.key, 1)} title="Move down" className="text-muted hover:text-primary cursor-pointer disabled:opacity-20" disabled={lines[lines.length - 1]?.key === l.key}><ArrowDown size={15} /></button></span><button onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="text-muted hover:text-red-400 cursor-pointer"><Trash2 size={16} /></button></span></div>
                ) : (
                  <>
                    <div className="grid grid-cols-[1fr_130px_130px_130px_48px] gap-2">
                      <div className="relative">
                        <Box label="Name" value={l.name} onChange={(v) => { setLine(l.key, { name: v, productOrServiceId: null }); setPickFor(l.key); }}
                          inputProps={{ onFocus: () => setPickFor(l.key), onBlur: () => setTimeout(() => setPickFor((k) => (k === l.key ? null : k)), 150) }} />
                        {pickFor === l.key && q && matches.length > 0 && (
                          <div className="absolute left-0 right-0 top-full mt-1 z-30 max-h-72 overflow-y-auto rounded-lg border border-border-default bg-card shadow-2xl py-1">
                            <p className="px-3 py-1.5 text-xs text-tertiary">Services</p>
                            {matches.map((p) => (
                              <button key={p.id} onMouseDown={(e) => e.preventDefault()} onClick={() => { setLine(l.key, { name: p.name, description: l.description || p.description, unitPrice: p.price || l.unitPrice, productOrServiceId: p.id }); setPickFor(null); }}
                                className="block w-full text-left px-3 py-2 hover:bg-surface-alt cursor-pointer">
                                <span className="flex justify-between gap-3 text-sm"><span className="text-primary">{p.name}</span><span className="text-secondary">{money(p.price)}</span></span>
                                {p.description && <span className="block text-xs text-tertiary truncate">{p.description}</span>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <Box label="Quantity" type="number" value={l.quantity} onChange={(v) => setLine(l.key, { quantity: v })} inputProps={{ min: 0, step: 'any' }} />
                      <Box label="Unit price" type="number" value={l.unitPrice} onChange={(v) => setLine(l.key, { unitPrice: v })} inputProps={{ min: 0, step: 'any', placeholder: '0.00' }} alwaysUp />
                      <div className="rounded-lg border border-border-default bg-surface px-3 pt-[18px] pb-1.5 relative"><span className="absolute left-3 top-1 text-[11px] text-tertiary">Total</span><span className="text-sm text-primary">{money(lineTotal(l))}</span></div>
                      <span className="self-center flex items-center gap-1"><span className="flex flex-col"><button onClick={() => move(l.key, -1)} title="Move up" className="text-muted hover:text-primary cursor-pointer disabled:opacity-20" disabled={lines[0]?.key === l.key}><ArrowUp size={15} /></button><button onClick={() => move(l.key, 1)} title="Move down" className="text-muted hover:text-primary cursor-pointer disabled:opacity-20" disabled={lines[lines.length - 1]?.key === l.key}><ArrowDown size={15} /></button></span><button onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [blank()]))} title="Remove" className="text-muted hover:text-red-400 cursor-pointer"><Trash2 size={16} /></button></span>
                    </div>
                    <div className="mt-2 grid grid-cols-[1fr_48px] gap-2">
                      <Box label="Description" value={l.description} onChange={(v) => setLine(l.key, { description: v })} area rows={3} />
                    </div>
                    <label className="mt-2 inline-flex items-center gap-2 text-sm text-primary cursor-pointer"><input type="checkbox" checked={l.optional} onChange={(e) => setLine(l.key, { optional: e.target.checked })} className="w-4 h-4 accent-[#7DC243]" />Mark as optional</label>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-5 flex gap-2">
          <button onClick={() => setLines((ls) => [...ls, blank()])} className="rounded-md bg-[#7DC243] px-2.5 py-1 text-xs font-bold text-black cursor-pointer">Add Line Item</button>
          <button onClick={() => setLines((ls) => [...ls, blank(true)])} className={ghost}>Add Text</button>
        </div>

        {/* Totals */}
        <div className="mt-6 -mx-4 border-t-2 border-border-default px-4 pt-4 grid gap-6 lg:grid-cols-2">
          <div className="text-sm">
            <p className="flex items-center gap-3 text-primary"><Eye size={16} /> Client view
              <button onClick={() => setViewOpen((v) => !v)} className={viewOpen ? 'rounded-md border border-border-default px-2 py-0.5 text-xs font-semibold text-primary cursor-pointer' : link}>{viewOpen ? 'Cancel' : 'Change'}</button>
            </p>
            {viewOpen && (
              <>
                <p className="mt-2 text-xs text-secondary">Adjust what your client will see on this quote.</p>
                <div className="mt-2 flex flex-wrap gap-4">
                  {[['showLineItemQty', 'Quantities'], ['showLineItemUnitCosts', 'Unit prices'], ['showLineItemTotalCosts', 'Line item totals'], ['showTotals', 'Totals']].map(([k, l]) => (
                    <label key={k} className="flex items-center gap-2 text-primary cursor-pointer"><input type="checkbox" checked={view[k]} onChange={(e) => setView((v) => ({ ...v, [k]: e.target.checked }))} className="w-4 h-4 accent-[#7DC243]" />{l}</label>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="text-sm divide-y divide-border-subtle">
            <p className="flex justify-between py-2.5"><span className="text-primary">Subtotal</span><span className="text-primary">{money(subtotal)}</span></p>
            <div className="flex items-center justify-between py-2.5"><span className="text-primary">Discount</span>
              {discount === null ? <button onClick={() => setDiscount('')} className={link}>Add Discount</button>
                : <span className="flex items-center gap-2"><input autoFocus={discount === ''} type="number" min="0" max="100" value={discount} onChange={(e) => setDiscount(e.target.value)} className="w-16 rounded border border-border-default bg-surface px-2 py-1 text-right text-primary" />%<span className="w-24 text-right text-primary">−{money(disc)}</span><button onClick={() => setDiscount(null)} className="text-muted cursor-pointer"><X size={13} /></button></span>}
            </div>
            <p className="flex justify-between py-2.5 text-base font-bold text-primary border-t-2 border-border-default"><span>Total</span><span>{money(total)}</span></p>
            <div className="py-2.5">
              {deposit === null ? <button onClick={() => setDeposit('')} className={link}>Add Deposit or Payment Schedule</button>
                : <span className="flex items-center justify-between"><span className="text-primary">Required deposit</span><span className="flex items-center gap-2"><input autoFocus={deposit === ''} type="number" min="0" max="100" value={deposit} onChange={(e) => setDeposit(e.target.value)} className="w-16 rounded border border-border-default bg-surface px-2 py-1 text-right text-primary" />%<span className="w-24 text-right text-primary">{money(dep)}</span><button onClick={() => setDeposit(null)} className="text-muted cursor-pointer"><X size={13} /></button></span></span>}
            </div>
          </div>
        </div>
      </div>

      {/* Add section */}
      <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-card border border-border-subtle px-2 py-1.5">
        <span className="flex items-center gap-1 text-sm text-primary"><Plus size={14} /> Add section</span>
        {message === null && <button onClick={() => setMessage('')} className="rounded-md border border-border-default px-2 py-0.5 text-xs font-semibold text-primary cursor-pointer hover:bg-surface-alt">Client Message</button>}
        {!showDisclaimer && <button onClick={() => setShowDisclaimer(true)} className="rounded-md border border-border-default px-2 py-0.5 text-xs font-semibold text-primary cursor-pointer hover:bg-surface-alt">Contract / Disclaimer</button>}
      </div>

      {message !== null && (
        <div className={`${section} p-4 mt-4`}>
          <div className="flex items-center justify-between"><p className="text-lg font-bold text-primary">Client Message</p><button onClick={() => setMessage(null)} className="text-muted hover:text-red-400 cursor-pointer"><Trash2 size={16} /></button></div>
          <Box label="Message" value={message} onChange={setMessage} area rows={3} className="mt-2" />
        </div>
      )}
      {showDisclaimer && (
        <div className={`${section} p-4 mt-4`}>
          <div className="flex items-center justify-between"><p className="text-lg font-bold text-primary">Contract / Disclaimer</p><button onClick={() => setShowDisclaimer(false)} className="text-muted hover:text-red-400 cursor-pointer"><Trash2 size={16} /></button></div>
          <Box label="Description" value={disclaimer} onChange={setDisclaimer} area rows={3} className="mt-2" />
        </div>
      )}

      <p className="mt-6 mb-2 text-xl font-bold text-primary">Notes</p>
      {note === null
        ? <button onClick={() => setNote('')} className="w-full rounded-xl border-2 border-dashed border-border-default py-10 text-sm text-secondary hover:text-primary cursor-pointer"><span className="mx-auto mb-2 flex w-9 h-9 items-center justify-center rounded-full bg-surface-strong"><FileText size={16} /></span>Leave an internal note for yourself or a team member</button>
        : <Box label="Note (only you and your team see this)" value={note} onChange={setNote} area rows={3} />}


      {/* Sticky footer like Jobber */}
      <div className="fixed bottom-0 right-0 left-0 lg:left-52 z-40 border-t border-border-subtle bg-sidebar px-5 py-3 flex items-center justify-end gap-2">
        {err && <p className="mr-auto rounded-lg bg-red-500/15 text-red-400 px-3 py-1.5 text-sm">⚠ {err}</p>}
        <button onClick={onBack} className="rounded-lg border border-border-default px-4 py-2 text-sm font-semibold text-[#7DC243] cursor-pointer hover:bg-surface-alt">Cancel</button>
        <div className="relative flex">
          <button onClick={() => save()} disabled={saving} className="rounded-l-lg bg-[#7DC243] px-4 py-2 text-sm font-bold text-black cursor-pointer disabled:opacity-50">{saving ? 'Saving…' : 'Save Quote'}</button>
          <button onClick={() => setSaveMenu((v) => !v)} disabled={saving} title="Save and..." className="rounded-r-lg bg-[#7DC243] border-l border-black/20 px-2 text-black cursor-pointer disabled:opacity-50"><ChevronDown size={16} /></button>
          {saveMenu && edit && (
            <div className="absolute right-0 bottom-full mb-2 w-60 rounded-xl border border-border-default bg-card shadow-2xl py-2 text-sm">
              <p className="px-4 pb-1.5 text-tertiary">Save and...</p>
              {[
                [<MessageSquare size={16} key="t" />, 'Send as Text Message (Quo)', () => save({ text: true })],
                [<Mail size={16} key="m" />, 'Send as Email', () => save({ email: true })],
              ].map(([icon, l, fn]) => <button key={l} onClick={fn} className="flex w-full items-center gap-3 px-4 py-2 text-primary hover:bg-surface-alt cursor-pointer"><span className="text-secondary">{icon}</span>{l}</button>)}
            </div>
          )}
          {saveMenu && !edit && (
            <div className="absolute right-0 bottom-full mb-2 w-60 rounded-xl border border-border-default bg-card shadow-2xl py-2 text-sm">
              <p className="px-4 pb-1.5 text-tertiary">Save and...</p>
              {[
                [<Mail size={16} key="m" />, 'Send as Email', () => save({ awaiting: true, email: true })],
                [<MessageSquare size={16} key="t" />, 'Send as Text Message (Quo)', () => save({ awaiting: true, text: true })],
                [<Hammer size={16} key="h" />, 'Convert to Job', () => save({ openJobber: true })],
                [<Send size={16} key="s" />, 'Mark as Awaiting Response', () => save({ awaiting: true })],
              ].map(([icon, l, fn]) => <button key={l} onClick={fn} className="flex w-full items-center gap-3 px-4 py-2 text-primary hover:bg-surface-alt cursor-pointer"><span className="text-secondary">{icon}</span>{l}</button>)}
              <p className="px-4 pt-1.5 text-[11px] text-muted">Text sends from your Quo number, email from your email app — both link to your Hub quote page.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
