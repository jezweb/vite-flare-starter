/**
 * /llms.txt — generated agent-facing site summary (llmstxt.org format).
 *
 * Chrome Lighthouse 13.3's "Agentic Browsing" category (default config,
 * May 2026) checks for this file; Shopify ships it store-wide. It gives
 * visiting agents a fast, token-cheap orientation instead of scraping
 * the SPA shell (which is an empty div until JS runs).
 *
 * GENERATED, not hand-kept (derived-files rule): content comes from
 * appConfig env vars at request time, so a rebranded fork serves a
 * correct llms.txt with zero extra work. Add fork-specific sections by
 * editing the template below — it's still one source (your config +
 * this template), not a second hand-synced artefact.
 *
 * Wired via `run_worker_first: ["/llms.txt"]` in wrangler.jsonc —
 * without that entry the asset layer swallows the path and serves the
 * SPA index.html.
 */
import { Hono } from 'hono'

// Server-side branding follows the email module's convention: APP_NAME
// (VITE_* vars are client-build-only and don't exist in the worker env).
interface LlmsTxtEnv {
  APP_NAME?: string
  APP_DESCRIPTION?: string
  GITHUB_URL?: string
}

const app = new Hono<{ Bindings: LlmsTxtEnv }>()

app.get('/', (c) => {
  const name = c.env.APP_NAME || 'Vite Flare Starter'
  const description =
    c.env.APP_DESCRIPTION ||
    'Multi-user, multi-agent AI workspace on Cloudflare Workers — chat, routines, files, knowledge, and approvals.'
  const github = c.env.GITHUB_URL ?? 'https://github.com/jezweb/vite-flare-starter'
  const origin = new URL(c.req.url).origin

  const lines = [
    `# ${name}`,
    '',
    `> ${description}`,
    '',
    'Sign-in is required for all app surfaces. Agents with an API token can',
    'use the REST API; scopes are set per-token in Settings.',
    '',
    '## App surfaces',
    '',
    `- [Sign in](${origin}/sign-in): Google OAuth (email/password optional)`,
    `- [Dashboard](${origin}/dashboard): chat, inbox, routines, files, knowledge`,
    `- [REST API](${origin}/api): Bearer-token endpoints (see docs)`,
    '',
    '## Documentation',
    '',
    ...(github
      ? [
          `- [README](${github}#readme): what this app is and how it runs`,
          `- [Agent guide](${github}/blob/main/AGENTS.md): commands + conventions for coding agents`,
          `- [Design system](${github}/blob/main/DESIGN.md): tokens + component language`,
          `- [Docs directory](${github}/tree/main/docs): patterns, security model, playbooks`,
        ]
      : ['- Documentation is not publicly linked for this deployment.']),
    '',
  ]

  return c.text(lines.join('\n'), 200, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'public, max-age=3600',
  })
})

export default app
