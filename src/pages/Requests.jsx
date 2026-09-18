import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../store/AppStoreContext';
import {
  Inbox, RefreshCw, Phone, Mail, MapPin, Loader2,
  ArrowLeft, MessageSquare, Search, TrendingUp,
  Plus, X, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Check, CheckCircle2, ClipboardList,
  MoreHorizontal, FileText, Briefcase, Archive, Trash2, Pencil, Users, Clock, Crosshair, Eye,
} from 'lucide-react';

// Compare assessment_date (a date-only string like "2026-06-13") in *local* time
// instead of building a Date object — `new Date("2026-06-13")` parses as UTC midnight,
// which flips to the previous day in any negative-offset timezone like Eastern.
const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
// assessment_date may come back as "YYYY-MM-DD" or with a trailing "T...".
const dateYmd = (s) => (s ? String(s).slice(0, 10) : '');

export const STATUS_CONFIG = {
  new: {
    label: 'New', dot: 'bg-blue-500', text: 'text-blue-400',
    match: (r) => r.status === 'new' && !r.assessment_date && !r.raw_payload?.assessment?.completed,
  },
  assessment_scheduled: {
    label: 'Upcoming', dot: 'bg-emerald-500', text: 'text-emerald-400',
    match: (r) => !!r.assessment_date && !r.raw_payload?.assessment?.completed && dateYmd(r.assessment_date) > todayYmd(),
  },
  today: {
    label: 'Today', dot: 'bg-amber-500', text: 'text-amber-400',
    match: (r) => !!r.assessment_date && !r.raw_payload?.assessment?.completed && dateYmd(r.assessment_date) === todayYmd(),
  },
  assessment_complete: {
    label: 'Assessment complete', dot: 'bg-cyan-500', text: 'text-cyan-400',
    match: (r) => r.raw_payload?.assessment?.completed === true,
  },
  overdue: {
    label: 'Overdue', dot: 'bg-red-500', text: 'text-red-400',
    match: (r) => !!r.assessment_date && !r.raw_payload?.assessment?.completed && dateYmd(r.assessment_date) < todayYmd(),
  },
  unscheduled: {
    label: 'Unscheduled', dot: 'bg-amber-500', text: 'text-amber-400',
    match: (r) => r.status !== 'new' && !r.assessment_date && !r.raw_payload?.assessment?.completed,
  },
};
const STATUS_ORDER = ['new', 'today', 'assessment_scheduled', 'assessment_complete', 'overdue', 'unscheduled'];

