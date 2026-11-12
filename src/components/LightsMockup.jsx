import { useEffect, useState } from 'react';
import { Download, Sparkles, Maximize2, X, Copy, Check, Upload, FolderDown, Trash2, ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { buildShowPrompt, buildNightPrompt } from '../lib/lightsPrompt';
import { getPrepFolder, setPrepFolder } from '../lib/lightsStore';
import { DESIGNS } from '../lib/lightsDesigns';
import { extrasPromptLines } from '../lib/lightsExtras';

// One-line heads-up while the folder picker is open (window.alert would block the picker flow less than a toast).
const alertOnce = (msg) => { try { window.alert(msg); } catch { console.warn(msg); } };

// Two things for the client:
//  - Lines: every side's photo with Jude's lines in one bright color — "here's
//    where the lights go". Exact, drawn by Hub.
//  - Show photos: the sides Jude picks get turned into night mockups in his own
//    ChatGPT (his original prompt + the color he picks). Just for the wow — they
//    don't have to match the lines exactly.


const LINE_COLOR = '#FFD23F'; // client-facing line color

const ptsOf = (l) => l.pts || [{ x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 }];
const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Shrink an image to a JPEG so saved quotes stay small.
async function toJpeg(src, max = 1600) {
  const img = await loadImage(src);
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const cv = canvasOf(Math.round(img.width * k), Math.round(img.height * k));
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/jpeg', 0.72);
}

// Photo + Jude's lines in one bright color, no labels.
// Run colors for the ChatGPT bulb map — each run its own color so it knows where one ends and the next starts.
const RUN_COLORS = ['#FF2D55', '#00C2FF', '#FFD60A', '#34C759', '#FF9500', '#BF5AF2', '#FF6BD5', '#64D2FF', '#FFFFFF', '#A2845E'];

// n bulb spots along a run: one on every corner/peak (each bend you drew) and on both ends,
// the rest spread evenly along each side, split by length. Same total as your measured feet.
function pointsAlong(pts, n) {
  const segs = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) { const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); segs.push(len); total += len; }
  if (!segs.length || !total) return [];
  // Too few bulbs to cover every corner: just space them evenly.
  if (n < pts.length) {
    const out = [];
    for (let k = 0; k < n; k++) {
      let d = n === 1 ? total / 2 : (k / (n - 1)) * total;
      let i = 0;
      while (i < segs.length - 1 && d > segs[i]) { d -= segs[i]; i += 1; }
      const t = segs[i] ? Math.min(1, d / segs[i]) : 0;
      out.push({ x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t });
    }
    return out;
  }
  // Split the rest across the sides by length (largest remainder so it adds up exactly).
  const rest = n - pts.length;
  const ideal = segs.map((l) => (rest * l) / total);
  const counts = ideal.map(Math.floor);
  let left = rest - counts.reduce((a, b) => a + b, 0);
  ideal.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { counts[i] += 1; left -= 1; } });
  const out = [{ ...pts[0] }];
  segs.forEach((_, i) => {
    const a = pts[i];
    const b = pts[i + 1];
    for (let j = 1; j <= counts[i]; j++) { const t = j / (counts[i] + 1); out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); }
    out.push({ ...b });
  });
  return out;
}

