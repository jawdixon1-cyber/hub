import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { Check, Circle, LogOut, ExternalLink, FileText, Briefcase, DollarSign } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  AGREEMENT_SECTIONS as DEFAULT_SECTIONS,
  FINAL_AGREEMENT_TEXT as DEFAULT_FINAL_TEXT,
  getCurrentAgreementConfig,
  getCurrentAgreementVersion,
} from '../data/employmentAgreement';

const AgreementSigningFlow = lazy(() => import('../components/AgreementSigningFlow'));

export default function ApplicantOnboarding() {
  const { user, signOut } = useAuth();
  const userEmail = user?.email?.toLowerCase();
  const applicantId = user?.user_metadata?.applicantId;

  const [applications, setApplications] = useState([]);
  const [agreementConfig, setAgreementConfig] = useState(null);
  const [signedAgreements, setSignedAgreements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSigning, setShowSigning] = useState(false);
  const [emergency, setEmergency] = useState({ name: '', phone: '', relation: '' });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('app_state').select('key, value').in('key', ['greenteam-applications', 'greenteam-agreementConfig', 'greenteam-signedAgreements']);
      const map = {};
      for (const r of data || []) map[r.key] = r.value;
      setApplications(map['greenteam-applications'] || []);
      setAgreementConfig(map['greenteam-agreementConfig'] || null);
      setSignedAgreements(map['greenteam-signedAgreements'] || []);
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
  const trialDate = onboarding.trialDate;

  // Load emergency contact if already saved
  useEffect(() => {
    if (onboarding.emergencyContact) setEmergency(onboarding.emergencyContact);
  }, [applicant?.id]);

  const saveOnboarding = async (patch) => {
    if (!applicant) return;
    const updated = applications.map((a) => a.id === applicant.id ? { ...a, onboarding: { ...(a.onboarding || {}), ...patch } } : a);
    setApplications(updated);
    await supabase.from('app_state').upsert({ key: 'greenteam-applications', value: updated, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  };

  const toggleStep = async (stepId) => {
    const cur = onboarding[stepId];
    await saveOnboarding({ [stepId]: cur ? null : { done: true, completedAt: new Date().toISOString() } });
  };

  const handleSigned = async (signed) => {
    const record = { ...signed, memberEmail: userEmail };
    const next = [...signedAgreements, record];
    setSignedAgreements(next);
    await supabase.from('app_state').upsert({ key: 'greenteam-signedAgreements', value: next, updated_at: new Date().toISOString() }, { onConflict: 'key' });
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
      description: 'Read through and sign our team agreement. Covers how we operate, trial period expectations, pay, and everything in between.',
      icon: FileText,
      done: !!mySignature,
      action: () => setShowSigning(true),
      actionLabel: mySignature ? 'View / re-sign' : 'Read + sign',
    },
    {
      id: 'jobber_activated',
      label: 'Activate your Jobber invite',
      description: 'Check your email for an invite from Jobber. Open it and follow the steps to set your password. Jobber is where you clock in and out.',
      icon: Briefcase,
      done: !!onboarding.jobber_activated?.done,
      action: () => toggleStep('jobber_activated'),
      actionLabel: onboarding.jobber_activated?.done ? 'Mark incomplete' : "I've activated it",
    },
    {
      id: 'payroll_complete',
      label: 'Finish your payroll paperwork',
      description: 'Check your email for a payroll signup (from Gusto or similar). Fill out your W-4, I-9, and direct deposit info so you get paid.',
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
            <p className="text-xs text-muted font-semibold uppercase tracking-widest">Onboarding</p>
            <h1 className="text-2xl font-black text-primary mt-1">Welcome, {firstName || 'there'}</h1>
            {trialDate && <p className="text-sm text-muted mt-1">Trial day: {new Date(trialDate + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>}
          </div>
          <button onClick={() => signOut()} className="text-xs text-muted hover:text-primary cursor-pointer inline-flex items-center gap-1"><LogOut size={12} /> Sign out</button>
        </div>

        {/* Progress */}
        <div className="bg-card rounded-2xl border border-border-subtle p-5 mb-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold text-primary">{steps.filter((s) => s.done).length} of {steps.length} complete</p>
            {allDone && <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">All set</span>}
          </div>
          <div className="w-full h-2 rounded-full bg-surface-alt overflow-hidden">
            <div className="h-full bg-brand transition-all duration-500" style={{ width: `${(steps.filter((s) => s.done).length / steps.length) * 100}%` }} />
          </div>
          {allDone && trialDate && (
            <p className="text-sm text-secondary mt-3">You're good to go. See you {new Date(trialDate + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}.</p>
          )}
        </div>

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
                      ) : (
                        <div className="mt-3">
                          <button onClick={step.action}
                            className={`px-3 py-2 rounded-lg text-xs font-bold cursor-pointer inline-flex items-center gap-1.5 ${step.done ? 'bg-surface-alt text-muted hover:text-primary' : 'bg-brand text-on-brand hover:bg-brand-hover'}`}>
                            {step.actionLabel}
                          </button>
                        </div>
                      )}
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
        <Suspense fallback={null}>
          <AgreementSigningFlow
            onClose={() => setShowSigning(false)}
            onComplete={handleSigned}
            memberName={applicant.data?.name || ''}
            memberEmail={userEmail}
          />
        </Suspense>
      )}
    </div>
  );
}
