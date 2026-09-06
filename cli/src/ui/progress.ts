export interface ProgressBarOptions {
  readonly enabled: boolean;
  readonly useColor?: boolean;
  readonly stream?: NodeJS.WriteStream;
  readonly width?: number;
}

const ANSI_BRIGHT_BLUE = "\u001B[94m";
const ANSI_RESET = "\u001B[0m";

function eraseLine(stream: NodeJS.WriteStream) {
  stream.write("\r\u001B[2K");
}

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const PERCENT = 100;

function formatDuration(durationMs: number): string {
  const seconds = Math.max(0, Math.round(durationMs / MS_PER_SECOND));
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  const remainingSeconds = seconds % SECONDS_PER_MINUTE;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

export interface ProgressBar {
  readonly start: (total: number, label?: string) => void;
  readonly increment: (label?: string) => void;
  readonly update: (current: number, label?: string, activityFrame?: string) => void;
  readonly stop: () => void;
  readonly clear: () => void;
}

export function createProgressBar(options: ProgressBarOptions): ProgressBar {
  const { enabled, useColor = false, stream = process.stdout, width = 24 } = options;

  const interactive = enabled && stream.isTTY;
  let total = 0;
  let current = 0;
  let label = "";
  let activityFrame = "";
  let startTime = 0;

  function render() {
    if (!interactive || total <= 0) {
      return;
    }
    const ratio = Math.min(1, Math.max(0, current / total));
    const complete = Math.round(ratio * width);
    const incomplete = width - complete;
    const bar = `${"#".repeat(complete)}${"-".repeat(incomplete)}`;
    const percent = `${Math.round(ratio * PERCENT)}%`.padStart("100%".length, " ");
    const timer = formatDuration(Date.now() - startTime);
    const timerLabel = useColor ? `${ANSI_BRIGHT_BLUE}${timer}${ANSI_RESET}` : timer;
    const spinnerLabel = activityFrame
      ? useColor
        ? ` ${ANSI_BRIGHT_BLUE}${activityFrame}${ANSI_RESET}`
        : ` ${activityFrame}`
      : "";
    eraseLine(stream);
    stream.write(
      `[${bar}] ${current}/${total} ${percent} ${timerLabel}${spinnerLabel}${label ? ` | ${label}` : ""}`,
    );
  }

  function start(nextTotal: number, nextLabel = "") {
    if (!interactive) {
      return;
    }
    total = Math.max(0, nextTotal);
    current = 0;
    label = nextLabel;
    activityFrame = "";
    startTime = Date.now();
    render();
  }

  function update(nextCurrent: number, nextLabel = label, nextActivityFrame = activityFrame) {
    if (!interactive) {
      return;
    }
    current = Math.max(0, Math.min(total, nextCurrent));
    label = nextLabel;
    activityFrame = nextActivityFrame;
    render();
  }

  function increment(nextLabel = label) {
    if (!interactive) {
      return;
    }
    current = Math.min(total, current + 1);
    label = nextLabel;
    activityFrame = "";
    render();
  }

  function clear() {
    if (!interactive) {
      return;
    }
    eraseLine(stream);
  }

  function stop() {
    if (!interactive) {
      return;
    }
    render();
    stream.write("\n");
  }

  return {
    start,
    increment,
    update,
    stop,
    clear,
  };
}
