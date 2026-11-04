import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// /api se reenvía a la API de NestJS: un solo origen para el navegador, sin problemas de CORS.
const proxy = {
  '/api': {
    target: process.env.API_URL ?? 'http://localhost:3000',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/api/, ''),
  },
};

export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5174, allowedHosts: true, proxy },
  preview: { host: true, port: 4174, allowedHosts: true, proxy },
  test: { environment: 'node' },
});
