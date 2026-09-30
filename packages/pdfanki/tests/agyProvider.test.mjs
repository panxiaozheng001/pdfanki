import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildAgyArgs,
  buildAgyPrompt,
  callAgyProvider,
  generateFlashcards,
  loadAgyConfig,
} from "../dist/server.js";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

test("buildAgyArgs builds correct flags with model and permissions", () => {
  const args = buildAgyArgs({
    prompt: "Generate cards",
    model: "gemini-3.8-flash-medium",
  });

  assert.deepEqual(args, [
    "-p",
    "Generate cards",
    "--model",
    "gemini-3.8-flash-medium",
    "--dangerously-skip-permissions",
  ]);
});

test("buildAgyArgs includes effort when specified", () => {
  const args = buildAgyArgs({
    prompt: "Generate cards",
    model: "claude-sonnet-4-6",
    effort: "high",
  });

  assert.deepEqual(args, [
    "-p",
    "Generate cards",
    "--model",
    "claude-sonnet-4-6",
    "--dangerously-skip-permissions",
    "--effort",
    "high",
  ]);
});

test("buildAgyPrompt formats prompt with instructions and content", () => {
  const prompt = buildAgyPrompt({
    prompt: "Create flashcards",
    content: "Machine learning is a field of study in artificial intelligence.",
  });

  assert.match(prompt, /experimental pdfanki flashcard-generation provider/);
  assert.match(prompt, /Do not inspect files, run commands, or modify the workspace/);
  assert.match(prompt, /Create flashcards/);
  assert.match(prompt, /Machine learning is a field of study/);
});

test("loadAgyConfig loads model from custom config file", async () => {
  const tempDir = join(repoRoot, ".tmp", "test-agy-config");
  await mkdir(tempDir, { recursive: true });
  const configPath = join(tempDir, "agy.config.json");
  await writeFile(
    configPath,
    JSON.stringify({
      provider: "agy",
      model: "claude-sonnet-4-6",
      effort: "high",
    }),
    "utf8",
  );

  try {
    const config = loadAgyConfig(configPath);
    assert.equal(config.provider, "agy");
    assert.equal(config.model, "claude-sonnet-4-6");
    assert.equal(config.effort, "high");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("callAgyProvider delegates to runner with configured model", async () => {
  let capturedArgs = null;
  let capturedOptions = null;

  const output = await callAgyProvider({
    prompt: "Create flashcard",
    content: "Knowledge is power.",
    model: "claude-sonnet-4-6",
    effort: "medium",
    runner: async (args, options) => {
      capturedArgs = args;
      capturedOptions = options;
      return {
        stdout: "## Knowledge\n- Knowledge is power\n",
        stderr: "",
        exitCode: 0,
        signal: null,
      };
    },
  });

  assert.equal(output, "## Knowledge\n- Knowledge is power");
  assert.ok(capturedArgs);
  assert.ok(capturedOptions);
  assert.equal(capturedOptions.command, "agy");
  assert.ok(capturedArgs.includes("--model"));
  assert.ok(capturedArgs.includes("claude-sonnet-4-6"));
  assert.ok(capturedArgs.includes("--effort"));
  assert.ok(capturedArgs.includes("medium"));
});

test("callAgyProvider throws error on non-zero exit code", async () => {
  await assert.rejects(
    () =>
      callAgyProvider({
        prompt: "Create flashcard",
        content: "Some content",
        runner: async () => ({
          stdout: "",
          stderr: "Model not found",
          exitCode: 1,
          signal: null,
        }),
      }),
    /Agy CLI provider failed with exit code 1/,
  );
});

test("generateFlashcards works with provider agy without apiKey", async () => {
  let capturedArgs = null;

  const output = await generateFlashcards({
    provider: "agy",
    prompt: "Generate one card",
    content: "TypeScript is a typed superset of JavaScript.",
    model: "gemini-3.8-flash-medium",
    agy: {
      runner: async (args) => {
        capturedArgs = args;
        return {
          stdout: "## TypeScript\n- Typed superset of JavaScript\n",
          stderr: "",
          exitCode: 0,
          signal: null,
        };
      },
    },
  });

  assert.equal(output, "## TypeScript\n- Typed superset of JavaScript");
  assert.ok(capturedArgs);
  assert.ok(capturedArgs.includes("gemini-3.8-flash-medium"));
});
