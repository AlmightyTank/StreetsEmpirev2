import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';

// 1. Foundation: authoritative tokens and reset.
import './styles/fonts.css';
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
// Feature CSS is imported by the lazy route that owns it so the first page does
// not download the entire game's stylesheet. Keep only shared shell styles here.
// Development surfaces (selectors are fully scoped).
import './styles/ui-gallery.css';
// Final mobile-only game shell skin, after theme and feature layers.
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
