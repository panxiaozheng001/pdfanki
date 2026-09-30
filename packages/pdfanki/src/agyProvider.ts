import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export interface AgyCliRunnerResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}

export interface AgyCliRunnerOptions {
  readonly command: string;
  readonly cwd?: string;
  readonly timeoutMs: number;
}

export type AgyCliRunner = (
  args: readonly string[],
  options: AgyCliRunnerOptions,
) => Promise<AgyCliRunnerResult>;

export const AGY_REASONING_EFFORTS = ["low", "medium", "high", "max"] as const;
export type AgyReasoningEffort = (typeof AGY_REASONING_EFFORTS)[number];

export interface AgyConfig {
  provider?: string | undefined;
  model?: string | undefined;
  effort?: AgyReasoningEffort | undefined;
  command?: string | undefined;
  timeoutMs?: number | undefined;
}

export interface BuildAgyArgsOptions {
  readonly prompt: string;
  readonly model?: string | undefined;
  readonly effort?: AgyReasoningEffort | undefined;
}

export interface AgyProviderOptions {
  readonly prompt: string;
  readonly content: string;
  readonly model?: string | undefined;
  readonly effort?: AgyReasoningEffort | undefined;
  readonly command?: string | undefined;
  readonly cwd?: string | undefined;
  readonly timeoutMs?: number | undefined;
  readonly configFile?: string | undefined;
  readonly runner?: AgyCliRunner | undefined;
}

const DEFAULT_AGY_COMMAND = "agy";
const DEFAULT_AGY_MODEL = "gemini-3.8-flash-medium";
const DEFAULT_AGY_TIMEOUT_MS = 600_000;
const MAX_ERROR_OUTPUT_LENGTH = 2000;
const MS_PER_SECOND = 1000;

/**
 * Searches upward from startDir for target file names.
 */
function findFileUpward(filenames: readonly string[], startDir: string): string | null {
  let current = resolve(startDir);
  const root = resolve("/");

  while (true) {
    for (const name of filenames) {
      const candidate = join(current, name);
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    const parent = dirname(current);
    if (parent === current || current === root) {
      break;
    }
    current = parent;
  }

  return null;
}

/**
 * Loads agy configuration from config file.
 * Order of precedence for config path:
 * 1. customPath argument
 * 2. PDFANKI_AGY_CONFIG environment variable
 * 3. agy.config.json or pdfanki.config.json in current or parent directories
 * 4. ~/.pdfanki/agy.config.json or ~/.pdfanki/settings.json
 */
export function loadAgyConfig(customPath?: string, startDir?: string): AgyConfig {
  const candidatePath =
    customPath?.trim() ||
    process.env.PDFANKI_AGY_CONFIG?.trim() ||
    findFileUpward(["agy.config.json", "pdfanki.config.json"], startDir ?? process.cwd()) ||
    findFileUpward(["agy.config.json", "pdfanki.config.json"], import.meta.dirname) ||
    join(homedir(), ".pdfanki", "agy.config.json");

  if (candidatePath && existsSync(candidatePath)) {
    try {
      const raw = readFileSync(candidatePath, "utf8");
      const parsed = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null) {
        // If it's a global settings.json, check for generation.providers.agy
        const agyBlock = parsed.generation?.providers?.agy ?? parsed.providers?.agy ?? parsed;

        return {
          provider: typeof parsed.provider === "string" ? parsed.provider : "agy",
          model:
            typeof agyBlock.model === "string"
              ? agyBlock.model
              : typeof agyBlock.defaultModel === "string"
                ? agyBlock.defaultModel
                : DEFAULT_AGY_MODEL,
          effort: normalizeAgyReasoningEffort(agyBlock.effort ?? agyBlock.reasoningEffort),
          command: typeof agyBlock.command === "string" ? agyBlock.command : DEFAULT_AGY_COMMAND,
          timeoutMs:
            typeof agyBlock.timeoutMs === "number" && agyBlock.timeoutMs > 0
              ? agyBlock.timeoutMs
              : DEFAULT_AGY_TIMEOUT_MS,
        };
      }
    } catch {
      // Fall through to defaults on parse errors
    }
  }

  return {
    provider: "agy",
    model: DEFAULT_AGY_MODEL,
    effort: "medium",
    command: DEFAULT_AGY_COMMAND,
    timeoutMs: DEFAULT_AGY_TIMEOUT_MS,
  };
}

