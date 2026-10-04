import type { ActivityDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { useSession } from '../stores/session.js';
import { formatClockTime, formatWhen } from '../utils/time.js';
import { formatCase, wantedStageName, warrantTargetName } from '../utils/law.js';

/** 0.9.0-G. When a pending push, tail or window happens, in the player's own clock. */
function atTime(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? 'soon' : `at ${at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

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
        detail: `${formatNumber(num(p.turns))} turns · intel expires ${str(p.expiresAt) ? formatWhen(str(p.expiresAt)) : 'soon'}`,
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
        num(p.lieutenantCutCents) ? `lieutenant kept ${formatCents(num(p.lieutenantCutCents))}` : null,
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
        num(p.lieutenantCutCents) ? `lieutenant kept ${formatCents(num(p.lieutenantCutCents))}` : null,
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

    case 'BUSINESS_BUILD':
      return {
        text: num(p.level) === 1
          ? `Built a ${str(p.name, 'business')} on ${str(p.districtName, 'your block')}.`
          : `Took the ${str(p.name, 'business')} on ${str(p.districtName, 'your block')} to level ${formatNumber(num(p.level))}.`,
        detail: `-${formatCents(num(p.costCents))}`,
      };

    case 'BUSINESS_STAFF':
      return {
        text: p.open
          ? `Set the ${str(p.name, 'business')} on ${str(p.districtName, 'your block')} to ${formatNumber(num(p.staff))} of ${formatNumber(num(p.maxStaff, num(p.staff)))} staff${p.autoStaff ? ', auto-staffed' : ''}.`
          : `Closed the ${str(p.name, 'business')} on ${str(p.districtName, 'your block')} and brought its staff home.`,
      };

    case 'BLOCK_WAR_DECLARED': {
      const where = str(p.districtName, 'a block');
      if (p.assault) return { text: `${str(p.attacker, 'The attacker')} is going again at your block with ${formatNumber(num(p.squad))} thugs.` };
      return {
        text: p.role === 'attacker'
          ? `Declared a block war on ${str(p.defender, 'a crew')}'s ${where} (${p.goal === 'SACK' ? 'Sack' : 'Take'}) with ${formatNumber(num(p.squad))} thugs.`
          : `${str(p.attacker, 'A crew')} declared war on your ${where} (${p.goal === 'SACK' ? 'Sack' : 'Take'}). The opening fight is coming.`,
      };
    }

    case 'BLOCK_WAR_FIGHT': {
      const kind = p.kind === 'BREAK' ? 'Break attempt' : p.kind === 'ASSAULT' ? 'Assault' : 'Opening fight';
      const outcome = p.kind === 'BREAK'
        ? (p.attackerWon ? 'the siege held' : 'the siege was broken')
        : (p.attackerWon ? 'the attackers won and the siege is on' : 'the block held');
      return {
        text: `${kind} in a block war: ${outcome}.`,
        detail: `${formatNumber(num(p.attackers))} vs ${formatNumber(num(p.defenders))}`,
      };
    }

    case 'BLOCK_WAR_ENDED': {
      const how: Record<string, string> = {
        CONTROL: 'the siege reached full Control', CONCEDED: 'the holder conceded', WITHDREW: 'the attacker withdrew',
        TIMEOUT: 'time ran out', ABANDONED: 'the block was abandoned', CUTOFF: 'the round ended',
      };
      const winner = p.winner === 'ATTACKER' ? (p.goal === 'SACK' ? 'The block was sacked' : 'The block was taken')
        : p.winner === 'DEFENDER' ? 'The holder kept the block' : 'The war is over';
      return {
        text: `Block war over: ${winner} - ${how[str(p.reason)] ?? 'it ended'}.`,
        detail: num(p.lootCents) > 0 ? formatCents(num(p.lootCents)) : undefined,
      };
    }

    case 'BLOCK_WAR_CALL':
      return {
        text: p.answered
          ? `Rode with ${str(p.caller, 'an ally')} into a block war with ${formatNumber(num(p.thugs))} thugs, for a ${formatNumber(num(p.cutPercent))}% cut.`
          : `${str(p.caller, 'An ally')} is calling for help in a block war: a ${formatNumber(num(p.cutPercent))}% cut, open until ${str(p.until).slice(11, 16)}.`,
      };

    case 'BUSINESS_TORCH':
      return {
        text: p.done
          ? `The ${str(p.name, 'business')} burned down to level ${formatNumber(num(p.levelTo))}.`
          : `Set the ${str(p.name, 'business')} alight.`,
        detail: num(p.salvageCents) > 0 ? `+${formatCents(num(p.salvageCents))}` : undefined,
      };

    case 'BUSINESS_RACKET':
      return {
        text: p.racketName
          ? `The ${str(p.name, 'business')} on ${str(p.districtName, 'your block')} now runs ${str(p.racketName, 'a racket')}${p.previousName ? ` instead of ${str(p.previousName, 'its old racket')}` : ''}.`
          : `Shut the ${str(p.previousName, 'racket')} at the ${str(p.name, 'business')} on ${str(p.districtName, 'your block')}.`,
      };

    case 'BUSINESS_COLLECT':
      return {
        text: `Collected the registers at ${formatNumber(num(p.businesses))} business${num(p.businesses) === 1 ? '' : 'es'}.`,
        detail: `+${formatCents(num(p.collectedCents))}`,
      };

    case 'CASINO_BUY_CHIPS':
      return {
        text: 'Bought ' + formatCents(num(p.amountCents)) + ' in chips at ' + str(p.venueName, 'the casino') + '.',
        detail: str(p.cityName),
      };
    case 'CASINO_REDEEM_CHIPS':
      return {
        text: 'Cashed out ' + formatCents(num(p.amountCents)) + ' in chips at ' + str(p.venueName, 'the casino') + '.',
        detail: str(p.cityName),
      };
    case 'CASINO_SESSION_OPENED':
      return {
        text: 'Opened a ' + formatCents(num(p.bankrollCents)) + ' bankroll at ' + str(p.venueName, 'the casino') + '.',
        detail: str(p.cityName),
      };
    case 'CASINO_SESSION_CLOSED':
      return {
        text: 'Closed the session at ' + str(p.venueName, 'the casino') + ' with ' + formatCents(num(p.bankrollCents)) + '.',
        detail: str(p.cityName),
      };
    case 'WARRANT_DRAFTED':
      return {
        text: str(p.cityName, 'A city') + ' police drafted a warrant: ' + warrantTargetName(str(p.target)).toLowerCase() + (p.businessName ? ' (' + str(p.businessName) + ')' : '') + '.',
        detail: 'Served ' + formatWhen(str(p.servesAt)) + ' unless you answer it',
      };
    case 'WARRANT_SERVED':
      return {
        text: str(p.cityName, 'A city') + ' police served their warrant: ' + warrantTargetName(str(p.target)).toLowerCase() + '.',
        detail: [
          num(p.fineCents) > 0 ? 'Fined ' + formatCents(num(p.fineCents)) : '',
          num(p.registerFineCents) > 0 ? 'Register fined ' + formatCents(num(p.registerFineCents)) : '',
          p.shutUntil ? 'Racket shut until ' + formatWhen(str(p.shutUntil)) : '',
          p.lockedUntil ? 'Locked up until ' + formatWhen(str(p.lockedUntil)) : '',
          p.capped ? 'Held to the daily cap' : '',
        ].filter(Boolean).join(' · '),
      };
    case 'OFFICIAL_HIRED':
      return {
        text: (p.renewed ? 'Paid another week to the ' : 'Put the ') + str(p.cityName, 'city') + ' ' + str(p.title, 'official') + (p.renewed ? '.' : ' on the payroll.'),
        detail: formatCents(num(p.weekCents)) + ' · paid until ' + formatWhen(str(p.paidUntil)),
      };
    case 'OFFICIAL_IA_OPENED':
      return {
        text: 'Internal Affairs opened a file on your ' + str(p.cityName, 'city') + ' ' + str(p.title, 'official') + '.',
        detail: 'Cut them loose before ' + formatWhen(str(p.stingAt)) + ' or be caught with them',
      };
    case 'OFFICIAL_CUT':
      return {
        text: 'Cut the ' + str(p.cityName, 'city') + ' ' + str(p.title, 'official') + ' loose.',
        detail: p.underInvestigation ? 'Ahead of Internal Affairs' : '',
      };
    case 'OFFICIAL_STUNG':
      return {
        text: 'Internal Affairs caught your ' + str(p.cityName, 'city') + ' ' + str(p.title, 'official') + '.',
        detail: '+' + formatNumber(num(p.points)) + ' Case in ' + str(p.cityName, 'that city'),
      };
    case 'WARRANT_QUASHED':
      return {
        text: 'Your District Attorney quashed the ' + str(p.cityName, 'city') + ' warrant.',
        detail: warrantTargetName(str(p.target)),
      };
    case 'CAPTAIN_TIP':
      return {
        text: 'Your ' + str(p.cityName, 'city') + ' Captain says the file is close to a warrant.',
        detail: 'Case ' + formatCase(num(p.case)) + ' of ' + formatNumber(num(p.warrantAt)),
      };
    case 'INFORMANT_TIP':
      return {
        text: p.kind === 'SWEEP'
          ? 'An informant says the Feds sweep ' + str(p.cityName, 'a city') + ' ' + formatWhen(str(p.sweepAt)) + '.'
          : 'An informant laid out how the ' + str(p.cityName, 'city') + ' police work.',
        detail: 'Paid ' + formatCents(num(p.feeCents)),
      };
    case 'WARRANT_LAWYERED':
      return {
        text: 'A lawyer answered the ' + str(p.cityName, 'city') + ' warrant.',
        detail: 'Fee ' + formatCents(num(p.feeCents)),
      };
    case 'LAWYER_RETAINED':
      return {
        text: 'A lawyer is on retainer until ' + formatWhen(str(p.retainedUntil)) + '.',
        detail: 'Fee ' + formatCents(num(p.feeCents)),
      };
    case 'CASE_STAGE_UP':
      return {
        text: str(p.cityName, 'A city') + ' police now have you at ' + wantedStageName(str(p.stage)) + '.',
        detail: 'Case ' + formatCase(num(p.case)) + ' · private to you',
      };
    case 'CASINO_STATUS_UP':
      return {
        text: 'The casinos now know you as ' + str(p.tierName, 'a regular') + '.',
        detail: 'Bankroll ceiling ' + formatCents(num(p.maxBankrollCents)),
      };
    case 'CASINO_COMP_HOTEL':
      return {
        text: str(p.venueName, 'The casino') + ' comped ' + formatNumber(num(p.minutes) / 60) + ' more hours at the hotel.',
        detail: formatCents(num(p.compCents)) + ' in comps · ' + str(p.cityName),
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

    case 'STREET_PASS_CLAIMED':
      return {
        text: `Claimed Street Pass tier ${typeof p.tier === 'number' ? p.tier : '?'}.`,
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

    // 0.9.0-G clock events. None of them names who is pushing or tailing: the game never says.
    case 'TURF_PUSH_INCOMING':
      return {
        text: `Your Lookouts spotted a push on your ${str(p.cityName, 'city')} ${str(p.districtName, 'block')} block.`,
        detail: p.landsAt ? `It lands ${atTime(str(p.landsAt))}. Hold it or call your alliance.` : '',
      };

    case 'ALLIANCE_CALL':
      return p.kind === 'convoy'
        ? {
          text: `${str(p.ally, 'An ally')} called for backup: their run is being tailed near ${str(p.cityName, 'town')}.`,
          detail: p.landsAt ? `The hit lands ${atTime(str(p.landsAt))}.` : '',
        }
        : {
          text: `${str(p.ally, 'An ally')} called for backup on their ${str(p.cityName, 'city')} ${str(p.districtName, 'block')} block.`,
          detail: p.landsAt ? `The push lands ${atTime(str(p.landsAt))}.` : '',
        };

    case 'CONVOY_TAILED':
      return {
        text: `Your Lookouts spotted a tail on your run near ${str(p.cityName, 'town')}.`,
        detail: p.landsAt ? `The hit lands ${atTime(str(p.landsAt))}.` : '',
      };

    case 'REVENGE_EXPIRING':
      return {
        text: `Your revenge against ${str(p.attacker, 'your attacker')} expires soon.`,
        detail: p.expiresAt ? `The window closes ${atTime(str(p.expiresAt))}.` : '',
      };

    case 'SPECIAL_ORDER_READY':
      return {
        text: `Your special order of ${str(p.item, 'stock')} arrived at ${str(p.store, 'the store')}.`,
        detail: 'It is on the shelf now.',
      };

    case 'RUN_LAUNCHED':
      return {
        text: p.bossAboard ? `The boss rode out with a run to ${str(p.cityName, 'another city')}.` : `Sent a run to ${str(p.cityName, 'another city')}.`,
        detail: `${formatNumber(num(p.turns))} turns`,
      };

    case 'RUN_RETURNED':
      return {
        text: `${p.bossAboard ? 'The boss and your run came' : 'Your run came'} home from ${Array.isArray(p.cities) ? (p.cities as unknown[]).map(String).join(', ') : 'the road'}.`,
        detail: [
          `${formatCents(num(p.startCashCents))} → ${formatCents(num(p.cashCents))}`,
          p.bossAboard && num(p.hotelCents) ? `${formatCents(num(p.hotelCents))} hotel` : null,
        ].filter(Boolean).join(' · '),
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

    case 'TRIP_STARTED':
      return {
        text: `The boss flew to ${str(p.cityName, 'another city')}.`,
        detail: `-${formatCents(num(p.ticketCents) + num(p.hotelCents))} flight and hotel · ${formatCents(num(p.bankrollCents))} bankroll`,
      };

    case 'BOSS_HIT':
      return { text: `Sent ${formatNumber(num(p.squad))} after ${str(p.owner, 'a visiting boss')} in ${str(p.cityName, 'town')}.`, detail: `${formatNumber(num(p.turns))} turns` };

    case 'BOSS_HIT_BACKUP':
      return { text: `Sent ${formatNumber(num(p.thugs))} to stand with ${str(p.owner, 'an ally')}'s boss in ${str(p.cityName, 'town')}.` };

    case 'OUTPOST_VISIT':
      return {
        text: `The boss walked ${str(p.districtName, 'an outpost')} in ${str(p.cityName, 'town')}.`,
        detail: num(p.collectedCents) ? `${formatCents(num(p.collectedCents))} into the bankroll` : '',
      };

    case 'SIT_DOWN':
      return { text: `Asked ${str(p.with, 'another boss')} to sit down in ${str(p.cityName, 'town')}.` };

    case 'SIT_DOWN_AGREED':
      return { text: `Sat down with ${str(p.with, 'another boss')} in ${str(p.cityName, 'town')}. A truce holds for now.` };

    case 'BOSS_HIT_ATTACK':
      return p.escaped
        ? { text: `${str(p.owner, 'The boss')} was gone before your squad got there.` }
        : p.held
          ? { text: `${str(p.owner, 'The boss')}'s bodyguards held your squad off in ${str(p.cityName, 'town')}.`, detail: `${formatNumber(num(p.wounds))} wounded` }
        : { text: `Your squad robbed ${str(p.owner, 'a visiting boss')} in ${str(p.cityName, 'town')}.`, detail: `+${formatCents(num(p.cashCents))}` };

    case 'BOSS_HIT_DEFENSE':
      return p.escaped
        ? { text: `You got out of ${str(p.cityName, 'town')} before ${str(p.attacker, 'their people')} moved.` }
        : p.held
          ? { text: `Your bodyguards held off ${str(p.attacker, 'the locals')} in ${str(p.cityName, 'town')}.`, detail: `${formatNumber(num(p.wounds))} wounded` }
        : { text: `${str(p.attacker, 'Locals')} beat you in ${str(p.cityName, 'town')}. Laid up and on the next flight home.`, detail: `-${formatCents(Math.abs(num(p.cashCents)))}` };

    case 'TRIP_RETURNED':
      return {
        text: `The boss is back from ${str(p.cityName, 'the trip')}.`,
        detail: `${formatCents(num(p.bankrollCents))} bankroll home`,
      };

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

    case 'GAME_ANNOUNCEMENT':
      return { text: str(p.title, 'Announcement from the admins'), detail: str(p.excerpt) };

    case 'ADMIN_GRANT':
      return {
        text: 'An admin sent you compensation.',
        detail: [str(p.reason), changeSummary(p.granted)].filter(Boolean).join(' · '),
      };

    case 'FAVOR_ACTIVATED':
      return {
        text: `Activated ${str(p.name, str(p.favorKey, 'a favor'))}.`,
        detail: `${str(p.category)} · active until ${str(p.expiresAt) ? formatClockTime(str(p.expiresAt)) : 'soon'}`,
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
  if (type.startsWith('STORE_') || type.startsWith('CASINO_')) return 'market';
  if (type.startsWith('QUEST_') || type.startsWith('FAVOR_') || type === 'HIDEOUT_UPGRADE' || type === 'WEAPON_UNLOCK') return 'progress';
  if (type.startsWith('RUN_') || type.startsWith('RELOCATION_') || type === 'RELOCATED' || type.startsWith('CONVOY_') || type.startsWith('TRIP_') || type.startsWith('BOSS_') || type.startsWith('SIT_DOWN') || type === 'OUTPOST_VISIT') return 'travel';
  if (type.startsWith('TURF_') || type.startsWith('BUSINESS_')) return 'turf';
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
    GAME_ANNOUNCEMENT: 'Announcement',
    HEAT_BRIBE: 'Heat bribe',
    HIDEOUT_UPGRADE: 'Hideout',
    QUEST_OBJECTIVE_COMPLETE: 'Quest objective',
    QUEST_READY: 'Quest ready',
    QUEST_CLAIMED: 'Quest claimed',
    STREET_PASS_CLAIMED: 'Street Pass',
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
    TURF_PUSH_INCOMING: 'Push spotted',
    ALLIANCE_CALL: 'Backup call',
    CONVOY_TAILED: 'Tail spotted',
    REVENGE_EXPIRING: 'Revenge expiring',
    SPECIAL_ORDER_READY: 'Special order',
    BUSINESS_BUILD: 'Business built',
    BUSINESS_STAFF: 'Business staff',
    BUSINESS_COLLECT: 'Business income',
    BUSINESS_RACKET: 'Racket',
    BUSINESS_TORCH: 'Torch',
    BLOCK_WAR_DECLARED: 'Block war',
    BLOCK_WAR_FIGHT: 'Block war fight',
    BLOCK_WAR_ENDED: 'Block war over',
    BLOCK_WAR_CALL: 'Call for help',
    CASINO_BUY_CHIPS: 'Casino chips',
    CASINO_REDEEM_CHIPS: 'Casino cash out',
    CASINO_SESSION_OPENED: 'Casino session',
    CASINO_SESSION_CLOSED: 'Casino session closed',
    CASINO_STATUS_UP: 'Casino status',
    CASE_STAGE_UP: 'Case',
    WARRANT_DRAFTED: 'Warrant',
    WARRANT_SERVED: 'Warrant served',
    WARRANT_LAWYERED: 'Lawyered up',
    LAWYER_RETAINED: 'Lawyer',
    OFFICIAL_HIRED: 'Payroll',
    OFFICIAL_IA_OPENED: 'Internal Affairs',
    OFFICIAL_CUT: 'Payroll',
    OFFICIAL_STUNG: 'Sting',
    WARRANT_QUASHED: 'Warrant quashed',
    CAPTAIN_TIP: 'Captain',
    INFORMANT_TIP: 'Informant',
    CASINO_COMP_HOTEL: 'Comped hotel',
  };
  return aliases[type] ?? String(type).replace(/_/g, ' ').toLowerCase();
}

function dayKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
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
