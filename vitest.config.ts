import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'
import path from 'node:path'

export default defineWorkersConfig({
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
  },
  test: {
    globals: true,
    poolOptions: {
      workers: {
        wrangler: {
          configPath: './wrangler.jsonc',
        },
        miniflare: {
          // D1 bindings are automatically mocked by Miniflare
          d1Databases: {
            DB: 'test-db',
          },
          r2Buckets: {
            AVATARS: 'test-avatars',
          },
        },
      },
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
