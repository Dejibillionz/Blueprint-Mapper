import { outerWalls, innerWalls, rooms } from "../data/floorplan";

const SCALE = 1.9;
const PAD   = 6;
const MAP_W = Math.ceil(100 * SCALE + PAD * 2);
const MAP_H = Math.ceil(52  * SCALE + PAD * 2);

const cx = (x: number) => PAD + x * SCALE;
const cz = (z: number) => PAD + z * SCALE;

export { MAP_W, MAP_H };

// Short labels drawn at each room's visual centre (world coords)
const ROOM_LABELS: Array<{ label: string; wx: number; wz: number; size: number }> = [
  { label: "Common",    wx: 13.5, wz: 15.5, size: 5.5 },
  { label: "Uncommon",  wx: 40.0, wz: 13.0, size: 5.0 },
  { label: "Rare",      wx: 64.0, wz: 13.0, size: 5.5 },
  { label: "Legendary", wx: 88.5, wz: 13.0, size: 5.0 },
  { label: "Corridor",  wx: 52.0, wz: 26.0, size: 4.5 },
  { label: "Entrance",  wx: 40.5, wz: 40.5, size: 4.5 },
];

export function drawMinimap(
  canvas: HTMLCanvasElement,
  playerX: number,
  playerZ: number,
  playerYaw: number,
  guideX?: number,
  guideZ?: number,
  guideYaw?: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background
  ctx.fillStyle = "rgba(8,8,14,0.88)";
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, canvas.height, 6);
  ctx.fill();

  // Room fills
  for (const room of rooms) {
    ctx.fillStyle = `#${room.color.toString(16).padStart(6, "0")}88`;
    ctx.fillRect(cx(room.x), cz(room.y), room.width * SCALE, room.height * SCALE);
  }

  // Room name labels
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const { label, wx, wz, size } of ROOM_LABELS) {
    ctx.font = `bold ${size}px sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.40)";
    ctx.fillText(label, cx(wx), cz(wz));
  }

  // Outer walls
  ctx.strokeStyle = "#c8bfad";
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  for (const w of outerWalls) {
    ctx.beginPath();
    ctx.moveTo(cx(w.from[0]), cz(w.from[1]));
    ctx.lineTo(cx(w.to[0]), cz(w.to[1]));
    ctx.stroke();
  }

  // Inner walls
  ctx.strokeStyle = "#9a9490";
  ctx.lineWidth = 1;
  for (const w of innerWalls) {
    ctx.beginPath();
    ctx.moveTo(cx(w.from[0]), cz(w.from[1]));
    ctx.lineTo(cx(w.to[0]), cz(w.to[1]));
    ctx.stroke();
  }

  // ── Guide marker ──────────────────────────────────────────────
  if (guideX !== undefined && guideZ !== undefined) {
    const gx = cx(guideX);
    const gz = cz(guideZ);
    const t  = Date.now() / 600;
    const pulse = 0.45 + 0.3 * Math.sin(t);

    // Outer glow ring (pulsing)
    ctx.beginPath();
    ctx.arc(gx, gz, 5 + 3 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 96, 16, ${0.18 + 0.12 * pulse})`;
    ctx.fill();

    // Direction arrow
    if (guideYaw !== undefined) {
      ctx.save();
      ctx.translate(gx, gz);
      ctx.rotate(guideYaw + Math.PI);
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(-3, 2);
      ctx.lineTo(3, 2);
      ctx.closePath();
      ctx.fillStyle = "rgba(255,140,50,0.9)";
      ctx.fill();
      ctx.restore();
    }

    // Core dot
    ctx.beginPath();
    ctx.arc(gx, gz, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = "#FF6010";
    ctx.fill();
    ctx.strokeStyle = "#FFD580";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Flame label
    ctx.font = "bold 7px sans-serif";
    ctx.fillStyle = "rgba(255,200,100,0.85)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("▲", gx, gz - 8);
  }

  // ── Player dot ────────────────────────────────────────────────
  const px = cx(playerX);
  const pz = cz(playerZ);

  ctx.save();
  ctx.translate(px, pz);
  ctx.rotate(playerYaw + Math.PI);
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(-4, 3);
  ctx.lineTo(4, 3);
  ctx.closePath();
  ctx.fillStyle = "rgba(99,179,237,0.9)";
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(px, pz, 3, 0, Math.PI * 2);
  ctx.fillStyle = "#63b3ed";
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Border
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(0.5, 0.5, canvas.width - 1, canvas.height - 1, 6);
  ctx.stroke();
}
