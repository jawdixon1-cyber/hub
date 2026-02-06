import { useRef, useState, useMemo } from 'react';
import { X, Lightbulb } from 'lucide-react';

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

export default function ViewModal({ item, onClose }) {
  if (!item) return null;
  const gradient = gradients[item.category] || 'from-gray-500 to-gray-700';

  const mouseDownTarget = useRef(null);
  const [showWhy, setShowWhy] = useState(false);

  // Process content to handle "why" portions (text after em dashes)
  const processedContent = useMemo(() => {
    if (!item.content || !item.content.includes('<')) return null;

    let html = item.content;

    if (showWhy) {
      // Highlight the "why" portions (text after — em dash)
      html = html.replace(/—\s*([^<]+)(?=<|$)/g, '— <span class="why-highlight">$1</span>');
    } else {
      // Hide the "why" portions
      html = html.replace(/\s*—\s*[^<]+(?=<|$)/g, '');
    }

    return html;
  }, [item.content, showWhy]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => { mouseDownTarget.current = e.target; }}
      onMouseUp={(e) => {
        if (e.target === e.currentTarget && mouseDownTarget.current === e.currentTarget) {
          onClose();
        }
        mouseDownTarget.current = null;
      }}
    >
      <div
        className="bg-card rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
      >
        <div className={`bg-gradient-to-r ${gradient} px-8 py-6 relative`}>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
          <div className="flex items-center justify-between">
            <div>
              <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full bg-white/20 text-white">
                {item.category}
              </span>
              <h2 className="mt-3 text-2xl font-bold text-white">{item.title}</h2>
            </div>
            <button
              onClick={() => setShowWhy((v) => !v)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                showWhy
                  ? 'bg-yellow-400 text-yellow-900'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              <Lightbulb size={16} />
              {showWhy ? 'Why: ON' : 'Why: OFF'}
            </button>
          </div>
        </div>
        <div
          className="p-8 overflow-y-auto"
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
              className="prose prose-sm max-w-none text-secondary [&_p]:my-1 [&_h1]:mt-4 [&_h1]:mb-1 [&_h2]:mt-3 [&_h2]:mb-1 [&_h3]:mt-2 [&_h3]:mb-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0 [&_img]:rounded-lg [&_img]:max-h-64 [&_img]:object-cover [&_a]:text-blue-600 [&_a]:underline [&_a:hover]:text-blue-800 [&_.why-highlight]:bg-yellow-100 [&_.why-highlight]:text-yellow-800 [&_.why-highlight]:px-1 [&_.why-highlight]:py-0.5 [&_.why-highlight]:rounded [&_.why-highlight]:font-medium"
              dangerouslySetInnerHTML={{ __html: processedContent }}
            />
          ) : (
            <p className="text-secondary leading-relaxed whitespace-pre-line">{item.content}</p>
          )}
        </div>
      </div>
    </div>
  );
}
