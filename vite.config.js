import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3333,
    strictPort: true,
    host: '127.0.0.1',
    open: true
  },
  // Ensure .env files are loaded correctly
  envPrefix: 'VITE_',
});
