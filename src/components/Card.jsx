import { Pencil, Trash2 } from 'lucide-react';

const categoryColors = {
  Quality: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  Safety: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  Conduct: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  Professionalism: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'Service Work': 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  'Field Team': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'Equipment & Maintenance': 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  'Equipment Guide': 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  'Software': 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  Sales: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  Owner: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  Strategy: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'Business Idea': 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  Hiring: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  Training: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  Compensation: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'Time Off': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
};

function getPreviewText(content) {
  if (!content) return '';
  const stripped = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return stripped.length > 200 ? stripped.slice(0, 200) + '...' : stripped;
}

export default function Card({ item, onClick, onEdit, onDelete, ownerMode, hideCategory }) {
  const colorClass = categoryColors[item.category] || 'bg-surface-alt text-secondary';

  return (
    <div
      className="group relative bg-card rounded-2xl shadow-sm border border-border-subtle p-6 cursor-pointer overflow-hidden
                 hover:shadow-lg hover:scale-[1.02] transition-all duration-200"
      onClick={() => onClick(item)}
    >
      {ownerMode && (
        <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(item); }}
            className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/40 dark:text-blue-400 dark:hover:bg-blue-900/60 transition-colors"
          >
            <Pencil size={16} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(item); }}
            className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/40 dark:text-red-400 dark:hover:bg-red-900/60 transition-colors"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}
      {!hideCategory && (
        <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${colorClass}`}>
          {item.category}
        </span>
      )}
      <h3 className={`${hideCategory ? '' : 'mt-3 '}text-lg font-bold text-primary`}>{item.title}</h3>
      <p className="mt-2 text-sm text-tertiary line-clamp-3">{getPreviewText(item.content)}</p>
      <p className="mt-2 text-[10px] text-muted">{(JSON.stringify(item).length / 1024).toFixed(1)} KB</p>
    </div>
  );
}
