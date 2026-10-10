import { Link, useParams } from 'react-router-dom';
import { PublicPageHero } from '../components/PublicPageBits.js';

const guideTopics = [
  { slug: 'getting-started', title: 'Getting Started', blurb: 'Your first turns, crew growth, supplies, Jobs and the basic seasonal loop.' },
  { slug: 'economy', title: 'Economy & Products', blurb: 'Scouting, working, production, stores, trader standing and product decisions.' },
  { slug: 'combat', title: 'Combat & Recon', blurb: 'Raids, drive-bys, wounds, protection windows and what Recon is for.' },
  { slug: 'travel', title: 'Travel, Runs & Vehicles', blurb: 'Move between cities, load a fleet of Low-Riders, Sedans and Vans, and manage road risk.' },
  { slug: 'turf', title: 'Turf & Block Wars', blurb: 'Claim districts, post muscle, defend blocks and fight for city control.' },
  { slug: 'businesses', title: 'Businesses & Rackets', blurb: 'Build fronts on the blocks you hold, staff them, run a racket and protect the register.' },
  { slug: 'law', title: 'The Law & Your Case', blurb: 'Heat, the private Case each city keeps on you, warrants, lawyers and corruption.' },
  { slug: 'factions', title: 'Factions & Contracts', blurb: 'Five underworld factions, the contracts they sponsor and what their standing unlocks.' },
  { slug: 'casino', title: 'The Casino', blurb: 'Slots, blackjack, roulette, street dice and poker tables, with chips you earned in the game.' },
  { slug: 'alliances', title: 'Alliances', blurb: 'Create a crew, invite players, cooperate and compete on alliance standings.' },
  { slug: 'hideout', title: 'Hideouts', blurb: 'Seasonal rooms, including the Garage, and the utility they add to your operation.' },
  { slug: 'street-pass', title: 'Street Pass', blurb: 'A free 30-tier reward track you fill by playing, with in-round boosts and permanent cosmetics.' },
  { slug: 'seasons', title: 'Seasons & Legacy', blurb: 'How rounds end, rankings freeze and your public career survives resets.' },
] as const;

