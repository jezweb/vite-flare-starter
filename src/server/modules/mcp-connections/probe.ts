/**
 * MCP server probe — discover auth requirements before connecting.
 *
 * Flow:
 *  1. HEAD/GET the MCP URL. If it accepts unauthenticated requests
 *     -> auth_type = 'none'.
 *  2. If 401 with WWW-Authenticate header pointing at an auth server,
 *     fetch `/.well-known/oauth-authorization-server` and return the
 *     discovered endpoints -> auth_type = 'oauth'.
 *  3. If 401 without discovery metadata, fall back to 'bearer'.
 *
 * Gracefully degrades — any network error returns `{ authType: 'bearer' }`
 * so the user can paste a token manually without us blocking.
 */

import { isSafePublicUrl } from '@/server/lib/ssrf'

export interface ProbeResult {
  authType: 'oauth' | 'bearer' | 'none'
  authorizationEndpoint?: string
  tokenEndpoint?: string
  registrationEndpoint?: string
  authServerUrl?: string
  error?: string
}

export async function probeMcpServer(url: string): Promise<ProbeResult> {
  // SSRF guard: never probe a private/internal/metadata target from a
  // user-supplied URL. Degrade to manual-bearer so the UI still lets the
  // user paste a token, but we don't fetch the internal address.
  if (!isSafePublicUrl(url)) {
    return { authType: 'bearer', error: 'URL not allowed (must be a public https host)' }
  }
  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json, text/event-stream' },
      redirect: 'manual',
    })

    if (resp.ok) {
      return { authType: 'none' }
    }

    if (resp.status === 401) {
      const wwwAuth = resp.headers.get('www-authenticate') ?? ''
      const resourceMeta = /resource_metadata="([^"]+)"/.exec(wwwAuth)?.[1]
      if (resourceMeta) {
        return await fetchOAuthMetadata(resourceMeta)
      }

      const origin = new URL(url).origin
      const wellKnown = `${origin}/.well-known/oauth-authorization-server`
      try {
        return await fetchOAuthMetadata(wellKnown)
      } catch {
        return { authType: 'bearer' }
      }
    }

    return { authType: 'bearer' }
  } catch (err) {
    return {
      authType: 'bearer',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function fetchOAuthMetadata(metadataUrl: string): Promise<ProbeResult> {
  const resp = await fetch(metadataUrl, {
    headers: { Accept: 'application/json' },
  })
  if (!resp.ok) {
    return { authType: 'bearer' }
  }
  const json = (await resp.json()) as Record<string, string | undefined>
  return {
    authType: 'oauth',
    authServerUrl: json['issuer'],
    authorizationEndpoint: json['authorization_endpoint'],
    tokenEndpoint: json['token_endpoint'],
    registrationEndpoint: json['registration_endpoint'],
  }
}

/**
 * Dynamic Client Registration (RFC 7591) — registers this app as a client
 * with the auth server and receives a client_id (and optional secret).
 */
export async function registerOAuthClient(
  registrationEndpoint: string,
  redirectUri: string,
  clientName = 'Vite Flare Starter'
): Promise<{ clientId: string; clientSecret?: string } | null> {
  try {
    const resp = await fetch(registrationEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: clientName,
        redirect_uris: [redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      }),
    })
    if (!resp.ok) return null
    const json = (await resp.json()) as { client_id: string; client_secret?: string }
    return {
      clientId: json.client_id,
      clientSecret: json.client_secret,
    }
  } catch {
    return null
  }
}
