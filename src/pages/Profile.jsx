import { useState, useEffect } from 'react';
import {
  LogOut, Shield, ArrowRight, ChevronDown, Trash2, Gauge, Link2, Check,
  ClipboardList, ClipboardCheck, UserCog, KeyRound, Eye, EyeOff,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../store/AppStoreContext';
import { SettingsContent } from './Settings';


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

function ChangePasswordSection({ userId }) {
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState(''); // 'success' or 'error'

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg('');

    if (!currentPw || !newPw || !confirmPw) {
      setMsg('All fields are required.');
      setMsgType('error');
      return;
    }
    if (newPw.length < 6) {
      setMsg('New password must be at least 6 characters.');
      setMsgType('error');
      return;
    }
    if (newPw !== confirmPw) {
      setMsg('New passwords do not match.');
      setMsgType('error');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/team-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'changePassword',
          userId,
          newPassword: newPw,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setMsg(data.error);
        setMsgType('error');
      } else {
        setMsg('Password changed successfully!');
        setMsgType('success');
        setCurrentPw('');
        setNewPw('');
        setConfirmPw('');
      }
    } catch {
      setMsg('Network error. Please try again.');
      setMsgType('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-5">
      <div className="flex items-center gap-2 mb-4">
        <KeyRound size={18} className="text-brand-text-strong" />
        <h3 className="text-sm font-bold text-primary">Change Password</h3>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-secondary mb-1">Current Password</label>
          <input
            type="password"
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
            placeholder="Enter current password"
            className="w-full rounded-xl border border-border-default px-4 py-2.5 text-sm text-primary placeholder-placeholder-muted focus:ring-2 focus:ring-ring-brand focus:border-border-brand outline-none transition"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-secondary mb-1">New Password</label>
          <div className="relative">
            <input
              type={showNew ? 'text' : 'password'}
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="Min 6 characters"
              className="w-full rounded-xl border border-border-default px-4 py-2.5 pr-10 text-sm text-primary placeholder-placeholder-muted focus:ring-2 focus:ring-ring-brand focus:border-border-brand outline-none transition"
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-secondary"
            >
              {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-secondary mb-1">Confirm New Password</label>
          <input
            type="password"
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            placeholder="Re-enter new password"
            className="w-full rounded-xl border border-border-default px-4 py-2.5 text-sm text-primary placeholder-placeholder-muted focus:ring-2 focus:ring-ring-brand focus:border-border-brand outline-none transition"
          />
        </div>
        {msg && (
          <p className={`text-xs rounded-lg px-3 py-2 ${
            msgType === 'success' ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50'
          }`}>
            {msg}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-xl bg-brand text-on-brand font-semibold hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {loading ? 'Changing...' : 'Change Password'}
        </button>
      </form>
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

      {/* ── Change Password ── */}
      {user?.id && <ChangePasswordSection userId={user.id} />}

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
