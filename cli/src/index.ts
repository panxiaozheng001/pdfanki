#!/usr/bin/env node
import yargs, { type Argv } from "yargs";
import { hideBin } from "yargs/helpers";

import { getPreviewFlagMode, normalizePreviewCliArgs } from "./args.js";
import { CODEX_REASONING_EFFORTS, SUPPORTED_PROVIDERS } from "./config.js";
import {
  handleGetPrompt,
  handleListLocalPrompts,
  handleListRemotePrompts,
  handlePrintConfig,
  handleResetConfig,
} from "./configCommands.js";
import { handleIndexTemplate } from "./indexTemplate.js";
import { runWorkflowCommand } from "./workflow.js";

const callerCwd = process.env.PDFANKI_CALLER_CWD;
if (callerCwd && callerCwd !== process.cwd()) {
  process.chdir(callerCwd);
}

function withUiOptions<T>(command: Argv<T>): Argv<T> {
  return command
    .option("verbose", {
      type: "boolean",
      default: false,
      describe: "Show detailed execution logs.",
    })
    .option("quiet", {
      alias: "q",
      type: "boolean",
      default: false,
      describe: "Show warnings and errors only.",
    })
    .option("color", {
      type: "boolean",
      default: true,
      describe: "Enable ANSI colors. Use --no-color to disable.",
    })
    .option("spinner", {
      type: "boolean",
      default: true,
      describe: "Enable loading animations. Use --no-spinner to disable.",
    });
}

function withSubcommandHelp<T>(command: Argv<T>): Argv<T> {
  return command.updateStrings({ "Commands:": "Subcommands:" });
}

// Handler for group commands that only register subcommands. yargs requires a
// handler in this positional form, but `.demandCommand()` in the builder
// rejects before it can run.
const requireSubcommand = async (): Promise<void> => {
  // intentionally empty
};

function withInputPositional<T>(command: Argv<T>, description: string): Argv<T> {
  return command.positional("input", {
    type: "string",
    describe: description,
    demandOption: true,
  });
}

function withOutputOption<T>(command: Argv<T>, description: string): Argv<T> {
  return command.option("out", {
    alias: "o",
    type: "string",
    describe: description,
  });
}

function withDryRunOption<T>(command: Argv<T>): Argv<T> {
  return command.option("dry-run", {
    type: "boolean",
    default: false,
    describe: "Run normally but skip writing the requested output and failure artifact files.",
  });
}

function withDeckTitleOption<T>(command: Argv<T>): Argv<T> {
  return command.option("deck-title", {
    alias: "d",
    type: "string",
    describe: "Anki deck title. Defaults to the input filename or markdown H1.",
  });
}

function withDebugOption<T>(command: Argv<T>): Argv<T> {
  return command.option("debug", {
    type: "boolean",
    default: false,
    describe: "Enable verbose PDF parser warnings (pdf.js verbosity).",
  });
}

function withPdfSourceOptions<T>(command: Argv<T>): Argv<T> {
  return command
    .option("index", {
      type: "string",
      describe: "Path to a JSON index for PDF chapter separation.",
    })
    .option("index-ranges", {
      type: "string",
      describe: 'Inline PDF page ranges like "12-53,54-92,93-118".',
    });
}

function withEpubSourceOptions<T>(command: Argv<T>): Argv<T> {
  return command
    .option("start-section", {
      type: "number",
      describe: "First EPUB section to extract (1-based, inclusive).",
    })
    .option("end-section", {
      type: "number",
      describe: "Last EPUB section to extract (1-based, inclusive).",
    })
    .option("exclude-sections", {
      type: "string",
      describe:
        'Skip specific EPUB sections using comma-separated section numbers or ranges, e.g. "3,7,19,25-27".',
    })
    .option("min-char", {
      type: "number",
      describe: "Filter out sections with fewer than this many characters.",
    })
    .option("preview", {
      type: "boolean",
      default: false,
      describe:
        "Show a text preview under each EPUB section while parsing. You can also pass --preview <chars>.",
    })
    .option("preview-chars", {
      type: "number",
      describe:
        "Number of characters to print in EPUB section previews. Implies --preview when provided.",
    });
}

