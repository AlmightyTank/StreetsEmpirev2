import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import './styles/theme.css';
import './styles/community.css';
import './styles/stability.css';
import './styles/polish.css';
import './styles/release.css';
import './styles/landing.css';
import './styles/mobile.css';
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
