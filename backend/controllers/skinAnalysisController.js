import SkinAnalysis from '../models/SkinAnalysis.js';
import CustomerAccount from '../models/Customer.js';
import { GoogleGenAI } from '@google/genai';

const SKIN_TONE_VALUES = ['fair', 'light', 'medium', 'tan', 'deep'];
const UNDERTONE_VALUES = ['warm', 'cool', 'neutral'];
const ALLOWED_COLOR_NAMES = [
  'Peach', 'Champagne', 'Coral', 'Warm Gold', 'Ivory', 'Blush', 'Rose Gold',
  'Lavender', 'Ice Blue', 'Soft Pink', 'Mint', 'Pearl', 'Lilac', 'Baby Blue',
  'Soft White', 'Dusty Rose', 'Sage', 'Cream', 'Mauve', 'Nude', 'Gold',
  'Warm Beige', 'Caramel', 'Butter Yellow', 'Apricot', 'Periwinkle',
  'Soft Teal', 'Dusty Lavender', 'Sky Blue', 'Rose', 'Powder Blue',
  'Blush Pink', 'Sage Green', 'Warm Taupe', 'Soft Coral', 'Warm Red',
  'Burnt Orange', 'Olive', 'Copper', 'Terracotta', 'Mustard', 'Emerald',
  'Royal Blue', 'Berry', 'Plum', 'Teal', 'Deep Lavender', 'Navy',
  'Warm Mauve', 'Mocha', 'Warm Orange', 'Deep Gold', 'Rust',
  'Chocolate Brown', 'Amber', 'Curry', 'Brick Red', 'Deep Teal',
  'Cobalt Blue', 'Magenta', 'Deep Plum', 'Indigo', 'Jewel Teal', 'Violet',
  'Warm Burgundy', 'Deep Rose', 'Bronze', 'Cognac', 'Warm Brown',
  'Bright Orange', 'Red', 'Warm Yellow', 'Flame', 'Electric Blue',
  'Hot Pink', 'Bright Purple', 'White', 'Fuchsia', 'Cobalt', 'Bright White',
  'Royal Purple',
];

function parseJsonSafely(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  const trimmed = rawText.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(trimmed.slice(start, end + 1)); } catch { return null; }
    }
    return null;
  }
}

function extractGeminiText(response) {
  if (typeof response?.text === 'string' && response.text.trim()) return response.text.trim();
  const candidateText = Array.isArray(response?.candidates)
    ? response.candidates.map((c) => c?.content?.parts || []).flat().map((p) => String(p?.text || '')).join('')
    : '';
  return candidateText.trim();
}

function hexToRgb(hex) {
  const clean = String(hex || '').replace('#', '');
  if (clean.length !== 6) return { r: 180, g: 140, b: 110 };
  return {
    r: parseInt(clean.slice(0, 2), 16) || 0,
    g: parseInt(clean.slice(2, 4), 16) || 0,
    b: parseInt(clean.slice(4, 6), 16) || 0,
  };
}

function buildSkinAnalysisPrompt() {
  return `You are analyzing a single photo for skin tone and color-matching
analysis for a bridal/formal-wear styling app.

STAGE 1: Validate the photo.
Rules for a usable photo: a clear, well-lit face or visible skin area, not
heavily obstructed, not extreme close-up/blur, no sunglasses covering the face.

STAGE 2: If suitable, analyze the visible skin tone directly from the photo
(not a guess — look at the actual color/luminosity of the skin shown) and
classify:
- skinTone: exactly one of ${JSON.stringify(SKIN_TONE_VALUES)}
- undertone: exactly one of ${JSON.stringify(UNDERTONE_VALUES)}
- skinHex: a hex color code approximating the person's actual skin tone

Then recommend 5 to 7 dress colors that would flatter this specific person,
chosen ONLY from this exact list (use the exact spelling/casing given):
${ALLOWED_COLOR_NAMES.join(', ')}

Also write a short (2-3 sentence) personalized insightText explaining, in
plain conversational language, why these colors suit them specifically —
reference their actual tone/undertone, not generic advice. Vary your wording
naturally between different people; do not use a templated phrase.

Return JSON ONLY in this exact format:
{"imageSuitable": true|false, "reason": "brief explanation", "skinTone": "...", "undertone": "...", "skinHex": "#rrggbb", "recommendedColors": ["...", "..."], "insightText": "..."}

If imageSuitable is false, omit skinTone/undertone/skinHex/recommendedColors/insightText
or set them to null.`;
}

