import { useEffect, useMemo, useState } from 'react';
import { Search, X, Plus, ChevronUp, ChevronDown, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// Products & Services — Jobber's list (Settings → Products & Services), synced both ways.
const money = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240, 300, 360, 480];
const durLabel = (m) => (m < 60 ? `${m}m` : m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60}h`);

function Field({ label, children, className = '' }) {
  return (
    <label className={`block rounded-lg border border-border-default bg-surface px-3 pt-1.5 pb-1.5 focus-within:border-[#7DC243] ${className}`}>
      <span className="block text-[11px] text-tertiary">{label}</span>
      {children}
    </label>
  );
}
const inp = 'w-full bg-transparent text-sm text-primary outline-none';

function ItemDialog({ item, auth, onClose, onSaved }) {
  const [v, setV] = useState(() => ({
    category: item?.category || 'SERVICE', name: item?.name || '', description: item?.description || '',
    cost: item?.cost ?? 0, markup: item?.markup ? Math.round(item.markup * 100) / 100 : 0, unitPrice: item?.unitPrice ?? 0,
    taxable: item?.taxable ?? false, visible: item?.visible ?? true, duration: item?.duration || 60,
  }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (p) => setV((x) => ({ ...x, ...p }));
  // Like Jobber: cost + markup → price, and changing the price recalculates the markup.
  const setCost = (c) => { const cost = Number(c) || 0; set({ cost: c, unitPrice: cost && Number(v.markup) ? Math.round(cost * (1 + Number(v.markup) / 100) * 100) / 100 : v.unitPrice }); };
  const setMarkup = (m) => { const cost = Number(v.cost) || 0; set({ markup: m, unitPrice: cost ? Math.round(cost * (1 + (Number(m) || 0) / 100) * 100) / 100 : v.unitPrice }); };
  const setPrice = (p) => { const cost = Number(v.cost) || 0; set({ unitPrice: p, markup: cost ? Math.round(((Number(p) || 0) / cost - 1) * 10000) / 100 : v.markup }); };
  const save = async () => {
    setErr('');
    if (!v.name.trim()) { setErr('Name is required'); return; }
    setSaving(true);
    try {
      const r = await fetch('/api/jobber-data?action=product-save', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...v, id: item?.id }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Jobber said no');
      onSaved();
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-xl border border-border-default bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><p className="text-xl font-bold text-primary">{item ? `Edit ${item.name}` : 'Add Item'}</p><button onClick={onClose} className="text-muted hover:text-primary cursor-pointer"><X size={18} /></button></div>
        <p className="mt-2 text-xs text-secondary">Changes will apply to new quotes, jobs, invoices, existing quote templates & online booking</p>
        <div className="mt-3 space-y-3">
          <Field label="Item type"><select value={v.category} onChange={(e) => set({ category: e.target.value })} className={`${inp} cursor-pointer`}><option value="SERVICE">Service</option><option value="PRODUCT">Product</option></select></Field>
          <Field label="Name"><input autoFocus={!item} value={v.name} onChange={(e) => set({ name: e.target.value })} className={inp} /></Field>
          <Field label="Description"><textarea rows={4} value={v.description} onChange={(e) => set({ description: e.target.value })} className={`${inp} resize-y`} /></Field>
          <div className="grid grid-cols-3 rounded-lg border border-border-default overflow-hidden divide-x divide-border-default">
            {[['Cost ($)', v.cost, setCost], ['Markup (%)', v.markup, setMarkup], ['Unit Price ($)', v.unitPrice, setPrice]].map(([l, val, fn]) => (
              <label key={l} className="block bg-surface px-3 pt-1.5 pb-1.5 focus-within:bg-surface-alt"><span className="block text-[11px] text-tertiary">{l}</span><input type="number" step="any" value={val} onChange={(e) => fn(e.target.value)} className={inp} /></label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-primary cursor-pointer"><input type="checkbox" checked={!v.taxable} onChange={(e) => set({ taxable: !e.target.checked })} className="w-4 h-4 accent-[#7DC243]" />Exempt from Tax</label>
          {item && <label className="flex items-center gap-2 text-sm text-primary cursor-pointer"><input type="checkbox" checked={v.visible} onChange={(e) => set({ visible: e.target.checked })} className="w-4 h-4 accent-[#7DC243]" />Available on quotes, quote templates, jobs, invoices & online booking</label>}
          <div className="border-t border-border-subtle pt-3">
            <p className="font-bold text-primary">Online Booking</p>
            <p className="text-xs text-secondary">These settings are only available for online booking.</p>
            <Field label="Service Duration" className="mt-2"><select value={v.duration} onChange={(e) => set({ duration: Number(e.target.value) })} className={`${inp} cursor-pointer`}>{[...new Set([...DURATIONS, v.duration])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{durLabel(m)}</option>)}</select></Field>
          </div>
        </div>
        {err && <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{err}</p>}
        <div className="mt-4 flex items-center gap-2">
          {item && <span className="mr-auto text-[11px] text-muted max-w-[45%]">To remove it, uncheck “Available on quotes…” — Jobber doesn't let apps delete items.</span>}
          <button onClick={onClose} className="ml-auto rounded-lg border border-border-default px-4 py-2 text-sm font-semibold text-[#7DC243] cursor-pointer">Cancel</button>
          <button onClick={save} disabled={saving} className="rounded-lg bg-[#7DC243] px-4 py-2 text-sm font-bold text-black cursor-pointer disabled:opacity-50">{saving ? 'Saving…' : item ? 'Update' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

function Th({ k, children, className = '', sort, setSort }) {
  return (
    <th className={`px-3 py-3 text-left font-bold text-primary ${className}`}>
      <button onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? -s.dir : 1 }))} className="inline-flex items-center gap-1 cursor-pointer">{children}{sort.key === k ? (sort.dir === 1 ? <ChevronUp size={13} /> : <ChevronDown size={13} />) : <ChevronDown size={13} className="opacity-30" />}</button>
    </th>
  );
}

export default function ProductsServices() {
  const { session } = useAuth();
  const auth = { Authorization: `Bearer ${session?.access_token || ''}` };
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState({ key: 'name', dir: 1 });
  const [edit, setEdit] = useState(null); // item | 'new' | null
  const [busy, setBusy] = useState(false);
  const load = (refresh) => {
    if (refresh) setBusy(true);
    fetch(`/api/jobber-data?action=products&all=1${refresh ? '&refresh=1' : ''}`).then((r) => r.json())
      .then((d) => (d.error ? setErr(d.error) : (setErr(''), setItems(d.items)))).catch(() => setErr('Could not reach Jobber')).finally(() => setBusy(false));
  };
  useEffect(() => { load(false); }, []); // eslint-disable-line react-hooks/set-state-in-effect
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = (items || []).filter((x) => !t || `${x.name} ${x.description}`.toLowerCase().includes(t));
    const cmp = { name: (a, b) => a.name.localeCompare(b.name), type: (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name), price: (a, b) => a.unitPrice - b.unitPrice }[sort.key];
    return list.sort((a, b) => cmp(a, b) * sort.dir);
  }, [items, q, sort]);

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-3xl font-black text-primary">Products & services</h1>
      <p className="mt-2 text-sm text-secondary">Add and update your products & services to stay organized when creating quotes, quote templates, jobs, and invoices. Synced with Jobber.</p>
      <div className="mt-4 flex items-center gap-3">
        <div className="relative w-80">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="w-full rounded-lg border border-border-default bg-surface pl-9 pr-9 py-2.5 text-sm text-primary" />
          {q && <button onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted cursor-pointer"><X size={15} /></button>}
        </div>
        <button onClick={() => load(true)} disabled={busy} title="Sync from Jobber" className="rounded-lg border border-border-default p-2.5 text-secondary hover:text-primary cursor-pointer disabled:opacity-50"><RefreshCw size={15} className={busy ? 'animate-spin' : ''} /></button>
        <button onClick={() => setEdit('new')} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[#7DC243] px-3 py-2 text-sm font-bold text-black cursor-pointer"><Plus size={15} /> Add Item</button>
      </div>
      {err && <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{err}</p>}
      <div className="mt-4 rounded-xl border border-border-subtle overflow-hidden">
        <table className="w-full text-sm table-fixed">
          <colgroup><col className="w-[34%]" /><col /><col className="w-[110px]" /><col className="w-[100px]" /></colgroup>
          <thead className="bg-card border-b border-border-subtle"><tr><Th sort={sort} setSort={setSort} k="name">Name</Th><th className="px-3 py-3 text-left font-bold text-primary">Description</th><Th sort={sort} setSort={setSort} k="price" className="text-right">Price</Th><Th sort={sort} setSort={setSort} k="type">Type</Th></tr></thead>
          <tbody>
            {!items && !err && <tr><td colSpan={4} className="px-3 py-10 text-center text-muted">Loading from Jobber…</td></tr>}
            {rows.map((x) => (
              <tr key={x.id} onClick={() => setEdit(x)} className={`border-t border-border-subtle hover:bg-surface-alt cursor-pointer ${x.visible ? '' : 'opacity-50'}`}>
                <td className="px-3 py-3 font-bold text-primary">{x.name}{!x.visible && <span className="ml-2 text-xs font-normal text-tertiary">(hidden)</span>}</td>
                <td className="px-3 py-3 text-secondary"><span className="line-clamp-2 whitespace-pre-line">{x.description}</span></td>
                <td className="px-3 py-3 text-right text-primary">{x.unitPrice ? money(x.unitPrice) : <span className="text-muted">—</span>}</td>
                <td className="px-3 py-3 text-primary">{x.category === 'PRODUCT' ? 'Product' : 'Service'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-muted">{items ? `${items.length} items` : ''} · these fill in line items on Hub's New Quote</p>
      {edit && <ItemDialog item={edit === 'new' ? null : edit} auth={auth} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(true); }} />}
    </div>
  );
}
