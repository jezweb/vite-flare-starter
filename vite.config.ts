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
    // Code splitting for optimal loading
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks for better caching
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
          // Add more chunks as needed
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
