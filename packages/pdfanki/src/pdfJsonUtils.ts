// lib/pdfJsonUtils.js
import { PDFParse, VerbosityLevel } from "pdf-parse";

import type { BookJson, IndexEntry } from "./types/flashcards.js";

/**
 * A PDF's own info and metadata dictionaries. The keys are the document's, not
 * ones this package chose, so every read narrows rather than assumes.
 */
type PdfDictionary = Record<string, unknown>;

/** What `parsePdfWithPdfParse` collects for the transform below. */
export interface PdfParseResult {
  pageTexts: string[];
  rawTextContent: string;
  info: PdfDictionary;
  metadata: unknown;
  numpages: number;
  numrender: number;
  version: string | null;
}

/** A page as pdf2json models it: positioned runs of URI-encoded text. */
interface Pdf2JsonRun {
  T?: string;
}

interface Pdf2JsonText {
  x: number;
  y: number;
  R?: Pdf2JsonRun[];
}

interface Pdf2JsonPage {
  Texts?: Pdf2JsonText[];
}

/** What pdf2json hands `transformPdf2jsonResult`. */
export interface Pdf2JsonResult {
  pdfData: {
    Pages?: Pdf2JsonPage[];
    Meta?: PdfDictionary;
  };
  rawTextContent?: string;
}

/** The name of the file a transform is describing. */
interface SourceFile {
  name: string;
}

/**
 * The first candidate that is a non-empty string. This is `||` over a run of
 * fallbacks, kept because an empty PDF title must still fall through to the
 * filename rather than be reported as the title.
 */
function firstNonEmptyString(...candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return undefined;
}

/** Read one field off a metadata dictionary the parser owns and nothing types. */
function readMetadataString(source: unknown, key: "title" | "author"): string | undefined {
  if (!source || typeof source !== "object" || !(key in source)) {
    return undefined;
  }

  const value: unknown =
    key === "title"
      ? "title" in source
        ? source.title
        : undefined
      : "author" in source
        ? source.author
        : undefined;

  return typeof value === "string" ? value : undefined;
}

/** One extracted unit of PDF text: a chapter, or the whole document. */
interface PdfSection {
  index: number;
  title: string;
  text: string;
  pageRange?: string;
  pageCount?: number;
  processedPages?: number;
}

/**
 * Parse PDF using pdf-parse (pdf.js under the hood) and collect per-page text.
 * @param fileBuffer Raw PDF buffer
 * @param debug When true, enable pdf.js warnings (verbosity 1); default suppresses warnings.
 */
export async function parsePdfWithPdfParse(
  fileBuffer: Buffer | Uint8Array,
  debug = false,
): Promise<PdfParseResult> {
  const parser = new PDFParse({
    data: fileBuffer,
    ...(debug ? { verbosity: VerbosityLevel.WARNINGS } : {}),
  });

  try {
    // Avoid parallel calls so the same buffer isn't transferred twice to the
    // pdf.js worker (Node 24 will throw a DataCloneError otherwise).
    const textResult = await parser.getText();
    const infoResult = await parser.getInfo();

    const pageTexts = textResult.pages?.map((page) => page.text ?? "") ?? [];

    const metadata = infoResult.metadata
      ? ((infoResult.metadata as { _metadata?: unknown })._metadata ?? infoResult.metadata)
      : {};

    return {
      pageTexts,
      rawTextContent: textResult.text || "",
      info: infoResult.info || {},
      metadata,
      numpages: textResult.total || infoResult.total || pageTexts.length,
      numrender: pageTexts.length,
      version:
        (infoResult.info && (infoResult.info as { PDFFormatVersion?: string }).PDFFormatVersion) ||
        null,
    };
  } finally {
    await parser.destroy();
  }
}

/**
 * Transform pdf2json result to our expected format
 */
