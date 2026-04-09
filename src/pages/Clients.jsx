import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  Search, Loader2, Users, Phone, Mail, MapPin, ArrowLeft,
  Plus, X, RefreshCw, Home, ChevronDown, Check, TrendingUp,
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

/* ─── Client Detail ─── */
function ClientDetail({ client, properties, onBack }) {
  const name = [client.first_name, client.last_name].filter(Boolean).join(' ') || client.company_name || 'Unknown';
  const phone = primaryPhone(client.phones);
  const email = primaryEmail(client.emails);
  const addr = [client.billing_street, client.billing_city, client.billing_state, client.billing_zip].filter(Boolean).join(', ');

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted hover:text-primary cursor-pointer">
        <ArrowLeft size={16} /> Back to clients
      </button>
      <div className="rounded-xl bg-card border border-border-subtle p-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-black text-primary">{name}</h2>
            {client.company_name && client.first_name && <p className="text-sm text-muted">{client.company_name}</p>}
          </div>
          {client.is_lead ? (
            <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 text-[11px] font-bold border border-amber-500/30">Lead</span>
          ) : (
            <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-[11px] font-bold border border-emerald-500/30">Active</span>
          )}
        </div>
        <div className="space-y-2 mt-4">
          {phone && <a href={`tel:${phone}`} className="flex items-center gap-2 text-sm text-brand-text hover:underline"><Phone size={14} /> {phone}</a>}
          {email && <a href={`mailto:${email}`} className="flex items-center gap-2 text-sm text-brand-text hover:underline"><Mail size={14} /> {email}</a>}
          {addr && <p className="flex items-center gap-2 text-sm text-secondary"><MapPin size={14} className="shrink-0" /> {addr}</p>}
        </div>
        {client.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {client.tags.map(t => <span key={t} className="px-2 py-0.5 rounded-md bg-surface-alt text-[11px] font-semibold text-secondary border border-border-subtle">{t}</span>)}
          </div>
        )}
        {client.notes && (
          <div className="mt-4 pt-3 border-t border-border-subtle">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Notes</p>
            <p className="text-sm text-secondary">{client.notes}</p>
          </div>
        )}
      </div>
      <div className="rounded-xl bg-card border border-border-subtle p-5">
        <div className="flex items-center gap-2 mb-3">
          <Home size={16} className="text-brand-text" />
          <h3 className="text-sm font-bold text-primary">Properties</h3>
          <span className="text-xs text-muted">({properties.length})</span>
        </div>
        {properties.length === 0 && <p className="text-sm text-muted">No properties on file.</p>}
        {properties.map(p => (
          <div key={p.id} className="flex items-start gap-3 py-2.5 border-b border-border-subtle/50 last:border-0">
            <MapPin size={14} className="text-muted mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-primary">{p.label || 'Property'}</p>
              <p className="text-xs text-secondary">{[p.street, p.city, p.state, p.zip].filter(Boolean).join(', ')}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Main ─── */
export default function Clients() {
  const { orgId } = useAuth();
  const navigate = useNavigate();
  const [allClients, setAllClients] = useState([]);
  const [properties, setProperties] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('leads-active'); // all | leads-active | leads | active
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [selected, setSelected] = useState(null);
  const [showNewClient, setShowNewClient] = useState(false);

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
                  return (
                    <tr key={c.id} onClick={() => selectClient(c)}
                      className={`cursor-pointer transition-colors hover:bg-white/[0.02] ${i > 0 ? 'border-t border-border-subtle/50' : ''}`}>
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
                        <p className="text-xs text-muted">{lastActivity(c.updated_at)}</p>
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
