import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getQuote } from '../lib/lightsStore';
import { useAppStore } from '../store/AppStoreContext';
import { DESIGNS } from '../lib/lightsDesigns';
import { PlanOverlay, OutletMarks } from '../components/LightsMarkup';

// Client-facing presentation for one lights quote — shown full screen on the
// laptop/iPad at the meeting. Built to close: hero mockup, before/after, what
// they get, plan picker, one big "yes" button. Holiday logo + red #B3121F.
const RED = '#B3121F';
const GREEN = '#00DF00';
const LINE = '#FFD23F';
const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const PLANS = [
  { years: 1, off: 0, label: 'This season' },
  { years: 2, off: 0.05, label: '2-year plan' },
  { years: 3, off: 0.10, label: '3-year plan', best: true },
];

// Their photo with each planned line drawn as glowing bulbs in the colors they picked.
// Same picture as the Plan step: lights lines in their wire color, dashed zip lines, the plug.
function LinesPhoto({ side }) {
  const w = side.w || 1600;
  const h = side.h || 1200;
  return (
    <div className="relative mx-auto rounded-3xl overflow-hidden shadow-2xl" style={{ maxWidth: `min(100%, calc((100vh - 300px) * ${(side.w || 4) / (side.h || 3)}))` }}>
      <img src={side.plain} alt="" className="block w-full" />
      {side.w > 0 && (
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
          <PlanOverlay lines={side.lines || []} jumps={side.jumps || []} w={w} h={h} />
          <OutletMarks outlets={side.outlets || []} w={w} h={h} />
          <OutletMarks inline outlets={side.inlines || []} w={w} h={h} />
        </svg>
      )}
    </div>
  );
}

