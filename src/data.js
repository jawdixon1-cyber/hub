export const genId = () => crypto.randomUUID();

export function getActiveRepairs(eq) {
  if (eq.activeRepairs?.length > 0) return eq.activeRepairs;
  if (eq.status === 'needs-repair' && eq.reportedIssue) {
    return [{
      id: eq.id + '-legacy',
      issue: eq.reportedIssue,
      reportedBy: eq.reportedBy,
      reportedDate: eq.reportedDate,
      urgency: eq.urgency || 'critical',
      photo: eq.photo,
    }];
  }
  return [];
}

export const initialAnnouncements = [
  {
    id: '1',
    title: 'Summer Schedule Update',
    message: 'Starting June 1st, we will shift to our summer operating hours. All crews should report by 6:30 AM. Hydration breaks are mandatory every 45 minutes during peak heat. Please review the updated route sheets posted in the break room.',
    priority: 'high',
    date: '2026-01-28',
    postedBy: 'Mike Johnson',
    acknowledgedBy: {},
  },
  {
    id: '2',
    title: 'New Equipment Arriving Friday',
    message: 'We have two new zero-turn mowers and a commercial-grade edger arriving this Friday. Training sessions will be held Saturday morning. All crew leads are expected to attend and will then train their teams the following week.',
    priority: 'normal',
    date: '2026-01-25',
    postedBy: 'Sarah Williams',
    acknowledgedBy: {},
  },
];

export const initialStandards = [
  {
    id: '10',
    title: 'Quality Standards',
    category: 'Quality',
    type: 'standard',
    content: `All lawn care services must meet the following quality benchmarks:\n\n1. Mowing height must be consistent across the entire property, set to the client-specified height or our default of 3 inches.\n2. All edges along sidewalks, driveways, and garden beds must be crisp and clean with no visible overgrowth.\n3. Clippings must be evenly dispersed or bagged per client preference — no clumps left on the lawn.\n4. All debris (sticks, trash, leaves) must be cleared from the work area before departure.\n5. Walkways and driveways must be blown clean of all grass clippings and debris.\n6. Conduct a final walk-around inspection before leaving every property.`,
  },
  {
    id: '11',
    title: 'Safety First',
    category: 'Safety',
    type: 'standard',
    content: `Safety is non-negotiable. Every team member must follow these rules at all times:\n\n1. Wear appropriate PPE: safety glasses, ear protection, steel-toe boots, and gloves when operating equipment.\n2. Never operate equipment you haven't been trained on.\n3. Inspect all equipment before each use — check blades, guards, fuel lines, and safety features.\n4. Maintain a 50-foot safety zone around active mowing equipment when bystanders are present.\n5. Report any equipment malfunction or safety hazard immediately to your crew lead.\n6. Never refuel hot engines. Allow a 5-minute cool-down period.\n7. In case of injury, administer first aid immediately and report to management within 15 minutes.`,
  },
  {
    id: '12',
    title: 'Professionalism Policy',
    category: 'Professionalism',
    type: 'policy',
    content: `Our reputation is built on professionalism. Every interaction reflects on the company:\n\n1. Arrive at every job site on time. If delayed, notify the client and your crew lead immediately.\n2. Wear the company uniform (green polo, khaki pants/shorts) at all times on the job.\n3. Greet clients warmly and address them by name when possible.\n4. Keep all vehicles and equipment clean and organized.\n5. No smoking, loud music, or profanity on client properties.\n6. Take before and after photos of every job for our records.\n7. Leave a door hanger or text notification when the job is complete.`,
  },
];

export const initialGuides = [
  {
    id: '20',
    title: 'Mowing Procedures',
    category: 'Services',
    type: 'service',
    content: '<h2>Step-by-step mowing procedure</h2><ol><li>Walk the property first — identify and remove any obstacles, debris, or hazards.</li><li>Set mower deck to the correct cutting height for the grass type and season.</li><li>Begin mowing the perimeter of the lawn in a clockwise pattern.</li><li>Switch to parallel striping rows for the interior, overlapping each pass by 2-3 inches.</li><li>Alternate mowing direction each visit (north-south one week, east-west the next).</li><li>Reduce speed on slopes and around obstacles.</li><li>After mowing, inspect for missed spots and touch up as needed.</li><li>Blow clippings off all hardscaped surfaces.</li></ol>',
  },
  {
    id: '21',
    title: 'Edging & Trimming Guide',
    category: 'Services',
    type: 'service',
    content: '<h2>Proper edging and trimming technique</h2><ol><li>Edge all sidewalks, driveways, and curbs first using a stick edger.</li><li>Maintain a consistent 90-degree cut angle along all hard edges.</li><li>For garden beds, use a string trimmer held vertically for a clean line.</li><li>Trim around all obstacles: trees, mailboxes, fence posts, utility boxes.</li><li>Use a shield guard when trimming near vehicles, windows, or painted surfaces.</li><li>Avoid trimming too close to tree trunks — maintain a 3-inch buffer to prevent bark damage.</li><li>Sweep or blow all trimmings off walkways and beds when finished.</li></ol>',
  },
  {
    id: '22',
    title: 'Property Cleanup Procedures',
    category: 'Services',
    type: 'service',
    content: '<h2>End-of-job cleanup checklist</h2><ol><li>Blow all grass clippings from driveways, sidewalks, patios, and porches.</li><li>Remove any debris you generated during the service.</li><li>Replace any displaced items (hoses, decorations, furniture) to their original positions.</li><li>Check for and clean up any oil or fuel spills from equipment.</li><li>Inspect the property from the street view — does it look clean and professional?</li><li>Take an "after" photo from the same angle as your "before" photo.</li><li>Lock gates if they were locked upon arrival.</li><li>Note any property concerns (dead patches, pest damage, irrigation issues) in the job log.</li></ol>',
  },
  {
    id: '23',
    title: 'Zero-Turn Mower Operation',
    category: 'Equipment',
    type: 'equipment',
    content: '<h2>Operating the zero-turn mower safely and effectively</h2><ol><li>Perform pre-operation check: tire pressure, oil level, blade condition, fuel level.</li><li>Adjust the seat and mirrors before starting the engine.</li><li>Start on a flat surface with the parking brake engaged.</li><li>Release the parking brake and slowly push both levers forward to move straight.</li><li>To turn: pull back on one lever while pushing the other forward.</li><li>Practice on open ground before working near obstacles or slopes.</li><li><strong>Never operate on slopes greater than 15 degrees.</strong></li><li>Engage blades only when the mower is stationary and at full throttle.</li><li>Disengage blades and reduce speed before turning at row ends.</li></ol>',
  },
  {
    id: '24',
    title: 'Weekly Equipment Maintenance',
    category: 'Equipment',
    type: 'equipment',
    content: '<h2>Weekly maintenance schedule</h2><h3>Monday</h3><ul><li>Sharpen all mower blades</li><li>Check and replace trimmer line</li><li>Inspect edger blades for wear</li></ul><h3>Wednesday</h3><ul><li>Check oil levels on all engines</li><li>Inspect air filters, clean or replace as needed</li><li>Grease all fittings and moving parts</li></ul><h3>Friday</h3><ul><li>Full equipment wash and cleaning</li><li>Inspect all safety guards and shields</li><li>Check fuel system for leaks</li><li>Test all safety switches and kill cords</li><li>Log any items needing repair or replacement</li></ul>',
  },
  {
    id: '25',
    title: 'Trimmer Safety & Maintenance',
    category: 'Equipment',
    type: 'equipment',
    content: '<h2>String trimmer care and safety</h2><ol><li>Always wear safety glasses, ear protection, and long pants when operating.</li><li>Check the trimmer head for cracks or damage before each use.</li><li>Use the correct line diameter for your trimmer model (refer to equipment manual).</li><li>Wind new line tightly and evenly to prevent tangling.</li><li>Clean the air filter after every 10 hours of use.</li><li>Replace spark plugs at the start of each season.</li><li>Store trimmers hanging vertically to prevent fuel leaks.</li><li><strong>Never</strong> run the trimmer at full throttle when not cutting — it wastes fuel and wears the clutch.</li></ol>',
  },
];

export const initialFieldOpsGuides = [
  {
    id: '26',
    title: 'Pre-Job Site Walkthrough',
    category: 'Services',
    type: 'service',
    content: '<h2>Pre-job site assessment procedure</h2><p>Every property gets a walkthrough before a single blade spins. This protects equipment, protects the crew, and sets the tone for a clean job.</p><ol><li>Walk the full perimeter of the turf area. Identify and flag any obstacles: sprinkler heads, pet waste, toys, hoses, landscape lighting.</li><li>Check for storm debris, fallen branches, or rocks that could become projectiles.</li><li>Note any soft or saturated areas — avoid rutting the turf with heavy mowers. If the ground is too wet, skip that zone and flag it for the next visit.</li><li>Identify gate access points and confirm zero-turn fitment. If the gate is under 48\", plan for walk-behind or 36\" stand-on.</li><li>Look for fresh sod, seed, or aeration plugs — adjust mowing height and avoid tight turns on new turf.</li><li>Check for bee/wasp activity near fence lines, eaves, and ground nests before trimming.</li><li>Note any irrigation running or scheduled — coordinate with the client or skip zones as needed.</li><li>Communicate any property changes to the crew lead before starting.</li></ol>',
  },
  {
    id: '27',
    title: 'Daily Route Execution',
    category: 'Services',
    type: 'service',
    content: '<h2>Running an efficient route</h2><p>Time is money on the truck. A tight route means more jobs per day, less fuel, and earlier wrap times.</p><ol><li>Review the full route the night before. Confirm all stops are sequenced geographically — no backtracking.</li><li>Load trucks in reverse job order so the first stop\'s materials are on top and most accessible.</li><li>Target 15 minutes of mobilization time between stops. If drive time exceeds 20 minutes, flag for route optimization.</li><li>Crew lead assigns roles before arrival: mower operator, trimmer/edger, blower/detail. Rotate weekly to cross-train.</li><li>On arrival, mower drops the gate and starts the perimeter while trimmer begins edging hardscapes. Blower stages at the truck.</li><li>Track actual vs. budgeted man-hours per property. If a 0.25-acre residential consistently runs over 45 minutes with a 2-man crew, flag for re-scoping.</li><li>Skip properties only with crew lead + office confirmation. Log the reason (weather, access, client request) in Jobber immediately.</li><li>Fuel up at the end of the route, not the beginning. Morning time is prime production time.</li></ol>',
  },
  {
    id: '28',
    title: 'On-Site Client Protocol',
    category: 'Services',
    type: 'service',
    content: '<h2>Client interaction on the job site</h2><p>Every client touchpoint is a chance to build trust or lose an account. Keep it professional, brief, and service-focused.</p><ol><li>If a client comes outside, shut down equipment before speaking. Never shout over a running mower.</li><li>Greet by name: "Good morning, Mrs. Johnson." If you don\'t know their name, check the Jobber work order.</li><li>If they have a concern or request, write it down. Don\'t rely on memory. Note it in Jobber and relay to the office.</li><li>Never quote pricing on-site. Say: "Great question — I\'ll have the office follow up with a quote for that." Then log it as an upsell lead.</li><li>If damage occurs (broken sprinkler head, nicked siding, etc.), own it immediately. Take a photo, notify the crew lead, and inform the client. Never leave without disclosure.</li><li>Don\'t discuss other clients\' properties, pricing, or schedules.</li><li>Before leaving, do a quick face-to-face if the client is home: "We\'re all wrapped up. Everything look good?" This closes the loop and catches issues early.</li></ol>',
  },
  {
    id: '29',
    title: 'Weather Calls & Rain Delays',
    category: 'Services',
    type: 'service',
    content: '<h2>Making the call on weather days</h2><p>Rain days cost revenue. But mowing soaked turf costs more in callbacks, ruts, and clumped clippings. Here\'s how we make the call.</p><ol><li><strong>Check forecast at 5 AM.</strong> Use a reliable source (Weather.com, local radar). Look at hourly precipitation, not just "chance of rain."</li><li><strong>Light drizzle (under 0.1"/hr):</strong> Roll out. Turf handles it, and clippings disperse fine. Avoid slopes with zero-turns.</li><li><strong>Steady rain (0.1–0.25"/hr):</strong> Delay 2 hours and reassess. If it clears, start the route. If not, push to the next available day.</li><li><strong>Heavy rain or thunderstorms:</strong> Stand down. No exceptions. Lightning is a crew safety issue — period.</li><li><strong>Post-rain:</strong> Wait until turf passes the boot test — step on the lawn, and if your boot leaves a visible impression, it\'s too soft. Give it another hour.</li><li>When pushing a day, update Jobber immediately and notify affected clients via GHL text blast.</li><li><strong>Heat protocol:</strong> Above 95°F, enforce mandatory 15-minute shade/water breaks every 45 minutes. Watch for heat exhaustion signs: dizziness, nausea, confusion. Pull anyone showing symptoms immediately.</li><li>Log all weather delays in Jobber with the reason code. This data informs seasonal scheduling adjustments.</li></ol>',
  },
  {
    id: '30',
    title: 'Job Closeout & QC Walk',
    category: 'Services',
    type: 'service',
    content: '<h2>Closing out a property the right way</h2><p>The last 5 minutes on a property are what the client sees. A sloppy closeout erases an hour of good work.</p><ol><li><strong>Blow-off everything:</strong> All hardscapes — driveway, sidewalks, porches, patios, curb line. No clippings left on concrete. Ever.</li><li><strong>Bed cleanup:</strong> Blow clippings out of mulch beds and off landscape rock. Check for trimmer debris in beds.</li><li><strong>Stripe check:</strong> Stand at the curb and look at the mow pattern. Are the stripes straight and consistent? If not, touch up.</li><li><strong>Edge inspection:</strong> Walk the sidewalk and driveway edges. Look for missed spots, scalloping, or uneven lines.</li><li><strong>Gate and access:</strong> Close all gates. Replace anything you moved — hoses, furniture, decorations, trash cans.</li><li><strong>Before/after photos:</strong> Take the "after" from the same angle as the "before." Upload to Jobber before leaving the property.</li><li><strong>Final curb check:</strong> Stand at the street and look at the property like a client would. Would you be proud to put your name on this? If not, fix it.</li><li>Mark the job complete in Jobber with any notes (turf stress, irrigation issue, client request).</li></ol>',
  },
];

