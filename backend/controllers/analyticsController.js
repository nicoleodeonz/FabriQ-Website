import { generateAnalyticsNarrative, generateStoreOverviewNarrative } from '../services/geminiNarrativeService.js';
import { isElevatedRole } from '../utils/roles.js';

function ensureElevatedAccess(req, res) {
  if (!isElevatedRole(req.user?.role)) {
    res.status(403).json({ message: 'Access denied' });
    return false;
  }

  return true;
}

export async function createAnalyticsNarrative(req, res) {
  try {
    if (!ensureElevatedAccess(req, res)) {
      return;
    }

    const narrative = await generateAnalyticsNarrative(req.body || {});
    return res.json({ narrative });
  } catch (error) {
    console.error('createAnalyticsNarrative error:', error);
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to generate analytics narrative.' });
  }
}

export async function createStoreOverviewNarrative(req, res) {
  try {
    if (!ensureElevatedAccess(req, res)) {
      return;
    }

    const narrative = await generateStoreOverviewNarrative(req.body || {});
    return res.json({ narrative });
  } catch (error) {
    console.error('createStoreOverviewNarrative error:', error);
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to generate store overview narrative.' });
  }
}
