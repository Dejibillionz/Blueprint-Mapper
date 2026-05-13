export interface Wall {
  from: [number, number];
  to: [number, number];
  thickness?: number;
  isOuter?: boolean;
}

export interface Room {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: number;
}

export interface FrameData {
  id: number;
  title: string;
  artist: string;
  position: [number, number, number];
  rotationY: number;
  color: number;
  imageUrl?: string;
}

export const WALL_HEIGHT = 4;
export const OUTER_THICKNESS = 0.5;
export const INNER_THICKNESS = 0.25;
export const PLAYER_RADIUS = 0.45;
export const DOOR_WIDTH = 2.0;
export const DOOR_HEIGHT = 2.4;

export const outerWalls: Wall[] = [
  { from: [0, 0],    to: [100, 0],  isOuter: true },
  { from: [100, 0],  to: [100, 52], isOuter: true }, // east wall — extended south to legendary room
  { from: [100, 52], to: [62, 52],  isOuter: true }, // new south wall of east extension
  // South outer wall split at grand entrance (x=39-43, 4 m wide to match door)
  { from: [62, 52], to: [43, 52], isOuter: true },
  { from: [39, 52], to: [14, 52], isOuter: true },
  { from: [14, 52], to: [14, 35], isOuter: true },
  { from: [14, 35], to: [0, 35],  isOuter: true },
  { from: [0, 35],  to: [0, 0],   isOuter: true },
];

export const innerWalls: Wall[] = [
  // -- Room 1 east wall split for 2 doors (D1 upper z=13-15, D1 lower z=20-22)
  { from: [26, 0], to: [26, 13] },
  { from: [26, 15], to: [26, 20] },
  { from: [26, 22], to: [26, 30] },

  // -- Dividers between upper rooms — extended to meet outer north wall at z=0
  { from: [29, 0], to: [29, 22] },
  { from: [51, 0], to: [51, 22] },
  { from: [54, 0], to: [54, 22] },
  { from: [74, 0], to: [74, 22] },

  // -- North inner walls for rooms 2, 3, 4 (rooms start at z=4, outer wall at z=0)
  { from: [29, 4], to: [51, 4] },   // room_2 north wall
  { from: [54, 4], to: [74, 4] },   // room_3 north wall
  { from: [77, 4], to: [100, 4] },  // room_4 north wall

  // -- Room 4 west wall (gap at z=24-26 = vault entrance from rarity galleries)
  { from: [77, 4],  to: [77, 24] },
  { from: [77, 26], to: [77, 30] },

  // -- Rarity corridor NORTH wall split for D2 (x=38-42) and D3 (x=62-66)
  { from: [28, 22], to: [38, 22] },
  { from: [42, 22], to: [62, 22] },
  { from: [66, 22], to: [77, 22] },

  // -- Rarity corridor SOUTH wall split for passage to entrance (x=37-45)
  { from: [28, 30], to: [37, 30] },
  { from: [45, 30], to: [62, 30] },

  // -- Room 1 south / corridor west
  { from: [0, 30], to: [26, 30] },

  // -- Entrance hall bounding walls
  { from: [14, 35], to: [33, 35] },
  { from: [48, 35], to: [62, 35] },
  { from: [33, 35], to: [33, 46] },
  { from: [48, 35], to: [48, 46] },

  // -- Ticket/Info room
  { from: [14, 40], to: [22, 40] },
  { from: [22, 35], to: [22, 46] },

  // -- Gift shop
  { from: [52, 35], to: [52, 46] },
  { from: [52, 40], to: [62, 40] },

  // -- Corridor south wall east section (seals arcade north side — solid, no gap)
  { from: [62, 30], to: [100, 30] },

  // -- Arcade west wall — door gap at z=41–43 (2 m opening from entrance-hub zone)
  { from: [62, 30], to: [62, 41] },
  { from: [62, 43], to: [62, 52] },
];

export const rooms: Room[] = [
  { id: "room_1", name: "The Common Gallery\n2,967 NFTs", x: 0, y: 0, width: 27, height: 31, color: 0x1a1a2e },
  { id: "room_2", name: "The Uncommon Wing\n300 NFTs", x: 29, y: 4, width: 22, height: 18, color: 0x16213e },
  { id: "room_3", name: "The Rare Collection\n55 NFTs", x: 54, y: 4, width: 20, height: 18, color: 0x0f3460 },
  { id: "room_4", name: "The Legendary Vault\n11 NFTs", x: 77, y: 4, width: 23, height: 18, color: 0x533483 },
  { id: "corridor", name: "The Rarity Galleries", x: 28, y: 22, width: 48, height: 8, color: 0x222233 },
  { id: "entrance_hall", name: "Entrance Hall\nNav Hub", x: 33, y: 35, width: 15, height: 11, color: 0x1f4068 },
  { id: "ticket_info", name: "Ticket / Info", x: 14, y: 40, width: 8, height: 6, color: 0x2d4a22 },
  { id: "gift_shop", name: "Gift Shop", x: 52, y: 40, width: 10, height: 6, color: 0x4a2d22 },
  { id: "arcade",    name: "Arcade",    x: 62, y: 30, width: 38, height: 22, color: 0x0a0a1e },
];

