export const DEFAULT_AGREEMENT_VERSION = '2.1';
export const DEFAULT_AGREEMENT_DATE = '2026-04-10';

// Single source of truth for "which agreement version does the team need right now?"
// Used at both sign-time and check-time so a signature always matches the required version.
export function getCurrentAgreementVersion(storedConfig) {
  const storedVer = parseFloat(storedConfig?.version || '0');
  const defaultVer = parseFloat(DEFAULT_AGREEMENT_VERSION || '0');
  return storedVer >= defaultVer ? (storedConfig.version || DEFAULT_AGREEMENT_VERSION) : DEFAULT_AGREEMENT_VERSION;
}

export function getCurrentAgreementConfig(storedConfig, defaultSections, defaultFinalText) {
  const storedVer = parseFloat(storedConfig?.version || '0');
  const defaultVer = parseFloat(DEFAULT_AGREEMENT_VERSION || '0');
  if (storedConfig?.sections && storedVer >= defaultVer) return storedConfig;
  return { version: DEFAULT_AGREEMENT_VERSION, sections: defaultSections, finalText: defaultFinalText };
}

export const AGREEMENT_SECTIONS = [
  {
    id: 'values',
    title: 'Who We Are',
    body: `<p>These are the values we live by.</p>
<p><strong>Trust in God · Own the Outcome · Set the Standard · Discipline is Freedom · No Shortcuts, No Excuses · Integrity Always · Win as a Team · Over-Deliver for Clients · Keep Your Word · Never Quit</strong></p>
<p>Our goal is to deliver the best lawn care experience in Rock Hill - for every single client, every single time. No missed spots, no confusion, no cutting corners. When we pull up to a property, the client should feel taken care of from start to finish. That's the standard we hold ourselves to.</p>`,
  },
  {
    id: 'accountability',
    title: 'How Accountability Works',
    body: `<p><strong>⚡ = Strike &nbsp;&nbsp;&nbsp; 🚫 = Fired &nbsp;&nbsp;&nbsp; 💰 = Bonus Removed</strong></p>
<p>We use a <strong>rolling 30-day</strong> system. Strikes expire after 30 days, but the record stays on file.</p>
<p><strong>Strike 1</strong> - Warning<br/>
<strong>Strike 2</strong> - Final Warning<br/>
<strong>Strike 3</strong> - You're let go</p>

<p><strong>What Gets You a Strike ⚡</strong><br/>
Late without approval · Missing uniform or eye protection · Not following the playbook · Sloppy work · Disrespect or attitude · Personal phone use · Reckless equipment use · Failing to report damage · Ignoring safety rules · Substance violations · Vehicle violations</p>

<p><strong>Immediate Termination 🚫</strong><br/>
Theft · Violence or threats · Falsifying time records · Showing up under the influence · Clocking in/out for someone else · Anything that puts someone's safety at serious risk</p>

<p><strong>Bonus Removed 💰</strong><br/>
Not clocking in/out correctly · Not clocking in/out of jobs · Not completing checklists · Not completing job forms, photos, or closeout steps</p>
<p>Every day is a fresh chance to earn it.</p>`,
  },
  {
    id: 'ontime',
    title: 'On Time',
    body: `<p>Be at the shop by <strong>8:50 AM</strong> ready to work. If you need to arrive late, text management your expected arrival time and get <strong>written approval before 9:00 AM</strong>. If approved, that time becomes your start time for the day - miss it and it's a strike. No approval = strike.</p>
<p><strong>Late after 9:00 without approval = ⚡</strong></p>`,
  },
  {
    id: 'uniform',
    title: 'Uniform',
    body: `<p>Full uniform every day - work pants, belt (tight enough to hold your pants up), boots, and company shirt as the outer layer. Eye protection on every job site, no exceptions. Looking professional isn't optional.</p>
<p><strong>Missing any part of the uniform or no eye protection = ⚡</strong></p>`,
  },
  {
    id: 'playbook',
    title: 'Playbook',
    body: `<p>Every service has a playbook. Have it open. Follow it - not your own way. The playbook exists so every property gets the same quality no matter who's working it. If the work doesn't match the playbook standard, it's not done.</p>
<p><strong>Not following the playbook standard = ⚡</strong></p>`,
  },
  {
    id: 'conduct',
    title: 'Conduct',
    body: `<p>Be professional with clients and teammates at all times. No attitude. No drama. Take correction, fix mistakes immediately, and move on. We're here to work, not to argue.</p>
<p><strong>Disrespect or attitude = ⚡ &nbsp;&nbsp; Violence or threats = 🚫</strong></p>`,
  },
  {
    id: 'phone',
    title: 'Phone',
    body: `<p>Your phone is a work tool - playbooks, job forms, work communication, and quick music changes. That's it. Save the scrolling and texting for breaks. If it's not work-related, put it away.</p>
<p><strong>Personal phone use on the job = ⚡</strong></p>`,
  },
  {
    id: 'equipment',
    title: 'Equipment',
    body: `<p>Only use equipment you've been trained on. If you're not sure, ask before you touch it. Treat every piece of equipment like you paid for it.</p>
<p><strong>Reckless or unauthorized use = ⚡ or 🚫</strong></p>`,
  },
  {
    id: 'damage',
    title: 'Damage',
    body: `<p>If <strong>anything</strong> gets damaged - company equipment, company vehicles, a client's lawn, fence, mailbox, driveway, sprinkler head, anything at all - you must report it to management <strong>immediately</strong>. Text your manager right away and send photos of the damage. No waiting until end of day. No hoping nobody notices. No hiding it.</p>
<p>Accidents happen. What's not acceptable is hiding them. If we find out about damage you didn't report, that's a much bigger problem than the damage itself. Reporting it fast lets us fix it fast and keep the client's trust.</p>
<p><strong>Failure to report damage immediately with photos = ⚡ or 🚫</strong></p>`,
  },
  {
    id: 'safety',
    title: 'Safety',
    body: `<p>Work carefully around people, cars, and property. If you're not sure about something, stop and ask. Never try to push through a situation that feels unsafe. Report injuries or hazards the second they happen.</p>
<p><strong>Ignoring safety rules = ⚡ or 🚫</strong></p>`,
  },
  {
    id: 'substances',
    title: 'Substances',
    body: `<p>No alcohol, drugs, nicotine, or anything that affects your ability to work. Not on jobs, not in vehicles, not on your person. Zero tolerance.</p>
<p><strong>Violation = ⚡ or 🚫</strong></p>`,
  },
  {
    id: 'vehicles',
    title: 'Vehicles',
    body: `<p>Seatbelts on, always. Drive responsibly - you're representing the company on the road. Report any accidents or damage immediately. Company vehicles are for company use only.</p>
<p><strong>Violation = ⚡ or 🚫</strong></p>`,
  },
  {
    id: 'clients',
    title: 'Clients',
    body: `<p>Never give a client your personal number. All communication goes through the company. Don't promise anything about pricing, scheduling, or extra work - that's not your call to make.</p>`,
  },
  {
    id: 'tracking',
    title: 'Tracking',
    body: `<p>Clock in and out every day. Clock in and out of every job. Complete all checklists, job forms, photos, and closeout steps. This is how we stay organized and how you earn your bonus. Miss any of it and the bonus is gone for that day - no exceptions.</p>
<p><strong>Missing time tracking or closeout steps = 💰</strong></p>
<p><strong>Falsifying time records or clocking in/out for someone else = 🚫</strong></p>`,
  },
  {
    id: 'breaks',
    title: 'Breaks',
    body: `<p>15 minutes or less. Stay near the truck. Be ready to move when it's time.</p>`,
  },
  {
    id: 'timeoff',
    title: 'Time Off',
    body: `<p>Request time off at least <strong>2 weeks in advance</strong>. It's not approved until management confirms it. You get up to <strong>10 workdays off per year</strong> and a max of <strong>5 consecutive days</strong> unless otherwise approved. Additional time off is at management's discretion based on your reliability and coverage. A no-call no-show is treated as voluntary resignation.</p>`,
  },
  {
    id: 'pay',
    title: 'Pay',
    body: `<p>Pay period runs <strong>Sunday through Saturday</strong>. Checks go out every <strong>Tuesday</strong>. Bonuses are daily - you earn them by completing all time tracking, checklists, and job closeout steps. Hours over 40 in a week are overtime and paid at <strong>time and a half</strong>. Pay rate changes are at management's discretion based on how you perform.</p>`,
  },
  {
    id: 'resignation',
    title: 'Resignation & Termination',
    body: `<p>This is at-will employment - either side can end it at any time. If you choose to leave, we expect <strong>2 weeks notice</strong>. Leaving without notice may affect your rehire eligibility and when you get your final pay.</p>`,
  },
  {
    id: 'injuries',
    title: 'Injuries',
    body: `<p>Report every injury immediately, no matter how small. Don't try to tough it out. Notify management the same day. Your health comes first.</p>`,
  },
  {
    id: 'property',
    title: 'Company Property',
    body: `<p>Shirts, equipment, and tools must be returned if you leave. Lost or unreturned items may be deducted from your final pay.</p>`,
  },
  {
    id: 'sign',
    title: '',
    body: `<p><strong>By signing, you confirm you've read and understand everything above, including the 3-strike system.</strong></p>`,
  },
];

export const FINAL_AGREEMENT_TEXT = '';
