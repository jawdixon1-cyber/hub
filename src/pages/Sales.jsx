import { lazy, Suspense } from 'react';

const Quoting = lazy(() => import('./Quoting'));

const Loading = () => (
  <div className="flex items-center justify-center py-20">
    <div className="w-8 h-8 border-4 border-brand-light border-t-brand rounded-full animate-spin" />
  </div>
);

// Quoting only. The Pipeline tab was removed, which left a single-tab tab bar
// with nothing to switch to — so the bar went too and Quoting renders directly.
export default function Sales() {
  return (
    <Suspense fallback={<Loading />}>
      <Quoting />
    </Suspense>
  );
}
