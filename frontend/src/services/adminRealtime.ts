import { buildApiUrl } from './apiConfig';

function toAbsoluteUrl(pathname: string) {
  const apiUrl = buildApiUrl(pathname);
  if (/^https?:\/\//i.test(apiUrl)) {
    return new URL(apiUrl);
  }

  return new URL(apiUrl, window.location.origin);
}

function createRealtimeEventSource(pathname: string, token: string) {
  const url = toAbsoluteUrl(pathname);
  url.searchParams.set('access_token', token);
  return new EventSource(url.toString());
}

export function createAdminDashboardEventSource(token: string) {
  return createRealtimeEventSource('/realtime/admin-dashboard', token);
}

export function createCustomerActivityEventSource(token: string) {
  return createRealtimeEventSource('/realtime/customer-activity', token);
}