const guideCopy: Record<string, { title: string; intro: string; sections: Array<{ title: string; body: string }> }> = {
  'getting-started': {
    title: 'Getting Started',
    intro: 'StreetsEmpire is turn-driven. Your early job is to turn limited actions into a crew and economy that can survive the rest of the season.',
    sections: [
      { title: 'Start with the street loop', body: 'Scout and work districts to earn money, find product and grow your crew. Every action spends turns, so progress comes from choosing where those turns create the most value.' },
      { title: 'Follow the Jobs', body: 'Your contacts hand out Jobs that walk you through each system and open new shelves as you go: Tommy’s guns, Pip’s products and Charlie’s vehicles all start locked. Daily and weekly contracts keep paying once the story Jobs are done.' },
      { title: 'Keep the operation supplied', body: 'Crew performance is affected by the supplies your jobs need. Stores and trader relationships matter because running short can make otherwise profitable work much worse.' },
      { title: 'Watch public rank, protect private strength', body: 'Net worth and rank are public competition signals. Your actual cash, weapons, crew and inventory are private game state, and Recon exists to reveal only the information the rules intentionally allow.' },
    ],
  },
  economy: {
    title: 'Economy & Products',
    intro: 'The economy is more than cash: products, supplies, store access, city conditions and trader standing all affect what your next turn is worth.',
    sections: [
      { title: 'Scout and work', body: 'Districts have different identities and requirements. Scouting works the streets while also finding people and product, making it one of the main ways an operation grows.' },
      { title: 'Produce and trade', body: 'Production converts crew time, supplies and cash into product. Stores provide equipment and consumables while reputation and favors can improve your terms or access over the season.' },
      { title: 'Read the Store before you buy', body: 'Store cards show price context, stock pressure, trader standing and incoming shipments. A sold-out eligible shelf can sometimes be special-ordered for an extra sourcing fee instead of waiting for the normal delivery.' },
      { title: 'Use the basket for supply runs', body: 'Add several Store lines to one basket, review the total, then check out once. The server reprices and validates the whole order together, so stale stock or an invalid line cannot silently create a partial purchase.' },
      { title: 'Cities change the decision', body: 'Each city has its own traits, product prices, police pressure and district flavor, so the same product is worth more in some places than others. The public site describes that character without publishing hidden live market numbers.' },
    ],
  },
  combat: {
    title: 'Combat & Recon',
    intro: 'Combat is built around information, commitment and recovery rather than a single attack button.',
    sections: [
      { title: 'Raids and special attacks', body: 'Players can attack rival operations through raids, drive-bys and special raid forms. Results can change resources, create wounds and trigger protection and cooldown rules.' },
      { title: 'Recon matters', body: 'Private combat readiness is not exposed by the public website. Recon is the in-game system for learning target information, and the amount you can know depends on the game rules and your progression.' },
      { title: 'Recovery is part of strategy', body: 'Wounded crew and timing windows can change whether an operation is ready for another fight. Public feeds show outcomes that are intended to be public, not the private calculation behind them.' },
      { title: 'Violence draws attention', body: 'Fights, torches and sacks are things the police notice. Combat can win you a block and still build the Case a city keeps on you.' },
    ],
  },
  travel: {
    title: 'Travel, Runs & Vehicles',
    intro: 'Travel expands the economy from one city into a connected map of routes, markets and risk, and your fleet decides what a run can carry.',
    sections: [
      { title: 'Run goods between cities', body: 'Runs carry vehicles, crew, cash and cargo away from home along real routes across the lower 48. Routes take real time and turns, and each destination has its own prices and police.' },
      { title: 'Pick the right vehicles', body: 'Low-Riders are the all-purpose street car and the one drive-bys need. Sedans are small and quieter on the road. Vans haul the biggest loads but draw more eyes. Runs can mix classes, and the planner shows seats, cargo and route risk before you leave.' },
      { title: 'Garage service', body: 'A bust, an arrest or a lost convoy fight can leave a vehicle Damaged or Disabled. The Garage tab repairs and recovers them for a price, and an Auto Garage, a Chop Shop racket or Road Saints standing can make that cheaper.' },
      { title: 'Risk follows the road', body: 'Police stops, road incidents and rival convoy hits can interrupt a run. Escorts, vehicle choice and timing reduce some risks, but no vehicle makes travel automatic profit.' },
      { title: 'Relocation changes home', body: 'A run is temporary; relocation moves the operation itself. Your home city sets your local districts, stores and turf for the rest of the season.' },
    ],
  },
  turf: {
    title: 'Turf & Block Wars',
    intro: 'Turf turns districts into persistent territory that players can hold, work, build on and fight over.',
    sections: [
      { title: 'Claim and post', body: 'A held block ties up posted crew and equipment. That commitment creates benefits for the holder but also makes the block a visible target.' },
      { title: 'Block wars', body: 'Taking a block from another player is a war, not a single hit. Attackers declare, lay siege and fight for control while defenders break the siege, concede or call a truce. A war can aim to take the block or to sack it, and every war settles within its time limit.' },
      { title: 'Captures become public history', body: 'Successful captures are intentionally public and appear on the public turf feed and season history, so a season can be reconstructed after it ends.' },
      { title: 'Alliances can shape city control', body: 'Alliance membership lets multiple players build presence across a city and help each other in block wars.' },
    ],
  },
  businesses: {
    title: 'Businesses & Rackets',
    intro: 'Holding a block gives you its business lots. What you build there turns street control into an operation worth protecting.',
    sections: [
      { title: 'Every block has its lots', body: 'Lots are fixed by district, so the block you fight for decides what you can build: a Nightclub, Chop Shop, Pawn Shop, Laundromat, Casino Front and more. Lots start empty, so a block’s value comes from the crews who invest in it.' },
      { title: 'Build, staff and collect', body: 'Build and upgrade a business, staff it and keep it supplied. Its register fills over time up to a cap, so income needs you to come back and collect it.' },
      { title: 'Choose one racket', body: 'Each business runs one racket that hooks into another system, such as recon, runs, stores, product, vehicle recovery or laundering. Rackets have switching cooldowns and draw Heat.' },
      { title: 'Protect what you built', body: 'A captured block keeps its businesses, but they pay less until war fatigue wears off. Businesses can also be torched or sacked. Away from home, businesses empty into an outpost that a collection run brings back.' },
    ],
  },
  law: {
    title: 'The Law & Your Case',
    intro: 'Heat is the noise you make today. The Case is what each city’s police remember about you.',
    sections: [
      { title: 'One private Case per city', body: 'Every city keeps a Case on you, built from part of the Heat you draw there and from what the police see: busts, arrests, road stops, torches, sacks, convoy hits and large cash movements. Only you can see it, and no other player can add to it.' },
      { title: 'The Wanted ladder', body: 'Quiet, Noticed, Under Investigation, Warrant, Federal. Nothing on the ladder is rolled, every change has a receipt, and every rise is announced on your dashboard. A quiet stretch cools a Case, and laundering washes it.' },
      { title: 'Warrants and raids', body: 'At the Warrant stage the police serve a warrant with a warning period first, then raid a Hideout, a business or you personally. Daily caps limit what any raid can take. A lawyer on retainer, or lawyering up when a warrant lands, answers it.' },
      { title: 'Corruption has a price', body: 'Each city has a Captain, a DA, a Judge and Customs who can be put on a weekly payroll. Every favor adds exposure, and Internal Affairs runs stings with a warning. Informants sell sweep and city tips.' },
      { title: 'Cities police differently', body: 'Each city builds, cools and warns at its own pace. A federal case shortens the warning windows and follows you if you relocate.' },
    ],
  },
  factions: {
    title: 'Factions & Contracts',
    intro: 'Five underworld factions run these streets alongside the players: The Kings, The Outfit, Road Saints MC, The Cartel Line and Civic Handshake.',
    sections: [
      { title: 'Contracts earn standing', body: 'Daily, weekly, city, season and alliance contracts each carry a sponsoring faction and pay its standing. Every round deals its contract boards from its own deck, so no two seasons play the same. Each faction also has its own one-time Jobs.' },
      { title: 'What standing buys', body: 'Low tiers bring information and early warnings. Connected brings one small, capped advantage inside a system that already exists. Standing never pays an income stream, turns or combat strength.' },
      { title: 'Rivalries and the Inner Circle', body: 'Anyone can earn standing with every faction. Reaching the Inner Circle of one faction locks you out of its rival’s Inner Circle for the season, and the game shows the lock before you commit. The top tier brings a capstone Job, a title and a profile frame.' },
      { title: 'Public alignment', body: 'From Connected up, your profile shows which faction you are connected with. Exact standing and contract progress stay private.' },
    ],
  },
  casino: {
    title: 'The Casino',
    intro: 'Every city has a casino venue, from underground rooms to the full casino floor in Las Vegas. You earn money in the game and choose how much of it to risk.',
    sections: [
      { title: 'Chips stay in town', body: 'You exchange cash for chips at a city’s cage, and you have to be in that city to play. Away from home you can only buy chips with the cash you carried. Chips count toward net worth, so moving money through the cage never changes your rank.' },
      { title: 'The games', body: 'Three slot cabinets (Empire Gold carries the Vegas progressive), blackjack, roulette, street dice and Texas Hold’em tables. Which games a venue offers depends on the kind of room it is.' },
      { title: 'Poker tournaments', body: 'Poker tables feed a weekly tournament board that ranks players by return on their buy-ins, not by how much they bet, plus season records for the biggest single-table runs.' },
      { title: 'No real money', body: 'The casino uses game money only. Nothing is for sale that changes the odds, and gambling is never meant to be the main way to earn in a season.' },
    ],
  },
  alliances: {
    title: 'Alliances',
    intro: 'Alliances are seasonal groups that coordinate players without replacing individual rankings.',
    sections: [
      { title: 'Create, invite and lead', body: 'Alliance leaders recruit members and manage the group. Membership changes have cooldowns so alliances cannot be swapped instantly to dodge consequences.' },
      { title: 'Combined public standing', body: 'The public alliance board ranks current groups by the combined public net worth of active members and also shows their current turf presence.' },
      { title: 'Alliance contracts', body: 'Alliances get their own contracts to work on together, sponsored by the factions like every other board.' },
      { title: 'Season-scoped identity', body: 'Alliances belong to a round. Historical season pages preserve final alliance membership and standings without pretending a later group with the same tag is automatically the same organization.' },
    ],
  },
  hideout: {
    title: 'Hideouts',
    intro: 'The Hideout is your seasonal headquarters. Its rooms add utility to an operation and reset naturally with the next round.',
    sections: [
      { title: 'Build over the season', body: 'Rooms are upgraded in levels, turning cash and progression into longer-term utility instead of immediate inventory.' },
      { title: 'Different rooms, different jobs', body: 'The Safe Room, Lookouts, Workshop, Back Office and Garage each support a different part of the operation: protecting what you hold, seeing trouble coming, equipment, the books and your fleet.' },
      { title: 'A target for the law', body: 'A warrant can end in a Hideout raid, so what you keep at home is part of how you manage your Case.' },
      { title: 'Seasonal, not permanent power', body: 'Hideout levels belong to the round, so each new season starts a fresh competitive build while past seasons keep their final public history.' },
    ],
  },
  'street-pass': {
    title: 'Street Pass',
    intro: 'A free reward track that runs alongside every round. There is no paid track, now or later.',
    sections: [
      { title: 'Earn Street Cred by playing', body: 'Normal play earns Street Cred, which fills the pass’s 30 tiers over the season. Each tier has a reward to claim.' },
      { title: 'Boosts and keepsakes', body: 'Rewards mix in-round help (cash, crew, guns, product and favors) with permanent profile cosmetics, including a theme and a frame. The last tier is a season frame and title badge.' },
      { title: 'One pass per round', body: 'The pass resets with the round. Cosmetics you unlock stay on your account for good, and in-round rewards stay in the season they were earned.' },
    ],
  },
  seasons: {
    title: 'Seasons & Legacy',
    intro: 'StreetsEmpire is designed around finite competitive games instead of one server that grows forever.',
    sections: [
      { title: 'A round has a beginning and end', body: 'Each game pins a ruleset and schedule. When the season closes, mutable play stops and final ranks become permanent historical results.' },
      { title: 'The game resets, the record does not', body: 'Cash, crew, inventory, turf, businesses, faction standing and hideouts are seasonal. Public career history, championships, titles and cosmetics let players build a legacy across resets.' },
      { title: 'Archives use frozen results', body: 'The public website reads ended rounds for final standings rather than recalculating old rankings under newer balance rules.' },
    ],
  },
};

