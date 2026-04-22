import { useState, useEffect, lazy, Suspense } from 'react';
import {
  LogOut, Shield, ArrowRight, ChevronDown, Trash2, Gauge, Link2, Check,
  ClipboardList, ClipboardCheck, UserCog, KeyRound, Eye, EyeOff,
  FileText, AlertTriangle, AlertCircle, ChevronRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../store/AppStoreContext';
import { SettingsContent } from './Settings';
import { DEFAULT_AGREEMENT_VERSION, AGREEMENT_SECTIONS as DEFAULT_SECTIONS, FINAL_AGREEMENT_TEXT as DEFAULT_FINAL_TEXT, getCurrentAgreementVersion } from '../data/employmentAgreement';

const AgreementSigningFlow = lazy(() => import('../components/AgreementSigningFlow'));


const PLAYBOOK_OPTIONS = [
  { key: 'service', label: 'Field Team', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
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
              href="/api/qb-data?action=auth"
              target="_self"
              rel="external"
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

function ProfileHeader({ name, userEmail, activeStrikes }) {
  const permissions = useAppStore((s) => s.permissions) || {};
  const rolesData = useAppStore((s) => s.roles);
  const allRoles = (rolesData && rolesData.items) ? rolesData.items : [];
  const myRoleId = permissions[userEmail]?.roleId || null;
  const myRole = allRoles.find((r) => r.id === myRoleId) || null;

  const strikeColor = activeStrikes >= 3 ? 'bg-red-500/15 text-red-500'
    : activeStrikes === 2 ? 'bg-orange-500/15 text-orange-500'
    : activeStrikes === 1 ? 'bg-amber-500/15 text-amber-500'
    : 'bg-emerald-500/15 text-emerald-500';

  return (
    <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-6 text-center">
      <div className="w-20 h-20 mx-auto rounded-full bg-brand-light flex items-center justify-center text-brand-text-strong text-2xl font-bold mb-3">
        {getInitials(name)}
      </div>
      <h1 className="text-xl font-bold text-primary">{name}</h1>
      {myRole ? (
        <p className="text-xs text-muted mt-0.5">{myRole.name}</p>
      ) : (
        <p className="text-xs text-amber-500 mt-0.5">No role assigned</p>
      )}

      {/* Strike count chip */}
      <div className="flex items-center justify-center gap-2 mt-4">
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold ${strikeColor}`}>
          <AlertCircle size={11} />
          {activeStrikes === 0 ? 'No active strikes' : `${activeStrikes} active strike${activeStrikes > 1 ? 's' : ''}`}
        </span>
      </div>
    </div>
  );
}

function RoleCard({ userEmail }) {
  const permissions = useAppStore((s) => s.permissions) || {};
  const rolesData = useAppStore((s) => s.roles);
  const allRoles = (rolesData && rolesData.items) ? rolesData.items : [];
  const myRoleId = permissions[userEmail]?.roleId || null;
  const myRole = allRoles.find((r) => r.id === myRoleId) || null;

  if (!myRole) return null;

  return (
    <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-5">
      <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-3">Your Role · {myRole.name}</p>
      <div className="text-sm text-secondary leading-relaxed agreement-content" dangerouslySetInnerHTML={{ __html: myRole.body }} />
    </div>
  );
}

function StrikeDetails({ strikes }) {
  const [open, setOpen] = useState(false);
  if (strikes.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border-subtle text-secondary hover:bg-surface-alt hover:text-primary transition-colors cursor-pointer"
      >
        <AlertCircle size={18} className="text-muted" />
        <div className="flex-1 text-left">
          <p className="text-sm font-semibold">Strike History</p>
          <p className="text-[11px] text-muted">{strikes.length} total · tap to view</p>
        </div>
        <ChevronRight size={16} className={`text-muted transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {strikes.slice().reverse().map((strike) => {
            const issued = new Date(strike.issuedAt);
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const isActive = issued >= thirtyDaysAgo;
            return (
              <div key={strike.id} className={`p-3 rounded-xl border ${isActive ? 'border-red-500/30 bg-red-500/5' : 'border-border-subtle bg-surface-alt/30 opacity-70'}`}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-primary">{strike.reason}</p>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${isActive ? 'bg-red-500/20 text-red-500' : 'bg-gray-500/20 text-gray-400'}`}>
                    {isActive ? 'Active' : 'Expired'}
                  </span>
                </div>
                {strike.notes && <p className="text-[11px] text-muted mt-1">{strike.notes}</p>}
                <p className="text-[10px] text-muted mt-1">
                  {issued.toLocaleDateString()} — by {strike.issuedBy || 'Management'}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChangePasswordSection({ userId }) {
  const [open, setOpen] = useState(false);
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

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border-subtle text-secondary hover:bg-surface-alt hover:text-primary transition-colors cursor-pointer"
      >
        <KeyRound size={18} className="text-muted" />
        <div className="flex-1 text-left">
          <p className="text-sm font-semibold">Change Password</p>
          <p className="text-[11px] text-muted">Update your account password</p>
        </div>
        <ChevronRight size={16} className="text-muted" />
      </button>
    );
  }

  return (
    <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <KeyRound size={18} className="text-brand-text-strong" />
          <h3 className="text-sm font-bold text-primary">Change Password</h3>
        </div>
        <button onClick={() => setOpen(false)} className="text-xs text-muted hover:text-primary cursor-pointer">Cancel</button>
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
  const signedAgreements = useAppStore((s) => s.signedAgreements) || [];
  const setSignedAgreements = useAppStore((s) => s.setSignedAgreements);
  const strikes = useAppStore((s) => s.strikes) || [];
  const storeAgreementConfig = useAppStore((s) => s.agreementConfig);
  const AGREEMENT_VERSION = getCurrentAgreementVersion(storeAgreementConfig);

  const handleSignOut = async () => { await signOut(); };
  const [previewTeamView, setPreviewTeamView] = useState(false);
  const [previewEmail, setPreviewEmail] = useState('');
  const [showSigning, setShowSigning] = useState(false);
  const [viewingAgreement, setViewingAgreement] = useState(null);

  // Get team member list for the dropdown
  const allPermissions = useAppStore((s) => s.permissions) || {};
  const teamMembers = Object.entries(allPermissions).filter(([email]) => email !== user?.email?.toLowerCase());

  /* ── Owner view ── */
  if (ownerMode && !previewTeamView) {
    return (
      <div className="space-y-6 max-w-lg">
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

      </div>
    );
  }

  // If owner is previewing a team member, override the email/name
  const isPreview = ownerMode && previewTeamView;

  /* ── Team member view ── */

  const userEmail = isPreview ? previewEmail : user?.email?.toLowerCase();
  const previewName = isPreview ? (allPermissions[previewEmail]?.name || previewEmail) : null;
  const myPlaybooks = permissions[userEmail]?.playbooks || [];
  const myRole = permissions[userEmail]?.role;

  const myAgreements = signedAgreements.filter((a) => a.memberEmail === userEmail);
  const latestAgreement = myAgreements.length > 0 ? myAgreements[myAgreements.length - 1] : null;
  const needsNewVersion = !latestAgreement || latestAgreement.version !== AGREEMENT_VERSION;

  const myStrikes = strikes.filter((s) => s.memberEmail === userEmail);
  const activeStrikes = myStrikes.filter((s) => {
    const issued = new Date(s.issuedAt);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return issued >= thirtyDaysAgo;
  });

  const handleSignComplete = (signedData) => {
    setSignedAgreements([...signedAgreements, signedData]);
    setShowSigning(false);
  };

  return (
    <div className="space-y-4 max-w-lg">
      {/* ── Preview Banner ── */}
      {isPreview && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-purple-500/10 border border-purple-500/30">
          <div className="flex items-center gap-2">
            <Eye size={14} className="text-purple-400" />
            <span className="text-xs font-bold text-purple-400">Previewing as {previewName}</span>
          </div>
          <button onClick={() => setPreviewTeamView(false)} className="text-xs font-bold text-purple-400 hover:text-purple-300 cursor-pointer">
            Back to Owner
          </button>
        </div>
      )}

      {/* ── Header (avatar, name, role, strike chip) ── */}
      <ProfileHeader
        name={isPreview ? previewName : (currentUser || 'Team Member')}
        userEmail={userEmail}
        activeStrikes={activeStrikes.length}
      />

      {/* ── Action list ── */}
      {!isPreview && (
        <div className="space-y-2">
          <StrikeDetails strikes={myStrikes} />
          {user?.id && <ChangePasswordSection userId={user.id} />}
          <button
            onClick={() => navigate('/agreement')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border-subtle text-secondary hover:bg-surface-alt hover:text-primary transition-colors cursor-pointer"
          >
            <FileText size={18} className="text-muted" />
            <div className="flex-1 text-left">
              <p className="text-sm font-semibold">Team Agreement</p>
              <p className="text-[11px] text-muted">View what you signed</p>
            </div>
            <ChevronRight size={16} className="text-muted" />
          </button>
        </div>
      )}

      {/* ── Agreement Signing Modal ── */}
      {showSigning && (
        <Suspense fallback={null}>
          <AgreementSigningFlow
            onClose={() => setShowSigning(false)}
            onComplete={handleSignComplete}
            memberName={currentUser || ''}
            memberEmail={userEmail}
          />
        </Suspense>
      )}

      {/* ── View Signed Agreement Modal ── */}
      {viewingAgreement && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center overflow-y-auto p-4">
          <div className="bg-surface rounded-2xl border border-border-subtle max-w-lg w-full my-8 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-black text-primary">SIGNED AGREEMENT</h2>
              <button onClick={() => setViewingAgreement(null)} className="p-1.5 rounded-lg hover:bg-surface-alt cursor-pointer">
                <span className="text-muted text-sm">Close</span>
              </button>
            </div>
            <div className="space-y-2 text-xs">
              <p><span className="text-muted font-bold">Name:</span> <span className="text-primary">{viewingAgreement.memberName}</span></p>
              <p><span className="text-muted font-bold">Phone:</span> <span className="text-primary">{viewingAgreement.phone}</span></p>
              <p><span className="text-muted font-bold">Start Date:</span> <span className="text-primary">{viewingAgreement.startDate}</span></p>
              <p><span className="text-muted font-bold">Version:</span> <span className="text-primary">v{viewingAgreement.version}</span></p>
              <p><span className="text-muted font-bold">Signed:</span> <span className="text-primary">{new Date(viewingAgreement.signedAt).toLocaleString()}</span></p>
            </div>
            {viewingAgreement.signatureDataUrl && (
              <div>
                <p className="text-[10px] font-bold text-muted uppercase mb-1">Signature</p>
                <img src={viewingAgreement.signatureDataUrl} alt="Signature" className="rounded-lg border border-border-subtle w-full" style={{ maxHeight: 120 }} />
              </div>
            )}
            <p className="text-[10px] text-muted">Printed Name: {viewingAgreement.printedName}</p>
          </div>
        </div>
      )}
    </div>
  );
}
