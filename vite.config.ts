import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    // предпросмотр в браузере пользователя приходит с другого origin
    allowedHosts: true,
    cors: true,
  },
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
    sourcemap: false,
    target: 'chrome120',
    chunkSizeWarningLimit: 1200,
  },
});
