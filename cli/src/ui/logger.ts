export type LogLevel = "debug" | "info" | "warn" | "error";

type ColorName = "dim" | "cyan" | "green" | "yellow" | "red" | "gray" | "reset";

const ANSI: Record<ColorName, string> = {
  dim: "\u001B[2m",
  cyan: "\u001B[36m",
  green: "\u001B[32m",
  yellow: "\u001B[33m",
  red: "\u001B[31m",
  gray: "\u001B[90m",
  reset: "\u001B[0m",
};

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface LoggerOptions {
  readonly level: LogLevel;
  readonly useColor: boolean;
  readonly stdout?: NodeJS.WriteStream;
  readonly stderr?: NodeJS.WriteStream;
}

function paint(text: string, color: ColorName, enabled: boolean): string {
  if (!enabled || color === "reset") {
    return text;
  }
  return `${ANSI[color]}${text}${ANSI.reset}`;
}

export interface Logger {
  readonly isDebugEnabled: boolean;
  readonly debug: (message: string) => void;
  readonly info: (message: string) => void;
  readonly success: (message: string) => void;
  readonly warn: (message: string) => void;
  readonly error: (message: string) => void;
}

export function createLogger(options: LoggerOptions): Logger {
  const { level, useColor, stdout = process.stdout, stderr = process.stderr } = options;

  const currentWeight = LEVEL_WEIGHT[level];

  function shouldLog(target: LogLevel): boolean {
    return LEVEL_WEIGHT[target] >= currentWeight;
  }

  function write(
    entry: Readonly<{
      stream: NodeJS.WriteStream;
      targetLevel: LogLevel;
      prefix: string;
      message: string;
      color: ColorName;
    }>,
  ) {
    if (!shouldLog(entry.targetLevel)) {
      return;
    }

    const formattedPrefix = paint(entry.prefix, entry.color, useColor);
    entry.stream.write(`${formattedPrefix} ${entry.message}\n`);
  }

  return {
    isDebugEnabled: shouldLog("debug"),
    debug(message: string) {
      write({ stream: stdout, targetLevel: "debug", prefix: "[dbg]", message, color: "gray" });
    },
    info(message: string) {
      write({ stream: stdout, targetLevel: "info", prefix: "[i]", message, color: "cyan" });
    },
    success(message: string) {
      write({ stream: stdout, targetLevel: "info", prefix: "[ok]", message, color: "green" });
    },
    warn(message: string) {
      write({ stream: stderr, targetLevel: "warn", prefix: "[WARNING]", message, color: "yellow" });
    },
    error(message: string) {
      write({ stream: stderr, targetLevel: "error", prefix: "[err]", message, color: "red" });
    },
  };
}
