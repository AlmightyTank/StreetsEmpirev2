import { classicOgV12B } from '@streets/rulesets';
import { seededRng, simulateSlots } from '@streets/rules-engine';

const spins = Number(process.env.SLOT_SPINS ?? 250_000);
let failed = false;

console.log(`Slots simulation: ${spins.toLocaleString('en-US')} paid spins per machine + every awarded free spin`);
for (const [index, machine] of classicOgV12B.casino.slots.machines.entries()) {
  const summary = simulateSlots(machine, spins, seededRng(12_000 + index));
  const base = (summary.baseRtpBps / 100).toFixed(2);
  const effective = (summary.theoreticalRtpBps / 100).toFixed(2);
  const observed = (summary.observedRtpBps / 100).toFixed(2);
  const hit = (summary.hitRateBps / 100).toFixed(2);
  const drift = Math.abs(summary.observedRtpBps - summary.theoreticalRtpBps);
  console.log(
    `${machine.name.padEnd(18)} ${machine.reels}x${machine.rows}/${String(machine.paylines.length).padStart(2)} lines`
    + `  base ${base}%  effective ${effective}%  observed ${observed}%`
    + `  hit ${hit}%  bonuses ${summary.bonusTriggers.toLocaleString('en-US')}`
    + ` / ${summary.freeSpins.toLocaleString('en-US')} free spins`
    + `  drift ${(drift / 100).toFixed(2)}pp`,
  );

  if (summary.baseRtpBps < 9_100 || summary.baseRtpBps > 9_400) failed = true;
  if (summary.theoreticalRtpBps < 9_200 || summary.theoreticalRtpBps > 9_500) failed = true;
  if (drift > 300) failed = true;
  if (summary.bonusTriggers === 0 || summary.freeSpins === 0) failed = true;
}

if (failed) {
  console.error('Slots balance gate failed.');
  process.exitCode = 1;
}
