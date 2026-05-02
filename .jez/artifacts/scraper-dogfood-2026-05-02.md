---
date: 2026-05-02
status: complete
owner: claude
---

# WAF Interstitial Detector Smoke Test — 2026-05-02

Verifying commit `563fa0a` (`fix(browser-tools): WAF interstitial detection + realistic UA`)
still fires correctly against the reference test site one week after deployment.

---

## Site Reachability

**Test site:** `https://newcastleapartments.com.au/`

**curl/8.0 UA response:**
- HTTP body size: **1276 bytes**
- Title: `403 Forbidden`
- Body snippet:
  ```
  <title>403 Forbidden</title>
  ...
  <p style="font-size:21px;font-weight:600">403 Forbidden Error</p>
  <p>If you arrived here due to a search or clicking on a link click your
  Browser's back button to return to the previous page. Thank you.</p>
  <p>Website: newcastleapartments.com.au</p>
  <p>Your IP Address: 34.72.174.153</p>
  <p>BPS Plugin 403 Error Page</p>
  ```
- **Finding:** The site is now blocking bot UAs via a **WordPress BPS (Better Plugin Security) plugin** returning a plain 403 Forbidden HTML page — NOT a Cloudflare "Just a Moment" JS challenge interstitial (200 OK + challenge body).

---

## UA Bypass Effectiveness

| UA | Response size | Outcome |
|---|---|---|
| `curl/8.0` | 1,276 bytes | Blocked — 403 Forbidden (WordPress BPS plugin) |
| Chrome 131 (REALISTIC_USER_AGENT) | 361,981 bytes | Full site content served |

The UA bypass layer works: the realistic Chrome UA gets through to real content. However, the block mechanism has changed — it's now a 403 from the origin server/WP plugin, not a Cloudflare-served JS challenge.

---

## Detector Match Analysis

Detector source: `src/server/lib/interstitial-detect.ts`
Constants verified intact:
- `SUSPICIOUS_LENGTH_THRESHOLD = 400`
- 8 title patterns, 12 body patterns

**Running `detectInterstitial(title, content)` against the curl/8.0 response:**

```
title:         "403 Forbidden"
contentLength: 1276
below threshold: false (1276 >= 400)
```

**Title pattern results:** No match — `"403 Forbidden"` matches none of the 8 patterns
(`/just a moment/i`, `/one moment, please/i`, `/attention required.*cloudflare/i`, etc.)

**Body pattern check:** Skipped — content length 1276 exceeds `SUSPICIOUS_LENGTH_THRESHOLD` of 400.

**Detector result:**
```json
{ "isInterstitial": false }
```

The detector does NOT flag this page. This is technically correct behavior — a `403 Forbidden` with HTML body is a distinct failure mode from a "200 OK + JS challenge" interstitial. HTTP-status-code checks (not the interstitial detector) are the right gate for 403s.

---

## Verdict: INCONCLUSIVE

**Reason:** The test site has changed its bot-protection mechanism. Previously it served a Cloudflare Bot Fight Mode "Just a Moment" JS challenge (HTTP 200 + short challenge body — the exact silent-garbage scenario the detector targets). As of 2026-05-02 it is serving a direct HTTP 403 from a WordPress security plugin.

This is not a detector failure. The detector logic and all patterns are intact and correct. The test site is simply no longer a valid probe for the Cloudflare interstitial pattern.

**Detector health:** The code in `src/server/lib/interstitial-detect.ts` is unchanged from commit `563fa0a` and its pattern logic is sound. No evidence of regression.

**Action needed:** Identify a replacement test site that still serves Cloudflare "Just a Moment" JS challenge pages (HTTP 200 + short body with `/just a moment/i` title or `/enable javascript and cookies to continue/i` body) to keep this smoke test meaningful. The UA bypass test (curl/8.0 vs Chrome UA) is still validated here.
