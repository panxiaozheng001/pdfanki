/**
 * Terminal formatting: strings in, strings out.
 *
 * Nothing here reads a flag, touches the filesystem or knows what a command is.
 * Whether color is on is decided once in `buildCliUi` and handed down, which is
 * why each of these takes it rather than consulting the terminal again.
 */

const MS_PER_SECOND = 1000;

const JSON_COLOR_ANSI = {
  blue: "\u001B[34m",
  cyan: "\u001B[36m",
  green: "\u001B[32m",
  yellow: "\u001B[33m",
  red: "\u001B[31m",
  gray: "\u001B[90m",
  lightGray: "\u001B[37m",
  reset: "\u001B[0m",
} as const;

const ANSI_UNDERLINE = "\u001B[4m";

/** The colors `colorizeText` answers for, named so the table can stay private. */
export type TextColor = keyof typeof JSON_COLOR_ANSI;

export function colorizeText(text: string, color: TextColor, enabled: boolean): string {
  if (!enabled || color === "reset") {
    return text;
  }
  return `${JSON_COLOR_ANSI[color]}${text}${JSON_COLOR_ANSI.reset}`;
}

export function formatSectionHeading(text: string, enabled: boolean): string {
  if (!enabled) {
    return text;
  }
  return `${ANSI_UNDERLINE}${JSON_COLOR_ANSI.blue}${text}${JSON_COLOR_ANSI.reset}`;
}

export function colorizeJson(payload: string, enabled: boolean): string {
  if (!enabled) {
    return payload;
  }

  return payload.replaceAll(
    /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(?::)?|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\btrue\b|\bfalse\b|\bnull\b)/g,
    (token) => {
      let color: TextColor | null = null;

      if (token.startsWith('"') && token.endsWith(":")) {
        color = "cyan";
      } else if (token.startsWith('"')) {
        color = "green";
      } else if (token === "true" || token === "false") {
        color = "yellow";
      } else if (token === "null") {
        color = "gray";
      } else {
        color = "yellow";
      }

      return `${JSON_COLOR_ANSI[color]}${token}${JSON_COLOR_ANSI.reset}`;
    },
  );
}

export function formatJsonOutput(value: unknown, useColor: boolean): string {
  const payload = JSON.stringify(value, null, 2);
  if (typeof payload !== "string") {
    throw new TypeError("Unable to serialize JSON output.");
  }

  return `${colorizeJson(payload, useColor)}\n`;
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatCheckStatus(ok: boolean, useColor: boolean): string {
  return colorizeText(ok ? "OK" : "Failed", ok ? "green" : "red", useColor);
}

export function formatDuration(durationMs: number): string {
  const seconds = (durationMs / MS_PER_SECOND).toFixed(2);
  return `${seconds}s`;
}
