import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/health': 'http://localhost:3000',
      '/intents': 'http://localhost:3000',
      '/projections': 'http://localhost:3000',
      '/audit': 'http://localhost:3000',
      '/subscriptions': 'http://localhost:3000',
      '/event-types': 'http://localhost:3000',
    },
  },
});
