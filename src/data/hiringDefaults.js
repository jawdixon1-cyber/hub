// Default hiring page content — matches heyjudeslawncare.com/grow
export const initialHiringContent = {
  hero: {
    badge: '5.0 Stars | 151 Reviews | Rock Hill, SC',
    title: "Start as a Landscaping Helper.\nGrow Into a Team Lead.",
    subtitle: "Hey Jude's Lawn Care has tripled every year. We're looking for reliable people to join our team and grow with us.",
    cta: 'Apply Now',
    note: '',
  },
  whatYouGet: {
    intro: "Here's what you get when you join our team.",
    items: [
      'A stable, full-time job. 40 hours a week, overtime available.',
      'A clear path to more responsibility and pay',
      "People don't quit jobs, they quit bosses. Our focus is on good culture, a strong work environment, clear standards, and real systems.",
    ],
    callout: "We're building something real. If you want to grow with us, there's a spot for you.",
  },
  whatWeDo: {
    intro: "Our focus is on becoming the best version of ourselves and giving the best service to our clients.",
    items: [],
    callout: "We want to be the best in our field. Best doesn't mean the fastest, the cheapest, or the most profitable. It means ensuring a perfect client experience, not missing spots, not causing confusion, and keeping everyone happy. Our team, ourselves, and our clients.",
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
      'Keep Your Word',
      'Never Quit',
    ],
  },
  whatYoullDo: {
    intro: "You'll start as a team member on an active crew. Here's the day-to-day:",
    dailyWork: [
      'Mowing, string-trimming, edging, blowing',
      'Bush trimming & small tree cutting',
      'Weed removal & spraying',
      'Mulch & pine straw installs',
      'Hauling debris to landfill',
    ],
    howYoullLearn: [
      'Support the current lead and learn our processes for quality and efficiency',
      'Follow playbooks and walkthrough videos to ensure quality work on every job',
    ],
  },
  teamLead: {
    intro: 'This is where you\'re headed if you show up, learn the systems, and earn it.',
    items: [
      'Lead jobs independently',
      'Drive company vehicle and trailer',
      'Work with and manage team members on-site',
      'Communicate with clients and the office',
      'Ensure work meets company quality and safety standards',
    ],
    callout: 'We promote from within. Team leads start as team members who prove they can be counted on.',
  },
  howWeRun: {
    intro: '',
    cards: [
      { title: 'Playbooks', body: "Every service has a playbook. You'll know exactly how to do the job right before you start." },
      { title: 'Small Crews', body: "You'll work in a small, tight crew, not a rotating cast of strangers. Same people, same standards, same accountability." },
      { title: 'Walkthrough Videos', body: "For property-specific details and bigger projects, we use walkthrough videos so you know exactly what to expect on site." },
    ],
    callout: "You won't be thrown into a job wondering what to do. We set you up to succeed from day one.",
  },
  payBenefits: {
    compensation: [
      'Starting at $16/hr as a team member (paid trial day to start)',
      'Raises on base pay for consistent reliability',
      'Growth path: Team Member to Team Lead with higher base pay and responsibility',
    ],
    scheduleCulture: [
      'Schedule: Full-time, 40 hours a week, overtime allowed',
      'Work with the #1 Google-rated lawn care company in Rock Hill.',
      "Respectful leadership. People don't quit jobs, they quit bosses. Our priority is a fair, respectful work environment.",
      'Your voice matters. If you have ideas to make a job easier, faster, or better, we want to hear them.',
      "We're always reinvesting in our team. Better equipment, better processes, better systems so you can do your best work.",
      "Medical insurance is on our roadmap. Once we have a full team of 4, we're adding health coverage for the crew.",
    ],
  },
  requirements: {
    mustHave: [
      '1+ year landscaping experience with a company. We will verify this with your previous employer, so please be honest.',
      'Physical ability to lift 50lb+ and work outdoors in all weather',
      'Reliable, professional, respectful attitude',
      "Valid driver's license",
    ],
    preferred: [
      'Own a reliable truck that can haul a trailer (mileage paid)',
    ],
    preferredNote: 'Not required, but preferred.',
    callouts: [
      "Honesty is non-negotiable. Don't lie to us about anything. We do run background checks, so if you have a record, just be upfront about it. Being honest won't automatically disqualify you. Lying about it will.",
    ],
  },
  goodFit: [
    { title: 'You show up on time', body: "Reliability matters more than experience. If you're where you say you'll be, when you say you'll be there, you're already ahead." },
    { title: 'You take pride in your work', body: "You don't cut corners. When you finish something, you want it to look right, not just done." },
    { title: 'You work well on a team', body: "Our crews move fast and communicate clearly. You don't have to be the loudest person, just someone others can count on." },
    { title: 'You want to grow', body: "This isn't a dead-end gig. We promote from within. Team members who learn the systems and lead well move into team lead roles." },
    { title: 'You can handle the outdoors', body: "It gets hot. It's hard work. Rain, heat, cold. This is not for the faint of heart. If that's not for you, don't apply." },
  ],
  notAFit: [
    'You need someone to constantly remind you what to do',
    "You're looking for something low-effort where nobody checks the work",
    'Showing up on time is something you struggle with regularly',
    "You don't care how the finished product looks",
    'You just need quick cash for a week or two and plan to move on',
  ],
  notAFitCallout: "No hard feelings. We just know what works here, and we'd rather you find the right fit too.",
  bottomCta: {
    title: 'Ready to apply?',
    subtitle: "It takes a few minutes. Be honest. We verify everything and dishonesty is an automatic disqualification.",
  },
};

