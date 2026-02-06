import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';

config({ path: '.env.local' });

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/generate-playbook', async (req, res) => {
  const { serviceName, category, nonNegotiables } = req.body;

  if (!serviceName) {
    return res.status(400).json({ error: 'Service name is required' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured. Check .env.local' });
  }

  const audienceMap = {
    'Field Team': 'field crew members who do hands-on lawn care work',
    'Sales Team': 'sales representatives who interact with customers',
    'General Manager': 'managers who oversee operations and team',
  };

  const audience = audienceMap[category] || 'team members';

  const systemPrompt = `You create playbooks for lawn care crews. Scannable on the job, clear enough to train someone new.

STRUCTURE (this exact order):
1. SUCCESS LOOKS LIKE — 2-4 bullet points. The visual standard of "done right."
2. PROCEDURE — Organized by phase if the service has multiple parts. For EVERY instruction that isn't obvious, include the "why" after an em dash. Examples:
   - "Park outside the service area — keeps the work zone clear for edging"
   - "Mow the template lap first — shows cut height so trimmers know where to hold"
   - "String trim before mowing — mower runs over the clippings and makes them disappear"
   - "Keep both tires moving when turning — prevents ruts"
   The why helps them understand, not just follow. If they know why, they'll do it right even in weird situations.
3. WATCH OUT FOR — 2-4 common mistakes for THIS SPECIFIC SERVICE ONLY. Generate based on actual risks for this service. Do not use examples from other services.

WRITING RULES:
- No fluff. Write like a crew leader explaining to a new hire.
- Use hierarchy: nest related sub-details under main points. Group logically.
- Add "why" ONLY when it's not obvious. Don't explain "put on safety glasses" or "blow all hard surfaces." Do explain things like turning technique or order of operations.
- Don't double-explain. If the instruction already contains the why (e.g., "slow down over bumps — mower bounces and misses grass"), don't add another explanation after it.
- Reorganize sections to be more efficient if needed — group related items, put the most important things first, cut redundancy.
- Use vivid, memorable language — "zebra stripes" not "uneven lines." Make it stick.
- This is for ${audience}.

CRITICAL: Start IMMEDIATELY with <h2>SUCCESS LOOKS LIKE</h2>. No intro. No preamble.

HTML STRUCTURE (follow exactly):

For SUCCESS LOOKS LIKE:
<h2>SUCCESS LOOKS LIKE</h2>
<ul>
<li>Point one</li>
<li>Point two</li>
</ul>

For PROCEDURE with phases:
<h2>PROCEDURE</h2>
<h3>Phase Name</h3>
<ul>
<li>Main point
  <ul>
  <li>Nested detail or why</li>
  </ul>
</li>
<li>Another main point — with inline why after em dash</li>
</ul>

For WATCH OUT FOR:
<h2>WATCH OUT FOR</h2>
<ul>
<li><strong>Mistake name</strong> — description</li>
<li><strong>Another mistake</strong> — description</li>
</ul>

Use <strong> for key terms, <em> for clarifications. Always use bullet lists, never paragraphs.`;

  const userPrompt = `Create a playbook for: "${serviceName}"

THE OWNER'S PROCEDURE (use this as the basis for the PROCEDURE section — these are the actual steps, format them properly and add "why" explanations):
${nonNegotiables}

IMPORTANT:
- The owner's non-negotiables above are things that MUST be included — but you should reorganize them for better flow, hierarchy, and understanding.
- Structure it so a new hire can learn it easily. Group related concepts. Put foundational stuff first.
- Use nesting to show hierarchy — main points with sub-details underneath. Example: "Turning" is a main point, with sub-bullets for "keep both tires moving", "back up before 90-degree turns", "fix misalignment immediately".
- Add "why" only where it adds real value. Skip obvious ones.
- Make it scannable for someone checking it on the job, but thorough enough for training.
- Keep it tight. No fluff.`;

  try {
    console.log('Calling Claude API...');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 2048,
        messages: [{ role: 'user', content: userPrompt }],
        system: systemPrompt,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Anthropic API error:', errorData);
      return res.status(response.status).json({ error: 'Failed to generate playbook' });
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '';
    console.log('Generated playbook successfully');

    return res.status(200).json({ content, usage: data.usage });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`API server running at http://localhost:${PORT}`);
});
