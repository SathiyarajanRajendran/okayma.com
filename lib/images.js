// Validation for uploaded portraits.
//
// The client's Content-Type is never believed. A browser will happily label
// anything, and the type we store is the type we later serve — so it is
// established from the file's own leading bytes and nothing else.

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2MB

// Each entry: the media type, and a test against the first bytes of the file.
const SIGNATURES = [
  {
    type: "image/webp",
    // "RIFF" .... "WEBP"
    test: (b) =>
      b.length > 12 &&
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
  {
    type: "image/png",
    test: (b) =>
      b.length > 8 &&
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  {
    type: "image/jpeg",
    test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
];

// Returns the detected media type, or null when the bytes are not one of the
// three formats every current browser can display.
export function sniffImageType(bytes) {
  for (const sig of SIGNATURES) {
    if (sig.test(bytes)) return sig.type;
  }
  return null;
}

// Returns { ok, type, bytes, error }.
export function validatePhoto(bytes) {
  if (!bytes || !bytes.length) {
    return { ok: false, error: "The photo file was empty." };
  }
  if (bytes.length > MAX_PHOTO_BYTES) {
    return {
      ok: false,
      error: `That photo is ${(bytes.length / 1024 / 1024).toFixed(1)}MB. Keep it under 2MB.`,
    };
  }

  const type = sniffImageType(bytes);
  if (!type) {
    return {
      ok: false,
      error: "That file is not a JPEG, PNG or WebP image.",
    };
  }

  // An SVG would pass no signature check above, which is the point: SVG is a
  // document format that can carry script, and serving one from our own origin
  // would hand an uploader a way to run code on it.
  return { ok: true, type, bytes };
}
