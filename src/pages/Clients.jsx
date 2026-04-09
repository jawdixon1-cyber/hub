import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  Search, Loader2, Users, Phone, Mail, MapPin, ArrowLeft,
  Plus, X, RefreshCw, Home, ChevronDown, Check, TrendingUp,
  Tag, MoreHorizontal, Archive, Trash2, ExternalLink,
} from 'lucide-react';
import { getTimezone, getTodayInTimezone } from '../utils/timezone';

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

/* ─── Client Detail (Jobber style) ─── */
function ClientDetail({ client, properties, onBack }) {
  const name = [client.first_name, client.last_name].filter(Boolean).join(' ') || client.company_name || 'Unknown';
  const phone = primaryPhone(client.phones);
  const email = primaryEmail(client.emails);
  const primaryProp = properties[0];
  const propAddr = primaryProp ? [primaryProp.street, primaryProp.city, primaryProp.state, primaryProp.zip].filter(Boolean).join(', ') : null;
  const [workTab, setWorkTab] = useState('active');
  const [note, setNote] = useState('');

  const contactInfo = [
    { label: 'Mobile phone', value: phone, link: phone ? `tel:${phone}` : null, color: 'text-brand-text' },
    { label: 'Email', value: email, link: email ? `mailto:${email}` : null, color: 'text-brand-text' },
    { label: 'Company', value: client.company_name || '—' },
    { label: 'Lead source', value: client.lead_source || '—' },
    { label: 'Tags', value: (client.tags || []).length > 0 ? (client.tags || []).join(', ') : 'None' },
    { label: 'Created', value: client.created_at ? new Date(client.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—' },
  ];

  const WORK_TABS = [
    { id: 'active', label: 'Active' },
    { id: 'requests', label: 'Requests' },
    { id: 'quotes', label: 'Quotes' },
    { id: 'jobs', label: 'Jobs' },
    { id: 'invoices', label: 'Invoices' },
  ];

  // Client lifetime value (placeholder — will be real once invoices exist)
  const totalJobs = 0;
  const lifetimeValue = 0;

  return (
    <div className="space-y-0">
      {/* Back + breadcrumb */}
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-muted hover:text-primary cursor-pointer mb-3">
        <ArrowLeft size={14} /> {client.is_lead ? 'Lead' : 'Client'}
      </button>

      {/* Two-column layout: main + sidebar */}
      <div className="flex gap-6">
        {/* ─── Main column ─── */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                {client.is_lead ? (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-bold border border-amber-500/30">Lead</span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">Active</span>
                )}
              </div>
              <h1 className="text-2xl font-black text-primary">{name}</h1>
              {client.company_name && client.first_name && (
                <p className="text-sm text-muted mt-0.5">{client.company_name}</p>
              )}
            </div>
            {/* Quick action buttons */}
            <div className="flex items-center gap-1.5">
              {phone && (
                <a href={`tel:${phone}`} className="p-2 rounded-lg bg-surface-alt border border-border-subtle text-muted hover:text-primary hover:border-border-strong cursor-pointer" title="Call">
                  <Phone size={15} />
                </a>
              )}
              {email && (
                <a href={`mailto:${email}`} className="p-2 rounded-lg bg-surface-alt border border-border-subtle text-muted hover:text-primary hover:border-border-strong cursor-pointer" title="Email">
                  <Mail size={15} />
                </a>
              )}
            </div>
          </div>

          {/* Contact info grid */}
          <div className="rounded-xl bg-card border border-border-subtle">
            <div className="grid grid-cols-2 sm:grid-cols-3 divide-x divide-border-subtle/50">
              {contactInfo.map((item, i) => (
                <div key={i} className={`px-4 py-3 ${i >= (window.innerWidth >= 640 ? 3 : 2) ? 'border-t border-border-subtle/50' : ''}`}>
                  <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-0.5">{item.label}</p>
                  {item.link ? (
                    <a href={item.link} className={`text-sm font-medium ${item.color || 'text-primary'} hover:underline`}>{item.value}</a>
                  ) : (
                    <p className="text-sm font-medium text-primary">{item.value || '—'}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Work overview */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-primary">Work overview</h2>
              <Plus size={16} className="text-muted" />
            </div>
            <div className="flex items-center gap-1 mb-3">
              {WORK_TABS.map(t => (
                <button key={t.id} onClick={() => setWorkTab(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer ${
                    workTab === t.id ? 'bg-surface-alt text-primary' : 'text-muted hover:text-secondary'
                  }`}>{t.label}</button>
              ))}
            </div>
            <div className="rounded-xl bg-card border border-border-subtle">
              <div className="grid grid-cols-4 bg-surface-alt/50 border-b border-border-subtle px-4 py-2">
                <span className="text-[10px] font-semibold text-muted">Item</span>
                <span className="text-[10px] font-semibold text-muted">Date</span>
                <span className="text-[10px] font-semibold text-muted">Status</span>
                <span className="text-[10px] font-semibold text-muted text-right">Amount</span>
              </div>
              <div className="px-4 py-8 text-center">
                <p className="text-xs text-muted">No results match your search</p>
              </div>
            </div>
          </div>

          {/* Additional contacts */}
          <div className="rounded-xl bg-card border border-border-subtle p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-primary">Additional contacts</h2>
              <button className="text-xs font-semibold text-brand-text hover:underline cursor-pointer">Add Contact</button>
            </div>
            <p className="text-xs text-muted mt-2">Add contacts to keep track of everyone you communicate with</p>
          </div>

          {/* Properties — each one is a card with its own details */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-primary">Properties</h2>
              <button className="text-xs font-semibold text-brand-text hover:underline cursor-pointer">Add Property</button>
            </div>
            {properties.length === 0 ? (
              <div className="rounded-xl bg-card border border-border-subtle p-5">
                <p className="text-xs text-muted">Add properties so you can organize work by location</p>
              </div>
            ) : (
              <div className="space-y-3">
                {properties.map(p => {
                  const pAddr = [p.street, p.city, p.state, p.zip].filter(Boolean).join(', ');
                  const propNotes = p.notes ? p.notes.split(', ').filter(Boolean) : [];
                  return (
                    <div key={p.id} className="rounded-xl bg-card border border-border-subtle p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-start gap-2.5">
                          <MapPin size={16} className="text-brand-text mt-0.5 shrink-0" />
                          <div>
                            <p className="text-sm font-bold text-primary">{p.label || 'Primary'}</p>
                            <p className="text-xs text-secondary">{pAddr || 'No address'}</p>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-surface-alt text-[10px] font-bold text-muted border border-border-subtle">
                          {p.label || 'Primary'}
                        </span>
                      </div>
                      {/* Property details grid */}
                      <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-border-subtle/50">
                        <div>
                          <p className="text-[10px] font-bold text-muted uppercase">Lot size</p>
                          <p className="text-xs font-medium text-primary">{p.lot_size_sqft ? `${p.lot_size_sqft.toLocaleString()} sqft` : '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-muted uppercase">Gate access</p>
                          <p className="text-xs font-medium text-primary">{propNotes.includes('Lockout gate') ? 'Lockout' : propNotes.includes('Narrow gate') ? 'Narrow' : 'Open'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-muted uppercase">Dog</p>
                          <p className="text-xs font-medium text-primary">{propNotes.includes('Dog on property') ? 'Yes' : 'No'}</p>
                        </div>
                      </div>
                      {p.notes && !['Dog on property', 'Lockout gate', 'Narrow gate'].some(n => p.notes === n) && (
                        <div className="mt-2 pt-2 border-t border-border-subtle/50">
                          <p className="text-[10px] font-bold text-muted uppercase">Notes</p>
                          <p className="text-xs text-secondary">{p.notes}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Billing */}
          <div className="rounded-xl bg-card border border-border-subtle p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-primary">Billing</h2>
              <button className="text-xs font-semibold text-brand-text hover:underline cursor-pointer">Add billing information</button>
            </div>
            <p className="text-xs text-muted mt-2">Bill this client to see billing history</p>
          </div>

          {/* Payment methods */}
          <div className="rounded-xl bg-card border border-border-subtle p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-primary">Payment methods</h2>
              <button className="text-xs font-semibold text-brand-text hover:underline cursor-pointer">Add or request</button>
            </div>
            <p className="text-xs text-muted mt-2">Once a payment method is requested or added it can be used to automate payment collection</p>
          </div>

          {/* Client schedule */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-primary">Client schedule</h2>
              <Plus size={16} className="text-muted" />
            </div>
            <div className="rounded-xl bg-card border border-border-subtle">
              <div className="grid grid-cols-3 bg-surface-alt/50 border-b border-border-subtle px-4 py-2">
                <span className="text-[10px] font-semibold text-muted">Schedule</span>
                <span className="text-[10px] font-semibold text-muted">Title</span>
                <span className="text-[10px] font-semibold text-muted text-right">Assigned</span>
              </div>
              <div className="px-4 py-8 text-center">
                <p className="text-xs text-muted">No scheduled items</p>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Right sidebar ─── */}
        <div className="hidden lg:block w-72 shrink-0 space-y-4">
          {/* Financial overview */}
          <div className="rounded-xl bg-card border border-border-subtle p-4">
            <h3 className="text-xs font-bold text-muted uppercase mb-3">Overview</h3>
            <div className="space-y-3">
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

          {/* Client since */}
          <div className="rounded-xl bg-card border border-border-subtle p-4">
            <h3 className="text-xs font-bold text-muted uppercase mb-2">Client since</h3>
            <p className="text-sm font-semibold text-primary">
              {client.created_at ? new Date(client.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'}
            </p>
            {client.created_at && (
              <p className="text-[10px] text-muted mt-0.5">
                {Math.floor((Date.now() - new Date(client.created_at).getTime()) / 86400000)} days ago
              </p>
            )}
          </div>

          {/* Notes — editable */}
          <div className="rounded-xl bg-card border border-border-subtle p-4">
            <h3 className="text-xs font-bold text-muted uppercase mb-2">Notes</h3>
            {client.notes ? (
              <p className="text-xs text-secondary whitespace-pre-wrap">{client.notes}</p>
            ) : (
              <div className="text-center py-3">
                <p className="text-[11px] text-muted">Leave an internal note for yourself or a team member</p>
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="rounded-xl bg-card border border-border-subtle p-4 space-y-1.5">
            <h3 className="text-xs font-bold text-muted uppercase mb-2">Quick actions</h3>
            <button className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer">
              Create request
            </button>
            <button className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer">
              Create quote
            </button>
            <button className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer">
              Schedule visit
            </button>
            <button className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer">
              Create invoice
            </button>
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
    return <ClientDetail client={selected} properties={properties[selected.id] || []} onBack={() => setSelected(null)} />;
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
