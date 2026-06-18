#!/usr/bin/env node
/**
 * Seed a showcase test-auth user with realistic demo data across the headline
 * modules, so the per-module screen recordings look populated (not empty).
 *
 * What it does:
 *  1. Mints a better-auth session for showcase@test.vfs.local via /api/test-auth
 *     (captures the cookie + the user's id).
 *  2. REST-creates what has a create API (cookie auth): projects, entities,
 *     knowledge, memories, routines (seed-examples), files (multipart).
 *  3. Generates + runs a seed.sql for the direct-D1-only tables (findings,
 *     inbox_items, pending_approvals, notifications, activity_logs, agent_runs,
 *     conversations + messages) — respecting the two timestamp conventions:
 *       ms-epoch (unixepoch()*1000): conversations, conversation_messages,
 *         user_notifications, activity_logs.
 *       seconds   (unixepoch())    : entities(findings), inbox_items,
 *         pending_approvals, agent_runs.
 *
 * Re-runnable. /api/test-auth/cleanup wipes the showcase user + its data
 * (cascade). NEVER touches real users' rows.
 *
 * Usage: node .jez/scripts/seed-showcase.mjs
 * Env:   WALKABOUT_URL (default deployed), TEST_AUTH_TOKEN (from secrets if unset)
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const URL_BASE = process.env.WALKABOUT_URL || 'https://vite-flare-starter.webfonts.workers.dev'
const DB = 'vite-flare-starter-db'
const EMAIL = 'showcase@test.vfs.local'
const SEED_DIR = path.join(ROOT, '.jez/seed')
fs.mkdirSync(SEED_DIR, { recursive: true })

const TOKEN =
  process.env.TEST_AUTH_TOKEN ||
  (fs.readFileSync(path.join(os.homedir(), 'Documents/.jez/secrets/vite-flare-starter.md'), 'utf8')
    .match(/TEST_AUTH_TOKEN=([A-Za-z0-9]+)/) || [])[1]
if (!TOKEN) throw new Error('No TEST_AUTH_TOKEN (env or secrets file)')

// ── 1. mint session ────────────────────────────────────────────────────────
console.log('minting showcase session…')
const mintRes = await fetch(`${URL_BASE}/api/test-auth/cookies`, {
  method: 'POST',
  headers: { 'X-Test-Auth': TOKEN, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, name: 'Jordan Hayes' }),
})
if (!mintRes.ok) throw new Error(`mint failed: ${mintRes.status} ${await mintRes.text()}`)
const mint = await mintRes.json()
const USER_ID = mint.user.id
const COOKIE = mint.cookies.map((c) => `${c.name}=${c.value}`).join('; ')
// storageState for the recorder, reused later
fs.writeFileSync(
  path.join(ROOT, '.jez/auth-state.json'),
  JSON.stringify({
    cookies: mint.cookies.map((c) => ({
      name: c.name, value: c.value,
      domain: c.domain || new URL(URL_BASE).hostname, path: c.path || '/',
      httpOnly: c.httpOnly ?? true, secure: c.secure ?? true, sameSite: 'Lax', expires: -1,
    })),
    origins: [],
  })
)
console.log(`  user ${USER_ID} (${EMAIL}); auth-state.json written`)

const sql = (s) => s.replace(/'/g, "''")
async function post(pathname, body) {
  const r = await fetch(`${URL_BASE}${pathname}`, {
    method: 'POST',
    headers: { Cookie: COOKIE, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    console.warn(`  ! POST ${pathname} → ${r.status} ${(await r.text()).slice(0, 140)}`)
    return null
  }
  return r.json().catch(() => ({}))
}

// ── 2. REST creates ────────────────────────────────────────────────────────
console.log('creating projects…')
const PROJECTS = [
  { name: 'Helios Launch', description: 'Coordinating the Helios analytics dashboard launch across marketing, eng, and support.', color: 'violet', systemPrompt: 'You are the launch coordinator for Helios. EN-AU spelling, warm + direct. Summarise by workstream; surface blockers first.' },
  { name: 'Customer Success', description: 'Onboarding, health scores, and renewal tracking for the top 20 accounts.', color: 'emerald' },
  { name: 'Q3 Content Calendar', description: 'Blog posts, case studies, and the launch announcement series.', color: 'amber' },
  { name: 'Platform Reliability', description: 'Incident reviews, SLOs, and the move to multi-region.', color: 'blue' },
]
const projectIds = []
for (const p of PROJECTS) {
  const r = await post('/api/projects', p)
  if (r?.id) projectIds.push(r.id)
}
console.log(`  ${projectIds.length} projects`)

console.log('creating entities (deals / contacts / tickets)…')
const ENTITIES = [
  { type: 'deal', title: 'Northwind Traders — Annual Plan', status: 'negotiation', fields: { company: 'Northwind Traders', value: 48000, currency: 'AUD', contactName: 'Priya Naidu', closeDate: '2026-07-15', probability: 0.7 } },
  { type: 'deal', title: 'Meridian Bank — Enterprise', status: 'qualified', fields: { company: 'Meridian Bank', value: 120000, currency: 'AUD', seats: 250, contactName: 'Tom Albrecht' } },
  { type: 'deal', title: 'Acme Logistics — Team', status: 'lead', fields: { company: 'Acme Logistics', value: 9000, currency: 'AUD' } },
  { type: 'deal', title: 'Globex — Renewal', status: 'won', fields: { company: 'Globex', value: 64000, currency: 'AUD' } },
  { type: 'deal', title: 'Initech — Pilot', status: 'lost', fields: { company: 'Initech', value: 5000, currency: 'AUD', reason: 'went with incumbent' } },
  { type: 'contact', title: 'Priya Naidu', status: 'active', fields: { company: 'Northwind Traders', role: 'Head of Data', email: 'priya@northwind.example' } },
  { type: 'contact', title: 'Tom Albrecht', status: 'active', fields: { company: 'Meridian Bank', role: 'VP Engineering', email: 'tom@meridian.example' } },
  { type: 'ticket', title: 'Dashboard exports timing out for large datasets', status: 'open', fields: { priority: 'high', account: 'Globex' } },
  { type: 'ticket', title: 'SSO setup help — Okta', status: 'in_progress', fields: { priority: 'medium', account: 'Meridian Bank' } },
  { type: 'ticket', title: 'Feature request: scheduled CSV email', status: 'open', fields: { priority: 'low' } },
]
let dealEntityId = null
for (const e of ENTITIES) {
  const r = await post('/api/entities', e)
  if (r?.id && !dealEntityId && e.type === 'deal') dealEntityId = r.id
}
console.log(`  ${ENTITIES.length} entities`)

console.log('creating knowledge docs…')
const KNOWLEDGE = [
  { scope: 'user', scopeId: USER_ID, title: 'Brand voice guidelines', summary: 'How we write — tone, spelling, formatting for all customer-facing copy.', injectionMode: 'always', tags: ['brand', 'writing'], body: '# Brand Voice\n\n- Warm and direct, never corporate.\n- EN-AU spelling: colour, organise, centre.\n- No em dashes. Short sentences.\n- Lead with the customer benefit.\n\n## Forbidden words\nleverage, synergy, circle back, touch base.' },
  { scope: 'user', scopeId: USER_ID, title: 'Pricing & packaging', summary: 'Current plans, seat pricing, and discount guardrails.', tags: ['sales'], body: '# Plans\n\n- **Team** — $9/seat/mo, up to 25 seats.\n- **Business** — $19/seat/mo, SSO + audit log.\n- **Enterprise** — custom, multi-region, SLA.\n\nDiscounts above 15% need VP sign-off.' },
  { scope: 'user', scopeId: USER_ID, title: 'Incident runbook', summary: 'What to do when the dashboard is down — severities, comms, roles.', tags: ['ops'], body: '# Incident Runbook\n\n1. Declare severity (SEV1–3).\n2. Open the incident channel; assign an IC.\n3. Status page within 10 minutes for SEV1/2.\n4. Post-incident review within 48 hours.' },
]
if (projectIds[0]) KNOWLEDGE.push({ scope: 'project', scopeId: projectIds[0], title: 'Helios launch checklist', summary: 'Every gate before we announce.', tags: ['launch'], body: '# Launch Checklist\n\n- [ ] Pricing page live\n- [ ] Docs published\n- [ ] Support macros ready\n- [ ] Announcement email scheduled\n- [ ] Status page tested' })
for (const k of KNOWLEDGE) await post('/api/knowledge', k)
console.log(`  ${KNOWLEDGE.length} knowledge docs`)

console.log('creating memories…')
const MEMORIES = [
  { scope: 'user', scopeId: USER_ID, name: 'preferred-meeting-times', description: 'When the user likes meetings', type: 'preference', content: 'Meetings Tue–Thu, 10am–3pm Sydney. No Mondays (deep work) or Friday arvos.' },
  { scope: 'user', scopeId: USER_ID, name: 'reporting-cadence', description: 'How status updates are expected', type: 'preference', content: 'Weekly status by workstream, blockers first. Numbers over adjectives.' },
  { scope: 'user', scopeId: USER_ID, name: 'helios-positioning', description: 'How we describe Helios', type: 'fact', content: 'Helios = analytics that explains itself. Lead with "stop exporting to spreadsheets".' },
]
for (const m of MEMORIES) await post('/api/memories', m)
console.log(`  ${MEMORIES.length} memories`)

console.log('seeding example routines…')
await post('/api/routines/seed-examples', {})

console.log('inviting demo org members…')
try {
  const orgRes = await fetch(`${URL_BASE}/api/auth/organization/get-full-organization`, {
    headers: { Cookie: COOKIE },
  })
  const org = await orgRes.json()
  const orgId = (org.data || org)?.id
  if (orgId) {
    // better-auth requires an Origin header (CSRF guard) on these writes.
    for (const [email, role] of [
      ['dana@northwind.example', 'member'],
      ['marcus@meridian.example', 'admin'],
      ['lena@globex.example', 'member'],
    ]) {
      await fetch(`${URL_BASE}/api/auth/organization/invite-member`, {
        method: 'POST',
        headers: { Cookie: COOKIE, Origin: URL_BASE, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role, organizationId: orgId }),
      })
    }
  }
} catch (e) {
  console.warn('  ! org invites:', String(e).slice(0, 100))
}

// ── 2b. files (multipart) ──────────────────────────────────────────────────
console.log('uploading demo files…')
const tmp = (name, content) => {
  const p = path.join(SEED_DIR, name)
  fs.writeFileSync(p, content)
  return p
}
const FILES = [
  ['Helios-launch-plan.md', '# Helios Launch Plan\n\n## Goals\n- 500 signups in week one\n- 3 launch-day case studies\n\n## Timeline\n- T-2w: docs freeze\n- T-1w: support macros\n- T-0: announcement + blog + socials\n'],
  ['top-accounts.csv', 'account,plan,seats,health,renewal\nNorthwind Traders,Business,40,Green,2026-07-15\nMeridian Bank,Enterprise,250,Amber,2026-09-01\nGlobex,Business,60,Green,2026-08-10\n'],
  ['onboarding-notes.txt', 'Onboarding notes for Meridian Bank\n- SSO via Okta (in progress)\n- Data import: 3 sources\n- Exec sponsor: Tom Albrecht\n'],
]
const MIME = { '.md': 'text/markdown', '.csv': 'text/csv', '.txt': 'text/plain', '.json': 'application/json', '.pdf': 'application/pdf' }
for (const [name, content] of FILES) {
  const p = tmp(name, content)
  const type = MIME[path.extname(name)] || 'text/plain'
  const fd = new FormData()
  fd.append('file', new Blob([fs.readFileSync(p)], { type }), name)
  fd.append('folder', '/launch')
  if (projectIds[0]) fd.append('projectId', projectIds[0])
  const r = await fetch(`${URL_BASE}/api/files`, { method: 'POST', headers: { Cookie: COOKIE }, body: fd })
  if (!r.ok) console.warn(`  ! file ${name} → ${r.status} ${(await r.text()).slice(0, 120)}`)
}
console.log(`  ${FILES.length} files`)

// ── 3. direct-D1 tables ────────────────────────────────────────────────────
console.log('generating seed.sql for direct-D1 tables…')
const U = sql(USER_ID)
const rid = () => 'lower(hex(randomblob(16)))'
const stmts = []

// findings (entities type=finding, seconds)
const FINDINGS = [
  ['Three enterprise trials expire this week with no activity', 'Acme, Globex, and Initech trials end within 5 days and none have logged in since signup. Recommend a personal check-in from the AE today.', 'sales', 'recurred'],
  ['Dashboard export latency up 40% week-on-week', 'p95 export time crossed 8s on Tuesday. Correlates with the new large-dataset accounts. Suggest pre-aggregation before the launch traffic.', 'reliability', 'open'],
  ['Two top accounts haven’t booked their QBR', 'Northwind and Meridian QBRs are overdue. Both renew in <60 days. Auto-draft a scheduling email?', 'success', 'open'],
]
for (const [title, body, category, status] of FINDINGS) {
  stmts.push(`INSERT INTO entities (id, user_id, organization_id, type, title, status, fields, created_at, updated_at) VALUES (${rid()}, '${U}', NULL, 'finding', '${sql(title)}', '${status}', '${sql(JSON.stringify({ body, category, tags: [category], agentClass: 'SweeperAgent', agentName: 'helios-watcher' }))}', unixepoch(), unixepoch());`)
}

// inbox_items (seconds)
const INBOX = [
  ['lead', 'New high-intent demo request from Meridian Bank', 'high', 0.82, 'Visited pricing 4 times this week then requested a demo for 250 seats.', "unixepoch('now','+2 days')", 15],
  ['summary', 'Weekly launch readiness: 2 gates red', 'medium', 0.9, 'Docs and support macros are behind. Everything else green.', 'NULL', 10],
  ['stuck_ticket', 'Globex export timeout ticket open 6 days', 'medium', 0.74, 'High-priority ticket with no owner reply since Monday.', "unixepoch('now','+1 days')", 20],
  ['churn_risk', 'Initech health dropped to red', 'high', 0.68, 'Usage down 70% MoM and a support escalation still open.', 'NULL', 30],
  ['idea', 'Customers keep asking for scheduled CSV email', 'low', 0.6, 'Three requests this week. Small feature, recurring ask.', 'NULL', 45],
]
for (const [kind, summary, importance, conf, reasoning, due, effort] of INBOX) {
  stmts.push(`INSERT INTO inbox_items (id, user_id, agent_class, kind, summary, importance, confidence, reasoning, due_at, effort_minutes, created_at) VALUES (${rid()}, '${U}', 'SweeperAgent', '${kind}', '${sql(summary)}', '${importance}', ${conf}, '${sql(reasoning)}', ${due}, ${effort}, unixepoch());`)
}

// pending_approvals (seconds) — leave pending, never auto-approve fabricated rows
const APPROVALS = [
  ['send_email', 'Send follow-up to Priya Naidu (Northwind Traders)', { to: 'priya@northwind.example', subject: 'Following up on your annual plan', body: 'Hi Priya, checking in on the proposal from last week...' }],
  ['create_task', 'Schedule QBR with Meridian Bank', { title: 'QBR — Meridian Bank', due: '2026-07-01', attendees: ['tom@meridian.example'] }],
  ['post_message', 'Post launch-readiness summary to #helios-launch', { space: 'helios-launch', text: 'Launch readiness: 2 gates still red (docs, support macros).' }],
]
for (const [action, summary, payload] of APPROVALS) {
  stmts.push(`INSERT INTO pending_approvals (id, user_id, agent_class, agent_name, action, summary, payload_json, status, created_at) VALUES (${rid()}, '${U}', 'AssistantAgent', '${U}:assistant', '${action}', '${sql(summary)}', '${sql(JSON.stringify(payload))}', 'pending', unixepoch());`)
}

// notifications (ms)
const NOTIFS = [
  ['success', 'Deal won: Globex', 'The Globex renewal ($64,000 AUD) just moved to Won.', 0],
  ['info', 'New finding from helios-watcher', 'Three enterprise trials expire this week with no activity.', 0],
  ['warning', 'Export latency above target', 'p95 export time crossed 8s on Tuesday.', 0],
  ['mention', 'You were mentioned in Helios Launch', 'Priya: "can we get the case study by Thursday?"', 1],
  ['assignment', 'Ticket assigned to you', 'Globex export timeout — high priority.', 1],
]
for (const [type, title, message, read] of NOTIFS) {
  stmts.push(`INSERT INTO user_notifications (id, userId, type, title, message, read, createdAt) VALUES (${rid()}, '${U}', '${type}', '${sql(title)}', '${sql(message)}', ${read}, unixepoch()*1000);`)
}

// activity_logs (ms) — spread for the charts
const ACTS = [
  ['create', 'deal', 'Northwind Traders — Annual Plan', 0],
  ['update', 'deal', 'Meridian Bank — Enterprise', 1],
  ['convert', 'deal', 'Globex — Renewal', 1],
  ['create', 'project', 'Helios Launch', 2],
  ['create', 'knowledge', 'Brand voice guidelines', 2],
  ['import', 'entity', 'top-accounts.csv', 3],
  ['create', 'ticket', 'Dashboard exports timing out', 3],
  ['update', 'ticket', 'SSO setup help — Okta', 4],
  ['archive', 'deal', 'Initech — Pilot', 5],
  ['create', 'routine', 'Stuck deals sweeper', 6],
  ['export', 'entity', 'deals.csv', 6],
  ['create', 'file', 'Helios-launch-plan.md', 7],
]
for (const [action, entityType, entityName, daysAgo] of ACTS) {
  stmts.push(`INSERT INTO activity_logs (id, userId, action, entityType, entityId, entityName, createdAt) VALUES (${rid()}, '${U}', '${action}', '${entityType}', ${rid()}, '${sql(entityName)}', (unixepoch('now','-${daysAgo} days'))*1000);`)
}

// agent_runs (seconds) — spread over 14 days for the cost-by-day area chart
const AGENTS = [
  ['ResearcherAgent', 'cf-workers', 'Research the latest Cloudflare Workers AI model releases', 'web_search,fetch_url,record_finding'],
  ['SweeperAgent', 'helios-watcher', 'Scan trials + deals for stalls; emit findings', 'entities_list,inbox_add'],
  ['AssistantAgent', 'assistant', 'Draft the launch announcement email', 'load_knowledge,with_review'],
  ['WriterAgent', 'blog', 'Write the Helios launch blog post', 'load_skill,web_search'],
]
for (let d = 0; d < 22; d++) {
  const a = AGENTS[d % AGENTS.length]
  const day = d % 14
  const outcome = d % 11 === 0 ? 'error' : 'ok'
  const inTok = 1500 + ((d * 137) % 4000)
  const outTok = 300 + ((d * 71) % 1200)
  const cost = (((inTok + outTok * 3) / 1_000_000) * 5).toFixed(4)
  const dur = 8000 + ((d * 911) % 60000)
  stmts.push(`INSERT INTO agent_runs (id, agent_class, agent_name, user_id, trigger, input_summary, started_at, finished_at, duration_ms, outcome, input_tokens, output_tokens, cost_usd, steps, tools_called, created_at) VALUES (${rid()}, '${a[0]}', '${U}:${a[1]}', '${U}', 'schedule', '${sql(a[2])}', unixepoch('now','-${day} days'), unixepoch('now','-${day} days')+${Math.round(dur / 1000)}, ${dur}, '${outcome}', ${inTok}, ${outTok}, ${cost}, ${2 + (d % 5)}, '${a[3]}', unixepoch('now','-${day} days'));`)
}

// conversations + members + messages (ms) — real assistant transcripts (Path B)
const CONVOS = [
  ['Helios launch email', 'Outlined the announcement email and drafted the opener.', 'Help me outline the launch announcement email for Helios.', "Here's a four-part outline:\n\n1. **Hook** — lead with the pain Helios kills: \"stop exporting to spreadsheets\".\n2. **What's new** — self-explaining analytics, scheduled reports, SSO.\n3. **Proof** — Globex cut reporting time 70%.\n4. **CTA** — start a 14-day trial.\n\nWant me to draft the full email from this?"],
  ['Stuck deals review', 'Reviewed deals stalled in negotiation and suggested next steps.', 'Which deals are stuck and what should I do?', 'Two are stalled in negotiation past 14 days:\n\n- **Northwind Traders** ($48k) — waiting on procurement. Suggest a short ROI one-pager.\n- **Meridian Bank** ($120k) — security review. Offer to join their InfoSec call.\n\nI can draft both follow-ups.'],
  ['Incident comms', 'Drafted a status-page update for the export latency incident.', 'Draft a status page note for the export slowdown.', "**Investigating — Dashboard exports are slower than usual**\n\nWe're seeing elevated export times for large datasets and are actively working on it. Dashboards and reports are unaffected. Next update in 30 minutes."],
]
let mt = "unixepoch()*1000"
for (const [title, summary, userMsg, asstMsg] of CONVOS) {
  const cid = `conv-${Math.abs([...title].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % 1e9}`
  const proj = projectIds[0] ? `'${sql(projectIds[0])}'` : 'NULL'
  stmts.push(`INSERT INTO conversations (id, user_id, project_id, title, summary, model, kind, history_enabled, created_at, updated_at) VALUES ('${cid}', '${U}', ${proj}, '${sql(title)}', '${sql(summary)}', '@cf/moonshotai/kimi-k2.6', 'chat', 1, ${mt}, ${mt});`)
  stmts.push(`INSERT INTO conversation_members (id, conversation_id, kind, user_id, role, joined_at, notification_level, pinned_to_sidebar) VALUES (${rid()}, '${cid}', 'user', '${U}', 'owner', unixepoch(), 'all', 0);`)
  stmts.push(`INSERT INTO conversation_members (id, conversation_id, kind, agent_class, agent_name, reply_mode, role, joined_at, notification_level, pinned_to_sidebar) VALUES (${rid()}, '${cid}', 'agent', 'AssistantAgent', 'assistant', 'always', 'member', unixepoch(), 'all', 0);`)
  stmts.push(`INSERT INTO conversation_messages (id, conversation_id, role, parts, thread_count, created_at) VALUES (${rid()}, '${cid}', 'user', '${sql(JSON.stringify([{ type: 'text', text: userMsg }]))}', 0, ${mt});`)
  stmts.push(`INSERT INTO conversation_messages (id, conversation_id, role, parts, thread_count, created_at) VALUES (${rid()}, '${cid}', 'assistant', '${sql(JSON.stringify([{ type: 'text', text: asstMsg }]))}', 0, ${mt}+2000);`)
}

const seedSql = stmts.join('\n')
const seedPath = path.join(SEED_DIR, 'seed.sql')
fs.writeFileSync(seedPath, seedSql)
console.log(`  ${stmts.length} SQL statements → ${path.relative(ROOT, seedPath)}`)

console.log('applying seed.sql to remote D1…')
execFileSync('npx', ['wrangler', 'd1', 'execute', DB, '--remote', `--file=${seedPath}`], {
  cwd: ROOT, stdio: 'inherit',
})

console.log('\n✓ showcase seeded. Recorder auth-state.json is ready (showcase session).')
console.log(`  user: ${EMAIL} (${USER_ID})`)
