// Default hiring page content — matches heyjudeslawncare.com/grow
export const initialHiringContent = {
  hero: {
    badge: '',
    title: "Start as a Landscaping Helper.\nGrow Into a Team Lead.",
    subtitle: "We build champions.",
    cta: 'Apply Now',
    note: '',
  },
  whatYouGet: {
    intro: "Here's what you get when you join our team.",
    items: [
      'A stable, full-time job. 40 hours a week, overtime available.',
      'Growth opportunity to become a team lead',
      "The environment you need to build discipline, get in the best shape of your life, and become someone people look up to",
    ],
    callout: "",
  },
  whatWeDo: {
    intro: "We're becoming the best version of ourselves — for ourselves, our families, and our clients.",
    detail: "Most landscapers chase speed and low prices, rushing job to job and missing details. We're the opposite — obsessed with every detail they ignore, delivering premium service.",
    items: [],
    callout: "We hold everyone to a high standard — probably higher than you're used to. Do you have what it takes?",
  },
  coreValues: {
    intro: 'Our Core Values',
    values: [
      'Trust in God',
      'Own the Outcome',
      'Set the Standard',
      'Discipline is Freedom',
      'No Shortcuts',
      'No Excuses',
      'Integrity Always',
      'Win as a Team',
      'Over-Deliver for Clients',
      'Never Quit',
      'Keep Your Word',
    ],
  },
  whatYoullDo: {
    intro: "",
    dailyWork: [
      'Mowing, string-trimming, edging, blowing',
      'Bush trimming',
      'Mulch & pine straw installs',
    ],
    howYoullLearn: [
      'Follow playbooks and walkthrough videos to ensure quality',
    ],
  },
  teamLead: {
    intro: 'This is where you\'re headed if you show up, learn the systems, and earn it.',
    items: [
      'Lead jobs independently',
      'Drive company vehicle and trailer',
      'Work with and manage team members on-site',
      'Communicate with clients and the office',
    ],
    callout: 'We promote from within. Team leads start as team members who prove they can be counted on.',
  },
  howWeRun: {
    intro: '',
    cards: [
      { title: 'Playbooks', body: "Every service has a playbook. You'll know exactly how to do the job right." },
      { title: 'Small Crews', body: "You'll work in a small, tight crew, not a rotating cast of strangers. Same people, same standards, same accountability." },
      { title: 'Walkthrough Videos', body: "For property-specific details and bigger projects, we use walkthrough videos so you know exactly what to expect on site." },
    ],
    callout: "You won't be thrown into a job wondering what to do. We set you up to succeed from day one.",
  },
  payProgression: {
    start: { label: 'Starting Pay', amount: '$16–18/hr', note: 'Depending on experience' },
    raises: { label: 'Raises', note: 'Based on reliability, attitude, initiative, and the value you bring to the team. The more value you bring, the more pay.' },
    lead: { label: 'Team Lead', amount: '$20–25/hr', note: 'Higher base pay + more responsibility' },
  },
  payBenefits: {
    compensation: [
      'Starting at $16–18/hr depending on experience',
      'Raises on base pay for consistent reliability',
      'Growth path: Team Member to Team Lead ($20–25/hr) with higher base pay and responsibility',
    ],
    scheduleCulture: [
      'Schedule: Full-time, 40 hours a week, overtime allowed',
      'Work with the #1 Google-rated lawn care company in Rock Hill.',
      "Respectful leadership. People don't quit jobs, they quit bosses. Our priority is a fair, respectful work environment.",
      'Your voice matters. If you have ideas to make a job easier, faster, or better, we want to hear them.',
      "We're always reinvesting in our team. Better equipment, better processes, better systems so you can do your best work.",
      "Medical insurance is on our roadmap. Once we have a full team of 4, we're adding health coverage for you.",
    ],
  },
  requirements: {
    mustHave: [
      "Valid driver's license",
      "Integrity",
      "Coachability — you take feedback well and use it to get better",
    ],
    preferred: [],
    preferredNote: '',
    callouts: [
    ],
  },
  goodFit: [
    'You can handle the outdoors — heat, rain, cold, hard work',
    'You show up on time and people can count on you',
    'You take pride in how the finished product looks',
    'You want to grow, not just collect a check',
    "You don't need to be babysat",
  ],
  notAFit: [],
  notAFitCallout: "",
  bottomCta: {
    title: 'Ready to apply?',
    subtitle: "Please don't apply if you don't meet the requirements above.",
  },
};

