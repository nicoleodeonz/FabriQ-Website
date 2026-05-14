function sanitizeJsonResponse(text) {
  const rawText = String(text || '').trim();
  if (!rawText) {
    throw new Error('Gemini returned an empty response.');
  }

  const fencedMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fencedMatch ? fencedMatch[1].trim() : rawText;
}

function normalizeNarrativeSection(items, limit) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, limit);
}

function normalizePesoNotation(value) {
  return String(value || '')
    .replace(/\b(?:USD|US\$)\s*/gi, 'Php ')
    .replace(/\bPHP\s*/gi, 'Php ')
    .replace(/\$(?=\s*\d)/g, 'Php ');
}

function normalizeNarrativePayload(payload) {
  const narrative = payload && typeof payload === 'object' ? payload : {};

  return {
    headline: normalizePesoNotation(String(narrative.headline || '').trim()) || 'Store performance narrative',
    summary: normalizePesoNotation(String(narrative.summary || '').trim()) || 'No AI summary was generated for this export.',
    highlights: normalizeNarrativeSection(narrative.highlights, 4).map(normalizePesoNotation),
    risks: normalizeNarrativeSection(narrative.risks, 3).map(normalizePesoNotation),
    recommendedActions: normalizeNarrativeSection(narrative.recommendedActions, 3).map(normalizePesoNotation),
  };
}

function buildAnalyticsNarrativePrompt(input) {
  return [
    'You write concise executive narratives for analytics PDF exports.',
    'Use only the provided data.',
    'Do not invent causes, trends, reasons, or branch behavior that are not supported by the data.',
    'Prefer concrete observations grounded in totals, row counts, and chart values.',
    'Keep the tone professional and plain.',
    'Return valid JSON only with this exact shape:',
    '{',
    '  "headline": "string",',
    '  "summary": "string",',
    '  "highlights": ["string"],',
    '  "risks": ["string"],',
    '  "recommendedActions": ["string"]',
    '}',
    'Constraints:',
    '- summary: 2 to 4 sentences',
    '- highlights: up to 4 bullets',
    '- risks: up to 3 bullets',
    '- recommendedActions: up to 3 bullets',
    '- Mention branch names only if they appear in the input data',
    '- Mention chart trends only if chart data is present in the input data',
    '- Use Philippine peso formatting for money values and always write them as Php 123,456, never $, USD, or ₱',
    '',
    'Analytics data:',
    JSON.stringify(input, null, 2),
  ].join('\n');
}

async function callGeminiForNarrative(prompt) {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  const model = String(process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: 'application/json',
      },
    }),
  });

  const responseBody = await response.json().catch(() => null);
  if (!response.ok) {
    const message = responseBody?.error?.message || 'Gemini request failed.';
    throw new Error(message);
  }

  const text = responseBody?.candidates?.[0]?.content?.parts?.map((part) => String(part?.text || '')).join('') || '';
  const parsed = JSON.parse(sanitizeJsonResponse(text));
  return normalizeNarrativePayload(parsed);
}

export async function generateAnalyticsNarrative(input) {
  return callGeminiForNarrative(buildAnalyticsNarrativePrompt(input));
}

export async function generateStoreOverviewNarrative(input) {
  return generateAnalyticsNarrative({
    reportType: 'store-overview',
    reportTitle: 'Store Overview Report',
    ...input,
  });
}
