import { defineConfig } from 'drizzle-kit';

// Drizzle Kit Configuration
// Documentation: https://orm.drizzle.team/kit-docs/config-reference
export default defineConfig({
  // Database schema files
  schema: './src/server/modules/*/db/schema.ts',

  // Output directory for migrations
  out: './drizzle',

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
