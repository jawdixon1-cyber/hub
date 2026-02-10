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
    content: `All new hires must complete the following before their first day in the field:\n\n1. Submit completed application, W-4, I-9, and direct deposit forms.\n2. Pass a background check and drug screening.\n3. Complete a 4-hour orientation covering company history, values, and expectations.\n4. Review and sign the employee handbook acknowledgment form.\n5. Complete equipment safety training (minimum 2 hours with a crew lead).\n6. Shadow an experienced crew for at least 3 full working days.\n7. Pass a practical skills assessment before operating any equipment independently.\n8. Receive company uniform, PPE kit, and employee ID badge.`,
  },
  {
    id: '53',
    title: 'Code of Conduct',
    category: 'Conduct',
    summary: 'Workplace behavior expectations and disciplinary guidelines.',
    content: `All employees are expected to uphold the following standards of conduct:\n\n1. Treat all colleagues, clients, and vendors with respect and courtesy.\n2. Maintain honesty and integrity in all business dealings.\n3. Protect company property, equipment, and confidential information.\n4. Report any harassment, discrimination, or unsafe conditions immediately.\n5. No alcohol or drug use before or during work hours.\n6. Personal phone use is limited to break times only.\n7. Social media posts about the company must be approved by management.\n8. Conflicts of interest must be disclosed to management.\n\nViolations may result in disciplinary action up to and including termination.`,
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
  { id: 'ed-5', text: '[Track mileage](https://qbo.intuit.com/app/mileage?jobId=expenses)', type: 'item', indent: 0, done: false },
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
