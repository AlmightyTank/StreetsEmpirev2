import { describe, expect, it } from 'vitest';
import { mirrorNewsToForum, postRecruitmentThread, updateForumDiscussion, type ForumNewsConfig } from '../forum-news.service.js';

const config: ForumNewsConfig = { origin: 'https://forum.example.test', apiKey: 'key-123', userId: 7, tagId: '4', enabled: true };

describe('mirrorNewsToForum', () => {
  it('posts a discussion to the announcements tag as the configured forum user', async () => {
    let sent: { url: string; init: RequestInit } | null = null;
    const fetchStub = (async (url: string, init: RequestInit) => {
      sent = { url, init };
      return new Response(JSON.stringify({ data: { type: 'discussions', id: '42' } }), { status: 201 });
    }) as unknown as typeof fetch;

    const result = await mirrorNewsToForum({ title: 'T'.repeat(100), body: 'Season two starts Friday.' }, { fetch: fetchStub, config });
    expect(result).toEqual({ ok: true, discussionId: '42' });
    expect(sent!.url).toBe('https://forum.example.test/api/discussions');
    expect((sent!.init.headers as Record<string, string>).Authorization).toBe('Token key-123; userId=7');
    const body = JSON.parse(String(sent!.init.body));
    expect(body.data.attributes).toEqual({ title: 'T'.repeat(80), content: 'Season two starts Friday.' });
    expect(body.data.relationships.tags.data).toEqual([{ type: 'tags', id: '4' }]);
  });

  it('never throws: forum errors, outages and missing config come back as errors', async () => {
    const rejected = (async () => new Response('nope', { status: 403 })) as unknown as typeof fetch;
    expect(await mirrorNewsToForum({ title: 'a', body: 'b' }, { fetch: rejected, config })).toEqual({ ok: false, error: 'The forum answered 403.' });

    const down = (async () => { throw new Error('connect ECONNREFUSED'); }) as unknown as typeof fetch;
    expect(await mirrorNewsToForum({ title: 'a', body: 'b' }, { fetch: down, config })).toEqual({ ok: false, error: 'connect ECONNREFUSED' });

    let called = false;
    const unused = (async () => { called = true; return new Response('{}'); }) as unknown as typeof fetch;
    expect((await mirrorNewsToForum({ title: 'a', body: 'b' }, { fetch: unused, config: { ...config, enabled: false } })).ok).toBe(false);
    expect(called).toBe(false);
  });
});

describe('alliance recruitment threads', () => {
  const recruitment: ForumNewsConfig = { ...config, tagId: '9' };

  it('posts into the recruitment tag', async () => {
    let body: { data: { relationships: { tags: { data: unknown[] } } } } | null = null;
    const fetchStub = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ data: { id: 77 } }), { status: 201 });
    }) as unknown as typeof fetch;
    expect(await postRecruitmentThread({ title: '[ESK] East Side Kings is recruiting', body: 'Join us.' }, { fetch: fetchStub, config: recruitment }))
      .toEqual({ ok: true, discussionId: '77' });
    expect(body!.data.relationships.tags.data).toEqual([{ type: 'tags', id: '9' }]);
  });

  it('retitles and locks a thread, and reports failures instead of throwing', async () => {
    let sent: { url: string; init: RequestInit } | null = null;
    const ok = (async (url: string, init: RequestInit) => { sent = { url, init }; return new Response('{}', { status: 200 }); }) as unknown as typeof fetch;
    expect(await updateForumDiscussion('77', { title: '[ESK] East Side Kings (disbanded)', isLocked: true }, { fetch: ok, config: recruitment })).toBeNull();
    expect(sent!.url).toBe('https://forum.example.test/api/discussions/77');
    expect(sent!.init.method).toBe('PATCH');
    expect(JSON.parse(String(sent!.init.body))).toEqual({ data: { type: 'discussions', id: '77', attributes: { title: '[ESK] East Side Kings (disbanded)', isLocked: true } } });

    const denied = (async () => new Response('no', { status: 403 })) as unknown as typeof fetch;
    expect(await updateForumDiscussion('77', { isLocked: true }, { fetch: denied, config: recruitment })).toBe('The forum answered 403.');
    expect(await updateForumDiscussion('77', { isLocked: true }, { fetch: denied, config: { ...recruitment, enabled: false } })).toContain('not configured');
  });
});
