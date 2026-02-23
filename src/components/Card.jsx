import { Pencil, Trash2 } from 'lucide-react';

const categoryColors = {
  Quality: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  Safety: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  Conduct: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  Professionalism: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
};

const typeGradients = {
  service: 'from-emerald-500 to-green-700',
  'field-team': 'from-emerald-500 to-green-700',
  equipment: 'from-orange-400 to-amber-700',
  software: 'from-blue-500 to-indigo-700',
  sales: 'from-purple-500 to-purple-700',
  pme: 'from-purple-500 to-purple-700',
  strategy: 'from-slate-500 to-blue-700',
  owner: 'from-slate-500 to-blue-700',
};

function getPreviewText(content) {
  if (!content) return '';
  const stripped = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return stripped.length > 200 ? stripped.slice(0, 200) + '...' : stripped;
}

export default function Card({ item, onClick, onEdit, onDelete, ownerMode, themed }) {
  // Themed mode: gradient bg + title only (for playbooks)
  if (themed) {
    const gradient = typeGradients[item.type] || 'from-gray-500 to-gray-700';
    return (
      <div
        className={`group relative bg-gradient-to-br ${gradient} rounded-2xl shadow-sm cursor-pointer overflow-hidden
                   hover:shadow-lg hover:scale-[1.02] transition-all duration-200 min-h-[120px] flex items-end p-6`}
        onClick={() => onClick(item)}
      >
        {ownerMode && (
          <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(item); }}
              className="p-1.5 rounded-lg bg-white/20 text-white hover:bg-white/30 transition-colors"
            >
              <Pencil size={16} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(item); }}
              className="p-1.5 rounded-lg bg-white/20 text-white hover:bg-white/30 transition-colors"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
        <h3 className="text-lg font-bold text-white drop-shadow-sm">{item.title}</h3>
      </div>
    );
  }

  // Classic mode: white card with category badge + preview text
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
      <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${colorClass}`}>
        {item.category}
      </span>
      <h3 className="mt-3 text-lg font-bold text-primary">{item.title}</h3>
      <p className="mt-2 text-sm text-tertiary line-clamp-3">{getPreviewText(item.content)}</p>
    </div>
  );
}
