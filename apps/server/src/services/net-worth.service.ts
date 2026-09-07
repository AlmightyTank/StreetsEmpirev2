import {
  calculateNetWorthCents,
  type NetWorthInput,
  type Ruleset,
} from '@streets/rules-engine';

/**
 * Section 16. Integer cents in, integer cents out.
 */
export const NetWorthService = {
  calculate(player: NetWorthInput, ruleset: Ruleset): bigint {
    return calculateNetWorthCents(player, ruleset);
  },
};
