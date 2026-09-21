import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    strictPort: true,
    // Proxying keeps the API same-origin in dev, so the session cookie behaves
    // exactly as it will in production.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: false,
      },
    },
  },

  // Workspace packages are TypeScript source, not prebuilt bundles.
  optimizeDeps: {
    exclude: ['@streets/shared'],
  },
});
