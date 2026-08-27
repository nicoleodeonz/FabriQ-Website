import { API_BASE_URL } from './apiConfig';

export interface InventoryStatusEntry {
  status: string;
  count: number;
  percentage: number;
}

export interface OrderStatusEntry {
  status: string;
  count: number;
  percentage: number;
}

export interface InventoryValueData {
  total: number;
  byStatus: Record<string, number>;
}

export interface AppointmentOverviewEntry {
  status: string;
  count: number;
  percentage: number;
}

export interface BusinessActivityEntry {
  date: string;
  orders: number;
  rentals: number;
  appointments: number;
  customOrders: number;
}

export interface RecentActivityEntry {
  date: string;
  type: 'Rental' | 'Appointment' | 'Custom Order';
  title: string;
  customer: string;
  status: string;
  branch: string;
  referenceId?: string;
}

export interface GeneralAnalyticsResponse {
  inventoryStatus: InventoryStatusEntry[];
  orderStatus: OrderStatusEntry[];
  appointmentOverview: AppointmentOverviewEntry[];
  bespokeOverview: OrderStatusEntry[];
}

export interface BusinessActivityResponse {
  businessActivity: BusinessActivityEntry[];
}

export interface RecentActivityResponse {
  recentActivity: RecentActivityEntry[];
}

export async function getGeneralAnalytics(
  token: string,
  options: {
    branch?: string;
    startDate?: string;
    endDate?: string;
  } = {}
): Promise<GeneralAnalyticsResponse> {
  const params = new URLSearchParams();
  if (options.branch) params.set('branch', options.branch);
  if (options.startDate) params.set('startDate', options.startDate);
  if (options.endDate) params.set('endDate', options.endDate);

  const response = await fetch(`${API_BASE_URL}/analytics/general-analytics?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || 'Failed to load general analytics.');
  return data as GeneralAnalyticsResponse;
}

export async function getBusinessActivityAnalytics(
  token: string,
  options: {
    branch?: string;
    startDate?: string;
    endDate?: string;
    granularity?: 'daily' | 'weekly' | 'monthly';
  } = {}
): Promise<BusinessActivityResponse> {
  const params = new URLSearchParams();
  if (options.branch) params.set('branch', options.branch);
  if (options.startDate) params.set('startDate', options.startDate);
  if (options.endDate) params.set('endDate', options.endDate);
  if (options.granularity) params.set('granularity', options.granularity);

  const response = await fetch(`${API_BASE_URL}/analytics/business-activity?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || 'Failed to load business activity analytics.');
  return data as BusinessActivityResponse;
}

export async function getRecentActivityAnalytics(
  token: string,
  options: {
    branch?: string;
    limit?: number;
  } = {}
): Promise<RecentActivityResponse> {
  const params = new URLSearchParams();
  if (options.branch) params.set('branch', options.branch);
  if (options.limit) params.set('limit', String(options.limit));

  const response = await fetch(`${API_BASE_URL}/analytics/recent-activity?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || 'Failed to load recent activity analytics.');
  return data as RecentActivityResponse;
}
