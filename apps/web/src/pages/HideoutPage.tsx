import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type {
  HideoutRoomV2Dto,
  HideoutSpecializationResult,
  HideoutSpecializationRoomDto,
  HideoutUpgradeResult,
  HideoutV2Dto,
  HideoutCosmeticsDto,
  TravelDto,
} from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { hideoutApi } from '../api/hideout.js';
import { api, ApiError } from '../api/client.js';
import { ActionResult } from '../components/ActionResult.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Panel, Row } from '../components/Panel.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';
import { useOnboarding } from '../stores/onboarding.js';
import { confirmAction } from '../stores/confirm.js';
import { formatCountdown, formatDuration, formatWhen } from '../utils/time.js';
import { ItemLabel, ItemTile } from '../components/ItemTile.js';
import { hasItemArt } from '../items/itemArt.js';
import { EmpirePageHeader } from '../components/EmpireManagement.js';
import { StreetSignDisplay } from '../components/StreetSignBuilder.js';
import { ScavengingPanel } from '../components/ScavengingPanel.js';
import { GeneratorPanel } from '../components/GeneratorPanel.js';
import { WorkshopPanel } from '../components/WorkshopPanel.js';
import { GameTabs } from '../components/GameUI.js';
import type { CraftingWorkshopDto } from '@streets/shared';
import type { ScavengePageDto } from '@streets/shared';
import {
  hashForHideoutView,
  hideoutBuildStatus,
  hideoutRoomState,
  hideoutRoomStateLabel,
  hideoutSuppliesOnPage,
  hideoutViewFromHash,
  pickNextHideoutRoom,
  resolveHideoutSection,
  resolveSupplyTab,
  type HideoutSectionId,
  type HideoutSupplyTab,
} from './hideout-view.js';

function securityTierLabel(tier: NonNullable<HideoutV2Dto['security']>['reconWarningTier']): string {
  if (tier === 'SOURCE') return 'Named warnings';
  if (tier === 'PRESENCE') return 'Anonymous warnings';
  return 'No recon warnings';
}

function Metric({
  label,
  value,
  detail,
  tone,
  art,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: 'good' | 'warn' | 'bad' | 'accent';
  /** Item art key for a small picture in the corner. */
  art?: string;
}) {
  const showArt = art !== undefined && hasItemArt(art);
  return (
    <div className={`se-hideout-metric${tone ? ` se-hideout-metric--${tone}` : ''}${showArt ? ' se-hideout-metric--art' : ''}`}>
      {showArt ? <ItemTile item={art} size="sm" label={false} className="se-item-corner" /> : null}
      <span className="se-hideout-metric__label">{label}</span>
      <strong className="se-hideout-metric__value">{value}</strong>
      {detail ? <span className="se-hideout-metric__detail">{detail}</span> : null}
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  copy,
}: {
  eyebrow: string;
  title: string;
  copy: string;
}) {
  return (
    <div className="se-hideout-sectionhead">
      <span className="se-eyebrow">{eyebrow}</span>
      <div>
        <h2>{title}</h2>
        <p>{copy}</p>
      </div>
    </div>
  );
}

/** "30m build" / "instant" for a room's next level. */
function buildTimeLabel(minutes: number | null | undefined): string | null {
  if (minutes === null || minutes === undefined) return null;
  return minutes > 0 ? `${formatDuration(minutes * 60_000)} build` : 'instant build';
}

