import { performance } from 'node:perf_hooks';

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((entry) => entry.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

const url = arg('url', 'http://127.0.0.1:3001/api/health');
const total = Math.max(1, Number(arg('requests', '250')) || 250);
const concurrency = Math.max(1, Number(arg('concurrency', '20')) || 20);
const p95BudgetMs = Math.max(1, Number(arg('p95', '1000')) || 1000);

const timings = [];
let next = 0;
let failures = 0;

async function worker() {
  while (true) {
    const index = next++;
    if (index >= total) return;
    const started = performance.now();
    try {
      const response = await fetch(url, { headers: { accept: 'application/json' } });
      if (!response.ok) failures += 1;
      await response.arrayBuffer();
    } catch {
      failures += 1;
    } finally {
      timings.push(performance.now() - started);
    }
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => worker()));
timings.sort((a, b) => a - b);
const pick = (p) => timings[Math.min(timings.length - 1, Math.floor((timings.length - 1) * p))] ?? 0;
const average = timings.reduce((sum, n) => sum + n, 0) / timings.length;

console.log(`Load smoke: ${total} requests @ concurrency ${concurrency}`);
console.log(`Target: ${url}`);
console.log(`Failures: ${failures}`);
console.log(`avg ${average.toFixed(1)}ms · p50 ${pick(0.50).toFixed(1)}ms · p95 ${pick(0.95).toFixed(1)}ms · max ${pick(1).toFixed(1)}ms`);
console.log(`p95 budget: ${p95BudgetMs}ms`);

if (failures > 0 || pick(0.95) > p95BudgetMs) process.exitCode = 1;
