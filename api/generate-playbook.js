export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { title, goal, context, nonNegotiables, tone } = req.body;

  if (!title || !goal) {
    return res.status(400).json({ error: 'Title and goal are required' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const systemPrompt = `You are an expert at creating clear, actionable playbooks for lawn care and landscaping businesses.

Your playbooks should be:
- Practical and easy to follow
- Written for the specified audience
- Structured with clear sections and steps
- Focused on the goal provided
- CONCISE - aim for 400-600 words max

Output format: Return ONLY valid HTML content (no markdown). Use these tags:
- <h2> for main section headers
- <h3> for subsection headers
- <p> for paragraphs
- <ul> and <li> for bullet lists
- <ol> and <li> for numbered steps
- <strong> for emphasis

Do not include any preamble, just start with the content. Be concise.`;

  const userPrompt = `Create a playbook with the following details:

**Title:** ${title}

**Goal:** ${goal}
${context ? `\n**Context/Audience:** ${context}` : ''}
${nonNegotiables ? `\n**Non-Negotiables (must be included):** ${nonNegotiables}` : ''}
${tone ? `\n**Tone:** ${tone}` : ''}

Generate a concise playbook (400-600 words). Include:
1. Brief overview (2-3 sentences)
2. Key steps or instructions
3. A few tips or warnings`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1024,
        messages: [
          { role: 'user', content: userPrompt }
        ],
        system: systemPrompt,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Anthropic API error:', errorData);
      return res.status(response.status).json({ error: 'Failed to generate playbook: ' + errorData });
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '';

    return res.status(200).json({
      content,
      usage: data.usage
    });
  } catch (error) {
    console.error('Error calling Anthropic API:', error);
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'Request timed out. Please try again.' });
    }
    return res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
}