/** Ticks once a second until the build is ready, then asks the page to refresh once. */
function BuildCountdown({ startedAt, readyAt, onDone }: { startedAt: string; readyAt: string; onDone: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const end = new Date(readyAt).getTime();
  const start = new Date(startedAt).getTime();
  const done = now >= end;
  useEffect(() => {
    if (done) {
      // The server lands the level on its next settle; give the clock a moment of slack.
      const timer = window.setTimeout(onDone, 1500);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [done, onDone]);
  const percent = end > start ? Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100)) : 100;
  return (
    <div className="se-hideout-build" role="status">
      <div className="se-hideout-build__head">
        <span>Under construction</span>
        <strong>{done ? 'Finishing up…' : `Ready in ${formatCountdown(end - now)}`}</strong>
      </div>
      <div className="se-hideout-build__bar" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>
      <small>Done {formatWhen(readyAt)}</small>
    </div>
  );
}

function RoomCard({
  room,
  cashCents,
  blocked,
  specializing,
  onUpgrade,
  onSpecialize,
  onBuildDone,
}: {
  room: HideoutRoomV2Dto;
  cashCents: number;
  /** Why no room can be upgraded right now, or null when they can. */
  blocked: string | null;
  specializing: boolean;
  onUpgrade: (room: HideoutRoomV2Dto) => void;
  onSpecialize: (room: HideoutRoomV2Dto, key: string) => void;
  onBuildDone: () => void;
}) {
  const maxed = room.nextCostCents === null;
  const building = room.build ?? null;
  const buildTime = buildTimeLabel(room.nextBuildMinutes);
  const nextCostComponents = room.nextCostComponents ?? [];
  const affordable = !maxed && cashCents >= room.nextCostCents!;
  const selectedSpecialization = room.specialization?.selectedKey
    ? room.specialization.choices.find((choice) => choice.key === room.specialization!.selectedKey) ?? null
    : null;
  const specializationReady = Boolean(
    room.specialization
    && room.level >= room.specialization.unlockLevel
    && room.specialization.selectedKey === null
  );
  const state = hideoutRoomState({
    nextCostCents: room.nextCostCents,
    canUpgrade: room.canUpgrade,
    cashCents,
    nextRequirements: room.nextRequirements,
    nextCostComponents: nextCostComponents,
    building: Boolean(building),
  });
  const stateLabel = hideoutRoomStateLabel(state);

  return (
    <article
      id={`hideout-room-${room.key.toLowerCase()}`}
      className={`se-hideout-room se-hideout-room--${state}`}
      data-room={room.key.toLowerCase()}
      data-tour={room.key === 'SAFE_ROOM' ? 'upgrade-hideout' : undefined}
      data-tour-card-anchor={room.key === 'SAFE_ROOM' ? 'upgrade-hideout' : undefined}
    >
      <div className="se-hideout-room__head">
        <div>
          <span className="se-hideout-room__kicker">Level {formatNumber(room.level)} / {formatNumber(room.maxLevel)}</span>
          <h3>{room.name}</h3>
        </div>
        <span className={`se-hideout-status se-hideout-status--${state}`}>{stateLabel}</span>
      </div>

      <p className="se-hideout-room__blurb">{room.blurb}</p>

      <div className="se-hideout-room__levels" style={{ gridTemplateColumns: `repeat(${room.maxLevel}, minmax(0, 1fr))` }} role="img" aria-label={`${room.level} of ${room.maxLevel} levels complete`}>
        {Array.from({ length: room.maxLevel }, (_, index) => (
          <span
            key={index}
            className={index < room.level ? 'is-filled' : undefined}
            aria-hidden="true"
          />
        ))}
      </div>

      <div className="se-hideout-room__effect">
        <span>Active effect</span>
        <strong>{room.currentEffect}</strong>
      </div>

      {!maxed ? (
        <div className="se-hideout-room__next">
          <div>
            <span>Next level</span>
            <strong>{room.nextEffect}</strong>
          </div>
          <div className="se-hideout-room__price">
            <span>Cost</span>
            <strong>{formatCents(room.nextCostCents!)} · {formatNumber(room.nextCostTurns!)} turns{buildTime ? ` · ${buildTime}` : ''}</strong>
          </div>
        </div>
      ) : (
        <div className="se-hideout-room__next se-hideout-room__next--maxed">
          <div>
            <span>Build complete</span>
            <strong>Fully upgraded for this season</strong>
          </div>
        </div>
      )}

      {building ? <BuildCountdown startedAt={building.startedAt} readyAt={building.readyAt} onDone={onBuildDone} /> : null}

      {!maxed && !building && nextCostComponents.length ? (
        <div className="se-hideout-room__requirements">
          {nextCostComponents.map((component) => (
            <div key={component.key} className={component.met ? 'is-met' : undefined}>
              <span>{component.key.replaceAll('_', ' ')}</span>
              <strong>{formatNumber(component.current)} / {formatNumber(component.quantity)}</strong>
            </div>
          ))}
        </div>
      ) : null}
      {room.nextRequirements.length ? (
        <div className="se-hideout-room__requirements">
          {room.nextRequirements.map((requirement) => (
            <div key={requirement.key} className={requirement.met ? 'is-met' : undefined}>
              <span>{requirement.label}</span>
              <strong>{formatNumber(requirement.current)} / {formatNumber(requirement.required)}</strong>
            </div>
          ))}
        </div>
      ) : null}

      {room.specialization ? (
        <div className="se-hideout-room__specialization">
          <span className="se-hideout-room__specialization-label">Specialization</span>
          {selectedSpecialization ? (
            <div>
              <strong>{selectedSpecialization.name}</strong>
              <p>{selectedSpecialization.blurb}</p>
            </div>
          ) : room.level < room.specialization.unlockLevel ? (
            <p>
              Unlocks at level {formatNumber(room.specialization.unlockLevel)} ·{' '}
              {room.specialization.choices.map((choice) => choice.name).join(' / ')}
            </p>
          ) : (
            <p>Choose one permanent branch for this season.</p>
          )}
        </div>
      ) : null}

      {specializationReady && room.specialization ? (
        <div className="se-hideout-room__choices">
          {room.specialization.choices.map((choice) => (
            <Button
              key={choice.key}
              type="button"
              className="se-btn se-btn--ghost se-btn--sm"
              disabledReason={specializing ? 'Saving your permanent branch choice.' : null}
              onClick={() => onSpecialize(room, choice.key)}
            >
              {choice.name}
            </Button>
          ))}
        </div>
      ) : null}

      <Button
        type="button"
        className="se-btn se-btn--primary se-btn--block"
        disabledReason={blocked
          ?? (maxed ? 'This room is fully upgraded for this season.' : null)
          ?? room.lockReason
          ?? (!maxed && !affordable
            ? `This costs ${formatCents(room.nextCostCents!)} and you are ${formatCents(room.nextCostCents! - cashCents)} short.`
            : null)}
        onClick={() => onUpgrade(room)}
      >
        {building
          ? `Building level ${formatNumber(building.level)}`
          : state === 'maxed'
          ? 'Fully upgraded'
          : state === 'ready'
            ? `Upgrade to level ${formatNumber(room.level + 1)}`
            : state === 'cash'
              ? `Need ${formatCents(room.nextCostCents!)}`
              : 'Requirements not met'}
      </Button>
    </article>
  );
}

function HideoutLook({
  cosmetics,
  busy,
  onSave,
}: {
  cosmetics: HideoutCosmeticsDto;
  busy: boolean;
  onSave: (decorationKey: string | null, streetSignKey: string | null) => void;
}) {
  const [decorationKey, setDecorationKey] = useState(cosmetics.activeDecorationKey);
  useEffect(() => {
    setDecorationKey(cosmetics.activeDecorationKey);
  }, [cosmetics.activeDecorationKey]);
  const decoration = cosmetics.decorations.find((option) => option.key === decorationKey);
  const changed = decorationKey !== cosmetics.activeDecorationKey;
  return (
    <section id="hideout-look" className="se-hideout-section">
      <SectionHeading eyebrow="Presentation" title="Make the hideout yours" copy="Equip account cosmetics for the headquarters wall and the street-facing sign. These looks never change room levels or gameplay." />
      <div className="se-hideout-look">
        <div className="se-hideout-renderer" aria-label="Hideout cosmetic preview">
          <div className={`se-hideout-renderer__room${decoration ? ` se-hideout-renderer__room--${decoration.key}` : ''}`}>
            <span className="se-hideout-renderer__light" aria-hidden="true" />
            <div className="se-hideout-renderer__sign">
              {cosmetics.streetSign
                ? <StreetSignDisplay design={cosmetics.streetSign} />
                : <span className="se-hideout-renderer__sign-empty">Set your street sign in Account Settings</span>}
            </div>
            <div className="se-hideout-renderer__decor">{decoration?.label ?? 'Your headquarters'}</div>
          </div>
          <p>{decoration?.description ?? 'Unlock a hideout decoration to light the room.'} Your street sign is managed from Account Settings.</p>
        </div>
        <div className="se-hideout-look__controls">
          <label>Hideout decoration
            <select value={decorationKey ?? ''} onChange={(event) => setDecorationKey(event.target.value || null)}>
              <option value="">None</option>
              {cosmetics.decorations.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
          </label>
          <Button type="button" className="se-btn se-btn--primary" disabledReason={busy ? 'Saving your hideout look.' : !changed ? 'Your hideout look is already saved.' : null} onClick={() => onSave(decorationKey, cosmetics.activeStreetSignKey)}>
            Save hideout look
          </Button>
        </div>
      </div>
    </section>
  );
}

/** Shows the current headquarters state and controls for seasonal room upgrades. */
export function HideoutPage() {
  const me = useSession((s) => s.me);
  const location = useLocation();
  const navigate = useNavigate();
  const tourTarget = (location.state as { tourTarget?: unknown } | null)?.tourTarget;
  const guidedTourScrolled = useRef(false);
  const tour = useOnboarding((s) => s.state?.tour ?? null);
  const tourWantsUpgrade = Boolean(
    tour && tour.active && !tour.dismissed && !tour.complete && tour.step === 'upgrade-hideout',
  );
  const [leftTourRooms, setLeftTourRooms] = useState(false);
  const action = useGameAction<HideoutUpgradeResult>();
  const specializationAction = useGameAction<HideoutSpecializationResult>();
  const [hideout, setHideout] = useState<HideoutV2Dto | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [travel, setTravel] = useState<TravelDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [cosmetics, setCosmetics] = useState<HideoutCosmeticsDto | null>(null);
  const [cosmeticBusy, setCosmeticBusy] = useState(false);
  const [cosmeticError, setCosmeticError] = useState<string | null>(null);
  const [scavenging, setScavenging] = useState<ScavengePageDto | null>(null);
  const [workshop, setWorkshop] = useState<CraftingWorkshopDto | null>(null);
  useEffect(() => {
    setLeftTourRooms(false);
  }, [tourWantsUpgrade]);

  useEffect(() => {
    if (tourTarget !== 'upgrade-hideout' || guidedTourScrolled.current) return;
    const frame = window.requestAnimationFrame(() => {
      const target = document.querySelector('[data-tour="upgrade-hideout"]');
      if (!target) return;
      guidedTourScrolled.current = true;
      target.scrollIntoView({
        block: 'start',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [tourTarget]);

  useEffect(() => {
    let active = true;
    const catalog = hideoutApi.catalog()
      .then((data) => {
        if (!active) return;
        setHideout(data);
        setLoadError(null);
      })
      .catch((caught: unknown) => {
        if (active) setLoadError(caught instanceof ApiError ? caught.message : 'Could not load the hideout.');
      });
    const cosmetics = hideoutApi.cosmetics().then((data) => { if (active) setCosmetics(data); }).catch(() => { if (active) setCosmetics(null); });
    const scavenging = hideoutApi.scavenging().then((data) => { if (active) setScavenging(data); }).catch(() => { if (active) setScavenging(null); });
    const workshop = hideoutApi.workshop().then((data) => { if (active) setWorkshop(data); }).catch(() => { if (active) setWorkshop(null); });

    const travel = api.get<TravelDto>('/game/travel')
      .then((data) => { if (active) setTravel(data); })
      .catch(() => { if (active) setTravel(null); });

    void Promise.all([catalog, cosmetics, scavenging, workshop, travel]).finally(() => {
      if (active) setInitialLoading(false);
    });

    return () => { active = false; };
  }, [me?.resources.cashCents, me?.resources.condoms, me?.resources.medicine, me?.resources.beer, me?.resources.ammo, me?.resources.vehicleParts, me?.resources.pistols, me?.resources.shotguns, me?.resources.tek9s, me?.resources.ak47s, me?.resources.lowRiders, me?.resources.sedans, me?.resources.vans, reload]);

  async function saveCosmetics(decorationKey: string | null, streetSignKey: string | null) {
    setCosmeticBusy(true);
    setCosmeticError(null);
    try {
      setCosmetics(await hideoutApi.updateCosmetics({ decorationKey, streetSignKey }));
    } catch (caught) {
      setCosmeticError(caught instanceof ApiError ? caught.message : 'Could not save the hideout look.');
    } finally {
      setCosmeticBusy(false);
    }
  }

  // A finished build changes levels, effects and what is ready next: refresh both.
  const buildDone = useCallback(() => {
    setReload((n) => n + 1);
    void useSession.getState().refreshSnapshot({ background: true });
  }, []);

  async function upgrade(room: HideoutRoomV2Dto) {
    await action.run((actionId) => hideoutApi.upgrade({ room: room.key, actionId }));
    setReload((n) => n + 1);
  }

  async function specialize(room: HideoutRoomV2Dto, specialization: string) {
    const choice = room.specialization?.choices.find((candidate) => candidate.key === specialization);
    if (!choice || room.key === 'GARAGE') return;
    if (!(await confirmAction({
      title: `Choose ${choice.name} for ${room.name}?`,
      body: 'This choice is permanent for the rest of this season.',
      confirmLabel: `Choose ${choice.name}`,
    }))) return;

    await specializationAction.run((actionId) => hideoutApi.specialize({
      room: room.key as HideoutSpecializationRoomDto,
      specialization,
      actionId,
    }));
    setReload((n) => n + 1);
  }

  const receipt = action.result?.result ?? null;
  const openRooms = hideout?.rooms.filter((room) => room.nextCostCents !== null) ?? [];
  const readyRooms = openRooms.filter((room) => room.canUpgrade);
  // Each panel below exists only on rulesets that carry it; a section with none of them stays out of the page and the nav.
  const hasSecurity = Boolean(hideout && (hideout.security || hideout.assetProtection || hideout.armory || hideout.infirmary));
  const hasOperations = Boolean(hideout && (hideout.workshop || hideout.garage || hideout.ledger));
  const nextRoom = pickNextHideoutRoom(hideout?.rooms ?? []);
  const buildProgress = hideout && hideout.totalMaxLevel > 0
    ? Math.round((hideout.totalLevel / hideout.totalMaxLevel) * 100)
    : 0;

  const productUnits = me?.products
    ? me.products.reduce((sum, product) => sum + product.quantity, 0)
    : me?.resources.product ?? 0;
  const activeRuns = travel?.runs.length ?? (me?.run ? 1 : 0);
  const activeThreats = hideout?.security
    ? hideout.security.pendingConvoyThreats + hideout.security.pendingTurfThreats
    : 0;
  const requested = hideoutViewFromHash(location.hash);
  const hasSupplies = Boolean(scavenging || workshop || hideout?.generator);
  const hasLook = Boolean(cosmetics);
  const section = resolveHideoutSection(requested.section, {
    hasSecurity,
    hasOperations,
    hasSupplies,
    hasLook,
    hasScavenging: Boolean(scavenging),
    hasWorkshop: Boolean(workshop),
    hasGenerator: Boolean(hideout?.generator),
  });
  const legacySuppliesSection: HideoutSectionId = scavenging ? 'scavenging' : workshop ? 'workshop' : 'generator';
  const activeSection: HideoutSectionId = tourWantsUpgrade && !leftTourRooms
    ? 'rooms'
    : section === 'supplies' && hideout?.enabled
      ? legacySuppliesSection
      : section;
  const supplyAvailable: Record<HideoutSupplyTab, boolean> = {
    stash: false,
    scavenging: Boolean(scavenging),
    workshop: Boolean(workshop),
    generator: Boolean(hideout?.generator),
  };
  const supplyTab = resolveSupplyTab(requested.supply, supplyAvailable);
  const turnsUsed = action.result
    ? Math.max(0, action.result.before.turns - action.result.after.turns)
    : 0;

  useEffect(() => {
    if (activeSection !== 'rooms' || !requested.roomKey) return;
    document.getElementById(`hideout-room-${requested.roomKey}`)?.scrollIntoView({ block: 'start' });
  }, [activeSection, requested.roomKey, hideout]);

  useEffect(() => {
    if (!tourWantsUpgrade || leftTourRooms) return;
    document.querySelector('[data-tour="upgrade-hideout"]')?.scrollIntoView({ block: 'center' });
  }, [tourWantsUpgrade, leftTourRooms, hideout, activeSection]);

  useEffect(() => {
    const selected = document.querySelector<HTMLElement>('.se-hideout-tabs [role="tab"][aria-selected="true"]');
    selected?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeSection]);

  function openHideoutSection(next: HideoutSectionId, roomKey: string | null = null) {
    setLeftTourRooms(true);
    const hash = hashForHideoutView({
      section: next,
      supply: next === 'supplies' ? supplyTab : requested.supply,
      roomKey,
    });
    if (location.hash !== hash) navigate({ hash });
  }

  function openSupply(next: HideoutSupplyTab) {
    setLeftTourRooms(true);
    const hash = hashForHideoutView({ section: 'supplies', supply: next, roomKey: null });
    if (location.hash !== hash) navigate({ hash });
  }

  const suppliesOnPage = hideoutSuppliesOnPage(Boolean(hideout?.enabled));
  const suppliesPanel = me && hasSupplies ? (
    <section id="hideout-resources" className="se-hideout-section se-hideout-resources">
      {suppliesOnPage ? <p className="se-hideout-inline-note">Stash, caches, crafting, and the generator stay available this round.</p> : null}
      <GameTabs
        label="Hideout supplies"
        activeId={supplyTab}
        onChange={(id) => openSupply(id as HideoutSupplyTab)}
        items={[
          ...(scavenging ? [{ id: 'scavenging', label: 'Caches and components' }] : []),
          ...(workshop ? [{ id: 'workshop', label: 'Crafting bench' }] : []),
          ...(hideout?.generator ? [{ id: 'generator', label: 'Generator' }] : []),
        ]}
      />
      <div className="se-hideout-resources__panel" role="tabpanel" aria-label={`${supplyTab} panel`}>
        {supplyTab === 'scavenging' && scavenging ? <ScavengingPanel heading={false} page={scavenging} onChanged={setScavenging} /> : null}
        {supplyTab === 'workshop' && workshop ? <WorkshopPanel heading={false} workshop={workshop} onChanged={setWorkshop} /> : null}
        {supplyTab === 'generator' && hideout?.generator ? <GeneratorPanel heading={false} generator={hideout.generator} onChanged={(generator) => setHideout((current) => current ? { ...current, generator } : current)} /> : null}
      </div>
    </section>
  ) : null;

  if (initialLoading) {
    return (
      <GameLayout>
        <div className="se-hideout se-hideout--loading" aria-busy="true">
          <EmpirePageHeader
            eyebrow="Your operation · seasonal headquarters"
            title="Hideout"
            description="Loading your headquarters and its current systems."
          />
          <Panel title="Loading"><p className="se-muted">Checking the locks and opening the rooms...</p></Panel>
        </div>
      </GameLayout>
    );
  }

  return (
    <GameLayout>
      <div className="se-hideout">
        <EmpirePageHeader
          eyebrow="Your operation · seasonal headquarters"
          title="Hideout"
          description="Manage your crew and seasonal upgrades."
          aside={hideout?.enabled ? (
            <div className="se-hideout-hero__progress">
              <div>
                <span>Build progress</span>
                <strong>{formatNumber(hideout.totalLevel)} / {formatNumber(hideout.totalMaxLevel)}</strong>
              </div>
              <div className="se-hideout-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={buildProgress} aria-label="Hideout upgrades complete">
                <span style={{ width: `${buildProgress}%` }} />
              </div>
              <small>{formatNumber(buildProgress)}% complete · {formatNumber(readyRooms.length)} ready now</small>
            </div>
          ) : undefined}
        />

        {loadError ? (
          <Alert>
            {loadError}{' '}
            <button className="se-btn se-btn--sm" onClick={() => setReload((n) => n + 1)}>Retry</button>
          </Alert>
        ) : null}
        {action.error ? <Alert>{action.error}</Alert> : null}
        {specializationAction.error ? <Alert>{specializationAction.error}</Alert> : null}
        {cosmeticError ? <Alert>{cosmeticError}</Alert> : null}

        {receipt && action.result ? (
          <div className="se-store-receipt" aria-live="polite">
            <ActionResult
              title={receipt.readyAt ? `${receipt.roomName} construction started` : `${receipt.roomName} upgraded`}
              subtitle={receipt.readyAt
                ? `Level ${receipt.levelAfter} is ready ${formatWhen(receipt.readyAt)}`
                : `Level ${receipt.levelBefore} -> ${receipt.levelAfter}`}
              result={action.result}
              onDismiss={action.clear}
              lines={[
                { label: 'Paid', delta: -receipt.costCents, money: true },
                { label: receipt.readyAt ? 'When built' : 'Effect', value: receipt.effect },
                ...(receipt.buildMinutes ? [{ label: 'Build time', value: formatDuration(receipt.buildMinutes * 60_000) }] : []),
                { label: 'Turns used', delta: -turnsUsed, remaining: action.result.after.turns },
              ]}
            />
          </div>
        ) : null}

        {!hideout && !loadError ? (
          <Panel title="Loading"><p className="se-muted">Checking the locks...</p></Panel>
        ) : null}

        {hideout && !hideout.enabled ? (
          <Panel title="Hideout closed">
            <p className="se-muted">This round does not use seasonal hideout upgrades.</p>
          </Panel>
        ) : null}

        {suppliesOnPage ? suppliesPanel : null}

        {hideout?.enabled && me ? (
          <>
            <div className="se-hideout-tabs">
              <GameTabs
                label="Hideout sections"
                activeId={activeSection}
                onChange={(id) => openHideoutSection(id as HideoutSectionId)}
                items={[
                  { id: 'overview', label: 'Overview' },
                  { id: 'rooms', label: readyRooms.length ? `Rooms · ${formatNumber(readyRooms.length)}` : 'Rooms' },
                  ...(scavenging ? [{ id: 'scavenging', label: 'Caches' }] : []),
                  ...(workshop ? [{ id: 'workshop', label: 'Crafting' }] : []),
                  ...(hideout.generator ? [{ id: 'generator', label: 'Generator' }] : []),
                  ...(hasSecurity ? [{ id: 'security', label: activeThreats > 0 ? `Security · ${formatNumber(activeThreats)}` : 'Security' }] : []),
                  ...(hasOperations ? [{ id: 'operations', label: 'Operations' }] : []),
                  ...(hasLook ? [{ id: 'look', label: 'Look' }] : []),
                ]}
              />
            </div>

            {activeSection === 'overview' ? (
            <section id="hideout-overview" className="se-hideout-overview">
              <div className="se-hideout-overview__primary">
                <div className="se-hideout-overview__title">
                  <div>
                    <span className="se-eyebrow">Headquarters snapshot</span>
                    <h2>Operation status</h2>
                  </div>
                  <span className="se-hideout-chip">{hideoutBuildStatus(readyRooms.length, openRooms.length)}</span>
                </div>

                <div className="se-hideout-metrics">
                  <Metric label="Cash on hand" art="CASH" value={formatCents(me.resources.cashCents)} tone="accent" />
                  <Metric
                    label="Cash exposed"
                    value={hideout.assetProtection ? formatCents(hideout.assetProtection.exposedCashCents) : '—'}
                    detail={hideout.assetProtection ? `${formatCents(hideout.assetProtection.protectedCashCents)} protected` : undefined}
                    tone={hideout.assetProtection && hideout.assetProtection.exposedCashCents > 0 ? 'warn' : 'good'}
                  />
                  <Metric
                    label="Products"
                    value={formatNumber(productUnits)}
                    detail={hideout.assetProtection
                      ? `${formatNumber(hideout.assetProtection.exposedProductUnits)} exposed`
                      : undefined}
                  />
                  <Metric
                    label="Crew"
                    value={formatNumber(me.resources.whores + me.resources.fitThugs + me.resources.woundedThugs)}
                    detail={`${formatNumber(me.resources.whores)} hoes · ${formatNumber(me.resources.fitThugs)} fit thugs`}
                  />
                  <Metric
                    label="Active runs"
                    value={formatNumber(activeRuns)}
                    detail="road operations"
                  />
                  <Metric
                    label="Threats"
                    value={formatNumber(activeThreats)}
                    detail={securityTierLabel(hideout.security?.reconWarningTier ?? 'NONE')}
                    tone={activeThreats > 0 ? 'bad' : 'good'}
                  />
                  <Metric
                    label="Heat"
                    value={me.heat ? `${formatNumber(me.heat.heat)} / ${formatNumber(me.heat.max)}` : 'Not active'}
                  />
                  <Metric
                    label="Turf"
                    value={me.turf ? `${formatNumber(me.turf.blocksHeld)} blocks` : 'Not active'}
                  />
                </div>
              </div>

              <aside className="se-hideout-priority">
                <span className="se-eyebrow">Next build target</span>
                {nextRoom?.build ? (
                  <>
                    <div className="se-hideout-priority__room">
                      <div>
                        <h3>{nextRoom.name}</h3>
                        <span>Level {formatNumber(nextRoom.build.level)} under construction</span>
                      </div>
                    </div>
                    <BuildCountdown startedAt={nextRoom.build.startedAt} readyAt={nextRoom.build.readyAt} onDone={buildDone} />
                    <Button type="button" className="se-btn se-btn--primary se-btn--block" onClick={() => openHideoutSection('rooms', nextRoom.key.toLowerCase())}>
                      View {nextRoom.name}
                    </Button>
                  </>
                ) : nextRoom ? (
                  <>
                    <div className="se-hideout-priority__room">
                      <div>
                        <h3>{nextRoom.name}</h3>
                        <span>Level {formatNumber(nextRoom.level)} → {formatNumber(nextRoom.level + 1)}{nextRoom.nextCostTurns ? ` · ${formatNumber(nextRoom.nextCostTurns)} turns` : ''}{buildTimeLabel(nextRoom.nextBuildMinutes) ? ` · ${buildTimeLabel(nextRoom.nextBuildMinutes)}` : ''}</span>
                      </div>
                      <strong>{formatCents(nextRoom.nextCostCents!)}</strong>
                    </div>
                    <p>{nextRoom.nextEffect}</p>
                    {nextRoom.nextRequirements.length || (nextRoom.nextCostComponents ?? []).length ? (
                      <div className="se-hideout-priority__reqs">
                        {nextRoom.nextRequirements.map((requirement) => (
                          <span key={requirement.key} className={requirement.met ? 'is-met' : undefined}>
                            {requirement.label} {formatNumber(requirement.current)}/{formatNumber(requirement.required)}
                          </span>
                        ))}
                        {(nextRoom.nextCostComponents ?? []).map((component) => (
                          <span key={component.key} className={component.met ? 'is-met' : undefined}>
                            {component.key.replaceAll('_', ' ')} {formatNumber(component.current)}/{formatNumber(component.quantity)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <Button
                      type="button"
                      className="se-btn se-btn--primary se-btn--block"
                      disabledReason={action.busy
                        ? 'Your last upgrade is still going through.'
                        : nextRoom.lockReason
                          ?? (me.resources.cashCents < nextRoom.nextCostCents!
                            ? `This costs ${formatCents(nextRoom.nextCostCents!)} and you are ${formatCents(nextRoom.nextCostCents! - me.resources.cashCents)} short.`
                            : null)}
                      onClick={() => void upgrade(nextRoom)}
                    >
                      {me.resources.cashCents < nextRoom.nextCostCents!
                        ? `Need ${formatCents(nextRoom.nextCostCents!)}`
                        : nextRoom.canUpgrade
                          ? `Upgrade ${nextRoom.name}`
                          : 'Upgrade locked'}
                    </Button>
                  </>
                ) : (
                  <div className="se-hideout-priority__complete">
                    <strong>Hideout complete</strong>
                    <p>Every room is fully upgraded for this season.</p>
                  </div>
                )}
              </aside>
              <div className="se-hideout-roster" aria-label="Room levels">
                {hideout.rooms.map((room) => {
                  const state = hideoutRoomState({
                    nextCostCents: room.nextCostCents,
                    canUpgrade: room.canUpgrade,
                    cashCents: me.resources.cashCents,
                    building: Boolean(room.build),
                    nextRequirements: room.nextRequirements,
                    nextCostComponents: room.nextCostComponents,
                  });
                  return (
                    <button
                      key={room.key}
                      type="button"
                      className={`se-hideout-roster__room se-hideout-roster__room--${state}`}
                      onClick={() => openHideoutSection('rooms', room.key.toLowerCase())}
                    >
                      <span>{room.name}</span>
                      <strong>{formatNumber(room.level)}/{formatNumber(room.maxLevel)}</strong>
                      <small>{hideoutRoomStateLabel(state)}</small>
                    </button>
                  );
                })}
              </div>
            </section>
            ) : null}

            {activeSection === 'look' && cosmetics ? <HideoutLook cosmetics={cosmetics} busy={cosmeticBusy} onSave={(decorationKey, streetSignKey) => void saveCosmetics(decorationKey, streetSignKey)} /> : null}

            {activeSection === 'rooms' ? (
            <section id="hideout-upgrades" className="se-hideout-section">
              <SectionHeading
                eyebrow="Build"
                title="Room upgrades"
                copy="Spend cash and meet progression gates to shape this season's headquarters."
              />

              <div className="se-hideout-roomgrid">
                {hideout.rooms.map((room) => (
                  <RoomCard
                    key={room.key}
                    room={room}
                    cashCents={me.resources.cashCents}
                    blocked={action.busy
                      ? 'Your last upgrade is still going through.'
                      : loadError !== null
                        ? 'The hideout could not be loaded, so nothing can be built yet.'
                        : null}
                    specializing={specializationAction.busy}
                    onUpgrade={(next) => void upgrade(next)}
                    onSpecialize={(next, key) => void specialize(next, key)}
                    onBuildDone={buildDone}
                  />
                ))}
              </div>
            </section>
            ) : null}

            {activeSection === 'supplies' && !suppliesOnPage ? suppliesPanel : null}

            {activeSection === 'scavenging' && scavenging ? <ScavengingPanel page={scavenging} onChanged={setScavenging} /> : null}
            {activeSection === 'workshop' && workshop ? <WorkshopPanel workshop={workshop} onChanged={setWorkshop} /> : null}
            {activeSection === 'generator' && hideout.generator ? <GeneratorPanel generator={hideout.generator} onChanged={(generator) => setHideout((current) => current ? { ...current, generator } : current)} /> : null}

            {activeSection === 'security' && hasSecurity ? (
              <section id="hideout-security" className="se-hideout-section">
                <SectionHeading
                  eyebrow="Protect"
                  title="Security & assets"
                  copy="See what is protected, what is exposed, and whether anything is moving against your home operation."
                />

                <div className="se-hideout-detailgrid">
                  {hideout.security ? (
                    <Panel
                      title="Lookouts & security"
                      aside={activeThreats > 0 ? `${formatNumber(activeThreats)} active` : 'Quiet'}
                      className="se-hideout-panel"
                    >
                      <div className="se-hideout-panelstats">
                        <Metric label="Home defense" value={`+${formatNumber(hideout.security.defenseBonusPercent)}%`} tone="good" />
                        <Metric label="Warning tier" value={securityTierLabel(hideout.security.reconWarningTier)} />
                        <Metric
                          label="History"
                          value={hideout.security.historyHours > 0 ? `${formatNumber(hideout.security.historyHours)}h` : 'None'}
                        />
                        <Metric
                          label="Threat heads-up"
                          value={hideout.security.convoyHeadsUpMinutes > 0
                            ? `~${hideout.security.convoyHeadsUpMinutes.toFixed(1)} min`
                            : 'None'}
                        />
                      </div>

                      {hideout.security.suspicious.length ? (
                        <div className="se-rows se-mt">
                          {hideout.security.suspicious.map((event, index) => (
                            <Row
                              key={`${event.kind}:${event.at}:${index}`}
                              label={event.title}
                              value={`${event.detail} · ${formatWhen(event.at)}`}
                              strong={event.urgent}
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="se-muted se-mt">
                          {hideout.security.reconWarningTier === 'NONE'
                            ? 'Build Lookouts to start hearing about suspicious activity.'
                            : 'Nothing suspicious is inside your current warning window.'}
                        </p>
                      )}

                      <div className="se-hideout-note">
                        Nearby-run awareness stays count-only. Names, cargo, escort strength, and route details still require normal recon or turf sightings.
                      </div>
                    </Panel>
                  ) : null}

                  {hideout.assetProtection ? (
                    <Panel title="Safe Room" aside="Raid protection" className="se-hideout-panel">
                      <div className="se-hideout-panelstats">
                        <Metric label="Cash protected" value={formatCents(hideout.assetProtection.protectedCashCents)} tone="good" />
                        <Metric label="Cash exposed" value={formatCents(hideout.assetProtection.exposedCashCents)} tone={hideout.assetProtection.exposedCashCents > 0 ? 'warn' : 'good'} />
                        <Metric
                          label="Product protected"
                          value={`${formatNumber(hideout.assetProtection.protectedProductUnits)} / ${formatNumber(hideout.assetProtection.protectedProductCapacity)}`}
                          tone="good"
                        />
                        <Metric label="Product exposed" value={formatNumber(hideout.assetProtection.exposedProductUnits)} tone={hideout.assetProtection.exposedProductUnits > 0 ? 'warn' : 'good'} />
                      </div>
                      {hideout.assetProtection.products.length ? (
                        <div className="se-rows se-mt">
                          {hideout.assetProtection.products.map((product) => (
                            <Row
                              key={product.key}
                              label={<ItemLabel itemKey={product.key}>{product.name}</ItemLabel>}
                              value={`${formatNumber(product.protected)} safe · ${formatNumber(product.exposed)} exposed`}
                              strong={product.exposed > 0}
                            />
                          ))}
                        </div>
                      ) : <p className="se-muted se-mt">No product is stored here right now.</p>}
                      <div className="se-hideout-note">
                        The Safe Room protects your highest-value product first. Anything above its capacity stays exposed.
                      </div>
                    </Panel>
                  ) : null}


                  {hideout.infirmary ? (
                    <Panel title="Infirmary" aside="Crew recovery" className="se-hideout-panel">
                      <div className="se-hideout-panelstats">
                        <Metric label="Fit thugs" value={formatNumber(hideout.infirmary.fitThugs)} />
                        <Metric label="Wounded" value={formatNumber(hideout.infirmary.woundedThugs)} tone={hideout.infirmary.woundedThugs > 0 ? 'warn' : 'good'} />
                        <Metric label="Medicine" art="MEDICINE" value={formatNumber(hideout.infirmary.medicine)} />
                        <Metric label="Treat now" value={formatNumber(hideout.infirmary.maxTreatableThugs)} tone="accent" />
                      </div>
                      <div className="se-rows se-mt">
                        <Row
                          label="Medicine efficiency"
                          value={hideout.infirmary.medicineEfficiencyPercent > 0
                            ? `${formatNumber(hideout.infirmary.medicineEfficiencyPercent)}%`
                            : 'Base'}
                        />
                        <Row
                          label="Medicine for all wounds"
                          value={formatNumber(hideout.infirmary.medicineNeededForAll)}
                        />
                        <Row
                          label="Next natural recovery"
                          value={hideout.infirmary.nextRecoveryAt
                            ? formatWhen(hideout.infirmary.nextRecoveryAt)
                            : 'No wounds queued'}
                        />
                      </div>
                      <div className="se-hideout-note">
                        Treatment remains on Combat so there is still one authoritative recovery action.
                      </div>
                    </Panel>
                  ) : null}
                </div>
              </section>
            ) : null}

            {activeSection === 'operations' && hasOperations ? (
              <section id="hideout-operations" className="se-hideout-section">
                <SectionHeading
                  eyebrow="Run"
                  title="Operations"
                  copy="Production, logistics, and the books—everything that keeps the headquarters moving."
                />

                <div className="se-hideout-detailgrid">
                  {hideout.workshop ? (
                    <Panel title="Workshop" aside="Production" className="se-hideout-panel">
                      <div className="se-hideout-panelstats">
                        <Metric label="Output bonus" value={`+${formatNumber(hideout.workshop.outputBonusPercent)}%`} tone="good" />
                        <Metric label="Ingredient efficiency" value={`${formatNumber(hideout.workshop.ingredientEfficiencyPercent)}%`} tone="good" />
                      </div>
                      <div className="se-rows se-mt">
                        {hideout.workshop.recipes.map((recipe) => (
                          <Row
                            key={recipe.key}
                            label={<ItemLabel itemKey={recipe.key}>{recipe.name}</ItemLabel>}
                            value={recipe.baseIngredientCentsPerUnit === recipe.effectiveIngredientCentsPerUnit
                              ? `${formatCents(recipe.baseIngredientCentsPerUnit)} / unit`
                              : `${formatCents(recipe.effectiveIngredientCentsPerUnit)} / unit · base ${formatCents(recipe.baseIngredientCentsPerUnit)}`}
                            strong={recipe.effectiveIngredientCentsPerUnit < recipe.baseIngredientCentsPerUnit}
                          />
                        ))}
                      </div>
                      <div className="se-hideout-note">
                        Output tops out at 15%; ingredient efficiency tops out at 8%. The Workshop improves every cookable product.
                      </div>
                    </Panel>
                  ) : null}


                  {hideout.ledger ? (
                    <Panel title="Back Office" aside="Ledger" className="se-hideout-panel se-hideout-panel--wide">
                      <div className="se-hideout-panelstats se-hideout-panelstats--ledger">
                        {hideout.ledger.windows.map((window) => (
                          <Metric
                            key={window.days}
                            label={window.days === 1 ? '24h net' : `${window.days}d net`}
                            value={formatCents(window.netCents)}
                            tone={window.netCents > 0 ? 'good' : window.netCents < 0 ? 'bad' : undefined}
                          />
                        ))}
                        <Metric
                          label="Audit history"
                          value={`${formatNumber(hideout.ledger.historyDays)}d`}
                          detail={`${formatNumber(hideout.ledger.rowLimit)} rows`}
                        />
                      </div>
                      {hideout.ledger.entries.length ? (
                        <div className="se-rows se-mt">
                          {hideout.ledger.entries.map((entry) => (
                            <Row
                              key={entry.id}
                              label={entry.label}
                              value={(
                                <span className="se-hideout-ledger__value">
                                  <span>{`${entry.amountCents >= 0 ? '+' : '−'}${formatCents(Math.abs(entry.amountCents))}`}</span>
                                  <span className="se-hideout-ledger__when">{formatWhen(entry.createdAt)}</span>
                                </span>
                              )}
                              strong={entry.category === 'INCOME'}
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="se-muted se-mt">No cash-moving activity is inside your current ledger window yet.</p>
                      )}
                      <div className="se-hideout-note">
                        Cash merely loaded into a run is not counted as spending. Rolling totals always show 24 hours, 7 days, and 30 days.
                      </div>
                    </Panel>
                  ) : null}
                </div>
              </section>
            ) : null}

            {activeSection === 'overview' ? (
            <footer className="se-hideout-season">
              <div>
                <span className="se-eyebrow">Season rules</span>
                <strong>Your build matters this round.</strong>
              </div>
              <p>
                Hideout upgrades are mechanical and seasonal. Level-3 specialization choices are permanent until the season ends;
                the final build is archived, then the next round starts with a clean headquarters.
              </p>
            </footer>
            ) : null}
          </>
        ) : null}
      </div>
    </GameLayout>
  );
}
import '../styles/hideout.css';
import '../styles/items.css';
import '../styles/street-sign-builder.css';
