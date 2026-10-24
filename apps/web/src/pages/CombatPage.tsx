import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { isString, rememberedKey, useRememberedState } from '../utils/remembered.js';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { formatCents, formatNumber, type BattleReportDto, type CombatPageDto, type CombatRingDto, type CombatSpecialRaidDto, type CombatTargetDto, type CustomizableItemKey, type ItemCosmeticStyleKey, type SpecialRaidKindDto } from '@streets/shared';
import { previewCombatAmmo } from '@streets/rules-engine';
import { rulesets } from '@streets/rulesets';
import { combatApi } from '../api/combat.js';
import { ringApi } from '../api/ring.js';
import { ApiError } from '../api/client.js';
import { ActionDock, deltaChip, type ResultChip } from '../components/ActionDock.js';
import { ActionReadiness, OperationDetails } from '../components/ActionReadiness.js';
import { QuantitySteps } from '../components/QuantitySteps.js';
import { Alert } from '../components/Alert.js';
import { AllianceTag } from '../components/AllianceTag.js';
import { showGameToast } from '../components/GameEventToasts.js';
import { Button } from '../components/Button.js';
import { CrewTeamPicker } from '../components/CrewTeamPicker.js';
import { ItemLabel, ItemTile } from '../components/ItemTile.js';
import { Panel, Row } from '../components/Panel.js';
import { supplyEffects, supplySummary, WorkSupplyPanel, WorkSupplyStockRows } from '../components/WorkSupplyPanel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';
import { newActionId } from '../utils/actionId.js';
import { browserSessionStorage } from '../utils/pendingAction.js';

/** 0.4.0-D. Recon reads a stash's depth, never its count. */
const STASH_LABELS = { none: 'Empty', light: 'Light', stocked: 'Stocked', heavy: 'Heavy' } as const;
import { loadPendingRaid, savePendingRaid, type PendingRaid } from '../utils/pendingRaid.js';
import { formatWhen } from '../utils/time.js';

const date = (value: string) => formatWhen(value);
const weaponName = (key: string) => key === 'TEK9' ? 'Tek-9' : key === 'AK47' ? 'AK-47' : key.toLowerCase();
const weaponsText = (weapons: Record<string, number>) => Object.entries(weapons).filter(([, count]) => count > 0).map(([key, count]) => `${formatNumber(count)} ${weaponName(key)}`).join(', ') || 'unarmed';
const gangDangerLabel = { QUIET: 'Quiet', ACTIVE: 'Active', HOT: 'Hot' } as const;

const signedUnits = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatNumber(Math.abs(value))}`;
/**
 * A report row label with the item's picture; `slot` keeps labels lined up when
 * a Low-Rider row is in the list. `style` draws it in one side's art (Slice G).
 */
const art = (itemKey: string, text: string, style?: ItemCosmeticStyleKey) => <ItemLabel itemKey={itemKey} slot cosmeticStyle={style}>{text}</ItemLabel>;

type LookSide = 'you' | 'opponent';

/**
 * Slice G: the style an item had on one side of this battle. Undefined on
 * reports from before looks were captured, which keeps the viewer's own art.
 */
function sideStyle(report: BattleReportDto, side: LookSide, itemKey: string): ItemCosmeticStyleKey | undefined {
  const look = report.looks?.[side];
  if (!look) return undefined;
  if (itemKey === 'THUG' || itemKey === 'HOE') return look.crew[itemKey];
  return look.items[itemKey as CustomizableItemKey] ?? 'classic';
}

/** Whose side the defender's crew, product and rides are on in this report. */
const defenderSide = (report: BattleReportDto): LookSide => (report.role === 'DEFENDER' ? 'you' : 'opponent');

const FACE_OFF_ITEMS = ['THUG', 'AK47', 'LOW_RIDER'] as const;

function hasLookFlair(report: BattleReportDto): boolean {
  const looks = report.looks;
  if (!looks) return false;
  return [looks.you, looks.opponent].some((look) => Object.values(look.items).some((style) => style && style !== 'classic')
    || Object.values(look.crew).some((style) => style !== 'classic'));
}

/** Slice G: each side's look when the battle happened. Art only, never counts. */
function FaceOff({ report }: { report: BattleReportDto }) {
  if (!hasLookFlair(report)) return null;
  const side = (who: LookSide, label: string) => (
    <div className="se-faceoff__side">
      <span className="se-faceoff__label">{label}</span>
      <div className="se-faceoff__tiles">
        {FACE_OFF_ITEMS.map((key) => <ItemTile key={key} item={key} size="sm" label={false} cosmeticStyle={sideStyle(report, who, key)} />)}
      </div>
    </div>
  );
  return (
    <div className="se-faceoff" aria-label="Each side's look in this fight">
      {side('you', 'You')}
      {side('opponent', `vs ${report.opponent.displayName}`)}
    </div>
  );
}

const signedCents = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatCents(Math.abs(value))}`;

/** The battle report squeezed into one line for the dock: what you took, lost and broke. */
function battleChips(report: BattleReportDto): ResultChip[] {
  const chips: ResultChip[] = [];
  if (report.cashChangeCents) chips.push(deltaChip('Cash', report.cashChangeCents, { money: true }));
  if (report.inventoryChanges?.length) {
    for (const row of report.inventoryChanges) if (row.change) chips.push(deltaChip(row.name, row.change));
  } else {
    if (report.crackChange) chips.push(deltaChip(report.productChanges ? 'Crack' : 'Product', report.crackChange));
    for (const row of report.productChanges ?? []) if (row.change) chips.push(deltaChip(row.name, row.change));
  }
  const form = report.raidForm;
  if (form?.whoresDrugged) chips.push(deltaChip('Hoes drugged', form.whoresDrugged));
  if (form?.whoresLured) chips.push(deltaChip('Hoes joined', form.whoresLured));
  if (form?.thugsLured) chips.push(deltaChip('Thugs joined', form.thugsLured));
  if (form?.lowRidersStolen) chips.push(deltaChip('Low-Riders', form.lowRidersStolen));
  if (report.driveBy?.whoresKilled) chips.push(deltaChip('Their whores killed', report.driveBy.whoresKilled));
  if (report.driveBy?.lowRidersLost) chips.push(deltaChip('Low-Riders', -report.driveBy.lowRidersLost));
  if (report.yourWounds) chips.push(deltaChip('Your wounded', report.yourWounds, { invert: true }));
  if (report.opponentWounds) chips.push(deltaChip('Their wounded', report.opponentWounds));
  if (report.nationalRankBefore !== report.nationalRankAfter) {
    chips.push({ ...deltaChip('National rank', report.nationalRankBefore - report.nationalRankAfter), text: `#${report.nationalRankAfter}` });
  }
  chips.push({ key: 'turns', label: 'Turns', text: `−${formatNumber(report.turnsSpent)}`, tone: 'muted' });
  if (report.cooldownUntil) chips.push({ key: 'cooldown', label: 'Next hit', text: date(report.cooldownUntil), tone: 'muted' });
  return chips;
}

function BattleInventoryRows({ report }: { report: BattleReportDto }) {
  if (report.inventoryChanges?.length) {
    return <>
      {report.inventoryChanges.map((row) => {
        const amount = (value: number) => `${formatNumber(value)}${row.unitLabel ? ` ${row.unitLabel}` : ''}`;
        const parts = [
          row.gained > 0 ? `+${amount(row.gained)} gained` : null,
          row.lost > 0 ? `−${amount(row.lost)} lost` : null,
          row.used > 0 ? `−${amount(row.used)} used` : null,
        ].filter(Boolean).join(' · ');
        return <Row
          key={row.product}
          label={art(row.product, row.name, sideStyle(report, 'you', row.product))}
          value={`${signedUnits(row.change)}${row.unitLabel ? ` ${row.unitLabel}` : ''} / ${amount(row.after)} left${parts ? ` · ${parts}` : ''}`}
          strong={row.change !== 0}
        />;
      })}
    </>;
  }

  return <>
    {report.crackChange !== undefined && report.crackAfter !== undefined
      ? <Row
          label={art('CRACK', report.productChanges ? 'Crack' : 'Product', sideStyle(report, 'you', 'CRACK'))}
          value={`${signedUnits(report.crackChange)} / ${formatNumber(report.crackAfter)} left`}
          strong={report.crackChange !== 0}
        />
      : null}
    {(report.productChanges ?? []).map((row) => (
      <Row key={row.product} label={art(row.product, row.name, sideStyle(report, 'you', row.product))} value={signedUnits(row.change)} strong={row.change !== 0} />
    ))}
  </>;
}
const reportAnimationMs = 180;
const FIGHT_SUPPLY_JOBS = [{ job: 'RAID', label: 'Raid' }, { job: 'DEFENSE', label: 'Defense' }, { job: 'CONVOY', label: 'Convoy' }];

type Mode = 'RAID' | 'DRIVE_BY' | SpecialRaidKindDto;
type CombatRulesDto = NonNullable<CombatPageDto['rules']>;
type CombatDriveByState = NonNullable<CombatPageDto['driveBy']>;

