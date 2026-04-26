import { useState, useEffect, useMemo, lazy, Suspense, Component } from 'react';
import { Check, Circle, LogOut, ExternalLink, FileText, Briefcase, DollarSign } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  AGREEMENT_SECTIONS as DEFAULT_SECTIONS,
  FINAL_AGREEMENT_TEXT as DEFAULT_FINAL_TEXT,
  getCurrentAgreementConfig,
  getCurrentAgreementVersion,
} from '../data/employmentAgreement';
import { DEFAULT_ROLES } from '../data/roleTemplates';

const AgreementSigningFlow = lazy(() => import('../components/AgreementSigningFlow'));
const PdfAgreementSigningFlow = lazy(() => import('../components/PdfAgreement'));

class SigningErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('[SigningFlow] crashed:', error, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={this.props.onClose}>
          <div className="bg-card rounded-2xl border border-red-500/40 p-6 max-w-md" onClick={(e) => e.stopPropagation()}>
            <p className="text-red-400 font-bold mb-2">Agreement crashed</p>
            <pre className="text-[11px] text-muted whitespace-pre-wrap break-words">{String(this.state.error?.message || this.state.error)}</pre>
            {this.state.error?.stack && <pre className="text-[10px] text-muted mt-2 whitespace-pre-wrap break-words max-h-48 overflow-auto">{this.state.error.stack}</pre>}
            <button onClick={this.props.onClose} className="mt-4 px-3 py-2 rounded-lg text-xs font-bold bg-surface-alt text-secondary cursor-pointer">Close</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function ApplicantOnboarding() {
  const { user, signOut } = useAuth();
  const userEmail = user?.email?.toLowerCase();
  const applicantId = user?.user_metadata?.applicantId;

  const [applications, setApplications] = useState([]);
  const [agreementConfig, setAgreementConfig] = useState(null);
  const [agreementPdf, setAgreementPdf] = useState(null);
  const [signedAgreements, setSignedAgreements] = useState([]);
  const [rolesData, setRolesData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSigning, setShowSigning] = useState(false);
  const [emergency, setEmergency] = useState({ name: '', phone: '', relation: '' });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('app_state').select('key, value').in('key', ['greenteam-applications', 'greenteam-agreementConfig', 'greenteam-agreementPdf', 'greenteam-signedAgreements', 'greenteam-roles']);
      const map = {};
      for (const r of data || []) map[r.key] = r.value;
      setApplications(map['greenteam-applications'] || []);
      setAgreementConfig(map['greenteam-agreementConfig'] || null);
      setAgreementPdf(map['greenteam-agreementPdf'] || null);
      setSignedAgreements(map['greenteam-signedAgreements'] || []);
      setRolesData(map['greenteam-roles'] || null);
      setLoading(false);
    })();
  }, []);

  const applicant = useMemo(() => {
    if (!applications.length) return null;
    return applications.find((a) => a.id === applicantId) || applications.find((a) => a.data?.email?.toLowerCase() === userEmail);
  }, [applications, applicantId, userEmail]);

  const onboarding = applicant?.onboarding || {};
  const config = getCurrentAgreementConfig(agreementConfig, DEFAULT_SECTIONS, DEFAULT_FINAL_TEXT);
  const currentVersion = getCurrentAgreementVersion(agreementConfig);
  const mySignature = signedAgreements.find((a) => a.memberEmail === userEmail && a.version === currentVersion);

  const firstName = (applicant?.data?.first_name || (applicant?.data?.name || '').split(' ')[0] || '').trim();
  const trialStart = onboarding.trialStart || onboarding.trialDate;
  const trialEnd = onboarding.trialEnd;
  const fmtTrialDate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const fmtTrialDateShort = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const trialRangeLabel = trialStart && trialEnd && trialStart !== trialEnd
    ? `${fmtTrialDateShort(trialStart)} – ${fmtTrialDateShort(trialEnd)}`
    : trialStart ? fmtTrialDate(trialStart) : null;

  // Load emergency contact if already saved
  useEffect(() => {
    if (onboarding.emergencyContact) setEmergency(onboarding.emergencyContact);
  }, [applicant?.id]);

  const saveOnboarding = async (patch) => {
    if (!applicant) return;
    // Optimistic UI update
    const updated = applications.map((a) => a.id === applicant.id ? { ...a, onboarding: { ...(a.onboarding || {}), ...patch } } : a);
    setApplications(updated);
    // Server-side save — RLS blocks applicants from writing directly to app_state,
    // so this goes through an admin endpoint that scopes the patch to their record.
    try {
      await fetch('/api/app-state?key=team-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'updateApplicantOnboarding', applicantId: applicant.id, patch }),
      });
    } catch (err) {
      console.error('[onboarding] save failed', err);
    }
  };

  const toggleStep = async (stepId) => {
    const cur = onboarding[stepId];
    await saveOnboarding({ [stepId]: cur ? null : { done: true, completedAt: new Date().toISOString() } });
  };

  const handleSigned = async (signed) => {
    const record = { ...signed, memberEmail: userEmail };
    const next = [...signedAgreements, record];
    setSignedAgreements(next);
    try {
      await fetch('/api/app-state?key=team-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'applicantSignAgreement', record }),
      });
    } catch (err) {
      console.error('[onboarding] sign save failed', err);
    }
    setShowSigning(false);
  };

  const saveEmergency = async () => {
    await saveOnboarding({ emergencyContact: emergency });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const steps = [
    {
      id: 'agreement',
      label: 'Sign the Team Agreement',
      description: 'Read through and sign our team agreement. Covers our team standards, how accountability works, and how strikes work.',
      icon: FileText,
      done: !!mySignature,
      action: () => setShowSigning(true),
      actionLabel: mySignature ? 'View / re-sign' : 'Read + sign',
    },
    {
      id: 'jobber_activated',
      label: 'Download and sign into Jobber',
      description: 'Check your email for the Jobber invite, set your password, then download the Jobber app on your phone and sign in. Jobber is where you clock in and out on the job.',
      icon: Briefcase,
      done: !!onboarding.jobber_activated?.done,
      action: () => toggleStep('jobber_activated'),
      actionLabel: onboarding.jobber_activated?.done ? 'Mark incomplete' : "I'm signed in",
    },
    {
      id: 'payroll_complete',
      label: 'Finish your payroll paperwork',
      description: 'Check your email for a payroll signup from ADP. Fill out your W-4, I-9, and direct deposit info so you get paid.',
      icon: DollarSign,
      done: !!onboarding.payroll_complete?.done,
      action: () => toggleStep('payroll_complete'),
      actionLabel: onboarding.payroll_complete?.done ? 'Mark incomplete' : "I've finished it",
    },
    {
      id: 'emergency',
      label: 'Emergency contact',
      description: "In case anything happens on the job, we need someone we can reach.",
      icon: Circle,
      done: !!onboarding.emergencyContact?.name && !!onboarding.emergencyContact?.phone,
      inline: true,
    },
  ];

  const allDone = steps.every((s) => s.done);

  if (loading) return <div className="min-h-screen bg-surface flex items-center justify-center text-muted text-sm">Loading…</div>;

  if (!applicant) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="max-w-sm bg-card rounded-2xl border border-border-subtle p-6 text-center">
          <h1 className="text-lg font-black text-primary">We can't find your application</h1>
          <p className="text-sm text-muted mt-2">Signed in as {userEmail}. Text the owner and they'll help sort this out.</p>
          <button onClick={() => signOut()} className="mt-4 px-3 py-2 rounded-lg text-xs font-semibold bg-surface-alt text-secondary hover:bg-surface hover:text-primary cursor-pointer inline-flex items-center gap-1.5">
            <LogOut size={12} /> Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 text-[10px] font-black uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                Trial
              </span>
              <span className="text-[10px] text-muted font-semibold">Not yet employed</span>
            </div>
            <h1 className="text-2xl font-black text-primary mt-1.5">Welcome, {firstName || 'there'}</h1>
          </div>
          <button onClick={() => signOut()} className="text-xs text-muted hover:text-primary cursor-pointer inline-flex items-center gap-1"><LogOut size={12} /> Sign out</button>
        </div>

        {/* Role + pay card */}
        {(onboarding.trialRole || onboarding.trialPayRate) && (
          <div className="grid grid-cols-2 gap-3 mb-5">
            {onboarding.trialRole && (
              <div className="bg-card rounded-2xl border border-border-subtle p-5">
                <p className="text-[10px] text-muted font-bold uppercase tracking-widest">Your Role</p>
                <p className="text-2xl font-black text-primary mt-1.5">{onboarding.trialRole}</p>
              </div>
            )}
            {onboarding.trialPayRate && (
              <div className="bg-card rounded-2xl border border-border-subtle p-5">
                <p className="text-[10px] text-muted font-bold uppercase tracking-widest">Hourly Pay</p>
                <p className="text-2xl font-black text-brand-text mt-1.5">${Number(onboarding.trialPayRate).toFixed(2)}<span className="text-base text-muted font-bold">/hr</span></p>
              </div>
            )}
          </div>
        )}

        {/* How you'll be evaluated during the trial — with progress under it */}
        {trialRangeLabel && (
          <div className="bg-card rounded-2xl border border-cyan-500/30 p-5 mb-5">
            <p className="text-[11px] font-black text-cyan-400 uppercase tracking-widest">Your trial · {trialRangeLabel}</p>
            <p className="text-sm font-bold text-primary mt-3">Here's how we'll evaluate you every day</p>
            <p className="text-xs text-muted mt-1 leading-relaxed">Nail these and you're in. This isn't about being perfect — it's about showing up, listening, and getting better each day.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
              {[
                { label: 'Reliability', desc: 'Show up on time, every day. Do what you say you\'ll do.' },
                { label: 'Attitude', desc: 'Positive, professional, team-first. No drama.' },
                { label: 'Teachability', desc: 'Take feedback well and use it to get better — we have a way we do things.' },
                { label: 'Initiative', desc: 'See something that needs doing? Do it. Don\'t wait to be asked.' },
                { label: 'Respect', desc: 'Respect the team, the clients, the equipment, the property.' },
              ].map((c) => (
                <div key={c.label} className="bg-surface-alt rounded-lg p-3">
                  <p className="text-xs font-black text-primary">{c.label}</p>
                  <p className="text-[11px] text-muted mt-0.5 leading-relaxed">{c.desc}</p>
                </div>
              ))}
            </div>
            {/* Progress */}
            <div className="mt-5 pt-4 border-t border-cyan-500/15">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-primary">Onboarding · {steps.filter((s) => s.done).length} of {steps.length} complete</p>
                {allDone && <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">All set</span>}
              </div>
              <div className="w-full h-2 rounded-full bg-surface-alt overflow-hidden">
                <div className="h-full bg-brand transition-all duration-500" style={{ width: `${(steps.filter((s) => s.done).length / steps.length) * 100}%` }} />
              </div>
              {allDone && trialStart && (
                <p className="text-sm text-secondary mt-3">You're good to go. See you {fmtTrialDate(trialStart)}.</p>
              )}
            </div>
          </div>
        )}

        {/* Steps */}
        <div className="space-y-3">
          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={step.id} className={`bg-card rounded-2xl border transition-colors ${step.done ? 'border-emerald-500/30' : 'border-border-subtle'}`}>
                <div className="p-5">
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center ${step.done ? 'bg-emerald-500 text-black' : 'bg-surface-alt text-muted'}`}>
                      {step.done ? <Check size={16} /> : <span className="text-sm font-black">{i + 1}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-primary flex items-center gap-2">
                        <Icon size={14} className="text-muted" />
                        {step.label}
                      </p>
                      <p className="text-xs text-muted mt-1 leading-relaxed">{step.description}</p>

                      {step.id === 'emergency' ? (
                        <div className="mt-3 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <input value={emergency.name} onChange={(e) => setEmergency({ ...emergency, name: e.target.value })} placeholder="Their name"
                              className="bg-surface-alt rounded-lg px-3 py-2 text-sm text-primary placeholder:text-placeholder-muted focus:outline-none focus:ring-1 focus:ring-border-default" />
                            <input value={emergency.phone} onChange={(e) => setEmergency({ ...emergency, phone: e.target.value })} placeholder="Phone"
                              className="bg-surface-alt rounded-lg px-3 py-2 text-sm text-primary placeholder:text-placeholder-muted focus:outline-none focus:ring-1 focus:ring-border-default" />
                          </div>
                          <input value={emergency.relation} onChange={(e) => setEmergency({ ...emergency, relation: e.target.value })} placeholder="Relationship (mom, spouse, friend, etc.)"
                            className="w-full bg-surface-alt rounded-lg px-3 py-2 text-sm text-primary placeholder:text-placeholder-muted focus:outline-none focus:ring-1 focus:ring-border-default" />
                          <button onClick={saveEmergency} disabled={!emergency.name || !emergency.phone}
                            className="px-3 py-2 rounded-lg text-xs font-bold bg-brand text-on-brand hover:bg-brand-hover cursor-pointer disabled:opacity-50">
                            {saved ? 'Saved!' : 'Save emergency contact'}
                          </button>
                        </div>
                      ) : step.action ? (
                        <div className="mt-3">
                          <button onClick={step.action}
                            className={`px-3 py-2 rounded-lg text-xs font-bold cursor-pointer inline-flex items-center gap-1.5 ${step.done ? 'bg-surface-alt text-muted hover:text-primary' : 'bg-brand text-on-brand hover:bg-brand-hover'}`}>
                            {step.actionLabel}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 text-center">
          <p className="text-[11px] text-muted">Questions? Text the owner — we'll get you sorted.</p>
        </div>
      </div>

      {/* Agreement signing modal */}
      {showSigning && (
        <SigningErrorBoundary onClose={() => setShowSigning(false)}>
          <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center text-muted text-sm">Loading…</div>}>
            <AgreementSigningFlow
              onClose={() => setShowSigning(false)}
              onComplete={handleSigned}
              memberName={applicant.data?.name || ''}
              memberEmail={userEmail}
              configOverride={config}
              roles={(rolesData && rolesData.items && rolesData.items.length > 0) ? rolesData.items : DEFAULT_ROLES}
              myRoleName={onboarding.trialRole || ''}
            />
          </Suspense>
        </SigningErrorBoundary>
      )}
    </div>
  );
}
