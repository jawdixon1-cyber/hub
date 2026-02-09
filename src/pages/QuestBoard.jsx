import { useState } from 'react';
import {
  Swords, Plus, Pencil, Trash2, ToggleLeft, ToggleRight,
  Flame, Star, Gift, Users, CheckCircle2, Trophy,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../store/AppStoreContext';
import { genId } from '../data';
import { getNowISO } from '../utils/timezone';
import {
  calculateLevel,
  calculateStreak,
  getCurrentPeriod,
  hasCompletedInPeriod,
  getTeamCompletionCount,
  isQuestAvailable,
} from '../utils/questHelpers';
import CreateQuestModal from '../components/CreateQuestModal';

const TYPE_CONFIG = {
  daily:   { label: 'Daily Quests',   accent: 'amber',  border: 'border-amber-200 dark:border-amber-800',  badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',  header: 'from-amber-500 to-orange-500' },
  weekly:  { label: 'Weekly Quests',   accent: 'blue',   border: 'border-blue-200 dark:border-blue-800',    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',      header: 'from-blue-500 to-cyan-500' },
  monthly: { label: 'Monthly Quests',  accent: 'purple', border: 'border-purple-200 dark:border-purple-800', badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300', header: 'from-purple-500 to-violet-500' },
  bounty:  { label: 'Bounties',        accent: 'rose',   border: 'border-rose-200 dark:border-rose-800',    badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',      header: 'from-rose-500 to-pink-500' },
};

/* ── Quest Card ── */

function QuestCard({ quest, ownerMode, userEmail, currentUser, completions, onComplete, onEdit, onDelete, onToggle }) {
  const period = getCurrentPeriod(quest.type);
  const alreadyDone = hasCompletedInPeriod(completions, quest.questId || quest.id, userEmail, period);
  const teamCount = quest.scope === 'team' ? getTeamCompletionCount(completions, quest.id, period) : 0;
  const teamPct = quest.scope === 'team' && quest.targetCount > 0 ? Math.min((teamCount / quest.targetCount) * 100, 100) : 0;
  const cfg = TYPE_CONFIG[quest.type] || TYPE_CONFIG.daily;
  const available = isQuestAvailable(quest);

  return (
    <div className={`bg-card rounded-2xl shadow-sm border ${!quest.active ? 'opacity-50 border-border-subtle' : cfg.border} p-5 transition-all`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-primary text-sm truncate">{quest.title}</h3>
          <p className="text-xs text-tertiary mt-1 line-clamp-2">{quest.description}</p>
        </div>
        <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-bold ${cfg.badge}`}>
          {quest.xp} XP
        </span>
      </div>

      {/* Reward */}
      {quest.reward && (
        <div className="flex items-center gap-1.5 mb-3">
          <Gift size={12} className="text-rose-500" />
          <span className="text-xs font-medium text-rose-600 dark:text-rose-400">{quest.reward}</span>
        </div>
      )}

      {/* Bounty expiry */}
      {quest.type === 'bounty' && quest.expiresAt && (
        <p className="text-[10px] text-muted mb-3">Expires: {quest.expiresAt}</p>
      )}

      {/* Team progress */}
      {quest.scope === 'team' && (
        <div className="mb-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Users size={12} className="text-muted" />
            <span className="text-[10px] text-muted">Team: {teamCount}/{quest.targetCount}</span>
          </div>
          <div className="h-1.5 bg-surface-alt rounded-full overflow-hidden">
            <div
              className={`h-full bg-gradient-to-r ${cfg.header} rounded-full transition-all`}
              style={{ width: `${teamPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Actions */}
      {ownerMode ? (
        <div className="flex items-center gap-2 pt-2 border-t border-border-subtle">
          <button onClick={() => onToggle(quest)} className="p-1.5 rounded-lg text-muted hover:text-secondary hover:bg-surface cursor-pointer" title={quest.active ? 'Deactivate' : 'Activate'}>
            {quest.active ? <ToggleRight size={16} className="text-emerald-500" /> : <ToggleLeft size={16} />}
          </button>
          <button onClick={() => onEdit(quest)} className="p-1.5 rounded-lg text-muted hover:text-secondary hover:bg-surface cursor-pointer" title="Edit">
            <Pencil size={14} />
          </button>
          <button onClick={() => onDelete(quest)} className="p-1.5 rounded-lg text-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer" title="Delete">
            <Trash2 size={14} />
          </button>
          <span className="text-[10px] text-muted ml-auto">
            {getTeamCompletionCount(completions, quest.id, period)} completions
          </span>
        </div>
      ) : (
        <div className="pt-2">
          {alreadyDone ? (
            <div className="flex items-center gap-1.5 text-emerald-600">
              <CheckCircle2 size={16} />
              <span className="text-xs font-semibold">Completed</span>
            </div>
          ) : available ? (
            <button
              onClick={() => onComplete(quest)}
              className={`w-full py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r ${cfg.header} hover:opacity-90 transition-opacity cursor-pointer`}
            >
              Complete Quest
            </button>
          ) : (
            <span className="text-xs text-muted">Quest unavailable</span>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main Page ── */

export default function QuestBoard() {
  const { ownerMode, currentUser, user } = useAuth();
  const userEmail = user?.email?.toLowerCase();

  const quests = useAppStore((s) => s.quests);
  const setQuests = useAppStore((s) => s.setQuests);
  const completions = useAppStore((s) => s.questCompletions);
  const setCompletions = useAppStore((s) => s.setQuestCompletions);
  const userXP = useAppStore((s) => s.userXP);
  const setUserXP = useAppStore((s) => s.setUserXP);

  const [showModal, setShowModal] = useState(false);
  const [editingQuest, setEditingQuest] = useState(null);
  const [xpToast, setXpToast] = useState(null);

  const myXP = userXP[userEmail] || { totalXP: 0, level: 'Rookie', streak: 0, lastCompletionDate: null };
  const level = calculateLevel(myXP.totalXP);
  const streak = calculateStreak(completions, userEmail);

  /* ── Owner actions ── */

  const handleSaveQuest = (data) => {
    if (editingQuest) {
      setQuests(quests.map((q) =>
        q.id === editingQuest.id ? { ...q, ...data } : q
      ));
    } else {
      setQuests([
        {
          id: genId(),
          ...data,
          createdAt: getNowISO(),
          createdBy: 'owner',
          active: true,
        },
        ...quests,
      ]);
    }
    setShowModal(false);
    setEditingQuest(null);
  };

  const handleEdit = (quest) => {
    setEditingQuest(quest);
    setShowModal(true);
  };

  const handleDelete = (quest) => {
    setQuests(quests.filter((q) => q.id !== quest.id));
  };

  const handleToggle = (quest) => {
    setQuests(quests.map((q) =>
      q.id === quest.id ? { ...q, active: !q.active } : q
    ));
  };

  /* ── Team completion ── */

  const handleComplete = (quest) => {
    const period = getCurrentPeriod(quest.type);
    const now = getNowISO();

    // Record completion
    const newCompletion = {
      id: genId(),
      questId: quest.id,
      completedBy: userEmail,
      completedByName: currentUser,
      completedAt: now,
      period,
    };
    setCompletions([newCompletion, ...completions]);

    // Award XP
    const prev = userXP[userEmail] || { totalXP: 0, level: 'Rookie', streak: 0, lastCompletionDate: null };
    const newTotalXP = prev.totalXP + quest.xp;
    const newLevel = calculateLevel(newTotalXP);
    const newStreak = calculateStreak([newCompletion, ...completions], userEmail);

    setUserXP({
      ...userXP,
      [userEmail]: {
        totalXP: newTotalXP,
        level: newLevel.name,
        streak: newStreak,
        lastCompletionDate: now.slice(0, 10),
      },
    });

    // XP toast
    setXpToast({ xp: quest.xp, title: quest.title });
    setTimeout(() => setXpToast(null), 2500);
  };

  /* ── Group quests by type ── */

  const questsByType = {};
  for (const type of ['daily', 'weekly', 'monthly', 'bounty']) {
    const filtered = quests.filter((q) => q.type === type);
    if (ownerMode) {
      questsByType[type] = filtered;
    } else {
      questsByType[type] = filtered.filter((q) => isQuestAvailable(q));
    }
  }

  const hasAnyQuests = Object.values(questsByType).some((arr) => arr.length > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <Swords size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-primary">Quest Board</h1>
            <p className="text-sm text-tertiary">Complete quests, earn XP, level up</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Streak badge */}
          {!ownerMode && streak > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-100 dark:bg-orange-900/30">
              <Flame size={16} className="text-orange-500" />
              <span className="text-sm font-bold text-orange-700 dark:text-orange-300">{streak}</span>
            </div>
          )}

          {/* Level badge */}
          {!ownerMode && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${level.bg}`}>
              <span className="text-sm">{level.icon}</span>
              <span className={`text-sm font-bold ${level.color}`}>{level.name}</span>
              <span className="text-xs text-muted">{myXP.totalXP} XP</span>
            </div>
          )}

          {/* Create button */}
          {ownerMode && (
            <button
              onClick={() => { setEditingQuest(null); setShowModal(true); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold text-sm hover:from-indigo-600 hover:to-purple-700 transition-all cursor-pointer"
            >
              <Plus size={16} /> Create Quest
            </button>
          )}
        </div>
      </div>

      {/* Quest sections */}
      {!hasAnyQuests ? (
        <div className="bg-card rounded-2xl shadow-sm border border-border-subtle p-12 text-center">
          <Trophy size={40} className="text-purple-400 mx-auto mb-3" />
          <p className="text-lg font-bold text-primary mb-1">No quests yet</p>
          <p className="text-sm text-tertiary">
            {ownerMode
              ? 'Create your first quest to motivate the team!'
              : 'Check back soon — your team lead will post quests here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {['daily', 'weekly', 'monthly', 'bounty'].map((type) => {
            const group = questsByType[type];
            if (group.length === 0) return null;
            const cfg = TYPE_CONFIG[type];

            return (
              <section key={type}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-1.5 h-5 rounded-full bg-gradient-to-b ${cfg.header}`} />
                  <h2 className="text-sm font-bold text-secondary uppercase tracking-wider">{cfg.label}</h2>
                  <span className="text-xs text-muted">({group.length})</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {group.map((quest) => (
                    <QuestCard
                      key={quest.id}
                      quest={quest}
                      ownerMode={ownerMode}
                      userEmail={userEmail}
                      currentUser={currentUser}
                      completions={completions}
                      onComplete={handleComplete}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onToggle={handleToggle}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <CreateQuestModal
          quest={editingQuest}
          onSave={handleSaveQuest}
          onClose={() => { setShowModal(false); setEditingQuest(null); }}
        />
      )}

      {/* XP Toast */}
      {xpToast && (
        <div className="fixed bottom-6 right-6 z-50 animate-bounce">
          <div className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-5 py-3 rounded-2xl shadow-lg flex items-center gap-2">
            <Star size={18} className="text-yellow-300" />
            <span className="font-bold">+{xpToast.xp} XP</span>
            <span className="text-white/80 text-sm">— {xpToast.title}</span>
          </div>
        </div>
      )}
    </div>
  );
}
