/**
 * What was thrown, said in one line.
 *
 * `catch` binds `unknown`, and the providers here throw whatever their SDK
 * threw: an `Error`, an API response object, occasionally a string. Reaching
 * for `.message` through a cast reports `undefined` for the ones that are not
 * `Error`s, which is how a real failure ends up logged as
 * "Request failed: undefined".
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "unknown error";
}
