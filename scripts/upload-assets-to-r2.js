/**
 * Upload public/ static assets to Cloudflare R2 so they can be served from the
 * CDN (R2_PUBLIC_URL) instead of bundled into the app image.
 *
 * - Keys mirror the public path exactly: public/images/x.png -> images/x.png,
 *   so a ref of "/images/x.png" maps to ${R2_PUBLIC_URL}/images/x.png.
 * - Idempotent: re-running re-uploads (overwrites) — safe.
 * - Reads R2 creds + bucket from .env (R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY
 *   / R2_ENDPOINT / R2_BUCKET).
 *
 * Usage:
 *   node scripts/upload-assets-to-r2.js            # upload everything under public/
 *   node scripts/upload-assets-to-r2.js images     # only public/images/**
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const clean = (v) => (v || "").replace(/^['"]|['"]$/g, "").trim();
const BUCKET = clean(process.env.R2_BUCKET) || "ahurasense-media";
const PUBLIC_DIR = path.join(process.cwd(), "public");
const ONLY = process.argv[2] ? process.argv[2].replace(/^\/+|\/+$/g, "") : null;

const s3 = new S3Client({
  region: "auto",
  endpoint: clean(process.env.R2_ENDPOINT),
  credentials: {
    accessKeyId: clean(process.env.R2_ACCESS_KEY_ID),
    secretAccessKey: clean(process.env.R2_SECRET_ACCESS_KEY),
  },
});

const CT = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
  ".avif": "image/avif", ".ico": "image/x-icon", ".json": "application/json",
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".txt": "text/plain",
  ".mp4": "video/mp4", ".webm": "video/webm", ".pdf": "application/pdf", ".jsonl": "application/jsonl",
};

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

async function main() {
  const root = ONLY ? path.join(PUBLIC_DIR, ONLY) : PUBLIC_DIR;
  if (!fs.existsSync(root)) { console.error("No such path:", root); process.exit(1); }

  const files = fs.statSync(root).isDirectory() ? walk(root) : [root];
  console.log(`Uploading ${files.length} files to r2://${BUCKET}  (only=${ONLY || "<all>"})`);

  let done = 0, failed = 0, bytes = 0;
  const CONCURRENCY = 12;
  let idx = 0;

  async function worker() {
    for (;;) {
      const i = idx++;
      if (i >= files.length) return;
      const file = files[i];
      const key = path.relative(PUBLIC_DIR, file).split(path.sep).join("/");
      const ext = path.extname(file).toLowerCase();
      try {
        const body = fs.readFileSync(file);
        await s3.send(new PutObjectCommand({
          Bucket: BUCKET,
          Key: key,
          Body: body,
          ContentType: CT[ext] || "application/octet-stream",
          CacheControl: "public, max-age=31536000, immutable",
        }));
        done++; bytes += body.length;
        if (done % 25 === 0 || done === files.length) {
          console.log(`  ${done}/${files.length}  (${(bytes / 1048576).toFixed(1)} MB)`);
        }
      } catch (e) {
        failed++;
        console.error(`  FAIL ${key}: ${e.name} ${e.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`\nDone. ${done} uploaded, ${failed} failed, ${(bytes / 1048576).toFixed(1)} MB total.`);
  console.log(`Public base: ${clean(process.env.R2_PUBLIC_URL) || "(set R2_PUBLIC_URL)"}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
