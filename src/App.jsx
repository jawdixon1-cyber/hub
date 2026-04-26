import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import {
  Home as HomeIcon,
  BookOpen,
  Users,
  LogOut,
  RefreshCw,
  Wrench,
  Calculator,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Receipt,
  LayoutGrid,
  ChevronDown,
  Crosshair,
  GitBranch,
  MapPinned,
  DollarSign,
  FileText,
  TrendingUp,
  Settings as SettingsIcon,
  MessageSquare,
  Inbox,
  Briefcase,
  CreditCard,
  CalendarDays,
  PlusCircle,
  UserPlus,
  ClipboardList,
  FileSignature,
  Hammer,
  UserPlus2,
  BarChart3,
} from 'lucide-react';

import { supabase } from './lib/supabase';
import { useAuth } from './contexts/AuthContext';
import { AppStoreProvider, useAppStore } from './store/AppStoreContext';
import { getCurrentAgreementVersion } from './data/employmentAgreement';
import LoginForm from './components/LoginForm';

/* ─── Lazy-loaded pages (code-split per route) ─── */
const Home = lazy(() => import('./pages/Home'));
const HowToGuides = lazy(() => import('./pages/HowToGuides'));
const EquipmentIdeas = lazy(() => import('./pages/EquipmentIdeas'));
const TeamAgreement = lazy(() => import('./pages/TeamAgreement'));
const Profile = lazy(() => import('./pages/Profile'));
const OwnerDashboard = lazy(() => import('./pages/OwnerDashboard'));
const TeamManagement = lazy(() => import('./pages/TeamManagement'));
const TeamMemberDetail = lazy(() => import('./pages/TeamMemberDetail'));
const MileageLog = lazy(() => import('./pages/MileageLog'));
const ChecklistTrackerPage = lazy(() => import('./pages/ChecklistTrackerPage'));
const Quoting = lazy(() => import('./pages/Quoting'));
const DailyChecklist = lazy(() => import('./pages/DailyChecklist'));
const ExecutionDashboard = lazy(() => import('./pages/ExecutionDashboard'));
const ReceiptTracker = lazy(() => import('./pages/ReceiptTracker'));
const PlaybookDetail = lazy(() => import('./pages/PlaybookDetail'));
const Standards = lazy(() => import('./pages/Standards'));
const Settings = lazy(() => import('./pages/Settings'));
const Commander = lazy(() => import('./pages/Commander'));
const SalesPipeline = lazy(() => import('./pages/SalesPipeline'));
const ServiceAgreement = lazy(() => import('./pages/ServiceAgreement'));
const Territory = lazy(() => import('./pages/Dominate'));
const MowingSchedule = lazy(() => import('./pages/MowingSchedule'));
const Finance = lazy(() => import('./pages/Finance'));
const LaborEfficiency = lazy(() => import('./pages/LaborEfficiency'));
const Sales = lazy(() => import('./pages/Sales'));
const Marketing = lazy(() => import('./pages/Marketing'));
const Clients = lazy(() => import('./pages/Clients'));
const Messages = lazy(() => import('./pages/Messages'));
const Requests = lazy(() => import('./pages/Requests'));
const NewClient = lazy(() => import('./pages/NewClient'));
const Schedule = lazy(() => import('./pages/Schedule'));
const Jobs = lazy(() => import('./pages/Jobs'));
const Invoices = lazy(() => import('./pages/Invoices'));
const Payments = lazy(() => import('./pages/Payments'));
const Hiring = lazy(() => import('./pages/Hiring'));
const ApplyForm = lazy(() => import('./pages/ApplyForm'));
const ApplicantOnboarding = lazy(() => import('./pages/ApplicantOnboarding'));
const Insights = lazy(() => import('./pages/Insights'));
const InsightsRecurringClients = lazy(() => import('./pages/Insights').then(m => ({ default: m.RecurringClientsReport })));
const InsightsProfitability = lazy(() => import('./pages/InsightsProfitability'));

