import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// The player entry is index.player.html; Netlify must serve it as index.html.
// Renaming inside the bundle (instead of a shell `mv` after the build) keeps
// the build cross-platform and lets the PWA plugin precache the final name.
function renamePlayerIndex(): Plugin {
  return {
    name: 'rename-player-index',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = bundle['index.player.html']
      if (html) {
        html.fileName = 'index.html'
        bundle['index.html'] = html
        delete bundle['index.player.html']
      }
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    renamePlayerIndex(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Puzzle Daily',
        short_name: 'Puzzle Daily',
        description: 'A daily tactical dungeon puzzle. Place your heroes, outwit the dungeon, and climb the ranks in one run per day.',
        theme_color: '#050504',
        background_color: '#050504',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        // The main chunk is over workbox's 2 MB default
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // Google Fonts stylesheets + font files
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Sprite/theme images from Supabase Storage — content-addressed
            // by path, safe to cache hard. REST/API calls are NOT cached:
            // the daily puzzle, stats, and completions always hit network
            // (localStorage handles offline for the daily).
            urlPattern: /^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'supabase-storage',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    sourcemap: 'hidden',
    outDir: 'dist-player',
    rollupOptions: {
      input: 'index.player.html',
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
})
