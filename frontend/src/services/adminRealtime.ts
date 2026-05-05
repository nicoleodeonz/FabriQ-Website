import { buildApiUrl } from './apiConfig';

function toAbsoluteUrl(pathname: string) {
  const apiUrl = buildApiUrl(pathname);
  if (/^https?:\/\//i.test(apiUrl)) {
    return new URL(apiUrl);
  }

  return new URL(apiUrl, window.location.origin);
}

export function createAdminDashboardEventSource(token: string) {
  const url = toAbsoluteUrl('/realtime/admin-dashboard');
  url.searchParams.set('access_token', token);
  return new EventSource(url.toString());
}