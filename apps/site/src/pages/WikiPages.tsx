import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { guideCopy, guideTopics } from './ContentPages.js';
import { PublicPageHero } from '../components/PublicPageBits.js';

type Category = { title: string; blurb: string; slugs: string[] };

const categories: Category[] = [
  {
    title: 'Start here',
    blurb: 'New to the streets? Read these first.',
    slugs: ['getting-started', 'seasons', 'street-pass'],
  },
  {
    title: 'Make money',
    blurb: 'Turns into cash, crew and product.',
    slugs: ['economy', 'businesses', 'travel'],
  },
  {
    title: 'Fight & defend',
    blurb: 'Turf, combat and staying out of jail.',
    slugs: ['turf', 'combat', 'law'],
  },
  {
    title: 'People & places',
    blurb: 'Factions, crews, hideouts and the casino.',
    slugs: ['factions', 'alliances', 'hideout', 'casino'],
  },
];

const topicBySlug: Map<string, { slug: string; title: string; blurb: string }> = new Map(
  guideTopics.map((t) => [t.slug, { slug: t.slug, title: t.title, blurb: t.blurb }] as const),
);
const flatOrder = categories.flatMap((c) => c.slugs);

function categoryOf(slug: string): string {
  return categories.find((c) => c.slugs.includes(slug))?.title ?? 'Wiki';
}

export function WikiIndexPage() {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = (slug: string) => {
    if (!q) return true;
    const topic = topicBySlug.get(slug);
    if (!topic) return false;
    return (topic.title + ' ' + topic.blurb + ' ' + categoryOf(slug)).toLowerCase().includes(q);
  };
  const visibleCats = categories
    .map((cat) => ({ ...cat, slugs: cat.slugs.filter(matches) }))
    .filter((cat) => cat.slugs.length > 0);
  return (
    <div className="site-page">
      <PublicPageHero eyebrow="Wiki" title="Learn the game, at your pace.">
        <p>
          Short, plain-language guides to every part of StreetsEmpire. No account needed.
          Start with the basics, then dig into whatever interests you.
        </p>
        <div className="site-search-form wiki-search" role="search">
          <label htmlFor="wiki-search">Filter guides</label>
          <div>
            <input
              id="wiki-search"
              type="search"
              placeholder="Try “money”, “turf”, “law”…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query ? <button className="btn btn-outline-light" type="button" onClick={() => setQuery('')}>Clear</button> : null}
          </div>
        </div>
        <div className="archive-back">
          <Link className="btn btn-primary" to="/wiki/getting-started">Start with the basics</Link>
          <Link className="btn btn-outline-light" to="/search">Search players & seasons</Link>
        </div>
      </PublicPageHero>

      <section className="site-section site-section--tight">
        <div className="container wiki-stack">
          {q && visibleCats.length === 0 ? (
            <div className="site-panel public-state">
              <strong>No guides match “{query.trim()}”.</strong>
              <p>Try “money”, “turf” or “law” — or browse everything below.</p>
              <div className="archive-back">
                <button className="btn btn-outline-light" type="button" onClick={() => setQuery('')}>Show all guides</button>
              </div>
            </div>
          ) : null}
          {visibleCats.map((cat) => (
            <section key={cat.title} aria-label={cat.title}>
              <div className="wiki-cat-head">
                <h2>{cat.title}</h2>
                <p>{cat.blurb}</p>
              </div>
              <div className="content-grid">
                {cat.slugs.map((slug) => {
                  const topic = topicBySlug.get(slug);
                  if (!topic) return null;
                  return (
                    <Link className="content-card content-card--link" key={slug} to={`/wiki/${slug}`}>
                      <span className="site-card__eyebrow">Wiki</span>
                      <h2>{topic.title}</h2>
                      <p>{topic.blurb}</p>
                      <span className="site-card__link">Read →</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}

          <section className="site-panel content-callout">
            <div>
              <span className="site-card__eyebrow">Prefer exploring?</span>
              <h2>See the world before you play.</h2>
              <p>Cities, turf and past seasons are all public. Peek around, then join when ready.</p>
            </div>
            <div className="archive-back">
              <Link className="btn btn-outline-light" to="/cities">Cities</Link>
              <Link className="btn btn-outline-light" to="/games">Past seasons</Link>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

export function WikiTopicPage() {
  const { topic = '' } = useParams();
  const article = (guideCopy as Record<string, { title: string; intro: string; sections: Array<{ title: string; body: string }> }>)[topic];
  if (!article) {
    return (
      <div className="site-page">
        <PublicPageHero eyebrow="Wiki" title="That page doesn't exist yet.">
          <p>Try the wiki home for everything we have so far.</p>
          <Link className="btn btn-primary" to="/wiki">Wiki home</Link>
        </PublicPageHero>
      </div>
    );
  }

  const index = flatOrder.indexOf(topic);
  const prev = index > 0 ? flatOrder[index - 1] : null;
  const next = index >= 0 && index < flatOrder.length - 1 ? flatOrder[index + 1] : null;
  const prevTopic = prev ? topicBySlug.get(prev) : null;
  const nextTopic = next ? topicBySlug.get(next) : null;

  return (
    <div className="site-page">
      <PublicPageHero eyebrow={`Wiki · ${categoryOf(topic)}`} title={article.title}>
        <p>{article.intro}</p>
        <p className="wiki-crumb">
          <Link to="/wiki">Wiki</Link> · {categoryOf(topic)}
        </p>
      </PublicPageHero>

      <section className="site-section site-section--tight">
        <div className="container wiki-article-layout">
          <article className="site-panel article-body">
            {article.sections.map((s) => (
              <section key={s.title}>
                <h2>{s.title}</h2>
                <p>{s.body}</p>
              </section>
            ))}
            <div className="wiki-prev-next">
              {prevTopic && prev ? (
                <Link className="btn btn-outline-light" to={`/wiki/${prev}`}>← {prevTopic.title}</Link>
              ) : (
                <Link className="btn btn-outline-light" to="/wiki">← Wiki home</Link>
              )}
              {nextTopic && next ? (
                <Link className="btn btn-outline-light" to={`/wiki/${next}`}>{nextTopic.title} →</Link>
              ) : (
                <a className="btn btn-primary" href="https://play.streetsempire.dev">Play now</a>
              )}
            </div>
          </article>

          <aside className="site-panel wiki-side" aria-label="More wiki pages">
            <span className="site-card__eyebrow">Keep reading</span>
            <h2>Related</h2>
            <nav>
              {flatOrder
                .filter((slug) => slug !== topic && categoryOf(slug) === categoryOf(topic))
                .map((slug) => (
                  <Link key={slug} to={`/wiki/${slug}`}>{topicBySlug.get(slug)?.title ?? slug}</Link>
                ))}
              <Link to="/wiki">All wiki pages</Link>
              <Link to="/cities">Cities of the empire</Link>
            </nav>
            <div className="wiki-side__cta">
              <p>Ready to try it?</p>
              <a className="btn btn-primary btn-sm" href="https://play.streetsempire.dev">Play free</a>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
