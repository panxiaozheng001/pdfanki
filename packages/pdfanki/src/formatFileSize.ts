const BYTES_PER_KB = 1024;
const BYTES_PER_MB = BYTES_PER_KB * BYTES_PER_KB;

/** Formats a byte count in human readable form. */
export const formatFileSize = (bytes: number): string => {
  const mb = bytes / BYTES_PER_MB;
  return mb < 1 ? `${(bytes / BYTES_PER_KB).toFixed(1)} KB` : `${mb.toFixed(2)} MB`;
};