export function GamePage() {
  const systems = [
    ['Street Economy', 'Scout districts, work your crew, produce goods and build trader relationships across distinct city markets.'],
    ['Combat', 'Recon rivals, raid operations, manage wounds and time protection windows.'],
    ['Travel & Vehicles', 'Run cargo between cities with a fleet of Low-Riders, Sedans and Vans, and keep it repaired.'],
    ['Turf & Block Wars', 'Hold districts, post muscle and fight drawn-out wars over long-lived territory.'],
    ['Businesses', 'Build fronts on the blocks you hold, run a racket and keep the register safe.'],
    ['The Law', 'Every city keeps a private Case on you. Cool it, pay off officials, or lawyer up when the warrant lands.'],
    ['Factions', 'Work contracts for five underworld factions and pick a side when you reach the Inner Circle.'],
    ['Casino', 'Slots, table games and poker tournaments in every city, played with money you earned.'],
    ['Alliances', 'Organize seasonal groups and compete on combined public standings.'],
    ['Street Pass', 'A free 30-tier reward track with in-round boosts and permanent cosmetics.'],
    ['Seasons', 'Fight through a finite game, freeze final results and build a career across resets.'],
  ] as const;
  return <div className="site-page"><PublicPageHero eyebrow="The game" title="Build an empire one decision at a time."><p>StreetsEmpire is a seasonal browser strategy game built around turns, information, economy, conflict and public competition.</p></PublicPageHero>
    <section className="site-section site-section--tight"><div className="container public-game-stack"><div className="content-grid">{systems.map(([title,body])=><article className="content-card" key={title}><h2>{title}</h2><p>{body}</p></article>)}</div>
    <section className="site-panel content-callout"><div><span className="site-card__eyebrow">Coming next</span><h2>Supply Lines, on the beta server.</h2><p>Bulk orders, warehouses, dealer crews, three new cities and supply from abroad are being tested now. See the roadmap for what is live and what is next.</p></div><Link className="btn btn-outline-light" to="/roadmap">Roadmap</Link></section>
    <section className="site-panel content-callout"><div><span className="site-card__eyebrow">Seasonal by design</span><h2>Power resets. History stays.</h2><p>Each game has its own economy, crews, turf and alliances. When it ends, final standings and public history become part of the permanent archive.</p></div><Link className="btn btn-primary" to="/games">Browse Games</Link></section>
    </div></section></div>;
}

