# 10K Squad Museum — 3D Walker

A first-person 3D museum experience showcasing the full 3333 NFT collection across rare, uncommon, and legendary galleries on the Monad blockchain.

## Run & Operate

- `pnpm --filter @workspace/museum-3d run dev` — run the 3D museum frontend
- `pnpm --filter @workspace/museum-3d run generate-facts` — regenerate facts from metadata.json
- `pnpm run typecheck` — full typecheck across all packages

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Three.js
- 3D: Three.js with custom first-person controls, postprocessing (SSAO, Bloom)
- Styling: Tailwind CSS v4, shadcn/ui

## Where things live

- `artifacts/museum-3d/src/museum/` — 3D scene, gallery builders, collision, controls
- `artifacts/museum-3d/src/data/` — floorplan, partners, generated facts
- `artifacts/museum-3d/src/pages/MuseumWalker.tsx` — main page component
- `artifacts/museum-3d/public/` — NFT images, 3D models, textures, metadata

## Architecture decisions

- DiscordPortal is a stub (original file was not in the Vercel export); safe to extend.
- Facts are generated at build/dev time via `scripts/generate-facts.mjs` from `public/metadata.json`.
- Service worker (`sw.js`) is included for offline/PWA support.

## Product

- First-person 3D museum walkthrough of 3333 10K Squad NFTs
- Four rarity tiers: Common, Uncommon, Rare, Legendary/Platinum
- Partner board, team board, arcade room, ambient audio, receptionist NPC
- Minimap, proximity-based texture loading, animated doors

## Gotchas

- Run `pnpm --filter @workspace/museum-3d run generate-facts` after updating `public/metadata.json`
- WebGL required — the app shows a graceful fallback if WebGL is unavailable
- `@assets` alias in vite.config resolves to `attached_assets/` at the workspace root

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
