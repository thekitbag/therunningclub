import type { MetadataRoute } from 'next';

/**
 * Asks every crawler to stay away from the whole site.
 *
 * The club's results are members' names and performance data, and the club has
 * decided they should not be findable by strangers. The passcode gate is what
 * actually enforces that; this, and the `X-Robots-Tag` header set in
 * middleware, are what stop the site being indexed in the first place.
 *
 * If anything was indexed before the gate went up, these will not remove it —
 * use Google Search Console's removal tool for that. See docs/privacy-gate.md.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
  };
}
