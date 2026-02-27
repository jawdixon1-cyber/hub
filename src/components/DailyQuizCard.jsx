import { useState, useMemo, useEffect } from 'react';
import { Check, X, ChevronRight } from 'lucide-react';
import { useAppStore } from '../store/AppStoreContext';
import { useAuth } from '../contexts/AuthContext';
import { QUIZ_QUESTIONS, genId } from '../data';
import { getTodayInTimezone } from '../utils/timezone';

function hashDate(dateStr) {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash * 31 + dateStr.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function pickTodayQuestion(quizLog, email) {
  const today = getTodayInTimezone();
  // Get recently answered question IDs (last 2 weeks)
  const twoWeeksAgo = new Date(today + 'T00:00:00');
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const recentIds = new Set(
    quizLog
      .filter((e) => e.email === email && e.date >= twoWeeksAgo.toISOString().slice(0, 10))
      .map((e) => e.questionId)
  );

  // If all questions answered recently, just use date hash
  const available = QUIZ_QUESTIONS.filter((q) => !recentIds.has(q.id));
  const pool = available.length > 0 ? available : QUIZ_QUESTIONS;

  const idx = hashDate(today) % pool.length;
  return pool[idx];
}

export function useQuizDoneToday() {
  const { user } = useAuth();
  const email = user?.email;
  const quizLog = useAppStore((s) => s.quizLog);
  const today = getTodayInTimezone();
  return !!quizLog.find((e) => e.date === today && e.email === email);
}

export default function DailyQuizCard({ inline, onComplete }) {
  const { user } = useAuth();
  const email = user?.email;
  const quizLog = useAppStore((s) => s.quizLog);
  const setQuizLog = useAppStore((s) => s.setQuizLog);

  const [phase, setPhase] = useState('active'); // active | answered
  const [selectedIdx, setSelectedIdx] = useState(null);

  const today = getTodayInTimezone();
  const todayEntry = quizLog.find((e) => e.date === today && e.email === email);
  const question = useMemo(() => pickTodayQuestion(quizLog, email), [quizLog, email]);

  const isDone = !!todayEntry;
  const correctIdx = question.options.findIndex((o) => o.correct);

  const handleAnswer = (idx) => {
    if (phase === 'answered') return;
    setSelectedIdx(idx);
    setPhase('answered');

    const correct = question.options[idx].correct;
    setQuizLog((prev) => [
      ...prev,
      {
        id: genId(),
        date: today,
        email,
        questionId: question.id,
        correct,
        answeredAt: new Date().toISOString(),
      },
    ]);
  };

  // Inline mode (flow step) — already done, call onComplete via effect
  useEffect(() => {
    if (inline && isDone) onComplete?.();
  }, [inline, isDone, onComplete]);

  if (inline && isDone) return null;

  // Card mode (quickLinks) — done state
  if (!inline && isDone) {
    return (
      <div className="bg-card rounded-2xl border border-border-subtle shadow-sm overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">🧠</span>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Daily Quiz</h3>
          </div>
          <div className="w-6 h-6 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <Check size={14} className="text-emerald-500" />
          </div>
        </div>
      </div>
    );
  }

  // Inline mode — full-screen-ish quiz step
  if (inline) {
    return (
      <div className="flex flex-col flex-1 py-4">
        <div className="flex items-center gap-2 mb-6">
          <span className="text-2xl">🧠</span>
          <h2 className="text-lg font-bold text-primary">Daily Quiz</h2>
        </div>
        <p className="text-sm font-semibold text-primary leading-snug mb-4">{question.question}</p>
        <div className="space-y-2">
          {question.options.map((opt, idx) => {
            let style = 'bg-surface-alt border-border-subtle text-primary hover:bg-surface-alt/80';

            if (phase === 'answered') {
              if (idx === correctIdx) {
                style = 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-700 dark:text-emerald-300';
              } else if (idx === selectedIdx && !opt.correct) {
                style = 'bg-red-50 border-red-300 text-red-800 dark:bg-red-950/40 dark:border-red-700 dark:text-red-300';
              } else {
                style = 'bg-surface-alt/50 border-border-subtle text-muted';
              }
            }

            return (
              <button
                key={idx}
                onClick={() => handleAnswer(idx)}
                disabled={phase === 'answered'}
                className={`w-full text-left px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors cursor-pointer disabled:cursor-default ${style}`}
              >
                <span className="flex items-center gap-2">
                  {phase === 'answered' && idx === correctIdx && <Check size={16} className="text-emerald-500 shrink-0" />}
                  {phase === 'answered' && idx === selectedIdx && !opt.correct && <X size={16} className="text-red-500 shrink-0" />}
                  {opt.text}
                </span>
              </button>
            );
          })}
        </div>
        {phase === 'answered' && (
          <>
            <p className="text-xs text-tertiary leading-relaxed mt-3">{question.explanation}</p>
            <button
              onClick={() => onComplete?.()}
              className="mt-6 flex items-center justify-center gap-2 w-full py-4 rounded-2xl bg-brand text-on-brand font-bold text-base hover:bg-brand-hover transition-colors cursor-pointer shadow-lg"
            >
              Continue to Checklist
              <ChevronRight size={18} />
            </button>
          </>
        )}
      </div>
    );
  }

  // Card mode (quickLinks) — compact card
  return (
    <div className="bg-card rounded-2xl border border-border-subtle shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border-subtle flex items-center gap-2">
        <span className="text-lg">🧠</span>
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Daily Quiz</h3>
      </div>
      <div className="p-4 space-y-3">
        <p className="text-sm font-semibold text-primary leading-snug">{question.question}</p>
        <div className="space-y-2">
          {question.options.map((opt, idx) => {
            let style = 'bg-surface-alt border-border-subtle text-primary hover:bg-surface-alt/80';

            if (phase === 'answered') {
              if (idx === correctIdx) {
                style = 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-700 dark:text-emerald-300';
              } else if (idx === selectedIdx && !opt.correct) {
                style = 'bg-red-50 border-red-300 text-red-800 dark:bg-red-950/40 dark:border-red-700 dark:text-red-300';
              } else {
                style = 'bg-surface-alt/50 border-border-subtle text-muted';
              }
            }

            return (
              <button
                key={idx}
                onClick={() => handleAnswer(idx)}
                disabled={phase === 'answered'}
                className={`w-full text-left px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors cursor-pointer disabled:cursor-default ${style}`}
              >
                <span className="flex items-center gap-2">
                  {phase === 'answered' && idx === correctIdx && <Check size={16} className="text-emerald-500 shrink-0" />}
                  {phase === 'answered' && idx === selectedIdx && !opt.correct && <X size={16} className="text-red-500 shrink-0" />}
                  {opt.text}
                </span>
              </button>
            );
          })}
        </div>
        {phase === 'answered' && (
          <p className="text-xs text-tertiary leading-relaxed">{question.explanation}</p>
        )}
      </div>
    </div>
  );
}
