import { toBool, type ParsedArgs } from "../args.js";
import { createLogger, type Logger, type LogLevel } from "./logger.js";
import { createProgressBar, type ProgressBar } from "./progress.js";
import { createSpinner, type Spinner } from "./spinner.js";

/**
 * The logger, spinner and progress bar a command runs with, built once from the
 * flags every command shares. Whether color and animation are on is settled
 * here so nothing downstream has to ask the terminal again.
 */

function isCI(): boolean {
  const ci = process.env.CI;
  return typeof ci === "string" && ci.length > 0 && ci !== "0";
}

export interface UiBuildArgs extends ParsedArgs {
  verbose?: unknown;
  quiet?: unknown;
  color?: unknown;
  spinner?: unknown;
}

export interface CliUi {
  logger: Logger;
  spinner: Spinner;
  progress: ProgressBar;
  useColor: boolean;
  animationsEnabled: boolean;
  progressEnabled: boolean;
}

export function buildCliUi(args: UiBuildArgs): CliUi {
  const verbose = toBool(args.verbose, false);
  const quiet = toBool(args.quiet, false);

  if (verbose && quiet) {
    throw new Error("Use either --verbose or --quiet, not both.");
  }

  const level: LogLevel = verbose ? "debug" : quiet ? "warn" : "info";
  const useColor = toBool(args.color, true) && process.stdout.isTTY && process.env.NO_COLOR !== "1";
  const animationsEnabled = toBool(args.spinner, true) && process.stdout.isTTY && !isCI();
  const progressEnabled = animationsEnabled && !verbose;

  return {
    logger: createLogger({ level, useColor }),
    spinner: createSpinner({ enabled: animationsEnabled }),
    progress: createProgressBar({ enabled: progressEnabled, useColor }),
    useColor,
    animationsEnabled,
    progressEnabled,
  };
}

/**
 * The logger a failure is reported through, including one that happened while
 * the UI was still being built. Every command handler needs it and `buildCliUi`
 * is one of the things that can throw, so `ui` may legitimately still be null.
 */
export function reportingLogger(ui: CliUi | null): Logger {
  return ui?.logger ?? createLogger({ level: "info", useColor: false });
}

export async function runWithSpinner<T>(
  spinner: Spinner,
  text: string,
  action: () => Promise<T>,
): Promise<T> {
  spinner.start(text);
  try {
    return await action();
  } finally {
    spinner.stop();
  }
}

export async function runWithProgressHeartbeat<T>(options: {
  progress: ProgressBar;
  current: number;
  label: string;
  action: () => Promise<T>;
  intervalMs?: number;
  animateSpinner?: boolean;
}): Promise<T> {
  const { progress, current, label, action, intervalMs = 1000, animateSpinner = false } = options;
  const spinnerFrames = ["|", "/", "-", "\\"];
  let frameIndex = 0;

  function renderHeartbeat() {
    const frame = animateSpinner ? spinnerFrames[frameIndex % spinnerFrames.length] : "";
    frameIndex += 1;
    progress.update(current, label, frame);
  }

  renderHeartbeat();

  const timer = setInterval(() => {
    renderHeartbeat();
  }, intervalMs);
  timer.unref?.();

  try {
    return await action();
  } finally {
    clearInterval(timer);
  }
}
