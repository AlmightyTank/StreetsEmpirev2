import { useEffect } from 'react';
import type { AppEnvironment } from '@streets/shared';
import { useSession } from '../stores/session.js';

/** The live game. Beta points players here so nobody plays the wrong one by mistake. */
export const PRODUCTION_GAME_URL = 'https://play.streetsempire.dev';

const LABEL: Record<AppEnvironment, string | null> = {
  production: null,
  beta: 'Beta',
  development: 'Dev',
  test: 'Test',
};

export function environmentLabel(environment: AppEnvironment | undefined): string | null {
  return environment ? LABEL[environment] : null;
}

/**
 * 1.0.0-A. Every non-production game shows it on every page, and in the tab title,
 * so nobody mistakes beta for the live game.
 */
export function EnvironmentRibbon() {
  const platform = useSession((s) => s.platform);
  const label = environmentLabel(platform?.environment);

  useEffect(() => {
    if (!label || typeof document === 'undefined') return undefined;
    const prefix = `[${label.toUpperCase()}] `;
    const apply = () => {
      if (!document.title.startsWith(prefix)) document.title = prefix + document.title;
    };
    apply();
    // Pages set their own titles; keep the prefix on whatever they choose.
    const observer = new MutationObserver(apply);
    const titleNode = document.querySelector('title');
    if (titleNode) observer.observe(titleNode, { childList: true });
    return () => observer.disconnect();
  }, [label]);

  if (!platform || !label) return null;
  return (
    <div className={`se-env-ribbon se-env-ribbon--${platform.environment}`} role="note">
      <strong>{label} server</strong>
      {platform.environment === 'beta' ? (
        <span>
          Test builds and test data. Nothing here carries over.{' '}
          <a href={PRODUCTION_GAME_URL}>Play the live game</a>
        </span>
      ) : (
        <span>Not the live game.</span>
      )}
    </div>
  );
}
