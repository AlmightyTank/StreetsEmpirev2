import { describe, expect, it } from 'vitest';
import { parseGooglePlayRtdn } from '../google-play-billing.service.js';

function envelope(payload: unknown, messageId = 'message-1') {
  return {
    message: {
      messageId,
      data: Buffer.from(JSON.stringify(payload), 'utf8').toString('base64'),
    },
    subscription: 'projects/streets/subscriptions/play-rtdn',
  };
}

describe('parseGooglePlayRtdn', () => {
  it('decodes the Pub/Sub envelope without trusting unencoded fields', () => {
    const payload = {
      version: '1.0',
      packageName: 'dev.streetsempire.app',
      subscriptionNotification: { version: '1.0', notificationType: 2, purchaseToken: 'play-token' },
    };

    expect(parseGooglePlayRtdn(envelope(payload))).toEqual({ messageId: 'message-1', notification: payload });
  });

  it.each([
    null,
    {},
    { message: {} },
    { message: { data: 'not base64!' } },
    { message: { data: Buffer.from('[]').toString('base64') } },
    { message: { data: Buffer.from('{broken').toString('base64') } },
  ])('rejects a malformed push body', (body) => {
    expect(() => parseGooglePlayRtdn(body)).toThrow(expect.objectContaining({ code: 'PLAY_RTDN_INVALID' }));
  });
});
