import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { HiringPagePreview } from './Hiring';
import { initialHiringContent } from '../data/hiringDefaults';

/**
 * Public-facing multi-step job application form, embeddable via iframe.
 * Supports: short, long, email, phone, radio, dropdown, multi, signature, video
 */
export default function ApplyForm() {
  const [form, setForm] = useState(null);
  const [hiringContent, setHiringContent] = useState(initialHiringContent);
  const [businessName, setBusinessName] = useState('');
  const [values, setValues] = useState({});
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('app_state')
          .select('key, value')
          .in('key', ['greenteam-applicationForm', 'greenteam-businessSettings', 'greenteam-hiringContent']);
        if (data) {
          for (const row of data) {
            if (row.key === 'greenteam-applicationForm') setForm(row.value);
            if (row.key === 'greenteam-businessSettings') setBusinessName(row.value?.name || '');
            if (row.key === 'greenteam-hiringContent' && row.value) setHiringContent(row.value);
          }
        }
      } catch {
        setError('Failed to load form');
      }
    })();
    fetch('/api/messaging?action=ensure-bucket&name=resumes').catch(() => {});
  }, []);

  if (error && !form) return <div className="p-6 text-center text-red-400 text-sm">{error}</div>;
  if (!form) return (
    <div className="flex items-center justify-center p-10" style={{ background: '#0a0a0a' }}>
      <div className="w-6 h-6 border-3 border-gray-700 border-t-green-400 rounded-full animate-spin" />
    </div>
  );

  if (!form.settings?.active) {
    return (
      <div className="p-8 text-center" style={{ background: '#0a0a0a', color: '#e5e5e5' }}>
        <p className="text-gray-400 text-sm">We're not currently accepting applications. Check back soon!</p>
      </div>
    );
  }

  const steps = form.steps || [];
  const settings = form.settings || {};
  const currentStep = steps[step];
  const isLast = step === steps.length - 1;

  const formatPhone = (v) => {
    const digits = v.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const handleChange = (fieldId, value) => setValues((prev) => ({ ...prev, [fieldId]: value }));

  const handleCheckbox = (fieldId, option, checked) => {
    setValues((prev) => {
      const current = prev[fieldId] || [];
      return { ...prev, [fieldId]: checked ? [...current, option] : current.filter((o) => o !== option) };
    });
  };

  const isVisible = (field) => {
    if (!field.showIf) return true;
    return values[field.showIf.field] === field.showIf.equals;
  };

  const validateStep = () => {
    if (!currentStep) return true;
    for (const field of currentStep.fields) {
      if (!isVisible(field)) continue;
      if (field.required) {
        const val = values[field.id];
        if (!val || (Array.isArray(val) && val.length === 0)) return false;
      }
    }
    return true;
  };

  const handleNext = (e) => {
    e.preventDefault();
    if (!validateStep()) { setError('Please fill in all required fields'); return; }
    setError(null);
    if (!isLast) { setStep(step + 1); window.scrollTo(0, 0); return; }
    handleSubmit();
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    const application = { id: crypto.randomUUID(), submittedAt: new Date().toISOString(), status: 'new', data: values };
    try {
      const resp = await fetch('/api/messaging?action=application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!resp.ok) throw new Error('Submit failed');
      setSubmitted(true);
    } catch (err) {
      console.error('Application submit error:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-[300px] flex items-center justify-center p-8" style={{ background: '#0a0a0a' }}>
        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-[rgba(176,255,3,.12)] border border-[rgba(176,255,3,.25)] flex items-center justify-center mx-auto mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#B0FF03" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <p className="text-lg font-black text-white mb-1">Application Submitted!</p>
          <p className="text-sm text-gray-400 font-semibold">{settings.successMessage || "Thanks for applying! We'll be in touch."}</p>
        </div>
      </div>
    );
  }

  const inputCls = "w-full bg-[#1a1a1a] border border-[#2e2e2e] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-[#B0FF03] focus:ring-1 focus:ring-[#B0FF03]/30";

  const groupFields = (fields) => {
    const rows = [];
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      const next = fields[i + 1];
      if (f.halfWidth && next?.halfWidth) {
        rows.push([f, next]);
        i++;
      } else {
        rows.push([f]);
      }
    }
    return rows;
  };

  return (
    <div style={{ background: '#0a0a0a', color: '#e5e5e5', fontFamily: "'Montserrat', system-ui, sans-serif", minHeight: '100%' }}>
      <HiringPagePreview content={hiringContent} steps={form?.steps} hideApplySection />
      <form onSubmit={handleNext} className="max-w-lg mx-auto p-5">
        {businessName && <p className="text-center text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">{businessName} - Job Application</p>}

        {/* Step indicators */}
        {steps.length > 1 && (
          <div className="flex items-center gap-1 mb-6">
            {steps.map((s, i) => (
              <div key={s.id} className="flex items-center gap-1 flex-1">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 transition-colors ${i <= step ? 'bg-[#B0FF03] text-[#111]' : 'bg-[#1a1a1a] border border-[#2e2e2e] text-[#555]'}`}>{i + 1}</div>
                <span className={`text-[11px] font-bold truncate hidden sm:block ${i <= step ? 'text-white' : 'text-[#555]'}`}>{s.title}</span>
                {i < steps.length - 1 && <div className={`flex-1 h-px ${i < step ? 'bg-[#B0FF03]' : 'bg-[#2e2e2e]'}`} />}
              </div>
            ))}
          </div>
        )}

        {currentStep && <h2 className="text-lg font-black text-white mb-4">{currentStep.title}</h2>}

        <div className="space-y-5">
          {groupFields((currentStep?.fields || []).filter(isVisible)).map((row, ri) => (
            <div key={ri} className={row.length === 2 ? 'grid grid-cols-2 gap-3' : ''}>
              {row.map((field) => (
            <div key={field.id}>
              {/* Labels with newlines render as paragraphs (for certification text blocks) */}
              {field.type === 'info' && !field.label.includes('\n') ? (
                <h3 className="text-base font-black text-white mt-2 mb-1">{field.label}</h3>
              ) : field.label.includes('\n') ? (
                <div className="text-sm text-gray-300 mb-3 whitespace-pre-line leading-relaxed font-semibold">{field.label}</div>
              ) : (
                <label className="block text-sm font-semibold text-gray-200 mb-1.5">
                  {field.label} {field.required && <span className="text-red-400">*</span>}
                </label>
              )}
              {field.description && <p className="text-xs text-gray-500 mb-1.5 font-semibold">{field.description}</p>}

              {/* Info (display only, no input) */}
              {field.type === 'info' && null}

              {/* Short answer */}
              {(field.type === 'short' || field.type === 'text') && (
                <input type="text" value={values[field.id] || ''} onChange={(e) => handleChange(field.id, e.target.value)} placeholder={field.placeholder} required={field.required} className={inputCls} />
              )}

              {/* Long answer */}
              {field.type === 'long' && (
                <textarea value={values[field.id] || ''} onChange={(e) => handleChange(field.id, e.target.value)} placeholder={field.placeholder} required={field.required} rows={3} className={`${inputCls} resize-y`} />
              )}

              {/* Email */}
              {field.type === 'email' && (
                <input type="email" value={values[field.id] || ''} onChange={(e) => handleChange(field.id, e.target.value)} placeholder={field.placeholder} required={field.required} className={inputCls} />
              )}

              {/* Phone */}
              {field.type === 'phone' && (
                <input type="tel" value={values[field.id] || ''} onChange={(e) => handleChange(field.id, formatPhone(e.target.value))} placeholder={field.placeholder} required={field.required} className={inputCls} />
              )}

              {/* Radio / Single Select */}
              {field.type === 'radio' && (
                <div className={(field.options || []).length === 2 ? 'grid grid-cols-2 gap-2' : 'space-y-2'}>
                  {(field.options || []).map((opt, i) => (
                    <label key={i} className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-[#2e2e2e] bg-[#1a1a1a] cursor-pointer hover:border-[#444] transition-colors" style={values[field.id] === opt ? { borderColor: 'rgba(176,255,3,.4)', background: 'rgba(176,255,3,.04)' } : {}}>
                      <div className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center shrink-0 ${values[field.id] === opt ? 'border-[#B0FF03]' : 'border-[#444]'}`}>
                        {values[field.id] === opt && <div className="w-2.5 h-2.5 rounded-full bg-[#B0FF03]" />}
                      </div>
                      <input type="radio" name={field.id} value={opt} checked={values[field.id] === opt} onChange={() => handleChange(field.id, opt)} className="sr-only" />
                      <span className="text-sm text-gray-200 font-semibold">{opt}</span>
                    </label>
                  ))}
                </div>
              )}

              {/* Dropdown */}
              {field.type === 'dropdown' && (
                <select value={values[field.id] || ''} onChange={(e) => handleChange(field.id, e.target.value)} required={field.required} className={inputCls}>
                  <option value="">Select...</option>
                  {(field.options || []).map((o, i) => <option key={i} value={o}>{o}</option>)}
                </select>
              )}

              {/* Multi Select */}
              {(field.type === 'multi' || field.type === 'checkbox') && (
                <div className="space-y-2">
                  {(field.options || []).map((opt, i) => {
                    const checked = (values[field.id] || []).includes(opt);
                    return (
                      <label key={i} className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-[#2e2e2e] bg-[#1a1a1a] cursor-pointer hover:border-[#444] transition-colors" style={checked ? { borderColor: 'rgba(176,255,3,.4)', background: 'rgba(176,255,3,.04)' } : {}}>
                        <div className={`w-[18px] h-[18px] rounded-md border-2 flex items-center justify-center shrink-0 ${checked ? 'border-[#B0FF03] bg-[#B0FF03]' : 'border-[#444]'}`}>
                          {checked && <svg width="12" height="12" viewBox="0 0 24 24"><path fill="#111" d="M9.2 16.6 4.9 12.3l1.6-1.6 2.7 2.7 8-8 1.6 1.6z"/></svg>}
                        </div>
                        <input type="checkbox" checked={checked} onChange={(e) => handleCheckbox(field.id, opt, e.target.checked)} className="sr-only" />
                        <span className="text-sm text-gray-200 font-semibold">{opt}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Signature */}
              {field.type === 'signature' && (
                <SignaturePad value={values[field.id]} onChange={(v) => handleChange(field.id, v)} />
              )}

              {/* Video */}
              {field.type === 'video' && (
                <div>
                  {field.placeholder && <p className="text-xs text-gray-400 mb-2 font-semibold">{field.placeholder}</p>}
                  <label className="flex flex-col items-center justify-center py-8 rounded-xl border-2 border-dashed border-[#2e2e2e] bg-[#1a1a1a] cursor-pointer hover:border-[#444] transition-colors">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                    <span className="text-xs text-gray-500 font-semibold mt-2">{values[field.id] ? 'Video selected' : 'Tap to upload video'}</span>
                    <input type="file" accept="video/*" className="sr-only" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleChange(field.id, file.name);
                    }} />
                  </label>
                </div>
              )}

              {/* File upload */}
              {field.type === 'file' && (
                <FileUploadField
                  value={values[field.id]}
                  onChange={(v) => handleChange(field.id, v)}
                  accept={field.accept || '.pdf,.doc,.docx,.jpg,.jpeg,.png'}
                />
              )}
            </div>
              ))}
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-red-400 font-semibold mt-3">{error}</p>}

        <div className="flex items-center gap-3 mt-6">
          {step > 0 && (
            <button type="button" onClick={() => { setStep(step - 1); setError(null); }} className="px-5 py-3 rounded-xl border border-[#2e2e2e] text-sm font-bold text-gray-400 hover:text-white hover:border-[#555] transition-colors cursor-pointer">
              Back
            </button>
          )}
          <button type="submit" disabled={submitting} className="flex-1 py-3 rounded-xl bg-[#B0FF03] text-black font-bold text-sm hover:bg-[#9ae600] disabled:opacity-50 transition-colors cursor-pointer">
            {submitting ? 'Submitting...' : isLast ? (settings.submitText || 'Submit Application') : 'Next'}
          </button>
        </div>
        {steps.length > 1 && <p className="text-center text-[11px] text-gray-600 font-semibold mt-3">Step {step + 1} of {steps.length}</p>}
      </form>
    </div>
  );
}

/* ─── File Upload (uploads to Supabase Storage 'resumes' bucket) ─── */
function FileUploadField({ value, onChange, accept }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');

  const handleFile = async (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError('File is too large (max 10 MB).'); return; }
    setUploading(true);
    setError('');
    setFileName(file.name);
    try {
      const urlRes = await fetch('/api/messaging?action=get-upload-url&bucket=resumes&filename=' + encodeURIComponent(file.name));
      if (!urlRes.ok) throw new Error('Could not prepare upload');
      const { path, token, publicUrl } = await urlRes.json();
      const { error: upErr } = await supabase.storage.from('resumes').uploadToSignedUrl(path, token, file);
      if (upErr) throw upErr;
      onChange(publicUrl);
    } catch (e) {
      console.error('[FileUpload]', e);
      setError("Upload failed. Please try again or email us your resume.");
      onChange('');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label className="flex flex-col items-center justify-center py-6 rounded-xl border-2 border-dashed border-[#2e2e2e] bg-[#1a1a1a] cursor-pointer hover:border-[#B0FF03]/40 transition-colors">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={value ? '#B0FF03' : '#555'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <span className={`text-xs font-semibold mt-2 ${value ? 'text-[#B0FF03]' : 'text-gray-500'}`}>
          {uploading ? 'Uploading…' : value ? (fileName || 'File uploaded') : 'Tap to upload a file'}
        </span>
        <input type="file" accept={accept} className="sr-only" onChange={(e) => handleFile(e.target.files?.[0])} />
      </label>
      {error && <p className="text-xs text-red-400 mt-2 font-semibold">{error}</p>}
    </div>
  );
}

/* ─── Signature Pad ─── */
function SignaturePad({ value, onChange }) {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const touch = e.touches?.[0];
    const clientX = touch ? touch.clientX : e.clientX;
    const clientY = touch ? touch.clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDraw = (e) => {
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setDrawing(true);
  };

  const draw = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#e5e5e5';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
    setHasDrawn(true);
  };

  const endDraw = () => {
    if (!drawing) return;
    setDrawing(false);
    if (canvasRef.current && hasDrawn) {
      onChange(canvasRef.current.toDataURL());
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    onChange('');
  };

  return (
    <div>
      <div className="rounded-xl border border-[#2e2e2e] bg-[#1a1a1a] overflow-hidden relative">
        <canvas
          ref={canvasRef}
          width={400}
          height={150}
          className="w-full touch-none"
          style={{ height: 150 }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        {!hasDrawn && !value && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-xs text-gray-600 font-semibold">Draw your signature here</span>
          </div>
        )}
      </div>
      {(hasDrawn || value) && (
        <button type="button" onClick={clear} className="text-[11px] font-semibold text-gray-500 hover:text-gray-300 mt-1.5 cursor-pointer">Clear signature</button>
      )}
    </div>
  );
}
