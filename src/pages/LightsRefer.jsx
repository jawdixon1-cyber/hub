import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

// Referral form (secret link, no login) — e.g. Mom sending Jude Christmas-lights leads.
// One contact per lead: the person she talked to.

const GREEN = '#00DF00';
const RED = '#B3121F';
// Kept dead simple for Mom (2026-11-13): first, last, phone, address, best time, how they know Jude.
const EMPTY = { first: '', last: '', phone: '', address: '', bestTime: '', angle: '', money: '' };


// 8035551234 → 803-555-1234 as they type (10 digits max; a leading 1 is dropped).
const dashPhone = (v) => {
  let d = String(v).replace(/\D/g, '');
  if (d.length > 10 && d.startsWith('1')) d = d.slice(1);
  d = d.slice(0, 10);
  return d.length > 6 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d;
};


// A box whose label sits inside like a placeholder, then floats up small when she taps or types.
function Float({ label, value, onChange, className = '', inputClass = '', ...rest }) {
  return (
    <label className={`relative block ${className}`}>
      <input value={value} onChange={onChange} placeholder=" " {...rest}
        className={`peer w-full bg-transparent px-4 pt-[18px] pb-1 text-base text-white outline-none ${inputClass}`} />
      <span className="pointer-events-none absolute left-4 top-1.5 text-xs font-semibold text-white/55 transition-all
        peer-placeholder-shown:top-3 peer-placeholder-shown:text-base peer-placeholder-shown:font-normal peer-placeholder-shown:text-white/40
        peer-focus:top-1.5 peer-focus:text-xs peer-focus:font-semibold peer-focus:text-[#00DF00]">{label}</span>
    </label>
  );
}

export default function LightsRefer() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState('');
  const url = `/api/app-state?key=lights-refer&token=${encodeURIComponent(token)}`;

  useEffect(() => { document.title = 'Hook a friend up 🎄 — Hey Jude’s'; }, []);
  useEffect(() => {
    fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error('This link isn’t working. Ask Jude for a new one.'))))
      .then(setInfo).catch((e) => setError(e.message));
  }, [url]);

  const submit = async (e) => {
    e.preventDefault();
    const first = form.first.trim(); const last = form.last.trim();
    if (!first || !last || form.phone.replace(/\D/g, '').length !== 10) { setError('Add their first name, last name and a 10-digit phone number.'); return; }
    setSending(true); setError('');
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lead: { name: [first, last].filter(Boolean).join(' '), contactName: first, phone: form.phone, address: form.address, bestTime: form.bestTime, angle: form.angle, money: form.money } }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Didn’t send — try again.');
      setInfo((i) => ({ ...i, submissions: d.submissions, leaderboard: d.leaderboard || i.leaderboard }));
      setSent([first, last].filter(Boolean).join(' '));
      setForm(EMPTY);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) { setError(err.message); } finally { setSending(false); }
  };

  if (!info && !error) return <div className="min-h-screen bg-[#0b0b0d] flex items-center justify-center"><div className="w-8 h-8 border-4 border-white/20 border-t-[#00DF00] rounded-full animate-spin" /></div>;
  if (!info) return <div className="min-h-screen bg-[#0b0b0d] text-white flex items-center justify-center p-6 text-center text-lg">{error}</div>;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <div className="min-h-screen bg-[#0b0b0d] text-white">
      <div className="mx-auto max-w-lg px-4 pt-3 pb-6 space-y-5">
        {/* Hero: a real house we did (matches the text preview) + the offer as two tiles */}
        <header className="space-y-2.5">
          <div className="relative -mx-4 -mt-3 h-[128px] overflow-hidden">
            <img src="/refer-hero.jpg" alt="" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: 'center 30%' }} />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(11,11,13,.35) 0%, rgba(11,11,13,0) 40%, rgba(11,11,13,.9) 100%)' }} />
            <img src="/holiday-logo.png" alt="Hey Jude's" className="absolute left-1/2 top-2.5 -translate-x-1/2 h-10 w-auto drop-shadow-[0_4px_10px_rgba(0,0,0,.6)]" />
            <p className="absolute bottom-2 left-0 right-0 text-center text-[26px] font-extrabold drop-shadow-[0_3px_10px_rgba(0,0,0,.8)]">Give $50 + Get $50 🎁</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl px-2 py-1.5 text-center" style={{ background: `${GREEN}1f` }}>
              <p className="text-[24px] leading-tight font-extrabold" style={{ color: GREEN }}>$50 off</p>
              <p className="text-sm text-white/80 whitespace-nowrap">for your friend</p>
            </div>
            <div className="rounded-xl px-2 py-1.5 text-center" style={{ background: `${GREEN}1f` }}>
              <p className="text-[24px] leading-tight font-extrabold" style={{ color: GREEN }}>$50 for you</p>
              <p className="text-sm text-white/80 whitespace-nowrap">when they hire Jude</p>
            </div>
          </div>
        </header>

        {sent ? (
          <div className="rounded-2xl border-2 p-6 text-center space-y-3" style={{ borderColor: GREEN, background: `${GREEN}14` }}>
            <p className="text-5xl">✓</p>
            <p className="text-2xl font-extrabold">Sent to Jude!</p>
            <p className="text-white/80">{sent} gets $50 off their lights, and Jude will reach out. Thank you!</p>
            <button onClick={() => setSent('')} className="w-full rounded-xl py-4 text-lg font-bold text-black cursor-pointer" style={{ background: GREEN }}>+ Send another</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <p className="text-base font-extrabold">Who should Jude call?</p>
            {/* Feels short: step 1 is just who + phone. Everything else is a lighter, skippable "nice to have". */}
            {/* Who + phone: one joined block (fewer boxes = feels shorter) */}
            <div className="space-y-2">
              <div className="rounded-xl border border-white/20 bg-white/[0.06] divide-y divide-white/15 overflow-hidden focus-within:border-[#00DF00]">
                <div className="grid grid-cols-2 divide-x divide-white/15">
                  <Float label="First name" value={form.first} onChange={set('first')} autoComplete="off" />
                  <Float label="Last name" value={form.last} onChange={set('last')} autoComplete="off" />
                </div>
                <Float label="Phone number" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: dashPhone(e.target.value) }))} type="tel" inputMode="tel" maxLength={12} autoComplete="off" />
                <Float label="Address (optional)" value={form.address} onChange={set('address')} autoComplete="off" />
              </div>
            </div>

            {/* Optional extras: same joined style */}
            <div className="space-y-1.5">
              <p className="text-sm text-white/75">⭐ <b className="text-white">Optional, but really helps Jude</b></p>
              <div className="rounded-xl border border-white/20 bg-white/[0.06] divide-y divide-white/15 overflow-hidden focus-within:border-[#00DF00]">
                <Float label="Best time to call" value={form.bestTime} onChange={set('bestTime')} autoComplete="off" />
                <Float label="How they know Jude" value={form.angle} onChange={set('angle')} autoComplete="off" />
                <Float label="Their job or business" value={form.money} onChange={set('money')} autoComplete="off" />
              </div>
            </div>

            {error && <p className="text-red-400 font-semibold">{error}</p>}
            <button type="submit" disabled={sending} className="w-full rounded-xl py-3.5 text-xl font-extrabold text-white disabled:opacity-50 cursor-pointer" style={{ background: RED }}>
              {sending ? 'Sending…' : 'Send to Jude 🎄'}
            </button>
          </form>
        )}

        {/* 🏆 Everyone with a link, ranked by sales — friendly competition */}
        {(info.leaderboard || []).length > 0 && (
          <section className="space-y-2 pt-2">
            <h2 className="text-lg font-extrabold">🏆 Leaderboard</h2>
            <div className="rounded-2xl border border-white/10 divide-y divide-white/10">
              {info.leaderboard.map((p, i) => (
                <div key={p.name} className={`flex items-center gap-3 px-4 py-3 ${p.me ? 'bg-white/[0.06]' : ''}`}>
                  <span className="w-6 text-center text-lg">{['🥇', '🥈', '🥉'][i] || i + 1}</span>
                  <span className="flex-1 font-semibold">{p.name}{p.me && <span className="text-white/50 font-normal"> (you)</span>}</span>
                  <span className="text-sm text-white/60">{p.pending} pending</span>
                  <span className="w-14 text-right font-extrabold" style={{ color: GREEN }}>${p.sold * 50}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-2 pt-2">
          <h2 className="text-lg font-extrabold">Your referrals ({info.submissions.length})</h2>
          {/* $50 for every referral Jude sells — sold so far + what's still in play */}
          {info.submissions.length > 0 && (() => {
            const sold = info.submissions.filter((x) => x.stage === 'sold').length;
            const pending = info.submissions.filter((x) => x.stage === 'pending').length;
            return (
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl p-3 text-center" style={{ background: `${GREEN}22` }}>
                  <p className="text-3xl font-extrabold" style={{ color: GREEN }}>${sold * 50}</p>
                  <p className="text-sm text-white/80">you’ve made · {sold} sold</p>
                </div>
                <div className="rounded-xl bg-white/[0.06] p-3 text-center">
                  <p className="text-3xl font-extrabold text-white">${pending * 50}</p>
                  <p className="text-sm text-white/80">still pending · {pending} in the works</p>
                </div>
              </div>
            );
          })()}
          {info.submissions.length ? (
            <div className="rounded-2xl border border-white/10 divide-y divide-white/10">
              {info.submissions.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="font-semibold">{s.name || s.contact}{s.name && s.contact ? <span className="font-normal text-white/60"> · {s.contact}</span> : null}</span>
                  <span className={`text-sm font-semibold shrink-0 ${s.stage === 'sold' ? '' : s.stage === 'no' ? 'text-white/40' : 'text-white/70'}`} style={s.stage === 'sold' ? { color: GREEN } : undefined}>
                    {s.stage === 'sold' ? '✓ Sold · $50' : s.stage === 'no' ? 'Not this time' : 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          ) : <p className="text-white/60">None yet — your first one will show up here.</p>}
        </section>
      </div>
    </div>
  );
}
