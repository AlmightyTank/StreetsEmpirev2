import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import type { GameStatusDto } from '@streets/shared';
import { roundsApi } from '../api/rounds.js';
import { Panel } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';

/**
 * How the game works, not what the numbers are.
 *
 * Deliberately free of balance values: this page went stale once already
 * because it quoted requirements that a later change moved. Every figure a
 * player needs is live somewhere it belongs - the shelf on the store page, the
 * gates on The Street, the turn clock from the round status. Rules that only
 * describe mechanics survive a rebalance.
 */
export function RulesPage() {
  const me = useSession((s) => s.me);
  const [status, setStatus] = useState<GameStatusDto | null>(null);

  useEffect(() => {
    roundsApi.status().then(setStatus).catch(() => setStatus(null));
  }, []);

  if (!me) return <Navigate to="/join" replace />;

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">Rules</h1>
          <p className="se-eyebrow">{status?.ruleset?.name ?? 'Classic OG'} · the short version</p>
        </div>
      </div>

      <div className="se-grid se-grid--2">
        <Panel title="Turns">
          <ul className="se-list">
            <li>Actions spend turns. Shopping, favours and changing the payout do not.</li>
            <li>
              {status?.turns
                ? `You regenerate ${status.turns.amountPerInterval} turns every ${status.turns.intervalMinutes} minutes, up to ${status.turns.cap}.`
                : 'Turns regenerate on the round clock up to the cap.'}
            </li>
            <li>
              Being away can earn a bonus; leaving a tab open does not fake activity.
            </li>
          </ul>
        </Panel>

        <Panel title="Working a block">
          <ul className="se-list">
            <li>
              Scout is one trip doing both jobs: the girls work the block while you work
              the room for clients, and you pick up whoever is worth taking home.
            </li>
            <li>
              Producing crack sends them out too, on their usual block, for a fraction of
              a scouted night &mdash; the muscle that would be running them is inside cooking.
            </li>
            <li>
              A block only holds so many paying clients, and how many changes every hour.
              Past a certain size that matters more than the district&rsquo;s reputation for money.
            </li>
            <li>
              Nothing about a block is posted except whether your thugs can cover it.
              You find the rest out by going.
            </li>
          </ul>
        </Panel>

        <Panel title="Your crew">
          <ul className="se-list">
            <li>
              Recruiting slows as your empire grows, so the early days add people faster
              than the late ones ever will.
            </li>
            <li>
              The cut you pay, the supplies on the shelf and the thugs on watch set
              happiness. What counts for their cut is the money that reaches them, not
              the percentage.
            </li>
            <li>
              An unhappy crew walks, and the longer you work them in one trip the more of
              them go. Nobody leaves a crew that is content.
            </li>
            <li>Thug happiness wants a beer and a weapon each. Any weapon counts.</li>
          </ul>
        </Panel>

        <Panel title="Condoms and medicine">
          <ul className="se-list">
            <li>
              Any shift that puts the girls out burns condoms. Come up short and somebody
              can catch something, scaled by how short you were.
            </li>
            <li>
              An infection is treated from the medicine you carry. If you are not carrying
              any, she stops working for you.
            </li>
            <li>
              Condoms are the cheap prevention and medicine the expensive cure, so
              neglecting both is by far the most expensive option.
            </li>
          </ul>
        </Panel>

        <Panel title="Shops">
          <ul className="se-list">
            <li>Store orders are all-or-nothing. You never get a silent partial order.</li>
            <li>
              Every shop restocks in full on its own clock, and the shelf is all they have
              until the next delivery. A week away is still one shelf, not a week of stock.
            </li>
            <li>
              The harder something is to get hold of, the longer the wait between
              deliveries. Pistols arrive by the crate; an AK-47 comes once a day.
            </li>
            <li>
              Crack is the one thing a shop can run short of on purpose &mdash; Pip cannot
              keep a large stable supplied, which is what cooking is for.
            </li>
          </ul>
        </Panel>

        <Panel title="Reputation and guns">
          <ul className="se-list">
            <li>
              Every trader keeps their own opinion of you, and each is asking for one
              favour. You square it with them in their shop.
            </li>
            <li>
              Dealing with a shop earns a little standing once a day, however much you
              buy. Money cannot buy the rest.
            </li>
            <li>
              The heavy guns read your standing across the whole city, not with one
              shopkeeper. There is no route to the AK-47 without doing the favours.
            </li>
            <li>
              Standing also gets you served sooner at that shop. Earned access lasts the
              round even if your cash or crew later falls away.
            </li>
          </ul>
        </Panel>

        <Panel title="Money and rank">
          <ul className="se-list">
            <li>Net worth decides local and national rank, and it is not just cash.</li>
            <li>
              A dollar in your pocket counts for less than a dollar of empire, so sitting
              on money is not free.
            </li>
            <li>
              Everything you own counts for something, valued at what you could sell it
              for. Nothing on sale is worth more than it costs.
            </li>
            <li>
              Tied net worth shares a rank, and the next rank skips the tied positions.
              Daily movement compares you against the first snapshot after the reset.
            </li>
          </ul>
        </Panel>
      </div>
    </GameLayout>
  );
}
