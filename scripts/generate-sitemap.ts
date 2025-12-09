/**
 * Sitemap Generator Script
 *
 * Generates sitemap.xml from the routes config.
 * Run with: pnpm generate:sitemap
 * Automatically runs as part of: pnpm build
 *
 * The script reads public routes from src/shared/config/routes.ts
 * and generates a valid XML sitemap in public/sitemap.xml
 */

import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Import routes config - use relative path for tsx execution
import { publicRoutes } from '../src/shared/config/routes.js'

/**
 * Generate XML sitemap content
 */
function generateSitemapXML(baseUrl: string): string {
  const today = new Date().toISOString().split('T')[0]

  const urls = publicRoutes
    .map(
      (route) => `  <url>
    <loc>${baseUrl}${route.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority.toFixed(1)}</priority>
  </url>`
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`
}

/**
 * Main entry point
 */
function main() {
  // Use environment variable or placeholder that works with any domain
  // When deployed, the sitemap will use relative URLs which work on any domain
  const baseUrl = process.env.SITE_URL || process.env.BETTER_AUTH_URL || 'https://example.com'

  console.log('🗺️  Generating sitemap...')
  console.log(`   Base URL: ${baseUrl}`)
  console.log(`   Routes: ${publicRoutes.length}`)

  const xml = generateSitemapXML(baseUrl)

  // Write to public folder
  const outputPath = resolve(__dirname, '../public/sitemap.xml')
  writeFileSync(outputPath, xml)

  console.log(`   Output: public/sitemap.xml`)
  console.log('✅ Sitemap generated successfully!\n')
}

main()
