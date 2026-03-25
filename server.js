import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import ghlWebhookHandler from './lib/commander/ghlWebhook.js';
import jobberSyncHandler from './lib/commander/jobberSync.js';
import commanderSummaryHandler from './api/commander/summary.js';
import dominateHandler from './api/commander/dominate.js';
import appStateHandler from './api/app-state.js';
import jobberAuth from './api/jobber-auth.js';
import jobberCallback from './api/jobber-callback.js';
import mowingHandler from './api/mowing.js';
import qbAuth from './api/qb-auth.js';
import qbCallback from './api/qb-callback.js';
import qbData from './api/qb-data.js';
import jobberDataHandler from './api/jobber-data.js';

config({ path: '.env.local' });

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Commander routes
app.post('/api/commander/ghlWebhook', ghlWebhookHandler);
app.post('/api/commander/jobberSync', jobberSyncHandler);
app.get('/api/commander/summary', commanderSummaryHandler);
app.get('/api/commander/dominate', dominateHandler);
app.all('/api/app-state', appStateHandler);

// Mowing (GET = schedule, POST = notify)
app.all('/api/mowing', mowingHandler);

// Jobber OAuth
app.get('/api/jobber-auth', jobberAuth);
app.get('/api/jobber-callback', jobberCallback);

// QuickBooks OAuth + Data
app.get('/api/qb-auth', qbAuth);
app.get('/api/qb-callback', qbCallback);
app.all('/api/qb-data', qbData);

// Jobber data (clients search + labor data)
app.get('/api/jobber-data', jobberDataHandler);

// Backwards compat routes (Express 5: req.query is read-only, so redirect instead)
app.get('/api/jobber-clients', (req, res) => res.redirect(`/api/jobber-data?action=clients&${new URL(req.url, 'http://x').search.slice(1)}`));
app.get('/api/labor-data', (req, res) => res.redirect(`/api/jobber-data?action=labor&${new URL(req.url, 'http://x').search.slice(1)}`));

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

  const systemPrompt = `Your job is to follow the spec exactly, not "make something nice."

NON-NEGOTIABLE OUTPUT CONSTRAINTS
- Output MUST be valid HTML only (no markdown, no plaintext, no intro).
- Start immediately with: <h2>SUCCESS LOOKS LIKE</h2>
- Use bullet lists only. Never use paragraphs.
- Use nested <ul> for sub-details. Do not cram multiple ideas into one long line.

STRUCTURE (MUST FOLLOW THIS ORDER)
1) <h2>SUCCESS LOOKS LIKE</h2> with 2–4 <li> items.
2) <h2>PROCEDURE</h2>
   - <h3>Arrival & Prep</h3>
   - IF the owner input contains "ORDER OF OPERATIONS", you MUST include:
     <h3>Order of Operations</h3> immediately after Arrival & Prep.
     Do NOT merge it into any other phase.
   - Then remaining phases as <h3>...</h3> in logical order.
3) <h2>WATCH OUT FOR</h2> with 2–4 <li> items using:
   <li><strong>Mistake</strong> — description</li>

CONTENT RULES
- The owner's non-negotiables MUST all appear somewhere in PROCEDURE.
- You may reorganize for clarity, but you may not omit items.
- Add "why" only for non-obvious instructions.
- If the owner already includes a why using an em dash, do not add an additional why.
- When a topic has multiple sub-points (example: Turning technique), make it a parent bullet with nested sub-bullets. Do not leave it as one long sentence.
- This is for ${audience}.

FINAL CHECK BEFORE YOU ANSWER
- Confirm you included <h3>Order of Operations</h3> if the owner input had it.
- Confirm the output contains only HTML tags and lists.
- If any constraint is violated, rewrite the output until it passes.`;

  const userPrompt = `Create a playbook for: "${serviceName}"

THE OWNER'S PROCEDURE (use this as the basis for the PROCEDURE section — these are the actual steps, format them properly and add "why" explanations):
${nonNegotiables}

IMPORTANT:
- The owner's non-negotiables above are things that MUST be included — but you should reorganize them for better flow, hierarchy, and understanding.
- CRITICAL: If the owner includes an "ORDER OF OPERATIONS" section, you MUST keep it as its own <h3>Order of Operations</h3> section right after Arrival & Prep. Do NOT merge it into other sections. This defines the sequence of the entire job.
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

app.post('/api/scan-receipt', async (req, res) => {
  const { image } = req.body;
  if (!image) {
    return res.status(400).json({ error: 'Image is required' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OpenAI API key not configured. Add OPENAI_API_KEY to .env.local' });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract the following from this receipt image and return ONLY valid JSON with no other text:\n{\n  "payee": "store/business name",\n  "description": "brief summary of items purchased",\n  "items": [\n    { "name": "item name", "price": 0.00 }\n  ],\n  "amount": 0.00,\n  "date": "YYYY-MM-DD"\n}\nRules:\n- "items" is an array of every line item on the receipt with its individual price as a number.\n- "amount" is the receipt total as a number (no currency symbol).\n- If you cannot determine a field, use null. If no line items are legible, return an empty items array.',
              },
              {
                type: 'image_url',
                image_url: { url: image },
              },
            ],
          },
        ],
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenAI API error:', errorData);
      return res.status(response.status).json({ error: 'Failed to scan receipt' });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Parse the JSON from the response (handle markdown code blocks)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Could not parse AI response' });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return res.status(200).json(parsed);
  } catch (error) {
    console.error('Scan receipt error:', error);
    return res.status(500).json({ error: error.message });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`API server running at http://localhost:${PORT}`);
});
