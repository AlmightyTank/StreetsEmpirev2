import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';

const required = {
  DISCORD_BOT_TOKEN: 'bot-token',
  DISCORD_CLIENT_ID: '12345678901234567',
  DISCORD_GUILD_ID: '12345678901234568',
  DISCORD_BOT_API_TOKEN: 't'.repeat(64),
};

describe('loadConfig beta mode', () => {
  it('uses explicit APP_ENV=beta', () => {
    expect(loadConfig({ ...required, APP_ENV: 'beta' }).betaMode).toBe(true);
    expect(loadConfig({ ...required, APP_ENV: 'production' }).betaMode).toBe(false);
  });

  it('recognizes the documented inferred beta deployment', () => {
    const config = loadConfig({
      ...required,
      NODE_ENV: 'production',
      BETA_INVITE_ONLY: 'true',
      SESSION_COOKIE_NAME: 'se_beta_session',
    });
    expect(config.betaMode).toBe(true);
  });
});
