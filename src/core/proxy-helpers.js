/**
 * Shared proxy/runtime helpers used by both the local Node proxy
 * (src/server/proxy.js) and the Cloudflare Worker entry point
 * (worker/index.js).
 *
 * Must contain ZERO Node-specific imports — runs on Cloudflare V8 isolates,
 * Deno Deploy, Vercel Edge, and Node 18+.
 *
 * Why this file exists: 0.4.1 had the tool-call stitch fix in proxy.js,
 * but worker/index.js had its own copy of buildToolCallsFromAccumulator.
 * The Worker's local copy diverged silently until manual mirroring caught
 * it. Now both files import from here — adding a step to one means it
 * lands in both by construction.
 *
 * @module core/proxy-helpers
 */

/**
 * Convert a {type:"tool_call_delta", index, id?, name?, arguments?} chunk
 * into an OpenAI-shaped streaming `delta.tool_calls` element.
 */
export function toolDeltaChunk(c) {
  const fn = {};
  if (c.name !== undefined) fn.name = c.name;
  if (c.arguments !== undefined) fn.arguments = c.arguments;
  const tc = { index: c.index || 0 };
  if (c.id !== undefined) tc.id = c.id;
  tc.type = "function";
  tc.function = fn;
  return tc;
}

/**
 * "Looks like the start of a fresh JSON object" — distinguishes a real tool
 * call's args from a continuation fragment.
 */
export function looksLikeOpenJson(s) {
  if (typeof s !== "string") return false;
  const t = s.trimStart();
  return t.startsWith("{") || t.startsWith("[");
}

/**
 * True iff the string parses cleanly as JSON. Used to detect when a
 * previous tool call's args are already complete (so we should NOT stitch
 * the next chunk onto it).
 */
export function isCompleteJson(s) {
  if (typeof s !== "string" || !s.trim()) return false;
  try { JSON.parse(s); return true; } catch { return false; }
}

/**
 * Build the final non-streaming `message.tool_calls` array from accumulated
 * deltas. Keyed by `index` so parallel tool calls assemble independently
 * and out-of-order fragments still produce a stable result.
 *
 * Defensive stitch (added 2026-04-28 in 0.4.1 after observing Pollinations
 * occasionally fragmenting one logical tool call across two indices —
 * first carries `name + truncated JSON args`, second carries `empty name +
 * tail of args`). Heuristic: if an entry has empty `name` AND its
 * `arguments` look like a JSON tail (don't start with `{` or `[`) AND the
 * previous entry's args don't already form valid JSON, append into the
 * previous entry instead of emitting a separate tool call. Restores the
 * model's intended single tool call without affecting genuinely-parallel
 * ones.
 *
 * @param {Object<string|number, {id?:string, name?:string, arguments?:string}>} acc
 *   Index-keyed accumulator built up during streaming.
 * @returns {Array<{id:string, type:'function', function:{name:string, arguments:string}}>}
 */
export function buildToolCallsFromAccumulator(acc) {
  const indices = Object.keys(acc).map(Number).sort((a, b) => a - b);
  const stitched = [];
  for (const i of indices) {
    const e = acc[i];
    const isFragment =
      !e.name &&
      stitched.length > 0 &&
      e.arguments &&
      !looksLikeOpenJson(e.arguments) &&
      !isCompleteJson(stitched[stitched.length - 1].arguments);
    if (isFragment) {
      stitched[stitched.length - 1].arguments += e.arguments;
      continue;
    }
    stitched.push({ id: e.id, name: e.name || "", arguments: e.arguments || "" });
  }
  return stitched.map((e, n) => ({
    id: e.id || `call_${n}`,
    type: "function",
    function: { name: e.name, arguments: e.arguments },
  }));
}
