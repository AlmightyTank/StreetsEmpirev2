import { classicOgV12B } from '@streets/rulesets';
import { seededRng, simulateSlots } from '@streets/rules-engine';

const spins = Number(process.env.SLOT_SPINS ?? 250_000);
let failed = false;

console.log(`Slots simulation: ${spins.toLocaleString('en-US')} spins per machine at minimum line bet with all paylines active`);
for (const [index, machine] of classicOgV12B.casino.slots.machines.entries()) {
  const summary = simulateSlots(machine, spins, seededRng(12_000 + index));
  const expected = (summary.theoreticalRtpBps / 100).toFixed(2);
  const observed = (summary.observedRtpBps / 100).toFixed(2);
  const hit = (summary.hitRateBps / 100).toFixed(2);
  const drift = Math.abs(summary.observedRtpBps - summary.theoreticalRtpBps);
  console.log(`${machine.name.padEnd(18)} ${machine.reels}x${machine.rows}/${String(machine.paylines.length).padStart(2)} lines  expected ${expected}%  observed ${observed}%  hit ${hit}%  drift ${(drift / 100).toFixed(2)}pp`);
  if (summary.theoreticalRtpBps < 9_100 || summary.theoreticalRtpBps > 9_400 || drift > 250) failed = true;
}

if (failed) {
  console.error('Slots balance gate failed.');
  process.exitCode = 1;
}
