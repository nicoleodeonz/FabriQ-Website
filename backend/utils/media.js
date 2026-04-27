export function buildRequestOrigin(req) {
  const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
  const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol || 'http';
  const host = forwardedHost || req.get('host') || '';

  return host ? `${protocol}://${host}` : '';
}

function stripInternalPublicPort(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) {
    return '';
  }

  try {
    const parsed = new URL(value);
    const currentPort = parsed.port;
    const configuredPort = String(process.env.PORT || '').trim();

    if (!currentPort) {
      return parsed.toString().replace(/\/$/, '');
    }

    const isPublicHost = !isNonPublicHostname(parsed.hostname);
    const isHttpDefault = parsed.protocol === 'http:' && currentPort === '80';
    const isHttpsDefault = parsed.protocol === 'https:' && currentPort === '443';
    const isInternalAppPort = currentPort === '5000' || (configuredPort && currentPort === configuredPort);

    if (isPublicHost && (isHttpDefault || isHttpsDefault || isInternalAppPort)) {
      parsed.port = '';
    }

    return parsed.toString().replace(/\/$/, '');
  } catch {
    return value.replace(/\/$/, '');
  }
}

function isPrivateIpv4(hostname) {
  const match = String(hostname || '').trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) {
    return false;
  }

  const octets = match.slice(1).map((part) => Number(part));
  if (octets.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return false;
  }

  if (octets[0] === 10 || octets[0] === 127) return true;
  if (octets[0] === 192 && octets[1] === 168) return true;
  if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;

  return false;
}

function isLoopbackHostname(hostname) {
  const normalizedHost = String(hostname || '').trim().toLowerCase();
  return normalizedHost === 'localhost' || normalizedHost === '127.0.0.1' || normalizedHost === '::1';
}

function isNonPublicHostname(hostname) {
  const normalizedHost = String(hostname || '').trim().toLowerCase();
  return isLoopbackHostname(normalizedHost) || isPrivateIpv4(normalizedHost);
}

export function getPublicBaseUrl(req) {
  const configuredBaseUrl = stripInternalPublicPort(process.env.PUBLIC_BASE_URL || '');
  const requestOrigin = stripInternalPublicPort(buildRequestOrigin(req));

  if (configuredBaseUrl) {
    if (requestOrigin) {
      try {
        const configured = new URL(configuredBaseUrl);
        if (isNonPublicHostname(configured.hostname)) {
          return requestOrigin;
        }
      } catch {
        return requestOrigin || configuredBaseUrl;
      }
    }

    return configuredBaseUrl;
  }

  return requestOrigin;
}

export function toPublicUrl(req, value) {
  const rawValue = String(value || '').trim();
  if (!rawValue) {
    return '';
  }

  if (rawValue.startsWith('data:') || rawValue.startsWith('blob:')) {
    return rawValue;
  }

  const baseUrl = getPublicBaseUrl(req);

  if (/^(?:https?:)?\/\//i.test(rawValue)) {
    if (!baseUrl) {
      return stripInternalPublicPort(rawValue);
    }

    try {
      const currentUrl = new URL(rawValue);
      if (!isNonPublicHostname(currentUrl.hostname)) {
        return stripInternalPublicPort(rawValue);
      }

      const nextBase = new URL(baseUrl);
      currentUrl.protocol = nextBase.protocol;
      currentUrl.username = nextBase.username;
      currentUrl.password = nextBase.password;
      currentUrl.host = nextBase.host;
      return stripInternalPublicPort(currentUrl.toString());
    } catch {
      return stripInternalPublicPort(rawValue);
    }
  }

  if (!baseUrl) {
    return rawValue;
  }

  return rawValue.startsWith('/') ? `${baseUrl}${rawValue}` : `${baseUrl}/${rawValue}`;
}