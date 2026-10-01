import { describe, expect, it } from 'vitest';
import { BOT_SILENT_AFTER_MS, discordWaiting } from '../admin-news.service.js';

const now = new Date('2026-10-01T12:00:00.000Z');
const current = { id: 'round-now', name: 'Game #021' };
const bot = { id: 'news', lastSeenAt: new Date(now.getTime() - 60_000), channel: 'news', problem: null };
const post = { discordPostedAt: null, discordError: null, publishedAt: new Date(now.getTime() - 1_000), roundId: null, round: null };
const context = { now, botApiEnabled: true, currentRound: current, bot };

describe('discordWaiting', () => {
  it('says nothing once the post is on Discord', () => {
    expect(discordWaiting({ ...post, discordPostedAt: now }, context)).toBeNull();
  });

  it('shows why Discord refused it before anything else', () => {
    expect(discordWaiting({ ...post, discordError: 'Missing Permissions: the bot needs Send Messages in #news.' }, { ...context, botApiEnabled: false }))
      .toBe('Refused: Missing Permissions: the bot needs Send Messages in #news. Fix that, then resend it.');
  });

  it('names the setup problem in the order an admin would fix it', () => {
    expect(discordWaiting(post, { ...context, botApiEnabled: false })).toContain('DISCORD_BOT_API_TOKEN');
    expect(discordWaiting({ ...post, publishedAt: new Date(now.getTime() + 60_000) }, context)).toMatch(/^Scheduled/);
    expect(discordWaiting({ ...post, roundId: 'round-old', round: { name: 'Game #004' } }, context))
      .toBe('Only news for every round or the current round (Game #021) goes to Discord, and this post is for Game #004.');
    expect(discordWaiting(post, { ...context, bot: null })).toMatch(/never checked in/);
    expect(discordWaiting(post, { ...context, bot: { ...bot, lastSeenAt: new Date(now.getTime() - BOT_SILENT_AFTER_MS - 60_000) } }))
      .toMatch(/has not checked in for 16 minutes/);
    expect(discordWaiting(post, { ...context, bot: { ...bot, channel: null, problem: 'the bot needs SendMessages in #news.' } }))
      .toBe('The bot cannot post news: the bot needs SendMessages in #news.');
    expect(discordWaiting(post, context)).toMatch(/^Waiting for the bot/);
  });

  it('sends a current-round post', () => {
    expect(discordWaiting({ ...post, roundId: current.id, round: { name: current.name } }, context)).toMatch(/^Waiting for the bot/);
  });
});
