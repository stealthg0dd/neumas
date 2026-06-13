export const SCAN_UPLOAD_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const SCAN_UPLOAD_ACCEPT_ATTR = SCAN_UPLOAD_ALLOWED_MIME_TYPES.join(",");

export const SCAN_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

export const SCAN_UPLOAD_TYPE_ERROR = "Only JPEG, PNG, and WebP images are supported.";
export const SCAN_UPLOAD_SIZE_ERROR = "File too large. Maximum size is 10MB.";

export function isSupportedScanUploadType(file: File): boolean {
  return SCAN_UPLOAD_ALLOWED_MIME_TYPES.includes(file.type as (typeof SCAN_UPLOAD_ALLOWED_MIME_TYPES)[number]);
}

export function isSupportedScanUploadSize(file: File): boolean {
  return file.size <= SCAN_UPLOAD_MAX_BYTES;
}
