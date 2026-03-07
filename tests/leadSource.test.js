import { normalizeLeadSource } from '../lib/leadSource.js';

// Lead source normalization tests
const testCases = [
  // Exact matches
  ['Google Business Profile', 'Google Business Profile'],
  ['Website', 'Website'],
  ['Yard Sign', 'Yard Sign'],
  ['Door Hanger', 'Door Hanger'],
  ['Referral (Client)', 'Referral (Client)'],
  ['Reactivation', 'Reactivation'],
  ['Facebook', 'Facebook'],
  ['Other', 'Other'],

  // Aliases (case-insensitive)
  ['google', 'Google Business Profile'],
  ['GBP', 'Google Business Profile'],
  ['Google Maps', 'Google Business Profile'],
  ['google my business', 'Google Business Profile'],
  ['GMB', 'Google Business Profile'],
  ['web', 'Website'],
  ['landing page', 'Website'],
  ['yard sign', 'Yard Sign'],
  ['yardsign', 'Yard Sign'],
  ['door hanger', 'Door Hanger'],
  ['doorhanger', 'Door Hanger'],
  ['flyer', 'Door Hanger'],
  ['referral', 'Referral (Client)'],
  ['client referral', 'Referral (Client)'],
  ['word of mouth', 'Referral (Client)'],
  ['win-back', 'Reactivation'],
  ['fb', 'Facebook'],
  ['Facebook Ads', 'Facebook'],
  ['instagram', 'Facebook'],
  ['meta', 'Facebook'],

  // Unknown values map to Other
  ['Billboard', 'Other'],
  ['TV', 'Other'],
  ['Radio', 'Other'],
  ['random thing', 'Other'],

  // Edge cases
  [null, 'Other'],
  [undefined, 'Other'],
  ['', 'Other'],
  ['  google  ', 'Google Business Profile'], // trimmed
];

let passed = 0;
let failed = 0;

for (const [input, expected] of testCases) {
  const result = normalizeLeadSource(input);
  if (result === expected) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: normalizeLeadSource(${JSON.stringify(input)}) = ${JSON.stringify(result)}, expected ${JSON.stringify(expected)}`);
  }
}

console.log(`\nLead source normalization: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);
if (failed > 0) process.exit(1);
