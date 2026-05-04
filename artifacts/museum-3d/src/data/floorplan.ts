export interface Wall {
  from: [number, number];
  to: [number, number];
  thickness?: number;
}

export interface Room {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: number;
  labelY?: number;
}

export const WALL_HEIGHT = 4;
export const WALL_THICKNESS = 0.3;

export const outerWalls: Wall[] = [
  { from: [0, 0], to: [100, 0] },
  { from: [100, 0], to: [100, 30] },
  { from: [100, 30], to: [76, 30] },
  { from: [76, 30], to: [76, 35] },
  { from: [76, 35], to: [62, 35] },
  { from: [62, 35], to: [62, 52] },
  { from: [62, 52], to: [14, 52] },
  { from: [14, 52], to: [14, 35] },
  { from: [14, 35], to: [0, 35] },
  { from: [0, 35], to: [0, 0] },
];

export const innerWalls: Wall[] = [
  { from: [26, 6], to: [26, 30] },
  { from: [29, 4], to: [29, 22] },
  { from: [51, 4], to: [51, 22] },
  { from: [54, 4], to: [54, 22] },
  { from: [74, 4], to: [74, 22] },
  { from: [77, 4], to: [77, 35] },
  { from: [28, 22], to: [77, 22] },
  { from: [28, 30], to: [62, 30] },
  { from: [0, 30], to: [28, 30] },
  { from: [14, 35], to: [33, 35] },
  { from: [48, 35], to: [62, 35] },
  { from: [14, 40], to: [22, 40] },
  { from: [22, 35], to: [22, 46] },
  { from: [52, 35], to: [52, 46] },
  { from: [52, 40], to: [62, 40] },
  { from: [33, 35], to: [33, 46] },
  { from: [48, 35], to: [48, 46] },
  { from: [78, 22], to: [88, 22] },
  { from: [88, 22], to: [88, 27] },
  { from: [78, 27], to: [88, 27] },
  { from: [78, 22], to: [78, 27] },
];

export const rooms: Room[] = [
  {
    id: "room_1",
    name: "The Common Gallery\n1,111 NFTs",
    x: 2, y: 6, width: 24, height: 24,
    color: 0x1a1a2e,
  },
  {
    id: "room_2",
    name: "The Uncommon Wing\n1,000 NFTs",
    x: 29, y: 4, width: 22, height: 18,
    color: 0x16213e,
  },
  {
    id: "room_3",
    name: "The Rare Collection\n750 NFTs",
    x: 54, y: 4, width: 20, height: 18,
    color: 0x0f3460,
  },
  {
    id: "room_4",
    name: "The Platinum Vault",
    x: 77, y: 4, width: 20, height: 18,
    color: 0x533483,
  },
  {
    id: "room_5",
    name: "The Diamond Sanctum\n28 NFTs",
    x: 78, y: 22, width: 10, height: 5,
    color: 0x950740,
  },
  {
    id: "corridor",
    name: "The Rarity Galleries",
    x: 28, y: 22, width: 48, height: 8,
    color: 0x222233,
  },
  {
    id: "entrance_hall",
    name: "Entrance Hall\nNav Hub",
    x: 33, y: 35, width: 15, height: 11,
    color: 0x1f4068,
  },
  {
    id: "ticket_info",
    name: "Ticket / Info",
    x: 14, y: 40, width: 8, height: 6,
    color: 0x2d4a22,
  },
  {
    id: "gift_shop",
    name: "Gift Shop",
    x: 52, y: 40, width: 10, height: 6,
    color: 0x4a2d22,
  },
];
