import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';

const Quoting = lazy(() => import('./Quoting'));

const Loading = () => (
  <div className="flex items-center justify-center py-20">
    <div className="w-8 h-8 border-4 border-brand-light border-t-brand rounded-full animate-spin" />
  </div>
);

const TABS = [
  { id: 'plan', label: 'Plan' },
  { id: 'one-time', label: 'One-Time' },
  { id: 'measure', label: 'Measurer' },
];

// Plan quotes and one-time quotes are separate calculators; Measurer just maps
// a property and saves it to the client. The tab lives in the
// URL (?tab=one-time, ?tab=measure) so a refresh or shared link lands on the same one.
export default function Sales() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'plan';

  return (
    <>
      <div className="max-w-2xl mx-auto flex gap-1 mt-6 bg-surface-alt rounded-xl p-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setParams(t.id === 'plan' ? {} : { tab: t.id })}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors cursor-pointer ${
              tab === t.id
                ? 'bg-card text-primary shadow-sm'
                : 'text-secondary hover:text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <Suspense fallback={<Loading />}>
        {/* Keyed so each tab keeps its own in-progress quote instead of sharing state. */}
        <Quoting key={tab} mode={tab} />
      </Suspense>
    </>
  );
}
