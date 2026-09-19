import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { PayrollProvider, usePayroll } from './PayrollContext.jsx';
import Dashboard from './Dashboard.jsx';
import Employees from './Employees.jsx';
import Jobs from './Jobs.jsx';
import JobDetail from './JobDetail.jsx';
import TimeEntries from './TimeEntries.jsx';
import RunPayroll from './RunPayroll.jsx';
import Runs from './Runs.jsx';
import RunDetail from './RunDetail.jsx';
import Reports from './Reports.jsx';
import Sop from './Sop.jsx';
import Settings from './Settings.jsx';

const NAV = [
  ['', 'Dashboard'], ['run', 'Run Payroll'], ['time', 'Time Entries'], ['jobs', 'Jobs'],
  ['employees', 'Employees'], ['runs', 'Past Runs'], ['reports', 'Reports'], ['sop', 'SOP'], ['settings', 'Settings'],
];

function Shell() {
  const p = usePayroll();
  if (p.error) return <div className="p-6 text-red-700">Payroll data failed to load: {p.error}. Has migration 008_payroll.sql been applied?</div>;
  if (p.loading) return <div className="flex items-center gap-2 p-6 text-slate-500"><Loader2 className="animate-spin" size={18} /> Loading payroll…</div>;
  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-[#4d7c0f]">Hey Jude's</div>
          <h1 className="text-2xl font-black">Payroll</h1>
        </div>
        <div className="text-xs text-slate-500">Week ending <b>{p.currentWeekEnding}</b> · target <b>{p.settings.target_pct}%</b></div>
      </div>
      <nav className="mb-6 flex flex-wrap gap-1 border-b">
        {NAV.map(([path, label]) => (
          <NavLink key={path} to={path === '' ? '/payroll' : `/payroll/${path}`} end={path === ''}
            className={({ isActive }) => `-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${isActive ? 'border-[#4d7c0f] text-[#4d7c0f]' : 'border-transparent text-slate-500 hover:text-slate-900'}`}>
            {label}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="run" element={<RunPayroll />} />
        <Route path="run/:weekEnding" element={<RunPayroll />} />
        <Route path="time" element={<TimeEntries />} />
        <Route path="jobs" element={<Jobs />} />
        <Route path="jobs/:id" element={<JobDetail />} />
        <Route path="employees" element={<Employees />} />
        <Route path="runs" element={<Runs />} />
        <Route path="runs/:id" element={<RunDetail />} />
        <Route path="reports" element={<Reports />} />
        <Route path="sop" element={<Sop />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/payroll" replace />} />
      </Routes>
    </div>
  );
}

export default function PayrollApp() {
  return <PayrollProvider><Shell /></PayrollProvider>;
}
