import type { ActivityDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { useSession } from '../stores/session.js';

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function sentence(value: string): string {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function productFindSummary(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const found = row as Record<string, unknown>;
    const quantity = num(found.quantity);
    const name = str(found.name, str(found.key, 'product').toLowerCase());
    return quantity > 0 ? [`+${formatNumber(quantity)} ${name} found`] : [];
  });
}

function productMovementSummary(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const row = entry as Record<string, unknown>;
    const name = str(row.name, str(row.key ?? row.product, 'product').toLowerCase());
    const produced = num(row.produced);
    const found = num(row.found);
    const gained = num(row.gained);
    const lost = num(row.lost);
    const used = num(row.used);
    const seized = num(row.seized);
    const parts = [
      produced > 0 ? `+${formatNumber(produced)} produced` : null,
      found > 0 ? `+${formatNumber(found)} found` : null,
      gained > 0 ? `+${formatNumber(gained)} gained` : null,
      lost > 0 ? `−${formatNumber(lost)} lost` : null,
      used > 0 ? `−${formatNumber(used)} used` : null,
      seized > 0 ? `−${formatNumber(seized)} seized` : null,
    ].filter(Boolean);

    if (!parts.length) {
      const change = num(row.change);
      if (!change) return [];
      return [`${change > 0 ? '+' : '−'}${formatNumber(Math.abs(change))} ${name}`];
    }

    return [`${name}: ${parts.join(' · ')}`];
  });
}

/** The opponent as the feed names them: "[WC] Iron Maya", or just the name for solo players and older entries. */
function opponent(p: Record<string, unknown>, fallback = ''): string {
  const name = str(p.opponent, fallback);
  const tag = str(p.opponentTag);
  return tag && name ? `[${tag}] ${name}` : name;
}

const CHANGE_LABELS: Record<string, string> = {
  cashCents: 'cash', woundedThugs: 'wounded thugs', lowRiders: 'Low-Riders', tek9s: 'Tek-9s', ak47s: 'AK-47s', driveBysDone: 'drive-bys',
};

/** "+$500, -3 wounded thugs" from an admin correction's changes. */
function changeSummary(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  return Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] !== 0)
    .map(([field, amount]) => {
      const sign = amount > 0 ? '+' : '−';
      const size = field === 'cashCents' ? formatCents(Math.abs(amount)) : formatNumber(Math.abs(amount));
      return `${sign}${size}${field === 'cashCents' ? '' : ` ${CHANGE_LABELS[field] ?? field}`}`;
    })
    .join(', ');
}

/**
 * Section 42. One line per thing the player did, in their words.
 *
 * Unknown types are not an error - they are actions from a milestone this
 * build does not render yet, so they degrade to the type name rather than
 * disappearing from the feed.
 */
