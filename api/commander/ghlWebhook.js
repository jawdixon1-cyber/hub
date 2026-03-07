import { Router } from 'express';
import { getSupabaseAdmin } from '../../lib/supabaseAdmin.js';
import { normalizeLeadSource } from '../../lib/leadSource.js';

const router = Router();

// POST /api/webhooks/ghl/lead
router.post('/lead', async (req, res) => {
  // Verify shared secret
  const secret = process.env.GHL_WEBHOOK_SECRET;
  if (secret) {
    const provided = req.headers['x-ghl-secret'] || req.query.secret;
    if (provided !== secret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const {
      ghl_contact_id,
      ghl_opportunity_id,
      name,
      phone,
      email,
      address,
      lead_source,
      lead_source_detail,
      created_at,
    } = req.body;

    if (!ghl_contact_id && !phone && !email) {
      return res.status(400).json({ error: 'Must provide ghl_contact_id, phone, or email' });
    }

    const db = getSupabaseAdmin();
    const normalizedSource = normalizeLeadSource(lead_source);

    // Upsert contact: match by ghl_contact_id first, then phone, then email
    let contact = null;

    if (ghl_contact_id) {
      const { data } = await db
        .from('contacts')
        .select('*')
        .eq('ghl_contact_id', ghl_contact_id)
        .maybeSingle();
      contact = data;
    }

    if (!contact && phone) {
      const cleanPhone = phone.replace(/\D/g, '').slice(-10);
      const { data } = await db
        .from('contacts')
        .select('*')
        .like('phone', `%${cleanPhone}`)
        .maybeSingle();
      contact = data;
    }

    if (!contact && email) {
      const { data } = await db
        .from('contacts')
        .select('*')
        .eq('email', email.toLowerCase())
        .maybeSingle();
      contact = data;
    }

    const contactFields = {
      name: name || contact?.name,
      phone: phone || contact?.phone,
      email: email ? email.toLowerCase() : contact?.email,
      ghl_contact_id: ghl_contact_id || contact?.ghl_contact_id,
      updated_at: new Date().toISOString(),
    };

    if (address) {
      contactFields.address_line1 = address.line1 || address.address || contact?.address_line1;
      contactFields.address_city = address.city || contact?.address_city;
      contactFields.address_state = address.state || contact?.address_state;
      contactFields.address_zip = address.zip || address.postal_code || contact?.address_zip;
    }

    if (contact) {
      const { data, error } = await db
        .from('contacts')
        .update(contactFields)
        .eq('id', contact.id)
        .select()
        .single();
      if (error) throw error;
      contact = data;
    } else {
      const { data, error } = await db
        .from('contacts')
        .insert(contactFields)
        .select()
        .single();
      if (error) throw error;
      contact = data;
    }

    // Insert lead
    const { error: leadError } = await db.from('leads').insert({
      contact_id: contact.id,
      source: normalizedSource,
      source_detail: lead_source_detail || null,
      ghl_opportunity_id: ghl_opportunity_id || null,
      ghl_contact_id: ghl_contact_id || null,
      status: 'Lead',
      created_at: created_at || new Date().toISOString(),
    });

    if (leadError) throw leadError;

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[GHL Webhook] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
