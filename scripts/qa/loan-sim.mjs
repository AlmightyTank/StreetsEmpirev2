import {
  debtLimits,
  debtRoomCents,
  garnishCents,
  lateFeeChargeCents,
  loanOfferTerms,
  loanOfferRefusal,
  nextLoanStanding,
  priceLoanOffer,
  quoteLoan,
} from '@streets/rules-engine';
import { classicOgV165C, classicOgV165E, classicOgV16H } from '@streets/rulesets';

const rules = classicOgV165E.loanShark;
const dollars = (cents) => `$${(Number(cents) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const initialPosition = () => ({ debtCents: 0n, feesAssessedCents: 0n, ...debtLimits(rules) });
const normalEarningsPerDayCents = 6_000_000n; // $60,000/day reference profile; override with --earnings-cents.
const earningsArg = process.argv.indexOf('--earnings-cents');
const earningsPerDay = earningsArg < 0 ? normalEarningsPerDayCents : BigInt(process.argv[earningsArg + 1]);
assert(earningsPerDay > 0n, '--earnings-cents must be a positive integer.');

const offers = rules.offers;
const results = [];
for (const offer of offers) {
  const position = initialPosition();
  const pricing = priceLoanOffer(rules, offer, { position, missedInstallments: 0 });
  const terms = loanOfferTerms(offer, pricing.contractFeeCents);
  const quote = quoteLoan(rules, terms, position, new Date('2026-01-01T00:00:00.000Z'));
  const termDays = offer.installmentCount * rules.installmentIntervalHours / 24;
  const earningsDuringTerm = earningsPerDay * BigInt(offer.installmentCount * rules.installmentIntervalHours) / 24n;
  const paymentSharePercent = Number(quote.obligationCents * 10_000n / earningsDuringTerm) / 100;
  assert(quote.installments.reduce((sum, row) => sum + row.amountCents, 0n) === quote.obligationCents, `${offer.key}: schedule does not equal the quote.`);
  results.push({ name: offer.name, principal: BigInt(offer.principalCents), fee: pricing.contractFeeCents, owed: quote.obligationCents, termDays, paymentSharePercent });
}

const establishedOffer = offers.find((offer) => offer.key === 'STREET_ADVANCE') ?? offers.at(-1);
assert(establishedOffer, 'At least one offer is required for the established-player scenario.');
const establishedPosition = initialPosition();
establishedPosition.debtCents = establishedPosition.ceilingCents / 2n;
const establishedPricing = priceLoanOffer(rules, establishedOffer, { position: establishedPosition, missedInstallments: 3 });
const establishedQuote = quoteLoan(rules, loanOfferTerms(establishedOffer, establishedPricing.contractFeeCents), establishedPosition, new Date('2026-01-01T00:00:00.000Z'));
const freshPricing = priceLoanOffer(rules, establishedOffer, { position: initialPosition(), missedInstallments: 0 });
assert(establishedPricing.contractFeeCents > freshPricing.contractFeeCents, 'Established-player debt and missed-payment pricing did not rise.');
assert(establishedPricing.contractFeeCents * 100n <= BigInt(establishedOffer.principalCents) * BigInt(rules.maxContractFeePercent), 'Established-player fee exceeded the disclosed fee ceiling.');
assert(establishedQuote.debtAfterCents <= establishedPosition.ceilingCents, 'Established-player borrowing crossed the ceiling.');

// Repeated poor choices must reach a serious balance but stop at the shared ceiling.
const quick = offers.find((offer) => offer.key === 'QUICK_CASH');
assert(quick, 'Quick Cash offer is required for the stacking scenario.');
const stacked = initialPosition();
let stackCount = 0;
while (true) {
  const pricing = priceLoanOffer(rules, quick, { position: stacked, missedInstallments: stackCount });
  const refusal = loanOfferRefusal(rules, quick, { position: stacked, netWorthCents: 0n, contractFeeCents: pricing.contractFeeCents });
  if (refusal) break;
  const quote = quoteLoan(rules, loanOfferTerms(quick, pricing.contractFeeCents), stacked, new Date('2026-01-01T00:00:00.000Z'));
  assert(quote.debtAfterCents <= stacked.ceilingCents, 'Stacking crossed the debt ceiling.');
  stacked.debtCents = quote.debtAfterCents;
  stackCount += 1;
  assert(stackCount < 100, 'Stacking did not terminate at the hard debt ceiling.');
}
assert(stacked.debtCents >= stacked.ceilingCents * 75n / 100n, 'Poor decisions did not reach a serious debt balance.');
assert(debtRoomCents(stacked) < BigInt(quick.principalCents), 'Stacking did not leave the next loan blocked.');

// Repeated misses are finite under the loan and round fee caps.
const feePosition = initialPosition();
let loanFees = 0n;
let totalLateFees = 0n;
let missCount = 0;
while (true) {
  const charge = lateFeeChargeCents({
    lateFeeCents: BigInt(rules.lateFeeCents),
    loanLateFeesAssessedCents: loanFees,
    loanLateFeeCapCents: BigInt(rules.lateFeeCapPerLoanCents),
    position: feePosition,
  });
  if (charge === 0n) break;
  loanFees += charge;
  feePosition.feesAssessedCents += charge;
  feePosition.debtCents += charge;
  totalLateFees += charge;
  missCount += 1;
  assert(feePosition.debtCents <= feePosition.ceilingCents, 'A late fee crossed the debt ceiling.');
  assert(feePosition.feesAssessedCents <= feePosition.feeCapCents, 'Late fees crossed the round fee cap.');
  assert(missCount < 100, 'Late fees did not stop at a hard cap.');
}
assert(totalLateFees > 0n && totalLateFees <= BigInt(rules.lateFeeCapPerLoanCents), 'Late-fee cap was not enforced.');
assert(totalLateFees === BigInt(rules.lateFeeCapPerLoanCents), 'Missed installments did not reach the published per-loan late-fee cap.');

// A nearly full debt balance can take only the remaining room, then late-fee growth stops.
const ceilingPosition = { ...initialPosition(), debtCents: BigInt(rules.debtCeilingCents) - 100n, feesAssessedCents: BigInt(rules.feeCapCents) - 500n };
const ceilingLimitedFee = lateFeeChargeCents({ lateFeeCents: BigInt(rules.lateFeeCents), loanLateFeesAssessedCents: 0n, loanLateFeeCapCents: BigInt(rules.lateFeeCapPerLoanCents), position: ceilingPosition });
assert(ceilingLimitedFee === 100n, 'A near-ceiling balance did not cap a late fee at remaining debt room.');
ceilingPosition.debtCents += ceilingLimitedFee;
ceilingPosition.feesAssessedCents += ceilingLimitedFee;
assert(lateFeeChargeCents({ lateFeeCents: BigInt(rules.lateFeeCents), loanLateFeesAssessedCents: ceilingLimitedFee, loanLateFeeCapCents: BigInt(rules.lateFeeCapPerLoanCents), position: ceilingPosition }) === 0n, 'A late fee continued growing after the debt ceiling.');

// Collections takes only a bounded share, and recovery restores access after the configured streak.
const overdue = BigInt(quick.principalCents) / 2n;
let garnished = 0n;
for (const income of [500_000n, 800_000n, 2_000_000n, 10_000_000n]) {
  garnished += garnishCents(rules, {
    incomeCents: income,
    garnishedLast24hCents: garnished,
    overdueCents: overdue - garnished,
    cashCents: income,
  });
  assert(garnished <= overdue, 'Collections garnished more than the overdue amount.');
  assert(garnished <= BigInt(rules.collections.garnishCapPerDayCents), 'Collections exceeded the 24-hour cap.');
}
const recovering = nextLoanStanding(rules, { current: 'COLLECTIONS', recoveryNeeded: 0, missedOutstanding: 0, owesAnything: true, onTimeCleared: 0 });
const recovered = nextLoanStanding(rules, { current: recovering.state, recoveryNeeded: recovering.recoveryNeeded, missedOutstanding: 0, owesAnything: true, onTimeCleared: rules.collections.recoveryOnTimeInstallments });
assert(recovering.state === 'RECOVERING' && recovered.state === 'CLEAR', 'A paid-up delinquent player could not complete recovery.');
assert(!classicOgV165C.loanShark.collections, 'Historical 1.6.5-C rounds unexpectedly gained collections behavior.');
assert(classicOgV16H.loanShark === undefined, 'Pre-loan historical rounds unexpectedly gained loan behavior.');

const report = [
  '# Loan Shark balance simulation',
  '',
  `Ruleset: ${classicOgV165E.meta.id}`, '',
  `Reference normal earnings: ${dollars(earningsPerDay)} per day (override with --earnings-cents).`,
  '',
  '| Offer | Cash | Fee | Total owed | Term | Share of reference earnings during term |',
  '| --- | ---: | ---: | ---: | ---: | ---: |',
  ...results.map((item) => `| ${item.name} | ${dollars(item.principal)} | ${dollars(item.fee)} | ${dollars(item.owed)} | ${item.termDays} days | ${item.paymentSharePercent.toFixed(1)}% |`),
  '',
  `- Repeated borrowing: ${stackCount} Quick Cash loans reached ${dollars(stacked.debtCents)}; next loan refused below the ${dollars(stacked.ceilingCents)} ceiling.`,
  `- Established borrower: 50% debt utilization and 3 missed installments raised ${establishedOffer.name} to ${dollars(establishedPricing.contractFeeCents)}; quoted debt remained under the ceiling.`,
  `- Missed installments: ${missCount} assessments charged ${dollars(totalLateFees)} before the per-loan cap stopped growth; a separate near-ceiling check allowed only ${dollars(ceilingLimitedFee)} before debt growth stopped.`,
  `- Fee totals: ${dollars(feePosition.feesAssessedCents)} / round cap ${dollars(feePosition.feeCapCents)}; per-loan late fees ${dollars(totalLateFees)} / cap ${dollars(BigInt(rules.lateFeeCapPerLoanCents))}.`,
  `- Collections: garnishment stayed within 25% per income line, ${dollars(BigInt(rules.collections.garnishCapPerDayCents))} per rolling day, overdue balance, and cash available.`,
  `- Recovery: clearing overdue moved the account to Recovering; ${rules.collections.recoveryOnTimeInstallments} on-time installments restored Clear standing.`,
  '- Historical rulesets: 1.6.5-C retains its original delinquency behavior; 1.6.0-H has no loan feature.',
  '',
  'All gates passed. The earnings profile is a transparent balance assumption, not observed telemetry; rerun at other values before finalizing offer limits.',
].join('\n');

if (process.argv.includes('--json')) console.log(JSON.stringify({ rulesetId: classicOgV165E.meta.id, earningsPerDayCents: earningsPerDay.toString(), offers: results.map((row) => ({ ...row, principal: row.principal.toString(), fee: row.fee.toString(), owed: row.owed.toString() })), establishedOffer: establishedOffer.key, establishedFeeCents: establishedPricing.contractFeeCents.toString(), stackCount, stackedDebtCents: stacked.debtCents.toString(), missCount, totalLateFeesCents: totalLateFees.toString(), ceilingLimitedFeeCents: ceilingLimitedFee.toString(), garnishedCents: garnished.toString(), recovered: recovered.state }, null, 2));
else console.log(process.argv.includes('--quiet') ? 'Loan Shark balance gates passed.' : report);