export function GuidePage() {
  return <div className="site-page"><PublicPageHero eyebrow="How to play" title="From your first turns to city control."><p>Learn the systems in focused guides without exposing hidden balance numbers that belong inside the game.</p></PublicPageHero>
    <section className="site-section site-section--tight"><div className="container"><div className="content-grid">{guideTopics.map(t=><Link className="content-card content-card--link" key={t.slug} to={`/guide/${t.slug}`}><span className="site-card__eyebrow">Guide</span><h2>{t.title}</h2><p>{t.blurb}</p><span className="site-card__link">Read guide →</span></Link>)}</div></div></section></div>;
}

export function GuideTopicPage() {
  const { topic = '' } = useParams();
  const article = guideCopy[topic];
  if (!article) return <div className="site-page"><PublicPageHero eyebrow="How to play" title="Guide not found"><p>That guide topic is not available.</p><Link className="btn btn-primary" to="/guide">All Guides</Link></PublicPageHero></div>;
  return <div className="site-page"><PublicPageHero eyebrow="How to play" title={article.title}><p>{article.intro}</p></PublicPageHero>
    <section className="site-section site-section--tight"><div className="container article-wrap"><article className="site-panel article-body">{article.sections.map(s=><section key={s.title}><h2>{s.title}</h2><p>{s.body}</p></section>)}<div className="archive-back"><Link className="btn btn-outline-light" to="/guide">← All Guides</Link><a className="btn btn-primary" href="https://play.streetsempire.dev">Play Now</a></div></article></div></section></div>;
}

