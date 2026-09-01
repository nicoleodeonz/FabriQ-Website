import { GoogleGenAI } from '@google/genai';
import CustomerMeasurement from '../models/CustomerMeasurement.js';

const MEASUREMENT_FIELDS = [
  'height',
  'shoulderWidth',
  'chest',
  'waist',
  'hips',
  'armLength',
  'inseam',
  'torsoLength',
  'neck',
];

function parseJsonSafely(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return null;
  }

  const trimmed = rawText.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch (innerError) {
        return null;
      }
    }
    return null;
  }
}

function extractGeminiAnalysisText(response) {
  if (typeof response?.text === 'string' && response.text.trim()) {
    return response.text.trim();
  }

  if (typeof response?.response?.text === 'string' && response.response.text.trim()) {
    return response.response.text.trim();
  }

  const candidateText = Array.isArray(response?.candidates)
    ? response.candidates
        .map((candidate) => candidate?.content?.parts || [])
        .flat()
        .map((part) => String(part?.text || ''))
        .join('')
    : '';

  return candidateText.trim();
}

function normalizeMeasurementObject(rawMeasurements) {
  const normalized = {};

  for (const field of MEASUREMENT_FIELDS) {
    const value = rawMeasurements && typeof rawMeasurements === 'object' ? rawMeasurements[field] : undefined;
    const parsed = Number(value);
    normalized[field] = Number.isFinite(parsed) ? parsed : null;
  }

  return normalized;
}

function buildBodyMeasurementPrompt(height) {
  return `You are analyzing a single full-body photo for digital body measurement estimation.

STAGE 1: Validate the photo.
Return JSON ONLY in this format:
{"imageSuitable": true|false, "reason": "brief explanation"}

Rules:
- Exactly one person is in the photo.
- Full body is visible from head to feet.
- Person is facing the camera directly.
- Standing upright with arms and legs visible.
- No major obstructions, no cropping, no heavy shadows, and good lighting.
- The person is not in motion or distorted.

STAGE 2: Only if the photo passes validation.
Use the provided height in centimeters as the scale reference.
Estimate the following body measurements in centimeters:
shoulderWidth, chest, waist, hips, armLength, inseam, torsoLength, neck.

Return JSON ONLY in this format:
{"imageSuitable": true, "measurements": {"shoulderWidth": number, "chest": number, "waist": number, "hips": number, "armLength": number, "inseam": number, "torsoLength": number, "neck": number}, "reason": "brief explanation"}

Important rules:
- Use only numeric values.
- Keep values realistic for the provided height reference.
- If a measurement cannot be estimated confidently, set that measurement to null.
- Do not include markdown fences or extra text.
- Provided height reference (cm): ${height}
`;
}

async function callGeminiForBodyMeasurement({ image, mimeType, height }) {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  const base64Image = String(image || '').trim();
  if (!base64Image) {
    throw new Error('Image data is required.');
  }

  const cleanedBase64 = base64Image.replace(/^data:.*;base64,/, '').replace(/\s+/g, '');
  const detectionMimeType = String(mimeType || 'image/jpeg').trim() || 'image/jpeg';

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          { text: buildBodyMeasurementPrompt(height) },
          { inlineData: { mimeType: detectionMimeType, data: cleanedBase64 } },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
    },
  });

  const responseText = extractGeminiAnalysisText(response);
  if (!responseText) {
    throw new Error('Gemini returned an empty analysis response.');
  }

  const parsed = parseJsonSafely(responseText);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Gemini returned an invalid JSON analysis payload.');
  }

  return parsed;
}

export const analyzeImage = async (req, res) => {
  try {
    const { image, mimeType, height } = req.body || {};
    const parsedHeight = Number(height);

    if (typeof height === 'undefined' || Number.isNaN(parsedHeight) || parsedHeight < 100 || parsedHeight > 250) {
      return res.status(400).json({
        success: false,
        error: 'Height must be a number between 100 and 250 cm.',
      });
    }

    const geminiResult = await callGeminiForBodyMeasurement({ image, mimeType, height: parsedHeight });
    const imageSuitable = Boolean(geminiResult?.imageSuitable);
    const reason = typeof geminiResult?.reason === 'string' ? geminiResult.reason : '';

    let measurements = null;
    if (imageSuitable) {
      const rawMeasurements = geminiResult?.measurements && typeof geminiResult.measurements === 'object'
        ? geminiResult.measurements
        : {};
      measurements = normalizeMeasurementObject(rawMeasurements);
    }

    if (!imageSuitable) {
      measurements = null;
    }

    const safeAnalysis = {
      imageSuitable,
      measurements,
      reason,
    };

    return res.json({ success: true, analysis: safeAnalysis });
  } catch (error) {
    console.error('Body measurement analysis failed:', error);
    const status = error?.status || 500;
    return res.status(status >= 400 && status < 600 ? status : 500).json({
      success: false,
      error: 'Unable to analyze the provided photo at this time.',
    });
  }
};

export const getMeasurements = async (req, res) => {
  try {
    const { customerId } = req.params;
    if (!customerId) {
      return res.status(400).json({ success: false, error: 'customerId is required.' });
    }

    const doc = await CustomerMeasurement.findOne({ customerId }).lean();

    const profile = {};
    for (const field of [...MEASUREMENT_FIELDS, 'measuredAt']) {
      profile[field] = doc?.[field] ?? null;
    }

    return res.json({ success: true, profile });
  } catch (error) {
    console.error('Get body measurements failed:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve measurements.',
    });
  }
};

export const saveMeasurements = async (req, res) => {
  try {
    const { customerId, measurements } = req.body || {};

    if (!customerId) {
      return res.status(400).json({ success: false, error: 'customerId is required.' });
    }

    if (!measurements || typeof measurements !== 'object' || Array.isArray(measurements) || Object.keys(measurements).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'measurements must be a non-empty object of numeric values.',
      });
    }

    const filteredMeasurements = {};
    for (const field of MEASUREMENT_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(measurements, field)) {
        const value = Number(measurements[field]);
        if (!Number.isFinite(value)) {
          return res.status(400).json({
            success: false,
            error: `Invalid measurement for ${field}. All values must be numeric numbers.`,
          });
        }
        filteredMeasurements[field] = value;
      }
    }

    if (Object.keys(filteredMeasurements).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one valid body measurement is required.',
      });
    }

    const measurementUpdate = {
      ...filteredMeasurements,
      measuredAt: new Date(),
    };

    const updatedDoc = await CustomerMeasurement.findOneAndUpdate(
      { customerId },
      { $set: measurementUpdate, $setOnInsert: { customerId } },
      { new: true, upsert: true, runValidators: true }
    );

    const profile = {};
    for (const field of [...MEASUREMENT_FIELDS, 'measuredAt']) {
      profile[field] = updatedDoc?.[field] ?? null;
    }

    return res.json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error('Save body measurements failed:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to save measurements.',
    });
  }
};
