import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';

const LEAD_SOURCES = [
  'Google', 'Facebook', 'Instagram', 'Nextdoor', 'Referral', 'Yard Sign',
  'Door Hanger', 'Website', 'Thumbtack', 'Other',
];

function Section({ title, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border-subtle rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-surface-alt/30 text-sm font-bold text-primary cursor-pointer hover:bg-surface-alt/50 transition-colors">
        {title}
        {open ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />}
      </button>
      {open && <div className="p-5 space-y-4">{children}</div>}
    </div>
  );
}

export default function NewClient() {
  const { orgId } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    title: '', first_name: '', last_name: '', company_name: '',
    phone: '', email: '',
    lead_source: '',
    is_lead: false, notes: '',
    // Property
    street1: '', street2: '', city: '', state: '', zip: '',
    billing_same: true,
    billing_street: '', billing_city: '', billing_state: '', billing_zip: '',
    // Property details
    lot_size: '', has_dog: false, lockout_gate: false, narrow_gate: false,
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const inputCls = "mt-1 w-full px-3 py-2.5 rounded-lg bg-surface-alt border border-border-subtle text-sm text-primary placeholder:text-muted focus:outline-none focus:border-brand/50";
  const labelCls = "text-[11px] font-bold text-muted uppercase tracking-wider";

  const handleSave = async (createAnother = false) => {
    if (!orgId || !form.first_name) return;
    setSaving(true);

    const { data: newClient, error } = await supabase.from('clients').insert({
      org_id: orgId,
      first_name: form.first_name || null,
      last_name: form.last_name || null,
      company_name: form.company_name || null,
      phones: form.phone ? [{ number: form.phone, label: 'Main', primary: true }] : [],
      emails: form.email ? [{ address: form.email, label: 'Main', primary: true }] : [],
      billing_street: form.billing_same ? (form.street1 || null) : (form.billing_street || null),
      billing_city: form.billing_same ? (form.city || null) : (form.billing_city || null),
      billing_state: form.billing_same ? (form.state || null) : (form.billing_state || null),
      billing_zip: form.billing_same ? (form.zip || null) : (form.billing_zip || null),
      lead_source: form.lead_source || null,
      is_lead: form.is_lead,
      notes: form.notes || null,
    }).select('id').single();

    if (error) {
      console.error('[NewClient] create error:', error.message);
      setSaving(false);
      return;
    }

    // Create property if address provided
    if (form.street1 || form.city) {
      await supabase.from('properties').insert({
        org_id: orgId,
        client_id: newClient.id,
        label: 'Primary',
        street: form.street1 || null,
        city: form.city || null,
        state: form.state || null,
        zip: form.zip || null,
        lot_size_sqft: form.lot_size ? parseInt(form.lot_size) : null,
        notes: [
          form.has_dog ? 'Dog on property' : '',
          form.lockout_gate ? 'Lockout gate' : '',
          form.narrow_gate ? 'Narrow gate' : '',
        ].filter(Boolean).join(', ') || null,
      });
    }

    setSaving(false);
    if (createAnother) {
      setForm({
        title: '', first_name: '', last_name: '', company_name: '',
        phone: '', email: '', lead_source: '', is_lead: false, notes: '',
        street1: '', street2: '', city: '', state: '', zip: '',
        billing_same: true, billing_street: '', billing_city: '', billing_state: '', billing_zip: '',
        lot_size: '', has_dog: false, lockout_gate: false, narrow_gate: false,
      });
    } else {
      navigate('/clients');
    }
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-black text-primary mb-8">New Client</h1>

        <div className="space-y-6">
          {/* ─── Primary Contact Details ─── */}
          <div>
            <h2 className="text-sm font-bold text-primary mb-1">Primary contact details</h2>
            <p className="text-xs text-muted mb-4">Provide the main point of contact to ensure smooth communication and reliable client records.</p>
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="w-24">
                  <label className={labelCls}>Title</label>
                  <select value={form.title} onChange={e => set('title', e.target.value)} className={inputCls}>
                    <option value="">No title</option>
                    <option value="Mr.">Mr.</option>
                    <option value="Mrs.">Mrs.</option>
                    <option value="Ms.">Ms.</option>
                    <option value="Dr.">Dr.</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className={labelCls}>First name</label>
                  <input value={form.first_name} onChange={e => set('first_name', e.target.value)} className={inputCls} placeholder="First name" />
                </div>
                <div className="flex-1">
                  <label className={labelCls}>Last name</label>
                  <input value={form.last_name} onChange={e => set('last_name', e.target.value)} className={inputCls} placeholder="Last name" />
                </div>
              </div>
              <div>
                <label className={labelCls}>Company name</label>
                <input value={form.company_name} onChange={e => set('company_name', e.target.value)} className={inputCls} placeholder="Company name" />
              </div>
            </div>
          </div>

          {/* ─── Communication ─── */}
          <div>
            <h2 className="text-sm font-bold text-primary mb-3">Communication</h2>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Phone number</label>
                <input value={form.phone} onChange={e => set('phone', e.target.value)} type="tel" className={inputCls} placeholder="Phone number" />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input value={form.email} onChange={e => set('email', e.target.value)} type="email" className={inputCls} placeholder="Email" />
              </div>
            </div>
          </div>

          {/* ─── Lead Information ─── */}
          <div>
            <h2 className="text-sm font-bold text-primary mb-3">Lead information</h2>
            <div>
              <label className={labelCls}>Lead source</label>
              <select value={form.lead_source} onChange={e => set('lead_source', e.target.value)} className={inputCls}>
                <option value="">Lead source</option>
                {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* ─── Additional Client Details (collapsible) ─── */}
          <Section title="Additional client details" defaultOpen={false}>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">Create custom fields to track additional details</span>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-secondary">Dog?</label>
              <button onClick={() => set('has_dog', !form.has_dog)}
                className={`relative w-10 h-5 rounded-full transition-colors ${form.has_dog ? 'bg-brand' : 'bg-surface-alt border border-border-subtle'}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.has_dog ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
              <span className="text-xs text-muted">{form.has_dog ? 'Yes' : 'No'}</span>
            </div>
          </Section>

          {/* ─── Additional Contacts (collapsible) ─── */}
          <Section title="Additional contacts" defaultOpen={false}>
            <p className="text-xs text-muted">For contacts with access to all properties, e.g. someone is billed for maintenance, or property or expense managers for commercial lots.</p>
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand text-brand text-xs font-bold cursor-pointer hover:bg-brand/5">
              <Plus size={14} /> Add Contact
            </button>
          </Section>

          {/* ─── Property Address ─── */}
          <div>
            <h2 className="text-sm font-bold text-primary mb-1">Property address</h2>
            <p className="text-xs text-muted mb-3">Enter the primary service address, editing or new additional locations where you will be providing services.</p>
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand text-on-brand text-xs font-bold cursor-pointer hover:bg-brand-hover mb-4">
              <Plus size={14} /> Add Another Address
            </button>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Street 1</label>
                <input value={form.street1} onChange={e => set('street1', e.target.value)} className={inputCls} placeholder="Street 1" />
              </div>
              <div>
                <label className={labelCls}>Street 2</label>
                <input value={form.street2} onChange={e => set('street2', e.target.value)} className={inputCls} placeholder="Street 2" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>City</label>
                  <input value={form.city} onChange={e => set('city', e.target.value)} className={inputCls} placeholder="City" />
                </div>
                <div>
                  <label className={labelCls}>State</label>
                  <input value={form.state} onChange={e => set('state', e.target.value)} className={inputCls} placeholder="State" />
                </div>
                <div>
                  <label className={labelCls}>ZIP code</label>
                  <input value={form.zip} onChange={e => set('zip', e.target.value)} className={inputCls} placeholder="ZIP code" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold text-secondary cursor-pointer pt-1">
                <input type="checkbox" checked={form.billing_same} onChange={e => set('billing_same', e.target.checked)}
                  className="w-4 h-4 rounded border-border-subtle accent-brand" />
                Billing address is the same as property address
              </label>
              {!form.billing_same && (
                <div className="space-y-3 pl-6 border-l-2 border-brand/30">
                  <p className="text-xs font-bold text-muted">Billing Address</p>
                  <div>
                    <label className={labelCls}>Street</label>
                    <input value={form.billing_street} onChange={e => set('billing_street', e.target.value)} className={inputCls} />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><label className={labelCls}>City</label><input value={form.billing_city} onChange={e => set('billing_city', e.target.value)} className={inputCls} /></div>
                    <div><label className={labelCls}>State</label><input value={form.billing_state} onChange={e => set('billing_state', e.target.value)} className={inputCls} /></div>
                    <div><label className={labelCls}>ZIP</label><input value={form.billing_zip} onChange={e => set('billing_zip', e.target.value)} className={inputCls} /></div>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* ─── Bottom Bar ─── */}
        <div className="flex items-center justify-between mt-8 pt-5 border-t border-border-subtle">
          <button onClick={() => navigate('/clients')}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold text-muted hover:text-primary cursor-pointer border border-border-subtle hover:border-border-strong">
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <button onClick={() => handleSave(true)} disabled={saving || !form.first_name}
              className="px-4 py-2.5 rounded-lg border border-brand text-brand text-sm font-bold cursor-pointer hover:bg-brand/5 disabled:opacity-50">
              Save and Create Another
            </button>
            <button onClick={() => handleSave(false)} disabled={saving || !form.first_name}
              className="px-5 py-2.5 rounded-lg bg-brand text-on-brand text-sm font-bold hover:bg-brand-hover cursor-pointer disabled:opacity-50">
              {saving ? 'Saving...' : 'Save client'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
