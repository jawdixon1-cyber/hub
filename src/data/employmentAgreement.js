export const DEFAULT_AGREEMENT_VERSION = '1.0';
export const DEFAULT_AGREEMENT_DATE = '2026-03-30';

export const AGREEMENT_SECTIONS = [
  {
    id: 'values',
    title: 'WHO WE ARE',
    body: `<p><strong>At Hey Jude's Lawn Care, these values aren't on a wall — they're how we operate every single day.</strong></p>
<ul>
<li><strong>Trust in God</strong></li>
<li><strong>Own the Outcome</strong> — your work, your responsibility</li>
<li><strong>Set the Standard</strong> — don't wait to be told</li>
<li><strong>Discipline is Freedom</strong></li>
<li><strong>No Shortcuts. No Excuses.</strong></li>
<li><strong>Integrity Always</strong></li>
<li><strong>Win as a Team</strong></li>
<li><strong>Over-Deliver for Clients</strong></li>
<li><strong>Keep Your Word</strong></li>
<li><strong>Never Quit</strong></li>
</ul>`,
  },
  {
    id: 'expectations',
    title: "WHAT'S EXPECTED",
    body: `<p><strong>⚡ = Strike &nbsp;&nbsp; 🚫 = Immediate Termination &nbsp;&nbsp; 💰 = Bonus Removed</strong></p>

<h3>Show Up Ready</h3>
<ul>
<li>Be at the shop by <strong>8:50 AM</strong>. After 9:00 = ⚡</li>
<li>Full uniform every day: work pants, belt, boots, company shirt (outer layer). Missing any = ⚡</li>
<li>Eye protection on every job site — no exceptions. Without them = ⚡</li>
</ul>

<h3>Work the Playbook</h3>
<ul>
<li>Have the correct playbook open while working — follow it, not personal preference. Not using it = ⚡</li>
<li>All work must match playbook quality. Sloppy or incomplete work = ⚡</li>
</ul>

<h3>Conduct & Respect</h3>
<ul>
<li>Professional at all times. No attitude, no disrespect toward clients or teammates = ⚡ or 🚫</li>
<li>Take correction and fix mistakes immediately</li>
<li>No violence, threats, or aggressive behavior = 🚫</li>
</ul>

<h3>Phone</h3>
<p>Allowed only for: playbooks, job forms, work communication, quick music changes, and breaks. Everything else = ⚡</p>

<h3>Equipment</h3>
<ul>
<li>Only use what you're trained on. Ask first if unsure</li>
<li>Treat everything with care. Report damage immediately</li>
<li>Reckless or unauthorized use = ⚡ or 🚫</li>
</ul>

<h3>Safety</h3>
<ul>
<li>Work carefully around people, vehicles, and property</li>
<li>Stop and ask if unsure. Report injuries or unsafe conditions immediately</li>
<li>Ignoring safety rules = ⚡ or 🚫</li>
</ul>

<h3>Substances</h3>
<p>No alcohol, drugs, nicotine, or anything that affects performance — not on jobs, not in vehicles, not on your person while working. Violation = ⚡ or 🚫</p>

<h3>Vehicles</h3>
<ul>
<li>Seatbelts at all times. No reckless driving</li>
<li>Report any accidents or damage immediately</li>
<li>No personal use of company vehicles</li>
<li>Violation = ⚡ or 🚫 depending on severity</li>
</ul>

<h3>Client Communication</h3>
<ul>
<li>Don't give clients your personal number — route everything through the company</li>
<li>Don't make promises about pricing, scheduling, or extra work</li>
</ul>

<h3>Track Everything</h3>
<ul>
<li>Clock in/out of every day and every job</li>
<li>Complete all checklists, job forms, photos, and closeout steps</li>
<li>Miss any of the above = 💰 (no bonus for that day)</li>
<li>Falsifying time records or clocking in/out for someone else = 🚫</li>
</ul>

<h3>Breaks</h3>
<p><strong>15 minutes or less.</strong> Stay near the truck. Be ready to move when it's time.</p>`,
  },
  {
    id: 'accountability',
    title: 'ACCOUNTABILITY',
    body: `<h3>How It Works</h3>
<p>We use a <strong>rolling 30-day</strong> accountability system. Strikes expire after 30 days, but the record stays.</p>

<ul>
<li><strong>Strike 1</strong> — Warning</li>
<li><strong>Strike 2</strong> — Final Warning</li>
<li><strong>Strike 3</strong> — You're let go</li>
</ul>

<p>Every standard marked with ⚡ above earns a strike when violated. It's that simple.</p>

<h3>You Will Be Fired Immediately For</h3>
<ul>
<li>Theft</li>
<li>Violence or threats</li>
<li>Falsifying time records</li>
<li>Showing up under the influence</li>
<li>Clocking in/out for someone else</li>
<li>Anything that puts someone's safety at serious risk</li>
</ul>

<h3>You Will Lose Your Bonus For The Day If</h3>
<ul>
<li>You don't clock in/out correctly</li>
<li>You don't clock in/out of jobs</li>
<li>You don't complete your checklists</li>
<li>You don't complete job forms, photos, or closeout steps</li>
</ul>
<p>No strike — but no bonus either. Every day is a fresh chance to earn it.</p>`,
  },
  {
    id: 'policies',
    title: 'POLICIES',
    body: `<h3>Time Off</h3>
<p>Time off must be requested at least <strong>2 weeks in advance</strong> and is not approved until confirmed by management. Approval depends on schedule and coverage.</p>
<ul>
<li><strong>10 workdays off per year</strong> maximum</li>
<li><strong>5 consecutive workdays</strong> maximum unless otherwise approved</li>
<li>Requests beyond this limit may be denied or require approval as extended unpaid leave</li>
<li>Exceeding limits may affect scheduling priority or continued employment</li>
<li>Additional time off may be approved at management discretion based on notice, reliability, and coverage</li>
<li>No-call no-shows are treated as voluntary resignation</li>
</ul>

<h3>Pay</h3>
<ul>
<li>Pay period is <strong>Sunday – Saturday</strong></li>
<li>Check date is <strong>Tuesday</strong> (weekly)</li>
<li>Bonuses are daily and based on completing all required time tracking, checklists, and job closeout steps</li>
<li>Pay rate changes are at management's discretion based on performance and tenure</li>
</ul>

<h3>Resignation & Termination</h3>
<ul>
<li>Employment is at-will and can be ended by either party at any time</li>
<li><strong>2 weeks notice</strong> is expected if you choose to leave</li>
<li>Leaving without notice may affect your rehire eligibility and final pay timeline</li>
</ul>

<h3>Injuries</h3>
<ul>
<li>Report all injuries immediately — no matter how small</li>
<li>Do not try to work through an injury</li>
<li>Notify management the same day</li>
</ul>

<h3>Company Property</h3>
<p>Company shirts, equipment, and tools must be returned if you leave. Lost or unreturned items may be deducted from your final pay.</p>`,
  },
];

export const FINAL_AGREEMENT_TEXT = `<p><strong>By signing, you confirm:</strong></p>
<ul>
<li>You've read and understand everything above</li>
<li>You agree to follow all standards, rules, and playbooks</li>
<li>You understand the 3-strike system and that repeated strikes lead to termination</li>
<li>You understand that missing time tracking or checklists removes your bonus for the day</li>
<li>You are physically able to perform the work</li>
<li>You understand this is at-will employment</li>
</ul>`;