function HitRulesPanel({ mode, rules, driveBy, specialRaid }: { mode: Mode; rules: CombatRulesDto; driveBy?: CombatDriveByState; specialRaid?: CombatSpecialRaidDto }) {
  if (mode === 'DRIVE_BY' && driveBy) return <Panel title="Drive-by">
    <p>Roll past their block and make a mess before the real score. It costs {driveBy.rules.turnCost} turns and nobody grabs cash on the way out.</p>
    <p>A clean pass wounds {driveBy.rules.minThugWoundPercent}%–{driveBy.rules.maxThugWoundPercent}% of their fit thugs and drops {driveBy.rules.minWhoreKillPercent}%–{driveBy.rules.maxWhoreKillPercent}% of their hoes for good. Most passes are smaller; once in a while the block gets torn up.</p>
    <p>Each Low-Rider holds {driveBy.rules.thugsPerLowRider} shooters. About {driveBy.rules.defenderFieldedPercent}% of their fit crew is outside and ready to shoot back.</p>
    <p>If everyone in a car gets dropped, that ride is gone. If even one shooter makes it home, the car comes home too.</p>
    <p>The cars need {driveBy.rules.cooldownMinutes} minutes before the next drive-by. A block you shoot up gets {driveBy.rules.protectionHours} hours before another drive-by can hit it.</p>
  </Panel>;

  if (mode === 'DRUG_HOES' && specialRaid) return <Panel title="Drug their hoes">
    <p>Send the crew in with your product and poison a rival&apos;s night. It costs {specialRaid.turnCost} turns and runs on the raid clock.</p>
    <p>If your crew gets through, their hoes burn your product and chew up extra product and condoms from their stash. Their next nights get weaker if the shelves run dry.</p>
    <p>Survivors matter. The more thugs make it home, the more of their hoes you can reach. Their crew fights back, and both sides can take wounds.</p>
    <p>Afterward, their block gets {rules.protectionHours} hours to breathe and your crew needs {rules.cooldownMinutes} minutes before another raid move.</p>
  </Panel>;

  if (mode === 'STEAL_RIDE' && specialRaid) return <Panel title="Steal a ride">
    <p>Hit the chop spot and take one of their Low-Riders. It costs {specialRaid.turnCost} turns and runs on the raid clock.</p>
    <p>Win the fight and get at least one thug home, and the ride is yours. If nobody comes back, nobody brings keys.</p>
    <p>Their crew fights for it. Expect wounds on either side when the block catches you near the car.</p>
    <p>Afterward, their block gets {rules.protectionHours} hours to breathe and your crew needs {rules.cooldownMinutes} minutes before another raid move.</p>
  </Panel>;

  if (mode === 'LURE_CREW' && specialRaid) return <Panel title="Lure their crew">
    <p>Work a miserable block and make their people an offer. It costs {specialRaid.turnCost} turns and runs on the raid clock.</p>
    <p>Product talks to unhappy hoes. Beer talks to unhappy fit thugs. If their people are still loyal, they stay put and your stash does nothing.</p>
    <p>Win the fight and your survivors bring the convinced ones home. They leave the rival&apos;s crew and join yours.</p>
    <p>Afterward, their block gets {rules.protectionHours} hours to breathe and your crew needs {rules.cooldownMinutes} minutes before another raid move.</p>
  </Panel>;

  return <Panel title="Cash raid">
    <p>Kick in the door and take the money they left exposed. A raid costs {rules.turnCost} turns whether your crew wins or gets chased off.</p>
    {rules.minLootPercent !== undefined && rules.maxLootPercent !== undefined
      ? <p>On a win, the take is {rules.minLootPercent}%–{rules.maxLootPercent}% of cash above {formatCents(rules.protectedCashCents)}. Big scores can happen, but most crews come home with a smaller cut. Each fit thug can carry {formatCents(rules.perThugLootCents)}.</p>
      : <p>On a win, the take is up to {rules.lootPercent}% of cash above {formatCents(rules.protectedCashCents)}, capped at {formatCents(rules.perThugLootCents)} per thug you send.</p>}
    {rules.drugLootPercent ? <p>If they have product exposed, your crew can grab up to {formatNumber(rules.perThugCrackLoot ?? 0)} units per fit thug who makes it home.</p> : null}
    {rules.repeatLootPenaltyPercent ? <p>Keep farming the same mark and the score dries up: each repeat cuts the roll by {rules.repeatLootPenaltyPercent}%, down to {rules.repeatLootFloorPercent ?? 0}% of normal. Hit somebody else to cool it off.</p> : null}
    <p>{rules.newcomerHours > 0 ? `New crews get ${rules.newcomerHours} hours before the street opens on them. ` : 'New crews can be hit right away in this round. '}After a raid, that block gets {rules.protectionHours} hours of breathing room.</p>
    <p>Your crew needs {rules.cooldownMinutes} minutes between raids. You cannot move while your own block is protected, and crews far below your strength are off limits.</p>
    {rules.reconTurnCost !== undefined ? <p>
      {rules.reconFavorKey
        ? <>Burner Phone armed — your next successful Recon is free and will consume it.</>
        : <>Recon a mark for {rules.reconTurnCost} turns to see the useful dirt for {rules.intelExpiresMinutes} minutes.</>}
      {' '}If somebody hits you, payback stays open for {rules.retaliationHours} hours.
    </p> : null}
    <p className="se-hint">Wounded thugs sit out until they heal. Medicine gets them back on the street now.</p>
  </Panel>;
}

/** How a report reads in the list and as its heading. */
function reportLabel(report: BattleReportDto): string {
  if (report.kind === 'DRIVE_BY') return report.role === 'ATTACKER' ? 'Drive-by' : 'Drive-by on you';
  if (report.kind === 'DRUG_HOES') return report.role === 'ATTACKER' ? 'Drug run' : 'Drug run on you';
  if (report.kind === 'STEAL_RIDE') return report.role === 'ATTACKER' ? 'Ride theft' : 'Ride theft on you';
  if (report.kind === 'LURE_CREW') return report.role === 'ATTACKER' ? 'Lure run' : 'Lure run on you';
  return report.role === 'ATTACKER' ? 'Raid' : 'Defense';
}

function raidFormOutcome(report: BattleReportDto): { text: string; tone: 'good' | 'bad' | 'hint' } | null {
  const form = report.raidForm;
  if (!form) return null;
  const attacking = report.role === 'ATTACKER';
  const landed = attacking === report.won;

  if (report.kind === 'DRUG_HOES') {
    const whoresDrugged = form.whoresDrugged ?? 0;
    const suppliesBurned = (form.defenderCrackBurned ?? 0) + (form.defenderCondomsBurned ?? 0);
    if (!landed) return { tone: attacking ? 'bad' : 'good', text: attacking ? 'Their crew kept you out before the stash reached the block.' : 'Your crew kept their stash off your block.' };
    if (attacking) return whoresDrugged > 0
      ? { tone: 'good', text: `${formatNumber(whoresDrugged)} hoes got hit and burned ${formatNumber(suppliesBurned)} supplies from their shelves.` }
      : { tone: 'hint', text: 'You got through, but there were no hoes in reach for your stash.' };
    return whoresDrugged > 0
      ? { tone: 'bad', text: `${formatNumber(whoresDrugged)} hoes got hit and burned ${formatNumber(suppliesBurned)} supplies from your shelves.` }
      : { tone: 'hint', text: 'They got through, but nobody on your block took the bait.' };
  }

  if (report.kind === 'STEAL_RIDE') {
    const rides = form.lowRidersStolen ?? 0;
    if (!landed) return { tone: attacking ? 'bad' : 'good', text: attacking ? 'Their crew kept you off the keys.' : 'Your crew kept the car on your block.' };
    if (attacking) return rides > 0
      ? { tone: 'good', text: `${formatNumber(rides)} Low-Rider came home with your crew.` }
      : { tone: 'hint', text: 'You won the fight, but nobody made it back with a ride.' };
    return rides > 0
      ? { tone: 'bad', text: `${formatNumber(rides)} Low-Rider left your block.` }
      : { tone: 'hint', text: 'They won the fight, but your ride stayed put.' };
  }

  if (report.kind === 'LURE_CREW') {
    const crewLured = (form.whoresLured ?? 0) + (form.thugsLured ?? 0);
    if (!landed) return { tone: attacking ? 'bad' : 'good', text: attacking ? 'Their crew broke up the pitch before anybody crossed over.' : 'Your crew broke up their pitch before anybody crossed over.' };
    if (attacking) return crewLured > 0
      ? { tone: 'good', text: `${formatNumber(crewLured)} people crossed the street and joined you.` }
      : { tone: 'hint', text: 'You won the move, but nobody was unhappy enough or stocked enough to come over.' };
    return crewLured > 0
      ? { tone: 'bad', text: `${formatNumber(crewLured)} people left your block for their stash.` }
      : { tone: 'hint', text: 'They won the fight, but nobody left your block.' };
  }

  return null;
}

