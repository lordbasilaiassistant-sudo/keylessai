/**
 * Strict request validation for the proxy. Everything that crosses the
 * network boundary gets shape-checked here before any downstream code sees
 * it. Goals:
 *
 *   - Prevent prototype pollution (__proto__, constructor, prototype keys)
 *   - Reject malformed messages shape early (clearer error for the caller)
 *   - Bound per-field sizes (defense-in-depth against the overall body cap)
 *   - Normalize model + stream flags
 *
 * All validator functions throw a `ValidationError` whose `message` goes
 * straight into the JSON error response — keep them user-safe (no stack
 * trace leakage, no internal paths).
 *
 * @module server/validate
 */

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
    this.httpStatus = 400;
    this.httpType = "invalid_request_error";
  }
}

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const ALLOWED_ROLES = new Set(["system", "user", "assistant", "tool", "function", "developer"]);
const MAX_MESSAGES = 200;
const MAX_MESSAGE_CONTENT = 500_000;   // per-message content chars
const MAX_MODEL_LENGTH = 200;

function hasDangerousKey(obj) {
  if (!obj || typeof obj !== "object") return false;
  for (const k of Object.keys(obj)) {
    if (DANGEROUS_KEYS.has(k)) return true;
    const v = obj[k];
    if (v && typeof v === "object" && hasDangerousKey(v)) return true;
  }
  return false;
}

/**
 * Deep-validate a request body for /v1/chat/completions.
 * Returns a NORMALIZED copy (throws ValidationError on bad input).
 */
export function validateChatBody(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError("request body must be a JSON object");
  }

  if (hasDangerousKey(body)) {
    throw new ValidationError("request contains forbidden keys (__proto__, constructor, prototype)");
  }

  const { model, messages, stream, temperature, top_p, tools, response_format } = body;

  if (model !== undefined) {
    if (typeof model !== "string") throw new ValidationError("model must be a string");
    if (model.length === 0 || model.length > MAX_MODEL_LENGTH) {
      throw new ValidationError(`model must be 1..${MAX_MODEL_LENGTH} chars`);
    }
  }

  if (!Array.isArray(messages)) {
    throw new ValidationError("messages must be an array");
  }
  if (messages.length === 0) {
    throw new ValidationError("messages must not be empty");
  }
  if (messages.length > MAX_MESSAGES) {
    throw new ValidationError(`messages must be at most ${MAX_MESSAGES} entries`);
  }

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m || typeof m !== "object" || Array.isArray(m)) {
      throw new ValidationError(`messages[${i}] must be an object`);
    }
    if (typeof m.role !== "string" || !ALLOWED_ROLES.has(m.role)) {
      throw new ValidationError(
        `messages[${i}].role must be one of: ${[...ALLOWED_ROLES].join(", ")}`
      );
    }
    // Content can be string OR an array (OpenAI vision/multi-part) OR null for tool calls.
    if (m.content !== null && m.content !== undefined) {
      if (typeof m.content === "string") {
        if (m.content.length > MAX_MESSAGE_CONTENT) {
          throw new ValidationError(
            `messages[${i}].content exceeds ${MAX_MESSAGE_CONTENT} chars`
          );
        }
      } else if (!Array.isArray(m.content)) {
        throw new ValidationError(`messages[${i}].content must be string or array`);
      }
    }
  }

  if (stream !== undefined && typeof stream !== "boolean") {
    throw new ValidationError("stream must be a boolean");
  }

  if (temperature !== undefined) {
    if (typeof temperature !== "number" || !Number.isFinite(temperature)) {
      throw new ValidationError("temperature must be a finite number");
    }
    if (temperature < 0 || temperature > 2) {
      throw new ValidationError("temperature must be between 0 and 2");
    }
  }

  if (top_p !== undefined) {
    if (typeof top_p !== "number" || !Number.isFinite(top_p)) {
      throw new ValidationError("top_p must be a finite number");
    }
    if (top_p < 0 || top_p > 1) {
      throw new ValidationError("top_p must be between 0 and 1");
    }
  }

  if (tools !== undefined && !Array.isArray(tools)) {
    throw new ValidationError("tools must be an array");
  }

  if (response_format !== undefined) {
    if (!response_format || typeof response_format !== "object") {
      throw new ValidationError("response_format must be an object");
    }
  }

  return body;
}

export function validateCompletionsBody(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError("request body must be a JSON object");
  }
  if (hasDangerousKey(body)) {
    throw new ValidationError("request contains forbidden keys");
  }
  if (typeof body.prompt !== "string" || !body.prompt.length) {
    throw new ValidationError("prompt must be a non-empty string");
  }
  if (body.prompt.length > MAX_MESSAGE_CONTENT) {
    throw new ValidationError(`prompt exceeds ${MAX_MESSAGE_CONTENT} chars`);
  }
  return body;
}