export function transformPdf2jsonResult(
  parsedData: Pdf2JsonResult,
  originalFile: SourceFile,
  index: IndexEntry[] | null | undefined,
): BookJson {
  const { pdfData, rawTextContent } = parsedData;
  const pages: Pdf2JsonPage[] = pdfData.Pages ?? [];
  const meta: PdfDictionary = pdfData.Meta ?? {};

  let content: PdfSection[] = [];
  let processingMethod = "pdf2json";

  if (index && Array.isArray(index)) {
    // Process by chapters using the provided index
    content = processWithIndex(pages, index);
    processingMethod = "pdf2json-with-index";
  } else {
    // Process as a single text document when no index is provided.
    content = processAsSingleText(pages, 0, pages.length - 1, originalFile.name);
    processingMethod = "pdf2json-single-text";
  }

  // If no structured text found, fall back to raw text content
  if (content.length === 0 && rawTextContent && rawTextContent.trim().length > 0) {
    content = [
      {
        index: 1,
        title: originalFile.name.replace(".pdf", ""),
        text: rawTextContent.trim(),
      },
    ];
  }

  // Build metadata
  const metadata = {
    title: firstNonEmptyString(meta.Title) ?? originalFile.name.replace(".pdf", ""),
    author: firstNonEmptyString(meta.Author) ?? "Unknown Author",
    creator: firstNonEmptyString(meta.Creator) ?? null,
    producer: firstNonEmptyString(meta.Producer) ?? null,
    creationDate: firstNonEmptyString(meta.CreationDate) ?? null,
    modificationDate: firstNonEmptyString(meta.ModDate) ?? null,
    fileType: "pdf",
    totalPages: pages.length,
    extractedPages: index ? getTotalPagesFromIndex(index) : pages.length,
    extractedSections: content.length,
    filteredSections: 0,
    extractedRange: index ? `Chapters 1-${index.length}` : "All Pages",
    processingMethod,
    pdfVersion: firstNonEmptyString(meta.PDFFormatVersion) ?? null,
    hasAcroForm: Boolean(meta.IsAcroFormPresent),
    hasXFA: Boolean(meta.IsXFAPresent),
    hasIndex: Boolean(index),
    indexChapters: index?.length ?? 0,
  };

  return {
    metadata,
    content,
  };
}

/**
 * Transform pdf-parse result to our expected format (similar to pdf2json path).
 */
export function transformPdfParseResult(
  parsedData: PdfParseResult,
  originalFile: SourceFile,
  index: IndexEntry[] | null | undefined,
): BookJson {
  const pageTexts: string[] = parsedData.pageTexts;
  const totalPages = parsedData.numpages || pageTexts.length;
  const meta: PdfDictionary = parsedData.info;
  const rawTextContent = parsedData.rawTextContent;

  let content: PdfSection[] = [];
  let processingMethod = "pdf-parse";

  if (index && Array.isArray(index)) {
    content = processWithIndexFromPageText(pageTexts, index);
    processingMethod = "pdf-parse-with-index";
  } else {
    content = processAsSingleTextFromPages(pageTexts, 0, totalPages - 1, originalFile.name);
    processingMethod = "pdf-parse-single-text";
  }

  if (content.length === 0 && rawTextContent && rawTextContent.trim().length > 0) {
    content = [
      {
        index: 1,
        title: originalFile.name.replace(".pdf", ""),
        text: rawTextContent.trim(),
      },
    ];
  }

  const metadata = {
    title:
      firstNonEmptyString(
        meta.Title,
        meta.title,
        readMetadataString(parsedData.metadata, "title"),
      ) ?? originalFile.name.replace(".pdf", ""),
    author:
      firstNonEmptyString(
        meta.Author,
        meta.author,
        readMetadataString(parsedData.metadata, "author"),
      ) ?? "Unknown Author",
    creator: firstNonEmptyString(meta.Creator) ?? null,
    producer: firstNonEmptyString(meta.Producer) ?? null,
    creationDate: firstNonEmptyString(meta.CreationDate) ?? null,
    modificationDate: firstNonEmptyString(meta.ModDate) ?? null,
    fileType: "pdf",
    totalPages: totalPages,
    extractedPages: index ? getTotalPagesFromIndex(index) : totalPages,
    extractedSections: content.length,
    filteredSections: 0,
    extractedRange: index ? `Chapters 1-${index.length}` : "All Pages",
    processingMethod,
    pdfVersion: parsedData.version,
    hasIndex: Boolean(index),
    indexChapters: index?.length ?? 0,
  };

  return {
    metadata,
    content,
  };
}

/**
 * Process PDF with chapter index
 */
function processWithIndex(pages: Pdf2JsonPage[], index: IndexEntry[]): PdfSection[] {
  const content: PdfSection[] = [];

  index.forEach((chapter, chapterIndex) => {
    const title =
      typeof chapter.title === "string" && chapter.title.trim().length > 0
        ? chapter.title.trim()
        : `Section ${chapterIndex + 1}`;
    const startPage = chapter.start - 1; // Convert to 0-based index
    const endPage = chapter.end - 1; // Convert to 0-based index

    // Validate page range
    if (startPage < 0 || endPage >= pages.length || startPage > endPage) {
      console.warn(
        `Skipping chapter "${title}": invalid page range ${chapter.start}-${chapter.end}`,
      );
      return;
    }

    // Extract text from chapter pages
    let chapterText = "";
    for (let pageIndex = startPage; pageIndex <= endPage; pageIndex++) {
      const pageText = extractTextFromPage(pages[pageIndex]);
      if (pageText && pageText.trim().length > 0) {
        chapterText += pageText.trim() + "\n\n";
      }
    }

    // Only add chapter if it has content
    if (chapterText.trim().length > 0) {
      content.push({
        index: chapterIndex + 1,
        title,
        text: chapterText.trim(),
        pageRange: `${chapter.start}-${chapter.end}`,
        pageCount: endPage - startPage + 1,
      });
    } else {
      console.warn(`Chapter "${title}" has no extractable text`);
    }
  });

  return content;
}

