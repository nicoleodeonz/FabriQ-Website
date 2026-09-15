const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

export function isProviderLimitError(error) {
  const message = String(error instanceof Error ? error.message : error || '').toLowerCase();
  return (
    message.includes('quota') ||
    message.includes('rate limit') ||
    message.includes('rate_limit') ||
    message.includes('too many requests') ||
    message.includes('billing') ||
    message.includes('resource exhausted') ||
    message.includes('temporarily unavailable') ||
    message.includes('gemini_api_key is not configured')
  );
}

export async function callGroq({ prompt, temperature = 0.25, responseFormat = null }) {
  const apiKey = String(process.env.GROQ_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured.');
  }

  const model = String(process.env.GROQ_MODEL || 'llama-3.3-70b-versatile').trim();
  const body = {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature,
    max_tokens: 1024,
  };

  if (responseFormat) {
    body.response_format = responseFormat;
  }

  const response = await fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseBody = await response.json().catch(() => null);
  if (!response.ok) {
    const message = responseBody?.error?.message || 'Groq request failed.';
    throw new Error(message);
  }

  const text = responseBody?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Groq returned an empty response.');
  }

  return text.trim();
}