/**
 * Raw alert storage boundary.
 *
 * Raw payloads are useful for audit and reprocessing, but credentials must never
 * be persisted. This walker intentionally uses an allow-by-shape approach: all
 * non-sensitive fields are preserved, while well-known secret-bearing keys are
 * replaced at every nesting level.
 */

const SENSITIVE_KEY =
  /password|passwd|secret|token|api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|cookie|set-cookie/i;
const MAX_DEPTH = 20;

export interface RedactedRawAlert {
  payload: unknown;
  redactionCount: number;
}

function walk(value: unknown, depth: number, counter: { value: number }): unknown {
  if (depth > MAX_DEPTH) return "[MAX_DEPTH]";
  if (Array.isArray(value)) {
    return value.map((item) => walk(item, depth + 1, counter));
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key)) {
        result[key] = "[REDACTED]";
        counter.value += 1;
      } else {
        result[key] = walk(child, depth + 1, counter);
      }
    }
    return result;
  }
  return value;
}

export function redactRawAlert(value: unknown): RedactedRawAlert {
  const counter = { value: 0 };
  return { payload: walk(value, 0, counter), redactionCount: counter.value };
}
