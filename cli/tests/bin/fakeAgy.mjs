#!/usr/bin/env node

const args = process.argv.slice(2);

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(64);
}

function optionValue(name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

if (!args.includes("-p") && !args.includes("--print")) {
  fail("missing -p / --print flag in agy call");
}

const prompt = optionValue("-p") ?? optionValue("--print");
if (!prompt) {
  fail("empty prompt passed to agy");
}

if (!prompt.includes("Source text:")) {
  fail("missing source text block in agy prompt");
}

if (!prompt.includes("STORY OF THE DOOR")) {
  fail("missing expected book marker in agy prompt");
}

const expectedModel = process.env.EXPECTED_AGY_MODEL;
if (expectedModel && optionValue("--model") !== expectedModel) {
  fail(`expected --model ${expectedModel}, received ${optionValue("--model") ?? "(missing)"}`);
}

const expectedEffort = process.env.EXPECTED_AGY_EFFORT;
const actualEffort = optionValue("--effort");
if (expectedEffort && actualEffort && actualEffort !== expectedEffort) {
  fail(`expected --effort ${expectedEffort}, received ${actualEffort}`);
}

process.stdout.write(`## Agy provider fixture
- Fake Agy CLI consumed a public-domain EPUB section
- Source marker: STORY OF THE DOOR
`);
