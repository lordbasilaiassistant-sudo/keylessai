/**
 * Spam / notice detection for upstream provider responses.
 *
 * Some keyless providers inject messages INSTEAD of (or mixed into) the
 * model's real response:
 *   - Pollinations occasionally returns "IMPORTANT NOTICE — please migrate..."
 *   - ApiAirforce occasionally returns promo URLs ("op.wtf", "upgrade your plan")
 *
 * The router buffers the first few chunks and runs `looksLikeNotice()` on
 * them. On match, it aborts and retries with backoff; on persistent match
 * after N retries, it fails over to the next provider.
 *
 * Kept separate from the router so:
 *   - patterns can be added without touching orchestration logic
 *   - the detector can be unit-tested against real-world samples
 *
 * @module core/notices
 */

export const NOTICE_PATTERNS = [
  /important notice/i,
  /legacy .{0,40}api is being deprecated/i,
  /please migrate to/i,
  /enter\.pollinations\.ai/i,
  /upgrade your plan/i,
  /discord\.gg\/airforce/i,
  /\bapi\.airforce\b/i,
  /need proxies cheaper than/i,
  /op\.wtf/i,
  /remove this message at/i,
];

/**
 * Returns true if the given text is probably a provider notice/ad rather
 * than a real model response.
 *
 * Heuristic:
 *   - 2+ distinct patterns → notice
 *   - 1 pattern + short body + has URL → notice
 *   - no patterns → not a notice
 *
 * @param {string} text
 * @returns {boolean}
 */
export function looksLikeNotice(text) {
  if (!text) return false;
  const sample = text.slice(0, 600);
  const hits = NOTICE_PATTERNS.filter((re) => re.test(sample)).length;
  if (hits >= 2) return true;
  const hasAnyUrl = /https?:\/\//i.test(sample);
  const shortAndMostlyLinks = sample.length < 300 && hasAnyUrl && hits >= 1;
  return shortAndMostlyLinks;
}
