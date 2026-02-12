import { useState } from 'react';
import { useEffect } from 'react';
import {
  LogOut, Shield, Lightbulb, ArrowRight, ChevronDown, Trash2, Gauge, Link2, Check,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../store/AppStoreContext';
import { SettingsContent } from './Settings';


const STATUS_STYLES = {
  'New':         'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'Reviewing':   'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'Approved':    'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  'Implemented': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'Rejected':    'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

const STATUS_OPTIONS = ['New', 'Reviewing', 'Approved', 'Implemented', 'Rejected'];

const PLAYBOOK_OPTIONS = [
  { key: 'service', label: 'Team Member', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  { key: 'leader', label: 'Leader', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  { key: 'sales', label: 'Sales Team', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  { key: 'strategy', label: 'General Manager', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
];

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function OwnerIdeasPanel() {
  const suggestions = useAppStore((s) => s.suggestions);
  const setSuggestions = useAppStore((s) => s.setSuggestions);
  const [open, setOpen] = useState(true);
  const [statusFilter, setStatusFilter] = useState('All');

  const ideas = suggestions.filter((s) => s.type !== 'onboarding');
  const filtered = statusFilter === 'All' ? ideas : ideas.filter((s) => s.status === statusFilter);

  const counts = {};
  ideas.forEach((s) => { counts[s.status] = (counts[s.status] || 0) + 1; });

  const handleStatusChange = (id, newStatus) => {
    setSuggestions(suggestions.map((s) => (s.id === id ? { ...s, status: newStatus } : s)));
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const handleDelete = (id) => {
    setSuggestions(suggestions.filter((s) => s.id !== id));
    setConfirmDeleteId(null);
  };

  return (
    <div className="bg-card rounded-2xl shadow-sm border border-border-subtle">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-5 cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Lightbulb size={20} className="text-amber-500" />
          <h2 className="text-lg font-bold text-primary">All Ideas</h2>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            {ideas.length}
          </span>
        </div>
        <ChevronDown size={20} className={`text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4">
          {/* Status filter pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setStatusFilter('All')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === 'All' ? 'bg-surface-alt text-primary shadow-sm' : 'text-tertiary hover:text-secondary'
              }`}
            >
              All ({ideas.length})
            </button>
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  statusFilter === s ? `${STATUS_STYLES[s]} shadow-sm` : 'text-tertiary hover:text-secondary'
                }`}
              >
                {s} ({counts[s] || 0})
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-muted py-2">No ideas with this status.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((idea) => (
                <div key={idea.id} className="rounded-xl border border-border-subtle bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-bold text-primary">{idea.title}</h3>
                      <p className="text-xs text-tertiary mt-1 line-clamp-2">{idea.description}</p>
                      <p className="text-xs text-muted mt-1.5">By {idea.submittedBy} &middot; {idea.date}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <select
                        value={idea.status}
                        onChange={(e) => handleStatusChange(idea.id, e.target.value)}
                        className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border-none outline-none cursor-pointer ${STATUS_STYLES[idea.status] || 'bg-surface-alt text-secondary'}`}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => setConfirmDeleteId(idea.id)}
                        className="p-1.5 rounded-lg text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors cursor-pointer"
                        title="Delete idea"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmDeleteId(null)}>
          <div className="bg-card rounded-2xl shadow-2xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-primary mb-2">Delete Idea?</h3>
            <p className="text-sm text-secondary mb-5">This will permanently remove this idea. This action cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 rounded-lg border border-border-strong text-secondary text-sm font-medium hover:bg-surface transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function QBConnectionPanel() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    // Check URL for QB callback result
    const params = new URLSearchParams(window.location.search);
    if (params.get('qb') === 'error') {
      setErrorMsg(params.get('msg') || 'Connection failed');
    }

    fetch('/api/qb-status')
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
            <h3 className="text-sm font-bold text-primary">QuickBooks Integration</h3>
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
              target="_self"
              rel="external"
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

export default function Profile() {
  const navigate = useNavigate();
  const { currentUser, user, ownerMode, signOut } = useAuth();
  const permissions = useAppStore((s) => s.permissions);

  const handleSignOut = async () => { await signOut(); };

  /* ── Owner view ── */
  if (ownerMode) {
    return (
      <div className="space-y-8">
        <div className="bg-card rounded-2xl shadow-lg border border-border-subtle p-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-brand-light flex items-center justify-center text-brand-text-strong text-xl font-bold shrink-0">
              {getInitials(currentUser)}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-primary">{currentUser || 'Owner'}</h1>
              <span className="inline-flex items-center gap-1.5 mt-1 px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                <Shield size={12} /> Owner
              </span>
            </div>
          </div>
        </div>
        <OwnerIdeasPanel />

        {/* Mileage Log link */}
        <button
          onClick={() => navigate('/mileage')}
          className="w-full bg-card rounded-2xl shadow-sm border border-border-subtle p-4 flex items-center gap-3 cursor-pointer hover:shadow-md hover:border-border-strong transition-all"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
            <Gauge size={18} className="text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-primary">Mileage Log</p>
            <p className="text-xs text-tertiary">View entries, manage vehicles</p>
          </div>
          <ArrowRight size={16} className="text-muted shrink-0" />
        </button>

        <QBConnectionPanel />
        <SettingsContent />
        <button
          onClick={handleSignOut}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors cursor-pointer"
        >
          <LogOut size={18} /> Sign Out
        </button>
      </div>
    );
  }

  /* ── Team member view ── */

  const userEmail = user?.email?.toLowerCase();
  const myPlaybooks = permissions[userEmail]?.playbooks || [];
  const myRole = permissions[userEmail]?.role;

  return (
    <div className="space-y-6">
      {/* ── Profile Header ── */}
      <div className="bg-card rounded-2xl shadow-lg border border-border-subtle p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-brand-light flex items-center justify-center text-brand-text-strong text-xl font-bold shrink-0">
            {getInitials(currentUser)}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-primary">{currentUser || 'Team Member'}</h1>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {myRole && (
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                  {myRole}
                </span>
              )}
              {myPlaybooks.map((key) => {
                const opt = PLAYBOOK_OPTIONS.find((o) => o.key === key);
                return opt ? (
                  <span key={key} className={`px-2.5 py-1 rounded-full text-xs font-medium ${opt.color}`}>
                    {opt.label}
                  </span>
                ) : null;
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Ideas & Feedback link ── */}
      <button
        onClick={() => navigate('/ideas')}
        className="w-full bg-card rounded-2xl shadow-sm border border-border-subtle p-4 flex items-center gap-3 cursor-pointer hover:shadow-md hover:border-border-strong transition-all"
      >
        <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
          <Lightbulb size={18} className="text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-primary">Ideas & Feedback</p>
          <p className="text-xs text-tertiary">Submit ideas or view your submissions</p>
        </div>
        <ArrowRight size={16} className="text-muted shrink-0" />
      </button>

      {/* ── Mileage Log link ── */}
      <button
        onClick={() => navigate('/mileage')}
        className="w-full bg-card rounded-2xl shadow-sm border border-border-subtle p-4 flex items-center gap-3 cursor-pointer hover:shadow-md hover:border-border-strong transition-all"
      >
        <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
          <Gauge size={18} className="text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-primary">Mileage Log</p>
          <p className="text-xs text-tertiary">View and log your mileage entries</p>
        </div>
        <ArrowRight size={16} className="text-muted shrink-0" />
      </button>

      {/* ── Settings / Preferences ── */}
      <SettingsContent />

      {/* ── Sign Out ── */}
      <button
        onClick={handleSignOut}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors cursor-pointer"
      >
        <LogOut size={18} /> Sign Out
      </button>
    </div>
  );
}
