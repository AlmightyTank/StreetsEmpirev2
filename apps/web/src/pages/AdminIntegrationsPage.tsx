import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { AdminDevBotsDto, AdminDiscordStatusDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Panel, Row } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { adminWhen } from '../utils/admin.js';
import { formatDuration } from '../utils/time.js';

type Pending = 'resync-everyone' | 'seed-bots' | 'remove-bots';

const pendingCopy: Record<Pending, { title: string; copy: string; needsReason: boolean }> = {
  'resync-everyone': {
    title: "Resync everyone's Discord roles",
    copy: 'The bot re-checks every member on its next pass (about a minute) instead of waiting for the scheduled sync.',
    needsReason: false,
  },
  'seed-bots': {
    title: 'Add or reset dev bots',
    copy: 'Adds the four local test bots to the current round, or resets them there: fresh starting resources, and their battles, intel and wounds in this round are deleted.',
    needsReason: false,
  },
  'remove-bots': {
    title: 'Remove every dev bot',
    copy: 'Deletes every seed-rival account on @streets.local, and with it their players in every round.',
    needsReason: true,
  },
};

function age(iso: string | null): string {
  if (!iso) return 'nothing waiting';
  return `oldest ${formatDuration(Math.max(0, Date.now() - Date.parse(iso)))} ago`;
}

function timing(iso: string | null): string {
  if (!iso) return 'not scheduled';
  const delta = Date.parse(iso) - Date.now();
  return delta <= 0 ? `due ${formatDuration(Math.abs(delta))} ago` : `in ${formatDuration(delta)}`;
}

function ago(iso: string): string {
  return `${formatDuration(Math.max(0, Date.now() - Date.parse(iso)))} ago`;
}

