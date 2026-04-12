import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  Search, Loader2, Users, Phone, Mail, MapPin, ArrowLeft,
  Plus, X, RefreshCw, Home, ChevronDown, Check, TrendingUp,
  Tag, MoreHorizontal, Archive, Trash2, ExternalLink, MessageSquare, Pencil,
} from 'lucide-react';
import { getTimezone, getTodayInTimezone } from '../utils/timezone';
import { useAppStore } from '../store/AppStoreContext';

function formatPhone(p) { return p?.number || p || ''; }
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

/* ─── Edit Client Modal ─── */
function EditClientModal({ client, properties = [], onClose, onSave, onPropertiesChange, orgId }) {
  const bizSettings = useAppStore((s) => s.businessSettings) || {};
  const primaryProp = properties[0];
  const billingMatches = primaryProp && client.billing_street === primaryProp.street && client.billing_city === primaryProp.city;
  const [form, setForm] = useState({
    title: client.custom_fields?.title || '',
    first_name: client.first_name || '',
    last_name: client.last_name || '',
    company_name: client.company_name || '',
    phone: primaryPhone(client.phones) || '',
    email: primaryEmail(client.emails) || '',
    lead_source: client.lead_source || '',
    tags: client.tags || [],
    receives_messages: client.custom_fields?.receives_messages !== false,
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
      phones: form.phone ? [{ number: form.phone, label: 'Main', primary: true }] : [],
      emails: form.email ? [{ address: form.email, label: 'Main', primary: true }] : [],
      lead_source: form.lead_source || null,
      tags: form.tags,
      billing_street: form.billing_same ? (form.prop_street || null) : (form.billing_street || null),
      billing_city: form.billing_same ? (form.prop_city || null) : (form.billing_city || null),
      billing_state: form.billing_same ? (form.prop_state || null) : (form.billing_state || null),
      billing_zip: form.billing_same ? (form.prop_zip || null) : (form.billing_zip || null),
      custom_fields: { ...(client.custom_fields || {}), title: form.title || null, receives_messages: form.receives_messages },
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-6 px-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-border-subtle rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="h-1 bg-brand rounded-t-2xl shrink-0" />
        <div className="flex items-center justify-between px-6 py-3 border-b border-border-subtle shrink-0">
          <h2 className="text-base font-bold text-primary">Edit Client</h2>
          <button onClick={onClose} className="p-1 text-muted hover:text-primary cursor-pointer"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Primary contact details — connected fields */}
          <div>
            <h3 className="text-xs font-bold text-muted uppercase mb-1">Primary contact details</h3>
            <p className="text-[11px] text-muted mb-3">Provide the main point of contact to ensure smooth communication and reliable client records.</p>
            <div className="rounded-lg border border-border-subtle overflow-hidden">
              <div className="grid grid-cols-[100px_1fr_1fr]">
                <select value={form.title || ''} onChange={e => set('title', e.target.value)}
                  className="px-3 py-2.5 bg-surface-alt text-sm text-primary focus:outline-none border-r border-border-subtle">
                  <option value="">No title</option>
                  <option>Mr.</option>
                  <option>Ms.</option>
                  <option>Mrs.</option>
                  <option>Miss.</option>
                  <option>Dr.</option>
                </select>
                <input value={form.first_name} onChange={e => set('first_name', e.target.value)} placeholder="First name"
                  className="px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none border-r border-border-subtle" />
                <input value={form.last_name} onChange={e => set('last_name', e.target.value)} placeholder="Last name"
                  className="px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none" />
              </div>
              <input value={form.company_name} onChange={e => set('company_name', e.target.value)} placeholder="Company name"
                className="w-full px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none border-t border-border-subtle" />
            </div>
          </div>

          {/* Communication */}
          <div>
            <h3 className="text-xs font-bold text-muted uppercase mb-3">Communication</h3>
            <div className="rounded-lg border border-border-subtle overflow-hidden">
              <input value={form.phone} onChange={e => set('phone', e.target.value)} type="tel" placeholder="Phone number"
                className="w-full px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none" />
              <div className="flex items-center justify-between px-3 py-2 border-t border-border-subtle bg-surface-alt">
                <span className="text-[11px] font-medium text-secondary">Receives messages</span>
                <button type="button" onClick={() => set('receives_messages', !form.receives_messages)}
                  className={`relative w-10 h-[22px] rounded-full transition-colors shrink-0 ${form.receives_messages ? 'bg-brand' : 'bg-zinc-600'}`}>
                  <span className={`absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-white shadow transition-transform ${form.receives_messages ? 'translate-x-[18px]' : 'translate-x-0'}`} />
                </button>
              </div>
              <input value={form.email} onChange={e => set('email', e.target.value)} type="email" placeholder="Email"
                className="w-full px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none border-t border-border-subtle" />
            </div>
          </div>

          {/* Lead information */}
          <div>
            <h3 className="text-xs font-bold text-muted uppercase mb-3">Lead information</h3>
            <div>
              <label className="text-[10px] font-bold text-muted uppercase">Lead source</label>
              <DropdownPicker value={form.lead_source} onChange={v => set('lead_source', v)} options={LEAD_SOURCES} placeholder="Select lead source" />
            </div>
            <div className="mt-3">
              <label className="text-[10px] font-bold text-muted uppercase">Tags</label>
              <TagPicker tags={form.tags} onChange={v => set('tags', v)} allTags={ALL_TAGS} />
            </div>
          </div>

          {/* Property address */}
          <div>
            <h3 className="text-xs font-bold text-muted uppercase mb-3">Property address</h3>
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
function ClientDetail({ client, properties, onBack, orgId, onPropertiesChange, archiveClient, deleteClient, onClientUpdate }) {
  const name = [client.first_name, client.last_name].filter(Boolean).join(' ') || client.company_name || 'Unknown';
  const phone = primaryPhone(client.phones);
  const email = primaryEmail(client.emails);
  const billingAddr = [client.billing_street, client.billing_city, client.billing_state, client.billing_zip].filter(Boolean).join(', ');
  const [workTab, setWorkTab] = useState('active');
  const [editProperty, setEditProperty] = useState(null);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showEditClient, setShowEditClient] = useState(false);

  return (
    <div>
      {showEditClient && (
        <EditClientModal client={client} properties={properties} onClose={() => setShowEditClient(false)} onSave={onClientUpdate} onPropertiesChange={onPropertiesChange} orgId={orgId} />
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
      {/* Back */}
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-muted hover:text-primary cursor-pointer mb-3">
        <ArrowLeft size={14} /> Back to clients
      </button>

      {/* Two-column layout */}
      <div className="flex gap-5">
        {/* ─── Left: main content ─── */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* 1. Details card — name, buttons, contact info all in one */}
          <div className="rounded-xl bg-card border border-border-subtle">
            {/* Name + badge + action buttons */}
            <div className="flex items-center justify-between p-5 border-b border-border-subtle">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-brand/15 border-2 border-brand/30 flex items-center justify-center text-base font-black text-brand shrink-0">
                  {(client.first_name?.[0] || client.company_name?.[0] || '?').toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    {client.is_lead ? (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-bold border border-amber-500/30">Lead</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">Active</span>
                    )}
                  </div>
                  <h1 className="text-xl font-black text-primary">{name}</h1>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {phone && (
                  <a href={`sms:${phone}`} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-alt border border-border-subtle text-xs font-semibold text-secondary hover:text-primary cursor-pointer">
                    <MessageSquare size={13} /> Text
                  </a>
                )}
                {email && (
                  <a href={`mailto:${email}`} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-alt border border-border-subtle text-xs font-semibold text-secondary hover:text-primary cursor-pointer">
                    <Mail size={13} /> Email
                  </a>
                )}
                <div className="relative">
                  <button onClick={() => setShowCreateMenu(o => !o)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-on-brand text-xs font-bold hover:bg-brand-hover cursor-pointer">
                    <Plus size={13} /> Create
                  </button>
                  {showCreateMenu && (
                    <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border-subtle rounded-lg shadow-2xl min-w-[150px] py-1">
                      {['Request', 'Quote', 'Job', 'Invoice'].map(item => (
                        <button key={item} onClick={() => setShowCreateMenu(false)}
                          className="w-full px-4 py-2 text-left text-xs font-medium text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer">
                          {item}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
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
            {/* Edit pencil — right aligned */}
            <div className="flex justify-end px-5 pt-3">
              <button onClick={() => setShowEditClient(true)}
                className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-surface-alt cursor-pointer" title="Edit client">
                <Pencil size={15} />
              </button>
            </div>
            {/* Contact details grid */}
            <div className="px-5 pb-5">
              <div className="grid grid-cols-2 gap-y-3 gap-x-6">
                <div>
                  <p className="text-[10px] font-semibold text-muted uppercase">Phone</p>
                  {phone ? <a href={`tel:${phone}`} className="text-sm text-brand-text hover:underline">{phone}</a> : <p className="text-sm text-muted">—</p>}
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-muted uppercase">Primary property</p>
                  <p className="text-sm text-primary">{properties[0] ? [properties[0].street, properties[0].city, properties[0].state, properties[0].zip].filter(Boolean).join(', ') : '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-muted uppercase">Email</p>
                  {email ? <a href={`mailto:${email}`} className="text-sm text-brand-text hover:underline break-all">{email}</a> : <p className="text-sm text-muted">—</p>}
                  <p className="text-[10px] font-semibold text-muted uppercase mt-3">Lead source</p>
                  <p className="text-sm text-primary">{client.lead_source || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-muted uppercase">Tags</p>
                  {(client.tags || []).length > 0 ? (
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {client.tags.map(t => <span key={t} className="px-2 py-0.5 rounded-full bg-brand/10 text-brand-text text-[11px] font-semibold border border-brand/20">{t}</span>)}
                    </div>
                  ) : (
                    <p className="text-sm text-muted">None</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 2. Work overview — separate card */}
          <div className="rounded-xl bg-card border border-border-subtle p-5">
            <h2 className="text-[11px] font-bold text-muted uppercase tracking-wider mb-3">Work Overview</h2>
            <div className="flex items-center gap-1 mb-3">
              {['active', 'requests', 'quotes', 'jobs', 'invoices'].map(t => (
                <button key={t} onClick={() => setWorkTab(t)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer capitalize ${
                    workTab === t ? 'bg-surface-alt text-primary' : 'text-muted hover:text-secondary'
                  }`}>{t}</button>
              ))}
            </div>
            <div className="rounded-lg bg-surface-alt/30 border border-border-subtle/50">
              <div className="grid grid-cols-4 px-4 py-2 border-b border-border-subtle/50">
                <span className="text-[10px] font-semibold text-muted">Item</span>
                <span className="text-[10px] font-semibold text-muted">Date</span>
                <span className="text-[10px] font-semibold text-muted">Status</span>
                <span className="text-[10px] font-semibold text-muted text-right">Amount</span>
              </div>
              <div className="px-4 py-6 text-center">
                <p className="text-xs text-muted">No {workTab} items yet</p>
              </div>
            </div>
          </div>

          {/* 2. Additional contacts */}
          <div className="rounded-xl bg-card border border-border-subtle p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-bold text-muted uppercase tracking-wider">Additional Contacts</h2>
              <button className="text-[11px] font-semibold text-brand-text hover:underline cursor-pointer">Add Contact</button>
            </div>
            <div className="flex items-center gap-3 mt-3">
              <div className="w-8 h-8 rounded-full bg-surface-alt border border-border-subtle flex items-center justify-center text-muted"><Users size={14} /></div>
              <p className="text-xs text-muted">Add contacts to keep track of everyone you communicate with</p>
            </div>
          </div>

          {/* 3. Additional Properties */}
          <div className="rounded-xl bg-card border border-border-subtle p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-bold text-muted uppercase tracking-wider">Additional Properties</h2>
              <button onClick={() => setEditProperty('new')} className="text-[11px] font-semibold text-brand-text hover:underline cursor-pointer">+ Add</button>
            </div>
            {properties.length <= 1 ? (
              <p className="text-xs text-muted py-3">Add properties so you can organize work by location</p>
            ) : (
              <div className="space-y-2">
                {properties.slice(1).map(p => {
                  const pAddr = [p.street, p.city, p.state, p.zip].filter(Boolean).join(', ');
                  const propNotes = p.notes ? p.notes.split(', ').filter(Boolean) : [];
                  return (
                    <div key={p.id} className="flex items-start gap-3 p-3 rounded-lg bg-surface-alt/30 border border-border-subtle/50 group">
                      <MapPin size={15} className="text-brand-text mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-bold text-primary">{p.label || 'Primary'}</p>
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

          {/* 4. Billing */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-primary">Billing</h2>
              <button className="text-[11px] font-semibold text-brand-text hover:underline cursor-pointer">Add billing information</button>
            </div>
            <div className="rounded-xl bg-card border border-border-subtle">
              <div className="grid grid-cols-4 px-4 py-2.5 border-b border-border-subtle bg-surface-alt/30">
                <span className="text-[10px] font-semibold text-muted">Item</span>
                <span className="text-[10px] font-semibold text-muted">Applied to</span>
                <span className="text-[10px] font-semibold text-muted">Created date</span>
                <span className="text-[10px] font-semibold text-muted text-right">Amount</span>
              </div>
              <div className="px-4 py-6 text-center">
                <p className="text-xs text-muted">No billing history</p>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-border-subtle bg-surface-alt/30">
                <span className="text-xs font-semibold text-primary">Current balance</span>
                <span className="text-xs font-bold text-primary">-$0.00</span>
              </div>
            </div>
          </div>

          {/* 5. Payment methods */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-primary">Payment methods</h2>
              <button className="text-[11px] font-semibold text-brand-text hover:underline cursor-pointer">Add or request</button>
            </div>
            <div className="rounded-xl bg-card border border-border-subtle">
              <div className="grid grid-cols-3 px-4 py-2.5 border-b border-border-subtle bg-surface-alt/30">
                <span className="text-[10px] font-semibold text-muted">Method</span>
                <span className="text-[10px] font-semibold text-muted">Expiry</span>
                <span className="text-[10px] font-semibold text-muted text-right"></span>
              </div>
              <div className="px-4 py-6 text-center">
                <p className="text-xs text-muted">No payment methods on file</p>
              </div>
            </div>
          </div>

          {/* 6. Client schedule */}
          <div className="rounded-xl bg-card border border-border-subtle p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-bold text-muted uppercase tracking-wider">Client Schedule</h2>
              <button className="text-[11px] font-semibold text-brand-text hover:underline cursor-pointer">+ Add</button>
            </div>
            <div className="rounded-lg bg-surface-alt/30 border border-border-subtle/50">
              <div className="grid grid-cols-3 px-4 py-2 border-b border-border-subtle/50">
                <span className="text-[10px] font-semibold text-muted">Schedule</span>
                <span className="text-[10px] font-semibold text-muted">Title</span>
                <span className="text-[10px] font-semibold text-muted text-right">Assigned</span>
              </div>
              <div className="px-4 py-6 text-center">
                <p className="text-xs text-muted">No scheduled items</p>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Right: sidebar ─── */}
        <div className="hidden lg:block w-72 shrink-0 space-y-4">
          {/* Overview */}
          <div className="rounded-xl bg-card border border-border-subtle p-4">
            <h3 className="text-[11px] font-bold text-muted uppercase tracking-wider mb-3">Overview</h3>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Overdue</span>
                <span className="text-lg font-black text-primary">$0.00</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Current balance</span>
                <span className="text-lg font-black text-primary">$0.00</span>
              </div>
              <div className="h-px bg-border-subtle" />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Lifetime value</span>
                <span className="text-sm font-bold text-emerald-400">$0.00</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Total jobs</span>
                <span className="text-sm font-bold text-primary">0</span>
              </div>
            </div>
          </div>

          {/* Last communication */}
          <div className="rounded-xl bg-card border border-border-subtle p-4">
            <h3 className="text-[11px] font-bold text-muted uppercase tracking-wider mb-2">Last Communication</h3>
            <p className="text-xs text-muted">No communications yet</p>
          </div>

        </div>
      </div>
    </div>
  );
}

/* ─── Main ─── */
export default function Clients() {
  const { orgId } = useAuth();
  const navigate = useNavigate();
  const { clientId: urlClientId } = useParams();
  const [allClients, setAllClients] = useState([]);
  const [properties, setProperties] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('leads-active'); // all | leads-active | leads | active
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [selected, setSelected] = useState(null);
  const [showNewClient, setShowNewClient] = useState(false);
  const [hoveredRow, setHoveredRow] = useState(null);
  const [moreMenuId, setMoreMenuId] = useState(null);
  const [tagEditClient, setTagEditClient] = useState(null);

  const fetchClients = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('clients').select('*').eq('org_id', orgId).order('updated_at', { ascending: false });
    if (error) console.error('[Clients] fetch error:', error.message);
    setAllClients(data || []);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  // Filter + search
  const clients = (() => {
    let filtered = allClients;
    if (statusFilter === 'leads-active') filtered = filtered.filter(c => c.is_lead || !c.is_lead); // all active (no archived concept yet)
    else if (statusFilter === 'leads') filtered = filtered.filter(c => c.is_lead);
    else if (statusFilter === 'active') filtered = filtered.filter(c => !c.is_lead);
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(c =>
        [c.first_name, c.last_name, c.company_name, primaryPhone(c.phones), primaryEmail(c.emails),
         c.billing_street, c.billing_city, ...(c.tags || [])]
          .filter(Boolean).some(f => f.toLowerCase().includes(q))
      );
    }
    return filtered;
  })();

  const selectClient = async (client) => {
    setSelected(client);
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

  // Auto-open client from URL param
  useEffect(() => {
    if (urlClientId && allClients.length > 0 && !selected) {
      const c = allClients.find(cl => cl.id === urlClientId);
      if (c) selectClient(c);
    }
  }, [urlClientId, allClients]);

  const saveTags = async (id, tags) => {
    await supabase.from('clients').update({ tags, updated_at: new Date().toISOString() }).eq('id', id);
    fetchClients();
  };

  const archiveClient = async (id) => {
    await supabase.from('clients').update({ tags: ['archived'], updated_at: new Date().toISOString() }).eq('id', id);
    setMoreMenuId(null);
    fetchClients();
  };

  const deleteClient = async (id) => {
    if (!confirm('Delete this client? This cannot be undone.')) return;
    await supabase.from('properties').delete().eq('client_id', id);
    await supabase.from('clients').delete().eq('id', id);
    setMoreMenuId(null);
    fetchClients();
  };

  // Stats
  const leadCount = allClients.filter(c => c.is_lead).length;
  const clientCount = allClients.filter(c => !c.is_lead).length;
  // Use org timezone for 30-day window (matches Jobber's calculation)
  const todayStr = getTodayInTimezone(); // YYYY-MM-DD in Eastern
  const thirtyDaysAgoDate = new Date(todayStr + 'T00:00:00');
  thirtyDaysAgoDate.setDate(thirtyDaysAgoDate.getDate() - 30);
  const thirtyDaysAgo = thirtyDaysAgoDate;

  const newClients30 = allClients.filter(c => !c.is_lead && new Date(c.created_at) >= thirtyDaysAgo).length;
  const newLeads30 = allClients.filter(c => new Date(c.created_at) >= thirtyDaysAgo).length;

  const statusLabel = statusFilter === 'leads-active' ? 'Leads and Active' : statusFilter === 'leads' ? 'Leads' : statusFilter === 'active' ? 'Active' : 'All';

  if (selected) {
    return <ClientDetail client={selected} properties={properties[selected.id] || []} onBack={() => setSelected(null)} orgId={orgId} archiveClient={archiveClient} deleteClient={deleteClient} onPropertiesChange={async () => {
      const { data } = await supabase.from('properties').select('*').eq('client_id', selected.id).order('created_at');
      setProperties(prev => ({ ...prev, [selected.id]: data || [] }));
    }} onClientUpdate={async (id, updates) => {
      await supabase.from('clients').update(updates).eq('id', id);
      const { data } = await supabase.from('clients').select('*').eq('id', id).single();
      if (data) { setSelected(data); fetchClients(); }
    }} />;
  }

  return (
    <div className="space-y-5">
      {showNewClient && <NewClientModal onClose={() => setShowNewClient(false)} onSave={createClient} />}
      {tagEditClient && <TagEditor client={tagEditClient} onClose={() => setTagEditClient(null)} onSave={saveTags} />}

      {/* Header — title left, search + New Client right */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-primary">Clients</h1>
        <div className="flex items-center gap-2">
          <div className="relative hidden sm:block">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input type="text" placeholder="Search clients..." value={search} onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-3 py-2 rounded-lg bg-surface-alt border border-border-subtle text-xs text-primary placeholder:text-muted focus:outline-none focus:border-brand/50 w-48" />
          </div>
          <button onClick={() => navigate('/clients/new')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-on-brand text-sm font-bold hover:bg-brand-hover cursor-pointer">
            New Client
          </button>
        </div>
      </div>

      {/* Stats row — 3 cards like Jobber */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-card border border-border-subtle p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-muted">New leads</p>
            <TrendingUp size={14} className="text-emerald-500" />
          </div>
          <p className="text-xs text-muted">Past 30 days</p>
          <p className="text-3xl font-black text-primary mt-1">{newLeads30}</p>
        </div>
        <div className="rounded-xl bg-card border border-border-subtle p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-muted">New clients</p>
            <TrendingUp size={14} className="text-emerald-500" />
          </div>
          <p className="text-xs text-muted">Past 30 days</p>
          <p className="text-3xl font-black text-primary mt-1">{newClients30}</p>
        </div>
        <div className="rounded-xl bg-card border border-border-subtle p-4">
          <p className="text-xs font-bold text-muted">Total new clients</p>
          <p className="text-xs text-muted">Year to date</p>
          <p className="text-3xl font-black text-primary mt-1">{clientCount}</p>
        </div>
      </div>

      {/* Filtered clients + filter pills */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-bold text-primary">Filtered clients</span>
        <span className="text-xs text-muted">({clients.length} results)</span>

        {/* Filter by tag pill */}
        <button className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-surface-alt border border-border-subtle text-xs font-bold text-primary cursor-pointer hover:border-border-strong">
          Filter by tag <ChevronDown size={12} className="text-muted" />
        </button>

        {/* Status filter dropdown */}
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
      </div>

      {/* Mobile search */}
      <div className="relative sm:hidden">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input type="text" placeholder="Search clients..." value={search} onChange={e => setSearch(e.target.value)}
          className="pl-9 pr-3 py-2 rounded-lg bg-surface-alt border border-border-subtle text-xs text-primary placeholder:text-muted focus:outline-none focus:border-brand/50 w-full" />
      </div>

      {loading && <div className="flex items-center justify-center py-20"><Loader2 size={20} className="animate-spin text-brand" /></div>}

      {!loading && clients.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users size={48} className="text-muted mb-4" />
          <h2 className="text-lg font-bold text-primary mb-1">No clients found</h2>
        </div>
      )}

      {/* Table */}
      {!loading && clients.length > 0 && (
        <div className="rounded-xl border border-border-subtle overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-alt/50 text-left border-b border-border-subtle">
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted">Name ↕</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted hidden sm:table-cell">Address</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted hidden md:table-cell">Tags</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted">Status</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted text-right">Last Activity ↕</th>
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
                      className={`cursor-pointer transition-colors hover:bg-white/[0.03] ${i > 0 ? 'border-t border-border-subtle/50' : ''}`}>
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
                        {c.is_lead ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400">
                            <span className="w-2 h-2 rounded-full bg-amber-500" /> Lead
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Active
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isHovered ? (
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={(e) => { e.stopPropagation(); setTagEditClient(c); }}
                              title="Tag" className="p-1.5 rounded-lg hover:bg-surface-alt text-muted hover:text-primary cursor-pointer">
                              <Tag size={14} />
                            </button>
                            {email && (
                              <a href={`mailto:${email}`} onClick={(e) => e.stopPropagation()}
                                title="Email" className="p-1.5 rounded-lg hover:bg-surface-alt text-muted hover:text-primary cursor-pointer">
                                <Mail size={14} />
                              </a>
                            )}
                            <div className="relative">
                              <button onClick={(e) => { e.stopPropagation(); setMoreMenuId(moreMenuId === c.id ? null : c.id); }}
                                title="More actions" className="p-1.5 rounded-lg hover:bg-surface-alt text-muted hover:text-primary cursor-pointer">
                                <MoreHorizontal size={14} />
                              </button>
                              {moreMenuId === c.id && (
                                <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border-subtle rounded-lg shadow-2xl min-w-[160px] py-1">
                                  <button onClick={(e) => { e.stopPropagation(); archiveClient(c.id); }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-secondary hover:bg-surface-alt cursor-pointer">
                                    <Archive size={13} /> Archive
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); deleteClient(c.id); }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-red-400 hover:bg-surface-alt cursor-pointer">
                                    <Trash2 size={13} /> Delete
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); window.open(`/clients/${c.id}`, '_blank'); setMoreMenuId(null); }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-secondary hover:bg-surface-alt cursor-pointer">
                                    <ExternalLink size={13} /> Open in new tab
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-muted">{lastActivity(c.updated_at)}</p>
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