export function describeActivity(activity: ActivityDto, crackWord: string): { text: string; detail?: string } {
  const p = activity.payload;

  switch (activity.type) {
    case 'RAID_ATTACK':
    case 'RAID_DEFENSE': {
      const move = str(p.move, activity.type === 'RAID_ATTACK' ? 'Raid' : 'Raid defense');
      const attacking = activity.type === 'RAID_ATTACK';
      const inventory = productMovementSummary(p.inventoryChanges);
      const details = [
        `${num(p.cashCents) >= 0 ? '+' : '−'}${formatCents(Math.abs(num(p.cashCents)))} · ${num(p.turns)} turns`,
        ...inventory,
        !inventory.length && num(p.crack) ? `${num(p.crack) >= 0 ? '+' : '−'}${formatNumber(Math.abs(num(p.crack)))} product` : null,
        num(p.whoresDrugged) ? `${formatNumber(num(p.whoresDrugged))} hoes drugged` : null,
        num(p.defenderCondomsBurned) ? `${formatNumber(num(p.defenderCondomsBurned))} condoms burned` : null,
        num(p.lowRidersStolen) ? `${formatNumber(num(p.lowRidersStolen))} Low-Rider${num(p.lowRidersStolen) === 1 ? '' : 's'} stolen` : null,
        num(p.whoresLured) ? `${formatNumber(num(p.whoresLured))} hoes lured` : null,
        num(p.thugsLured) ? `${formatNumber(num(p.thugsLured))} thugs lured` : null,
        num(p.beerSpent) ? `${formatNumber(num(p.beerSpent))} beer spent` : null,
        num(p.wounds) ? `${formatNumber(num(p.wounds))} wounded` : null,
      ].filter(Boolean).join(' · ');
      return {
        text: attacking
          ? `${move} on ${opponent(p)} — ${p.won ? 'won' : 'lost'}.`
          : `${opponent(p)} tried ${move.toLowerCase()} on you — ${p.won ? 'you held them off' : 'they got through'}.`,
        detail: details,
      };
    }
    case 'DRIVE_BY_ATTACK':
    case 'DRIVE_BY_DEFENSE': {
      const attacking = activity.type === 'DRIVE_BY_ATTACK';
      return {
        text: attacking
          ? `Drive-by on ${opponent(p)} — ${p.won ? 'it landed' : 'they shot back and won'}.`
          : `${opponent(p)} did a drive-by on your block — ${p.won ? 'your crew saw them off' : 'it landed'}.`,
        detail: [
          attacking ? `${num(p.turns)} turns` : null,
          num(p.whoresKilled) ? `${formatNumber(num(p.whoresKilled))} ${attacking ? 'of their' : 'of your'} whores killed` : null,
          num(p.wounds) ? `${formatNumber(num(p.wounds))} of yours wounded` : null,
          num(p.opponentWounds) ? `${formatNumber(num(p.opponentWounds))} of theirs wounded` : null,
          num(p.lowRidersLost) ? `${formatNumber(num(p.lowRidersLost))} Low-Rider${num(p.lowRidersLost) === 1 ? '' : 's'} lost` : null,
        ].filter(Boolean).join(' · '),
      };
    }
    case 'COMBAT_TREATMENT':
      return {
        text: `Treated ${formatNumber(num(p.treatedThugs))} wounded thugs.`,
        detail: `${formatNumber(num(p.medicineUsed))} medicine used`,
      };
    case 'COMBAT_RECON':
      return {
        text: `Recon on ${str(p.target)}.`,
        detail: `${formatNumber(num(p.turns))} turns · intel expires ${str(p.expiresAt) ? new Date(str(p.expiresAt)).toLocaleString() : 'soon'}`,
      };
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
      const movements = productMovementSummary(p.productMovements);
      const mixedFinds = productFindSummary(p.productsFound);
      const found = [
        num(p.cashCents) ? `+${formatCents(num(p.cashCents))}` : null,
        num(p.whores) ? `+${formatNumber(num(p.whores))} whores` : null,
        num(p.thugs) ? `+${formatNumber(num(p.thugs))} thugs` : null,
        ...movements,
        ...(!movements.length ? mixedFinds : []),
        !movements.length && !mixedFinds.length && num(p.crackFound) ? `+${formatNumber(num(p.crackFound))} ${crackWord} found` : null,
        num(p.whoresLeft) ? `${num(p.whoresLeft)} whores walked` : null,
        num(p.thugsLeft) ? `${num(p.thugsLeft)} thugs walked` : null,
        p.busted ? `BUSTED, fined ${formatCents(num(p.fineCents))}` : null,
      ].filter(Boolean);

      return {
        text: `Scouted ${str(p.district, 'a district')} for ${formatNumber(num(p.turns))} turns.`,
        detail: found.join(', ') || 'A quiet night.',
      };
    }

    case 'WORK_STREETS': {
      const detail = [
        `+${formatCents(num(p.cashCents))}`,
        num(p.crackFound) ? `+${formatNumber(num(p.crackFound))} ${crackWord} found` : null,
        num(p.whoresLeft) ? `${num(p.whoresLeft)} whores walked` : null,
        num(p.thugsLeft) ? `${num(p.thugsLeft)} thugs walked` : null,
      ].filter(Boolean);

      return {
        text: `Worked ${str(p.district, 'a district')} for ${formatNumber(num(p.turns))} turns.`,
        detail: detail.join(', '),
      };
    }

    case 'PRODUCE_CRACK': {
      const movements = productMovementSummary(p.productMovements);
      const detail = [
        ...movements,
        ...(!movements.length && num(p.product ?? p.crack)
          ? [`+${formatNumber(num(p.product ?? p.crack))} ${str(p.productName, 'product')}`]
          : []),
        ...(!movements.length ? productFindSummary(p.productsFound) : []),
        num(p.cashCents) ? `+${formatCents(num(p.cashCents))}` : null,
        num(p.ingredientCents) ? `-${formatCents(num(p.ingredientCents))} ingredients` : null,
        p.busted ? `BUSTED, fined ${formatCents(num(p.fineCents))}` : null,
      ].filter(Boolean);

      return {
        text: `Produced ${str(p.productName, 'product')} for ${formatNumber(num(p.turns))} turns.`,
        detail: detail.join(', ') || 'Nothing came out of it.',
      };
    }

    case 'HEAT_BRIBE':
      return {
        text: `Paid off ${formatNumber(num(p.points))} Heat.`,
        detail: `-${formatCents(num(p.costCents))}, Heat ${num(p.heatBefore)} → ${num(p.heatAfter)}`,
      };

    case 'PAYOUT_CHANGE':
      return {
        text: `Changed payout from ${num(p.before)}% to ${num(p.after)}%.`,
      };

    case 'HIDEOUT_UPGRADE':
      return {
        text: `Upgraded ${str(p.name, 'the hideout')} to level ${formatNumber(num(p.level))}.`,
        detail: `-${formatCents(num(p.costCents))}`,
      };

    case 'QUEST_OBJECTIVE_COMPLETE':
      return {
        text: `${p.bonus ? 'Bonus objective' : 'Objective'} complete: ${sentence(str(p.objective, 'quest progress'))}`,
        detail: str(p.title) ? `Job: ${str(p.title)}` : undefined,
      };

    case 'QUEST_READY':
      return {
        text: `Job complete: ${str(p.title, 'a quest')}.`,
        detail: 'Return to Quests to collect payment.',
      };

    case 'QUEST_CLAIMED':
      return {
        text: `Collected payment for ${str(p.title, 'a quest')}.`,
        detail: Array.isArray(p.rewards) ? (p.rewards as unknown[]).map(String).join(' · ') : undefined,
      };

    case 'STORE_BUY':
    case 'STORE_SELL':
      return {
        text: `${activity.type === 'STORE_BUY' ? 'Bought' : 'Sold'} ${formatNumber(num(p.quantity))} ${str(p.item)} at ${str(p.store)}.`,
        detail: `${activity.type === 'STORE_BUY' ? '-' : '+'}${formatCents(num(p.totalCents))}`,
      };

    case 'WEAPON_UNLOCK': {
      const weapon = str(p.weapon);
      const purchaseName = weapon ? `${weapon} purchases` : 'Tommy’s locked weapon purchases';
      return {
        text: `Earned ${weapon || 'weapon'} access at Tommy’s.`,
        detail: [
          str(p.unlock) || str(p.favor) || str(p.title),
          `${purchaseName} are unlocked for the rest of the round.`,
          'Buying one still uses Tommy’s shelf and your cash.',
        ].filter(Boolean).join(' · '),
      };
    }

    case 'BATTLE_VOIDED':
      return {
        text: `An admin voided your battle with ${opponent(p, 'another player')}.`,
        detail: [
          str(p.reason),
          changeSummary(p.changes),
        ].filter(Boolean).join(' · '),
      };

    case 'RUN_LAUNCHED':
      return { text: `Sent a run to ${str(p.cityName, 'another city')}.`, detail: `${formatNumber(num(p.turns))} turns` };

    case 'RUN_RETURNED':
      return {
        text: `Your run came home from ${Array.isArray(p.cities) ? (p.cities as unknown[]).map(String).join(', ') : 'the road'}.`,
        detail: `${formatCents(num(p.startCashCents))} → ${formatCents(num(p.cashCents))}`,
      };

    case 'RUN_INCIDENT':
      return {
        text: str(p.kind) === 'STOP' ? `Police stopped your run on ${str(p.road, 'the road')}.`
          : str(p.kind) === 'ARREST' ? `Your run was arrested in ${str(p.cityName, 'town')}.` : `Your run was busted in ${str(p.cityName, 'town')}.`,
        detail: num(p.fineCents) ? `-${formatCents(num(p.fineCents))}` : '',
      };

    case 'RELOCATION_STARTED':
      return { text: `Started moving to ${str(p.toName, 'a new city')}.`, detail: `-${formatCents(num(p.feeCents))}` };

    case 'RELOCATED':
      return { text: 'Moved in. The new city\u2019s rules apply now.' };

    case 'CONVOY_TAIL':
      return { text: `Put ${formatNumber(num(p.squad))} on ${str(p.owner, 'a')}'s run near ${str(p.cityName, 'town')}.`, detail: `${formatNumber(num(p.turns))} turns` };

    case 'CONVOY_ATTACK':
      return {
        text: p.escaped ? `${str(p.owner, 'Their')}'s run got away from your squad.` : p.won ? `Hit ${str(p.owner, 'a')}'s run near ${str(p.city, 'town')}.` : `${str(p.owner, 'Their')}'s crew held off your squad.`,
        detail: num(p.cashCents) ? `+${formatCents(num(p.cashCents))}` : '',
      };

    case 'CONVOY_DEFENSE':
      return {
        text: p.escaped ? `Your run slipped ${str(p.attacker, 'a')}'s tail near ${str(p.city, 'town')}.` : p.held ? `Your run held off ${str(p.attacker, 'an attack')} near ${str(p.city, 'town')}.` : `${str(p.attacker, 'Someone')} hit your run near ${str(p.city, 'town')}.`,
        detail: num(p.cashCents) ? `${formatCents(num(p.cashCents))}` : '',
      };

    case 'CONVOY_BACKUP':
      return { text: `Sent ${formatNumber(num(p.thugs))} to back up ${str(p.owner, 'a')}'s run near ${str(p.city, 'town')}.` };

    case 'ADMIN_GRANT':
      return {
        text: 'An admin sent you compensation.',
        detail: [str(p.reason), changeSummary(p.granted)].filter(Boolean).join(' · '),
      };

    case 'FAVOR_ACTIVATED':
      return {
        text: `Activated ${str(p.name, str(p.favorKey, 'a favor'))}.`,
        detail: `${str(p.category)} · active until ${str(p.expiresAt) ? new Date(str(p.expiresAt)).toLocaleTimeString() : 'soon'}`,
      };
    case 'FAVOR_ARMED':
      return {
        text: `Armed ${str(p.name, str(p.favorKey, 'a favor'))}.`,
        detail: `${str(p.category)} · waiting for the next eligible action`,
      };
    case 'FAVOR_DISARMED':
      return {
        text: `Put ${str(p.name, str(p.favorKey, 'a favor'))} back in your pocket.`,
        detail: str(p.category),
      };
    default:
      return { text: String(activity.type).replace(/_/g, ' ').toLowerCase() };
  }
}

