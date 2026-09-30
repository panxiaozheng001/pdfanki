import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cliPath = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const bookPath = fileURLToPath(
  new URL("../../tests/books/public-domain/jekyll-hyde.pg43.epub", import.meta.url),
);
const fakeAgyPath = fileURLToPath(new URL("bin/fakeAgy.mjs", import.meta.url));

function runCli(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      env: {
        ...process.env,
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (exitCode, signal) => {
      resolve({ exitCode, signal, stdout, stderr });
    });
  });
}

function assertSuccessfulCliResult(result, label) {
  assert.equal(
    result.exitCode,
    0,
    `${label} stdout:\n${result.stdout}\n\n${label} stderr:\n${result.stderr}`,
  );
  assert.equal(result.signal, null);
}

test("CLI uses agy provider and model configured from agy.config.json", async () => {
  const tempParent = join(repoRoot, ".tmp", "tests");
  await mkdir(tempParent, { recursive: true });
  const tempRoot = await mkdtemp(join(tempParent, "pdfanki-agy-cli-"));
  const markdownPath = join(tempRoot, "cards.md");
  const apkgPath = join(tempRoot, "deck.apkg");
  const configPath = join(tempRoot, "agy.config.json");

  // Write agy.config.json in tempRoot
  await writeFile(
    configPath,
    JSON.stringify(
      {
        provider: "agy",
        model: "gemini-3.8-flash-high",
        effort: "high",
      },
      null,
      2,
    ),
    "utf8",
  );

  const baseEnv = {
    NO_COLOR: "1",
    PDFANKI_CALLER_CWD: tempRoot,
    PDFANKI_AGY_CONFIG: configPath,
    PDFANKI_AGY_COMMAND: fakeAgyPath,
    PDFANKI_AGY_TIMEOUT_MS: "5000",
    EXPECTED_AGY_MODEL: "gemini-3.8-flash-high",
    EXPECTED_AGY_EFFORT: "high",
  };

  // Run without --provider or --model; should pick up from agy.config.json
  const markdownResult = await runCli(
    [
      "epub",
      "md",
      bookPath,
      "--start-section",
      "3",
      "--end-section",
      "3",
      "--min-char",
      "300",
      "--deck-title",
      "Agy Fixture Deck",
      "--out",
      markdownPath,
      "--verbose",
      "--no-color",
    ],
    baseEnv,
  );
  assertSuccessfulCliResult(markdownResult, "epub md from agy.config.json");

  const markdown = await readFile(markdownPath, "utf8");
  assert.match(markdown, /^# Agy Fixture Deck/m);
  assert.match(markdown, /^## Agy provider fixture/m);
  assert.match(markdown, /^- Source marker: STORY OF THE DOOR/m);

  // Run anki output with explicit flags overriding effort
  const apkgResult = await runCli(
    [
      "epub",
      "anki",
      bookPath,
      "--provider",
      "agy",
      "--model",
      "gemini-3.8-flash-high",
      "--agy-effort",
      "low",
      "--start-section",
      "3",
      "--end-section",
      "3",
      "--min-char",
      "300",
      "--deck-title",
      "Agy Fixture Deck",
      "--out",
      apkgPath,
      "--verbose",
      "--no-color",
    ],
    {
      ...baseEnv,
      EXPECTED_AGY_EFFORT: "low",
    },
  );
  assertSuccessfulCliResult(apkgResult, "epub anki with agy");

  const apkgStats = await stat(apkgPath);
  assert.ok(apkgStats.size > 0);
  const apkgHeader = await readFile(apkgPath);
  assert.equal(apkgHeader.subarray(0, 2).toString("utf8"), "PK");
});
