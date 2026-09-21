import { Link, useParams } from 'react-router-dom';
import { PublicPageHero } from '../components/PublicPageBits.js';

const guideTopics = [
  { slug: 'getting-started', title: 'Getting Started', blurb: 'Your first turns, crew growth, supplies and the basic seasonal loop.' },
  { slug: 'economy', title: 'Economy & Products', blurb: 'Scouting, working, production, stores, trader standing and product decisions.' },
  { slug: 'combat', title: 'Combat & Recon', blurb: 'Raids, drive-bys, wounds, protection windows and what Recon is for.' },
  { slug: 'travel', title: 'Travel & Convoys', blurb: 'Move between cities, run goods, manage road risk and protect convoys.' },
  { slug: 'turf', title: 'Turf', blurb: 'Claim districts, post muscle, defend blocks and fight for city control.' },
  { slug: 'alliances', title: 'Alliances', blurb: 'Create a crew, invite players, cooperate and compete on alliance standings.' },
  { slug: 'hideout', title: 'Hideouts', blurb: 'Seasonal room upgrades and the utility they add to your operation.' },
  { slug: 'seasons', title: 'Seasons & Legacy', blurb: 'How rounds end, rankings freeze and your public career survives resets.' },
] as const;

const guideCopy: Record<string, { title: string; intro: string; sections: Array<{ title: string; body: string }> }> = {
  'getting-started': {
    title: 'Getting Started',
    intro: 'StreetsEmpire is turn-driven. Your early job is to turn limited actions into a crew and economy that can survive the rest of the season.',
    sections: [
      { title: 'Start with the street loop', body: 'Scout and work districts to earn money, find product and grow your crew. Every action spends turns, so progress comes from choosing where those turns create the most value.' },
      { title: 'Keep the operation supplied', body: 'Crew performance is affected by the supplies your jobs need. Stores and trader relationships matter because running short can make otherwise profitable work much worse.' },
      { title: 'Watch public rank, protect private strength', body: 'Net worth and rank are public competition signals. Your actual cash, weapons, crew and inventory are private game state, and Recon exists to reveal only the information the rules intentionally allow.' },
    ],
  },
  economy: {
    title: 'Economy & Products',
    intro: 'The economy is more than cash: products, supplies, store access, city conditions and trader standing all affect what your next turn is worth.',
    sections: [
      { title: 'Scout and work', body: 'Districts have different identities and requirements. Scouting works the streets while also finding people and product, making it one of the main ways an operation grows.' },
      { title: 'Produce and trade', body: 'Production converts crew time, supplies and cash into product. Stores provide equipment and consumables while reputation/favors open better access over the season.' },
      { title: 'Cities change the decision', body: 'Travel-era rules give cities different traits, product conditions, police pressure and local district flavor. The public site describes that character without publishing hidden live market numbers.' },
    ],
  },
  combat: {
    title: 'Combat & Recon',
    intro: 'Combat is built around information, commitment and recovery rather than a single attack button.',
    sections: [
      { title: 'Raids and special attacks', body: 'Players can attack rival operations through raids and other combat forms. Results can change resources, create wounds and trigger protection/cooldown rules.' },
      { title: 'Recon matters', body: 'Private combat readiness is not exposed by the public website. Recon is the in-game system for learning target information, and the amount you can know depends on the game rules and your progression.' },
      { title: 'Recovery is part of strategy', body: 'Wounded crew and timing windows can change whether an operation is ready for another fight. Public feeds show outcomes that are intended to be public, not the private calculation behind them.' },
    ],
  },
  travel: {
    title: 'Travel & Convoys',
    intro: 'Travel expands the economy from one city into a connected world of routes, markets and risk.',
    sections: [
      { title: 'Run goods between cities', body: 'Travel runs carry vehicles, escorts, cash and cargo away from home. Routes take real time and turns, and city conditions make destinations feel different.' },
      { title: 'Risk follows the road', body: 'Police pressure, road incidents and rival convoy activity can interrupt a run. Escorts and timing reduce some risks but do not make travel automatic profit.' },
      { title: 'Relocation changes home', body: 'A run is temporary; relocation moves the operation itself. Your home city affects local district, store and turf context for the rest of the season.' },
    ],
  },
  turf: {
    title: 'Turf',
    intro: 'Turf turns districts into persistent territory that players can hold, work, reinforce and fight over.',
    sections: [
      { title: 'Claim and post', body: 'A held block ties up posted crew and equipment. That commitment creates benefits for the holder but also makes the block a visible target.' },
      { title: 'Pushes become public history', body: 'Turf pushes can transfer control after a real fight. Successful captures are intentionally public and appear on the public turf feed and season history.' },
      { title: 'Alliances can shape city control', body: 'Alliance membership lets multiple players accumulate presence across a city. Territory history records control changes so a season can be reconstructed after it ends.' },
    ],
  },
  alliances: {
    title: 'Alliances',
    intro: 'Alliances are seasonal groups that coordinate players without replacing individual rankings.',
    sections: [
      { title: 'Create, invite and lead', body: 'Alliance leaders recruit members and manage the group. Membership changes have cooldowns so alliances cannot be swapped instantly to dodge consequences.' },
      { title: 'Combined public standing', body: 'The public alliance board ranks current groups by the combined public net worth of active members and also shows their current turf presence.' },
      { title: 'Season-scoped identity', body: 'Alliances belong to a round. Historical season pages preserve final alliance membership and standings without pretending a later group with the same tag is automatically the same organization.' },
    ],
  },
  hideout: {
    title: 'Hideouts',
    intro: 'Hideouts are seasonal progression rooms that add utility to an operation and reset naturally with the next round.',
    sections: [
      { title: 'Build over the season', body: 'Rooms are upgraded in levels, turning cash/progression into longer-term utility instead of immediate inventory.' },
      { title: 'Different rooms, different jobs', body: 'Rooms such as the Safe Room, Lookouts, Workshop, Back Office and Garage are intended to support different parts of the economy, combat awareness and travel systems.' },
      { title: 'Seasonal, not permanent power', body: 'Hideout levels are stored on the round player, so each new season starts a fresh competitive build while past seasons keep their final public history.' },
    ],
  },
  seasons: {
    title: 'Seasons & Legacy',
    intro: 'StreetsEmpire is designed around finite competitive games instead of one server that grows forever.',
    sections: [
      { title: 'A round has a beginning and end', body: 'Each game pins a ruleset and schedule. When the season closes, mutable play stops and final ranks become permanent historical results.' },
      { title: 'The game resets, the record does not', body: 'Cash, crew, inventory, turf and hideouts are seasonal. Public career history, championships and completed-game records let players build a legacy across resets.' },
      { title: 'Archives use frozen results', body: 'The public website reads ended/archived rounds for final standings rather than recalculating old rankings under newer balance rules.' },
    ],
  },
};

