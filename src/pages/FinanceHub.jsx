import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';

const WeeklyLog = lazy(() => import('./WeeklyLog'));
const InsightsProfitability = lazy(() => import('./InsightsProfitability'));

const Loading = () => (
  <div className="flex items-center justify-center py-20">
    <div className="w-8 h-8 border-4 border-brand-light border-t-brand rounded-full animate-spin" />
  </div>
);

const TABS = [
  { id: 'payroll', label: 'Payroll & Bonuses' },
  { id: 'jobs', label: 'Job Profitability' },
];

// Finance: payroll (the weekly log) and per-job profitability in one place.
// Lives at /payroll so existing week links (/payroll/:weekEnding) keep working;
// the tab is in the URL (?tab=jobs) so a refresh stays put.
export default function FinanceHub() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'payroll';

  return (
    <>
      <div className="max-w-6xl mx-auto px-4 pt-6">
        <div className="flex gap-1 bg-surface-alt rounded-xl p-1 max-w-md">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setParams(t.id === 'payroll' ? {} : { tab: t.id })}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors cursor-pointer ${
                tab === t.id ? 'bg-card text-primary shadow-sm' : 'text-secondary hover:text-primary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <Suspense fallback={<Loading />}>
        {tab === 'jobs' ? <InsightsProfitability embedded /> : <div className="pt-6"><WeeklyLog /></div>}
      </Suspense>
    </>
  );
}
