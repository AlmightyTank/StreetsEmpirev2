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

  return (
    <div className={`se-site-banner se-site-banner--${banner.tone}`} role={banner.tone === 'critical' ? 'alert' : 'status'}>
      <span>{banner.message}</span>
      <button type="button" onClick={dismiss} aria-label="Dismiss notice">×</button>
    </div>
  );
}
