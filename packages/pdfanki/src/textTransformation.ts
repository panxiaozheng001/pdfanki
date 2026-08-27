import type { BookJson, ContentSection } from "./types/flashcards.js";

/**
 * Clean and normalize text content extracted from PDFs. Takes `unknown` because
 * the sections it runs over come out of PDF and EPUB parsers that promise
 * nothing about a section's `text`; anything that is not a string is an empty
 * one as far as this is concerned.
 */
export function cleanExtractedText(text: unknown): string {
  if (!text || typeof text !== "string") {
    return "";
  }

  let cleanedText = text;

  // 1. Remove special characters like null characters and carriage returns
  cleanedText = cleanedText
    .replace(/\u0000/g, "") // Remove null characters
    .replace(/\r/g, ""); // Remove carriage returns

  // 2. Handle newline sequences
  // First replace double newlines with single space
  cleanedText = cleanedText.replace(/\n\n/g, " ");

  // Then replace remaining single newlines with space
  cleanedText = cleanedText.replace(/\n/g, " ");

  // 3. Clean up multiple consecutive spaces
  cleanedText = cleanedText.replace(/\s+/g, " ");

  // 4. Trim whitespace from start and end
  cleanedText = cleanedText.trim();

  return cleanedText;
}

/** Apply text cleaning to every content section in a transformed result. */
export function cleanTransformedResult(transformedResult: BookJson): BookJson;
export function cleanTransformedResult<T extends null | undefined>(transformedResult: T): T;
export function cleanTransformedResult(
  transformedResult: BookJson | null | undefined,
): BookJson | null | undefined {
  if (!transformedResult?.content) {
    return transformedResult;
  }

  // Create a copy to avoid mutating the original
  const cleanedResult = {
    ...transformedResult,
    content: transformedResult.content.map((section: ContentSection) => ({
      ...section,
      text: cleanExtractedText(section.text),
    })),
  };

  return cleanedResult;
}