const DATE_RANGES = [
  { id: 'all', label: 'All' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Last week' },
  { id: '30', label: 'Last 30 days' },
  { id: 'month', label: 'This month' },
  { id: 'year', label: 'This year' },
];

// Date/time helpers — display as MM/DD/YYYY and HH:MM, store as ISO (YYYY-MM-DD, HH:MM).
function isoToDisplayDate(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso;
}
function displayDateToIso(s) {
  if (!s) return '';
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return s; // user is still typing
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}
// Auto-insert slashes as the user types digits.
function maskDateInput(raw) {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}
// Compress an image client-side: resize to ≤ maxDim on the long edge, re-encode
// as JPEG at the given quality. Drops huge phone photos (~5-12MB) to ~200-400KB
// before they ever hit the storage bucket. Falls back to the original file if
// anything fails or the result isn't smaller.
export async function compressImage(file, { maxDim = 1600, quality = 0.8 } = {}) {
  if (!file || !file.type || !file.type.startsWith('image/')) return file;
  // Skip GIF/SVG — canvas would strip animation/vector data.
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
  // PNG might have transparency. JPEG would paint that black. Re-encode as PNG
  // when the source is PNG, so logos / cutouts keep their alpha channel.
  const isPng = file.type === 'image/png';
  const outType = isPng ? 'image/png' : 'image/jpeg';
  const outExt  = isPng ? 'png' : 'jpg';
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const longest = Math.max(img.width, img.height);
    const scale = longest > maxDim ? maxDim / longest : 1;
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise((res) => canvas.toBlob(res, outType, isPng ? undefined : quality));
    if (!blob || blob.size >= file.size) return file; // no improvement
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${baseName}.${outExt}`, { type: outType, lastModified: Date.now() });
  } catch (e) {
    console.warn('[compressImage] failed, using original:', e?.message || e);
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function maskTimeInput(raw) {
  const d = raw.replace(/\D/g, '').slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}:${d.slice(2)}`;
}
// Format/parse 12-hour clock display strings ("03:00 PM") <-> 24-hour storage ("15:00").
export function to12Hour(h24) {
  if (h24 == null) return '';
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h = h24 % 12 || 12;
  return `${String(h).padStart(2, '0')}:00 ${ampm}`;
}
export function timeStringTo24(s) {
  if (!s) return '';
  const m = s.trim().toUpperCase().match(/^(\d{1,2}):?(\d{0,2})\s*(AM|PM)?$/);
  if (!m) return s;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = m[3];
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  if (h > 23 || min > 59) return s;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/* ─── Inline calendar popover — works without any external lib ─── */
// Accept only YYYY-MM-DD strings. Anything else → treat as empty.
export function parseIsoOrNull(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return { y, mo, d };
}
export function CalendarInput({ value, onChange, placeholder = 'Select date', disabled = false, label = '', className = '' }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // Build a fresh `today` per render. Cheap, avoids mutation surprises.
  const todayDate = (() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; })();
  const validValue = parseIsoOrNull(value);

  // Use today as the anchor when value is missing/invalid.
  const anchor = validValue
    ? { year: validValue.y, month: validValue.mo }
    : { year: todayDate.getFullYear(), month: todayDate.getMonth() };
  const [view, setView] = useState(anchor);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // When opening with a valid value, jump the view to that month.
  useEffect(() => {
    if (open && validValue) setView({ year: validValue.y, month: validValue.mo });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const monthName = new Date(view.year, view.month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const startWeekday = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const daysInPrevMonth = new Date(view.year, view.month, 0).getDate();

  const cells = [];
  for (let i = startWeekday - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, inMonth: false, dateOffset: -1 });
  }
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, inMonth: true, dateOffset: 0 });
  let trailingDay = 1;
  // Fill only to the end of the last visible week — don't pad to 6 weeks.
  while (cells.length % 7 !== 0) {
    cells.push({ day: trailingDay++, inMonth: false, dateOffset: 1 });
  }

  const selectedIso = validValue ? `${validValue.y}-${String(validValue.mo + 1).padStart(2, '0')}-${String(validValue.d).padStart(2, '0')}` : '';

  const pickDay = (cell) => {
    let year = view.year, month = view.month;
    if (cell.dateOffset === -1) {
      month -= 1; if (month < 0) { month = 11; year -= 1; }
    } else if (cell.dateOffset === 1) {
      month += 1; if (month > 11) { month = 0; year += 1; }
    }
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`;
    onChange(iso);
    setOpen(false);
  };

  const display = validValue
    ? new Date(validValue.y, validValue.mo, validValue.d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  return (
    <div className={`relative ${className}`} ref={wrapRef}>
      {/* Floating label — animates between small-at-top (has value) and centered (empty). */}
      {label && (
        <span
          className={`absolute left-3 pointer-events-none z-10 transition-all duration-200 ease-out origin-left ${disabled ? 'text-muted/60' : 'text-secondary'} ${
            (display || !disabled)
              ? 'top-1 text-[10px] font-semibold'
              : 'top-3 text-sm font-normal'
          }`}
        >
          {label}
        </span>
      )}
      <button
        type="button" disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className={`w-full text-left px-3 rounded-lg border border-border-subtle text-sm focus:outline-none focus:border-brand/50 disabled:cursor-not-allowed cursor-pointer ${disabled ? 'bg-black/10' : 'bg-card'} ${display ? 'text-primary' : 'text-muted'} ${label ? 'h-[42px] pt-5 pb-1' : 'py-2.5'}`}
      >
        {label ? (display || (disabled ? ' ' : placeholder)) : (display || placeholder)}
      </button>
      {open && (
        <div className="absolute z-50 left-0 top-full mt-1 bg-card border border-border-subtle rounded-xl shadow-2xl p-3 w-[280px]">
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => setView(v => v.month === 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: v.month - 1 })} className="p-1 rounded hover:bg-surface-alt cursor-pointer text-secondary">
              <ChevronLeft size={14} />
            </button>
            <p className="text-xs font-bold text-primary">{monthName}</p>
            <button type="button" onClick={() => setView(v => v.month === 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: v.month + 1 })} className="p-1 rounded hover:bg-surface-alt cursor-pointer text-secondary">
              <ChevronRight size={14} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-[10px] font-bold text-muted text-center mb-1 uppercase tracking-wider">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => <span key={i}>{d}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((cell, i) => {
              let year = view.year, month = view.month;
              if (cell.dateOffset === -1) { month -= 1; if (month < 0) { month = 11; year -= 1; } }
              else if (cell.dateOffset === 1) { month += 1; if (month > 11) { month = 0; year += 1; } }
              const cellIso = `${year}-${String(month + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`;
              const isSelected = cellIso === selectedIso;
              const isToday = new Date(year, month, cell.day).getTime() === todayDate.getTime();
              return (
                <button
                  type="button"
                  key={i}
                  onClick={() => pickDay(cell)}
                  className={`aspect-square rounded-md text-xs cursor-pointer transition-colors flex items-center justify-center ${
                    isSelected ? 'bg-emerald-500 text-white font-black shadow-sm hover:bg-emerald-600' :
                    isToday && !validValue ? 'bg-emerald-500 text-white font-black shadow-sm hover:bg-emerald-600' :
                    isToday ? 'text-primary font-black hover:bg-surface-alt' :
                    !cell.inMonth ? 'text-muted/40 font-normal hover:bg-surface-alt' :
                    'text-primary font-normal hover:bg-surface-alt'
                  }`}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Time picker popover with hours / minutes / AM-PM columns ─── */
export function TimeInput({ value, onChange, disabled = false, placeholder = 'hh:mm AM', label = '', className = '' }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  // Track how many digits the user has typed within the current segment, so
  // "1" then "2" in hours = "12", but "5" alone in hours = "05" then advance.
  const segStateRef = useRef({ seg: 'h', typed: 0 });

  // Parse current value (12-hour display like "03:00 PM") into parts.
  const parsed = (() => {
    const m = (value || '').match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (!m) return { h: null, mm: null, ap: null };
    return { h: String(parseInt(m[1], 10)).padStart(2, '0'), mm: m[2], ap: (m[3] || 'AM').toUpperCase() };
  })();

  const safeParts = {
    h: parsed.h || '12',
    mm: parsed.mm || '00',
    ap: parsed.ap || 'AM',
  };

  const buildAndEmit = (next) => {
    const merged = { ...safeParts, ...next };
    onChange(`${merged.h}:${merged.mm} ${merged.ap}`);
  };

  // Visually highlight a segment without touching segStateRef.
  const highlightSegment = (seg) => {
    const input = inputRef.current;
    if (!input) return;
    requestAnimationFrame(() => {
      try {
        if (seg === 'h') input.setSelectionRange(0, 2);
        else if (seg === 'm') input.setSelectionRange(3, 5);
        else input.setSelectionRange(6, 8);
      } catch {}
    });
  };
  // Move focus to a fresh segment (used by clicks, tab/arrow nav, auto-advance).
  const enterSegment = (seg) => {
    segStateRef.current = { seg, typed: 0 };
    highlightSegment(seg);
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const hours = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const minutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0')); // 00, 05, 10, …, 55

  const pick = (next) => {
    const merged = { ...parsed, ...next };
    const h = merged.h || '12';
    const mm = merged.mm || '00';
    const ap = merged.ap || 'AM';
    onChange(`${h}:${mm} ${ap}`);
  };

  return (
    <div className={`relative ${className}`} ref={wrapRef}>
      {/* Floating label — animates between small-at-top (has value) and centered (empty). */}
      {label && (
        <span
          className={`absolute left-3 pointer-events-none z-10 transition-all duration-200 ease-out origin-left ${disabled ? 'text-muted/60' : 'text-secondary'} ${
            (value || !disabled)
              ? 'top-1 text-[10px] font-semibold'
              : 'top-3 text-sm font-normal'
          }`}
        >
          {label}
        </span>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          type="text" placeholder={label ? '' : placeholder} maxLength={8}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          onFocus={() => enterSegment('h')}
          onClick={(e) => {
            const pos = e.target.selectionStart ?? 0;
            enterSegment(pos <= 2 ? 'h' : pos <= 5 ? 'm' : 'ap');
          }}
          onKeyDown={(e) => {
            const { seg, typed } = segStateRef.current;
            // Digit input — segment-aware validation, auto-advance to next segment.
            if (/^[0-9]$/.test(e.key) && (seg === 'h' || seg === 'm')) {
              e.preventDefault();
              const d = e.key;
              if (seg === 'h') {
                if (typed === 0) {
                  if (d === '0' || d === '1') {
                    buildAndEmit({ h: `0${d}` });
                    segStateRef.current = { seg: 'h', typed: 1, firstDigit: d };
                    highlightSegment('h');
                  } else {
                    buildAndEmit({ h: `0${d}` });
                    enterSegment('m');
                  }
                } else {
                  const fd = segStateRef.current.firstDigit || '0';
                  if (fd === '1') {
                    if ('012'.includes(d)) {
                      buildAndEmit({ h: `1${d}` });
                      enterSegment('m');
                    } else if (d === '0' || d === '1') {
                      buildAndEmit({ h: `0${d}` });
                      segStateRef.current = { seg: 'h', typed: 1, firstDigit: d };
                      highlightSegment('h');
                    } else {
                      buildAndEmit({ h: `0${d}` });
                      enterSegment('m');
                    }
                  } else {
                    if (d === '0') {
                      buildAndEmit({ h: '00' });
                      segStateRef.current = { seg: 'h', typed: 1, firstDigit: '0' };
                      highlightSegment('h');
                    } else {
                      buildAndEmit({ h: `0${d}` });
                      enterSegment('m');
                    }
                  }
                }
              } else { // minutes
                if (typed === 0) {
                  if (parseInt(d, 10) >= 6) {
                    // 6-9 can't be the tens digit, so finalize "0d" and advance.
                    buildAndEmit({ mm: `0${d}` });
                    enterSegment('ap');
                  } else {
                    // 0-5 could be tens digit; show "0d" and wait for second digit.
                    buildAndEmit({ mm: `0${d}` });
                    segStateRef.current = { seg: 'm', typed: 1, firstDigit: d };
                    highlightSegment('m');
                  }
                } else {
                  const fd = segStateRef.current.firstDigit || '0';
                  buildAndEmit({ mm: `${fd}${d}` });
                  enterSegment('ap');
                }
              }
              return;
            }
            // AM/PM letter shortcut
            if (/^[apAP]$/.test(e.key) && seg === 'ap') {
              e.preventDefault();
              buildAndEmit({ ap: e.key.toUpperCase() === 'A' ? 'AM' : 'PM' });
              highlightSegment('ap');
              return;
            }
            if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) {
              if (seg === 'h') { e.preventDefault(); enterSegment('m'); }
              else if (seg === 'm') { e.preventDefault(); enterSegment('ap'); }
            } else if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
              if (seg === 'ap') { e.preventDefault(); enterSegment('m'); }
              else if (seg === 'm') { e.preventDefault(); enterSegment('h'); }
            }
          }}
          className={`w-full pl-3 pr-8 text-sm text-primary focus:outline-none disabled:cursor-not-allowed tabular-nums ${disabled ? 'bg-black/10' : 'bg-card'} ${label ? 'h-[42px] pt-5 pb-1' : 'py-2'}`}
        />
        <button
          type="button" disabled={disabled}
          onClick={() => setOpen(o => !o)}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-primary cursor-pointer disabled:opacity-40"
        >
          <Clock size={14} />
        </button>
      </div>
      {open && (
        <div className="absolute z-50 left-0 top-full mt-1 bg-card border border-border-subtle rounded-xl shadow-2xl flex w-[180px] max-h-[220px] overflow-hidden">
          {/* Hours */}
          <ul className="flex-1 overflow-y-auto border-r border-border-subtle">
            {hours.map((h) => (
              <li key={h}>
                <button
                  type="button"
                  onClick={() => pick({ h })}
                  className={`w-full px-3 py-2 text-sm text-center cursor-pointer hover:bg-surface-alt ${parsed.h === h ? 'bg-brand text-on-brand font-bold' : 'text-primary'}`}
                >
                  {h}
                </button>
              </li>
            ))}
          </ul>
          {/* Minutes */}
          <ul className="flex-1 overflow-y-auto border-r border-border-subtle">
            {minutes.map((mm) => (
              <li key={mm}>
                <button
                  type="button"
                  onClick={() => pick({ mm })}
                  className={`w-full px-3 py-2 text-sm text-center cursor-pointer hover:bg-surface-alt ${parsed.mm === mm ? 'bg-brand text-on-brand font-bold' : 'text-primary'}`}
                >
                  {mm}
                </button>
              </li>
            ))}
          </ul>
          {/* AM/PM */}
          <ul className="flex-1 overflow-y-auto">
            {['AM', 'PM'].map((ap) => (
              <li key={ap}>
                <button
                  type="button"
                  onClick={() => pick({ ap })}
                  className={`w-full px-3 py-2 text-sm text-center cursor-pointer hover:bg-surface-alt ${parsed.ap === ap ? 'bg-brand text-on-brand font-bold' : 'text-primary'}`}
                >
                  {ap}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function getDateStart(rangeId) {
  const now = new Date();
  if (rangeId === 'all') return null;
  if (rangeId === 'today') { const d = new Date(now); d.setHours(0,0,0,0); return d; }
  if (rangeId === 'week') { const d = new Date(now); d.setDate(d.getDate() - 7); return d; }
  if (rangeId === '30') { const d = new Date(now); d.setDate(d.getDate() - 30); return d; }
  if (rangeId === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  if (rangeId === 'year') return new Date(now.getFullYear(), 0, 1);
  return null;
}

// Most-specific bucket wins when displaying a single label on a row.
// Counts (statusCounts) still use STATUS_ORDER so a request can be counted
// in more than one place (e.g. status='new' AND assessment_complete).
const BUCKET_PRIORITY = ['assessment_complete', 'overdue', 'today', 'assessment_scheduled', 'new', 'unscheduled'];
export function bucketFor(r) {
  for (const s of BUCKET_PRIORITY) {
    if (STATUS_CONFIG[s].match(r)) return s;
  }
  return 'new';
}
function StatusDot({ request, onClick }) {
  const cfg = STATUS_CONFIG[bucketFor(request)];
  return (
    <button onClick={onClick}
      className="inline-flex items-center gap-2 text-xs font-medium text-secondary hover:text-primary cursor-pointer transition-colors">
      <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot} shrink-0`} />
      {cfg.label}
    </button>
  );
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ─── Dropdown wrapper ─── */
function Dropdown({ trigger, open, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);
  return (
    <div ref={ref} className="relative inline-block">
      {trigger}
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-card border border-border-subtle rounded-xl shadow-2xl min-w-[220px] py-1 max-h-[320px] overflow-y-auto">
          {children}
        </div>
      )}
    </div>
  );
}

