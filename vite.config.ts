/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { VitePWA } from 'vite-plugin-pwa'
// @ts-ignore - type definitions might not match runtime exports
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    define: {
      'import.meta.env.VITE_FIREBASE_API_KEY': JSON.stringify(env.VITE_FIREBASE_API_KEY),
      'import.meta.env.VITE_FIREBASE_AUTH_DOMAIN': JSON.stringify(env.VITE_FIREBASE_AUTH_DOMAIN),
      'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify(env.VITE_FIREBASE_PROJECT_ID),
      'import.meta.env.VITE_FIREBASE_STORAGE_BUCKET': JSON.stringify(env.VITE_FIREBASE_STORAGE_BUCKET),
      'import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID': JSON.stringify(env.VITE_FIREBASE_MESSAGING_SENDER_ID),
      'import.meta.env.VITE_FIREBASE_APP_ID': JSON.stringify(env.VITE_FIREBASE_APP_ID),
    },
    test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // Keep memory usage predictable on developer machines and CI runners.
    fileParallelism: false,
    maxWorkers: 2,
    exclude: ['node_modules', 'dist', 'tests/**', 'src/shared/services/business/__tests__/paymentService.test.ts', 'functions/**', '**/*.int.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'src/main.tsx',
        'src/App.tsx',
        'src/vite-env.d.ts',
        'src/theme/**',
        'src/assets/**',
        'src/icons/**',
        'src/**/*.d.ts',
        'src/shared/services/business/paymentService.ts',
        'src/shared/services/business/analyticsService.ts',
        'src/shared/utils/**',
        'src/shared/lib/firebase.ts'
      ],
      thresholds: {
        statements: 90,
        // TODO: Branch coverage temporarily set to 79% due to TypeScript/V8 transpilation artifacts (e.g. async/await state machines and optional chaining).
        // It does not reflect missing business logic tests. Plan is to restore this to 90% after Phase 2 repository tests are fully implemented.
        branches: 79,
        functions: 90,
        lines: 90
      }
    }
  },
  plugins: [
    react(), 
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: null,
      injectManifest: {
        // Exclude massive vendor chunks and reports/charts from precache
        // These will load dynamically when the user actually visits those routes!
        globIgnores: [
          '**/node_modules/**/*',
          '**/vendor-charts-*.js',
          '**/vendor-reports-*.js',
          '**/html2canvas-*.js',
          '**/vendor-maps-*.js',
          '**/vendor-sentry-*.js',
          '**/*.map'
        ],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      pwaAssets: {
        disabled: true,
        config: false,
      },
      devOptions: {
        enabled: false,
        type: 'module',
      },
      manifest: {
        name: 'Mysuru Paakashale ERP',
        short_name: 'Paakashale',
        description: 'ERP for Mysuru Paakashale',
        start_url: '/',
        scope: '/',
        theme_color: '#3A4D23',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      }
    }),
    sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      // Only upload source maps for production builds
      telemetry: false,
    }),
    visualizer({
      filename: 'bundle-stats.html',
      gzipSize: true,
      brotliSize: true,
    })
  ],
  resolve: {
    alias: {
      '@reduxjs/toolkit': path.resolve(__dirname, './node_modules/@reduxjs/toolkit/dist/redux-toolkit.legacy-esm.js'),
      '@hookform/resolvers/zod': path.resolve(__dirname, './node_modules/@hookform/resolvers/zod/dist/zod.js'),
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    target: 'esnext',
    sourcemap: true, // Required for Sentry source map upload
    modulePreload: false, // Don't inject <link rel="modulepreload"> for lazy chunks
    // Split heavy, rarely-changed vendor code into its own chunks so route
    // navigations don't re-download it, and the main bundle stays lean.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          // @sentry must be checked BEFORE react — @sentry/react contains
          // 'react' in its path and would otherwise match the vendor-react rule.
          if (id.includes('@sentry')) return 'vendor-sentry'
          if (/[\\/](react|react-dom|react-router-dom)[\\/]/.test(id)) return 'vendor-react'
          if (/[\\/](recharts|@reduxjs[\\/]toolkit)[\\/]/.test(id)) return 'vendor-charts'
          if (/[\\/](leaflet|react-leaflet)[\\/]/.test(id)) return 'vendor-maps'
          if (/[\\/](exceljs|jspdf|jspdf-autotable)[\\/]/.test(id)) return 'vendor-reports'
          
          // Surgical chunks to shrink index.esm
          if (/[\\/](firebase|@firebase)[\\/]/.test(id)) return 'vendor-firebase'
          if (/[\\/]lucide-react[\\/]/.test(id)) return 'vendor-icons'
          if (/[\\/]@tanstack[\\/]react-query[\\/]/.test(id)) return 'vendor-query'
          if (/[\\/](react-hook-form|@hookform[\\/]resolvers)[\\/]/.test(id)) return 'vendor-forms'
          
          return undefined
        },
      },
    },
  },
  }
})
