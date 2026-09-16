import { Link } from 'react-router-dom';
import type { AllianceTagDto } from '@streets/shared';

/**
 * A member's alliance tag, worn in front of their name. Renders nothing for solo players.
 * Links to the alliance page, except where the alliance may belong to a past round.
 */
export function AllianceTag({ alliance, link = true }: { alliance: AllianceTagDto | null | undefined; link?: boolean }) {
  if (!alliance) return null;
  if (!link) return <span className="se-alliance-tag" title={alliance.name}>[{alliance.tag}]</span>;
  return (
    <Link to={`/game/alliances/${encodeURIComponent(alliance.tag)}`} className="se-alliance-tag" title={alliance.name}>
      [{alliance.tag}]
    </Link>
  );
}
