import { ExternalLink } from 'lucide-react';

export default function QuickLinks({ links }) {
  if (!links || links.length === 0) return null;

  return (
    <span className="inline-flex items-center gap-1 ml-1.5 align-middle">
      {links.map((link) => (
        <a
          key={link.id}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          title={link.label}
          className="inline-flex items-center justify-center w-5 h-5 rounded text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <ExternalLink size={12} />
        </a>
      ))}
    </span>
  );
}
