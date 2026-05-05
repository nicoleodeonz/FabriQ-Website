const ADMIN_DASHBOARD_CLIENTS = new Set();
const HEARTBEAT_INTERVAL_MS = 25000;

function buildSseEvent(eventName, payload) {
  return `event: ${eventName}\ndata: ${JSON.stringify({
    ...payload,
    timestamp: new Date().toISOString(),
  })}\n\n`;
}

export function addAdminDashboardClient(response) {
  ADMIN_DASHBOARD_CLIENTS.add(response);
  response.write(buildSseEvent('connected', { ok: true }));

  return () => {
    ADMIN_DASHBOARD_CLIENTS.delete(response);
  };
}

export function startAdminDashboardHeartbeat(response) {
  const intervalId = setInterval(() => {
    response.write(': keepalive\n\n');
  }, HEARTBEAT_INTERVAL_MS);

  return () => {
    clearInterval(intervalId);
  };
}

export function emitAdminDashboardUpdate(payload = {}) {
  if (ADMIN_DASHBOARD_CLIENTS.size === 0) {
    return;
  }

  const eventPayload = typeof payload === 'object' && payload !== null ? payload : {};
  const message = buildSseEvent('admin-dashboard-update', eventPayload);

  for (const client of ADMIN_DASHBOARD_CLIENTS) {
    try {
      client.write(message);
    } catch {
      ADMIN_DASHBOARD_CLIENTS.delete(client);
    }
  }
}