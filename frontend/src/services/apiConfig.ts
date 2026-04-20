const configuredApiUrl = String(import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '');

export const API_BASE_URL = configuredApiUrl ? `${configuredApiUrl}/api` : '/api';

export function buildApiUrl(pathname: string): string {
  const normalizedPathname = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${API_BASE_URL}${normalizedPathname}`;
}