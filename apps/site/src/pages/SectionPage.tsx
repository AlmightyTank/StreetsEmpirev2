import { Link } from 'react-router-dom';

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
