import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformMetaDto } from '@streets/shared';

const meta = vi.fn<() => Promise<PlatformMetaDto>>();
vi.mock('../../api/platform.js', () => ({ platformApi: { meta: () => meta() } }));

const { useSession } = await import('../session.js');

const withKey = { turnstileSiteKey: 'site-key' } as PlatformMetaDto;

describe('loadPlatform', () => {
  beforeEach(() => {
    meta.mockReset();
    useSession.setState({ platform: null });
  });

  it('tries again after a failed read, so the "are you human" check still shows', async () => {
    meta.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(withKey);
    await useSession.getState().loadPlatform();
    expect(useSession.getState().platform).toBeNull();
    await useSession.getState().loadPlatform();
    expect(useSession.getState().platform?.turnstileSiteKey).toBe('site-key');
  });

  it('shares one read between callers that ask at the same time', async () => {
    meta.mockResolvedValue(withKey);
    await Promise.all([useSession.getState().loadPlatform(), useSession.getState().loadPlatform()]);
    expect(meta).toHaveBeenCalledTimes(1);
  });
});
