import { env } from '../config/env.js';

export type ForumMirrorResult = { ok: true; discussionId: string } | { ok: false; error: string };

export interface ForumNewsConfig {
  origin: string;
  apiKey: string;
  userId: number;
  tagId: string;
  enabled: boolean;
}

/** Flarum's default discussion title limit. */
const FORUM_TITLE_MAX = 80;

export function forumDiscussionUrl(discussionId: string): string {
  return `${env.forum.origin}/d/${discussionId}`;
}

/**
 * Posts a news item as a discussion in the forum announcements tag.
 * Never throws: a forum outage records an error the admin can retry.
 */
export async function mirrorNewsToForum(
  post: { title: string; body: string },
  deps: { fetch?: typeof fetch; config?: ForumNewsConfig } = {},
): Promise<ForumMirrorResult> {
  const config = deps.config ?? { origin: env.forum.origin, ...env.forum.news };
  if (!config.enabled) return { ok: false, error: 'Forum mirroring is not configured on this server.' };
  try {
    const response = await (deps.fetch ?? fetch)(`${config.origin}/api/discussions`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        Authorization: `Token ${config.apiKey}; userId=${config.userId}`,
      },
      body: JSON.stringify({
        data: {
          type: 'discussions',
          attributes: { title: post.title.slice(0, FORUM_TITLE_MAX), content: post.body },
          relationships: { tags: { data: [{ type: 'tags', id: config.tagId }] } },
        },
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return { ok: false, error: `The forum answered ${response.status}.` };
    const body = await response.json() as { data?: { id?: string | number } };
    return body.data?.id !== undefined
      ? { ok: true, discussionId: String(body.data.id) }
      : { ok: false, error: 'The forum did not return a discussion id.' };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message.slice(0, 200) : 'Could not reach the forum.' };
  }
}
