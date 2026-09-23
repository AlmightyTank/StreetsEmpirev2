import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import './styles/theme.css';
import './styles/community.css';
import './styles/stability.css';
import './styles/polish.css';
import './styles/release.css';
import './styles/mobile.css';
import './styles/navigation.css';
import './styles/hideout.css';
import './styles/dashboard.css';
import './styles/scout.css';
import './styles/produce.css';
import './styles/raids.css';
import './styles/stores.css';
import './styles/travel.css';
import './styles/city-blocks.css';
import './styles/quests.css';
import './styles/rankings.css';
import './styles/alliance.css';
import './styles/contacts.css';
import './styles/activity.css';
import { App } from './App.js';
// Before React mounts: Android can offer the install prompt immediately.
import './utils/install.js';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element.');

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
