/**
 * Never log OAuth codes, state values, reset links or other query secrets.
 * Preserves the route path for troubleshooting and request-rate analysis.
 * The actual request URL is untouched.
 */
export function safeRequestLogUrl(rawUrl: unknown): string {
  if (typeof rawUrl !== 'string') return '[unknown]';
  const q = rawUrl.indexOf('?');
  const hash = rawUrl.indexOf('#');
  const end = q < 0 ? (hash < 0 ? rawUrl.length : hash) : (hash < 0 ? q : Math.min(q, hash));
  const pathname = rawUrl.slice(0, end);
  return end < rawUrl.length ? pathname + '?[redacted]' : pathname;
}

interface LoggableRequest {
  method?: string;
  url?: string;
  headers?: { host?: string };
  hostname?: string;
  ip?: string;
  socket?: { remoteAddress?: string; remotePort?: number };
}

/** Safe replacement for Fastify's Pino request serializer. */
export function safeRequestLogSerializer(request: LoggableRequest): Record<string, unknown> {
  return {
    method: request.method,
    url: safeRequestLogUrl(request.url),
    host: request.headers?.host ?? request.hostname,
    remoteAddress: request.socket?.remoteAddress ?? request.ip,
    remotePort: request.socket?.remotePort,
  };
}
