import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';
import { VitePWA } from 'vite-plugin-pwa';
import { quasar, transformAssetUrls } from '@quasar/vite-plugin';
import pkg from './package.json';

export default defineConfig({
  plugins: [
    vue({
      template: { transformAssetUrls }
    }),
    quasar({
      autoImportComponentCase: 'kebab'
    }),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon-32x32.png', 'apple-touch-icon.png', 'logo-wordcourt.png', 'robots.txt'],
      manifest: {
        name: 'WordCourt',
        short_name: 'WordCourt',
        start_url: '/',
        display: 'standalone',
        background_color: '#f5f2ea',
        theme_color: '#0e5f73',
        description: 'WordCourt multiplayer word game with PocketBase backend',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,json}']
      }
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString())
  }
});
