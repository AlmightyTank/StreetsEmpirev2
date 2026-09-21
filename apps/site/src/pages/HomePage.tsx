import { Link } from 'react-router-dom';

const sections = [
  { to: '/games', eyebrow: 'Seasons', title: 'Current & Past Games', body: 'Follow the current season and browse the permanent history of completed StreetsEmpire games.' },
  { to: '/rankings', eyebrow: 'Competition', title: 'Rankings', body: 'Track the public leaderboards, movement and the crews fighting for the top spots.' },
  { to: '/cities', eyebrow: 'World', title: 'Cities', body: 'Explore the cities, their districts and the public face of each local economy.' },
  { to: '/turf', eyebrow: 'Control', title: 'Turf', body: 'See district control, city power and the public history of the fight for territory.' },
  { to: '/hall-of-fame', eyebrow: 'Legacy', title: 'Hall of Fame', body: 'Celebrate season champions, long-running records and the strongest careers in game history.' },
  { to: '/guide', eyebrow: 'Learn', title: 'How to Play', body: 'Learn the core StreetsEmpire systems from your first turns through combat, travel and turf.' },
] as const;

export function HomePage() {
  return (
    <>
      <section className="site-hero">
        <div className="container">
          <p className="site-kicker">Online crime strategy</p>
          <h1>Build your crew. Control the streets. Build an empire.</h1>
          <p className="site-lead">
            StreetsEmpire is a seasonal browser strategy game about building a crew,
            managing an operation, traveling between cities, fighting rivals and taking
            control of the streets.
          </p>
          <div className="site-hero__actions">
            <a className="btn btn-primary btn-lg" href="https://play.streetsempire.dev">Play StreetsEmpire</a>
            <Link className="btn btn-outline-light btn-lg" to="/game">Explore the Game</Link>
          </div>
        </div>
      </section>

      <section className="site-strip" aria-label="Website destinations">
        <div className="container site-strip__grid">
          <div><span>Public Hub</span><strong>streetsempire.dev</strong></div>
          <div><span>Live Game</span><strong>play.streetsempire.dev</strong></div>
          <div><span>Test Server</span><strong>beta.streetsempire.dev</strong></div>
          <div><span>Community</span><strong>forum.streetsempire.dev</strong></div>
        </div>
      </section>

      <section className="site-section">
        <div className="container">
          <div className="site-section__head">
            <div>
              <p className="site-kicker">The StreetsEmpire hub</p>
              <h2>More than a login screen.</h2>
            </div>
            <p>This public site is being built as the place to follow the game, its world, its players and its history without exposing private in-game intelligence.</p>
          </div>

          <div className="site-card-grid">
            {sections.map((section) => (
              <Link className="site-card" key={section.to} to={section.to}>
                <span className="site-card__eyebrow">{section.eyebrow}</span>
                <h3>{section.title}</h3>
                <p>{section.body}</p>
                <span className="site-card__link">Explore →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="site-cta">
        <div className="container site-cta__inner">
          <div>
            <p className="site-kicker">Ready to hit the streets?</p>
            <h2>Your next empire starts in the live game.</h2>
          </div>
          <a className="btn btn-primary btn-lg" href="https://play.streetsempire.dev">Play Now</a>
        </div>
      </section>
    </>
  );
}
