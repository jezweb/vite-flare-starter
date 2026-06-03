import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  plugins: [
    cloudflareTest({
      remoteBindings: false,
      wrangler: {
        configPath: './wrangler.jsonc',
      },
      miniflare: {
        d1Databases: {
          DB: 'test-db',
        },
        r2Buckets: {
          AVATARS: 'test-avatars',
        },
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
  },
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      reportsDirectory: './coverage',
      include: ['src/server/**/*.ts', 'src/shared/**/*.ts'],
      exclude: ['src/server/db/**', 'src/server/modules/*/db/**', '**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/client': path.resolve(__dirname, './src/client'),
      '@/server': path.resolve(__dirname, './src/server'),
      '@/shared': path.resolve(__dirname, './src/shared'),
      '@/components': path.resolve(__dirname, './src/client/components'),
    },
  },
})
