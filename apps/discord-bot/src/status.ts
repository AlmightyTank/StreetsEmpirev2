import type { APIEmbed } from 'discord.js';
import { escapeMarkdown, truncate } from './format.js';
import type { PlatformMeta, SiteBanner, StaffPost } from './game-api.js';

/**
 * The public status channel: updates going live, planned maintenance and outages,
 * plus /status. Outages are the bot's own call, since a down game can't post.
 */

const GREEN = 0x22c55e;
const AMBER = 0xf59e0b;
const RED = 0xef4444;

export type StatusMessage = { embeds: APIEmbed[] };

const unix = (iso: string | number) => Math.floor((typeof iso === 'number' ? iso : Date.parse(iso)) / 1000);
const minutes = (ms: number) => Math.max(1, Math.round(ms / 60_000));

export type OutageEvent = { event: 'down'; since: number } | { event: 'up'; since: number; downForMs: number };

/**
 * Turns a probe every minute into at most one "down" and one "up" post per outage.
 * Quiet while a deploy the bot posted about is running: restarts are expected then,
 * unless the game stays down past the grace period.
 */
export class OutageWatch {
  private failingSince: number | null = null;
  private down = false;
  private deployUntil = 0;

  constructor(private readonly thresholdMs: number, private readonly deployGraceMs = 20 * 60_000) {}

  deployStarted(now: number): void {
    this.deployUntil = now + this.deployGraceMs;
  }

  deployEnded(): void {
    this.deployUntil = 0;
  }

  record(ok: boolean, now: number): OutageEvent | null {
    if (ok) {
      const since = this.failingSince;
      this.failingSince = null;
      if (!this.down || since === null) return null;
      this.down = false;
      return { event: 'up', since, downForMs: now - since };
    }
    this.failingSince ??= now;
    if (this.down || now - this.failingSince < this.thresholdMs || now < this.deployUntil) return null;
    this.down = true;
    return { event: 'down', since: this.failingSince };
  }
}

export function outageMessage(since: number, now: number): StatusMessage {
  return {
    embeds: [{
      title: "🔴 StreetsEmpire isn't responding",
      color: RED,
      description: `The game hasn't answered since <t:${unix(since)}:t> (about ${minutes(now - since)} min). This post updates when it's back.`,
      timestamp: new Date(since).toISOString(),
    }],
  };
}

export function recoveredMessage(since: number, downForMs: number): StatusMessage {
  return {
    embeds: [{
      title: '🟢 StreetsEmpire is back',
      color: GREEN,
      description: `The game was unreachable for about ${minutes(downForMs)} min from <t:${unix(since)}:t>. Anything on a timer kept its own clock.`,
      timestamp: new Date(since + downForMs).toISOString(),
    }],
  };
}

export function deployMessage(deploy: NonNullable<StaffPost['deploy']>): StatusMessage {
  const version = { text: `Build ${deploy.commit.slice(0, 7)}` };
  if (deploy.phase === 'started') {
    return {
      embeds: [{
        title: '🛠 Updating StreetsEmpire',
        color: AMBER,
        description: 'A new version is going live. The game may be unavailable for a minute or two.',
        footer: version,
        timestamp: deploy.at,
      }],
    };
  }
  if (deploy.phase === 'finished') {
    return {
      embeds: [{
        title: '✅ Update finished',
        color: GREEN,
        description: 'StreetsEmpire is up on the new version. Any patch notes follow in the news channel once staff have reviewed them.',
        footer: version,
        timestamp: deploy.at,
      }],
    };
  }
  return {
    embeds: [{
      title: '⚠️ Update hit a problem',
      color: RED,
      description: "The update didn't finish, and staff are on it. The game may be unavailable until it's sorted.",
      footer: version,
      timestamp: deploy.at,
    }],
  };
}

export function maintenanceMessage(maintenance: NonNullable<StaffPost['maintenance']>): StatusMessage {
  return {
    embeds: [{
      title: '🛠 Planned maintenance',
      color: AMBER,
      description: truncate(escapeMarkdown(maintenance.message), 1500),
      fields: [
        { name: 'Starts', value: `<t:${unix(maintenance.startsAt)}:F> (<t:${unix(maintenance.startsAt)}:R>)`, inline: true },
        { name: 'Ends about', value: `<t:${unix(maintenance.endsAt)}:F>`, inline: true },
      ],
    }],
  };
}

/** What a claimed status post becomes in the channel; null for anything else. */
export function statusPostMessage(post: StaffPost): StatusMessage | null {
  if (post.deploy) return deployMessage(post.deploy);
  if (post.maintenance) return maintenanceMessage(post.maintenance);
  return null;
}

const SEASON_WORDS: Record<string, string> = { ACTIVE: 'running', REGISTRATION: 'open for sign-ups', SCHEDULED: 'starting soon', ENDED: 'over' };

/** /status: is the game answering, which build, which season, and any maintenance. */
export function statusEmbed(input: { up: boolean; meta: PlatformMeta | null; banner: SiteBanner | null; origin: string }): APIEmbed {
  const { up, meta, banner } = input;
  const fields = [];
  if (meta) {
    fields.push({ name: 'Version', value: `v${escapeMarkdown(meta.app.version)}${meta.app.commit ? ` (${meta.app.commit.slice(0, 7)})` : ''}`, inline: true });
    fields.push({
      name: 'Season',
      value: meta.season
        ? `${escapeMarkdown(meta.season.name)}, ${SEASON_WORDS[meta.season.status] ?? meta.season.status.toLowerCase()}${meta.season.status === 'ACTIVE' ? `, ends <t:${unix(meta.season.endsAt)}:R>` : ''}`
        : 'No season running',
      inline: true,
    });
  }
  const window = banner?.kind === 'maintenance' ? banner.maintenance : null;
  fields.push({
    name: 'Maintenance',
    value: window ? `<t:${unix(window.startsAt)}:F> to about <t:${unix(window.endsAt)}:t>` : 'None scheduled',
  });
  return {
    title: up ? '🟢 StreetsEmpire is up' : "🔴 StreetsEmpire isn't answering",
    url: input.origin,
    color: up ? GREEN : RED,
    description: up ? 'The game is answering normally.' : "The game isn't answering right now. The status channel posts when it's back.",
    fields,
  };
}
