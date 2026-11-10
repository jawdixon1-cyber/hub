import { useEffect, useState } from 'react';
import { Download, Sparkles, Maximize2, X, Copy, Check, Upload, FolderDown, Trash2, ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { buildShowPrompt } from '../lib/lightsPrompt';
import { getPrepFolder, setPrepFolder } from '../lib/lightsStore';

// Two things for the client:
//  - Lines: every side's photo with Jude's lines in one bright color — "here's
//    where the lights go". Exact, drawn by Hub.
//  - Show photos: the sides Jude picks get turned into night mockups in his own
//    ChatGPT (his original prompt + the color he picks). Just for the wow — they
//    don't have to match the lines exactly.

const DESIGNS = [
  { id: 'warm', label: 'Warm white', colors: ['#ffd27a'] },
  { id: 'cool', label: 'Cool white', colors: ['#e6f0ff'] },
  { id: 'multi', label: 'Multicolor', colors: ['#ff3b30', '#34c759', '#0a84ff'] },
  { id: 'redwhite', label: 'Red & white', colors: ['#ff2d2d', '#fff4e0'] },
  { id: 'redgreen', label: 'Red & green', colors: ['#ff2d2d', '#2fd158'] },
  { id: 'custom', label: 'Custom', colors: [] },
];

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
  return cv.toDataURL('image/jpeg', 0.88);
}

// Photo + Jude's lines in one bright color, no labels.
async function linesPhoto(side) {
  const img = await loadImage(side.plain);
  const cv = canvasOf(img.width, img.height);
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const kx = img.width / (side.w || img.width);
  const ky = img.height / (side.h || img.height);
  const sw = Math.max(3, Math.round(img.width / 260));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  side.lines.forEach((l) => {
    const pts = ptsOf(l).map((p) => ({ x: p.x * kx, y: p.y * ky }));
    const trace = () => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); };
    trace(); ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = sw * 2.2; ctx.stroke();
    trace(); ctx.strokeStyle = LINE_COLOR; ctx.lineWidth = sw; ctx.stroke();
  });
  return cv.toDataURL('image/jpeg', 0.9);
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

