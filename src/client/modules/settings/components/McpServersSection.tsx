import { useState } from 'react'
import { toast } from 'sonner'
import { Server, Copy, Check, ExternalLink, Info, Terminal, MessageSquare, Code, Mic } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// MCP Server definitions
const MCP_SERVERS = [
  { name: 'Enquiries', endpoint: '/api/mcp/message', tools: 4, description: 'Website form submissions' },
  { name: 'Contacts', endpoint: '/api/mcp/contacts/message', tools: 6, description: 'CRM contacts management' },
  { name: 'Companies', endpoint: '/api/mcp/companies/message', tools: 7, description: 'Company records' },
  { name: 'Deals', endpoint: '/api/mcp/deals/message', tools: 8, description: 'Sales pipeline' },
  { name: 'Cases', endpoint: '/api/mcp/cases/message', tools: 8, description: 'Support tickets' },
  { name: 'Notes', endpoint: '/api/mcp/notes/message', tools: 7, description: 'Notes on any entity' },
  { name: 'Docs', endpoint: '/api/mcp/docs/message', tools: 13, description: 'Documentation wiki' },
]

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success(label ? `${label} copied` : 'Copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleCopy} className="h-8 w-8 p-0">
      {copied ? (
        <Check className="h-4 w-4 text-green-500" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </Button>
  )
}

export function McpServersSection() {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const [token, setToken] = useState('')

  // Use placeholder or actual token in examples
  const tokenDisplay = token || '<your-api-token>'
  const tokenPlaceholder = token ? token : '<your-api-token>'

  const exampleCurl = `curl -X POST ${baseUrl}/api/mcp/contacts/message \\
  -H "Authorization: Bearer ${tokenPlaceholder}" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'`

  return (
    <div className="space-y-6">
      {/* Overview Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" />
            <CardTitle>MCP Servers</CardTitle>
          </div>
          <CardDescription>
            Connect AI agents to your CRM data using the Model Context Protocol (MCP)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              MCP servers allow AI agents like ElevenLabs Conversational AI to interact with your
              CRM data. Each server provides tools for specific operations.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Authentication Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Authentication</CardTitle>
          <CardDescription>
            Use Bearer token authentication with your API token
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="api-token">Your API Token (optional)</Label>
            <p className="text-sm text-muted-foreground mb-2">
              Paste your token here to auto-fill the examples below
            </p>
            <Input
              id="api-token"
              type="password"
              placeholder="vfs_..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="font-mono"
            />
          </div>

          <div>
            <h4 className="font-medium mb-2">Authorization Header</h4>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted p-3 rounded text-sm font-mono break-all">
                Authorization: Bearer {tokenDisplay}
              </code>
              <CopyButton text={`Authorization: Bearer ${tokenPlaceholder}`} label="Header" />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Info className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Don't have an API token?{' '}
              <Link
                to="/dashboard/settings?tab=api-tokens"
                className="text-primary hover:underline"
              >
                Create one in the API Tokens tab
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Server Endpoints Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Available Servers</CardTitle>
          <CardDescription>
            {MCP_SERVERS.length} MCP servers with {MCP_SERVERS.reduce((sum, s) => sum + s.tools, 0)} total tools
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Base URL */}
          <div>
            <h4 className="font-medium mb-2">Base URL</h4>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted p-3 rounded text-sm font-mono break-all">
                {baseUrl}
              </code>
              <CopyButton text={baseUrl} label="Base URL" />
            </div>
          </div>

          {/* Endpoints Table */}
          <div>
            <h4 className="font-medium mb-2">Endpoints</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Server</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead className="text-center">Tools</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MCP_SERVERS.map((server) => (
                  <TableRow key={server.name}>
                    <TableCell>
                      <div>
                        <span className="font-medium">{server.name}</span>
                        <p className="text-xs text-muted-foreground">{server.description}</p>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {server.endpoint}
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      {server.tools}
                    </TableCell>
                    <TableCell>
                      <CopyButton
                        text={`${baseUrl}${server.endpoint}`}
                        label={`${server.name} URL`}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Connection Examples Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Connection Examples</CardTitle>
          <CardDescription>
            Configure MCP servers in your preferred AI tool
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="elevenlabs" className="w-full">
            <TabsList className="grid w-full grid-cols-4 mb-4">
              <TabsTrigger value="elevenlabs" className="flex items-center gap-1.5">
                <Mic className="h-4 w-4" />
                <span className="hidden sm:inline">ElevenLabs</span>
              </TabsTrigger>
              <TabsTrigger value="claude-code" className="flex items-center gap-1.5">
                <Code className="h-4 w-4" />
                <span className="hidden sm:inline">Claude Code</span>
              </TabsTrigger>
              <TabsTrigger value="claude-desktop" className="flex items-center gap-1.5">
                <MessageSquare className="h-4 w-4" />
                <span className="hidden sm:inline">Claude Desktop</span>
              </TabsTrigger>
              <TabsTrigger value="curl" className="flex items-center gap-1.5">
                <Terminal className="h-4 w-4" />
                <span className="hidden sm:inline">cURL</span>
              </TabsTrigger>
            </TabsList>

            {/* ElevenLabs Example */}
            <TabsContent value="elevenlabs" className="space-y-4">
              <div className="text-sm text-muted-foreground mb-2">
                In ElevenLabs Agent settings, go to <strong>Tools</strong> → <strong>Add Tool</strong> → <strong>MCP</strong>:
              </div>

              <div className="space-y-4">
                <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                  <h4 className="font-medium">1. Server Configuration</h4>
                  <ul className="text-sm space-y-2 ml-4">
                    <li>• <strong>Server type:</strong> Streamable HTTP</li>
                    <li>• <strong>Server URL Type:</strong> Value</li>
                    <li>• <strong>URL:</strong> Copy one of the endpoints below</li>
                  </ul>
                </div>

                <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                  <h4 className="font-medium">2. HTTP Headers (for authentication)</h4>
                  <p className="text-sm text-muted-foreground">Click "Add header" and configure:</p>
                  <ul className="text-sm space-y-2 ml-4">
                    <li>• <strong>Type:</strong> Value (or Secret for extra security)</li>
                  </ul>
                  <div className="space-y-2 mt-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm w-16">Name:</span>
                      <code className="flex-1 bg-muted p-2 rounded text-xs font-mono">
                        Authorization
                      </code>
                      <CopyButton text="Authorization" label="Name" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm w-16">Value:</span>
                      <code className="flex-1 bg-muted p-2 rounded text-xs font-mono truncate">
                        Bearer {tokenDisplay}
                      </code>
                      <CopyButton text={`Bearer ${tokenPlaceholder}`} label="Value" />
                    </div>
                  </div>
                </div>

                <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                  <h4 className="font-medium">3. Tool Approval Mode</h4>
                  <p className="text-sm text-muted-foreground">
                    Choose "Always Ask" (recommended) or "No Approval" for hands-free operation.
                  </p>
                </div>
              </div>

              {/* Server URLs for ElevenLabs */}
              <div className="pt-4">
                <h4 className="font-medium mb-3">Server URLs (copy one at a time)</h4>
                <div className="space-y-2">
                  {[
                    { name: 'Enquiries', endpoint: '/api/mcp/message' },
                    { name: 'Contacts', endpoint: '/api/mcp/contacts/message' },
                    { name: 'Companies', endpoint: '/api/mcp/companies/message' },
                    { name: 'Deals', endpoint: '/api/mcp/deals/message' },
                    { name: 'Cases', endpoint: '/api/mcp/cases/message' },
                    { name: 'Notes', endpoint: '/api/mcp/notes/message' },
                    { name: 'Docs', endpoint: '/api/mcp/docs/message' },
                  ].map((server) => (
                    <div key={server.name} className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground w-24">{server.name}:</span>
                      <code className="flex-1 bg-muted p-2 rounded text-xs font-mono truncate">
                        {baseUrl}{server.endpoint}
                      </code>
                      <CopyButton text={`${baseUrl}${server.endpoint}`} label={server.name} />
                    </div>
                  ))}
                </div>
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Add one MCP server per CRM module. Check "I trust this server" before clicking "Add Server".
                </AlertDescription>
              </Alert>
            </TabsContent>

            {/* cURL Example */}
            <TabsContent value="curl" className="space-y-4">
              <div className="relative">
                <pre className="bg-muted p-4 rounded text-sm font-mono overflow-x-auto whitespace-pre-wrap break-all">
                  {exampleCurl}
                </pre>
                <div className="absolute top-2 right-2">
                  <CopyButton text={exampleCurl} label="cURL command" />
                </div>
              </div>
              <div className="text-sm text-muted-foreground space-y-2">
                <p>Common MCP methods:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><code className="bg-muted px-1 rounded">tools/list</code> - List all available tools</li>
                  <li><code className="bg-muted px-1 rounded">tools/call</code> - Execute a specific tool</li>
                  <li><code className="bg-muted px-1 rounded">initialize</code> - Get server capabilities</li>
                </ul>
              </div>
            </TabsContent>

            {/* Claude Desktop Example */}
            <TabsContent value="claude-desktop" className="space-y-4">
              <div className="text-sm text-muted-foreground mb-2">
                Add to <code className="bg-muted px-1 rounded">~/Library/Application Support/Claude/claude_desktop_config.json</code> (macOS)
                or <code className="bg-muted px-1 rounded">%APPDATA%\Claude\claude_desktop_config.json</code> (Windows):
              </div>

              {/* Individual server configs */}
              <div className="space-y-3">
                {[
                  { name: 'crm-enquiries', endpoint: '/api/mcp/message' },
                  { name: 'crm-contacts', endpoint: '/api/mcp/contacts/message' },
                  { name: 'crm-companies', endpoint: '/api/mcp/companies/message' },
                  { name: 'crm-deals', endpoint: '/api/mcp/deals/message' },
                  { name: 'crm-cases', endpoint: '/api/mcp/cases/message' },
                  { name: 'crm-notes', endpoint: '/api/mcp/notes/message' },
                  { name: 'crm-docs', endpoint: '/api/mcp/docs/message' },
                ].map((server) => (
                  <div key={server.name} className="relative">
                    <div className="text-xs text-muted-foreground mb-1 font-medium">{server.name}</div>
                    <div className="flex items-start gap-2">
                      <pre className="flex-1 bg-muted p-3 rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap">
{`"${server.name}": {
  "url": "${baseUrl}${server.endpoint}",
  "headers": {
    "Authorization": "Bearer ${tokenPlaceholder}"
  }
}`}
                      </pre>
                      <CopyButton
                        text={`"${server.name}": {
  "url": "${baseUrl}${server.endpoint}",
  "headers": {
    "Authorization": "Bearer ${tokenPlaceholder}"
  }
}`}
                        label={server.name}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Wrap server configs in <code className="bg-muted px-1 rounded">{`{"mcpServers": { ... }}`}</code>. Restart Claude Desktop after modifying.
                </AlertDescription>
              </Alert>
            </TabsContent>

            {/* Claude Code Example */}
            <TabsContent value="claude-code" className="space-y-4">
              <div className="text-sm text-muted-foreground mb-2">
                Run these commands in your terminal to add MCP servers:
              </div>

              {/* Individual commands */}
              <div className="space-y-3">
                {[
                  { name: 'crm-enquiries', endpoint: '/api/mcp/message', label: 'Enquiries' },
                  { name: 'crm-contacts', endpoint: '/api/mcp/contacts/message', label: 'Contacts' },
                  { name: 'crm-companies', endpoint: '/api/mcp/companies/message', label: 'Companies' },
                  { name: 'crm-deals', endpoint: '/api/mcp/deals/message', label: 'Deals' },
                  { name: 'crm-cases', endpoint: '/api/mcp/cases/message', label: 'Cases' },
                  { name: 'crm-notes', endpoint: '/api/mcp/notes/message', label: 'Notes' },
                  { name: 'crm-docs', endpoint: '/api/mcp/docs/message', label: 'Docs' },
                ].map((server) => {
                  const cmd = `claude mcp add --transport http ${server.name} ${baseUrl}${server.endpoint} --header "Authorization: Bearer ${tokenPlaceholder}"`
                  return (
                    <div key={server.name}>
                      <div className="text-xs text-muted-foreground mb-1 font-medium">{server.label}</div>
                      <div className="flex items-start gap-2">
                        <code className="flex-1 bg-muted p-3 rounded text-xs font-mono break-all">
                          {cmd}
                        </code>
                        <CopyButton text={cmd} label={server.label} />
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="text-sm text-muted-foreground space-y-2">
                <p>Useful commands:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><code className="bg-muted px-1 rounded">claude mcp list</code> - List installed servers</li>
                  <li><code className="bg-muted px-1 rounded">claude mcp remove &lt;name&gt;</code> - Remove a server</li>
                  <li><code className="bg-muted px-1 rounded">/mcp</code> - Check status inside Claude Code</li>
                </ul>
              </div>
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Add <code className="bg-muted px-1 rounded">--scope project</code> to save to <code className="bg-muted px-1 rounded">.mcp.json</code> or <code className="bg-muted px-1 rounded">--scope user</code> for global config.
                </AlertDescription>
              </Alert>
            </TabsContent>
          </Tabs>

          <div className="pt-4 flex flex-wrap gap-4 border-t mt-4">
            <a
              href="https://modelcontextprotocol.io/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-sm text-primary hover:underline"
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              MCP Documentation
            </a>
            <a
              href="https://docs.anthropic.com/en/docs/claude-code/mcp"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-sm text-primary hover:underline"
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              Claude Code MCP Guide
            </a>
            <a
              href="https://elevenlabs.io/docs/agents-platform/customization/tools/mcp"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-sm text-primary hover:underline"
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              ElevenLabs MCP Setup
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
