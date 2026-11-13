import { useEffect, useRef, useState } from 'react';
import { Camera, Plus, Trash2, X, PenLine } from 'lucide-react';
import LightsMarkup, { PlanOverlay, OutletMarks } from './LightsMarkup';
import { LEVEL_COLOR } from '../lib/lightsLevels';


// Shrink a phone photo to ~1600px JPEG so a whole house fits in one request.
function shrink(file, max = 1600) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.7)); // ~half the size, looks the same on screen
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not open that photo')); };
    img.src = url;
  });
}

const firstImage = (e) => [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith('image/'));

function PhotoSlot({ label, value, onPick, onClear, drawn }) {
  const [over, setOver] = useState(false);
  const dropProps = {
    onDragOver: (e) => { e.preventDefault(); e.stopPropagation(); setOver(true); },
    onDragLeave: () => setOver(false),
    onDrop: (e) => {
      e.preventDefault(); e.stopPropagation(); setOver(false);
      const f = firstImage(e);
      if (f) onPick(f);
    },
  };
  return (
    <div className="flex-1 min-w-0">
      <p className="text-[11px] font-medium text-secondary mb-1">{label}</p>
      {value ? (
        <div className={`relative rounded-lg ${over ? 'ring-2 ring-ring-brand' : ''}`} {...dropProps}>
          <img src={value} alt={label} className={`w-full h-28 rounded-lg border border-border-default ${drawn ? 'object-contain bg-black' : 'object-cover'}`} />
          {drawn && (
            <svg viewBox={`0 0 ${drawn.w} ${drawn.h}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 w-full h-full pointer-events-none">
              <LinesOverlay lines={drawn.lines} w={drawn.w} h={drawn.h} />
            </svg>
          )}
          {onClear && <button onClick={onClear} className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white cursor-pointer"><X size={12} /></button>}
        </div>
      ) : (
        <label {...dropProps} className={`h-28 rounded-lg border border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer ${over ? 'border-border-brand bg-brand-light text-brand-text' : 'border-border-strong text-muted hover:text-primary hover:border-border-brand'}`}>
          <Camera size={18} />
          <span className="text-[11px]">{over ? 'Drop it' : 'Drag here or click'}</span>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])} />
        </label>
      )}
    </div>
  );
}

const emptyAngle = () => ({ plain: '', marked: '', lines: [], w: 0, h: 0 });

// mode 'photos' = step 2 (just upload a photo of every section); mode 'lines' = step 3 (draw + measure).
// mode 'photos' = upload; 'lines' = Mark up (plan); 'measure' = feet per line; 'rate' = Easy / Medium / Hard.
export default function LightsMeasurePhotos({ onApply, angles, setAngles, onLinesSaved, children, mode = 'lines', onMove = null }) {
  // Reorder photos (lines go with their photo). onMove also renumbers anything tied to a photo (Extras).
  const move = onMove || ((from, to) => setAngles((as) => { const a = [...as]; const [x] = a.splice(from, 1); a.splice(to, 0, x); return a; }));
  const [dragFrom, setDragFrom] = useState(-1);
  const measure = mode === 'measure' || mode === 'rate'; // after the plan: same photos, feet tags shown
  const rate = mode === 'rate';
  const [error, setError] = useState('');
  const [markIdx, setMarkIdx] = useState(-1); // side being drawn on

  // Drop several photos on the box: each one becomes a side.
  const [boxOver, setBoxOver] = useState(false);
  const dropMany = async (e) => {
    e.preventDefault();
    setBoxOver(false);
    const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    try {
      const shots = await Promise.all(files.map((f) => shrink(f)));
      setAngles((prev) => [...prev.filter((a) => a.plain), ...shots.map((plain) => ({ ...emptyAngle(), plain }))]);
    } catch (err) {
      setError(err.message);
    }
  };
  const addMany = async (fileList) => {
    const files = [...(fileList || [])].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    try {
      const shots = await Promise.all(files.map((f) => shrink(f)));
      setAngles((prev) => [...prev.filter((a) => a.plain), ...shots.map((plain) => ({ ...emptyAngle(), plain }))]);
    } catch (err) { setError(err.message); }
  };
  const storeAt = (idx, lines, size, scale, peaks, outlets, jumps, inlines) => {
    setAngles((a) => a.map((x, j) => (j === idx ? { ...x, lines, ...(size ? { w: size.w, h: size.h } : {}), scale: scale || x.scale || 0, ...(peaks ? { peaks } : {}), ...(outlets ? { outlets } : {}), ...(jumps ? { jumps } : {}), ...(inlines ? { inlines } : {}) } : x)));
  };
  const saveLines = (...data) => {
    storeAt(markIdx, ...data);
    setMarkIdx(-1);
    onLinesSaved?.();
  };
  // ‹ › in the editor: save this section, open the next / previous one (Photos order).
  const withPhotos = angles.map((a, i) => (a.plain ? i : -1)).filter((i) => i >= 0);
  const goSection = (dir, data) => {
    const at = withPhotos.indexOf(markIdx);
    const next = withPhotos[at + dir];
    if (next === undefined) return;
    if (data) storeAt(markIdx, ...data);
    setMarkIdx(next);
  };

  const totals = { easy: 0, medium: 0, hard: 0 };
  const drawnLines = angles.flatMap((a) => a.lines);
  drawnLines.forEach((l) => { if (l.level in totals) totals[l.level] += Number(l.feet) || 0; });
  const needFeet = drawnLines.filter((l) => !(Number(l.feet) > 0)).length;

  // Feet go into the Easy / Medium / Hard boxes on their own whenever the
  // drawn lines change. (Not on first load, so hand-typed feet on a saved
  // quote are left alone until a line actually changes.)
  const key = `${totals.easy}|${totals.medium}|${totals.hard}`;
  const lastKey = useRef(key);
  useEffect(() => {
    if (!measure || key === lastKey.current) return;
    lastKey.current = key;
    if (drawnLines.length) onApply(totals);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (mode === 'photos') {
    const have = angles.filter((a) => a.plain);
    return (
      <div
        onDragOver={(e) => { e.preventDefault(); setBoxOver(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setBoxOver(false); }}
        onDrop={dropMany}
        className={`rounded-xl border bg-card p-4 space-y-3 transition-colors ${boxOver ? 'border-border-brand ring-2 ring-ring-brand' : 'border-border-default'}`}
      >
        <div>
          <p className="text-lg font-bold text-primary">Upload photos</p>
          <p className="text-xs text-muted mt-0.5">Upload a photo of every section the lights are going on. Drag photos (or tap ↑ ↓) to put them in order.</p>
        </div>
        {/* Phone: one big button — opens the camera or your photo library */}
        <label className="sm:hidden flex items-center justify-center gap-2 rounded-xl bg-brand text-on-brand text-lg font-bold py-4 cursor-pointer active:brightness-95">
          <Camera size={22} /> Take or add photos
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addMany(e.target.files); e.target.value = ''; }} />
        </label>
        {/* One photo per row, top to bottom — drag or ↑ ↓ to reorder */}
        <div className="space-y-2">
          {angles.map((a, i) => (a.plain ? (
            <div key={i} draggable
              onDragStart={(e) => { setDragFrom(i); e.dataTransfer.setData('text/x-hub-photo', String(i)); e.dataTransfer.effectAllowed = 'move'; }}
              onDragEnd={() => setDragFrom(-1)}
              onDragOver={(e) => { if (dragFrom >= 0) { e.preventDefault(); e.stopPropagation(); } }}
              onDrop={(e) => { if (dragFrom < 0) return; e.preventDefault(); e.stopPropagation(); if (dragFrom !== i) move(dragFrom, i); setDragFrom(-1); setBoxOver(false); }}
              className={`flex items-center gap-3 rounded-xl border border-border-default bg-surface-alt/30 p-2 cursor-grab ${dragFrom === i ? 'opacity-40' : ''}`}>
              <span className="text-muted text-lg select-none px-1" title="Drag to reorder">⠿</span>
              <img src={a.plain} alt={`Section ${i + 1}`} draggable={false} className="w-32 sm:w-40 aspect-[4/3] object-cover rounded-lg border border-border-default" />
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-primary">Section {i + 1}</p>
                {a.lines.length > 0 && <p className="text-xs text-muted">{a.lines.length} line{a.lines.length === 1 ? '' : 's'}</p>}
              </div>
              <div className="flex flex-col gap-1">
                <button onClick={() => move(i, i - 1)} disabled={i === 0} title="Move up" className="w-9 h-8 rounded-md border border-border-strong text-primary font-bold disabled:opacity-25 hover:bg-surface-alt cursor-pointer">↑</button>
                <button onClick={() => move(i, i + 1)} disabled={i >= angles.filter((x) => x.plain).length - 1} title="Move down" className="w-9 h-8 rounded-md border border-border-strong text-primary font-bold disabled:opacity-25 hover:bg-surface-alt cursor-pointer">↓</button>
              </div>
              <div className="flex flex-col gap-1">
                <button onClick={() => setAngles((x) => [...x.slice(0, i + 1), { ...emptyAngle(), plain: a.plain, w: a.w, h: a.h, scale: a.scale || 0 }, ...x.slice(i + 1)])} title="Copy this photo as a new section with no lines" className="px-2.5 h-8 rounded-md border border-border-strong text-xs font-semibold text-secondary hover:text-primary cursor-pointer">Duplicate</button>
                <button onClick={() => setAngles((x) => (x.length > 1 ? x.filter((_, j) => j !== i) : [emptyAngle()]))} title="Remove photo" className="px-2.5 h-8 rounded-md border border-border-strong text-xs font-semibold text-secondary hover:text-red-500 cursor-pointer">Remove</button>
              </div>
            </div>
          ) : null))}
          <label className={`flex items-center justify-center gap-2 rounded-xl border-2 border-dashed py-5 cursor-pointer ${boxOver ? 'border-border-brand bg-brand-light text-brand-text' : 'border-border-strong text-muted hover:text-primary hover:border-border-brand'}`}>
            <Camera size={20} />
            <span className="text-sm font-semibold">{have.length ? 'Add more' : 'Add photos'}</span>
            <span className="text-xs">· drag here or click</span>
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addMany(e.target.files); e.target.value = ''; }} />
          </label>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setBoxOver(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setBoxOver(false); }}
      onDrop={dropMany}
      className={`rounded-xl border bg-card p-4 space-y-3 transition-colors ${boxOver ? 'border-border-brand ring-2 ring-ring-brand' : 'border-border-default'}`}
    >
      <div>
        <p className="text-lg font-bold text-primary">{rate ? 'Difficulty' : measure ? 'Measure' : 'Plan'}</p>
        <p className="text-xs text-muted mt-0.5">{rate ? 'Tap each line and rate it Easy / Medium / Hard.' : measure ? 'Measure each line and log its feet.' : 'Draw where the lights go and tap 🔌 Power to mark the outlet.'}</p>
      </div>

      {!angles.some((a) => a.plain) && <p className="text-sm text-muted">Add photos in step 2 first.</p>}
      {!measure && angles.some((a) => a.plain) && !angles.some((a) => (a.outlets || []).length) && (
        <div className="rounded-lg border border-yellow-400/50 bg-yellow-400/10 px-3 py-2.5 text-sm font-semibold text-yellow-300">
          🔌 Mark where the power is — open the photo with the outlet and tap <b>🔌 Power</b>, then tap the spot.
        </div>
      )}
      <div className="grid gap-4">{/* top to bottom, same order as step 2 Photos */}
      {angles.map((a, i) => (!a.plain ? null : (
        <div key={i}
          draggable={!measure}
          onDragStart={(e) => { if (measure) return; setDragFrom(i); e.dataTransfer.setData('text/x-hub-photo', String(i)); e.dataTransfer.effectAllowed = 'move'; }}
          onDragEnd={() => setDragFrom(-1)}
          onDragOver={(e) => { if (dragFrom >= 0) { e.preventDefault(); e.stopPropagation(); } }}
          onDrop={(e) => { if (dragFrom < 0) return; e.preventDefault(); e.stopPropagation(); if (dragFrom !== i) move(dragFrom, i); setDragFrom(-1); setBoxOver(false); }}
          className={`rounded-xl border bg-surface-alt/30 overflow-hidden ${dragFrom === i ? 'opacity-40' : ''} ${dragFrom >= 0 && dragFrom !== i ? 'border-border-brand' : 'border-border-default'}`}>
          {/* Big photo with the lines on it — click to draw; drag the card (desktop) or ↑ ↓ to reorder */}
          <button onClick={() => setMarkIdx(i)} className="relative block w-full bg-black cursor-pointer group" title="Plan">
            <img src={a.plain} alt={`Section ${i + 1}`} draggable={false} className="block w-full" />
            {(a.lines.length > 0 || (a.outlets || []).length > 0 || (a.inlines || []).length > 0 || (a.jumps || []).length > 0) && a.w > 0 && (
              <svg viewBox={`0 0 ${a.w} ${a.h}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
                <PlanOverlay lines={a.lines} jumps={rate ? [] : a.jumps || []} w={a.w} h={a.h} tags={measure && !rate} plan={!rate} />
                {!rate && <OutletMarks outlets={a.outlets} w={a.w} h={a.h} />}
                {!rate && <OutletMarks inline outlets={a.inlines || []} w={a.w} h={a.h} />}
              </svg>
            )}
            <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/65 text-xs font-semibold text-white">{!measure && <span className="hidden sm:inline cursor-grab mr-1" title="Drag to reorder">⠿</span>}Section {i + 1}</span>
            <span className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
          </button>
          <div className="p-3 space-y-3">
            <div className="flex items-center gap-2 flex-wrap min-h-[28px]">
              {!measure ? <span className="text-sm text-muted">{a.lines.length ? `${a.lines.length} line${a.lines.length === 1 ? '' : 's'}` : 'No lines yet'}</span> : !rate ? <span className="px-2.5 py-1 rounded-lg bg-card border border-border-default text-sm font-bold text-primary">{a.lines.reduce((t, l) => t + (Number(l.feet) || 0), 0)} ft{(a.jumps || []).length ? ` · zip ${(a.jumps || []).reduce((t, l) => t + (Number(l.feet) || 0), 0)} ft` : ''}</span> : a.lines.length ? ['easy', 'medium', 'hard'].map((k) => {
                const cnt = a.lines.filter((l) => l.level === k).length;
                return cnt ? <span key={k} className="px-2.5 py-1 rounded-lg bg-card border border-border-default text-sm font-bold capitalize" style={{ color: LEVEL_COLOR[k] }}>{cnt} {k}</span> : null;
              }) : <span className="text-sm text-muted">No lines yet</span>}
              {!measure && (a.peaks || []).length > 0 && <span className="px-2.5 py-1 rounded-lg bg-card border border-border-default text-sm font-bold text-[#E8C36A]">▲ {a.peaks.length} peak{a.peaks.length === 1 ? '' : 's'}</span>}
              {rate && a.lines.some((l) => !LEVEL_COLOR[l.level]) && <span className="text-sm font-semibold text-white/80">{a.lines.filter((l) => !LEVEL_COLOR[l.level]).length} not rated</span>}
              {measure && !rate && a.lines.some((l) => !(Number(l.feet) > 0)) && <span className="text-sm font-semibold text-red-400">{a.lines.filter((l) => !(Number(l.feet) > 0)).length} line(s) need feet</span>}
            </div>
            <div className="flex gap-2">
            <button onClick={() => setMarkIdx(i)} className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-brand text-on-brand text-sm font-bold py-2.5 hover:bg-brand-hover cursor-pointer">
              <PenLine size={16} /> {measure ? (a.lines.length ? `${rate ? 'Rate' : 'Measure'} ${a.lines.length} line${a.lines.length === 1 ? '' : 's'}` : 'Plan first') : a.lines.length ? `Edit plan (${a.lines.length} lines)` : 'Plan'}
            </button>
            {!measure && <button onClick={() => setAngles((x) => [...x.slice(0, i + 1), { ...emptyAngle(), plain: a.plain, w: a.w, h: a.h, scale: a.scale || 0 }, ...x.slice(i + 1)])}
              title="Copy this photo as a new section with no lines" className="px-3 rounded-lg border border-border-strong text-sm font-semibold text-secondary hover:text-primary cursor-pointer">Duplicate</button>}
            {!measure && <button onClick={() => move(i, i - 1)} disabled={i === 0} title="Move up" className="w-10 rounded-lg border border-border-strong text-primary font-bold disabled:opacity-25 hover:bg-surface-alt cursor-pointer">↑</button>}
            {!measure && <button onClick={() => move(i, i + 1)} disabled={i >= angles.filter((x) => x.plain).length - 1} title="Move down" className="w-10 rounded-lg border border-border-strong text-primary font-bold disabled:opacity-25 hover:bg-surface-alt cursor-pointer">↓</button>}
            </div>
          </div>
        </div>
      )))}
      {!measure && (
        <label className={`min-h-[200px] rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer ${boxOver ? 'border-border-brand bg-brand-light text-brand-text' : 'border-border-strong text-muted hover:text-primary hover:border-border-brand'}`}>
          <Camera size={22} />
          <span className="text-sm font-semibold">Add a section</span>
          <span className="text-xs">drag a photo here or click</span>
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addMany(e.target.files); e.target.value = ''; }} />
        </label>
      )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {measure && needFeet > 0 && <p className="text-sm text-red-400">{needFeet} line{needFeet > 1 ? 's' : ''} still need feet — hit Edit lines and tap the line.</p>}

      {markIdx >= 0 && angles[markIdx]?.plain && (
        <LightsMarkup
          key={markIdx}
          draftId={markIdx}
          nav={{ at: withPhotos.indexOf(markIdx), total: withPhotos.length, go: goSection }}
          mode={rate ? 'rate' : measure ? 'measure' : 'draw'}
          photo={angles[markIdx].plain}
          initialLines={angles[markIdx].lines}
          initialScale={angles[markIdx].scale || 0}
          initialPeaks={angles[markIdx].peaks || []}
          initialOutlets={angles[markIdx].outlets || []}
          initialInlines={angles[markIdx].inlines || []}
          initialJumps={angles[markIdx].jumps || []}
          onSave={saveLines}
          onClose={() => setMarkIdx(-1)}
        />
      )}

      {children}
    </div>
  );
}
