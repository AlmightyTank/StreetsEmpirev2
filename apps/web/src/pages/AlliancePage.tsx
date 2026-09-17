import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { AllianceDetailDto, AllianceEventDto, MyAllianceDto } from '@streets/shared';
import { ALLIANCE_NAME_MAX, ALLIANCE_PITCH_MAX, ALLIANCE_TAG_MAX, formatCents, formatNumber } from '@streets/shared';
import { allianceApi } from '../api/alliances.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { AllianceTag } from '../components/AllianceTag.js';
import { Button } from '../components/Button.js';
import { Field } from '../components/Field.js';
import { Panel, Row, Stat } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { formatDuration } from '../utils/time.js';

function until(iso: string): string {
  return formatDuration(Math.max(0, new Date(iso).getTime() - Date.now()));
}

function eventText(event: AllianceEventDto): string {
  const actor = event.actorName ?? 'Someone';
  switch (event.type) {
    case 'FOUNDED': return `${actor} founded the alliance.`;
    case 'INVITED': return `${actor} invited ${event.subjectName ?? 'a player'}.`;
    case 'JOINED': return `${actor} joined.`;
    case 'LEFT': return `${actor} left.`;
    case 'KICKED': return `${actor} kicked ${event.subjectName ?? 'a member'}.`;
    case 'LEADER': return `${actor} handed leadership to ${event.subjectName ?? 'a member'}.`;
    case 'RENAMED': return `${actor} renamed the alliance${event.detail ? `: ${event.detail}` : ''}.`;
    case 'DISBANDED': return `${actor} disbanded the alliance${event.detail ? `: ${event.detail}` : ''}.`;
  }
}

