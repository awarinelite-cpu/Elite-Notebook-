import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'The Elite Notebook',
        short_name: 'Elite Notebook',
        description: 'The Elite Notebook',
        theme_color: '#FDD663',
        background_color: '#E9EAF6',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        // Registers this installed app as a target in the OS share sheet
        // (Android's "Share to…" list, and equivalents elsewhere). The
        // service worker at src/sw.js handles the POST to this action URL.
        share_target: {
          action: '/share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
            files: [
              {
                name: 'files',
                accept: [
                  'image/*',
                  'application/pdf',
                  '.doc',
                  '.docx',
                  '.xls',
                  '.xlsx',
                  '.ppt',
                  '.pptx',
                  '.txt',
                  '.csv',
                  'text/*',
                ],
              },
            ],
          },
        },
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  server: {
    // Capacitor live-reload friendly default
    host: true,
  },
})
