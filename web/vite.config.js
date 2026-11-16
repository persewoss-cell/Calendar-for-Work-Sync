import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const backend = process.env.API_URL || 'http://localhost:4000';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null, // registered in main.jsx, and never inside the desktop app
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-192.png', 'icon-maskable-512.png'],
      manifest: {
        name: '업무 캘린더',
        short_name: '업무캘린더',
        description: 'PC·모바일·구글 캘린더가 동기화되는 업무용 달력',
        lang: 'ko',
        start_url: '/',
        display: 'standalone',
        background_color: '#0d47a1',
        theme_color: '#1565c0',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api/, /^\/auth/, /^\/socket\.io/, /^\/healthz/],
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': backend,
      '/auth': backend,
      '/socket.io': { target: backend, ws: true },
    },
  },
});
