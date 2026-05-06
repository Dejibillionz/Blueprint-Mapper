#!/usr/bin/env python3
"""
fetch_nfts.py — Fetch 3,333 NFTs from OpenSea and build metadata.json
for the Museum Genesis 3D Walker.

Usage:
    python fetch_nfts.py

Requires:
    OPENSEA_API_KEY environment variable (set in Replit Secrets).

Output:
    artifacts/museum-3d/public/metadata.json
"""

import json
import os
import sys
import time

import requests

COLLECTION_SLUG = "the-10k-squad-350905768"
TARGET_COUNT = 3333
PAGE_LIMIT = 200
MAX_RETRIES = 3
OUTPUT_PATH = "artifacts/museum-3d/public/metadata.json"

ROOM_RANGES = [
    (0, 10, 4),       # indices 0–10   → room 4 (Platinum Vault, 11 NFTs)
    (11, 65, 3),      # indices 11–65  → room 3 (Rare Collection, 55 NFTs)
    (66, 365, 2),     # indices 66–365 → room 2 (Uncommon Wing, 300 NFTs)
    (366, 3332, 1),   # indices 366–3332 → room 1 (Common Gallery, 2967 NFTs)
]


def get_room(index: int) -> tuple[int, int]:
    for start, end, room in ROOM_RANGES:
        if start <= index <= end:
            return room, index - start
    return 1, index - 366


def fetch_all_nfts(api_key: str) -> list[dict]:
    base_url = f"https://api.opensea.io/api/v2/collection/{COLLECTION_SLUG}/nfts"
    headers = {
        "accept": "application/json",
        "x-api-key": api_key,
    }

    nfts: list[dict] = []
    cursor: str | None = None
    page = 0

    print(f"Fetching NFTs from collection '{COLLECTION_SLUG}'...")

    while len(nfts) < TARGET_COUNT:
        params: dict = {"limit": PAGE_LIMIT}
        if cursor:
            params["next"] = cursor

        for attempt in range(1, MAX_RETRIES + 1):
            resp = requests.get(base_url, headers=headers, params=params, timeout=30)

            if resp.status_code == 200:
                break
            elif resp.status_code == 429:
                wait = 2 ** attempt
                print(f"  Rate limited (429). Waiting {wait}s before retry {attempt}/{MAX_RETRIES}...")
                time.sleep(wait)
            else:
                print(f"  ERROR: HTTP {resp.status_code} — {resp.text[:200]}", file=sys.stderr)
                sys.exit(1)
        else:
            print("  ERROR: Max retries exceeded on rate limit.", file=sys.stderr)
            sys.exit(1)

        data = resp.json()
        batch: list[dict] = data.get("nfts", [])
        cursor = data.get("next")

        if not batch:
            break

        nfts.extend(batch)
        page += 1
        print(f"  Page {page:3d}: fetched {len(batch):3d} NFTs  (total so far: {len(nfts)})")

        if not cursor:
            print("  No more pages from API.")
            break

        time.sleep(0.3)

    return nfts


def build_metadata(raw_nfts: list[dict]) -> list[dict]:
    def rarity_rank(nft: dict) -> int:
        rarity = nft.get("rarity") or {}
        rank = rarity.get("rank")
        return rank if isinstance(rank, int) else 999_999

    sorted_nfts = sorted(raw_nfts, key=rarity_rank)

    metadata: list[dict] = []
    for idx, nft in enumerate(sorted_nfts):
        rarity = nft.get("rarity") or {}
        rank = rarity.get("rank")
        room, room_index = get_room(idx)

        metadata.append({
            "index": idx,
            "token_id": str(nft.get("identifier", "")),
            "name": nft.get("name") or f"#{nft.get('identifier', idx)}",
            "image": nft.get("image_url") or "",
            "rarity_rank": rank if isinstance(rank, int) else None,
            "room": room,
            "room_index": room_index,
        })

    return metadata


def main() -> None:
    api_key = os.environ.get("OPENSEA_API_KEY", "")
    if not api_key:
        print(
            "ERROR: OPENSEA_API_KEY is not set.\n"
            "Add it in Replit Secrets, then re-run this script.",
            file=sys.stderr,
        )
        sys.exit(1)

    raw_nfts = fetch_all_nfts(api_key)

    if len(raw_nfts) < TARGET_COUNT:
        print(
            f"\nERROR: Only {len(raw_nfts)} NFTs returned by the API "
            f"(expected {TARGET_COUNT}). Aborting — metadata.json NOT written.",
            file=sys.stderr,
        )
        sys.exit(1)

    if len(raw_nfts) > TARGET_COUNT:
        print(f"\nNote: Got {len(raw_nfts)} NFTs; trimming to {TARGET_COUNT}.")
        raw_nfts = raw_nfts[:TARGET_COUNT]

    print(f"\nSorting {len(raw_nfts)} NFTs by rarity rank...")
    metadata = build_metadata(raw_nfts)

    room_counts = {1: 0, 2: 0, 3: 0, 4: 0}
    for entry in metadata:
        room_counts[entry["room"]] += 1

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)

    print(f"\nDone! Wrote {len(metadata)} NFTs to {OUTPUT_PATH}")
    print(f"  Room 4 (Platinum): {room_counts[4]:5d} NFTs  [indices   0–10]")
    print(f"  Room 3 (Rare):     {room_counts[3]:5d} NFTs  [indices  11–65]")
    print(f"  Room 2 (Uncommon): {room_counts[2]:5d} NFTs  [indices  66–365]")
    print(f"  Room 1 (Common):   {room_counts[1]:5d} NFTs  [indices 366–3332]")


if __name__ == "__main__":
    main()
