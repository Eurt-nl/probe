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
      includeAssets: ['favicon.svg', 'robots.txt'],
      manifest: {
        name: 'Probe Word Game',
        short_name: 'Probe',
        start_url: '/',
        display: 'standalone',
        background_color: '#f5f2ea',
        theme_color: '#0e5f73',
        description: 'Digital Probe word game with PocketBase backend',
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }
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
