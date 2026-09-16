import { useEffect, useState } from 'react';
import { canPromptInstall, installPlatform, isInstalled, onInstallChange, promptInstall } from '../utils/install.js';

const DISMISSED_KEY = 'se-install-dismissed-at';
const HIDE_FOR_MS = 14 * 24 * 60 * 60_000;

function recentlyDismissed(): boolean {
  try {
    const at = Number(window.localStorage.getItem(DISMISSED_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < HIDE_FOR_MS;
  } catch {
    return false;
  }
}

function ShareIcon() {
  return (
    <svg className="se-install__glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M6 11H5v10h14V11h-1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg className="se-install__glyph" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="5" r="2" fill="currentColor" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <circle cx="12" cy="19" r="2" fill="currentColor" />
    </svg>
  );
}

/**
 * "Install the app" bar across the top on phones, like other sites offer. Android gets
 * the browser's own install dialog when it has one; iPhone and iPad get the Share steps,
 * since Safari has no install button a page can press.
 */
export function InstallBanner() {
  const [platform] = useState(installPlatform);
  const [hidden, setHidden] = useState(() => !platform || isInstalled() || recentlyDismissed());
  const [canPrompt, setCanPrompt] = useState(canPromptInstall);
  const [open, setOpen] = useState(false);

  useEffect(() => onInstallChange(() => {
    setCanPrompt(canPromptInstall());
    if (isInstalled()) setHidden(true);
  }), []);

  if (hidden || !platform) return null;

  function dismiss() {
    setHidden(true);
    try {
      window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // Private mode: the bar comes back next visit.
    }
  }

  async function install() {
    if (platform === 'android' && canPrompt) {
      if (await promptInstall()) setHidden(true);
      return;
    }
    setOpen((current) => !current);
  }

  return (
    <div className={`se-install${open ? ' se-install--open' : ''}`}>
      <div className="se-install__bar">
        <img className="se-install__icon" src="/icons/icon-192.png" alt="" width="36" height="36" />
        <div className="se-install__text">
          <strong>Get the StreetsEmpire app</strong>
          <small>Free. Alerts on your lock screen when you're hit.</small>
        </div>
        <button
          type="button"
          className="se-btn se-btn--primary se-btn--sm"
          onClick={install}
          aria-expanded={platform === 'android' && canPrompt ? undefined : open}
          aria-controls="se-install-steps"
        >
          {platform === 'android' && canPrompt ? 'Install' : open ? 'Close' : 'Install'}
        </button>
        <button type="button" className="se-install__close" onClick={dismiss} aria-label="Hide install banner">×</button>
      </div>

      {open ? (
        <div className="se-install__steps" id="se-install-steps">
          {platform === 'ios' ? (
            <ol>
              <li>Tap <ShareIcon /> <strong>Share</strong> in the browser bar.</li>
              <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
              <li>Tap <strong>Add</strong>, then open StreetsEmpire from your Home Screen.</li>
            </ol>
          ) : (
            <ol>
              <li>Tap <MenuIcon /> <strong>menu</strong> in the browser bar.</li>
              <li>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
              <li>Tap <strong>Install</strong>, then open StreetsEmpire from your Home screen.</li>
            </ol>
          )}
          <p>Then turn on alerts under Account settings.</p>
        </div>
      ) : null}
    </div>
  );
}
