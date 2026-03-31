import { useState, lazy, Suspense } from 'react';
import { Crosshair, GitBranch, Calculator, FileText } from 'lucide-react';

const Commander = lazy(() => import('./Commander'));
const SalesPipeline = lazy(() => import('./SalesPipeline'));
const Quoting = lazy(() => import('./Quoting'));
const ServiceAgreement = lazy(() => import('./ServiceAgreement'));

const TABS = [
  { id: 'numbers', label: 'Numbers', icon: Crosshair },
  { id: 'pipeline', label: 'Pipeline', icon: GitBranch },
  { id: 'quoting', label: 'Quoting', icon: Calculator },
  { id: 'agreements', label: 'Agreements', icon: FileText },
];

const Loading = () => (
  <div className="flex items-center justify-center py-20">
    <div className="w-8 h-8 border-4 border-brand-light border-t-brand rounded-full animate-spin" />
  </div>
);

export default function Sales() {
  const [tab, setTab] = useState('numbers');

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 bg-surface-alt p-1 rounded-xl overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                active ? 'bg-card text-primary shadow-sm' : 'text-muted hover:text-secondary'
              }`}>
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <Suspense fallback={<Loading />}>
        {tab === 'numbers' && <Commander />}
        {tab === 'pipeline' && <SalesPipeline />}
        {tab === 'quoting' && <Quoting />}
        {tab === 'agreements' && <ServiceAgreement />}
      </Suspense>
    </div>
  );
}