function withGenerationOptions<T>(command: Argv<T>): Argv<T> {
  return command
    .option("provider", {
      type: "string",
      choices: [...SUPPORTED_PROVIDERS],
      describe:
        "AI provider. API providers expect PROVIDER_API_KEY; experimental codex uses the local Codex CLI login. Defaults to settings.json.",
    })
    .option("prompt", {
      alias: "p",
      type: "string",
      describe: 'Prompt to load, e.g. "default" -> prompts/default.md. Defaults to settings.json.',
    })
    .option("model", {
      alias: "m",
      type: "string",
      describe: "Model name for the chosen provider.",
    })
    .option("codex-reasoning-effort", {
      type: "string",
      choices: [...CODEX_REASONING_EFFORTS],
      describe:
        "Codex-only model_reasoning_effort override. Overrides Codex config.toml for this run.",
    })
    .option("codex-profile", {
      type: "string",
      describe:
        "Codex-only config profile passed to codex exec --profile. The pdfanki --model/defaultModel still takes precedence for model selection.",
    });
}

const rawArgs = normalizePreviewCliArgs(hideBin(process.argv));

/* Read from the argv as typed, before `normalizePreviewCliArgs` rewrote it, and
   passed to each workflow handler rather than reached for from inside one. */
const previewFlagMode = getPreviewFlagMode(rawArgs);

