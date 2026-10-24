import { describe, expect, it } from 'vitest';
import { MessageFlags } from 'discord.js';
import { plainDiscordMessage } from '../plain-message.js';

describe('plainDiscordMessage', () => {
  it('turns a status card into readable Markdown and keeps its build and time', () => {
    const payload = plainDiscordMessage({
      embeds: [{
        title: '✅ Update finished',
        description: 'StreetsEmpire is up on the new version.',
        footer: { text: 'Build e46ba47' },
        timestamp: '2026-10-23T21:03:00.000Z',
      }],
    });

    expect(payload.embeds).toEqual([]);
    expect(payload.content).toContain('**✅ Update finished**');
    expect(payload.content).toContain('StreetsEmpire is up on the new version.');
    expect(payload.content).toContain('Build e46ba47');
    expect(payload.content).toContain('<t:1792789380:f>');
    expect(payload.flags).toBe(MessageFlags.SuppressEmbeds);
  });

});
