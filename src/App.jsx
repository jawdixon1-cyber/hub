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
  Clock,
  Eye,
  Sunrise,
  Sunset,
  Printer,
  DoorOpen,
  Bell,
  Search as SearchIcon,
  HelpCircle,
  Sparkles,
  Globe,
  Truck,
} from 'lucide-react';

import { supabase } from './lib/supabase';
import { useAuth } from './contexts/AuthContext';
import { AppStoreProvider, useAppStore } from './store/AppStoreContext';
import { useLocalPref, PREF_HIDE_BUILDING, PREF_HIDE_SCHEDULE } from './hooks/useLocalPref';
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
const OwnerHome = lazy(() => import('./pages/OwnerHome'));
const ChecklistItem = lazy(() => import('./pages/ChecklistItem'));
const ChecklistWorkflow = lazy(() => import('./pages/ChecklistWorkflow'));
const Timesheets = lazy(() => import('./pages/Timesheets'));
const Eyeballs = lazy(() => import('./pages/Eyeballs'));
const PrintHangers = lazy(() => import('./pages/PrintHangers'));
const ExecutionDashboard = lazy(() => import('./pages/ExecutionDashboard'));
const ReceiptTracker = lazy(() => import('./pages/ReceiptTracker'));
const PlaybookDetail = lazy(() => import('./pages/PlaybookDetail'));
const Standards = lazy(() => import('./pages/Standards'));
const Settings = lazy(() => import('./pages/Settings'));
const Commander = lazy(() => import('./pages/Commander'));
const ServiceAgreement = lazy(() => import('./pages/ServiceAgreement'));
const Territory = lazy(() => import('./pages/Dominate'));
const Website = lazy(() => import('./pages/Website'));
const PayrollBonus = lazy(() => import('./pages/PayrollBonus'));
const Suppliers = lazy(() => import('./pages/Suppliers'));
const MowingSchedule = lazy(() => import('./pages/MowingSchedule'));
const Finance = lazy(() => import('./pages/Finance'));
const LaborEfficiency = lazy(() => import('./pages/LaborEfficiency'));
const Sales = lazy(() => import('./pages/Sales'));
const Marketing = lazy(() => import('./pages/Marketing'));
const Clients = lazy(() => import('./pages/Clients'));
const EditClientPage = lazy(() => import('./pages/Clients').then(m => ({ default: m.EditClientPage })));
const Quotes = lazy(() => import('./pages/Quotes'));
const PublicQuoteView = lazy(() => import('./pages/PublicQuoteView'));
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
const InsightsDoorHangers = lazy(() => import('./pages/InsightsDoorHangers'));

const NAV_ITEMS = [
  { id: 'home', path: '/', label: 'Home', icon: HomeIcon },
  { id: 'schedule', path: '/schedule', label: 'Schedule', icon: CalendarDays, ownerOnly: true },
];

const TEAM_TOOLS_ITEMS = [
  { id: 'guides-field', path: '/playbooks?role=field', label: 'Playbooks', icon: BookOpen },
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
  { id: 'quotes', path: '/quotes', label: 'Quotes', icon: FileText },
  { id: 'jobs', path: '/jobs', label: 'Jobs', icon: Briefcase },
  { id: 'invoices', path: '/invoices', label: 'Invoices', icon: FileText },
  { id: 'payments', path: '/payments', label: 'Payments', icon: DollarSign },
];

const OWNER_TOOLS_PINNED = [
  { id: 'sales', path: '/sales', label: 'Calculate Quote', icon: Calculator },
  { id: 'website', path: '/website', label: 'Website', icon: Globe },
  { id: 'guides', path: '/playbooks', label: 'Playbooks', icon: BookOpen },
  { id: 'hiring', path: '/hiring', label: 'Hiring', icon: UserPlus2 },
  { id: 'insights', path: '/insights', label: 'Insights', icon: BarChart3 },
  { id: 'eyeballs', path: '/eyeballs', label: 'Eyeballs', icon: Eye },
];
const OWNER_TOOLS_MORE = [
  { id: 'equipment', path: '/equipment', label: 'Equipment', icon: Wrench },
  { id: 'receipts', path: '/receipts', label: 'Receipts', icon: Receipt },
  { id: 'mileage', path: '/mileage', label: 'Mileage', icon: Gauge },
  { id: 'timesheets', path: '/timesheets', label: 'Timesheets', icon: Clock },
  { id: 'payroll', path: '/payroll', label: 'Payroll & Bonus', icon: DollarSign },
  { id: 'suppliers', path: '/suppliers', label: 'Suppliers', icon: Truck },
];
const OWNER_TOOLS_ITEMS = [...OWNER_TOOLS_PINNED, ...OWNER_TOOLS_MORE];