export function buildAgyPrompt(options: Readonly<{ prompt: string; content: string }>): string {
  return [
    "You are an experimental pdfanki flashcard-generation provider.",
    "Use only the prompt and source text below. Do not inspect files, run commands, or modify the workspace.",
    "Return only the requested Markdown flashcards with no extra commentary.",
    "",
    "Prompt:",
    options.prompt.trim(),
    "",
    "Source text:",
    options.content.trim(),
  ].join("\n");
}

export function buildAgyArgs(options: BuildAgyArgsOptions): string[] {
  const model = options.model?.trim() || DEFAULT_AGY_MODEL;
  const args = ["-p", options.prompt, "--model", model, "--dangerously-skip-permissions"];

  const effort = normalizeAgyReasoningEffort(options.effort);
  const modelHasEffortSuffix = /-(low|medium|high|max)$/i.test(model);
  if (effort && !modelHasEffortSuffix) {
    args.push("--effort", effort);
  }

  return args;
}

export async function callAgyProvider(options: AgyProviderOptions): Promise<string> {
  const config = loadAgyConfig(options.configFile, options.cwd);

  const command =
    options.command?.trim() ||
    process.env.PDFANKI_AGY_COMMAND?.trim() ||
    config.command ||
    DEFAULT_AGY_COMMAND;

  const model = options.model?.trim() || config.model || DEFAULT_AGY_MODEL;

  const effort = normalizeAgyReasoningEffort(options.effort ?? config.effort);

  const timeoutMs = normalizeTimeoutMs(
    options.timeoutMs ?? Number(process.env.PDFANKI_AGY_TIMEOUT_MS) ?? config.timeoutMs,
  );

  const runner = options.runner ?? runAgyCli;
  const prompt = buildAgyPrompt({
    prompt: options.prompt,
    content: options.content,
  });

  const args = buildAgyArgs({
    prompt,
    model,
    ...(effort === undefined ? {} : { effort }),
  });

  const result = await runner(args, {
    command,
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    timeoutMs,
  });

  if (result.exitCode !== 0) {
    const detail = formatAgyErrorOutput(result.stderr || result.stdout);
    const status = result.signal
      ? `signal ${result.signal}`
      : `exit code ${result.exitCode ?? "unknown"}`;
    throw new Error(`Agy CLI provider failed with ${status}.${detail ? `\n${detail}` : ""}`);
  }

  const output = result.stdout.trim();
  if (!output) {
    throw new Error("Agy CLI provider returned no stdout content.");
  }

  return output;
}

export function runAgyCli(
  args: readonly string[],
  options: AgyCliRunnerOptions,
): Promise<AgyCliRunnerResult> {
  return new Promise((resolve, reject) => {
    const isNodeScript = options.command.endsWith(".js") || options.command.endsWith(".mjs");
    const [spawnCmd, spawnArgs] =
      isNodeScript && process.platform === "win32"
        ? [process.execPath, [options.command, ...args]]
        : [options.command, args];

    const child = spawn(spawnCmd, spawnArgs, {
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let settled = false;

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(
        new Error(
          `Agy CLI provider timed out after ${Math.round(options.timeoutMs / MS_PER_SECOND)}s.`,
        ),
      );
    }, options.timeoutMs);
    timeout.unref?.();

    child.stdout.on("data", (chunk: Buffer) => {
      stdout.push(Buffer.from(chunk));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr.push(Buffer.from(chunk));
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(
        new Error(
          `Unable to start Agy CLI provider command "${options.command}": ${error.message}`,
        ),
      );
    });
    child.on("close", (exitCode, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve({
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        exitCode,
        signal,
      });
    });
  });
}

function normalizeTimeoutMs(value: number): number {
  if (Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return DEFAULT_AGY_TIMEOUT_MS;
}

export function normalizeAgyReasoningEffort(value?: unknown): AgyReasoningEffort | undefined {
  if (!value) {
    return undefined;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (AGY_REASONING_EFFORTS.includes(normalized as AgyReasoningEffort)) {
    return normalized as AgyReasoningEffort;
  }
  return undefined;
}

function formatAgyErrorOutput(value: string): string {
  const cleaned = redactSensitiveText(value).trim();
  if (!cleaned) {
    return "";
  }
  return cleaned.length > MAX_ERROR_OUTPUT_LENGTH
    ? `${cleaned.slice(0, MAX_ERROR_OUTPUT_LENGTH)}...`
    : cleaned;
}

function redactSensitiveText(value: string): string {
  return value
    .replaceAll(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1[redacted]")
    .replaceAll(/\b(sk-[A-Za-z0-9_-]{12,})\b/g, "[redacted-api-key]")
    .replaceAll(/((?:AGY|CODEX|OPENAI|GEMINI)_API_KEY=)\S+/gi, "$1[redacted]");
}
