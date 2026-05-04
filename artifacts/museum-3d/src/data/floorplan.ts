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
}

export const WALL_HEIGHT = 4;
export const OUTER_THICKNESS = 0.5;
export const INNER_THICKNESS = 0.25;
export const PLAYER_RADIUS = 0.45;
export const DOOR_WIDTH = 2.0;
export const DOOR_HEIGHT = 2.4;

export const outerWalls: Wall[] = [
  { from: [0, 0], to: [100, 0], isOuter: true },
  { from: [100, 0], to: [100, 30], isOuter: true },
  { from: [100, 30], to: [76, 30], isOuter: true },
  { from: [76, 30], to: [76, 35], isOuter: true },
  { from: [76, 35], to: [62, 35], isOuter: true },
  { from: [62, 35], to: [62, 52], isOuter: true },
  // South outer wall split at grand entrance (x=37-45)
  { from: [62, 52], to: [45, 52], isOuter: true },
  { from: [37, 52], to: [14, 52], isOuter: true },
  { from: [14, 52], to: [14, 35], isOuter: true },
  { from: [14, 35], to: [0, 35], isOuter: true },
  { from: [0, 35], to: [0, 0], isOuter: true },
];

export const innerWalls: Wall[] = [
  // -- Room 1 east wall split for 2 doors (D1 upper z=13-15, D1 lower z=20-22)
  { from: [26, 6], to: [26, 13] },
  { from: [26, 15], to: [26, 20] },
  { from: [26, 22], to: [26, 30] },

  // -- Dividers between upper rooms
  { from: [29, 4], to: [29, 22] },
  { from: [51, 4], to: [51, 22] },
  { from: [54, 4], to: [54, 22] },
  { from: [74, 4], to: [74, 22] },

  // -- Room 4 west / sanctum boundary (split: gap at z=24-26 for corridor access)
  { from: [77, 4], to: [77, 24] },
  { from: [77, 26], to: [77, 35] },

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

  // -- Diamond Sanctum walls (split north wall for D5 gap x=82-85)
  { from: [78, 22], to: [82, 22] },
  { from: [85, 22], to: [88, 22] },
  { from: [88, 22], to: [88, 27] },
  { from: [78, 27], to: [88, 27] },
  { from: [78, 22], to: [78, 27] },
];

export const rooms: Room[] = [
  { id: "room_1", name: "The Common Gallery\n1,111 NFTs", x: 0, y: 0, width: 27, height: 31, color: 0x1a1a2e },
  { id: "room_2", name: "The Uncommon Wing\n1,000 NFTs", x: 29, y: 4, width: 22, height: 18, color: 0x16213e },
  { id: "room_3", name: "The Rare Collection\n750 NFTs", x: 54, y: 4, width: 20, height: 18, color: 0x0f3460 },
  { id: "room_4", name: "The Platinum Vault", x: 77, y: 4, width: 23, height: 18, color: 0x533483 },
  { id: "room_5", name: "The Diamond Sanctum\n28 NFTs", x: 78, y: 22, width: 10, height: 5, color: 0x950740 },
  { id: "corridor", name: "The Rarity Galleries", x: 28, y: 22, width: 48, height: 8, color: 0x222233 },
  { id: "entrance_hall", name: "Entrance Hall\nNav Hub", x: 33, y: 35, width: 15, height: 11, color: 0x1f4068 },
  { id: "ticket_info", name: "Ticket / Info", x: 14, y: 40, width: 8, height: 6, color: 0x2d4a22 },
  { id: "gift_shop", name: "Gift Shop", x: 52, y: 40, width: 10, height: 6, color: 0x4a2d22 },
];

export const frames: FrameData[] = [
  {
    id: 1, title: "Genesis #0001", artist: "Origin Protocol",
    position: [8, 1.5, 6.25], rotationY: 0, color: 0x3a86ff,
  },
  {
    id: 2, title: "Genesis #0042", artist: "Cipher Arts",
    position: [16, 1.5, 6.25], rotationY: 0, color: 0xff006e,
  },
  {
    id: 3, title: "Genesis #0111", artist: "VoidCanvas",
    position: [22, 1.5, 29.75], rotationY: Math.PI, color: 0x8338ec,
  },
  {
    id: 4, title: "Uncommon #0212", artist: "NeonBrush",
    position: [29.25, 1.5, 12], rotationY: -Math.PI / 2, color: 0xfb5607,
  },
  {
    id: 5, title: "Uncommon #0333", artist: "DataSurge",
    position: [40, 1.5, 4.25], rotationY: 0, color: 0xffbe0b,
  },
  {
    id: 6, title: "Rare #0450", artist: "GridPainter",
    position: [64, 1.5, 4.25], rotationY: 0, color: 0x06d6a0,
  },
  {
    id: 7, title: "Rare #0612", artist: "PixelForge",
    position: [73.75, 1.5, 11], rotationY: Math.PI / 2, color: 0xef476f,
  },
  {
    id: 8, title: "Platinum #0750", artist: "SilverThread",
    position: [86, 1.5, 4.25], rotationY: 0, color: 0xc0c0c0,
  },
  {
    id: 9, title: "Diamond #3333", artist: "Zenith Collective",
    position: [87.75, 1.5, 24.5], rotationY: Math.PI / 2, color: 0x00b4d8,
  },
  {
    id: 10, title: "Hall of Origins", artist: "Museum Genesis",
    position: [41, 1.5, 35.25], rotationY: 0, color: 0xf77f00,
  },
];
