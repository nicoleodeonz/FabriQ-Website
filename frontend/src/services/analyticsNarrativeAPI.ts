import { API_BASE_URL } from './apiConfig';

export interface AnalyticsNarrativePayload {
  reportType: string;
  reportTitle: string;
  generatedAt: string;
  filters?: Record<string, string>;
  totals?: Record<string, string | number>;
  tables?: Array<{
    title: string;
    columns: string[];
    rowCount: number;
    sampleRows: string[][];
  }>;
  charts?: Array<{
    title: string;
    dataPoints: Array<{ label: string; value: string | number }>;
  }>;
  notes?: string[];
}

export interface StoreOverviewNarrativePayload extends AnalyticsNarrativePayload {
  generatedAt: string;
  branchFilter: string;
  comparisonMetric: string;
  totals: {
    totalSales: number;
    numberOfOrders: number;
    newCustomers: number;
    topSellingItem: string;
    topSellingCount: number;
  };
  branchComparisons: Array<{
    branch: string;
    revenue: number;
    rents: number;
    appointments: number;
    bespoke: number;
  }>;
  mostRentedItems: Array<{ name: string; count: number }>;
  leastRentedItems: Array<{ name: string; count: number }>;
  itemsPerCategory: Array<{ category: string; count: number }>;
}

export interface AnalyticsNarrative {
  headline: string;
  summary: string;
  highlights: string[];
  risks: string[];
  recommendedActions: string[];
}

export type StoreOverviewNarrative = AnalyticsNarrative;

async function parseJsonSafe(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function getErrorMessage(defaultMessage: string, body: unknown) {
  if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') {
    return body.message;
  }
  return defaultMessage;
}

export async function generateAnalyticsReportNarrative(
  token: string,
  payload: AnalyticsNarrativePayload,
): Promise<AnalyticsNarrative> {
  const response = await fetch(`${API_BASE_URL}/analytics/report-narrative`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const body = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(getErrorMessage('Failed to generate AI narrative.', body));
  }

  if (!body?.narrative) {
    throw new Error('Failed to generate AI narrative: empty server response.');
  }

  return body.narrative as AnalyticsNarrative;
}

export async function generateStoreOverviewNarrative(
  token: string,
  payload: StoreOverviewNarrativePayload,
): Promise<StoreOverviewNarrative> {
  return generateAnalyticsReportNarrative(token, {
    reportType: 'store-overview',
    reportTitle: 'Store Overview Report',
    ...payload,
  });
}
