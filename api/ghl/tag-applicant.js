/**
 * POST /api/ghl/tag-applicant
 * Creates or updates a GHL contact and adds a status tag.
 * Used when changing application status (contacted, hired, rejected).
 *
 * Body: { phone, name, email, status }
 * - status: "contacted" | "hired" | "rejected"
 *
 * This adds the tag "applicant-{status}" to the contact in GHL.
 * Set up GHL workflows to trigger SMS on each tag.
 */
const GHL_BASE = 'https://rest.gohighlevel.com/v1';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GHL_API_KEY not configured' });

  const { phone, name, email, status } = req.body || {};
  if (!phone || !status) return res.status(400).json({ error: 'phone and status required' });

  const tag = `applicant-${status}`;
  const allTags = ['applicant', tag];
  // Remove conflicting status tags
  const statusTags = ['applicant-contacted', 'applicant-hired', 'applicant-rejected'];

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  try {
    // Search for existing contact by phone
    const searchRes = await fetch(`${GHL_BASE}/contacts/lookup?phone=${encodeURIComponent(phone)}`, { headers });
    const searchData = await searchRes.json();
    const existingContact = searchData?.contacts?.[0];

    if (existingContact) {
      // Update existing contact: remove old status tags, add new one
      const currentTags = existingContact.tags || [];
      const cleanedTags = currentTags.filter((t) => !statusTags.includes(t));
      const newTags = [...new Set([...cleanedTags, ...allTags])];

      const updateRes = await fetch(`${GHL_BASE}/contacts/${existingContact.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ tags: newTags }),
      });
      const updateData = await updateRes.json();

      console.log(`[GHL] Updated contact ${existingContact.id} with tag: ${tag}`);
      return res.status(200).json({ success: true, contactId: existingContact.id, tag });
    } else {
      // Create new contact
      const [firstName, ...lastParts] = (name || 'Applicant').split(' ');
      const lastName = lastParts.join(' ') || '';

      const createRes = await fetch(`${GHL_BASE}/contacts/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          phone,
          firstName,
          lastName,
          email: email || undefined,
          tags: allTags,
          source: 'hub-application',
        }),
      });
      const createData = await createRes.json();
      const contactId = createData?.contact?.id;

      console.log(`[GHL] Created contact ${contactId} with tag: ${tag}`);
      return res.status(201).json({ success: true, contactId, tag });
    }
  } catch (err) {
    console.error('[GHL] Error:', err);
    return res.status(500).json({ error: 'Failed to update GHL contact' });
  }
}
