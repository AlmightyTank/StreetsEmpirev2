import { Link } from 'react-router-dom';

export type SocialDestinationKey = 'people' | 'console' | 'alliance' | 'rankings' | 'news';

const SOCIAL_DESTINATIONS: Array<{
  key: SocialDestinationKey;
  label: string;
  purpose: string;
  href: string;
}> = [
  { key: 'people', label: 'Players & Contacts', purpose: 'Find and track players', href: '/game/players' },
  { key: 'console', label: 'Street Wire', purpose: 'Messages and alerts', href: '/game/console' },
  { key: 'alliance', label: 'Alliance', purpose: 'Private crew coordination', href: '/game/alliance' },
  { key: 'rankings', label: 'Rankings', purpose: 'Public round standings', href: '/game/rankings' },
  { key: 'news', label: 'News', purpose: 'Official updates', href: '/game/news' },
];

export function SocialNavigation({ active, label = 'Social and communication destinations' }: {
  active: SocialDestinationKey;
  label?: string;
}) {
  return (
    <nav className="se-social-nav" aria-label={label}>
      {SOCIAL_DESTINATIONS.map((destination) => (
        <Link
          key={destination.key}
          className={`se-social-nav__item${destination.key === active ? ' is-active' : ''}`}
          to={destination.href}
          aria-current={destination.key === active ? 'page' : undefined}
        >
          <small>{destination.purpose}</small>
          <strong>{destination.label}</strong>
        </Link>
      ))}
    </nav>
  );
}