type MilestoneStatus = 'Live' | 'On beta' | 'Planned';
const statusClass: Record<MilestoneStatus, string> = { Live: 'site-status-badge', 'On beta': 'site-status-badge site-status-badge--beta', Planned: 'site-status-badge site-status-badge--planned' };

export function RoadmapPage() {
  const milestones: ReadonlyArray<readonly [string, string, MilestoneStatus, string]> = [
    ['0.1–0.5', 'Foundations', 'Live', 'Turns, the street economy, combat and Recon, products and production, and travel between cities.'],
    ['0.6.0', 'Turf', 'Live', 'Territory, holding blocks, city control, outposts and public turf history.'],
    ['0.7.0', 'Hideouts', 'Live', 'The Hideout as your seasonal headquarters, with rooms tied into combat, products, travel and turf.'],
    ['0.8.0', 'Stores & Economy', 'Live', 'Deeper shops, pricing, stock, traders, special orders and the store basket.'],
    ['0.9.0', 'Community', 'Live', 'Public profiles, the Pimp Console, notifications and community-facing systems.'],
    ['1.0.0', 'Launch & Hardening', 'Live', 'Stability, onboarding, balance validation, account security and launch readiness.'],
    ['1.1.0', 'Businesses, Fronts & Rackets', 'Live', 'Business lots on every block, rackets, block wars, and outposts that collection runs empty.'],
    ['1.2.0', 'Casino & Gambling', 'Live', 'A casino in every city: slots, blackjack, roulette, street dice, poker tables and weekly tournaments.'],
    ['1.3.0', 'Law, Wanted Level & Corruption', 'Live', 'A private Case in every city, warrants and raids, lawyers, officials on the payroll and the Feds.'],
    ['1.4.0', 'Factions & Contracts', 'Live', 'Five underworld factions, sponsored contract boards, standing perks, rivalries and the Inner Circle.'],
    ['1.5.0', 'Vehicles & Garage 2.0', 'Live', 'Sedans and Vans alongside the Low-Rider, mixed run loadouts, garage repair and recovery, and San Francisco.'],
    ['1.6.0', 'Supply Lines & City Footprints', 'On beta', 'Bulk orders from suppliers, pickups in loads, warehouses and safehouses, dealer crews that sell for you, Chicago, Tulsa and Dallas, and supply lanes from abroad.'],
    ['1.7', 'Crew Identity & Management', 'Planned', 'Crew roles and a few rare specialists that make the empire feel personal without becoming a character simulator.'],
    ['1.8', 'Competitive & World Events', 'Planned', 'Occasional disruptions and objectives across a season, such as crackdowns, shortages and boom weeks.'],
  ];
  return <div className="site-page"><PublicPageHero eyebrow="Development" title="Roadmap"><p>The public view of the major StreetsEmpire milestones: what is live, what is being tested on the beta server and what is planned. Detailed balance work stays in the development docs; this page focuses on player-facing direction.</p></PublicPageHero>
    <section className="site-section site-section--tight"><div className="container roadmap-list">{milestones.map(([version,title,status,body],i)=><article className="roadmap-item" key={version}><div className="roadmap-item__marker">{i+1}</div><div><div className="roadmap-item__head"><span className="site-card__eyebrow">{version}</span><span className={statusClass[status]}>{status}</span></div><h2>{title}</h2><p>{body}</p></div></article>)}</div></section></div>;
}

