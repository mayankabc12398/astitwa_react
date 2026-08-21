import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { locatorJs } from './vite-plugin-locatorjs.js'

// The frontend always calls relative /api/... paths. The Kestrel origin lives here
// and nowhere else, so no component ever hardcodes https://localhost:7xxx.
const DEFAULT_API_ORIGIN = 'https://localhost:7272'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiOrigin = env.VITE_API_ORIGIN || DEFAULT_API_ORIGIN

  return {
    // locatorJs() applies to the dev server only and does nothing to a build — see
    // vite-plugin-locatorjs.js for why it is a plugin of its own rather than an option
    // on react().
    plugins: [locatorJs(), react()],

    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },

    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: apiOrigin,
          changeOrigin: true,
          // The dev certificate is self-signed.
          secure: false,
        },
      },
    },

    build: {
      outDir: 'dist',
      sourcemap: mode !== 'production',
      rollupOptions: {
        output: {
          // Keep each upper layer in its own chunk so a tenant without Payroll
          // never downloads the Payroll bundle (section 8, acceptance scenario 6).
          manualChunks(id) {
            if (id.includes('/src/addons/')) return 'addon-' + chunkOf(id, 'addons')
            if (id.includes('/src/integrations/')) return 'integration-' + chunkOf(id, 'integrations')

            // The layer 5 admin screens carry Monaco. They stay in their own lazily
            // fetched chunks so a tenant that never opens them never downloads it.
            if (id.includes('/src/extensions/adminScreens/')) return undefined
            if (id.includes('node_modules/monaco-editor')) return 'monaco'
            if (id.includes('/src/extensions/')) return 'extensions'
            return undefined
          },
        },
      },
    },
  }
})

function chunkOf(id, layerFolder) {
  const after = id.split(`/src/${layerFolder}/`)[1] || ''
  return after.split('/')[0] || layerFolder
}
