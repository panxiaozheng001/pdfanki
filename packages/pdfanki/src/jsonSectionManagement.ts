// utils/jsonSectionManagement.js

import type { BookJson, BookMetadata, ContentSection, DeletedSection } from "./types/flashcards.js";

/**
 * Re-index sections to maintain sequential numbering (1, 2, 3...)
 */
export function reindexSections(sections: ContentSection[]): ContentSection[] {
  return sections.map((section, index) => ({
    ...section,
    index: index + 1,
  }));
}

/**
 * Update metadata after sections are modified
 */
export function updateMetadata(jsonData: BookJson, deletedCount = 0): BookMetadata {
  const currentSectionCount = jsonData.content?.length || 0;

  return {
    ...jsonData.metadata,
    extractedSections: currentSectionCount,
    filteredSections: (jsonData.metadata?.filteredSections || 0) + deletedCount,
  };
}

/**
 * Delete a section from JSON data
 */
export function deleteSection(
  jsonData: BookJson,
  sectionIndex: number,
): { updatedJsonData: BookJson; deletedSection: DeletedSection } {
  if (!jsonData?.content || !Array.isArray(jsonData.content)) {
    throw new Error("Invalid JSON data structure");
  }

  // Find the section to delete
  const sectionToDelete = jsonData.content.find((section) => section.index === sectionIndex);
  if (!sectionToDelete) {
    throw new Error(`Section with index ${sectionIndex} not found`);
  }

  // Remove the section
  const filteredContent = jsonData.content.filter((section) => section.index !== sectionIndex);

  // Re-index remaining sections
  const reindexedContent = reindexSections(filteredContent);

  // Update metadata
  const updatedMetadata = updateMetadata(
    {
      ...jsonData,
      content: reindexedContent,
    },
    1,
  );

  const updatedJsonData = {
    ...jsonData,
    content: reindexedContent,
    metadata: updatedMetadata,
  };

  // Return both the updated data and the deleted section info for undo
  return {
    updatedJsonData,
    deletedSection: {
      section: sectionToDelete,
      originalPosition: jsonData.content.findIndex((section) => section.index === sectionIndex),
      timestamp: Date.now(),
    },
  };
}

/**
 * Restore a deleted section to its original position
 */
export function undoDelete(jsonData: BookJson, deletedSection: DeletedSection): BookJson {
  if (!jsonData?.content || !Array.isArray(jsonData.content)) {
    throw new Error("Invalid JSON data structure");
  }

  if (!deletedSection?.section) {
    throw new Error("Invalid deleted section data");
  }

  // Insert the section back at its original position
  const newContent = [...jsonData.content];
  newContent.splice(deletedSection.originalPosition, 0, deletedSection.section);

  // Re-index all sections to maintain proper numbering
  const reindexedContent = reindexSections(newContent);

  // Update metadata (decrease filtered count)
  const updatedMetadata = updateMetadata(
    {
      ...jsonData,
      content: reindexedContent,
    },
    -1,
  );

  return {
    ...jsonData,
    content: reindexedContent,
    metadata: updatedMetadata,
  };
}

/**
 * Get the most recent deleted section from the undo stack
 */
export function getLastDeleted(
  deletedSections: DeletedSection[] | null | undefined,
): DeletedSection | null {
  if (!deletedSections || deletedSections.length === 0) {
    return null;
  }

  // Return the most recently deleted section
  return deletedSections.at(-1) ?? null;
}

/**
 * Add a deleted section to the undo stack
 */
export function addToUndoStack(
  deletedSections: DeletedSection[],
  deletedSection: DeletedSection,
  maxUndoCount = 10,
): DeletedSection[] {
  const newStack = [...deletedSections, deletedSection];

  // Limit the undo stack size
  if (newStack.length > maxUndoCount) {
    return newStack.slice(-maxUndoCount);
  }

  return newStack;
}

/**
 * Remove the most recent deleted section from the undo stack
 */
export function removeFromUndoStack(
  deletedSections: DeletedSection[] | null | undefined,
): DeletedSection[] {
  if (!deletedSections || deletedSections.length === 0) {
    return [];
  }

  return deletedSections.slice(0, -1);
}

/**
 * Clear all deleted sections from the undo stack
 */
export function clearUndoStack(): DeletedSection[] {
  return [];
}

/**
 * Check if undo is available
 */
export function canUndo(deletedSections: DeletedSection[] | null | undefined): boolean {
  return (deletedSections?.length ?? 0) > 0;
}

/**
 * Get summary of what can be undone
 */
export function getUndoSummary(deletedSections: DeletedSection[] | null | undefined): {
  sectionTitle: string | undefined;
  timestamp: number;
  count: number;
} | null {
  const lastDeleted = getLastDeleted(deletedSections);
  if (!lastDeleted) {
    return null;
  }

  return {
    sectionTitle: lastDeleted.section.title,
    timestamp: lastDeleted.timestamp,
    count: deletedSections?.length ?? 0,
  };
}

/**
 * Validate JSON data structure
 */
/**
 * Whether a parsed payload is a deck this package can work with. Shares
 * `validateJsonStructure`'s checks: call that one when the reason matters, this
 * one when the type does.
 */
export function isBookJson(
  value: unknown,
  options: { requireMetadata?: boolean; requireTitles?: boolean } = {},
): value is BookJson {
  return validateJsonStructure(value, options).isValid;
}

export function validateJsonStructure(
  jsonData: unknown,
  options: { requireMetadata?: boolean; requireTitles?: boolean } = {},
): { isValid: boolean; error?: string } {
  const { requireMetadata = true, requireTitles = true } = options;

  if (!jsonData || typeof jsonData !== "object") {
    return {
      isValid: false,
      error: jsonData ? "JSON data must have a content array" : "JSON data is null or undefined",
    };
  }

  const content: unknown = "content" in jsonData ? jsonData.content : undefined;
  const metadata: unknown = "metadata" in jsonData ? jsonData.metadata : undefined;

  if (!Array.isArray(content)) {
    return { isValid: false, error: "JSON data must have a content array" };
  }

  if (requireMetadata) {
    if (!metadata || typeof metadata !== "object") {
      return { isValid: false, error: "JSON data must have a metadata object" };
    }
  } else if (metadata && typeof metadata !== "object") {
    return { isValid: false, error: "metadata must be an object if present" };
  }

  const sections: unknown[] = content;

  // Check if content sections have required properties
  for (const [position, section] of sections.entries()) {
    const missing = {
      isValid: false,
      error: `Section ${position + 1} is missing required properties (index,${requireTitles ? " title," : ""} or text)`,
    };

    if (!section || typeof section !== "object") {
      return missing;
    }

    const title: unknown = "title" in section ? section.title : undefined;
    const index: unknown = "index" in section ? section.index : undefined;
    const text: unknown = "text" in section ? section.text : undefined;

    const hasTitle = Boolean(title) && typeof title === "string";
    const titleRequirementMet = requireTitles ? hasTitle : true;
    const hasIndex = typeof index === "number" && index > 0;
    if (!hasIndex || !titleRequirementMet || typeof text !== "string") {
      return missing;
    }
  }

  return { isValid: true };
}
