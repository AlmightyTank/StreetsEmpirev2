import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { AllianceDetailDto, AllianceEventDto, MyAllianceDto } from '@streets/shared';
import { ALLIANCE_NAME_MAX, ALLIANCE_PITCH_MAX, ALLIANCE_TAG_MAX, formatCents, formatNumber } from '@streets/shared';
import { allianceApi } from '../api/alliances.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { AllianceTag } from '../components/AllianceTag.js';
import { AllianceWire } from '../components/AllianceWire.js';
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

function AllianceMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: 'accent' | 'good' | 'warn';
}) {
  return (
    <div className={`se-alliance-metric${tone ? ` se-alliance-metric--${tone}` : ''}`}>
      <span className="se-alliance-metric__label">{label}</span>
      <strong className="se-alliance-metric__value">{value}</strong>
      {detail ? <span className="se-alliance-metric__detail">{detail}</span> : null}
    </div>
  );
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
  const rules = data?.rules ?? null;
  const availableSeats = alliance ? Math.max(0, alliance.maxMembers - alliance.memberCount) : 0;

  return (
    <GameLayout>
      <div className="se-alliance">
        <header className="se-alliance-hero">
          <div className="se-alliance-hero__copy">
            <span className="se-eyebrow">{alliance ? 'Crew command' : 'Crew network'}</span>
            <h1>{alliance ? <>[{alliance.tag}] {alliance.name}</> : 'Alliance'}</h1>
            <p>
              {alliance
                ? 'Coordinate the crew, manage membership, recruit new blood, and keep the private wire moving.'
                : 'Join an existing crew or build one of your own for shared revenge, protected friendly-fire rules, and coordinated street control.'}
            </p>
          </div>

          <div className="se-alliance-hero__side">
            <Link className="se-btn se-btn--ghost se-btn--sm" to="/game/alliances">Alliance rankings</Link>
            <div className="se-alliance-hero__readout">
              <span>
                <small>Rank</small>
                <strong>{alliance ? `#${formatNumber(alliance.rank)}` : '—'}</strong>
              </span>
              <span>
                <small>Members</small>
                <strong>{alliance ? `${formatNumber(alliance.memberCount)} / ${formatNumber(alliance.maxMembers)}` : '—'}</strong>
              </span>
              <span>
                <small>Your role</small>
                <strong>{alliance ? (data?.isLeader ? 'Leader' : 'Member') : 'Free agent'}</strong>
              </span>
              <span>
                <small>Status</small>
                <strong>{data ? (data.roundOpen ? 'Open' : 'Round closed') : '—'}</strong>
              </span>
            </div>
          </div>
        </header>

        {error ? <Alert>{error}</Alert> : null}
        {!data && !error ? <div className="se-alliance-loading" role="status">Checking the crew network...</div> : null}

        {data && !data.enabled ? (
          <Panel title="No alliances this round" className="se-alliance-panel">
            <p className="se-muted">This round is played solo: its ruleset has no alliances.</p>
          </Panel>
        ) : null}

        {data?.enabled && rules && !alliance ? (
          <>
            <section className="se-alliance-section">
              <div className="se-alliance-sectionhead">
                <div>
                  <span className="se-eyebrow">Free agent desk</span>
                  <h2>Join or build a crew</h2>
                </div>
                <p>Invites take priority. If nothing fits, found a new alliance once any leave cooldown has cleared.</p>
              </div>

              <div className="se-alliance-freeagent">
                <div className="se-alliance-stack">
                  {data.incomingInvites.length ? (
                    <Panel title="Invites waiting" aside={`${formatNumber(data.incomingInvites.length)} open`} className="se-alliance-panel">
                      <div className="se-alliance-invites">
                        {data.incomingInvites.map((offer) => (
                          <article key={offer.tag} className="se-alliance-invite">
                            <div>
                              <Link to={`/game/alliances/${encodeURIComponent(offer.tag)}`} className="se-playerlink">
                                [{offer.tag}] {offer.name}
                              </Link>
                              <span>{formatNumber(offer.memberCount)} / {formatNumber(rules.maxMembers)} members · invited by {offer.invitedByName}</span>
                              <small>Expires in {until(offer.expiresAt)}</small>
                            </div>
                            <div className="se-inline-actions">
                              <Button
                                type="button"
                                className="se-btn se-btn--primary se-btn--sm"
                                disabledReason={waiting ?? closed ?? (data.cooldownUntil ? `You can join an alliance in ${until(data.cooldownUntil)}.` : null)}
                                onClick={() => void run(() => allianceApi.accept(offer.tag))}
                              >
                                Join
                              </Button>
                              <Button
                                type="button"
                                className="se-btn se-btn--ghost se-btn--sm"
                                disabledReason={waiting}
                                onClick={() => void run(() => allianceApi.decline(offer.tag))}
                              >
                                Decline
                              </Button>
                            </div>
                          </article>
                        ))}
                      </div>
                    </Panel>
                  ) : (
                    <Panel title="No invites waiting" className="se-alliance-panel">
                      <p className="se-muted">Nobody has sent you an alliance invite yet. You can still found your own crew below.</p>
                    </Panel>
                  )}

                  <Panel title="Found an alliance" aside="Create a new crew" className="se-alliance-panel">
                    <form onSubmit={(event) => void create(event)} className="se-alliance-form">
                      <Field
                        label="Name"
                        value={name}
                        maxLength={ALLIANCE_NAME_MAX}
                        onChange={(event) => setName(event.target.value)}
                        hint="3 to 32 letters, numbers and spaces."
                      />
                      <Field
                        label="Tag"
                        value={tag}
                        maxLength={ALLIANCE_TAG_MAX}
                        onChange={(event) => setTag(event.target.value.toUpperCase())}
                        hint="2 to 5 letters or numbers, shown beside every member's name."
                      />
                      <Button
                        type="submit"
                        className="se-btn se-btn--primary se-btn--block"
                        disabledReason={
                          waiting
                          ?? closed
                          ?? (data.cooldownUntil
                            ? `You left ${data.formerAlliance ? `[${data.formerAlliance.tag}]` : 'an alliance'} recently. You can found one in ${until(data.cooldownUntil)}.`
                            : null)
                          ?? (name.trim().length < 3
                            ? 'Give the alliance a name first.'
                            : tag.trim().length < 2
                              ? 'Give the alliance a tag first.'
                              : null)
                        }
                      >
                        Found alliance
                      </Button>
                    </form>
                  </Panel>
                </div>

                <aside className="se-alliance-stack">
                  <Panel title="How alliances work" className="se-alliance-panel">
                    <div className="se-alliance-rules">
                      <AllianceMetric label="Member cap" value={formatNumber(rules.maxMembers)} detail="maximum active members" />
                      <AllianceMetric label="Friendly fire" value="Off" detail="allies cannot target one another" tone="good" />
                      <AllianceMetric label="Revenge" value="Shared" detail="a hit on one member opens crew payback" />
                      <AllianceMetric label="Leave cooldown" value={`${formatNumber(rules.leaveCooldownHours)}h`} detail="before joining another crew" />
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
            </section>
          </>
        ) : null}

        {data?.enabled && alliance && rules ? (
          <>
            <section className="se-alliance-section">
              <div className="se-alliance-sectionhead">
                <div>
                  <span className="se-eyebrow">Crew position</span>
                  <h2>Alliance overview</h2>
                </div>
                <p>Founded {new Date(alliance.foundedAt).toLocaleDateString()} · membership and combined worth are live from the current round.</p>
              </div>

              <div className="se-alliance-metrics">
                <AllianceMetric label="Alliance rank" value={`#${formatNumber(alliance.rank)}`} detail="combined active-member net worth" tone="accent" />
                <AllianceMetric label="Combined worth" value={formatCents(alliance.combinedNetWorthCents)} detail="all active members" />
                <AllianceMetric
                  label="Members"
                  value={`${formatNumber(alliance.memberCount)} / ${formatNumber(alliance.maxMembers)}`}
                  detail={availableSeats ? `${formatNumber(availableSeats)} seat${availableSeats === 1 ? '' : 's'} open` : 'crew is full'}
                  tone={availableSeats ? 'good' : 'warn'}
                />
                <AllianceMetric
                  label="Pending invites"
                  value={formatNumber(data.outgoingInvites.length)}
                  detail={data.isLeader ? `expire after ${formatNumber(rules.inviteExpiresHours)}h` : 'leader-managed'}
                />
              </div>
            </section>

            <section className="se-alliance-section">
              <div className="se-alliance-sectionhead">
                <div>
                  <span className="se-eyebrow">Crew roster</span>
                  <h2>Members & command</h2>
                </div>
                <span className="se-alliance-sectionhead__meta">{data.isLeader ? 'Leader controls enabled' : 'Member view'}</span>
              </div>

              <Panel title="Members" aside={`${formatNumber(alliance.memberCount)} active`} flush className="se-alliance-panel se-alliance-roster">
                <AllianceMembers
                  alliance={alliance}
                  actions={data.isLeader ? (member) => member.isYou ? null : (
                    <span className="se-inline-actions se-alliance-memberactions">
                      {confirming === `lead:${member.publicPimpId}` ? (
                        <Button
                          type="button"
                          className="se-btn se-btn--primary se-btn--sm"
                          disabledReason={waiting ?? closed}
                          onClick={() => void run(() => allianceApi.transfer(member.publicPimpId))}
                        >
                          Confirm lead
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          className="se-btn se-btn--ghost se-btn--sm"
                          disabledReason={waiting ?? closed}
                          onClick={() => setConfirming(`lead:${member.publicPimpId}`)}
                        >
                          Lead
                        </Button>
                      )}
                      {confirming === `kick:${member.publicPimpId}` ? (
                        <Button
                          type="button"
                          className="se-btn se-btn--primary se-btn--sm"
                          disabledReason={waiting ?? closed}
                          onClick={() => void run(() => allianceApi.kick(member.publicPimpId))}
                        >
                          Confirm kick
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          className="se-btn se-btn--ghost se-btn--sm"
                          disabledReason={waiting ?? closed}
                          onClick={() => setConfirming(`kick:${member.publicPimpId}`)}
                        >
                          Kick
                        </Button>
                      )}
                    </span>
                  ) : undefined}
                />
              </Panel>
            </section>

            <section className="se-alliance-ops">
              <div className="se-alliance-stack">
                <div className="se-alliance-wirewrap">
                  <AllianceWire />
                </div>

                <Panel title="Alliance history" aside={data.events.length ? `${formatNumber(data.events.length)} events` : 'Quiet'} className="se-alliance-panel">
                  {data.events.length ? (
                    <div className="se-alliance-history">
                      {data.events.map((event, index) => (
                        <div key={`${event.createdAt}-${index}`} className="se-alliance-history__item">
                          <span>{eventText(event)}</span>
                          <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time>
                        </div>
                      ))}
                    </div>
                  ) : <p className="se-muted">Nothing yet.</p>}
                </Panel>
              </div>

              <aside className="se-alliance-stack">
                {data.isLeader ? (
                  <Panel title="Recruiting desk" aside={availableSeats ? `${formatNumber(availableSeats)} seats open` : 'Full'} className="se-alliance-panel">
                    <form onSubmit={(event) => void invite(event)} className="se-alliance-form">
                      <Field
                        label="Pimp number"
                        inputMode="numeric"
                        value={invitee}
                        onChange={(event) => setInvitee(event.target.value)}
                        hint={`Invites last ${formatNumber(rules.inviteExpiresHours)} hours. The alliance is capped at ${formatNumber(alliance.maxMembers)}.`}
                      />
                      <Button
                        type="submit"
                        className="se-btn se-btn--primary se-btn--block"
                        disabledReason={
                          waiting
                          ?? closed
                          ?? (alliance.memberCount >= alliance.maxMembers
                            ? `${alliance.name} is full.`
                            : invitee.trim() === ''
                              ? 'Enter a pimp number first.'
                              : null)
                        }
                      >
                        Send invite
                      </Button>
                    </form>

                    {data.outgoingInvites.length ? (
                      <div className="se-alliance-outgoing">
                        <span className="se-eyebrow">Pending invites</span>
                        {data.outgoingInvites.map((offer) => (
                          <div key={offer.publicPimpId} className="se-alliance-outgoing__item">
                            <div>
                              <strong>{offer.displayName}</strong>
                              <span className="se-num">#{offer.publicPimpId} · {until(offer.expiresAt)} left</span>
                            </div>
                            <Button
                              type="button"
                              className="se-btn se-btn--ghost se-btn--sm"
                              disabledReason={waiting}
                              onClick={() => void run(() => allianceApi.revoke(offer.publicPimpId))}
                            >
                              Revoke
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </Panel>
                ) : null}

                {alliance.forumUrl || (data.isLeader && data.forum.enabled) ? (
                  <Panel title="Forum recruitment" className="se-alliance-panel">
                    {alliance.forumUrl ? (
                      <>
                        <p className="se-dim">Your recruitment thread is live and linked back to this alliance.</p>
                        <a className="se-btn se-btn--ghost se-btn--block" href={alliance.forumUrl} target="_blank" rel="noreferrer">Open the thread</a>
                      </>
                    ) : (
                      <>
                        <p className="se-dim">Post one recruitment thread to the forum. It follows the alliance if its name changes and is locked if the crew disbands.</p>
                        <div className="se-field">
                          <label className="se-label" htmlFor="alliance-pitch">Pitch (optional)</label>
                          <textarea
                            id="alliance-pitch"
                            className="se-input se-admin-textarea"
                            maxLength={ALLIANCE_PITCH_MAX}
                            value={pitch}
                            onChange={(event) => setPitch(event.target.value)}
                          />
                          {data.forum.error
                            ? <p className="se-error">Last try failed: {data.forum.error}</p>
                            : <p className="se-hint">What you want and who you are looking for.</p>}
                        </div>
                        <Button
                          type="button"
                          className="se-btn se-btn--primary se-btn--block"
                          disabledReason={waiting ?? closed}
                          onClick={() => void run(() => allianceApi.postForumThread(pitch))}
                        >
                          Post recruitment thread
                        </Button>
                      </>
                    )}
                  </Panel>
                ) : null}

                <Panel title="Crew rules" className="se-alliance-panel">
                  <div className="se-alliance-rulelist">
                    <div><span>Friendly fire</span><strong>None</strong></div>
                    <div><span>Revenge</span><strong>Shared by every member</strong></div>
                    <div><span>Leaving</span><strong>{formatNumber(rules.leaveCooldownHours)}h before joining again</strong></div>
                  </div>
                </Panel>

                <Panel title="Leave alliance" aside={data.isLeader ? 'Leadership rules apply' : undefined} className="se-alliance-panel se-alliance-leave">
                  <p className="se-dim">
                    {data.isLeader && alliance.memberCount > 1
                      ? 'Hand leadership to another member before you leave.'
                      : `Leaving starts a ${formatNumber(rules.leaveCooldownHours)}-hour cooldown: no joining another alliance, and no hits between you and this crew.${alliance.memberCount === 1 ? ' You are the last member, so the alliance disbands.' : ''}`}
                  </p>
                  {confirming === 'leave' ? (
                    <Button
                      type="button"
                      className="se-btn se-btn--primary se-btn--block"
                      disabledReason={waiting ?? closed}
                      onClick={() => void run(() => allianceApi.leave())}
                    >
                      Confirm leaving
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      className="se-btn se-btn--ghost se-btn--block"
                      disabledReason={waiting ?? closed ?? (data.isLeader && alliance.memberCount > 1 ? 'Hand leadership to another member first.' : null)}
                      onClick={() => setConfirming('leave')}
                    >
                      Leave alliance
                    </Button>
                  )}
                </Panel>
              </aside>
            </section>
          </>
        ) : null}
      </div>
    </GameLayout>
  );
}
