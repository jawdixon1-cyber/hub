import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  Search, Loader2, Users, Phone, Mail, MapPin, ArrowLeft,
  Plus, X, RefreshCw, Home, ChevronDown, Check, TrendingUp,
  Tag, MoreHorizontal, Archive, Trash2, ExternalLink, MessageSquare, Pencil,
  Inbox, FileSearch, Hammer, FileText, CreditCard, ClipboardCheck, UserRound,
} from 'lucide-react';
import { getTimezone, getTodayInTimezone } from '../utils/timezone';
import { useAppStore } from '../store/AppStoreContext';
import { pushClientToJobber, clientArchiveOp } from '../lib/jobberPush';
import { LeadChat } from '../components/LeadsStep';
import { bucketFor as requestBucketFor, STATUS_CONFIG as REQUEST_STATUS_CONFIG } from './Requests';

function formatPhone(p) {
  const raw = p?.number || p || '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) return `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === '1') return `${digits.slice(1,4)}-${digits.slice(4,7)}-${digits.slice(7)}`;
  return raw;
}
function formatEmail(e) { return e?.address || e || ''; }
function primaryPhone(phones) { return formatPhone((phones || []).find(p => p.primary) || phones?.[0]); }
function primaryEmail(emails) { return formatEmail((emails || []).find(e => e.primary) || emails?.[0]); }

function lastActivity(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} minutes ago`;
  // If today, show time
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  // If yesterday
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ─── New Client Modal ─── */
function NewClientModal({ onClose, onSave }) {
  const [form, setForm] = useState({
    first_name: '', last_name: '', company_name: '',
    phone: '', email: '',
    street: '', city: '', state: '', zip: '',
    is_lead: false, notes: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const inputCls = "mt-1 w-full px-3 py-2.5 rounded-lg bg-surface-alt border border-border-subtle text-sm text-primary placeholder:text-muted focus:outline-none focus:border-brand/50";

  const handleSave = async () => {
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-6 px-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-border-subtle rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="h-1 bg-brand rounded-t-2xl shrink-0" />
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle shrink-0">
          <h2 className="text-lg font-black text-primary">New Client</h2>
          <button onClick={onClose} className="p-1 text-muted hover:text-primary cursor-pointer"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-muted uppercase tracking-wider">First name</label>
              <input value={form.first_name} onChange={e => set('first_name', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-bold text-muted uppercase tracking-wider">Last name</label>
              <input value={form.last_name} onChange={e => set('last_name', e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-muted uppercase tracking-wider">Company name</label>
            <input value={form.company_name} onChange={e => set('company_name', e.target.value)} className={inputCls} placeholder="Optional" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-muted uppercase tracking-wider">Phone</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)} type="tel" className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-bold text-muted uppercase tracking-wider">Email</label>
              <input value={form.email} onChange={e => set('email', e.target.value)} type="email" className={inputCls} />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-muted uppercase tracking-wider">Street address</label>
            <input value={form.street} onChange={e => set('street', e.target.value)} className={inputCls} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-muted uppercase tracking-wider">City</label>
              <input value={form.city} onChange={e => set('city', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-bold text-muted uppercase tracking-wider">State</label>
              <input value={form.state} onChange={e => set('state', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-bold text-muted uppercase tracking-wider">Zip</label>
              <input value={form.zip} onChange={e => set('zip', e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button onClick={() => set('is_lead', !form.is_lead)}
              className={`px-4 py-2 rounded-lg text-xs font-bold cursor-pointer transition-colors ${form.is_lead ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' : 'bg-surface-alt text-muted border border-border-subtle'}`}>
              {form.is_lead ? 'Lead' : 'Client'}
            </button>
            <span className="text-[11px] text-muted">Click to toggle Lead / Client</span>
          </div>
          <div>
            <label className="text-xs font-bold text-muted uppercase tracking-wider">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} className={inputCls + ' resize-none'} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-subtle shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-muted hover:text-primary cursor-pointer">Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.first_name}
            className="px-6 py-2.5 rounded-lg bg-brand text-on-brand text-sm font-bold hover:bg-brand-hover cursor-pointer disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Client'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Tag Editor Modal ─── */
const DEFAULT_TAGS = ['pct wt', 'syncing', 'vip', 'commercial', 'residential', 'referral'];

