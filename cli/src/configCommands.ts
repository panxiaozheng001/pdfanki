import { promises as fs } from "node:fs";

import { toBool } from "./args.js";
import { ensureConfig, resetConfig } from "./config.js";
import { describeError } from "./errors.js";
import { installRemotePrompt, listLocalPrompts, listRemotePrompts } from "./prompts.js";
import {
  buildCliUi,
  reportingLogger,
  runWithSpinner,
  type CliUi,
  type UiBuildArgs,
} from "./ui/cliUi.js";
import { formatJsonOutput } from "./ui/format.js";

/**
 * The commands that read and write pdfanki's own configuration rather than a
 * document. Each reports its own failure and sets the exit code instead of
 * throwing, because yargs has already handed control over by the time they run.
 */

export async function handleListLocalPrompts(args: UiBuildArgs): Promise<void> {
  let ui: CliUi | null = null;
  try {
    ui = buildCliUi(args);
    const prompts = await runWithSpinner(ui.spinner, "Loading prompts...", async () =>
      listLocalPrompts(),
    );

    for (const prompt of prompts) {
      process.stdout.write(`${prompt.name}\n`);
    }
  } catch (error) {
    ui?.spinner.stop();
    reportingLogger(ui).error(`Failed to list prompts: ${describeError(error)}`);
    process.exitCode = 1;
  }
}

export async function handleListRemotePrompts(args: UiBuildArgs): Promise<void> {
  let ui: CliUi | null = null;
  try {
    ui = buildCliUi(args);
    const prompts = await runWithSpinner(ui.spinner, "Loading remote prompts...", async () =>
      listRemotePrompts(),
    );

    for (const prompt of prompts) {
      process.stdout.write(`${prompt.name}\n`);
    }
  } catch (error) {
    ui?.spinner.stop();
    reportingLogger(ui).error(`Failed to list remote prompts: ${describeError(error)}`);
    process.exitCode = 1;
  }
}

export async function handleGetPrompt(
  args: UiBuildArgs & {
    name?: string;
    force?: unknown;
  },
): Promise<void> {
  let ui: CliUi | null = null;
  try {
    ui = buildCliUi(args);
    const name = (args.name ?? "").trim();
    if (name.length === 0) {
      throw new Error("Provide a prompt name to install.");
    }

    const result = await runWithSpinner(ui.spinner, `Installing prompt "${name}"...`, async () =>
      installRemotePrompt(name, {
        force: toBool(args.force, false),
      }),
    );

    const verb = result.overwritten ? "Updated" : "Installed";
    ui.logger.success(`${verb} prompt "${result.name}" at ${result.path}`);
  } catch (error) {
    ui?.spinner.stop();
    reportingLogger(ui).error(`Failed to install prompt: ${describeError(error)}`);
    process.exitCode = 1;
  }
}

export async function handlePrintConfig(args: UiBuildArgs): Promise<void> {
  let ui: CliUi | null = null;
  try {
    ui = buildCliUi(args);
    const settings = await runWithSpinner(ui.spinner, "Loading configuration...", async () => {
      const paths = await ensureConfig();
      const raw = await fs.readFile(paths.settings, "utf8");
      const contents: unknown = JSON.parse(raw);
      return contents;
    });

    process.stdout.write(formatJsonOutput(settings, ui.useColor));
  } catch (error) {
    ui?.spinner.stop();
    reportingLogger(ui).error(`Failed to print config: ${describeError(error)}`);
    process.exitCode = 1;
  }
}

export async function handleResetConfig(args: UiBuildArgs): Promise<void> {
  let ui: CliUi | null = null;
  try {
    ui = buildCliUi(args);
    const paths = await runWithSpinner(ui.spinner, "Resetting configuration...", async () =>
      resetConfig(),
    );
    ui.logger.success(`Config reset at ${paths.dir} (settings.json and prompts recreated).`);
  } catch (error) {
    ui?.spinner.stop();
    reportingLogger(ui).error(`Failed to reset config: ${describeError(error)}`);
    process.exitCode = 1;
  }
}
