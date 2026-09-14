import type { CSSProperties } from 'react';
import type { ForumGroupBadgeDto, ProfileBadgeDto } from '@streets/shared';

/** Forum roles first, then the player's best game badges (◆ = permanent). */
export function ProfileBadges({ badges, forumGroups }: { badges: ProfileBadgeDto[]; forumGroups: ForumGroupBadgeDto[] }) {
  if (!badges.length && !forumGroups.length) return null;

  return (
    <ul className="se-badges" aria-label="Badges">
      {forumGroups.map((group) => (
        <li
          key={`forum-${group.name}`}
          className="se-badge se-badge--group"
          // The server only passes validated #rgb/#rrggbb colors.
          style={group.color ? ({ '--se-badge-color': group.color } as CSSProperties) : undefined}
          title="Forum role"
        >
          {group.name}
        </li>
      ))}
      {badges.map((badge) => (
        <li
          key={badge.key}
          className={`se-badge se-badge--${badge.rarity}${badge.permanent ? ' se-badge--permanent' : ''}`}
          title={`${badge.description} ${badge.permanent ? 'Permanent badge.' : 'Earned this round.'}`}
        >
          {badge.title}
        </li>
      ))}
    </ul>
  );
}
