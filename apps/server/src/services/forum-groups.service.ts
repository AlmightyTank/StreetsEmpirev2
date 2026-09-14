import { z } from 'zod';
import type { ForumGroupBadgeDto } from '@streets/shared';
import { env } from '../config/env.js';
import { forumUserIdSchema } from './forum-proof.js';

const CACHE_MS = 5 * 60_000;
const FAILURE_CACHE_MS = 30_000;
const MAX_ENTRIES = 2_000;
const MAX_GROUPS = 3;

const documentSchema = z.object({
  data: z.object({
    relationships: z.object({
      groups: z.object({ data: z.array(z.object({ id: z.string() })) }).optional(),
    }).optional(),
  }),
  included: z.array(z.unknown()).optional(),
});

const groupSchema = z.object({
  type: z.literal('groups'),
  id: z.string(),
  attributes: z.object({
    nameSingular: z.string().min(1).max(60),
    color: z.string().nullish(),
    isHidden: z.union([z.boolean(), z.number()]).nullish(),
  }),
});

/**
 * Visible groups from Flarum's public JSON:API user document. The color ends up
 * in an inline style on the game profile, so only plain hex colors survive.
 */
export function parseForumGroups(body: unknown): ForumGroupBadgeDto[] {
  const document = documentSchema.safeParse(body);
  if (!document.success) return [];
  const memberOf = new Set((document.data.data.relationships?.groups?.data ?? []).map((group) => group.id));

  const groups: ForumGroupBadgeDto[] = [];
  for (const entry of document.data.included ?? []) {
    const group = groupSchema.safeParse(entry);
    if (!group.success || !memberOf.has(group.data.id)) continue;
    const { nameSingular, color, isHidden } = group.data.attributes;
    if (isHidden === true || isHidden === 1) continue;
    groups.push({ name: nameSingular, color: color && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(color) ? color : null });
    if (groups.length === MAX_GROUPS) break;
  }
  return groups;
}

const cache = new Map<string, { groups: ForumGroupBadgeDto[]; expiresAt: number }>();

export const ForumGroupsService = {
  /** Never throws: a forum outage just means no role badges for a few seconds. */
  async groupsFor(
    forumUserId: string,
    deps: { fetch?: typeof fetch; now?: () => number } = {},
  ): Promise<ForumGroupBadgeDto[]> {
    if (!forumUserIdSchema.safeParse(forumUserId).success) return [];
    const now = (deps.now ?? Date.now)();
    const cached = cache.get(forumUserId);
    if (cached && cached.expiresAt > now) return cached.groups;

    let groups: ForumGroupBadgeDto[] = [];
    let ttl = CACHE_MS;
    try {
      const response = await (deps.fetch ?? fetch)(`${env.forum.origin}/api/users/${forumUserId}`, {
        headers: { Accept: 'application/vnd.api+json' },
        redirect: 'error',
        signal: AbortSignal.timeout(2_500),
      });
      // A 404 (deleted or hidden user) is a real answer; cache it like success.
      if (response.ok) groups = parseForumGroups(await response.json());
    } catch {
      ttl = FAILURE_CACHE_MS;
    }

    if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
    cache.set(forumUserId, { groups, expiresAt: now + ttl });
    return groups;
  },
};
