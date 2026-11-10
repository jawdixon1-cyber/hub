import { useEffect, useRef, useState } from 'react';
import { Camera, Plus, Trash2, X, PenLine } from 'lucide-react';
import LightsMarkup, { LinesOverlay } from './LightsMarkup';
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
      resolve(c.toDataURL('image/jpeg', 0.82));
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
          <button onClick={onClear} className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white cursor-pointer"><X size={12} /></button>
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

export default function LightsMeasurePhotos({ onApply, angles, setAngles, onLinesSaved, children }) {
  const [error, setError] = useState('');
  const [markIdx, setMarkIdx] = useState(-1); // side being drawn on

  const setPhoto = (i) => async (file) => {
    try {
      const data = await shrink(file);
      setAngles((a) => a.map((x, j) => (j === i ? { ...x, plain: data } : x)));
    } catch (e) {
      setError(e.message);
    }
  };
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
  const clearPhoto = (i) => () => setAngles((a) => a.map((x, j) => (j === i ? { ...x, plain: '', lines: [] } : x)));
  const saveLines = (lines, size, scale) => {
    setAngles((a) => a.map((x, j) => (j === markIdx ? { ...x, lines, w: size.w, h: size.h, scale: scale || x.scale || 0 } : x)));
    setMarkIdx(-1);
    onLinesSaved?.();
  };

  const totals = { easy: 0, medium: 0, hard: 0 };
  const drawnLines = angles.flatMap((a) => a.lines);
  drawnLines.forEach((l) => { totals[l.level] += Number(l.feet) || 0; });
  const needFeet = drawnLines.filter((l) => !(Number(l.feet) > 0)).length;

  // Feet go into the Easy / Medium / Hard boxes on their own whenever the
  // drawn lines change. (Not on first load, so hand-typed feet on a saved
  // quote are left alone until a line actually changes.)
  const key = `${totals.easy}|${totals.medium}|${totals.hard}`;
  const lastKey = useRef(key);
  useEffect(() => {
    if (key === lastKey.current) return;
    lastKey.current = key;
    if (drawnLines.length) onApply(totals);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setBoxOver(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setBoxOver(false); }}
      onDrop={dropMany}
      className={`rounded-xl border bg-card p-4 space-y-3 transition-colors ${boxOver ? 'border-border-brand ring-2 ring-ring-brand' : 'border-border-default'}`}
    >
      <div>
        <p className="text-sm font-semibold text-primary flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-brand text-on-brand text-[11px] font-bold flex items-center justify-center">1</span> Quote
        </p>
        <p className="text-[11px] text-muted mt-0.5 ml-7">Add a photo of each side, hit <b>Draw lines</b> along the roofline, and the price fills in.</p>
      </div>

      {angles.map((a, i) => (
        <div key={i} className="flex items-end gap-2">
          <span className="text-xs font-semibold text-muted w-12 pb-12">Side {i + 1}</span>
          <div className="flex-1 min-w-0 space-y-1">
            <PhotoSlot label="Photo" value={a.plain} onPick={setPhoto(i)} onClear={clearPhoto(i)} drawn={a.lines.length ? a : null} />
            {a.plain && (
              <button onClick={() => setMarkIdx(i)} className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand text-on-brand text-xs font-semibold py-1.5 hover:bg-brand-hover cursor-pointer">
                <PenLine size={13} /> {a.lines.length ? `Edit lines (${a.lines.length})` : 'Draw lines'}
              </button>
            )}
          </div>
          <div className="flex-1 min-w-0 h-28 mb-8 rounded-lg border border-border-default p-3 text-xs space-y-1 self-start mt-5">
            {a.lines.length ? (
              <>
                {['easy', 'medium', 'hard'].map((k) => {
                  const ft = a.lines.filter((l) => l.level === k).reduce((t, l) => t + (Number(l.feet) || 0), 0);
                  return ft ? <p key={k} style={{ color: LEVEL_COLOR[k] }} className="font-semibold capitalize">{k} {ft} ft</p> : null;
                })}
                {a.lines.some((l) => !(Number(l.feet) > 0)) && <p className="text-red-400">{a.lines.filter((l) => !(Number(l.feet) > 0)).length} line(s) need feet</p>}
              </>
            ) : <p className="text-muted">{a.plain ? 'No lines yet' : 'Add a photo'}</p>}
          </div>
          {(angles.length > 1 || a.plain) && (
            <button onClick={() => setAngles((x) => (x.length > 1 ? x.filter((_, j) => j !== i) : [emptyAngle()]))} className="p-2 text-muted hover:text-red-500 cursor-pointer mb-10"><Trash2 size={14} /></button>
          )}
        </div>
      ))}

      <button onClick={() => setAngles((a) => [...a, emptyAngle()])} className="inline-flex items-center gap-1 text-sm font-medium text-brand-text hover:underline cursor-pointer">
        <Plus size={14} /> Add a side
      </button>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {needFeet > 0 && <p className="text-sm text-red-400">{needFeet} line{needFeet > 1 ? 's' : ''} still need feet — hit Edit lines and tap the line.</p>}

      {markIdx >= 0 && angles[markIdx]?.plain && (
        <LightsMarkup
          photo={angles[markIdx].plain}
          initialLines={angles[markIdx].lines}
          initialScale={angles[markIdx].scale || 0}
          onSave={saveLines}
          onClose={() => setMarkIdx(-1)}
        />
      )}

      {children}
    </div>
  );
}
