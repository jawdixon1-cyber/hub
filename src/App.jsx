import { useState, useEffect, useCallback, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import {
  Home as HomeIcon,
  BookOpen,
  Users,
  Swords,
  LogOut,
  RefreshCw,
  Lock,
  Unlock,
  Wrench,
} from 'lucide-react';

import { supabase } from './lib/supabase';
import { useAuth } from './contexts/AuthContext';
import { AppStoreProvider, useAppStore } from './store/AppStoreContext';
import LoginForm from './components/LoginForm';
import Home from './pages/Home';
import HowToGuides from './pages/HowToGuides';
import EquipmentIdeas from './pages/EquipmentIdeas';
import HRPolicies from './pages/HRPolicies';
import Profile from './pages/Profile';
import Training from './pages/Training';
import TrainingModule from './pages/TrainingModule';
import OnboardingStep from './pages/OnboardingStep';
import OnboardingHub from './pages/OnboardingHub';
import OwnerDashboard from './pages/OwnerDashboard';
import TeamManagement from './pages/TeamManagement';
import TeamMemberDetail from './pages/TeamMemberDetail';
import QuestBoard from './pages/QuestBoard';
import IdeasFeedback from './pages/IdeasFeedback';
import { isOnboardingComplete, isOnboardingEffectivelyComplete } from './pages/Training';


const TABS = [
  { id: 'home', path: '/', label: 'Home', icon: HomeIcon },
  { id: 'guides', path: '/guides', label: 'Playbooks', icon: BookOpen },
  { id: 'equipment', path: '/equipment', label: 'Equipment', icon: Wrench },
  { id: 'hr', path: '/hr', label: 'HR', icon: Users },
  // { id: 'quests', path: '/quests', label: 'Quests', icon: Swords },  // v2 — uncomment to enable
];

/* ─── App (outer) — auth gate + data loading ─── */

const DATA_CACHE_KEY = 'greenteam-data-cache';

function App() {
  const { session, user, ownerMode, loading: authLoading, signOut } = useAuth();
  const [cloudData, setCloudData] = useState(() => {
    try {
      const cached = localStorage.getItem(DATA_CACHE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [dataError, setDataError] = useState(null);

  const loadData = useCallback(async () => {
    setDataError(null);
    try {
      const { data, error } = await supabase
        .from('app_state')
        .select('key, value');
      if (error) throw error;
      const map = {};
      if (data) {
        data.forEach((row) => { map[row.key] = row.value; });
      }
      setCloudData(map);
      try { localStorage.setItem(DATA_CACHE_KEY, JSON.stringify(map)); } catch {}
    } catch (err) {
      setCloudData((prev) => {
        if (!prev) setDataError(err.message || 'Failed to load data');
        return prev;
      });
    }
  }, []);

  useEffect(() => {
    if (session) loadData();
    else {
      setCloudData(null);
      try { localStorage.removeItem(DATA_CACHE_KEY); } catch {}
    }
  }, [session, loadData]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-brand-light border-t-brand rounded-full animate-spin" />
          <p className="text-tertiary text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <LoginForm />;
  }

  if (dataError && !cloudData) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <div className="bg-card rounded-2xl shadow-lg border border-border-subtle p-8 max-w-sm w-full text-center">
          <h2 className="text-xl font-bold text-primary mb-2">Connection Error</h2>
          <p className="text-tertiary text-sm mb-6">{dataError}</p>
          <button
            onClick={loadData}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand text-on-brand font-semibold hover:bg-brand-hover transition-colors cursor-pointer"
          >
            <RefreshCw size={16} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!cloudData) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-brand-light border-t-brand rounded-full animate-spin" />
          <p className="text-tertiary text-sm">Loading data...</p>
        </div>
      </div>
    );
  }

  // Access gate: non-owner users must be in the permissions map
  const permissions = cloudData['greenteam-permissions'] || {};
  const userEmail = user?.email?.toLowerCase();
  if (!ownerMode && userEmail && !permissions[userEmail]) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <div className="bg-card rounded-2xl shadow-lg border border-border-subtle p-8 max-w-sm w-full text-center">
          <h2 className="text-xl font-bold text-primary mb-2">Access Denied</h2>
          <p className="text-tertiary text-sm mb-6">
            Your account does not have access to this app. Contact the team owner for permissions.
          </p>
          <button
            onClick={signOut}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand text-on-brand font-semibold hover:bg-brand-hover transition-colors cursor-pointer"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <AppStoreProvider cloudData={cloudData}>
      <AppShell />
    </AppStoreProvider>
  );
}

/* ─── AppShell (inner) — the main app ─── */

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function AppShell() {
  const { user, currentUser, ownerMode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const permissions = useAppStore((s) => s.permissions);
  const suggestions = useAppStore((s) => s.suggestions);
  const trainingConfig = useAppStore((s) => s.trainingConfig);
  const userEmail = user?.email?.toLowerCase();
  const allowedPlaybooks = ownerMode
    ? ['service', 'sales', 'strategy']
    : (permissions[userEmail]?.playbooks || ['service']);

  const needsOnboarding = !ownerMode && !isOnboardingEffectivelyComplete(suggestions, currentUser, userEmail, trainingConfig, permissions);

  // Unlock animation: detect when onboarding transitions from incomplete → complete (once only)
  const [showUnlockAnimation, setShowUnlockAnimation] = useState(false);
  const [unlockPhase, setUnlockPhase] = useState('idle');
  const prevNeedsOnboarding = useRef(needsOnboarding);
  const hasPlayedUnlock = useRef(false);

  useEffect(() => {
    if (!hasPlayedUnlock.current && prevNeedsOnboarding.current === true && needsOnboarding === false && !ownerMode) {
      hasPlayedUnlock.current = true;
      prevNeedsOnboarding.current = false;
      setShowUnlockAnimation(true);
      setUnlockPhase('animating');
      const fadeTimer = setTimeout(() => setUnlockPhase('fading'), 2800);
      const removeTimer = setTimeout(() => {
        setShowUnlockAnimation(false);
        setUnlockPhase('idle');
        navigate('/');
      }, 3400);
      return () => { clearTimeout(fadeTimer); clearTimeout(removeTimer); };
    }
    prevNeedsOnboarding.current = needsOnboarding;
  }, [needsOnboarding, ownerMode, navigate]);

  const visibleTabs = TABS;

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const isProfileActive = location.pathname === '/profile';

  return (
    <div className="min-h-screen bg-surface">
      {/* Top Nav */}
      <nav className="bg-card border-b border-border-default sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="Hey Jude's Lawn Care" className="h-10" />
            </div>

            {/* Desktop Tabs */}
            <div className="hidden md:flex items-center gap-1">
              {visibleTabs.map((t) => {
                const Icon = needsOnboarding ? Lock : t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => !needsOnboarding && navigate(t.path)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      needsOnboarding
                        ? 'opacity-50 cursor-not-allowed text-muted'
                        : isActive(t.path)
                          ? 'bg-brand-light text-brand-text-strong'
                          : 'text-tertiary hover:text-secondary hover:bg-surface'
                    }`}
                  >
                    <Icon size={18} />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* Profile Avatar */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-tertiary hidden sm:inline">{currentUser}</span>
              <button
                onClick={() => !needsOnboarding && navigate('/profile')}
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                  needsOnboarding
                    ? 'opacity-50 cursor-not-allowed bg-brand-light text-brand-text-strong'
                    : isProfileActive
                      ? 'bg-brand text-on-brand ring-2 ring-brand ring-offset-2 ring-offset-card'
                      : 'bg-brand-light text-brand-text-strong hover:bg-brand hover:text-on-brand'
                }`}
                title={needsOnboarding ? 'Complete onboarding first' : 'Profile'}
              >
                {needsOnboarding ? <Lock size={14} /> : getInitials(currentUser)}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Tabs */}
        <div className="md:hidden flex border-t border-border-subtle overflow-x-auto">
          {visibleTabs.map((t) => {
            const Icon = needsOnboarding ? Lock : t.icon;
            return (
              <button
                key={t.id}
                onClick={() => !needsOnboarding && navigate(t.path)}
                className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors min-w-[64px] ${
                  needsOnboarding
                    ? 'opacity-50 cursor-not-allowed text-muted'
                    : isActive(t.path)
                      ? 'text-brand-text-strong border-b-2 border-border-brand'
                      : 'text-muted'
                }`}
              >
                <Icon size={18} />
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {needsOnboarding ? (
          <Routes>
            <Route path="/training/onboard/:stepId" element={<OnboardingStep />} />
            <Route path="*" element={<OnboardingHub />} />
          </Routes>
        ) : (
          <Routes>
            <Route path="/" element={ownerMode ? <OwnerDashboard /> : <Home />} />
            <Route path="/guides" element={<HowToGuides ownerMode={ownerMode} allowedPlaybooks={allowedPlaybooks} />} />
            <Route path="/equipment" element={<EquipmentIdeas />} />
            <Route path="/hr" element={<HRPolicies />} />
            {/* <Route path="/quests" element={<QuestBoard />} /> */}
            {/* <Route path="/training" element={<Training />} /> */}
            {/* <Route path="/training/onboard/:stepId" element={<OnboardingStep />} /> */}
            {/* <Route path="/training/:moduleId" element={<TrainingModule />} /> */}
            <Route path="/team" element={<TeamManagement />} />
            <Route path="/team/:memberEmail" element={<TeamMemberDetail />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/ideas" element={<IdeasFeedback />} />
            <Route path="/settings" element={<Navigate to="/profile" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </main>

      {/* Unlock Animation Overlay */}
      {showUnlockAnimation && (
        <div
          className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-emerald-900/90 backdrop-blur-sm ${
            unlockPhase === 'fading' ? 'unlock-overlay-out' : 'unlock-overlay-in'
          }`}
        >
          {/* Expanding rings */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-24 h-24 rounded-full border-4 border-emerald-400/40 unlock-ring-1 opacity-0" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-24 h-24 rounded-full border-4 border-emerald-300/30 unlock-ring-2 opacity-0" />
          </div>

          {/* Particles */}
          {[...Array(8)].map((_, i) => {
            const angle = (i / 8) * 360;
            const rad = (angle * Math.PI) / 180;
            const tx = Math.cos(rad) * 120;
            const ty = Math.sin(rad) * 120;
            return (
              <div
                key={i}
                className="absolute w-2 h-2 rounded-full bg-emerald-400 opacity-0"
                style={{
                  animation: `unlock-particle 1s ${0.8 + i * 0.05}s ease-out forwards`,
                  left: '50%',
                  top: '50%',
                  marginLeft: '-4px',
                  marginTop: '-4px',
                  '--px': `${tx}px`,
                  '--py': `${ty}px`,
                }}
              />
            );
          })}

          {/* Lock icon — shakes then bursts into unlock */}
          <div className="relative">
            <div className="unlock-icon-shake">
              <div className="unlock-icon-burst">
                <Unlock size={64} className="text-emerald-400 drop-shadow-lg" strokeWidth={2.5} />
              </div>
            </div>
          </div>

          {/* Text */}
          <p className="unlock-text text-2xl font-bold text-white mt-8 tracking-wide">
            Welcome to the team!
          </p>
          <p className="unlock-text text-emerald-300/80 text-sm mt-2" style={{ animationDelay: '1.4s' }}>
            All features unlocked
          </p>
        </div>
      )}
    </div>
  );
}

export default App;
