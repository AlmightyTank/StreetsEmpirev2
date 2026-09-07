import type { ActivityDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * Section 42. One line per thing the player did, in their words.
 *
 * Unknown types are not an error - they are actions from a milestone this
 * build does not render yet, so they degrade to the type name rather than
 * disappearing from the feed.
 */
function describe(activity: ActivityDto): { text: string; detail?: string } {
  const p = activity.payload;

  switch (activity.type) {
    case 'ROUND_JOINED':
      return {
        text: `Entered ${str(p.roundName, 'the round')} as #${num(p.publicPimpId)}.`,
        detail: `${formatCents(num(p.startingCashCents))}, ${formatNumber(num(p.startingTurns))} turns, ${str(p.city)}`,
      };

    case 'AWAY_BONUS':
      return {
        text: `Away bonus after ${num(p.awayHours, 6)} hours.`,
        detail: `+${formatNumber(num(p.turns))} turns`,
      };

    case 'SCOUT': {
      const gained = [
        num(p.whores) ? `+${formatNumber(num(p.whores))} whores` : null,
        num(p.thugs) ? `+${formatNumber(num(p.thugs))} thugs` : null,
        num(p.cashCents) ? `+${formatCents(num(p.cashCents))}` : null,
      ].filter(Boolean);

      const lost = [
        num(p.whoresLeft) ? `${num(p.whoresLeft)} whores walked` : null,
        num(p.thugsLeft) ? `${num(p.thugsLeft)} thugs walked` : null,
      ].filter(Boolean);

      return {
        text: `Scouted ${str(p.district, 'a district')} for ${formatNumber(num(p.turns))} turns.`,
        detail: [...gained, ...lost].join(', ') || 'Came back with nothing.',
      };
    }

    case 'PRODUCE_CRACK': {
      const made = [
        num(p.crack) ? `+${formatNumber(num(p.crack))} crack` : null,
        num(p.cashCents) ? `+${formatCents(num(p.cashCents))}` : null,
      ].filter(Boolean);

      return {
        text: `Cooked for ${formatNumber(num(p.turns))} turns.`,
        detail: made.join(', ') || 'Nothing came out of it.',
      };
    }

    case 'PAYOUT_CHANGE':
      return {
        text: `Changed payout from ${num(p.before)}% to ${num(p.after)}%.`,
      };

    default:
      return { text: activity.type.replace(/_/g, ' ').toLowerCase() };
  }
}

/** 1:04 PM */
function time(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ActivityFeed({ activity }: { activity: ActivityDto[] }) {
  if (activity.length === 0) {
    return (
      <div className="se-panel__body">
        <p className="se-muted">Nothing yet. Spend a turn.</p>
      </div>
    );
  }

  return (
    <ul className="se-feed">
      {activity.map((entry) => {
        const { text, detail } = describe(entry);
        return (
          <li className="se-feed__item" key={entry.id}>
            <span className="se-feed__time se-num">{time(entry.createdAt)}</span>
            <span className="se-feed__body">
              <span className="se-feed__text">{text}</span>
              {detail ? <span className="se-feed__detail">{detail}</span> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