export const initialGMGuides = [
  {
    id: 'gm-standards-playbook',
    title: 'Making Standards Stick',
    category: 'General Manager',
    type: 'gm-people',
    content: '<h2>How to make standards more than words on a screen</h2><p>Having a Standards page in the app is step one. Making your crew actually live those values and responsibilities is the real work. This playbook is your system for turning standards into culture.</p>' +
      '<h2>Make It Part of the Routine</h2><ol>' +
      '<li><strong>Day-one walkthrough:</strong> Every new hire sits down and reads the Standards page together with you on their first day. Don\'t just hand them a phone — walk through each value and each responsibility. Explain <em>why</em> each one matters. <mark>Why: If they don\'t hear it from you directly, it\'s just another screen they\'ll forget.</mark></li>' +
      '<li><strong>Reference by number:</strong> When giving feedback, tie it to a specific responsibility. "Hey, that\'s number 5 — communicate issues immediately." Using the number system makes it fast and clear. <mark>Why: A shared shorthand builds accountability without long lectures.</mark></li>' +
      '<li><strong>Weekly meeting review:</strong> Pick one value or responsibility each week and spend 2 minutes discussing it in your team meeting. Ask: "Who has an example of this from the past week?" <mark>Why: Repetition is how values move from a page into people\'s heads.</mark></li>' +
      '</ol>' +
      '<h2>Tie It to Accountability</h2><ol>' +
      '<li><strong>Use it in corrections:</strong> When someone misses a checklist or doesn\'t log mileage, don\'t make it personal — point to the Standards page. "This is the standard for the seat. It\'s not a surprise." <mark>Why: Making standards black and white removes emotion from accountability conversations.</mark></li>' +
      '<li><strong>Performance check-ins:</strong> In one-on-ones, go through all 5 responsibilities: "How are you doing on each of these?" Let them self-assess first, then share your view. <mark>Why: Self-assessment builds ownership. If they know the standard, they can hold themselves to it.</mark></li>' +
      '<li><strong>Track what you can:</strong> Checklist completion rates, mileage logs, receipt submissions — these are measurable. Review them weekly. If someone is at 60% checklist completion, the conversation is easy: the standard is 100%. <mark>Why: Data removes opinion from performance conversations.</mark></li>' +
      '</ol>' +
      '<h2>Lead with the Values</h2><ol>' +
      '<li><strong>Catch people doing it right:</strong> When someone goes the extra mile, call it out publicly. "That right there — that\'s Go the Extra Mile. That\'s what we\'re about." <mark>Why: Public recognition of values in action is the strongest culture-building tool you have.</mark></li>' +
      '<li><strong>Correct through values, not frustration:</strong> When someone cuts corners, tie it back: "That\'s not Give a Damn. We don\'t leave a property looking like that." <mark>Why: Values-based correction feels like coaching, not criticism. It\'s about the standard, not the person.</mark></li>' +
      '<li><strong>Model it yourself:</strong> If you expect Clean Finish Clean Reset but your truck is a mess, you\'ve lost credibility. Live the values louder than you preach them. <mark>Why: Your crew watches what you do, not what you say.</mark></li>' +
      '</ol>' +
      '<h2>The Repetition Rule</h2><p><strong>Say the values and responsibilities so often that your crew can recite them without looking at the app.</strong> That\'s the benchmark. If you ask a crew member "What are our 3 values?" and they hesitate, you haven\'t said it enough yet.</p>' +
      '<p>Culture isn\'t built in a meeting — it\'s built in the 100 small moments every week where you either reinforce the standard or let it slide. The Standards page gives you the tool. This playbook is how you use it.</p>',
  },
  {
    id: 'gm-weekly-team-meeting',
    title: 'End-of-Week Team Meeting',
    category: 'General Manager',
    type: 'gm-rhythm',
    content: '<h2>A Friday team meeting that closes the week and sets up the next one</h2><p>Friday afternoon, after the last route. 20–30 minutes. The crew is together, the week is fresh, and you can address everything while it\'s still real — not Monday when everyone\'s forgotten. Do your closeout first (see End-of-Week Closeout playbook), then run this meeting with the numbers in hand.</p>' +
      '<h2>Before the Meeting (2 min prep)</h2><ol>' +
      '<li><strong>Have your closeout done:</strong> You should already have the week\'s scorecard numbers, issues list, and next week\'s schedule from your Friday closeout. Don\'t prep during the meeting. <mark>Why: Walking in prepared shows the team you respect their time. It also keeps the meeting tight.</mark></li>' +
      '<li><strong>Review last week\'s to-dos:</strong> Did people do what they said they\'d do? Yes or no. <mark>Why: Accountability starts with follow-through. If to-dos slide, the meeting loses credibility.</mark></li>' +
      '</ol>' +
      '<h2>The Meeting (20–30 min)</h2><ol>' +
      '<li><strong>Wins (3 min):</strong> Start with what went well. Client compliment? Great quality check? Someone go the extra mile? Call it out by name. <mark>Why: Ending the week on wins builds momentum. People want to hear they did good work.</mark></li>' +
      '<li><strong>Scorecard review (5 min):</strong> Hit the numbers from your closeout. Checklist completion, mileage logged, receipts submitted, on-time rate, jobs completed. Just read them — if something\'s off, drop it to the issues list. <mark>Why: Numbers don\'t lie. Reviewing them every Friday makes accountability automatic and gives people a chance to fix it next week.</mark></li>' +
      '<li><strong>To-do review (3 min):</strong> Go through last week\'s to-dos. Done or not done. No stories, no excuses. If it\'s not done, it rolls forward or becomes an issue. <mark>Why: This is where trust is built. People learn that when they say they\'ll do something, it gets checked.</mark></li>' +
      '<li><strong>Issues — IDS (10–15 min):</strong> This is the meat. List every issue from the week, then prioritize: what\'s the #1 issue? <strong>Identify</strong> the root cause, <strong>Discuss</strong> solutions, <strong>Solve</strong> it with a clear to-do and owner. Move to #2. Repeat until time\'s up. <mark>Why: Most meetings waste time on easy stuff. IDS forces you to tackle the hard problems first.</mark></li>' +
      '<li><strong>Next week preview (2 min):</strong> Any schedule changes? Anyone out? Big jobs coming? Give the crew a heads-up so they\'re not surprised Monday morning. <mark>Why: People perform better when they know what\'s coming. No one likes Monday surprises.</mark></li>' +
      '<li><strong>Wrap up (2 min):</strong> Recap new to-dos. Each to-do has an owner and a deadline. "Have a good weekend — see you Monday." End on time. <mark>Why: It\'s Friday. Respect people\'s time. A meeting that runs over on a Friday kills morale fast.</mark></li>' +
      '</ol>' +
      '<h2>Rules</h2><ul>' +
      '<li><strong>Same time every Friday.</strong> Right after the last route comes in. The rhythm is the point — never skip, never move it.</li>' +
      '<li><strong>Start on time.</strong> Don\'t wait for stragglers. They\'ll learn.</li>' +
      '<li><strong>Phones away.</strong> 20 minutes of focus isn\'t too much to ask.</li>' +
      '<li><strong>No tangents.</strong> If it\'s not the #1 issue, drop it to the list for next week.</li>' +
      '<li><strong>End with energy.</strong> This is the last thing your crew hears before the weekend. Make it count.</li>' +
      '</ul>',
  },
  {
    id: 'gm-onboarding-new-hire',
    title: 'Onboarding a New Hire (First 90 Days)',
    category: 'General Manager',
    type: 'gm-people',
    content: '<h2>How to set a new hire up to succeed — or know when to cut</h2><p>The first 90 days determine whether someone becomes a great crew member or a constant problem. Don\'t wing it. Follow the system.</p>' +
      '<h2>Before Day 1</h2><ol>' +
      '<li><strong>Prep their login:</strong> Create their account in the app, set their permissions, and make sure they can access everything they need. <mark>Why: Nothing says "we don\'t have our act together" like fumbling with logins on someone\'s first day.</mark></li>' +
      '<li><strong>Assign a buddy:</strong> Pair them with your best crew member for the first two weeks. Not your most available — your best. <mark>Why: New hires model whoever they work with first. Put them next to your standard-setter.</mark></li>' +
      '<li><strong>Prep the truck:</strong> Uniform ready, gear assigned, truck stocked. They should feel expected, not like an afterthought.</li>' +
      '</ol>' +
      '<h2>Day 1</h2><ol>' +
      '<li><strong>Standards walkthrough:</strong> Sit down together and go through the Standards page in the app. Read every value and every responsibility out loud. Ask them what each one means to them. <mark>Why: This is the most important conversation you\'ll have with them. It sets the tone for everything.</mark></li>' +
      '<li><strong>App tour:</strong> Walk them through the app — checklists, playbooks, mileage, receipts. Show them what they\'ll use every day. Have them complete their first opening checklist with you watching.</li>' +
      '<li><strong>Shadow the buddy:</strong> They ride with their buddy all day. Watch, ask questions, learn the route. No solo work on day one.</li>' +
      '</ol>' +
      '<h2>Week 1</h2><ol>' +
      '<li><strong>Daily check-ins:</strong> 5 minutes at the end of each day. "What went well? What confused you? What do you need?" <mark>Why: Small problems on day 2 become bad habits by week 3 if you don\'t catch them early.</mark></li>' +
      '<li><strong>Playbook training:</strong> Walk through the service playbooks for every service they\'ll perform. Have them do each task while you watch and coach.</li>' +
      '<li><strong>First solo tasks:</strong> By day 3–4, let them handle simple tasks independently while the buddy supervises. Blow-off, trimming, basic mowing.</li>' +
      '</ol>' +
      '<h2>30-Day Check-In</h2><ol>' +
      '<li><strong>Scorecard review:</strong> Pull their checklist completion rate, mileage logging, receipt submissions. Are they hitting the basics? <mark>Why: If someone can\'t consistently do the 5 responsibilities after 30 days, that\'s a red flag — not a training issue.</mark></li>' +
      '<li><strong>Values check:</strong> Go through each core value. Give them a specific example of when they lived it — and if applicable, when they didn\'t. Be direct.</li>' +
      '<li><strong>Ask them:</strong> "Is this what you expected? Are you in?" Their answer tells you a lot. <mark>Why: Some people realize lawn care isn\'t for them. Better to know at 30 days than 90.</mark></li>' +
      '</ol>' +
      '<h2>60-Day Check-In</h2><ol>' +
      '<li><strong>Independence assessment:</strong> Can they run a route stop solo at quality? If not, what\'s missing? Create a specific plan to close the gap.</li>' +
      '<li><strong>Peer feedback:</strong> Ask their buddy and other crew members: "Would you want this person on your truck?" <mark>Why: Your crew knows. If they\'re hesitant, listen.</mark></li>' +
      '</ol>' +
      '<h2>90-Day Decision</h2><ol>' +
      '<li><strong>Right person, right seat?</strong> Do they share your core values (right person)? Can they do the job at the level you need (right seat)? If both answers aren\'t yes, it\'s time to part ways. <mark>Why: Keeping someone who isn\'t a fit past 90 days hurts them, the team, and your business. The kindest thing is honesty.</mark></li>' +
      '<li><strong>If yes:</strong> Celebrate it. Tell them they made it. "You\'re officially part of the team — here\'s what I\'ve seen from you that\'s great, and here\'s where I want to see you grow next."</li>' +
      '<li><strong>If no:</strong> Have the conversation directly. See the "Having Hard Conversations" playbook.</li>' +
      '</ol>',
  },
  {
    id: 'gm-hard-conversations',
    title: 'Having Hard Conversations',
    category: 'General Manager',
    type: 'gm-people',
    content: '<h2>How to give direct feedback, correct underperformance, and let someone go</h2><p>Hard conversations are the price of leadership. Avoiding them doesn\'t make problems go away — it makes them worse and poisons the team. This playbook gives you a framework so you can be direct without being cruel.</p>' +
      '<h2>The 3 Strikes Framework</h2><p>Before you fire anyone, they should have had 3 clear conversations. Not hints. Not passive-aggressive comments. Direct, documented conversations.</p><ol>' +
      '<li><strong>Strike 1 — The coaching conversation:</strong> Pull them aside, same day as the issue. "Hey, I noticed [specific behavior]. The standard is [specific standard — reference the number]. What happened?" Listen. Then: "Here\'s what I need to see going forward. Can you do that?" <mark>Why: Most people will correct course when the standard is made clear. Give them the chance.</mark></li>' +
      '<li><strong>Strike 2 — The formal conversation:</strong> If the behavior repeats, this is a sit-down. "We talked about this on [date]. The standard hasn\'t changed, but the behavior has. This is serious. If it happens again, we\'ll need to part ways. I don\'t want that — do you?" Document this conversation with the date and what was said. <mark>Why: Strike 2 removes all ambiguity. They know exactly where they stand.</mark></li>' +
      '<li><strong>Strike 3 — The exit conversation:</strong> "We\'ve had this conversation twice. The standard hasn\'t been met. Today is your last day." Keep it short, keep it factual, keep it respectful. <mark>Why: By strike 3, both of you know this is coming. Don\'t drag it out.</mark></li>' +
      '</ol>' +
      '<h2>How to Actually Say It</h2><ol>' +
      '<li><strong>Be specific, not general:</strong> "You\'ve been late 3 times this month" — not "You have an attendance problem." <mark>Why: Specific = actionable. General = defensive.</mark></li>' +
      '<li><strong>Use the Standards page:</strong> "Responsibility #4 is show up on time, in uniform, ready to work. That\'s the standard for the seat." <mark>Why: It\'s not your opinion — it\'s the documented standard. This removes emotion from the conversation.</mark></li>' +
      '<li><strong>Ask, don\'t assume:</strong> "What happened?" before "Here\'s what you did wrong." Sometimes there\'s context you don\'t have. <mark>Why: Asking first shows respect and sometimes reveals a real problem you can help solve.</mark></li>' +
      '<li><strong>End with clarity:</strong> "So we\'re aligned — what are you going to do differently starting tomorrow?" Get them to say it back. <mark>Why: If they can\'t articulate the change, they won\'t make it.</mark></li>' +
      '</ol>' +
      '<h2>When to Skip Straight to Firing</h2><ul>' +
      '<li>Theft — gone immediately</li>' +
      '<li>Safety violations that endanger someone — gone immediately</li>' +
      '<li>Dishonesty — lying about work completed, falsifying mileage or receipts — gone immediately</li>' +
      '<li>No-call no-show — one chance, then gone</li>' +
      '</ul>' +
      '<p><mark>Why: Some things aren\'t coachable. Protecting the team\'s trust matters more than giving someone a fourth chance.</mark></p>' +
      '<h2>After a Firing</h2><ol>' +
      '<li><strong>Tell the team the same day.</strong> Keep it simple: "[Name] is no longer with us. I wish them well. Here\'s how we\'re covering their route this week." <mark>Why: If you don\'t address it, the team fills the silence with rumors.</mark></li>' +
      '<li><strong>Don\'t trash them.</strong> Even if they deserved it. Your team is watching how you treat people on the way out — that tells them how you\'ll treat them.</li>' +
      '<li><strong>Reflect:</strong> Did you hire wrong? Did you train enough? Did you have the coaching conversations early enough? Every firing is a lesson for next time.</li>' +
      '</ol>',
  },
  {
    id: 'gm-morning-routine',
    title: 'Morning Execution Routine',
    category: 'General Manager',
    type: 'gm-rhythm',
    content: '<h2>Your daily 30-minute routine to keep operations tight</h2><p>The first 30 minutes of your day set the tone for everything. This isn\'t optional — it\'s the most important half hour in your business. Do it before you check email, before you take calls, before you get pulled into fires.</p>' +
      '<h2>The Routine (30 min)</h2><ol>' +
      '<li><strong>Weather check (2 min):</strong> Check the forecast for today and tomorrow. If rain is likely, decide NOW whether you\'re running routes or making the rain call. Don\'t wait until crews are already rolling. <mark>Why: Late rain calls waste fuel, frustrate crews, and make you look indecisive.</mark></li>' +
      '<li><strong>Review today\'s schedule (5 min):</strong> Open Jobber. Look at every route and every crew assignment. Does the schedule make sense? Any gaps? Any overloaded routes? Any client notes or special requests flagged? <mark>Why: Catching a scheduling problem at 6:30 AM is easy. Catching it at 10 AM when a crew is already behind is chaos.</mark></li>' +
      '<li><strong>Check crew readiness (5 min):</strong> Are all crews accounted for? Anyone call out? If someone\'s out, rework the routes now — not after the remaining crews are already on the road. <mark>Why: One missing crew member can cascade into missed jobs all day if you don\'t adjust immediately.</mark></li>' +
      '<li><strong>Yesterday\'s checklist review (5 min):</strong> Pull up yesterday\'s checklist completion in the app. Who completed opening and closing? Who didn\'t? If someone skipped, send a quick text now: "Hey, noticed your closing checklist wasn\'t completed yesterday. What happened?" <mark>Why: Same-day follow-up sends a clear message: the checklists aren\'t optional. Waiting until the weekly meeting is too late.</mark></li>' +
      '<li><strong>Mileage & receipts check (3 min):</strong> Did yesterday\'s crews log mileage and scan receipts? If not, same thing — quick text. <mark>Why: The longer receipts sit in someone\'s pocket, the more likely they disappear. Same-day accountability keeps the books clean.</mark></li>' +
      '<li><strong>Issues from yesterday (5 min):</strong> Check the app for any flagged issues — equipment problems, client complaints, crew concerns. Prioritize: what needs to be handled before crews roll out today? <mark>Why: Unresolved issues from yesterday become bigger issues today. Kill problems while they\'re small.</mark></li>' +
      '<li><strong>Set your top 3 (5 min):</strong> Write down the 3 most important things you need to accomplish today. Not 10 things — three. If you get these three done, today was a win. <mark>Why: As a GM, everyone will pull at your time. Your top 3 keeps you focused on what actually moves the business forward.</mark></li>' +
      '</ol>' +
      '<h2>Non-Negotiables</h2><ul>' +
      '<li>Do this BEFORE your first phone call or email</li>' +
      '<li>Do it every single day — weekends too during peak season</li>' +
      '<li>If something\'s wrong, handle it NOW. Don\'t add it to a list for later.</li>' +
      '</ul>',
  },
  {
    id: 'gm-weekly-closeout',
    title: 'End-of-Week Closeout',
    category: 'General Manager',
    type: 'gm-rhythm',
    content: '<h2>Your Friday review that feeds Monday\'s meeting</h2><p>The end-of-week closeout is where you turn a week of work into data you can act on. Do this Friday afternoon so you walk into Monday\'s team meeting with clarity, not chaos.</p>' +
      '<h2>The Closeout (30–45 min)</h2><ol>' +
      '<li><strong>Scorecard numbers (10 min):</strong> Pull the week\'s metrics:<ul>' +
      '<li>Checklist completion rate (opening + closing) — target: 100%</li>' +
      '<li>Mileage logged on time — target: 100%</li>' +
      '<li>Receipts scanned same day — target: 100%</li>' +
      '<li>On-time arrival rate — target: 95%+</li>' +
      '<li>Jobs completed vs. scheduled — target: 98%+</li>' +
      '</ul> Write these down. These are the numbers you\'ll review in Monday\'s meeting. <mark>Why: You can\'t manage what you don\'t measure. The scorecard makes performance visible and removes opinion from the conversation.</mark></li>' +
      '<li><strong>Who\'s off track? (5 min):</strong> Look at individual performance. Anyone consistently below standard on checklists, mileage, or receipts? Note their names and the specific numbers. <mark>Why: This is your coaching list for next week. Don\'t wait for it to become a pattern — address it early.</mark></li>' +
      '<li><strong>Issues list (10 min):</strong> Review every issue flagged this week — equipment problems, client complaints, crew conflicts, missed jobs. For each one: Is it resolved? If not, it goes on Monday\'s IDS list. <mark>Why: Unresolved issues stack up. The weekly closeout prevents things from falling through the cracks.</mark></li>' +
      '<li><strong>Client feedback (5 min):</strong> Any complaints or compliments this week? Log them. Complaints become issues. Compliments get shared with the team Monday morning — name the crew member specifically. <mark>Why: Sharing positive client feedback is the easiest way to reinforce good work. Don\'t waste it.</mark></li>' +
      '<li><strong>Cash & receipts reconciliation (5 min):</strong> Do the receipt totals in the app match what was actually spent? Any missing receipts? Any unexplained charges? Flag anything that doesn\'t add up. <mark>Why: Small discrepancies become big problems over time. Friday is when you catch them.</mark></li>' +
      '<li><strong>Next week preview (5 min):</strong> Look at next week\'s schedule. Any unusual jobs? Any crew members out? Any equipment in the shop? Adjust routes now if needed. <mark>Why: Monday morning should be execution, not scrambling. The planning happens Friday.</mark></li>' +
      '</ol>' +
      '<h2>Output</h2><p>When you\'re done, you should have:</p><ul>' +
      '<li>This week\'s scorecard numbers (for Monday\'s meeting)</li>' +
      '<li>A list of people to coach next week</li>' +
      '<li>An issues list for Monday\'s IDS</li>' +
      '<li>Next week\'s schedule confirmed</li>' +
      '</ul>' +
      '<p><strong>If you do the closeout every Friday, Monday\'s meeting runs itself.</strong></p>',
  },
  {
    id: 'gm-sales-door-approach',
    title: 'The Door Knock & Cold Approach',
    category: 'General Manager',
    type: 'gm-sales',
    content: '<h2>How to approach someone cold and walk away with a yes</h2><p>Door knocking and cold approaches are the fastest way to fill your route — if you do it right. Most people fail because they pitch too early. The goal of the first 30 seconds isn\'t to sell. It\'s to not get rejected.</p>' +
      '<h2>Before You Knock</h2><ol>' +
      '<li><strong>Target the right doors:</strong> Look for signs — overgrown lawn, weeds in beds, no fresh mow lines. These people either don\'t have a service or aren\'t happy with the one they have. <mark>Why: Knocking on a perfect lawn is wasted time. Look for pain first.</mark></li>' +
      '<li><strong>Work the neighbor effect:</strong> If you just finished a property that looks great, knock on the neighbors\' doors. "Hey, I just finished up next door at [address]..." <mark>Why: Social proof is the most powerful sales tool. People want what their neighbors have.</mark></li>' +
      '<li><strong>Look the part:</strong> Clean uniform, truck visible from the door, professional appearance. You have 3 seconds before they decide if you\'re trustworthy. <mark>Why: People buy from people they trust. Trust starts with appearance.</mark></li>' +
      '</ol>' +
      '<h2>The Approach (First 30 Seconds)</h2><ol>' +
      '<li><strong>Smile, step back, hands visible:</strong> After you knock, take a step back from the door. Hands out of your pockets. Relaxed posture. <mark>Why: A stranger at the door triggers a threat response. Stepping back and being open with your body language lowers their guard.</mark></li>' +
      '<li><strong>Name and context, not a pitch:</strong> "Hey, I\'m [Name] with Hey Jude\'s — we just finished up at your neighbor\'s place at [address]." That\'s it. Stop talking. <mark>Why: Context before pitch. You\'re not a random salesperson — you\'re the guy who just made the neighbor\'s lawn look great. Let that sink in.</mark></li>' +
      '<li><strong>Compliment or observe, don\'t criticize:</strong> "You\'ve got a really nice property" or "Looks like you\'ve got a big yard to keep up with." Never say "your lawn looks bad." <mark>Why: Nobody buys from someone who insulted them. A compliment opens the conversation. An observation about size or difficulty creates a natural opening for your offer.</mark></li>' +
      '</ol>' +
      '<h2>The Conversation (Not a Pitch)</h2><ol>' +
      '<li><strong>Ask, don\'t tell:</strong> "Are you handling the lawn yourself right now, or do you have someone?" Let them talk. <mark>Why: Questions create engagement. Statements create resistance. The more they talk, the more they sell themselves.</mark></li>' +
      '<li><strong>Find the pain:</strong> If they do it themselves: "That\'s a lot of work — how many hours a week does that take you?" If they have a service: "How\'s that going for you?" <mark>Why: You\'re looking for frustration — time spent, inconsistent quality, unreliable service. That\'s your opening.</mark></li>' +
      '<li><strong>Mirror their pain back:</strong> "Yeah, that\'s what I hear a lot — guys showing up whenever they feel like it." <mark>Why: Mirroring is the most powerful rapport technique. When someone feels understood, they trust you. It\'s psychology — not manipulation, just good listening.</mark></li>' +
      '<li><strong>Offer the easy next step:</strong> "Tell you what — I\'m already in the neighborhood every [day]. Let me put together a quick quote, no obligation. I can have it to you by tonight." <mark>Why: Low commitment, high convenience. You\'re not asking them to sign a contract on the doorstep — just to receive a quote. The barrier is almost zero.</mark></li>' +
      '</ol>' +
      '<h2>Psychology Principles at Work</h2><ul>' +
      '<li><strong>Proximity bias:</strong> "I\'m already in the neighborhood" makes you convenient, not pushy</li>' +
      '<li><strong>Social proof:</strong> "I just finished your neighbor\'s place" — if it\'s good enough for them, it\'s good enough for me</li>' +
      '<li><strong>Reciprocity:</strong> Give a genuine compliment or helpful observation before asking for anything</li>' +
      '<li><strong>Loss aversion:</strong> "We only have a couple spots left on our [day] route" — people fear missing out more than they desire gaining</li>' +
      '<li><strong>Consistency:</strong> Get small yeses first (yes to a quote, yes to a phone number) — people who say yes once are more likely to say yes again</li>' +
      '</ul>',
  },
  {
    id: 'gm-sales-on-site-closing',
    title: 'On-Site Estimate & Closing',
    category: 'General Manager',
    type: 'gm-sales',
    content: '<h2>How to close the deal when you\'re standing on their lawn</h2><p>The on-site estimate is where most lawn care sales are won or lost. You\'re not just measuring — you\'re building trust, demonstrating expertise, and making it easy to say yes. The person who shows up prepared and confident wins.</p>' +
      '<h2>Before You Arrive</h2><ol>' +
      '<li><strong>Do your homework:</strong> Satellite measure the property before you get there. Know the approximate square footage, lot layout, and what you\'re going to charge before you step out of the truck. <mark>Why: Walking the property while fumbling with a measuring wheel screams amateur. Showing up with numbers ready screams professional.</mark></li>' +
      '<li><strong>Look up the neighborhood:</strong> Are you already servicing nearby? Know the names. "I take care of the Johnsons two doors down." <mark>Why: It\'s not just social proof — it tells them you\'re already here and adding them is easy.</mark></li>' +
      '</ol>' +
      '<h2>The Walk-Around</h2><ol>' +
      '<li><strong>Walk WITH them, not ahead of them:</strong> "Want to walk the property with me? I want to make sure I understand exactly what you\'re looking for." <mark>Why: Walking together creates partnership. Walking ahead of them feels like an inspection. Side by side, you\'re on the same team.</mark></li>' +
      '<li><strong>Ask about their priorities:</strong> "What matters most to you — keeping it looking sharp every week, or are you more focused on keeping costs down?" <mark>Why: This tells you how to frame your price. Quality-focused clients hear "premium service." Budget-focused clients hear "best value in the area."</mark></li>' +
      '<li><strong>Point out things they didn\'t notice:</strong> "See how the grass is thinning here under this tree? That\'s a shade issue — we can overseed with a shade mix in the fall and it\'ll fill right in." <mark>Why: Free expertise builds massive trust. You just demonstrated you know more than the last guy. Now they want YOU, not just a lawn service.</mark></li>' +
      '<li><strong>Identify upsell opportunities but don\'t push them:</strong> Note the beds, the edging, the tree line. Mention it casually: "Your beds could really pop with fresh mulch — that\'s something we can add later if you want." <mark>Why: Planting the seed now means they\'ll come back to you for it later. Don\'t cram everything into the first sale.</mark></li>' +
      '</ol>' +
      '<h2>Presenting the Price</h2><ol>' +
      '<li><strong>Use monthly pricing:</strong> "$180 a month" lands softer than "$45 a visit times 4." Monthly feels like a subscription. Per-visit feels like a transaction. <mark>Why: Monthly pricing reduces the perceived cost and increases commitment. People cancel transactions; they maintain subscriptions.</mark></li>' +
      '<li><strong>Anchor high, offer value:</strong> "A property this size typically runs $200–220 a month. Because I\'m already on this street, I can do $180." <mark>Why: Anchoring sets the frame. The first number they hear becomes the reference point. Everything after that feels like a deal.</mark></li>' +
      '<li><strong>Shut up after the price:</strong> Say the number. Then stop talking. Let them respond. <mark>Why: The first person to talk after the price loses. Silence creates space for them to say yes. If you keep talking, you\'re negotiating against yourself.</mark></li>' +
      '</ol>' +
      '<h2>Handling Objections</h2><ol>' +
      '<li><strong>"I need to think about it":</strong> "Totally understand. What specifically are you weighing?" Then address that specific concern. <mark>Why: "I need to think about it" usually means one specific thing is holding them back. Find it and solve it.</mark></li>' +
      '<li><strong>"That\'s more than I expected":</strong> "What were you expecting?" Let them name a number. Then: "I can\'t hit that number and deliver the quality I showed you on the Johnsons\' lawn. But here\'s what I can do..." <mark>Why: Never just drop your price. Reframe value first. If you drop without pushback, they think you were overcharging.</mark></li>' +
      '<li><strong>"I want to get a few quotes":</strong> "Smart move. When you\'re comparing, make sure they include [edging, blowing, detailed trimming] — a lot of guys quote cheap and skip the detail work." <mark>Why: You just made yourself the standard they judge others against. And you planted doubt about the cheaper guys without saying anything negative.</mark></li>' +
      '</ol>' +
      '<h2>The Close</h2><ol>' +
      '<li><strong>Assume the sale:</strong> "I\'ve got an opening on Tuesdays — does that work for you, or is another day better?" <mark>Why: An assumptive close skips "do you want to?" and goes straight to "when do we start?" It works because most people are ready — they just need a nudge.</mark></li>' +
      '<li><strong>Make it instant:</strong> "I can get you on the schedule this week. I\'ll send the agreement to your phone right now — takes 30 seconds to sign." <mark>Why: Speed kills hesitation. The longer between "yes" and signing, the more likely they talk themselves out of it.</mark></li>' +
      '</ol>',
  },
  {
    id: 'gm-sales-psychology',
    title: 'Sales Psychology Cheat Sheet',
    category: 'General Manager',
    type: 'gm-sales',
    content: '<h2>The mental models that make people say yes</h2><p>Sales isn\'t about tricks — it\'s about understanding how people make decisions and removing the barriers between "interested" and "yes." These principles work in every conversation, not just sales.</p>' +
      '<h2>The Big 6 Principles</h2><ol>' +
      '<li><strong>Reciprocity — Give first, always:</strong> Give a free tip, a genuine compliment, a quick observation about their property. When you give something of value with no strings attached, people feel compelled to give back. "Your irrigation head on the south side is spraying the sidewalk — easy fix, just twist it 15 degrees." They didn\'t ask for that. Now they feel like they owe you. <mark>Why: Humans are wired to return favors. A 10-second tip can be worth a $2,000/year contract.</mark></li>' +
      '<li><strong>Social Proof — Show, don\'t tell:</strong> "I take care of 6 properties on this street" beats "we do great work" every time. Before/after photos on your phone. Google reviews pulled up and ready. The neighbor\'s lawn looking perfect right next door. <mark>Why: People don\'t trust what you say about yourself. They trust what other people say — and what they can see with their own eyes.</mark></li>' +
      '<li><strong>Scarcity — Limited spots, not limited time:</strong> "We only have two openings left on our Thursday route" is honest and effective. Don\'t fake urgency with countdown timers or "today only" nonsense. But real scarcity — route capacity — is powerful and true. <mark>Why: People procrastinate unless there\'s a reason not to. Real scarcity gives them that reason.</mark></li>' +
      '<li><strong>Authority — Look and sound like the expert:</strong> Clean truck, clean uniform, confident handshake. Know the grass type on their lawn without asking. Reference specific techniques: "We run a 3.5-inch cut on fescue this time of year — goes to 4 inches in July to hold moisture." <mark>Why: People follow experts. Every detail you know that they don\'t builds your authority. They stop comparing you on price and start comparing you on competence.</mark></li>' +
      '<li><strong>Consistency — Get small yeses first:</strong> "Mind if I take a quick look at the backyard?" Yes. "Would it help if I put together a quick quote?" Yes. "Can I grab your number to send it over?" Yes. By the time you ask for the sale, they\'ve already said yes three times. <mark>Why: People want to be consistent with their past behavior. Each small yes makes the big yes feel natural.</mark></li>' +
      '<li><strong>Liking — Be a human, not a salesperson:</strong> Use their name. Notice their dog. Comment on the garden they clearly put work into. Find one thing you genuinely have in common and mention it. <mark>Why: People buy from people they like. And people like people who notice them, remember details, and feel real — not rehearsed.</mark></li>' +
      '</ol>' +
      '<h2>Tactical Moves</h2><ul>' +
      '<li><strong>The takeaway:</strong> "Honestly, with your lot size, you might not even need full weekly service — maybe biweekly would be enough." Taking something OFF the table makes people want it more. They\'ll often talk themselves into the bigger package.</li>' +
      '<li><strong>The feel-felt-found:</strong> When someone objects: "I totally get how you feel. A lot of my clients felt the same way at first. What they found was [specific benefit]." This validates their concern without arguing.</li>' +
      '<li><strong>The silence close:</strong> After you state the price or ask for the sale, stop talking. Count to 10 in your head. The person who speaks first loses leverage. Let them fill the silence — it\'s almost always with a yes or a solvable objection.</li>' +
      '<li><strong>The Ben Franklin close:</strong> If they\'re on the fence: "Let\'s just list it out — what are the pros and what are the cons?" Physically list them. The pros will always outnumber the cons because you\'ve been building value the whole conversation.</li>' +
      '<li><strong>Name repetition:</strong> Use their name 3–4 times in the conversation. Not every sentence — that\'s creepy. But enough that it registers. "So John, based on what you told me..." People light up when they hear their own name. It builds instant rapport.</li>' +
      '</ul>' +
      '<h2>The #1 Rule</h2><p><strong>Listen more than you talk.</strong> The best salespeople talk 30% of the time and listen 70%. Every question you ask gives you ammo to close. Every time you talk without listening, you\'re guessing at what they want. Stop guessing. Start asking.</p>',
  },
];

