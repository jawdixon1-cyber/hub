import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Trees } from 'lucide-react';

const Sales = lazy(() => import('./Sales'));
const Plans = lazy(() => import('./Plans'));

// Landscaping: one-time jobs, the quoter, and the client base (plans) as tabs on one page.
const TABS = [['jobs', 'Jobs'], ['quoter', 'Quoter'], ['clients', 'Client Base']];
const LIGHTS = /\b(lights?|lites?|lighting)\b|christmas|holiday|wreath|garland|\bc9\b/i;
const money = (n) => `$${Math.round(n || 0).toLocaleString()}`;
const STATUS = { upcoming: ['Upcoming', 'text-sky-400'], today: ['Today', 'text-emerald-400'], late: ['Late', 'text-red-400'], action_required: ['Needs invoicing', 'text-amber-400'], archived: ['Done', 'text-muted'] };

// One-time landscaping jobs from Jobber (no recurring plans, no Christmas lights), newest first, grouped by month.
function LandscapeJobs() {
  const [plans, setPlans] = useState(null);
  const [recent, setRecent] = useState([]);
  useEffect(() => {
    fetch('/api/jobber-data?action=plans').then((r) => r.json()).then(setPlans).catch(() => setPlans({}));
    // Lights jobs often have a blank job title; their visit titles say "Christmas Lights", so check those too.
    fetch('/api/jobber-data?action=recent-jobs').then((r) => r.json()).then((d) => setRecent(d?.jobs || [])).catch(() => {});
  }, []);
  const groups = useMemo(() => {
    if (!plans) return null;
    const lightsIds = new Set(recent.filter((j) => LIGHTS.test(`${j.title} ${(j.visits || []).map((v) => v.title).join(' ')}`)).map((j) => j.id));
    const jobs = (plans.clients || []).flatMap((c) => c.jobs.map((j) => ({ ...j, client: c.name })))
      .filter((j) => !j.recurring && j.total > 0 && !lightsIds.has(j.id) && !LIGHTS.test(j.title || ''))
      .sort((a, b) => (b.startAt || '').localeCompare(a.startAt || ''));
    const by = new Map();
    for (const j of jobs) {
      const d = j.startAt ? new Date(j.startAt) : null;
      const key = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : 'none';
      const label = d ? d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'No date';
      if (!by.has(key)) by.set(key, { key, label, jobs: [], total: 0 });
      const g = by.get(key); g.jobs.push(j); g.total += j.total;
    }
    return [...by.values()];
  }, [plans, recent]);

  if (!groups) return <div className="py-20 text-center text-muted text-sm">Loading jobs from Jobber…</div>;
  if (!groups.length) return <div className="py-20 text-center text-muted text-sm">No landscaping jobs yet.</div>;
  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {groups.map((g) => (
        <div key={g.key} className="rounded-xl border border-border-subtle bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle">
            <p className="font-bold text-primary">{g.label}</p>
            <p className="text-sm text-secondary"><b className="text-primary">{money(g.total)}</b> · {g.jobs.length} job{g.jobs.length === 1 ? '' : 's'}</p>
          </div>
          {g.jobs.map((j) => {
            const [st, stC] = STATUS[j.status] || [j.status, 'text-muted'];
            return (
              <div key={j.id} className="flex items-center gap-3 px-4 py-2.5 border-t border-border-subtle first:border-t-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-primary truncate">{j.client} <span className="text-muted font-normal">#{j.jobNumber}</span></p>
                  <p className="text-xs text-tertiary truncate">{j.title || 'Untitled job'}{j.startAt ? ` · ${new Date(j.startAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</p>
                </div>
                <span className={`text-xs font-semibold ${stC}`}>{st}</span>
                <span className="w-20 text-right text-sm font-bold text-primary tabular-nums">{money(j.total)}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function Landscaping() {
  const [params, setParams] = useSearchParams();
  const tab = ['clients', 'quoter'].includes(params.get('tab')) ? params.get('tab') : 'jobs';
  return (
    <div className="space-y-5">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-primary flex items-center gap-2"><Trees size={24} className="text-brand" /> Landscaping</h1>
        <div className="flex gap-1 bg-surface-alt rounded-lg p-1">
          {TABS.map(([id, label]) => (
            <button key={id} onClick={() => setParams({ tab: id }, { replace: true })}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold cursor-pointer ${tab === id ? 'bg-card text-primary shadow-sm' : 'text-secondary hover:text-primary'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <Suspense fallback={<div className="py-20 text-center text-muted text-sm">Loading…</div>}>
        {tab === 'jobs' ? <LandscapeJobs /> : tab === 'quoter' ? <Sales /> : <Plans />}
      </Suspense>
    </div>
  );
}
