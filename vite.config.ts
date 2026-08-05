/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// The artist drop path (overwrite src/assets/panels/*.json, page wears it)
// must be DETERMINISTIC. The skin modules build their piece maps at module
// scope and export draw routines alongside components, so Fast Refresh
// cannot cleanly re-thread a JSON change through them — a tab could keep
// the stale module graph (old art, old dim logic) until a manual hard
// reload (bit the user live, 2026-08-05: a fresh concede export "did not
// even dim"). Full-reload on every panels-JSON change closes the class.
const panelSkinsFullReload = (): Plugin => ({
  name: 'panel-skins-full-reload',
  handleHotUpdate({ file, server }) {
    if (/[/\\]src[/\\]assets[/\\]panels[/\\][^/\\]+\.json$/.test(file)) {
      server.ws.send({ type: 'full-reload' })
      return []
    }
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), panelSkinsFullReload()],
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    globals: true,
  },
  build: {
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
})
