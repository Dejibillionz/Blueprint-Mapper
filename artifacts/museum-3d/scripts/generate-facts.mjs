#!/usr/bin/env node
/**
 * generate-facts.mjs
 * Reads public/metadata.json and derives fun facts for the receptionist,
 * then writes them to src/data/generatedFacts.ts.
 * Runs automatically before `dev` and `build` via package.json scripts.
 *
 * When the metadata includes trait arrays (trait_type / value pairs),
 * this script also derives trait-level facts:
 *   • Rarest individual trait
 *   • Most common individual trait
 *   • Rarest two-trait combination
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const metaPath = join(__dirname, "../public/metadata.json");
const outPath  = join(__dirname, "../src/data/generatedFacts.ts");

const MAX_FACT_LEN = 120;

/** Truncate a fact to MAX_FACT_LEN characters without cutting mid-word. */
function clamp(str) {
  if (str.length <= MAX_FACT_LEN) return str;
  const cut = str.lastIndexOf(" ", MAX_FACT_LEN - 1);
  return str.slice(0, cut > 0 ? cut : MAX_FACT_LEN) + "…";
}

const data = JSON.parse(readFileSync(metaPath, "utf-8"));

const total = data.length;

const legendary = data.filter((d) => d.room === 4);
const rare      = data.filter((d) => d.room === 3);
const uncommon  = data.filter((d) => d.room === 2);
const common    = data.filter((d) => d.room === 1);

const legendaryCount  = legendary.length;
const rareCount       = rare.length;
const uncommonCount   = uncommon.length;
const commonCount     = common.length;

const rarePct     = ((rareCount / total) * 100).toFixed(2);
const uncommonPct = Math.round((uncommonCount / total) * 100);

const rarestNft = data.reduce((best, d) =>
  d.rarity_rank < best.rarity_rank ? d : best, data[0]);
const rarestToken = rarestNft.token_id;
const rarestScore = rarestNft.rarity_score;

const topScoreCount = data.filter((d) => d.rarity_score === rarestScore).length;

const maxScore   = Math.max(...data.map((d) => d.rarity_score));
const minScore   = Math.min(...data.map((d) => d.rarity_score));
const scoreSpread = Math.round(maxScore / minScore);

const top3 = [...data]
  .sort((a, b) => a.rarity_rank - b.rarity_rank)
  .slice(0, 3)
  .map((d) => `#${d.token_id}`)
  .join(", ");

const eliteCount = rareCount + legendaryCount;
const elitePct   = ((eliteCount / total) * 100).toFixed(1);

const facts = [
  clamp(`NFT #${rarestToken} holds rank #1 with a rarity score of ${rarestScore} — the crown jewel of the 10K Squad.`),
  clamp(`Only ${topScoreCount} of ${total.toLocaleString()} NFTs share the top rarity score of ${rarestScore}, making Legendary pieces just ${((legendaryCount / total) * 100).toFixed(2)}% of the collection.`),
  clamp(`The top 3 rarest pieces in the entire collection are ${top3} — look for them deep in the Legendary Vault.`),
  clamp(`The Rare gallery holds just ${rareCount} NFTs — only ${rarePct}% of the entire 10K Squad collection.`),
  clamp(`${uncommonCount} NFTs earned Uncommon status, roughly ${uncommonPct}% of the collection, displayed in their own museum wing.`),
  clamp(`Rarity scores span from ${minScore} to ${maxScore} — a ${scoreSpread}× spread between the most common and rarest pieces.`),
  clamp(`All ${commonCount.toLocaleString()} Common NFTs still have unique art — no two 10K Squad pieces are ever the same.`),
  clamp(`Combined, Rare and Legendary NFTs make up just ${elitePct}% of the collection — only ${eliteCount} of ${total.toLocaleString()} pieces.`),
];