const NAV_ITEMS = [
  { id: 'home', path: '/', label: 'Home', icon: HomeIcon },
  { id: 'schedule', path: '/schedule', label: 'Schedule', icon: CalendarDays, ownerOnly: true },
];

const TEAM_TOOLS_ITEMS = [
  { id: 'guides-field', path: '/guides?role=field', label: 'Playbooks', icon: BookOpen },
  { id: 'equipment', path: '/equipment', label: 'Equipment', icon: Wrench },
  { id: 'receipts', path: '/receipts', label: 'Receipts', icon: Receipt },
  { id: 'mileage', path: '/mileage', label: 'Mileage', icon: Gauge },
];

const TEAM_ITEMS = [
  { id: 'agreement', path: '/agreement', label: 'Agreement', icon: FileText },
];

const OPERATIONS_ITEMS = [
  { id: 'clients', path: '/clients', label: 'Clients', icon: Users },
  { id: 'requests', path: '/requests', label: 'Requests', icon: Inbox },
  { id: 'sales', path: '/sales', label: 'Quotes', icon: Crosshair },
  { id: 'jobs', path: '/jobs', label: 'Jobs', icon: Briefcase },
  { id: 'invoices', path: '/invoices', label: 'Invoices', icon: FileText },
  { id: 'payments', path: '/payments', label: 'Payments', icon: CreditCard },
];

const OWNER_TOOLS_ITEMS = [
  { id: 'guides', path: '/guides', label: 'Playbooks', icon: BookOpen },
  { id: 'hiring', path: '/hiring', label: 'Hiring', icon: UserPlus2 },
  { id: 'insights', path: '/insights', label: 'Insights', icon: BarChart3 },
  { id: 'messaging', path: '/messages', label: 'Messaging', icon: MessageSquare },
  { id: 'equipment', path: '/equipment', label: 'Equipment', icon: Wrench },
  { id: 'receipts', path: '/receipts', label: 'Receipts', icon: Receipt },
  { id: 'mileage', path: '/mileage', label: 'Mileage', icon: Gauge },
];


/* ─── App (outer) — auth gate + data loading ─── */

const DATA_CACHE_KEY = 'greenteam-data-cache';

function App() {
  const { session, user, ownerMode, orgId, loading: authLoading, signOut } = useAuth();
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
      let query = supabase.from('app_state').select('key, value');
      // Scope to org if available (after multi-tenancy migration)
      if (orgId) query = query.eq('org_id', orgId);
      const { data, error } = await query;
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
  }, [orgId]);

  useEffect(() => {
    if (session) loadData();
    else {
      setCloudData(null);
      try { localStorage.removeItem(DATA_CACHE_KEY); } catch {}
    }
  }, [session, loadData]);

  // Public routes (no auth required)
  const loc = useLocation();
  if (loc.pathname === '/apply') {
    return (
      <Suspense fallback={<div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center"><div className="w-8 h-8 border-4 border-gray-700 border-t-green-400 rounded-full animate-spin" /></div>}>
        <ApplyForm />
      </Suspense>
    );
  }

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
  // Applicants invited via the Trial flow have role='applicant' and only see /onboard
  const isApplicantRole = user?.user_metadata?.role === 'applicant';
  if (isApplicantRole) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-surface flex items-center justify-center text-muted text-sm">Loading…</div>}>
        <ApplicantOnboarding />
      </Suspense>
    );
  }
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
    <AppStoreProvider cloudData={cloudData} orgId={orgId}>
      <AppShell />
    </AppStoreProvider>
  );
}

/* ─── Create Button (Jobber style) ─── */
const CREATE_ITEMS = [
  { id: 'client', label: 'Client', icon: UserPlus, path: '/clients/new' },
  { id: 'request', label: 'Request', icon: ClipboardList, path: '/requests?new=1' },
  { id: 'quote', label: 'Quote', icon: FileSignature, path: '/sales?new=1' },
  { id: 'job', label: 'Job', icon: Hammer, path: '/jobs?new=1' },
  { id: 'invoice', label: 'Invoice', icon: FileText, path: '/invoices?new=1' },
];