export const initialPMEGuides = [
  {
    id: '31',
    title: 'Property Take-Off & Measurement',
    category: 'Sales',
    type: 'sales',
    content: '<h2>Measuring properties for accurate estimates</h2><p>A bad take-off means you\'re either leaving money on the table or pricing yourself out. Measure twice, quote once.</p><ol><li><strong>Satellite take-off first:</strong> Use Google Earth or Go iLawn to measure total lot area, turf area, bed area, and linear feet of edging before visiting the property.</li><li><strong>Turf area:</strong> Calculate total mowable square footage. Subtract hardscapes (driveway, house footprint, patios), beds, and non-serviceable areas.</li><li><strong>Linear feet:</strong> Measure all edge lines — sidewalk edges, driveway edges, bed edges, curb lines. This drives trimming and edging time.</li><li><strong>Obstacle count:</strong> Count trees, light posts, AC units, mailboxes, and anything requiring trimmer detailing. Each obstacle adds ~30 seconds per visit.</li><li><strong>Slope assessment:</strong> Note any grades. Slopes over 15° require walk-behind mowing, which is slower. Factor 1.5x time for sloped areas.</li><li><strong>Access constraints:</strong> Measure gate widths. If no rear access, the crew walks equipment around — add mobilization time.</li><li><strong>Ground-truth the take-off:</strong> Visit the property to verify satellite measurements. Satellite images can be outdated — new fences, additions, or landscaping changes are common.</li><li>Document everything in the CRM with photos and measurements. This is your pricing foundation.</li></ol>',
  },
  {
    id: '32',
    title: 'Estimating & Pricing',
    category: 'Sales',
    type: 'sales',
    content: '<h2>Building profitable estimates</h2><p>Every estimate needs to cover labor, materials, overhead, and profit. If the math doesn\'t work, the job doesn\'t work.</p><ol><li><strong>Calculate man-hours:</strong> Use your take-off data. Baseline: a 2-person crew handles ~8,000 sq ft of turf per hour (mow + trim + blow). Adjust for obstacles and slopes.</li><li><strong>Labor cost:</strong> Man-hours × fully burdened labor rate (hourly wage + payroll taxes + workers\' comp + benefits). Don\'t use base wage — use the loaded rate.</li><li><strong>Materials:</strong> Estimate fuel, trimmer line, blade wear, and any consumables per visit.</li><li><strong>Mobilization:</strong> Include drive time from the previous stop. A 15-minute drive at $1.50/mile with a crew of 2 adds real cost.</li><li><strong>Overhead allocation:</strong> Insurance, truck payment, equipment depreciation, software, office costs. Apply your overhead rate (typically 15–25% of direct costs).</li><li><strong>Profit margin:</strong> Target minimum 20% net margin on maintenance. Premium services (aeration, overseeding, fert programs) should target 35%+.</li><li><strong>Price check:</strong> Sanity-check against your $/sq ft benchmarks. Residential mowing typically runs $0.004–$0.008 per sq ft per visit depending on your market.</li><li>Round to clean numbers. $47 becomes $50. Clients don\'t want to see pennies — it looks like guesswork.</li></ol>',
  },
  {
    id: '33',
    title: 'Writing Proposals & SOWs',
    category: 'Sales',
    type: 'sales',
    content: '<h2>Proposals that close</h2><p>A proposal isn\'t a price sheet — it\'s a sales document. It should make the client feel confident, informed, and ready to sign.</p><ol><li><strong>Lead with the problem:</strong> "Your property at 123 Main has approximately 12,000 sq ft of turf that requires weekly maintenance to maintain curb appeal and property value."</li><li><strong>Define the scope of work (SOW):</strong> Be specific. "Weekly mowing at 3.5" height, string trimming around 14 obstacles, rotary edging of 280 linear feet of sidewalk/driveway, and full hardscape blow-off."</li><li><strong>Frequency and season:</strong> State the service window clearly. "42 weekly visits, March 15 through December 15" or "Year-round bi-weekly maintenance."</li><li><strong>Pricing structure:</strong> Present as monthly recurring. $200/month reads better than $50/visit × 4. MRR framing builds sticky contracts.</li><li><strong>Include what\'s NOT included:</strong> "This proposal does not include leaf cleanup, aeration, overseeding, or fertilization." This prevents scope creep and opens upsell doors.</li><li><strong>Social proof:</strong> Include a testimonial or "Serving 50+ properties in [neighborhood]" to build trust.</li><li><strong>Call to action:</strong> "Sign below or reply \'approved\' to get on the schedule. We can typically start within 5 business days."</li><li>Send proposals within 24 hours of the site visit. Speed wins deals.</li></ol>',
  },
  {
    id: '34',
    title: 'Upselling & Cross-Selling',
    category: 'Sales',
    type: 'sales',
    content: '<h2>Growing revenue on existing accounts</h2><p>Your cheapest new revenue is from clients who already trust you. Upselling isn\'t pushy — it\'s proactive service.</p><ol><li><strong>Spot opportunities in the field:</strong> Thin turf → overseeding. Compacted soil → aeration. Bare beds → mulch install. Overgrown shrubs → trimming package. Train crews to flag these in Jobber notes.</li><li><strong>Seasonal triggers:</strong><ul><li><strong>Spring:</strong> Aeration, overseeding, pre-emergent application, bed mulching, spring cleanup</li><li><strong>Summer:</strong> Irrigation checks, grub treatment, fungicide application</li><li><strong>Fall:</strong> Leaf cleanup packages, aeration + overseed combo, fall fertilization</li><li><strong>Winter:</strong> Holiday lighting, snow removal, dormant pruning</li></ul></li><li><strong>Bundle pricing:</strong> "Add aeration + overseeding to your fall plan for $X — 15% less than booking separately." Bundles increase average ticket and lock in work.</li><li><strong>The 90-day touchpoint:</strong> After 90 days of service, send a personalized message: "Your lawn\'s looking great. I noticed your beds could use a fresh layer of mulch — want me to put together a quick quote?"</li><li><strong>Track conversion:</strong> Log every upsell attempt and outcome in GHL. Know your close rate so you can improve your pitch and timing.</li></ol>',
  },
  {
    id: '35',
    title: 'Client Follow-Up & Closing',
    category: 'Sales',
    type: 'sales',
    content: '<h2>Following up without being annoying</h2><p>Most quotes don\'t close on the first touch. The follow-up sequence is where revenue is won or lost.</p><ol><li><strong>Same-day send:</strong> Proposal goes out within 24 hours of the site visit. Include a personal note referencing something specific about their property.</li><li><strong>Day 2 — Soft check-in:</strong> Text (not email): "Hi [Name], just wanted to make sure you received the proposal. Happy to answer any questions!"</li><li><strong>Day 5 — Value add:</strong> Send a helpful tip related to their property: "Quick tip — with the warm weather coming, bumping your mowing height to 3.5\\" will help your fescue hold moisture better." This builds authority.</li><li><strong>Day 10 — Direct ask:</strong> "Hey [Name], wanted to check in on the lawn care proposal. We\'ve got a few openings on our [Day] route in your area. Want me to pencil you in?"</li><li><strong>Day 20 — Last touch:</strong> "Hi [Name], I\'m closing out open proposals this week. If now isn\'t the right time, no worries — we\'ll be here when you\'re ready. Just reply \'go\' whenever you want to get started."</li><li><strong>If no response:</strong> Move to a nurture sequence — monthly value emails or texts. Don\'t keep chasing.</li><li><strong>If they say no:</strong> Ask why. Price? Timing? Going with someone else? This data improves your future estimates and pitch. Log the lost reason in GHL.</li><li>Track your close rate by lead source. Know which channels (referral, Google, door knock, Nextdoor) produce the highest conversion.</li></ol>',
  },
];

