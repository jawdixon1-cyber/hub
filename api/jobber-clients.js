import { jobberQuery } from '../lib/jobberClient.js';

const SEARCH_CLIENTS_QUERY = `
  query SearchClients($searchTerm: String!) {
    clients(first: 10, searchTerm: $searchTerm) {
      nodes {
        id
        firstName
        lastName
        companyName
        phones { number }
        emails { address }
        billingAddress { street1 street2 city province postalCode }
      }
    }
  }
`;

function formatAddress(addr) {
  if (!addr) return { address: null, city: null, state: null, zip: null };
  const street = [addr.street1, addr.street2].filter(Boolean).join(', ');
  return {
    address: street || null,
    city: addr.city || null,
    state: addr.province || null,
    zip: addr.postalCode || null,
  };
}

export default async function handler(req, res) {
  try {
    const q = (req.query.q || '').trim();
    if (!q) {
      return res.status(400).json({ error: 'q query parameter is required' });
    }

    const data = await jobberQuery(SEARCH_CLIENTS_QUERY, { searchTerm: q });
    const nodes = data.clients?.nodes || [];

    const results = nodes.map(client => {
      const name = [client.firstName, client.lastName].filter(Boolean).join(' ')
        || client.companyName || 'Unknown';

      const addrSource = client.billingAddress;
      const { address, city, state, zip } = formatAddress(addrSource);

      // Safe access for phones/emails — field names may vary
      const phone = client.phones?.[0]?.number
        || client.phoneNumbers?.[0]?.number
        || null;
      const email = client.emails?.[0]?.address
        || client.emailAddresses?.[0]?.address
        || null;

      return {
        id: client.id,
        name,
        phone,
        email,
        address,
        city,
        state,
        zip,
      };
    });

    return res.json(results);
  } catch (err) {
    console.error('[Jobber Clients] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
