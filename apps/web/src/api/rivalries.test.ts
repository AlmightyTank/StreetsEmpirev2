import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './client.js';
import { rivalriesApi } from './rivalries.js';

function installBrowserGlobals() {
  vi.stubGlobal('window', {
    setTimeout,
    clearTimeout,
    dispatchEvent: vi.fn(),
  });
}

describe('rivalries API', () => {
  it('uses an encoded round deep-link and cookie authentication', async () => {
    installBrowserGlobals();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await rivalriesApi.list('round/with spaces');

    expect(fetchMock).toHaveBeenCalledWith('/api/rounds/round%2Fwith%20spaces/rivalries', expect.objectContaining({
      method: 'GET',
      credentials: 'include',
    }));
  });

  it('keeps public projections on the same authenticated rivalry surface', async () => {
    installBrowserGlobals();
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    await rivalriesApi.public('round/1', 'relationship/2');
    await rivalriesApi.cards('round/1', 'relationship/2');
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/rounds/round%2F1/rivalries/relationship%2F2/public',
      '/api/rounds/round%2F1/rivalries/relationship%2F2/public/cards',
    ]);
  });

  it('classifies server and rate-limit failures as retryable', async () => {
    installBrowserGlobals();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({
      error: { code: 'RATE_LIMITED', message: 'Try again later.' },
    }), { status: 429 }))));

    await expect(rivalriesApi.list('round-1')).rejects.toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
    });
    try {
      await rivalriesApi.list('round-1');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).isRetryable).toBe(true);
    }
  });
});
