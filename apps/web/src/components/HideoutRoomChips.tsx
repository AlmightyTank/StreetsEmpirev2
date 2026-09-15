import type { SeasonHideoutDto } from '@streets/shared';
import { formatNumber } from '@streets/shared';

function roomTone(level: number, maxLevel: number): string {
  if (level >= maxLevel) return ' se-tag--good';
  if (level === 0) return ' se-tag--dim';
  return '';
}

export function HideoutRoomChips({ hideout }: { hideout: SeasonHideoutDto }) {
  return (
    <div className="se-room-chips">
      <span className="se-num">{formatNumber(hideout.totalLevel)} / {formatNumber(hideout.totalMaxLevel)}</span>
      {hideout.rooms.length ? (
        <div className="se-tags" aria-label="Hideout rooms">
          {hideout.rooms.map((room) => (
            <span className={`se-tag${roomTone(room.level, room.maxLevel)}`} key={room.key}>
              {room.name} {room.level}/{room.maxLevel}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
