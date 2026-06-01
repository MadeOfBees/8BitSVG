import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// GitHub Pages project sites serve from /<repo>/, so production builds need a
// matching base. The deploy workflow passes the real repo name via VITE_BASE;
// the literal below is just the local fallback for a bare `npm run build`.
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  base: process.env.VITE_BASE ?? (mode === 'production' ? '/8BitSVG/' : '/'),
}))
