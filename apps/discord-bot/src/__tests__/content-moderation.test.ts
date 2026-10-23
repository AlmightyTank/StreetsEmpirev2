import { describe, expect, it } from 'vitest';
import { isHateful, moderateMessage } from '../content-moderation.js';

describe('content moderation', () => {
  it('blocks hate categories, including threatening hate', () => {
    expect(isHateful({ hate: true })).toBe(true);
    expect(isHateful({ 'hate/threatening': true })).toBe(true);
    expect(isHateful({ harassment: true } as never)).toBe(false);
    expect(isHateful(undefined)).toBe(false);
  });

  it('sends text to the moderation endpoint and returns its hate decision', async () => {
    let request: RequestInit | undefined;
    const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
      request = init;
      return new Response(JSON.stringify({ results: [{ categories: { hate: true } }] }), { status: 200 });
    };

    await expect(moderateMessage({ text: 'test message', apiKey: 'secret', timeoutMs: 1000, fetchImpl })).resolves.toBe(true);
    expect(request?.method).toBe('POST');
    expect(request?.headers).toMatchObject({ authorization: 'Bearer secret', 'content-type': 'application/json' });
    expect(JSON.parse(String(request?.body))).toEqual({ model: 'omni-moderation-latest', input: 'test message' });
  });

  it('reports provider errors to the caller', async () => {
    const fetchImpl = async () => new Response('', { status: 500 });
    await expect(moderateMessage({ text: 'test', apiKey: 'secret', timeoutMs: 1000, fetchImpl })).rejects.toThrow('HTTP 500');
  });
});
