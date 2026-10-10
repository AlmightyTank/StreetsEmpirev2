import { useMemo, useState } from 'react';
import type { ForumGroupBadgeDto, PublicAwardDto } from '@streets/shared';
import { Panel } from './Panel.js';
import { ProfileBadgeArt } from './ProfileBadgeArt.js';

type BadgeItem = {
  key: string;
  title: string;
  description: string;
  category: string;
  rarity: string;
};

const categoryLabels: Record<string, string> = {
  rank: 'Rank', wealth: 'Wealth', street: 'Street', combat: 'Combat', intel: 'Intel', turf: 'Turf',
  travel: 'Travel', economy: 'Economy', reputation: 'Faction & reputation', hideout: 'Hideout',
  quest: 'Quest & Street Pass', casino: 'Casino', law: 'Law', legacy: 'Legacy', community: 'Community',
};

export function ProfileBadgeCollection({ awards, forumGroups, factionAlignment }: {
  awards: PublicAwardDto[];
  forumGroups: ForumGroupBadgeDto[];
  factionAlignment?: Array<{ key: string; name: string; tierName: string }>;
}) {
  const [filter, setFilter] = useState('all');
  const items = useMemo<BadgeItem[]>(() => [
    ...awards.filter((award) => award.unlocked).map((award) => ({
      key: award.key, title: award.title, description: award.description, category: award.category, rarity: award.rarity,
    })),
    ...(factionAlignment ?? []).map((faction) => ({
      key: 'faction-' + faction.key,
      title: faction.name + ' · ' + faction.tierName,
      description: 'Current faction standing: ' + faction.tierName + '.',
      category: 'reputation',
      rarity: faction.tierName === 'Inner Circle' ? 'epic' : 'rare',
    })),
    ...forumGroups.map((group) => ({
      key: 'forum-' + group.name,
      title: group.name,
      description: 'Verified community role.',
      category: 'community',
      rarity: 'uncommon',
    })),
  ], [awards, factionAlignment, forumGroups]);
  const categories = useMemo(() => [...new Set(items.map((item) => item.category))], [items]);
  const shown = filter === 'all' ? items : items.filter((item) => item.category === filter);

  return (
    <Panel title="Badge Collection" className="se-profile-panel se-profile-badge-collection">
      <div className="se-badge-collection__head">
        <p>Achievements, season rewards, faction standing, and community honors.</p>
        <strong className="se-num">{items.length} earned</strong>
      </div>
      <div className="se-badge-collection__filters" role="group" aria-label="Badge categories">
        <button type="button" className={filter === 'all' ? 'is-active' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
        {categories.map((category) => (
          <button type="button" key={category} className={filter === category ? 'is-active' : ''} aria-pressed={filter === category} onClick={() => setFilter(category)}>
            {categoryLabels[category] ?? category}
          </button>
        ))}
      </div>
      {shown.length ? (
        <ul className="se-badge-collection__grid">
          {shown.map((item) => (
            <li className="se-badge-collection__item" key={item.key} title={item.description}>
              <ProfileBadgeArt badgeKey={item.key} category={item.category} rarity={item.rarity} size={64} />
              <strong>{item.title}</strong>
              <span>{categoryLabels[item.category] ?? item.category} · {item.rarity}</span>
            </li>
          ))}
        </ul>
      ) : <p className="se-muted">No badges in this category yet.</p>}
    </Panel>
  );
}
