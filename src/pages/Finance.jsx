import { useState, useEffect, useCallback } from 'react';
import {
  DollarSign, TrendingUp, TrendingDown, RefreshCw,
  FileText, CreditCard, ArrowLeft, Link2, AlertCircle,
  ChevronDown, ChevronRight, Calendar,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getTimezone, getTodayInTimezone } from '../utils/timezone';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'pnl', label: 'P&L Report' },
];

function fmt(num) {
  if (num == null || isNaN(num)) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: getTimezone() });
}

// ─── P&L row parser ───
function parsePnLRows(report) {
  if (!report?.Rows?.Row) return { income: [], expenses: [], netIncome: 0, totalIncome: 0, totalExpenses: 0 };

  const sections = { income: [], expenses: [] };
  let totalIncome = 0;
  let totalExpenses = 0;
  let netIncome = 0;

  for (const section of report.Rows.Row) {
    if (section.group === 'Income' || section.Header?.ColData?.[0]?.value === 'Income') {
      if (section.Rows?.Row) {
        for (const row of section.Rows.Row) {
          if (row.ColData) {
            sections.income.push({ name: row.ColData[0]?.value, amount: parseFloat(row.ColData[1]?.value) || 0 });
          }
          if (row.Rows?.Row) {
            for (const sub of row.Rows.Row) {
              if (sub.ColData) {
                sections.income.push({ name: `  ${sub.ColData[0]?.value}`, amount: parseFloat(sub.ColData[1]?.value) || 0 });
              }
            }
          }
        }
      }
      if (section.Summary?.ColData) {
        totalIncome = parseFloat(section.Summary.ColData[1]?.value) || 0;
      }
    }
    if (section.group === 'Expenses' || section.Header?.ColData?.[0]?.value === 'Expenses') {
      if (section.Rows?.Row) {
        for (const row of section.Rows.Row) {
          if (row.ColData) {
            sections.expenses.push({ name: row.ColData[0]?.value, amount: parseFloat(row.ColData[1]?.value) || 0 });
          }
          if (row.Rows?.Row) {
            for (const sub of row.Rows.Row) {
              if (sub.ColData) {
                sections.expenses.push({ name: `  ${sub.ColData[0]?.value}`, amount: parseFloat(sub.ColData[1]?.value) || 0 });
              }
            }
          }
        }
      }
      if (section.Summary?.ColData) {
        totalExpenses = parseFloat(section.Summary.ColData[1]?.value) || 0;
      }
    }
    if (section.group === 'NetIncome' || section.Header?.ColData?.[0]?.value === 'Net Income') {
      if (section.Summary?.ColData) {
        netIncome = parseFloat(section.Summary.ColData[1]?.value) || 0;
      }
    }
  }

  return { income: sections.income, expenses: sections.expenses, netIncome, totalIncome, totalExpenses };
}

