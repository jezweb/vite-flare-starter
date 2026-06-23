/**
 * HTML-escape untrusted text before interpolating it into an HTML response.
 * The single source of truth — OAuth callback pages, email bodies, and any
 * other server-rendered HTML that embeds user/provider-controlled strings
 * (error/error_description query params, names, etc.) must run values through
 * this, or an attacker reflects `<script>` into the app origin.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