// Application form — 6 steps
export const initialApplicationForm = {
  version: 15,
  steps: [
    {
      id: 'applicant-info',
      title: 'About You',
      fields: [
        { id: 'first_name', label: 'First Name', type: 'short', required: true, placeholder: 'First name', halfWidth: true },
        { id: 'last_name', label: 'Last Name', type: 'short', required: true, placeholder: 'Last name', halfWidth: true },
        { id: 'phone', label: 'Phone', type: 'phone', required: true, placeholder: 'Phone' },
        { id: 'email', label: 'Email', type: 'email', required: true, placeholder: 'Email' },
        { id: 'city', label: 'City', type: 'short', required: true, placeholder: 'City', halfWidth: true },
        { id: 'zip', label: 'ZIP code', type: 'short', required: true, placeholder: 'ZIP', halfWidth: true },
        { id: 'dob', label: 'Date of birth', type: 'short', required: true, placeholder: 'MM/DD/YYYY', description: 'Used only to confirm age and eligibility for this role' },
        { id: 'gender', label: 'Gender', type: 'dropdown', required: false, options: ['Male', 'Female', 'Prefer not to say'] },
        { id: 'government_id', label: 'Upload a photo of your government-issued ID', type: 'file', required: true, accept: '.jpg,.jpeg,.png,.pdf', description: "Driver's license, state ID, or passport. We use this to verify your identity and work eligibility." },
      ],
    },
    {
      id: 'job-requirements',
      title: 'Can You Do This Job?',
      fields: [
        { id: 'fulltime_understand', label: 'Do you understand this is a full-time role?', type: 'radio', required: true, options: ['Yes', 'No'] },
        { id: 'physical_ability', label: "This work is physically demanding. Are you able to lift 50+ lbs and work outside in heat, rain, and cold — every day?", type: 'radio', required: true, options: ['Yes', 'No'] },
        { id: 'drivers_license', label: 'Do you have a valid driver\'s license?', type: 'radio', required: true, options: ['Yes', 'No'] },
        { id: 'injuries', label: 'Any injuries or physical limitations that could affect your ability to do this work?', type: 'radio', required: true, options: ['Yes', 'No'], description: "Be honest — we're asking so we can set you up for success, not to disqualify you." },
        { id: 'injuries_detail', label: 'Please explain.', type: 'long', required: true, placeholder: '', showIf: { field: 'injuries', equals: 'Yes' } },
        { id: 'tobacco_use', label: 'Do you currently use tobacco or nicotine products?', type: 'radio', required: true, options: ['Yes', 'No'] },
        { id: 'tobacco_policy', label: "Are you willing to leave all substances at home?", type: 'radio', required: true, options: ['Yes', 'No'], showIf: { field: 'tobacco_use', equals: 'Yes' } },
        { id: 'background_check', label: 'Anything that may come up on a background check?', type: 'radio', required: true, options: ['Yes', 'No'] },
        { id: 'background_detail', label: 'Please explain.', type: 'long', required: true, placeholder: '', showIf: { field: 'background_check', equals: 'Yes' } },
      ],
    },
    {
      id: 'experience',
      title: 'Experience',
      fields: [
        { id: 'landscaping_experience', label: 'Do you have any landscaping experience with a company?', type: 'radio', required: true, options: ['Yes', 'No'], description: "No experience is completely fine — we train everyone. By 'experience' we mean a real job at a landscaping company, not family favors, side hustles, or your own yard." },
        { id: 'years_landscaping', label: 'How many years?', type: 'dropdown', required: true, options: ['Less than 1 year', '1-2 years', '3-5 years', '5+ years'], showIf: { field: 'landscaping_experience', equals: 'Yes' } },
        { id: 'skills', label: 'Which of these have you done at a company?', type: 'multi', required: false, options: [
          'Ride-on Mowers',
          'String Trimming / Weed Eating',
          'Edging',
          'Blowing',
          'Trimming Hedges',
          'Spreading Pine Straw',
          'Spreading Mulch',
        ], showIf: { field: 'landscaping_experience', equals: 'Yes' } },
        { id: 'leadership_exp', label: 'Were you ever in a leadership role at that landscaping company?', type: 'radio', required: true, options: ['Yes', 'No'], showIf: { field: 'landscaping_experience', equals: 'Yes' } },
        { id: 'leadership_detail', label: 'What did you lead and what were you responsible for?', type: 'long', required: true, placeholder: '', showIf: { field: 'leadership_exp', equals: 'Yes' } },
      ],
    },
    {
      id: 'employment-history',
      title: 'Work History',
      fields: [
        { id: 'resume', label: 'Upload your resume', type: 'file', required: true, description: 'Upload a PDF, Word doc, or image (.pdf, .doc, .docx, .jpg, .png). Max 10 MB.' },
        { id: 'last_job_heading', label: 'About your last job', type: 'info', required: false },
        { id: 'recent_company', label: 'Company name', type: 'short', required: true, placeholder: '' },
        { id: 'recent_title', label: 'Your role/title', type: 'short', required: true, placeholder: '' },
        { id: 'manager_name', label: "Your manager's name", type: 'short', required: true, placeholder: '' },
        { id: 'manager_phone', label: "Your manager's phone number", type: 'phone', required: true, placeholder: '' },
        { id: 'recent_dates', label: 'How long did you work there?', type: 'short', required: true, placeholder: 'e.g. March 2024 - January 2025' },
        { id: 'reason_leaving', label: "Why don't you work there anymore?", type: 'long', required: true, placeholder: 'e.g. Better opportunity, layoff, moved, company closed, wanted a change, etc.' },
      ],
    },
    {
      id: 'going-forward',
      title: 'Getting Started',
      fields: [
        { id: 'start_date', label: 'When can you start working with us?', type: 'short', required: true, placeholder: 'e.g. Immediately, April 20, etc.' },
        { id: 'availability', label: 'What days and times can you work? (We don\'t work Sundays)', type: 'multi', required: true, options: ['Weekdays 9:00-5:00', 'Saturdays 9:00-5:00'] },
        { id: 'how_long', label: 'If we\'re a good fit, how long can you see yourself working with us?', type: 'dropdown', required: true, options: ['Just trying it out', 'A few months', '6 months to 1 year', '1+ years', 'Long-term / as long as it works'] },
      ],
    },
    {
      id: 'read-carefully',
      title: 'Certification & Signature',
      fields: [
        { id: 'certification', label: 'I certify that the information provided in this application is true and complete to the best of my knowledge. I understand that false or misleading information may disqualify me from employment or result in dismissal if discovered later.\n\nI authorize Hey Jude\'s Lawn Care to contact any references or employers listed above for the purpose of verifying employment and qualifications.\n\nHey Jude\'s Lawn Care may conduct a background check as part of the hiring process. By signing below, I authorize this screening for employment purposes.', type: 'info', required: false },
        { id: 'signature', label: 'Signature', type: 'signature', required: true },
      ],
    },
  ],
  settings: {
    submitText: 'SUBMIT',
    successMessage: "Thanks for applying! We'll reach out within 24-48 hours.",
    active: true,
  },
};

// Default job post — simple title + body
export const initialJobPost = {
  title: 'Landscaping Team Member',
  body: '',
};