export default function Finance() {
  const navigate = useNavigate();
  const { ownerMode } = useAuth();
  const [tab, setTab] = useState('overview');
  const [connected, setConnected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Data
  const [dashboard, setDashboard] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [pnlReport, setPnlReport] = useState(null);

  // Date range for P&L
  const currentYear = new Date().getFullYear();
  const [pnlStart, setPnlStart] = useState(`${currentYear}-01-01`);
  const [pnlEnd, setPnlEnd] = useState(getTodayInTimezone());

  // Check connection
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('qb') === 'success') {
      window.history.replaceState({}, '', '/finance');
    }

    fetch('/api/qb-data?action=status')
      .then((r) => r.json())
      .then((d) => setConnected(d.connected))
      .catch(() => setConnected(false))
      .finally(() => setLoading(false));
  }, []);

  // Load dashboard data when connected
  const loadDashboard = useCallback(async () => {
    if (!connected) return;
    setError(null);
    try {
      const res = await fetch('/api/qb-data?action=dashboard');
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load');
      const data = await res.json();
      setDashboard(data);
    } catch (err) {
      setError(err.message);
    }
  }, [connected]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  // Load invoices
  const loadInvoices = useCallback(async () => {
    if (!connected) return;
    try {
      const res = await fetch('/api/qb-data?action=invoices');
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load');
      const data = await res.json();
      setInvoices(data?.QueryResponse?.Invoice || []);
    } catch (err) {
      setError(err.message);
    }
  }, [connected]);

  // Load expenses
  const loadExpenses = useCallback(async () => {
    if (!connected) return;
    try {
      const res = await fetch('/api/qb-data?action=expenses');
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load');
      const data = await res.json();
      setExpenses(data?.QueryResponse?.Purchase || []);
    } catch (err) {
      setError(err.message);
    }
  }, [connected]);

  // Load P&L
  const loadPnl = useCallback(async () => {
    if (!connected) return;
    try {
      const res = await fetch(`/api/qb-data?action=profit-and-loss&startDate=${pnlStart}&endDate=${pnlEnd}`);
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load');
      const data = await res.json();
      setPnlReport(data);
    } catch (err) {
      setError(err.message);
    }
  }, [connected, pnlStart, pnlEnd]);

  // Load tab data on tab switch
  useEffect(() => {
    if (!connected) return;
    if (tab === 'invoices' && invoices.length === 0) loadInvoices();
    if (tab === 'expenses' && expenses.length === 0) loadExpenses();
    if (tab === 'pnl' && !pnlReport) loadPnl();
  }, [tab, connected, invoices.length, expenses.length, pnlReport, loadInvoices, loadExpenses, loadPnl]);

  if (!ownerMode) {
    return (
      <div className="text-center py-20">
        <p className="text-muted">Owner access required.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-brand-light border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  // ─── Not Connected ───
  if (!connected) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#2ca01c] flex items-center justify-center mx-auto mb-6">
          <span className="text-white text-2xl font-bold">QB</span>
        </div>
        <h1 className="text-2xl font-bold text-primary mb-3">Connect QuickBooks</h1>
        <p className="text-secondary mb-8">
          Link your QuickBooks account to see invoices, expenses, profit & loss, and more — all inside Hub.
        </p>
        <a
          href="/api/qb-data?action=auth"
          onClick={(e) => { e.preventDefault(); window.location.href = '/api/qb-data?action=auth'; }}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#2ca01c] text-white font-semibold hover:bg-[#238a17] transition-colors text-sm"
        >
          <Link2 size={18} />
          Connect QuickBooks
        </a>
      </div>
    );
  }

  // ─── Parse dashboard data ───
  const pnlData = dashboard?.pnl ? parsePnLRows(dashboard.pnl) : null;
  const monthInvList = dashboard?.monthInvoices?.QueryResponse?.Invoice || [];
  const monthExpList = dashboard?.monthExpenses?.QueryResponse?.Purchase || [];

  const monthRevenue = monthInvList.reduce((s, inv) => s + (parseFloat(inv.TotalAmt) || 0), 0);
  const monthExpenseTotal = monthExpList.reduce((s, exp) => s + (parseFloat(exp.TotalAmt) || 0), 0);
  const unpaidInvoices = monthInvList.filter((inv) => parseFloat(inv.Balance) > 0);
  const unpaidTotal = unpaidInvoices.reduce((s, inv) => s + (parseFloat(inv.Balance) || 0), 0);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 rounded-xl hover:bg-surface-alt transition-colors cursor-pointer lg:hidden">
            <ArrowLeft size={20} className="text-secondary" />
          </button>
          <div className="w-10 h-10 rounded-xl bg-[#2ca01c] flex items-center justify-center">
            <DollarSign size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-primary">Finance</h1>
            <p className="text-xs text-muted">QuickBooks data</p>
          </div>
        </div>
        <button
          onClick={() => { setDashboard(null); setInvoices([]); setExpenses([]); setPnlReport(null); loadDashboard(); }}
          className="p-2 rounded-xl hover:bg-surface-alt transition-colors cursor-pointer"
          title="Refresh"
        >
          <RefreshCw size={18} className="text-secondary" />
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-surface-alt rounded-xl p-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors cursor-pointer ${
              tab === t.id
                ? 'bg-card text-primary shadow-sm'
                : 'text-secondary hover:text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── Overview Tab ─── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              label="YTD Revenue"
              value={fmt(pnlData?.totalIncome)}
              icon={TrendingUp}
              color="emerald"
            />
            <KPICard
              label="YTD Expenses"
              value={fmt(pnlData?.totalExpenses)}
              icon={TrendingDown}
              color="red"
            />
            <KPICard
              label="YTD Net Income"
              value={fmt(pnlData?.netIncome)}
              icon={DollarSign}
              color={pnlData?.netIncome >= 0 ? 'emerald' : 'red'}
            />
            <KPICard
              label="Unpaid Invoices"
              value={fmt(unpaidTotal)}
              sub={`${unpaidInvoices.length} outstanding`}
              icon={FileText}
              color="amber"
            />
          </div>

          {/* This Month */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-5">
              <h2 className="text-sm font-bold text-primary mb-4 flex items-center gap-2">
                <FileText size={16} />
                This Month's Invoices
              </h2>
              {monthInvList.length === 0 ? (
                <p className="text-sm text-muted py-4 text-center">No invoices this month yet</p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {monthInvList.slice(0, 10).map((inv) => (
                    <div key={inv.Id} className="flex items-center justify-between py-2 border-b border-border-subtle last:border-0">
                      <div>
                        <p className="text-sm font-medium text-primary">{inv.CustomerRef?.name || 'Customer'}</p>
                        <p className="text-xs text-muted">{fmtDate(inv.TxnDate)} &middot; #{inv.DocNumber || inv.Id}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-primary">{fmt(inv.TotalAmt)}</p>
                        {parseFloat(inv.Balance) > 0 ? (
                          <p className="text-xs text-amber-600 dark:text-amber-400">Due: {fmt(inv.Balance)}</p>
                        ) : (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400">Paid</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-border-subtle flex justify-between text-sm">
                <span className="text-muted">Month Total</span>
                <span className="font-bold text-primary">{fmt(monthRevenue)}</span>
              </div>
            </div>

            <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-5">
              <h2 className="text-sm font-bold text-primary mb-4 flex items-center gap-2">
                <CreditCard size={16} />
                This Month's Expenses
              </h2>
              {monthExpList.length === 0 ? (
                <p className="text-sm text-muted py-4 text-center">No expenses this month yet</p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {monthExpList.slice(0, 10).map((exp) => (
                    <div key={exp.Id} className="flex items-center justify-between py-2 border-b border-border-subtle last:border-0">
                      <div>
                        <p className="text-sm font-medium text-primary">
                          {exp.EntityRef?.name || exp.AccountRef?.name || 'Expense'}
                        </p>
                        <p className="text-xs text-muted">{fmtDate(exp.TxnDate)}</p>
                      </div>
                      <p className="text-sm font-semibold text-red-600 dark:text-red-400">-{fmt(exp.TotalAmt)}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-border-subtle flex justify-between text-sm">
                <span className="text-muted">Month Total</span>
                <span className="font-bold text-red-600 dark:text-red-400">-{fmt(monthExpenseTotal)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Invoices Tab ─── */}
      {tab === 'invoices' && (
        <div className="bg-card rounded-2xl shadow-sm border border-border-subtle">
          <div className="p-5 border-b border-border-subtle">
            <h2 className="text-sm font-bold text-primary">Recent Invoices</h2>
          </div>
          {invoices.length === 0 ? (
            <div className="p-8 text-center">
              <RefreshCw size={20} className="text-muted mx-auto mb-2 animate-spin" />
              <p className="text-sm text-muted">Loading invoices...</p>
            </div>
          ) : (
            <div className="divide-y divide-border-subtle">
              {invoices.map((inv) => (
                <div key={inv.Id} className="px-5 py-3 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-primary truncate">{inv.CustomerRef?.name || 'Customer'}</p>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                        parseFloat(inv.Balance) === 0
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : inv.DueDate && new Date(inv.DueDate) < new Date()
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                      }`}>
                        {parseFloat(inv.Balance) === 0 ? 'Paid' : inv.DueDate && new Date(inv.DueDate) < new Date() ? 'Overdue' : 'Open'}
                      </span>
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      #{inv.DocNumber || inv.Id} &middot; {fmtDate(inv.TxnDate)}
                      {inv.DueDate ? ` &middot; Due ${fmtDate(inv.DueDate)}` : ''}
                    </p>
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-sm font-semibold text-primary">{fmt(inv.TotalAmt)}</p>
                    {parseFloat(inv.Balance) > 0 && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">Bal: {fmt(inv.Balance)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Expenses Tab ─── */}
      {tab === 'expenses' && (
        <div className="bg-card rounded-2xl shadow-sm border border-border-subtle">
          <div className="p-5 border-b border-border-subtle">
            <h2 className="text-sm font-bold text-primary">Recent Expenses</h2>
          </div>
          {expenses.length === 0 ? (
            <div className="p-8 text-center">
              <RefreshCw size={20} className="text-muted mx-auto mb-2 animate-spin" />
              <p className="text-sm text-muted">Loading expenses...</p>
            </div>
          ) : (
            <div className="divide-y divide-border-subtle">
              {expenses.map((exp) => (
                <div key={exp.Id} className="px-5 py-3 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-primary truncate">
                      {exp.EntityRef?.name || exp.AccountRef?.name || 'Expense'}
                    </p>
                    <p className="text-xs text-muted mt-0.5">
                      {fmtDate(exp.TxnDate)}
                      {exp.PaymentType ? ` · ${exp.PaymentType}` : ''}
                      {exp.Line?.[0]?.Description ? ` · ${exp.Line[0].Description}` : ''}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-red-600 dark:text-red-400 ml-4">-{fmt(exp.TotalAmt)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── P&L Tab ─── */}
      {tab === 'pnl' && (
        <div className="space-y-4">
          {/* Date Range */}
          <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-4 flex flex-wrap items-center gap-3">
            <Calendar size={16} className="text-muted" />
            <input
              type="date"
              value={pnlStart}
              onChange={(e) => { setPnlStart(e.target.value); setPnlReport(null); }}
              className="px-3 py-1.5 rounded-lg bg-surface border border-border-subtle text-sm text-primary"
            />
            <span className="text-muted text-sm">to</span>
            <input
              type="date"
              value={pnlEnd}
              onChange={(e) => { setPnlEnd(e.target.value); setPnlReport(null); }}
              className="px-3 py-1.5 rounded-lg bg-surface border border-border-subtle text-sm text-primary"
            />
            <button
              onClick={() => { setPnlReport(null); loadPnl(); }}
              className="px-4 py-1.5 rounded-lg bg-brand text-on-brand text-sm font-semibold hover:bg-brand-hover transition-colors cursor-pointer"
            >
              Run Report
            </button>
          </div>

          {!pnlReport ? (
            <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-8 text-center">
              <RefreshCw size={20} className="text-muted mx-auto mb-2 animate-spin" />
              <p className="text-sm text-muted">Loading P&L report...</p>
            </div>
          ) : (
            <PnLDisplay report={pnlReport} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── KPI Card ───
function KPICard({ label, value, sub, icon: Icon, color }) {
  const colors = {
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  };

  return (
    <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colors[color]}`}>
          <Icon size={16} />
        </div>
        <span className="text-xs text-muted font-medium">{label}</span>
      </div>
      <p className="text-lg font-bold text-primary">{value}</p>
      {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── P&L Display ───
function PnLDisplay({ report }) {
  const data = parsePnLRows(report);
  const [incomeOpen, setIncomeOpen] = useState(true);
  const [expensesOpen, setExpensesOpen] = useState(true);

  return (
    <div className="bg-card rounded-2xl shadow-sm border border-border-subtle overflow-hidden">
      <div className="p-5 border-b border-border-subtle">
        <h2 className="text-sm font-bold text-primary">Profit & Loss Statement</h2>
        <p className="text-xs text-muted mt-0.5">
          {report?.Header?.StartPeriod || ''} — {report?.Header?.EndPeriod || ''}
        </p>
      </div>

      {/* Income Section */}
      <div className="border-b border-border-subtle">
        <button
          onClick={() => setIncomeOpen((v) => !v)}
          className="w-full px-5 py-3 flex items-center justify-between bg-emerald-50 dark:bg-emerald-900/10 cursor-pointer"
        >
          <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
            {incomeOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Income
          </span>
          <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{fmt(data.totalIncome)}</span>
        </button>
        {incomeOpen && data.income.length > 0 && (
          <div className="divide-y divide-border-subtle">
            {data.income.map((row, i) => (
              <div key={i} className="px-5 py-2 flex items-center justify-between">
                <span className="text-sm text-primary">{row.name}</span>
                <span className="text-sm text-primary">{fmt(row.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Expenses Section */}
      <div className="border-b border-border-subtle">
        <button
          onClick={() => setExpensesOpen((v) => !v)}
          className="w-full px-5 py-3 flex items-center justify-between bg-red-50 dark:bg-red-900/10 cursor-pointer"
        >
          <span className="text-sm font-bold text-red-700 dark:text-red-300 flex items-center gap-2">
            {expensesOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Expenses
          </span>
          <span className="text-sm font-bold text-red-700 dark:text-red-300">{fmt(data.totalExpenses)}</span>
        </button>
        {expensesOpen && data.expenses.length > 0 && (
          <div className="divide-y divide-border-subtle">
            {data.expenses.map((row, i) => (
              <div key={i} className="px-5 py-2 flex items-center justify-between">
                <span className="text-sm text-primary">{row.name}</span>
                <span className="text-sm text-red-600 dark:text-red-400">{fmt(row.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Net Income */}
      <div className="px-5 py-4 flex items-center justify-between bg-surface-alt">
        <span className="text-sm font-bold text-primary">Net Income</span>
        <span className={`text-lg font-bold ${data.netIncome >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {fmt(data.netIncome)}
        </span>
      </div>
    </div>
  );
}
