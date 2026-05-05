import { outerWalls, innerWalls, OUTER_THICKNESS, INNER_THICKNESS } from "../data/floorplan";

export interface WallBox {
  minX: number; maxX: number;
  minZ: number; maxZ: number;
}

function wallToBox(from: [number, number], to: [number, number], half: number): WallBox {
  const [x1, z1] = from;
  const [x2, z2] = to;
  const isVertical = Math.abs(x2 - x1) < 0.01;
  if (isVertical) {
    return {
      minX: Math.min(x1, x2) - half,
      maxX: Math.max(x1, x2) + half,
      minZ: Math.min(z1, z2),
      maxZ: Math.max(z1, z2),
    };
  } else {
    return {
      minX: Math.min(x1, x2),
      maxX: Math.max(x1, x2),
      minZ: Math.min(z1, z2) - half,
      maxZ: Math.max(z1, z2) + half,
    };
  }
}

export function buildCollisionBoxes(): WallBox[] {
  const boxes: WallBox[] = [];
  for (const w of outerWalls) {
    boxes.push(wallToBox(w.from, w.to, OUTER_THICKNESS / 2));
  }
  for (const w of innerWalls) {
    boxes.push(wallToBox(w.from, w.to, INNER_THICKNESS / 2));
  }

  // ── Internal partitions in the Common Gallery ──────────────────
  const PART_HALF = 0.075;
  const PARTITION_XS = [3.375, 6.75, 13.5, 20.25];
  const PART_SEGS: Array<[number, number]> = [
    [1.0,  12.7],
    [15.5, 19.5],
    [22.5, 29.0],
  ];
  for (const px of PARTITION_XS) {
    for (const [z1, z2] of PART_SEGS) {
      boxes.push({ minX: px - PART_HALF, maxX: px + PART_HALF, minZ: z1, maxZ: z2 });
    }
  }

  return boxes;
}

export function collidesWithWalls(x: number, z: number, radius: number, boxes: WallBox[]): boolean {
  for (const b of boxes) {
    if (x + radius > b.minX && x - radius < b.maxX &&
        z + radius > b.minZ && z - radius < b.maxZ) {
      return true;
    }
  }
  return false;
}
