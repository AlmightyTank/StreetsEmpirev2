import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';

// 1. Foundation: authoritative tokens and reset.
import './styles/theme.css';
// 2. Shared components and compatibility composition.
import './styles/community.css';
import './styles/stability.css';
import './styles/polish.css';
import './styles/shared-components.css';
import './styles/release.css';
// 3. Shared responsive layout and application shell.
import './styles/mobile.css';
import './styles/navigation.css';
import './styles/ux.css';
import './styles/dock.css';
import './styles/app-shell.css';
import './styles/experience-shell.css';
// 4. Theme token/component overrides, then decorative route identity.
import './styles/site-themes.css';
import './styles/page-identities.css';
// 5. Page art and feature-specific composition.
import './styles/hideout.css';
import './styles/dashboard.css';
import './styles/scout.css';
import './styles/produce.css';
import './styles/raids.css';
import './styles/encounter-cinema.css';
import './styles/stores.css';
import './styles/items.css';
import './styles/street-pass.css';
import './styles/round-roll-call.css';
import './styles/supporter.css';
import './styles/drop.css';
import './styles/drop-art.css';
import './styles/drop-shells.css';
import './styles/travel.css';
import './styles/city-blocks.css';
import './styles/operations.css';
import './styles/black-book.css';
import './styles/quests.css';
import './styles/events.css';
import './styles/surveys.css';
import './styles/rankings.css';
import './styles/aftermath.css';
import './styles/players.css';
import './styles/console.css';
import './styles/alliance.css';
import './styles/contacts.css';
import './styles/profile.css';
import './styles/profile-hover.css';
import './styles/activity.css';
import './styles/admin.css';
import './styles/public-info.css';
import './styles/account-settings.css';
import './styles/easter-eggs.css';
import './styles/action-experience.css';
import './styles/action-readiness-accessibility.css';
import './styles/empire-management.css';
import './styles/economy-experience.css';
import './styles/career-experience.css';
import './styles/collection.css';
import './styles/social-experience.css';
import './styles/admin-workspace.css';
import './styles/dashboard-cinematic.css';
import './styles/dashboard-final-polish.css';
// 6. Development surfaces (selectors are fully scoped).
import './styles/ui-gallery.css';
// 7. Final mobile-only game shell skin, after theme and feature layers.
import './styles/mobile-shell-vision.css';
import { App } from './App.js';
// Before React mounts: Android can offer the install prompt immediately.
import './utils/install.js';
import { registerAppServiceWorker } from './utils/app-update.js';

// 1.0.0-G: installable app and offline page; never caches the game (see public/sw.js).
registerAppServiceWorker();

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element.');

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
