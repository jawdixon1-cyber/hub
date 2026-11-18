import { lazy, Suspense, useState } from 'react';
import { MessageCircle, Mail } from 'lucide-react';

// Personal step: iMessage (from this Mac) and personal Gmail (app password), one at a time.
const QuoTextsStep = lazy(() => import('./QuoTextsStep'));
const EmailStep = lazy(() => import('./EmailStep'));
const TAB_KEY = 'hub-personal-tab';

export default function PersonalStep() {
  const [tab, setTab] = useState(() => { try { return localStorage.getItem(TAB_KEY) || 'texts'; } catch { return 'texts'; } });
  const pick = (t) => { setTab(t); try { localStorage.setItem(TAB_KEY, t); } catch { /* ignore */ } };
  return (
    <div>
      <div className="inline-flex rounded-2xl bg-surface-alt p-1 mb-3">
        {[['texts', 'iMessage', MessageCircle], ['email', 'Personal email', Mail]].map(([k, label, Icon]) => (
          <button key={k} onClick={() => pick(k)}
            className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-sm font-black cursor-pointer ${tab === k ? 'bg-card text-primary' : 'text-muted hover:text-primary'}`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>
      <Suspense fallback={<p className="text-sm text-tertiary">Loading…</p>}>
        {tab === 'texts' ? <QuoTextsStep source="imessage" /> : <EmailStep scope="personal" />}
      </Suspense>
    </div>
  );
}
