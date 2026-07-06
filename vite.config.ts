import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Custom service worker (src/sw.ts) so we can handle Web Push. Vite injects
      // the precache manifest into it; runtime caching lives in the SW itself.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Crew Watch',
        short_name: 'CrewWatch',
        description: 'A private harm-reduction buddy app for your crew.',
        theme_color: '#0e1014',
        background_color: '#0e1014',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        // Long-press the home-screen icon → jump straight to Log or SOS. The app
        // reads ?action= on load (src/App.tsx) to land on the right screen.
        shortcuts: [
          {
            name: 'Log what you took',
            short_name: 'Log',
            url: '?action=log',
            icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }]
          },
          {
            name: 'Send SOS',
            short_name: 'SOS',
            url: '?action=sos',
            icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }]
          }
        ]
      }
    })
  ]
})
