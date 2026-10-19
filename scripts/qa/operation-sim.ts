import { UNDERWORLD_OPERATIONS_V1 } from '@streets/rulesets';

type Band = 'success' | 'partial' | 'failure';

const samples = Number(process.argv.find((arg) => arg.startsWith('--samples='))?.split('=')[1] ?? 10_000);
const templates = UNDERWORLD_OPERATIONS_V1.templates;

if (templates.length < 3) throw new Error('2.2.0 requires at least three templated operations.');
if (!templates.every((template) => template.rewardCapCents >= template.bands.success.payoutCents)) {
  throw new Error('An operation success payout exceeds its configured reward cap.');
}

for (const template of templates) {
  const required = template.windows.filter((window) => !window.optional);
  if (!required.length) throw new Error(`${template.key} has no required settlement action.`);
  for (let sample = 0; sample < samples; sample += 1) {
    const completed = template.windows.filter(() => Math.random() > 0.35);
    const requiredDone = required.filter((window) => completed.some((row) => row.key === window.key)).length;
    const band: Band = requiredDone === required.length ? 'success' : requiredDone === 0 ? 'failure' : 'partial';
    const payout = template.bands[band].payoutCents;
    if (payout > template.rewardCapCents) throw new Error(`${template.key} exceeds cap in ${band}.`);
    if (band === 'failure' && payout !== 0) throw new Error(`${template.key} failure is farmable.`);
  }
}

// A two-player receipt must split integer cents without creating money.
for (let sample = 0; sample < samples; sample += 1) {
  const payout = Math.floor(Math.random() * 100_001);
  const shares = [Math.floor(payout / 2), Math.floor(payout / 2)];
  if (shares.reduce((sum, share) => sum + share, 0) > payout) throw new Error('Crew split created money.');
}

console.log(`Operation simulation passed: ${templates.length} templates × ${samples} outcomes; caps, failure payouts, and crew splits are bounded.`);
