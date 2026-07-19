import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