export const EQUIPMENT_TYPES = [
  { value: 'mower', label: 'Mower' },
  { value: 'blower', label: 'Blower' },
  { value: 'string-trimmer', label: 'String Trimmer' },
  { value: 'hedge-trimmer', label: 'Hedge Trimmer' },
  { value: 'truck', label: 'Truck' },
];

export const initialEquipment = [
  {
    id: '30',
    name: 'Toro TimeCutter 42in Zero-Turn #1',
    type: 'mower',
    serialNumber: '400425612',
    manualUrl: '',
    status: 'operational',
  },
  {
    id: '31',
    name: 'Echo SRM-2620 String Trimmer',
    type: 'string-trimmer',
    serialNumber: 'S72014339',
    manualUrl: '',
    status: 'needs-repair',
    activeRepairs: [{
      id: '31-r1',
      issue: 'Engine starts but dies after 30 seconds',
      reportedBy: 'Mike',
      reportedDate: '1/26/2026',
      urgency: 'critical',
      photo: null,
    }],
  },
  {
    id: '32',
    name: 'Honda HRX217VKA Walk-Behind Mower',
    type: 'mower',
    serialNumber: 'MAGA-1234567',
    manualUrl: '',
    status: 'operational',
  },
];

export const initialIdeas = [
  {
    id: '40',
    type: 'idea',
    title: 'Add mulch bed service',
    description: 'Several customers asked about mulch installation. Could be good upsell in spring.',
    submittedBy: 'Sarah',
    date: '1/24/2026',
    status: 'Reviewing',
  },
  {
    id: '41',
    type: 'idea',
    title: 'Get a backup trimmer',
    description: 'When equipment breaks, we lose time. Having backup would keep us running.',
    submittedBy: 'Mike',
    date: '1/19/2026',
    status: 'Implemented',
  },
];

