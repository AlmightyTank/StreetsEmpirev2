import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ADMIN_GRANT_CAPS, ADMIN_PRODUCT_GRANT_CAP, type AdminGrantItem, type AdminPlayerDto, type AdminQuestContentDto, type AdminVoidBattleResultDto, type BattleReportDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Field } from '../components/Field.js';
import { Panel, Row, Stat } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { adminWhen } from '../utils/admin.js';

const yesNo = (value: boolean) => (value ? 'Yes' : 'No');

const GRANT_FIELDS: Array<{ item: AdminGrantItem; label: string }> = [
  { item: 'cashCents', label: 'Cash ($)' },
  { item: 'whores', label: 'Whores' },
  { item: 'thugs', label: 'Thugs' },
  { item: 'condoms', label: 'Condoms' },
  { item: 'medicine', label: 'Medicine' },
  { item: 'crack', label: 'Crack' },
  { item: 'beer', label: 'Beer' },
  { item: 'pistols', label: 'Pistols' },
  { item: 'shotguns', label: 'Shotguns' },
  { item: 'tek9s', label: 'Tek-9s' },
  { item: 'ak47s', label: 'AK-47s' },
  { item: 'lowRiders', label: 'Low-Riders' },
];

function describeChanges(changes: Record<string, number>): string {
  const entries = Object.entries(changes);
  if (!entries.length) return 'nothing';
  return entries.map(([field, value]) => `${value > 0 ? '+' : ''}${field === 'cashCents' ? formatCents(value) : formatNumber(value)} ${field === 'cashCents' ? 'cash' : field}`).join(', ');
}

