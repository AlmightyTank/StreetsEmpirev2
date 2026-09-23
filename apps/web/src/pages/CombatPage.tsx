import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { formatCents, formatNumber, type BattleReportDto, type CombatPageDto, type CombatSpecialRaidDto, type CombatTargetDto, type SpecialRaidKindDto } from '@streets/shared';
import { combatApi } from '../api/combat.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { AllianceTag } from '../components/AllianceTag.js';
import { Button } from '../components/Button.js';
import { Panel, Row } from '../components/Panel.js';
import { supplyEffects, supplySummary, WorkSupplyPanel, WorkSupplyStockRows } from '../components/WorkSupplyPanel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';
import { newActionId } from '../utils/actionId.js';
import { browserSessionStorage } from '../utils/pendingAction.js';

/** 0.4.0-D. Recon reads a stash's depth, never its count. */
const STASH_LABELS = { none: 'Empty', light: 'Light', stocked: 'Stocked', heavy: 'Heavy' } as const;
import { loadPendingRaid, savePendingRaid, type PendingRaid } from '../utils/pendingRaid.js';

const date = (value: string) => new Date(value).toLocaleString();
const weaponName = (key: string) => key === 'TEK9' ? 'Tek-9' : key === 'AK47' ? 'AK-47' : key.toLowerCase();
const weaponsText = (weapons: Record<string, number>) => Object.entries(weapons).filter(([, count]) => count > 0).map(([key, count]) => `${formatNumber(count)} ${weaponName(key)}`).join(', ') || 'unarmed';

const signedUnits = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatNumber(Math.abs(value))}`;
const signedCents = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatCents(Math.abs(value))}`;