export function AdminIntegrationsPage() {
  const [discord, setDiscord] = useState<AdminDiscordStatusDto | null>(null);
  const [bots, setBots] = useState<AdminDevBotsDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const working = 'The last admin action is still going through.';

  const load = useCallback(async () => {
    try {
      const [discordStatus, botStatus] = await Promise.all([adminApi.discord(), adminApi.devBots()]);
      setDiscord(discordStatus);
      setBots(botStatus);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load integrations.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function choose(next: Pending) {
    setPending(next);
    setReason('');
    setError(null);
    setNotice(null);
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      if (pending === 'resync-everyone') {
        setDiscord(await adminApi.requestDiscordResync(reason.trim() ? { reason: reason.trim() } : {}));
        setNotice('Resync queued. The bot picks it up on its next pass.');
      } else if (pending === 'seed-bots') {
        const result = await adminApi.seedDevBots();
        setBots(result);
        setNotice(`Dev bots are ready in ${result.currentRound?.name ?? 'the current round'}.`);
      } else {
        setBots(await adminApi.removeDevBots(reason.trim()));
        setNotice('Dev bots removed.');
      }
      setPending(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That did not go through. Refresh before trying again.');
    } finally {
      setBusy(false);
    }
  }

  const needsReason = pending ? pendingCopy[pending].needsReason : false;

  return (
    <GameLayout>
      <div className="se-pagehead se-admin-pagehead">
        <div>
          <h1 className="se-title">Integrations</h1>
          <p className="se-eyebrow">Admin · Discord bot and local dev bots</p>
        </div>
      </div>

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <p className="se-admin-notice" role="status">{notice}</p> : null}

      {pending ? (
        <Panel title={pendingCopy[pending].title} className="se-mb">
          <form onSubmit={confirm} noValidate>
            <p>{pendingCopy[pending].copy}</p>
            <div className="se-field">
              <label className="se-label" htmlFor="admin-integrations-reason">Reason{needsReason ? '' : ' (optional)'}</label>
              <textarea id="admin-integrations-reason" className="se-input se-admin-reason" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
              <p className="se-hint">Saved to the audit log.{needsReason ? ' At least 5 characters.' : ''}</p>
            </div>
            <div className="se-cta se-mt">
              <Button className="se-btn se-btn--primary"
                disabledReason={busy ? working
                  : needsReason && reason.trim().length < 5 ? 'This action needs a reason of at least 5 characters for the audit log.'
                    : !needsReason && reason.trim().length > 0 && reason.trim().length < 5 ? 'Either leave the note empty or write at least 5 characters.'
                      : null}>
                {busy ? 'Working...' : 'Confirm'}
              </Button>
              <Button type="button" className="se-btn se-btn--ghost" onClick={() => setPending(null)} disabledReason={busy ? working : null}>Cancel</Button>
            </div>
          </form>
        </Panel>
      ) : null}

      <div className="se-grid se-grid--2">
        <Panel title="Discord bot" aside={discord ? (discord.botApiEnabled ? 'Bot API on' : 'Bot API off') : undefined} flush>
          {!discord ? (
            <p className="se-muted se-admin-pad">Loading Discord status...</p>
          ) : (
            <>
              <div className="se-rows">
                <Row label="Linked accounts" value={formatNumber(discord.linkedAccounts)} />
                <Row label="News posts waiting" value={`${formatNumber(discord.queues.news.pending)} · ${age(discord.queues.news.oldestAt)}`} />
                <Row label="Raid feed waiting" value={`${formatNumber(discord.queues.battles.pending)} · ${age(discord.queues.battles.oldestAt)}`} />
                <Row label="Alert DMs waiting" value={`${formatNumber(discord.queues.dms.pending)} · ${age(discord.queues.dms.oldestAt)}`} />
                <Row label="Round endings waiting" value={formatNumber(discord.queues.roundEndings)} />
                <Row label="Resyncs waiting" value={formatNumber(discord.queues.resyncs)} />
              </div>
              <div className="se-admin-pad">
                <p className="se-hint">
                  The server nudges the bot, and polling is the fallback. If an oldest item keeps getting older, the bot is not clearing the queue.
                  {discord.botApiEnabled ? '' : ' Set DISCORD_BOT_API_TOKEN on the server and the bot to turn it on.'}
                </p>
                <Button type="button" className="se-btn se-btn--sm se-mt" onClick={() => choose('resync-everyone')}
                  disabledReason={busy ? working : !discord.botApiEnabled ? 'The bot API is off. Set DISCORD_BOT_API_TOKEN on the server and the bot.' : null}>
                  Resync everyone's roles
                </Button>
                <p className="se-hint se-mt">To resync one player, use the button on their account page.</p>
              </div>
              {discord.recentResyncs.length ? (
                <ol className="se-admin-audit">
                  {discord.recentResyncs.map((row) => (
                    <li className="se-admin-audit__entry" key={row.id}>
                      <div className="se-admin-audit__head">
                        <strong>{row.everyone ? 'Everyone' : 'One member'}</strong>
                        <span className="se-muted">{adminWhen(row.createdAt)}</span>
                      </div>
                      <p>By {row.requestedByUsername} · {row.claimedAt ? `picked up ${adminWhen(row.claimedAt)}` : 'waiting for the bot'}</p>
                    </li>
                  ))}
                </ol>
              ) : null}
            </>
          )}
        </Panel>

        <Panel title="Dev bots" aside={bots?.currentRound ? bots.currentRound.name : undefined} flush>
          {!bots ? (
            <p className="se-muted se-admin-pad">Loading dev bots...</p>
          ) : (
            <>
              <div className="se-admin-pad">
                {bots.blockedReason ? (
                  <p className="se-hint">{bots.blockedReason} Use the CLI against an isolated database if you really need them.</p>
                ) : (
                  <>
                    <p className="se-hint">Local raid targets for testing cash raids, drive-bys, drug runs, ride theft and lures.</p>
                    <div className="se-admin-moderation se-mt">
                      <Button type="button" className="se-btn se-btn--sm" onClick={() => choose('seed-bots')}
                        disabledReason={busy ? working : !bots.currentRound ? 'There is no open round for bots to join.' : null}>
                        {bots.bots.some((bot) => bot.inCurrentRound) ? 'Reset bots in this round' : 'Add bots to this round'}
                      </Button>
                      <Button type="button" className="se-btn se-btn--sm se-btn--ghost" onClick={() => choose('remove-bots')}
                        disabledReason={busy ? working : bots.bots.length === 0 ? 'There are no dev bots on this server.' : null}>
                        Remove every bot
                      </Button>
                    </div>
                    {!bots.currentRound ? <p className="se-hint se-mt">There is no current round to add them to.</p> : null}
                  </>
                )}
                <div className="se-rows se-mt">
                  <Row label="NPC gangs active" value={formatNumber(bots.npcGangSummary.active)} />
                  <Row label="Ready to move" value={formatNumber(bots.npcGangSummary.dueNow)} strong={bots.npcGangSummary.dueNow > 0} />
                  <Row label="Moved in 24h" value={formatNumber(bots.npcGangSummary.acted24h)} />
                  <Row label="Blocked in 24h" value={formatNumber(bots.npcGangSummary.blocked24h)} strong={bots.npcGangSummary.blocked24h > 0} />
                  <Row label="Open grudges" value={formatNumber(bots.npcGangSummary.openGrudges)} strong={bots.npcGangSummary.openGrudges > 0} />
                  <Row label="Paybacks in 24h" value={formatNumber(bots.npcGangSummary.revenge24h)} />
                  <Row label="Blocks held" value={formatNumber(bots.npcGangSummary.heldBlocks)} />
                  <Row label="Packing or moving" value={formatNumber(bots.npcGangSummary.migrating)} strong={bots.npcGangSummary.migrating > 0} />
                  <Row label="On a run · gone to ground" value={`${formatNumber(bots.npcGangSummary.hot)} · ${formatNumber(bots.npcGangSummary.dormant)}`} strong={bots.npcGangSummary.hot > 0} />
                </div>
                {bots.npcGangSummary.cities.length ? (
                  <ol className="se-admin-list">
                    {bots.npcGangSummary.cities.map((city) => (
                      <li key={city.city}>
                        <div className="se-admin-check__head">
                          <strong>{city.city}</strong>
                          <span className="se-muted">{timing(city.nextActionAt)}</span>
                        </div>
                        <p className="se-hint">
                          {formatNumber(city.activeGangs)} crew{city.activeGangs === 1 ? '' : 's'} · {formatNumber(city.dueNow)} ready · {formatNumber(city.recentHits)} hit{city.recentHits === 1 ? '' : 's'} in 24h
                          {city.recentDriveBys || city.recentSpecialRaids ? ` · ${formatNumber(city.recentDriveBys)} drive-by · ${formatNumber(city.recentSpecialRaids)} special` : ''}
                          {city.recentRevengeHits ? ` · ${formatNumber(city.recentRevengeHits)} payback` : ''}
                          {city.heldBlocks.length ? ` · holding ${city.heldBlocks.join(', ')}` : ''}
                          {city.inbound ? ` · ${formatNumber(city.inbound)} inbound` : ''}
                        </p>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </div>
              {bots.bots.length === 0 ? (
                <p className="se-muted se-admin-pad">No dev bots exist.</p>
              ) : (
                <div className="se-tablewrap">
                  <table className="se-table se-table--cards">
                    <thead>
                      <tr>
                        <th>Bot</th>
                        <th>This round</th>
                        <th>NPC gang</th>
                        <th className="se-table__number">Net worth</th>
                        <th className="se-table__number">Rounds</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bots.bots.map((bot) => (
                        <tr key={bot.accountId}>
                          <td className="se-td--title">
                            <Link to={`/game/admin/accounts/${bot.accountId}`}>{bot.username}</Link>
                            {bot.isActive ? null : <span className="se-tag se-tag--bad">Inactive</span>}
                          </td>
                          <td data-label="This round">
                            {bot.inCurrentRound
                              ? <Link to={`/game/admin/players/${bot.inCurrentRound.roundPlayerId}`}>{bot.inCurrentRound.displayName} #{bot.inCurrentRound.publicPimpId}</Link>
                              : <span className="se-muted">Not in it</span>}
                          </td>
                          <td data-label="NPC gang">
                            {bot.inCurrentRound?.npcGang ? (
                              <>
                                <strong>{bot.inCurrentRound.npcGang.tier}</strong>
                                <span className="se-muted"> · {bot.inCurrentRound.npcGang.archetype} · {bot.inCurrentRound.npcGang.currentCity}{bot.inCurrentRound.npcGang.currentCity !== bot.inCurrentRound.npcGang.homeCity ? ` (from ${bot.inCurrentRound.npcGang.homeCity})` : ''}</span>
                                <p className="se-hint">
                                  Next {timing(bot.inCurrentRound.npcGang.nextActionAt)}
                                  {bot.inCurrentRound.npcGang.lastOutcome ? ` · last ${bot.inCurrentRound.npcGang.lastOutcome.toLowerCase().replace(/_/g, ' ')}` : ''}
                                  {bot.inCurrentRound.npcGang.lastTarget ? ` vs ${bot.inCurrentRound.npcGang.lastTarget}` : ''}
                                </p>
                                {bot.inCurrentRound.npcGang.lastError ? <p className="se-hint">Blocked: {bot.inCurrentRound.npcGang.lastError}</p> : null}
                                {bot.inCurrentRound.npcGang.grudges.map((grudge) => (
                                  <p key={grudge.publicPimpId} className="se-hint">
                                    Grudge: {grudge.targetName} #{grudge.publicPimpId} · {formatNumber(grudge.hits)} hit{grudge.hits === 1 ? '' : 's'}
                                    {grudge.settledAt ? ` · paid back ${ago(grudge.settledAt)}` : ` · expires ${timing(grudge.expiresAt)}`}
                                  </p>
                                ))}
                                {bot.inCurrentRound.npcGang.turf?.held.map((block) => (
                                  <p key={block.districtName} className="se-hint">
                                    Holds {block.districtName} · {formatNumber(block.cornerThugs)}/{formatNumber(block.minimum)} on the corner
                                    {block.pushLandsAt ? ` · push lands ${timing(block.pushLandsAt)}` : ''}
                                  </p>
                                ))}
                                {bot.inCurrentRound.npcGang.turf?.prospect ? (
                                  <p className="se-hint">
                                    Working {bot.inCurrentRound.npcGang.turf.prospect.districtName} · presence {bot.inCurrentRound.npcGang.turf.prospect.presence}/{bot.inCurrentRound.npcGang.turf.prospect.needed} · {formatNumber(bot.inCurrentRound.npcGang.turf.prospect.locals)} locals
                                  </p>
                                ) : null}
                                {bot.inCurrentRound.npcGang.turf && (bot.inCurrentRound.npcGang.turf.recentLosses || bot.inCurrentRound.npcGang.turf.pressure) ? (
                                  <p className="se-hint">
                                    Turf strain: {formatNumber(bot.inCurrentRound.npcGang.turf.recentLosses)} lost fight{bot.inCurrentRound.npcGang.turf.recentLosses === 1 ? '' : 's'} · {formatNumber(bot.inCurrentRound.npcGang.turf.pressure)} crew{bot.inCurrentRound.npcGang.turf.pressure === 1 ? '' : 's'} working their block
                                  </p>
                                ) : null}
                                {bot.inCurrentRound.npcGang.turf?.lastMove ? (
                                  <p className="se-hint">
                                    Last turf move: {bot.inCurrentRound.npcGang.turf.lastMove.kind.toLowerCase()} {bot.inCurrentRound.npcGang.turf.lastMove.districtName} {ago(bot.inCurrentRound.npcGang.turf.lastMove.at)}
                                    {bot.inCurrentRound.npcGang.turf.lastMove.detail ? ` · ${bot.inCurrentRound.npcGang.turf.lastMove.detail}` : ''}
                                  </p>
                                ) : null}
                                <p className="se-hint">
                                  Mood {bot.inCurrentRound.npcGang.mood.toLowerCase()} · momentum {bot.inCurrentRound.npcGang.momentum > 0 ? '+' : ''}{bot.inCurrentRound.npcGang.momentum}
                                  {bot.inCurrentRound.npcGang.mood === 'DORMANT' && bot.inCurrentRound.npcGang.dormancy
                                    ? ` · ${bot.inCurrentRound.npcGang.dormancy.reason.toLowerCase().replace(/_/g, ' ')}, back ${timing(bot.inCurrentRound.npcGang.dormancy.until)}`
                                    : bot.inCurrentRound.npcGang.dormancy?.wokeAt ? ` · woke ${ago(bot.inCurrentRound.npcGang.dormancy.wokeAt)}` : ''}
                                </p>
                                {bot.inCurrentRound.npcGang.migration ? (
                                  <p className="se-hint">
                                    {bot.inCurrentRound.npcGang.migration.status === 'MOVING'
                                      ? `On the road to ${bot.inCurrentRound.npcGang.migration.toName}, arrives ${timing(bot.inCurrentRound.npcGang.migration.arrivesAt)}`
                                      : `Packing for ${bot.inCurrentRound.npcGang.migration.toName} since ${ago(bot.inCurrentRound.npcGang.migration.since)}`}
                                    {` · ${bot.inCurrentRound.npcGang.migration.reason.toLowerCase()}`}
                                  </p>
                                ) : bot.inCurrentRound.npcGang.lastMigration ? (
                                  <p className="se-hint">
                                    Moved {bot.inCurrentRound.npcGang.lastMigration.fromName} to {bot.inCurrentRound.npcGang.lastMigration.toName} {ago(bot.inCurrentRound.npcGang.lastMigration.at)} · {bot.inCurrentRound.npcGang.lastMigration.reason.toLowerCase()}
                                  </p>
                                ) : null}
                                {bot.inCurrentRound.npcGang.lastRevenge ? (
                                  <p className="se-hint">
                                    Last payback: {bot.inCurrentRound.npcGang.lastRevenge.targetName} {ago(bot.inCurrentRound.npcGang.lastRevenge.at)}
                                    {bot.inCurrentRound.npcGang.lastRevenge.won === null ? '' : bot.inCurrentRound.npcGang.lastRevenge.won ? ' · landed' : ' · held off'}
                                  </p>
                                ) : null}
                              </>
                            ) : (
                              <span className="se-muted">Missing</span>
                            )}
                          </td>
                          <td className="se-table__number se-num" data-label="Net worth">{bot.inCurrentRound ? formatCents(bot.inCurrentRound.netWorthCents) : '-'}</td>
                          <td className="se-table__number se-num" data-label="Rounds">{formatNumber(bot.roundsPlayed)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </Panel>
      </div>
    </GameLayout>
  );
}