function TargetCard({ target, selectedBlock, driving }: { target: CombatTargetDto; selectedBlock: string | null; driving: boolean }) {
  return (
    <div className={`se-target-card${selectedBlock ? ' se-target-card--blocked' : ''}`}>
      <div className="se-target-card__head">
        <div>
          <p className="se-target-card__name"><AllianceTag alliance={target.alliance} />{target.displayName} <span className="se-muted se-num">(#{target.publicPimpId})</span></p>          <p className="se-target-card__sub">
            {selectedBlock ?? (target.revengeAvailable ? 'Payback is open.' : driving ? 'Street crew spotted outside.' : 'Home block advantage.')}
          </p>
        </div>
        <div className="se-tags" aria-label="Target tags">
          <span className={`se-tag${target.strength === 'Weaker' ? ' se-tag--good' : target.strength === 'Stronger' ? ' se-tag--bad' : ''}`}>{target.strength}</span>
          {target.hasRing ? <span className="se-tag se-tag--warn">Has the Ring</span> : null}
          {target.intel ? <span className="se-tag se-tag--good">Scouted</span> : <span className="se-tag">Unscouted</span>}
          {target.revengeAvailable ? <span className="se-tag se-tag--warn">Payback</span> : null}
        </div>
      </div>
      <div className="se-target-card__grid">
        <div><span>Public worth</span><strong>{formatCents(target.netWorthCents)}</strong></div>
        <div><span>Crew read</span><strong>{target.strength}</strong></div>
        <div><span>Status</span><strong>{selectedBlock ? 'Blocked' : 'Open'}</strong></div>
        <div><span>Intel</span><strong>{target.intel ? `${target.intel.sharedBy ? `From ${target.intel.sharedBy} · ` : ''}fresh until ${date(target.intel.expiresAt)}` : 'No recon yet'}</strong></div>
      </div>
      {target.intel ? (
        <div className="se-target-card__intel">
          <div><span>Fit / wounded</span><strong>{formatNumber(target.intel.fitThugs)} / {formatNumber(target.intel.woundedThugs)}</strong></div>
          <div><span>Full strength</span><strong>{target.intel.strength.toFixed(1)}</strong></div>
          <div><span>Weapons spotted</span><strong>{weaponsText(target.intel.weapons)}</strong></div>
          <div><span>Cash band</span><strong>{target.intel.cashBand.label}</strong></div>
          <div><span>Max cash haul</span><strong>{formatCents(target.intel.estimatedMaxLootCents)}</strong></div>
          {target.intel.crack != null ? <div><span>Product stash</span><strong>{formatNumber(target.intel.crack)}</strong></div> : null}
          {target.intel.estimatedMaxCrackLoot != null ? <div><span>Max product haul</span><strong>{formatNumber(target.intel.estimatedMaxCrackLoot)}</strong></div> : null}
          {target.intel.assetProtection ? <div><span>Safe Room</span><strong>{formatCents(target.intel.assetProtection.protectedCashFloorCents)} cash floor · up to {formatNumber(target.intel.assetProtection.protectedProductCapacity)} product sealed</strong></div> : null}
          {target.intel.productStash ? <div><span>{target.intel.assetProtection ? 'Exposed product stash' : 'Product stash'}</span><strong>{STASH_LABELS[target.intel.productStash.level]}{target.intel.productStash.primary ? `, mostly ${target.intel.productStash.primary}` : ''}</strong></div> : null}
        </div>
      ) : (
        <p className="se-hint">Scout this mark to reveal fit thugs, wounds, weapons, cash band, product stash and the biggest haul they might expose.</p>
      )}
    </div>
  );
}

/** The Ring, when it is live in this round. The bearer is only named once revealed. */
function RingCard({ ring, busy, pending, onDestroy }: { ring: CombatRingDto; busy: boolean; pending: boolean; onDestroy: () => void }) {
  const revealed = ring.holderPublicPimpId !== null && ring.holderDisplayName !== null;
  return (
    <Panel title="The Ring" aside={ring.iHold ? 'You hold it' : revealed ? 'Revealed' : 'Hidden'} className="se-raids-panel">
      <div className="se-raids-ring">
        <img src="/items/easter-eggs/the-ring.svg" alt="The Ring: a heavy gold band" width={64} height={64} loading="lazy" />
        <p className="se-hint">Surfaced {ring.surfacedAt ? date(ring.surfacedAt) : 'recently'}. {ring.iHold ? 'Keep it until the round ends, or destroy it below.' : 'Take it in a raid, or be in Detroit to destroy it if you hold it.'}</p>
      </div>
      <div className="se-rows">
        {ring.iHold ? (
          <Row label="Bearer" value={ring.invisibleUntil ? `You — vanished until ${date(ring.invisibleUntil)}` : 'You — the street knows your name'} strong />
        ) : revealed ? (
          <Row label="Bearer" value={`${ring.holderDisplayName} (#${ring.holderPublicPimpId})`} strong />
        ) : (
          <Row label="Bearer" value={ring.invisibleUntil ? `Vanished until ${date(ring.invisibleUntil)}` : 'Somewhere on the street'} strong />
        )}
        <Row label="Take it" value="Win a raid against the revealed bearer" />
        <Row label="Destroy it" value={`${formatCents(ring.destroyRewardCents)} · ${formatNumber(ring.destroyTurnCost)} turns · old foundry in Detroit`} />
      </div>
      {ring.iHold ? (
        <div className="se-raids-panel__action">
          <Button
            type="button"
            className="se-btn se-btn--primary se-btn--sm"
            disabledReason={
              busy ? 'Your last hit is still going through.'
                : pending ? 'Get the report for your unsettled hit first.'
                : null
            }
            onClick={onDestroy}
          >
            Destroy it in Detroit
          </Button>
          <p className="se-hint">You must be in Detroit. Destroying it pays the reward and the Ring-bearer title.</p>
        </div>
      ) : revealed ? (
        <p className="se-hint">Win a raid against {ring.holderDisplayName} to take it — then carry it to Detroit or hold it until the round ends.</p>
      ) : (
        <p className="se-hint">Its bearer cannot be found while the spell holds. Attacking breaks it.</p>
      )}
    </Panel>
  );
}

function DriveByReport({ report, onClose }: { report: BattleReportDto; onClose?: () => void }) {  const d = report.driveBy!;
  const attacking = report.role === 'ATTACKER';
  const landed = attacking === report.won;
  return <Panel title={`${landed ? (attacking ? 'It landed' : 'They hit you') : (attacking ? 'They shot back' : 'Seen off')} · ${reportLabel(report)}`}>
    <p>{attacking ? 'On' : 'By'} <b><AllianceTag alliance={report.opponent.alliance} link={false} />{report.opponent.displayName}</b> (#{report.opponent.publicPimpId}) · {date(report.createdAt)}</p>
    <FaceOff report={report} />
    <div className="se-rows">
      <Row label={attacking ? 'Shooters — yours / out front' : 'Out front — yours / shooters'} value={`${report.yourSquad} / ${report.opponentSquad}`} />
      <Row label="Firepower — yours / theirs" value={`${report.yourStrength.toFixed(1)} / ${report.opponentStrength.toFixed(1)}`} />
      {report.yourSupply ? <Row label="Fight supply plan" value={`${supplySummary(report.yourSupply)} · ${supplyEffects(report.yourSupply)}`} /> : null}
      <BattleInventoryRows report={report} />
      <Row label="Wounded — yours / theirs" value={`${formatNumber(report.yourWounds)} / ${formatNumber(report.opponentWounds)}`} />
      <Row label={art('HOE', attacking ? 'Their whores killed' : 'Your whores killed', sideStyle(report, defenderSide(report), 'HOE'))} value={d.whoresAfter !== undefined ? `${formatNumber(d.whoresKilled)} · ${formatNumber(d.whoresAfter)} left` : formatNumber(d.whoresKilled)} strong />
      {attacking ? <Row label={art('LOW_RIDER', 'Low-Riders — sent / lost / left', sideStyle(report, 'you', 'LOW_RIDER'))} value={`${formatNumber(d.carsSent ?? 0)} / ${formatNumber(d.lowRidersLost ?? 0)} / ${formatNumber(d.lowRidersAfter ?? 0)}`} strong={(d.lowRidersLost ?? 0) > 0} /> : null}
      {attacking ? <Row label={art('TURNS', 'Turns spent / remaining')} value={`${report.turnsSpent} / ${report.turnsAfter}`} /> : null}
      <Row label="National rank — before / after" value={`#${report.nationalRankBefore} / #${report.nationalRankAfter}`} />
    </div>
    {attacking ? <p className="se-hint">Your weapons: {weaponsText(report.yourEquipment)}.</p> : null}
    {(d.lowRidersLost ?? 0) > 0 ? <p className="se-hint se-bad">Nobody made it back in {formatNumber(d.lowRidersLost!)} of your cars, so {d.lowRidersLost === 1 ? 'it is' : 'they are'} gone.</p> : null}
    {report.yourWounds > 0 ? <p className="se-hint">{formatNumber(report.yourWounds)} thugs are recovering{report.nextRecoveryAt ? ` until ${date(report.nextRecoveryAt)}` : ''}.</p> : null}
    {report.retaliation ? <p className="se-hint">This was retaliation for a hit on you.</p> : null}
    {report.payback ? <p className="se-hint">This was payback. You hit {report.opponent.displayName} first, and they answered inside the revenge window.</p> : null}
    {report.gangBounty ? <p className="se-hint se-good">Bounty: {formatCents(report.gangBounty.cents)} for beating the {report.gangBounty.crew}.</p> : null}
    {report.protectedUntil ? <p className="se-hint">Your block is left alone by drive-bys until {date(report.protectedUntil)}. A drive-by does not stop a raid.</p> : null}
    {attacking && report.cooldownUntil ? <p className="se-hint">Next drive-by after {date(report.cooldownUntil)}.</p> : null}
    {onClose ? <button type="button" className="se-btn se-btn--ghost se-btn--sm se-raid-report-close" onClick={onClose}>Close report</button> : null}
  </Panel>;
}


function RaidFormReport({ report, onClose }: { report: BattleReportDto; onClose?: () => void }) {
  const form = report.raidForm!;
  const attacking = report.role === 'ATTACKER';
  const landed = attacking === report.won;
  const outcome = raidFormOutcome(report);
  return <Panel title={`${landed ? (attacking ? 'It landed' : 'They got through') : (attacking ? 'They held you off' : 'You held them off')} · ${reportLabel(report)}`}>
    <p>{attacking ? 'Against' : 'By'} <b><AllianceTag alliance={report.opponent.alliance} link={false} />{report.opponent.displayName}</b> (#{report.opponent.publicPimpId}) · {date(report.createdAt)}</p>
    <FaceOff report={report} />
    {outcome ? <p className={outcome.tone === 'good' ? 'se-good' : outcome.tone === 'bad' ? 'se-bad' : 'se-hint'}>{outcome.text}</p> : null}
    <div className="se-rows">
      <Row label="Crew — yours / theirs" value={`${report.yourSquad} / ${report.opponentSquad}`} />
      <Row label="Fighting strength — yours / theirs" value={`${report.yourStrength.toFixed(1)} / ${report.opponentStrength.toFixed(1)}`} />
      {report.ammoCombat ? (
        <Row
          label="Ammo in this raid"
          value={`${formatNumber(report.ammoCombat.spentRounds)} rounds spent${report.ammoCombat.freeDefenderRounds > 0 ? ` · ${formatNumber(report.ammoCombat.freeDefenderRounds)} defender-floor rounds` : ''}${report.ammoCombat.gainedRounds > 0 ? ` · ${formatNumber(report.ammoCombat.gainedRounds)} looted` : ''}${report.ammoCombat.lostRounds > 0 ? ` · ${formatNumber(report.ammoCombat.lostRounds)} lost to the attackers` : ''}`}
        />
      ) : null}
      {report.itemCombat?.fired.length ? <Row label="Guns used" value={report.itemCombat.fired.map((gun) => `${gun.name ? `“${gun.name}” ` : ''}${gun.model}${gun.jammed ? ' jammed' : ` · ${formatNumber(gun.rounds)} rounds`}`).join('; ')} /> : null}
      {report.itemCombat?.looted.length ? <Row label={attacking ? 'Gun taken' : 'Gun lost'} value={report.itemCombat.looted.map((gun) => `${gun.name ? `“${gun.name}” ` : ''}${gun.model}${gun.mods.length ? ` · ${gun.mods.map((mod) => `${mod.key.toLowerCase().replaceAll('_', ' ')} ${mod.tier}`).join(' / ')}` : ''} · condition ${gun.condition}${gun.recovered ? ' · recovered by its owner' : ` · hot until ${date(gun.hotUntil!)}`}`).join('; ')} /> : null}
      {report.yourSupply ? <Row label="Fight supply plan" value={`${supplySummary(report.yourSupply)} · ${supplyEffects(report.yourSupply)}`} /> : null}
      <BattleInventoryRows report={report} />
      {report.raidProtection && report.kind === 'DRUG_HOES' ? (
        <Row
          label={attacking ? 'Their Safe Room' : 'Your Safe Room'}
          value={`${formatNumber(report.raidProtection.protectedProductUnits)} / ${formatNumber(report.raidProtection.protectedProductCapacity)} product sealed`}
          tooltip={`${formatNumber(report.raidProtection.exposedProductUnitsBefore)} product units were reachable by the drug run.`}
        />
      ) : null}
      <Row label="Wounded — yours / theirs" value={`${formatNumber(report.yourWounds ?? 0)} / ${formatNumber(report.opponentWounds ?? 0)}`} />
      {form.whoresDrugged !== undefined ? <Row label={art('HOE', attacking ? 'Their hoes drugged' : 'Your hoes drugged', sideStyle(report, defenderSide(report), 'HOE'))} value={formatNumber(form.whoresDrugged)} strong={form.whoresDrugged > 0} /> : null}
      {form.whoresLured !== undefined ? <Row label={art('HOE', attacking ? 'Hoes joined / now' : 'Hoes lost / left', sideStyle(report, defenderSide(report), 'HOE'))} value={form.whoresAfter !== undefined ? `${formatNumber(form.whoresLured)} / ${formatNumber(form.whoresAfter)}` : formatNumber(form.whoresLured)} strong={form.whoresLured > 0} /> : null}
      {form.thugsLured !== undefined ? <Row label={art('THUG', attacking ? 'Thugs joined / now' : 'Thugs lost / left', sideStyle(report, defenderSide(report), 'THUG'))} value={form.thugsAfter !== undefined ? `${formatNumber(form.thugsLured)} / ${formatNumber(form.thugsAfter)}` : formatNumber(form.thugsLured)} strong={form.thugsLured > 0} /> : null}
      {!report.inventoryChanges?.length && form.crackSpent !== undefined && attacking ? <Row label={art('CRACK', 'Product spent', sideStyle(report, 'you', 'CRACK'))} value={formatNumber(form.crackSpent)} /> : null}
      {form.beerSpent !== undefined && attacking ? <Row label={art('BEER', 'Beer spent', sideStyle(report, 'you', 'BEER'))} value={formatNumber(form.beerSpent)} /> : null}
      {!report.inventoryChanges?.length && form.defenderCrackBurned !== undefined ? <Row label={art('CRACK', attacking ? 'Their product burned' : 'Your product burned', sideStyle(report, defenderSide(report), 'CRACK'))} value={formatNumber(form.defenderCrackBurned)} strong={form.defenderCrackBurned > 0} /> : null}
      {form.defenderCondomsBurned !== undefined ? <Row label={art('CONDOM', attacking ? 'Their condoms burned' : 'Your condoms burned', sideStyle(report, defenderSide(report), 'CONDOM'))} value={formatNumber(form.defenderCondomsBurned)} strong={form.defenderCondomsBurned > 0} /> : null}
      {form.lowRidersStolen !== undefined ? <Row label={art('LOW_RIDER', attacking ? 'Low-Riders stolen' : 'Low-Riders lost', sideStyle(report, defenderSide(report), 'LOW_RIDER'))} value={`${formatNumber(form.lowRidersStolen)} · ${formatNumber(form.lowRidersAfter ?? 0)} left`} strong={form.lowRidersStolen > 0} /> : null}
      {attacking ? <Row label={art('TURNS', 'Turns spent / remaining')} value={`${report.turnsSpent} / ${report.turnsAfter}`} /> : null}
      <Row label="National rank — before / after" value={`#${report.nationalRankBefore} / #${report.nationalRankAfter}`} />
    </div>
    {attacking ? <p className="se-hint">Your weapons: {weaponsText(report.yourEquipment)}.</p> : null}
    {(report.yourWounds ?? 0) > 0 ? <p className="se-hint">{formatNumber(report.yourWounds)} thugs are recovering{report.nextRecoveryAt ? ` until ${date(report.nextRecoveryAt)}` : ''}.</p> : null}
    {report.retaliation ? <p className="se-hint">This was payback. Revenge let you answer the crew that hit you.</p> : null}
    {report.payback ? <p className="se-hint">This was payback. You hit {report.opponent.displayName} first, and they answered inside the revenge window.</p> : null}
    {report.gangBounty ? <p className="se-hint se-good">Bounty: {formatCents(report.gangBounty.cents)} for beating the {report.gangBounty.crew}.</p> : null}
    {report.protectedUntil ? <p className="se-hint">Your block is protected until {date(report.protectedUntil)}. You also need your crew back before the next raid.</p> : null}
    {report.cooldownUntil ? <p className="se-hint">Next move after {date(report.cooldownUntil)}.</p> : null}
    {onClose ? <button type="button" className="se-btn se-btn--ghost se-btn--sm se-raid-report-close" onClick={onClose}>Close report</button> : null}
  </Panel>;
}

function BattleReport({ report, onClose }: { report: BattleReportDto; onClose?: () => void }) {
  if (report.kind === 'DRIVE_BY' && report.driveBy) return <DriveByReport report={report} onClose={onClose} />;
  if ((report.kind === 'DRUG_HOES' || report.kind === 'STEAL_RIDE' || report.kind === 'LURE_CREW') && report.raidForm) return <RaidFormReport report={report} onClose={onClose} />;
  return <Panel title={`${report.won ? 'Victory' : 'Defeat'} · ${reportLabel(report)}`}>
    <p>Against <b><AllianceTag alliance={report.opponent.alliance} link={false} />{report.opponent.displayName}</b> (#{report.opponent.publicPimpId}) · {date(report.createdAt)}</p>
    <FaceOff report={report} />
    <div className="se-rows">
      <Row label="Squads — yours / theirs" value={`${report.yourSquad} / ${report.opponentSquad}`} />
      <Row label="Fighting strength — yours / theirs" value={`${report.yourStrength.toFixed(1)} / ${report.opponentStrength.toFixed(1)}`} />
      {report.yourSupply ? <Row label="Fight supply plan" value={`${supplySummary(report.yourSupply)} · ${supplyEffects(report.yourSupply)}`} /> : null}
      <Row label="Wounded — yours / theirs" value={`${formatNumber(report.yourWounds ?? 0)} / ${formatNumber(report.opponentWounds ?? 0)}`} />
      <Row label={art('CASH', 'Cash')} value={`${signedCents(report.cashChangeCents)} / ${formatCents(report.cashAfterCents)} left`} strong={report.cashChangeCents !== 0} />
      {report.raidProtection ? (
        <Row
          label="Assets protected"
          value={`${formatCents(report.raidProtection.protectedCashCents)} cash · ${formatNumber(report.raidProtection.protectedProductUnits)} / ${formatNumber(report.raidProtection.protectedProductCapacity)} product sealed`}
          tooltip={`${formatNumber(report.raidProtection.exposedProductUnitsBefore)} product units were exposed before loot was rolled.`}
        />
      ) : null}
      <BattleInventoryRows report={report} />

      <Row label={art('TURNS', 'Turns spent / remaining')} value={`${report.turnsSpent} / ${report.turnsAfter}`} />
      <Row label="National rank — before / after" value={`#${report.nationalRankBefore} / #${report.nationalRankAfter}`} />
    </div>
    <p className="se-hint">Your weapons: {weaponsText(report.yourEquipment)}.</p>
    {(report.yourWounds ?? 0) > 0 ? <p className="se-hint">{formatNumber(report.yourWounds)} thugs are recovering{report.nextRecoveryAt ? ` until ${date(report.nextRecoveryAt)}` : ''}.</p> : null}
    {report.retaliation ? <p className="se-hint">This was payback. Revenge let you answer the crew that hit you.</p> : null}
    {report.payback ? <p className="se-hint">This was payback. You hit {report.opponent.displayName} first, and they answered inside the revenge window.</p> : null}
    {report.gangBounty ? <p className="se-hint se-good">Bounty: {formatCents(report.gangBounty.cents)} for beating the {report.gangBounty.crew}.</p> : null}
    {report.protectedUntil ? <p className="se-hint">Your block is protected until {date(report.protectedUntil)}. You also need your crew back before the next raid.</p> : null}
    {report.cooldownUntil ? <p className="se-hint">Next raid after {date(report.cooldownUntil)}.</p> : null}
    {onClose ? <button type="button" className="se-btn se-btn--ghost se-btn--sm se-raid-report-close" onClick={onClose}>Close report</button> : null}
  </Panel>;
}

function RaidPage({ playerId, roundId }: { playerId: string; roundId: string }) {
  const [searchParams] = useSearchParams();
  const me = useSession((s) => s.me)!;
  const [page, setPage] = useState<CombatPageDto | null>(null);
  const [after, setAfter] = useState(0);
  const [reports, setReports] = useState<BattleReportDto[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [report, setReport] = useState<BattleReportDto | null>(null);
  const [latest, setLatest] = useState<BattleReportDto | null>(null);
  const [closingReportId, setClosingReportId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingRaid | null>(() => loadPendingRaid(browserSessionStorage(), playerId));
  const [targetId, setTargetId] = useState(() => searchParams.get('target') ?? '');
  // The kind of hit and the squad size come back; the target is picked fresh each time.
  const [mode, setMode] = useRememberedState<Mode>(rememberedKey('combat.mode', playerId), 'RAID',
    { accept: (value): value is Mode => value === 'RAID' || value === 'DRIVE_BY' || value === 'DRUG_HOES' || value === 'STEAL_RIDE' || value === 'LURE_CREW' });
  const [squad, setSquad] = useRememberedState<string>(rememberedKey('combat.squad', playerId), '1', { accept: isString });
  const [ammoCapText, setAmmoCapText] = useState('');
  const [raidTeam, setRaidTeam] = useRememberedState<string[]>(rememberedKey('combat.raidTeam', playerId), [],
    { accept: (value): value is string[] => Array.isArray(value) && value.length <= 5 && value.every((entry) => typeof entry === 'string') });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inFlight = useRef(false);
  const refreshSequence = useRef(0);
  const reportDetailRef = useRef<HTMLDivElement | null>(null);
  const closeReportTimer = useRef<number | null>(null);

  const refresh = useCallback(async (background = false) => {
    const sequence = ++refreshSequence.current;
    try {
      const [next, battles] = await Promise.all([combatApi.page(after, background), combatApi.reports(roundId)]);
      if (sequence !== refreshSequence.current) return;
      setPage(next);
      setReports(battles.reports);
      setNextBefore(battles.nextBefore);
    } catch (err) {
      if (sequence === refreshSequence.current) setError(err instanceof Error ? err.message : 'Could not get the latest word from the street.');
    }
  }, [after, roundId]);

  useEffect(() => {
    void refresh();
    const onReturn = () => { if (!document.hidden) void refresh(); };
    const interval = window.setInterval(() => { if (!document.hidden) void refresh(true); }, 30_000);
    window.addEventListener('focus', onReturn);
    window.addEventListener('online', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    return () => {
      refreshSequence.current++;
      window.clearInterval(interval);
      window.removeEventListener('focus', onReturn);
      window.removeEventListener('online', onReturn);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, [refresh]);

  useEffect(() => {
    if (!report) return;
    reportDetailRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [report]);

  useEffect(() => () => {
    if (closeReportTimer.current !== null) window.clearTimeout(closeReportTimer.current);
  }, []);

  const closeReport = useCallback(() => {
    if (!report) return;
    if (closeReportTimer.current !== null) window.clearTimeout(closeReportTimer.current);
    const reportId = report.id;
    setClosingReportId(reportId);
    closeReportTimer.current = window.setTimeout(() => {
      setReport((current) => current?.id === reportId ? null : current);
      setClosingReportId((current) => current === reportId ? null : current);
      closeReportTimer.current = null;
    }, reportAnimationMs);
  }, [report]);

  const toggleReport = useCallback((battle: BattleReportDto) => {
    if (report?.id === battle.id) {
      closeReport();
      return;
    }
    if (closeReportTimer.current !== null) window.clearTimeout(closeReportTimer.current);
    closeReportTimer.current = null;
    setClosingReportId(null);
    setReport(battle);
  }, [closeReport, report?.id]);

  const driveBy = page?.driveBy;
  const specialRaids = page?.specialRaids ?? [];
  const specialRaid = specialRaids.find((action) => action.kind === mode);
  const driving = mode === 'DRIVE_BY' && !!driveBy;
  const doingSpecialRaid = !!specialRaid;
  // A remembered kind of hit this page no longer offers falls back to a plain raid.
  useEffect(() => {
    if (page && mode !== 'RAID' && !driving && !doingSpecialRaid) setMode('RAID');
  }, [page, mode, driving, doingSpecialRaid, setMode]);
  /** Drive-bys have their own clock. The other forms share the raid clock. */
  const targetBlock = useCallback((target: CombatTargetDto) => {
    if (target.tutorial && mode !== 'RAID') return 'Use a standard raid against the training target.';
    if (driving) return target.driveByBlockedReason ?? null;
    if (mode === 'DRUG_HOES' || mode === 'STEAL_RIDE' || mode === 'LURE_CREW') return target.specialRaidBlockedReasons?.[mode] ?? null;
    return target.blockedReason;
  }, [driving, mode]);

  useEffect(() => {
    if (!page?.targets.length) return;
    if (targetId && page.targets.some((target) => String(target.publicPimpId) === targetId)) return;
    setTargetId(String(page.targets.find((target) => target.tutorial)?.publicPimpId
      ?? page.targets.find((target) => !targetBlock(target))?.publicPimpId
      ?? page.targets[0]!.publicPimpId));
  }, [page, targetId, targetBlock]);

  const setSaved = (value: PendingRaid | null) => {
    setPending(value);
    savePendingRaid(browserSessionStorage(), playerId, value);
  };
  const selected = page?.targets.find((target) => String(target.publicPimpId) === targetId);
  useEffect(() => {
    if (selected?.tutorial && mode !== 'RAID') setMode('RAID');
  }, [selected?.tutorial, mode, setMode]);
  const selectedBlock = selected ? targetBlock(selected) : null;
  const rules = page?.rules;
  const recovery = page?.recovery;
  const maxSquad = driving ? driveBy!.maxShooters : Math.min(recovery?.fitThugs ?? me.resources.fitThugs, rules?.squadCap ?? 0);
  const modeBlock = driving ? driveBy!.blockedReason : doingSpecialRaid ? specialRaid.blockedReason : page?.blockedReason ?? null;
  const modeCooldown = driving ? driveBy!.cooldownUntil : doingSpecialRaid ? specialRaid.cooldownUntil : page?.cooldownUntil ?? null;
  const turnCost = driving ? driveBy!.rules.turnCost : doingSpecialRaid ? specialRaid.turnCost : rules?.turnCost ?? 0;
  const squadNumber = Number(squad);
  const ammunition = !driving && !doingSpecialRaid ? rules?.ammo : undefined;
  const roundRules = page?.rulesetId ? rulesets[page.rulesetId] : undefined;
  const ammoRules = roundRules?.ammoParts?.combatEnabled ? roundRules.ammoParts.ammo : undefined;
  const ammoCapRounds = ammoCapText === '' ? undefined : Number(ammoCapText);
  const ammoCapInvalid = Boolean(ammunition && ammoCapText !== ''
    && (!Number.isSafeInteger(ammoCapRounds) || ammoCapRounds! < 0 || ammoCapRounds! > ammunition.availableRounds));
  const ammoPreview = ammunition && ammoRules && roundRules?.combat
    && Number.isSafeInteger(squadNumber) && squadNumber >= 1 && squadNumber <= maxSquad && !ammoCapInvalid
    ? previewCombatAmmo({
        thugs: recovery?.fitThugs ?? me.resources.fitThugs,
        thugHappiness: me.happiness.thug,
        weapons: { PISTOL: me.resources.pistols, SHOTGUN: me.resources.shotguns, TEK9: me.resources.tek9s, AK47: me.resources.ak47s },
        weaponPriority: ammunition.weaponPriority,
      }, squadNumber, roundRules.combat, ammunition.availableRounds, ammoRules.roundsPerFight, ammoCapRounds)
    : null;
  // Why the crew is not going out, in the order a player would hit the problems.
  const attackBlock = busy
    ? 'Your last hit is still going through.'
    : pending
      ? 'Get the report for your unsettled hit first.'
      : !rules
        ? 'The streets have not loaded yet.'
        : modeBlock
          ? modeBlock
          : !selected
            ? 'Choose a mark from the list first.'
            : selectedBlock
              ? selectedBlock
              : maxSquad < 1
                ? (driving ? 'You need a Low-Rider and a fit thug to ride in it.' : 'You have no fit thugs to send.')
                : !Number.isInteger(squadNumber) || squadNumber < 1
                  ? 'Say how many to send - at least one.'
                  : squadNumber > maxSquad
                    ? `You can send at most ${formatNumber(maxSquad)}.`
                    : ammoCapInvalid
                      ? `Set an ammo cap from 0 to ${formatNumber(ammunition?.availableRounds ?? 0)} rounds.`
                    : raidTeam.length > squadNumber
                      ? 'Choose no more crew specialists than the raid squad.'
                    : null;
  const disabled = attackBlock !== null;
  const pagingBlock = busy ? 'Your last hit is still going through.' : pending ? 'Get the report for your unsettled hit first.' : null;
  const attackName = (kind: Mode | undefined) => kind === 'DRIVE_BY' ? 'drive-by' : kind === 'DRUG_HOES' ? 'drug run' : kind === 'STEAL_RIDE' ? 'ride theft' : kind === 'LURE_CREW' ? 'lure run' : 'raid';

  useEffect(() => {
    if (!rules || maxSquad < 1) return;
    if (!Number.isInteger(squadNumber) || squadNumber < 1) setSquad('1');
    else if (squadNumber > maxSquad) setSquad(String(maxSquad));
  }, [maxSquad, rules, squadNumber]);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (inFlight.current || (!pending && disabled)) return;
    const request: PendingRaid = pending ?? { input: { roundId, targetPublicPimpId: selected!.publicPimpId, attackingThugs: squadNumber,
      ...(!driving && !doingSpecialRaid && raidTeam.length ? { crewMemberIds: raidTeam } : {}),
      ...(ammunition && ammoCapRounds !== undefined ? { attackerAmmoCapRounds: ammoCapRounds } : {}),
      actionId: newActionId() }, targetName: selected!.displayName, kind: driving ? 'DRIVE_BY' : doingSpecialRaid ? specialRaid.kind : 'RAID' };
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    setSaved(request);
    try {
      const result = request.kind === 'DRIVE_BY'
        ? await combatApi.driveBy(request.input)
        : request.kind === 'DRUG_HOES' || request.kind === 'STEAL_RIDE' || request.kind === 'LURE_CREW'
          ? await combatApi.specialRaid({ ...request.input, kind: request.kind })
          : await combatApi.raid(request.input);
      // The fresh result lands in the dock under the launch button; the top
      // report slot stays for opening older hits from the history list.
      setLatest(result);
      // Achievements are news, not part of the fight's ledger: they pop as
      // alerts once, when earned, instead of living inside the report.
      for (const trophy of result.trophyCallouts ?? []) {
        showGameToast({
          id: `trophy:${result.id}:${trophy.key}`,
          title: `Achievement unlocked: ${trophy.title}`,
          detail: trophy.description,
          tone: 'good',
          href: '/game/profile',
        });
      }
      setSaved(null);
      setTargetId('');
      await refresh(true);
      try { await useSession.getState().refreshSnapshot(); }
      catch { setError(`The ${attackName(request.kind)} is settled. Your top bar could not catch up yet.`); }
    } catch (err) {
      if (err instanceof ApiError && !err.isRetryable && !err.isUnauthenticated) setSaved(null);
      setError(err instanceof Error ? err.message : `The street went quiet before the report came back. Retry the saved ${attackName(request.kind)} to get the result.`);
      void refresh(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function olderReports() {
    if (!nextBefore || busy) return;
    setBusy(true);
    try {
      const next = await combatApi.reports(roundId, nextBefore);
      setReports((current) => [...current, ...next.reports.filter((entry) => !current.some((r) => r.id === entry.id))]);
      setNextBefore(next.nextBefore);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not pull older reports.'); }
    finally { setBusy(false); }
  }

  async function reconTarget() {
    if (!selected || page?.rules?.reconTurnCost === undefined || busy || pending) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await combatApi.recon({ roundId, targetPublicPimpId: selected.publicPimpId, actionId: newActionId() });
      setNotice(
        `Word on ${result.intel.displayName}: ${formatNumber(result.intel.fitThugs)} fit thugs, ${weaponsText(result.intel.weapons)}, up to ${formatCents(result.intel.estimatedMaxLootCents)} cash${result.intel.estimatedMaxCrackLoot != null ? ` and ${formatNumber(result.intel.estimatedMaxCrackLoot)} product` : ''} exposed${result.intel.productStash ? `, a ${STASH_LABELS[result.intel.productStash.level].toLowerCase()} product stash` : ''}.`
        + (result.favorKey ? ' Burner Phone consumed.' : ''),
      );
      await refresh(true);
      await useSession.getState().refreshSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not get eyes on that crew.');
    } finally {
      setBusy(false);
    }
  }

  async function treatWounded() {    if (!page?.recovery || page.recovery.maxTreatableThugs <= 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const amount = page.recovery.maxTreatableThugs;
      const result = await combatApi.treat({ roundId, thugs: amount, actionId: newActionId() });
      setNotice(
        `Treated ${formatNumber(result.treatedThugs)} thugs with ${formatNumber(result.medicineUsed)} medicine.`
        + (result.favorKey ? ' Doctor Favor consumed.' : ''),
      );
      await refresh(true);
      await useSession.getState().refreshSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not patch up the wounded.');
    } finally {
      setBusy(false);
    }
  }

  async function destroyRing() {
    if (inFlight.current || busy || pending) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await ringApi.destroy();
      setNotice(`The Ring is destroyed. ${formatCents(result.rewardCents)} reward · Ring-bearer title unlocked.`);
      await refresh(true);
      try { await useSession.getState().refreshSnapshot(); }
      catch { /* The notice above already says what landed. */ }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The foundry fire would not take it.');
      void refresh(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <GameLayout>
    <div className="se-raids">
      <header className="se-raids-hero">
        <div className="se-raids-hero__copy">
          <span className="se-eyebrow">Street warfare · {me.city.name}</span>
          <h1>Raids</h1>
          <p>{page?.driveBy ? 'Pick the mark, read the block, and choose the right kind of hit before you send the crew.' : 'Pick the mark, read the block, and size the squad before you send the crew for the haul.'}</p>
        </div>
        <div className="se-raids-hero__side">
          <Button
            type="button"
            className="se-btn se-btn--ghost se-btn--sm"
            disabledReason={busy ? 'Your last hit is still going through.' : null}
            onClick={() => { setError(null); setNotice(null); void refresh(); }}
          >
            Refresh street
          </Button>
        </div>
      </header>

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone="info">{notice}</Alert> : null}
      <ActionReadiness
        title="Combat readiness"
        status={busy || pending ? 'Action pending' : attackBlock ? 'Needs attention' : 'Ready to attack'}
        blockedReason={attackBlock}
        items={[
          { key: 'turns', label: 'Turns available', value: formatNumber(me.turns.turns), tone: turnCost > me.turns.turns ? 'warn' : undefined },
          { key: 'cost', label: 'Action cost', value: `${formatNumber(turnCost)} turns` },
          { key: 'crew', label: 'Fit squad available', value: formatNumber(maxSquad), hint: `${formatNumber(me.resources.armedThugs)} armed at home`, tone: maxSquad > 0 ? 'good' : 'bad' },
          { key: 'target', label: 'Selected target', value: selected?.displayName ?? 'Choose a mark', hint: selected?.strength },
        ]}
      />
      {page?.gangIntel ? (
        <OperationDetails title="Street rumors & crew intel" summary="Local gang pressure, danger and movements">
        <Panel title="Street rumors" aside={`Street crews · ${gangDangerLabel[page.gangIntel.danger]}`} className="se-raids-panel">
          <div className="se-rows">
            <Row label="Local pressure" value={gangDangerLabel[page.gangIntel.danger]} strong={page.gangIntel.danger !== 'QUIET'} />
            <Row label="Crews nearby" value={formatNumber(page.gangIntel.activeGangs)} />
            <Row label="Crew hits since" value={`${date(page.gangIntel.seenSince)} · ${formatNumber(page.gangIntel.recentHits)} hit${page.gangIntel.recentHits === 1 ? '' : 's'}`} />
            {page.gangIntel.topArchetype ? <Row label="Loudest style" value={`${page.gangIntel.topArchetype}${page.gangIntel.topTier ? ` · ${page.gangIntel.topTier}` : ''}`} /> : null}
            {page.gangIntel.gangBlocks?.length ? (
              <Row
                label="Crew-held blocks"
                value={`${page.gangIntel.gangBlocks.join(', ')}${page.gangIntel.onTheirTurf ? ' · you work there' : ''}`}
                strong={page.gangIntel.onTheirTurf}
                tooltip="Server-run crews hold these corners like anyone else. They lean on crews that work their blocks, and you can push them off."
              />
            ) : null}
            {page.gangIntel.relief ? (
              <Row
                label="Street relief"
                value={`${page.gangIntel.relief.crew} went to ground · quiet until ${date(page.gangIntel.relief.until)}`}
                tooltip="When crews like you send a server-run crew to ground, the other crews in town stand down for a while."
              />
            ) : null}
            {page.gangIntel.mood ? (
              <Row
                label="Crew mood"
                value={[
                  page.gangIntel.mood.hot ? `${formatNumber(page.gangIntel.mood.hot)} on a run` : null,
                  page.gangIntel.mood.cooled ? `${formatNumber(page.gangIntel.mood.cooled)} licking wounds` : null,
                  page.gangIntel.mood.dormant ? `${formatNumber(page.gangIntel.mood.dormant)} gone to ground` : null,
                ].filter(Boolean).join(' · ')}
                strong={page.gangIntel.mood.hot > 0}
                tooltip="Crews that keep winning get bolder and move faster. Beat them enough, or keep hitting them, and they go to ground for a while."
              />
            ) : null}
            {page.gangIntel.movement?.inbound.length ? (
              <Row
                label="Crews inbound"
                value={page.gangIntel.movement.inbound.map((move) => `${move.fromName} · ${date(move.arrivesAt)}`).join(', ')}
                strong
                tooltip="Server-run crews moving here. They land when their truck does and start working the city like anyone new."
              />
            ) : null}
            {page.gangIntel.wantedBy && page.gangIntel.wantedUntil ? (
              <Row
                label="Payback risk"
                value={`${formatNumber(page.gangIntel.wantedBy)} crew${page.gangIntel.wantedBy === 1 ? '' : 's'} · cools ${date(page.gangIntel.wantedUntil)}`}
                strong
                tooltip="Street crews you hit can hit you back until then. They still respect your shields, cool-offs and the dogpile limit."
              />
            ) : null}
          </div>
          <ul className="se-city__talk">
            {page.gangIntel.rumors.map((rumor) => <li key={rumor}>{rumor}</li>)}
          </ul>
          {page.gangIntel.crews?.length ? (
            <ol className="se-admin-list">
              {page.gangIntel.crews.map((crew) => (
                <li key={crew.publicPimpId}>
                  <div className="se-admin-check__head">
                    <strong>{crew.name} [{crew.tag}]</strong>
                    <span className="se-muted">{crew.label}{crew.mood === 'HOT' ? ' · on a run' : crew.mood === 'COOLED' ? ' · licking wounds' : ''}{crew.wanted ? ' · wanted' : ''}</span>
                  </div>
                  <p className="se-hint">Run by {crew.boss} (#{crew.publicPimpId}). {crew.style}</p>
                  {crew.reputation.length ? <p className="se-hint">{crew.reputation.join(' ')}</p> : null}
                </li>
              ))}
            </ol>
          ) : null}
        </Panel>
        </OperationDetails>
      ) : null}

      {pending ? (
        <section className="se-raids-pending">
          <div>
            <span className="se-eyebrow">Unsettled hit</span>
            <h2>{attackName(pending.kind)} on {pending.targetName}</h2>
            <p>{formatNumber(pending.input.attackingThugs)} thugs already went out. Settle that report before starting another hit.</p>
          </div>
          <Button
            type="button"
            className="se-btn se-btn--primary"
            disabledReason={busy ? 'Checking that hit with the server now.' : null}
            onClick={() => void submit()}
          >
            {busy ? 'Checking…' : `Retry saved ${attackName(pending.kind)}`}
          </Button>
        </section>
      ) : null}

      {report ? (
        <section ref={reportDetailRef} className={`se-raids-latest${closingReportId === report.id ? ' se-raids-latest--closing' : ''}`}>
          <div className="se-raids-sectionhead">
            <div>
              <span className="se-eyebrow">Battle report</span>
              <h2>Latest street result</h2>
            </div>
            <span className="se-raids-sectionhead__meta">{reportLabel(report)} · {report.won ? 'Won' : 'Lost'}</span>
          </div>
          <BattleReport report={report} onClose={closeReport} />
        </section>
      ) : null}

      {!page ? (
        <div className="se-raids-loading" role="status">Checking the streets…</div>
      ) : !page.enabled ? (
        <Alert>{page.blockedReason}</Alert>
      ) : (
        <>
          {page.ring ? <RingCard ring={page.ring} busy={busy} pending={!!pending} onDestroy={() => void destroyRing()} /> : null}
          <section className="se-raids-plan">
            <div className="se-raids-plan__main">
              <div className="se-raids-sectionhead">
                <div>
                  <span className="se-eyebrow">Attack planner</span>
                  <h2>Choose the hit</h2>
                </div>
                <span className={`se-raids-status${attackBlock ? ' se-raids-status--blocked' : ' se-raids-status--ready'}`}>
                  {attackBlock ? 'Blocked' : 'Ready'}
                </span>
              </div>

              {!selected?.tutorial && (driveBy || specialRaids.length) ? (
                <div className="se-seg se-raids-modes" role="group" aria-label="Kind of hit">
                  {([
                    { kind: 'RAID' as const, label: 'Raid' },
                    ...(driveBy ? [{ kind: 'DRIVE_BY' as const, label: 'Drive-by' }] : []),
                    ...specialRaids.map((action: CombatSpecialRaidDto) => ({ kind: action.kind, label: action.buttonLabel })),
                  ]).map((action) => (
                    <button
                      key={action.kind}
                      type="button"
                      className={`se-seg__btn${mode === action.kind ? ' se-seg__btn--on' : ''}`}
                      aria-pressed={mode === action.kind}
                      disabled={busy || !!pending}
                      title={busy ? 'Your last hit is still going through.' : pending ? 'Get the report for your unsettled hit first.' : undefined}
                      onClick={() => setMode(action.kind)}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="se-raids-state">
                <div>
                  <span>Action cost</span>
                  <strong>{formatNumber(turnCost)} turns</strong>
                </div>
                <div>
                  <span>Squad ceiling</span>
                  <strong>{formatNumber(maxSquad)}</strong>
                </div>
                <div>
                  <span>Your block</span>
                  <strong>{page.protectedUntil ? `Protected until ${date(page.protectedUntil)}` : 'Open'}</strong>
                </div>
                <div>
                  <span>Crew clock</span>
                  <strong>{modeCooldown ? `Ready ${date(modeCooldown)}` : 'Ready now'}</strong>
                </div>
              </div>

              {modeBlock ? <div className="se-raids-block" role="status">{modeBlock}</div> : null}

              {page.targets.length ? (
                <div className="se-raids-form">
                  <fieldset disabled={busy || !!pending}>
                    <div className="se-raids-field">
                      <label htmlFor="raid-target">Mark in your city</label>
                      <select id="raid-target" className="se-input" value={targetId} onChange={(event) => setTargetId(event.target.value)}>
                        <option value="">Choose a mark</option>
                        {page.targets.map((target) => (
                          <option key={target.publicPimpId} value={target.publicPimpId}>
                            {target.alliance ? `[${target.alliance.tag}] ` : ''}{target.displayName} (#{target.publicPimpId}){target.tutorial ? ' · Training target' : ''} · {target.strength}{target.hasRing ? ' · has the Ring' : ''}{target.intel ? ' · scouted' : ''}{target.revengeAvailable ? ' · payback' : ''}{targetBlock(target) ? ` · ${targetBlock(target)}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="se-raids-field">
                      <p className="se-hint">
                        {driving
                          ? `${formatNumber(driveBy!.lowRiders)} Low-Rider${driveBy!.lowRiders === 1 ? '' : 's'} available · ${driveBy!.rules.thugsPerLowRider} shooters per car. A car is lost only if nobody in it makes it home.`
                          : mode === 'DRUG_HOES'
                            ? 'Your crew carries your product in and burns through their supplies if the move lands.'
                            : mode === 'STEAL_RIDE'
                              ? 'Win and get at least one thug home to bring one of their Low-Riders back.'
                              : mode === 'LURE_CREW'
                                ? 'Product talks to unhappy hoes. Beer talks to unhappy thugs.'
                                : 'Your best guns go with the crew automatically. One weapon per fighter.'}
                      </p>
                    </div>
                  </fieldset>
                </div>
              ) : (
                <div className="se-raids-empty">No marks are exposed in your city right now. Check back when another crew is active or protection drops.</div>
              )}

              <div className="se-raid-pagination se-raids-pagination">
                {after > 0 ? (
                  <Button className="se-btn se-btn--ghost se-btn--sm" disabledReason={pagingBlock} onClick={() => { setAfter(0); setTargetId(''); }}>
                    First marks
                  </Button>
                ) : null}
                {page.nextTarget !== null ? (
                  <Button className="se-btn se-btn--ghost se-btn--sm" disabledReason={pagingBlock} onClick={() => { setAfter(page.nextTarget!); setTargetId(''); }}>
                    More marks
                  </Button>
                ) : null}
              </div>
            </div>

            <aside id="intel" className="se-raids-plan__intel">
              <div className="se-raids-sectionhead">
                <div>
                  <span className="se-eyebrow">Target intel</span>
                  <h2>{selected?.displayName ?? 'No mark selected'}{selected?.tutorial ? ' · Training target' : ''}</h2>
                </div>
                {selected ? <span className={`se-raids-target-strength se-raids-target-strength--${selected.strength.toLowerCase()}`}>{selected.strength}</span> : null}
              </div>

              {selected ? (
                <>
                  <TargetCard target={selected} selectedBlock={selectedBlock} driving={driving} />
                   {selected.tutorial ? <p className="se-hint">This practice crew is here for Take a Shot. You always win this practice raid, and the dummy disappears after one attack.</p> : null}

                  {rules?.reconTurnCost !== undefined ? (
                    <div className="se-raids-recon">
                      <div>
                        <strong>{selected.intel ? 'Intel is on the board' : 'Need better eyes?'}</strong>
                        <span>
                          {selected.intel
                            ? `${selected.intel.sharedBy ? `${selected.intel.sharedBy} ran recon. ` : ''}Fresh until ${date(selected.intel.expiresAt)}.`
                            : 'Recon reveals fit crew, wounds, weapons, exposed cash, product depth, and raid protection.'}
                        </span>
                      </div>
                      <Button
                        type="button"
                        className="se-btn se-btn--sm"
                        data-tour="recon-raid"
                        disabledReason={
                          busy
                            ? 'Your last hit is still going through.'
                            : pending
                              ? 'Get the report for your unsettled hit first.'
                              : me.turns.turns < rules.reconTurnCost
                                ? `Recon costs ${rules.reconTurnCost} turns and you have ${formatNumber(me.turns.turns)}.`
                                : null
                        }
                        onClick={() => void reconTarget()}
                      >
                        Recon · {rules.reconFavorKey ? 'Burner Phone · free' : `${rules.reconTurnCost} turns`}
                      </Button>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="se-raids-empty">Choose a mark to put their public standing and any recon on the board.</div>
              )}
            </aside>
          </section>

          <ActionDock
            label="Send the crew"
            onSubmit={(event) => void submit(event)}
            outcome={latest ? {
              id: latest.id,
              title: `${latest.won ? 'Won' : 'Lost'} · ${reportLabel(latest)} on ${latest.opponent.displayName}`,
              tone: latest.won ? 'good' : 'bad',
              chips: battleChips(latest),
              receipt: <BattleReport report={latest} />,
              onDismiss: () => setLatest(null),
            } : null}
          >
            <div>
              <span className="se-dock__label">Crew order · {attackName(driving ? 'DRIVE_BY' : doingSpecialRaid ? specialRaid.kind : 'RAID')}</span>
              <strong>{selected ? selected.displayName : 'Choose a mark'}</strong>
              <span>{attackBlock ?? `${formatNumber(turnCost)} turns when the hit resolves`}</span>
            </div>
            <div className="se-dock__amount">
              <label htmlFor="raid-squad">{driving ? 'Shooters' : 'Thugs'}</label>
              <input
                id="raid-squad"
                className="se-input"
                type="number"
                inputMode="numeric"
                min="1"
                max={maxSquad}
                value={squad}
                disabled={busy || !!pending}
                onChange={(event) => setSquad(event.target.value)}
              />
              <QuantitySteps
                value={squad === '' ? '' : squadNumber}
                onChange={(value) => setSquad(String(value))}
                max={maxSquad}
                steps={[1, 5, 10]}
                disabled={busy || !!pending}
                disabledReason={busy ? 'Your last hit is still going through.' : pending ? 'Settle the pending hit first.' : null}
                emptyReason="Nobody fit to send."
              />
            </div>
            {ammunition ? (
              <div className="se-dock__amount se-raids-ammo-cap">
                <label htmlFor="raid-ammo-cap">Ammo cap · rounds</label>
                <input
                  id="raid-ammo-cap"
                  className="se-input"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max={ammunition.availableRounds}
                  step="1"
                  value={ammoCapText}
                  disabled={busy || !!pending}
                  aria-describedby="raid-ammo-cap-hint"
                  onChange={(event) => setAmmoCapText(event.target.value)}
                />
                <span id="raid-ammo-cap-hint" className="se-hint">
                  Blank uses only the rounds this squad needs. Set a cap to save ammo.
                </span>
              </div>
            ) : null}
            {ammoPreview ? (
              <div className="se-raids-ammo-preview" aria-live="polite">
                {Math.min(ammunition!.availableRounds, ammoCapRounds ?? ammunition!.availableRounds) < ammoPreview.roundsRequired ? (
                  <p className="se-hint se-warn">
                    This squad needs {formatNumber(ammoPreview.roundsRequired)} rounds to fire every assigned gun. Some thugs will fight unarmed at the current stock or cap.
                  </p>
                ) : null}
              </div>
            ) : null}
            {!driving && !doingSpecialRaid ? <CrewTeamPicker role="THUG" specialty="ENFORCER" selectedIds={raidTeam} onChange={setRaidTeam} disabled={busy || !!pending || raidTeam.length > squadNumber} refreshKey={latest} /> : null}
            <Button type="submit" className="se-btn se-btn--primary" disabledReason={attackBlock}>
              {busy
                ? 'Crew is out...'
                : driving
                  ? (selectedBlock ? 'Drive-by blocked' : 'Launch drive-by')
                  : doingSpecialRaid
                    ? (selectedBlock ? `${specialRaid.buttonLabel} blocked` : specialRaid.buttonLabel)
                    : (selectedBlock ? 'Raid blocked' : 'Launch raid')}
            </Button>
            <Link className="se-btn se-btn--secondary" to="/recon">View Your Card</Link>
          </ActionDock>

          <OperationDetails title="Crew, weapons & supplies" summary="Treatment, fight shelf, defense assignments and combat rules">
          <section className="se-raids-section">
            <div className="se-raids-sectionhead">
              <div>
                <span className="se-eyebrow">Your side</span>
                <h2>Combat readiness</h2>
              </div>
              <p>What you can field, what needs treatment, and what the crew takes into a fight.</p>
            </div>

            <div className="se-raids-readygrid">
              <div className="se-raids-stack">
                {page.recovery ? (
                  <Panel title="Crew recovery" className="se-raids-panel">
                    <div className="se-raids-metricgrid">
                      <div><span>Fit thugs</span><strong className="se-good">{formatNumber(page.recovery.fitThugs)}</strong></div>
                      <div><span>Wounded</span><strong className={page.recovery.woundedThugs > 0 ? 'se-warn' : 'se-good'}>{formatNumber(page.recovery.woundedThugs)}</strong></div>
                      <div><span>Medicine</span><strong>{formatNumber(me.resources.medicine)}</strong></div>
                      <div><span>Armed</span><strong>{formatNumber(me.resources.armedThugs)}</strong></div>
                    </div>
                    <div className="se-rows">
                      <Row label="Next recovery" value={page.recovery.nextRecoveryAt ? date(page.recovery.nextRecoveryAt) : 'None'} />
                      {page.recovery.freeTreatmentFavorKey ? <Row label="Doctor Favor" value="Armed · next successful treatment costs 0 medicine" strong /> : null}
                      {page.recovery.medicineEfficiencyPercent ? (
                        <Row
                          label="Medicine efficiency"
                          value={
                            formatNumber(page.recovery.medicineEfficiencyPercent) + '%'
                            + (page.recovery.favorMedicineEfficiencyPercent
                              ? ' · Field Medic +' + formatNumber(page.recovery.favorMedicineEfficiencyPercent) + '%'
                              : '')
                          }
                          strong={Boolean(page.recovery.favorMedicineEfficiencyPercent)}
                        />
                      ) : null}
                    </div>
                    {page.recovery.woundedThugs > 0 ? (
                      <div className="se-raids-panel__action">
                        <Button
                          type="button"
                          className="se-btn se-btn--primary se-btn--sm"
                          disabledReason={
                            busy
                              ? 'Your last hit is still going through.'
                              : page.recovery.maxTreatableThugs <= 0
                                ? `Treating a thug takes medicine, and you have ${formatNumber(me.resources.medicine)}. Buy some at the Corner Store.`
                                : null
                          }
                          onClick={() => void treatWounded()}
                        >
                          {page.recovery.freeTreatmentFavorKey
                            ? `Patch up ${formatNumber(page.recovery.maxTreatableThugs)} · Doctor Favor`
                            : `Patch up ${formatNumber(page.recovery.maxTreatableThugs)} with medicine`}
                        </Button>
                        {page.recovery.maxTreatableThugs <= 0 ? <Link className="se-golink" to="/game/stores/corner">Buy medicine</Link> : null}
                      </div>
                    ) : <p className="se-hint se-good">Everybody is standing.</p>}
                  </Panel>
                ) : null}

                <Panel title="Fight shelf" aside={<Link to="/game/stores/pip">Pip&rsquo;s</Link>} flush className="se-raids-panel">
                  <div className="se-rows">
                    <Row label="Medicine" value={formatNumber(me.resources.medicine)} />
                    <Row label="Beer" value={formatNumber(me.resources.beer)} />
                    <Row label="Low-Riders" value={formatNumber(me.resources.lowRiders)} />
                    <WorkSupplyStockRows jobs={FIGHT_SUPPLY_JOBS} refreshKey={latest?.id ?? report?.id} />
                  </div>
                </Panel>
              </div>

              <div className="se-raids-stack">
                <WorkSupplyPanel
                  title="Fight supply"
                  jobs={[
                    { job: 'RAID', label: 'Squads you send' },
                    { job: 'DEFENSE', label: 'Your defenders' },
                    { job: 'CONVOY', label: 'Escorts on a run' },
                  ]}
                  turns={1}
                  refreshKey={latest?.id ?? report?.id}
                />
                <HitRulesPanel mode={mode} rules={rules!} driveBy={driveBy} specialRaid={specialRaid} />
              </div>
            </div>
          </section>
          </OperationDetails>

          <OperationDetails title="Battle history" summary="View earlier raids, defenses and their full reports" open={Boolean(report)}>
          <section className="se-raids-section">
            <div className="se-raids-sectionhead">
              <div>
                <span className="se-eyebrow">Street history</span>
                <h2>Reports</h2>
              </div>
              <span className="se-raids-sectionhead__meta">{formatNumber(reports.length)} loaded</span>
            </div>

            <Panel title="Hits & defenses" className="se-raids-panel se-raids-panel--reports">
              {!reports.length ? (
                <p className="se-muted">Your hits and defenses land here.</p>
              ) : (
                <ul className="se-raid-reports">
                  {reports.map((battle) => {
                    const selectedReport = report?.id === battle.id;
                    return (
                      <li key={battle.id}>
                        <button
                          className={`se-btn se-raid-report-link${selectedReport ? ' se-raid-report-link--active' : ''}`}
                          type="button"
                          aria-current={selectedReport ? 'true' : undefined}
                          onClick={() => toggleReport(battle)}
                        >
                          <span>{reportLabel(battle)} · {battle.won ? 'Won' : 'Lost'} vs {battle.opponent.alliance ? `[${battle.opponent.alliance.tag}] ` : ''}{battle.opponent.displayName}</span>
                          <span className="se-raid-report-link__meta">{date(battle.createdAt)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {nextBefore ? (
                <Button
                  type="button"
                  className="se-btn se-btn--ghost se-btn--sm"
                  disabledReason={busy ? 'Your last hit is still going through.' : null}
                  onClick={() => void olderReports()}
                >
                  Older reports
                </Button>
              ) : null}
            </Panel>
          </section>
          </OperationDetails>


        </>
      )}
    </div>
  </GameLayout>;
}

export function CombatPage() {
  const me = useSession((s) => s.me);
  const round = useSession((s) => s.round);
  if (!me || !round) return <Navigate to="/join" replace />;
  return <RaidPage key={me.id} playerId={me.id} roundId={round.id} />;
}
