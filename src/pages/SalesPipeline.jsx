import { useState, useEffect } from 'react';
import {
  RefreshCw,
  Clock,
  AlertTriangle,
  DollarSign,
  ChevronRight,
  Inbox,
  ClipboardList,
  FileText,
  Send,
  Trophy,
} from 'lucide-react';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';

const STAGE_CONFIG = {
  new_request: { icon: Inbox, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', dot: 'bg-blue-400' },
  assessment_scheduled: { icon: ClipboardList, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', dot: 'bg-amber-400' },
  quote_draft: { icon: FileText, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20', dot: 'bg-purple-400' },
  awaiting_response: { icon: Send, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', dot: 'bg-orange-400' },
  won: { icon: Trophy, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', dot: 'bg-emerald-400' },
};

function SalesPipeline() {
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchPipeline(refresh = false) {
    try {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const url = `${API_BASE}/api/commander/summary?view=pipeline${refresh ? '&refresh=1' : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStages(data.stages || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { fetchPipeline(); }, []);

  const totalOpen = stages
    .filter(s => s.id !== 'won')
    .reduce((sum, s) => sum + s.cards.length, 0);
  const totalValue = stages
    .filter(s => s.id !== 'won')
    .reduce((sum, s) => sum + s.cards.reduce((cs, c) => cs + (c.total || 0), 0), 0);
  const wonValue = stages
    .find(s => s.id === 'won')?.cards
    .reduce((sum, c) => sum + (c.total || 0), 0) || 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-brand-light border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-red-400 mb-4">Failed to load pipeline: {error}</p>
        <button onClick={() => fetchPipeline()} className="px-4 py-2 bg-brand text-on-brand rounded-lg font-medium cursor-pointer">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Sales Pipeline</h1>
          <p className="text-sm text-tertiary mt-1">
            {totalOpen} open {totalOpen === 1 ? 'deal' : 'deals'}
            {totalValue > 0 && <> &middot; ${Math.round(totalValue).toLocaleString()} pending</>}
            {wonValue > 0 && <> &middot; <span className="text-emerald-400">${Math.round(wonValue).toLocaleString()} won</span></>}
          </p>
        </div>
        <button
          onClick={() => fetchPipeline(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border-subtle text-secondary hover:text-primary transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          <span className="text-sm hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* Kanban columns — horizontal scroll on mobile, grid on desktop */}
      <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-5">
        {stages.map(stage => {
          const config = STAGE_CONFIG[stage.id] || STAGE_CONFIG.new_request;
          const Icon = config.icon;
          const stageValue = stage.cards.reduce((s, c) => s + (c.total || 0), 0);

          return (
            <div
              key={stage.id}
              className="flex-shrink-0 w-72 lg:w-auto flex flex-col"
            >
              {/* Column header */}
              <div className={`flex items-center gap-2 px-3 py-2.5 rounded-t-xl ${config.bg} border ${config.border} border-b-0`}>
                <Icon size={16} className={config.color} />
                <span className="text-sm font-semibold text-primary flex-1">{stage.label}</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${config.bg} ${config.color}`}>
                  {stage.cards.length}
                </span>
              </div>

              {/* Cards container */}
              <div className={`flex-1 bg-card/50 border ${config.border} border-t-0 rounded-b-xl p-2 space-y-2 min-h-[120px]`}>
                {stage.cards.length === 0 && (
                  <div className="flex items-center justify-center h-20 text-xs text-muted">
                    No items
                  </div>
                )}

                {stage.cards.map(card => (
                  <PipelineCard key={card.id} card={card} stageId={stage.id} config={config} />
                ))}

                {/* Stage total */}
                {stageValue > 0 && (
                  <div className="text-xs text-muted text-right pt-1 pr-1">
                    ${Math.round(stageValue).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PipelineCard({ card, stageId, config }) {
  const isStale = stageId !== 'won' && card.daysInPipeline >= 7;
  const isUrgent = stageId === 'awaiting_response' && card.daysSinceSent >= 3;

  return (
    <div className={`bg-card rounded-lg border ${
      isUrgent ? 'border-red-500/40' : isStale ? 'border-amber-500/30' : 'border-border-subtle'
    } p-3 space-y-2 hover:border-border-default transition-colors`}>
      {/* Name + warning */}
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-primary leading-tight">{card.name}</span>
        {isUrgent && <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />}
        {!isUrgent && isStale && <Clock size={14} className="text-amber-400 shrink-0 mt-0.5" />}
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-3 text-xs text-muted flex-wrap">
        {card.daysInPipeline != null && (
          <span className={`flex items-center gap-1 ${isStale ? 'text-amber-400' : ''}`}>
            <Clock size={11} />
            {card.daysInPipeline}d
          </span>
        )}

        {stageId === 'awaiting_response' && card.daysSinceSent != null && (
          <span className={`flex items-center gap-1 ${isUrgent ? 'text-red-400 font-medium' : ''}`}>
            <Send size={11} />
            Sent {card.daysSinceSent}d ago
          </span>
        )}

        {card.total > 0 && (
          <span className="flex items-center gap-1 text-emerald-400">
            <DollarSign size={11} />
            {Math.round(card.total).toLocaleString()}
          </span>
        )}

        {card.source && (
          <span className="text-muted/70">{card.source}</span>
        )}

      </div>

      {/* Approved date for won */}
      {stageId === 'won' && card.approvedAt && (
        <div className="text-xs text-emerald-400/70">
          Won {new Date(card.approvedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </div>
      )}
    </div>
  );
}

export default SalesPipeline;
