import { parse } from "node:path";

import type { ReadonlyBookJson, ReadonlyContentSection } from "./pdfankiRuntime.js";
import { formatCount } from "./ui/format.js";
import type { Logger } from "./ui/logger.js";

/**
 * What a PDF extraction reports about itself: the sections it found, their page
 * ranges, and any two that claim the same pages. The overlap warning is only
 * meaningful when an index was given, since that is the user's own claim about
 * where the chapters are.
 */

function parsePageRange(pageRange?: string): { start: number; end: number } | null {
  if (!pageRange) {
    return null;
  }
  const match = /^(\d+)-(\d+)$/.exec(pageRange);
  if (!match) {
    return null;
  }
  return {
    start: Number(match[1]),
    end: Number(match[2]),
  };
}

function formatOverlapRange(start: number, end: number): string {
  return start === end ? `page ${start}` : `pages ${start}-${end}`;
}

/** One section's page range, parsed out of its `pageRange` string. */
interface SectionRange {
  readonly title: string;
  readonly range: string;
  readonly start: number;
  readonly end: number;
}

/** Two sections whose page ranges claim some of the same pages. */
export interface PageOverlap {
  leftTitle: string;
  leftRange: string;
  rightTitle: string;
  rightRange: string;
  overlapStart: number;
  overlapEnd: number;
}

export function findPageOverlaps(sections: readonly ReadonlyContentSection[]): PageOverlap[] {
  const ranges = sections
    .map((section): SectionRange | null => {
      const { pageRange } = section;
      if (!pageRange) {
        return null;
      }

      const parsed = parsePageRange(pageRange);
      if (!parsed) {
        return null;
      }

      return {
        title: section.title?.trim() || `Section ${section.index}`,
        range: pageRange,
        start: parsed.start,
        end: parsed.end,
      };
    })
    .filter((range) => range !== null);

  const overlaps: PageOverlap[] = [];

  for (const [i, left] of ranges.entries()) {
    /* Every later range, sliced rather than indexed from j: the pair is what this
       compares and the second index was only ever a way to reach it. */
    for (const right of ranges.slice(i + 1)) {
      const overlapStart = Math.max(left.start, right.start);
      const overlapEnd = Math.min(left.end, right.end);

      if (overlapStart <= overlapEnd) {
        overlaps.push({
          leftTitle: left.title,
          leftRange: left.range,
          rightTitle: right.title,
          rightRange: right.range,
          overlapStart,
          overlapEnd,
        });
      }
    }
  }

  return overlaps;
}

function buildPdfSectionSummary(section: ReadonlyContentSection): string {
  const title = section.title?.trim() || `Section ${section.index}`;
  const pageRange = section.pageRange ? ` | pages: ${section.pageRange}` : "";
  const pageCount =
    typeof section.pageCount === "number"
      ? ` (${formatCount(section.pageCount)} page${section.pageCount === 1 ? "" : "s"})`
      : "";
  const charCount = section.text?.length ?? 0;
  return `- ${title}${pageRange}${pageCount} | chars: ${formatCount(charCount)}`;
}

export function logPdfExtractionSummary(
  options: Readonly<{
    logger: Logger;
    sourcePath: string;
    book: ReadonlyBookJson;
    indexProvided: boolean;
  }>,
) {
  const { logger, sourcePath, book, indexProvided } = options;
  const fileName = parse(sourcePath).base;
  const totalPages = book.metadata?.totalPages;
  const sections = book.content;

  logger.info(`Processing PDF: ${fileName}:`);
  if (typeof totalPages === "number" && totalPages > 0) {
    logger.info(`- total pages: ${formatCount(totalPages)}`);
  }

  logger.info("Index:");
  if (!indexProvided) {
    logger.info("- no index provided");
  }

  if (sections.length === 0) {
    logger.info("- no sections extracted");
    return;
  }

  for (const section of sections) {
    logger.info(buildPdfSectionSummary(section));
  }

  if (indexProvided) {
    for (const overlap of findPageOverlaps(sections)) {
      logger.warn(
        `Page overlap between "${overlap.leftTitle}" (${overlap.leftRange}) and "${overlap.rightTitle}" (${overlap.rightRange}) on ${formatOverlapRange(overlap.overlapStart, overlap.overlapEnd)}.`,
      );
    }
  }
}
