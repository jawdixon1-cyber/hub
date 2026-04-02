import { useState, lazy, Suspense } from 'react';
import { GitBranch, Calculator } from 'lucide-react';

const SalesPipeline = lazy(() => import('./SalesPipeline'));
const Quoting = lazy(() => import('./Quoting'));

const TABS = [
  { id: 'quoting', label: 'Quoting', icon: Calculator },
  { id: 'pipeline', label: 'Pipeline', icon: GitBranch },
];

const Loading = () => (
  <div className="flex items-center justify-center py-20">
    <div className="w-8 h-8 border-4 border-brand-light border-t-brand rounded-full animate-spin" />
  </div>
);

export default function Sales() {
  const [tab, setTab] = useState('quoting');

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-surface-alt p-1 rounded-xl overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap flex-1 justify-center ${
                active ? 'bg-card text-primary shadow-sm' : 'text-muted hover:text-secondary'
              }`}>
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      <Suspense fallback={<Loading />}>
        {tab === 'quoting' && <Quoting />}
        {tab === 'pipeline' && <SalesPipeline />}
      </Suspense>
    </div>
  );
}
