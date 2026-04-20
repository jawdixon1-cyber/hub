import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { ClipboardCheck, Wrench, X, ChevronRight, Users, Link2, Check, Plug, Shield, Plus, Trash2, LogOut } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const ChecklistEditorModal = lazy(() => import('../components/ChecklistEditorModal'));
const TeamManagement = lazy(() => import('./TeamManagement'));
const TeamAgreement = lazy(() => import('./TeamAgreement'));
const RichTextEditor = lazy(() => import('../components/RichTextEditor'));
import { DEFAULT_ROLES, DEFAULT_ROLES_VERSION } from '../data/roleTemplates';
import { EQUIPMENT_TYPES } from '../data';
import { useAppStore } from '../store/AppStoreContext';
import { useAuth } from '../contexts/AuthContext';

/* ─── Settings Nav ─── */

import { Building2, MapPin } from 'lucide-react';

const SETTINGS_NAV = [
  { id: 'business', label: 'Business Profile', icon: Building2, ownerOnly: true },
  { id: 'connections', label: 'Connections', icon: Plug, ownerOnly: true },
  { id: 'checklists', label: 'Checklists', icon: ClipboardCheck, ownerOnly: true },
  { id: 'team', label: 'Team', icon: Users, ownerOnly: true },
  { id: 'account', label: 'Account', icon: LogOut },
];

/* ─── Equipment Section ─── */

