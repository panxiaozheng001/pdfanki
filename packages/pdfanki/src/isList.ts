/**
 * Whether a value that is declared as a list actually is one at runtime.
 *
 * `Array.isArray` would answer the same question, but its predicate is `any[]`,
 * and narrowing a `readonly T[]` to that loses the element type: every read
 * after the guard becomes an unsafe member access on `any`. This keeps the
 * check, which the payloads here need - a pdf2json page, an OpenAI-compatible
 * message, a deck handed in by a JavaScript caller are all untyped, and a field
 * described as a list can arrive as anything - and keeps the type as well.
 */
export function isList<T>(value: T): value is Extract<T, readonly unknown[]> {
  return Array.isArray(value);
}
