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

function forumHeaders(config: ForumNewsConfig): Record<string, string> {
  return {
    Accept: 'application/vnd.api+json',
    'Content-Type': 'application/vnd.api+json',
    Authorization: `Token ${config.apiKey}; userId=${config.userId}`,
  };
}

function forumError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 200) : 'Could not reach the forum.';
}

/**
 * Posts a news item as a discussion in the forum announcements tag.
 * Never throws: a forum outage records an error the admin can retry.
 */
export async function mirrorNewsToForum(
  post: { title: string; body: string },
  deps: { fetch?: typeof fetch; config?: ForumNewsConfig } = {},
): Promise<ForumMirrorResult> {
  return postForumDiscussion(post, { fetch: deps.fetch, config: deps.config ?? { origin: env.forum.origin, ...env.forum.news } });
}

/** 0.3.0-C. An alliance recruitment thread in the recruitment tag. Never throws. */
export async function postRecruitmentThread(
  post: { title: string; body: string },
  deps: { fetch?: typeof fetch; config?: ForumNewsConfig } = {},
): Promise<ForumMirrorResult> {
  return postForumDiscussion(post, { fetch: deps.fetch, config: deps.config ?? { origin: env.forum.origin, ...env.forum.recruitment } });
}

/**
 * Retitles or locks a discussion the game posted. Locking needs Flarum's bundled
 * Lock extension. Never throws; returns an error message or null.
 */
export async function updateForumDiscussion(
  discussionId: string,
  attributes: { title?: string; isLocked?: boolean },
  deps: { fetch?: typeof fetch; config?: ForumNewsConfig } = {},
): Promise<string | null> {
  const config = deps.config ?? { origin: env.forum.origin, ...env.forum.recruitment };
  if (!config.enabled) return 'Forum recruitment is not configured on this server.';
  try {
    const response = await (deps.fetch ?? fetch)(`${config.origin}/api/discussions/${encodeURIComponent(discussionId)}`, {
      method: 'PATCH',
      headers: forumHeaders(config),
      body: JSON.stringify({ data: { type: 'discussions', id: discussionId, attributes: {
        ...(attributes.title !== undefined ? { title: attributes.title.slice(0, FORUM_TITLE_MAX) } : {}),
        ...(attributes.isLocked !== undefined ? { isLocked: attributes.isLocked } : {}),
      } } }),
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
    });
    return response.ok ? null : `The forum answered ${response.status}.`;
  } catch (error) {
    return forumError(error);
  }
}

async function postForumDiscussion(
  post: { title: string; body: string },
  deps: { fetch?: typeof fetch | undefined; config: ForumNewsConfig },
): Promise<ForumMirrorResult> {
  const config = deps.config;
  if (!config.enabled) return { ok: false, error: 'Forum mirroring is not configured on this server.' };
  try {
    const response = await (deps.fetch ?? fetch)(`${config.origin}/api/discussions`, {
      method: 'POST',
      headers: forumHeaders(config),
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
    return { ok: false, error: forumError(error) };
  }
}
