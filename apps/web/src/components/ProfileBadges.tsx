import type { CSSProperties } from 'react';
import type { ForumGroupBadgeDto, ProfileBadgeDto } from '@streets/shared';
import { ProfileBadgeArt } from './ProfileBadgeArt.js';

/** Selected game badges and verified community roles shown in the profile header. */
export function ProfileBadges({ badges, forumGroups }: { badges: ProfileBadgeDto[]; forumGroups: ForumGroupBadgeDto[] }) {
  if (!badges.length && !forumGroups.length) return null;

  return (
    <ul className="se-badges" aria-label="Featured badges and community roles">
      {forumGroups.map((group) => (
        <li key={'forum-' + group.name} className="se-badge se-badge--group" title="Verified community role" style={group.color ? ({ '--se-badge-color': group.color } as CSSProperties) : undefined}>
          <ProfileBadgeArt badgeKey={'forum-' + group.name} category="community" rarity="uncommon" size={48} />
          <strong>{group.name}</strong>
        </li>
      ))}
      {badges.map((badge) => (
        <li key={badge.key} className={'se-badge se-badge--' + badge.rarity + (badge.permanent ? ' se-badge--permanent' : '')} title={badge.description + (badge.permanent ? ' Permanent badge.' : ' Earned this round.')}>
          <ProfileBadgeArt badgeKey={badge.key} category={badge.category} rarity={badge.rarity} size={48} />
          <strong>{badge.title}</strong>
        </li>
      ))}
    </ul>
  );
}
