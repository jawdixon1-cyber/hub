import { useState, useEffect, useMemo } from 'react';
import { Loader2, AlertCircle, Link2, TrendingUp, TrendingDown, Minus, Lightbulb, ArrowRight } from 'lucide-react';
import { getTodayInTimezone, toDateStringInTimezone } from '../utils/timezone';

function fmt(d) { return toDateStringInTimezone(d); }

const SOURCE_COLORS = ['bg-brand', 'bg-blue-500', 'bg-purple-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-orange-500'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── Generate coaching actions ──

function generateActions(sources, totalLeads, prevLeads, missingSourceLeads) {
  const actions = [];
  const real = sources.filter(s => s.source !== 'No Source Set' && s.source !== 'Returning Client');

  if (real.length > 0) {
    const best = real[0];
    const pct = totalLeads > 0 ? Math.round((best.leads / totalLeads) * 100) : 0;
    actions.push({ text: `${best.source} is your #1 source (${pct}%). Double down here.`, type: 'success' });
  }

  if (missingSourceLeads.length > 0) {
    actions.push({ text: `${missingSourceLeads.length} request${missingSourceLeads.length > 1 ? 's' : ''} have no source set. Fix in Jobber so you know what's working.`, type: 'warning' });
  }

  if (prevLeads > 0 && totalLeads < prevLeads * 0.8) {
    const drop = Math.round((1 - totalLeads / prevLeads) * 100);
    actions.push({ text: `Requests are down ${drop}% vs last month. Time to push marketing.`, type: 'danger' });
  } else if (prevLeads > 0 && totalLeads > prevLeads * 1.2) {
    const gain = Math.round((totalLeads / prevLeads - 1) * 100);
    actions.push({ text: `Requests are up ${gain}% vs last month — keep it going.`, type: 'success' });
  }

  const referrals = sources.find(s => s.source === 'Referral');
  if (!referrals || referrals.leads === 0) {
    actions.push({ text: `Zero referral leads. Ask your top clients — "Know anyone who needs lawn care?"`, type: 'action' });
  }

  if (totalLeads > 0 && totalLeads < 5) {
    actions.push({ text: `Only ${totalLeads} request${totalLeads > 1 ? 's' : ''}. Post on Nextdoor, ask for Google reviews, put out yard signs.`, type: 'action' });
  }

  return actions.slice(0, 4);
}

// ══════════════════════════════════════════
//  SOURCES VIEW — one smart view, no dropdown
// ══════════════════════════════════════════

function SourcesView() {
  const [data, setData] = useState(null);
  const [prevData, setPrevData] = useState(null);
  const [ytdData, setYtdData] = useState(null);
  const [monthlyData, setMonthlyData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [disconnected, setDisconnected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setDisconnected(false);

    const todayStr = getTodayInTimezone();
    const today = new Date(todayStr + 'T00:00:00');
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const monthStart = fmt(new Date(today.getFullYear(), today.getMonth(), 1));
    const prevMonthStart = fmt(new Date(today.getFullYear(), today.getMonth() - 1, 1));
    const yearStart = fmt(new Date(today.getFullYear(), 0, 1));
    const end = fmt(tomorrow);

    // Fetch: this month, last month, YTD (for seasonal chart + total)
    Promise.all([
      fetch(`/api/commander/summary?start=${monthStart}&end=${end}`)
        .then(res => {
          if (!res.ok) return res.json().catch(() => ({})).then(e => {
            if (res.status === 401 || e.code === 'JOBBER_DISCONNECTED') { setDisconnected(true); return null; }
            throw new Error(e.error || `HTTP ${res.status}`);
          });
          return res.json();
        }),
      fetch(`/api/commander/summary?start=${prevMonthStart}&end=${monthStart}`)
        .then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`/api/commander/summary?start=${yearStart}&end=${end}`)
        .then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([current, prev, ytd]) => {
      if (cancelled) return;
      setData(current);
      setPrevData(prev);
      setYtdData(ytd);

      // Build monthly breakdown from YTD trends
      if (ytd?.trends?.weeklyNetGrowth) {
        const byMonth = {};
        for (const w of ytd.trends.weeklyNetGrowth) {
          const d = new Date(w.weekStart + 'T00:00:00');
          const key = d.getMonth();
          byMonth[key] = (byMonth[key] || 0) + (w.leads || 0);
        }
        setMonthlyData(byMonth);
      }
    }).catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  if (disconnected) {
    return (
      <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-6 text-center space-y-2">
        <p className="text-sm font-bold text-amber-500">Jobber Disconnected</p>
        <p className="text-xs text-muted">Reconnect in Settings to see lead data.</p>
        <a href="/settings" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 text-black text-xs font-bold"><Link2 size={14} /> Settings</a>
      </div>
    );
  }
  if (loading) return <div className="flex justify-center py-20"><Loader2 size={20} className="animate-spin text-brand" /></div>;
  if (error) return <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-xs"><AlertCircle size={14} />{error}</div>;
  if (!data) return null;

  const thisMonthLeads = data.kpis?.newLeads || 0;
  const prevLeads = prevData?.kpis?.newLeads || 0;
  const ytdLeads = ytdData?.kpis?.newLeads || 0;

  // If this month is empty (e.g. first of the month), show last month as hero
  const showPrevAsHero = thisMonthLeads === 0 && prevLeads > 0;
  const heroData = showPrevAsHero ? prevData : data;
  const heroLabel = showPrevAsHero ? 'Last Month' : 'This Month';
  const totalLeads = heroData?.kpis?.newLeads || 0;
  const compareLeads = showPrevAsHero ? null : prevLeads; // don't compare when showing prev

  const sourceTable = heroData?.sourceTable || [];
  const missingSourceLeads = heroData?.missingSourceLeads || [];

  const sorted = [...sourceTable].sort((a, b) => {
    if (a.source === 'No Source Set') return 1;
    if (b.source === 'No Source Set') return -1;
    return b.leads - a.leads;
  });

  const diff = compareLeads != null && compareLeads > 0 ? totalLeads - compareLeads : 0;
  const diffPct = compareLeads != null && compareLeads > 0 ? Math.round(((totalLeads - compareLeads) / compareLeads) * 100) : 0;
  const bestSource = sorted.find(s => s.source !== 'No Source Set' && s.source !== 'Returning Client');

  const actions = generateActions(sorted, totalLeads, compareLeads || 0, missingSourceLeads);

  // Monthly chart data
  const currentMonth = new Date().getMonth();
  const months = [];
  for (let i = 0; i <= currentMonth; i++) {
    months.push({ label: MONTH_LABELS[i], value: monthlyData[i] || 0, current: i === currentMonth });
  }
  const maxMonth = Math.max(...months.map(m => m.value), 1);

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="bg-card rounded-2xl border border-border-subtle p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold text-muted uppercase tracking-widest">{heroLabel}</p>
            <p className="text-4xl font-black text-primary mt-1">{totalLeads} <span className="text-lg text-muted font-medium">requests</span></p>
            {compareLeads != null && compareLeads > 0 && (
              <div className="flex items-center gap-1.5 mt-1">
                {diff > 0 && <TrendingUp size={14} className="text-emerald-500" />}
                {diff < 0 && <TrendingDown size={14} className="text-red-500" />}
                {diff === 0 && <Minus size={14} className="text-muted" />}
                <span className={`text-xs font-bold ${diff > 0 ? 'text-emerald-500' : diff < 0 ? 'text-red-500' : 'text-muted'}`}>
                  {diff > 0 ? '+' : ''}{diff} ({diff > 0 ? '+' : ''}{diffPct}%) vs prior month
                </span>
              </div>
            )}
          </div>
          <div className="text-right space-y-2">
            {bestSource && (
              <div>
                <p className="text-[10px] font-bold text-muted uppercase tracking-widest">#1 Source</p>
                <p className="text-sm font-black text-primary">{bestSource.source}</p>
              </div>
            )}
            {ytdLeads > 0 && (
              <div>
                <p className="text-[10px] font-bold text-muted uppercase tracking-widest">YTD Total</p>
                <p className="text-sm font-black text-primary">{ytdLeads}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Coaching actions */}
      {actions.length > 0 && (
        <div className="rounded-2xl border-2 border-brand/30 bg-card p-4 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Lightbulb size={14} className="text-brand" />
            <p className="text-[10px] font-black text-brand uppercase tracking-widest">What To Do</p>
          </div>
          {actions.map((a, i) => (
            <div key={i} className="flex items-start gap-2">
              <ArrowRight size={12} className={`shrink-0 mt-0.5 ${
                a.type === 'success' ? 'text-emerald-500' : a.type === 'danger' ? 'text-red-500' : a.type === 'warning' ? 'text-amber-500' : 'text-brand'
              }`} />
              <p className="text-xs text-primary leading-relaxed">{a.text}</p>
            </div>
          ))}
        </div>
      )}

      {/* Source breakdown */}
      {sorted.length > 0 && (
        <div className="bg-card rounded-2xl border border-border-subtle p-4 space-y-3">
          <p className="text-[10px] font-black text-muted uppercase tracking-widest">Where They Come From</p>
          <div className="w-full h-3 rounded-full overflow-hidden flex">
            {sorted.map((row, i) => {
              const w = totalLeads > 0 ? (row.leads / totalLeads) * 100 : 0;
              return <div key={row.source} className={`${row.source === 'No Source Set' ? 'bg-red-500/70' : SOURCE_COLORS[i % SOURCE_COLORS.length]} transition-all`} style={{ width: `${w}%` }} />;
            })}
          </div>
          <div className="space-y-1.5">
            {sorted.map((row, i) => {
              const pctVal = totalLeads > 0 ? Math.round((row.leads / totalLeads) * 100) : 0;
              const isMissing = row.source === 'No Source Set';
              return (
                <div key={row.source} className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-sm shrink-0 ${isMissing ? 'bg-red-500/70' : SOURCE_COLORS[i % SOURCE_COLORS.length]}`} />
                  <span className={`text-xs flex-1 ${isMissing ? 'text-red-400 font-semibold' : 'text-primary font-medium'}`}>{row.source}</span>
                  <span className="text-xs font-bold text-primary">{row.leads}</span>
                  <span className="text-[10px] text-muted w-8 text-right">{pctVal}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Season: monthly bar chart */}
      {months.length > 1 && (
        <div className="bg-card rounded-2xl border border-border-subtle p-4">
          <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-3">{new Date().getFullYear()} Season</p>
          <div className="flex items-end gap-2" style={{ height: '120px' }}>
            {months.map((m, i) => {
              const pct = maxMonth > 0 ? (m.value / maxMonth) * 100 : 0;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] font-bold text-primary">{m.value > 0 ? m.value : ''}</span>
                  <div className="w-full flex-1 flex items-end">
                    <div className={`w-full rounded-t-md transition-all duration-500 ${m.current ? 'bg-brand' : 'bg-blue-500/50'}`}
                      style={{ height: `${Math.max(pct, m.value > 0 ? 4 : 0)}%` }} />
                  </div>
                  <span className="text-[9px] text-muted font-bold">{m.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════
//  MAIN — single view, no tabs
// ══════════════════════════════════════════

export default function Marketing() {
  return <SourcesView />;
}
