// GHL API proxy — send SMS to contacts
const GHL_BASE = 'https://rest.gohighlevel.com/v1';

function getApiKey() {
  return process.env.GHL_API_KEY;
}

async function ghlFetch(path, options = {}) {
  const key = getApiKey();
  if (!key) throw new Error('GHL_API_KEY not set');
  const res = await fetch(`${GHL_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL ${res.status}: ${text}`);
  }
  return res.json();
}

// Search for a contact by name or phone
async function findContact(name) {
  const data = await ghlFetch(`/contacts/lookup?phone=&email=&name=${encodeURIComponent(name)}`);
  return data.contacts?.[0] || null;
}

// Search contacts by query
async function searchContacts(query, limit = 20) {
  const data = await ghlFetch(`/contacts/?query=${encodeURIComponent(query)}&limit=${limit}`);
  return data.contacts || [];
}

// Tag a contact to trigger a GHL workflow + save the message as a note
async function tagAndMessage(contactId, tag, message) {
  // Add tag to trigger workflow
  await ghlFetch(`/contacts/${contactId}/`, {
    method: 'PUT',
    body: JSON.stringify({ tags: [tag] }),
  });
  // Save message as a note so the workflow can use it
  await ghlFetch(`/contacts/${contactId}/notes/`, {
    method: 'POST',
    body: JSON.stringify({ body: `[AUTO] ${message}` }),
  });
  return { success: true };
}

export default async function handler(req, res) {
  try {
    const { action } = req.query;

    if (action === 'send-sms') {
      const { contactId, message } = req.body || {};
      if (!contactId || !message) return res.status(400).json({ error: 'contactId and message required' });
      const result = await sendSMS(contactId, message);
      return res.json(result);
    }

    if (action === 'send-bulk-sms') {
      const { clients, message } = req.body || {};
      if (!clients?.length || !message) return res.status(400).json({ error: 'clients array and message required' });

      const results = [];
      for (const client of clients) {
        try {
          // Find contact in GHL — try full name, then first name, then last name
          let contact = null;
          const nameParts = (client.name || '').trim().split(/\s+/);
          const firstName = nameParts[0] || '';
          const lastName = nameParts.slice(1).join(' ') || '';

          // Try full name first
          if (client.name) {
            const found = await searchContacts(client.name, 3);
            contact = found[0];
          }
          // Try first + last name separately if full name didn't match
          if (!contact && lastName) {
            const found = await searchContacts(`${firstName} ${lastName}`, 3);
            contact = found[0];
          }
          // Try just last name
          if (!contact && lastName) {
            const found = await searchContacts(lastName, 5);
            // Match by first name in results
            contact = found.find(c => c.firstName?.toLowerCase() === firstName.toLowerCase()) || null;
          }
          // Try just first name
          if (!contact && firstName) {
            const found = await searchContacts(firstName, 5);
            contact = found.find(c => c.lastName?.toLowerCase() === lastName.toLowerCase()) || null;
          }
          // Try phone number
          if (!contact && client.phone) {
            const phone = client.phone.replace(/\D/g, '').slice(-10);
            const found = await searchContacts(phone, 3);
            contact = found[0] || null;
          }
          // Try email
          if (!contact && client.email) {
            const found = await searchContacts(client.email, 1);
            contact = found[0] || null;
          }

          if (!contact) {
            results.push({ name: client.name, status: 'not_found' });
            continue;
          }
          // Personalize message with name + pricing
          const personalizedMsg = message
            .replace(/\[First Name\]/g, contact.firstName || client.name.split(' ')[0])
            .replace(/\[Last Name\]/g, contact.lastName || '')
            .replace(/\[Full Name\]/g, contact.contactName || client.name)
            .replace(/\[Old Rate\]/g, client.oldPrice ? `$${client.oldPrice}` : '')
            .replace(/\[New Rate\]/g, client.newPrice ? `$${client.newPrice}` : '')
            .replace(/\[Effective Date\]/g, client.effectiveDate || '')
            .replace(/\[Date\]/g, client.effectiveDate || '');

          await tagAndMessage(contact.id, 'price-increase', personalizedMsg);
          results.push({ name: client.name, status: 'sent', contactId: contact.id, ghlName: contact.contactName });
          // Small delay between messages to avoid rate limits
          await new Promise(r => setTimeout(r, 200));
        } catch (err) {
          results.push({ name: client.name, status: 'error', error: err.message });
        }
      }
      return res.json({ sent: results.filter(r => r.status === 'sent').length, total: clients.length, results });
    }

    if (action === 'search') {
      const q = req.query.q || '';
      const contacts = await searchContacts(q);
      return res.json(contacts);
    }

    return res.status(400).json({ error: 'action required: send-sms | send-bulk-sms | search' });
  } catch (err) {
    console.error('[GHL] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
