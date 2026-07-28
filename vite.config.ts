import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'service-worker.ts',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      pwaAssets: {
        disabled: true,
        config: false,
      },
      manifest: {
        name: 'Mysuru Paakashale ERP',
        short_name: 'Paakashale',
        description: 'ERP for Mysuru Paakashale',
        theme_color: '#3A4D23',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: '/favicon.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: '/no_bg_logo.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    // Split heavy, rarely-changed vendor code into its own chunks so route
    // navigations don't re-download it, and the main bundle stays lean.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/[\\/](react|react-dom|react-router-dom)[\\/]/.test(id)) return 'vendor-react'
          if (id.includes('firebase')) return 'vendor-firebase'
          if (id.includes('recharts')) return 'vendor-charts'
          if (/[\\/](leaflet|react-leaflet)[\\/]/.test(id)) return 'vendor-maps'
          if (/[\\/](exceljs|jspdf|jspdf-autotable)[\\/]/.test(id)) return 'vendor-reports'
          return undefined
        },
      },
    },
  },
})
