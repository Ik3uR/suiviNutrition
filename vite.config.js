import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// Hébergé sur GitHub Pages : https://ik3ur.github.io/suiviNutrition/
const base = '/suiviNutrition/';

export default defineConfig({
  base,
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'ciqual.json'],
      manifest: {
        name: 'Suivi Nutrition',
        short_name: 'Nutrition',
        lang: 'fr',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#f4f5f2',
        theme_color: '#f4f5f2',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,json,wasm}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
});