const cli = yargs(rawArgs)
  .scriptName("pdfanki")
  .usage("Usage:\n  $0 <command> <subcommand> [flags]")
  .updateStrings({ "Commands:": "Core commands:" })
  .command(
    "pdf",
    "Convert from PDF inputs.",
    (command) =>
      withSubcommandHelp(command)
        .command(
          "json <input>",
          "Extract structured JSON from a PDF.",
          (commandY) =>
            withUiOptions(
              withDryRunOption(
                withOutputOption(
                  withPdfSourceOptions(
                    withDebugOption(withInputPositional(commandY, "Path to the source PDF.")),
                  ),
                  "Output path for extracted JSON. Defaults to ./<input>.json.",
                ),
              ).option("full-fidelity", {
                type: "boolean",
                default: false,
                describe:
                  "Write full-fidelity extraction JSON instead of the minimal section-only shape.",
              }),
            ),
          async (args) => runWorkflowCommand("pdf", "json", args, previewFlagMode),
        )
        .command(
          "md <input>",
          "Generate markdown flashcards directly from a PDF.",
          (commandY) =>
            withUiOptions(
              withDryRunOption(
                withDeckTitleOption(
                  withGenerationOptions(
                    withOutputOption(
                      withPdfSourceOptions(
                        withDebugOption(withInputPositional(commandY, "Path to the source PDF.")),
                      ),
                      "Output path for markdown flashcards. Defaults to ./<input>.md.",
                    ),
                  ),
                ),
              ),
            ),
          async (args) => runWorkflowCommand("pdf", "md", args, previewFlagMode),
        )
        .command(
          "anki <input>",
          "Generate an Anki package directly from a PDF.",
          (commandY) =>
            withUiOptions(
              withDryRunOption(
                withDeckTitleOption(
                  withGenerationOptions(
                    withOutputOption(
                      withPdfSourceOptions(
                        withDebugOption(withInputPositional(commandY, "Path to the source PDF.")),
                      ),
                      "Output path for the Anki package. Defaults to ./<input>.apkg.",
                    ),
                  ),
                ),
              ),
            ),
          async (args) => runWorkflowCommand("pdf", "anki", args, previewFlagMode),
        )
        .demandCommand(1, "Choose a pdf subcommand."),
    requireSubcommand,
  )
  .command(
    "epub",
    "Convert from EPUB inputs.",
    (command) =>
      withSubcommandHelp(command)
        .command(
          "json <input>",
          "Extract structured JSON from an EPUB.",
          (commandY) =>
            withUiOptions(
              withDryRunOption(
                withOutputOption(
                  withEpubSourceOptions(
                    withDebugOption(withInputPositional(commandY, "Path to the source EPUB.")),
                  ),
                  "Output path for extracted JSON. Defaults to ./<input>.json.",
                ),
              ).option("full-fidelity", {
                type: "boolean",
                default: false,
                describe: "Write full-fidelity JSON and disable configured EPUB title filtering.",
              }),
            ),
          async (args) => runWorkflowCommand("epub", "json", args, previewFlagMode),
        )
        .command(
          "md <input>",
          "Generate markdown flashcards directly from an EPUB.",
          (commandY) =>
            withUiOptions(
              withDryRunOption(
                withDeckTitleOption(
                  withGenerationOptions(
                    withOutputOption(
                      withEpubSourceOptions(
                        withDebugOption(withInputPositional(commandY, "Path to the source EPUB.")),
                      ),
                      "Output path for markdown flashcards. Defaults to ./<input>.md.",
                    ),
                  ),
                ),
              ),
            ),
          async (args) => runWorkflowCommand("epub", "md", args, previewFlagMode),
        )
        .command(
          "anki <input>",
          "Generate an Anki package directly from an EPUB.",
          (commandY) =>
            withUiOptions(
              withDryRunOption(
                withDeckTitleOption(
                  withGenerationOptions(
                    withOutputOption(
                      withEpubSourceOptions(
                        withDebugOption(withInputPositional(commandY, "Path to the source EPUB.")),
                      ),
                      "Output path for the Anki package. Defaults to ./<input>.apkg.",
                    ),
                  ),
                ),
              ),
            ),
          async (args) => runWorkflowCommand("epub", "anki", args, previewFlagMode),
        )
        .demandCommand(1, "Choose an epub subcommand."),
    requireSubcommand,
  )
  .command(
    "json",
    "Convert from extracted JSON inputs.",
    (command) =>
      withSubcommandHelp(command)
        .command(
          "md <input>",
          "Generate markdown flashcards from extracted JSON.",
          (commandY) =>
            withUiOptions(
              withDryRunOption(
                withDeckTitleOption(
                  withGenerationOptions(
                    withOutputOption(
                      withInputPositional(commandY, "Path to the extracted JSON file."),
                      "Output path for markdown flashcards. Defaults to ./<input>.md.",
                    ),
                  ),
                ),
              ),
            ),
          async (args) => runWorkflowCommand("json", "md", args, previewFlagMode),
        )
        .command(
          "anki <input>",
          "Generate an Anki package from extracted JSON.",
          (commandY) =>
            withUiOptions(
              withDryRunOption(
                withDeckTitleOption(
                  withGenerationOptions(
                    withOutputOption(
                      withInputPositional(commandY, "Path to the extracted JSON file."),
                      "Output path for the Anki package. Defaults to ./<input>.apkg.",
                    ),
                  ),
                ),
              ),
            ),
          async (args) => runWorkflowCommand("json", "anki", args, previewFlagMode),
        )
        .demandCommand(1, "Choose a json subcommand."),
    requireSubcommand,
  )
  .command(
    "md",
    "Convert from markdown flashcard inputs.",
    (command) =>
      withSubcommandHelp(command)
        .command(
          "anki <input>",
          "Build an Anki package from markdown flashcards.",
          (commandY) =>
            withUiOptions(
              withDryRunOption(
                withDeckTitleOption(
                  withOutputOption(
                    withInputPositional(commandY, "Path to the markdown flashcard file."),
                    "Output path for the Anki package. Defaults to ./<input>.apkg.",
                  ),
                ),
              ),
            ),
          async (args) => runWorkflowCommand("md", "anki", args, previewFlagMode),
        )
        .demandCommand(1, "Choose an md subcommand."),
    requireSubcommand,
  )
  .command(
    "config",
    "Manage pdfanki configuration.",
    (command) =>
      withSubcommandHelp(withUiOptions(command))
        .command(
          "reset",
          "Remove and recreate the pdfanki config directory with defaults.",
          (commandY) => withUiOptions(commandY),
          async (args) => handleResetConfig(args),
        )
        .middleware((argv) => {
          if (argv._.length > 1 && argv._[1] !== "reset") {
            throw new Error(
              `Unknown config subcommand "${String(argv._[1])}". Try "pdfanki config --help".`,
            );
          }
        }),
    async (args) => handlePrintConfig(args),
  )
  .command(
    "prompts",
    "Manage local and remote prompts.",
    (command) =>
      withSubcommandHelp(command)
        .command(
          "list",
          "List prompt names available in the local pdfanki prompts directory.",
          (commandY) => withUiOptions(commandY),
          async (args) => handleListLocalPrompts(args),
        )
        .command(
          "list-remote",
          "List prompt names available in the GitHub prompt directory.",
          (commandY) => withUiOptions(commandY),
          async (args) => handleListRemotePrompts(args),
        )
        .command(
          "get <name>",
          "Download a prompt from GitHub into the local pdfanki prompts directory.",
          (commandY) =>
            withUiOptions(
              commandY
                .positional("name", {
                  type: "string",
                  describe: "Prompt name without the .md extension.",
                  demandOption: true,
                })
                .option("force", {
                  type: "boolean",
                  default: false,
                  describe: "Overwrite the local prompt if it already exists.",
                }),
            ),
          async (args) => handleGetPrompt(args),
        )
        .demandCommand(1, "Choose a prompts subcommand."),
    requireSubcommand,
  )
  .command(
    "index",
    "Work with PDF index templates and helpers.",
    (command) =>
      withSubcommandHelp(command)
        .command(
          "template <count> [out]",
          "Generate a blank JSON index template.",
          (commandY) =>
            withUiOptions(
              commandY
                .positional("count", {
                  type: "number",
                  describe: "Number of sections in the template.",
                  demandOption: true,
                })
                .positional("out", {
                  type: "string",
                  describe:
                    "Output path (directory or .json). Defaults to ./index.json or ./<input>.index.json when --from-file is provided.",
                })
                .option("from-file", {
                  alias: "f",
                  type: "string",
                  describe:
                    "Optional input PDF used to derive the default output name (<input>.index.json).",
                }),
            ),
          async (args) => handleIndexTemplate(args),
        )
        .demandCommand(1, "Choose an index subcommand."),
    requireSubcommand,
  )
  .command(
    "reset-config",
    false,
    (command) => withUiOptions(command),
    async (args) => handleResetConfig(args),
  )
  .command(
    "list-prompts",
    false,
    (command) => withUiOptions(command),
    async (args) => handleListLocalPrompts(args),
  )
  .command(
    "index-template <count> [out]",
    false,
    (command) =>
      withUiOptions(
        command
          .positional("count", {
            type: "number",
            describe: "Number of sections in the template.",
            demandOption: true,
          })
          .positional("out", {
            type: "string",
            describe:
              "Output path (directory or .json). Defaults to ./index.json or ./<input>.index.json when --from-file is provided.",
          })
          .option("from-file", {
            alias: "f",
            type: "string",
            describe:
              "Optional input PDF used to derive the default output name (<input>.index.json).",
          }),
      ),
    async (args) => handleIndexTemplate(args),
  )
  .strict()
  .help()
  .alias("h", "help")
  .alias("v", "version");

if (rawArgs.length === 0) {
  cli.showHelp();
  process.exit(0);
}

await cli.parse();
