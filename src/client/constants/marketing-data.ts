/**
 * Marketing data constants for promotional pages.
 * Single source of truth for MCP servers, SDK modules, and contact info.
 */

export const mcpServers = [
  { name: 'Contacts', tools: 6, endpoint: '/api/mcp/contacts' },
  { name: 'Companies', tools: 7, endpoint: '/api/mcp/companies' },
  { name: 'Deals', tools: 8, endpoint: '/api/mcp/deals' },
  { name: 'Cases', tools: 8, endpoint: '/api/mcp/cases' },
  { name: 'Notes', tools: 7, endpoint: '/api/mcp/notes' },
  { name: 'Docs', tools: 13, endpoint: '/api/mcp-docs' },
  { name: 'Enquiries', tools: 4, endpoint: '/api/mcp' },
] as const

export const totalMcpTools = mcpServers.reduce((sum, s) => sum + s.tools, 0) // 53

export const sdkModules = [
  { name: 'Contacts', methods: 6 },
  { name: 'Companies', methods: 7 },
  { name: 'Deals', methods: 8 },
  { name: 'Cases', methods: 8 },
  { name: 'Notes', methods: 7 },
  { name: 'Enquiries', methods: 4 },
] as const

export const totalSdkMethods = sdkModules.reduce((sum, m) => sum + m.methods, 0) // 40

export const jezwebContact = {
  name: 'Jezweb',
  tagline: 'Web Development & Digital Solutions',
  email: 'jeremy@jezweb.net',
  phone: '+61 411 056 876',
  website: 'https://www.jezweb.com.au',
  location: {
    city: 'Newcastle',
    state: 'NSW',
    country: 'Australia',
  },
  logo: 'https://www.jezweb.com.au/wp-content/uploads/2021/11/Jezweb-Logo-White-Transparent.svg',
  favicon: 'https://www.jezweb.com.au/wp-content/uploads/2020/03/favicon-100x100.png',
} as const

// Example SDK code for marketing pages
export const sdkCodeExample = `import { contacts, companies, deals } from './scripts/sdk'

// Create a company
const { company } = await companies.createCompany({
  name: 'Acme Corp',
  industry: 'Technology',
})

// Create linked contact
const { contact } = await contacts.createContact({
  firstName: 'John',
  lastName: 'Doe',
  companyId: company.id,
})

// Create a deal
const { deal } = await deals.createDeal({
  title: 'Enterprise License',
  value: 50000,
  companyId: company.id,
})`

// Claude Desktop config example
export const claudeDesktopConfig = `{
  "mcpServers": {
    "crm-contacts": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://your-domain/api/mcp/contacts/sse"],
      "env": { "API_TOKEN": "vfs_your-token" }
    }
  }
}`

// Type exports for consumers
export type McpServer = (typeof mcpServers)[number]
export type SdkModule = (typeof sdkModules)[number]
export type JezwebContact = typeof jezwebContact