export function AdminPlayerPage() {
  const { roundPlayerId = '' } = useParams();
  const [player, setPlayer] = useState<AdminPlayerDto | null>(null);
  const [reports, setReports] = useState<BattleReportDto[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const working = 'The last admin action is still going through.';

  const [voiding, setVoiding] = useState<BattleReportDto | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidResult, setVoidResult] = useState<AdminVoidBattleResultDto | null>(null);

  const [grant, setGrant] = useState<Record<string, string>>({});
  const [grantReason, setGrantReason] = useState('');
  const [grantFields, setGrantFields] = useState<Record<string, string>>({});

  const [questContent, setQuestContent] = useState<AdminQuestContentDto | null>(null);
  const [supportReason, setSupportReason] = useState('');
  const [supportQuestKey, setSupportQuestKey] = useState('');
  const [supportFavorKey, setSupportFavorKey] = useState('');
  const [supportFavorDelta, setSupportFavorDelta] = useState('');

  const load = useCallback(async () => {
    try {
      const inspected = await adminApi.player(roundPlayerId);
      const [battles, content] = await Promise.all([
        adminApi.playerBattles(roundPlayerId),
        adminApi.questContent(inspected.round.id),
      ]);
      setPlayer(inspected);
      setQuestContent(content);
      setSupportQuestKey((current) => current || content.quests.find((quest) => quest.isEnabled)?.key || '');
      setSupportFavorKey((current) => current || content.favors.find((favor) => favor.isEnabled)?.key || '');
      setReports(battles.reports);
      setNextBefore(battles.nextBefore);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load that player.');
    }
  }, [roundPlayerId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadOlder() {
    if (!nextBefore) return;
    setLoadingMore(true);
    try {
      const page = await adminApi.playerBattles(roundPlayerId, nextBefore);
      setReports((current) => [...current, ...page.reports]);
      setNextBefore(page.nextBefore);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load older battle reports.');
    } finally {
      setLoadingMore(false);
    }
  }

  async function confirmVoid(event: FormEvent) {
    event.preventDefault();
    if (!voiding) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await adminApi.voidBattle(voiding.id, voidReason.trim());
      setVoidResult(result);
      setVoiding(null);
      setNotice('Battle voided. Both players were updated and told in their activity feed.');
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That void did not go through. Refresh before trying again.');
    } finally {
      setBusy(false);
    }
  }

  async function submitGrant(event: FormEvent) {
    event.preventDefault();
    setGrantFields({});
    setError(null);
    setNotice(null);
    const input: Record<string, number> = {};
    const products: Record<string, number> = {};
    for (const [key, raw] of Object.entries(grant)) {
      if (!raw.trim()) continue;
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0) {
        setGrantFields({ [key]: 'Enter a whole number of zero or more.' });
        return;
      }
      if (key.startsWith('product:')) products[key.slice('product:'.length)] = Math.floor(value);
      else input[key] = key === 'cashCents' ? Math.round(value * 100) : Math.floor(value);
    }
    setBusy(true);
    try {
      const updated = await adminApi.grantToPlayer(roundPlayerId, { reason: grantReason.trim(), ...input, ...(Object.keys(products).length ? { products } : {}) });
      setPlayer(updated);
      setGrant({});
      setGrantReason('');
      setNotice('Grant applied and added to the player\'s activity feed.');
    } catch (caught) {
      if (caught instanceof ApiError) {
        setGrantFields(caught.fields ?? {});
        setError(caught.message);
      } else {
        setError('That grant did not go through. Refresh before trying again.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function refreshSupport(updated: AdminPlayerDto, message: string) {
    setPlayer(updated);
    setNotice(message);
    try {
      setQuestContent(await adminApi.questContent(updated.round.id));
    } catch {
      // The player correction succeeded; a catalog refresh failure should not
      // turn that successful write into a misleading error.
    }
  }

  async function grantQuestSupport() {
    if (!supportQuestKey) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await adminApi.grantQuest(roundPlayerId, supportQuestKey, supportReason.trim());
      await refreshSupport(updated, 'Quest granted. The change is in the admin audit log.');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That quest grant did not go through.');
    } finally {
      setBusy(false);
    }
  }

  async function changeQuestSupport(playerQuestId: string, action: 'reset' | 'complete') {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = action === 'reset'
        ? await adminApi.resetQuest(roundPlayerId, playerQuestId, supportReason.trim())
        : await adminApi.completeQuest(roundPlayerId, playerQuestId, supportReason.trim());
      await refreshSupport(
        updated,
        action === 'reset'
          ? 'Quest reset to available. Progress receipts were cleared and the change was audited.'
          : 'Quest marked ready to turn in. The player still claims it through the normal reward path.',
      );
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That quest support action did not go through.');
    } finally {
      setBusy(false);
    }
  }

  async function adjustFavorSupport() {
    const delta = Number(supportFavorDelta);
    if (!Number.isInteger(delta) || delta === 0 || !supportFavorKey) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await adminApi.adjustFavor(roundPlayerId, supportFavorKey, delta, supportReason.trim());
      setSupportFavorDelta('');
      await refreshSupport(
        updated,
        delta > 0 ? 'Favor inventory granted and audited.' : 'Favor inventory removed and audited.',
      );
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That favor adjustment did not go through.');
    } finally {
      setBusy(false);
    }
  }

  if (!player) {
    return (
      <GameLayout>
        {error ? <Alert>{error}</Alert> : <p className="se-muted">Loading player...</p>}
      </GameLayout>
    );
  }

  const timers = player.timers;
  const grantEmpty = !Object.values(grant).some((value) => value.trim() && Number(value) > 0);
  const supportReasonReady = supportReason.trim().length >= 5;
  const supportDelta = Number(supportFavorDelta);
  const supportDeltaReady = Number.isInteger(supportDelta) && supportDelta !== 0 && Math.abs(supportDelta) <= 1000;

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">{player.displayName} <span className="se-muted">#{player.publicPimpId}</span></h1>
          <p className="se-eyebrow">
            {player.round.name} · {player.round.status} · {player.city} ·{' '}
            <Link to={`/game/admin/accounts/${player.account.id}`}>{player.account.username}{player.account.isActive ? '' : ' (deactivated)'}</Link>
          </p>
        </div>
      </div>

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <p className="se-admin-notice" role="status">{notice}</p> : null}
      <p className="se-hint se-mb">Opening this page never settles the player, so turns show what was stored at their last settlement.</p>

      <div className="se-stats se-mb">
        <Stat label="Net worth" value={formatCents(player.netWorthCents)} />
        <Stat label="Cash" value={formatCents(player.cashCents)} />
        <Stat label="Turns" value={`${formatNumber(player.turns)} / ${formatNumber(player.turnCap)}`} sub={`as of ${adminWhen(player.lastTurnCalculationAt)}`} />
        <Stat label="National rank" value={player.ranks.national ? `#${player.ranks.national}` : '-'} sub={player.ranks.local ? `Local #${player.ranks.local}` : undefined} />
      </div>

      {voiding ? (
        <Panel title={`Void: ${voiding.raidForm?.title ?? voiding.kind ?? 'Raid'} vs ${voiding.opponent.displayName}`} className="se-mb">
          <form onSubmit={confirmVoid} noValidate>
            <p>
              Reverses what this battle moved, limited to what the side that gained it still has, takes back its wounds that are still healing,
              and refunds the attacker's turns up to the cap. Protection and cooldown timers stay as they are. The battle stays visible, marked voided,
              and stops counting for revenge, trophies and repeat-target limits. Both players see it in their activity feed. This cannot be undone.
            </p>
            <div className="se-field">
              <label className="se-label" htmlFor="admin-void-reason">Reason</label>
              <textarea id="admin-void-reason" className="se-input se-admin-reason" maxLength={500} value={voidReason} onChange={(event) => setVoidReason(event.target.value)} />
              <p className="se-hint">Shown to both players and saved to the audit log. At least 5 characters.</p>
            </div>
            <div className="se-cta se-mt">
              <Button className="se-btn se-btn--primary"
                disabledReason={busy ? working : voidReason.trim().length < 5 ? 'Both players see this reason, so write at least 5 characters.' : null}>{busy ? 'Voiding...' : 'Confirm void'}</Button>
              <Button type="button" className="se-btn se-btn--ghost" onClick={() => setVoiding(null)} disabledReason={busy ? working : null}>Cancel</Button>
            </div>
          </form>
        </Panel>
      ) : null}

      {voidResult ? (
        <Panel title="Void result" className="se-mb">
          {[voidResult.attacker, voidResult.defender].map((side, index) => (
            <div key={side.roundPlayerId} className={index ? 'se-mt' : undefined}>
              <p><strong>{index ? 'Defender' : 'Attacker'} {side.displayName}:</strong> {describeChanges(side.changes)}</p>
              {Object.keys(side.shortfall).length ? <p className="se-hint">Could not take back: {describeChanges(side.shortfall)} (already spent or gone).</p> : null}
            </div>
          ))}
        </Panel>
      ) : null}

      <div className="se-grid se-grid--2 se-mb">
        <Panel title="Crew and weapons" flush>
          <div className="se-rows">
            <Row label="Whores" value={formatNumber(player.crew.whores)} />
            <Row label="Thugs" value={`${formatNumber(player.crew.thugs)} (${formatNumber(player.crew.woundedThugs)} wounded)`} />
            <Row label="Low-Riders" value={formatNumber(player.crew.lowRiders)} />
            <Row label="Pistols" value={formatNumber(player.weapons.pistols)} />
            <Row label="Shotguns" value={formatNumber(player.weapons.shotguns)} />
            <Row label="Tek-9s" value={formatNumber(player.weapons.tek9s)} />
            <Row label="AK-47s" value={formatNumber(player.weapons.ak47s)} />
          </div>
        </Panel>

        <Panel title="Supplies and state" flush>
          <div className="se-rows">
            <Row label="Condoms" value={formatNumber(player.supplies.condoms)} />
            <Row label="Medicine" value={formatNumber(player.supplies.medicine)} />
            {player.products.length
              ? player.products.map((product) => <Row key={product.key} label={product.name} value={`${formatNumber(product.quantity)}${product.valueCents !== undefined ? ` · ${formatCents(product.valueCents)}` : ''}`} />)
              : <Row label="Product" value={formatNumber(player.supplies.crack)} />}
            <Row label="Beer" value={formatNumber(player.supplies.beer)} />
            <Row label="Happiness" value={`Whores ${player.happiness.whores}% · Thugs ${player.happiness.thugs}%`} />
            {player.heat !== null ? <Row label="Heat" value={formatNumber(player.heat)} /> : null}
            <Row label="Payout" value={`${player.payoutPercent}%`} />
            <Row label="Last active" value={adminWhen(player.lastActiveAt)} />
          </div>
        </Panel>

        <Panel title="Raid timers" flush>
          <div className="se-rows">
            <Row label="Raid protected until" value={adminWhen(timers.raidProtectedUntil)} />
            <Row label="Raid cooldown until" value={adminWhen(timers.raidCooldownUntil)} />
            <Row label="Last raided" value={adminWhen(timers.lastRaidedAt)} />
            <Row label="Drive-by protected until" value={adminWhen(timers.driveByProtectedUntil)} />
            <Row label="Drive-by cooldown until" value={adminWhen(timers.driveByCooldownUntil)} />
            <Row label="Last driven by" value={adminWhen(timers.lastDrivenByAt)} />
            <Row label="Intel" value={`Watching ${player.intel.observing} · watched by ${player.intel.observedBy}`} />
          </div>
        </Panel>

        <Panel title="Progress" flush>
          <div className="se-rows">
            <Row label="Weapon unlocks" value={`Shotgun ${yesNo(player.unlocks.shotgun)} · Tek-9 ${yesNo(player.unlocks.tek9)} · AK ${yesNo(player.unlocks.ak47)}`} />
            {player.unlocks.permanent.length ? player.unlocks.permanent.map((unlock) => (
              <Row key={unlock.key} label={`Unlock: ${unlock.key}`} value={`${unlock.sourceQuestKey ?? 'system'} · ${adminWhen(unlock.awardedAt)}`} />
            )) : <Row label="Permanent unlocks" value="-" />}
            {player.favors.length ? player.favors.map((favor) => (
              <Row
                key={favor.key}
                label={`Favor: ${favor.key}`}
                value={`×${formatNumber(favor.quantity)} · granted ${formatNumber(favor.totalGranted)} · ${favor.lastSourceQuestKey ?? 'system'}`}
              />
            )) : <Row label="Favor inventory" value="-" />}
            {player.activeFavors.length ? player.activeFavors.map((favor) => (
              <Row
                key={favor.category}
                label={`Active favor: ${favor.category}`}
                value={`${favor.favorKey} · until ${adminWhen(favor.expiresAt)}`}
              />
            )) : <Row label="Active favors" value="-" />}
            {player.armedFavors.length ? player.armedFavors.map((favor) => (
              <Row
                key={favor.category}
                label={`Armed favor: ${favor.category}`}
                value={`${favor.favorKey} · armed ${adminWhen(favor.armedAt)}`}
              />
            )) : <Row label="Armed favors" value="-" />}
            <Row label="Hideout" value={`Safe ${player.hideout.safeRoom} · Lookouts ${player.hideout.lookouts} · Workshop ${player.hideout.workshop} · Office ${player.hideout.backOffice}`} />
            {player.reputation.length ? player.reputation.map((row) => (
              <Row key={row.trader} label={`Rep: ${row.trader}`} value={`${formatNumber(row.points)}${row.legacyFavorDone ? ' · legacy favor' : ''}`} />
            )) : <Row label="Reputation" value="-" />}
          </div>
        </Panel>
      </div>

      <Panel
        title="Quest and favor support"
        aside={<Link to="/game/admin/quests">Content controls</Link>}
        className="se-mb"
      >
        {!player.live ? (
          <p className="se-hint">This round has finished, so quest and favor corrections are frozen.</p>
        ) : (
          <>
            <div className="se-field">
              <label className="se-label" htmlFor="admin-support-reason">Support reason</label>
              <textarea
                id="admin-support-reason"
                className="se-input se-admin-reason"
                rows={3}
                maxLength={500}
                value={supportReason}
                onChange={(event) => setSupportReason(event.target.value)}
              />
              <p className="se-hint">Required for every action below and saved to the admin audit log. At least 5 characters.</p>
            </div>

            <div className="se-grid se-grid--2 se-mb">
              <div>
                <label className="se-label" htmlFor="admin-support-quest">Grant quest</label>
                <select
                  id="admin-support-quest"
                  className="se-input"
                  value={supportQuestKey}
                  onChange={(event) => setSupportQuestKey(event.target.value)}
                >
                  <option value="">Choose a quest</option>
                  {(questContent?.quests ?? []).filter((quest) => quest.isEnabled).map((quest) => (
                    <option key={quest.key} value={quest.key}>{quest.title} · {quest.key}</option>
                  ))}
                </select>
                <p className="se-hint">Shared alliance/event and generated city contracts stay on their authoritative boards.</p>
                <Button
                  type="button"
                  className="se-btn se-btn--primary se-mt"
                  onClick={() => void grantQuestSupport()}
                  disabledReason={busy ? working : !supportReasonReady ? 'Write a support reason of at least 5 characters.' : !supportQuestKey ? 'Choose a quest.' : null}
                >
                  Grant quest
                </Button>
              </div>

              <div>
                <label className="se-label" htmlFor="admin-support-favor">Adjust favor inventory</label>
                <select
                  id="admin-support-favor"
                  className="se-input"
                  value={supportFavorKey}
                  onChange={(event) => setSupportFavorKey(event.target.value)}
                >
                  <option value="">Choose a favor</option>
                  {(questContent?.favors ?? []).map((favor) => (
                    <option key={favor.key} value={favor.key}>
                      {favor.name} · {favor.key}{favor.isEnabled ? '' : ' · disabled'}
                    </option>
                  ))}
                </select>
                <Field
                  id="admin-support-favor-delta"
                  label="Inventory change"
                  type="number"
                  min={-1000}
                  max={1000}
                  step={1}
                  value={supportFavorDelta}
                  onChange={(event) => setSupportFavorDelta(event.target.value)}
                  hint="Positive grants; negative removes. Active and armed favors are not altered."
                />
                <Button
                  type="button"
                  className="se-btn se-btn--primary"
                  onClick={() => void adjustFavorSupport()}
                  disabledReason={busy ? working : !supportReasonReady ? 'Write a support reason of at least 5 characters.' : !supportFavorKey ? 'Choose a favor.' : !supportDeltaReady ? 'Use a whole number from -1000 to 1000, excluding zero.' : null}
                >
                  Apply favor change
                </Button>
              </div>
            </div>

            <div className="se-tablewrap">
              <table className="se-table se-table--cards">
                <thead>
                  <tr>
                    <th>Quest attempt</th>
                    <th>Status</th>
                    <th>Progress</th>
                    <th>Updated</th>
                    <th className="se-table__number">Support actions</th>
                  </tr>
                </thead>
                <tbody>
                  {player.quests.length ? player.quests.map((quest) => {
                    const progressRows = Object.values(
                      quest.objectiveProgress && typeof quest.objectiveProgress === 'object' && !Array.isArray(quest.objectiveProgress)
                        ? quest.objectiveProgress as Record<string, { completed?: boolean }>
                        : {},
                    );
                    const completedObjectives = progressRows.filter((row) => row?.completed === true).length;
                    return (
                      <tr key={quest.id}>
                        <td className="se-td--title">
                          <strong>{quest.title}</strong>
                          <br />
                          <span className="se-muted">{quest.key} · attempt {quest.attempt}</span>
                        </td>
                        <td data-label="Status">
                          <span className={`se-tag ${quest.status === 'COMPLETED' ? 'se-tag--good' : quest.status === 'FAILED' || quest.status === 'EXPIRED' || !quest.isEnabled ? 'se-tag--bad' : 'se-tag--warn'}`}>
                            {quest.isEnabled ? quest.status : `DISABLED · ${quest.status}`}
                          </span>
                        </td>
                        <td data-label="Progress">{progressRows.length ? `${completedObjectives}/${progressRows.length} objectives` : '-'}</td>
                        <td data-label="Updated">{adminWhen(quest.updatedAt)}</td>
                        <td className="se-table__number" data-label="Support actions">
                          <div className="se-admin-actions">
                            <Button
                              type="button"
                              className="se-btn se-btn--sm se-btn--ghost"
                              onClick={() => void changeQuestSupport(quest.id, 'reset')}
                              disabledReason={busy ? working : !supportReasonReady ? 'Write a support reason first.' : quest.status === 'COMPLETED' ? 'Completed quests cannot be reset because their rewards already paid.' : !quest.isEnabled ? 'Enable this quest in Content controls first.' : null}
                            >
                              Reset
                            </Button>
                            <Button
                              type="button"
                              className="se-btn se-btn--sm"
                              onClick={() => void changeQuestSupport(quest.id, 'complete')}
                              disabledReason={busy ? working : !supportReasonReady ? 'Write a support reason first.' : quest.status === 'COMPLETED' ? 'This quest already paid out.' : !quest.isEnabled ? 'Enable this quest in Content controls first.' : quest.type === 'ALLIANCE' || quest.type === 'EVENT' ? 'Shared quest completion stays server-authoritative.' : null}
                            >
                              Mark ready
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={5} className="se-muted">No quest attempts have been materialized for this player yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>

      <Panel title="Compensation grant" aside={player.live ? `Turns up to ${formatNumber(player.turnCap)}` : 'Round finished'} className="se-mb">
        {!player.live ? (
          <p className="se-hint">This round has finished, so its standings are frozen and grants are refused.</p>
        ) : (
          <form onSubmit={submitGrant} noValidate>
            <div className="se-admin-filters">
              <Field
                id="admin-grant-turns"
                label="Turns"
                type="number"
                min={0}
                max={player.turnCap}
                value={grant.turns ?? ''}
                onChange={(event) => setGrant({ ...grant, turns: event.target.value })}
                error={grantFields.turns}
                hint={`Never past ${formatNumber(player.turnCap)}.`}
              />
              {GRANT_FIELDS.map(({ item, label }) => {
                const cap = ADMIN_GRANT_CAPS[item];
                return (
                  <Field
                    key={item}
                    id={`admin-grant-${item}`}
                    label={label}
                    type="number"
                    min={0}
                    step={item === 'cashCents' ? 0.01 : 1}
                    value={grant[item] ?? ''}
                    onChange={(event) => setGrant({ ...grant, [item]: event.target.value })}
                    error={grantFields[item]}
                    hint={`Up to ${item === 'cashCents' ? formatCents(cap) : formatNumber(cap)}`}
                  />
                );
              })}
              {player.products.filter((product) => product.key !== 'CRACK').map((product) => (
                <Field
                  key={product.key}
                  id={`admin-grant-product-${product.key}`}
                  label={product.name}
                  type="number"
                  min={0}
                  step={1}
                  value={grant[`product:${product.key}`] ?? ''}
                  onChange={(event) => setGrant({ ...grant, [`product:${product.key}`]: event.target.value })}
                  error={grantFields[`products.${product.key}`]}
                  hint={`Up to ${formatNumber(ADMIN_PRODUCT_GRANT_CAP)}`}
                />
              ))}
            </div>
            <div className="se-field">
              <label className="se-label" htmlFor="admin-grant-reason">Reason</label>
              <textarea id="admin-grant-reason" className="se-input se-admin-reason" maxLength={500} value={grantReason} onChange={(event) => setGrantReason(event.target.value)} />
              {grantFields.reason ? <p className="se-error">{grantFields.reason}</p> : <p className="se-hint">Shown in the player's activity feed and saved to the audit log. Weapons they have not unlocked are refused.</p>}
            </div>
            <Button className="se-btn se-btn--primary"
              disabledReason={busy ? working
                : grantEmpty ? 'Fill in at least one amount to send.'
                  : grantReason.trim().length < 5 ? 'The player sees this reason, so write at least 5 characters.'
                    : null}>{busy ? 'Granting...' : 'Grant'}</Button>
          </form>
        )}
      </Panel>

      {player.injuries.length ? (
        <Panel title="Wounds healing" flush className="se-mb">
          <div className="se-rows">
            {player.injuries.map((injury) => (
              <Row key={injury.id} label={`${formatNumber(injury.thugs)} thugs`} value={`recover ${adminWhen(injury.recoverAt)}`} />
            ))}
          </div>
        </Panel>
      ) : null}

      <Panel title="Battle reports" aside={`${formatNumber(reports.length)} loaded`} flush className="se-mb">
        {reports.length === 0 ? (
          <p className="se-muted se-admin-pad">No battles yet.</p>
        ) : (
          <>
            <div className="se-tablewrap">
              <table className="se-table se-table--cards">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Kind</th>
                    <th>Role</th>
                    <th>Result</th>
                    <th>Opponent</th>
                    <th className="se-table__number">Cash</th>
                    <th className="se-table__number">Wounds</th>
                    <th className="se-table__number">Turns</th>
                    <th className="se-table__number">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report) => (
                    <tr key={`${report.id}-${report.createdAt}`}>
                      <td className="se-td--title">{adminWhen(report.createdAt)}</td>
                      <td data-label="Kind">{report.raidForm?.title ?? report.kind ?? 'RAID'}</td>
                      <td data-label="Role">{report.role}</td>
                      <td data-label="Result">
                        <span className={`se-tag ${report.won ? 'se-tag--good' : 'se-tag--bad'}`}>{report.won ? 'Won' : 'Lost'}</span>
                        {report.voided ? <span className="se-tag se-tag--warn" title={`${report.voided.reason} (${report.voided.byUsername})`}>Voided</span> : null}
                      </td>
                      <td data-label="Opponent">{report.opponent.displayName} <span className="se-muted">#{report.opponent.publicPimpId}</span></td>
                      <td className="se-table__number se-num" data-label="Cash">{typeof report.cashChangeCents === 'number' ? formatCents(report.cashChangeCents) : '-'}</td>
                      <td className="se-table__number se-num" data-label="Wounds">{`${report.yourWounds ?? 0} / ${report.opponentWounds ?? 0}`}</td>
                      <td className="se-table__number se-num" data-label="Turns">{formatNumber(report.turnsSpent ?? 0)}</td>
                      <td className="se-table__number" data-label="Actions">
                        {report.voided || !player.live ? <span className="se-muted">-</span> : (
                          <Button type="button" className="se-btn se-btn--sm" onClick={() => { setVoiding(report); setVoidReason(''); setVoidResult(null); }} disabledReason={busy ? working : null}>
                            Void
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {nextBefore ? (
              <div className="se-admin-pad">
                <Button type="button" className="se-btn se-btn--sm se-btn--ghost" onClick={() => void loadOlder()} disabledReason={loadingMore ? 'Still loading the last page of reports.' : null}>
                  {loadingMore ? 'Loading...' : 'Load older reports'}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Panel>

      <Panel title="Activity" aside="Latest 50" flush>
        {player.activity.length === 0 ? (
          <p className="se-muted se-admin-pad">No activity recorded.</p>
        ) : (
          <ol className="se-admin-audit">
            {player.activity.map((entry) => (
              <li className="se-admin-audit__entry" key={entry.id}>
                <div className="se-admin-audit__head">
                  <strong>{entry.type}</strong>
                  <span className="se-muted">{adminWhen(entry.createdAt)}</span>
                </div>
                <pre className="se-admin-json se-admin-json--inline">{JSON.stringify(entry.payload)}</pre>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </GameLayout>
  );
}
