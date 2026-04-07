import { useState, useEffect, lazy, Suspense } from 'react';
import { ClipboardCheck, Wrench, X, ChevronRight, Users, Link2, Check, Plug, Shield, Plus, Trash2 } from 'lucide-react';
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

const SETTINGS_NAV = [
  { id: 'connections', label: 'Connections', icon: Plug },
  { id: 'checklists', label: 'Checklists', icon: ClipboardCheck },
  { id: 'agreement', label: 'Team Agreement', icon: ClipboardCheck },
  { id: 'team', label: 'Team', icon: Users },
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
  const [searchParams, setSearchParams] = useSearchParams();

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

    fetch('/api/jobber-data?action=status')
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ connected: false }))
      .finally(() => setLoading(false));
  }, []);

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
              <span className="px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-xs font-semibold">
                Active
              </span>
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
              href="/api/qb-auth"
              onClick={(e) => { e.preventDefault(); window.location.href = '/api/qb-auth'; }}
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
  const { ownerMode } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeSection, setActiveSection] = useState(() => {
    // Auto-open connections if redirected from Jobber OAuth
    if (searchParams.get('jobber')) return 'connections';
    return 'connections';
  });

  if (!ownerMode) { navigate('/'); return null; }

  return (
    <div className="space-y-4">
      {/* Mobile tab bar */}
      <div className="sm:hidden flex gap-1 bg-surface-alt p-1 rounded-xl">
        {SETTINGS_NAV.map((item) => (
          <button key={item.id} onClick={() => setActiveSection(item.id)}
            className={`flex-1 py-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
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
            {SETTINGS_NAV.map((item) => {
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
        {activeSection === 'connections' && <ConnectionsSection />}
        {activeSection === 'checklists' && <ChecklistsSection />}

        {activeSection === 'agreement' && (
          <Suspense fallback={<div className="text-center py-8 text-muted text-sm">Loading...</div>}>
            <TeamAgreement />
          </Suspense>
        )}

        {activeSection === 'team' && (
          <Suspense fallback={<div className="text-center py-8 text-muted text-sm">Loading...</div>}>
            <TeamManagement />
          </Suspense>
        )}

        </div>
      </div>
    </div>
  );
}
