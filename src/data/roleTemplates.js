export const DEFAULT_ROLES_VERSION = '1.0';

export const DEFAULT_ROLES = [
  {
    id: 'team-member',
    name: 'Team Member',
    body: `<h3>Core responsibilities</h3>
<ul>
<li><strong>Follow the playbooks and standards every time, no shortcuts.</strong> This applies to everyone equally — team members and team lead alike.</li>
<li><strong>Walk the property at the end of every job.</strong> It is everyone's responsibility to look for missed spots, debris, or anything that doesn't meet our standard.</li>
<li><strong>Listen to and follow the team lead.</strong> The team lead runs the crew, period.</li>
</ul>

<h3>What Team Members do NOT do</h3>
<ul>
<li>Talk to clients on-site (only the team lead handles client communication).</li>
</ul>`,
  },
  {
    id: 'team-lead',
    name: 'Team Lead',
    inheritsFrom: 'team-member',
    body: `<h3>On top of every Team Member responsibility, the Team Lead also:</h3>

<ul>
<li><strong>Driver</strong> — operates the company truck and trailer.</li>
<li><strong>Sole client communicator</strong> — the only person on the crew who speaks with clients on-site. Multiple voices create confusion; one consistent point of contact builds trust.</li>
<li><strong>Director of Efficiency</strong> — the team lead's most important job is making sure everyone is following the playbooks and standards. The team lead works alongside the crew and wants to be just as productive, <strong>but</strong> they may pause work to observe, correct a team member, or redirect the crew. When the team lead is working and notices something off, they will correct it on the spot. That's the role.</li>
<li><strong>Has full authority over the crew on-site</strong> — team members listen to the team lead at all times, regardless of whether the owner is there.</li>
</ul>`,
  },
];
