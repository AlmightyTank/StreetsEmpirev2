import { metrics } from '../services/metrics.service.js';
import { annotateLogContext, withLogContext } from './request-context.js';

/**
 * Run a task now and then every `ms`. A run still going when the next is due is
 * skipped, never overlapped; errors are logged so one bad run can't stop the loop.
 * Returns a function that stops the timer.
 */
export function startPoller(name: string, ms: number, task: () => Promise<void>, log: (message: string, error: unknown) => void): () => void {
  let running = false;
  metrics.registerJob(name, ms);
  const tick = async () => {
    if (running) return;
    running = true;
    const started = Date.now();
    // 1.0.0-F: every log line from the job names it, and every run is counted for monitoring.
    await withLogContext({ job: name, errorCategory: undefined }, async () => {
      try {
        await task();
        metrics.recordJob(name, { ok: true, durationMs: Date.now() - started });
      } catch (error) {
        metrics.recordJob(name, { ok: false, durationMs: Date.now() - started, error });
        annotateLogContext({ errorCategory: 'background' });
        log(`${name} failed`, error);
      } finally {
        running = false;
      }
    });
  };
  void tick();
  const timer = setInterval(() => void tick(), ms);
  timer.unref();
  return () => clearInterval(timer);
}