function EquipmentSection() {
  const equipmentCategories = useAppStore((s) => s.equipmentCategories);
  const setEquipmentCategories = useAppStore((s) => s.setEquipmentCategories);
  const [newCategoryLabel, setNewCategoryLabel] = useState('');

  useEffect(() => {
    if (equipmentCategories.length === 0) setEquipmentCategories([...EQUIPMENT_TYPES]);
  }, []);

  const addCategory = () => {
    const label = newCategoryLabel.trim();
    if (!label) return;
    const value = label.toLowerCase().replace(/\s+/g, '-');
    if (equipmentCategories.some((c) => c.value === value)) return;
    setEquipmentCategories([...equipmentCategories, { value, label }]);
    setNewCategoryLabel('');
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-primary">Equipment Categories</h2>
      <p className="text-xs text-muted">Add or remove equipment types your team can log.</p>
      {equipmentCategories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {equipmentCategories.map((cat) => (
            <span key={cat.value} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-surface-alt text-secondary border border-border-subtle">
              {cat.label}
              <button onClick={() => setEquipmentCategories(equipmentCategories.filter((c) => c.value !== cat.value))}
                className="ml-0.5 p-0.5 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 transition-colors cursor-pointer">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input type="text" value={newCategoryLabel} onChange={(e) => setNewCategoryLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addCategory(); }}
          placeholder="e.g. Trailer, Edger, Sprayer"
          className="flex-1 rounded-lg border border-border-default bg-card px-3 py-2 text-sm text-primary focus:ring-2 focus:ring-ring-brand outline-none" />
        <button onClick={addCategory} className="px-4 py-2 rounded-lg bg-brand text-on-brand text-sm font-medium hover:bg-brand-hover cursor-pointer">Add</button>
      </div>
    </div>
  );
}

/* ─── Checklists Section (all 4 in one view) ─── */

function ChecklistsSection() {
  const [showEditor, setShowEditor] = useState(null); // 'owner-start' | 'owner-end' | 'team-start' | 'team-end'

  const ownerStart = useAppStore((s) => s.ownerStartChecklist);
  const setOwnerStart = useAppStore((s) => s.setOwnerStartChecklist);
  const ownerEnd = useAppStore((s) => s.ownerEndChecklist);
  const setOwnerEnd = useAppStore((s) => s.setOwnerEndChecklist);
  const teamStart = useAppStore((s) => s.teamChecklist);
  const setTeamStart = useAppStore((s) => s.setTeamChecklist);
  const teamEnd = useAppStore((s) => s.teamEndChecklist);
  const setTeamEnd = useAppStore((s) => s.setTeamEndChecklist);

  const editorMap = {
    'owner-start': { items: ownerStart, setItems: setOwnerStart, title: 'Owner — Start of Day' },
    'owner-end': { items: ownerEnd, setItems: setOwnerEnd, title: 'Owner — End of Day' },
    'team-start': { items: teamStart, setItems: setTeamStart, title: 'Team — Opening' },
    'team-end': { items: teamEnd, setItems: setTeamEnd, title: 'Team — Closing' },
  };

  const active = showEditor ? editorMap[showEditor] : null;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-primary">Checklists</h2>

      {/* Owner */}
      <div>
        <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-2">Owner</p>
        <div className="space-y-2">
          <button onClick={() => setShowEditor('owner-start')}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-card border border-border-subtle hover:border-border-strong cursor-pointer transition-colors">
            <span className="text-sm font-medium text-primary">Start of Day</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted">{ownerStart.filter((i) => i.type !== 'header').length} items</span>
              <ChevronRight size={16} className="text-muted" />
            </div>
          </button>
          <button onClick={() => setShowEditor('owner-end')}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-card border border-border-subtle hover:border-border-strong cursor-pointer transition-colors">
            <span className="text-sm font-medium text-primary">End of Day</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted">{ownerEnd.filter((i) => i.type !== 'header').length} items</span>
              <ChevronRight size={16} className="text-muted" />
            </div>
          </button>
        </div>
      </div>

      {/* Team */}
      <div>
        <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-2">Team</p>
        <div className="space-y-2">
          <button onClick={() => setShowEditor('team-start')}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-card border border-border-subtle hover:border-border-strong cursor-pointer transition-colors">
            <span className="text-sm font-medium text-primary">Opening</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted">{teamStart.filter((i) => i.type !== 'header').length} items</span>
              <ChevronRight size={16} className="text-muted" />
            </div>
          </button>
          <button onClick={() => setShowEditor('team-end')}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-card border border-border-subtle hover:border-border-strong cursor-pointer transition-colors">
            <span className="text-sm font-medium text-primary">Closing</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted">{teamEnd.filter((i) => i.type !== 'header').length} items</span>
              <ChevronRight size={16} className="text-muted" />
            </div>
          </button>
        </div>
      </div>

      {/* Editor modal */}
      {active && (
        <Suspense fallback={null}>
          <ChecklistEditorModal
            onClose={() => setShowEditor(null)}
            items={active.items}
            setItems={active.setItems}
            title={active.title}
          />
        </Suspense>
      )}
    </div>
  );
}

/* ─── Connections Section ─── */

function JobberConnectionPanel() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const loadStatus = () => {
    return fetch('/api/jobber-data?action=status')
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ connected: false }));
  };

  useEffect(() => {
    const jobberParam = searchParams.get('jobber');
    if (jobberParam === 'error') {
      setErrorMsg(searchParams.get('msg') || 'Connection failed');
      searchParams.delete('jobber');
      searchParams.delete('msg');
      setSearchParams(searchParams, { replace: true });
    } else if (jobberParam === 'connected') {
      searchParams.delete('jobber');
      setSearchParams(searchParams, { replace: true });
    }

    loadStatus().finally(() => setLoading(false));
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const res = await fetch('/api/jobber-data?action=refresh', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setRefreshMsg({ type: 'ok', text: 'Token refreshed successfully.' });
      } else {
        setRefreshMsg({ type: 'err', text: data.error || 'Refresh failed.' });
      }
      await loadStatus();
    } catch (err) {
      setRefreshMsg({ type: 'err', text: 'Network error: ' + err.message });
    } finally {
      setRefreshing(false);
    }
  };

  const fmtTime = (v) => {
    if (!v) return '—';
    const d = typeof v === 'number' ? new Date(v) : new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return d.toLocaleString();
  };
  const timeUntilExpiry = () => {
    if (!status?.expires_at) return null;
    const ms = status.expires_at - Date.now();
    if (ms < 0) return 'expired';
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins} min`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
  };

  return (
    <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#1a3a3a] flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold">J</span>
          </div>
          <div>
            <h3 className="text-sm font-bold text-primary">Jobber</h3>
            {loading ? (
              <p className="text-xs text-muted">Checking connection...</p>
            ) : status?.connected ? (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <Check size={12} /> Connected
              </p>
            ) : (
              <p className="text-xs text-muted">Not connected</p>
            )}
          </div>
        </div>
        {!loading && (
          status?.connected ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="px-3 py-1.5 rounded-lg bg-surface-alt text-secondary text-xs font-semibold hover:bg-surface hover:text-primary transition-colors disabled:opacity-50 cursor-pointer"
              >
                {refreshing ? 'Refreshing…' : 'Refresh Now'}
              </button>
              <a
                href="/api/jobber-auth"
                onClick={(e) => { e.preventDefault(); window.location.href = '/api/jobber-auth'; }}
                className="px-3 py-1.5 rounded-lg bg-surface-alt text-secondary text-xs font-semibold hover:bg-surface hover:text-primary transition-colors"
              >
                Reconnect
              </a>
            </div>
          ) : (
            <a
              href="/api/jobber-auth"
              onClick={(e) => { e.preventDefault(); window.location.href = '/api/jobber-auth'; }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1a3a3a] text-white text-xs font-semibold hover:bg-[#2a4a4a] transition-colors"
            >
              <Link2 size={14} />
              Connect
            </a>
          )
        )}
      </div>

      {/* Diagnostic token state */}
      {!loading && status?.connected && (
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] text-muted">
          <div><span className="font-semibold text-secondary">Token expires:</span> {fmtTime(status.expires_at)} {timeUntilExpiry() && <span className="text-muted">({timeUntilExpiry()})</span>}</div>
          <div><span className="font-semibold text-secondary">Last refreshed:</span> {fmtTime(status.refreshed_at)}</div>
          <div><span className="font-semibold text-secondary">Refresh token:</span> {status.has_refresh_token ? <span className="text-emerald-500">stored</span> : <span className="text-red-500">missing</span>}</div>
          <div><span className="font-semibold text-secondary">Server env:</span> {status.has_client_id && status.has_client_secret ? <span className="text-emerald-500">OK</span> : <span className="text-red-500">missing {!status.has_client_id && 'CLIENT_ID '}{!status.has_client_secret && 'CLIENT_SECRET'}</span>}</div>
          {status.last_refresh_error && (
            <div className="col-span-2 mt-1 text-red-500 break-words">
              <span className="font-semibold">Last refresh error:</span> {status.last_refresh_error}
              <span className="block text-muted text-[10px] mt-0.5">at {fmtTime(status.last_refresh_attempt)}</span>
            </div>
          )}
        </div>
      )}

      {refreshMsg && (
        <p className={`mt-3 text-xs rounded-lg p-3 break-words ${refreshMsg.type === 'ok' ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40' : 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40'}`}>
          {refreshMsg.text}
        </p>
      )}

      {errorMsg && (
        <p className="mt-3 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-lg p-3 break-all">
          Jobber Error: {errorMsg}
        </p>
      )}
    </div>
  );
}

function QBConnectionPanel() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    fetch('/api/qb-data?action=status')
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ connected: false }))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#2ca01c] flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold">QB</span>
          </div>
          <div>
            <h3 className="text-sm font-bold text-primary">QuickBooks</h3>
            {loading ? (
              <p className="text-xs text-muted">Checking connection...</p>
            ) : status?.connected ? (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <Check size={12} /> Connected
              </p>
            ) : (
              <p className="text-xs text-muted">Not connected</p>
            )}
          </div>
        </div>
        {!loading && (
          status?.connected ? (
            <span className="px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-xs font-semibold">
              Active
            </span>
          ) : (
            <a
              href="/api/qb-data?action=auth"
              onClick={(e) => { e.preventDefault(); window.location.href = '/api/qb-data?action=auth'; }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2ca01c] text-white text-xs font-semibold hover:bg-[#238a17] transition-colors"
            >
              <Link2 size={14} />
              Connect
            </a>
          )
        )}
      </div>
      {errorMsg && (
        <p className="mt-3 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-lg p-3 break-all">
          QB Error: {errorMsg}
        </p>
      )}
    </div>
  );
}

function BusinessProfileSection() {
  const businessSettings = useAppStore((s) => s.businessSettings) || {};
  const setBusinessSettings = useAppStore((s) => s.setBusinessSettings);
  const [form, setForm] = useState({
    name: businessSettings.name || '',
    website: businessSettings.website || '',
    phone: businessSettings.phone || '',
    email: businessSettings.email || '',
    street: businessSettings.street || '',
    city: businessSettings.city || '',
    state: businessSettings.state || '',
    zip: businessSettings.zip || '',
    lat: businessSettings.lat || '',
    lon: businessSettings.lon || '',
  });
  const [addrResults, setAddrResults] = useState([]);
  const [showAddrResults, setShowAddrResults] = useState(false);
  const addrTimer = useRef(null);

  const searchBizAddr = (q) => {
    set('street', q);
    setShowAddrResults(true);
    if (addrTimer.current) clearTimeout(addrTimer.current);
    if (!q || q.length < 3) { setAddrResults([]); return; }
    addrTimer.current = setTimeout(async () => {
      try {
        const localQ = `${q}, ${form.city || 'Rock Hill'}, ${form.state || 'SC'}`;
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=us&limit=6&addressdetails=1&q=${encodeURIComponent(localQ)}`);
        const data = await res.json();
        setAddrResults(data.map(d => {
          const a = d.address || {};
          const street = a.house_number ? `${a.house_number} ${a.road || ''}` : a.road || '';
          return { display: d.display_name, street, city: a.city || a.town || a.village || '', state: a.state || '', zip: a.postcode || '', lat: d.lat, lon: d.lon };
        }));
      } catch { setAddrResults([]); }
    }, 400);
  };

  const selectBizAddr = (s) => {
    setForm(p => ({ ...p, street: s.street, city: s.city, state: s.state, zip: s.zip, lat: parseFloat(s.lat), lon: parseFloat(s.lon) }));
    setShowAddrResults(false);
    setAddrResults([]);
    setSaved(false);
  };
  const [saved, setSaved] = useState(false);
  const set = (k, v) => { setForm(p => ({ ...p, [k]: v })); setSaved(false); };

  const handleSave = async () => {
    // Try to geocode the address for lat/lon
    let lat = form.lat, lon = form.lon;
    if (form.city && form.state && (!lat || !lon)) {
      try {
        const q = [form.street, form.city, form.state, form.zip].filter(Boolean).join(', ');
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (data[0]) { lat = parseFloat(data[0].lat); lon = parseFloat(data[0].lon); }
      } catch {}
    }
    setBusinessSettings({ ...form, lat, lon });
    setForm(p => ({ ...p, lat, lon }));
    setSaved(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-primary mb-1">Business Profile</h2>
        <p className="text-xs text-muted">Your company info. Address is used to show nearby results when searching for client addresses.</p>
      </div>

      {/* Company info */}
      <div className="rounded-lg border border-border-subtle overflow-hidden">
        <div className="px-3 pt-1.5 pb-2 bg-surface-alt">
          <span className="text-[9px] font-semibold text-muted uppercase">Company name</span>
          <input value={form.name} onChange={e => set('name', e.target.value)} className="w-full text-sm text-primary bg-transparent focus:outline-none" />
        </div>
        <div className="px-3 pt-1.5 pb-2 bg-surface-alt border-t border-border-subtle">
          <span className="text-[9px] font-semibold text-muted uppercase">Website URL</span>
          <input value={form.website} onChange={e => set('website', e.target.value)} className="w-full text-sm text-primary bg-transparent focus:outline-none" />
        </div>
        <div className="grid grid-cols-2 border-t border-border-subtle">
          <div className="px-3 pt-1.5 pb-2 bg-surface-alt border-r border-border-subtle">
            <span className="text-[9px] font-semibold text-muted uppercase">Phone number</span>
            <input value={form.phone} onChange={e => set('phone', e.target.value)} className="w-full text-sm text-primary bg-transparent focus:outline-none" />
          </div>
          <div className="px-3 pt-1.5 pb-2 bg-surface-alt">
            <span className="text-[9px] font-semibold text-muted uppercase">Email address</span>
            <input value={form.email} onChange={e => set('email', e.target.value)} className="w-full text-sm text-primary bg-transparent focus:outline-none" />
          </div>
        </div>
      </div>

      {/* Address */}
      <div className="mt-4">
        <div className="rounded-lg border border-border-subtle overflow-visible">
        <div className="relative px-3 pt-1.5 pb-2 bg-surface-alt rounded-t-lg">
          <span className="text-[9px] font-semibold text-muted uppercase">Street address</span>
          <input value={form.street} onChange={e => searchBizAddr(e.target.value)} onBlur={() => setTimeout(() => setShowAddrResults(false), 200)} autoComplete="none"
            className="w-full text-sm text-primary bg-transparent focus:outline-none" />
          {showAddrResults && addrResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-[100] bg-card border border-border-subtle rounded-lg shadow-2xl max-h-48 overflow-y-auto">
              {addrResults.map((s, i) => (
                <button key={i} onClick={() => selectBizAddr(s)}
                  className="w-full px-3 py-2.5 text-left text-xs text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer border-b border-border-subtle/30 last:border-0">
                  {s.display}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 border-t border-border-subtle">
          <div className="px-3 pt-1.5 pb-2 bg-surface-alt border-r border-border-subtle">
            <span className="text-[9px] font-semibold text-muted uppercase">City</span>
            <input value={form.city} onChange={e => set('city', e.target.value)} className="w-full text-sm text-primary bg-transparent focus:outline-none" />
          </div>
          <div className="px-3 pt-1.5 pb-2 bg-surface-alt">
            <span className="text-[9px] font-semibold text-muted uppercase">State</span>
            <input value={form.state} onChange={e => set('state', e.target.value)} className="w-full text-sm text-primary bg-transparent focus:outline-none" />
          </div>
        </div>
        <div className="px-3 pt-1.5 pb-2 bg-surface-alt border-t border-border-subtle">
          <span className="text-[9px] font-semibold text-muted uppercase">ZIP code</span>
          <input value={form.zip} onChange={e => set('zip', e.target.value)} className="w-full text-sm text-primary bg-transparent focus:outline-none" />
        </div>
        </div>
      </div>

      <button onClick={handleSave}
        className="px-5 py-2.5 rounded-lg bg-brand text-on-brand text-sm font-bold hover:bg-brand-hover cursor-pointer">
        {saved ? 'Saved!' : 'Save'}
      </button>
    </div>
  );
}

function ConnectionsSection() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-primary">Connections</h2>
      <p className="text-xs text-muted">Manage integrations with external services.</p>
      <JobberConnectionPanel />
      <QBConnectionPanel />
    </div>
  );
}

/* ─── Roles Section ─── */

function bumpVersion(v) {
  const parts = (v || '1.0').split('.');
  const minor = parseInt(parts[1] || '0', 10) + 1;
  return `${parts[0]}.${minor}`;
}

function RolesSection() {
  const stored = useAppStore((s) => s.roles);
  const setRoles = useAppStore((s) => s.setRoles);
  const data = stored && stored.items ? stored : { version: DEFAULT_ROLES_VERSION, items: DEFAULT_ROLES };

  const [items, setItems] = useState(data.items);
  const [version, setVersion] = useState(data.version);
  const [activeId, setActiveId] = useState(data.items[0]?.id || null);
  const [dirty, setDirty] = useState(false);

  const active = items.find((r) => r.id === activeId) || items[0];

  const updateRole = (id, patch) => {
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  const addRole = () => {
    const id = `role-${Date.now()}`;
    const newRole = { id, name: 'New Role', body: '<p>Describe this role\u2019s responsibilities here.</p>' };
    setItems((prev) => [...prev, newRole]);
    setActiveId(id);
    setDirty(true);
  };

  const deleteRole = (id) => {
    if (items.length <= 1) return;
    if (!confirm('Delete this role? Team members assigned to it will need a new role.')) return;
    const next = items.filter((r) => r.id !== id);
    setItems(next);
    if (activeId === id) setActiveId(next[0]?.id || null);
    setDirty(true);
  };

  const resetToDefaults = () => {
    if (!confirm('Reset all roles to defaults? Your edits will be lost.')) return;
    setItems(DEFAULT_ROLES);
    setActiveId(DEFAULT_ROLES[0].id);
    setDirty(true);
  };

  const save = () => {
    const newVersion = dirty ? bumpVersion(version) : version;
    setRoles({ version: newVersion, items });
    setVersion(newVersion);
    setDirty(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-lg font-bold text-primary">Roles & Responsibilities</h2>
          <p className="text-xs text-muted mt-0.5">Define the responsibilities for each role on your team. These show up in the agreement.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-muted">v{version}{dirty && <span className="text-amber-500"> · unsaved</span>}</span>
          <button
            onClick={save}
            disabled={!dirty}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand text-on-brand text-xs font-semibold hover:bg-brand-hover disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            Save changes
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-4">
        {/* Role list */}
        <div className="space-y-1">
          {items.map((r) => (
            <button
              key={r.id}
              onClick={() => setActiveId(r.id)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                activeId === r.id ? 'bg-brand-light text-brand-text-strong' : 'text-secondary hover:bg-surface-alt'
              }`}
            >
              <span className="text-xs font-semibold truncate">{r.name}</span>
              {items.length > 1 && (
                <span
                  onClick={(e) => { e.stopPropagation(); deleteRole(r.id); }}
                  className="opacity-0 group-hover:opacity-100 text-muted/40 hover:text-red-500"
                  role="button"
                >
                  <Trash2 size={11} />
                </span>
              )}
            </button>
          ))}
          <button
            onClick={addRole}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-border-subtle text-xs font-semibold text-muted hover:text-primary hover:bg-surface-alt cursor-pointer"
          >
            <Plus size={12} /> Add role
          </button>
          <button
            onClick={resetToDefaults}
            className="w-full mt-3 px-3 py-1.5 text-[10px] text-muted hover:text-primary cursor-pointer"
          >
            Reset to defaults
          </button>
        </div>

        {/* Editor */}
        {active && (
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Role name</label>
              <input
                type="text"
                value={active.name}
                onChange={(e) => updateRole(active.id, { name: e.target.value })}
                className="w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm font-semibold text-primary outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Responsibilities</label>
              <Suspense fallback={<div className="text-muted text-xs py-4">Loading editor…</div>}>
                <RichTextEditor
                  content={active.body || ''}
                  onChange={(html) => updateRole(active.id, { body: html })}
                />
              </Suspense>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Legacy export for Profile.jsx ─── */
export function SettingsContent() { return null; }

/* ─── Main Settings Page ─── */

export default function Settings() {
  const { ownerMode, signOut } = useAuth();
  const [searchParams] = useSearchParams();
  const visibleNav = SETTINGS_NAV.filter(i => ownerMode || !i.ownerOnly);
  const [activeSection, setActiveSection] = useState(() => {
    if (searchParams.get('jobber')) return 'connections';
    return ownerMode ? 'business' : 'account';
  });

  return (
    <div className="space-y-4">
      {/* Mobile tab bar */}
      <div className="sm:hidden flex gap-1 bg-surface-alt p-1 rounded-xl overflow-x-auto">
        {visibleNav.map((item) => (
          <button key={item.id} onClick={() => setActiveSection(item.id)}
            className={`flex-1 min-w-max py-2.5 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              activeSection === item.id ? 'bg-card text-primary shadow-sm' : 'text-muted'
            }`}>
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex gap-6">
        {/* Left sidebar — desktop */}
        <div className="w-48 shrink-0 hidden sm:block">
          <h2 className="text-lg font-bold text-primary mb-4">Settings</h2>
          <nav className="space-y-1">
            {visibleNav.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.id;
              return (
                <button key={item.id} onClick={() => setActiveSection(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    active ? 'bg-brand-light text-brand-text-strong' : 'text-secondary hover:bg-surface-alt hover:text-primary'
                  }`}>
                  <Icon size={16} className="shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
        {activeSection === 'business' && ownerMode && <BusinessProfileSection />}
        {activeSection === 'connections' && ownerMode && <ConnectionsSection />}
        {activeSection === 'checklists' && ownerMode && <ChecklistsSection />}

        {activeSection === 'team' && ownerMode && (
          <Suspense fallback={<div className="text-center py-8 text-muted text-sm">Loading...</div>}>
            <TeamManagement />
          </Suspense>
        )}

        {activeSection === 'account' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-bold text-primary">Account</h3>
              <p className="text-sm text-muted mt-1">Sign out of your account on this device.</p>
            </div>
            <button
              onClick={() => signOut()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors cursor-pointer"
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        )}

        </div>
      </div>
    </div>
  );
}
