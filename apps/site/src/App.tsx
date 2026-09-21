import { Route, Routes } from 'react-router-dom';
import { SiteLayout } from './components/SiteLayout.js';
import { HomePage } from './pages/HomePage.js';
import { CurrentGamePage } from './pages/CurrentGamePage.js';
import {
  AllianceDetailPage,
  CityDetailPage,
  GameDetailPage,
  GuideDetailPage,
  NewsDetailPage,
  NotFoundPage,
  PlayerDetailPage,
  SectionPage,
} from './pages/SectionPage.js';

const sectionPages = {
  game: {
    eyebrow: 'The game',
    title: 'Build an empire one decision at a time.',
    description: 'Learn what StreetsEmpire is, how a season works and how its major systems fit together.',
    planned: ['Core gameplay loop', 'Crew, economy and products', 'Combat, travel, turf and alliances', 'Season resets and permanent career history'],
  },
  guide: {
    eyebrow: 'How to play',
    title: 'From your first turns to city control.',
    description: 'A player-friendly guide to the systems that make up StreetsEmpire.',
    planned: ['Getting started', 'Scouting, products and stores', 'Combat, recon and convoys', 'Travel, turf, alliances and hideouts'],
  },
  cities: {
    eyebrow: 'The world',
    title: 'Cities',
    description: 'Explore every playable city, its districts and the public side of its local economy.',
    planned: ['City directory', 'District summaries', 'Public market character and police pressure', 'Current public turf control'],
  },
  turf: {
    eyebrow: 'Territory',
    title: 'Turf',
    description: 'Follow the public fight for districts and city control across StreetsEmpire.',
    planned: ['National turf overview', 'City-by-city control', 'District controller and hold time', 'Public turf battle history'],
  },
  games: {
    eyebrow: 'Seasons',
    title: 'Current & Past Games',
    description: 'Follow the current game and browse the permanent records of completed StreetsEmpire seasons.',
    planned: ['Current game overview', 'Past game archive', 'Final standings and champions', 'Season statistics and major public events'],
  },
  currentGame: {
    eyebrow: 'Current season',
    title: 'Current Game',
    description: 'A spectator-friendly view of the StreetsEmpire season happening right now.',
    planned: ['Season progress and time remaining', 'Public player and alliance counts', 'Top public rankings', 'Recent public game events'],
  },
  rankings: {
    eyebrow: 'Competition',
    title: 'Rankings',
    description: 'See who is climbing the public StreetsEmpire leaderboards.',
    planned: ['Net worth rankings', 'Turf and combat rankings', 'Travel and achievement rankings', 'Rank movement and alliance standings'],
  },
  hallOfFame: {
    eyebrow: 'Legacy',
    title: 'Hall of Fame',
    description: 'The permanent home of StreetsEmpire champions and historical records.',
    planned: ['Season champions', 'Most championships', 'Career and season records', 'Turf, combat, travel and alliance records'],
  },
  alliances: {
    eyebrow: 'Crews together',
    title: 'Alliances',
    description: 'Follow the alliances competing for power in the current season and across game history.',
    planned: ['Current alliance standings', 'Public alliance profiles', 'Turf and city presence', 'Historical finishes and championships'],
  },
  stats: {
    eyebrow: 'By the numbers',
    title: 'StreetsEmpire Statistics',
    description: 'A public view of the game world through current-season and all-time statistics.',
    planned: ['Games and players', 'Combat and turf totals', 'Travel and economy totals', 'Fun historical records and city trends'],
  },
  news: {
    eyebrow: 'Updates',
    title: 'News',
    description: 'Official StreetsEmpire announcements, release notes and season updates.',
    planned: ['Game announcements', 'Release updates', 'Season start and end posts', 'Links to related forum and roadmap information'],
  },
  roadmap: {
    eyebrow: 'Development',
    title: 'Roadmap',
    description: 'See what is live, what is being built and what is planned for StreetsEmpire.',
    planned: ['Current live release', 'In-development milestone', 'Upcoming releases', 'Post-1.0 future plans'],
  },
  community: {
    eyebrow: 'Community',
    title: 'The StreetsEmpire Community',
    description: 'Find the places where players talk strategy, recruit and follow development.',
    planned: ['Forum links', 'Discord community', 'Alliance recruitment', 'Community and support resources'],
  },
  beta: {
    eyebrow: 'Test server',
    title: 'StreetsEmpire Beta',
    description: 'Preview and test upcoming StreetsEmpire features before they reach the live game.',
    planned: ['Current beta version', 'Features under test', 'Reset/data warning', 'Beta changelog and bug-report links'],
  },
  status: {
    eyebrow: 'Operations',
    title: 'Service Status',
    description: 'A public view of StreetsEmpire service health and incidents.',
    planned: ['Public website status', 'Live game and API status', 'Forum and Discord bot status', 'Recent incident history'],
  },
  support: {
    eyebrow: 'Support the project',
    title: 'Help Keep StreetsEmpire Running',
    description: 'Support server costs and continued development without turning StreetsEmpire into pay-to-win.',
    planned: ['Supporter membership information', 'Cosmetic and community benefits', 'Clear no-pay-to-win policy', 'Project hosting and development goals'],
  },
  about: {
    eyebrow: 'About',
    title: 'About StreetsEmpire',
    description: 'The story, direction and design principles behind the StreetsEmpire project.',
    planned: ['Project background', 'Seasonal competitive design', 'Old-school browser-game inspiration', 'Development philosophy and credits'],
  },
} as const;

export function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route index element={<HomePage />} />
        <Route path="game" element={<SectionPage {...sectionPages.game} />} />
        <Route path="guide" element={<SectionPage {...sectionPages.guide} />} />
        <Route path="guide/:topic" element={<GuideDetailPage />} />
        <Route path="cities" element={<SectionPage {...sectionPages.cities} />} />
        <Route path="cities/:citySlug" element={<CityDetailPage />} />
        <Route path="turf" element={<SectionPage {...sectionPages.turf} />} />
        <Route path="games" element={<SectionPage {...sectionPages.games} />} />
        <Route path="games/current" element={<CurrentGamePage />} />
        <Route path="games/:gameId" element={<GameDetailPage />} />
        <Route path="rankings" element={<SectionPage {...sectionPages.rankings} />} />
        <Route path="hall-of-fame" element={<SectionPage {...sectionPages.hallOfFame} />} />
        <Route path="players/:playerId" element={<PlayerDetailPage />} />
        <Route path="alliances" element={<SectionPage {...sectionPages.alliances} />} />
        <Route path="alliances/:tag" element={<AllianceDetailPage />} />
        <Route path="stats" element={<SectionPage {...sectionPages.stats} />} />
        <Route path="news" element={<SectionPage {...sectionPages.news} />} />
        <Route path="news/:slug" element={<NewsDetailPage />} />
        <Route path="roadmap" element={<SectionPage {...sectionPages.roadmap} />} />
        <Route path="community" element={<SectionPage {...sectionPages.community} />} />
        <Route path="beta" element={<SectionPage {...sectionPages.beta} />} />
        <Route path="status" element={<SectionPage {...sectionPages.status} />} />
        <Route path="support" element={<SectionPage {...sectionPages.support} />} />
        <Route path="about" element={<SectionPage {...sectionPages.about} />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