// Application form — 6 steps
export const initialApplicationForm = {
  steps: [
    {
      id: 'applicant-info',
      title: 'About You',
      fields: [
        { id: 'name', label: 'Full Name', type: 'short', required: true, placeholder: 'First and last name' },
        { id: 'phone', label: 'Phone', type: 'phone', required: true, placeholder: 'Phone' },
        { id: 'email', label: 'Email', type: 'email', required: true, placeholder: 'Email' },
        { id: 'city_zip', label: 'City and ZIP code', type: 'short', required: true, placeholder: '' },
        { id: 'dob', label: 'Date of birth', type: 'short', required: true, placeholder: 'MM/DD/YYYY', description: 'Used only to confirm age and eligibility for this role' },
        { id: 'gender', label: 'Gender', type: 'dropdown', required: false, options: ['Male', 'Female', 'Prefer not to say'] },
      ],
    },
    {
      id: 'job-requirements',
      title: 'Can You Do This Job?',
      fields: [
        { id: 'fulltime_understand', label: 'Do you understand this is a full-time role?', type: 'radio', required: true, options: ['Yes', 'No'] },
        { id: 'reliable_transport', label: 'Can you reliably get to our shop in Rock Hill, SC each workday?', type: 'radio', required: true, options: ['Yes', 'No'] },
        { id: 'drivers_license', label: 'Do you have a valid driver\'s license?', type: 'radio', required: true, options: ['Yes', 'No'] },
        { id: 'physical_ability', label: 'Can you operate equipment, lift 50+ lbs, and work outdoors in heat, rain, and cold?', type: 'radio', required: true, options: ['Yes', 'No'] },
        { id: 'tobacco_use', label: 'Do you currently use tobacco or nicotine products?', type: 'radio', required: true, options: ['Yes', 'No'] },
        { id: 'tobacco_policy', label: 'If yes, are you willing to leave all substances at home? No tobacco, nicotine, or any substances on the job, in company vehicles, or on job sites. Zero exceptions.', type: 'radio', required: false, options: ['Yes', 'No'] },
        { id: 'background_check', label: 'Is there anything that may come up on a background check?', type: 'radio', required: true, options: ['No', 'Yes'], description: 'We will run a background check on every applicant. Having something on your record does not disqualify you. We are looking for honest people. Lying about it will disqualify you.' },
        { id: 'background_detail', label: 'If yes, explain.', type: 'long', required: false, placeholder: '' },
      ],
    },
    {
      id: 'experience',
      title: 'Landscaping Experience',
      fields: [
        { id: 'years_landscaping', label: 'How many years of landscaping experience do you have (with a company)?', type: 'dropdown', required: true, options: ['None', 'Less than 1 year', '1-2 years', '3-5 years', '5+ years'] },
        { id: 'skills', label: 'Which of these have you done professionally (at a landscaping company, not just your own yard)?', type: 'multi', required: false, options: [
          'Ride-on Mowers',
          'Weed-Eating',
          'Edging',
          'Blowing',
          'Trimming Hedges',
          'Weeding',
          'Chainsawing Small Trees',
          'Spreading Pine Needles',
          'Spreading Mulch',
          'Ride-on Aerators',
          'Overseeding',
          'NO EXPERIENCE',
        ] },
        { id: 'leadership_exp', label: 'Any leadership experience?', type: 'dropdown', required: false, options: ['None', 'Some (informal)', 'Led a small team', 'Managed crews/teams'] },
        { id: 'leadership_detail', label: 'If yes, tell us about it. What did you lead and what were you responsible for?', type: 'long', required: false, placeholder: '' },
      ],
    },
    {
      id: 'employment-history',
      title: 'Work History',
      fields: [
        { id: 'worked_landscaping_year', label: 'Have you worked with a landscaping company for 1+ year?', type: 'radio', required: true, options: ['Yes', 'No'] },
        { id: 'recent_company', label: 'What was the company name?', type: 'short', required: false, placeholder: '' },
        { id: 'recent_title', label: 'What was your role/title?', type: 'short', required: false, placeholder: '' },
        { id: 'employer_name', label: "What was your employer's name?", type: 'short', required: false, placeholder: '' },
        { id: 'employer_phone', label: "What was your employer's phone number?", type: 'phone', required: false, placeholder: '' },
        { id: 'recent_dates', label: 'How long did you work there?', type: 'short', required: false, placeholder: 'e.g. March 2024 - January 2025' },
        { id: 'reason_leaving', label: 'Why did you leave?', type: 'long', required: false, placeholder: '' },
      ],
    },
    {
      id: 'going-forward',
      title: 'Getting Started',
      fields: [
        { id: 'start_date', label: 'When can you start working with us?', type: 'short', required: true, placeholder: 'e.g. Immediately, April 20, etc.' },
        { id: 'availability', label: 'What days and times can you work? (We don\'t work Sundays)', type: 'multi', required: true, options: ['Weekdays 8:00-5:00', 'Saturdays 8:00-5:00', 'Flexible / Open availability'] },
        { id: 'how_long', label: 'If we\'re a good fit, how long can you see yourself working with us?', type: 'dropdown', required: true, options: ['Just trying it out', 'A few months', '6 months to 1 year', '1+ years', 'Long-term / as long as it works'] },
      ],
    },
    {
      id: 'read-carefully',
      title: 'Certification & Signature',
      fields: [
        { id: 'certification', label: 'I certify that the information provided in this application is true and complete to the best of my knowledge. I understand that false or misleading information may disqualify me from employment or result in dismissal if discovered later.\n\nI authorize Hey Jude\'s Lawn Care to contact any references or employers listed above for the purpose of verifying employment and qualifications.\n\nHey Jude\'s Lawn Care may conduct a background check as part of the hiring process. By signing below, I authorize this screening for employment purposes.', type: 'info', required: false },
        { id: 'signature', label: 'Signature', type: 'signature', required: true },
        { id: 'todays_date', label: 'Today\'s Date', type: 'short', required: true, placeholder: 'MM/DD/YYYY' },
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
