import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { SiteLayout } from './components/SiteLayout.js';

const HomePage = lazy(() => import('./pages/HomePage.js').then((module) => ({ default: module.HomePage })));
const CurrentGamePage = lazy(() => import('./pages/CurrentGamePage.js').then((module) => ({ default: module.CurrentGamePage })));
const GamesPage = lazy(() => import('./pages/GamesPage.js').then((module) => ({ default: module.GamesPage })));
const GameArchivePage = lazy(() => import('./pages/GameArchivePage.js').then((module) => ({ default: module.GameArchivePage })));
const RankingsPage = lazy(() => import('./pages/RankingsPage.js').then((module) => ({ default: module.RankingsPage })));
const PlayerPage = lazy(() => import('./pages/PlayerPage.js').then((module) => ({ default: module.PlayerPage })));
const AlliancesPage = lazy(() => import('./pages/AlliancesPage.js').then((module) => ({ default: module.AlliancesPage })));
const AlliancePage = lazy(() => import('./pages/AlliancePage.js').then((module) => ({ default: module.AlliancePage })));
const CitiesPage = lazy(() => import('./pages/CitiesPage.js').then((module) => ({ default: module.CitiesPage })));
const CityPage = lazy(() => import('./pages/CityPage.js').then((module) => ({ default: module.CityPage })));
const TurfPage = lazy(() => import('./pages/TurfPage.js').then((module) => ({ default: module.TurfPage })));
const HallOfFamePage = lazy(() => import('./pages/HallOfFamePage.js').then((module) => ({ default: module.HallOfFamePage })));
const StatsPage = lazy(() => import('./pages/StatsPage.js').then((module) => ({ default: module.StatsPage })));
const NewsPage = lazy(() => import('./pages/NewsPage.js').then((module) => ({ default: module.NewsPage })));
const NewsArticlePage = lazy(() => import('./pages/NewsArticlePage.js').then((module) => ({ default: module.NewsArticlePage })));
const SearchPage = lazy(() => import('./pages/SearchPage.js').then((module) => ({ default: module.SearchPage })));
const StatusPage = lazy(() => import('./pages/StatusPage.js').then((module) => ({ default: module.StatusPage })));
const NotFoundPage = lazy(() => import('./pages/SectionPage.js').then((module) => ({ default: module.NotFoundPage })));

const ContentPages = {
  AboutPage: lazy(() => import('./pages/ContentPages.js').then((module) => ({ default: module.AboutPage }))),
  BetaPage: lazy(() => import('./pages/ContentPages.js').then((module) => ({ default: module.BetaPage }))),
  CommunityPage: lazy(() => import('./pages/ContentPages.js').then((module) => ({ default: module.CommunityPage }))),
  GamePage: lazy(() => import('./pages/ContentPages.js').then((module) => ({ default: module.GamePage }))),
  GuidePage: lazy(() => import('./pages/ContentPages.js').then((module) => ({ default: module.GuidePage }))),
  GuideTopicPage: lazy(() => import('./pages/ContentPages.js').then((module) => ({ default: module.GuideTopicPage }))),
  RoadmapPage: lazy(() => import('./pages/ContentPages.js').then((module) => ({ default: module.RoadmapPage }))),
  SupportPage: lazy(() => import('./pages/ContentPages.js').then((module) => ({ default: module.SupportPage }))),
};

function RouteFallback() {
  return (
    <div className="site-route-loading" role="status" aria-live="polite">
      Loading…
    </div>
  );
}

export function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<SiteLayout />}>
          <Route index element={<HomePage />} />
          <Route path="game" element={<ContentPages.GamePage />} />

          <Route path="guide" element={<ContentPages.GuidePage />} />
          <Route path="guide/:topic" element={<ContentPages.GuideTopicPage />} />

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

          <Route path="roadmap" element={<ContentPages.RoadmapPage />} />
          <Route path="community" element={<ContentPages.CommunityPage />} />
          <Route path="beta" element={<ContentPages.BetaPage />} />
          <Route path="status" element={<StatusPage />} />
          <Route path="support" element={<ContentPages.SupportPage />} />
          <Route path="about" element={<ContentPages.AboutPage />} />
          <Route path="search" element={<SearchPage />} />

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
