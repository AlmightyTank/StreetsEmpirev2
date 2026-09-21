export function App() {
  return (
    <div className="site-shell">
      <header className="site-header">
        <div className="container site-header__inner">
          <a className="site-brand" href="/" aria-label="StreetsEmpire home">
            STREETSEMPIRE
          </a>

          <nav className="site-actions" aria-label="Game links">
            <a className="btn btn-outline-light btn-sm" href="https://beta.streetsempire.dev">
              Beta
            </a>
            <a className="btn btn-primary btn-sm" href="https://play.streetsempire.dev">
              Play Now
            </a>
          </nav>
        </div>
      </header>

      <main>
        <section className="site-hero">
          <div className="container">
            <p className="site-kicker">Public website foundation</p>
            <h1>Build your crew. Control the streets. Build an empire.</h1>
            <p className="site-lead">
              This is the new standalone StreetsEmpire public website application.
              Game information, seasons, rankings, cities, turf, news and guides will
              be added here without coupling the public site to the live game UI.
            </p>
            <div className="site-hero__actions">
              <a className="btn btn-primary" href="https://play.streetsempire.dev">
                Play StreetsEmpire
              </a>
              <a className="btn btn-outline-light" href="https://beta.streetsempire.dev">
                Enter Beta
              </a>
            </div>
          </div>
        </section>

        <section className="container site-foundation">
          <div>
            <span className="site-foundation__label">Public site</span>
            <strong>streetsempire.dev</strong>
          </div>
          <div>
            <span className="site-foundation__label">Live game</span>
            <strong>play.streetsempire.dev</strong>
          </div>
          <div>
            <span className="site-foundation__label">Beta game</span>
            <strong>beta.streetsempire.dev</strong>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container">
          <span>StreetsEmpire</span>
          <span className="site-footer__note">Public website foundation</span>
        </div>
      </footer>
    </div>
  );
}