export default function LightsMockup({ angles, setAngles, client, previews = [], setPreviews, designId: designProp, setDesignId: setDesignProp }) {
  const [designLocal, setDesignLocal] = useState(() => localStorage.getItem('lights-mockup-design') || 'warm');
  // The quote owns its color when the page passes it in.
  const designId = designProp || designLocal;
  const setDesignId = setDesignProp || setDesignLocal;
  const [custom, setCustom] = useState(() => localStorage.getItem('lights-mockup-custom') || '');
  const [status, setStatus] = useState('');
  const [copied, setCopied] = useState(false);
  const design = DESIGNS.find((d) => d.id === designId) || DESIGNS[0];
  const [lineUrls, setLineUrls] = useState({}); // side index -> lines photo
  const [galleryAt, setGalleryAt] = useState(-1);

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
  const picked = withPhoto.filter(({ a }) => a.show);
  const patch = (i) => (p) => setAngles((as) => as.map((a, j) => (j === i ? { ...a, ...p } : a)));
  const guides = picked.some(({ a }) => a.lines.length);
  const prompt = () => buildShowPrompt(design.id, designId === 'custom' ? custom : '', picked.length, guides);

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
    if (!picked.length) { setStatus('Tick at least one show photo first'); return; }
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
        if (!root) {
          root = await window.showDirectoryPicker({ id: 'lights-prep', mode: 'readwrite', startIn: 'downloads' });
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
        if (a.lines.length) await save(lineUrls[i] || await linesPhoto(a), `lines-side${i + 1}.jpg`);
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

  return (
    <>
      {/* 2 · Where the lights go (client-facing line photos) */}
      <div className={card}>
        {heading(2, 'Where the lights go', 'Your lines on each photo — show the client exactly where the lights go.')}
        {withLines.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {withLines.map(({ i }) => <LinesCard key={i} url={lineUrls[i]} index={i} name={lineName(i)} onOpen={() => setGalleryAt(galleryItems.findIndex((g) => g.label === `Side ${i + 1}`))} />)}
          </div>
        ) : <p className="text-sm text-muted">Draw lines on your photos in section 1 and they show up here.</p>}
      </div>

      {/* 3 · Show photos (night mockups from ChatGPT) */}
      <div className={card}>
        {heading(3, 'Show photos', 'Pick a color, tick the photos, then Prep for ChatGPT.')}
        {!withPhoto.length ? (
          <p className="text-sm text-muted">Add photos in section 1 first.</p>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              {DESIGNS.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setDesignId(d.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium cursor-pointer ${d.id === designId ? 'border-border-brand bg-brand-light text-brand-text-strong' : 'border-border-default text-secondary hover:text-primary'}`}
                >
                  {d.colors.length > 0 && (
                    <span className="flex -space-x-1">
                      {d.colors.map((c) => <span key={c} className="w-2.5 h-2.5 rounded-full ring-1 ring-black/40" style={{ background: c }} />)}
                    </span>
                  )}
                  {d.label}
                </button>
              ))}
            </div>
            {designId === 'custom' && (
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="e.g. alternating blue and cool white"
                className="w-full rounded-lg border border-border-strong bg-card px-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-ring-brand placeholder:text-placeholder-muted"
              />
            )}
            <div className="flex gap-2 flex-wrap">
              {withPhoto.map(({ a, i }) => <ShowCard key={i} side={a} index={i} onPatch={patch(i)} />)}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={() => prep(false)} disabled={status === 'Saving…'} className={`inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold px-4 py-2 disabled:opacity-50 cursor-pointer transition-colors ${status.startsWith('done:') ? 'bg-emerald-500 text-white' : 'bg-brand text-on-brand hover:bg-brand-hover'}`}>
                {status === 'Saving…' ? <>Saving…</>
                  : status.startsWith('done:') ? <><Check size={15} /> Saved + prompt copied</>
                  : <><FolderDown size={15} /> Prep for ChatGPT{picked.length ? ` (${picked.length})` : ''}</>}
              </button>
              <button onClick={copyPrompt} className="inline-flex items-center gap-1.5 rounded-lg border border-border-default text-sm font-medium text-secondary hover:text-primary px-3 py-2 cursor-pointer">
                {copied ? <><Check size={14} className="text-brand-text" /> Copied</> : <><Copy size={14} /> Copy prompt</>}
              </button>
              {window.showDirectoryPicker && <button onClick={() => prep(true)} className="text-xs text-muted hover:text-primary cursor-pointer">Change folder</button>}
              {status && (
                <span className={`text-xs ${status.startsWith('error:') ? 'text-red-500 font-semibold' : 'text-muted'}`}>
                  {status.startsWith('done:') ? `✓ Saved to ${status.slice(5)} — drag those files into ChatGPT and send`
                    : status.startsWith('error:') ? `Didn't save: ${status.slice(6)}` : status}
                </span>
              )}
            </div>
          </>
        )}
      {/* 4 · Client preview (finished show photos) */}
      <div className={card}>
        {heading(4, 'Client preview', "Drag ChatGPT's finished photos here — this is what the client sees.")}
        <label
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); addPreviews(e.dataTransfer.files); }}
          className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed py-6 cursor-pointer transition-colors ${over ? 'border-border-brand bg-brand-light' : 'border-border-strong hover:border-border-brand'}`}
        >
          <Upload size={20} className="text-muted" />
          <span className="text-sm font-semibold text-primary">{over ? 'Drop them' : 'Drag photos here or click'}</span>
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => addPreviews(e.target.files)} />
        </label>
        {previews.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {previews.map((p, k) => (
              <div key={p.id} className="space-y-1.5">
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
      </div>
      {previewAt >= 0 && previewItems.length > 0 && <Gallery items={previewItems} start={Math.min(previewAt, previewItems.length - 1)} onClose={() => setPreviewAt(-1)} />}
      {galleryAt >= 0 && galleryItems.length > 0 && <Gallery items={galleryItems} start={Math.min(galleryAt, galleryItems.length - 1)} onClose={() => setGalleryAt(-1)} />}
      </div>
    </>
  );
}
