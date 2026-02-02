import { LogOut, Shield, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { IdeasFeedbackContent } from './IdeasFeedback';
import { SettingsContent } from './Settings';

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Profile() {
  const { currentUser, ownerMode, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="space-y-8">
      {/* User Info Header */}
      <div className="bg-card rounded-2xl shadow-lg border border-border-subtle p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-brand-light flex items-center justify-center text-brand-text-strong text-xl font-bold shrink-0">
            {getInitials(currentUser)}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-primary">{currentUser || 'Team Member'}</h1>
            <span className={`inline-flex items-center gap-1.5 mt-1 px-3 py-1 rounded-full text-xs font-semibold ${
              ownerMode
                ? 'bg-purple-100 text-purple-700'
                : 'bg-emerald-100 text-emerald-700'
            }`}>
              {ownerMode ? <Shield size={12} /> : <User size={12} />}
              {ownerMode ? 'Owner' : 'Team Member'}
            </span>
          </div>
        </div>
      </div>

      {/* My Ideas & Feedback (team members only) */}
      {!ownerMode && <IdeasFeedbackContent filterByUser={currentUser} compact />}

      {/* Settings */}
      <SettingsContent />

      {/* Logout */}
      <button
        onClick={handleSignOut}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors cursor-pointer"
      >
        <LogOut size={18} />
        Sign Out
      </button>
    </div>
  );
}