/** The member table, shared by your own alliance and the public page. */
export function AllianceMembers({ alliance, actions }: {
  alliance: AllianceDetailDto;
  actions?: (member: AllianceDetailDto['members'][number]) => ReactNode;
}) {
  return (
    <div className="se-tablewrap">
      <table className="se-table se-table--cards">
        <thead>
          <tr>
            <th>Member</th>
            <th className="se-table__number">Net Worth</th>
            <th className="se-table__number">National</th>
            {actions ? <th /> : <th>Joined</th>}
          </tr>
        </thead>
        <tbody>
          {alliance.members.map((member) => (
            <tr key={member.publicPimpId} className={member.isYou ? 'se-rank-you' : undefined}>
              <td className="se-td--title">
                <AllianceTag alliance={alliance} />
                <Link to={`/game/players/${member.publicPimpId}`} className="se-playerlink">
                  {member.displayName} <span className="se-muted se-num">(#{member.publicPimpId})</span>
                </Link>
                {member.isLeader ? <span className="se-tag se-tag--good">Leader</span> : null}
                {member.isYou ? <span className="se-you">YOU</span> : null}
              </td>
              <td className="se-table__number se-num" data-label="Net worth">{formatCents(member.netWorthCents)}</td>
              <td className="se-table__number se-num" data-label="National">#{formatNumber(member.nationalRank)}</td>
              {actions
                ? <td data-label="">{actions(member)}</td>
                : <td data-label="Joined">{new Date(member.joinedAt).toLocaleDateString()}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AllianceSummary({ alliance }: { alliance: AllianceDetailDto }) {
  return (
    <div className="se-stats se-mb">
      <Stat label="Alliance rank" value={`#${formatNumber(alliance.rank)}`} />
      <Stat label="Combined net worth" value={formatCents(alliance.combinedNetWorthCents)} />
      <Stat label="Members" value={`${formatNumber(alliance.memberCount)} / ${formatNumber(alliance.maxMembers)}`} meter={{ value: alliance.memberCount, max: alliance.maxMembers }} />
    </div>
  );
}

export function AlliancePage() {
  const [data, setData] = useState<MyAllianceDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [invitee, setInvitee] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pitch, setPitch] = useState('');

  useEffect(() => {
    allianceApi.mine().then(setData).catch((caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Could not load your alliance.');
    });
  }, []);

  async function run(action: () => Promise<MyAllianceDto>) {
    setBusy(true);
    setError(null);
    try {
      setData(await action());
      setConfirming(null);
      return true;
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That did not go through. Try again.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    await run(() => allianceApi.create({ name, tag }));
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    const id = Number(invitee.replace(/^#/, ''));
    if (!Number.isSafeInteger(id) || id < 1) {
      setError('Enter the pimp number of the player to invite, e.g. 1042.');
      return;
    }
    if (await run(() => allianceApi.invite(id))) setInvitee('');
  }

  const waiting = busy ? 'Your last change is still going through.' : null;
  const closed = data && !data.roundOpen ? 'This round is closed, so alliances can no longer change.' : null;
  const alliance = data?.alliance ?? null;

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">{alliance ? <>[{alliance.tag}] {alliance.name}</> : 'Alliance'}</h1>
          <p className="se-eyebrow">{alliance ? `Founded ${new Date(alliance.foundedAt).toLocaleDateString()}` : 'Run the streets with a crew'}</p>
        </div>
        <Link className="se-btn se-btn--ghost se-btn--sm" to="/game/alliances">Alliance rankings</Link>
      </div>

      {error ? <Alert>{error}</Alert> : null}
      {!data && !error ? <Panel title="Loading"><p className="se-muted">Asking around...</p></Panel> : null}

      {data && !data.enabled ? (
        <Panel title="No alliances this round">
          <p className="se-muted">This round is played solo. Alliances arrive with the 0.3.0-C ruleset.</p>
        </Panel>
      ) : null}

      {data?.enabled && data.rules && !alliance ? (
        <div className="se-grid se-grid--sidebar">
          <div className="se-grid">
            {data.incomingInvites.length ? (
              <Panel title="Invites" flush>
                <div className="se-rows">
                  {data.incomingInvites.map((offer) => (
                    <div key={offer.tag} className="se-row se-row--wrap">
                      <span className="se-row__label">
                        <Link to={`/game/alliances/${encodeURIComponent(offer.tag)}`} className="se-playerlink">[{offer.tag}] {offer.name}</Link>
                        <span className="se-muted"> · {formatNumber(offer.memberCount)}/{formatNumber(data.rules!.maxMembers)} · from {offer.invitedByName} · expires in {until(offer.expiresAt)}</span>
                      </span>
                      <span className="se-row__value se-inline-actions">
                        <Button type="button" className="se-btn se-btn--primary se-btn--sm"
                          disabledReason={waiting ?? closed ?? (data.cooldownUntil ? `You can join an alliance in ${until(data.cooldownUntil)}.` : null)}
                          onClick={() => void run(() => allianceApi.accept(offer.tag))}>Join</Button>
                        <Button type="button" className="se-btn se-btn--ghost se-btn--sm" disabledReason={waiting}
                          onClick={() => void run(() => allianceApi.decline(offer.tag))}>Decline</Button>
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>
            ) : null}

            <Panel title="Found an alliance">
              <form onSubmit={(event) => void create(event)}>
                <Field label="Name" value={name} maxLength={ALLIANCE_NAME_MAX} onChange={(event) => setName(event.target.value)} hint="3 to 32 letters, numbers and spaces." />
                <Field label="Tag" value={tag} maxLength={ALLIANCE_TAG_MAX} onChange={(event) => setTag(event.target.value.toUpperCase())} hint="2 to 5 letters or numbers, shown beside every member's name." />
                <Button type="submit" className="se-btn se-btn--primary se-btn--block"
                  disabledReason={waiting ?? closed ?? (data.cooldownUntil ? `You left ${data.formerAlliance ? `[${data.formerAlliance.tag}]` : 'an alliance'} recently. You can found one in ${until(data.cooldownUntil)}.` : null)
                    ?? (name.trim().length < 3 ? 'Give the alliance a name first.' : tag.trim().length < 2 ? 'Give the alliance a tag first.' : null)}>
                  Found alliance
                </Button>
              </form>
            </Panel>
          </div>

          <aside className="se-grid">
            <Panel title="How alliances work" flush>
              <div className="se-rows">
                <Row label="Members" value={`Up to ${formatNumber(data.rules.maxMembers)}`} />
                <Row label="Friendly fire" value="None" tooltip="No raid, drive-by, drug run, ride theft, lure run or recon can target an ally." />
                <Row label="Revenge" value="Shared" tooltip="A hit on any member opens payback against the attacker for every member." />
                <Row label="Leaving" value={`${formatNumber(data.rules.leaveCooldownHours)}h cooldown`} tooltip="After leaving or being kicked you cannot join another alliance, and you and your old crew cannot hit each other, until the cooldown passes." />
              </div>
            </Panel>
            {data.cooldownUntil ? (
              <Alert tone="info">
                You left {data.formerAlliance ? `[${data.formerAlliance.tag}] ${data.formerAlliance.name}` : 'an alliance'} recently.
                You can join or found one in {until(data.cooldownUntil)}, and until then you and your old crew cannot hit each other.
              </Alert>
            ) : null}
          </aside>
        </div>
      ) : null}

      {data?.enabled && alliance ? (
        <>
          <AllianceSummary alliance={alliance} />
          <div className="se-grid se-grid--sidebar">
            <div className="se-grid">
              <Panel title="Members" flush>
                <AllianceMembers alliance={alliance} actions={data.isLeader ? (member) => member.isYou ? null : (
                  <span className="se-inline-actions">
                    {confirming === `lead:${member.publicPimpId}` ? (
                      <Button type="button" className="se-btn se-btn--primary se-btn--sm" disabledReason={waiting ?? closed} onClick={() => void run(() => allianceApi.transfer(member.publicPimpId))}>Confirm lead</Button>
                    ) : (
                      <Button type="button" className="se-btn se-btn--ghost se-btn--sm" disabledReason={waiting ?? closed} onClick={() => setConfirming(`lead:${member.publicPimpId}`)}>Lead</Button>
                    )}
                    {confirming === `kick:${member.publicPimpId}` ? (
                      <Button type="button" className="se-btn se-btn--primary se-btn--sm" disabledReason={waiting ?? closed} onClick={() => void run(() => allianceApi.kick(member.publicPimpId))}>Confirm kick</Button>
                    ) : (
                      <Button type="button" className="se-btn se-btn--ghost se-btn--sm" disabledReason={waiting ?? closed} onClick={() => setConfirming(`kick:${member.publicPimpId}`)}>Kick</Button>
                    )}
                  </span>
                ) : undefined} />
              </Panel>

              <Panel title="Alliance history" flush>
                {data.events.length ? (
                  <div className="se-rows">
                    {data.events.map((event, index) => (
                      <Row key={`${event.createdAt}-${index}`} label={eventText(event)} value={<span className="se-muted">{new Date(event.createdAt).toLocaleString()}</span>} />
                    ))}
                  </div>
                ) : <p className="se-muted se-admin-pad">Nothing yet.</p>}
              </Panel>
            </div>

            <aside className="se-grid">
              {data.isLeader ? (
                <Panel title="Invite a player">
                  <form onSubmit={(event) => void invite(event)}>
                    <Field label="Pimp number" inputMode="numeric" value={invitee} onChange={(event) => setInvitee(event.target.value)} hint={`Invites last ${formatNumber(data.rules!.inviteExpiresHours)} hours. The alliance is capped at ${formatNumber(alliance.maxMembers)}.`} />
                    <Button type="submit" className="se-btn se-btn--primary se-btn--block"
                      disabledReason={waiting ?? closed ?? (alliance.memberCount >= alliance.maxMembers ? `${alliance.name} is full.` : invitee.trim() === '' ? 'Enter a pimp number first.' : null)}>
                      Send invite
                    </Button>
                  </form>
                  {data.outgoingInvites.length ? (
                    <div className="se-rows se-mt">
                      {data.outgoingInvites.map((offer) => (
                        <div key={offer.publicPimpId} className="se-row se-row--wrap">
                          <span className="se-row__label">{offer.displayName} <span className="se-muted se-num">(#{offer.publicPimpId}) · {until(offer.expiresAt)} left</span></span>
                          <span className="se-row__value">
                            <Button type="button" className="se-btn se-btn--ghost se-btn--sm" disabledReason={waiting} onClick={() => void run(() => allianceApi.revoke(offer.publicPimpId))}>Revoke</Button>
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </Panel>
              ) : null}

              {alliance.forumUrl || (data.isLeader && data.forum.enabled) ? (
                <Panel title="Forum recruitment">
                  {alliance.forumUrl ? (
                    <>
                      <p className="se-dim">Your recruitment thread is up. Players reply there with their pimp numbers.</p>
                      <a className="se-btn se-btn--ghost se-btn--block" href={alliance.forumUrl} target="_blank" rel="noreferrer">Open the thread</a>
                    </>
                  ) : (
                    <>
                      <p className="se-dim">Post one recruitment thread to the forum. It links back to this alliance, and it is renamed or locked if the alliance changes.</p>
                      <div className="se-field">
                        <label className="se-label" htmlFor="alliance-pitch">Pitch (optional)</label>
                        <textarea id="alliance-pitch" className="se-input se-admin-textarea" maxLength={ALLIANCE_PITCH_MAX} value={pitch} onChange={(event) => setPitch(event.target.value)} />
                        {data.forum.error ? <p className="se-error">Last try failed: {data.forum.error}</p> : <p className="se-hint">What you want and who you are looking for.</p>}
                      </div>
                      <Button type="button" className="se-btn se-btn--primary se-btn--block" disabledReason={waiting ?? closed}
                        onClick={() => void run(() => allianceApi.postForumThread(pitch))}>
                        Post recruitment thread
                      </Button>
                    </>
                  )}
                </Panel>
              ) : null}

              <Panel title="Rules" flush>
                <div className="se-rows">
                  <Row label="Friendly fire" value="None" />
                  <Row label="Revenge" value="Shared by every member" />
                  <Row label="Leaving" value={`${formatNumber(data.rules!.leaveCooldownHours)}h before joining again`} />
                </div>
              </Panel>

              <Panel title="Leave">
                <p className="se-dim">
                  {data.isLeader && alliance.memberCount > 1
                    ? 'Hand leadership to another member before you leave.'
                    : `Leaving starts a ${formatNumber(data.rules!.leaveCooldownHours)}-hour cooldown: no joining another alliance, and no hits between you and this crew.${alliance.memberCount === 1 ? ' You are the last member, so the alliance disbands.' : ''}`}
                </p>
                {confirming === 'leave' ? (
                  <Button type="button" className="se-btn se-btn--primary se-btn--block" disabledReason={waiting ?? closed} onClick={() => void run(() => allianceApi.leave())}>Confirm leaving</Button>
                ) : (
                  <Button type="button" className="se-btn se-btn--ghost se-btn--block"
                    disabledReason={waiting ?? closed ?? (data.isLeader && alliance.memberCount > 1 ? 'Hand leadership to another member first.' : null)}
                    onClick={() => setConfirming('leave')}>
                    Leave alliance
                  </Button>
                )}
              </Panel>
            </aside>
          </div>
        </>
      ) : null}
    </GameLayout>
  );
}
