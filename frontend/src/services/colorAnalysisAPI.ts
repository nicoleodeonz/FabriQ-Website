import { API_BASE_URL } from './apiConfig';

export interface ColorAnalysisEntry {
  label: string;
  count: number;
}

export interface ColorAnalysisSummary {
  skinTones: ColorAnalysisEntry[];
  suggestedColors: ColorAnalysisEntry[];
  suggestedGowns: ColorAnalysisEntry[];
}

export async function getColorAnalysisSummary(token: string): Promise<ColorAnalysisSummary> {
  const response = await fetch(`${API_BASE_URL}/analytics/color-analysis-summary`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || 'Failed to load color analysis summary.');
  }

  return data as ColorAnalysisSummary;
}