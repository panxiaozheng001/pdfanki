/**
 * A rule, not a record: a filter is written once and only ever read against a
 * chapter title, so both variants and the list of them are readonly.
 */
export type EpubTitleFilter =
  | { readonly type: "string"; readonly value: string }
  | { readonly type: "regex"; readonly pattern: string; readonly flags?: string };

export interface EpubFilters {
  readonly titles?: readonly EpubTitleFilter[];
}

// Default filters mirror the previous hardcoded patterns.
export const DEFAULT_EPUB_TITLE_FILTERS: readonly EpubTitleFilter[] = [
  { type: "regex", pattern: "^contents?$", flags: "i" },
  { type: "regex", pattern: "^dedication$", flags: "i" },
  { type: "regex", pattern: "^about\\s+the\\s+.+$", flags: "i" },
  { type: "regex", pattern: "^also\\s+by\\s+.+$", flags: "i" },
  { type: "regex", pattern: "^index$", flags: "i" },
  { type: "regex", pattern: "^credits$", flags: "i" },
  { type: "regex", pattern: "^copyright$", flags: "i" },
  { type: "regex", pattern: "^notes$", flags: "i" },
  { type: "regex", pattern: "^notes\\s+on\\s+sources$", flags: "i" },
  { type: "regex", pattern: "^bibliography$", flags: "i" },
  { type: "regex", pattern: "^acknowledg(e)?ments?$", flags: "i" },
  {
    type: "regex",
    pattern: "^acknowledg(e)?ments?\\s+and\\s+notes\\s+on\\s+sources$",
    flags: "i",
  },
  { type: "regex", pattern: "^frontispiece$", flags: "i" },
  { type: "regex", pattern: "^welcome$", flags: "i" },
  { type: "regex", pattern: "^title\\s+page$", flags: "i" },
  { type: "regex", pattern: "^table\\s+of\\s+contents$", flags: "i" },
  { type: "regex", pattern: "^newsletters?$", flags: "i" },
  { type: "regex", pattern: "^praise\\s+of(?:\\s+.+)?$", flags: "i" },
  { type: "regex", pattern: "^a\\s+note\\s+on\\s+the\\s+author$", flags: "i" },
  { type: "regex", pattern: "^author['’]s\\s+note$", flags: "i" },
  { type: "regex", pattern: "^illustration\\s+credits$", flags: "i" },
];
