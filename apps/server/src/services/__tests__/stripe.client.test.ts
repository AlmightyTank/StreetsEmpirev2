import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseStripeEvent, stripeForm, verifyStripeSignature } from '../stripe.client.js';

const SECRET = 'whsec_test_secret';
const NOW = 1_760_000_000;
const BODY = JSON.stringify({ id: 'evt_1', type: 'invoice.paid', created: NOW, data: { object: { id: 'in_1' } } });

function sign(body: string, timestamp = NOW, secret = SECRET): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

describe('verifyStripeSignature', () => {
  it('accepts a body signed with the endpoint secret', () => {
    expect(verifyStripeSignature(Buffer.from(BODY), `t=${NOW},v1=${sign(BODY)}`, SECRET, NOW)).toBe(true);
  });

  it('accepts any matching v1 while Stripe rolls the secret', () => {
    expect(verifyStripeSignature(BODY, `t=${NOW},v1=${'0'.repeat(64)},v1=${sign(BODY)}`, SECRET, NOW)).toBe(true);
  });

  it('refuses a changed body, another secret, an old timestamp or a missing header', () => {
    expect(verifyStripeSignature(`${BODY} `, `t=${NOW},v1=${sign(BODY)}`, SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(BODY, `t=${NOW},v1=${sign(BODY, NOW, 'whsec_other')}`, SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(BODY, `t=${NOW - 301},v1=${sign(BODY, NOW - 301)}`, SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(BODY, undefined, SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(BODY, `v1=${sign(BODY)}`, SECRET, NOW)).toBe(false);
  });
});

describe('parseStripeEvent', () => {
  it('reads an event and rejects anything else', () => {
    expect(parseStripeEvent(BODY)?.type).toBe('invoice.paid');
    expect(parseStripeEvent('{"id":"evt_1"}')).toBeNull();
    expect(parseStripeEvent('not json')).toBeNull();
  });
});

describe('stripeForm', () => {
  it('encodes nested params the way Stripe expects and drops empty values', () => {
    expect(stripeForm({
      mode: 'subscription',
      line_items: [{ price: 'price_1', quantity: 1 }],
      metadata: { accountId: 'acc 1' },
      customer: undefined,
    })).toBe('mode=subscription&line_items%5B0%5D%5Bprice%5D=price_1&line_items%5B0%5D%5Bquantity%5D=1&metadata%5BaccountId%5D=acc%201');
  });
});