// rotationY convention for buildFrameMeshes:
//   art protrudes in direction (sin rotY, 0, cos rotY) — use:
//   rotY=0      → facing south (+z), north wall of a room
//   rotY=Math.PI → facing north (-z), south wall of a room
//   rotY=Math.PI/2  → facing east (+x), west wall of a room
//   rotY=-Math.PI/2 → facing west (-x), east wall of a room

const PI = Math.PI;

export const frames: FrameData[] = [
  // ── Rarity Corridor north wall  z=22 → facing south (rotY=0) ──────────────
  // Central cluster x=46.5–58.5 — 5 artwork frames, 3 m center-to-center
  { id:  7, title: "Magma Liquid Staking", artist: "10K Squad x Magma",         position: [46.5, 2.0, 22.14], rotationY: 0,  color: 0xff6622, imageUrl: "/corridor/magma.png"         },
  { id:  8, title: "Haha Wallet",          artist: "10K Squad x Haha Wallet",   position: [49.5, 2.0, 22.14], rotationY: 0,  color: 0x9966ff, imageUrl: "/corridor/haha-wallet.png"   },
  { id:  9, title: "Lucky Monkeys",        artist: "10K Squad x Lucky Monkeys", position: [52.5, 2.0, 22.14], rotationY: 0,  color: 0xffcc44, imageUrl: "/corridor/lucky-monkeys.webp" },
  { id: 10, title: "Rarebet Sports",       artist: "10K Squad x Rarebet",       position: [55.5, 2.0, 22.14], rotationY: 0,  color: 0x88ee22, imageUrl: "/corridor/rarebet.webp"       },
  { id: 11, title: "Alloca",               artist: "10K Squad x Alloca",        position: [58.5, 2.0, 22.14], rotationY: 0,  color: 0x44bb55, imageUrl: "/corridor/alloca.webp"        },
  // Outer north segments — artwork frames
  { id: 17, title: "Happy Anniversary",    artist: "10K Squad",                  position: [31.0, 2.0, 22.14], rotationY: 0,  color: 0xffaacc, imageUrl: "/corridor/anniversary.jpg"  },
  { id: 19, title: "Space Squad",          artist: "10K Squad",                  position: [71.0, 2.0, 22.14], rotationY: 0,  color: 0x4488ff, imageUrl: "/corridor/space-squad.webp" },

  // ── Rarity Corridor south wall  z=30 → facing north (rotY=π) ─────────────
  // Central cluster x=46.5–58.5 — 5 artwork frames, 3 m center-to-center
  // (south wall solid segment runs x=45–62, so x=46.5 is safely clear of the gap)
  { id: 12, title: "Blocknads",            artist: "10K Squad x Blocknads",     position: [46.5, 2.0, 29.86], rotationY: PI, color: 0xcc44cc, imageUrl: "/corridor/blocknads.webp"     },
  { id: 13, title: "Monadverse",           artist: "10K Squad x Monadverse",    position: [49.5, 2.0, 29.86], rotationY: PI, color: 0xff66aa, imageUrl: "/corridor/monadverse.webp"   },
  { id: 14, title: "No More Lonely Life",  artist: "10K Squad x NMLL",          position: [52.5, 2.0, 29.86], rotationY: PI, color: 0x55cc88, imageUrl: "/corridor/no-more-lonely.webp"},
  { id: 15, title: "Nomads",               artist: "10K Squad x Nomads",        position: [55.5, 2.0, 29.86], rotationY: PI, color: 0xee5599, imageUrl: "/corridor/nomads.webp"        },
  { id: 16, title: "Drake Exchange",       artist: "10K Squad x Drake",         position: [58.5, 2.0, 29.86], rotationY: PI, color: 0x44aaee, imageUrl: "/corridor/drake-exchange.png" },
  // Outer south segments — artwork frames (segment D: x=28–37)
  { id: 18, title: "Community",            artist: "10K Squad",                  position: [31.5, 2.0, 29.86], rotationY: PI, color: 0x88ccff, imageUrl: "/corridor/community.webp"   },
  { id: 20, title: "Genesis Egg",          artist: "10K Squad",                  position: [36.0, 2.0, 29.86], rotationY: PI, color: 0xffaadd, imageUrl: "/corridor/genesis-egg.jpg"  },
];
