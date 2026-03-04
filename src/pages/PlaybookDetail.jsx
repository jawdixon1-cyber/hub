import { useState, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Lightbulb, Pencil, Link as LinkIcon, Check } from 'lucide-react';
import { useAppStore } from '../store/AppStoreContext';
import EditModal from '../components/EditModal';
import { toSlug } from '../utils/slug';

const gradients = {
  Quality: 'from-emerald-500 to-emerald-700',
  Safety: 'from-red-500 to-red-700',
  Conduct: 'from-purple-500 to-purple-700',
  Professionalism: 'from-blue-500 to-blue-700',
  'Service Work': 'from-green-500 to-green-700',
  'Field Team': 'from-emerald-500 to-emerald-700',
  'Equipment & Maintenance': 'from-orange-500 to-orange-700',
  'Equipment Guide': 'from-orange-500 to-orange-700',
  Sales: 'from-purple-500 to-purple-700',
  Owner: 'from-blue-500 to-blue-700',
  Strategy: 'from-blue-500 to-blue-700',
  'Business Idea': 'from-sky-500 to-sky-700',
  Hiring: 'from-indigo-500 to-indigo-700',
  Training: 'from-teal-500 to-teal-700',
  Compensation: 'from-amber-500 to-amber-700',
  'Time Off': 'from-cyan-500 to-cyan-700',
};

const TYPE_TO_CATEGORY = {
  'field-team': 'Services',
  'service': 'Services',
  'equipment': 'Equipment',
  'software': 'Software',
  'sales': 'Executive Assistant',
  'pme': 'Executive Assistant',
  'strategy': 'General Manager',
  'owner': 'General Manager',
};

const CATEGORY_TO_TYPE = {
  'Services': 'service',
  'Equipment': 'equipment',
  'Software': 'software',
  'Executive Assistant': 'sales',
  'General Manager': 'strategy',
};

const ALL_CATEGORIES = ['Services', 'Equipment', 'Software', 'Executive Assistant', 'General Manager'];

export default function PlaybookDetail({ ownerMode }) {
  const { id, slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const guides = useAppStore((s) => s.guides);
  const setGuides = useAppStore((s) => s.setGuides);

  const item = slug
    ? guides.find((g) => (g.slug || toSlug(g.title)) === slug)
    : guides.find((g) => g.id === id);

  const [copied, setCopied] = useState(false);

  const [editing, setEditing] = useState(false);
  const [showWhy, setShowWhy] = useState(() => {
    try { return localStorage.getItem('greenteam-showWhy') === 'true'; } catch { return false; }
  });

  const toggleWhy = () => {
    setShowWhy((v) => {
      const next = !v;
      try { localStorage.setItem('greenteam-showWhy', String(next)); } catch {}
      return next;
    });
  };

  const processedContent = useMemo(() => {
    if (!item?.content || !item.content.includes('<')) return null;

    let html = item.content;
    html = html.replace(/<details open>/g, '<details>');

    if (!showWhy) {
      html = html.replace(/<mark[^>]*>[\s\S]*?<\/mark>/g, '');
    }

    return html;
  }, [item?.content, showWhy]);

  if (!item) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <p className="text-tertiary text-lg mb-4">Playbook not found</p>
        <button
          onClick={() => navigate('/guides')}
          className="inline-flex items-center gap-2 text-brand-text hover:text-brand-text-strong font-medium transition-colors"
        >
          <ArrowLeft size={18} />
          Back to Playbooks
        </button>
      </div>
    );
  }

  const gradient = gradients[item.category] || 'from-gray-500 to-gray-700';

  const handleSave = (form) => {
    const type = CATEGORY_TO_TYPE[form.category] || 'service';
    const slug = form.slug || toSlug(form.title);
    setGuides(guides.map((g) => (g.id === item.id ? { ...g, ...form, type, slug } : g)));
    setEditing(false);
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Back button */}
      <button
        onClick={() => navigate('/guides')}
        className="inline-flex items-center gap-2 text-secondary hover:text-primary font-medium text-sm mb-4 transition-colors"
      >
        <ArrowLeft size={18} />
        Back to Playbooks
      </button>

      {/* Title + controls */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-1">{item.category}</p>
          <h1 className="text-2xl font-bold text-primary">{item.title}</h1>
          <p className="text-xs text-muted font-mono mt-1">/p/{item.slug || toSlug(item.title)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-1">
          <button
            onClick={() => {
              const playBookSlug = item.slug || toSlug(item.title);
              const url = `${window.location.origin}/p/${playBookSlug}`;
              navigator.clipboard.writeText(url).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              });
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              copied
                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                : 'bg-surface-alt text-secondary hover:bg-surface'
            }`}
          >
            {copied ? <Check size={16} /> : <LinkIcon size={16} />}
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
          <button
            onClick={toggleWhy}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              showWhy
                ? 'bg-yellow-400 text-yellow-900'
                : 'bg-surface-alt text-secondary hover:bg-surface'
            }`}
          >
            <Lightbulb size={16} />
            {showWhy ? 'Why: ON' : 'Why: OFF'}
          </button>
          {ownerMode && (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-surface-alt text-secondary hover:bg-surface transition-colors cursor-pointer"
            >
              <Pencil size={16} />
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div
        className="pt-6 px-2"
        onCopy={(e) => {
          const sel = window.getSelection()?.toString();
          if (sel) {
            e.preventDefault();
            e.clipboardData.setData('text/plain', sel.replace(/\n{2,}/g, '\n'));
          }
        }}
      >
        {item.content && item.content.includes('<') ? (
          <div
            style={{ '--why-bg': '#fef08a' }}
            className="playbook-view prose prose-sm prose-neutral dark:prose-invert max-w-none text-primary [&_p]:my-1 [&_p]:text-primary [&_h1]:mt-4 [&_h1]:mb-1 [&_h2]:mt-3 [&_h2]:mb-1 [&_h3]:mt-2 [&_h3]:mb-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0 [&_li]:text-primary [&_img]:rounded-lg [&_img]:max-h-64 [&_img]:object-cover [&_a]:text-blue-600 dark:[&_a]:text-blue-400 [&_a]:underline [&_a:hover]:text-blue-800 dark:[&_a:hover]:text-blue-300 [&_.why-highlight]:bg-yellow-300 [&_.why-highlight]:text-yellow-900 dark:[&_.why-highlight]:bg-yellow-400/30 dark:[&_.why-highlight]:text-yellow-200 [&_.why-highlight]:px-1 [&_.why-highlight]:py-0.5 [&_.why-highlight]:rounded [&_.why-highlight]:font-semibold [&_mark]:bg-yellow-300 [&_mark]:text-yellow-900 [&_mark]:px-1 [&_mark]:py-0.5 [&_mark]:rounded [&_mark]:font-semibold dark:[&_mark]:!bg-yellow-400/30 dark:[&_mark]:!text-yellow-200"
            dangerouslySetInnerHTML={{ __html: processedContent }}
          />
        ) : (
          <p className="text-secondary leading-relaxed whitespace-pre-line">{item.content}</p>
        )}
      </div>

      {/* Edit Modal */}
      {editing && (
        <EditModal
          item={{ ...item, category: TYPE_TO_CATEGORY[item.type] || ALL_CATEGORIES[0] }}
          categories={ALL_CATEGORIES}
          title="Guide"
          richText
          onSave={handleSave}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
