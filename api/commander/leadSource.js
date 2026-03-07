// Canonical lead source enum values
const VALID_SOURCES = [
  'Google Business Profile',
  'Website',
  'Yard Sign',
  'Door Hanger',
  'Referral (Client)',
  'Reactivation',
  'Facebook',
  'Other',
];

// Map of common aliases/variations to canonical names
const SOURCE_ALIASES = {
  'google': 'Google Business Profile',
  'google business': 'Google Business Profile',
  'google business profile': 'Google Business Profile',
  'gbp': 'Google Business Profile',
  'google maps': 'Google Business Profile',
  'google my business': 'Google Business Profile',
  'gmb': 'Google Business Profile',
  'website': 'Website',
  'web': 'Website',
  'site': 'Website',
  'landing page': 'Website',
  'yard sign': 'Yard Sign',
  'yardsign': 'Yard Sign',
  'sign': 'Yard Sign',
  'door hanger': 'Door Hanger',
  'doorhanger': 'Door Hanger',
  'flyer': 'Door Hanger',
  'referral': 'Referral (Client)',
  'referral (client)': 'Referral (Client)',
  'client referral': 'Referral (Client)',
  'word of mouth': 'Referral (Client)',
  'reactivation': 'Reactivation',
  'win-back': 'Reactivation',
  'winback': 'Reactivation',
  'facebook': 'Facebook',
  'fb': 'Facebook',
  'facebook ads': 'Facebook',
  'instagram': 'Facebook',
  'meta': 'Facebook',
};

export function normalizeLeadSource(raw) {
  if (!raw || typeof raw !== 'string') return 'Other';
  const trimmed = raw.trim();

  // Check exact match first
  if (VALID_SOURCES.includes(trimmed)) return trimmed;

  // Check aliases (case-insensitive)
  const lower = trimmed.toLowerCase();
  if (SOURCE_ALIASES[lower]) return SOURCE_ALIASES[lower];

  return 'Other';
}

export { VALID_SOURCES };
