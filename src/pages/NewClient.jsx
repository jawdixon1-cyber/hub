import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../store/AppStoreContext';
import { ChevronDown, ChevronUp, Plus } from 'lucide-react';

const LEAD_SOURCES = [
  'Google', 'Facebook', 'Instagram', 'Nextdoor', 'Referral', 'Yard Sign',
  'Door Hanger', 'Website', 'Thumbtack', 'Other',
];

function Section({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-3 text-sm font-bold text-primary cursor-pointer hover:text-brand transition-colors">
        {title}
        {open ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />}
      </button>
      {open && <div className="pb-4">{children}</div>}
    </div>
  );
}

export default function NewClient() {
  const { orgId } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [addrSuggestions, setAddrSuggestions] = useState([]);
  const [showAddrSuggestions, setShowAddrSuggestions] = useState(false);
  const addrDebounce = useRef(null);

  // Business location for biasing results (default: Rock Hill, SC area)
  const businessSettings = useAppStore((s) => s.businessSettings);
  const bizLat = businessSettings?.lat || 34.9249;
  const bizLon = businessSettings?.lon || -81.025;

  const searchAddress = (q) => {
    set('street1', q);
    setShowAddrSuggestions(true);
    if (addrDebounce.current) clearTimeout(addrDebounce.current);
    if (!q || q.length < 2) { setAddrSuggestions([]); return; }
    addrDebounce.current = setTimeout(async () => {
      try {
        const bizCity = businessSettings?.city || 'Rock Hill';
        const bizState = businessSettings?.state || 'SC';
        const localQ = `${q}, ${bizCity}, ${bizState}`;
        const viewbox = `${bizLon - 0.3},${bizLat + 0.3},${bizLon + 0.3},${bizLat - 0.3}`;
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=us&limit=6&addressdetails=1&viewbox=${viewbox}&q=${encodeURIComponent(localQ)}`);
        let data = await res.json();
        if (data.length === 0) {
          const res2 = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=us&limit=6&addressdetails=1&q=${encodeURIComponent(q)}`);
          data = await res2.json();
        }
        setAddrSuggestions(data.map(d => {
          const a = d.address || {};
          const houseNum = a.house_number || '';
          const road = a.road || '';
          const street = houseNum ? `${houseNum} ${road}` : road;
          return { display: d.display_name, street, city: a.city || a.town || a.village || a.hamlet || '', state: a.state || '', zip: a.postcode || '' };
        }));
      } catch { setAddrSuggestions([]); }
    }, 400);
  };

  const selectAddrSuggestion = (s) => {
    setForm(p => ({ ...p, street1: s.street, city: s.city, state: s.state, zip: s.zip }));
    setShowAddrSuggestions(false);
    setAddrSuggestions([]);
  };

  const [form, setForm] = useState({
    title: '', first_name: '', last_name: '', company_name: '',
    phone: '', phoneType: 'Main', receives_messages: true, email: '',
    lead_source: '',
    street1: '', street2: '', city: '', state: '', zip: '',
    billing_same: true,
    billing_street: '', billing_street2: '', billing_city: '', billing_state: '', billing_zip: '',
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const formatPhone = (val) => {
    const digits = val.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const handleSave = async (createAnother = false) => {
    if (!orgId || !form.first_name) return;
    setSaving(true);

    const { data: newClient, error } = await supabase.from('clients').insert({
      org_id: orgId,
      first_name: form.first_name || null,
      last_name: form.last_name || null,
      company_name: form.company_name || null,
      phones: form.phone ? [{ number: form.phone, label: form.phoneType || 'Mobile', primary: true }] : [],
      custom_fields: { receives_messages: form.receives_messages, title: form.title || null },
      emails: form.email ? [{ address: form.email, label: 'Main', primary: true }] : [],
      billing_street: form.billing_same ? (form.street1 || null) : (form.billing_street || null),
      billing_city: form.billing_same ? (form.city || null) : (form.billing_city || null),
      billing_state: form.billing_same ? (form.state || null) : (form.billing_state || null),
      billing_zip: form.billing_same ? (form.zip || null) : (form.billing_zip || null),
      lead_source: form.lead_source || null,
    }).select('id').single();

    if (error) {
      console.error('[NewClient] create error:', error.message);
      setSaving(false);
      return;
    }

    if (form.street1 || form.city) {
      await supabase.from('properties').insert({
        org_id: orgId, client_id: newClient.id, label: 'Primary',
        street: form.street1 || null, city: form.city || null,
        state: form.state || null, zip: form.zip || null,
      });
    }

    setSaving(false);
    if (createAnother) {
      setForm({
        title: '', first_name: '', last_name: '', company_name: '',
        phone: '', email: '', lead_source: '',
        street1: '', street2: '', city: '', state: '', zip: '',
        billing_same: true, billing_street: '', billing_street2: '', billing_city: '', billing_state: '', billing_zip: '',
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
          {/* Primary contact details */}
          <div>
            <h2 className="text-sm font-bold text-primary mb-1">Primary contact details</h2>
            <p className="text-xs text-muted mb-4">Provide the main point of contact to ensure smooth communication and reliable client records.</p>
            <div className="rounded-lg border border-border-subtle overflow-hidden">
              <div className="grid grid-cols-[100px_1fr_1fr]">
                <select value={form.title} onChange={e => set('title', e.target.value)}
                  className="px-3 py-2.5 bg-surface-alt text-sm text-primary focus:outline-none border-r border-border-subtle">
                  <option value="">No title</option>
                  <option>Mr.</option><option>Ms.</option><option>Mrs.</option><option>Miss.</option><option>Dr.</option>
                </select>
                <input value={form.first_name} onChange={e => set('first_name', e.target.value)} placeholder="First name"
                  className="px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none border-r border-border-subtle" />
                <input value={form.last_name} onChange={e => set('last_name', e.target.value)} placeholder="Last name"
                  className="px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none" />
              </div>
              <input value={form.company_name} onChange={e => set('company_name', e.target.value)} placeholder="Company name"
                className="w-full px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none border-t border-border-subtle" />
            </div>
          </div>

          {/* Communication */}
          <div>
            <h2 className="text-sm font-bold text-primary mb-3">Communication</h2>
            <div className="rounded-lg border border-border-subtle overflow-hidden">
              <div className="flex">
                <input value={form.phone} onChange={e => set('phone', formatPhone(e.target.value))} type="tel" placeholder="Phone number"
                  className="flex-1 px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none" />
                <select value={form.phoneType} onChange={e => set('phoneType', e.target.value)}
                  className="px-3 py-2.5 bg-surface-alt text-sm text-primary focus:outline-none border-l border-border-subtle">
                  <option>Mobile</option><option>Main</option><option>Work</option><option>Home</option><option>Fax</option><option>Other</option>
                </select>
              </div>
              {form.phone && (
                <div className="flex items-center justify-between px-3 py-2 border-t border-border-subtle bg-surface-alt">
                  <span className="text-[11px] font-medium text-secondary">Receives messages</span>
                  <button type="button" onClick={() => set('receives_messages', !form.receives_messages)}
                    className={`relative w-10 h-[22px] rounded-full transition-colors shrink-0 ${form.receives_messages ? 'bg-brand' : 'bg-zinc-600'}`}>
                    <span className={`absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-white shadow transition-transform ${form.receives_messages ? 'translate-x-[18px]' : 'translate-x-0'}`} />
                  </button>
                </div>
              )}
              <input value={form.email} onChange={e => set('email', e.target.value)} type="email" placeholder="Email"
                className="w-full px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none border-t border-border-subtle" />
            </div>
          </div>

          {/* Lead information */}
          <div>
            <h2 className="text-sm font-bold text-primary mb-3">Lead information</h2>
            <select value={form.lead_source} onChange={e => set('lead_source', e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-surface-alt border border-border-subtle text-sm text-primary focus:outline-none">
              <option value="">Lead source</option>
              {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Property address */}
          <div className="border-t border-border-subtle pt-6">
            <h2 className="text-sm font-bold text-primary mb-1">Property address</h2>
            <p className="text-xs text-muted mb-4">Enter the primary service address, editing or new additional locations where you will be providing services.</p>
            <div className="rounded-lg border border-border-subtle overflow-hidden relative">
              <input value={form.street1} onChange={e => searchAddress(e.target.value)} onBlur={() => setTimeout(() => setShowAddrSuggestions(false), 200)} placeholder="Street 1" autoComplete="none"
                className="w-full px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none" />
              {showAddrSuggestions && addrSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-[42px] z-50 bg-card border border-border-subtle rounded-lg shadow-xl max-h-48 overflow-y-auto">
                  {addrSuggestions.map((s, i) => (
                    <button key={i} onClick={() => selectAddrSuggestion(s)}
                      className="w-full px-3 py-2.5 text-left text-xs text-secondary hover:bg-surface-alt hover:text-primary cursor-pointer border-b border-border-subtle/30 last:border-0">
                      {s.display}
                    </button>
                  ))}
                </div>
              )}
              <input value={form.street2} onChange={e => set('street2', e.target.value)} placeholder="Street 2"
                className="w-full px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none border-t border-border-subtle" />
              <div className="grid grid-cols-2 border-t border-border-subtle">
                <input value={form.city} onChange={e => set('city', e.target.value)} placeholder="City"
                  className="px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none border-r border-border-subtle" />
                <input value={form.state} onChange={e => set('state', e.target.value)} placeholder="State"
                  className="px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 border-t border-border-subtle">
                <input value={form.zip} onChange={e => set('zip', e.target.value)} placeholder="ZIP code"
                  className="px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none border-r border-border-subtle" />
                <select className="px-3 py-2.5 bg-surface-alt text-sm text-primary focus:outline-none">
                  <option>United States</option><option>Canada</option>
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 mt-3 cursor-pointer">
              <input type="checkbox" checked={form.billing_same} onChange={e => set('billing_same', e.target.checked)}
                className="w-4 h-4 rounded border-border-subtle accent-brand" />
              <span className="text-xs font-medium text-secondary">Billing address is the same as property address</span>
            </label>
            {!form.billing_same && (
              <div className="mt-3">
                <p className="text-[10px] font-bold text-muted uppercase mb-2">Billing address</p>
                <div className="rounded-lg border border-border-subtle overflow-hidden">
                  <input value={form.billing_street} onChange={e => set('billing_street', e.target.value)} placeholder="Street 1"
                    className="w-full px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none" />
                  <input value={form.billing_street2} onChange={e => set('billing_street2', e.target.value)} placeholder="Street 2"
                    className="w-full px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none border-t border-border-subtle" />
                  <div className="grid grid-cols-2 border-t border-border-subtle">
                    <input value={form.billing_city} onChange={e => set('billing_city', e.target.value)} placeholder="City"
                      className="px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none border-r border-border-subtle" />
                    <input value={form.billing_state} onChange={e => set('billing_state', e.target.value)} placeholder="State"
                      className="px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none" />
                  </div>
                  <div className="grid grid-cols-2 border-t border-border-subtle">
                    <input value={form.billing_zip} onChange={e => set('billing_zip', e.target.value)} placeholder="ZIP code"
                      className="px-3 py-2.5 bg-surface-alt text-sm text-primary placeholder:text-muted focus:outline-none border-r border-border-subtle" />
                    <select className="px-3 py-2.5 bg-surface-alt text-sm text-primary focus:outline-none">
                      <option>United States</option><option>Canada</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom bar */}
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
