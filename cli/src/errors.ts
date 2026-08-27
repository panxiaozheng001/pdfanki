/**
 * What was thrown, said in one line.
 *
 * `catch` binds `unknown`, and what reaches these handlers is not always an
 * `Error`: a provider SDK throws its API response, a JSON boundary throws a
 * string. Reaching for `.message` through a cast reports `undefined` for those,
 * which is how a real failure ends up on screen as "Conversion failed:
 * undefined".
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "unknown error";
}

/** Whether a failed `fs` call failed because the path is not there. */
export function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }

  return error.code === "ENOENT";
}