// Lines photo. With bulbMap: each run in its own color, one dot per bulb (12" spacing = 1 per measured foot),
// a bar at each end, and "N bulbs" on it — the exact bulb count + placement for ChatGPT.
// extrasHere: [{ n, x, y, label }] — numbered circles for the extras on this photo (x/y = 0–1).
async function linesPhoto(side, bulbMap = false, extrasHere = []) {
  const img = await loadImage(side.plain);
  const cv = canvasOf(img.width, img.height);
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const kx = img.width / (side.w || img.width);
  const ky = img.height / (side.h || img.height);
  const sw = Math.max(3, Math.round(img.width / 260));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (!bulbMap) {
    side.lines.forEach((l) => {
      const pts = ptsOf(l).map((p) => ({ x: p.x * kx, y: p.y * ky }));
      const trace = () => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); };
      trace(); ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = sw * 2.2; ctx.stroke();
      trace(); ctx.strokeStyle = LINE_COLOR; ctx.lineWidth = sw; ctx.stroke();
    });
    return cv.toDataURL('image/jpeg', 0.9);
  }
  const fs = Math.max(16, Math.round(img.width / 55));
  const runs = side.lines.map((l, li) => ({
    color: RUN_COLORS[li % RUN_COLORS.length],
    pts: ptsOf(l).map((p) => ({ x: p.x * kx, y: p.y * ky })),
    n: Math.round(Number(l.feet) || 0),
  }));
  // Pass 1: every run — line, end bars, one dot per bulb.
  runs.forEach(({ color, pts, n }) => {
    const trace = () => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); };
    trace(); ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = sw * 1.6; ctx.stroke();
    trace(); ctx.strokeStyle = color; ctx.lineWidth = sw * 0.7; ctx.stroke();
    [[pts[0], pts[1]], [pts[pts.length - 1], pts[pts.length - 2]]].forEach(([p, q]) => {
      if (!q) return;
      const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      const nx = -(q.y - p.y) / len;
      const ny = (q.x - p.x) / len;
      const r = sw * 3;
      ctx.beginPath(); ctx.moveTo(p.x - nx * r, p.y - ny * r); ctx.lineTo(p.x + nx * r, p.y + ny * r);
      ctx.strokeStyle = '#000'; ctx.lineWidth = sw * 1.8; ctx.stroke();
      ctx.strokeStyle = color; ctx.lineWidth = sw * 0.9; ctx.stroke();
    });
    if (!n) return;
    const dr = Math.max(3, sw * 0.95);
    pointsAlong(pts, n).forEach((p) => {
      ctx.beginPath(); ctx.arc(p.x, p.y, dr, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(1.5, dr * 0.4); ctx.stroke();
    });
  });
  // Pass 2: labels — never on top of a run, a dot, or another label.
  const samples = [];
  runs.forEach(({ pts }) => {
    for (let i = 1; i < pts.length; i++) {
      const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      const k = Math.max(1, Math.ceil(len / (fs * 0.35)));
      for (let t = 0; t <= k; t++) samples.push({ x: pts[i - 1].x + ((pts[i].x - pts[i - 1].x) * t) / k, y: pts[i - 1].y + ((pts[i].y - pts[i - 1].y) * t) / k });
    }
  });
  const pad = Math.max(sw * 3, fs * 0.35);
  const placed = [];
  const onLabel = (x, y, w, h) => placed.some((r) => Math.abs(r.x - x) < (r.w + w) / 2 + fs * 0.3 && Math.abs(r.y - y) < (r.h + h) / 2 + fs * 0.3);
  const onRun = (x, y, w, h) => samples.some((p) => Math.abs(p.x - x) < w / 2 + pad && Math.abs(p.y - y) < h / 2 + pad);
  ctx.font = `bold ${fs}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  runs.forEach(({ color, pts, n }) => {
    if (!n) return;
    let m = { len: -1, x: pts[0].x, y: pts[0].y };
    for (let i = 1; i < pts.length; i++) {
      const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (len > m.len) m = { len, x: (pts[i].x + pts[i - 1].x) / 2, y: (pts[i].y + pts[i - 1].y) / 2 };
    }
    const text = `${n} bulbs`;
    const w = ctx.measureText(text).width + fs;
    const h = fs * 1.5;
    const clamp = ([x, y]) => [Math.min(img.width - w / 2, Math.max(w / 2, x)), Math.min(img.height - h / 2, Math.max(h / 2, y))];
    const spots = [];
    for (const k of [1.8, 2.8, 3.8, 5, 6.5, 8, 10]) for (const dx of [0, -0.5, 0.5, -1, 1, -1.6, 1.6]) for (const dir of [-1, 1]) spots.push(clamp([m.x + dx * w, m.y + dir * k * fs]));
    const [x, y] = spots.find(([sx, sy]) => !onLabel(sx, sy, w, h) && !onRun(sx, sy, w, h))
      || spots.find(([sx, sy]) => !onLabel(sx, sy, w, h)) || spots[0];
    placed.push({ x, y, w, h });
    // leader from the label's nearest edge to its run
    const ex = Math.min(x + w / 2, Math.max(x - w / 2, m.x));
    const ey = Math.abs(m.y - y) > h / 2 ? (m.y > y ? y + h / 2 : y - h / 2) : m.y;
    ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(3, sw * 0.9); ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(m.x, m.y); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, sw / 2); ctx.stroke();
    ctx.fillStyle = '#000'; ctx.strokeStyle = color; ctx.lineWidth = Math.max(3, sw * 0.8);
    ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, fs * 0.35); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillText(text, x, y + fs * 0.05);
  });
  // Extras: numbered green circles ("light this too") — the prompt lists what each number is.
  extrasHere.forEach(({ n, x, y }) => {
    const cx = x * img.width;
    const cy = y * img.height;
    const r = Math.max(14, fs * 0.9);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#00DF00'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(3, sw * 0.8); ctx.stroke();
    ctx.fillStyle = '#000'; ctx.font = `bold ${Math.round(r * 1.1)}px Arial, sans-serif`; ctx.fillText(String(n), cx, cy + r * 0.05);
  });
  return cv.toDataURL('image/jpeg', 0.92);
}

function downloadUrl(url, name) {
  const a = document.createElement('a');
  a.download = name;
  a.href = url;
  a.click();
}

const slug = (client) => (client || 'lights').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'lights';


function FullScreen({ src, onClose, onDownload }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[300] bg-black/95 flex flex-col">
      <div className="flex items-center justify-end gap-2 p-3">
        {onDownload && <button onClick={onDownload} className="inline-flex items-center gap-1.5 rounded-lg bg-brand text-on-brand text-sm font-semibold px-4 py-2 cursor-pointer"><Download size={15} /> Download</button>}
        <button onClick={onClose} className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 cursor-pointer" title="Close (Esc)"><X size={20} /></button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto flex items-start justify-center p-4 pt-0 cursor-zoom-out" onClick={onClose}>
        <img src={src} alt="Full screen" className="max-w-full max-h-full object-contain" />
      </div>
    </div>
  );
}

const iconBtn = 'p-1 text-muted hover:text-primary cursor-pointer';

// Full-screen slideshow: ← → keys or the on-screen arrows, Esc to close.
function Gallery({ items, start, onClose }) {
  const [i, setI] = useState(start);
  const n = items.length;
  const go = (d) => setI((x) => (x + d + n) % n);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((x) => (x + 1) % n);
      if (e.key === 'ArrowLeft') setI((x) => (x - 1 + n) % n);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [n, onClose]);
  const cur = items[i];
  const arrow = 'absolute top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 text-white hover:bg-white/25 cursor-pointer';
  return (
    <div className="fixed inset-0 z-[300] bg-black/95 flex flex-col">
      <div className="flex items-center justify-between gap-2 p-3">
        <span className="text-sm text-white/80 pl-2">{cur.label} · {i + 1} of {n}</span>
        <div className="flex items-center gap-2">
          <button onClick={() => downloadUrl(cur.url, cur.name)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand text-on-brand text-sm font-semibold px-4 py-2 cursor-pointer"><Download size={15} /> Download</button>
          <button onClick={onClose} className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 cursor-pointer" title="Close (Esc)"><X size={20} /></button>
        </div>
      </div>
      <div className="relative flex-1 min-h-0 flex items-center justify-center p-4 pt-0">
        <img src={cur.url} alt={cur.label} className="max-w-full max-h-full object-contain" />
        {n > 1 && (
          <>
            <button onClick={() => go(-1)} className={`${arrow} left-4`} title="Previous (←)"><ChevronLeft size={28} /></button>
            <button onClick={() => go(1)} className={`${arrow} right-4`} title="Next (→)"><ChevronRight size={28} /></button>
          </>
        )}
      </div>
    </div>
  );
}

function LinesCard({ url, index, onOpen, name }) {
  return (
    <div className="space-y-1.5">
      {url ? <img src={url} alt={`Side ${index + 1} lines`} onClick={onOpen} className="w-full rounded-lg border border-border-default cursor-zoom-in" /> : <div className="aspect-[4/3] rounded-lg bg-surface-alt" />}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">Side {index + 1}</span>
        <div className="flex items-center gap-1">
          <button onClick={onOpen} className={iconBtn} title="Full screen"><Maximize2 size={15} /></button>
          <button onClick={() => downloadUrl(url, name)} className={iconBtn} title="Download"><Download size={15} /></button>
        </div>
      </div>
    </div>
  );
}

function ShowCard({ side, index, onPatch }) {
  const picked = !!side.show;
  return (
    <button
      onClick={() => onPatch({ show: !picked })}
      title={`Side ${index + 1}`}
      className={`relative w-28 shrink-0 rounded-lg overflow-hidden border-2 cursor-pointer transition ${picked ? 'border-border-brand' : 'border-transparent opacity-50 hover:opacity-80'}`}
    >
      <img src={side.plain} alt={`Side ${index + 1}`} className="w-full h-20 object-cover" />
      <span className="absolute bottom-1 left-1 text-[10px] font-semibold text-white bg-black/60 rounded px-1">Side {index + 1}</span>
      {picked && <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-brand text-on-brand flex items-center justify-center"><Check size={12} strokeWidth={3} /></span>}
    </button>
  );
}

// part 'lines' = Where the lights go (confirm the plan photos) · part 'mockup' = make the ChatGPT mockup, step by step.
export default function LightsMockup({ angles, setAngles, client, previews = [], setPreviews, designId: designProp, part = 'mockup', nightPhoto = '', setNightPhoto, extras = [], customColor = null }) {
  // Extras on each photo, numbered the same as the Extras step.
  const extrasOn = (i) => extras.map((e, k) => ({ ...e, n: k + 1 })).filter((e) => e.side === i);
  const [designLocal] = useState(() => localStorage.getItem('lights-mockup-design') || 'warm');
  // The quote owns its color when the page passes it in.
  const designId = designProp || designLocal;
  const [customLocal, setCustom] = useState(() => localStorage.getItem('lights-mockup-custom') || '');
  const custom = customColor ?? customLocal; // the quote's custom colors (typed in Discovery)
  const [status, setStatus] = useState('');
  const [copied, setCopied] = useState(false);
  const design = DESIGNS.find((d) => d.id === designId) || DESIGNS[0];
  const [lineUrls, setLineUrls] = useState({}); // side index -> lines photo
  const [galleryAt, setGalleryAt] = useState(-1);
  const [guideUrls, setGuideUrls] = useState({}); // side index -> lines photo with "ft · bulbs" labels (what ChatGPT gets)
  useEffect(() => {
    if (part !== 'mockup') return undefined;
    let alive = true;
    Promise.all(angles.map((a, i) => (a.plain && (a.lines.length || extrasOn(i).length) ? linesPhoto(a, true, extrasOn(i)) : null)))
      .then((urls) => { if (alive) setGuideUrls(Object.fromEntries(urls.map((u, i) => [i, u]).filter(([, u]) => u))); });
    return () => { alive = false; };
  }, [angles, part, extras]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { localStorage.setItem('lights-mockup-design', designId); }, [designId]);
  useEffect(() => { localStorage.setItem('lights-mockup-custom', custom); }, [custom]);

  const withLines = angles.map((a, i) => ({ a, i })).filter(({ a }) => a.plain && a.lines.length);
  useEffect(() => {
    let alive = true;
    Promise.all(angles.map((a) => (a.plain && a.lines.length ? linesPhoto(a) : null)))
      .then((urls) => { if (alive) setLineUrls(Object.fromEntries(urls.map((u, i) => [i, u]).filter(([, u]) => u))); });
    return () => { alive = false; };
  }, [angles]);
  const lineName = (i) => `${slug(client)}-side${i + 1}-lines.jpg`;
  const galleryItems = withLines.filter(({ i }) => lineUrls[i]).map(({ i }) => ({ url: lineUrls[i], label: `Side ${i + 1}`, name: lineName(i) }));
  const withPhoto = angles.map((a, i) => ({ a, i })).filter(({ a }) => a.plain);
  // Ticked show photos — or every photo if none are ticked, so Prep always does something.
  const ticked = withPhoto.filter(({ a }) => a.show);
  const picked = ticked.length ? ticked : withPhoto;
  const patch = (i) => (p) => setAngles((as) => as.map((a, j) => (j === i ? { ...a, ...p } : a)));
  const guides = picked.some(({ a, i }) => a.lines.length || extrasOn(i).length);
  // Bulb counts from your measured feet (12" spacing = 1 per foot) so ChatGPT doesn't add extras.
  const bulbs = picked.reduce((t, { a }) => t + a.lines.reduce((u, l) => u + Math.round(Number(l.feet) || 0), 0), 0);
  const prompt = () => buildShowPrompt(design.id, designId === 'custom' ? custom : '', picked.length, guides, bulbs, extrasPromptLines(extras));

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(prompt());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Saves the picked show photos (clean, no lines) + prompt.txt into
  // <chosen folder>/<client>-lights/, and copies the prompt.
  // Saves the picked show photos (clean + lines) and prompt.txt into
  // <chosen folder>/<client>-lights/ and copies the prompt. If the folder can't
  // be used for any reason, falls back to plain downloads so it never does nothing.
  const prep = async (forceNew = false) => {
    if (!picked.length) { setStatus('error:add a house photo in section 1 first'); return; }
    setStatus('Saving…');
    const sub = `${slug(client)}-lights`;
    let folder = null;
    let where = 'Downloads';
    if (window.showDirectoryPicker) {
      try {
        let root = forceNew ? null : await getPrepFolder().catch(() => null);
        if (root && (await root.queryPermission({ mode: 'readwrite' })) !== 'granted') {
          if ((await root.requestPermission({ mode: 'readwrite' })) !== 'granted') root = null;
        }
        // A remembered folder that was moved/deleted: forget it and ask again.
        if (root) { try { for await (const k of root.keys()) { void k; break; } } catch { root = null; } }
        if (!root) {
          root = await window.showDirectoryPicker({ id: 'lights-prep', mode: 'readwrite', startIn: 'downloads' });
          // Picked a client's folder (e.g. "Pam-lights") by mistake — that nests everything inside it.
          if (/-lights$/i.test(root.name)) {
            alertOnce(`That's ${root.name.replace(/-lights$/i, '')}'s folder — pick the "Lights Mockups" folder (or Downloads) instead.`);
            root = await window.showDirectoryPicker({ id: 'lights-prep', mode: 'readwrite', startIn: 'downloads' });
            if (/-lights$/i.test(root.name)) throw new Error('picked a client folder');
          }
          // Always keep client folders inside "Lights Mockups" (made if you picked Downloads, etc.)
          if (root.name !== 'Lights Mockups') root = await root.getDirectoryHandle('Lights Mockups', { create: true });
          await setPrepFolder(root).catch(() => {});
        } else if (root.name !== 'Lights Mockups') {
          root = await root.getDirectoryHandle('Lights Mockups', { create: true });
          await setPrepFolder(root).catch(() => {});
        }
        folder = await root.getDirectoryHandle(sub, { create: true });
        const old = [];
        for await (const name of folder.keys()) old.push(name);
        for (const name of old) await folder.removeEntry(name).catch(() => {});
        where = `${root.name}/${sub}`;
      } catch (e) {
        if (e.name === 'AbortError') { setStatus(''); return; } // closed the picker
        console.warn('[prep] folder failed', e);
        folder = null; // fall back to plain downloads
        where = `Downloads (folder didn't work: ${e.message})`;
      }
    }
    try {
      const save = async (url, name) => {
        if (!folder) { downloadUrl(url, `${sub}-${name}`); await wait(300); return; }
        const w = await (await folder.getFileHandle(name, { create: true })).createWritable();
        await w.write(await (await fetch(url)).blob());
        await w.close();
      };
      for (const { a, i } of picked) {
        await save(a.plain, `photo-side${i + 1}.jpg`);
        if (a.lines.length || extrasOn(i).length) await save(await linesPhoto(a, true, extrasOn(i)), `lines-side${i + 1}.jpg`);
      }
      await save(URL.createObjectURL(new Blob([prompt()], { type: 'text/plain' })), 'prompt.txt');
      try { window.focus(); await navigator.clipboard.writeText(prompt()); } catch { /* Copy prompt button covers it */ }
      setStatus(`done:${where}`);
      setTimeout(() => setStatus((st) => (st.startsWith('done:') ? '' : st)), 8000);
    } catch (e) {
      setStatus(`error:${e.message}`);
    }
  };

  const card = 'rounded-xl border border-border-default bg-card p-4 space-y-3';
  const [over, setOver] = useState(false);
  const [previewAt, setPreviewAt] = useState(-1);
  const addPreviews = async (files) => {
    const imgs = [...(files || [])].filter((f) => f.type.startsWith('image/'));
    const added = [];
    for (const f of imgs) {
      const u = URL.createObjectURL(f);
      try { added.push({ id: `${Date.now()}-${added.length}`, image: await toJpeg(u) }); } finally { URL.revokeObjectURL(u); }
    }
    if (added.length) setPreviews((p) => [...p, ...added]);
  };
  const previewItems = previews.map((p, k) => ({ url: p.image, label: `Photo ${k + 1}`, name: `${slug(client)}-lights-${k + 1}.jpg` }));
  const heading = (n, text, sub) => (
    <div>
      <p className="text-sm font-semibold text-primary flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-brand text-on-brand text-[11px] font-bold flex items-center justify-center">{n}</span> {text}
      </p>
      {sub && <p className="text-[11px] text-muted mt-0.5 ml-7">{sub}</p>}
    </div>
  );

  const done = previews.length > 0;
  const [nightOver, setNightOver] = useState(false);
  const [nightCopied, setNightCopied] = useState(false);
  const copyNight = async () => { await navigator.clipboard.writeText(buildNightPrompt()); setNightCopied(true); setTimeout(() => setNightCopied(false), 2000); };
  const addNight = async (files) => {
    const f = [...(files || [])].find((x) => x.type.startsWith('image/'));
    if (!f || !setNightPhoto) return;
    const u = URL.createObjectURL(f);
    try { setNightPhoto(await toJpeg(u)); } finally { URL.revokeObjectURL(u); }
  };
  const prepped = status.startsWith('done:');
  const bigStep = (n, title, sub, isDone, body) => (
    <div className={`rounded-xl border-2 p-4 space-y-3 ${isDone ? 'border-border-brand bg-brand-light/40' : 'border-border-default bg-card'}`}>
      <div className="flex items-start gap-3">
        <span className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-base font-bold ${isDone ? 'bg-brand text-on-brand' : 'bg-surface-alt text-primary'}`}>{isDone ? <Check size={18} /> : n}</span>
        <div>
          <p className="text-lg font-bold text-primary">{title}</p>
          {sub && <p className="text-sm text-muted">{sub}</p>}
        </div>
      </div>
      {body}
    </div>
  );

  if (part === 'lines') {
    return (
      <div className={card}>
        {heading(1, 'Where the lights go', 'Your plan on each photo — this is what the presentation shows. Check it, then confirm.')}
        {withLines.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {withLines.map(({ i }) => <LinesCard key={i} url={lineUrls[i]} index={i} name={lineName(i)} onOpen={() => setGalleryAt(galleryItems.findIndex((g) => g.label === `Side ${i + 1}`))} />)}
          </div>
        ) : <p className="text-sm text-muted">Draw lines in Plan and they show up here.</p>}
        {galleryAt >= 0 && galleryItems.length > 0 && <Gallery items={galleryItems} start={Math.min(galleryAt, galleryItems.length - 1)} onClose={() => setGalleryAt(-1)} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status + what they picked */}
      <div className={`rounded-xl border-2 p-4 flex items-center gap-4 flex-wrap ${done ? 'border-border-brand bg-brand-light' : 'border-yellow-400/60 bg-yellow-400/10'}`}>
        <div className="flex-1 min-w-0">
          <p className={`text-xl font-bold ${done ? 'text-brand-text-strong' : 'text-yellow-300'}`}>{done ? `✓ Mockup done · ${previews.length} photo${previews.length === 1 ? '' : 's'}` : 'Mockup not made yet'}</p>
          <p className="text-sm text-secondary mt-0.5">Do the steps below. It takes about 2 minutes.{setNightPhoto && <> · Night photo: <b className={nightPhoto ? 'text-brand-text' : 'text-yellow-300'}>{nightPhoto ? 'done' : 'not yet'}</b></>}</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-card border border-border-default px-3 py-2">
          <span className="text-xs text-muted">They picked</span>
          {design.colors.length > 0 && <span className="flex -space-x-1">{design.colors.map((c) => <span key={c} className="w-4 h-4 rounded-full ring-1 ring-black/40" style={{ background: c }} />)}</span>}
          <span className="text-sm font-bold text-primary">{designId === 'custom' ? (custom || 'Custom') : design.label}</span>
        </div>
      </div>
      {designId === 'custom' && (
        <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Describe the custom colors — e.g. alternating blue and cool white"
          className="w-full rounded-lg border border-border-strong bg-card px-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand placeholder:text-placeholder-muted" />
      )}

      {bigStep(1, 'Prep the photos', 'Tick the photos for the mockup (none ticked = all), then hit Prep. It saves the clean photos for both ChatGPT parts below.', prepped || done, !withPhoto.length ? (
        <p className="text-sm text-muted">Add photos in step 2 first.</p>
      ) : (
        <>
          <div className="flex gap-2 flex-wrap">
            {withPhoto.map(({ a, i }) => <ShowCard key={i} side={a} index={i} onPatch={patch(i)} />)}
          </div>
          {picked.some(({ i }) => guideUrls[i]) && (
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-primary">What ChatGPT gets: a dot for every bulb <span className="font-normal text-muted">· each run its own color, bars where it starts + ends · 12" spacing = 1 per ft · {bulbs} bulbs total</span></p>
              <div className="space-y-3">
                {picked.filter(({ i }) => guideUrls[i]).map(({ i }) => <img key={i} src={guideUrls[i]} alt={`Side ${i + 1} guide`} className="w-full rounded-lg border border-border-default" />)}
              </div>
            </div>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={() => prep(false)} disabled={status === 'Saving…'} className={`inline-flex items-center gap-2 rounded-xl text-base font-bold px-6 py-3 disabled:opacity-50 cursor-pointer transition-colors ${prepped ? 'bg-emerald-500 text-white' : 'bg-brand text-on-brand hover:bg-brand-hover'}`}>
              {status === 'Saving…' ? <>Saving…</>
                : prepped ? <><Check size={18} /> Saved + prompt copied</>
                : <><FolderDown size={18} /> Prep for ChatGPT{picked.length ? ` (${picked.length})` : ''}</>}
            </button>
            {window.showDirectoryPicker && <button onClick={() => prep(true)} className="text-xs text-muted hover:text-primary cursor-pointer">Change folder</button>}
            {status && (
              <span className={`text-sm ${status.startsWith('error:') ? 'text-red-500 font-semibold' : 'text-secondary'}`}>
                {prepped ? `✓ Saved to ${status.slice(5)}` : status.startsWith('error:') ? `Didn't save: ${status.slice(6)}` : status}
              </span>
            )}
          </div>
        </>
      ))}

      {setNightPhoto && bigStep(2, 'Night photo — the "before"', 'Their house at night with NO lights. Open ChatGPT, attach the clean photo Prep saved, paste the night prompt, send — then drop the result here.', !!nightPhoto, (
        <>
          <div className="flex items-center gap-3 flex-wrap">
          <a href="https://chatgpt.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-primary text-surface text-base font-bold px-6 py-3 hover:opacity-90"><Sparkles size={18} /> Open ChatGPT</a>
          <button onClick={copyNight} className="inline-flex items-center gap-2 rounded-xl border border-border-strong text-base font-semibold text-secondary hover:text-primary px-5 py-3 cursor-pointer">
            {nightCopied ? <><Check size={16} className="text-brand-text" /> Night prompt copied</> : <><Copy size={16} /> Copy night prompt</>}
          </button>
          </div>
          {nightPhoto ? (
            <div className="space-y-1.5">
              <img src={nightPhoto} alt="House at night" className="w-full max-w-xl rounded-lg border border-border-default" />
              <button onClick={() => setNightPhoto('')} className="inline-flex items-center gap-1 text-xs text-muted hover:text-red-500 cursor-pointer"><Trash2 size={13} /> Remove</button>
            </div>
          ) : (
            <label
              onDragOver={(e) => { e.preventDefault(); setNightOver(true); }}
              onDragLeave={() => setNightOver(false)}
              onDrop={(e) => { e.preventDefault(); setNightOver(false); addNight(e.dataTransfer.files); }}
              className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed py-8 cursor-pointer transition-colors ${nightOver ? 'border-border-brand bg-brand-light' : 'border-border-strong hover:border-border-brand'}`}
            >
              <Upload size={24} className="text-muted" />
              <span className="text-base font-semibold text-primary">{nightOver ? 'Drop it' : 'Drag the night photo here or click'}</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => addNight(e.target.files)} />
            </label>
          )}
        </>
      ))}
      {bigStep(3, 'Lit-up photo — the "after"', 'The mockup with their lights. Open ChatGPT, attach the photos Prep saved, paste the lights prompt, send — then drop the results here.', done, (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <a href="https://chatgpt.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-primary text-surface text-base font-bold px-6 py-3 hover:opacity-90">
              <Sparkles size={18} /> Open ChatGPT
            </a>
            <button onClick={copyPrompt} className="inline-flex items-center gap-2 rounded-xl border border-border-strong text-base font-semibold text-secondary hover:text-primary px-5 py-3 cursor-pointer">
              {copied ? <><Check size={16} className="text-brand-text" /> Copied</> : <><Copy size={16} /> Copy lights prompt</>}
            </button>
          </div>
          <label
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); addPreviews(e.dataTransfer.files); }}
            className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed py-8 cursor-pointer transition-colors ${over ? 'border-border-brand bg-brand-light' : 'border-border-strong hover:border-border-brand'}`}
          >
            <Upload size={24} className="text-muted" />
            <span className="text-base font-semibold text-primary">{over ? 'Drop them' : 'Drag photos here or click'}</span>
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => addPreviews(e.target.files)} />
          </label>
          {previews.length > 0 && (
            <div className="space-y-4">
              {previews.map((p, k) => (
                <div key={p.id} className="space-y-1.5 max-w-xl">
                  <img src={p.image} alt={`Photo ${k + 1}`} onClick={() => setPreviewAt(k)} className="w-full rounded-lg border border-border-default cursor-zoom-in" />
                  <div className="flex items-center justify-between">
                    {k === 0
                      ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-text"><Star size={12} fill="currentColor" /> Cover</span>
                      : <button onClick={() => setPreviews((ps) => [p, ...ps.filter((x) => x.id !== p.id)])} className="inline-flex items-center gap-1 text-xs text-muted hover:text-primary cursor-pointer" title="Use this as the quote's cover photo"><Star size={12} /> Make cover</button>}
                    <div className="flex items-center gap-1">
                      <button onClick={() => setPreviewAt(k)} className={iconBtn} title="Full screen"><Maximize2 size={15} /></button>
                      <button onClick={() => downloadUrl(p.image, previewItems[k].name)} className={iconBtn} title="Download"><Download size={15} /></button>
                      <button onClick={() => setPreviews((ps) => ps.filter((x) => x.id !== p.id))} className="p-1 text-muted hover:text-red-500 cursor-pointer" title="Remove"><Trash2 size={15} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ))}
      {previewAt >= 0 && previewItems.length > 0 && <Gallery items={previewItems} start={Math.min(previewAt, previewItems.length - 1)} onClose={() => setPreviewAt(-1)} />}
    </div>
  );
}
