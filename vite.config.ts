import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import path from 'path';

// Read package.json for version injection
import packageJson from './package.json';

// Vite configuration for Vite-Flare-Stack
// Documentation: https://vitejs.dev/config/
export default defineConfig({
  // Define global constants
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },

  plugins: [
    // React plugin with Fast Refresh
    react(),

    // Tailwind CSS v4 plugin
    tailwindcss(),

    // Cloudflare Workers plugin
    // Reads configuration from wrangler.jsonc automatically
    cloudflare(),
  ],

  // Path aliases for cleaner imports
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/client': path.resolve(__dirname, './src/client'),
      '@/server': path.resolve(__dirname, './src/server'),
    },
  },

  // Development server configuration
  server: {
    port: 5173,
    strictPort: true,
    // API requests are proxied to the Worker (via Cloudflare plugin)
    // No CORS configuration needed!
  },

  // Build configuration
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
    // Code splitting for optimal loading
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          // Heavy libs users never need on first paint — keep out of main chunk.
          // Do NOT group shiki or @shikijs — each language should stay its own
          // lazy chunk (see shiki/guide/best-performance).
          if (id.includes('/streamdown/')) return 'streamdown'
          if (id.includes('/mermaid/')) return 'mermaid'
          if (id.includes('/cytoscape')) return 'cytoscape'
          if (id.includes('@milkdown/') || id.includes('/milkdown/') || id.includes('/prosemirror-')) return 'milkdown'
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

  // CSS configuration (for Tailwind v4)
  css: {
    postcss: './postcss.config.js',
  },

  // Optimize dependencies
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
});