export const initialPolicies = [
  {
    id: '51',
    title: 'Time Off & Scheduling',
    category: 'Time Off',
    summary: 'Vacation, sick time, holidays, and 2-week notice requirements.',
    content: `Time off accrual and usage policy:\n\nAccrual Rates:\n- 0-1 years: 5 days per year\n- 1-3 years: 10 days per year\n- 3-5 years: 15 days per year\n- 5+ years: 20 days per year\n\nRules:\n- Time off requests must be submitted at least 2 weeks in advance.\n- No more than 2 crew members from the same team may be off simultaneously.\n- Peak season (April-October) time off is limited and subject to approval.\n- Unused days carry over up to 5 days maximum.\n- Sick days: 3 paid sick days per year, no advance notice required.\n- Unpaid leave may be granted for special circumstances with manager approval.`,
  },
  {
    id: '52',
    title: 'New Hire Onboarding',
    category: 'Onboarding',
    summary: 'Orientation, training, and first-week requirements for new employees.',
    content: `All new hires must complete the following before their first day in the field:\n\n1. Submit completed application, W-4, I-9, and direct deposit forms.\n2. Pass a background check and drug screening.\n3. Complete a 4-hour orientation covering company history, values, and standards.\n4. Review and sign the employee handbook acknowledgment form.\n5. Complete equipment safety training (minimum 2 hours with a crew lead).\n6. Shadow an experienced crew for at least 3 full working days.\n7. Pass a practical skills assessment before operating any equipment independently.\n8. Receive company uniform, PPE kit, and employee ID badge.`,
  },
  {
    id: '53',
    title: 'Code of Conduct',
    category: 'Conduct',
    summary: 'Workplace behavior standards and disciplinary guidelines.',
    content: `All employees are expected to uphold the following standards of conduct:\n\n1. Treat all colleagues, clients, and vendors with respect and courtesy.\n2. Maintain honesty and integrity in all business dealings.\n3. Protect company property, equipment, and confidential information.\n4. Report any harassment, discrimination, or unsafe conditions immediately.\n5. No alcohol or drug use before or during work hours.\n6. Personal phone use is limited to break times only.\n7. Social media posts about the company must be approved by management.\n8. Conflicts of interest must be disclosed to management.\n\nViolations may result in disciplinary action up to and including termination.`,
  },
  {
    id: '54',
    title: 'Dress Code',
    category: 'Conduct',
    summary: 'Required uniform and appearance standards for all field team members.',
    content:
      '<p>All field team members must follow the company dress code while on the job:</p>' +
      '<h2>Required Uniform</h2>' +
      '<ul>' +
      '<li>Company-issued shirt or polo — must be worn at all times on job sites.</li>' +
      '<li>Work pants or shorts (no jeans with holes, no sweatpants).</li>' +
      '<li>Closed-toe work boots or sturdy shoes — no sandals, no sneakers.</li>' +
      '<li>Company hat or visor if provided.</li>' +
      '</ul>' +
      '<h2>Appearance Standards</h2>' +
      '<ul>' +
      '<li>Clothing must be clean and in good condition at the start of each day.</li>' +
      '<li>No offensive graphics, logos, or language on any visible clothing.</li>' +
      '<li>Sunglasses are allowed but must be appropriate for a professional setting.</li>' +
      '</ul>' +
      '<h2>Personal Protective Equipment (PPE)</h2>' +
      '<ul>' +
      '<li>Safety glasses must be worn when operating trimmers, edgers, or blowers.</li>' +
      '<li>Ear protection is required when operating loud equipment for extended periods.</li>' +
      '<li>Gloves should be worn when handling chemicals, debris, or sharp materials.</li>' +
      '<li>High-visibility vests are required when working near roadways.</li>' +
      '</ul>' +
      '<h2>Violations</h2>' +
      '<ul>' +
      '<li>First offense: Verbal reminder.</li>' +
      '<li>Second offense: Written warning.</li>' +
      '<li>Repeated violations may result in being sent home without pay for the day.</li>' +
      '</ul>',
  },
  {
    id: '55',
    title: 'Safety & Equipment',
    category: 'Safety',
    summary: 'PPE requirements, equipment handling rules, and injury reporting procedures.',
    content:
      '<p>The safety of every team member is our top priority. Follow these rules at all times:</p>' +
      '<h2>Personal Protective Equipment (PPE)</h2>' +
      '<ul>' +
      '<li>Safety glasses are <strong>mandatory</strong> when operating trimmers, edgers, blowers, or any power equipment.</li>' +
      '<li>Ear protection is required when operating loud equipment for more than 15 minutes.</li>' +
      '<li>Gloves must be worn when handling chemicals, fertilizer, sharp debris, or doing manual cleanup.</li>' +
      '<li>High-visibility vests are required when working near roadways or in low-visibility conditions.</li>' +
      '<li>Closed-toe work boots or sturdy shoes at all times — no exceptions.</li>' +
      '</ul>' +
      '<h2>Equipment Handling</h2>' +
      '<ul>' +
      '<li>Only operate equipment you have been trained on. If unsure, ask your crew lead.</li>' +
      '<li>Inspect equipment before each use — check blades, guards, fuel, and safety features.</li>' +
      '<li>Never remove or disable safety guards on any equipment.</li>' +
      '<li>Shut off equipment before making adjustments, clearing jams, or refueling.</li>' +
      '<li>Report damaged or malfunctioning equipment immediately using the app — do not continue using it.</li>' +
      '<li>Secure all equipment on the trailer before driving. Double-check straps and gates.</li>' +
      '</ul>' +
      '<h2>Heat & Weather Safety</h2>' +
      '<ul>' +
      '<li>Stay hydrated — drink water every 15–20 minutes in hot conditions.</li>' +
      '<li>Take shade breaks as needed. Watch for signs of heat exhaustion (dizziness, nausea, headache).</li>' +
      '<li>If lightning is visible or thunder is heard, stop work immediately and seek shelter.</li>' +
      '<li>Sunscreen is strongly encouraged for all outdoor work.</li>' +
      '</ul>' +
      '<h2>Injury Reporting</h2>' +
      '<ul>' +
      '<li>Report <strong>all</strong> injuries to your General Manager immediately — no matter how minor.</li>' +
      '<li>Do not try to "tough it out." Small injuries can become serious if untreated.</li>' +
      '<li>First aid kits are located in every truck. Know where yours is.</li>' +
      '<li>If someone is seriously injured, call 911 first, then notify your GM.</li>' +
      '</ul>',
  },
  {
    id: '56',
    title: 'Attendance & Punctuality',
    category: 'Conduct',
    summary: 'Show-up expectations, tardiness policy, and no-call/no-show consequences.',
    content:
      '<p>Reliability is everything in this business. Your crew and our clients depend on you showing up.</p>' +
      '<h2>Expectations</h2>' +
      '<ul>' +
      '<li>Be at the shop or meeting point <strong>on time, every day</strong> — ready to work, not just arriving.</li>' +
      '<li>"On time" means geared up, truck loaded, and ready to roll at your scheduled start time.</li>' +
      '<li>If you are going to be late for any reason, text or call your General Manager <strong>before</strong> your start time.</li>' +
      '</ul>' +
      '<h2>Tardiness</h2>' +
      '<ul>' +
      '<li>First late arrival: Verbal conversation.</li>' +
      '<li>Second late arrival (within 30 days): Written warning.</li>' +
      '<li>Third late arrival (within 30 days): May result in suspension or termination.</li>' +
      '<li>Consistently arriving 1–5 minutes late still counts — it adds up and affects the whole crew.</li>' +
      '</ul>' +
      '<h2>Absences</h2>' +
      '<ul>' +
      '<li>Request time off through the app at least 2 weeks in advance when possible.</li>' +
      '<li>Sick days: Notify your GM as early as possible — ideally before your shift starts.</li>' +
      '<li>If you cannot work, <strong>you must communicate</strong>. No exceptions.</li>' +
      '</ul>' +
      '<h2>No-Call / No-Show</h2>' +
      '<ul>' +
      '<li>A no-call/no-show is a serious offense. Your crew is left short-handed and clients are affected.</li>' +
      '<li>First no-call/no-show: Written warning and meeting with GM.</li>' +
      '<li>Second no-call/no-show: Termination.</li>' +
      '</ul>',
  },
  {
    id: '57',
    title: 'Vehicle & Driving',
    category: 'Safety',
    summary: 'Company vehicle rules, phone policy while driving, and accident reporting.',
    content:
      '<p>Company vehicles represent our brand on the road. Drive safely and professionally at all times.</p>' +
      '<h2>General Rules</h2>' +
      '<ul>' +
      '<li>Only authorized employees may operate company vehicles and trailers.</li>' +
      '<li>You must have a valid driver\'s license at all times. Report any license suspensions immediately.</li>' +
      '<li>Obey all traffic laws — speeding tickets and moving violations are your responsibility.</li>' +
      '<li>Seatbelts must be worn at all times by the driver and all passengers.</li>' +
      '<li>No unauthorized passengers in company vehicles — ever.</li>' +
      '</ul>' +
      '<h2>Phone & Distraction Policy</h2>' +
      '<ul>' +
      '<li><strong>No phone use while driving</strong> — no texting, no calls, no exceptions.</li>' +
      '<li>If you need to use your phone, pull over safely first.</li>' +
      '<li>Use hands-free navigation only. Set your route before you start driving.</li>' +
      '</ul>' +
      '<h2>Vehicle Care</h2>' +
      '<ul>' +
      '<li>Do a walk-around check before your first drive of the day (tires, lights, trailer hitch, mirrors).</li>' +
      '<li>Keep the cab clean — no trash, loose tools, or clutter.</li>' +
      '<li>Report any mechanical issues, warning lights, or damage immediately.</li>' +
      '<li>Fuel up at the end of the day so the truck is ready for the next morning.</li>' +
      '</ul>' +
      '<h2>Accidents & Incidents</h2>' +
      '<ul>' +
      '<li>If you are involved in any accident — no matter how minor — stop immediately.</li>' +
      '<li>Check for injuries first. Call 911 if anyone is hurt.</li>' +
      '<li>Exchange insurance and contact information with the other party.</li>' +
      '<li>Take photos of all vehicles, damage, and the scene.</li>' +
      '<li>Call your General Manager immediately after securing the scene.</li>' +
      '<li>Do <strong>not</strong> admit fault or make statements to the other party beyond exchanging info.</li>' +
      '</ul>',
  },
];

