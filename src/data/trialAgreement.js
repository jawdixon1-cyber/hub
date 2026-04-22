export const DEFAULT_TRIAL_AGREEMENT_VERSION = '1.0';

export const TRIAL_AGREEMENT_SECTIONS = [
  {
    id: 'what-this-is',
    title: 'What This Is',
    body: `<p>This is a <strong>trial day</strong>. You're coming out to work with us so we can see how you operate, and so you can see if this is the right place for you. It's not a guarantee of a permanent job — it's an evaluation on both sides.</p><p>By signing below, you're acknowledging that you understand what's expected of you during your trial.</p>`,
  },
  {
    id: 'what-we-expect',
    title: 'What We Expect',
    body: `<ul><li><strong>Safety first.</strong> You'll follow all safety rules and PPE requirements. If you don't know how to do something, you'll ask before trying.</li><li><strong>Be on time.</strong> Show up ready to work at the time we gave you. Late = red flag.</li><li><strong>Give effort.</strong> Don't coast. We want to see what you bring.</li><li><strong>Take direction.</strong> We'll show you how we do things. Your job is to follow along and ask when you don't understand.</li><li><strong>Attitude matters.</strong> Be respectful to the team and to clients.</li></ul>`,
  },
  {
    id: 'how-were-grading',
    title: 'How We\'re Grading',
    body: `<p>At the end of the trial, we're evaluating you on:</p><ul><li><strong>Safety</strong> — did you follow the rules, ask questions, stay aware</li><li><strong>Attitude</strong> — were you positive, teachable, respectful</li><li><strong>Effort</strong> — did you give it your all or did you coast</li><li><strong>Coachability</strong> — did you take feedback and apply it</li><li><strong>Skill</strong> — how quickly you picked things up</li></ul>`,
  },
  {
    id: 'pay',
    title: 'Trial Day Pay',
    body: `<p>You'll be paid for your trial day regardless of the outcome. Pay rate and hours will be confirmed in person before we start.</p>`,
  },
  {
    id: 'no-guarantee',
    title: 'No Guarantee',
    body: `<p>A trial day doesn't guarantee a permanent position. At the end of the day, we'll let you know whether we're moving forward, and you'll let us know whether you want to keep going. Either side can say no — that's the whole point of a trial.</p>`,
  },
];

export const TRIAL_AGREEMENT_ACKNOWLEDGMENT = `I have read and understood the expectations for my trial day with Hey Jude's Lawn Care. I agree to show up on time, work safely, give my best effort, and take direction. I understand this is an evaluation and is not a guarantee of permanent employment.`;

export const DEFAULT_TRIAL_DAY_PLAYBOOK = `<h2>When they arrive</h2>
<ul>
  <li>Welcome them. First name basis.</li>
  <li>Quick tour of the truck, trailer, equipment.</li>
  <li>Remind them: today is about showing you fit here, and you seeing if we fit you.</li>
</ul>

<h2>Safety briefing (5 min)</h2>
<ul>
  <li>PPE: eye protection, closed-toe boots, hearing if using blowers/trimmers.</li>
  <li>Hand signals on the crew. Always check behind you before backing up.</li>
  <li>If you don't know, ask — don't guess.</li>
</ul>

<h2>Mid-day check-in</h2>
<ul>
  <li>Ask how they're feeling. Physical + mental.</li>
  <li>Give one piece of honest feedback — one thing they did well, one thing to sharpen.</li>
  <li>Watch how they handle the feedback. This is the coachability test.</li>
</ul>

<h2>End of day</h2>
<ul>
  <li>Walk them through what you saw. Be direct.</li>
  <li>If they're a yes: tell them what's next (standards agreement, payroll, start date).</li>
  <li>If they're a no: be honest, keep it short, thank them.</li>
  <li>Either way: pay them for the day.</li>
</ul>`;