/** 1:04 PM */
function time(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export type ActivityGroup = 'combat' | 'street' | 'market' | 'progress' | 'travel' | 'turf' | 'system';

export function activityGroup(type: ActivityDto['type']): ActivityGroup {
  if (type.startsWith('RAID_') || type.startsWith('DRIVE_BY_') || type.startsWith('COMBAT_') || type === 'BATTLE_VOIDED') return 'combat';
  if (type.startsWith('STORE_')) return 'market';
  if (type.startsWith('QUEST_') || type.startsWith('FAVOR_') || type === 'HIDEOUT_UPGRADE' || type === 'WEAPON_UNLOCK') return 'progress';
  if (type.startsWith('RUN_') || type.startsWith('RELOCATION_') || type === 'RELOCATED' || type.startsWith('CONVOY_')) return 'travel';
  if (type.startsWith('TURF_')) return 'turf';
  if (type === 'SCOUT' || type === 'WORK_STREETS' || type === 'PRODUCE_CRACK' || type === 'HEAT_BRIBE' || type === 'PAYOUT_CHANGE') return 'street';
  return 'system';
}

export function activityGroupLabel(group: ActivityGroup): string {
  switch (group) {
    case 'combat': return 'Combat';
    case 'street': return 'Street';
    case 'market': return 'Market';
    case 'progress': return 'Progress';
    case 'travel': return 'Travel';
    case 'turf': return 'Turf';
    case 'system': return 'System';
  }
}

function activityTypeLabel(type: ActivityDto['type']): string {
  const aliases: Partial<Record<ActivityDto['type'], string>> = {
    RAID_ATTACK: 'Raid',
    RAID_DEFENSE: 'Raid defense',
    DRIVE_BY_ATTACK: 'Drive-by',
    DRIVE_BY_DEFENSE: 'Drive-by defense',
    COMBAT_TREATMENT: 'Treatment',
    COMBAT_RECON: 'Recon',
    ROUND_JOINED: 'Round joined',
    SCOUT: 'Scout',
    WORK_STREETS: 'Work streets',
    PRODUCE_CRACK: 'Produce',
    STORE_BUY: 'Store buy',
    STORE_SELL: 'Store sell',
    WEAPON_UNLOCK: 'Weapon unlock',
    PAYOUT_CHANGE: 'Payout',
    AWAY_BONUS: 'Away bonus',
    BATTLE_VOIDED: 'Battle voided',
    ADMIN_GRANT: 'Admin grant',
    HEAT_BRIBE: 'Heat bribe',
    HIDEOUT_UPGRADE: 'Hideout',
    QUEST_OBJECTIVE_COMPLETE: 'Quest objective',
    QUEST_READY: 'Quest ready',
    QUEST_CLAIMED: 'Quest claimed',
    FAVOR_ACTIVATED: 'Favor activated',
    FAVOR_ARMED: 'Favor armed',
    FAVOR_DISARMED: 'Favor disarmed',
    RUN_LAUNCHED: 'Run launched',
    RUN_RETURNED: 'Run returned',
    RUN_INCIDENT: 'Run incident',
    RELOCATION_STARTED: 'Relocation',
    RELOCATED: 'Relocated',
    CONVOY_TAIL: 'Convoy tail',
    CONVOY_ATTACK: 'Convoy attack',
    CONVOY_DEFENSE: 'Convoy defense',
    CONVOY_BACKUP: 'Convoy backup',
    TURF_CLAIM: 'Turf claim',
    TURF_POST: 'Turf post',
    TURF_PULL: 'Turf pull',
    TURF_PUSH: 'Turf push',
    TURF_PUSH_BACKUP: 'Turf backup',
    TURF_PUSH_ATTACK: 'Turf attack',
    TURF_PUSH_DEFENSE: 'Turf defense',
    TURF_OUTPOST_ESTABLISH: 'Outpost established',
    TURF_OUTPOST_TRANSFER: 'Outpost transfer',
  };
  return aliases[type] ?? String(type).replace(/_/g, ' ').toLowerCase();
}

function dayKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const value = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const deltaDays = Math.round((today - value) / 86_400_000);
  if (deltaDays === 0) return 'Today';
  if (deltaDays === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

export function ActivityFeed({ activity, detailed = false }: { activity: ActivityDto[]; detailed?: boolean }) {
  // Crack is "product" on rounds with only one, and crack by name once there are others.
  const crackWord = useSession((s) => s.me?.products) ? 'crack' : 'product';
  if (activity.length === 0) {
    return (
      <div className="se-panel__body">
        <p className="se-muted">Nothing yet. Spend a turn.</p>
      </div>
    );
  }

  return (
    <ul className={`se-feed${detailed ? ' se-feed--detailed' : ''}`}>
      {activity.flatMap((entry, index) => {
        const { text, detail } = describeActivity(entry, crackWord);
        const group = activityGroup(entry.type);
        const startsDay = detailed && (index === 0 || dayKey(activity[index - 1]!.createdAt) !== dayKey(entry.createdAt));
        const item = (
          <li className={`se-feed__item${detailed ? ` se-feed__item--detailed se-feed__item--${group}` : ''}`} key={entry.id}>
            <span className="se-feed__time se-num">{time(entry.createdAt)}</span>
            <span className="se-feed__body">
              {detailed ? (
                <span className="se-feed__meta">
                  <span className={`se-feed__kind se-feed__kind--${group}`}>{activityTypeLabel(entry.type)}</span>
                  <span className="se-feed__group">{activityGroupLabel(group)}</span>
                </span>
              ) : null}
              <span className="se-feed__text">{text}</span>
              {detail ? <span className="se-feed__detail">{detail}</span> : null}
            </span>
          </li>
        );

        return startsDay
          ? [
              <li className="se-feed__day" key={`day-${dayKey(entry.createdAt)}`}>{dayLabel(entry.createdAt)}</li>,
              item,
            ]
          : [item];
      })}
    </ul>
  );
}
