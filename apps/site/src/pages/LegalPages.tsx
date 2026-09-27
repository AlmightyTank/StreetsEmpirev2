import { Link } from 'react-router-dom';
import { PublicPageHero } from '../components/PublicPageBits.js';

/**
 * 1.0.0-H. Privacy and terms. Written from what the code actually stores and does;
 * when that changes, change these. The operator should read both before launch (they
 * are plain-language pages, not legal advice), and update LEGAL_UPDATED when they do.
 */
export const LEGAL_UPDATED = '27 September 2026';
const CONTACT = <a href="https://forum.streetsempire.dev">the StreetsEmpire forum</a>;

function LegalPage({ eyebrow, title, intro, sections }: { eyebrow: string; title: string; intro: string; sections: Array<{ heading: string; body: React.ReactNode }> }) {
  return (
    <div className="site-page">
      <PublicPageHero eyebrow={eyebrow} title={title}><p>{intro}</p></PublicPageHero>
      <section className="site-section site-section--tight">
        <div className="container article-wrap">
          <article className="site-panel article-body">
            <p className="site-card__eyebrow">Last updated {LEGAL_UPDATED}</p>
            {sections.map((section) => (
              <section key={section.heading}>
                <h2>{section.heading}</h2>
                {section.body}
              </section>
            ))}
          </article>
        </div>
      </section>
    </div>
  );
}

export function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Privacy"
      title="What StreetsEmpire keeps about you"
      intro="The short version: what you need to sign in and play, what you choose to connect, and nothing sold or shared for advertising."
      sections={[
        {
          heading: 'Your account',
          body: (
            <>
              <p>Your <strong>username</strong> (public), your <strong>email address</strong> (private: sign-in, password recovery and verification only) and your <strong>password</strong>, which is stored only as a one-way hash and never readable, even by staff.</p>
              <p>Each signed-in session keeps the <strong>IP address and browser</strong> it signed in from and when it was last used, so you can see and end your sessions and so staff can spot account sharing and abuse. A session expires 30 days after you sign in.</p>
            </>
          ),
        },
        {
          heading: 'What you do in the game',
          body: (
            <>
              <p>Everything your crew does in a season: resources, actions, fights, runs, turf, alliance membership, rankings and final standings. Some of it is public by design: rankings, profiles, alliance rosters, battle outcomes and the permanent season archive and Hall of Fame.</p>
              <p>Messages you send other players and posts on your alliance wire are stored so they can be delivered and read. Staff read a private message only when it is reported to them (reports keep the evidence); alliance wires can be reviewed by staff for moderation.</p>
            </>
          ),
        },
        {
          heading: 'Things you choose to connect',
          body: (
            <ul>
              <li><strong>Discord</strong>: if you link or sign in with Discord, your Discord id, name and avatar.</li>
              <li><strong>The forum</strong>: if you link your forum account, which forum account it is.</li>
              <li><strong>Phone and browser alerts</strong>: if you turn them on, your browser's push address for this site, which your browser maker's push service delivers through.</li>
            </ul>
          ),
        },
        {
          heading: 'Who else handles it',
          body: (
            <p>Emails (password recovery, verification) are sent through an email delivery service. Push alerts go through your browser maker's push service. Discord and the forum see what you do there. There are no advertising or analytics trackers, and nothing is sold.</p>
          ),
        },
        {
          heading: 'Cookies and storage',
          body: (
            <p>One cookie: your sign-in session. The game also remembers a few display choices in your browser's local storage (open menus, the last store you used, dismissed notices). Nothing tracks you across other sites.</p>
          ),
        },
        {
          heading: 'How long it is kept',
          body: (
            <p>Season results are permanent: they are the game's history. Account and game data are kept while the account exists. Server backups are kept for about two months and then deleted. Staff actions are recorded in an audit log, kept for a year by default and removed only when staff purge it.</p>
          ),
        },
        {
          heading: 'Your choices',
          body: (
            <p>You can change your email and password, unlink Discord and the forum, end sessions and turn alerts off in your account settings. To have your account closed, ask staff on {CONTACT}; a closed account can no longer sign in, and your finished seasons stay in the public history under your name.</p>
          ),
        },
      ]}
    />
  );
}

export function TermsPage() {
  return (
    <LegalPage
      eyebrow="Terms"
      title="The rules of the house"
      intro="StreetsEmpire is a free game run for fun. Play fair, be decent, and these are the terms you agree to by making an account."
      sections={[
        {
          heading: 'One player, one account',
          body: <p>Play with one account. Accounts that are shared, or several accounts one person uses to help themselves (feeding cash, goods or turf from one to another, or attacking your own accounts), are against the rules, and staff can see the patterns.</p>,
        },
        {
          heading: 'No cheating',
          body: <p>No bots or scripts playing for you, no automated requests, and no using bugs to get ahead. If you find a bug that gives you something you should not have, report it rather than using it; reporting a real one is welcome. See the <Link to="/guide">guides</Link> and the in-game rules for how the game is meant to work.</p>,
        },
        {
          heading: 'Be decent',
          body: <p>Rivalry is the game; harassment is not. No threats, hate, sexual content involving minors, doxxing or spam in messages, alliance wires, names or profiles. Use the report button; staff read reports.</p>,
        },
        {
          heading: 'What staff can do',
          body: <p>Staff can warn, mute, suspend or ban accounts, rename offensive names, void fights and correct what cheating or a bug produced, with a recorded reason. Seasons can be paused, extended or ended early if something goes badly wrong.</p>,
        },
        {
          heading: 'Seasons',
          body: <p>Everything in a season (cash, crew, turf) ends with the season, and the next one starts fresh. Final standings and the Hall of Fame are permanent. Nothing in the game has real-world value, and nothing can be exchanged for money.</p>,
        },
        {
          heading: 'No guarantees',
          body: <p>The game is provided as it is. It will have bugs and downtime; we back it up and work to fix problems, but cannot promise it will always be available or that nothing is ever lost.</p>,
        },
        {
          heading: 'Changes',
          body: <p>These terms can change; the date at the top shows when. Questions: {CONTACT}.</p>,
        },
      ]}
    />
  );
}
