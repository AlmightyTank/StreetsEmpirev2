import { Link, useParams } from 'react-router-dom';

export type SectionPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  planned: readonly string[];
};

export function SectionPage({ eyebrow, title, description, planned }: SectionPageProps) {
  return (
    <div className="site-page">
      <section className="site-page-hero">
        <div className="container">
          <p className="site-kicker">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </section>

      <section className="site-section site-section--tight">
        <div className="container">
          <div className="site-panel">
            <div className="site-panel__head">
              <div>
                <span className="site-status-badge">Phase 3 shell</span>
                <h2>What this page will contain</h2>
              </div>
            </div>
            <ul className="site-feature-list">
              {planned.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

export function CityDetailPage() {
  const { citySlug } = useParams();
  const title = citySlug
    ? citySlug.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
    : 'City';
  return <SectionPage eyebrow="City profile" title={title} description="A public city profile with districts, control and local game context." planned={['City overview and identity', 'District directory', 'Public turf control', 'Public market and activity context']} />;
}

export function GuideDetailPage() {
  const { topic } = useParams();
  const title = topic
    ? topic.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
    : 'Guide';
  return <SectionPage eyebrow="How to play" title={title} description="A focused StreetsEmpire guide for one game system." planned={['System overview', 'Core rules and terminology', 'Player-facing examples', 'Links to related systems']} />;
}

export function GameDetailPage() {
  const { gameId } = useParams();
  return <SectionPage eyebrow="Season archive" title={gameId ? 'Game #' + gameId : 'Game'} description="A permanent public record for one StreetsEmpire season." planned={['Final standings and champion', 'Alliance and city results', 'Season-wide statistics and records', 'Major public events and milestones']} />;
}

export function PlayerDetailPage() {
  const { playerId } = useParams();
  return <SectionPage eyebrow="Public career" title={playerId ? 'Player #' + playerId : 'Player'} description="A public career profile built only from information intended for public view." planned={['Career season history', 'Public finishes and achievements', 'Championship and Hall of Fame badges', 'Public alliance history']} />;
}

export function AllianceDetailPage() {
  const { tag } = useParams();
  return <SectionPage eyebrow="Alliance profile" title={tag ? '[' + tag.toUpperCase() + ']' : 'Alliance'} description="A public profile for a StreetsEmpire alliance and its seasonal legacy." planned={['Public roster', 'Season standings', 'Turf and city presence', 'Historical finishes and awards']} />;
}

export function NewsDetailPage() {
  const { slug } = useParams();
  return <SectionPage eyebrow="StreetsEmpire news" title={slug ? slug.split('-').join(' ') : 'News article'} description="A permanent public page for an official StreetsEmpire announcement." planned={['Article content from the game news system', 'Published date and update category', 'Related release or season links', 'Share-friendly public metadata']} />;
}

export function NotFoundPage() {
  return (
    <div className="site-page">
      <section className="site-page-hero">
        <div className="container">
          <p className="site-kicker">404</p>
          <h1>That block doesn't exist.</h1>
          <p>The page may have moved, or the address may be wrong.</p>
          <Link className="btn btn-primary" to="/">Back to StreetsEmpire</Link>
        </div>
      </section>
    </div>
  );
}
