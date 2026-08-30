const ADMIN_DASHBOARD_CLIENTS = new Set();
const CUSTOMER_ACTIVITY_CLIENTS = new Map();
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

export function addCustomerActivityClient(customerId, response) {
  const normalizedCustomerId = String(customerId || '').trim();
  if (!normalizedCustomerId) {
    response.write(buildSseEvent('connected', { ok: false }));
    return () => {};
  }

  const customerClients = CUSTOMER_ACTIVITY_CLIENTS.get(normalizedCustomerId) || new Set();
  customerClients.add(response);
  CUSTOMER_ACTIVITY_CLIENTS.set(normalizedCustomerId, customerClients);
  response.write(buildSseEvent('connected', { ok: true }));

  return () => {
    const existingClients = CUSTOMER_ACTIVITY_CLIENTS.get(normalizedCustomerId);
    if (!existingClients) {
      return;
    }

    existingClients.delete(response);
    if (existingClients.size === 0) {
      CUSTOMER_ACTIVITY_CLIENTS.delete(normalizedCustomerId);
    }
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

export function emitChatConversationUpdate(payload = {}) {
  if (ADMIN_DASHBOARD_CLIENTS.size === 0) {
    return;
  }

  const eventPayload = typeof payload === 'object' && payload !== null ? payload : {};
  const message = buildSseEvent('chat-conversation-update', eventPayload);

  for (const client of ADMIN_DASHBOARD_CLIENTS) {
    try {
      client.write(message);
    } catch {
      ADMIN_DASHBOARD_CLIENTS.delete(client);
    }
  }
}

export function emitCustomerActivityUpdate(customerId, payload = {}) {
  const normalizedCustomerId = String(customerId || '').trim();
  if (!normalizedCustomerId) {
    return;
  }

  const customerClients = CUSTOMER_ACTIVITY_CLIENTS.get(normalizedCustomerId);
  if (!customerClients || customerClients.size === 0) {
    return;
  }

  const eventPayload = typeof payload === 'object' && payload !== null ? payload : {};
  const message = buildSseEvent('customer-activity-update', {
    customerId: normalizedCustomerId,
    ...eventPayload,
  });

  for (const client of customerClients) {
    try {
      client.write(message);
    } catch {
      customerClients.delete(client);
    }
  }

  if (customerClients.size === 0) {
    CUSTOMER_ACTIVITY_CLIENTS.delete(normalizedCustomerId);
  }
}