// ─── Trait-level facts ────────────────────────────────────────────────────────
// Only runs when the metadata includes a `traits` array on each NFT entry.
// Expected shape: [{ trait_type: string, value: string }, …]

const hasTraits = data.some((d) => Array.isArray(d.traits) && d.traits.length > 0);

if (hasTraits) {
  // 1. Count every (trait_type, value) pair across the collection.
  /** @type {Map<string, number>} key = "trait_type::value" */
  const traitCounts = new Map();

  for (const nft of data) {
    if (!Array.isArray(nft.traits)) continue;
    for (const t of nft.traits) {
      const key = `${t.trait_type}::${t.value}`;
      traitCounts.set(key, (traitCounts.get(key) ?? 0) + 1);
    }
  }

  // Sort ascending by count so [0] = rarest, [last] = most common.
  const sorted = [...traitCounts.entries()].sort((a, b) => a[1] - b[1]);

  // ── Fact A: Rarest individual trait ────────────────────────────────────────
  if (sorted.length > 0) {
    const [rarestKey, rarestCount] = sorted[0];
    const [rarestType, rarestVal] = rarestKey.split("::");
    facts.push(clamp(
      `The rarest ${rarestType.toLowerCase()} is "${rarestVal}", appearing on just ${rarestCount} of ${total.toLocaleString()} NFTs.`
    ));
  }

  // ── Fact B: Most common individual trait ───────────────────────────────────
  if (sorted.length > 1) {
    const [commonKey, commonCount] = sorted[sorted.length - 1];
    const [commonType, commonVal] = commonKey.split("::");
    facts.push(clamp(
      `"${commonVal}" is the most popular ${commonType.toLowerCase()}, found on ${commonCount.toLocaleString()} NFTs — ${Math.round((commonCount / total) * 100)}% of the collection.`
    ));
  }

  // ── Fact C: Rarest two-trait combination ───────────────────────────────────
  // Count how many NFTs share each ordered pair of distinct trait_type values.
  /** @type {Map<string, number>} key = "typeA::valA||typeB::valB" */
  const comboCounts = new Map();

  for (const nft of data) {
    if (!Array.isArray(nft.traits) || nft.traits.length < 2) continue;
    const ts = nft.traits.slice().sort((a, b) =>
      a.trait_type.localeCompare(b.trait_type) || a.value.localeCompare(b.value)
    );
    for (let i = 0; i < ts.length; i++) {
      for (let j = i + 1; j < ts.length; j++) {
        const key = `${ts[i].trait_type}::${ts[i].value}||${ts[j].trait_type}::${ts[j].value}`;
        comboCounts.set(key, (comboCounts.get(key) ?? 0) + 1);
      }
    }
  }

  if (comboCounts.size > 0) {
    const [rarestComboKey, comboCount] = [...comboCounts.entries()]
      .sort((a, b) => a[1] - b[1])[0];
    const [partA, partB] = rarestComboKey.split("||");
    const [, valA] = partA.split("::");
    const [, valB] = partB.split("::");
    facts.push(clamp(
      `Only ${comboCount} NFT${comboCount === 1 ? "" : "s"} combine "${valA}" and "${valB}" — the rarest trait pairing in the collection.`
    ));
  }

  console.log(`[generate-facts] Derived ${facts.length - 8} trait-level fact(s) from trait metadata.`);
} else {
  console.log("[generate-facts] No trait arrays found in metadata — skipping trait-level facts.");
}

// ─── Write output ─────────────────────────────────────────────────────────────

const out = `// AUTO-GENERATED by scripts/generate-facts.mjs — do not edit by hand.
// Re-run \`pnpm --filter @workspace/museum-3d generate-facts\` to refresh.

export const DERIVED_FACTS = ${JSON.stringify(facts, null, 2)} as const;
`;

writeFileSync(outPath, out, "utf-8");
console.log(`[generate-facts] Wrote ${facts.length} derived facts → src/data/generatedFacts.ts`);
