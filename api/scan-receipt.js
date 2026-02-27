export const config = {
  maxDuration: 30,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
}
