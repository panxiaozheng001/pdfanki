import { themeCss, type CodeTheme } from "./highlight.js";

/*
 * The note type's look, which the library refuses on purpose.
 *
 * `@ankimd/core` passes a template through and never goes looking for one.
 *
 * `defaultTemplate` only, out of `ankimd/cli/src/template.ts`. That file also
 * reads a template out of a directory, which is what its `--template` flag needs;
 * no pdfanki command has one, and adding a flag is not what this is for.
 */

export interface Template {
  answerFormat: string;
  css: string;
  questionFormat: string;
}

const QUESTION = "{{Front}}";
const ANSWER = '{{FrontSide}}\n\n<hr id="answer">\n\n{{Back}}';

/** Enough to read a card by, and to keep a code block from setting its own size. */
const CARD_CSS = `.card {
  font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
  font-size: 16px;
  text-align: left;
}

pre[class*="language-"] {
  font-size: 0.9em;
  text-align: left;
}
`;

/**
 * The default note type, with the code theme's stylesheet folded into its CSS.
 *
 * Anki serves a note type's CSS to every card, so the highlighting styles ride
 * along with no media file and no `<link>` for the card to resolve.
 */
export async function defaultTemplate(theme: CodeTheme): Promise<Template> {
  return {
    answerFormat: ANSWER,
    css: `${CARD_CSS}\n${await themeCss(theme)}`,
    questionFormat: QUESTION,
  };
}
