import { useState, useRef, useMemo, useCallback, useEffect, Suspense, lazy } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Lightbulb, Link as LinkIcon, Check } from 'lucide-react';
import { useAppStore } from '../store/AppStoreContext';
import { toSlug } from '../utils/slug';

const RichTextEditor = lazy(() => import('../components/RichTextEditor'));

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
  const [showWhy, setShowWhy] = useState(() => {
    try { return localStorage.getItem('greenteam-showWhy') === 'true'; } catch { return false; }
  });

  // Auto-save debounce
  const saveTimer = useRef(null);
  const save = useCallback((updates) => {
    if (!item) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setGuides(guides.map((g) =>
        g.id === item.id ? { ...g, ...updates } : g
      ));
    }, 600);
  }, [item, guides, setGuides]);

  // Cleanup timer on unmount
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const handleTitleChange = useCallback((e) => {
    const title = e.target.value;
    const type = CATEGORY_TO_TYPE[TYPE_TO_CATEGORY[item?.type] || 'Services'] || 'service';
    save({ title, type, slug: item?.slug || toSlug(title) });
  }, [item, save]);

  const handleCategoryChange = useCallback((e) => {
    const category = e.target.value;
    const type = CATEGORY_TO_TYPE[category] || 'service';
    save({ category, type });
  }, [save]);

  const handleContentChange = useCallback((html) => {
    save({ content: html });
  }, [save]);

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
          onClick={() => navigate('/guides', { state: { tab: location.state?.tab } })}
          className="inline-flex items-center gap-2 text-brand-text hover:text-brand-text-strong font-medium transition-colors"
        >
          <ArrowLeft size={18} />
          Back to Playbooks
        </button>
      </div>
    );
  }

  const category = TYPE_TO_CATEGORY[item.type] || 'Services';

  return (
    <div className="max-w-3xl mx-auto">
      {/* Back button */}
      <button
        onClick={() => navigate('/guides', { state: { tab: location.state?.tab } })}
        className="inline-flex items-center gap-2 text-secondary hover:text-primary font-medium text-sm mb-4 transition-colors"
      >
        <ArrowLeft size={18} />
        Back to Playbooks
      </button>

      {/* Title + controls */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          {ownerMode ? (
            <>
              <select
                value={category}
                onChange={handleCategoryChange}
                className="text-xs font-semibold uppercase tracking-wider text-muted mb-1 bg-transparent border-none outline-none cursor-pointer p-0"
              >
                {ALL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <input
                type="text"
                defaultValue={item.title}
                onChange={handleTitleChange}
                className="text-2xl font-bold text-primary bg-transparent border-none outline-none w-full p-0 focus:ring-0 placeholder-muted"
                placeholder="Playbook title..."
              />
            </>
          ) : (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-1">{item.category}</p>
              <h1 className="text-2xl font-bold text-primary">{item.title}</h1>
            </>
          )}
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
          {!ownerMode && (
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
          )}
        </div>
      </div>

      {/* Content */}
      <div className="pt-4">
        {ownerMode ? (
          <Suspense fallback={<div className="text-tertiary py-4 text-center">Loading editor...</div>}>
            <RichTextEditor
              content={item.content || ''}
              onChange={handleContentChange}
            />
          </Suspense>
        ) : (
          <div
            className="px-2"
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
        )}
      </div>
    </div>
  );
}