// A real month calendar: today circled, install green, takedown red, lit-up days shaded between.
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function MonthCal({ year, month, today, install, takedown }) {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(first.getDay()).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  return (
    <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-5">
      <p className="text-xl font-extrabold mb-3">{first.toLocaleDateString([], { month: 'long', year: 'numeric' })}</p>
      <div className="grid grid-cols-7 gap-1 text-center">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i} className="text-xs font-bold text-white/40 pb-1">{d}</span>)}
        {cells.map((d, i) => {
          if (!d) return <span key={i} />;
          const key = ymd(new Date(year, month, d));
          const isInstall = key === install;
          const isTake = key === takedown;
          const isToday = key === today;
          const lit = install && takedown && key > install && key < takedown;
          return (
            <div key={i} className="relative flex flex-col items-center justify-center h-11 sm:h-12 rounded-lg text-sm font-semibold"
              style={isInstall ? { background: GREEN, color: '#000' } : isTake ? { background: RED, color: '#fff' } : lit ? { background: `${GREEN}1f` } : undefined}>
              <span className={isToday && !isInstall && !isTake ? 'w-8 h-8 rounded-full ring-2 ring-white flex items-center justify-center' : ''}>{d}</span>
              {(isInstall || isTake || isToday) && (
                <span className="text-[9px] font-bold uppercase leading-none mt-0.5" style={{ color: isInstall ? '#000' : isTake ? '#fff' : 'rgba(255,255,255,0.7)' }}>
                  {isInstall ? 'Install' : isTake ? 'Takedown' : 'Today'}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
function DatesCalendar({ install, takedown }) {
  const today = ymd(new Date());
  // Every month from the first date to the last (today → takedown), so the whole lit-up stretch shows.
  const keys = [today, install, takedown].filter(Boolean).sort();
  const [y0, m0] = keys[0].split('-').map(Number);
  const [y1, m1] = keys[keys.length - 1].split('-').map(Number);
  const months = [];
  for (let y = y0, m = m0 - 1; (y < y1 || (y === y1 && m <= m1 - 1)) && months.length < 6; m += 1) {
    if (m > 11) { m = 0; y += 1; if (y > y1 || (y === y1 && m > m1 - 1)) break; }
    months.push([y, m]);
  }
  return (
    <div className={`grid gap-4 ${months.length >= 3 ? 'md:grid-cols-3' : months.length === 2 ? 'md:grid-cols-2' : ''}`}>
      {months.map(([y, m]) => <MonthCal key={`${y}-${m}`} year={y} month={m} today={today} install={install} takedown={takedown} />)}
    </div>
  );
}

// Drag to compare their house today vs. lit up.
// Starts on the right (all dark) — drag left to light it up.
function BeforeAfter({ before, after }) {
  const [pos, setPos] = useState(97);
  return (
    // Sized to the screen height so the whole photo fits with the heading + bottom bar (4:3 photos).
    <div className="relative mx-auto rounded-3xl overflow-hidden shadow-2xl select-none" style={{ maxWidth: 'min(100%, calc((100vh - 300px) * 4 / 3))' }}>
      <img src={after} alt="After" className="block w-full" />
      <img src={before} alt="Before" className="absolute inset-0 w-full h-full object-cover" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
      <div className="absolute inset-y-0 w-1 bg-white shadow-[0_0_20px_rgba(0,0,0,0.6)] pointer-events-none" style={{ left: `${pos}%` }}>
        <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 left-1/2 w-12 h-12 rounded-full bg-white text-black flex items-center justify-center text-lg font-black shadow-xl">⇆</span>
      </div>
      <span className="absolute top-4 left-4 rounded-full bg-black/60 px-3 py-1 text-xs font-bold uppercase tracking-wide">Today</span>
      {pos < 85 && <span className="absolute top-4 right-4 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide" style={{ background: RED }}>With Hey Jude's</span>}
      {pos >= 85 && <span className="absolute bottom-5 right-6 rounded-full bg-white text-black px-4 py-2 text-sm font-bold shadow-xl pointer-events-none animate-pulse">← Drag to light it up</span>}
      <input type="range" min="0" max="100" value={pos} onChange={(e) => setPos(Number(e.target.value))}
        className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize" aria-label="Compare before and after" />
    </div>
  );
}

// Little celebration when they say yes.
function Confetti() {
  const bits = Array.from({ length: 70 }, (_, i) => ({
    left: (i * 37) % 100,
    delay: (i % 10) * 0.12,
    dur: 2.4 + ((i * 7) % 10) / 10,
    color: [RED, GREEN, LINE, '#ffffff', '#0a84ff'][i % 5],
    size: 8 + (i % 4) * 3,
  }));
  return (
    <div className="fixed inset-0 z-[80] pointer-events-none overflow-hidden">
      <style>{'@keyframes hj-fall{0%{transform:translateY(-10vh) rotate(0)}100%{transform:translateY(110vh) rotate(720deg)}}'}</style>
      {bits.map((b, i) => (
        <span key={i} className="absolute top-0 rounded-sm" style={{ left: `${b.left}%`, width: b.size, height: b.size * 0.5, background: b.color, animation: `hj-fall ${b.dur}s ${b.delay}s ease-in forwards` }} />
      ))}
    </div>
  );
}

export default function LightsPresentation() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [q, setQ] = useState(null);
  const [failed, setFailed] = useState(false);
  const [big, setBig] = useState('');
  const [plan, setPlan] = useState(3);
  const [yes, setYes] = useState(false);
  const supplies = useAppStore((st) => st.lightsSupplies) || [];

  useEffect(() => {
    getQuote(id).then((d) => (d ? setQ(d) : setFailed(true))).catch(() => setFailed(true));
  }, [id]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') (big ? setBig('') : yes ? setYes(false) : navigate(-1));
      if (big && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) document.getElementById(e.key === 'ArrowRight' ? 'hj-next' : 'hj-prev')?.click();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [big, yes, navigate]);

  const sides = (q?.angles || []).filter((a) => a.plain);
  const lined = sides.filter((a) => (a.lines || []).length);
  const mockups = (q?.previews || []).map((p) => p.image).filter(Boolean);
  const hero = mockups[0] || sides[0]?.plain || '';
  // Before = the house at night with no lights (from ChatGPT) — falls back to the daytime photo.
  const before = q?.nightPhoto || sides.find((a) => a.show)?.plain || sides[0]?.plain || '';
  const price = Number(q?.quoted) || Number(q?.total) || 0;
  const parts = Object.entries(q?.materials || {})
    .map(([mid, qty]) => ({ it: supplies.find((x) => x.id === mid), qty: Number(qty) || 0 }))
    .filter((x) => x.it && x.qty > 0);
  const takedownOn = q?.takedownDate ? new Date(`${q.takedownDate}T12:00:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }) : '';
  const installOn = q?.installDate ? new Date(`${q.installDate}T12:00:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }) : '';
  const today = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  const name = (q?.client || '').trim();
  const last = name ? name.split(/\s+/).slice(-1)[0] : '';
  const chosen = PLANS.find((p) => p.years === plan) || PLANS[0];
  const chosenPer = price * (1 - chosen.off);
  // Every photo for the side rail + viewer: mockups first, then their house photos.
  const gallery = [...mockups, ...sides.map((a) => a.plain)];
  const bigAt = gallery.indexOf(big);
  const step = (d) => { if (gallery.length) setBig(gallery[(Math.max(0, bigAt) + d + gallery.length) % gallery.length]); };
  const toPrice = () => document.getElementById('hj-price')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-[#0b0b0d] text-white">
      {/* Top bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-6 py-3 bg-[#0b0b0d]/85 backdrop-blur">
        <img src="/holiday-logo.png" alt="Hey Jude's" className="h-11 w-auto" />
        <button onClick={() => navigate(-1)} className="text-sm text-white/40 hover:text-white cursor-pointer">✕</button>
      </div>

      {!q && <p className="text-center text-white/60 py-32">{failed ? 'Could not load this quote.' : 'Loading…'}</p>}

      {q && (
        <>
          {/* Hero */}
          <section className="relative">
            {hero && <img src={hero} alt="" onClick={() => setBig(hero)} className="w-full max-h-[78vh] object-cover cursor-zoom-in" />}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0d] via-[#0b0b0d]/30 to-transparent pointer-events-none" />
            <div className="absolute inset-x-0 bottom-0 px-6 pb-10">
              <div className="max-w-5xl mx-auto space-y-4">
                <p className="text-sm font-extrabold uppercase tracking-[0.3em]" style={{ color: GREEN }}>Designed for your home</p>
                <h1 className="text-5xl sm:text-7xl font-extrabold tracking-tight leading-[0.95]">
                  {last ? <>The {last} home,<br />lit up for Christmas.</> : <>Your home,<br />lit up for Christmas.</>}
                </h1>
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  {installOn && <span className="rounded-full bg-white/15 backdrop-blur px-4 py-2 text-sm font-bold">📅 Install {installOn}</span>}
                  {price > 0 && (
                    <button onClick={toPrice} className="rounded-full px-6 py-2.5 text-base font-extrabold text-black shadow-lg hover:brightness-110 cursor-pointer" style={{ background: GREEN }}>
                      See your deal ↓
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>

          <div className="max-w-5xl mx-auto px-6 pb-40 space-y-24 pt-10">
            {/* Before / after */}
            {before && mockups[0] && (
              <section className="space-y-6">
                <div className="text-center">
                  <h2 className="text-4xl font-extrabold">Drag to see the difference</h2>
                  <p className="text-white/60 mt-2">Your house today → your house this Christmas.</p>
                </div>
                <BeforeAfter before={before} after={mockups[0]} />
              </section>
            )}

            {/* More mockups */}
            {mockups.length > 1 && (
              <section className="space-y-6">
                <h2 className="text-4xl font-extrabold">More of your design</h2>
                <div className="grid gap-5 sm:grid-cols-2">
                  {mockups.slice(1).map((src, i) => (
                    <img key={i} src={src} alt="" onClick={() => setBig(src)} className="w-full rounded-2xl shadow-xl cursor-zoom-in hover:scale-[1.01] transition-transform" />
                  ))}
                </div>
              </section>
            )}

            {/* Where the lights go */}
            {lined.length > 0 && (
              <section className="space-y-6">
                <div>
                  <h2 className="text-4xl font-extrabold">Every line, planned and color-matched</h2>
                  <p className="text-white/60 mt-2">Every bulb, wire and outlet mapped before we touch a ladder — run cleanly and safely to your power, done the right way.</p>
                </div>
                <div className="space-y-6">
                  {lined.map((s, i) => <LinesPhoto key={i} side={s} />)}
                </div>
                {/* What goes on it — pictures only (no feet or counts, so they can't do $/ft math and shop it). */}
                {parts.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <p className="text-lg font-bold">Only commercial-grade, energy-efficient products.</p>
                    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                      {parts.map(({ it }) => (
                        <div key={it.id} className="rounded-2xl bg-white/[0.04] border border-white/10 p-3 flex items-center gap-3">
                          {it.image
                            ? <img src={it.image} alt="" className="w-14 h-14 rounded-xl object-cover bg-white shrink-0" />
                            : <span className="w-14 h-14 rounded-xl bg-white/10 shrink-0" />}
                          <p className="text-sm font-semibold text-white/85 leading-tight">{it.name}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Your dates: install → takedown */}
            {(installOn || takedownOn) && (
              <section className="space-y-6">
                <div>
                  <h2 className="text-4xl font-extrabold">Your dates</h2>
                  <p className="text-white/60 mt-2">On the calendar — we show up, light it up, and come back to take it all down.</p>
                </div>
                <DatesCalendar install={q?.installDate || ''} takedown={q?.takedownDate || ''} />
                <div className="grid gap-4 sm:grid-cols-2">
                  {[['🎄', 'Install', installOn, GREEN], ['📦', 'Takedown', takedownOn, RED]].map(([icon, label, day, color]) => (
                    <div key={label} className="rounded-2xl border-2 p-7" style={{ borderColor: `${color}99`, background: `${color}14` }}>
                      <p className="text-sm font-bold uppercase tracking-[0.15em]" style={{ color }}>{icon} {label}</p>
                      <p className="text-4xl sm:text-5xl font-extrabold mt-2 leading-tight">{day || 'To be scheduled'}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Not a commodity: just hung → full service → Hey Jude's */}
            <section className="space-y-8">
              <h2 className="text-4xl font-extrabold">Not just lights on a roof.</h2>
              <div className="grid gap-5 lg:grid-cols-3 items-center">
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-7 opacity-60">
                  <p className="text-2xl font-extrabold text-white/80">Just hung</p>
                  <ul className="mt-5 space-y-3 text-lg text-white/70">
                    <li>✓ Lights up</li>
                    <li>✕ No plan</li>
                    <li>✕ Mismatched wire</li>
                    <li>✕ You fix bulbs</li>
                    <li>✕ You take it down</li>
                  </ul>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/[0.04] p-7">
                  <p className="text-2xl font-extrabold">Full service</p>
                  <ul className="mt-5 space-y-3 text-lg text-white/85">
                    <li>✓ Design</li>
                    <li>✓ Install</li>
                    <li>✓ Maintain</li>
                    <li>✓ Take down</li>
                    <li>✓ Store</li>
                  </ul>
                </div>
                <div className="rounded-3xl border-2 p-7 lg:py-10 shadow-[0_0_60px_rgba(0,223,0,0.18)]" style={{ borderColor: GREEN, background: `${GREEN}12` }}>
                  <img src="/holiday-logo.png" alt="Hey Jude's" className="h-12 w-auto" />
                  <p className="mt-2 text-sm font-bold uppercase tracking-[0.15em]" style={{ color: GREEN }}>Full service, plus</p>
                  <ul className="mt-5 space-y-3 text-lg font-semibold">
                    <li>
                      📐 Professionally planned
                      <span className="block text-sm font-normal text-white/70 mt-0.5 ml-7">Every bulb mapped — you see it before we start</span>
                    </li>
                    <li>
                      🎯 Color-matched wire &amp; clips
                      <span className="block text-sm font-normal text-white/70 mt-0.5 ml-7">Cleanest look from every angle</span>
                    </li>
                    <li>🗓️ January takedown guarantee<span className="text-white/50">*</span></li>
                  </ul>
                  <p className="mt-5 text-xs text-white/50">*Down in January or your money back — weather permitting.</p>
                </div>
              </div>
            </section>

            {/* Price + plan picker */}
            {price > 0 && (
              <section id="hj-price" className="space-y-8 scroll-mt-20">
                <div className="text-center">
                  <h2 className="text-4xl sm:text-5xl font-extrabold">Pick your plan</h2>
                  <p className="text-white/60 mt-2">Install, maintenance, takedown &amp; storage included every year.</p>
                </div>
                <div className="grid gap-5 sm:grid-cols-3 items-stretch">
                  {PLANS.map((t) => {
                    const per = price * (1 - t.off);
                    const on = plan === t.years;
                    return (
                      <button key={t.years} onClick={() => setPlan(t.years)}
                        className={`relative rounded-3xl p-7 text-center space-y-2 cursor-pointer transition-all ${on ? 'text-white shadow-2xl sm:scale-105 ring-4 ring-white/80' : 'bg-white/[0.04] border border-white/10 hover:border-white/30'}`}
                        style={on ? { background: RED } : undefined}>
                        {t.best && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-extrabold text-black uppercase tracking-wide whitespace-nowrap" style={{ background: GREEN }}>Best deal</span>}
                        <p className={`text-sm font-bold uppercase tracking-[0.15em] ${on ? 'text-white/85' : 'text-white/60'}`}>{on ? '✓ ' : ''}{t.label}</p>
                        <div className="flex items-baseline justify-center gap-2">
                          {t.off > 0 && <span className={`text-xl font-bold line-through ${on ? 'text-white/60' : 'text-white/40'}`}>{money(price)}</span>}
                          <span className="text-5xl font-extrabold">{money(per)}</span>
                        </div>
                        <p className={on ? 'text-white/85' : 'text-white/60'}>{t.years === 1 ? 'one season' : 'per year'}</p>
                        {t.off > 0 && (
                          <div className="pt-2 space-y-1">
                            <p className="text-lg font-extrabold" style={{ color: on ? '#fff' : GREEN }}>You save {money(price * t.off * t.years)}</p>
                            <p className={`text-sm font-semibold ${on ? 'text-white/85' : 'text-white/60'}`}>🔒 Price locked for {t.years} years</p>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* The ask */}
                <div className="text-center space-y-4 pt-4">
                  <button onClick={() => setYes(true)}
                    className="w-full sm:w-auto rounded-2xl px-12 py-6 text-2xl font-extrabold text-black shadow-[0_0_60px_rgba(0,223,0,0.35)] hover:brightness-110 hover:scale-[1.02] transition-transform cursor-pointer"
                    style={{ background: GREEN }}>
                    🎄 Light up my home
                  </button>
                  <p className="text-white/70 font-semibold">⏳ Only good today, {today} — we can't hold your spot after today.</p>
                </div>
              </section>
            )}

            <footer className="text-center space-y-1 text-white/50">
              <img src="/holiday-logo.png" alt="" className="h-14 w-auto mx-auto mb-2" />
              <p>803-902-7447 · heyjudeschristmaslights.com</p>
            </footer>
          </div>

          {/* Sticky bottom bar */}
          {price > 0 && !yes && (
            <div className="fixed bottom-0 inset-x-0 z-30 border-t border-white/10 bg-[#0b0b0d]/90 backdrop-blur">
              <div className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white/60 truncate">{chosen.label}{installOn ? ` · install ${installOn}` : ''}</p>
                  <p className="text-xl font-extrabold">{money(chosenPer)}<span className="text-sm font-semibold text-white/60">{chosen.years === 1 ? '' : '/yr'}</span>
                    {chosen.off > 0 && <span className="ml-2 text-sm font-bold" style={{ color: GREEN }}>save {money(price * chosen.off * chosen.years)}</span>}</p>
                </div>
                <button onClick={toPrice} className="rounded-xl px-6 py-3 font-extrabold text-black cursor-pointer hover:brightness-110" style={{ background: GREEN }}>Light it up 🎄</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Photo rail on the side — tap to see any photo big */}
      {q && gallery.length > 0 && (
        <div className="hidden md:flex fixed right-3 top-1/2 -translate-y-1/2 z-30 flex-col gap-2 max-h-[70vh] overflow-y-auto rounded-2xl bg-black/50 backdrop-blur p-2">
          {gallery.map((src, i) => (
            <img key={i} src={src} alt="" onClick={() => setBig(src)}
              className={`w-20 h-14 rounded-lg object-cover cursor-pointer border-2 transition-all hover:scale-105 ${big === src ? 'border-white' : 'border-transparent opacity-80 hover:opacity-100'}`} />
          ))}
        </div>
      )}

      {/* Yes! */}
      {yes && (
        <>
          <Confetti />
          <div onClick={() => setYes(false)} className="fixed inset-0 z-[75] bg-black/80 backdrop-blur flex items-center justify-center p-6">
            <div onClick={(e) => e.stopPropagation()} className="max-w-lg w-full rounded-3xl p-10 text-center space-y-4 shadow-2xl" style={{ background: RED }}>
              <img src="/holiday-logo.png" alt="" className="h-16 w-auto mx-auto" />
              <h2 className="text-4xl font-extrabold">You're on the list! 🎉</h2>
              <p className="text-lg text-white/90">{chosen.label} · {money(chosenPer)}{chosen.years === 1 ? '' : '/yr'}</p>
              {installOn && <p className="text-xl font-bold">📅 We'll see you {installOn}</p>}
              <p className="text-white/80">Welcome to the Hey Jude's family.</p>
              <button onClick={() => setYes(false)} className="mt-2 rounded-xl bg-white px-6 py-2.5 font-bold text-black cursor-pointer">Done</button>
            </div>
          </div>
        </>
      )}

      {big && (
        <div onClick={() => setBig('')} className="fixed inset-0 z-[90] bg-black/95 flex items-center justify-center p-6 cursor-zoom-out">
          <img src={big} alt="" className="max-w-full max-h-full rounded-xl" />
          {gallery.length > 1 && (
            <>
              <button id="hj-prev" onClick={(e) => { e.stopPropagation(); step(-1); }} className="absolute left-4 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-white/15 hover:bg-white/30 text-3xl font-bold cursor-pointer">‹</button>
              <button id="hj-next" onClick={(e) => { e.stopPropagation(); step(1); }} className="absolute right-4 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-white/15 hover:bg-white/30 text-3xl font-bold cursor-pointer">›</button>
              <p className="absolute bottom-5 inset-x-0 text-center text-sm text-white/60">{bigAt + 1} / {gallery.length}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
