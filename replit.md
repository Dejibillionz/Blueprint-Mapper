# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Museum Genesis 3D Walker (`artifacts/museum-3d`)

React + Vite + Three.js first-person 3D museum for the "Museum Genesis: 3333 NFT Collection".

### Key Files
- `src/museum/MuseumScene.ts` — scene setup (walls, floors, ceiling, lights, frame meshes). Returns `{ frameMeshes, commonGalleryMesh, commonNFTs }`.
- `src/museum/CommonGallery.ts` — spawns all **2967 Common Gallery placeholder frames** using `THREE.InstancedMesh` on the 4 boundary walls + 4 internal N-S partitions (x = 3.375, 6.75, 13.5, 20.25). Each partition has navigation gaps at z = 13→15.5 and z = 19.5→22.5 aligned to the room doors. Frame slot: 0.60 m wide × 0.46 m tall, 7 rows. When NFT metadata is provided, update `commonNFTs` array entries with `imageUrl` and call `buildCommonGallery` again (or inject per-instance colour via `instancedMesh.setColorAt`).
- `src/museum/collision.ts` — AABB collision boxes for all walls + partition segments.
- `src/museum/minimap.ts` — 2D canvas minimap overlay.
- `src/museum/AmbientAudio.ts` — 9-room soundscape system with crossfade.
- `src/pages/MuseumWalker.tsx` — React component, animate loop, proximity hover panel, zoom overlay, instanced-mesh raycasting.
- `src/data/floorplan.ts` — room/wall definitions.

### Room Layout Summary
- **room_1** Common Gallery (x=0–27, z=0–31): 2967 instanced frames on 4 walls + 4 partitions
- **room_2** Uncommon Wing (x=29–51, z=4–22): 300 instanced frames
- **room_3** Rare Collection (x=54–74, z=4–22): 56 instanced frames, all 4 walls, FW=2.28m × FH=1.66m
- **room_4** Platinum Vault (x=77–100, z=4–22)
- **room_5** Diamond Sanctum (x=78–88, z=22–27)
- **legendary_foyer** (x=77–100, z=30–40): antechamber — D6 door at x=84–90, z=30
- **room_legendary** Legendary Gallery (x=77–100, z=40–52): D7 grand door at x=84–92, z=40

### NFT Metadata Integration (future)
To replace placeholder frames with real NFT images:
1. Update `CommonNFT[]` entries in `CommonGallery.ts` with real `title`, `artist`, `imageUrl`.
2. Build a texture atlas from the 2967 images and set `artMesh.setColorAt(i, color)` per instance, or switch to per-instance `CanvasTexture` for a full image per frame.
3. The `instanceId` from raycasting directly maps to the NFT index.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
