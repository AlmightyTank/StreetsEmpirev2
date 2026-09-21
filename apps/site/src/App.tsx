import { Route, Routes } from 'react-router-dom';
import { SiteLayout } from './components/SiteLayout.js';
import { HomePage } from './pages/HomePage.js';
import { CurrentGamePage } from './pages/CurrentGamePage.js';
import { GamesPage } from './pages/GamesPage.js';
import { GameArchivePage } from './pages/GameArchivePage.js';
import { RankingsPage } from './pages/RankingsPage.js';
import { PlayerPage } from './pages/PlayerPage.js';
import { AlliancesPage } from './pages/AlliancesPage.js';
import { AlliancePage } from './pages/AlliancePage.js';
import { CitiesPage } from './pages/CitiesPage.js';
import { CityPage } from './pages/CityPage.js';
import { TurfPage } from './pages/TurfPage.js';
import { HallOfFamePage } from './pages/HallOfFamePage.js';
import { StatsPage } from './pages/StatsPage.js';
import { NewsPage } from './pages/NewsPage.js';
import { NewsArticlePage } from './pages/NewsArticlePage.js';
import {
  AboutPage,
  BetaPage,
  CommunityPage,
  GamePage,
  GuidePage,
  GuideTopicPage,
  RoadmapPage,
  SupportPage,
} from './pages/ContentPages.js';
import { SearchPage } from './pages/SearchPage.js';
import { StatusPage } from './pages/StatusPage.js';
import { NotFoundPage } from './pages/SectionPage.js';

export function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route index element={<HomePage />} />
        <Route path="game" element={<GamePage />} />

        <Route path="guide" element={<GuidePage />} />
        <Route path="guide/:topic" element={<GuideTopicPage />} />

        <Route path="cities" element={<CitiesPage />} />
        <Route path="cities/:citySlug" element={<CityPage />} />
        <Route path="turf" element={<TurfPage />} />

        <Route path="games" element={<GamesPage />} />
        <Route path="games/current" element={<CurrentGamePage />} />
        <Route path="games/:gameId" element={<GameArchivePage />} />

        <Route path="rankings" element={<RankingsPage />} />
        <Route path="hall-of-fame" element={<HallOfFamePage />} />
        <Route path="players/:playerId" element={<PlayerPage />} />

        <Route path="alliances" element={<AlliancesPage />} />
        <Route path="alliances/:tag" element={<AlliancePage />} />
        <Route path="stats" element={<StatsPage />} />

        <Route path="news" element={<NewsPage />} />
        <Route path="news/:slug" element={<NewsArticlePage />} />

        <Route path="roadmap" element={<RoadmapPage />} />
        <Route path="community" element={<CommunityPage />} />
        <Route path="beta" element={<BetaPage />} />
        <Route path="status" element={<StatusPage />} />
        <Route path="support" element={<SupportPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="search" element={<SearchPage />} />

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