function CreateButton({ collapsed, onNav }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const btnRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const handleOpen = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.top, left: r.right + 8 });
    }
    setOpen(o => !o);
  };

  return (
    <div ref={ref} className="px-2 pt-3 pb-1">
      <button ref={btnRef} onClick={handleOpen}
        className={`w-full flex items-center gap-2.5 ${collapsed ? 'justify-center px-2' : 'px-3'} py-2.5 rounded-xl text-sm font-bold transition-colors text-brand-text-strong hover:bg-surface-alt cursor-pointer`}>
        <PlusCircle size={20} className="shrink-0 text-brand" />
        {!collapsed && <span>Create</span>}
      </button>
      {open && (
        <div className="fixed z-[100] bg-card border border-border-subtle rounded-xl shadow-2xl p-2 flex gap-1"
          style={{ top: pos.top, left: pos.left }}>
          {CREATE_ITEMS.map(item => {
            const Icon = item.icon;
            return (
              <button key={item.id} onClick={() => { onNav(item.path); setOpen(false); }}
                className="flex flex-col items-center gap-1.5 px-4 py-3 rounded-lg text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer transition-colors min-w-[72px]">
                <Icon size={20} className="text-muted" />
                <span className="text-[11px] font-semibold">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Owner Settings Menu (Jobber-style dropdown) ─── */

function OwnerSettingsMenu({ collapsed, currentUser, userEmail, onNav, onSignOut, isActivePath }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (popRef.current && !popRef.current.contains(e.target) && !btnRef.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const handleOpen = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.top - 8, left: r.right + 8 });
    }
    setOpen((o) => !o);
  };

  const handleNav = (path) => {
    onNav(path);
    setOpen(false);
  };

  const isActive = isActivePath('/settings') || isActivePath('/profile') || isActivePath('/team');

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        title="Settings"
        className={`w-full flex items-center ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'} py-2.5 rounded-xl text-sm font-medium transition-colors ${
          isActive || open
            ? 'bg-brand-light text-brand-text-strong'
            : 'text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer'
        }`}
      >
        <SettingsIcon size={20} className="shrink-0" />
        {!collapsed && <span>Settings</span>}
      </button>

      {open && (
        <div
          ref={popRef}
          className="fixed z-[100] w-72 bg-card border border-border-subtle rounded-xl shadow-2xl py-2"
          style={{ bottom: window.innerHeight - pos.top, left: pos.left }}
        >
          <div className="px-4 py-3 border-b border-border-subtle">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-light text-brand-text-strong flex items-center justify-center text-sm font-bold shrink-0">
                {getInitials(currentUser)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-primary truncate">{currentUser}</p>
                <p className="text-xs text-tertiary truncate">{userEmail}</p>
              </div>
            </div>
          </div>
          <div className="py-1">
            <button onClick={() => handleNav('/settings')} className="w-full text-left px-4 py-2 text-sm text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer">
              Settings
            </button>
            <button onClick={() => handleNav('/team')} className="w-full text-left px-4 py-2 text-sm text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer">
              Manage Team
            </button>
          </div>
          <div className="border-t border-border-subtle py-1">
            <button onClick={() => { setOpen(false); onSignOut(); }} className="w-full text-left px-4 py-2 text-sm text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer">
              Log Out
            </button>
          </div>
        </div>
      )}
    </>
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
  const { user, currentUser, ownerMode, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // ── Jobber token keepalive ──
  // Jobber's refresh tokens rotate on use and are invalidated after prolonged idle
  // periods. Ping the refresh endpoint every 45 min while the app is open so the
  // token never goes stale. Owners only — team members don't use Jobber-backed data.
  useEffect(() => {
    if (!ownerMode) return;
    let timer;
    const ping = () => {
      fetch('/api/jobber-data?action=refresh', { method: 'POST' }).catch(() => {});
    };
    // Run once after 30s so it's noticed if Jobber is disconnected, then every 45 min
    const initial = setTimeout(ping, 30000);
    timer = setInterval(ping, 45 * 60 * 1000);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, [ownerMode]);

  const permissions = useAppStore((s) => s.permissions);
  const userEmail = user?.email?.toLowerCase();
  const allowedPlaybooks = ownerMode
    ? ['service', 'sales', 'strategy']
    : (permissions[userEmail]?.playbooks || ['service']);

  // ── Agreement gate for team members ──
  // PDF-only flow: if owner has uploaded a PDF, every team member must sign that
  // exact version before they can use the app. Owners are exempt.
  const signedAgreements = useAppStore((s) => s.signedAgreements) || [];
  const agreementPdf = useAppStore((s) => s.agreementPdf);
  const currentAgreementVersion = agreementPdf?.version || null;

  const hasSignedCurrent = ownerMode || !agreementPdf || signedAgreements.some(
    (a) => a.memberEmail === userEmail && a.version === currentAgreementVersion
  );
  const needsAgreement = !ownerMode && !!agreementPdf && !hasSignedCurrent;

  // Force navigate to agreement page if not signed (allow profile for sign out)
  useEffect(() => {
    if (needsAgreement && location.pathname !== '/agreement' && location.pathname !== '/profile') {
      navigate('/agreement');
    }
  }, [needsAgreement, location.pathname, navigate]);

  // ── Presence — track open/close ──
  const presence = useAppStore((s) => s.presence);
  const setPresence = useAppStore((s) => s.setPresence);

  useEffect(() => {
    if (!userEmail) return;

    // Mark online — track when session started
    const goOnline = () => {
      setPresence((prev) => {
        const existing = prev[userEmail];
        const sessionStart = existing?.status === 'online' && existing?.sessionStart ? existing.sessionStart : new Date().toISOString();
        return { ...prev, [userEmail]: { name: currentUser, status: 'online', lastSeen: new Date().toISOString(), sessionStart } };
      });
    };

    // Mark offline
    const goOffline = () => {
      setPresence((prev) => ({ ...prev, [userEmail]: { name: currentUser, status: 'offline', lastSeen: new Date().toISOString() } }));
    };

    // Go online immediately
    goOnline();

    // Heartbeat every 60s to stay fresh (in case Supabase sync is slow)
    const interval = setInterval(goOnline, 60000);

    // Tab close / navigate away — mark offline
    window.addEventListener('beforeunload', goOffline);

    // Also heartbeat on visibility change (coming back from background)
    const onVis = () => {
      if (document.visibilityState === 'visible') goOnline();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', goOffline);
      document.removeEventListener('visibilitychange', onVis);
      goOffline(); // cleanup on unmount (sign out)
    };
  }, [userEmail, currentUser]);

  // Sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') === 'true'; } catch { return false; }
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [teamToolsOpen, setTeamToolsOpen] = useState(true);
  const [operationsOpen, setOperationsOpen] = useState(false);

  const toggleSidebar = () => {
    setSidebarCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem('sidebar-collapsed', String(next)); } catch {}
      return next;
    });
  };

  // Close mobile sidebar on navigation
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    const [p, qs] = path.split('?');
    const pathMatch = location.pathname.startsWith(p);
    if (!qs) return pathMatch;
    return pathMatch && location.search.includes(qs);
  };

  const handleNav = (path) => {
    navigate(path);
  };

  const isProfileActive = location.pathname === '/profile';

  // Sidebar nav renderer (shared between desktop & mobile)
  const renderSidebarNav = (collapsed) => (
    <nav className="flex-1 overflow-y-auto">
      <div className="py-3 px-2 space-y-1">
      {NAV_ITEMS.filter((item) => !item.ownerOnly || ownerMode).map((item) => {
        const Icon = item.icon;
        const active = isActive(item.path);
        return (
          <button
            key={item.id}
            onClick={() => handleNav(item.path)}
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

      {/* Team Tools — for non-owners, show directly */}
      {!ownerMode && (
        <>
          <div className="h-px bg-border-subtle my-3 mx-2" />
          {!collapsed && <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Tools</p>}
          {TEAM_TOOLS_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <button key={item.id} onClick={() => handleNav(item.path)} title={collapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 ${collapsed ? 'justify-center px-2' : 'px-3'} py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active ? 'bg-brand-light text-brand-text-strong' : 'text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer'
                }`}>
                <Icon size={20} className="shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </>
      )}

      {ownerMode && (
        <>
          <div className="h-px bg-border-subtle my-3 mx-2" />
          {!collapsed && (
            <button onClick={() => setOperationsOpen((o) => !o)}
              className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted hover:text-secondary cursor-pointer">
              <span>Building</span>
              <ChevronDown size={14} className={`transition-transform ${operationsOpen ? 'rotate-180' : ''}`} />
            </button>
          )}
          {(operationsOpen || collapsed) && (
            <CreateButton collapsed={collapsed} onNav={handleNav} />
          )}
          {(operationsOpen || collapsed) && OPERATIONS_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <button
                key={item.id}
                onClick={() => handleNav(item.path)}
                title={collapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 ${collapsed ? 'justify-center px-2' : 'px-3 pl-6'} py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? 'bg-brand-light text-brand-text-strong'
                    : 'text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer'
                }`}
              >
                <Icon size={18} className="shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}

          <div className="h-px bg-border-subtle my-3 mx-2" />
          {!collapsed && (
            <button onClick={() => setTeamToolsOpen((o) => !o)}
              className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted hover:text-secondary cursor-pointer">
              <span>Tools</span>
              <ChevronDown size={14} className={`transition-transform ${teamToolsOpen ? 'rotate-180' : ''}`} />
            </button>
          )}
          {(teamToolsOpen || collapsed) && OWNER_TOOLS_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <button key={item.id} onClick={() => handleNav(item.path)} title={collapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 ${collapsed ? 'justify-center px-2' : 'px-3 pl-6'} py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active ? 'bg-brand-light text-brand-text-strong' : 'text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer'
                }`}>
                <Icon size={18} className="shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </>
      )}
      </div>
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

        {/* Settings / Profile */}
        <div className="border-t border-border-subtle p-2 shrink-0">
          {ownerMode ? (
            <OwnerSettingsMenu
              collapsed={sidebarCollapsed}
              currentUser={currentUser}
              userEmail={user?.email}
              onNav={navigate}
              onSignOut={signOut}
              isActivePath={(p) => location.pathname === p}
            />
          ) : (
            <button
              onClick={() => navigate('/profile')}
              title={sidebarCollapsed ? currentUser : undefined}
              className={`w-full flex items-center gap-3 ${sidebarCollapsed ? 'justify-center px-2' : 'px-3'} py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isProfileActive
                  ? 'bg-brand-light text-brand-text-strong'
                  : 'text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer'
              }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                isProfileActive ? 'bg-brand text-on-brand' : 'bg-brand-light text-brand-text-strong'
              }`}>
                {getInitials(currentUser)}
              </div>
              {!sidebarCollapsed && <span className="truncate">{currentUser}</span>}
            </button>
          )}
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
          <span className="font-bold text-primary text-sm">Hub</span>
          <button
            onClick={() => navigate('/profile')}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
              isProfileActive
                ? 'bg-brand text-on-brand ring-2 ring-brand ring-offset-2 ring-offset-card'
                : 'bg-brand-light text-brand-text-strong'
            }`}
          >
            {getInitials(currentUser)}
          </button>
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
            {ownerMode ? (
              <OwnerSettingsMenu
                collapsed={false}
                currentUser={currentUser}
                userEmail={user?.email}
                onNav={(p) => { navigate(p); setMobileSidebarOpen(false); }}
                onSignOut={signOut}
                isActivePath={(p) => location.pathname === p}
              />
            ) : (
              <button
                onClick={() => navigate('/profile')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isProfileActive
                    ? 'bg-brand-light text-brand-text-strong'
                    : 'text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer'
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  isProfileActive ? 'bg-brand text-on-brand' : 'bg-brand-light text-brand-text-strong'
                }`}>
                  {getInitials(currentUser)}
                </div>
                <span className="truncate">{currentUser}</span>
              </button>
            )}
          </div>
        </aside>
      </div>

      {/* ─── Main Content ─── */}
      <main className={`${sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-60'} transition-all duration-200`}>
        {needsAgreement && (
          <div className="sticky top-0 z-40 bg-amber-500 text-black px-4 py-3 flex items-center gap-2">
            <span className="font-black text-sm">⚠️ Action Required</span>
            <span className="text-sm">— Sign the agreement to continue. Read and sign below.</span>
          </div>
        )}
        <div className={location.pathname === '/messages' || location.pathname === '/schedule' || location.pathname === '/clients' ? 'px-4 py-3' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-8'}>
          <Suspense fallback={
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-4 border-brand-light border-t-brand rounded-full animate-spin" />
            </div>
          }>
              <Routes>
                <Route path="/" element={ownerMode ? <DailyChecklist /> : <Home />} />
                <Route path="/guides" element={<HowToGuides ownerMode={ownerMode} allowedPlaybooks={allowedPlaybooks} />} />
                <Route path="/guides/:id" element={<PlaybookDetail ownerMode={ownerMode} />} />
                <Route path="/p/:slug" element={<PlaybookDetail ownerMode={ownerMode} />} />
                <Route path="/equipment" element={<EquipmentIdeas />} />
                <Route path="/agreement" element={<TeamAgreement />} />
                <Route path="/mowing" element={<MowingSchedule />} />
                <Route path="/sales" element={<Sales />} />
                <Route path="/clients" element={<Clients />} />
                <Route path="/clients/new" element={<NewClient />} />
                <Route path="/clients/:clientId" element={<Clients />} />
                <Route path="/messages" element={<Messages />} />
                <Route path="/requests" element={<Requests />} />
                <Route path="/schedule" element={<Schedule />} />
                <Route path="/jobs" element={<Jobs />} />
                <Route path="/invoices" element={<Invoices />} />
                <Route path="/payments" element={<Payments />} />
                <Route path="/marketing" element={<Marketing />} />
                <Route path="/hiring" element={<Hiring />} />
                <Route path="/finance" element={<Finance />} />
                <Route path="/labor" element={<LaborEfficiency />} />
                <Route path="/insights" element={<Insights />} />
                <Route path="/insights/clients" element={<InsightsRecurringClients />} />
                <Route path="/insights/leads" element={<Marketing />} />
                <Route path="/insights/profitability" element={<LaborEfficiency />} />
                <Route path="/insights/profitability-full" element={<InsightsProfitability />} />
                {/* Redirects for old routes */}
                <Route path="/commander" element={<Navigate to="/sales" replace />} />
                <Route path="/pipeline" element={<Navigate to="/sales" replace />} />
                <Route path="/quoting" element={<Navigate to="/sales" replace />} />
                <Route path="/agreements" element={<Navigate to="/clients" replace />} />
                <Route path="/territory" element={<Navigate to="/marketing" replace />} />
                <Route path="/team" element={<TeamManagement />} />
                <Route path="/team/:memberEmail" element={<TeamMemberDetail />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/mileage" element={<MileageLog />} />
                <Route path="/receipts" element={<ReceiptTracker />} />
                <Route path="/standards" element={<Standards />} />
                <Route path="/daily-checklist" element={<DailyChecklist />} />
                <Route path="/checklist-tracker" element={<ChecklistTrackerPage />} />
                <Route path="/owner-dashboard" element={<OwnerDashboard />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
          </Suspense>
        </div>
      </main>

    </div>
  );
}

export default App;
