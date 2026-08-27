/** Formats a byte count in human readable form. */
export const formatFileSize = (bytes: number): string => {
  const mb = bytes / (1024 * 1024);
  return mb < 1 ? `${(bytes / 1024).toFixed(1)} KB` : `${mb.toFixed(2)} MB`;
};
