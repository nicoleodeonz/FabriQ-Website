const MESHY_BASE_URL = 'https://api.meshy.ai/openapi/v2';

export const submitGownGeneration = async (req, res) => {
  try {
    const { prompt } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ success: false, error: 'A prompt string is required.' });
    }

    const apiKey = String(process.env.MESHY_API_KEY || '').trim();
    if (!apiKey) {
      return res.status(500).json({ success: false, error: 'Meshy API key is not configured.' });
    }

    const response = await fetch(`${MESHY_BASE_URL}/text-to-3d`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mode: 'preview',
        prompt,
        art_style: 'realistic',
        negative_prompt: 'low quality, blurry, person, body, mannequin, background, ugly',
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ success: false, error: `Meshy submit failed: ${errText}` });
    }

    const data = await response.json();
    return res.json({ success: true, taskId: data.result });
  } catch (error) {
    console.error('Gown generation submit failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to start gown generation.' });
  }
};

export const getGownGenerationStatus = async (req, res) => {
  try {
    const { taskId } = req.params;
    const apiKey = String(process.env.MESHY_API_KEY || '').trim();
    if (!apiKey) {
      return res.status(500).json({ success: false, error: 'Meshy API key is not configured.' });
    }

    const response = await fetch(`${MESHY_BASE_URL}/text-to-3d/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      return res.status(response.status).json({ success: false, error: `Meshy poll failed: ${response.status}` });
    }

    const data = await response.json();
    return res.json({
      success: true,
      status: data.status,
      progress: data.progress ?? null,
      modelUrl: data.model_urls?.glb || data.model_urls?.obj || null,
      thumbnailUrl: data.thumbnail_url || null,
      errorMessage: data.task_error?.message || null,
    });
  } catch (error) {
    console.error('Gown generation status check failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to check generation status.' });
  }
};