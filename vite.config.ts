import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
// GitHub Pages project sites serve from /<repo>/, so production builds need a
// matching base. The deploy workflow passes the real repo name via VITE_BASE;
// the literal below is just the local fallback for a bare `npm run build`.
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '8BitSVG',
        short_name: '8BitSVG',
        description: 'Pixel art to SVG editor',
        theme_color: '#171717',
        background_color: '#171717',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: 'favicon.svg',  sizes: 'any',     type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ttf,woff,woff2}'],
      },
    }),
  ],
  base: process.env.VITE_BASE ?? (mode === 'production' ? '/8BitSVG/' : '/'),
}))
