/**
 * Strip identifying metadata from generated images before they leave the
 * gateway (doc 00 Phase-0 item 5: "brand-scrub for binary/log/stream
 * surfaces ... image EXIF/watermark strip" — found live, 2026-07-17
 * Phase-0 audit, not implemented anywhere in the repo until now).
 *
 * Why this matters beyond generic hygiene: `images.ts`'s own header comment
 * says "Upstream model/provider names never leave the gateway" — but that
 * was only ever true of the JSON wrapper. The image BYTES themselves flow
 * straight from OpenRouter to the customer untouched (normalizeImage() just
 * wraps the base64, never inspects it). Many generators write their own
 * name/tool string into PNG tEXt/iTXt/zTXt chunks or JPEG EXIF/APP
 * segments (e.g. a "Software" or "Comment" field) — a real, direct leak of
 * exactly the identity this platform is built to hide, independent of
 * anything the text-based scrubbers (scrubUpstream, stripInfraIdentifiers)
 * can reach, since those only ever see JSON/text, never image bytes.
 *
 * Scope, stated plainly: this strips METADATA (text/EXIF chunks and
 * segments) — cheap, safe, pure byte manipulation, no image library needed
 * or available in the Workers runtime. It does NOT and cannot reliably
 * strip an imperceptible pixel-level watermark (e.g. Google's SynthID) —
 * those are specifically engineered to survive exactly this kind of
 * processing; removing one requires re-encoding/perturbing the actual
 * pixel data, a fundamentally different (and much heavier) problem than
 * the "image EXIF ... strip" this closes. Not attempted here — noted so
 * "watermark" in the Phase-0 item isn't silently treated as done.
 *
 * Fails open by design: an unrecognized or malformed format is returned
 * unchanged rather than risking a corrupted image reaching the customer —
 * this is a leak-reduction pass, not a validator.
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// PNG ancillary chunks that only ever carry metadata (never pixel/rendering
// data) — safe to drop unconditionally. Deliberately NOT touching cHRM/gAMA/
// sRGB/pHYs/tRNS/PLTE/bKGD/iCCP — those affect how the image actually
// renders (color space, transparency, DPI), stripping them would be a
// correctness bug dressed up as a privacy fix.
const PNG_METADATA_CHUNK_TYPES = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

function isPng(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  return PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) << 24) |
    ((bytes[offset + 1] ?? 0) << 16) |
    ((bytes[offset + 2] ?? 0) << 8) |
    (bytes[offset + 3] ?? 0)
  );
}

/** Drop tEXt/zTXt/iTXt/eXIf/tIME chunks; keep every chunk needed to decode
 *  and correctly render the image (including all critical chunks and every
 *  other ancillary chunk this function doesn't recognize as metadata-only —
 *  fail open per-chunk, not just per-image, so an unknown ancillary chunk a
 *  future PNG spec revision adds is preserved rather than guessed at). */
function stripPngMetadata(bytes: Uint8Array): Uint8Array {
  const out: number[] = [...bytes.slice(0, 8)]; // signature
  let offset = 8;

  while (offset + 8 <= bytes.length) {
    const length = readUint32BE(bytes, offset);
    const type = String.fromCharCode(
      bytes[offset + 4] ?? 0,
      bytes[offset + 5] ?? 0,
      bytes[offset + 6] ?? 0,
      bytes[offset + 7] ?? 0
    );
    const chunkTotalLength = 12 + length; // length(4) + type(4) + data(length) + crc(4)

    if (offset + chunkTotalLength > bytes.length) {
      // Malformed/truncated — bail and return what we've built so far
      // fused with the untouched remainder, never throw on bad upstream bytes.
      return new Uint8Array([...out, ...bytes.slice(offset)]);
    }

    if (!PNG_METADATA_CHUNK_TYPES.has(type)) {
      out.push(...bytes.slice(offset, offset + chunkTotalLength));
    }
    offset += chunkTotalLength;
    if (type === "IEND") break;
  }

  return new Uint8Array(out);
}

// JPEG APP0-APP15 (0xE0-0xEF, EXIF/XMP/ICC/Photoshop-IPTC all live here) and
// COM (0xFE) segments carry only metadata. SOS (0xDA) starts entropy-coded
// scan data — everything after it is compressed pixel bytes with FF-byte
// stuffing, never a marker to parse; stop scanning there and keep the rest
// verbatim.
const JPEG_METADATA_MARKERS = new Set([
  0xe0, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xeb, 0xec, 0xed, 0xee, 0xef, 0xfe,
]);

function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  const out: number[] = [0xff, 0xd8]; // SOI
  let offset = 2;

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      // Not a marker where we expected one — malformed; keep the rest as-is.
      return new Uint8Array([...out, ...bytes.slice(offset)]);
    }
    const marker = bytes[offset + 1] ?? 0;
    if (marker === 0xda) {
      // Start of scan — copy everything remaining untouched.
      return new Uint8Array([...out, ...bytes.slice(offset)]);
    }
    if (marker === 0xd9) {
      // EOI with no scan data (degenerate/empty image) — copy and stop.
      out.push(0xff, 0xd9);
      offset += 2;
      continue;
    }
    const segmentLength = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0); // includes the 2 length bytes
    const segmentTotal = 2 + segmentLength; // marker(2) + length+data(segmentLength)

    if (!JPEG_METADATA_MARKERS.has(marker)) {
      out.push(...bytes.slice(offset, offset + segmentTotal));
    }
    offset += segmentTotal;
  }

  return new Uint8Array(out);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] ?? 0);
  return btoa(bin);
}

/** Strip identifying metadata from a base64-encoded generated image.
 *  PNG and JPEG are handled explicitly; any other/unrecognized format is
 *  returned byte-for-byte unchanged (fail open — never risk corrupting an
 *  image format this function doesn't understand). */
export function stripImageMetadata(base64: string): string {
  if (!base64) return base64;
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(base64);
  } catch {
    return base64; // not valid base64 — not this function's problem, pass through
  }

  try {
    if (isPng(bytes)) return bytesToBase64(stripPngMetadata(bytes));
    if (isJpeg(bytes)) return bytesToBase64(stripJpegMetadata(bytes));
  } catch {
    return base64; // any parse failure — fail open, never hand back a corrupted image
  }
  return base64;
}
