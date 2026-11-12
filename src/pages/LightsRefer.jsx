import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

// Referral form (secret link, no login) — e.g. Mom sending Jude Christmas-lights leads.
// One contact per lead: the person she talked to.

const GREEN = '#00DF00';
const RED = '#B3121F';
const EMPTY = { name: '', contactName: '', phone: '', address: '', bestTime: '', angle: '', money: '' };

const FIELDS = [
  ['name', 'Family name', 'e.g. Mike and Sarah Johnson'],
  ['contactName', 'Who you talked to', 'e.g. Sarah'],
  ['phone', 'Their phone number', 'e.g. 803-555-1234', 'tel'],
  ['address', 'Their address', 'e.g. 123 Oak St, Rock Hill'],
  ['bestTime', 'Best time to call', 'e.g. weekdays after 5:30'],
  ['angle', 'How they know Jude', 'e.g. plays mahjong with me', 'area'],
  ['money', 'What they do / how they have money', "e.g. he's a contractor"],
];

const when = (iso) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });

export default function LightsRefer() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState('');
  const url = `/api/app-state?key=lights-refer&token=${encodeURIComponent(token)}`;

  useEffect(() => {
    fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error('This link isn’t working. Ask Jude for a new one.'))))
      .then(setInfo).catch((e) => setError(e.message));
  }, [url]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() && !form.contactName.trim()) { setError('Add their name first.'); return; }
    setSending(true); setError('');
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lead: form }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Didn’t send — try again.');
      setInfo((i) => ({ ...i, submissions: d.submissions }));
      setSent(form.name.trim() || form.contactName.trim());
      setForm(EMPTY);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) { setError(err.message); } finally { setSending(false); }
  };

  if (!info && !error) return <div className="min-h-screen bg-[#0b0b0d] flex items-center justify-center"><div className="w-8 h-8 border-4 border-white/20 border-t-[#00DF00] rounded-full animate-spin" /></div>;
  if (!info) return <div className="min-h-screen bg-[#0b0b0d] text-white flex items-center justify-center p-6 text-center text-lg">{error}</div>;

  const box = 'w-full rounded-xl border border-white/20 bg-white/[0.06] px-4 py-3.5 text-lg text-white outline-none focus:border-[#00DF00] placeholder:text-white/35';
  return (
    <div className="min-h-screen bg-[#0b0b0d] text-white">
      <div className="mx-auto max-w-lg px-5 py-6 space-y-6">
        <header className="space-y-2 text-center">
          <img src="/holiday-logo.png" alt="Hey Jude's" className="h-12 w-auto mx-auto" />
          <h1 className="text-3xl font-extrabold">Send Jude a lead</h1>
          <p className="text-white/70">{info.name ? `Hi ${info.name}! ` : ''}Who wants their Christmas lights done? Fill this out and Jude will reach out.</p>
        </header>

        {sent ? (
          <div className="rounded-2xl border-2 p-6 text-center space-y-3" style={{ borderColor: GREEN, background: `${GREEN}14` }}>
            <p className="text-5xl">✓</p>
            <p className="text-2xl font-extrabold">Sent to Jude!</p>
            <p className="text-white/80">{sent} is on his list. Thank you!</p>
            <button onClick={() => setSent('')} className="w-full rounded-xl py-4 text-lg font-bold text-black cursor-pointer" style={{ background: GREEN }}>+ Send another</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {FIELDS.map(([key, label, ph, kind]) => (
              <label key={key} className="block space-y-1.5">
                <span className="text-base font-bold">{label}</span>
                {kind === 'area'
                  ? <textarea value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} placeholder={ph} rows={2} className={box} />
                  : <input value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} placeholder={ph} type={kind === 'tel' ? 'tel' : 'text'} inputMode={kind === 'tel' ? 'tel' : undefined} className={box} />}
              </label>
            ))}
            {error && <p className="text-red-400 font-semibold">{error}</p>}
            <button type="submit" disabled={sending} className="w-full rounded-xl py-4 text-xl font-extrabold text-white disabled:opacity-50 cursor-pointer" style={{ background: RED }}>
              {sending ? 'Sending…' : 'Send to Jude 🎄'}
            </button>
          </form>
        )}

        <section className="space-y-2 pt-2">
          <h2 className="text-lg font-extrabold">Your referrals ({info.submissions.length})</h2>
          {info.submissions.length ? (
            <div className="rounded-2xl border border-white/10 divide-y divide-white/10">
              {info.submissions.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="font-semibold">{s.name || s.contact}{s.name && s.contact ? <span className="font-normal text-white/60"> · {s.contact}</span> : null}</span>
                  <span className="text-sm text-white/60 shrink-0">{when(s.at)}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-white/60">None yet — your first one will show up here.</p>}
        </section>
      </div>
    </div>
  );
}
