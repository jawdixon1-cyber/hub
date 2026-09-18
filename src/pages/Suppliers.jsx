import { useState, useMemo } from 'react';
import { Search, Plus, X, Trash2, Pencil, ExternalLink, Phone } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAppStore } from '../store/AppStoreContext';

/* Free text, not a fixed enum — these are only suggestions, so a new kind of
   thing never needs a code change to be recorded. */
const CATEGORY_SUGGESTIONS = [
  'Rock', 'Mulch', 'Pine Straw', 'Fabric', 'Fuel & Oil',
  'Chemicals', 'Equipment Rental', 'Parts', 'Other',
];

const BLANK = {
  item: '', category: '', supplier: '', price: '', unit: '',
  where: '', phone: '', notes: '', image: '',
};

function Field({ label, value, onChange, placeholder, prefix, list, wide }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <label className="block text-xs font-medium text-secondary mb-1">{label}</label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">{prefix}</span>
        )}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          list={list}
          className={`w-full rounded-lg border border-border-strong bg-card ${prefix ? 'pl-7' : 'pl-3'} pr-3 py-2.5 text-sm text-primary outline-none focus:ring-2 focus:ring-brand placeholder:text-muted`}
        />
      </div>
    </div>
  );
}

function EntryForm({ value, onChange, onSave, onCancel, saveLabel }) {
  const set = (k) => (v) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-3 pb-6 border-b border-border-subtle">
      <datalist id="supplier-categories">
        {CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}
      </datalist>
      {value.image && (
        <img src={value.image} alt="" className="w-full max-w-[200px] h-28 object-cover rounded-xl border border-border-subtle" />
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Item" value={value.item} onChange={set('item')} placeholder="2-cycle oil mix" />
        <Field label="Category" value={value.category} onChange={set('category')} placeholder="Fuel & Oil" list="supplier-categories" />
        <Field label="Supplier" value={value.supplier} onChange={set('supplier')} placeholder="Where you buy it" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Price" value={value.price} onChange={set('price')} placeholder="0.00" prefix="$" />
          <Field label="Per" value={value.unit} onChange={set('unit')} placeholder="yd, gal, roll" />
        </div>
        <Field label="Address or link" value={value.where} onChange={set('where')} placeholder="123 Main St, or a URL" wide />
        <Field label="Phone" value={value.phone} onChange={set('phone')} placeholder="(803) 000-0000" />
        <Field label="Notes" value={value.notes} onChange={set('notes')} placeholder="Ask for Dave · cash only · 2 day lead" />
        {/* A photo makes this usable on someone's driveway — you can show them
            the product instead of describing it. */}
        <Field label="Photo URL" value={value.image} onChange={set('image')} placeholder="https://... (paste an image link)" wide />
      </div>
      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={!value.item.trim()}
          className="px-4 py-2 rounded-xl bg-brand text-on-brand text-sm font-semibold hover:bg-brand-hover transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saveLabel}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-xl border border-border-strong text-secondary text-sm font-medium hover:bg-surface-alt transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function Suppliers() {
  const rawSuppliers = useAppStore((s) => s.suppliers);
  const setSuppliers = useAppStore((s) => s.setSuppliers);
  const suppliers = useMemo(() => rawSuppliers || [], [rawSuppliers]);

  // Arriving from a calculator's "Where to get" link lands here pre-filtered.
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(BLANK);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(BLANK);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [lightbox, setLightbox] = useState(null); // product photo shown full size

  // Search hits every field — you might remember the supplier's name, the
  // product, or just "the place off Cherry Rd" from the notes.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) =>
      [s.item, s.category, s.supplier, s.where, s.notes].some((f) => (f || '').toLowerCase().includes(q))
    );
  }, [suppliers, query]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const s of matches) {
      const k = (s.category || 'Uncategorised').trim() || 'Uncategorised';
      map.set(k, [...(map.get(k) || []), s]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [matches]);

  const save = () => {
    setSuppliers([...suppliers, { ...draft, id: crypto.randomUUID() }]);
    setDraft(BLANK);
    setAdding(false);
  };

  const saveEdit = () => {
    setSuppliers(suppliers.map((s) => (s.id === editingId ? { ...editDraft, id: editingId } : s)));
    setEditingId(null);
  };

  const remove = (id) => {
    setSuppliers(suppliers.filter((s) => s.id !== id));
    setConfirmDelete(null);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Suppliers</h1>
          <p className="text-sm text-muted mt-0.5">
            Where everything comes from &mdash; materials, chemicals, rentals, parts.
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => { setAdding(true); setDraft(BLANK); }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand text-on-brand text-sm font-semibold hover:bg-brand-hover transition-colors cursor-pointer shrink-0"
          >
            <Plus size={15} /> Add
          </button>
        )}
      </div>

      {adding && (
        <EntryForm
          value={draft}
          onChange={setDraft}
          onSave={save}
          onCancel={() => setAdding(false)}
          saveLabel="Add item"
        />
      )}

      {suppliers.length > 0 && (
        <div className="relative">
          <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search items, suppliers, notes..."
            className="w-full rounded-xl border border-border-subtle bg-card pl-10 pr-10 py-3 text-sm text-primary outline-none focus:ring-2 focus:ring-brand placeholder:text-muted"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted hover:text-primary cursor-pointer"
              aria-label="Clear search"
            >
              <X size={15} />
            </button>
          )}
        </div>
      )}

      {suppliers.length === 0 && !adding ? (
        <div className="border border-dashed border-border-subtle rounded-2xl px-6 py-12 text-center">
          <p className="text-sm font-semibold text-primary">Nothing recorded yet</p>
          <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
            Add the things you buy regularly &mdash; oil mix, hedge trimmer cleaner,
            rock, skid rentals &mdash; so nobody has to remember where they come from.
          </p>
        </div>
      ) : matches.length === 0 ? (
        <p className="text-sm text-muted py-8 text-center">No match for &ldquo;{query}&rdquo;.</p>
      ) : (
        <div className="space-y-6">
          {grouped.map(([category, items]) => (
            <div key={category}>
              <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1.5">{category}</p>
              <div>
                {items.map((s) =>
                  editingId === s.id ? (
                    <div key={s.id} className="py-4">
                      <EntryForm
                        value={editDraft}
                        onChange={setEditDraft}
                        onSave={saveEdit}
                        onCancel={() => setEditingId(null)}
                        saveLabel="Save changes"
                      />
                    </div>
                  ) : (
                    <div
                      key={s.id}
                      className="flex items-start gap-3 py-3.5 border-t border-border-subtle/60 first:border-t-0"
                    >
                      {s.image && (
                        <button
                          onClick={() => setLightbox(s)}
                          className="shrink-0 w-14 h-14 rounded-xl overflow-hidden border border-border-subtle cursor-pointer"
                          title="View photo"
                        >
                          <img src={s.image} alt={s.item} className="w-full h-full object-cover" />
                        </button>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-primary">{s.item}</p>
                        <p className="text-xs text-muted mt-0.5">
                          {s.supplier || 'No supplier noted'}
                          {s.where && <> &middot; {/^https?:/i.test(s.where)
                            ? <a href={s.where} target="_blank" rel="noopener noreferrer" className="text-brand-text hover:underline inline-flex items-center gap-1">link <ExternalLink size={10} /></a>
                            : s.where}</>}
                        </p>
                        {s.phone && (
                          <a href={`tel:${s.phone}`} className="text-xs text-brand-text hover:underline inline-flex items-center gap-1 mt-0.5">
                            <Phone size={10} /> {s.phone}
                          </a>
                        )}
                        {s.notes && <p className="text-xs text-muted mt-1 leading-relaxed">{s.notes}</p>}
                      </div>

                      {s.price && (
                        <div className="text-right shrink-0">
                          <span className="text-sm font-bold text-primary">${s.price}</span>
                          {s.unit && <span className="block text-[11px] text-muted">per {s.unit}</span>}
                        </div>
                      )}

                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={() => { setEditingId(s.id); setEditDraft({ ...BLANK, ...s }); }}
                          className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-surface-alt transition-colors cursor-pointer"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(s.id)}
                          className="p-1.5 rounded-lg text-muted hover:text-red-500 hover:bg-surface-alt transition-colors cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setLightbox(null)}>
          <div className="max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox.image} alt={lightbox.item} className="w-full rounded-2xl" />
            <div className="flex items-center justify-between gap-3 mt-3">
              <div className="min-w-0">
                <p className="text-white font-bold truncate">{lightbox.item}</p>
                <p className="text-white/70 text-sm truncate">
                  {lightbox.supplier}{lightbox.price ? ` · $${lightbox.price}${lightbox.unit ? ` per ${lightbox.unit}` : ''}` : ''}
                </p>
              </div>
              <button onClick={() => setLightbox(null)} className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 cursor-pointer shrink-0">
                <X size={20} />
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmDelete(null)}>
          <div className="bg-card rounded-2xl shadow-2xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-primary mb-2">Delete this item?</h3>
            <p className="text-sm text-secondary mb-5">
              {suppliers.find((s) => s.id === confirmDelete)?.item} will be removed.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 rounded-lg border border-border-strong text-secondary text-sm font-medium hover:bg-surface transition-colors cursor-pointer">Cancel</button>
              <button onClick={() => remove(confirmDelete)} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors cursor-pointer">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
