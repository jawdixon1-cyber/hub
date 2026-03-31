import { lazy, Suspense } from 'react';

const Territory = lazy(() => import('./Dominate'));

const Loading = () => (
  <div className="flex items-center justify-center py-20">
    <div className="w-8 h-8 border-4 border-brand-light border-t-brand rounded-full animate-spin" />
  </div>
);

export default function Marketing() {
  return (
    <Suspense fallback={<Loading />}>
      <Territory />
    </Suspense>
  );
}
