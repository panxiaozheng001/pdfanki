export interface IndexEntry {
  title?: string;
  start: number;
  end: number;
  index?: number;
}

/**
 * What the extractors write into a deck's `metadata`. The two producers overlap
 * on the first block and diverge after it: a PDF carries its info dictionary, an
 * EPUB its OPF fields, and neither writes the other's.
 */
export interface BookMetadata {
  title?: string;
  author?: string;
  fileType?: string;
  hasIndex?: boolean;
  indexChapters?: number;
  totalPages?: number;
  totalSections?: number;
  extractedPages?: number;
  extractedRange?: string;
  extractedSections?: number;
  filteredSections?: number;
  processingMethod?: string;

  // PDF only.
  creator?: string | null;
  producer?: string | null;
  creationDate?: string | null;
  modificationDate?: string | null;
  pdfVersion?: string | null;
  hasAcroForm?: boolean;
  hasXFA?: boolean;

  // EPUB only.
  publisher?: string;
  date?: string;
  language?: string;
  isbn?: string | null;
}

export interface ContentSection {
  index: number;
  title?: string;
  text?: string;
  pageRange?: string;
  pageCount?: number;
}

export interface BookJson {
  metadata?: BookMetadata;
  content: ContentSection[];
}

/** A section lifted out of a deck, kept so the removal can be undone. */
export interface DeletedSection {
  section: ContentSection;
  originalPosition: number;
  timestamp: number;
}

/**
 * Read-only views of the types above, for the parameters that only read a
 * deck - which is most of them. The mutable originals stay: an extractor builds
 * a `BookJson` up field by field, and the undo stack is a `DeletedSection[]`
 * that gets pushed to. These say which side of that line a signature is on.
 *
 * Each is assignable from its mutable original, so widening a parameter to one
 * of them accepts every caller the mutable type did.
 */
export type ReadonlyIndexEntry = Readonly<IndexEntry>;

export type ReadonlyBookMetadata = Readonly<BookMetadata>;

export type ReadonlyContentSection = Readonly<ContentSection>;

export interface ReadonlyBookJson {
  readonly metadata?: ReadonlyBookMetadata;
  readonly content: readonly ReadonlyContentSection[];
}

export interface ReadonlyDeletedSection {
  readonly section: ReadonlyContentSection;
  readonly originalPosition: number;
  readonly timestamp: number;
}