export function CommunityPage() {
  return <div className="site-page"><PublicPageHero eyebrow="Community" title="The StreetsEmpire community"><p>Play together, recruit, follow announcements and talk about the game outside a live season.</p></PublicPageHero>
    <section className="site-section site-section--tight"><div className="container content-grid">
      <a className="content-card content-card--link" href="https://forum.streetsempire.dev"><span className="site-card__eyebrow">Forum</span><h2>StreetsEmpire Forum</h2><p>Long-form discussion, announcements and alliance recruitment.</p><span className="site-card__link">Open forum →</span></a>
      <Link className="content-card content-card--link" to="/news"><span className="site-card__eyebrow">Official</span><h2>News</h2><p>Season announcements and development updates from the StreetsEmpire team.</p><span className="site-card__link">Read news →</span></Link>
      <Link className="content-card content-card--link" to="/alliances"><span className="site-card__eyebrow">Compete together</span><h2>Alliances</h2><p>See the groups currently fighting for combined wealth and turf.</p><span className="site-card__link">Alliance board →</span></Link>
    </div></section></div>;
}

export function BetaPage() {
  return <div className="site-page"><PublicPageHero eyebrow="Test server" title="StreetsEmpire Beta"><p>Upcoming features can be tested separately from the live game.</p></PublicPageHero>
    <section className="site-section site-section--tight"><div className="container public-game-stack"><div className="site-panel beta-warning"><span className="site-status-badge">Beta environment</span><h2>Data may be reset.</h2><p>The beta game is for testing and validation. Progress there is not production progress and can be wiped when a feature or schema needs a clean test.</p><a className="btn btn-primary" href="https://beta.streetsempire.dev">Open Beta Game</a></div>
    <section className="site-panel content-callout"><div><span className="site-card__eyebrow">Testing now</span><h2>1.6.0 Supply Lines & City Footprints</h2><p>Order in bulk, collect in loads, store stock in warehouses, and set up dealer crews that sell it for you, in three new cities and with supply lanes from abroad. Random street encounters, some of them with named NPC crews, are being tested alongside it.</p></div><Link className="btn btn-outline-light" to="/roadmap">Roadmap</Link></section></div></section></div>;
}

export function SupportPage() {
  const benefits = ['Supporter badge', 'Profile customization and themes', 'Extra historical/stat views', 'Community role', 'Early development posts', 'Cosmetic username/profile effects'];
  return <div className="site-page"><PublicPageHero eyebrow="Support the project" title="Help keep StreetsEmpire running"><p>Support should fund hosting and development without buying competitive power.</p></PublicPageHero>
    <section className="site-section site-section--tight"><div className="container public-two-column"><section className="site-panel"><span className="site-card__eyebrow">Policy</span><h2>No pay-to-win.</h2><p className="content-lead">A supporter plan should never sell stronger weapons, extra cash, extra combat strength, hidden intelligence or other advantages that change who wins a season. The Street Pass stays free, and the casino never takes real money.</p></section>
    <section className="site-panel"><span className="site-card__eyebrow">Planned supporter value</span><h2>Cosmetic and community benefits</h2><ul className="site-feature-list">{benefits.map(x=><li key={x}>{x}</li>)}</ul><p className="public-empty">Checkout is not enabled on the public site yet.</p></section></div></section></div>;
}

export function AboutPage() {
  return <div className="site-page"><PublicPageHero eyebrow="About" title="About StreetsEmpire"><p>A modern seasonal browser strategy game built around turns, risk, information and public competition.</p></PublicPageHero>
    <section className="site-section site-section--tight"><div className="container content-grid"><article className="content-card"><h2>Readable decisions</h2><p>Turns, crews, public rankings and rivalry keep the game easy to follow while deeper systems reward planning.</p></article><article className="content-card"><h2>Seasonal competition</h2><p>Finite games prevent permanent snowballing. A reset starts a new contest while archives preserve what happened before.</p></article><article className="content-card"><h2>Information has value</h2><p>Public competition data is intentionally separated from private operational state. Recon and in-game progression decide what rivals can actually learn.</p></article><article className="content-card"><h2>Built in public</h2><p>The public website, forum, beta environment and roadmap give the project a home beyond the live game client.</p></article></div></section></div>;
}
