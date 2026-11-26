import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Trees } from 'lucide-react';

const Sales = lazy(() => import('./Sales'));
const Plans = lazy(() => import('./Plans'));

// Landscaping: the quoter and the client base (plans) as tabs on one page.
const TABS = [['quoter', 'Quoter'], ['clients', 'Client Base']];

export default function Landscaping() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'clients' ? 'clients' : 'quoter';
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
        {tab === 'quoter' ? <Sales /> : <Plans />}
      </Suspense>
    </div>
  );
}
