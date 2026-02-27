import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import {
  Home as HomeIcon,
  BookOpen,
  Users,
  LogOut,
  RefreshCw,
  Lock,
  Unlock,
  Wrench,
  Calculator,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Receipt,
  Lightbulb,
  UserCog,
  ClipboardCheck,
  ClipboardList,
  CalendarCheck,
  LayoutGrid,
  ChevronDown,
} from 'lucide-react';

import { supabase } from './lib/supabase';
import { useAuth } from './contexts/AuthContext';
import { AppStoreProvider, useAppStore } from './store/AppStoreContext';
import LoginForm from './components/LoginForm';
import { isOnboardingComplete, isOnboardingEffectivelyComplete } from './utils/onboarding';

/* ─── Lazy-loaded pages (code-split per route) ─── */
const Home = lazy(() => import('./pages/Home'));
const HowToGuides = lazy(() => import('./pages/HowToGuides'));
const EquipmentIdeas = lazy(() => import('./pages/EquipmentIdeas'));
const HRPolicies = lazy(() => import('./pages/HRPolicies'));
const Profile = lazy(() => import('./pages/Profile'));
const OnboardingStep = lazy(() => import('./pages/OnboardingStep'));
const OnboardingHub = lazy(() => import('./pages/OnboardingHub'));
const OwnerDashboard = lazy(() => import('./pages/OwnerDashboard'));
const TeamManagement = lazy(() => import('./pages/TeamManagement'));
const TeamMemberDetail = lazy(() => import('./pages/TeamMemberDetail'));
const IdeasFeedback = lazy(() => import('./pages/IdeasFeedback'));
const MileageLog = lazy(() => import('./pages/MileageLog'));
const ChecklistTrackerPage = lazy(() => import('./pages/ChecklistTrackerPage'));
const Quoting = lazy(() => import('./pages/Quoting'));
const DailyChecklist = lazy(() => import('./pages/DailyChecklist'));
const ExecutionDashboard = lazy(() => import('./pages/ExecutionDashboard'));
const ReceiptTracker = lazy(() => import('./pages/ReceiptTracker'));
const PlaybookDetail = lazy(() => import('./pages/PlaybookDetail'));

const NAV_ITEMS = [
  { id: 'home', path: '/', label: 'Home', icon: HomeIcon },
  { id: 'guides', path: '/guides', label: 'Playbooks', icon: BookOpen },
  { id: 'quoting', path: '/quoting', label: 'Quoting', icon: Calculator, ownerOnly: true },
];

const TOOLS_ITEMS = [
  { id: 'equipment', path: '/equipment', label: 'Equipment', icon: Wrench },
  { id: 'mileage', path: '/mileage', label: 'Mileage', icon: Gauge },
  { id: 'receipts', path: '/receipts', label: 'Receipts', icon: Receipt },
];

const TEAM_ITEMS = [
  { id: 'ideas', path: '/ideas', label: 'Ideas', icon: Lightbulb },
  { id: 'hr', path: '/hr', label: 'HR', icon: Users },
];

const OWNER_ITEMS = [
  { id: 'manage', path: '/owner-dashboard', label: 'Manage', icon: ClipboardList },
  { id: 'checklist-tracker', path: '/checklist-tracker', label: 'Checklists', icon: ClipboardCheck },
  { id: 'team', path: '/team', label: 'Team', icon: UserCog },
];

