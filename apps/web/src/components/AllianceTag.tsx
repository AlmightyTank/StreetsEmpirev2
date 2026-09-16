import { Link } from 'react-router-dom';
import type { AllianceTagDto } from '@streets/shared';

/** A member's alliance tag, worn in front of their name and linking to the alliance page. Renders nothing for solo players. */
export function AllianceTag({ alliance }: { alliance: AllianceTagDto | null | undefined }) {
  if (!alliance) return null;
  return (
    <Link to={`/game/alliances/${encodeURIComponent(alliance.tag)}`} className="se-alliance-tag" title={alliance.name}>
      [{alliance.tag}]
    </Link>
  );
}
