/**
 * Run a task now and then every `ms`. A run still going when the next is due is
 * skipped, never overlapped; errors are logged so one bad run can't stop the loop.
 * Returns a function that stops the timer.
 */
export function startPoller(name: string, ms: number, task: () => Promise<void>, log: (message: string, error: unknown) => void): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await task();
    } catch (error) {
      log(`${name} failed`, error);
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), ms);
  timer.unref();
  return () => clearInterval(timer);
}