function TagEditor({ client, onClose, onSave }) {
  const [tags, setTags] = useState(client.tags || []);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const name = [client.first_name, client.last_name].filter(Boolean).join(' ') || client.company_name || 'Unknown';

  const allTags = [...new Set([...DEFAULT_TAGS, ...tags])];
  const filtered = search ? allTags.filter(t => t.toLowerCase().includes(search.toLowerCase())) : allTags;
  const canAddNew = search.trim() && !allTags.some(t => t.toLowerCase() === search.trim().toLowerCase());

  const toggle = (tag) => setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  const addNew = () => { if (canAddNew) { setTags(prev => [...prev, search.trim()]); setSearch(''); } };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-border-subtle rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <h2 className="text-sm font-bold text-primary">Edit tags for {name}</h2>
          <button onClick={onClose} className="p-1 text-muted hover:text-primary cursor-pointer"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {tags.map(t => (
              <span key={t} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-brand/15 text-brand-text text-[11px] font-semibold border border-brand/30">
                {t}
                <button onClick={() => toggle(t)} className="hover:text-red-400 cursor-pointer"><X size={10} /></button>
              </span>
            ))}
            {tags.length === 0 && <span className="text-xs text-muted">Select tags +</span>}
          </div>
          <div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tags"
              className="w-full px-3 py-2 rounded-lg bg-surface-alt border border-border-subtle text-xs text-primary placeholder:text-muted focus:outline-none" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-muted">Select tags</span>
            <button onClick={() => setTags([])} className="text-[10px] font-bold text-brand-text hover:underline cursor-pointer">Select all</button>
          </div>
          <div className="max-h-32 overflow-y-auto space-y-0.5">
            {filtered.map(t => (
              <button key={t} onClick={() => toggle(t)}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded text-xs cursor-pointer hover:bg-surface-alt ${
                  tags.includes(t) ? 'text-brand-text font-semibold' : 'text-secondary'
                }`}>
                {t}
                {tags.includes(t) && <Check size={12} className="text-brand" />}
              </button>
            ))}
            {canAddNew && (
              <button onClick={addNew}
                className="w-full flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-brand-text font-semibold cursor-pointer hover:bg-surface-alt">
                <Plus size={12} /> Create "{search.trim()}"
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border-subtle">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-muted hover:text-primary cursor-pointer">Cancel</button>
          <button onClick={async () => { setSaving(true); await onSave(client.id, tags); setSaving(false); onClose(); }}
            className="px-4 py-1.5 rounded-lg bg-brand text-on-brand text-xs font-bold hover:bg-brand-hover cursor-pointer disabled:opacity-50" disabled={saving}>
            {saving ? '...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Property Editor Modal ─── */
function PropertyEditor({ property, clientId, orgId, onClose, onSave }) {
  const bizSettings = useAppStore((s) => s.businessSettings) || {};
  const isNew = !property;
  const [form, setForm] = useState({
    label: property?.label || '',
    street: property?.street || '',
    street2: '',
    city: property?.city || '',
    state: property?.state || '',
    zip: property?.zip || '',
    country: 'United States',
  });
  const [saving, setSaving] = useState(false);
  const [addressQuery, setAddressQuery] = useState(
    property ? [property.street, property.city, property.state, property.zip].filter(Boolean).join(', ') : ''
  );
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const inputCls = "w-full px-3 py-2.5 rounded-lg bg-surface-alt border border-border-subtle text-sm text-primary placeholder:text-muted focus:outline-none focus:border-brand/50";
  const debounceRef = useRef(null);

  const searchAddress = (q) => {
    setShowSuggestions(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q || q.length < 2) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const bLat = bizSettings.lat || 34.9249; const bLon = bizSettings.lon || -81.025;
        const bizCity = bizSettings.city || 'Rock Hill'; const bizState = bizSettings.state || 'SC';
        const localQ = `${q}, ${bizCity}, ${bizState}`;
        const vb = `${bLon - 0.3},${bLat + 0.3},${bLon + 0.3},${bLat - 0.3}`;
        let res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=us&limit=6&addressdetails=1&viewbox=${vb}&q=${encodeURIComponent(localQ)}`);
        let data = await res.json();
        if (data.length === 0) { res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=us&limit=6&addressdetails=1&q=${encodeURIComponent(q)}`); data = await res.json(); }
        setSuggestions(data.map(d => {
          const a = d.address || {};
          const street = a.house_number ? `${a.house_number} ${a.road || ''}` : a.road || '';
          return { display: d.display_name, street, city: a.city || a.town || a.village || a.hamlet || '', state: a.state || '', zip: a.postcode || '' };
        }));
      } catch { setSuggestions([]); }
    }, 400);
  };

  const selectSuggestion = (s) => {
    setForm(p => ({ ...p, street: s.street, city: s.city, state: s.state, zip: s.zip }));
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      label: form.label || 'Property',
      street: form.street || null,
      city: form.city || null,
      state: form.state || null,
      zip: form.zip || null,
    };
    if (isNew) {
      await supabase.from('properties').insert({ ...payload, org_id: orgId, client_id: clientId });
    } else {
      await supabase.from('properties').update(payload).eq('id', property.id);
    }
    setSaving(false);
    await onSave();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 px-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-border-subtle rounded-2xl shadow-2xl w-full max-w-md">
        <div className="h-1 bg-brand rounded-t-2xl" />
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
          <h2 className="text-sm font-bold text-primary">{isNew ? 'Add Property' : 'Edit Property'}</h2>
          <button onClick={onClose} className="p-1 text-muted hover:text-primary cursor-pointer"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Connected address fields — property name is first row, Street 1 has autocomplete */}
          <div className="rounded-lg border border-border-subtle overflow-hidden relative">
            <input value={form.label} onChange={e => set('label', e.target.value)} placeholder="Property name"
              className="w-full px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none" />
            <input value={form.street} onChange={e => { set('street', e.target.value); searchAddress(e.target.value); }} placeholder="Street 1" autoComplete="none"
              className="w-full px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none border-t border-border-subtle" />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-[42px] z-50 bg-card border border-border-subtle rounded-lg shadow-xl max-h-48 overflow-y-auto">
                {suggestions.map((s, i) => (
                  <button key={i} onClick={() => selectSuggestion(s)}
                    className="w-full px-3 py-2.5 text-left text-xs text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer border-b border-border-subtle/30 last:border-0">
                    {s.display}
                  </button>
                ))}
              </div>
            )}
            <input value={form.street2 || ''} onChange={e => set('street2', e.target.value)} placeholder="Street 2"
              className="w-full px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none border-t border-border-subtle" />
            <div className="grid grid-cols-2 border-t border-border-subtle">
              <input value={form.city} onChange={e => set('city', e.target.value)} placeholder="City"
                className="px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none border-r border-border-subtle" />
              <input value={form.state} onChange={e => set('state', e.target.value)} placeholder="State"
                className="px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none" />
            </div>
            <div className="grid grid-cols-2 border-t border-border-subtle">
              <input value={form.zip} onChange={e => set('zip', e.target.value)} placeholder="ZIP code"
                className="px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none border-r border-border-subtle" />
              <select value={form.country || 'United States'} onChange={e => set('country', e.target.value)}
                className="px-3 py-2.5 bg-surface-alt text-sm text-primary focus:outline-none">
                <option>United States</option>
                <option>Canada</option>
              </select>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t border-border-subtle">
          {!isNew ? (
            <button onClick={async () => { if (!confirm('Delete this property?')) return; await supabase.from('properties').delete().eq('id', property.id); await onSave(); onClose(); }}
              className="px-4 py-2 rounded-lg bg-red-500/15 text-red-400 text-xs font-bold border border-red-500/30 hover:bg-red-500/25 cursor-pointer">
              Delete
            </button>
          ) : <div />}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-muted hover:text-primary cursor-pointer">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 rounded-lg bg-brand text-on-brand text-xs font-bold hover:bg-brand-hover cursor-pointer disabled:opacity-50">
              {saving ? '...' : isNew ? 'Add Property' : 'Update Property'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Dropdown Picker (creatable + selectable) ─── */
function DropdownPicker({ value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const filtered = search ? options.filter(o => o.toLowerCase().includes(search.toLowerCase())) : options;
  const canCreate = search.trim() && !options.some(o => o.toLowerCase() === search.trim().toLowerCase());
  return (
    <div ref={ref} className="relative mt-1">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-surface-alt border border-border-subtle text-sm text-left cursor-pointer hover:border-border-strong">
        <span className={value ? 'text-primary' : 'text-muted'}>{value || placeholder}</span>
        <ChevronDown size={14} className="text-muted" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-card border border-border-subtle rounded-lg shadow-xl max-h-48 overflow-y-auto">
          <div className="p-2 border-b border-border-subtle">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search or type new..."
              className="w-full px-2.5 py-1.5 rounded bg-surface-alt border border-border-subtle text-xs text-primary placeholder:text-muted focus:outline-none" autoFocus />
          </div>
          {filtered.map(o => (
            <button key={o} onClick={() => { onChange(o); setOpen(false); setSearch(''); }}
              className={`w-full px-3 py-2 text-left text-xs cursor-pointer hover:bg-surface-alt ${value === o ? 'text-brand-text font-semibold' : 'text-secondary'}`}>
              {o} {value === o && <Check size={11} className="inline ml-1 text-brand" />}
            </button>
          ))}
          {canCreate && (
            <button onClick={() => { onChange(search.trim()); setOpen(false); setSearch(''); }}
              className="w-full px-3 py-2 text-left text-xs text-brand-text font-semibold cursor-pointer hover:bg-surface-alt">
              + Create "{search.trim()}"
            </button>
          )}
          {!canCreate && filtered.length === 0 && <p className="px-3 py-2 text-xs text-muted">No options</p>}
        </div>
      )}
    </div>
  );
}

/* ─── Multi-select Tag Picker (creatable) ─── */
function TagPicker({ tags, onChange, allTags }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const all = [...new Set([...allTags, ...tags])];
  const filtered = search ? all.filter(t => t.toLowerCase().includes(search.toLowerCase())) : all;
  const canCreate = search.trim() && !all.some(t => t.toLowerCase() === search.trim().toLowerCase());
  const toggle = (t) => onChange(tags.includes(t) ? tags.filter(x => x !== t) : [...tags, t]);
  return (
    <div ref={ref} className="relative mt-1">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1.5 flex-wrap px-3 py-2 rounded-lg bg-surface-alt border border-border-subtle text-sm text-left cursor-pointer hover:border-border-strong min-h-[38px]">
        {tags.length > 0 ? tags.map(t => (
          <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand/10 text-brand-text text-[11px] font-semibold border border-brand/20">
            {t} <span onClick={(e) => { e.stopPropagation(); toggle(t); }} className="hover:text-red-400 cursor-pointer">&times;</span>
          </span>
        )) : <span className="text-muted text-sm">Select tags</span>}
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-card border border-border-subtle rounded-lg shadow-xl max-h-48 overflow-y-auto">
          <div className="p-2 border-b border-border-subtle">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search or create..."
              className="w-full px-2.5 py-1.5 rounded bg-surface-alt border border-border-subtle text-xs text-primary placeholder:text-muted focus:outline-none" autoFocus />
          </div>
          {filtered.map(t => (
            <button key={t} onClick={() => toggle(t)}
              className={`w-full px-3 py-2 text-left text-xs cursor-pointer hover:bg-surface-alt flex items-center justify-between ${tags.includes(t) ? 'text-brand-text font-semibold' : 'text-secondary'}`}>
              {t} {tags.includes(t) && <Check size={11} className="text-brand" />}
            </button>
          ))}
          {canCreate && (
            <button onClick={() => { onChange([...tags, search.trim()]); setSearch(''); }}
              className="w-full px-3 py-2 text-left text-xs text-brand-text font-semibold cursor-pointer hover:bg-surface-alt">
              + Create "{search.trim()}"
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const LEAD_SOURCES = ['Google', 'Facebook', 'Instagram', 'Nextdoor', 'Referral', 'Yard Sign', 'Door Hanger', 'Website', 'Thumbtack', 'existing-client', 'online-search', 'Other'];
const ALL_TAGS = ['vip', 'commercial', 'residential', 'referral', 'pct wt', 'syncing'];

/* ─── Boxed field: small label on top, input underneath (Jobber style) ─── */
const boxInput = 'w-full bg-transparent text-sm text-primary placeholder:text-muted focus:outline-none';
function LabeledBox({ label, children }) {
  return (
    <label className="block px-3 pt-2 pb-2 focus-within:bg-surface-alt/60">
      <span className="block text-[11px] text-muted leading-tight">{label}</span>
      {children}
    </label>
  );
}

/* ─── Lead source dropdown: every source you've used + the usual ones; type to add a new one ─── */
function LeadSourcePicker({ value, onChange, bare = false }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const used = [...new Set((clientsCache.all || []).map((c) => (c.lead_source || '').trim()).filter(Boolean))];
  const all = [...new Set([...LEAD_SOURCES.filter((x) => x !== 'Other'), ...used])].sort((a, b) => a.localeCompare(b));
  const shown = all.filter((x) => x.toLowerCase().includes(q.trim().toLowerCase()));
  const pick = (v) => { onChange(v); setOpen(false); setQ(''); };
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full text-left px-3 pt-2 pb-2 cursor-pointer flex items-end justify-between">
        <span>{!bare && <span className="block text-[11px] text-muted leading-tight">Lead source</span>}<span className={`text-sm ${value ? 'text-primary' : 'text-muted'}`}>{value || 'Choose one'}</span></span>
        <ChevronDown size={16} className="text-muted mb-0.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-card border border-border-default rounded-lg shadow-2xl">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search or type a new one…"
              onKeyDown={(e) => { if (e.key === 'Enter' && q.trim()) pick(shown[0] && shown[0].toLowerCase() === q.trim().toLowerCase() ? shown[0] : q.trim()); }}
              className="w-full px-3 py-2 bg-transparent border-b border-border-subtle text-sm text-primary focus:outline-none" />
            <div className="max-h-56 overflow-y-auto py-1">
              {value && <button type="button" onClick={() => pick('')} className="w-full px-3 py-2 text-left text-sm text-muted hover:bg-surface-alt cursor-pointer">None</button>}
              {shown.map((x) => (
                <button type="button" key={x} onClick={() => pick(x)} className="w-full px-3 py-2 text-left text-sm text-primary hover:bg-surface-alt cursor-pointer flex items-center justify-between">
                  {x}{x === value && <Check size={14} className="text-brand" />}
                </button>
              ))}
              {q.trim() && !all.some((x) => x.toLowerCase() === q.trim().toLowerCase()) && (
                <button type="button" onClick={() => pick(q.trim())} className="w-full px-3 py-2 text-left text-sm text-brand-text hover:bg-surface-alt cursor-pointer">+ Add “{q.trim()}”</button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Edit Client Modal ─── */
export function EditClientModal({ client, properties = [], onClose, onSave, onPropertiesChange, orgId, inline = false }) {
  const bizSettings = useAppStore((s) => s.businessSettings) || {};
  const primaryProp = properties[0];
  const billingMatches = primaryProp && client.billing_street === primaryProp.street && client.billing_city === primaryProp.city;
  const [form, setForm] = useState({
    title: client.custom_fields?.title || '',
    first_name: client.first_name || '',
    last_name: client.last_name || '',
    company_name: client.company_name || '',
    phones: (client.phones || []).length ? client.phones.map((p) => ({ number: formatPhone(p), label: p.label || 'Main', primary: !!p.primary, sms: p.sms !== false })) : [{ number: '', label: 'Main', primary: true, sms: true }],
    emails: (client.emails || []).length ? client.emails.map((e) => ({ address: formatEmail(e), label: e.label || 'Main', primary: !!e.primary })) : [{ address: '', label: 'Main', primary: true }],
    lead_source: client.lead_source || '',
    tags: client.tags || [],
    receives_messages: client.custom_fields?.receives_messages !== false,
    role: client.custom_fields?.role || '',
    is_company: !!client.custom_fields?.is_company,
    billing_contact: !!client.custom_fields?.billing_contact,
    payment_terms: client.custom_fields?.payment_terms || 'Residential default (3 Days)',
    extra_fields: (client.custom_fields?.jobber_fields || []).map((f) => ({ ...f })),
    prop_name: primaryProp?.label || 'Primary',
    prop_street: primaryProp?.street || '',
    prop_street2: '',
    prop_city: primaryProp?.city || '',
    prop_state: primaryProp?.state || '',
    prop_zip: primaryProp?.zip || '',
    prop_country: 'United States',
    billing_same: billingMatches !== false,
    billing_street: client.billing_street || '',
    billing_street2: '',
    billing_city: client.billing_city || '',
    billing_state: client.billing_state || '',
    billing_zip: client.billing_zip || '',
    billing_country: 'United States',
  });
  const [saving, setSaving] = useState(false);
  const [propSuggestions, setPropSuggestions] = useState([]);
  const [showPropSuggestions, setShowPropSuggestions] = useState(false);
  const propDebounce = useRef(null);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const searchPropAddress = (q) => {
    set('prop_street', q);
    setShowPropSuggestions(true);
    if (propDebounce.current) clearTimeout(propDebounce.current);
    if (!q || q.length < 2) { setPropSuggestions([]); return; }
    propDebounce.current = setTimeout(async () => {
      try {
        const bLat = bizSettings.lat || 34.9249; const bLon = bizSettings.lon || -81.025;
        const bizCity = bizSettings.city || 'Rock Hill'; const bizState = bizSettings.state || 'SC';
        const localQ = `${q}, ${bizCity}, ${bizState}`;
        const vb = `${bLon - 0.3},${bLat + 0.3},${bLon + 0.3},${bLat - 0.3}`;
        let res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=us&limit=6&addressdetails=1&viewbox=${vb}&q=${encodeURIComponent(localQ)}`);
        let data = await res.json();
        if (data.length === 0) { res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=us&limit=6&addressdetails=1&q=${encodeURIComponent(q)}`); data = await res.json(); }
        setPropSuggestions(data.map(d => {
          const a = d.address || {};
          const street = a.house_number ? `${a.house_number} ${a.road || ''}` : a.road || '';
          return { display: d.display_name, street, city: a.city || a.town || a.village || a.hamlet || '', state: a.state || '', zip: a.postcode || '' };
        }));
      } catch { setPropSuggestions([]); }
    }, 400);
  };

  const selectPropSuggestion = (s) => {
    setForm(p => ({ ...p, prop_street: s.street, prop_city: s.city, prop_state: s.state, prop_zip: s.zip }));
    setShowPropSuggestions(false);
    setPropSuggestions([]);
  };

  const handleSave = async () => {
    setSaving(true);
    // Update primary property address
    if (primaryProp && (form.prop_street || form.prop_city)) {
      await supabase.from('properties').update({
        label: form.prop_name || 'Primary',
        street: form.prop_street || null,
        city: form.prop_city || null,
        state: form.prop_state || null,
        zip: form.prop_zip || null,
      }).eq('id', primaryProp.id);
    } else if (!primaryProp && (form.prop_street || form.prop_city)) {
      await supabase.from('properties').insert({
        org_id: orgId, client_id: client.id, label: form.prop_name || 'Primary',
        street: form.prop_street || null, city: form.prop_city || null,
        state: form.prop_state || null, zip: form.prop_zip || null,
      });
    }
    if (onPropertiesChange) await onPropertiesChange();

    // Update client
    await onSave(client.id, {
      first_name: form.first_name || null,
      last_name: form.last_name || null,
      company_name: form.company_name || null,
      // Every phone/email (not just the first) — Jobber gets the same list.
      phones: form.phones.filter((p) => p.number.trim()).map((p, i, a) => ({ ...p, number: p.number.trim(), primary: a.some((x) => x.primary) ? !!p.primary : i === 0 })),
      emails: form.emails.filter((e) => e.address.trim()).map((e, i, a) => ({ ...e, address: e.address.trim(), primary: a.some((x) => x.primary) ? !!e.primary : i === 0 })),
      lead_source: form.lead_source || null,
      tags: form.tags,
      billing_street: form.billing_same ? (form.prop_street || null) : (form.billing_street || null),
      billing_city: form.billing_same ? (form.prop_city || null) : (form.billing_city || null),
      billing_state: form.billing_same ? (form.prop_state || null) : (form.billing_state || null),
      billing_zip: form.billing_same ? (form.prop_zip || null) : (form.billing_zip || null),
      custom_fields: { ...(client.custom_fields || {}), title: form.title || null, receives_messages: form.receives_messages,
        role: form.role || null, is_company: form.is_company, billing_contact: form.billing_contact, payment_terms: form.payment_terms,
        jobber_fields: form.extra_fields.filter((f) => String(f.label || '').trim()) },
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    onClose();
  };

  return (
    <div className={inline ? "max-w-3xl mx-auto" : "fixed inset-0 z-50 flex items-start justify-center pt-6 px-4"}>
      {!inline && <div className="absolute inset-0 bg-black/60" onClick={onClose} />}
      <div className={inline
        ? "relative bg-card border border-border-subtle rounded-2xl overflow-hidden w-full flex flex-col"
        : "relative bg-card border border-border-subtle rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col"}>
        <div className="h-1 bg-brand rounded-t-2xl shrink-0" />
        <div className="flex items-center justify-between px-6 py-3 border-b border-border-subtle shrink-0">
          <h2 className="text-2xl font-black text-primary">Edit Client</h2>
          <button onClick={onClose} className="p-1 text-muted hover:text-primary cursor-pointer"><X size={16} /></button>
        </div>
        <div className={inline ? "p-6 space-y-5" : "flex-1 overflow-y-auto p-6 space-y-5"}>
          {/* Primary contact details — Jobber-style boxed fields with a small label on top */}
          <div>
            <h3 className="text-xl font-bold text-primary">Primary contact details</h3>
            <p className="text-xs text-secondary mb-3">Provide the main point of contact to ensure smooth communication and reliable client records</p>
            <div className="rounded-lg border border-border-default overflow-hidden">
              <div className="grid grid-cols-[110px_1fr_1fr] divide-x divide-border-default">
                <LabeledBox label="Title">
                  <select value={form.title || ''} onChange={e => set('title', e.target.value)} className="w-full bg-transparent text-sm text-primary focus:outline-none">
                    <option value="">No title</option>
                    {['Mr.', 'Ms.', 'Mrs.', 'Miss.', 'Dr.'].map((t) => <option key={t}>{t}</option>)}
                  </select>
                </LabeledBox>
                <LabeledBox label="First name"><input value={form.first_name} onChange={e => set('first_name', e.target.value)} className={boxInput} /></LabeledBox>
                <LabeledBox label="Last name"><input value={form.last_name} onChange={e => set('last_name', e.target.value)} className={boxInput} /></LabeledBox>
              </div>
              <div className="border-t border-border-default">
                <LabeledBox label="Company name"><input value={form.company_name} onChange={e => set('company_name', e.target.value)} className={boxInput} /></LabeledBox>
              </div>
              <div className="border-t border-border-default">
                <LabeledBox label="Role"><input value={form.role} onChange={e => set('role', e.target.value)} placeholder="e.g. Property manager" className={boxInput} /></LabeledBox>
              </div>
            </div>
            <label className="flex items-center gap-2 mt-3 cursor-pointer text-sm text-primary">
              <input type="checkbox" checked={form.is_company} onChange={e => set('is_company', e.target.checked)} className="w-4 h-4 accent-brand" />
              Commercial client: Use company name as client name
            </label>
            <label className="flex items-center gap-2 mt-2 cursor-pointer text-sm text-primary">
              <input type="checkbox" checked={form.billing_contact} onChange={e => set('billing_contact', e.target.checked)} className="w-4 h-4 accent-brand" />
              Set as billing contact
            </label>
          </div>

          {/* Communication — every phone and email, each with its type; + adds another */}
          <div>
            <h3 className="text-xl font-bold text-primary mb-3">Communication</h3>
            <div className="space-y-2">
              {form.phones.map((p, i) => (
                <div key={`p${i}`} className="flex gap-2">
                  <div className="flex-1 flex rounded-lg border border-border-default overflow-hidden divide-x divide-border-default">
                    <div className="flex-1"><LabeledBox label="Phone number"><input value={p.number} type="tel" onChange={e => set('phones', form.phones.map((x, k) => k === i ? { ...x, number: e.target.value } : x))} className={boxInput} /></LabeledBox></div>
                    <select value={p.label} onChange={e => set('phones', form.phones.map((x, k) => k === i ? { ...x, label: e.target.value } : x))} className="w-28 px-3 bg-transparent text-sm text-primary focus:outline-none cursor-pointer">
                      {['Main', 'Mobile', 'Work', 'Home', 'Fax', 'Other'].map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  {i === form.phones.length - 1
                    ? <button type="button" title="Add phone" onClick={() => set('phones', [...form.phones, { number: '', label: 'Mobile', primary: false, sms: true }])} className="w-12 rounded-lg border border-border-default text-brand hover:bg-surface-alt cursor-pointer flex items-center justify-center"><Plus size={16} /></button>
                    : <button type="button" title="Remove phone" onClick={() => set('phones', form.phones.filter((_, k) => k !== i))} className="w-12 rounded-lg border border-border-default text-muted hover:text-red-500 cursor-pointer flex items-center justify-center"><X size={16} /></button>}
                </div>
              ))}
              <div className="flex items-center gap-2 py-1">
                <button type="button" onClick={() => set('receives_messages', !form.receives_messages)}
                  className={`relative w-10 h-[22px] rounded-full transition-colors shrink-0 cursor-pointer ${form.receives_messages ? 'bg-brand' : 'bg-zinc-400'}`}>
                  <span className={`absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-white shadow transition-transform ${form.receives_messages ? 'translate-x-[18px]' : 'translate-x-0'}`} />
                </button>
                <span className="text-sm text-primary">Receives messages</span>
              </div>
              {form.emails.map((em, i) => (
                <div key={`e${i}`} className="flex gap-2">
                  <div className="flex-1 flex rounded-lg border border-border-default overflow-hidden divide-x divide-border-default">
                    <div className="flex-1"><LabeledBox label="Email"><input value={em.address} type="email" onChange={e => set('emails', form.emails.map((x, k) => k === i ? { ...x, address: e.target.value } : x))} className={boxInput} /></LabeledBox></div>
                    <select value={em.label} onChange={e => set('emails', form.emails.map((x, k) => k === i ? { ...x, label: e.target.value } : x))} className="w-28 px-3 bg-transparent text-sm text-primary focus:outline-none cursor-pointer">
                      {['Main', 'Work', 'Personal', 'Other'].map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  {i === form.emails.length - 1
                    ? <button type="button" title="Add email" onClick={() => set('emails', [...form.emails, { address: '', label: 'Work', primary: false }])} className="w-12 rounded-lg border border-border-default text-brand hover:bg-surface-alt cursor-pointer flex items-center justify-center"><Plus size={16} /></button>
                    : <button type="button" title="Remove email" onClick={() => set('emails', form.emails.filter((_, k) => k !== i))} className="w-12 rounded-lg border border-border-default text-muted hover:text-red-500 cursor-pointer flex items-center justify-center"><X size={16} /></button>}
                </div>
              ))}
            </div>
          </div>

          {/* Payment terms */}
          <div>
            <h3 className="text-xl font-bold text-primary mb-3">Payment terms</h3>
            <div className="rounded-lg border border-border-default relative">
              <LabeledBox label="Payment terms">
                <select value={form.payment_terms} onChange={e => set('payment_terms', e.target.value)} className="w-full bg-transparent text-sm text-primary focus:outline-none cursor-pointer appearance-none">
                  {['Residential default (3 Days)', 'Due upon receipt', 'Net 7', 'Net 15', 'Net 30', 'Net 60'].map((t) => <option key={t}>{t}</option>)}
                </select>
              </LabeledBox>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            </div>
          </div>

          {/* Lead information — label on the left, like Jobber */}
          <div>
            <h3 className="text-xl font-bold text-primary mb-3">Lead information</h3>
            <div className="grid grid-cols-[120px_1fr] items-center gap-3">
              <span className="text-sm text-primary">Lead source</span>
              <div className="rounded-lg border border-border-default"><LeadSourcePicker bare value={form.lead_source} onChange={(v) => set('lead_source', v)} /></div>
              <span className="text-sm text-primary">Tags</span>
              <TagPicker tags={form.tags} onChange={v => set('tags', v)} allTags={ALL_TAGS} />
            </div>
          </div>

          {/* Additional client details — custom fields (Dog? …) */}
          <div className="rounded-lg bg-surface-alt p-4 space-y-2">
            <h3 className="text-lg font-bold text-primary">Additional client details</h3>
            {form.extra_fields.map((f, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                <input value={f.label} onChange={e => set('extra_fields', form.extra_fields.map((x, k) => k === i ? { ...x, label: e.target.value } : x))} placeholder="Field (e.g. Gate code)" className="rounded-md border border-border-default bg-card px-2 py-1.5 text-sm text-primary" />
                {f.type === 'TrueFalse'
                  ? <select value={f.value ? 'Yes' : 'No'} onChange={e => set('extra_fields', form.extra_fields.map((x, k) => k === i ? { ...x, value: e.target.value === 'Yes' } : x))} className="rounded-md border border-border-default bg-card px-2 py-1.5 text-sm text-primary"><option>Yes</option><option>No</option></select>
                  : <input value={f.value ?? ''} onChange={e => set('extra_fields', form.extra_fields.map((x, k) => k === i ? { ...x, value: e.target.value } : x))} placeholder="Value" className="rounded-md border border-border-default bg-card px-2 py-1.5 text-sm text-primary" />}
                <button type="button" onClick={() => set('extra_fields', form.extra_fields.filter((_, k) => k !== i))} className="p-1 text-muted hover:text-red-500 cursor-pointer"><X size={14} /></button>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-muted">Track extra details like gate codes or pets.</p>
              <button type="button" onClick={() => set('extra_fields', [...form.extra_fields, { label: '', value: '', type: 'Text' }])} className="rounded-lg border border-border-default px-3 py-1.5 text-xs font-bold text-brand-text hover:bg-card cursor-pointer">Add Custom Field</button>
            </div>
          </div>

          {/* Property address */}
          <div>
            <h3 className="text-xl font-bold text-primary mb-3">Property address</h3>
            <div className="rounded-lg border border-border-subtle overflow-hidden relative">
              <input value={form.prop_name} onChange={e => set('prop_name', e.target.value)} placeholder="Property name"
                className="w-full px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none" />
              <input value={form.prop_street} onChange={e => searchPropAddress(e.target.value)} placeholder="Street 1" autoComplete="none"
                className="w-full px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none border-t border-border-subtle" />
              {showPropSuggestions && propSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-[84px] z-50 bg-card border border-border-subtle rounded-lg shadow-xl max-h-48 overflow-y-auto">
                  {propSuggestions.map((s, i) => (
                    <button key={i} onClick={() => selectPropSuggestion(s)}
                      className="w-full px-3 py-2.5 text-left text-xs text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer border-b border-border-subtle/30 last:border-0">
                      {s.display}
                    </button>
                  ))}
                </div>
              )}
              <input value={form.prop_street2} onChange={e => set('prop_street2', e.target.value)} placeholder="Street 2"
                className="w-full px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none border-t border-border-subtle" />
              <div className="grid grid-cols-2 border-t border-border-subtle">
                <input value={form.prop_city} onChange={e => set('prop_city', e.target.value)} placeholder="City"
                  className="px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none border-r border-border-subtle" />
                <input value={form.prop_state} onChange={e => set('prop_state', e.target.value)} placeholder="State"
                  className="px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 border-t border-border-subtle">
                <input value={form.prop_zip} onChange={e => set('prop_zip', e.target.value)} placeholder="ZIP code"
                  className="px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none border-r border-border-subtle" />
                <select value={form.prop_country} onChange={e => set('prop_country', e.target.value)}
                  className="px-3 py-2.5 bg-surface-alt text-sm text-primary focus:outline-none">
                  <option>United States</option>
                  <option>Canada</option>
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 mt-3 cursor-pointer">
              <input type="checkbox" checked={form.billing_same} onChange={e => set('billing_same', e.target.checked)}
                className="w-4 h-4 rounded border-border-subtle accent-brand" />
              <span className="text-xs font-medium text-secondary">Billing address is the same as property address</span>
            </label>
            {!form.billing_same && (
              <div className="mt-3">
                <p className="text-[10px] font-bold text-muted uppercase mb-2">Billing address</p>
                <div className="rounded-lg border border-border-subtle overflow-hidden">
                  <input value={form.billing_street} onChange={e => set('billing_street', e.target.value)} placeholder="Street 1"
                    className="w-full px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none" />
                  <input value={form.billing_street2} onChange={e => set('billing_street2', e.target.value)} placeholder="Street 2"
                    className="w-full px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none border-t border-border-subtle" />
                  <div className="grid grid-cols-2 border-t border-border-subtle">
                    <input value={form.billing_city} onChange={e => set('billing_city', e.target.value)} placeholder="City"
                      className="px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none border-r border-border-subtle" />
                    <input value={form.billing_state} onChange={e => set('billing_state', e.target.value)} placeholder="State"
                      className="px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none" />
                  </div>
                  <div className="grid grid-cols-2 border-t border-border-subtle">
                    <input value={form.billing_zip} onChange={e => set('billing_zip', e.target.value)} placeholder="ZIP code"
                      className="px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none border-r border-border-subtle" />
                    <select value={form.billing_country} onChange={e => set('billing_country', e.target.value)}
                      className="px-3 py-2.5 bg-surface-alt text-sm text-primary focus:outline-none">
                      <option>United States</option>
                      <option>Canada</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-border-subtle shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-semibold text-muted hover:text-primary cursor-pointer">Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.first_name}
            className="px-5 py-2 rounded-lg bg-brand text-on-brand text-xs font-bold hover:bg-brand-hover cursor-pointer disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Client Detail ─── */
/* ─── Payment Methods — Stripe card-on-file ─── */
function PaymentMethodsSection({ client, properties }) {
  const [methods, setMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchMethods = useCallback(async () => {
    if (!client?.id) return;
    setLoading(true);
    const r = await fetch(`/api/stripe-list-cards?client_id=${client.id}`);
    const { methods } = await r.json();
    setMethods(methods || []);
    setLoading(false);
  }, [client?.id]);

  useEffect(() => { fetchMethods(); }, [fetchMethods]);

  // Build the default billing address from the client's billing_* fields if set,
  // otherwise fall back to the primary property's address.
  const billingAddress = (() => {
    if (client.billing_street) {
      return {
        street: client.billing_street,
        city: client.billing_city,
        state: client.billing_state,
        zip: client.billing_zip,
      };
    }
    const p = properties?.[0];
    if (p) return { street: p.street, city: p.city, state: p.state, zip: p.zip };
    return null;
  })();

  return (
    <div className="rounded-xl bg-card border border-border-subtle p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-primary">Payment methods</h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="text-[11px] font-semibold text-brand-text hover:underline cursor-pointer"
        >
          + Add
        </button>
      </div>
      <div className="rounded-lg bg-surface-alt/30 border border-border-subtle/50">
        {loading && (
          <div className="px-4 py-6 text-center"><p className="text-xs text-muted">Loading…</p></div>
        )}
        {!loading && methods.length === 0 && (
          <div className="px-4 py-6 text-center"><p className="text-xs text-muted">No payment methods on file</p></div>
        )}
        {!loading && methods.length > 0 && (
          <>
            <div className="grid grid-cols-[1fr_100px_140px] px-4 py-2 border-b border-border-subtle/50">
              <span className="text-[10px] font-semibold text-muted">Method</span>
              <span className="text-[10px] font-semibold text-muted">Expiry</span>
              <span className="text-[10px] font-semibold text-muted text-right"></span>
            </div>
            {methods.map((m) => (
              <div key={m.id} className="grid grid-cols-[1fr_100px_140px] items-center px-4 py-3 border-b border-border-subtle/30 last:border-b-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase text-primary">{m.brand || 'Card'}</span>
                  <span className="text-xs text-secondary">•••• {m.last4}</span>
                  {m.is_default && <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-500/15 px-1.5 py-0.5 rounded">Default</span>}
                </div>
                <span className="text-xs text-secondary tabular-nums">{m.exp_month?.toString().padStart(2, '0')}/{m.exp_year}</span>
                <div className="flex items-center gap-1 justify-end">
                  {!m.is_default && (
                    <button
                      onClick={async () => {
                        await fetch('/api/stripe-set-default-card', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ payment_method_row_id: m.id }),
                        });
                        fetchMethods();
                      }}
                      className="text-[10px] font-semibold text-brand-text hover:underline px-2 py-1 rounded cursor-pointer"
                      title="Make this the default card"
                    >
                      Set default
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      if (!confirm('Remove this card?')) return;
                      await fetch('/api/stripe-delete-card', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ payment_method_row_id: m.id }),
                      });
                      fetchMethods();
                    }}
                    className="text-muted hover:text-rose-600 p-1 rounded cursor-pointer"
                    title="Remove"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {showAddModal && (
        <AddPaymentMethodModal
          client={client}
          billingAddress={billingAddress}
          onClose={() => setShowAddModal(false)}
          onSaved={() => { setShowAddModal(false); fetchMethods(); }}
        />
      )}
    </div>
  );
}

/* ─── Charge card modal — off-session PaymentIntent on connected account ─── */
function ChargeCardModal({ client, methods, onClose }) {
  const defaultMethod = methods.find(m => m.is_default) || methods[0];
  const [selectedId, setSelectedId] = useState(defaultMethod?.id || '');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const cents = Math.round((parseFloat(amount || '0') || 0) * 100);
  const canSubmit = cents >= 50 && selectedId && !submitting;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch('/api/stripe-charge-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: client.id,
          amount_cents: cents,
          payment_method_row_id: selectedId,
          description: description || undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error || 'Charge failed');
      } else if (data.status === 'succeeded') {
        setResult(data);
      } else {
        setError(`Status: ${data.status}`);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto p-6" onClick={onClose}>
      <div className="bg-card rounded-xl w-full max-w-md shadow-xl mt-12" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
          <h3 className="text-base font-bold text-primary">Charge card</h3>
          <button onClick={onClose} className="text-muted hover:text-primary text-xl leading-none cursor-pointer">×</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {result ? (
            <div className="text-center py-4">
              <p className="text-emerald-700 font-bold text-lg">Charged ${(result.amount / 100).toFixed(2)}</p>
              <p className="text-xs text-muted mt-1 font-mono">{result.payment_intent_id}</p>
              <button onClick={onClose} className="mt-4 text-xs font-semibold text-brand-text hover:underline cursor-pointer">Done</button>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary">$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0.50"
                    autoFocus
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-7 pr-3 py-2 border border-border-subtle rounded-lg text-sm bg-surface-alt/30 focus:outline-none focus:ring-1 focus:ring-brand-text"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">Card</label>
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="w-full px-3 py-2 border border-border-subtle rounded-lg text-sm bg-surface-alt/30 cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-text"
                >
                  {methods.map(m => (
                    <option key={m.id} value={m.id}>
                      {(m.brand || 'Card').toUpperCase()} •••• {m.last4}{m.is_default ? ' (Default)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">Description (optional)</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Mowing — June"
                  className="w-full px-3 py-2 border border-border-subtle rounded-lg text-sm bg-surface-alt/30 focus:outline-none focus:ring-1 focus:ring-brand-text"
                />
              </div>
              {error && <p className="text-xs text-rose-600">{error}</p>}
              <button
                onClick={submit}
                disabled={!canSubmit}
                className="w-full py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {submitting ? 'Charging…' : cents >= 50 ? `Charge $${(cents / 100).toFixed(2)}` : 'Enter amount'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Add Payment Method modal — Stripe card-on-file ─── */
function AddPaymentMethodModal({ client, billingAddress, onClose, onSaved }) {
  // Step 1: ask the server for a SetupIntent on the connected account.
  // Step 2: render Stripe Elements with that connected account scope.
  const [setup, setSetup] = useState(null);    // { client_secret, stripe_account_id } | null
  const [bootErr, setBootErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/stripe-setup-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: client.id }),
        });
        const data = await r.json();
        if (cancelled) return;
        if (!r.ok) { setBootErr(data.error || 'Failed to start Stripe.'); return; }
        setSetup(data);
      } catch (err) {
        if (!cancelled) setBootErr(err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [client.id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-12 px-4 overflow-y-auto"
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-border-subtle rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[calc(100vh-6rem)] mb-12">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle shrink-0">
          <h2 className="text-lg font-black text-primary">Add payment method</h2>
          <button onClick={onClose} className="p-1 text-muted hover:text-primary cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {bootErr && (
          <div className="p-6">
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 px-3 py-3 text-sm text-rose-800">
              {bootErr}
            </div>
            <button onClick={onClose} className="mt-4 w-full px-4 py-2 rounded-lg bg-surface-alt text-sm font-bold text-secondary cursor-pointer">Close</button>
          </div>
        )}

        {!bootErr && !setup && (
          <div className="p-12 flex items-center justify-center">
            <Loader2 size={20} className="animate-spin text-brand" />
          </div>
        )}

        {setup && (
          <StripeCardForm
            client={client}
            billingAddress={billingAddress}
            setup={setup}
            onClose={onClose}
            onSaved={onSaved}
          />
        )}
      </div>
    </div>
  );
}

/* ─── Card form — Jobber-style (just card number / MM/YY / CVC) ─── */
function StripeCardForm({ client, billingAddress, setup, onClose, onSaved }) {
  const [stripeReady, setStripeReady] = useState(false);
  const [elementsInstance, setElementsInstance] = useState(null);
  const [nameOnCard, setNameOnCard] = useState('');
  const [editingAddress, setEditingAddress] = useState(false);
  const [addr, setAddr] = useState({
    street: billingAddress?.street || '',
    city: billingAddress?.city || '',
    state: billingAddress?.state || '',
    zip: billingAddress?.zip || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const numberRef = useRef(null);
  const expiryRef = useRef(null);
  const cvcRef = useRef(null);
  const cardElsRef = useRef({ number: null, expiry: null, cvc: null });
  const [cardError, setCardError] = useState(null); // live validation msg from Stripe

  // Load Stripe.js scoped to the connected account.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { loadStripe } = await import('@stripe/stripe-js');
      const stripe = await loadStripe(
        import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY,
        { stripeAccount: setup.stripe_account_id }
      );
      if (cancelled || !stripe) return;
      const elements = stripe.elements({
        appearance: {
          theme: 'none',
          disableAnimations: true,
          variables: {
            colorText: '#0a0a0a',
            colorTextPlaceholder: '#9ca3af',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSizeBase: '14px',
            spacingUnit: '4px',
          },
        },
      });
      setElementsInstance({ stripe, elements });
    })();
    return () => { cancelled = true; };
  }, [setup.stripe_account_id]);

  // Mount three separate card fields (number, expiry, CVC).
  useEffect(() => {
    if (!elementsInstance) return;
    const baseStyle = {
      base: {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '14px',
        color: '#0a0a0a',
        '::placeholder': { color: '#9ca3af' },
      },
      invalid: { color: '#dc2626' },
    };
    // disableLink: true tells Stripe NOT to inject the Link autofill UI.
    const number = elementsInstance.elements.create('cardNumber', {
      style: baseStyle,
      showIcon: true,
      disableLink: true,
    });
    const expiry = elementsInstance.elements.create('cardExpiry', { style: baseStyle, disableLink: true });
    const cvc = elementsInstance.elements.create('cardCvc', { style: baseStyle, disableLink: true });
    number.mount(numberRef.current);
    expiry.mount(expiryRef.current);
    cvc.mount(cvcRef.current);
    cardElsRef.current = { number, expiry, cvc };

    // Surface live validation errors so the user knows what's wrong, not just "red".
    const onChange = (ev) => {
      if (ev.error) setCardError(ev.error.message);
      else setCardError(null);
    };
    number.on('change', onChange);
    expiry.on('change', onChange);
    cvc.on('change', onChange);

    // Wait for them to be ready before allowing save.
    let readyCount = 0;
    const onReady = () => { readyCount++; if (readyCount === 3) setStripeReady(true); };
    number.on('ready', onReady);
    expiry.on('ready', onReady);
    cvc.on('ready', onReady);
    return () => {
      number.unmount(); expiry.unmount(); cvc.unmount();
      setStripeReady(false);
    };
  }, [elementsInstance]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    if (!elementsInstance) { setError('Stripe not ready'); setSaving(false); return; }
    const { stripe } = elementsInstance;
    const cardNumber = cardElsRef.current.number;

    // confirmCardSetup uses the SetupIntent client_secret we got earlier.
    const { error: confirmErr, setupIntent } = await stripe.confirmCardSetup(
      setup.client_secret,
      {
        payment_method: {
          card: cardNumber,
          billing_details: {
            name: nameOnCard || undefined,
            address: addr.street ? {
              line1: addr.street,
              city: addr.city || undefined,
              state: addr.state || undefined,
              postal_code: addr.zip || undefined,
              country: 'US',
            } : undefined,
          },
        },
      }
    );

    if (confirmErr) { setError(confirmErr.message); setSaving(false); return; }
    if (setupIntent?.status !== 'succeeded') {
      setError(`Card save did not complete (status: ${setupIntent?.status || 'unknown'}).`);
      setSaving(false);
      return;
    }

    // Persist the saved payment_method to our DB.
    const r = await fetch('/api/stripe-save-card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: client.id,
        payment_method_id: setupIntent.payment_method,
      }),
    });
    const data = await r.json();
    if (!r.ok) { setError(data.error || 'Failed to save card.'); setSaving(false); return; }

    setSaving(false);
    onSaved();
  };

  const inputCls = "w-full px-3 py-2.5 rounded-lg bg-surface-alt border border-border-subtle text-sm text-primary placeholder:text-muted focus:outline-none focus:border-brand/50";

  return (
    <>
      <div className="p-6 space-y-5 overflow-y-auto flex-1 min-h-0">
        {/* Card tile */}
        <div className="relative rounded-xl bg-primary text-card p-4 w-32">
          <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-card text-primary flex items-center justify-center">
            <Check size={12} strokeWidth={3} />
          </div>
          <div className="w-8 h-6 rounded border-2 border-card mb-3 opacity-80" />
          <p className="text-xs font-bold">Credit/Debit</p>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-bold text-primary">Card details</h3>
          <input
            value={nameOnCard}
            onChange={(e) => setNameOnCard(e.target.value)}
            placeholder="Name on card"
            className={inputCls}
          />
          {/* Stripe split card elements — looks like Jobber */}
          <div className={`rounded-lg bg-surface-alt border ${cardError ? 'border-rose-500' : 'border-border-subtle'}`}>
            <div ref={numberRef} className="px-3 py-3 border-b border-border-subtle min-h-[44px]" />
            <div className="grid grid-cols-2">
              <div ref={expiryRef} className="px-3 py-3 border-r border-border-subtle min-h-[44px]" />
              <div ref={cvcRef} className="px-3 py-3 min-h-[44px]" />
            </div>
          </div>
          {cardError && (
            <p className="text-xs text-rose-600 font-semibold">{cardError}</p>
          )}
          {!stripeReady && <p className="text-[11px] text-muted">Loading secure card input…</p>}
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-bold text-primary">Billing Address</h3>
          {!editingAddress ? (
            <>
              {addr.street ? (
                <p className="text-sm text-secondary leading-snug">
                  {addr.street}<br />
                  {[addr.city, addr.state, addr.zip].filter(Boolean).join(', ')}
                </p>
              ) : (
                <p className="text-sm text-muted italic">No billing address on file</p>
              )}
              <button
                onClick={() => setEditingAddress(true)}
                className="text-xs font-semibold text-brand-text hover:underline cursor-pointer"
              >
                Change
              </button>
            </>
          ) : (
            <div className="space-y-2">
              <input value={addr.street} onChange={(e) => setAddr((a) => ({ ...a, street: e.target.value }))} placeholder="Street" className={inputCls} />
              <div className="grid grid-cols-3 gap-2">
                <input value={addr.city} onChange={(e) => setAddr((a) => ({ ...a, city: e.target.value }))} placeholder="City" className={inputCls} />
                <input value={addr.state} onChange={(e) => setAddr((a) => ({ ...a, state: e.target.value }))} placeholder="State" className={inputCls} />
                <input value={addr.zip} onChange={(e) => setAddr((a) => ({ ...a, zip: e.target.value }))} placeholder="ZIP" className={inputCls} />
              </div>
              <button onClick={() => setEditingAddress(false)} className="text-xs font-semibold text-brand-text hover:underline cursor-pointer">Done</button>
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 px-3 py-2 text-xs text-rose-800">
            {error}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border-subtle">
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-bold text-secondary hover:bg-surface-alt cursor-pointer">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !stripeReady || !!cardError}
          className="px-4 py-2 rounded-lg bg-brand text-on-brand text-sm font-bold hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </>
  );
}

/* ─── Work Overview — jobs (real, from hub_jobs), other tabs TBD ─── */
function WorkOverviewSection({ clientId, workTab, setWorkTab }) {
  const [jobs, setJobs] = useState([]);
  const [requests, setRequests] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    (async () => {
      const [jobsRes, reqRes, quoteRes] = await Promise.all([
        supabase.from('hub_jobs')
          .select('id, title, type, status, job_number, total_amount, start_date, end_date, frequency_label')
          .eq('contact_id', clientId)
          .order('start_date', { ascending: false, nullsFirst: false }),
        supabase.from('requests')
          .select('id, request_number, title, status, assessment_date, created_at, raw_payload')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false }),
        supabase.from('hub_quotes')
          .select('id, quote_number, title, status, total, created_at')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false }),
      ]);
      setJobs(jobsRes.data || []);
      setRequests(reqRes.data || []);
      setQuotes(quoteRes.data || []);
      setLoading(false);
    })();
  }, [clientId]);

  // "Active" rolls up every kind of work that isn't archived (jobs + requests + quotes).
  // "All Jobs" is the strict jobs-only view (default to active-only filter off).
  const activeJobs     = jobs.filter((j) => j.status !== 'archived');
  const activeRequests = requests.filter((r) => r.status !== 'lost' && r.status !== 'archived');
  const activeQuotes   = quotes.filter((q) => q.status !== 'archived');
  const activeAll = [
    ...activeJobs.map(r => ({ ...r, _kind: 'job',     _ts: r.start_date || r.created_at })),
    ...activeRequests.map(r => ({ ...r, _kind: 'request', _ts: r.created_at })),
    ...activeQuotes.map(r => ({ ...r, _kind: 'quote',   _ts: r.created_at })),
  ].sort((a, b) => (new Date(b._ts).getTime() || 0) - (new Date(a._ts).getTime() || 0));

  const [jobsScope, setJobsScope] = useState('active'); // 'active' (everything) | 'all' (all jobs only)
  const [scopeOpen, setScopeOpen] = useState(false);
  const scopeRef = useRef(null);
  useEffect(() => {
    if (!scopeOpen) return;
    const onDown = (e) => { if (scopeRef.current && !scopeRef.current.contains(e.target)) setScopeOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [scopeOpen]);

  // Type filter — multi-select chips. Empty set = no filter (show all kinds).
  // Click a chip to add it, click its X to remove it.
  const [typeFilter, setTypeFilter] = useState(() => new Set());
  const toggleType = (t) => {
    setTypeFilter(prev => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  };
  const removeType = (t) => {
    setTypeFilter(prev => {
      const next = new Set(prev);
      next.delete(t);
      return next;
    });
  };

  const scopedRows = jobsScope === 'active' ? activeAll : jobs.map(r => ({ ...r, _kind: 'job' }));
  // Apply type filter only if user has picked anything.
  const tabRows = typeFilter.size === 0 ? scopedRows : scopedRows.filter(r => typeFilter.has(r._kind));
  const isWired = true;

  const fmtDate = (s) => {
    if (!s) return '—';
    const d = new Date(s);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const fmtMoney = (n) => (n == null ? '—' : `$${Number(n).toFixed(2)}`);

  return (
    <div className="rounded-xl bg-card border border-border-subtle p-5">
      <h2 className="text-[11px] font-bold text-muted uppercase tracking-wider mb-3">Work Overview</h2>
      <div className="flex items-center gap-1 mb-3">
        {/* Scope dropdown — Active rollup (everything not archived) or All Jobs only. */}
        <div className="relative" ref={scopeRef}>
          <button
            onClick={() => setScopeOpen(o => !o)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer capitalize bg-surface-alt text-primary"
          >
            {jobsScope === 'active' ? 'Active' : 'All Jobs'}
            <span className="ml-1 text-[10px] text-muted">{scopedRows.length}</span>
            <ChevronDown size={11} className="text-muted" />
          </button>
          {scopeOpen && (
            <div className="absolute left-0 top-full mt-1 z-50 bg-card border border-border-subtle rounded-lg shadow-2xl py-1 min-w-[140px]">
              {[
                { id: 'active', label: 'Active', count: activeAll.length },
                { id: 'all',    label: 'All Jobs', count: jobs.length },
              ].map(opt => (
                <button key={opt.id}
                  onClick={() => { setJobsScope(opt.id); setScopeOpen(false); }}
                  className={`w-full px-3 py-1.5 text-left text-[11px] font-bold flex items-center justify-between hover:bg-surface-alt cursor-pointer ${jobsScope === opt.id ? 'text-primary' : 'text-secondary'}`}>
                  <span>{opt.label}</span>
                  <span className="text-[10px] text-muted">{opt.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Multi-select type filters. Empty = show all kinds. Selected chip shows X to remove. */}
        {[
          { id: 'request', label: 'Requests', count: requests.length },
          { id: 'quote',   label: 'Quotes',   count: quotes.length },
          { id: 'job',     label: 'Jobs',     count: jobs.length },
          { id: 'invoice', label: 'Invoices', count: 0 },
        ].map((t) => {
          const selected = typeFilter.has(t.id);
          return (
            <button
              key={t.id}
              onClick={() => selected ? removeType(t.id) : toggleType(t.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer ${
                selected ? 'bg-brand/15 text-brand-text border border-brand/40' : 'text-muted hover:text-secondary'
              }`}
            >
              {t.label}
              {t.count > 0 && <span className="text-[10px] text-muted">{t.count}</span>}
              {selected && (
                <span
                  onClick={(e) => { e.stopPropagation(); removeType(t.id); }}
                  className="ml-1 inline-flex items-center justify-center rounded-full hover:bg-brand/30">
                  <X size={11} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="rounded-lg bg-surface-alt/30 border border-border-subtle/50">
        <div className="grid grid-cols-[1fr_120px_110px_100px] px-4 py-2 border-b border-border-subtle/50">
          <span className="text-[10px] font-semibold text-muted">Item</span>
          <span className="text-[10px] font-semibold text-muted">Date</span>
          <span className="text-[10px] font-semibold text-muted">Status</span>
          <span className="text-[10px] font-semibold text-muted text-right">Amount</span>
        </div>
        {loading && (
          <div className="px-4 py-6 text-center"><p className="text-xs text-muted">Loading…</p></div>
        )}
        {!loading && !isWired && (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-muted capitalize">{workTab} aren't connected yet</p>
          </div>
        )}
        {!loading && isWired && tabRows.length === 0 && (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-muted">No {workTab} items yet</p>
          </div>
        )}
        {!loading && isWired && tabRows.map((row) => {
          // Per-row adapter so requests/quotes/jobs render with their own column shape.
          // When the "Active" rollup is showing, rows carry `_kind` so the renderer
          // can dispatch even though workTab is 'jobs'.
          const kind = row._kind || (workTab === 'requests' ? 'request' : workTab === 'quotes' ? 'quote' : 'job');
          if (kind === 'request') {
            const name = row.title || (row.raw_payload?.assessment?.instructions ? 'Untitled request' : 'Request');
            // Derive the same bucket the Requests page uses — so a scheduled request
            // shows as Upcoming / Today / Overdue, not the raw `status` column.
            const bucket = requestBucketFor(row);
            const cfg = REQUEST_STATUS_CONFIG[bucket] || REQUEST_STATUS_CONFIG.new;
            return (
              <div key={row.id}
                onClick={() => navigate(`/requests/${row.request_number ?? row.id}`)}
                className="grid grid-cols-[1fr_120px_110px_100px] items-center px-4 py-3 border-b border-border-subtle/30 last:border-b-0 cursor-pointer hover:bg-surface-alt/40">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-primary truncate">{name}</p>
                  <p className="text-[10px] text-muted">{row.assessment_date ? 'Assessment scheduled' : 'New'}</p>
                </div>
                <span className="text-xs text-secondary">{fmtDate(row.created_at)}</span>
                <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${cfg.text || 'text-amber-400'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                  {cfg.label}
                </span>
                <span className="text-xs text-muted tabular-nums text-right">—</span>
              </div>
            );
          }
          if (kind === 'quote') {
            return (
              <div key={row.id}
                onClick={() => navigate(`/quotes/${row.quote_number ?? row.id}`)}
                className="grid grid-cols-[1fr_120px_110px_100px] items-center px-4 py-3 border-b border-border-subtle/30 last:border-b-0 cursor-pointer hover:bg-surface-alt/40">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-primary truncate">{row.quote_number ? `#${row.quote_number} ` : ''}{row.title || 'Untitled quote'}</p>
                  <p className="text-[10px] text-muted">Quote</p>
                </div>
                <span className="text-xs text-secondary">{fmtDate(row.created_at)}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-secondary">{(row.status || 'draft').replace(/_/g, ' ')}</span>
                <span className="text-xs text-primary tabular-nums text-right">{fmtMoney(row.total)}</span>
              </div>
            );
          }
          // jobs / active jobs
          return (
            <div key={row.id} className="grid grid-cols-[1fr_120px_110px_100px] items-center px-4 py-3 border-b border-border-subtle/30 last:border-b-0">
              <div className="min-w-0">
                <p className="text-xs font-bold text-primary truncate">
                  {row.job_number ? `#${row.job_number} ` : ''}{row.title || 'Untitled job'}
                </p>
                <p className="text-[10px] text-muted">
                  {row.type === 'recurring' ? (row.frequency_label || 'Recurring') : 'One-off'}
                </p>
              </div>
              <span className="text-xs text-secondary">{fmtDate(row.start_date)}</span>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${row.status === 'active' ? 'text-emerald-400' : row.status === 'completed' ? 'text-muted' : 'text-amber-400'}`}>
                {row.status}
              </span>
              <span className="text-xs text-primary tabular-nums text-right">{fmtMoney(row.total_amount)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Client Schedule — visits, assessments, tasks (completed-only filter) ─── */
function ClientScheduleSection({ clientId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'completed'
  const [typeFilter, setTypeFilter] = useState('all');     // 'all' | 'visit' | 'assessment' | 'task'

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    // Pull every Jobber-synced visit for this client. Jobs/visits are linked to
    // contacts via hub_jobs.contact_id, and visits roll up via job_id.
    (async () => {
      const { data: jobs } = await supabase
        .from('hub_jobs')
        .select('id, title, type, status')
        .eq('contact_id', clientId);
      const jobIds = (jobs || []).map((j) => j.id);
      if (jobIds.length === 0) { setItems([]); setLoading(false); return; }
      const { data: visits } = await supabase
        .from('hub_visits')
        .select('id, job_id, title, scheduled_at, completed_at, status, type')
        .in('job_id', jobIds)
        .order('scheduled_at', { ascending: false });
      const jobMap = Object.fromEntries((jobs || []).map((j) => [j.id, j]));
      const rows = (visits || []).map((v) => {
        const job = jobMap[v.job_id] || {};
        // Type — explicit on visit if available; otherwise infer from job type.
        const type = v.type || (job.type === 'assessment' ? 'assessment' : 'visit');
        // Status — only "completed" or "scheduled" as requested.
        const completed = !!v.completed_at || v.status === 'completed';
        return {
          id: v.id,
          title: v.title || job.title || 'Visit',
          type,
          status: completed ? 'completed' : 'scheduled',
          when: v.completed_at || v.scheduled_at,
        };
      });
      setItems(rows);
      setLoading(false);
    })();
  }, [clientId]);

  const filtered = items.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (typeFilter !== 'all' && r.type !== typeFilter) return false;
    return true;
  });

  const formatWhen = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="rounded-xl bg-card border border-border-subtle p-5">
      <h2 className="text-[11px] font-bold text-muted uppercase tracking-wider mb-2">Client Schedule</h2>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-surface-alt border border-border-subtle text-xs font-bold text-primary cursor-pointer focus:outline-none focus:border-brand/50"
        >
          <option value="all">All types</option>
          <option value="visit">Visits</option>
          <option value="assessment">Assessments</option>
          <option value="task">Tasks</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-surface-alt border border-border-subtle text-xs font-bold text-primary cursor-pointer focus:outline-none focus:border-brand/50"
        >
          <option value="all">All statuses</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      <div className="rounded-lg bg-surface-alt/30 border border-border-subtle/50">
        <div className="grid grid-cols-[1fr_120px_120px_100px] px-4 py-2 border-b border-border-subtle/50">
          <span className="text-[10px] font-semibold text-muted">Title</span>
          <span className="text-[10px] font-semibold text-muted">Type</span>
          <span className="text-[10px] font-semibold text-muted">Date</span>
          <span className="text-[10px] font-semibold text-muted text-right">Status</span>
        </div>
        {loading && (
          <div className="px-4 py-6 text-center"><p className="text-xs text-muted">Loading…</p></div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="px-4 py-6 text-center"><p className="text-xs text-muted">No scheduled items</p></div>
        )}
        {!loading && filtered.map((r) => (
          <div key={r.id} className="grid grid-cols-[1fr_120px_120px_100px] px-4 py-2.5 border-b border-border-subtle/30 last:border-b-0 items-center">
            <span className="text-xs text-primary truncate">{r.title}</span>
            <span className="text-[11px] capitalize text-secondary">{r.type}</span>
            <span className="text-[11px] text-secondary">{formatWhen(r.when)}</span>
            <span className={`justify-self-end text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
              r.status === 'completed'
                ? 'bg-emerald-500/15 text-emerald-700'
                : 'bg-amber-500/15 text-amber-700'
            }`}>
              {r.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClientDetail({ client, properties, onBack, orgId, onPropertiesChange, archiveClient, deleteClient, onClientUpdate, clientIsLead }) {
  const navigate = useNavigate();
  const name = (client.custom_fields?.is_company && client.company_name) || [client.first_name, client.last_name].filter(Boolean).join(' ') || client.company_name || 'Unknown';
  const phone = primaryPhone(client.phones);
  const billingAddr = [client.billing_street, client.billing_city, client.billing_state, client.billing_zip].filter(Boolean).join(', ');
  const [workTab, setWorkTab] = useState('jobs');
  const [editProperty, setEditProperty] = useState(null);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [tab, setTab] = useState('info'); // info | comm | files
  const [contactKey, setContactKey] = useState(0);
  const [editing, setEditing] = useState(false);
  const extras = useClientExtras(client);
  const { session } = useAuth();
  const cf = client.custom_fields || {};
  const infoRows = [
    ...(client.phones || []).map((p, i) => [`${p.label || 'Main'} phone`, <a key={`p${i}`} href={`tel:${formatPhone(p)}`} className="text-brand-text underline">{formatPhone(p)}</a>]),
    ...(client.emails || []).map((e, i) => [`${e.label || 'Main'} email`, <a key={`e${i}`} href={`mailto:${formatEmail(e)}`} className="text-brand-text underline break-all">{formatEmail(e)}</a>]),
  ];
  const sideRows = [
    ['Payment terms', cf.payment_terms || 'Residential default (3 Days)'],
    client.lead_source && ['Lead source', client.lead_source],
    cf.role && ['Role', cf.role],
    cf.title && ['Title', cf.title],
    ['Ask for a review', cf.receives_reviews === false ? 'No' : 'Yes'],
    ...(cf.jobber_fields || []).map((f) => [f.label, f.value === true ? 'Yes' : f.value === false ? 'No' : String(f.value ?? '—')]),
  ].filter(Boolean);
  return (
    <div>
      {editing && (
        <EditClientModal client={client} properties={properties} orgId={orgId}
          onClose={() => setEditing(false)}
          onPropertiesChange={onPropertiesChange}
          onSave={async (id, patch) => { await saveClientRecord(id, patch); await onClientUpdate(id, {}); }} />
      )}
      {editProperty && (
        <PropertyEditor
          property={editProperty === 'new' ? null : editProperty}
          clientId={client.id}
          orgId={orgId}
          onClose={() => setEditProperty(null)}
          onSave={onPropertiesChange}
        />
      )}

      {/* Two-column layout */}
      <div className="flex gap-5">
        {/* ─── Left: main content ─── */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* 1. Hero — avatar + name + contact chips + actions, no card frame */}
          <div className="relative rounded-2xl border border-border-subtle bg-card">
            <div className="flex items-start justify-between gap-4 p-6">
              <div className="flex items-start gap-4 min-w-0">
                <div className="w-14 h-14 rounded-2xl bg-brand-text/15 border border-brand-text/30 flex items-center justify-center shrink-0">
                  <span className="text-xl font-black text-brand-text">{(name || '?').slice(0, 1).toUpperCase()}</span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${clientIsLead ? 'text-amber-400' : 'text-emerald-400'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${clientIsLead ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                      {clientIsLead ? 'Lead' : 'Active'}
                    </span>
                    {client.lead_source && (
                      <>
                        <span className="text-muted">·</span>
                        <span className="text-[10px] text-muted">via {client.lead_source}</span>
                      </>
                    )}
                  </div>
                  <h1 className="text-2xl font-black text-primary leading-tight">{name}</h1>
                  {(() => { const person = [client.first_name, client.last_name].filter(Boolean).join(' '); const sub = client.custom_fields?.is_company ? person : client.company_name; return sub ? <p className="text-base font-semibold text-muted mt-0.5">{sub}</p> : null; })()}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="relative">
                  <button onClick={() => setShowCreateMenu(o => !o)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-on-brand text-xs font-bold hover:bg-brand-hover cursor-pointer">
                    <Plus size={13} /> Create
                  </button>
                  {showCreateMenu && (
                    <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowCreateMenu(false)} />
                    <div className="absolute right-0 top-full mt-2 z-50 bg-card border border-border-subtle rounded-xl shadow-2xl min-w-[200px] py-2">
                      {(() => {
                        // Until Hub has its own Requests/Quotes/Jobs/Invoices, these open Jobber's create screen for this client.
                        const jid = (() => { try { return atob(client.external_id || '').split('/').pop(); } catch { return ''; } })();
                        const jobber = (path) => () => window.open(jid ? `https://secure.getjobber.com/${path}${path.includes('?') ? '&' : '?'}client_id=${jid}` : 'https://secure.getjobber.com', '_blank');
                        const jobberClient = () => window.open(jid ? `https://secure.getjobber.com/clients/${jid}` : 'https://secure.getjobber.com', '_blank');
                        return [
                          ['Request', Inbox, 'text-orange-500', jobber('work_requests/new')],
                          ['Quote', FileSearch, 'text-rose-400', jobber('quotes/new')],
                          ['Job', Hammer, 'text-emerald-500', jobber('work_orders/new')],
                          ['Invoice', FileText, 'text-sky-500', jobber('invoices/new')],
                          ['Payment', CreditCard, 'text-sky-500', jobberClient],
                          ['Task', ClipboardCheck, 'text-muted', jobberClient],
                          ['Property', Home, 'text-primary', () => { setTab('info'); setEditProperty('new'); }],
                          ['Contact', UserRound, 'text-primary', () => { setTab('info'); setContactKey((k) => k + 1); }],
                        ].map(([label, Icon, color, go]) => (
                          <button key={label} onClick={() => { setShowCreateMenu(false); go(); }}
                            className="w-full px-4 py-2.5 text-left text-sm font-semibold text-primary hover:bg-surface-alt cursor-pointer flex items-center gap-3">
                            <Icon size={18} className={color} /> {label}
                          </button>
                        ));
                      })()}
                    </div>
                    </>
                  )}
                </div>
                <button onClick={() => setEditing(true)}
                  className="p-2 rounded-lg bg-surface-alt border border-border-subtle text-muted hover:text-primary cursor-pointer" title="Edit client">
                  <Pencil size={15} />
                </button>
                <div className="relative">
                  <button onClick={() => setShowMoreMenu(o => !o)}
                    className="p-2 rounded-lg bg-surface-alt border border-border-subtle text-muted hover:text-primary cursor-pointer">
                    <MoreHorizontal size={15} />
                  </button>
                  {showMoreMenu && (
                    <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border-subtle rounded-lg shadow-2xl min-w-[170px] py-1">
                      <button className="w-full px-4 py-2 text-left text-xs font-medium text-secondary hover:bg-surface-alt cursor-pointer">
                        Send Login Email
                      </button>
                      <button className="w-full px-4 py-2 text-left text-xs font-medium text-secondary hover:bg-surface-alt cursor-pointer">
                        Log in as Client
                      </button>
                      <div className="h-px bg-border-subtle my-1" />
                      <button onClick={() => { archiveClient(client.id); onBack(); }}
                        className="w-full px-4 py-2 text-left text-xs font-medium text-secondary hover:bg-surface-alt cursor-pointer flex items-center gap-2">
                        <Archive size={12} /> Archive
                      </button>
                      <button onClick={() => { deleteClient(client.id); onBack(); }}
                        className="w-full px-4 py-2 text-left text-xs font-medium text-red-400 hover:bg-surface-alt cursor-pointer flex items-center gap-2">
                        <Trash2 size={12} /> Delete Client
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {/* Contact + details rows (like Jobber's header) */}
            <div className="grid md:grid-cols-2 gap-x-8 px-6 pb-5 text-sm">
              <div>{infoRows.map(([k, v], i) => <div key={i} className="flex gap-4 py-2 border-b border-border-subtle/60"><span className="w-32 shrink-0 text-muted">{k}</span><span className="min-w-0">{v}</span></div>)}</div>
              <div>{sideRows.map(([k, v], i) => <div key={i} className="flex gap-4 py-2 border-b border-border-subtle/60"><span className="w-32 shrink-0 text-muted">{k}</span><span className="text-primary">{v}</span></div>)}</div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-6 border-b border-border-subtle px-1">
            {[['info', 'Client information'], ['comm', 'Communication'], ['files', 'Files and media']].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`pb-2.5 text-sm font-semibold border-b-2 -mb-px cursor-pointer ${tab === k ? 'border-brand text-primary' : 'border-transparent text-muted hover:text-primary'}`}>{l}</button>
            ))}
          </div>

          {tab === 'comm' && (
            <div className="rounded-xl bg-card border border-border-subtle p-5">
              {phone ? <LeadChat phone={phone} name={name} token={session?.access_token || ''} /> : <p className="text-sm text-muted">No phone on file.</p>}
            </div>
          )}
          {tab === 'files' && (
            <div className="rounded-xl bg-card border border-border-subtle p-8 text-center text-sm text-muted">Photos and files for this client will show here.</div>
          )}

          {tab === 'info' && <>
          {/* 2. Properties (Primary first, then any additional) */}
          <div className="rounded-xl bg-card border border-border-subtle p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-bold text-muted uppercase tracking-wider">Properties</h2>
              <button onClick={() => setEditProperty('new')} className="text-[11px] font-semibold text-brand-text hover:underline cursor-pointer">+ Add</button>
            </div>
            {properties.length === 0 ? (
              <p className="text-xs text-muted py-3">Add a property so you can organize work by location</p>
            ) : (
              <div className="space-y-2">
                {properties.map((p, i) => {
                  const pAddr = [p.street, p.city, p.state, p.zip].filter(Boolean).join(', ');
                  const propNotes = p.notes ? p.notes.split(', ').filter(Boolean) : [];
                  const isPrimary = i === 0;
                  return (
                    <div key={p.id} className="flex items-start gap-3 p-3 rounded-lg bg-surface-alt/30 border border-border-subtle/50 group">
                      <MapPin size={15} className="text-brand-text mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-primary">{p.label || (isPrimary ? 'Primary' : 'Property')}</p>
                            {isPrimary && <span className="text-[9px] font-bold uppercase tracking-wider text-brand-text bg-brand/10 px-1.5 py-0.5 rounded">Primary</span>}
                          </div>
                          <button onClick={() => setEditProperty(p)}
                            className="opacity-0 group-hover:opacity-100 text-[10px] font-semibold text-brand-text hover:underline cursor-pointer transition-opacity">
                            Edit
                          </button>
                        </div>
                        <p className="text-xs text-secondary">{pAddr || 'No address'}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-[11px]">
                          {p.lot_size_sqft && <span className="text-muted">Lot: <span className="text-primary font-medium">{p.lot_size_sqft.toLocaleString()} sqft</span></span>}
                          {propNotes.includes('Dog on property') && <span className="text-amber-400 font-medium">Dog</span>}
                          {propNotes.includes('Lockout gate') && <span className="text-muted">Lockout gate</span>}
                          {propNotes.includes('Narrow gate') && <span className="text-muted">Narrow gate</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <ClientContactsCard key={contactKey} startOpen={contactKey > 0} client={client} onClientUpdate={onClientUpdate} extras={extras} />

          {/* 3. Work overview — separate card */}
          {extras.data?.linked
            ? <JobberWorkOverview extras={extras} />
            : <WorkOverviewSection clientId={client.id} workTab={workTab} setWorkTab={setWorkTab} />}

          {/* Payment methods */}
          <ClientBillingSection extras={extras} />

          <PaymentMethodsSection client={client} properties={properties} />


          {/* 6. Client schedule — every activity ever scheduled for this client */}
          {extras.data?.linked ? <JobberScheduleSection extras={extras} /> : <ClientScheduleSection clientId={client.id} />}
          </>}
        </div>

        {/* ─── Right: sidebar ─── */}
        <div className="hidden lg:block w-72 shrink-0 space-y-4">
          {/* Overview */}
          <div className="rounded-xl bg-card border border-border-subtle p-4">
            <h3 className="text-[11px] font-bold text-muted uppercase tracking-wider mb-3">Overview</h3>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Current balance</span>
                <span className="text-lg font-black text-primary">{extras.data?.linked ? money(extras.data.balance) : '$0.00'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Lifetime value</span>
                <span className="text-sm font-bold text-emerald-400">{extras.data?.linked ? money(extras.data.lifetime) : '$0.00'}</span>
              </div>
            </div>
          </div>

          <ClientTagsCard client={client} onClientUpdate={onClientUpdate} />

          {/* Last communication */}
          <div className="rounded-xl bg-card border border-border-subtle p-4">
            <h3 className="text-[11px] font-bold text-muted uppercase tracking-wider mb-2">Last Communication</h3>
            <p className="text-xs text-muted">No communications yet</p>
          </div>

          <ClientNotesCard client={client} onClientUpdate={onClientUpdate} extras={extras} />

        </div>
      </div>
    </div>
  );
}

/* ─── Live Jobber extras for one client (billing, notes, contacts), cached so reopening is instant ─── */
const extrasCache = {};
const money = (n) => `${n < 0 ? '-' : ''}$${Math.abs(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function useClientExtras(client) {
  const { session } = useAuth();
  const token = session?.access_token || '';
  const [data, setData] = useState(() => extrasCache[client.id] || null);
  const [err, setErr] = useState('');
  const call = useCallback(async (body) => {
    const r = await fetch(`/api/jobber-data?action=client-extras&id=${encodeURIComponent(client.id)}`, body
      ? { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ id: client.id, ...body }) }
      : { headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error || `Failed (${r.status})`); return null; }
    setErr(''); extrasCache[client.id] = j; setData(j); return j;
  }, [client.id, token]);
  useEffect(() => { if (token) call(); }, [call, token]);
  return { data, err, act: call };
}

/* ─── Work overview: requests, quotes, jobs, invoices — live from Jobber ─── */
const DONE = new Set(['converted', 'archived', 'paid', 'bad_debt', 'closed', 'cancelled', 'completed', 'void']);
const WORK_ICON = { request: '📥', quote: '📝', job: '🔨', invoice: '🧾' };
function JobberWorkOverview({ extras }) {
  const [tab, setTab] = useState('active');
  const all = (extras.data?.work || []).slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const rows = tab === 'active' ? all.filter((w) => !DONE.has(String(w.status || '').toLowerCase())) : all.filter((w) => w.kind === tab);
  const count = (k) => (k === 'active' ? all.filter((w) => !DONE.has(String(w.status || '').toLowerCase())).length : all.filter((w) => w.kind === k).length);
  const pretty = (st) => String(st || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  return (
    <div className="rounded-xl bg-card border border-border-subtle p-5">
      <h2 className="text-lg font-bold text-primary mb-3">Work overview</h2>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {[['active', 'Active'], ['request', 'Requests'], ['quote', 'Quotes'], ['job', 'Jobs'], ['invoice', 'Invoices']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border cursor-pointer ${tab === k ? 'bg-surface-alt border-border-default text-primary' : 'border-border-subtle text-muted hover:text-primary'}`}>
            {k !== 'active' && <span className="mr-1">{WORK_ICON[k]}</span>}{l} <span className="text-muted">{count(k)}</span>
          </button>
        ))}
      </div>
      {!rows.length ? <p className="text-sm text-muted text-center py-4">Nothing here</p> : (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[11px] text-muted border-b border-border-subtle"><th className="py-2">Item</th><th>Date</th><th>Status</th><th className="text-right">Amount</th></tr></thead>
          <tbody>
            {rows.map((w) => (
              <tr key={w.id} className="border-b border-border-subtle/50 hover:bg-surface-alt/40 cursor-pointer" onClick={() => w.url && window.open(w.url, '_blank')}>
                <td className="py-2.5"><p className="font-semibold text-primary">{WORK_ICON[w.kind]} {w.label}</p>{w.title && <p className="text-xs text-secondary truncate max-w-[320px]">{w.title}</p>}</td>
                <td className="text-secondary">{w.date ? new Date(w.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</td>
                <td><span className={`text-xs font-semibold ${DONE.has(String(w.status || '').toLowerCase()) ? 'text-muted' : 'text-emerald-500'}`}>{pretty(w.status)}</span></td>
                <td className="text-right text-primary">{w.amount != null ? money(w.amount) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-[11px] text-muted mt-2">Tap a row to open it in Jobber.</p>
    </div>
  );
}

/* ─── Client schedule: visits, assessments, tasks — live from Jobber ─── */
function JobberScheduleSection({ extras }) {
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const now = Date.now();
  const items = (extras.data?.schedule || [])
    .filter((v) => type === 'all' || v.type === type)
    .filter((v) => status === 'all' || (status === 'done' ? v.done : !v.done))
    // Upcoming first (soonest on top), then past (most recent on top)
    .sort((a, b) => { const ta = new Date(a.date).getTime(); const tb = new Date(b.date).getTime(); const fa = ta >= now; const fb = tb >= now; return fa !== fb ? (fa ? -1 : 1) : fa ? ta - tb : tb - ta; });
  const sel = 'rounded-lg bg-surface-alt border border-border-subtle px-3 py-1.5 text-xs font-semibold text-primary cursor-pointer';
  return (
    <div className="rounded-xl bg-card border border-border-subtle p-5">
      <h2 className="text-lg font-bold text-primary mb-3">Client schedule</h2>
      <div className="flex gap-2 mb-3">
        <select value={type} onChange={(e) => setType(e.target.value)} className={sel}><option value="all">Type | All</option><option value="Visit">Visits</option><option value="Assessment">Assessments</option><option value="Task">Tasks</option></select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel}><option value="all">Status | All</option><option value="open">Not done</option><option value="done">Completed</option></select>
      </div>
      {!items.length ? <p className="text-sm text-muted text-center py-4">No scheduled items</p> : (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[11px] text-muted border-b border-border-subtle"><th className="py-2">Schedule</th><th>Title</th><th>Assigned</th><th className="text-right">Status</th></tr></thead>
          <tbody>
            {items.map((v) => (
              <tr key={v.id} className={`border-b border-border-subtle/50 ${v.done ? 'opacity-60' : ''}`}>
                <td className="py-2.5 font-semibold text-primary whitespace-nowrap pr-3">{v.type === 'Assessment' ? '📋' : v.type === 'Task' ? '✅' : '🚚'} {new Date(v.date).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}</td>
                <td className="text-secondary">{v.job ? `Job #${v.job} · ` : ''}{v.title}</td>
                <td className="text-secondary text-xs">{v.crew.join(', ') || '—'}</td>
                <td className={`text-right text-xs font-semibold ${v.done ? 'text-muted' : new Date(v.date).getTime() < now ? 'text-red-500' : 'text-emerald-500'}`}>{v.done ? 'Completed' : new Date(v.date).getTime() < now ? 'Overdue' : 'Upcoming'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ─── Billing: invoices + deposits from Jobber ─── */
function ClientBillingSection({ extras }) {
  const d = extras.data;
  const rows = d ? [
    ...(d.deposits || []).map((p) => ({ k: `d${p.date}`, icon: '💵', label: 'Deposit', to: p.quote ? `Quote #${p.quote}` : '', date: p.date, amount: -p.amount })),
    ...(d.invoices || []).map((v) => ({ k: v.id, icon: '🧾', label: `Invoice #${v.number}`, to: v.subject || '', date: v.date, amount: v.total, status: v.status, url: v.url })),
    // Payments made on each invoice (Jobber shows these as their own rows)
    ...(d.invoices || []).filter((v) => v.paid > 0).map((v) => ({ k: `p${v.id}`, icon: '💳', label: 'Payment', to: `Invoice #${v.number}`, date: v.date, amount: -v.paid })),
  ].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))) : [];
  return (
    <div className="rounded-xl bg-card border border-border-subtle p-5">
      <h2 className="text-lg font-bold text-primary mb-3">Billing</h2>
      {!d ? <p className="text-xs text-muted py-3">Loading…</p> : !d.linked ? <p className="text-xs text-muted py-3">Not linked to Jobber yet.</p> : !rows.length ? (
        <p className="text-sm text-secondary py-2">Bill this client to see billing history</p>
      ) : (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[11px] text-muted border-b border-border-subtle"><th className="py-2">Item</th><th>Applied to</th><th>Date</th><th className="text-right">Amount</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.k} className="border-b border-border-subtle/50">
                <td className="py-2.5 font-semibold text-primary">{r.icon} {r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="hover:underline">{r.label}</a> : r.label}{r.status && <span className="ml-2 text-[10px] uppercase text-muted">{String(r.status).replace(/_/g, ' ')}</span>}</td>
                <td className="text-secondary">{r.to}</td>
                <td className="text-secondary">{r.date ? new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</td>
                <td className="text-right text-primary">{money(r.amount)}</td>
              </tr>
            ))}
            <tr><td className="py-2.5 font-bold text-primary" colSpan={3}>Current balance</td><td className="text-right font-bold text-primary">{money(d.balance)}</td></tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ─── Tags card (syncs to Jobber) ─── */
function ClientTagsCard({ client, onClientUpdate }) {
  const [adding, setAdding] = useState(false);
  const [t, setT] = useState('');
  const tags = (client.tags || []).filter((x) => x !== 'archived');
  const save = (next) => onClientUpdate(client.id, { tags: [...next, ...((client.tags || []).includes('archived') ? ['archived'] : [])] });
  const add = () => { const v = t.trim(); if (v && !tags.includes(v)) save([...tags, v]); setT(''); setAdding(false); };
  return (
    <div className="rounded-xl bg-card border border-border-subtle p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] font-bold text-muted uppercase tracking-wider">Tags</h3>
        <button onClick={() => setAdding(true)} className="p-1 rounded-md border border-border-subtle text-brand-text hover:bg-surface-alt cursor-pointer" title="Add tag"><Plus size={13} /></button>
      </div>
      {adding && (
        <input autoFocus value={t} onChange={(e) => setT(e.target.value)} onBlur={add} onKeyDown={(e) => { if (e.key === 'Enter') add(); if (e.key === 'Escape') { setT(''); setAdding(false); } }}
          placeholder="New tag…" className="w-full mb-2 rounded-md border border-border-default bg-surface-alt px-2 py-1.5 text-sm text-primary focus:outline-none" />
      )}
      {tags.length ? (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((x) => (
            <span key={x} className="inline-flex items-center gap-1 rounded-full bg-brand/15 text-brand-text px-2 py-0.5 text-xs font-semibold">
              {x}<button onClick={() => save(tags.filter((y) => y !== x))} className="hover:text-red-500 cursor-pointer" title="Remove"><X size={11} /></button>
            </span>
          ))}
        </div>
      ) : !adding && <p className="text-xs text-muted">This client has no tags</p>}
    </div>
  );
}

/* ─── Internal notes for you / the crew (saved as Jobber notes when the client is linked) ─── */
function ClientNotesCard({ client, onClientUpdate, extras }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const linked = extras?.data?.linked;
  const notes = extras?.data?.notes || [];
  const add = async () => {
    const m = text.trim(); if (!m) return;
    setBusy(true);
    if (linked) await extras.act({ op: 'note', message: m });
    else await onClientUpdate(client.id, { notes: [client.notes, m].filter(Boolean).join('\n\n') });
    setText(''); setBusy(false);
  };
  return (
    <div className="rounded-xl bg-card border border-border-subtle p-4">
      <h3 className="text-[11px] font-bold text-muted uppercase tracking-wider mb-2">Notes</h3>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3}
        placeholder="Leave an internal note for yourself or a team member"
        className="w-full rounded-lg border border-dashed border-border-default bg-transparent p-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-brand/60 resize-y" />
      {text.trim() && <div className="flex justify-end mt-1.5"><button onClick={add} disabled={busy} className="px-3 py-1.5 rounded-lg bg-brand text-on-brand text-xs font-bold disabled:opacity-50 cursor-pointer">{busy ? 'Saving…' : 'Save note'}</button></div>}
      <div className="mt-2 space-y-2">
        {notes.map((n) => (
          <div key={n.id} className="rounded-lg bg-surface-alt p-2.5">
            <p className="text-sm text-primary whitespace-pre-wrap">{n.pinned && '📌 '}{n.message}</p>
            <p className="text-[10px] text-muted mt-1">{new Date(n.at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
          </div>
        ))}
        {client.notes && <div className="rounded-lg bg-surface-alt p-2.5"><p className="text-sm text-primary whitespace-pre-wrap">{client.notes}</p><p className="text-[10px] text-muted mt-1">Hub note</p></div>}
      </div>
    </div>
  );
}

/* ─── Contacts: other people for this client (spouse, property manager…) ─── */
function ClientContactsCard({ client, onClientUpdate, startOpen = false, extras }) {
  const linked = extras?.data?.linked;
  const list = linked ? (extras.data.contacts || []) : (client.custom_fields?.contacts || []);
  const [form, setForm] = useState(() => (startOpen ? { name: '', role: '', phone: '', email: '' } : null)); // { name, role, phone, email }
  const save = (next) => onClientUpdate(client.id, { custom_fields: { ...(client.custom_fields || {}), contacts: next } });
  const remove = (i) => (linked ? extras.act({ op: 'contact-delete', contactId: list[i].id }) : save(list.filter((_, k) => k !== i)));
  const addOne = (k) => (linked ? extras.act({ op: 'contact-add', contact: k }) : save([...list, k]));
  const inp = 'rounded-md border border-border-default bg-surface-alt px-2 py-1.5 text-sm text-primary focus:outline-none';
  return (
    <div className="rounded-xl bg-card border border-border-subtle p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-secondary"><b className="text-primary">Contacts</b>{!list.length && ' – Add contacts to keep track of everyone you communicate with'}</p>
        {!form && <button onClick={() => setForm({ name: '', role: '', phone: '', email: '' })} className="text-[12px] font-semibold text-brand-text hover:underline cursor-pointer">Add Contact</button>}
      </div>
      {list.length > 0 && (
        <div className="mt-3 divide-y divide-border-subtle">
          {list.map((c, i) => (
            <div key={i} className="flex items-center justify-between py-2 text-sm">
              <div><span className="font-semibold text-primary">{c.name}</span>{c.role && <span className="text-muted"> · {c.role}</span>}
                <div className="text-xs text-secondary">{[c.phone, c.email].filter(Boolean).join(' · ')}</div></div>
              <button onClick={() => remove(i)} className="p-1 text-muted hover:text-red-500 cursor-pointer" title="Remove"><X size={14} /></button>
            </div>
          ))}
        </div>
      )}
      {form && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" className={inp} />
          <input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Role (spouse, property manager…)" className={inp} />
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" className={inp} />
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" className={inp} />
          <div className="col-span-2 flex justify-end gap-2">
            <button onClick={() => setForm(null)} className="px-3 py-1.5 text-xs font-semibold text-muted cursor-pointer">Cancel</button>
            <button disabled={!form.name.trim()} onClick={() => { addOne({ ...form, name: form.name.trim() }); setForm(null); }} className="px-3 py-1.5 rounded-lg bg-brand text-on-brand text-xs font-bold disabled:opacity-40 cursor-pointer">Save contact</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Bulk actions (checkbox selection on the list) ─── */
const e164 = (raw) => { const d = String(raw?.number || raw || '').replace(/\D/g, ''); return d.length === 10 ? `+1${d}` : d.length === 11 && d[0] === '1' ? `+${d}` : ''; };

// Text everyone selected from the work Quo line. {first} = their first name. Sends one at a time.
function BulkTextModal({ clients, onClose }) {
  const { session } = useAuth();
  const token = session?.access_token || '';
  const [msg, setMsg] = useState('Hi {first}, ');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState([]); // { name, ok, err }
  const withPhone = clients.filter((c) => e164((c.phones || []).find((p) => p.primary) || c.phones?.[0]));
  const noPhone = clients.length - withPhone.length;
  const fill = (c) => msg.replace(/\{first\}/g, (c.first_name || '').trim() || 'there');
  const send = async () => {
    setSending(true);
    const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    let line = null;
    for (const c of withPhone) {
      const to = e164((c.phones || []).find((p) => p.primary) || c.phones?.[0]);
      const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Client';
      try {
        if (!line) { const t = await fetch('/api/quo?action=thread', { method: 'POST', headers: h, body: JSON.stringify({ phone: to }) }).then((r) => r.json()); line = t.phoneNumberId; }
        const r = await fetch('/api/quo?action=send', { method: 'POST', headers: h, body: JSON.stringify({ phoneNumberId: line, to, content: fill(c) }) });
        const j = await r.json().catch(() => ({}));
        setDone((d) => [...d, { name, ok: r.ok, err: j.error }]);
      } catch (e) { setDone((d) => [...d, { name, ok: false, err: e.message }]); }
    }
    setSending(false);
  };
  const finished = done.length === withPhone.length && done.length > 0;
  const sample = withPhone[0];
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !sending && onClose()}>
      <div className="w-full max-w-lg rounded-2xl bg-card border border-border-subtle p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-primary">Text {withPhone.length} client{withPhone.length === 1 ? '' : 's'}</h3>
          <button onClick={onClose} disabled={sending} className="p-1 text-muted hover:text-primary cursor-pointer"><X size={16} /></button>
        </div>
        {noPhone > 0 && <p className="text-xs text-amber-600">{noPhone} selected have no phone and will be skipped.</p>}
        {!done.length && <>
          <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={5} className="w-full rounded-lg border border-border-default bg-surface-alt p-3 text-sm text-primary" />
          <p className="text-[11px] text-muted">{'{first}'} = their first name · {msg.length} characters · sent one by one from your work Quo line, ~1–2¢ each</p>
          {sample && <div className="rounded-lg bg-surface-alt p-3 text-xs text-secondary"><b className="text-primary">Preview ({sample.first_name || 'Client'}):</b> {fill(sample)}</div>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-3 py-2 rounded-lg border border-border-default text-sm font-semibold text-primary cursor-pointer">Cancel</button>
            <button disabled={!msg.replace('{first}', '').trim() || !withPhone.length} onClick={send} className="px-4 py-2 rounded-lg bg-brand text-on-brand text-sm font-bold disabled:opacity-40 cursor-pointer">Send to {withPhone.length}</button>
          </div>
        </>}
        {done.length > 0 && <>
          <p className="text-sm font-semibold text-primary">{finished ? 'Done' : 'Sending…'} {done.filter((d) => d.ok).length}/{withPhone.length} sent{done.some((d) => !d.ok) ? ` · ${done.filter((d) => !d.ok).length} failed` : ''}</p>
          <div className="max-h-48 overflow-y-auto text-xs space-y-0.5">{done.map((d, i) => <p key={i} className={d.ok ? 'text-secondary' : 'text-red-500'}>{d.ok ? '✓' : '✕'} {d.name}{d.err ? ` — ${d.err}` : ''}</p>)}</div>
          {finished && <div className="flex justify-end"><button onClick={onClose} className="px-4 py-2 rounded-lg bg-brand text-on-brand text-sm font-bold cursor-pointer">Close</button></div>}
        </>}
      </div>
    </div>
  );
}

// Add or remove one tag on everyone selected (Hub tags).
function BulkTagModal({ clients, onClose, onSaved }) {
  const [tag, setTag] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (add) => {
    const t = tag.trim(); if (!t) return;
    setBusy(true);
    for (const c of clients) {
      const tags = new Set(c.tags || []);
      if (add) tags.add(t); else tags.delete(t);
      await supabase.from('clients').update({ tags: [...tags] }).eq('id', c.id);
      pushClientToJobber(c.id);
    }
    setBusy(false); onSaved(); onClose();
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div className="w-full max-w-sm rounded-2xl bg-card border border-border-subtle p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-primary">Tag {clients.length} client{clients.length === 1 ? '' : 's'}</h3>
        <input autoFocus value={tag} onChange={(e) => setTag(e.target.value)} placeholder="e.g. lights 2026" className="w-full rounded-lg border border-border-default bg-surface-alt px-3 py-2 text-sm text-primary" />
        <div className="flex justify-end gap-2">
          <button disabled={busy || !tag.trim()} onClick={() => run(false)} className="px-3 py-2 rounded-lg border border-border-default text-sm font-semibold text-primary disabled:opacity-40 cursor-pointer">Remove tag</button>
          <button disabled={busy || !tag.trim()} onClick={() => run(true)} className="px-4 py-2 rounded-lg bg-brand text-on-brand text-sm font-bold disabled:opacity-40 cursor-pointer">{busy ? 'Saving…' : 'Add tag'}</button>
        </div>
      </div>
    </div>
  );
}

/* ─── In-memory cache so going list ⇄ client ⇄ edit is instant (refreshes quietly behind) ─── */
const clientsCache = { all: null, active: null, props: {} };
const cachedClient = (key) => {
  const asNum = Number(key);
  return (clientsCache.all || []).find((c) => c.id === key || (!Number.isNaN(asNum) && c.client_number === asNum)) || null;
};

/* ─── Save a client edit: cache, database, Jobber, and any linked requests' name/contact snapshot ─── */
async function saveClientRecord(id, patch) {
  if (clientsCache.all) clientsCache.all = clientsCache.all.map((c) => (c.id === id ? { ...c, ...patch } : c));
  await supabase.from('clients').update(patch).eq('id', id);
  pushClientToJobber(id);
  const reqPatch = {};
  if ('first_name' in patch) reqPatch.first_name = patch.first_name;
  if ('last_name' in patch) reqPatch.last_name = patch.last_name;
  if ('phones' in patch) reqPatch.phone = patch.phones?.[0]?.number || null;
  if ('emails' in patch) reqPatch.email = patch.emails?.[0]?.address || null;
  if (Object.keys(reqPatch).length === 0) return;
  const { data: reqs } = await supabase.from('requests').update(reqPatch).eq('client_id', id).select('id, title, first_name, last_name');
  for (const r of reqs || []) {
    const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Unknown';
    await supabase.from('schedule_items').update({ title: `Assessment: ${r.title || `Request for ${name}`}` }).eq('request_id', r.id).eq('type', 'assessment');
  }
}

/* ─── Main ─── */
export default function Clients() {
  const { orgId } = useAuth();
  const navigate = useNavigate();
  const { clientNumber: urlClientNumber } = useParams();
  const [allClients, setAllClients] = useState(() => clientsCache.all || []);
  const [properties, setProperties] = useState(() => clientsCache.props);
  const [loading, setLoading] = useState(() => !clientsCache.all);
  useEffect(() => { clientsCache.props = properties; }, [properties]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('leads-active'); // all | leads-active | leads | active
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [selected, setSelected] = useState(null);
  const [showNewClient, setShowNewClient] = useState(false);
  const [hoveredRow, setHoveredRow] = useState(null);
  const [moreMenuId, setMoreMenuId] = useState(null);
  const [tagEditClient, setTagEditClient] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [bulk, setBulk] = useState(null); // 'text' | 'tag'

  // Active is derived: a client is "active" iff they have at least one job with status='active'.
  // Lead = everyone else (no current job). The is_lead column on `clients` is ignored.
  const [activeClientIds, setActiveClientIds] = useState(() => clientsCache.active || new Set());

  const fetchClients = useCallback(async () => {
    if (!orgId) return;
    if (!clientsCache.all) setLoading(true);
    const { data, error } = await supabase
      .from('clients').select('*').eq('org_id', orgId).order('updated_at', { ascending: false });
    clientsCache.all = data || [];
    if (error) console.error('[Clients] fetch error:', error.message);
    setAllClients(data || []);
    const clientIds = (data || []).map(c => c.id);
    if (clientIds.length > 0) {
      // Jobs hang off `contacts` (the Jobber sync); link them to these rows by Jobber client id.
      const [{ data: jobs }, { data: contacts }] = await Promise.all([
        supabase.from('hub_jobs').select('contact_id').eq('status', 'active'),
        supabase.from('contacts').select('id, jobber_client_id'),
      ]);
      const extOf = new Map((contacts || []).map(k => [k.id, k.jobber_client_id]));
      const activeExt = new Set((jobs || []).map(j => extOf.get(j.contact_id)).filter(Boolean));
      const act = new Set((data || []).filter(c => activeExt.has(c.external_id) || (jobs || []).some(j => j.contact_id === c.id)).map(c => c.id));
      clientsCache.active = act;
      setActiveClientIds(act);
    } else {
      setActiveClientIds(new Set());
    }
    setLoading(false);
  }, [orgId]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  // Jobber's own label: Lead = never had a job, Active = has. Hub-only clients fall back to "has an active job".
  const isActive = useCallback((c) => (c.external_id ? !c.is_lead : activeClientIds.has(c.id)), [activeClientIds]);
  const isLead = useCallback((c) => !isActive(c), [isActive]);
  const isArchived = (c) => (c.tags || []).includes('archived');
  // Archive = Hub tag 'archived' (hidden from Leads/Active). Delete = gone from Hub.
  const setArchived = async (rows, on) => {
    setMoreMenuId(null);
    for (const c of rows) { try { await clientArchiveOp(c.id, on ? 'archive' : 'unarchive'); } catch { break; } }
    setPicked(new Set()); fetchClients();
  };
  const [confirmDelete, setConfirmDelete] = useState(null); // rows to delete
  const [deleting, setDeleting] = useState('');
  const doDelete = async () => {
    const rows = confirmDelete || []; const failed = [];
    setDeleting('Deleting…');
    for (const c of rows) {
      try { await clientArchiveOp(c.id, 'delete'); }
      catch (e) { failed.push(`${[c.first_name, c.last_name].filter(Boolean).join(' ')}: ${e.message}`); }
    }
    setDeleting(failed.length ? `Couldn't delete ${failed.length}: ${failed.join(' · ')}` : '');
    if (!failed.length) setConfirmDelete(null);
    setPicked(new Set()); fetchClients();
  };

  // Filter + search
  const clients = (() => {
    let filtered = allClients;
    if (statusFilter === 'archived') filtered = filtered.filter(c => isArchived(c));
    else if (statusFilter !== 'all') filtered = filtered.filter(c => !isArchived(c));
    if (statusFilter === 'leads') filtered = filtered.filter(c => isLead(c));
    else if (statusFilter === 'active') filtered = filtered.filter(c => isActive(c));
    if (search.trim()) {
      // Every word you type must show up somewhere (name, company, phones, emails, address, tags),
      // so "jude wilson", "jude " or "wilson rock hill" all work. Phone digits match with or without dashes.
      const words = search.toLowerCase().trim().split(/\s+/);
      filtered = filtered.filter(c => {
        const hay = [c.first_name, c.last_name, c.company_name, ...(c.phones || []).map(formatPhone), ...(c.emails || []).map(formatEmail),
          c.billing_street, c.billing_city, c.billing_zip, ...(c.tags || [])].filter(Boolean).join(' ').toLowerCase();
        const digits = hay.replace(/\D/g, '');
        return words.every((w) => hay.includes(w) || (/^\d{3,}$/.test(w.replace(/\D/g, '')) && digits.includes(w.replace(/\D/g, ''))));
      });
    }
    return filtered;
  })();

  // Selecting a client also updates the URL so refresh / back / share all work.
  const selectClient = async (client, { skipNav } = {}) => {
    setSelected(client);
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (!skipNav) navigate(`/clients/${client.client_number ?? client.id}`);
    if (!properties[client.id]) {
      const { data } = await supabase.from('properties').select('*').eq('client_id', client.id).order('created_at');
      setProperties(prev => ({ ...prev, [client.id]: data || [] }));
    }
  };

  const createClient = async (form) => {
    if (!orgId) return;
    const { data: newClient, error } = await supabase.from('clients').insert({
      org_id: orgId,
      first_name: form.first_name || null,
      last_name: form.last_name || null,
      company_name: form.company_name || null,
      phones: form.phone ? [{ number: form.phone, label: 'Main', primary: true }] : [],
      emails: form.email ? [{ address: form.email, label: 'Main', primary: true }] : [],
      billing_street: form.street || null,
      billing_city: form.city || null,
      billing_state: form.state || null,
      billing_zip: form.zip || null,
      is_lead: form.is_lead,
      notes: form.notes || null,
    }).select('id').single();
    if (newClient?.id) pushClientToJobber(newClient.id);
    if (error) { console.error('[Clients] create error:', error.message); return; }
    // Create property from address
    if (form.street || form.city) {
      await supabase.from('properties').insert({
        org_id: orgId, client_id: newClient.id, label: 'Primary',
        street: form.street || null, city: form.city || null,
        state: form.state || null, zip: form.zip || null,
      });
    }
    setShowNewClient(false);
    fetchClients();
  };

  // Sync selection with URL — supports refresh, deep-link, browser back/forward.
  // URL carries the short global client_number (Jobber-style), but we fall back
  // to UUID match in case an old link is shared.
  useEffect(() => {
    if (!urlClientNumber) {
      if (selected) setSelected(null);
      return;
    }
    if (allClients.length === 0) return;
    const asNum = Number(urlClientNumber);
    const matchByNumber = (cl) => Number.isFinite(asNum) && Number(cl.client_number) === asNum;
    if (selected && (matchByNumber(selected) || selected.id === urlClientNumber)) return;
    const c = allClients.find(cl => matchByNumber(cl) || cl.id === urlClientNumber);
    if (c) selectClient(c, { skipNav: true });
  }, [urlClientNumber, allClients]);

  const saveTags = async (id, tags) => {
    await supabase.from('clients').update({ tags, updated_at: new Date().toISOString() }).eq('id', id);
    pushClientToJobber(id);
    fetchClients();
  };

  const archiveClient = async (id) => {
    setMoreMenuId(null);
    try { await clientArchiveOp(id, 'archive'); } catch { /* note shown */ }
    fetchClients();
  };

  const deleteClient = async (id) => {
    if (!confirm('Delete this client? This cannot be undone. (Jobber can’t delete clients, so they’re archived there.)')) return;
    setMoreMenuId(null);
    try { await clientArchiveOp(id, 'delete'); } catch { /* note shown */ }
    fetchClients();
  };

  // Stats — live values when fetch is done; otherwise fall back to a localStorage
  // cache from the last visit so we never flash "0" on a refresh.
  const STATS_CACHE_KEY = 'boost-clients-stats-cache';
  const leadCount = allClients.filter(c => isLead(c) && !isArchived(c)).length;
  const archivedCount = allClients.filter(c => isArchived(c)).length;
  const clientCount = allClients.filter(c => isActive(c)).length;
  const todayStr = getTodayInTimezone();
  const thirtyDaysAgoDate = new Date(todayStr + 'T00:00:00');
  thirtyDaysAgoDate.setDate(thirtyDaysAgoDate.getDate() - 30);
  const thirtyDaysAgo = thirtyDaysAgoDate;
  const newClients30 = allClients.filter(c => isActive(c) && new Date(c.created_at) >= thirtyDaysAgo).length;
  const newLeads30 = allClients.filter(c => new Date(c.created_at) >= thirtyDaysAgo).length;

  const liveLoaded = allClients.length > 0;
  const [cachedStats, setCachedStats] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STATS_CACHE_KEY) || 'null'); } catch { return null; }
  });
  // Once live data arrives, persist the snapshot for next time.
  useEffect(() => {
    if (!liveLoaded) return;
    const snapshot = { newLeads30, newClients30, clientCount, leadCount };
    try { localStorage.setItem(STATS_CACHE_KEY, JSON.stringify(snapshot)); } catch { /* quota */ }
    setCachedStats(snapshot);
  }, [liveLoaded, newLeads30, newClients30, clientCount, leadCount]);
  // What we actually render — prefer live, fall back to cache, finally null = skeleton.
  const displayStats = liveLoaded
    ? { newLeads30, newClients30, clientCount }
    : (cachedStats || null);

  const statusLabel = statusFilter === 'leads-active' ? 'Leads and Active' : statusFilter === 'leads' ? 'Leads' : statusFilter === 'active' ? 'Active' : statusFilter === 'archived' ? 'Archived' : 'All';

  // Don't flash the list while resolving /clients/:clientNumber on a fresh load.
  if (urlClientNumber && !selected && (loading || allClients.length === 0)) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="text-muted animate-spin" />
      </div>
    );
  }

  if (selected) {
    return <ClientDetail client={selected} clientIsLead={isLead(selected)} properties={properties[selected.id] || []} onBack={() => { setSelected(null); navigate('/clients'); }} orgId={orgId} archiveClient={archiveClient} deleteClient={deleteClient} onPropertiesChange={async () => {
      const { data } = await supabase.from('properties').select('*').eq('client_id', selected.id).order('created_at');
      setProperties(prev => ({ ...prev, [selected.id]: data || [] }));
    }} onClientUpdate={async (id, updates) => {
      if (Object.keys(updates).length) await supabase.from('clients').update(updates).eq('id', id);
      if (['first_name', 'last_name', 'company_name', 'phones', 'emails', 'billing_street', 'billing_city', 'billing_state', 'billing_zip', 'tags', 'custom_fields'].some((k) => k in updates)) pushClientToJobber(id);
      const { data } = await supabase.from('clients').select('*').eq('id', id).single();
      if (data) { setSelected(data); fetchClients(); }
    }} />;
  }

  return (
    <div className="space-y-5">
      {showNewClient && <NewClientModal onClose={() => setShowNewClient(false)} onSave={createClient} />}
      {tagEditClient && <TagEditor client={tagEditClient} onClose={() => setTagEditClient(null)} onSave={saveTags} />}

      {/* Header — title left, New Client right */}
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-black text-primary">Clients</h1>
        <button onClick={() => navigate('/clients/new')}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-on-brand text-sm font-bold hover:bg-brand-hover cursor-pointer">
          New Client
        </button>
      </div>

      {/* Stats row — 3 cards like Jobber */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-card border border-border-subtle p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-muted">New leads</p>
            <TrendingUp size={14} className="text-emerald-500" />
          </div>
          <p className="text-xs text-muted">Past 30 days</p>
          {displayStats
            ? <p className="text-3xl font-black text-primary mt-1">{displayStats.newLeads30}</p>
            : <span className="inline-block h-8 w-12 rounded-md bg-surface-alt animate-pulse mt-1" />}
        </div>
        <div className="rounded-xl bg-card border border-border-subtle p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-muted">New clients</p>
            <TrendingUp size={14} className="text-emerald-500" />
          </div>
          <p className="text-xs text-muted">Past 30 days</p>
          {displayStats
            ? <p className="text-3xl font-black text-primary mt-1">{displayStats.newClients30}</p>
            : <span className="inline-block h-8 w-12 rounded-md bg-surface-alt animate-pulse mt-1" />}
        </div>
        <div className="rounded-xl bg-card border border-border-subtle p-4">
          <p className="text-xs font-bold text-muted">Total new clients</p>
          <p className="text-xs text-muted">Year to date</p>
          {displayStats
            ? <p className="text-3xl font-black text-primary mt-1">{displayStats.clientCount}</p>
            : <span className="inline-block h-8 w-12 rounded-md bg-surface-alt animate-pulse mt-1" />}
        </div>
      </div>

      {/* Filtered clients heading */}
      <div>
        <span className="text-base font-bold text-primary">Filtered clients</span>
        <span className="text-xs text-muted ml-2">({clients.length} results)</span>
      </div>

      {/* Filters row + inline search on the right */}
      <div className="flex items-center gap-3 flex-wrap">
        <button className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-surface-alt border border-border-subtle text-xs font-bold text-primary cursor-pointer hover:border-border-strong">
          Filter by tag <ChevronDown size={12} className="text-muted" />
        </button>

        <div className="relative">
          <button onClick={() => setShowStatusDropdown(!showStatusDropdown)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-surface-alt border border-border-subtle text-xs font-bold text-primary cursor-pointer hover:border-border-strong">
            Status <span className="text-muted">|</span> {statusLabel}
          </button>
          {showStatusDropdown && (
            <div className="absolute left-0 top-full mt-1 z-50 bg-card border border-border-subtle rounded-xl shadow-2xl min-w-[180px] py-1">
              {[
                { id: 'leads-active', label: 'Leads and Active' },
                { id: 'active', label: `Active (${clientCount})` },
                { id: 'leads', label: `Leads (${leadCount})` },
                { id: 'archived', label: `Archived (${archivedCount})` },
                { id: 'all', label: `All (${allClients.length})` },
              ].map(o => (
                <button key={o.id} onClick={() => { setStatusFilter(o.id); setShowStatusDropdown(false); }}
                  className="w-full px-4 py-2.5 text-left text-xs font-medium flex items-center justify-between hover:bg-surface-alt cursor-pointer text-secondary">
                  {o.label}
                  {statusFilter === o.id && <Check size={14} className="text-brand" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative ml-auto w-full sm:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search clients..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-8 py-2 rounded-full bg-surface-alt border border-border-subtle text-xs text-primary placeholder:text-muted focus:outline-none focus:border-brand/50 w-full"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-primary p-1 rounded-md cursor-pointer"
              title="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {loading && <div className="flex items-center justify-center py-20"><Loader2 size={20} className="animate-spin text-brand" /></div>}

      {!loading && clients.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users size={48} className="text-muted mb-4" />
          <h2 className="text-lg font-bold text-primary mb-1">No clients found</h2>
        </div>
      )}

      {/* Bulk modals (the selection controls live in the table header, so nothing shifts) */}
      {bulk === 'text' && <BulkTextModal clients={allClients.filter((c) => picked.has(c.id))} onClose={() => setBulk(null)} />}
      {bulk === 'tag' && <BulkTagModal clients={allClients.filter((c) => picked.has(c.id))} onClose={() => setBulk(null)} onSaved={fetchClients} />}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !deleting && setConfirmDelete(null)}>
          <div className="w-full max-w-md rounded-2xl bg-card border border-border-subtle p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-primary">Delete {confirmDelete.length} client{confirmDelete.length === 1 ? '' : 's'}?</h3>
            <p className="text-sm text-secondary">{confirmDelete.slice(0, 5).map((c) => [c.first_name, c.last_name].filter(Boolean).join(' ') || c.company_name).join(', ')}{confirmDelete.length > 5 ? ` +${confirmDelete.length - 5} more` : ''}</p>
            <p className="text-xs text-red-500 font-semibold">This can’t be undone. Want to just hide them? Use Archive instead.</p>
            <p className="text-xs text-muted">Jobber can’t delete clients, so they’re archived in Jobber (their history stays there).</p>
            {deleting && deleting !== 'Deleting…' && <p className="text-xs text-red-500">{deleting}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => { setConfirmDelete(null); setDeleting(''); }} className="px-3 py-2 rounded-lg border border-border-default text-sm font-semibold text-primary cursor-pointer">Cancel</button>
              <button onClick={doDelete} disabled={deleting === 'Deleting…'} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-bold disabled:opacity-50 cursor-pointer">{deleting === 'Deleting…' ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Table — flat, no outer card; just row dividers */}
      {!loading && clients.length > 0 && (
        <div className="-mx-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-border-subtle">
                  <th className="pl-4 py-3 w-8">
                    <input type="checkbox" className="cursor-pointer accent-emerald-600" title="Select all shown"
                      checked={clients.length > 0 && clients.every((c) => picked.has(c.id))}
                      onChange={(e) => setPicked(e.target.checked ? new Set([...picked, ...clients.map((c) => c.id)]) : new Set([...picked].filter((id) => !clients.some((c) => c.id === id))))} />
                  </th>
                  {picked.size > 0 ? (() => {
                    const sel = allClients.filter((c) => picked.has(c.id));
                    const btn = 'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer';
                    return (
                      <th colSpan={5} className="px-4 py-3 text-[11px] font-semibold">
                        <div className="flex items-center gap-1 leading-none">
                          <span className="text-primary mr-1">{picked.size} selected</span>
                          <button onClick={() => setPicked(new Set())} className="text-brand underline mr-3 cursor-pointer">Deselect all</button>
                          <button onClick={() => setBulk('text')} className={btn}><MessageSquare size={12} /> Text</button>
                          <button onClick={() => setBulk('tag')} className={btn}><Tag size={12} /> Tag</button>
                          <button onClick={() => setArchived(sel, !sel.every(isArchived))} className={btn}><Archive size={12} /> {sel.every(isArchived) ? 'Unarchive' : 'Archive'}</button>
                          <button onClick={() => setConfirmDelete(sel)} className={`${btn} !text-red-500`}><Trash2 size={12} /> Delete</button>
                        </div>
                      </th>
                    );
                  })() : <>
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted">Name ↕</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted hidden sm:table-cell">Address</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted hidden md:table-cell">Tags</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted">Status</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted text-right">Last Activity ↕</th>
                  </>}
                </tr>
              </thead>
              <tbody>
                {clients.map((c, i) => {
                  const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.company_name || 'Unknown';
                  const phone = primaryPhone(c.phones);
                  const email = primaryEmail(c.emails);
                  const addr = [c.billing_street, c.billing_city, c.billing_state, c.billing_zip].filter(Boolean).join(', ');
                  const isHovered = hoveredRow === c.id;
                  return (
                    <tr key={c.id} onClick={() => selectClient(c)}
                      onMouseEnter={() => setHoveredRow(c.id)}
                      onMouseLeave={() => { setHoveredRow(null); if (moreMenuId === c.id) setMoreMenuId(null); }}
                      className={`group cursor-pointer transition-colors hover:bg-white/[0.03] ${picked.has(c.id) ? 'bg-emerald-500/5' : ''} ${i > 0 ? 'border-t border-border-subtle/50' : ''}`}>
                      <td className="pl-4 py-3 w-8" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className={`cursor-pointer accent-emerald-600 ${picked.size ? '' : 'opacity-0 group-hover:opacity-100'}`} checked={picked.has(c.id)}
                          onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-bold text-primary">{name}</p>
                        {c.company_name && c.first_name && <p className="text-[11px] text-muted">{c.company_name}</p>}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <p className="text-secondary truncate max-w-[250px]">{addr || '—'}</p>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {(c.tags || []).slice(0, 3).map(t => (
                            <span key={t} className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-surface-alt text-muted">{t}</span>
                          ))}
                          {(c.tags || []).length > 3 && <span className="text-[10px] text-muted">+{c.tags.length - 3}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {isArchived(c) ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
                            <span className="w-2 h-2 rounded-full bg-gray-400" /> Archived
                          </span>
                        ) : isLead(c) ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400">
                            <span className="w-2 h-2 rounded-full bg-amber-500" /> Lead
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Active
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right relative">
                        <p className={`text-xs text-muted ${isHovered || moreMenuId === c.id ? 'invisible' : ''}`}>{lastActivity(c.updated_at)}</p>
                        {(isHovered || moreMenuId === c.id) && (
                          <div className="absolute inset-y-0 right-4 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <button title="Tag" onClick={(e) => { e.stopPropagation(); setPicked(new Set([c.id])); setBulk('tag'); }} className="p-1.5 rounded-md border border-border-subtle text-muted hover:text-primary cursor-pointer"><Tag size={13} /></button>
                            <button title="More" onClick={(e) => { e.stopPropagation(); setMoreMenuId(moreMenuId === c.id ? null : c.id); }} className="p-1.5 rounded-md border border-border-subtle text-muted hover:text-primary cursor-pointer"><MoreHorizontal size={13} /></button>
                          </div>
                        )}
                        {moreMenuId === c.id && (
                          <div className="absolute right-4 top-full -mt-1 z-30 bg-card border border-border-subtle rounded-xl shadow-2xl min-w-[170px] py-1 text-left" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => setArchived([c], !isArchived(c))} className="w-full px-4 py-2 text-xs font-medium text-secondary hover:bg-surface-alt flex items-center gap-2 cursor-pointer"><Archive size={13} /> {isArchived(c) ? 'Unarchive' : 'Archive'}</button>
                            <button onClick={() => { setMoreMenuId(null); setConfirmDelete([c]); }} className="w-full px-4 py-2 text-xs font-medium text-red-500 hover:bg-surface-alt flex items-center gap-2 cursor-pointer"><Trash2 size={13} /> Delete</button>
                            <button onClick={() => { setMoreMenuId(null); window.open(`/clients/${c.client_number ?? c.id}`, '_blank'); }} className="w-full px-4 py-2 text-xs font-medium text-secondary hover:bg-surface-alt flex items-center gap-2 cursor-pointer"><ExternalLink size={13} /> Open in new tab</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Edit Client Page (full-page route at /clients/:clientNumber/edit) ─── */
export function EditClientPage() {
  const { orgId } = useAuth();
  const { clientNumber } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(() => cachedClient(clientNumber));
  const [properties, setProperties] = useState(() => { const c = cachedClient(clientNumber); return (c && clientsCache.props[c.id]) || []; });
  const [loading, setLoading] = useState(() => !cachedClient(clientNumber));

  const load = useCallback(async () => {
    if (!orgId || !clientNumber) return;
    if (!cachedClient(clientNumber)) setLoading(true);
    const isUuid = /^[0-9a-f-]{36}$/i.test(String(clientNumber));
    const asNum = Number(clientNumber);
    let q = supabase.from('clients').select('*').eq('org_id', orgId);
    q = isUuid ? q.eq('id', clientNumber) : q.eq('client_number', asNum);
    const { data: rows, error } = await q.limit(1);
    if (error) console.error('[EditClientPage] lookup error:', error.message);
    const c = rows?.[0];
    setClient(c || null);
    if (c) {
      const { data: props } = await supabase.from('properties').select('*').eq('client_id', c.id).order('created_at', { ascending: true });
      setProperties(props || []);
    }
    setLoading(false);
  }, [orgId, clientNumber]);

  useEffect(() => { load(); }, [load]);

  // If the URL slug is the UUID but the client has a short client_number, swap to it.
  useEffect(() => {
    if (!client) return;
    const isUuid = /^[0-9a-f-]{36}$/i.test(String(clientNumber));
    if (isUuid && client.client_number) {
      navigate(`/clients/${client.client_number}/edit`, { replace: true });
    }
  }, [client, clientNumber, navigate]);

  const closeBack = () => {
    if (client) navigate(`/clients/${client.client_number ?? client.id}`);
    else navigate('/clients');
  };

  const saveClient = saveClientRecord;

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 size={20} className="text-muted animate-spin" /></div>;
  }
  if (!client) {
    return <div className="max-w-3xl mx-auto p-6 text-secondary">Client not found.</div>;
  }
  return (
    <EditClientModal
      inline
      client={client}
      properties={properties}
      orgId={orgId}
      onSave={saveClient}
      onPropertiesChange={load}
      onClose={closeBack}
    />
  );
}