async function callGeminiForSkinAnalysis({ image, mimeType }) {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');

  const base64Image = String(image || '').trim();
  if (!base64Image) throw new Error('Image data is required.');

  const cleanedBase64 = base64Image.replace(/^data:.*;base64,/, '').replace(/\s+/g, '');
  const detectionMimeType = String(mimeType || 'image/jpeg').trim() || 'image/jpeg';

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{
      role: 'user',
      parts: [
        { text: buildSkinAnalysisPrompt() },
        { inlineData: { mimeType: detectionMimeType, data: cleanedBase64 } },
      ],
    }],
    config: { responseMimeType: 'application/json' },
  });

  const responseText = extractGeminiText(response);
  if (!responseText) throw new Error('Gemini returned an empty analysis response.');

  const parsed = parseJsonSafely(responseText);
  if (!parsed || typeof parsed !== 'object') throw new Error('Gemini returned an invalid JSON analysis payload.');
  return parsed;
}

export const analyzeSkinTone = async (req, res) => {
  try {
    const { image, mimeType } = req.body || {};
    const geminiResult = await callGeminiForSkinAnalysis({ image, mimeType });
    const imageSuitable = Boolean(geminiResult?.imageSuitable);

    if (!imageSuitable) {
      return res.json({
        success: true,
        analysis: { imageSuitable: false, reason: geminiResult?.reason || 'Photo not suitable for analysis.' },
      });
    }

    const skinTone = SKIN_TONE_VALUES.includes(geminiResult.skinTone) ? geminiResult.skinTone : 'medium';
    const undertone = UNDERTONE_VALUES.includes(geminiResult.undertone) ? geminiResult.undertone : 'neutral';
    const skinHex = /^#[0-9a-fA-F]{6}$/.test(geminiResult.skinHex || '') ? geminiResult.skinHex : '#B08968';
    const recommendedColors = Array.isArray(geminiResult.recommendedColors)
      ? geminiResult.recommendedColors.filter((c) => ALLOWED_COLOR_NAMES.includes(c)).slice(0, 7)
      : [];
    const insightText = typeof geminiResult.insightText === 'string' ? geminiResult.insightText : '';

    return res.json({
      success: true,
      analysis: {
        imageSuitable: true,
        skinTone,
        undertone,
        skinHex,
        skinRgb: hexToRgb(skinHex),
        recommendedColors: recommendedColors.length > 0 ? recommendedColors : ['Champagne', 'Nude', 'Sage'],
        insightText,
      },
    });
  } catch (error) {
    console.error('Skin tone analysis failed:', error);
    return res.status(500).json({ success: false, error: 'Unable to analyze the provided photo at this time.' });
  }
};


export const saveSkinAnalysis = async (req, res) => {
  try {
    const customerId = req.user?.id || req.user?._id;
    if (!customerId) {
      return res.status(401).json({ message: 'Not authenticated.' });
    }

    const customer = await CustomerAccount.findById(customerId);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found.' });
    }

    const {
      skinTone,
      undertone,
      skinHex,
      skinRgb,
      recommendedColors,
      recommendedGownIds,
      insightText,
      branch,
    } = req.body;

    const analysis = new SkinAnalysis({
      customerId,
      customerName: `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.name || customer.email,
      email: customer.email,
      skinTone,
      undertone,
      skinHex: skinHex || '#000000',
      skinRgb: skinRgb || {},
      recommendedColors: recommendedColors || [],
      recommendedGownIds: (recommendedGownIds || []).filter((id) => id && String(id).length === 24),
      insightText: insightText || null,
      branch: branch || null,
    });

    await analysis.save();

    return res.status(201).json({
      message: 'Skin analysis saved.',
      analysisId: analysis._id,
    });
  } catch (err) {
    console.error('saveSkinAnalysis error:', err);
    return res.status(500).json({ message: 'Failed to save skin analysis.', error: err.message });
  }
};

export const updateSkinAnalysisApplied = async (req, res) => {
  try {
    const { analysisId } = req.params;
    const { selectedColor } = req.body;
    const customerId = req.user?.id || req.user?._id;

    const analysis = await SkinAnalysis.findById(analysisId);
    if (!analysis) {
      return res.status(404).json({ message: 'Analysis not found.' });
    }

    if (String(analysis.customerId) !== String(customerId)) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    analysis.appliedToOrder = true;
    analysis.selectedColor = selectedColor || null;
    await analysis.save();

    return res.json({ message: 'Analysis updated.' });
  } catch (err) {
    console.error('updateSkinAnalysisApplied error:', err);
    return res.status(500).json({ message: 'Failed to update analysis.', error: err.message });
  }
};

export const getAllSkinAnalyses = async (req, res) => {
  try {
    const analyses = await SkinAnalysis
      .find({})
      .sort({ scannedAt: -1 })
      .limit(100)
      .lean();
    return res.json({ analyses, total: analyses.length });
  } catch (err) {
    console.error('getAllSkinAnalyses error:', err);
    return res.status(500).json({ message: 'Failed to fetch analyses.' });
  }
};
