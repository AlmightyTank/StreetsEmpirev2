import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The few Stripe calls supporter billing needs, over Stripe's REST API, plus
 * webhook signature checking. Kept small on purpose rather than pulling in the
 * SDK. Responses are read defensively because webhook payloads follow the
 * API version set on the Stripe endpoint, not this code.
 */

/** How old a signed webhook may be, in seconds. Stripe's own default. */
export const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;
const STRIPE_API = 'https://api.stripe.com/v1';
const STRIPE_TIMEOUT_MS = 15_000;

export interface StripeEvent {
  id: string;
  type: string;
  /** Unix seconds. */
  created: number;
  data: { object: Record<string, unknown> };
}

/**
 * Checks a Stripe-Signature header (`t=<unix>,v1=<hex>[,v1=...]`) against the
 * raw request body: HMAC-SHA256 of `<t>.<body>` with the endpoint secret.
 */
export function verifyStripeSignature(
  payload: Buffer | string,
  header: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = STRIPE_SIGNATURE_TOLERANCE_SECONDS,
): boolean {
  if (!header || !secret) return false;
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const [key, value] = part.split('=', 2).map((piece) => piece.trim());
    if (key === 't' && value && /^\d+$/.test(value)) timestamp = Number(value);
    if (key === 'v1' && value) signatures.push(value);
  }
  if (timestamp === null || !signatures.length) return false;
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;
  const body = typeof payload === 'string' ? payload : payload.toString('utf8');
  const expected = Buffer.from(createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex'), 'utf8');
  return signatures.some((signature) => {
    const given = Buffer.from(signature, 'utf8');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** Parses a verified body into an event, or null when it is not one. */
export function parseStripeEvent(payload: Buffer | string): StripeEvent | null {
  try {
    const value = JSON.parse(typeof payload === 'string' ? payload : payload.toString('utf8')) as Partial<StripeEvent>;
    if (typeof value.id !== 'string' || typeof value.type !== 'string' || typeof value.created !== 'number') return null;
    if (!value.data || typeof value.data.object !== 'object' || value.data.object === null) return null;
    return value as StripeEvent;
  } catch {
    return null;
  }
}

type FormValue = string | number | boolean | null | undefined | FormValue[] | { [key: string]: FormValue };

/** Stripe's nested form encoding: `line_items[0][price]=price_123`. Null and undefined are left out. */
export function stripeForm(params: Record<string, FormValue>): string {
  const pairs: string[] = [];
  const walk = (value: FormValue, key: string) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${key}[${index}]`));
    } else if (typeof value === 'object') {
      for (const [child, item] of Object.entries(value)) walk(item, `${key}[${child}]`);
    } else {
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  };
  for (const [key, value] of Object.entries(params)) walk(value, key);
  return pairs.join('&');
}

/** A Stripe API call that failed. The message is Stripe's own, never the key. */
export class StripeRequestError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'StripeRequestError';
  }
}

export interface StripeApi {
  createCheckoutSession(params: Record<string, FormValue>): Promise<{ id: string; url: string }>;
  createPortalSession(params: Record<string, FormValue>): Promise<{ url: string }>;
  cancelSubscription(subscriptionId: string): Promise<void>;
  retrieveCharge(chargeId: string): Promise<{ id: string; customer: string | null }>;
  /** A Checkout Session as Stripe has it now, for reconciling a Crown pack order. */
  retrieveCheckoutSession(sessionId: string): Promise<Record<string, unknown>>;
}

export function stripeApi(secretKey: string, fetchImpl: typeof fetch = fetch): StripeApi {
  async function call<T>(method: 'GET' | 'POST' | 'DELETE', path: string, params?: Record<string, FormValue>): Promise<T> {
    const response = await fetchImpl(`${STRIPE_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      ...(params ? { body: stripeForm(params) } : {}),
      signal: AbortSignal.timeout(STRIPE_TIMEOUT_MS),
    });
    const body = await response.json().catch(() => ({})) as { error?: { message?: string } } & T;
    if (!response.ok) throw new StripeRequestError(response.status, body.error?.message ?? `Stripe answered ${response.status}.`);
    return body;
  }

  return {
    async createCheckoutSession(params) {
      const session = await call<{ id: string; url: string | null }>('POST', '/checkout/sessions', params);
      if (!session.url) throw new StripeRequestError(502, 'Stripe returned no checkout link.');
      return { id: session.id, url: session.url };
    },
    async createPortalSession(params) {
      const session = await call<{ url: string }>('POST', '/billing_portal/sessions', params);
      return { url: session.url };
    },
    async cancelSubscription(subscriptionId) {
      await call('DELETE', `/subscriptions/${encodeURIComponent(subscriptionId)}`);
    },
    async retrieveCharge(chargeId) {
      const charge = await call<{ id: string; customer: unknown }>('GET', `/charges/${encodeURIComponent(chargeId)}`);
      return { id: charge.id, customer: typeof charge.customer === 'string' ? charge.customer : null };
    },
    async retrieveCheckoutSession(sessionId) {
      return call<Record<string, unknown>>('GET', `/checkout/sessions/${encodeURIComponent(sessionId)}`);
    },
  };
}
