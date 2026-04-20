const API_BASE = '/api/users';

export type ManagedUserRole = 'Admin' | 'Staff' | 'Customer';

export interface ManagedUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  role: ManagedUserRole;
  status: 'active' | 'archived';
  createdAt?: string;
  updatedAt?: string;
}

interface ArchiveUserResponse {
  message: string;
  user: {
    id: string;
    role: ManagedUserRole;
    status: 'active' | 'archived';
    updatedAt?: string;
  };
}

export interface CreateManagedUserPayload {
  role: ManagedUserRole;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
}

interface CreateUserResponse {
  message: string;
  user: ManagedUser;
}

export interface AdminActionEntry {
  id: string;
  adminLabel: string;
  adminEmail: string;
  action: string;
  targetUserId: string;
  targetRole: string;
  details: Record<string, unknown> | null;
  createdAt?: string;
}

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

export async function getUsers(token: string): Promise<ManagedUser[]> {
  const data = await request<{ users: ManagedUser[] }>(API_BASE, token);
  return data.users;
}

export async function archiveUser(token: string, role: ManagedUserRole, id: string): Promise<ArchiveUserResponse> {
  return request<ArchiveUserResponse>(`${API_BASE}/${role.toLowerCase()}/${id}/archive`, token, {
    method: 'PATCH'
  });
}

export async function restoreUser(token: string, role: ManagedUserRole, id: string): Promise<ArchiveUserResponse> {
  return request<ArchiveUserResponse>(`${API_BASE}/${role.toLowerCase()}/${id}/restore`, token, {
    method: 'PATCH'
  });
}

export async function createUser(token: string, payload: CreateManagedUserPayload): Promise<ManagedUser> {
  const data = await request<CreateUserResponse>(API_BASE, token, {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      role: payload.role.toLowerCase()
    })
  });
  return data.user;
}

export async function getAdminActions(token: string): Promise<AdminActionEntry[]> {
  const data = await request<{ actions: AdminActionEntry[] }>(`${API_BASE}/actions`, token);
  return data.actions;
}
