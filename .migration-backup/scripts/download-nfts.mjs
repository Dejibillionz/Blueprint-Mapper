/**
 * Downloads all 3333 NFT images from OpenSea CDN, converts AVIF → JPEG,
 * and saves them to artifacts/museum-3d/public/nft-images/{token_id}.jpg
 *
 * Run from workspace root:
 *   node scripts/download-nfts.mjs
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync, unlinkSync } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { tmpdir } from "os";
import { join } from "path";

const execFileAsync = promisify(execFile);

const OUT_DIR   = "artifacts/museum-3d/public/nft-images";
const META_PATH = "artifacts/museum-3d/public/metadata.json";
const CONCURRENCY = 30;
const QUALITY     = "5"; // ffmpeg JPEG quality scale (2=best, 31=worst; 5 ≈ 85%)

mkdirSync(OUT_DIR, { recursive: true });

const meta  = JSON.parse(readFileSync(META_PATH, "utf8"));
const total = meta.length;

let done = 0, skipped = 0, errors = 0;

function progress() {
  const pct = ((done / total) * 100).toFixed(1);
  process.stdout.write(`\r[${pct}%] ${done}/${total}  skipped=${skipped}  errors=${errors}   `);
}

async function downloadOne({ token_id, image: url }) {
  const outPath = join(OUT_DIR, `${token_id}.jpg`);

  if (existsSync(outPath)) {
    skipped++;
    done++;
    progress();
    return;
  }

  const tmpPath = join(tmpdir(), `nft_${token_id}_${process.pid}.avif`);

  try {
    // 1. Fetch raw image bytes from CDN
    const resp = await fetch(url, {
      headers: { Accept: "image/avif, image/jpeg, image/png, image/*" },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const bytes = Buffer.from(await resp.arrayBuffer());
    writeFileSync(tmpPath, bytes);

    // 2. Convert to JPEG with ffmpeg
    await execFileAsync("ffmpeg", [
      "-y",
      "-i", tmpPath,
      "-q:v", QUALITY,
      "-vf", "scale=512:-1",   // resize to max 512px wide — reduces file size
      outPath,
    ], { timeout: 30_000 });

    done++;
  } catch (err) {
    errors++;
    done++;
    // Leave outPath absent so ProximityTextureManager falls back to CDN
    if (errors <= 20) {
      console.error(`\n  ✗ ${token_id}: ${err.message?.slice(0, 120)}`);
    }
  } finally {
    try { unlinkSync(tmpPath); } catch { /* ignore */ }
    progress();
  }
}

async function worker(queue) {
  while (queue.length > 0) {
    const entry = queue.shift();
    if (entry) await downloadOne(entry);
  }
}

console.log(`Downloading ${total} NFT images  (${CONCURRENCY} workers, quality=${QUALITY})\n`);
const queue = [...meta];
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));

console.log(`\n\nDone!  ${done - errors - skipped} new,  ${skipped} already existed,  ${errors} failed`);
if (errors > 0) {
  console.log("Failed images will fall back to CDN at runtime.");
}