const EXTERNAL_APPS = [
  { name: 'Jobber', url: 'https://getjobber.com', bg: 'bg-[#1a3a3a]', icon: 'J', logo: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://getjobber.com&size=128' },
  { name: 'GoHighLevel', url: 'https://app.gohighlevel.com', bg: 'bg-[#1a2332]', icon: 'G', logo: '/logos/ghl-icon.jpg' },
  { name: 'QuickBooks', url: 'https://quickbooks.intuit.com', bg: 'bg-[#2ca01c]', icon: 'QB', logo: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://quickbooks.intuit.com&size=128' },
  { name: 'ADP', url: 'https://my.adp.com', bg: 'bg-[#d0271d]', icon: 'ADP', logo: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://adp.com&size=128' },
  { name: 'Canva', url: 'https://www.canva.com', bg: 'bg-[#00c4cc]', icon: 'C', logo: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://canva.com&size=128' },
  { name: 'ChatGPT', url: 'https://chat.openai.com', bg: 'bg-[#10a37f]', icon: 'AI', logo: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://chat.openai.com&size=128' },
  { name: 'Gemini', url: 'https://gemini.google.com', bg: 'bg-white', icon: 'Ge', logo: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://gemini.google.com&size=128' },
  { name: 'Claude', url: 'https://claude.ai', bg: 'bg-[#d97757]', icon: 'Cl', logo: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://claude.ai&size=128' },
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
  const accessBypass = ['ethanm.brant@gmail.com'];
  if (!ownerMode && userEmail && !permissions[userEmail] && !accessBypass.includes(userEmail)) {
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

/* ─── AppShell (inner) — sidebar + main content ─── */

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

  // Sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') === 'true'; } catch { return false; }
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [appsExpanded, setAppsExpanded] = useState(false);

  const toggleSidebar = () => {
    setSidebarCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem('sidebar-collapsed', String(next)); } catch {}
      return next;
    });
  };

  // Unlock animation
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

  // Close mobile sidebar on navigation
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const handleNav = (path) => {
    if (!needsOnboarding) navigate(path);
  };

  const isProfileActive = location.pathname === '/profile';

  // Sidebar nav renderer (shared between desktop & mobile)
  const renderSidebarNav = (collapsed) => (
    <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
      {NAV_ITEMS.filter((item) => !item.ownerOnly || ownerMode).map((item) => {
        const Icon = needsOnboarding ? Lock : item.icon;
        const active = isActive(item.path);
        return (
          <button
            key={item.id}
            onClick={() => handleNav(item.path)}
            title={collapsed ? item.label : undefined}
            className={`w-full flex items-center gap-3 ${collapsed ? 'justify-center px-2' : 'px-3'} py-2.5 rounded-xl text-sm font-medium transition-colors ${
              needsOnboarding
                ? 'opacity-40 cursor-not-allowed text-muted'
                : active
                  ? 'bg-brand-light text-brand-text-strong'
                  : 'text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer'
            }`}
          >
            <Icon size={20} className="shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </button>
        );
      })}

      <div className="h-px bg-border-subtle my-3 mx-2" />
      {!collapsed && <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Tools</p>}

      {TOOLS_ITEMS.map((item) => {
        const Icon = needsOnboarding ? Lock : item.icon;
        const active = isActive(item.path);
        return (
          <button
            key={item.id}
            onClick={() => handleNav(item.path)}
            title={collapsed ? item.label : undefined}
            className={`w-full flex items-center gap-3 ${collapsed ? 'justify-center px-2' : 'px-3'} py-2.5 rounded-xl text-sm font-medium transition-colors ${
              needsOnboarding
                ? 'opacity-40 cursor-not-allowed text-muted'
                : active
                  ? 'bg-brand-light text-brand-text-strong'
                  : 'text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer'
            }`}
          >
            <Icon size={20} className="shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </button>
        );
      })}

      <div className="h-px bg-border-subtle my-3 mx-2" />
      {!collapsed && <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Team</p>}

      {TEAM_ITEMS.map((item) => {
        const Icon = needsOnboarding ? Lock : item.icon;
        const active = isActive(item.path);
        return (
          <button
            key={item.id}
            onClick={() => handleNav(item.path)}
            title={collapsed ? item.label : undefined}
            className={`w-full flex items-center gap-3 ${collapsed ? 'justify-center px-2' : 'px-3'} py-2.5 rounded-xl text-sm font-medium transition-colors ${
              needsOnboarding
                ? 'opacity-40 cursor-not-allowed text-muted'
                : active
                  ? 'bg-brand-light text-brand-text-strong'
                  : 'text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer'
            }`}
          >
            <Icon size={20} className="shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </button>
        );
      })}

      {ownerMode && (
        <>
          <div className="h-px bg-border-subtle my-3 mx-2" />
          {!collapsed && <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Owner</p>}
        </>
      )}

      {ownerMode && OWNER_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.path);
        return (
          <button
            key={item.id}
            onClick={() => navigate(item.path)}
            title={collapsed ? item.label : undefined}
            className={`w-full flex items-center gap-3 ${collapsed ? 'justify-center px-2' : 'px-3'} py-2.5 rounded-xl text-sm font-medium transition-colors ${
              active
                ? 'bg-brand-light text-brand-text-strong'
                : 'text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer'
            }`}
          >
            <Icon size={20} className="shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </button>
        );
      })}

      {ownerMode && !needsOnboarding && (
        <>
          <div className="h-px bg-border-subtle my-3 mx-2" />
          <button
            onClick={() => setAppsExpanded((v) => !v)}
            title={collapsed ? 'Apps' : undefined}
            className={`w-full flex items-center gap-3 ${collapsed ? 'justify-center px-2' : 'px-3'} py-2.5 rounded-xl text-sm font-medium text-secondary hover:bg-surface-alt hover:text-primary transition-colors cursor-pointer`}
          >
            <LayoutGrid size={20} className="shrink-0" />
            {!collapsed && (
              <>
                <span className="truncate flex-1 text-left">Apps</span>
                <ChevronDown size={16} className={`text-muted transition-transform duration-200 ${appsExpanded ? '' : '-rotate-90'}`} />
              </>
            )}
          </button>
          {appsExpanded && EXTERNAL_APPS.map((app) => (
            <a
              key={app.name}
              href={app.url}
              target="_blank"
              rel="noopener noreferrer"
              title={collapsed ? app.name : undefined}
              className={`w-full flex items-center gap-3 ${collapsed ? 'justify-center px-2' : 'pl-6 pr-3'} py-2 rounded-xl text-sm font-medium text-secondary hover:bg-surface-alt hover:text-primary transition-colors cursor-pointer`}
            >
              <div className={`w-6 h-6 rounded-md ${app.bg} flex items-center justify-center shrink-0 overflow-hidden`}>
                <img src={app.logo} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = ''; }} />
                <span className="text-white text-[9px] font-bold" style={{ display: 'none' }}>{app.icon}</span>
              </div>
              {!collapsed && <span className="truncate">{app.name}</span>}
            </a>
          ))}
        </>
      )}
    </nav>
  );

  return (
    <div className="min-h-screen bg-surface">
      {/* ─── Desktop Sidebar ─── */}
      <aside className={`hidden lg:flex fixed left-0 top-0 h-full ${sidebarCollapsed ? 'w-16' : 'w-60'} bg-card border-r border-border-subtle z-40 flex-col transition-all duration-200`}>
        {/* Logo */}
        <div className={`h-16 flex items-center ${sidebarCollapsed ? 'justify-center px-2' : 'px-4'} border-b border-border-subtle shrink-0`}>
          <img src={sidebarCollapsed ? 'https://assets.cdn.filesafe.space/Umlo2UnfqbijiGqNU6g2/media/697e5cbef7a8776caab6e3c7.png' : '/logo.png'} alt="Hey Jude's Lawn Care" className={`shrink-0 ${sidebarCollapsed ? 'h-10 w-10 object-contain' : 'h-10'}`} />
        </div>

        {renderSidebarNav(sidebarCollapsed)}

        {/* Profile */}
        <div className="border-t border-border-subtle p-2 shrink-0">
          <button
            onClick={() => !needsOnboarding && navigate('/profile')}
            title={sidebarCollapsed ? currentUser : undefined}
            className={`w-full flex items-center gap-3 ${sidebarCollapsed ? 'justify-center px-2' : 'px-3'} py-2.5 rounded-xl text-sm font-medium transition-colors ${
              needsOnboarding
                ? 'opacity-40 cursor-not-allowed'
                : isProfileActive
                  ? 'bg-brand-light text-brand-text-strong'
                  : 'text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer'
            }`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
              isProfileActive ? 'bg-brand text-on-brand' : 'bg-brand-light text-brand-text-strong'
            }`}>
              {needsOnboarding ? <Lock size={14} /> : getInitials(currentUser)}
            </div>
            {!sidebarCollapsed && <span className="truncate">{currentUser}</span>}
          </button>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={toggleSidebar}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-card border border-border-subtle shadow-sm flex items-center justify-center text-muted hover:text-primary transition-colors cursor-pointer"
        >
          {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </aside>

      {/* ─── Mobile Header ─── */}
      <nav className="lg:hidden bg-card border-b border-border-default sticky top-0 z-40">
        <div className="flex items-center justify-between h-14 px-4">
          <button onClick={() => setMobileSidebarOpen(true)} className="p-1.5 rounded-lg hover:bg-surface-alt transition-colors cursor-pointer">
            <Menu size={22} className="text-secondary" />
          </button>
          <span className="font-bold text-primary text-sm">Hey Jude's Lawn Care</span>
          <button
            onClick={() => !needsOnboarding && navigate('/profile')}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
              needsOnboarding
                ? 'opacity-40 cursor-not-allowed bg-brand-light text-brand-text-strong'
                : isProfileActive
                  ? 'bg-brand text-on-brand ring-2 ring-brand ring-offset-2 ring-offset-card'
                  : 'bg-brand-light text-brand-text-strong'
            }`}
          >
            {needsOnboarding ? <Lock size={12} /> : getInitials(currentUser)}
          </button>
        </div>
        {/* Mobile tabs */}
        <div className="flex border-t border-border-subtle overflow-x-auto">
          {NAV_ITEMS.filter((t) => !t.ownerOnly || ownerMode).map((t) => {
            const Icon = needsOnboarding ? Lock : t.icon;
            return (
              <button
                key={t.id}
                onClick={() => handleNav(t.path)}
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

      {/* ─── Mobile Sidebar Overlay ─── */}
      <div className={`lg:hidden fixed inset-0 z-50 ${mobileSidebarOpen ? '' : 'pointer-events-none'}`}>
        <div
          className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${mobileSidebarOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setMobileSidebarOpen(false)}
        />
        <aside className={`absolute left-0 top-0 h-full w-72 bg-card shadow-2xl flex flex-col transition-transform duration-200 ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <button
            onClick={() => setMobileSidebarOpen(false)}
            className="absolute top-4 right-4 p-1 text-muted hover:text-primary cursor-pointer z-10"
          >
            <X size={20} />
          </button>
          <div className="h-16 flex items-center px-4 border-b border-border-subtle shrink-0">
            <img src="/logo.png" alt="Hey Jude's Lawn Care" className="h-10 shrink-0" />
          </div>
          {renderSidebarNav(false)}
          <div className="border-t border-border-subtle p-2 shrink-0">
            <button
              onClick={() => { if (!needsOnboarding) navigate('/profile'); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                needsOnboarding
                  ? 'opacity-40 cursor-not-allowed'
                  : isProfileActive
                    ? 'bg-brand-light text-brand-text-strong'
                    : 'text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer'
              }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                isProfileActive ? 'bg-brand text-on-brand' : 'bg-brand-light text-brand-text-strong'
              }`}>
                {needsOnboarding ? <Lock size={14} /> : getInitials(currentUser)}
              </div>
              <span className="truncate">{currentUser}</span>
            </button>
          </div>
        </aside>
      </div>

      {/* ─── Main Content ─── */}
      <main className={`${sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-60'} transition-all duration-200`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-8">
          <Suspense fallback={
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-4 border-brand-light border-t-brand rounded-full animate-spin" />
            </div>
          }>
            {needsOnboarding ? (
              <Routes>
                <Route path="/training/onboard/:stepId" element={<OnboardingStep />} />
                <Route path="*" element={<OnboardingHub />} />
              </Routes>
            ) : (
              <Routes>
                <Route path="/" element={ownerMode ? <ExecutionDashboard /> : <Home />} />
                <Route path="/guides" element={<HowToGuides ownerMode={ownerMode} allowedPlaybooks={allowedPlaybooks} />} />
                <Route path="/guides/:id" element={<PlaybookDetail ownerMode={ownerMode} />} />
                <Route path="/equipment" element={<EquipmentIdeas />} />
                <Route path="/hr" element={<HRPolicies />} />
                <Route path="/quoting" element={<Quoting />} />
                <Route path="/team" element={<TeamManagement />} />
                <Route path="/team/:memberEmail" element={<TeamMemberDetail />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/mileage" element={<MileageLog />} />
                <Route path="/receipts" element={<ReceiptTracker />} />
                <Route path="/ideas" element={<IdeasFeedback />} />
                <Route path="/daily-checklist" element={<DailyChecklist />} />
                <Route path="/checklist-tracker" element={<ChecklistTrackerPage />} />
                <Route path="/owner-dashboard" element={<OwnerDashboard />} />
                <Route path="/settings" element={<Navigate to="/profile" replace />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            )}
          </Suspense>
        </div>
      </main>

      {/* Unlock Animation Overlay */}
      {showUnlockAnimation && (
        <div
          className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-emerald-900/90 backdrop-blur-sm ${
            unlockPhase === 'fading' ? 'unlock-overlay-out' : 'unlock-overlay-in'
          }`}
        >
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-24 h-24 rounded-full border-4 border-emerald-400/40 unlock-ring-1 opacity-0" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-24 h-24 rounded-full border-4 border-emerald-300/30 unlock-ring-2 opacity-0" />
          </div>
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
          <div className="relative">
            <div className="unlock-icon-shake">
              <div className="unlock-icon-burst">
                <Unlock size={64} className="text-emerald-400 drop-shadow-lg" strokeWidth={2.5} />
              </div>
            </div>
          </div>
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
