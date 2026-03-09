/**
 * GoHighLevel API Service
 * Handles contact search and SMS messaging via GHL Location API.
 */

const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';

function getHeaders() {
  const apiKey = (process.env.GHL_API_KEY || '').trim();
  if (!apiKey) throw new Error('GHL_API_KEY not configured');
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Version: GHL_API_VERSION,
  };
}

function getLocationId() {
  return (process.env.GHL_LOCATION_ID || '').trim();
}

/**
 * Search for a GHL contact by phone number.
 * Returns the first matching contact or null.
 */
export async function findContactByPhone(phone) {
  if (!phone) return null;
  const locationId = getLocationId();
  if (!locationId) throw new Error('GHL_LOCATION_ID not configured');

  // Normalize phone: strip non-digits, ensure +1 prefix
  const digits = phone.replace(/\D/g, '');
  const normalized = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith('1') ? `+${digits}` : `+${digits}`;

  const url = `${GHL_BASE}/contacts/search/duplicate?locationId=${locationId}&number=${encodeURIComponent(normalized)}`;
  const res = await fetch(url, { headers: getHeaders() });

  if (!res.ok) {
    const body = await res.text();
    console.error('[GHL] Contact search failed:', res.status, body.slice(0, 200));
    return null;
  }

  const data = await res.json();
  return data.contact || null;
}

/**
 * Search for a GHL contact by email.
 * Returns the first matching contact or null.
 */
export async function findContactByEmail(email) {
  if (!email) return null;
  const locationId = getLocationId();
  if (!locationId) throw new Error('GHL_LOCATION_ID not configured');

  const url = `${GHL_BASE}/contacts/search/duplicate?locationId=${locationId}&email=${encodeURIComponent(email)}`;
  const res = await fetch(url, { headers: getHeaders() });

  if (!res.ok) {
    const body = await res.text();
    console.error('[GHL] Email search failed:', res.status, body.slice(0, 200));
    return null;
  }

  const data = await res.json();
  return data.contact || null;
}

/**
 * Send an SMS message to a GHL contact.
 * Returns { success, messageId } or { success: false, error }.
 */
export async function sendSMS(contactId, message) {
  if (!contactId || !message) {
    return { success: false, error: 'Missing contactId or message' };
  }

  const url = `${GHL_BASE}/conversations/messages`;
  const body = {
    type: 'SMS',
    contactId,
    message,
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('[GHL] SMS send failed:', res.status, errBody.slice(0, 300));
      return { success: false, error: `GHL ${res.status}: ${errBody.slice(0, 100)}` };
    }

    const data = await res.json();
    return { success: true, messageId: data.messageId || data.id || null };
  } catch (err) {
    console.error('[GHL] SMS send error:', err.message);
    return { success: false, error: err.message };
  }
}