/* ─── App (outer) — auth gate + data loading ─── */

const DATA_CACHE_KEY = 'greenteam-data-cache';

// Critical keys — needed for the gate decision and first render.
// Everything else loads in the background after the UI is interactive.
const CRITICAL_KEYS = [
  'greenteam-permissions',
  'greenteam-agreementPdf',
  'greenteam-agreementConfig',
  'greenteam-signedAgreements',
  'greenteam-presence',
  'greenteam-roles',
  'greenteam-announcements',
  'greenteam-applicationForm',
  'greenteam-teamChecklist',
  'greenteam-teamEndChecklist',
  'greenteam-ownerStartChecklist',
  'greenteam-ownerEndChecklist',
  'greenteam-ownerTodos',
  'greenteam-mileageLog',
  'greenteam-vehicles',
  'greenteam-guides',
];

function App() {
  // Public quote view bypasses auth — clients use a tokenized URL.
  const { pathname } = useLocation();
  if (pathname.startsWith('/q/')) {
    return (
      <Suspense fallback={null}>
        <Routes><Route path="/q/:token" element={<PublicQuoteView />} /></Routes>
      </Suspense>
    );
  }
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
  const [refreshing, setRefreshing] = useState(false);

  // Two-phase fetch:
  //   1) Critical keys first → gate + first render
  //   2) Everything else in the background → fills in heavy data without blocking
  // On failure, cached data is preferred over a blocking error screen.
  const loadData = useCallback(async () => {
    setDataError(null);
    setRefreshing(true);

    const mergeIntoCloud = (rows) => {
      setCloudData((prev) => {
        const next = { ...(prev || {}) };
        for (const row of rows) next[row.key] = row.value;
        try { localStorage.setItem(DATA_CACHE_KEY, JSON.stringify(next)); } catch {}
        return next;
      });
    };

    const fetchKeys = async (keys = null) => {
      let query = supabase.from('app_state').select('key, value');
      if (orgId) query = query.eq('org_id', orgId);
      if (keys) query = query.in('key', keys);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    };

    // Retry helper with exponential backoff (3 attempts: 0s, 1s, 3s)
    const withRetry = async (fn) => {
      let lastErr;
      for (let i = 0; i < 3; i++) {
        try { return await fn(); }
        catch (err) {
          lastErr = err;
          if (i < 2) await new Promise((r) => setTimeout(r, [1000, 3000][i]));
        }
      }
      throw lastErr;
    };

    try {
      // Phase 1: critical keys
      const critical = await withRetry(() => fetchKeys(CRITICAL_KEYS));
      mergeIntoCloud(critical);
      setRefreshing(false);

      // Phase 2: everything else, in the background
      withRetry(() => fetchKeys()).then((rows) => {
        // Merge — but exclude keys that came in critical to avoid stomping fresher data
        const criticalSet = new Set(CRITICAL_KEYS);
        const remaining = rows.filter((r) => !criticalSet.has(r.key));
        mergeIntoCloud(remaining);
      }).catch((err) => {
        // Background failure is non-fatal — keep using critical + cached data
        console.warn('[loadData] background fetch failed:', err.message);
      });
    } catch (err) {
      setRefreshing(false);
      // Soft-fail: only show error screen if we have *zero* cached data
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
        className={`w-full flex items-center ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'} py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
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

/* ─── Topbar settings menu — gear icon dropdown in the app top bar ─── */
function TopbarSettingsMenu({ currentUser, userEmail, onNav, onSignOut }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Settings"
        className={`p-1.5 rounded-lg cursor-pointer ${open ? 'bg-surface-alt text-primary' : 'text-muted hover:bg-surface-alt hover:text-primary'}`}
      >
        <SettingsIcon size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-64 bg-card border border-border-subtle rounded-xl shadow-2xl py-2">
          <div className="px-4 py-3 border-b border-border-subtle">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-brand-light text-brand-text-strong flex items-center justify-center text-xs font-bold shrink-0">
                {getInitials(currentUser)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-primary truncate">{currentUser}</p>
                <p className="text-xs text-tertiary truncate">{userEmail}</p>
              </div>
            </div>
          </div>
          <div className="py-1">
            <button onClick={() => { setOpen(false); onNav('/team'); }} className="w-full text-left px-4 py-2 text-sm text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer">
              Manage Team
            </button>
            <button onClick={() => { setOpen(false); onNav('/settings'); }} className="w-full text-left px-4 py-2 text-sm text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer">
              Settings
            </button>
          </div>
          <div className="border-t border-border-subtle py-1">
            <button onClick={() => { setOpen(false); onSignOut(); }} className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-surface-alt cursor-pointer">
              Log Out
            </button>
          </div>
        </div>
      )}
    </div>
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
  const ownerStartChecklist = useAppStore((s) => s.ownerStartChecklist) || [];
  const ownerEndChecklist = useAppStore((s) => s.ownerEndChecklist) || [];
  const teamChecklist = useAppStore((s) => s.teamChecklist) || [];
  const teamEndChecklist = useAppStore((s) => s.teamEndChecklist) || [];
  const dailyProgress = (() => {
    const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getDay()];
    const isForToday = (i) => i.type !== 'header' && (!i.days || i.days.length === 0 || i.days.includes(DAY));
    const startToday = ownerStartChecklist.filter(isForToday);
    const endToday = ownerEndChecklist.filter(isForToday);
    // Per-user team done state from localStorage (matches ChecklistWorkflow logic).
    const today = new Date().toLocaleDateString('en-CA');
    const userEmailLc = (user?.email || 'anon').toLowerCase();
    const readTeamDone = (k) => {
      try { return JSON.parse(localStorage.getItem(`boost-team-done-${userEmailLc}-${k}-${today}`) || '{}'); } catch { return {}; }
    };
    const teamStartDone = readTeamDone('team-start');
    const teamEndDone = readTeamDone('team-end');
    const teamStartToday = teamChecklist.filter(isForToday);
    const teamEndToday = teamEndChecklist.filter(isForToday);
    return {
      startDone: startToday.filter((i) => i.done).length,
      startTotal: startToday.length,
      endDone: endToday.filter((i) => i.done).length,
      endTotal: endToday.length,
      teamStartDone: teamStartToday.filter((i) => teamStartDone[i.id]).length,
      teamStartTotal: teamStartToday.length,
      teamEndDone: teamEndToday.filter((i) => teamEndDone[i.id]).length,
      teamEndTotal: teamEndToday.length,
    };
  })();
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

  // Force navigate to agreement page if not signed — no other route is accessible.
  // Sign Out lives on the agreement page itself, so we don't need a /profile exception.
  useEffect(() => {
    if (needsAgreement && location.pathname !== '/agreement') {
      navigate('/agreement', { replace: true });
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
  const [buildingOpen, setBuildingOpen] = useState(false);
  const [hideBuilding] = useLocalPref(PREF_HIDE_BUILDING, false);
  const [hideSchedule] = useLocalPref(PREF_HIDE_SCHEDULE, false);
  const [ownerMoreOpen, setOwnerMoreOpen] = useState(false);
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
      {NAV_ITEMS
        .filter((item) => !item.ownerOnly || ownerMode)
        .filter((item) => !(item.id === 'schedule' && hideSchedule))
        .map((item) => {
        const Icon = item.icon;
        const active = isActive(item.path);
        return (
          <button
            key={item.id}
            onClick={() => handleNav(item.path)}
            title={collapsed ? item.label : undefined}
            className={`w-full flex items-center gap-2.5 ${collapsed ? 'justify-center px-2' : 'px-3'} py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
              active
                ? 'bg-brand-light text-brand-text-strong'
                : 'text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer'
            }`}
          >
            <Icon size={15} className="shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </button>
        );
      })}

      {/* Team Daily — single combined "Today" workflow for non-owners */}
      {!ownerMode && (
        <>
          <div className="h-px bg-border-subtle my-3 mx-2" />
          {!collapsed && <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Daily</p>}
          {[
            { id: 't-today', path: '/workflow/team-today', label: 'Today',
              icon: Sunrise,
              done: dailyProgress.teamStartDone + dailyProgress.teamEndDone,
              total: dailyProgress.teamStartTotal + dailyProgress.teamEndTotal },
          ].map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            const allDone = item.total > 0 && item.done === item.total;
            return (
              <button key={item.id} onClick={() => handleNav(item.path)} title={collapsed ? `${item.label} ${item.done}/${item.total}` : undefined}
                className={`w-full flex items-center gap-2.5 ${collapsed ? 'justify-center px-2' : 'px-3'} py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                  active ? 'bg-brand-light text-brand-text-strong' : 'text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer'
                }`}>
                <Icon size={15} className="shrink-0" />
                {!collapsed && (
                  <>
                    <span className="truncate flex-1 text-left">{item.label}</span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${allDone ? 'bg-emerald-100 text-emerald-700' : 'bg-surface-alt text-tertiary'}`}>
                      {item.done}/{item.total}
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </>
      )}

      {/* Non-owner Print Marketing — only if owner has granted access */}
      {!ownerMode && permissions[userEmail]?.tools?.doorHangers && (
        <>
          <div className="h-px bg-border-subtle my-3 mx-2" />
          {!collapsed && <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted inline-flex items-center gap-1.5"><Printer size={11} /> Print Marketing</p>}
          <button onClick={() => handleNav('/print/hangers')} title={collapsed ? 'Door Hangers' : undefined}
            className={`w-full flex items-center gap-2.5 ${collapsed ? 'justify-center px-2' : 'px-3 pl-6'} py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
              isActive('/print/hangers') ? 'bg-brand-light text-brand-text-strong' : 'text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer'
            }`}>
            <DoorOpen size={18} className="shrink-0" />
            {!collapsed && <span className="truncate">Door Hangers</span>}
          </button>
        </>
      )}

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
                className={`w-full flex items-center gap-2.5 ${collapsed ? 'justify-center px-2' : 'px-3'} py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                  active ? 'bg-brand-light text-brand-text-strong' : 'text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer'
                }`}>
                <Icon size={15} className="shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </>
      )}

      {ownerMode && (
        <>
          {/* Building — CRM modules (Clients, Jobs, Quotes, Invoices, etc.).
              Hidden entirely via Settings → Appearance. */}
          {!hideBuilding && <div className="h-px bg-border-subtle my-2 mx-2" />}
          {!hideBuilding && !collapsed && (
            <button onClick={() => setBuildingOpen((o) => !o)}
              className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted hover:text-secondary cursor-pointer">
              <span>Building</span>
              <ChevronDown size={14} className={`transition-transform ${buildingOpen ? 'rotate-180' : ''}`} />
            </button>
          )}
          {!hideBuilding && (buildingOpen || collapsed) && OPERATIONS_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <button key={item.id} onClick={() => handleNav(item.path)} title={collapsed ? item.label : undefined}
                className={`w-full flex items-center gap-2.5 ${collapsed ? 'justify-center px-2' : 'px-3 pl-6'} py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                  active ? 'bg-brand-light text-brand-text-strong' : 'text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer'
                }`}>
                <Icon size={14} className="shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}

          {/* Tools — no longer a collapsible group; these sit flat in the bar
              alongside Home and Schedule. "More" still holds the overflow. */}
          <div className="h-px bg-border-subtle my-3 mx-2" />
          {OWNER_TOOLS_PINNED.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <button key={item.id} onClick={() => handleNav(item.path)} title={collapsed ? item.label : undefined}
                className={`w-full flex items-center gap-2.5 ${collapsed ? 'justify-center px-2' : 'px-3'} py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                  active ? 'bg-brand-light text-brand-text-strong' : 'text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer'
                }`}>
                <Icon size={15} className="shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}

          {!collapsed && (
            <button onClick={() => setOwnerMoreOpen((o) => !o)}
              className="w-full flex items-center justify-between px-3 py-2 mt-1 text-xs font-semibold text-muted hover:text-secondary cursor-pointer">
              <span className="inline-flex items-center gap-2">
                <ChevronRight size={14} className={`transition-transform ${ownerMoreOpen ? 'rotate-90' : ''}`} />
                More
              </span>
            </button>
          )}
          {(ownerMoreOpen || collapsed) && OWNER_TOOLS_MORE.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <button key={item.id} onClick={() => handleNav(item.path)} title={collapsed ? item.label : undefined}
                className={`w-full flex items-center gap-2.5 ${collapsed ? 'justify-center px-2' : 'px-3 pl-6'} py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                  active ? 'bg-brand-light text-brand-text-strong' : 'text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer'
                }`}>
                <Icon size={14} className="shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}

          {/* Print Marketing */}
          <div className="h-px bg-border-subtle my-3 mx-2" />
          {!collapsed && <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted inline-flex items-center gap-1.5"><Printer size={11} /> Print Marketing</p>}
          {[
            { id: 'hangers', path: '/print/hangers', label: 'Door Hangers', icon: DoorOpen },
          ].map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <button key={item.id} onClick={() => handleNav(item.path)} title={collapsed ? item.label : undefined}
                className={`w-full flex items-center gap-2.5 ${collapsed ? 'justify-center px-2' : 'px-3 pl-6'} py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                  active ? 'bg-brand-light text-brand-text-strong' : 'text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer'
                }`}>
                <Icon size={14} className="shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </>
      )}
      </div>
    </nav>
  );

  // ── Locked-down agreement gate: no sidebar, no header, just the agreement page ──
  if (needsAgreement) {
    return (
      <div className="min-h-screen bg-surface">
        <main className="px-4 py-4 sm:px-6 sm:py-8">
          <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-brand-light border-t-brand rounded-full animate-spin" /></div>}>
            <Routes>
              <Route path="/agreement" element={<TeamAgreement />} />
              <Route path="*" element={<Navigate to="/agreement" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* ─── Desktop Sidebar ─── */}
      <aside className={`hidden lg:flex fixed left-0 top-0 h-full ${sidebarCollapsed ? 'w-14' : 'w-52'} bg-surface-alt border-r border-border-subtle z-40 flex-col transition-all duration-200`}>
        {/* Logo */}
        <div className={`h-16 flex items-center gap-2 ${sidebarCollapsed ? 'justify-center px-2' : 'px-4'} border-b border-border-subtle shrink-0`}>
          <img src={'https://assets.cdn.filesafe.space/Umlo2UnfqbijiGqNU6g2/media/6a0c9c767f72486315221b19.png'} alt="Hey Jude's Lawn Care" className={`shrink-0 ${sidebarCollapsed ? 'h-10 w-10 object-contain' : 'h-10'}`} />
        </div>

        {renderSidebarNav(sidebarCollapsed)}

        {/* Profile (non-owner only — owner uses the top-right gear menu) */}
        {!ownerMode && (
          <div className="border-t border-border-subtle p-2 shrink-0">
            <button
              onClick={() => navigate('/profile')}
              title={sidebarCollapsed ? currentUser : undefined}
              className={`w-full flex items-center gap-2.5 ${sidebarCollapsed ? 'justify-center px-2' : 'px-3'} py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
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
          </div>
        )}

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
        <aside className={`absolute left-0 top-0 h-full w-72 bg-surface-alt shadow-2xl flex flex-col transition-transform duration-200 ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <button
            onClick={() => setMobileSidebarOpen(false)}
            className="absolute top-4 right-4 p-1 text-muted hover:text-primary cursor-pointer z-10"
          >
            <X size={20} />
          </button>
          <div className="h-16 flex items-center px-4 border-b border-border-subtle shrink-0">
            <img src="https://assets.cdn.filesafe.space/Umlo2UnfqbijiGqNU6g2/media/6a0c9c767f72486315221b19.png" alt="Hey Jude's Lawn Care" className="h-10 shrink-0" />
          </div>
          {renderSidebarNav(false)}
          <div className="border-t border-border-subtle p-2 shrink-0">
            {!ownerMode && (
              <button
                onClick={() => navigate('/profile')}
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
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
      <main className={`${sidebarCollapsed ? 'lg:ml-14' : 'lg:ml-52'} transition-all duration-200`}>
        {/* Top app bar — biz name · search · icons (Jobber-style) */}
        <div className="sticky top-0 z-30 bg-card border-b border-border-subtle">
          <div className="flex items-center gap-4 px-4 py-2.5">
            <p className="text-sm font-medium text-muted truncate">Hey Jude's Lawn Care</p>
            <div className="ml-auto flex items-center gap-2">
              <div className="relative w-64">
                <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  placeholder="Search"
                  className="w-full pl-9 pr-8 py-1.5 rounded-full bg-surface-alt border border-border-subtle text-xs text-primary placeholder:text-muted focus:outline-none focus:border-brand/50"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted bg-card border border-border-subtle rounded px-1.5 py-0.5">/</span>
              </div>
            <div className="flex items-center gap-1">
              <button title="AI" className="p-1.5 rounded-lg text-muted hover:bg-surface-alt hover:text-primary cursor-pointer">
                <Sparkles size={16} />
              </button>
              <button onClick={() => navigate('/messages')} title="Messages" className="p-1.5 rounded-lg text-muted hover:bg-surface-alt hover:text-primary cursor-pointer">
                <MessageSquare size={16} />
              </button>
              <button title="Notifications" className="relative p-1.5 rounded-lg text-muted hover:bg-surface-alt hover:text-primary cursor-pointer">
                <Bell size={16} />
              </button>
              <button title="Help" className="p-1.5 rounded-lg text-muted hover:bg-surface-alt hover:text-primary cursor-pointer">
                <HelpCircle size={16} />
              </button>
              <TopbarSettingsMenu
                currentUser={currentUser}
                userEmail={user?.email}
                onNav={navigate}
                onSignOut={signOut}
              />
            </div>
            </div>
          </div>
        </div>
        <div className={location.pathname === '/messages' || location.pathname === '/schedule' ? 'px-4 py-3' : 'px-[45px] py-3 sm:py-5'}>
          <Suspense fallback={
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-4 border-brand-light border-t-brand rounded-full animate-spin" />
            </div>
          }>
              <Routes>
                <Route path="/" element={ownerMode ? <OwnerHome /> : <Home />} />
                <Route path="/checklist/:kind/:itemId" element={<ChecklistItem />} />
                <Route path="/workflow/:kind" element={<ChecklistWorkflow />} />
                <Route path="/workflow/:kind/:stepIndex" element={<ChecklistWorkflow />} />
                <Route path="/timesheets" element={<Timesheets />} />
                <Route path="/eyeballs" element={<Eyeballs />} />
                <Route path="/website" element={<Website />} />
                <Route path="/payroll" element={<PayrollBonus />} />
                <Route path="/suppliers" element={<Suppliers />} />
                <Route path="/print/hangers" element={<PrintHangers />} />
                <Route path="/playbooks" element={<HowToGuides ownerMode={ownerMode} allowedPlaybooks={allowedPlaybooks} />} />
                <Route path="/playbooks/:id" element={<PlaybookDetail ownerMode={ownerMode} />} />
                <Route path="/guides" element={<Navigate to="/playbooks" replace />} />
                <Route path="/guides/:id" element={<HowToGuides ownerMode={ownerMode} allowedPlaybooks={allowedPlaybooks} />} />
                <Route path="/p/:slug" element={<PlaybookDetail ownerMode={ownerMode} />} />
                <Route path="/equipment" element={<EquipmentIdeas />} />
                <Route path="/agreement" element={<TeamAgreement />} />
                <Route path="/mowing" element={<MowingSchedule />} />
                <Route path="/sales" element={<Sales />} />
                <Route path="/clients" element={<Clients />} />
                <Route path="/clients/new" element={<NewClient />} />
                <Route path="/clients/:clientNumber" element={<Clients />} />
                <Route path="/clients/:clientNumber/edit" element={<EditClientPage />} />
                <Route path="/quotes" element={<Quotes />} />
                <Route path="/quotes/:quoteNumber" element={<Quotes />} />
                <Route path="/messages" element={<Messages />} />
                <Route path="/requests" element={<Requests />} />
                <Route path="/requests/:requestNumber" element={<Requests />} />
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
                <Route path="/insights/door-hangers" element={<InsightsDoorHangers />} />
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
