import { buildApiUrl } from './apiConfig';

const API_BASE = buildApiUrl('/inventory');
export const INVENTORY_UPDATED_EVENT = 'inventory:updated';

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  color: string;
  size: string[];
  price: number;
  branch: string;
  status: 'available' | 'rented' | 'reserved' | 'maintenance' | 'archived';
  lastRented?: string | null;
  description?: string;
  image?: string;
  rating?: number;
  stock?: number;
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface BranchPerformanceStats {
  branch: string;
  totalProducts: number;
  totalStockUnits: number;
  availableProducts: number;
  rentedProducts: number;
  activeRentals: number;
  lowStockItems: number;
  outOfStockItems: number;
  totalItemsSold: number;
  inventoryTurnoverRate: number;
  inventoryValue: number;
}

export interface BranchPerformanceSummary {
  totalProducts: number;
  totalStockUnits: number;
  availableProducts: number;
  rentedProducts: number;
  activeRentals: number;
  lowStockItems: number;
  outOfStockItems: number;
  totalItemsSold: number;
  inventoryTurnoverRate: number;
  inventoryValue: number;
}

export type InventoryItemInput = Omit<InventoryItem, 'id' | 'sku' | 'createdAt' | 'updatedAt'>;

async function request<T>(
  url: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {})
    }
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || `Request failed: ${res.status}`);
  }
  return data as T;
}

async function requestPublic<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {})
    }
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || `Request failed: ${res.status}`);
  }
  return data as T;
}

export async function getInventory(token: string): Promise<InventoryItem[]> {
  const data = await request<{ items: InventoryItem[] }>(API_BASE, token);
  return data.items;
}

export async function getPublicInventory(): Promise<InventoryItem[]> {
  const data = await requestPublic<{ items: InventoryItem[] }>(`${API_BASE}/public`);
  return data.items;
}

export async function getArchivedInventory(token: string): Promise<InventoryItem[]> {
  const data = await request<{ items: InventoryItem[] }>(`${API_BASE}/archive`, token);
  return data.items;
}

export async function getBranchInventory(
  token: string,
  branch: string
): Promise<{ branch: string; stats: BranchPerformanceStats; items: InventoryItem[] }> {
  const encodedBranch = encodeURIComponent(branch);
  return request<{ branch: string; stats: BranchPerformanceStats; items: InventoryItem[] }>(
    `${API_BASE}/branch/${encodedBranch}`,
    token
  );
}

export async function getBranchPerformance(
  token: string
): Promise<{ branches: BranchPerformanceStats[]; summary: BranchPerformanceSummary }> {
  return request<{ branches: BranchPerformanceStats[]; summary: BranchPerformanceSummary }>(
    `${API_BASE}/branch-performance`,
    token
  );
}

export async function createProduct(token: string, item: InventoryItemInput): Promise<InventoryItem> {
  const data = await request<{ item: InventoryItem }>(API_BASE, token, {
    method: 'POST',
    body: JSON.stringify(item)
  });
  return data.item;
}

export async function updateProduct(
  token: string,
  id: string,
  item: Partial<InventoryItemInput>
): Promise<InventoryItem> {
  const data = await request<{ item: InventoryItem }>(`${API_BASE}/${id}`, token, {
    method: 'PUT',
    body: JSON.stringify(item)
  });
  return data.item;
}

export async function deleteProduct(token: string, id: string): Promise<void> {
  await request<{ message: string }>(`${API_BASE}/${id}`, token, { method: 'DELETE' });
}

export async function restoreProduct(token: string, id: string): Promise<InventoryItem> {
  const data = await request<{ item: InventoryItem; message: string }>(`${API_BASE}/${id}/restore`, token, {
    method: 'PATCH'
  });
  return data.item;
}

export async function uploadImage(token: string, file: File): Promise<string> {
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch(`${API_BASE}/upload-image`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || 'Image upload failed');
  }
  return data.url as string;
}