function BattleInventoryRows({ report }: { report: BattleReportDto }) {
  if (report.inventoryChanges?.length) {
    return <>
      {report.inventoryChanges.map((row) => {
        const parts = [
          row.gained > 0 ? `+${formatNumber(row.gained)} gained` : null,
          row.lost > 0 ? `−${formatNumber(row.lost)} lost` : null,
          row.used > 0 ? `−${formatNumber(row.used)} used` : null,
        ].filter(Boolean).join(' · ');
        return <Row
          key={row.product}
          label={row.name}
          value={`${signedUnits(row.change)} / ${formatNumber(row.after)} left${parts ? ` · ${parts}` : ''}`}
          strong={row.change !== 0}
        />;
      })}
    </>;
  }

  return <>
    {report.crackChange !== undefined && report.crackAfter !== undefined
      ? <Row
          label={report.productChanges ? 'Crack' : 'Product'}
          value={`${signedUnits(report.crackChange)} / ${formatNumber(report.crackAfter)} left`}
          strong={report.crackChange !== 0}
        />
      : null}
    {(report.productChanges ?? []).map((row) => (
      <Row key={row.product} label={row.name} value={signedUnits(row.change)} strong={row.change !== 0} />
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

function TrophyCallouts({ report }: { report: BattleReportDto }) {
  if (!report.trophyCallouts?.length) return null;
  return (
    <div className="se-trophies" role="status" aria-label="Unlocked achievements">
      <p className="se-trophies__label">
        {report.trophyCallouts.length === 1 ? 'Achievement unlocked' : 'Achievements unlocked'}
      </p>
      <ul>
        {report.trophyCallouts.map((trophy) => (
          <li key={trophy.key}>
            <span className="se-trophy__title">{trophy.title}</span>
            <span className="se-trophy__desc">{trophy.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TargetCard({ target, selectedBlock, driving }: { target: CombatTargetDto; selectedBlock: string | null; driving: boolean }) {
  return (
    <div className={`se-target-card${selectedBlock ? ' se-target-card--blocked' : ''}`}>
      <div className="se-target-card__head">
        <div>
          <p className="se-target-card__name"><AllianceTag alliance={target.alliance} />{target.displayName} <span className="se-muted se-num">(#{target.publicPimpId})</span></p>
          <p className="se-target-card__sub">
            {selectedBlock ?? (target.revengeAvailable ? 'Payback is open.' : driving ? 'Street crew spotted outside.' : 'Home block advantage.')}
          </p>
        </div>
        <div className="se-tags" aria-label="Target tags">
          <span className={`se-tag${target.strength === 'Weaker' ? ' se-tag--good' : target.strength === 'Stronger' ? ' se-tag--bad' : ''}`}>{target.strength}</span>
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

function DriveByReport({ report, onClose }: { report: BattleReportDto; onClose?: () => void }) {
  const d = report.driveBy!;
  const attacking = report.role === 'ATTACKER';
  const landed = attacking === report.won;
  return <Panel title={`${landed ? (attacking ? 'It landed' : 'They hit you') : (attacking ? 'They shot back' : 'Seen off')} · ${reportLabel(report)}`}>
    <p>{attacking ? 'On' : 'By'} <b><AllianceTag alliance={report.opponent.alliance} link={false} />{report.opponent.displayName}</b> (#{report.opponent.publicPimpId}) · {date(report.createdAt)}</p>
    <TrophyCallouts report={report} />
    <div className="se-rows">
      <Row label={attacking ? 'Shooters — yours / out front' : 'Out front — yours / shooters'} value={`${report.yourSquad} / ${report.opponentSquad}`} />
      <Row label="Firepower — yours / theirs" value={`${report.yourStrength.toFixed(1)} / ${report.opponentStrength.toFixed(1)}`} />
      {report.yourSupply ? <Row label="Fight supply plan" value={`${supplySummary(report.yourSupply)} · ${supplyEffects(report.yourSupply)}`} /> : null}
      <BattleInventoryRows report={report} />
      <Row label="Wounded — yours / theirs" value={`${formatNumber(report.yourWounds)} / ${formatNumber(report.opponentWounds)}`} />
      <Row label={attacking ? 'Their whores killed' : 'Your whores killed'} value={d.whoresAfter !== undefined ? `${formatNumber(d.whoresKilled)} · ${formatNumber(d.whoresAfter)} left` : formatNumber(d.whoresKilled)} strong />
      {attacking ? <Row label="Low-Riders — sent / lost / left" value={`${formatNumber(d.carsSent ?? 0)} / ${formatNumber(d.lowRidersLost ?? 0)} / ${formatNumber(d.lowRidersAfter ?? 0)}`} strong={(d.lowRidersLost ?? 0) > 0} /> : null}
      {attacking ? <Row label="Turns spent / remaining" value={`${report.turnsSpent} / ${report.turnsAfter}`} /> : null}
      <Row label="National rank — before / after" value={`#${report.nationalRankBefore} / #${report.nationalRankAfter}`} />
    </div>
    {attacking ? <p className="se-hint">Your weapons: {weaponsText(report.yourEquipment)}.</p> : null}
    {(d.lowRidersLost ?? 0) > 0 ? <p className="se-hint se-bad">Nobody made it back in {formatNumber(d.lowRidersLost!)} of your cars, so {d.lowRidersLost === 1 ? 'it is' : 'they are'} gone.</p> : null}
    {report.yourWounds > 0 ? <p className="se-hint">{formatNumber(report.yourWounds)} thugs are recovering{report.nextRecoveryAt ? ` until ${date(report.nextRecoveryAt)}` : ''}.</p> : null}
    {report.retaliation ? <p className="se-hint">This was retaliation for a hit on you.</p> : null}
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
    {outcome ? <p className={outcome.tone === 'good' ? 'se-good' : outcome.tone === 'bad' ? 'se-bad' : 'se-hint'}>{outcome.text}</p> : null}
    <TrophyCallouts report={report} />
    <div className="se-rows">
      <Row label="Crew — yours / theirs" value={`${report.yourSquad} / ${report.opponentSquad}`} />
      <Row label="Fighting strength — yours / theirs" value={`${report.yourStrength.toFixed(1)} / ${report.opponentStrength.toFixed(1)}`} />
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
      {form.whoresDrugged !== undefined ? <Row label={attacking ? 'Their hoes drugged' : 'Your hoes drugged'} value={formatNumber(form.whoresDrugged)} strong={form.whoresDrugged > 0} /> : null}
      {form.whoresLured !== undefined ? <Row label={attacking ? 'Hoes joined / now' : 'Hoes lost / left'} value={form.whoresAfter !== undefined ? `${formatNumber(form.whoresLured)} / ${formatNumber(form.whoresAfter)}` : formatNumber(form.whoresLured)} strong={form.whoresLured > 0} /> : null}
      {form.thugsLured !== undefined ? <Row label={attacking ? 'Thugs joined / now' : 'Thugs lost / left'} value={form.thugsAfter !== undefined ? `${formatNumber(form.thugsLured)} / ${formatNumber(form.thugsAfter)}` : formatNumber(form.thugsLured)} strong={form.thugsLured > 0} /> : null}
      {!report.inventoryChanges?.length && form.crackSpent !== undefined && attacking ? <Row label="Product spent" value={formatNumber(form.crackSpent)} /> : null}
      {form.beerSpent !== undefined && attacking ? <Row label="Beer spent" value={formatNumber(form.beerSpent)} /> : null}
      {!report.inventoryChanges?.length && form.defenderCrackBurned !== undefined ? <Row label={attacking ? 'Their product burned' : 'Your product burned'} value={formatNumber(form.defenderCrackBurned)} strong={form.defenderCrackBurned > 0} /> : null}
      {form.defenderCondomsBurned !== undefined ? <Row label={attacking ? 'Their condoms burned' : 'Your condoms burned'} value={formatNumber(form.defenderCondomsBurned)} strong={form.defenderCondomsBurned > 0} /> : null}
      {form.lowRidersStolen !== undefined ? <Row label={attacking ? 'Low-Riders stolen' : 'Low-Riders lost'} value={`${formatNumber(form.lowRidersStolen)} · ${formatNumber(form.lowRidersAfter ?? 0)} left`} strong={form.lowRidersStolen > 0} /> : null}
      {attacking ? <Row label="Turns spent / remaining" value={`${report.turnsSpent} / ${report.turnsAfter}`} /> : null}
      <Row label="National rank — before / after" value={`#${report.nationalRankBefore} / #${report.nationalRankAfter}`} />
    </div>
    {attacking ? <p className="se-hint">Your weapons: {weaponsText(report.yourEquipment)}.</p> : null}
    {(report.yourWounds ?? 0) > 0 ? <p className="se-hint">{formatNumber(report.yourWounds)} thugs are recovering{report.nextRecoveryAt ? ` until ${date(report.nextRecoveryAt)}` : ''}.</p> : null}
    {report.retaliation ? <p className="se-hint">This was payback. Revenge let you answer the crew that hit you.</p> : null}
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
    <TrophyCallouts report={report} />
    <div className="se-rows">
      <Row label="Squads — yours / theirs" value={`${report.yourSquad} / ${report.opponentSquad}`} />
      <Row label="Fighting strength — yours / theirs" value={`${report.yourStrength.toFixed(1)} / ${report.opponentStrength.toFixed(1)}`} />
      {report.yourSupply ? <Row label="Fight supply plan" value={`${supplySummary(report.yourSupply)} · ${supplyEffects(report.yourSupply)}`} /> : null}
      <Row label="Wounded — yours / theirs" value={`${formatNumber(report.yourWounds ?? 0)} / ${formatNumber(report.opponentWounds ?? 0)}`} />
      <Row label="Cash" value={`${signedCents(report.cashChangeCents)} / ${formatCents(report.cashAfterCents)} left`} strong={report.cashChangeCents !== 0} />
      {report.raidProtection ? (
        <Row
          label="Assets protected"
          value={`${formatCents(report.raidProtection.protectedCashCents)} cash · ${formatNumber(report.raidProtection.protectedProductUnits)} / ${formatNumber(report.raidProtection.protectedProductCapacity)} product sealed`}
          tooltip={`${formatNumber(report.raidProtection.exposedProductUnitsBefore)} product units were exposed before loot was rolled.`}
        />
      ) : null}
      <BattleInventoryRows report={report} />

      <Row label="Turns spent / remaining" value={`${report.turnsSpent} / ${report.turnsAfter}`} />
      <Row label="National rank — before / after" value={`#${report.nationalRankBefore} / #${report.nationalRankAfter}`} />
    </div>
    <p className="se-hint">Your weapons: {weaponsText(report.yourEquipment)}.</p>
    {(report.yourWounds ?? 0) > 0 ? <p className="se-hint">{formatNumber(report.yourWounds)} thugs are recovering{report.nextRecoveryAt ? ` until ${date(report.nextRecoveryAt)}` : ''}.</p> : null}
    {report.retaliation ? <p className="se-hint">This was payback. Revenge let you answer the crew that hit you.</p> : null}
    {report.protectedUntil ? <p className="se-hint">Your block is protected until {date(report.protectedUntil)}. You also need your crew back before the next raid.</p> : null}
    {report.cooldownUntil ? <p className="se-hint">Next raid after {date(report.cooldownUntil)}.</p> : null}
    {onClose ? <button type="button" className="se-btn se-btn--ghost se-btn--sm se-raid-report-close" onClick={onClose}>Close report</button> : null}
  </Panel>;
}

function RaidPage({ playerId, roundId }: { playerId: string; roundId: string }) {
  const me = useSession((s) => s.me)!;
  const [page, setPage] = useState<CombatPageDto | null>(null);
  const [after, setAfter] = useState(0);
  const [reports, setReports] = useState<BattleReportDto[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [report, setReport] = useState<BattleReportDto | null>(null);
  const [closingReportId, setClosingReportId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingRaid | null>(() => loadPendingRaid(browserSessionStorage(), playerId));
  const [targetId, setTargetId] = useState('');
  const [mode, setMode] = useState<Mode>('RAID');
  const [squad, setSquad] = useState('1');
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
  /** Drive-bys have their own clock. The other forms share the raid clock. */
  const targetBlock = useCallback((target: CombatTargetDto) => {
    if (driving) return target.driveByBlockedReason ?? null;
    if (mode === 'DRUG_HOES' || mode === 'STEAL_RIDE' || mode === 'LURE_CREW') return target.specialRaidBlockedReasons?.[mode] ?? null;
    return target.blockedReason;
  }, [driving, mode]);

  useEffect(() => {
    if (!page?.targets.length) return;
    if (targetId && page.targets.some((target) => String(target.publicPimpId) === targetId)) return;
    setTargetId(String(page.targets.find((target) => !targetBlock(target))?.publicPimpId ?? page.targets[0]!.publicPimpId));
  }, [page, targetId, targetBlock]);

  const setSaved = (value: PendingRaid | null) => {
    setPending(value);
    savePendingRaid(browserSessionStorage(), playerId, value);
  };
  const selected = page?.targets.find((target) => String(target.publicPimpId) === targetId);
  const selectedBlock = selected ? targetBlock(selected) : null;
  const rules = page?.rules;
  const recovery = page?.recovery;
  const maxSquad = driving ? driveBy!.maxShooters : Math.min(recovery?.fitThugs ?? me.resources.fitThugs, rules?.squadCap ?? 0);
  const modeBlock = driving ? driveBy!.blockedReason : doingSpecialRaid ? specialRaid.blockedReason : page?.blockedReason ?? null;
  const modeCooldown = driving ? driveBy!.cooldownUntil : doingSpecialRaid ? specialRaid.cooldownUntil : page?.cooldownUntil ?? null;
  const turnCost = driving ? driveBy!.rules.turnCost : doingSpecialRaid ? specialRaid.turnCost : rules?.turnCost ?? 0;
  const squadNumber = Number(squad);
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
    const request: PendingRaid = pending ?? { input: { roundId, targetPublicPimpId: selected!.publicPimpId, attackingThugs: squadNumber, actionId: newActionId() }, targetName: selected!.displayName, kind: driving ? 'DRIVE_BY' : doingSpecialRaid ? specialRaid.kind : 'RAID' };
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
      if (closeReportTimer.current !== null) window.clearTimeout(closeReportTimer.current);
      closeReportTimer.current = null;
      setClosingReportId(null);
      setReport(result);
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

  async function treatWounded() {
    if (!page?.recovery || page.recovery.maxTreatableThugs <= 0 || busy) return;
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
          <div className="se-raids-hero__readout">
            <span><small>Turns</small><strong>{formatNumber(me.turns.turns)}</strong></span>
            <span><small>Fit thugs</small><strong>{formatNumber(recovery?.fitThugs ?? me.resources.fitThugs)}</strong></span>
            <span><small>Armed</small><strong>{formatNumber(me.resources.armedThugs)}</strong></span>
            <span><small>Wounded</small><strong>{formatNumber(recovery?.woundedThugs ?? me.resources.woundedThugs)}</strong></span>
          </div>
        </div>
      </header>

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone="info">{notice}</Alert> : null}

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

              {(driveBy || specialRaids.length) ? (
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
                <form onSubmit={(event) => void submit(event)} className="se-raids-form">
                  <fieldset disabled={busy || !!pending}>
                    <div className="se-raids-field">
                      <label htmlFor="raid-target">Mark in your city</label>
                      <select id="raid-target" className="se-input" value={targetId} onChange={(event) => setTargetId(event.target.value)}>
                        <option value="">Choose a mark</option>
                        {page.targets.map((target) => (
                          <option key={target.publicPimpId} value={target.publicPimpId}>
                            {target.alliance ? `[${target.alliance.tag}] ` : ''}{target.displayName} (#{target.publicPimpId}) · {target.strength}{target.intel ? ' · scouted' : ''}{target.revengeAvailable ? ' · payback' : ''}{targetBlock(target) ? ` · ${targetBlock(target)}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="se-raids-field">
                      <div className="se-raids-field__head">
                        <label htmlFor="raid-squad">{driving ? 'Shooters to send' : 'Thugs to send'}</label>
                        <span>max {formatNumber(maxSquad)}</span>
                      </div>
                      <input
                        id="raid-squad"
                        className="se-input"
                        type="number"
                        inputMode="numeric"
                        min="1"
                        max={maxSquad}
                        value={squad}
                        onChange={(event) => setSquad(event.target.value)}
                      />
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

                    <div className="se-raids-launch">
                      <div>
                        <span className="se-raids-launch__label">Crew order</span>
                        <strong>{selected ? selected.displayName : 'Choose a mark'} · {formatNumber(squadNumber || 0)} sent</strong>
                        <span>{attackBlock ?? `${formatNumber(turnCost)} turns will be spent when the hit resolves.`}</span>
                      </div>
                      <Button type="submit" className="se-btn se-btn--primary se-raids-launch__button" disabledReason={attackBlock}>
                        {driving
                          ? (selectedBlock ? 'Drive-by blocked' : 'Launch drive-by')
                          : doingSpecialRaid
                            ? (selectedBlock ? `${specialRaid.buttonLabel} blocked` : specialRaid.buttonLabel)
                            : (selectedBlock ? 'Raid blocked' : 'Launch raid')}
                      </Button>
                    </div>
                  </fieldset>
                </form>
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

            <aside className="se-raids-plan__intel">
              <div className="se-raids-sectionhead">
                <div>
                  <span className="se-eyebrow">Target intel</span>
                  <h2>{selected?.displayName ?? 'No mark selected'}</h2>
                </div>
                {selected ? <span className={`se-raids-target-strength se-raids-target-strength--${selected.strength.toLowerCase()}`}>{selected.strength}</span> : null}
              </div>

              {selected ? (
                <>
                  <TargetCard target={selected} selectedBlock={selectedBlock} driving={driving} />

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
                    <WorkSupplyStockRows jobs={FIGHT_SUPPLY_JOBS} refreshKey={report?.id} />
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
                  refreshKey={report?.id}
                />
                <HitRulesPanel mode={mode} rules={rules!} driveBy={driveBy} specialRaid={specialRaid} />
              </div>
            </div>
          </section>

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
