import { useEffect, useState } from 'react';
import type { SiteBannerDto } from '@streets/shared';
import { siteApi } from '../api/site.js';

const REFRESH_MS = 5 * 60_000;
const DISMISSED_KEY = 'se-dismissed-banner';

function readDismissed(): string | null {
  try {
    return window.sessionStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

/** The live admin banner, above every page. Dismissing hides it for this tab until a new banner goes up. */
export function SiteBanner() {
  const [banner, setBanner] = useState<SiteBannerDto | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(readDismissed);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      siteApi.banner()
        .then((response) => {
          if (!cancelled) setBanner(response.banner);
        })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  if (!banner || banner.id === dismissed || Date.parse(banner.endsAt) <= Date.now()) return null;

  function dismiss() {
    if (!banner) return;
    setDismissed(banner.id);
    try {
      window.sessionStorage.setItem(DISMISSED_KEY, banner.id);
    } catch {
      // Private mode: the banner simply comes back on the next page load.
    }
  }

  // 1.0.0-E: maintenance says when, in the player's own time, and says so again while it runs.
  const window_ = banner.maintenance;
  const running = window_ ? Date.parse(window_.startsAt) <= Date.now() : false;
  const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' });
  return (
    <div className={`se-site-banner se-site-banner--${running ? 'critical' : banner.tone}`} role={banner.tone === 'critical' || running ? 'alert' : 'status'}>
      <span>
        {window_ ? <strong>{running ? `Maintenance in progress until about ${when(window_.endsAt)}. ` : `Scheduled maintenance ${when(window_.startsAt)} – ${when(window_.endsAt)}. `}</strong> : null}
        {banner.message}
      </span>
      <button type="button" onClick={dismiss} aria-label="Dismiss notice">×</button>
    </div>
  );
}
