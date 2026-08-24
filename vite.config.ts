import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Unofficial Telegram.Social',
        short_name: 'Unofficial TG',
        description: 'A unified feed for the Telegram broadcast channels you follow.',
        theme_color: '#17212b',
        background_color: '#0e1621',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      }
    })
  ],
  server: {
    proxy: { '/api': 'http://localhost:8787' }
  }
})
