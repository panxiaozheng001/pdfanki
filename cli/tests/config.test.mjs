import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { DEFAULT_SETTINGS, loadSettings } from "../dist/config.js";

/*
 * settings.json, read field by field.
 *
 * The file is the user's, so `JSON.parse` hands back whatever they typed. What is
 * asserted here is that a value which is not what `Settings` says falls back to the
 * default rather than reaching the extractor, that one bad key costs that key alone,
 * and that both the nested and the flat legacy spellings still work.
 */

/** `loadSettings` over one settings.json, isolated by `XDG_CONFIG_HOME`. */
const settingsFrom = async (contents) => {
  const home = await mkdtemp(join(tmpdir(), "pdfanki-config-"));
  await mkdir(join(home, "pdfanki"), { recursive: true });
  await writeFile(join(home, "pdfanki", "settings.json"), contents, "utf8");

  const previous = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = home;
  try {
    return await loadSettings();
  } finally {
    if (previous === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = previous;
    }
  }
};

const json = (value) => JSON.stringify(value, null, 2);

test("loadSettings reads the nested shape", async () => {
  const settings = await settingsFrom(
    json({
      output: { path: "/decks", paths: { apkg: "/decks/apkg" } },
      generation: {
        defaultProvider: "anthropic",
        defaultPrompt: "terse",
        providers: { anthropic: { defaultModel: "claude-opus-5" } },
      },
      epub: { preview: true, previewChars: 240 },
    }),
  );

  assert.equal(settings.output.path, "/decks");
  assert.deepEqual(settings.output.paths, { apkg: "/decks/apkg" });
  assert.equal(settings.generation.defaultProvider, "anthropic");
  assert.equal(settings.generation.defaultPrompt, "terse");
  assert.equal(settings.generation.providers.anthropic.defaultModel, "claude-opus-5");
  assert.equal(settings.epub.preview, true);
  assert.equal(settings.epub.previewChars, 240);
});

test("loadSettings reads the flat legacy shape", async () => {
  const settings = await settingsFrom(
    json({
      outputPath: "/legacy",
      defaultProvider: "openai",
      defaultPrompt: "legacy",
      providers: { openai: { defaultModel: "gpt-legacy" } },
      epubFilters: { titles: [{ type: "string", value: "Colophon" }] },
    }),
  );

  assert.equal(settings.output.path, "/legacy");
  assert.equal(settings.generation.defaultProvider, "openai");
  assert.equal(settings.generation.defaultPrompt, "legacy");
  assert.equal(settings.generation.providers.openai.defaultModel, "gpt-legacy");
  assert.ok(
    settings.epub.filters.titles.some(
      (filter) => filter.type === "string" && filter.value === "Colophon",
    ),
  );
});

test("loadSettings prefers the nested shape over the flat one", async () => {
  const settings = await settingsFrom(
    json({ outputPath: "/flat", output: { path: "/nested" }, defaultPrompt: "flat" }),
  );

  assert.equal(settings.output.path, "/nested");
  assert.equal(settings.generation.defaultPrompt, "flat");
});

test("loadSettings falls back on an ill-typed value", async () => {
  const settings = await settingsFrom(
    json({ epub: { preview: "yes", previewChars: "twelve" }, output: { path: 12 } }),
  );

  assert.equal(settings.epub.previewChars, DEFAULT_SETTINGS.epub.previewChars);
  assert.equal(settings.epub.preview, DEFAULT_SETTINGS.epub.preview);
  assert.equal(settings.output.path, DEFAULT_SETTINGS.output.path);
});

test("loadSettings ignores a provider name it does not know", async () => {
  const settings = await settingsFrom(json({ generation: { defaultProvider: "hal9000" } }));

  assert.equal(settings.generation.defaultProvider, DEFAULT_SETTINGS.generation.defaultProvider);
});

test("loadSettings keeps a provider's other defaults when one field is given", async () => {
  const settings = await settingsFrom(
    json({ generation: { providers: { codex: { reasoningEffort: "sideways" } } } }),
  );

  const { codex } = settings.generation.providers;
  assert.equal(codex.defaultModel, DEFAULT_SETTINGS.generation.providers.codex.defaultModel);
  assert.equal(codex.reasoningEffort, DEFAULT_SETTINGS.generation.providers.codex.reasoningEffort);
});

test("loadSettings drops a malformed title filter and keeps its neighbours", async () => {
  const settings = await settingsFrom(
    json({
      epub: {
        filters: {
          titles: [
            { type: "string", value: "Colophon" },
            { type: "regex", pattern: "[unclosed" },
            { type: "regex", pattern: "^errata$", flags: "i" },
            { type: "string" },
            "Afterword",
          ],
        },
      },
    }),
  );

  const added = settings.epub.filters.titles.filter(
    (filter) => !DEFAULT_SETTINGS.epub.filters.titles.includes(filter),
  );

  assert.deepEqual(added, [
    { type: "string", value: "Colophon" },
    { type: "regex", pattern: "^errata$", flags: "i" },
  ]);
});

test("loadSettings keeps the default title filters alongside the file's", async () => {
  const settings = await settingsFrom(
    json({ epub: { filters: { titles: [{ type: "string", value: "Colophon" }] } } }),
  );

  assert.equal(
    settings.epub.filters.titles.length,
    DEFAULT_SETTINGS.epub.filters.titles.length + 1,
  );
});

test("loadSettings does not carry an unknown key through", async () => {
  const settings = await settingsFrom(
    json({ telemetry: true, output: { path: "/decks", colour: "green" } }),
  );

  assert.equal("telemetry" in settings, false);
  assert.equal("colour" in settings.output, false);
  assert.deepEqual(Object.keys(settings).toSorted(), ["epub", "generation", "output"]);
});

test("loadSettings returns the defaults for a file that will not parse", async () => {
  const settings = await settingsFrom("{ not json at all");

  assert.deepEqual(settings, DEFAULT_SETTINGS);
});
