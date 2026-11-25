import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// El navegador habla solo con este servidor: /api se reenvía a la API de NestJS.
// Así basta un único túnel HTTPS para probar en el celular y no hay problemas de CORS.
const proxy = {
  '/api': {
    target: process.env.API_URL ?? 'http://localhost:3000',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/api/, ''),
  },
};

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'icon.svg'],
      manifest: {
        name: 'Forragest · Repartos',
        short_name: 'Forragest',
        description: 'App del repartidor: ruta, entregas, cobros e incidencias, también sin conexión.',
        lang: 'es-MX',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#1F4D3A',
        background_color: '#F4EFE4',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // los datos de la API se guardan en IndexedDB desde la app; el service worker solo guarda el cascarón
        navigateFallbackDenylist: [/^\/api/],
        // De las letras solo se guardan las del alfabeto latino (español): las demás (cirílico, vietnamita, latín
        // extendido) nunca se usan y antes sumaban cientos de KB en el teléfono. Si algún día se necesitan, se guardan
        // al vuelo con la regla de abajo.
        globPatterns: ['**/*.{js,css,html,svg,png}', '**/*-latin-wght-*.woff2'],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'font',
            handler: 'CacheFirst',
            options: { cacheName: 'letras', expiration: { maxEntries: 20 } },
          },
        ],
      },
    }),
  ],
  server: { host: true, port: 5173, allowedHosts: true, proxy },
  preview: { host: true, port: 4173, allowedHosts: true, proxy },
  test: { environment: 'node' },
});