export const initialTimeOffRequests = [
  {
    id: 'pto1',
    name: 'Sarah',
    startDate: '2/14/2026',
    endDate: '2/16/2026',
    days: 3,
    reason: 'Family vacation',
    requestedDate: '1/24/2026',
    status: 'pending',
  },
  {
    id: 'pto2',
    name: 'Mike',
    startDate: '3/9/2026',
    endDate: '3/9/2026',
    days: 1,
    reason: 'Doctor appointment',
    requestedDate: '1/19/2026',
    status: 'approved',
  },
];

export const initialOwnerStartChecklist = [
  { id: 'sd-h1', text: 'Communicate', type: 'header', indent: 0, done: false },
  { id: 'sd-1', text: 'Open [Gmail](https://mail.google.com/mail/u/0/#inbox) and [GHL Conversations](https://app.gohighlevel.com/v2/location/Umlo2UnfqbijiGqNU6g2/conversations/conversations)', type: 'item', indent: 0, done: false },
  { id: 'sd-1a', text: 'Reply to messages in GHL', type: 'item', indent: 1, done: false },
  { id: 'sd-1b', text: 'Reply to messages in Gmail', type: 'item', indent: 1, done: false },
  { id: 'sd-2', text: 'Review [Jobber Home](https://secure.getjobber.com/schedule/month/2026/1/17?unscheduled=off&map=hidden&nav_label=Schedule&nav_source=sidebar&displayMode=full&assignees=MjM3NjQwMw%3D%3D) and update accordingly', type: 'item', indent: 0, done: false },
  { id: 'sd-3', text: 'Open [Sales Pipeline](https://app.gohighlevel.com/v2/location/Umlo2UnfqbijiGqNU6g2/opportunities/list) and follow up', type: 'item', indent: 0, done: false },
];

