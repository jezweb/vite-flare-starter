import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

// Read package.json for version injection
import packageJson from './package.json'

// Vite 8 configuration — uses Rolldown (Rust-based bundler)
// Documentation: https://vitejs.dev/config/
export default defineConfig({
  // Define global constants
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },

  plugins: [
    // React plugin with Fast Refresh
    react(),

    // Tailwind CSS v4 plugin (no PostCSS needed)
    tailwindcss(),

    // Cloudflare Workers plugin
    // Reads configuration from wrangler.jsonc automatically
    cloudflare(),
  ],

  // Path aliases — reads from tsconfig.json paths automatically in Vite 8
  resolve: {
    tsconfigPaths: true,
  },

  // Development server configuration
  server: {
    port: 5173,
    strictPort: true,
  },

  // Build configuration
  build: {
    outDir: 'dist',
    sourcemap: process.env['SOURCE_MAPS'] === 'true',
    chunkSizeWarningLimit: 1500,
    // Vite 8 uses rolldownOptions (Rolldown replaces Rollup)
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          // Heavy libs — keep out of main chunk, loaded on demand.
          if (id.includes('/streamdown/')) return 'streamdown'
          if (id.includes('/mermaid/')) return 'mermaid'
          if (id.includes('/cytoscape')) return 'cytoscape'
          if (
            id.includes('@milkdown/') ||
            id.includes('/milkdown/') ||
            id.includes('/prosemirror-')
          )
            return 'milkdown'
          if (id.includes('/katex/')) return 'katex'
          // Vendor chunks
          if (id.includes('/react-router')) return 'react-router'
          if (id.includes('/@tanstack/')) return 'tanstack'
          if (id.includes('/@radix-ui/')) return 'radix'
          if (id.includes('/ai/') || id.includes('/@ai-sdk/')) return 'ai-sdk'
          return undefined
        },
      },
    },
  },

  // Optimize dependencies
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
})
