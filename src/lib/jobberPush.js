import { supabase } from './supabase';

// Hub → Jobber: after a client is saved in Hub, send the change to Jobber (or create them there).
// Shows a small note at the bottom of the screen with how it went.
export async function pushClientToJobber(clientId) {
  if (!clientId) return null;
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token || '';
  try {
    const r = await fetch('/api/jobber-data?action=client-push', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ clientId }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) note(`Jobber didn't update: ${j.error || r.status}`, true);
    else if (j.created) note('Added to Jobber ✓');
    else if (j.changed) note('Jobber updated ✓');
    return j;
  } catch (e) { note(`Jobber didn't update: ${e.message}`, true); return null; }
}

// Archive / unarchive / delete a client in Hub AND Jobber (Jobber can't delete: it archives there).
export async function clientArchiveOp(clientId, op) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token || '';
  const r = await fetch('/api/jobber-data?action=client-archive', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ clientId, op }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { note(j.error || `Failed (${r.status})`, true); throw new Error(j.error || 'failed'); }
  return j;
}

function note(text, bad) {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = `position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999;padding:8px 14px;border-radius:10px;font:600 13px system-ui;color:#fff;background:${bad ? '#dc2626' : '#111827'};box-shadow:0 6px 20px rgba(0,0,0,.2)`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), bad ? 6000 : 2500);
}