/* ─── New Request Modal ─── */
function NewRequestModal({ onClose, onSave, salesperson: salespersonProp, orgId }) {
  // Coerce to a display string. Accepts string, { name } object, or null.
  const salesperson = typeof salespersonProp === 'string'
    ? salespersonProp
    : (salespersonProp?.name || salespersonProp?.display_name || salespersonProp?.email || '');
  const [title, setTitle] = useState('');
  const [clientQuery, setClientQuery] = useState('');
  const [allClients, setAllClients] = useState([]);
  const [clientResults, setClientResults] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [showClientResults, setShowClientResults] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [notes, setNotes] = useState('');
  // Each entry: { file, previewUrl }. Files are uploaded on save and their public URLs stored on the request.
  const [photos, setPhotos] = useState([]);
  // Release every blob: preview URL when the modal unmounts so the browser
  // doesn't keep their bytes pinned in memory.
  useEffect(() => () => {
    photos.forEach((p) => { try { URL.revokeObjectURL(p.previewUrl); } catch {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [wantAssessment, setWantAssessment] = useState(false);
  const [assessmentDate, setAssessmentDate] = useState('');
  const [assessmentTime, setAssessmentTime] = useState('');
  const [saving, setSaving] = useState(false);
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const inputCls = "mt-1 w-full px-3 py-2.5 rounded-lg bg-surface-alt border border-border-subtle text-sm text-primary placeholder:text-muted focus:outline-none focus:border-brand/50";

  // Load all clients for this org on mount — search filters in-memory.
  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const { data } = await supabase
        .from('clients')
        .select('id, first_name, last_name, company_name, phones, emails, billing_street, billing_city, billing_state, billing_zip')
        .eq('org_id', orgId)
        .order('updated_at', { ascending: false });
      const shaped = (data || []).map((c) => {
        const phone = ((c.phones || []).find((p) => p.primary) || c.phones?.[0])?.value || '';
        const email = ((c.emails || []).find((e) => e.primary) || c.emails?.[0])?.value || '';
        const name = c.company_name || [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || 'Unnamed';
        return {
          id: c.id,
          name,
          phone,
          email,
          address: c.billing_street || '',
          city: c.billing_city || '',
          state: c.billing_state || '',
          zip: c.billing_zip || '',
        };
      });
      setAllClients(shaped);
      setClientsLoading(false);
    })();
  }, [orgId]);

  const searchClients = (q) => {
    setClientQuery(q);
    setSelectedClient(null);
    if (q.length < 2) { setClientResults([]); setShowClientResults(false); return; }
    const needle = q.toLowerCase();
    const hits = allClients.filter((c) =>
      [c.name, c.phone, c.email, c.address, c.city]
        .filter(Boolean)
        .some((f) => f.toLowerCase().includes(needle))
    ).slice(0, 20);
    setClientResults(hits);
    setShowClientResults(true);
  };

  const selectClient = (client) => {
    setSelectedClient(client);
    setClientQuery(client.name);
    setShowClientResults(false);
  };

  const handleSave = async () => {
    if (!selectedClient && !title) return;
    setSaving(true);

    // Upload any attached photos to Supabase storage and collect their public URLs.
    // Bucket must exist as 'request-photos' (create it in Supabase dashboard once).
    const photoUrls = [];
    for (const p of photos) {
      const compressed = await compressImage(p.file);
      const ext = (compressed.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${orgId || 'unscoped'}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from('request-photos').upload(path, compressed, {
        contentType: compressed.type || 'image/jpeg',
        upsert: false,
      });
      if (upErr) { console.error('[Requests] photo upload failed:', upErr.message); continue; }
      const { data } = supabase.storage.from('request-photos').getPublicUrl(path);
      if (data?.publicUrl) photoUrls.push(data.publicUrl);
    }

    const [first, ...rest] = (selectedClient?.name || title || '').split(' ');
    await onSave({
      title,
      client_id: selectedClient?.id || null,
      first_name: first || '', last_name: rest.join(' ') || '',
      phone: selectedClient?.phone || '', email: selectedClient?.email || '',
      street: selectedClient?.address || '', city: selectedClient?.city || '',
      state: selectedClient?.state || '', zip: selectedClient?.zip || '',
      notes, services: [],
      salesperson,
      assessment_date: wantAssessment ? (assessmentDate || null) : null,
      assessment_time: wantAssessment ? (timeStringTo24(assessmentTime) || null) : null,
      photos: photoUrls,
    });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-6 px-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card border border-border-subtle rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="h-1 bg-amber-500 rounded-t-2xl shrink-0" />
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle shrink-0">
          <h2 className="text-lg font-black text-primary">New Request</h2>
          <button onClick={onClose} className="p-1 text-muted hover:text-primary cursor-pointer"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Title */}
          <div>
            <label className="text-xs font-bold text-muted uppercase tracking-wider">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Mowing request" className={inputCls} />
          </div>

          {/* Select a client */}
          <div className="relative">
            <label className="text-xs font-bold text-muted uppercase tracking-wider">Select a client</label>
            <div className="relative mt-1">
              {selectedClient
                ? <CheckCircle2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500" />
                : <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />}
              <input value={clientQuery} onChange={e => searchClients(e.target.value)}
                onFocus={() => { if (clientResults.length > 0) setShowClientResults(true); }}
                placeholder="Search clients..."
                className={`w-full pl-9 pr-9 py-2.5 rounded-lg border text-sm text-primary placeholder:text-muted focus:outline-none ${
                  selectedClient
                    ? 'bg-emerald-500/10 border-emerald-500/40 focus:border-emerald-500/60'
                    : 'bg-surface-alt border-border-subtle focus:border-brand/50'
                }`} />
              {selectedClient && (
                <button
                  type="button"
                  onClick={() => { setSelectedClient(null); setClientQuery(''); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-primary cursor-pointer"
                  title="Clear"
                >
                  <X size={14} />
                </button>
              )}
              {!selectedClient && clientsLoading && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted animate-spin" />}
            </div>
            {showClientResults && clientResults.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-card border border-border-subtle rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                {clientResults.map(c => (
                  <button key={c.id} onClick={() => selectClient(c)}
                    className="w-full px-4 py-3 text-left hover:bg-surface-alt cursor-pointer border-b border-border-subtle/50 last:border-0">
                    <p className="text-sm font-bold text-primary">{c.name}</p>
                    <p className="text-[11px] text-muted">{[c.phone, c.email].filter(Boolean).join(' · ')}</p>
                    {c.address && <p className="text-[11px] text-muted">{[c.address, c.city, c.state, c.zip].filter(Boolean).join(', ')}</p>}
                  </button>
                ))}
              </div>
            )}
            {showClientResults && clientResults.length === 0 && clientQuery.length >= 2 && !clientsLoading && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-card border border-border-subtle rounded-xl shadow-2xl p-4 text-center">
                <p className="text-xs text-muted">No clients found.</p>
              </div>
            )}
          </div>

          {/* Requested on + Salesperson (read-only) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-muted uppercase tracking-wider">Requested on</label>
              <p className="mt-1 px-3 py-2.5 rounded-lg bg-surface-alt border border-border-subtle text-sm text-primary">{today}</p>
            </div>
            <div>
              <label className="text-xs font-bold text-muted uppercase tracking-wider">Salesperson</label>
              <p className="mt-1 px-3 py-2.5 rounded-lg bg-surface-alt border border-border-subtle text-sm text-primary">{salesperson || '—'}</p>
            </div>
          </div>

          <div className="border-t border-border-subtle" />

          {/* Overview */}
          <div>
            <h3 className="text-base font-black text-primary mb-3">Overview</h3>
            <label className="text-xs font-bold text-muted uppercase tracking-wider">Service details</label>
            <p className="text-[11px] text-muted mb-1">Please provide as much information as you can.</p>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className={inputCls + ' resize-none'} />

            {/* Picture attachments */}
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-muted uppercase tracking-wider">Pictures</label>
                <label className="text-[11px] font-semibold text-brand-text hover:underline cursor-pointer">
                  + Add picture
                  <input
                    type="file" accept="image/*" multiple className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      setPhotos(prev => [...prev, ...files.map(f => ({ file: f, previewUrl: URL.createObjectURL(f) }))]);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
              {photos.length === 0 ? (
                <p className="text-[11px] text-muted">No pictures attached</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {photos.map((p, i) => (
                    <div key={i} className="relative group rounded-lg overflow-hidden border border-border-subtle aspect-square bg-surface-alt">
                      <img src={p.previewUrl} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setPhotos(prev => {
                          const gone = prev[i];
                          if (gone?.previewUrl) { try { URL.revokeObjectURL(gone.previewUrl); } catch {} }
                          return prev.filter((_, j) => j !== i);
                        })}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-border-subtle" />

          {/* On-site assessment toggle */}
          <div>
            <button type="button" onClick={() => setWantAssessment(!wantAssessment)}
              className="flex items-center gap-3 w-full text-left cursor-pointer group">
              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${wantAssessment ? 'bg-brand border-brand' : 'border-border-subtle group-hover:border-muted'}`}>
                {wantAssessment && <Check size={14} className="text-on-brand" />}
              </div>
              <div>
                <p className="text-sm font-bold text-primary">Create on-site assessment</p>
                <p className="text-[11px] text-muted">Schedule a visit to assess the property before quoting</p>
              </div>
            </button>
            {wantAssessment && (
              <div className="grid grid-cols-2 gap-3 mt-3 ml-8">
                <div>
                  <label className="text-xs font-bold text-muted uppercase tracking-wider block mb-1">Date</label>
                  <CalendarInput
                    value={assessmentDate}
                    onChange={setAssessmentDate}
                    placeholder="mm/dd/yyyy"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted uppercase tracking-wider">Time</label>
                  <input
                    type="text" inputMode="numeric" placeholder="hh:mm" maxLength={5}
                    value={assessmentTime}
                    onChange={e => setAssessmentTime(maskTimeInput(e.target.value))}
                    className={inputCls}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-subtle shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-muted hover:text-primary cursor-pointer">Cancel</button>
          <button onClick={handleSave} disabled={saving || (!selectedClient && !title)}
            className="px-6 py-2.5 rounded-lg bg-brand text-on-brand text-sm font-bold hover:bg-brand-hover cursor-pointer disabled:opacity-50 transition-colors">
            {saving ? 'Saving...' : 'Save Request'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Team Assign Dropdown ─── */
// Multi-select team picker. `value` is an array of names; `onChange` returns an array.
export function TeamAssignDropdown({ members, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = Array.isArray(value) ? value : (value ? [value] : []);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const toggle = (name) => {
    if (selected.includes(name)) onChange(selected.filter(n => n !== name));
    else onChange([...selected, name]);
  };
  const initials = (name) => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const allSelected = members.length > 0 && members.every((m) => selected.includes(m.name));
  const toggleAll = () => {
    if (allSelected) onChange([]);
    else onChange(members.map((m) => m.name));
  };

  return (
    <div className="relative w-[280px]" ref={ref}>
      {/* Trigger: outlined box that grows as chips are added */}
      <div
        onClick={() => setOpen(true)}
        className="relative w-full min-h-[44px] px-3 py-2 pr-16 rounded-lg border border-border-subtle bg-card cursor-pointer flex flex-wrap items-center gap-1.5"
      >
        {selected.length === 0 && (
          <span className="text-sm text-muted">Assign team members</span>
        )}
        {selected.map((n) => (
          <span key={n}
            className="inline-flex items-center gap-1.5 pl-1 pr-1 py-0.5 rounded-full bg-surface-alt text-xs font-semibold text-primary"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[9px] font-bold flex items-center justify-center">
              {initials(n)}
            </span>
            {n}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggle(n); }}
              className="p-0.5 text-muted hover:text-primary cursor-pointer rounded-full"
              title="Remove"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        {/* Right-side controls: clear-all + chevron */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {selected.length > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange([]); }}
              className="w-6 h-6 rounded-full bg-surface-alt text-muted hover:text-primary flex items-center justify-center cursor-pointer"
              title="Clear all"
            >
              <X size={12} />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
            className="text-muted hover:text-primary cursor-pointer"
          >
            <ChevronDown size={16} />
          </button>
        </div>
      </div>

      {/* Dropdown panel — opens upward so it doesn't push the form down */}
      {open && (
        <div className="absolute left-0 right-0 bottom-full mb-1 z-50 bg-card border border-border-subtle rounded-xl shadow-2xl py-2 max-h-[320px] overflow-y-auto">
          {members.length > 0 && (
            <button
              onClick={toggleAll}
              className="w-full px-4 py-2 text-left text-sm font-bold text-primary hover:bg-surface-alt cursor-pointer"
            >
              {allSelected ? 'Unselect all' : 'Select all'}
            </button>
          )}
          {members.length === 0 && (
            <p className="px-4 py-3 text-xs text-muted">No team members found</p>
          )}
          {members.map((m) => {
            const isOn = selected.includes(m.name);
            return (
              <button
                key={m.email}
                onClick={() => toggle(m.name)}
                className={`w-full px-4 py-2 text-left text-sm flex items-center gap-3 hover:bg-surface-alt cursor-pointer transition-colors`}
              >
                <span className="w-4 flex items-center justify-center text-emerald-600">
                  {isOn && <Check size={16} strokeWidth={3} />}
                </span>
                <span className="w-7 h-7 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">
                  {initials(m.name)}
                </span>
                <span className="text-primary font-medium">{m.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Overview section — service details, photos, lead source ─── */
function OverviewSection({ request, onUpdate }) {
  const r = request;
  const existingPhotos = (r.raw_payload?.photos || []).filter(Boolean);
  const [editing, setEditing] = useState(false);
  const [draftNotes, setDraftNotes] = useState(r.notes || '');
  // Existing photo URLs we're keeping + brand-new pending uploads.
  const [keepUrls, setKeepUrls] = useState(existingPhotos);
  const [newPhotos, setNewPhotos] = useState([]); // [{ file, previewUrl }]
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const enterEdit = () => {
    setDraftNotes(r.notes || '');
    setKeepUrls(existingPhotos);
    setNewPhotos([]);
    setError(null);
    setEditing(true);
  };

  // Free blob: preview URLs on unmount or cancel.
  useEffect(() => () => {
    newPhotos.forEach((p) => { try { URL.revokeObjectURL(p.previewUrl); } catch {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancel = () => {
    newPhotos.forEach((p) => { try { URL.revokeObjectURL(p.previewUrl); } catch {} });
    setDraftNotes(r.notes || '');
    setKeepUrls(existingPhotos);
    setNewPhotos([]);
    setEditing(false);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    // Upload any newly attached photos to the request-photos bucket.
    const uploadedUrls = [];
    const uploadErrors = [];
    for (const p of newPhotos) {
      const compressed = await compressImage(p.file);
      const ext = (compressed.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${r.org_id || 'unscoped'}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from('request-photos').upload(path, compressed, {
        contentType: compressed.type || 'image/jpeg',
        upsert: false,
      });
      if (upErr) {
        console.error('[Overview] photo upload failed:', upErr.message, upErr);
        uploadErrors.push(`${p.file.name}: ${upErr.message}`);
        continue;
      }
      const { data } = supabase.storage.from('request-photos').getPublicUrl(path);
      if (data?.publicUrl) uploadedUrls.push(data.publicUrl);
      else uploadErrors.push(`${p.file.name}: no public URL returned`);
    }
    if (uploadErrors.length && uploadedUrls.length === 0) {
      // Every upload failed — surface the error and don't close the editor.
      setError(`Photo upload failed: ${uploadErrors.join('; ')}`);
      setSaving(false);
      return;
    }
    const allPhotos = [...keepUrls, ...uploadedUrls];
    const nextPayload = { ...(r.raw_payload || {}), photos: allPhotos };
    await onUpdate(r.id, {
      notes: draftNotes || null,
      raw_payload: nextPayload,
    });
    // Free the blob: URLs now that uploads landed
    newPhotos.forEach((p) => { try { URL.revokeObjectURL(p.previewUrl); } catch {} });
    setNewPhotos([]);
    setSaving(false);
    setEditing(false);
    if (uploadErrors.length) {
      // Partial success — keep modal closed but surface a warning.
      setError(`Saved, but some uploads failed: ${uploadErrors.join('; ')}`);
    }
  };

  return (
    <div className="p-5 sm:p-6 border-t border-border-subtle relative">
      <div className="flex items-start justify-between mb-4">
        <h3 className="text-lg font-black text-primary">Overview</h3>
        {!editing && (
          <button onClick={enterEdit} className="p-1.5 text-muted hover:text-primary cursor-pointer" title="Edit overview">
            <Pencil size={16} />
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-500">
          {error}
        </div>
      )}

      {/* Service details */}
      <div className="mb-5">
        <p className="text-sm font-bold text-primary mb-1">Service details</p>
        <p className="text-[11px] text-muted mb-1.5">Please provide as much information as you can</p>
        {editing ? (
          <textarea
            value={draftNotes}
            onChange={(e) => setDraftNotes(e.target.value)}
            rows={3}
            className="w-full px-3 py-2.5 rounded-lg bg-card border border-border-subtle text-sm text-primary placeholder:text-muted focus:outline-none focus:border-brand/50 resize-none"
          />
        ) : (
          <p className="text-sm text-secondary whitespace-pre-wrap">{r.notes || <span className="text-muted">—</span>}</p>
        )}
      </div>

      {/* Photos */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-sm font-bold text-primary">Share images of the work to be done</p>
          {editing && (
            <label className="text-[11px] font-semibold text-brand-text hover:underline cursor-pointer">
              + Add picture
              <input
                type="file" accept="image/*" multiple className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  setNewPhotos((prev) => [...prev, ...files.map((f) => ({ file: f, previewUrl: URL.createObjectURL(f) }))]);
                  e.target.value = '';
                }}
              />
            </label>
          )}
        </div>
        {(() => {
          const items = editing
            ? [
                ...keepUrls.map((url) => ({ url, kind: 'existing' })),
                ...newPhotos.map((p) => ({ url: p.previewUrl, kind: 'new', file: p.file })),
              ]
            : existingPhotos.map((url) => ({ url, kind: 'existing' }));
          if (items.length === 0) {
            return <p className="text-sm text-muted">—</p>;
          }
          return (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {items.map((it, i) => (
                <div key={i} className="relative group rounded-lg overflow-hidden border border-border-subtle aspect-square bg-surface-alt">
                  <a href={it.url} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
                    <img src={it.url} alt="" className="w-full h-full object-cover" />
                  </a>
                  {editing && (
                    <button
                      type="button"
                      onClick={() => {
                        if (it.kind === 'existing') {
                          setKeepUrls((prev) => prev.filter((u) => u !== it.url));
                        } else {
                          setNewPhotos((prev) => {
                            const gone = prev.find((p) => p.previewUrl === it.url);
                            if (gone?.previewUrl) { try { URL.revokeObjectURL(gone.previewUrl); } catch {} }
                            return prev.filter((p) => p.previewUrl !== it.url);
                          });
                        }
                      }}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* How did you hear about us — read-only (Jobber doesn't let you edit this from the detail view either) */}
      <div className="mb-2">
        <p className="text-sm font-bold text-primary mb-0.5">How did you hear about us?</p>
        <p className="text-sm text-secondary capitalize">{r.source || <span className="text-muted normal-case">—</span>}</p>
      </div>

      {editing && (
        <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-border-subtle">
          <button onClick={cancel} className="px-4 py-2 rounded-lg border border-border-subtle text-sm font-bold text-primary hover:bg-surface-alt cursor-pointer">Cancel</button>
          <button onClick={save} disabled={saving} className="px-5 py-2 rounded-lg bg-brand text-on-brand text-sm font-bold hover:bg-brand-hover cursor-pointer disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Detail View ─── */
function RequestDetail({ request, onBack, onStatusChange, onUpdate, onDelete }) {
  const r = request;
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [r.id]);
  const { currentUser, user } = useAuth();
  const permissions = useAppStore((s) => s.permissions) || {};
  const teamMembers = (() => {
    const list = Object.entries(permissions).map(([email, info]) => ({ email, name: info.name || email }));
    // Include the owner if not already in permissions
    const ownerEmail = user?.email?.toLowerCase();
    if (ownerEmail && !permissions[ownerEmail]) {
      list.unshift({ email: ownerEmail, name: currentUser || user?.user_metadata?.full_name || 'Owner' });
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  })();
  const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Unknown';
  const address = [r.street, r.city, r.state, r.zip].filter(Boolean).join(', ');
  const [showMore, setShowMore] = useState(false);
  const hasAssessment = !!(r.assessment_date || r.raw_payload?.assessment?.instructions);
  const [assessOpen, setAssessOpen] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showNoAssigneeConfirm, setShowNoAssigneeConfirm] = useState(false);
  // Snapshot of the form at the moment the editor opened. We compare against this
  // on Cancel to decide whether to show the "discard unsaved changes" confirmation.
  const editorBaselineRef = useRef(null);
  const [assessComplete, setAssessComplete] = useState(r.raw_payload?.assessment?.completed || false);
  const assess = r.raw_payload?.assessment || {};
  const [instructions, setInstructions] = useState(assess.instructions || '');
  const [startDate, setStartDate] = useState(r.assessment_date || '');
  // Times are stored as 24-hour ("15:00") but displayed in 12-hour ("03:00 PM").
  const toDisplay12 = (s) => {
    if (!s) return '';
    // Accept both "HH:MM" and "HH:MM:SS" — Postgres time columns store the seconds.
    const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!m) return s;
    const h24 = parseInt(m[1], 10);
    const ampm = h24 >= 12 ? 'PM' : 'AM';
    const h = h24 % 12 || 12;
    return `${String(h).padStart(2, '0')}:${m[2]} ${ampm}`;
  };
  const [startTime, setStartTime] = useState(toDisplay12(r.assessment_time));
  const [endTime, setEndTime] = useState(toDisplay12(assess.end_time));
  const [scheduleLater, setScheduleLater] = useState(!r.assessment_date);
  const [anytime, setAnytime] = useState(!r.assessment_time);
  // Multi-assignee. Stored as an array of names. Falls back to legacy single string if found.
  const [assignees, setAssignees] = useState(
    Array.isArray(assess.assignees) ? assess.assignees : (assess.assignee ? [assess.assignee] : [])
  );

  // Snapshot the form whenever the editor flips open so Cancel can detect changes.
  useEffect(() => {
    if (assessOpen) {
      editorBaselineRef.current = { instructions, startDate, startTime, endTime, scheduleLater, anytime, assignees: [...assignees] };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessOpen]);

  const isDirty = () => {
    const base = editorBaselineRef.current;
    if (!base) return false;
    return (
      base.instructions !== instructions ||
      base.startDate !== startDate ||
      base.startTime !== startTime ||
      base.endTime !== endTime ||
      base.scheduleLater !== scheduleLater ||
      base.anytime !== anytime ||
      JSON.stringify(base.assignees) !== JSON.stringify(assignees)
    );
  };

  const handleCancel = () => {
    if (isDirty()) setShowDiscardConfirm(true);
    else setAssessOpen(false);
  };
  const discardChanges = () => {
    const base = editorBaselineRef.current;
    if (base) {
      setInstructions(base.instructions);
      setStartDate(base.startDate);
      setStartTime(base.startTime);
      setEndTime(base.endTime);
      setScheduleLater(base.scheduleLater);
      setAnytime(base.anytime);
      setAssignees(base.assignees);
    }
    setShowDiscardConfirm(false);
    setAssessOpen(false);
  };
  const [saving, setSaving] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(r.title || '');
  const moreRef = useRef(null);
  const assessRef = useRef(null);
  const titleRef = useRef(null);
  const clientMenuRef = useRef(null);
  const [showClientMenu, setShowClientMenu] = useState(false);
  const navigate = useNavigate();
  const displayTitle = r.title || `Request for ${name}`;

  useEffect(() => {
    if (!showMore) return;
    const close = (e) => { if (moreRef.current && !moreRef.current.contains(e.target)) setShowMore(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showMore]);

  useEffect(() => {
    if (!showClientMenu) return;
    const close = (e) => { if (clientMenuRef.current && !clientMenuRef.current.contains(e.target)) setShowClientMenu(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showClientMenu]);

  const saveAssessment = async () => {
    setSaving(true);
    const assessData = {
      instructions: instructions || null,
      end_time: anytime ? null : timeStringTo24(endTime) || null,
      assignees,
      // Keep legacy `assignee` (first name) so older detail views still render something.
      assignee: assignees[0] || null,
      completed: assessComplete,
    };
    const start24 = timeStringTo24(startTime);
    await onUpdate(r.id, {
      assessment_date: scheduleLater ? null : startDate || null,
      assessment_time: anytime ? null : start24 || null,
      raw_payload: { ...(r.raw_payload || {}), assessment: assessData },
    });

    // Also create/update a schedule_items entry so it shows on the calendar
    if (!scheduleLater && startDate) {
      const org = r.org_id;
      if (org) {
        const startAt = anytime
          ? new Date(`${startDate}T00:00:00`).toISOString()
          : new Date(`${startDate}T${start24 || '09:00'}:00`).toISOString();
        const end24 = timeStringTo24(endTime);
        const endAt = !anytime && end24
          ? new Date(`${startDate}T${end24}:00`).toISOString()
          : null;
        const scheduleId = r.raw_payload?.assessment?.schedule_item_id;
        if (scheduleId) {
          await supabase.from('schedule_items').update({
            start_at: startAt, end_at: endAt, anytime, notes: instructions || null,
            assigned_to: assignees, updated_at: new Date().toISOString(),
          }).eq('id', scheduleId);
        } else {
          // Defensive: nuke any prior assessment rows for this request before
          // inserting a fresh one. Prevents duplicate calendar entries when an
          // earlier save's schedule_item_id didn't make it back into raw_payload.
          await supabase.from('schedule_items').delete().eq('request_id', r.id).eq('type', 'assessment');
          const { data: inserted } = await supabase.from('schedule_items').insert({
            org_id: org, type: 'assessment',
            title: `Assessment: ${displayTitle}`,
            start_at: startAt, end_at: endAt, all_day: false, anytime,
            notes: instructions || null, status: 'scheduled',
            assigned_to: assignees,
            request_id: r.id,
          }).select('id').single();
          if (inserted?.id) {
            await onUpdate(r.id, {
              raw_payload: { ...(r.raw_payload || {}), assessment: { ...assessData, schedule_item_id: inserted.id } },
            });
          }
        }
      }
    }

    setSaving(false);
    setAssessOpen(false);
  };

  const [showCompletePopup, setShowCompletePopup] = useState(false);

  const toggleComplete = async (val) => {
    setAssessComplete(val);
    await onUpdate(r.id, {
      raw_payload: {
        ...(r.raw_payload || {}),
        assessment: { ...assess, completed: val },
      },
    });
    // Mirror the completion onto the linked calendar item so the schedule view
    // stops showing a "scheduled" assessment for a job that's already been done.
    const schedId = r.raw_payload?.assessment?.schedule_item_id;
    if (schedId) {
      await supabase.from('schedule_items')
        .update({ status: val ? 'complete' : 'scheduled', completed_at: val ? new Date().toISOString() : null })
        .eq('id', schedId);
    }
    if (val) setShowCompletePopup(true);
  };

  // Reset the form to the "fresh assessment" defaults: Schedule later + Anytime both
  // checked, no date/time, no assignees, empty instructions.
  const resetToDefaults = () => {
    setInstructions('');
    setStartDate('');
    setStartTime('');
    setEndTime('');
    setScheduleLater(true);
    setAnytime(true);
    setAssignees([]);
    setAssessComplete(false);
  };

  const handleScheduleClick = () => {
    if (!hasAssessment) resetToDefaults();
    setAssessOpen(true);
    setTimeout(() => assessRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  return (
    <div className="space-y-4">

      {/* ── Status bar + actions ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          {(() => {
            const cfg = STATUS_CONFIG[bucketFor(r)];
            return (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-white/10 text-primary">
                <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />{cfg.label}
              </span>
            );
          })()}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative" ref={moreRef}>
            <button onClick={() => setShowMore(!showMore)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border-subtle text-sm font-bold text-primary hover:bg-surface-alt cursor-pointer transition-colors">
              <MoreHorizontal size={16} /> More
            </button>
            {showMore && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border-subtle rounded-xl shadow-2xl py-1 min-w-[200px]">
                <button onClick={() => { onStatusChange(r.id, 'quoted'); setShowMore(false); }}
                  className="w-full px-4 py-3 text-left text-sm font-medium flex items-center gap-3 hover:bg-surface-alt cursor-pointer text-secondary">
                  <FileText size={16} /> Convert to Quote
                </button>
                <button onClick={() => { onStatusChange(r.id, 'won'); setShowMore(false); }}
                  className="w-full px-4 py-3 text-left text-sm font-medium flex items-center gap-3 hover:bg-surface-alt cursor-pointer text-secondary">
                  <Briefcase size={16} /> Convert to Job
                </button>
                <div className="border-t border-border-subtle my-1" />
                <button onClick={() => { onStatusChange(r.id, 'lost'); setShowMore(false); }}
                  className="w-full px-4 py-3 text-left text-sm font-medium flex items-center gap-3 hover:bg-surface-alt cursor-pointer text-secondary">
                  <Archive size={16} /> Archive
                </button>
                <button onClick={() => { if (confirm('Delete this request?')) { onDelete(r.id); } setShowMore(false); }}
                  className="w-full px-4 py-3 text-left text-sm font-medium flex items-center gap-3 hover:bg-surface-alt cursor-pointer text-red-400">
                  <Trash2 size={16} /> Delete
                </button>
              </div>
            )}
          </div>
          {hasAssessment ? (
            <button
              onClick={() => alert('Text confirmation sending isn\'t wired yet — stub.')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-on-brand text-sm font-bold hover:bg-brand-hover cursor-pointer transition-colors">
              <MessageSquare size={16} /> Text Confirmation
            </button>
          ) : (
            <button onClick={handleScheduleClick}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-on-brand text-sm font-bold hover:bg-brand-hover cursor-pointer transition-colors">
              <CalendarDays size={16} /> Schedule Assessment
            </button>
          )}
        </div>
      </div>

      {/* ── Unified request document — one big card; sections separated by dividers ── */}
      <div className="rounded-2xl bg-card border border-border-subtle overflow-hidden">

      {/* Title header — tinted top section to call out "this is about <client>" */}
      <div className="p-5 sm:p-6 bg-amber-500/[0.07] border-b border-border-subtle">
        <div className="flex items-start justify-between">
          {editingTitle ? (
            <div className="flex-1 flex items-center gap-2">
              <input ref={titleRef} value={titleDraft} onChange={e => setTitleDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { onUpdate(r.id, { title: titleDraft || null }); setEditingTitle(false); }
                  if (e.key === 'Escape') { setTitleDraft(r.title || ''); setEditingTitle(false); }
                }}
                onBlur={() => { onUpdate(r.id, { title: titleDraft || null }); setEditingTitle(false); }}
                className="text-2xl font-black text-primary bg-transparent border-b-2 border-brand focus:outline-none flex-1" />
            </div>
          ) : (
            <h2 className="text-2xl font-black text-primary">{displayTitle}</h2>
          )}
          {!editingTitle && (
            <button onClick={() => { setEditingTitle(true); setTimeout(() => titleRef.current?.focus(), 50); }}
              className="p-1.5 text-muted hover:text-primary cursor-pointer shrink-0 ml-2">
              <Pencil size={16} />
            </button>
          )}
        </div>

        {/* Client info row */}
        <div className="mt-4 flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex-1 rounded-xl border border-border-subtle bg-card/60 p-4 relative">
            <div className="flex items-start justify-between gap-2">
              <button
                onClick={() => r.client_id && navigate(`/clients/${r.client_id}`)}
                className="text-sm font-bold text-primary hover:underline cursor-pointer flex items-center gap-1.5 text-left"
                disabled={!r.client_id}>
                {name}
                {r.client_id && <span className="w-1.5 h-1.5 rounded-full bg-brand inline-block" />}
              </button>
              {r.client_id && (
                <div className="relative" ref={clientMenuRef}>
                  <button onClick={() => setShowClientMenu(v => !v)}
                    className="p-1.5 rounded-md hover:bg-surface-alt text-muted hover:text-primary cursor-pointer">
                    <MoreHorizontal size={16} />
                  </button>
                  {showClientMenu && (
                    <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border-subtle rounded-xl shadow-2xl py-1 min-w-[200px]">
                      <button onClick={() => { setShowClientMenu(false); navigate(`/clients/${r.client_id}`); }}
                        className="w-full px-4 py-2.5 text-left text-sm font-medium flex items-center gap-3 hover:bg-surface-alt cursor-pointer text-secondary">
                        <Eye size={14} /> View client profile
                      </button>
                      <button onClick={() => { setShowClientMenu(false); navigate(`/clients/${r.client_id}/edit`); }}
                        className="w-full px-4 py-2.5 text-left text-sm font-medium flex items-center gap-3 hover:bg-surface-alt cursor-pointer text-secondary">
                        <Pencil size={14} /> Edit client details
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="mt-2 space-y-1.5">
              {address && <p className="flex items-start gap-2 text-sm text-secondary"><MapPin size={14} className="shrink-0 text-muted mt-0.5" /> {address}</p>}
              {r.phone && <a href={`tel:${r.phone}`} className="flex items-center gap-2 text-sm text-brand-text hover:underline"><Phone size={14} /> {r.phone}</a>}
              {r.email && <a href={`mailto:${r.email}`} className="flex items-center gap-2 text-sm text-brand-text hover:underline"><Mail size={14} /> {r.email}</a>}
            </div>
          </div>
          <div className="flex gap-8 sm:pt-2">
            <div>
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Requested</p>
              <p className="text-sm text-primary font-semibold mt-1">{new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
            </div>
            {r.assessment_date && (
              <div>
                <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Assessment</p>
                <p className="text-sm text-primary font-semibold mt-1">
                  {new Date(r.assessment_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {(() => {
                    const fmt = (s) => {
                      if (!s) return '';
                      if (/AM|PM/i.test(s)) return s;
                      const m = String(s).match(/^(\d{1,2}):(\d{2})/);
                      if (!m) return '';
                      return new Date(`2000-01-01T${m[1].padStart(2, '0')}:${m[2]}:00`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                    };
                    const t = fmt(r.assessment_time);
                    return t ? ` @ ${t}` : ' @ Anytime';
                  })()}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Overview (service details, photos, lead source) ── */}
      <OverviewSection request={r} onUpdate={onUpdate} />

      {/* ── On-site assessment ── */}
      <div ref={assessRef} className="p-5 sm:p-6 border-t border-border-subtle">
        <h3 className="text-lg font-black text-primary mb-4">On-site assessment</h3>

        {assessOpen ? (
          /* ── Editing form ── */
          <>
            <textarea value={instructions} onChange={e => setInstructions(e.target.value)}
              placeholder="Instructions" rows={3}
              className="w-full px-3 py-2.5 rounded-lg bg-card border border-border-subtle text-sm text-primary placeholder:text-muted focus:outline-none focus:border-brand/50 resize-none" />

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-6 mt-4">
              {/* Schedule — date on top, time underneath */}
              <div>
                <p className="text-sm font-black text-primary mb-2">Schedule</p>
                <div className="flex flex-col gap-3">
                  {/* Date row */}
                  <div className="flex flex-col gap-2">
                    <CalendarInput
                      label="Date"
                      value={scheduleLater ? '' : startDate}
                      onChange={setStartDate}
                      disabled={scheduleLater}
                      placeholder="mm/dd/yyyy"
                      className="w-[260px]"
                    />
                    <label
                      onClick={() => {
                        const next = !scheduleLater;
                        setScheduleLater(next);
                        setAnytime(next);
                        if (!next) {
                          if (!startDate) {
                            const t = new Date();
                            setStartDate(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`);
                          }
                          if (!startTime && !endTime) {
                            const now = new Date();
                            const startHour = (now.getHours() + 1) % 24;
                            const endHour = (startHour + 1) % 24;
                            setStartTime(to12Hour(startHour));
                            setEndTime(to12Hour(endHour));
                          }
                        }
                      }}
                      className="flex items-center gap-2 cursor-pointer select-none"
                    >
                      <span className={`w-4.5 h-4.5 rounded border-2 flex items-center justify-center transition-colors ${scheduleLater ? 'bg-brand border-brand' : 'border-border-subtle'}`}>
                        {scheduleLater && <Check size={12} className="text-on-brand" />}
                      </span>
                      <span className="text-xs text-secondary">Schedule later</span>
                    </label>
                  </div>
                  {/* Time row */}
                  <div className="flex flex-col gap-2">
                    <div className="flex rounded-lg overflow-hidden border border-border-subtle w-[260px]">
                      <TimeInput
                        label="Start time"
                        value={anytime ? '' : startTime}
                        onChange={(next) => {
                          setStartTime(next);
                          // If the new start is at or after the end, push end out by 1h.
                          const s = timeStringTo24(next);
                          const e = timeStringTo24(endTime);
                          if (s && e && s >= e) {
                            const [sh, sm] = s.split(':').map(Number);
                            const nh = (sh + 1) % 24;
                            const ampm = nh >= 12 ? 'PM' : 'AM';
                            const h12 = nh % 12 || 12;
                            setEndTime(`${String(h12).padStart(2, '0')}:${String(sm).padStart(2, '0')} ${ampm}`);
                          }
                        }}
                        disabled={anytime}
                        className="w-[130px]"
                      />
                      <div className="w-px bg-border-subtle" />
                      <TimeInput
                        label="End time"
                        value={anytime ? '' : endTime}
                        onChange={(next) => {
                          setEndTime(next);
                          const s = timeStringTo24(startTime);
                          const e = timeStringTo24(next);
                          if (s && e && e < s) setStartTime(next);
                        }}
                        disabled={anytime}
                        className="w-[130px]"
                      />
                    </div>
                    {(() => {
                      const anytimeLocked = scheduleLater;
                      return (
                        <label
                          onClick={() => {
                            if (anytimeLocked) return;
                            const next = !anytime;
                            setAnytime(next);
                            if (!next && !startTime && !endTime) {
                              const now = new Date();
                              const startHour = (now.getHours() + 1) % 24;
                              const endHour = (startHour + 1) % 24;
                              setStartTime(to12Hour(startHour));
                              setEndTime(to12Hour(endHour));
                            }
                          }}
                          className={`flex items-center gap-2 select-none ${anytimeLocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          <span className={`w-4.5 h-4.5 rounded border-2 flex items-center justify-center transition-colors ${
                            anytimeLocked ? 'bg-muted/40 border-muted/40' :
                            anytime ? 'bg-brand border-brand' : 'border-border-subtle'
                          }`}>
                            {(anytime || anytimeLocked) && <Check size={12} className="text-on-brand" />}
                          </span>
                          <span className={`text-xs ${anytimeLocked ? 'text-muted/70' : 'text-secondary'}`}>Anytime</span>
                        </label>
                      );
                    })()}
                  </div>
                </div>
              </div>
              {/* Team — under the schedule block */}
              <div>
                <p className="text-sm font-black text-primary mb-2">Team</p>
                <TeamAssignDropdown members={teamMembers} value={assignees} onChange={setAssignees} />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 mt-4 pt-4 border-t border-border-subtle">
              {hasAssessment ? (
                <button
                  onClick={async () => {
                    if (!confirm('Delete this assessment?')) return;
                    const schedId = r.raw_payload?.assessment?.schedule_item_id;
                    if (schedId) {
                      await supabase.from('schedule_items').delete().eq('id', schedId);
                    }
                    const nextPayload = { ...(r.raw_payload || {}) };
                    delete nextPayload.assessment;
                    await onUpdate(r.id, {
                      assessment_date: null,
                      assessment_time: null,
                      raw_payload: Object.keys(nextPayload).length ? nextPayload : null,
                    });
                    setAssessComplete(false);
                    setAssessOpen(false);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold text-red-500 hover:bg-red-500/10 cursor-pointer"
                >
                  <Trash2 size={14} /> Delete assessment
                </button>
              ) : <span />}
              <div className="flex items-center gap-2">
                <button onClick={handleCancel}
                  className="px-4 py-2 rounded-lg border border-border-subtle text-sm font-bold text-primary hover:bg-surface-alt cursor-pointer">Cancel</button>
                <button
                  onClick={() => {
                    if (assignees.length === 0) setShowNoAssigneeConfirm(true);
                    else saveAssessment();
                  }}
                  disabled={saving}
                  className="px-5 py-2 rounded-lg bg-brand text-on-brand text-sm font-bold hover:bg-brand-hover cursor-pointer disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>

            {showNoAssigneeConfirm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/60" onClick={() => setShowNoAssigneeConfirm(false)} />
                <div className="relative bg-card border border-border-subtle rounded-2xl shadow-2xl w-full max-w-md p-6">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <h3 className="text-lg font-black text-primary">No one assigned</h3>
                    <button onClick={() => setShowNoAssigneeConfirm(false)} className="text-muted hover:text-primary cursor-pointer p-1 -m-1">
                      <X size={18} />
                    </button>
                  </div>
                  <p className="text-sm text-secondary">This assessment isn't assigned to anyone. Save it anyway?</p>
                  <div className="flex items-center justify-end gap-2 mt-5">
                    <button onClick={() => setShowNoAssigneeConfirm(false)}
                      className="px-4 py-2 rounded-lg border border-border-subtle text-sm font-bold text-primary hover:bg-surface-alt cursor-pointer">
                      Go back
                    </button>
                    <button onClick={() => { setShowNoAssigneeConfirm(false); saveAssessment(); }}
                      className="px-4 py-2 rounded-lg bg-brand text-on-brand text-sm font-bold hover:bg-brand-hover cursor-pointer">
                      Save anyway
                    </button>
                  </div>
                </div>
              </div>
            )}

            {showDiscardConfirm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/60" onClick={() => setShowDiscardConfirm(false)} />
                <div className="relative bg-card border border-border-subtle rounded-2xl shadow-2xl w-full max-w-md p-6">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <h3 className="text-lg font-black text-primary">Discard unsaved changes</h3>
                    <button onClick={() => setShowDiscardConfirm(false)} className="text-muted hover:text-primary cursor-pointer p-1 -m-1">
                      <X size={18} />
                    </button>
                  </div>
                  <p className="text-sm text-secondary">You have unsaved changes. Cancelling will discard them.</p>
                  <div className="flex items-center justify-end gap-2 mt-5">
                    <button onClick={() => setShowDiscardConfirm(false)}
                      className="px-4 py-2 rounded-lg border border-border-subtle text-sm font-bold text-primary hover:bg-surface-alt cursor-pointer">
                      Continue Editing
                    </button>
                    <button onClick={discardChanges}
                      className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-bold hover:bg-red-600 cursor-pointer">
                      Discard Changes
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : hasAssessment ? (
          /* ── Saved summary ── */
          <div className="relative">
            <div className="absolute top-0 right-0 flex items-center gap-1">
              <button onClick={() => setAssessOpen(true)}
                className="p-1.5 text-muted hover:text-primary cursor-pointer" title="Edit">
                <Pencil size={16} />
              </button>
              <button
                onClick={async () => {
                  if (!confirm('Delete this assessment?')) return;
                  const schedId = r.raw_payload?.assessment?.schedule_item_id;
                  if (schedId) {
                    await supabase.from('schedule_items').delete().eq('id', schedId);
                  }
                  const nextPayload = { ...(r.raw_payload || {}) };
                  delete nextPayload.assessment;
                  await onUpdate(r.id, {
                    assessment_date: null,
                    assessment_time: null,
                    raw_payload: Object.keys(nextPayload).length ? nextPayload : null,
                  });
                  setAssessComplete(false);
                  setAssessOpen(false);
                }}
                className="p-1.5 text-muted hover:text-red-500 cursor-pointer" title="Delete assessment">
                <Trash2 size={16} />
              </button>
            </div>
            {assess.instructions && (
              <div className="mb-3">
                <p className="text-xs font-bold text-muted mb-1">Instructions</p>
                <p className="text-sm text-secondary">{assess.instructions}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-8">
              <div>
                <p className="text-xs font-bold text-muted mb-1">Schedule</p>
                <p className="text-sm text-primary font-semibold">
                  {r.assessment_date
                    ? new Date(r.assessment_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : 'Not scheduled'}
                  {(() => {
                    // Handle both stored 24-hour ("HH:MM(:SS)") and legacy 12-hour display ("HH:MM AM").
                    const fmt = (s) => {
                      if (!s) return '';
                      if (/AM|PM/i.test(s)) return s; // already 12-hour display
                      const m = String(s).match(/^(\d{1,2}):(\d{2})/);
                      if (!m) return '';
                      const d = new Date(`2000-01-01T${m[1].padStart(2, '0')}:${m[2]}:00`);
                      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                    };
                    const a = fmt(r.assessment_time);
                    const b = fmt(assess.end_time);
                    return `${a ? ` @ ${a}` : ''}${b ? ` – ${b}` : ''}`;
                  })()}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-muted mb-1">Team</p>
                {(() => {
                  const list = Array.isArray(assess.assignees) ? assess.assignees : (assess.assignee ? [assess.assignee] : []);
                  if (list.length === 0) return null;
                  return (
                    <div className="flex flex-wrap gap-1.5">
                      {list.map((n) => (
                        <span key={n} className="inline-flex items-center gap-1.5 text-sm text-primary font-semibold px-2 py-1 rounded-full bg-surface-alt">
                          <span className="w-5 h-5 rounded-full bg-brand/20 text-brand text-[9px] font-bold flex items-center justify-center">
                            {n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                          </span>
                          {n}
                        </span>
                      ))}
                    </div>
                  );
                })()}
                {(() => {
                  const list = Array.isArray(assess.assignees) ? assess.assignees : (assess.assignee ? [assess.assignee] : []);
                  if (list.length > 0) return null;
                  return (
                    <p className="text-sm text-red-400/70 font-semibold italic flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-red-500/10 text-red-400 text-[9px] flex items-center justify-center">✕</span>
                      Unassigned
                    </p>
                  );
                })()}
              </div>
            </div>

            <label
              onClick={() => toggleComplete(!assessComplete)}
              className="flex items-center gap-2 mt-3 cursor-pointer select-none"
            >
              <span className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${assessComplete ? 'bg-brand border-brand' : 'border-border-subtle hover:border-muted'}`}>
                {assessComplete && <Check size={13} className="text-on-brand" />}
              </span>
              <span className="text-sm text-secondary">Complete assessment</span>
            </label>
          </div>
        ) : (
          /* ── Empty placeholder ── */
          <button onClick={() => { resetToDefaults(); setAssessOpen(true); }}
            className="w-full rounded-xl border-2 border-dashed border-border-subtle hover:border-muted py-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors group">
            <div className="w-12 h-12 rounded-full bg-surface-alt flex items-center justify-center group-hover:bg-white/10 transition-colors">
              <ClipboardList size={22} className="text-muted" />
            </div>
            <p className="text-sm text-muted">Visit the property to assess the job before you do the work</p>
          </button>
        )}
      </div>

      </div>{/* /unified request document wrapper */}

      {showCompletePopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowCompletePopup(false)} />
          <div className="relative bg-card border border-border-subtle rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
              <h3 className="text-lg font-black text-primary">Assessment completed</h3>
              <button onClick={() => setShowCompletePopup(false)} className="p-1 text-muted hover:text-primary cursor-pointer">
                <X size={18} />
              </button>
            </div>
            <div className="py-2">
              <button
                onClick={() => { onStatusChange(r.id, 'quoted'); setShowCompletePopup(false); }}
                className="w-full flex items-center gap-3 px-6 py-3 text-left text-sm font-bold text-primary hover:bg-surface-alt cursor-pointer"
              >
                <Crosshair size={18} className="text-rose-500" /> Convert to Quote
              </button>
              <button
                onClick={() => { onStatusChange(r.id, 'won'); setShowCompletePopup(false); }}
                className="w-full flex items-center gap-3 px-6 py-3 text-left text-sm font-bold text-primary hover:bg-surface-alt cursor-pointer"
              >
                <Briefcase size={18} className="text-emerald-600" /> Convert to Job
              </button>
              <button
                onClick={() => { onStatusChange(r.id, 'lost'); setShowCompletePopup(false); }}
                className="w-full flex items-center gap-3 px-6 py-3 text-left text-sm font-bold text-primary hover:bg-surface-alt cursor-pointer"
              >
                <Archive size={18} className="text-muted" /> Archive
              </button>
              <div className="h-px bg-border-subtle my-1 mx-6" />
              <button
                onClick={() => setShowCompletePopup(false)}
                className="w-full flex items-center gap-3 px-6 py-3 text-left text-sm font-bold text-primary hover:bg-surface-alt cursor-pointer"
              >
                <ClipboardList size={18} className="text-muted" /> Leave as assessment completed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ─── */
export default function Requests() {
  const { orgId, currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { requestNumber: urlRequestNumber } = useParams();
  const navigate = useNavigate();
  const [allRequests, setAllRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [statusMenu, setStatusMenu] = useState(null);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [statusSearch, setStatusSearch] = useState('');

  // Auto-open new request modal from Create menu (?new=1)
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowNewRequest(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Apply ?status=<bucket> from links (e.g. Home Workflow card → /requests?status=overdue)
  useEffect(() => {
    const s = searchParams.get('status');
    if (s && STATUS_CONFIG[s]) setStatusFilter(s);
  }, [searchParams]);

  // Sync selection with URL — refresh, deep-link, back/forward all work.
  useEffect(() => {
    if (!urlRequestNumber) {
      if (selected) setSelected(null);
      return;
    }
    if (allRequests.length === 0) return;
    const asNum = Number(urlRequestNumber);
    const match = allRequests.find(r =>
      (Number.isFinite(asNum) && Number(r.request_number) === asNum) || r.id === urlRequestNumber
    );
    if (match && selected?.id !== match.id) setSelected(match);
  }, [urlRequestNumber, allRequests]);

  const fetchRequests = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('requests').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
    if (error) console.error('[Requests] fetch error:', error.message);
    setAllRequests(data || []);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  // Close row status menu
  useEffect(() => {
    if (!statusMenu) return;
    const close = () => setStatusMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [statusMenu]);

  // Filtered requests
  const requests = (() => {
    let filtered = allRequests;
    if (statusFilter !== 'all') {
      const match = STATUS_CONFIG[statusFilter]?.match;
      if (match) filtered = filtered.filter(match);
    }
    const dateStart = getDateStart(dateFilter);
    if (dateStart) filtered = filtered.filter(r => new Date(r.created_at) >= dateStart);
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(r =>
        [r.first_name, r.last_name, r.email, r.phone, r.city, r.street, ...(r.services || [])]
          .filter(Boolean).some(f => f.toLowerCase().includes(q))
      );
    }
    return filtered;
  })();

  const updateStatus = async (id, newStatus) => {
    const { error } = await supabase.from('requests')
      .update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { console.error('[Requests] update error:', error.message); return; }
    setAllRequests(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
    if (selected?.id === id) setSelected(prev => ({ ...prev, status: newStatus }));
    setStatusMenu(null);
  };

  const updateRequest = async (id, fields) => {
    const { error } = await supabase.from('requests')
      .update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { console.error('[Requests] update error:', error.message); return; }
    setAllRequests(prev => prev.map(r => r.id === id ? { ...r, ...fields } : r));
    if (selected?.id === id) setSelected(prev => ({ ...prev, ...fields }));
  };

  const deleteRequest = async (id) => {
    // Clear any linked schedule_items first so the calendar doesn't keep showing
    // an orphaned assessment after the request itself is gone.
    await supabase.from('schedule_items').delete().eq('request_id', id);
    const { error } = await supabase.from('requests').delete().eq('id', id);
    if (error) { console.error('[Requests] delete error:', error.message); return; }
    setAllRequests(prev => prev.filter(r => r.id !== id));
    setSelected(null);
    navigate('/requests');
  };

  const createRequest = async (form) => {
    if (!orgId) return;
    const { error } = await supabase.from('requests').insert({
      org_id: orgId,
      title: form.title || null,
      first_name: form.first_name || null,
      last_name: form.last_name || null,
      email: form.email || null,
      phone: form.phone || null,
      street: form.street || null,
      city: form.city || null,
      state: form.state || null,
      zip: form.zip || null,
      services: form.services,
      source: form.source || null,
      notes: form.notes || null,
      salesperson: form.salesperson || null,
      assessment_date: form.assessment_date || null,
      assessment_time: timeStringTo24(form.assessment_time) || null,
      status: 'new',
      raw_payload: (form.photos?.length) ? { photos: form.photos } : null,
    });
    if (error) { console.error('[Requests] create error:', error.message); return; }
    setShowNewRequest(false);
    fetchRequests();
  };

  // Counts per derived bucket.
  const statusCounts = {};
  for (const s of STATUS_ORDER) {
    statusCounts[s] = allRequests.filter(STATUS_CONFIG[s].match).length;
  }
  const total = allRequests.length;
  const completeCount = statusCounts.assessment_complete || 0;
  const convRate = total > 0 ? Math.round((completeCount / total) * 100) : 0;

  // Status filter options with counts
  const statusOptions = STATUS_ORDER.map(s => ({ id: s, ...STATUS_CONFIG[s], count: statusCounts[s] }));
  const filteredStatusOptions = statusSearch
    ? statusOptions.filter(o => o.label.toLowerCase().includes(statusSearch.toLowerCase()))
    : statusOptions;

  const activeStatusLabel = statusFilter === 'all' ? 'All' : STATUS_CONFIG[statusFilter]?.label || 'All';
  const activeDateLabel = DATE_RANGES.find(d => d.id === dateFilter)?.label || 'All';

  if (selected) {
    return <div className="max-w-2xl mx-auto"><RequestDetail request={selected} onBack={() => { setSelected(null); navigate('/requests'); }} onStatusChange={updateStatus} onUpdate={updateRequest} onDelete={deleteRequest} /></div>;
  }

  // Avoid flashing the list while we resolve `/requests/:requestNumber` on a fresh load.
  if (urlRequestNumber && (loading || allRequests.length === 0)) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="text-muted animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {showNewRequest && <NewRequestModal onClose={() => setShowNewRequest(false)} onSave={createRequest} salesperson={currentUser} orgId={orgId} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-black text-primary">Requests</h1>
        <button onClick={() => setShowNewRequest(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-on-brand text-sm font-bold hover:bg-brand-hover cursor-pointer">
          New Request
        </button>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-card border border-border-subtle p-4">
          <p className="text-xs font-bold text-muted mb-3">Overview</p>
          <div className="space-y-1.5">
            {statusOptions.map(o => (
              <div key={o.id} className="flex items-center gap-2 text-xs">
                <span className={`w-2 h-2 rounded-full ${o.dot}`} />
                <span className="text-secondary">{o.label} ({o.count})</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl bg-card border border-border-subtle p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-bold text-muted">New requests</p>
            <TrendingUp size={14} className="text-emerald-500" />
          </div>
          <p className="text-xs text-muted">Past 30 days</p>
          <p className="text-3xl font-black text-primary mt-1">{allRequests.filter(r => r.status === 'new' && new Date(r.created_at) >= new Date(Date.now() - 30*86400000)).length}</p>
        </div>
        <div className="rounded-xl bg-card border border-border-subtle p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-bold text-muted">Conversion rate</p>
            <TrendingUp size={14} className={convRate >= 50 ? 'text-emerald-500' : 'text-amber-500'} />
          </div>
          <p className="text-xs text-muted">All time</p>
          <p className={`text-3xl font-black mt-2 ${convRate >= 50 ? 'text-emerald-400' : convRate >= 25 ? 'text-amber-400' : 'text-primary'}`}>{convRate}%</p>
        </div>
      </div>

      {/* All requests header + filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <span className="text-sm font-bold text-primary">All requests</span>
            <span className="text-xs text-muted ml-2">({requests.length} results)</span>
          </div>

          {/* Status filter dropdown */}
          <Dropdown
            open={showStatusDropdown}
            onClose={() => { setShowStatusDropdown(false); setStatusSearch(''); }}
            trigger={
              <button onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-surface-alt border border-border-subtle text-xs font-bold text-primary cursor-pointer hover:border-border-strong transition-colors">
                Status <span className="text-muted">|</span> {activeStatusLabel}
                <ChevronDown size={12} className="text-muted" />
              </button>
            }>
            <div className="p-2">
              <input
                type="text" placeholder="Search statuses" value={statusSearch}
                onChange={e => setStatusSearch(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface-alt border border-border-subtle text-xs text-primary placeholder:text-muted focus:outline-none mb-1" />
            </div>
            <button onClick={() => { setStatusFilter('all'); setShowStatusDropdown(false); setStatusSearch(''); }}
              className="w-full px-4 py-2.5 text-left text-xs font-medium flex items-center justify-between hover:bg-surface-alt cursor-pointer text-primary">
              All {statusFilter === 'all' && <Check size={14} className="text-brand" />}
            </button>
            {filteredStatusOptions.map(o => (
              <button key={o.id} onClick={() => { setStatusFilter(o.id); setShowStatusDropdown(false); setStatusSearch(''); }}
                className="w-full px-4 py-2.5 text-left text-xs font-medium flex items-center gap-2 hover:bg-surface-alt cursor-pointer text-secondary">
                <span className={`w-2.5 h-2.5 rounded-full ${o.dot}`} />
                <span className="flex-1">{o.label} ({o.count})</span>
                {statusFilter === o.id && <Check size={14} className="text-brand" />}
              </button>
            ))}
          </Dropdown>

          {/* Date filter dropdown */}
          <Dropdown
            open={showDateDropdown}
            onClose={() => setShowDateDropdown(false)}
            trigger={
              <button onClick={() => setShowDateDropdown(!showDateDropdown)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-surface-alt border border-border-subtle text-xs font-bold text-primary cursor-pointer hover:border-border-strong transition-colors">
                <CalendarDays size={12} /> {activeDateLabel}
                <ChevronDown size={12} className="text-muted" />
              </button>
            }>
            {DATE_RANGES.map(d => (
              <button key={d.id} onClick={() => { setDateFilter(d.id); setShowDateDropdown(false); }}
                className="w-full px-4 py-2.5 text-left text-xs font-medium flex items-center justify-between hover:bg-surface-alt cursor-pointer text-secondary">
                {d.label}
                {dateFilter === d.id && <Check size={14} className="text-brand" />}
              </button>
            ))}
          </Dropdown>
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input type="text" placeholder="Search requests..." value={search} onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-3 py-2 rounded-lg bg-surface-alt border border-border-subtle text-xs text-primary placeholder:text-muted focus:outline-none focus:border-brand/50 w-full sm:w-52" />
        </div>
      </div>

      {loading && <div className="flex items-center justify-center py-20"><Loader2 size={20} className="animate-spin text-brand" /></div>}

      {!loading && requests.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Inbox size={48} className="text-muted mb-4" />
          <h2 className="text-lg font-bold text-primary mb-1">No requests yet</h2>
          <p className="text-sm text-muted max-w-xs">When someone submits a form on your website, their request will show up here.</p>
        </div>
      )}

      {/* Table */}
      {!loading && requests.length > 0 && (
        <div className="rounded-xl border border-border-subtle overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-alt/50 text-left border-b border-border-subtle">
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted">Client ↕</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted hidden sm:table-cell">Title ↕</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted hidden md:table-cell">Property</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted hidden lg:table-cell">Contact</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted">Requested ↕</th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-muted text-right">Status ↕</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r, i) => {
                  const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Unknown';
                  const title = r.title
                    || (r.services?.length > 0 ? r.services.map(s => s.replace('-', ' ')).join(', ') : `Request for ${name}`);
                  const addr = r.street
                    ? `${r.street}, ${r.city || ''}${r.state ? `, ${r.state}` : ''} ${r.zip || ''}`.trim()
                    : [r.city, r.state, r.zip].filter(Boolean).join(', ') || '';
                  return (
                    <tr key={r.id} onClick={() => { setSelected(r); navigate(`/requests/${r.request_number ?? r.id}`); }}
                      className={`cursor-pointer transition-colors hover:bg-white/[0.02] ${i > 0 ? 'border-t border-border-subtle/50' : ''}`}>
                      <td className="px-4 py-3"><p className="font-bold text-primary">{name}</p></td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <p className="text-secondary capitalize truncate max-w-[200px]">{title || '—'}</p>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell"><p className="text-secondary truncate max-w-[250px]">{addr || '—'}</p></td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="space-y-0.5">
                          {r.phone && <p className="text-secondary text-xs">{r.phone}</p>}
                          {r.email && <p className="text-muted text-xs truncate max-w-[200px]">{r.email}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap"><p className="text-secondary text-xs">{formatDate(r.created_at)}</p></td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="relative inline-block">
                          <StatusDot request={r} onClick={e => { e.stopPropagation(); setStatusMenu(statusMenu === r.id ? null : r.id); }} />
                          {statusMenu === r.id && (
                            <div className="absolute right-0 top-7 z-50 bg-card border border-border-subtle rounded-xl shadow-2xl py-1 min-w-[200px]" onClick={e => e.stopPropagation()}>
                              <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted">Mark as</p>
                              {['new', 'unscheduled'].map(s => {
                                const cfg = STATUS_CONFIG[s];
                                const current = bucketFor(r) === s;
                                return (
                                  <button key={s} onClick={() => updateStatus(r.id, s)}
                                    className={`w-full px-3 py-2 text-left text-xs font-medium flex items-center gap-2 hover:bg-surface-alt cursor-pointer ${current ? cfg.text + ' font-bold' : 'text-secondary'}`}>
                                    <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />{cfg.label}
                                  </button>
                                );
                              })}
                              <div className="h-px bg-border-subtle my-1" />
                              <p className="px-3 py-2 text-[10px] text-muted leading-snug">Assessment scheduled, complete & overdue are set in the assessment editor.</p>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