export const initialOwnerEndChecklist = [
  { id: 'ed-h1', text: 'Communicate', type: 'header', indent: 0, done: false },
  { id: 'ed-1', text: 'Open [Gmail](https://mail.google.com/mail/u/0/#inbox) and [GHL Conversations](https://app.gohighlevel.com/v2/location/Umlo2UnfqbijiGqNU6g2/conversations/conversations)', type: 'item', indent: 0, done: false },
  { id: 'ed-1a', text: 'Reply to messages in GHL', type: 'item', indent: 1, done: false },
  { id: 'ed-1b', text: 'Reply to messages in Gmail', type: 'item', indent: 1, done: false },
  { id: 'ed-2', text: 'Review [Jobber Home](https://secure.getjobber.com/schedule/month/2026/1/17?unscheduled=off&map=hidden&nav_label=Schedule&nav_source=sidebar&displayMode=full&assignees=MjM3NjQwMw%3D%3D) and update accordingly', type: 'item', indent: 0, done: false },
  { id: 'ed-3', text: 'Open [Sales Pipeline](https://app.gohighlevel.com/v2/location/Umlo2UnfqbijiGqNU6g2/opportunities/list) and follow up', type: 'item', indent: 0, done: false },
  { id: 'ed-h2', text: 'Invoices, Payments, Mileage, Expenses', type: 'header', indent: 0, done: false },
  { id: 'ed-4', text: '[Send invoices](https://secure.getjobber.com/schedule/month/2026/1/25?unscheduled=off&map=hidden&nav_label=Schedule&nav_source=sidebar&displayMode=full&assignees=unassigned&assignees=MzY1MTY5MA%3D%3D&appointmentTypes=Visit)', type: 'item', indent: 0, done: false },
  { id: 'ed-5', text: 'Track mileage', type: 'item', indent: 0, done: false, action: 'log-mileage' },
  { id: 'ed-6', text: 'Review [Account](https://qbo.intuit.com/app/banking?jobId=accounting) \u2014 All dates > This Year > Apply', type: 'item', indent: 0, done: false },
  { id: 'ed-h3', text: 'Highlevel', type: 'header', indent: 0, done: false },
  { id: 'ed-7', text: '[Check pipeline](https://app.gohighlevel.com/v2/location/Umlo2UnfqbijiGqNU6g2/opportunities/list) \u2014 Ensure everyone who needs to be scheduled is scheduled and won/lost', type: 'item', indent: 0, done: false },
  { id: 'ed-h4', text: 'Route & Tomorrow Prep', type: 'header', indent: 0, done: false },
  { id: 'ed-8', text: 'Ensure [route](https://secure.getjobber.com/schedule/month/2026/1/1?map=small&displayMode=half-collapsed&unscheduled=on) is right and assigned to right people', type: 'item', indent: 0, done: false },
  { id: 'ed-9', text: 'Do I need to buy or load anything?', type: 'item', indent: 0, done: false },
  { id: 'ed-10', text: 'Is everyone healthy and ready to work?', type: 'item', indent: 0, done: false },
  { id: 'ed-11', text: 'Any weather issues (rain, temp, wind)?', type: 'item', indent: 0, done: false },
  { id: 'ed-h5', text: 'Communication & Double-Check', type: 'header', indent: 0, done: false },
  { id: 'ed-12', text: 'Check GHL email/text and Gmail \u2014 filter for unread!', type: 'item', indent: 0, done: false },
  { id: 'ed-13', text: "[Check opportunities](https://app.gohighlevel.com/v2/location/Umlo2UnfqbijiGqNU6g2/opportunities/list) and nudge anyone who hasn't replied", type: 'item', indent: 0, done: false },
  { id: 'ed-14', text: 'Check off evening checklist on Jobber', type: 'item', indent: 0, done: false },
  { id: 'ed-15', text: "Review tomorrow's list on mobile Jobber for all members", type: 'item', indent: 0, done: false },
  { id: 'ed-16', text: 'Write my top 3 for tomorrow', type: 'item', indent: 0, done: false },
];

export const initialTeamChecklist = [
  { id: 'tc-1', text: 'Review daily route and job schedule' },
  { id: 'tc-2', text: 'Inspect and fuel all equipment' },
  { id: 'tc-3', text: 'Check oil levels and tire pressure' },
  { id: 'tc-4', text: 'Load trucks with correct supplies and materials' },
  { id: 'tc-5', text: 'Verify all PPE is available and in good condition' },
  { id: 'tc-6', text: 'Check weather forecast and adjust plans if needed' },
  { id: 'tc-7', text: 'Team huddle — review priorities and safety reminders' },
];

export const initialVehicles = [
  { id: 'v1', name: '2016 Ford F150', nickname: 'Company Truck', year: '2016', make: 'Ford', model: 'F-150' },
  { id: 'v2', name: '2022 Ford F-150', nickname: "Gene's Ford", year: '2022', make: 'Ford', model: 'F-150' },
];

export const initialMileageLog = [];

export const initialQuotes = [];

export const initialReceiptLog = [];

export const initialQuotingSettings = {
  mulchTypes: [
    { label: 'Hardwood', pricePerYd: 30 },
    { label: 'Black', pricePerYd: 40 },
    { label: 'Brown', pricePerYd: 40 },
    { label: 'Red', pricePerYd: 40 },
    { label: 'Cedar', pricePerYd: 55 },
  ],
  rockTypes: [
    { label: 'DEFO New England 1\'-2"', pricePerYd: 275 },
    { label: 'White Rock 2x1', pricePerYd: 170 },
  ],
  volumeTiers: [
    { minYards: 0, discountPct: 0 },
    { minYards: 5, discountPct: 8 },
    { minYards: 10, discountPct: 15 },
    { minYards: 20, discountPct: 25 },
  ],
  materialMarkupPct: 100,
  laborPerYard: 35,
  baseDeliveryFee: 75,
};

export const initialEquipmentRepairLog = [];

export const initialTeamEndChecklist = [
  { id: 'tec-1', text: 'Clean all equipment and remove debris' },
  { id: 'tec-2', text: 'Inspect equipment for damage and report issues' },
  { id: 'tec-3', text: 'Refuel equipment for next day' },
  { id: 'tec-4', text: 'Secure all tools and lock storage' },
  { id: 'tec-5', text: 'Log completed jobs and note any client concerns' },
  { id: 'tec-6', text: 'Empty truck of trash and leftover materials' },
  { id: 'tec-7', text: 'Submit timesheet and mileage' },
];

export const initialChecklistLog = [];

// ─── Buyback Principle ───

export function calculateQuadrant(energyScore, valueScore) {
  const highEnergy = energyScore >= 3;
  const highValue = valueScore >= 3;
  if (highEnergy && highValue) return 'production';
  if (highEnergy && !highValue) return 'replacement';
  if (!highEnergy && highValue) return 'delegation';
  return 'elimination';
}

export const QUADRANT_META = {
  production: {
    label: 'Production',
    subtitle: 'The Gold — keep doing',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-700',
    badgeBg: 'bg-emerald-100',
    badgeText: 'text-emerald-800',
    dotColor: 'bg-emerald-500',
  },
  replacement: {
    label: 'Replacement',
    subtitle: 'Enjoy but low value — train someone',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-800',
    dotColor: 'bg-amber-500',
  },
  delegation: {
    label: 'Delegation',
    subtitle: 'Valuable but draining — delegate w/ SOP',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-700',
    badgeBg: 'bg-blue-100',
    badgeText: 'text-blue-800',
    dotColor: 'bg-blue-500',
  },
  elimination: {
    label: 'Elimination',
    subtitle: 'Stop doing entirely',
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    badgeBg: 'bg-red-100',
    badgeText: 'text-red-800',
    dotColor: 'bg-red-500',
  },
};

export const QUADRANT_SCORE_RANGES = {
  production:  { energy: [3, 5], value: [3, 5] },
  replacement: { energy: [3, 5], value: [1, 2] },
  delegation:  { energy: [1, 2], value: [3, 5] },
  elimination: { energy: [1, 2], value: [1, 2] },
};

export const BUYBACK_STATUS_META = {
  backlog: { label: 'Backlog', bg: 'bg-gray-100', text: 'text-gray-700' },
  'this-week': { label: 'This Week', bg: 'bg-indigo-100', text: 'text-indigo-700' },
  'in-progress': { label: 'In Progress', bg: 'bg-amber-100', text: 'text-amber-700' },
  done: { label: 'Done', bg: 'bg-emerald-100', text: 'text-emerald-700' },
};

