import { createHmac } from 'node:crypto';
import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const SECRET = 'whsec_route_test';
const handleEvent = vi.fn(async () => 'granted');

vi.mock('../../config/env.js', async (original) => {
  const actual = await original<typeof import('../../config/env.js')>();
  return { env: { ...actual.env, stripe: { secretKey: 'sk_test_x', webhookSecret: SECRET, supporterPriceId: 'price_x', enabled: true } } };
});
vi.mock('../supporter-billing.service.js', () => ({ SupporterBillingService: { handleEvent } }));

const { default: stripeWebhookRoutes } = await import('../../routes/stripe-webhook.routes.js');

const app = Fastify();
const BODY = JSON.stringify({ id: 'evt_route', type: 'invoice.paid', created: 1, data: { object: { id: 'in_1' } } });

function signature(body: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  return `t=${timestamp},v1=${createHmac('sha256', SECRET).update(`${timestamp}.${body}`).digest('hex')}`;
}

beforeAll(async () => {
  app.decorate('prisma', {} as never);
  await app.register(stripeWebhookRoutes, { prefix: '/api/internal/stripe' });
  // Outside the webhook plugin, JSON must still be parsed as usual.
  app.post('/api/echo', async (request) => request.body);
  await app.ready();
});
afterAll(() => app.close());

describe('POST /api/internal/stripe/webhook', () => {
  it('checks the signature over the exact bytes and hands the event on', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/stripe/webhook',
      headers: { 'content-type': 'application/json', 'stripe-signature': signature(BODY) },
      payload: BODY,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ received: true });
    expect(handleEvent).toHaveBeenCalledWith({}, expect.objectContaining({ id: 'evt_route', type: 'invoice.paid' }));
  });

  it('refuses a body that does not match its signature', async () => {
    handleEvent.mockClear();
    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/stripe/webhook',
      headers: { 'content-type': 'application/json', 'stripe-signature': signature(BODY) },
      payload: BODY.replace('in_1', 'in_2'),
    });

    expect(response.statusCode).toBe(400);
    expect(handleEvent).not.toHaveBeenCalled();
  });

  it('leaves JSON parsing alone for every other route', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/echo', payload: { hello: 'there' } });
    expect(response.json()).toEqual({ hello: 'there' });
  });
});
