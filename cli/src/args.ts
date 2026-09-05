import { SUPPORTED_PROVIDERS, type SupportedProvider } from "./config.js";

/**
 * What yargs hands a handler: `_`, `$0`, and whatever the builder registered,
 * none of it typed. Every field below is read through a narrowing helper rather
 * than trusted here, which is why they are `unknown`. The index signature is
 * what makes a yargs argv assignable to these shapes at all — without it an
 * all-optional interface is a weak type, and TypeScript rejects an object that
 * shares no property with it.
 */
export type ParsedArgs = Record<string, unknown>;

/** A user-supplied name reduced to something safe to use as a filename stem. */
export function toKebabAlnum(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gi, "-");
  const collapsed = normalized.replaceAll(/-+/g, "-").replaceAll(/^-+|-+$/g, "");
  return collapsed || "deck";
}

/** A yargs string option as given, or undefined when it was not passed. */
export function optionalStringArg(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** The provider a `--provider` flag names, checked against the ones that exist. */
export function optionalProviderArg(value: unknown): SupportedProvider | undefined {
  return SUPPORTED_PROVIDERS.find((provider) => provider === value);
}

export function normalizePathArg(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizePreviewCliArgs(args: string[]): string[] {
  const normalizedArgs: string[] = [];

  /* `--preview 200` is rewritten to `--preview --preview-chars 200`, so a pass
     that reads the count has already consumed the argument after it. */
  let consumedNext = false;

  for (const [index, current] of args.entries()) {
    if (consumedNext) {
      consumedNext = false;
      continue;
    }

    if (current === "--preview") {
      const next = args[index + 1];
      if (typeof next === "string" && /^\d+$/.test(next)) {
        normalizedArgs.push("--preview", "--preview-chars", next);
        consumedNext = true;
        continue;
      }
    }

    if (current.startsWith("--preview=")) {
      const previewValue = current.slice("--preview=".length).trim();
      if (/^\d+$/.test(previewValue)) {
        normalizedArgs.push("--preview", "--preview-chars", previewValue);
        continue;
      }
    }

    normalizedArgs.push(current);
  }

  return normalizedArgs;
}

export function flagProvided(value: unknown): boolean {
  if (value === undefined) {
    return false;
  }
  if (typeof value === "boolean") {
    return value;
  }
  return true;
}

export function toBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  return fallback;
}

export function normalizeRequiredInputPath(value: unknown): string {
  const normalized = normalizePathArg(value);
  if (!normalized) {
    throw new Error("Provide an <input> path.");
  }
  return normalized;
}

export function normalizeIntegerOption(
  value: unknown,
  flagName: string,
  minimum: number,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < minimum
  ) {
    const expectation = minimum === 0 ? "a non-negative integer" : "a positive integer";
    throw new Error(`${flagName} must be ${expectation}.`);
  }
  return value;
}

/** Whether `--preview` was typed, and how. */
export type PreviewFlagMode = "enabled" | "disabled" | "unset";

export function getPreviewFlagMode(args: string[]): PreviewFlagMode {
  for (const arg of args) {
    if (arg === "--no-preview" || arg === "--preview=false") {
      return "disabled";
    }

    if (arg === "--preview" || arg.startsWith("--preview=")) {
      return "enabled";
    }
  }

  return "unset";
}