export function GamePage() {
  const systems = [
    ['Street Economy', 'Scout districts, work your crew, produce goods and build trader relationships.'],
    ['Combat', 'Recon rivals, raid operations, manage wounds and time protection windows.'],
    ['Travel', 'Run cargo between distinct cities, deal with road risk and protect convoys.'],
    ['Turf', 'Hold districts, post muscle and fight over long-lived territory.'],
    ['Alliances', 'Organize seasonal groups and compete on combined public standings.'],
    ['Seasons', 'Fight through a finite game, freeze final results and build a career across resets.'],
  ] as const;
  return <div className="site-page"><PublicPageHero eyebrow="The game" title="Build an empire one decision at a time."><p>StreetsEmpire is a seasonal browser strategy game built around turns, information, economy, conflict and public competition.</p></PublicPageHero>
    <section className="site-section site-section--tight"><div className="container public-game-stack"><div className="content-grid">{systems.map(([title,body])=><article className="content-card" key={title}><h2>{title}</h2><p>{body}</p></article>)}</div>
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

export function RoadmapPage() {
  const milestones = [
    ['0.6.0', 'Turf', 'Territory, pushes, city control, public turf history and the systems that make districts worth fighting over.'],
    ['0.7.0', 'Hideouts', 'Seasonal rooms and longer-term operation upgrades.'],
    ['0.8.0', 'Stores & Economy', 'Deeper shops, pricing, stock, traders and economic decision-making.'],
    ['0.9.0', 'Community', 'Polish the social layer, public profiles, notifications and community-facing systems.'],
    ['1.0.0', 'Launch & Hardening', 'Stability, onboarding, balance validation, deployment hardening and launch readiness.'],
  ] as const;
  return <div className="site-page"><PublicPageHero eyebrow="Development" title="Roadmap"><p>The public view of the major StreetsEmpire milestones. Detailed balance work stays in the development docs; this page focuses on player-facing direction.</p></PublicPageHero>
    <section className="site-section site-section--tight"><div className="container roadmap-list">{milestones.map(([version,title,body],i)=><article className="roadmap-item" key={version}><div className="roadmap-item__marker">{i+1}</div><div><span className="site-card__eyebrow">{version}</span><h2>{title}</h2><p>{body}</p></div></article>)}</div></section></div>;
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
    <section className="site-section site-section--tight"><div className="container"><div className="site-panel beta-warning"><span className="site-status-badge">Beta environment</span><h2>Data may be reset.</h2><p>The beta game is for testing and validation. Progress there is not production progress and can be wiped when a feature or schema needs a clean test.</p><a className="btn btn-primary" href="https://beta.streetsempire.dev">Open Beta Game</a></div></div></section></div>;
}

export function SupportPage() {
  const benefits = ['Supporter badge', 'Profile customization and themes', 'Extra historical/stat views', 'Community role', 'Early development posts', 'Cosmetic username/profile effects'];
  return <div className="site-page"><PublicPageHero eyebrow="Support the project" title="Help keep StreetsEmpire running"><p>Support should fund hosting and development without buying competitive power.</p></PublicPageHero>
    <section className="site-section site-section--tight"><div className="container public-two-column"><section className="site-panel"><span className="site-card__eyebrow">Policy</span><h2>No pay-to-win.</h2><p className="content-lead">A supporter plan should never sell stronger weapons, extra cash, extra combat strength, hidden intelligence or other advantages that change who wins a season.</p></section>
    <section className="site-panel"><span className="site-card__eyebrow">Planned supporter value</span><h2>Cosmetic and community benefits</h2><ul className="site-feature-list">{benefits.map(x=><li key={x}>{x}</li>)}</ul><p className="public-empty">Checkout is not enabled on the public site yet.</p></section></div></section></div>;
}

export function AboutPage() {
  return <div className="site-page"><PublicPageHero eyebrow="About" title="About StreetsEmpire"><p>A modern seasonal browser strategy game built around turns, risk, information and public competition.</p></PublicPageHero>
    <section className="site-section site-section--tight"><div className="container content-grid"><article className="content-card"><h2>Readable decisions</h2><p>Turns, crews, public rankings and rivalry keep the game easy to follow while deeper systems reward planning.</p></article><article className="content-card"><h2>Seasonal competition</h2><p>Finite games prevent permanent snowballing. A reset starts a new contest while archives preserve what happened before.</p></article><article className="content-card"><h2>Information has value</h2><p>Public competition data is intentionally separated from private operational state. Recon and in-game progression decide what rivals can actually learn.</p></article><article className="content-card"><h2>Built in public</h2><p>The public website, forum, beta environment and roadmap give the project a home beyond the live game client.</p></article></div></section></div>;
}
