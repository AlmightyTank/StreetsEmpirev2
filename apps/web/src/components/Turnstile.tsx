import { useEffect, useRef } from 'react';
import { useSession } from '../stores/session.js';

interface TurnstileApi {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile did not load')));
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Turnstile did not load'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** rc.5. The Turnstile site key when the server has bot checks on, else null. */
export function useTurnstileSiteKey(): string | null {
  return useSession((s) => s.platform?.turnstileSiteKey ?? null);
}

/**
 * rc.5. Cloudflare Turnstile ("are you human"). Renders nothing when the server has it off.
 * Tokens are single-use: give it a new `key` after each submit so it issues a fresh one.
 */
export function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const siteKey = useTurnstileSiteKey();
  const box = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  callback.current = onToken;

  useEffect(() => {
    if (!siteKey || !box.current) return;
    let widgetId: string | null = null;
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !box.current) return;
        widgetId = api.render(box.current, {
          sitekey: siteKey,
          theme: 'auto',
          callback: (token: string) => callback.current(token),
          'expired-callback': () => callback.current(null),
          'error-callback': () => callback.current(null),
        });
      })
      .catch(() => callback.current(null));
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey]);

  if (!siteKey) return null;
  return <div ref={box} className="se-turnstile" />;
}
