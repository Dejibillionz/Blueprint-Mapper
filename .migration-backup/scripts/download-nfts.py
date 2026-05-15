"""
Download all NFT images from OpenSea CDN and save as .avif locally.
No conversion needed — modern browsers decode AVIF natively.

Run from workspace root:
  python3 scripts/download-nfts.py
"""

import json, os, sys, urllib.request, concurrent.futures, time

META  = "artifacts/museum-3d/public/metadata.json"
OUTDIR = "artifacts/museum-3d/public/nft-images"
WORKERS = 40

os.makedirs(OUTDIR, exist_ok=True)

with open(META) as f:
    meta = json.load(f)

total = len(meta)
done = skip = errors = 0
start = time.time()

def download_one(entry):
    token_id = entry["token_id"]
    url      = entry["image"]
    out_path = os.path.join(OUTDIR, f"{token_id}.avif")

    if os.path.exists(out_path) and os.path.getsize(out_path) > 1000:
        return "skip"
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0",
            "Accept": "image/avif,image/*",
        })
        with urllib.request.urlopen(req, timeout=20) as r:
            data = r.read()
        with open(out_path, "wb") as f:
            f.write(data)
        return "ok"
    except Exception as e:
        return f"err:{str(e)[:80]}"

with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as ex:
    for i, result in enumerate(ex.map(download_one, meta), 1):
        if result == "skip":   skip   += 1
        elif result == "ok":   done   += 1
        else:                  errors += 1

        if i % 200 == 0 or i == total:
            elapsed = time.time() - start
            rate    = i / elapsed
            eta     = (total - i) / rate if rate else 0
            sys.stdout.write(
                f"\r[{i}/{total}] new={done} skip={skip} err={errors}"
                f"  {rate:.0f}/s  ETA {eta:.0f}s   "
            )
            sys.stdout.flush()

print(f"\n\nDone: {done} downloaded, {skip} already existed, {errors} errors")
print(f"Total time: {time.time()-start:.0f}s")