/**
 * Process PDF with chapter index using plain page text.
 */
function processWithIndexFromPageText(pageTexts: string[], index: IndexEntry[]): PdfSection[] {
  const content: PdfSection[] = [];
  const totalPages = pageTexts.length;

  index.forEach((chapter, chapterIndex) => {
    const title =
      typeof chapter.title === "string" && chapter.title.trim().length > 0
        ? chapter.title.trim()
        : `Section ${chapterIndex + 1}`;
    const startPage = chapter.start - 1;
    const endPage = chapter.end - 1;

    if (startPage < 0 || endPage >= totalPages || startPage > endPage) {
      console.warn(
        `Skipping chapter "${title}": invalid page range ${chapter.start}-${chapter.end}`,
      );
      return;
    }

    let chapterText = "";
    for (let pageIndex = startPage; pageIndex <= endPage; pageIndex++) {
      const pageText = pageTexts[pageIndex];
      if (pageText && pageText.trim().length > 0) {
        chapterText += pageText.trim() + "\n\n";
      }
    }

    if (chapterText.trim().length > 0) {
      content.push({
        index: chapterIndex + 1,
        title,
        text: chapterText.trim(),
        pageRange: `${chapter.start}-${chapter.end}`,
        pageCount: endPage - startPage + 1,
      });
    } else {
      console.warn(`Chapter "${title}" has no extractable text`);
    }
  });

  return content;
}

/**
 * Process PDF as a single text document (new default when no index)
 */
function processAsSingleText(
  filteredPages: Pdf2JsonPage[],
  startPage: number,
  endPage: number,
  fileName: string,
): PdfSection[] {
  let allText = "";
  let processedPages = 0;

  filteredPages.forEach((page) => {
    const pageText = extractTextFromPage(page);
    if (pageText && pageText.trim().length > 0) {
      allText += pageText.trim() + "\n\n";
      processedPages++;
    }
  });

  // Only return content if we found text
  if (allText.trim().length > 0) {
    const actualStartPage = startPage + 1;
    const actualEndPage = endPage + 1;

    return [
      {
        index: 1,
        title: fileName.replace(".pdf", ""),
        text: allText.trim(),
        pageRange: `${actualStartPage}-${actualEndPage}`,
        pageCount: endPage - startPage + 1,
        processedPages: processedPages,
      },
    ];
  }

  return [];
}

/**
 * Process PDF as a single text document from per-page text.
 */
function processAsSingleTextFromPages(
  filteredPages: string[],
  startPage: number,
  endPage: number,
  fileName: string,
): PdfSection[] {
  let allText = "";
  let processedPages = 0;

  filteredPages.forEach((pageText) => {
    if (pageText && pageText.trim().length > 0) {
      allText += pageText.trim() + "\n\n";
      processedPages++;
    }
  });

  if (allText.trim().length > 0) {
    const actualStartPage = startPage + 1;
    const actualEndPage = endPage + 1;

    return [
      {
        index: 1,
        title: fileName.replace(".pdf", ""),
        text: allText.trim(),
        pageRange: `${actualStartPage}-${actualEndPage}`,
        pageCount: endPage - startPage + 1,
        processedPages: processedPages,
      },
    ];
  }

  return [];
}

/**
 * Calculate total pages covered by index
 */
function getTotalPagesFromIndex(index: IndexEntry[]): number {
  return index.reduce((total, chapter) => {
    return total + (chapter.end - chapter.start + 1);
  }, 0);
}

/**
 * Extract text content from a pdf2json page object
 */
function extractTextFromPage(page: Pdf2JsonPage): string {
  if (!page.Texts || !Array.isArray(page.Texts)) {
    return "";
  }

  let pageText = "";

  // Sort texts by Y position (top to bottom), then X position (left to right)
  const sortedTexts = page.Texts.toSorted((a, b) => {
    if (Math.abs(a.y - b.y) < 0.1) {
      // Same line
      return a.x - b.x; // Sort by X position
    }
    return a.y - b.y; // Sort by Y position
  });

  sortedTexts.forEach((textObj) => {
    if (textObj.R && Array.isArray(textObj.R)) {
      textObj.R.forEach((run) => {
        if (run.T) {
          // Decode URI-encoded text
          const decodedText = decodeURIComponent(run.T);
          pageText += decodedText + " ";
        }
      });
    }
  });

  return pageText;
}
