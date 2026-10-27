/* The team roster as the Weekly Log sees it: everyone on the Team page
 * (permissions) plus trial hires still in onboarding — same rule as
 * TeamManagement. Email is the stable id; payRate is the hourly rate. */
import { useMemo } from 'react';
import { useAppStore } from '../store/AppStoreContext';

const NONE = {}; const EMPTY = [];

export function useTeamMembers() {
  const permissions = useAppStore((s) => s.permissions) || NONE;
  const setPermissions = useAppStore((s) => s.setPermissions);
  const applications = useAppStore((s) => s.applications) || EMPTY;
  const setApplications = useAppStore((s) => s.setApplications);

  const members = useMemo(() => {
    const real = Object.entries(permissions).map(([email, d]) => ({ id: email.toLowerCase(), email, name: d.name || email, hourly_rate: Number(d.payRate) || 0, active: true, isTrial: false }));
    const seen = new Set(real.map((m) => m.id));
    const trial = applications
      .filter((a) => a.status === 'onboarding' && (a.data?.email || a.onboarding?.loginEmail))
      .map((a) => ({ email: (a.onboarding?.loginEmail || a.data?.email || '').toLowerCase(), a }))
      .filter(({ email }) => email && !seen.has(email))
      .map(({ email, a }) => ({ id: email, email, name: a.data?.name || [a.data?.first_name, a.data?.last_name].filter(Boolean).join(' ') || 'Applicant', hourly_rate: Number(a.onboarding?.trialPayRate || a.onboarding?.payRate) || 0, active: true, isTrial: true, applicantId: a.id }));
    return [...real, ...trial];
  }, [permissions, applications]);

  // Same write path as the Team page's pay-rate editor.
  const setRate = (member, rate) => {
    const value = rate > 0 ? rate : null;
    if (member.isTrial) setApplications(applications.map((a) => (a.id === member.applicantId ? { ...a, onboarding: { ...(a.onboarding || {}), trialPayRate: value } } : a)));
    else setPermissions({ ...permissions, [member.email]: { ...permissions[member.email], payRate: value } });
  };

  return { members, setRate };
}