export const initialBuybackIdeas = [
  {
    id: 'bb-1',
    title: 'Close high-value sales calls',
    description: 'Personal phone calls with premium residential and commercial leads. High conversion rate when I handle them directly.',
    energyScore: 5,
    valueScore: 5,
    quadrant: 'production',
    sopLink: '',
    status: 'this-week',
    assignedTo: '',
    scheduledTime: '',
    weekOf: '',
    createdAt: '2026-01-20T08:00:00.000Z',
    updatedAt: '2026-01-20T08:00:00.000Z',
    notes: '',
    archived: false,
  },
  {
    id: 'bb-2',
    title: 'Morning equipment inspections',
    description: 'Walking the yard every morning checking mower blades, oil, tire pressure. Enjoy doing it but any crew lead could handle this.',
    energyScore: 4,
    valueScore: 2,
    quadrant: 'replacement',
    sopLink: '',
    status: 'backlog',
    assignedTo: '',
    scheduledTime: '',
    weekOf: '',
    createdAt: '2026-01-21T08:00:00.000Z',
    updatedAt: '2026-01-21T08:00:00.000Z',
    notes: 'Need to create SOP video before handing off',
    archived: false,
  },
  {
    id: 'bb-3',
    title: 'Weekly invoicing and payment follow-ups',
    description: 'Sending invoices through Jobber, chasing overdue payments, reconciling in QuickBooks. Critical for cash flow but drains me.',
    energyScore: 1,
    valueScore: 4,
    quadrant: 'delegation',
    sopLink: '',
    status: 'backlog',
    assignedTo: '',
    scheduledTime: '',
    weekOf: '',
    createdAt: '2026-01-22T08:00:00.000Z',
    updatedAt: '2026-01-22T08:00:00.000Z',
    notes: 'Could hire a part-time bookkeeper or VA',
    archived: false,
  },
  {
    id: 'bb-4',
    title: 'Manually updating social media bios',
    description: 'Tweaking Facebook, Instagram, and Google Business profile text. Low impact, nobody reads it, and I dread doing it.',
    energyScore: 1,
    valueScore: 1,
    quadrant: 'elimination',
    sopLink: '',
    status: 'backlog',
    assignedTo: '',
    scheduledTime: '',
    weekOf: '',
    createdAt: '2026-01-23T08:00:00.000Z',
    updatedAt: '2026-01-23T08:00:00.000Z',
    notes: 'Set it once and forget it, or just stop doing it',
    archived: false,
  },
];

/* ── Quest Board Seed Data ── */

export const initialQuests = [
  {
    id: 'quest-1',
    title: 'Morning Equipment Check',
    description: 'Inspect all equipment before heading out. Log any issues.',
    xp: 25,
    reward: '',
    type: 'daily',
    scope: 'individual',
    targetCount: 1,
    expiresAt: null,
    createdAt: '2026-02-01T08:00:00.000Z',
    createdBy: 'owner',
    active: true,
  },
  {
    id: 'quest-2',
    title: 'Zero Client Callbacks',
    description: 'Complete all jobs this week with zero client complaints or callbacks.',
    xp: 150,
    reward: '',
    type: 'weekly',
    scope: 'individual',
    targetCount: 1,
    expiresAt: null,
    createdAt: '2026-02-01T08:00:00.000Z',
    createdBy: 'owner',
    active: true,
  },
  {
    id: 'quest-3',
    title: 'Share a Process Improvement',
    description: 'Submit an idea on the Ideas board that could save time or money.',
    xp: 100,
    reward: '',
    type: 'monthly',
    scope: 'individual',
    targetCount: 1,
    expiresAt: null,
    createdAt: '2026-02-01T08:00:00.000Z',
    createdBy: 'owner',
    active: true,
  },
  {
    id: 'quest-4',
    title: 'Team Clean Sweep',
    description: 'Entire crew completes end-of-day cleanup checklist — every person, every item.',
    xp: 75,
    reward: '',
    type: 'daily',
    scope: 'team',
    targetCount: 5,
    expiresAt: null,
    createdAt: '2026-02-01T08:00:00.000Z',
    createdBy: 'owner',
    active: true,
  },
  {
    id: 'quest-5',
    title: 'Perfect Safety Month',
    description: 'Zero safety incidents across the entire team for the full month.',
    xp: 500,
    reward: 'Team lunch on the boss!',
    type: 'monthly',
    scope: 'team',
    targetCount: 5,
    expiresAt: null,
    createdAt: '2026-02-01T08:00:00.000Z',
    createdBy: 'owner',
    active: true,
  },
  {
    id: 'quest-6',
    title: 'Spring Cleanup Blitz',
    description: 'Complete 10 spring cleanup jobs before the deadline. Bonus XP bounty!',
    xp: 300,
    reward: '$50 gift card',
    type: 'bounty',
    scope: 'individual',
    targetCount: 1,
    expiresAt: '2026-03-31',
    createdAt: '2026-02-01T08:00:00.000Z',
    createdBy: 'owner',
    active: true,
  },
];

/* ── Daily Quiz ── */

export const initialQuizLog = [];

export const initialMowingSettings = {
  automationEnabled: false,
  sendTiming: 'day-before',       // 'day-before', 'morning-of', '2-days-before'
  messageTemplate: "Hi {{firstName}}, this is a reminder that Hey Jude's Lawn Care is scheduled to service your property on {{serviceDate}}. Thank you for choosing us!",
};

export const initialMowingNotifications = [];

export const QUIZ_QUESTIONS = [
  // Core Values — scenario-based
  {
    id: 'q1',
    question: 'A client points out a small patch of grass you missed behind their shed. You go back and fix it without being asked. Which value is this?',
    options: [
      { text: 'Give a Damn', correct: true },
      { text: 'Clean Finish, Clean Reset', correct: false },
      { text: 'Go the Extra Mile', correct: false },
      { text: 'Communicate issues immediately', correct: false },
    ],
    explanation: '"Give a Damn" means you care about the details — even the ones nobody else would notice.',
  },
  {
    id: 'q2',
    question: 'After finishing a job, you blow off all the clippings from the driveway, sidewalk, and beds, then clean every tool before loading up. Which value?',
    options: [
      { text: 'Clean Finish, Clean Reset', correct: true },
      { text: 'Give a Damn', correct: false },
      { text: 'Go the Extra Mile', correct: false },
      { text: 'Communicate issues immediately', correct: false },
    ],
    explanation: '"Clean Finish, Clean Reset" — the job isn\'t done until the property AND your gear are spotless.',
  },
  {
    id: 'q3',
    question: 'You notice a client\'s gate is broken and let them know, even though it\'s not part of the job. Which value?',
    options: [
      { text: 'Go the Extra Mile', correct: true },
      { text: 'Give a Damn', correct: false },
      { text: 'Clean Finish, Clean Reset', correct: false },
      { text: 'Communicate issues immediately', correct: false },
    ],
    explanation: '"Go the Extra Mile" — doing more than what\'s expected to deliver real value.',
  },
  {
    id: 'q4',
    question: 'A client complains about rough edging along their flower beds. Which value should you think about first?',
    options: [
      { text: 'Give a Damn', correct: true },
      { text: 'Go the Extra Mile', correct: false },
      { text: 'Clean Finish, Clean Reset', correct: false },
      { text: 'Communicate issues immediately', correct: false },
    ],
    explanation: 'Sloppy edging means we didn\'t care enough. "Give a Damn" — take pride in every detail.',
  },
  {
    id: 'q5',
    question: 'You leave a job site and the mower deck still has caked-on grass. Which value did you skip?',
    options: [
      { text: 'Clean Finish, Clean Reset', correct: true },
      { text: 'Give a Damn', correct: false },
      { text: 'Go the Extra Mile', correct: false },
      { text: 'Communicate issues immediately', correct: false },
    ],
    explanation: '"Clean Finish, Clean Reset" — equipment gets cleaned after every job, not just at end of day.',
  },
  // Responsibilities — direct recall
  {
    id: 'q6',
    question: 'What is responsibility #1?',
    options: [
      { text: 'Complete your opening & closing checklists every day', correct: true },
      { text: 'Log mileage and scan receipts same day', correct: false },
      { text: 'Show up on time, in uniform, ready to work', correct: false },
      { text: 'Communicate issues immediately', correct: false },
    ],
    explanation: 'Checklists keep the crew sharp and the trucks ready. No shortcuts.',
  },
  {
    id: 'q7',
    question: 'What is responsibility #2?',
    options: [
      { text: 'Follow the playbook and complete your checklists', correct: true },
      { text: 'Complete your opening & closing checklists every day', correct: false },
      { text: 'Show up on time, in uniform, ready to work', correct: false },
      { text: 'Log mileage and scan receipts same day', correct: false },
    ],
    explanation: 'The playbook is how you do it right. The checklist is proof you did it.',
  },
  {
    id: 'q8',
    question: 'What is responsibility #3?',
    options: [
      { text: 'Log mileage and scan receipts same day', correct: true },
      { text: 'Follow the playbook and complete your checklists', correct: false },
      { text: 'Communicate issues immediately', correct: false },
      { text: 'Complete your opening & closing checklists every day', correct: false },
    ],
    explanation: 'Don\'t let it pile up. End of day, log your miles and snap your receipts.',
  },
  {
    id: 'q9',
    question: 'What is responsibility #4?',
    options: [
      { text: 'Show up on time, in uniform, ready to work', correct: true },
      { text: 'Communicate issues immediately', correct: false },
      { text: 'Log mileage and scan receipts same day', correct: false },
      { text: 'Follow the playbook and complete your checklists', correct: false },
    ],
    explanation: 'Be where you\'re supposed to be, looking professional, with your gear ready.',
  },
  {
    id: 'q10',
    question: 'What is responsibility #5?',
    options: [
      { text: 'Communicate issues immediately — don\'t hide problems', correct: true },
      { text: 'Show up on time, in uniform, ready to work', correct: false },
      { text: 'Complete your opening & closing checklists every day', correct: false },
      { text: 'Go the extra mile for every client', correct: false },
    ],
    explanation: 'Equipment broke? Customer complaint? Running late? Say something right away.',
  },
  // Application — which responsibility applies?
  {
    id: 'q11',
    question: 'You forgot to scan a gas receipt yesterday and now it\'s lost. Which responsibility did you miss?',
    options: [
      { text: 'Log mileage and scan receipts same day', correct: true },
      { text: 'Communicate issues immediately', correct: false },
      { text: 'Follow the playbook', correct: false },
      { text: 'Complete your checklists every day', correct: false },
    ],
    explanation: 'Responsibility #3 — scan receipts the same day so nothing gets lost.',
  },
  {
    id: 'q12',
    question: 'A trimmer line breaks mid-job and you don\'t tell anyone, hoping to fix it later. Which responsibility did you skip?',
    options: [
      { text: 'Communicate issues immediately', correct: true },
      { text: 'Follow the playbook', correct: false },
      { text: 'Complete your checklists every day', correct: false },
      { text: 'Show up on time, in uniform, ready to work', correct: false },
    ],
    explanation: 'Responsibility #5 — don\'t hide problems. Report equipment issues right away.',
  },
  {
    id: 'q13',
    question: 'You show up 10 minutes late in a wrinkled t-shirt. Which responsibility are you breaking?',
    options: [
      { text: 'Show up on time, in uniform, ready to work', correct: true },
      { text: 'Complete your opening & closing checklists every day', correct: false },
      { text: 'Communicate issues immediately', correct: false },
      { text: 'Follow the playbook', correct: false },
    ],
    explanation: 'Responsibility #4 — be where you\'re supposed to be, looking professional.',
  },
  {
    id: 'q14',
    question: 'How many core values does the team have?',
    options: [
      { text: '3', correct: true },
      { text: '4', correct: false },
      { text: '5', correct: false },
      { text: '2', correct: false },
    ],
    explanation: 'We have 3 core values: Give a Damn, Clean Finish Clean Reset, and Go the Extra Mile.',
  },
  {
    id: 'q15',
    question: 'You finish mowing but skip blowing off the driveway because you\'re running behind. Which value and responsibility overlap here?',
    options: [
      { text: 'Clean Finish, Clean Reset + Follow the playbook', correct: true },
      { text: 'Give a Damn + Communicate issues', correct: false },
      { text: 'Go the Extra Mile + Log mileage', correct: false },
      { text: 'Give a Damn + Show up on time', correct: false },
    ],
    explanation: 'Skipping blowoff breaks "Clean Finish, Clean Reset" and the playbook says to always blow off hard surfaces.',
  },
];
