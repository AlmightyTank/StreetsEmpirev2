import { useEffect, useState } from 'react';
import { MAINTENANCE_EVENT } from '../api/client.js';

/** The maintenance message once any request has been turned away with 503 MAINTENANCE. */
export function useMaintenanceMessage(): string | null {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    const onMaintenance = (event: Event) => setMessage((event as CustomEvent<string>).detail || 'StreetsEmpire is down for maintenance.');
    window.addEventListener(MAINTENANCE_EVENT, onMaintenance);
    return () => window.removeEventListener(MAINTENANCE_EVENT, onMaintenance);
  }, []);
  return message;
}

/**
 * 1.0.0-F. When the server is in maintenance mode every player request comes back
 * 503 MAINTENANCE. Rather than an error on each button, say so once at the top.
 */
export function MaintenanceBanner() {
  const message = useMaintenanceMessage();
  if (!message) return null;
  return (
    <div className="se-site-banner se-site-banner--critical" role="alert">
      <span><strong>Down for maintenance.</strong> {message}</span>
      <button type="button" onClick={() => window.location.reload()} aria-label="Check again">↻</button>
    </div>
  );
}
