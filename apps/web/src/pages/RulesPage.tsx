import { useEffect, useState } from 'react';
import type { GameStatusDto } from '@streets/shared';
import { roundsApi } from '../api/rounds.js';
import { Panel } from '../components/Panel.js';
import { InfoLayout } from '../layouts/InfoLayout.js';

/**
 * How the game works, not what the numbers are.
 *
 * Deliberately free of balance values: this page went stale once already
 * because it quoted requirements that a later change moved. Every figure a
 * player needs is live somewhere it belongs - the shelf on the store page, the
 * gates on The Street, the turn clock from the round status. Rules that only
 * describe mechanics survive a rebalance.
 *
 * Public: logged-out visitors and the forum footer link here.
 */
export function RulesPage() {
  const [status, setStatus] = useState<GameStatusDto | null>(null);

  useEffect(() => {
    roundsApi.status().then(setStatus).catch(() => setStatus(null));
  }, []);

  return (
    <InfoLayout>
      <section className="se-info-hero">
        <span className="se-info-hero__kicker">Street handbook</span>
        <h1 className="se-info-hero__title">Rules</h1>
        <p className="se-info-hero__body">How StreetsEmpire works without turning the handbook into a second balance sheet. Live numbers stay on the pages where they matter.</p>
        <div className="se-info-hero__metrics"><span className="se-info-chip"><strong>{status?.ruleset?.name ?? 'Classic OG'}</strong> ruleset</span><span className="se-info-chip">Mechanics, not promises</span></div>
      </section>

      <div className="se-rules__layout">
        <aside className="se-panel se-rules__rail"><div className="se-panel__head"><h2 className="se-panel__title">On this page</h2></div><div className="se-panel__body se-rules__rail-list"><a href="#fair-seasons">Fair seasons</a><a href="#turns">Turns</a><a href="#crew">Crew</a><a href="#shops">Shops</a><a href="#combat">Raids</a><a href="#travel">The road</a><a href="#turf">Turf</a><a href="#rank">Money & rank</a></div></aside>
        <div className="se-rules__content">
          <section id="fair-seasons" className="se-rules__panel"><Panel title="Fair seasons">
            <ul className="se-list">
              <li>Each season is mechanically fresh. New rounds reset cash, crew, supplies, weapons, turns, intel, cooldowns and rankings.</li>
              <li>Hideout upgrades are season mechanics too. Their buffs reset with the next round, while the finished build remains on your season archive.</li>
              <li>Your permanent account keeps history: finished seasons, placements, legacy totals, badges, titles, profile accents and featured cosmetics.</li>
              <li>Permanent cosmetics never change action math, starting resources, combat odds, store access or rank calculations.</li>
              <li>Hall of Fame and public profiles keep the receipts, but the next leaderboard starts on equal footing.</li>
            </ul>
          </Panel></section>

          <section id="turns" className="se-rules__panel"><Panel title="Turns">
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
          </Panel></section>

          <section id="crew" className="se-rules__panel"><Panel title="Your crew">
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
          </Panel></section>

          <section id="shops" className="se-rules__panel"><Panel title="Shops">
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
                Product is where shelves bite. Pip cannot keep a large stable supplied, which
                is what production is for.
              </li>
            </ul>
          </Panel></section>

          <Panel title="Hideout">
            <ul className="se-list">
              <li>The hideout is a seasonal money sink for small capped buffs, not permanent power.</li>
              <li>Safe Room protects more cash from raids. Lookouts add a small home-defense bonus.</li>
              <li>Workshop adds a little production efficiency, and Back Office adds a little more personal cash take from street work.</li>
              <li>Every room has a cap. Maxing it is a season achievement, not an account advantage next season.</li>
            </ul>
          </Panel>

          <section id="combat" className="se-rules__panel"><Panel title="Raids">
            <ul className="se-list">
              <li>
                Combat rounds add a Raids page. If that page says raids are unavailable,
                the current round is still an economic round.
              </li>
              <li>
                You pick a same-city target and send fit thugs. Defense is automatic,
                uses fit thugs, and assigns the best available guns on both sides.
              </li>
              <li>
                A raid can be blocked by your protection, your cooldown, low turns, a
                protected target, a target with no exposed cash or product, or a crew too small for
                your full strength.
              </li>
              <li>
                Wounded thugs still belong to you, but cannot work, produce, attack or
                defend until they recover. Medicine can bring them back immediately.
              </li>
              <li>
                Where drive-bys are live, a drive-by takes nothing: it wounds the target&rsquo;s
                crew and kills some of their whores for good, which is how you soften someone
                before a raid. It needs Low-Riders, six thugs fit in each car, and a car is
                only lost if everybody in it goes down.
              </li>
              <li>
                Some rounds add more raid forms. Drug their hoes to burn through supplies, steal a ride
                to bring one of their Low-Riders home, or lure unhappy hoes and thugs with product and beer if your crew wins.
              </li>
              <li>
                Strategy rounds add recon and revenge: recon spends turns to reveal a
                temporary target report including product stash when drug loot is live, and revenge lets you answer someone who recently
                raided you.
              </li>
              <li>
                Rankings and profiles are public bragging rights: money, current rank,
                rank streaks, past placements and achievements. Profiles show earned badges and locked achievement progress, while recon reveals private raid intel.
              </li>
            </ul>
          </Panel></section>
        </div>

        <div className="se-grid">
          <Panel title="Working a block">
            <ul className="se-list">
              <li>
                Scout is one trip doing both jobs: the girls work the block while you work
                the room for clients, and you pick up whoever is worth taking home.
              </li>
              <li>
                Producing product sends them out too, on their usual block, for a fraction of
                a scouted night &mdash; the muscle that would be running them is inside producing.
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

          <Panel title="Products and Heat">
            <ul className="se-list">
              <li>
                Rounds with more than one product give each its own character: some pay best
                in rich blocks, some on the street, some keep a crew happy, and some cook or
                fight better. No product is best at everything.
              </li>
              <li>
                Each job has a supply order &mdash; a primary, then a fallback, then an
                emergency product &mdash; set on Scout, Produce and Raids. A trip that runs
                out part-way is charged and paid for each part, and the part with nothing
                earns less.
              </li>
              <li>
                Pip deals every product from shelves of their own. What can be cooked is
                cooked on Produce. Everything you hold counts toward net worth, and raids
                take a share of all of it.
              </li>
              <li>
                Risky product draws Heat. High Heat cuts the take, and higher Heat risks a
                bust that seizes product and fines cash. Heat cools on the turn clock, and a
                bribe on the dashboard takes it down faster.
              </li>
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

          <section id="travel" className="se-rules__panel"><Panel title="The road">
            <ul className="se-list">
              <li>
                Rounds with travel open every city. Each one deals differently: what is
                plentiful is cheap there, what a city wants it pays for. Anyone can hear a
                city&rsquo;s street talk from home, and your crew brings back Pip&rsquo;s
                prices from where it has been.
              </li>
              <li>
                A run loads up Low-Riders with cash, product and escorts and drives out.
                What it took is all it has: it buys with the cash in the car and sells what
                is in the trunk, at Pip&rsquo;s counter or on the city&rsquo;s high market,
                which everyone in the round shares and every trade moves. It trades in a
                town for a while, drives on, or comes home on its own.
              </li>
              <li>
                Home works while the run is out, with what the run did not take. Escorts
                ride armed and are not at home to defend, cover the street or cook.
              </li>
              <li>
                Police watch the roads: the longer the drive, the heavier the load and the
                hotter you are, the more likely a stop. Selling draws Heat in the town you
                sell in, and a town&rsquo;s patience is its own.
              </li>
              <li>
                Near a city a run can be hit by the crews who live there. Recon your area
                to find runs coming near, in town or leaving, then tail one. Nobody warns
                the owner: only lookouts at the hideout spot a tail, and only in its last
                minutes.
              </li>
              <li>
                You can move the whole operation to another city for a fee and a stretch on
                the road. Everything goes with you, Heat included, and your rank, targets
                and feeds follow.
              </li>
            </ul>
          </Panel></section>

          <section id="turf" className="se-rules__panel"><Panel title="Turf and territory">
            <ul className="se-list">
              <li>
                Turf rounds turn each city district into a block somebody can hold. Scout work builds
                presence; claiming and defending a corner commits armed thugs who are no longer at home
                working, cooking or defending.
              </li>
              <li>
                Holding your own block boosts work there and can earn capped street tax when other crews
                work it. Linked accounts never feed each other turf tax.
              </li>
              <li>
                Taking player turf is a delayed push. Lookouts can warn the holder, defenders can commit
                backup and eligible allies may answer the call; shields and attacker cooldowns stop a
                block from being bounced back and forth instantly.
              </li>
              <li>
                Away turf is an outpost. Runs establish and service its box with crew, guns, beer,
                product and cash, and a Garage can open a second active run.
              </li>
              <li>
                Alliance blocks can add up to city control. Territory standings count cumulative
                block-time for crews and alliances, but final season placement is still decided by net worth.
              </li>
            </ul>
          </Panel></section>

          <section id="rank" className="se-rules__panel"><Panel title="Money and rank">
            <ul className="se-list">
              <li>Net worth decides local and national rank, and it is not just cash.</li>
              <li>Public net worth is visible because rank is meant to be argued over. It still does not tell you liquid cash or defense.</li>
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
          </Panel></section>
        </div>
      </div>
    </InfoLayout>
  );
}
