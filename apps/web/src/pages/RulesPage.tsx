import { useEffect, useState } from 'react';
import type { GameStatusDto } from '@streets/shared';
import { roundsApi } from '../api/rounds.js';
import { Panel } from '../components/Panel.js';
import { InfoLayout } from '../layouts/InfoLayout.js';
import { ReplayTutorial } from '../components/onboarding/ReplayTutorial.js';

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
      <div className="se-rules">
        <section className="se-info-hero se-info-hero--rules">
          <div className="se-info-hero__copy">
            <span className="se-info-hero__kicker">Street handbook</span>
            <h1 className="se-info-hero__title">Rules</h1>
            <p className="se-info-hero__body">The mechanics that stay true even when balance numbers move. Live prices, limits and timers stay on the pages where you actually use them.</p>
            <p><ReplayTutorial /></p>
          </div>
          <div className="se-info-hero__readout" aria-label="Current ruleset summary">
            <span><small>Ruleset</small><strong>{status?.ruleset?.name ?? 'Classic OG'}</strong></span>
            <span><small>Version</small><strong>{status?.ruleset?.version ?? 'Current'}</strong></span>
            <span><small>Turn clock</small><strong>{status?.turns ? `+${status.turns.amountPerInterval} / ${status.turns.intervalMinutes}m` : 'Live round'}</strong></span>
            <span><small>Turn cap</small><strong>{status?.turns?.cap ?? 'Live value'}</strong></span>
          </div>
        </section>

        <section className="se-info-section">
          <div className="se-info-sectionhead">
            <div>
              <span className="se-eyebrow">The contract</span>
              <h2>What the game promises every season</h2>
            </div>
            <p>The handbook explains systems. The live game owns the balance numbers.</p>
          </div>
          <div className="se-info-principles">
            <article><span>01</span><strong>Fresh competition</strong><p>Season power resets so the next leaderboard starts on equal footing.</p></article>
            <article><span>02</span><strong>Live numbers stay live</strong><p>Prices, caps, timers and requirements are shown where you act on them.</p></article>
            <article><span>03</span><strong>Intel has boundaries</strong><p>Public bragging rights stay public; dangerous combat information still needs recon.</p></article>
          </div>
        </section>

        <section className="se-info-section">
          <div className="se-info-sectionhead">
            <div>
              <span className="se-eyebrow">Street handbook</span>
              <h2>Mechanics by system</h2>
            </div>
            <span className="se-info-sectionhead__meta">Jump in from the rail · read only what you need</span>
          </div>

          <div className="se-rules__layout">
            <aside className="se-panel se-rules__rail">
              <div className="se-panel__head"><h2 className="se-panel__title">On this page</h2></div>
              <div className="se-panel__body se-rules__rail-list">
                <a href="#fair-seasons"><span>01</span> Fair seasons</a>
                <a href="#turns"><span>02</span> Turns</a>
                <a href="#crew"><span>03</span> Crew</a>
                <a href="#shops"><span>04</span> Shops</a>
                <a href="#work"><span>05</span> Working blocks</a>
                <a href="#products"><span>06</span> Products & Heat</a>
                <a href="#combat"><span>07</span> Raids</a>
                <a href="#travel"><span>08</span> The road</a>
                <a href="#trips"><span>09</span> Boss trips</a>
                <a href="#turf"><span>10</span> Turf</a>
                <a href="#business"><span>11</span> Businesses</a>
                <a href="#law"><span>12</span> The law</a>
                <a href="#factions"><span>13</span> Factions</a>
                <a href="#rank"><span>14</span> Money & rank</a>
              </div>
            </aside>
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

          <section id="hideout" className="se-rules__panel"><Panel title="Hideout">
            <ul className="se-list">
              <li>The hideout is a seasonal money sink for small capped buffs, not permanent power.</li>
              <li>Safe Room protects more cash from raids. Lookouts add a small home-defense bonus.</li>
              <li>Workshop adds a little production efficiency, and Back Office adds a little more personal cash take from street work.</li>
              <li>Every room has a cap. Maxing it is a season achievement, not an account advantage next season.</li>
            </ul>
          </Panel></section>

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

          <div className="se-rules__chapter-grid">
          <section id="work" className="se-rules__panel"><Panel title="Working a block">
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
          </Panel></section>

          <section id="products" className="se-rules__panel"><Panel title="Products and Heat">
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
          </Panel></section>

          <section className="se-rules__panel"><Panel title="Condoms and medicine">
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
          </Panel></section>

          <section className="se-rules__panel"><Panel title="Reputation and guns">
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
          </Panel></section>

          <section id="travel" className="se-rules__panel se-rules__panel--wide"><Panel title="The road">
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

          <section id="trips" className="se-rules__panel se-rules__panel--wide"><Panel title="Boss trips">
            <ul className="se-list">
              <li>
                In rounds with trips, the boss can go somewhere in person: fly to any city for a hotel stay,
                or ride along with one of your runs and stay in each town until you move on. Home stays
                home. You still live, rank and can be hit where you live, and the operation keeps working.
              </li>
              <li>
                While the boss is away a lieutenant runs home and skims a share of every Scout and Produce
                take, the girls notice the longer you are gone, and home defends raids a little weaker.
                It all recovers the moment the boss is back.
              </li>
              <li>
                A flight costs a ticket and the hotel up front, and the bankroll you carry is all you have
                in town. Nothing is wired from home. Bodyguards can fly with you on their own tickets, but
                land unarmed; Tommy&rsquo;s people out of town will rent them guns once you have earned
                the connection. With the boss riding along, the hotel bills the run&rsquo;s cash by the
                hour, and when the cash runs dry the boss checks out.
              </li>
              <li>
                Airport security reads Heat, going and coming back, and a crew draws more eyes than a boss
                alone. Too hot, and nobody lets you on a plane at all.
              </li>
              <li>
                The locals can find a visiting boss with a recon and come for them. A boss alone has nobody
                to fight back; bodyguards and allies who live there can. A beaten boss loses part of the
                bankroll, flies home and is laid up for a while before travelling again.
              </li>
              <li>
                Some jobs only happen in person, a boss in town can walk an outpost they hold there, and
                two bosses in the same city can sit down and agree a truce: for a day neither crew can hit
                the other.
              </li>
            </ul>
          </Panel></section>

          <section id="turf" className="se-rules__panel se-rules__panel--wide"><Panel title="Turf and territory">
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

          <section id="business" className="se-rules__panel se-rules__panel--wide"><Panel title="Businesses, fronts and rackets">
            <ul className="se-list">
              <li>Blocks have fixed business lots. Holding the block lets you build, staff and upgrade the lots its tier has opened.</li>
              <li>Business staff still belong to your crew, but they are busy: they do not work the street, defend home or cook while assigned.</li>
              <li>Fronts burn supplies and fill capped registers. Home registers must be collected; away businesses sweep into the outpost box, so the cash still has to survive a run home.</li>
              <li>One racket can run at a time. Rackets add cash or a narrow system bonus, but they also add Heat and never replace paid recon, storage or other dedicated systems.</li>
              <li>Taking a built block takes the businesses with it, but war fatigue and block tiers keep a fresh conquest from paying like a stable holding. A Sack damages levels instead of taking the block.</li>
              <li>The federal turf crackdown also notices dirty fronts: staffed rackets still running in the swept city draw extra Heat. The warning gives you time to shut a racket down; clean fronts keep the normal turf penalty.</li>
            </ul>
          </Panel></section>

          <section id="law" className="se-rules__panel se-rules__panel--wide"><Panel title="The law: your Case">
            <ul className="se-list">
              <li>Heat is the noise; the Case is the memory. Every city&rsquo;s police keep their own Case on you, built from part of the Heat you draw there and from what they see: busts, arrests, road stops, torches, sacks, hijacks and big cash movements. Bribes take Heat off, never the Case.</li>
              <li>Your Case is private. Only you can see it, on the Case panel, with a receipt for every change. Nothing on a profile, a scout report or a public result shows it, and no other player can add to it.</li>
              <li>A Case climbs a ladder: Quiet, Noticed, Under Investigation, Warrant, Federal. Nothing on the ladder is rolled, and every rise tells you. Under Investigation shows what the detectives are looking at.</li>
              <li>At the Warrant stage a warrant names one target, your Hideout, a business or you personally, and gives a warning window before it is served. Move what you can, lawyer up to turn it into a fine, have a District Attorney quash it, or take it. Raids honour Safe Room protection, never take a block, and police losses are capped each day.</li>
              <li>A Case cools once you have been quiet in that city for a while. Laundering washes it too.</li>
              <li>Corrupt officials work for a weekly fee: a Captain warns earlier, a District Attorney slows a Case and can quash a warrant, a Judge softens raids and downtime, Customs eases airport checks. Every favour adds exposure; past a line Internal Affairs opens a file and warns you before any sting.</li>
              <li>Informants sell information, never protection: word on the federal sweep or a city&rsquo;s police.</li>
              <li>A local Case stays behind when you move house. A Case at the Federal stage follows you, and the move screen tells you before you confirm.</li>
              <li>Every Case starts at zero each season. Ledger, a retired records sergeant, has Jobs about the law, and a clean record earns titles at the end of a season.</li>
            </ul>
          </Panel></section>
          <section id="factions" className="se-rules__panel"><Panel title="Factions">
            <ul className="se-list">
              <li>Your contacts don&rsquo;t work alone. Most of them belong to an underworld faction: the Kings run the street, the Outfit the guns and protection, Road Saints MC the roads, the Cartel Line the product, and Civic Handshake the officials who take an envelope.</li>
              <li>A few contacts work for no one: Vic brokers between all of them, Ace runs the casino rooms, and Ledger never took an envelope.</li>
              <li>Factions have rivals. The Jobs page shows who each faction works with and against.</li>
              <li>Your contacts&rsquo; one-time Jobs earn their faction&rsquo;s standing, on top of the contact&rsquo;s own reputation. Standing climbs through Unknown, Known, Trusted, Connected and Inner Circle, starts at zero each season, and only you can see it.</li>
              <li>A Job earns standing only with the faction it works for and any faction it openly helps. Paying one contact never earns their rivals or friends anything, and siding with one contact in a branch earns only that side.</li>
              <li>Each faction has two Jobs of its own: the first opens at Known, the second at Trusted. Civic Handshake has no contact, so its first Job is open to anyone who puts an official on their payroll.</li>
              <li>Every daily, weekly, city, Season and alliance contract has a sponsor: the faction of the contact who gives it, or the faction whose lane the work is in. A finished contract pays its sponsor a little standing, shown before you accept it; an expired one pays nothing. Ace&rsquo;s casino work and Ledger&rsquo;s law work have no sponsor.</li>
              <li>Everyone in a round sees the same boards. When work could go to two factions (Vic&rsquo;s business and airport work, city sales and city trips), it is twice as likely to go to one you are Known with, and a board is never one faction&rsquo;s work alone when it could be otherwise.</li>
              <li>Standing comes only from your own Jobs and contracts: it can&rsquo;t be bought, traded or taken. Beyond opening faction Jobs, a tier is recognition for now; prices and odds work as before.</li>
            </ul>
          </Panel></section>
          <section id="rank" className="se-rules__panel se-rules__panel--wide"><Panel title="Money and rank">
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
      </div>
        </section>
      </div>
    </InfoLayout>
  );
}
