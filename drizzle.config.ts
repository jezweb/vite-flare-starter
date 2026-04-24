import { defineConfig } from 'drizzle-kit';

// Drizzle Kit Configuration
// Documentation: https://orm.drizzle.team/kit-docs/config-reference
export default defineConfig({
  // Database schema files
  schema: ['./src/server/modules/*/db/schema.ts', './src/server/db/schema.ts'],

  // Output directory for migrations
  out: './drizzle',

  // Timestamp-prefixed migrations so fork migrations don't collide with
  // upstream's sequential numbering (see docs/PATCHES-guide.md). New
  // migrations generate as 20260424142530_<name>.sql. Existing
  // 0001..0022 migrations keep their names — timestamps sort after them
  // lexicographically because "2..." > "0...".
  migrations: { prefix: 'timestamp' },

  // Database driver
  dialect: 'sqlite',

  // D1 Database configuration
  driver: 'd1-http',

  // Database credentials (for remote migrations)
  // Get these from Cloudflare dashboard or `wrangler d1 info`
  dbCredentials: {
    // For local development, Drizzle uses .wrangler/state/v3/d1/
    // For remote migrations, use these (uncomment and fill in):
    // accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    // databaseId: process.env.CLOUDFLARE_D1_DATABASE_ID!,
    // token: process.env.CLOUDFLARE_API_TOKEN!,

    // Placeholder - will be configured when D1 database is created
    accountId: '',
    databaseId: '',
    token: '',
  },

  // Verbose output
  verbose: true,

  // Strict mode (recommended)
  strict: true,
});
