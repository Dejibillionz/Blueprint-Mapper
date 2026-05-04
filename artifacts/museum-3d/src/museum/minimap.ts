import { outerWalls, innerWalls, rooms } from "../data/floorplan";

const SCALE = 1.9;     // px per meter
const PAD   = 6;       // canvas padding px
const MAP_W = Math.ceil(100 * SCALE + PAD * 2);  // ~196px
const MAP_H = Math.ceil(52  * SCALE + PAD * 2);  // ~105px

// pre-convert floor plan coords → canvas px
const cx = (x: number) => PAD + x * SCALE;
const cz = (z: number) => PAD + z * SCALE;

export { MAP_W, MAP_H };

export function drawMinimap(
  canvas: HTMLCanvasElement,
  playerX: number,
  playerZ: number,
  playerYaw: number,
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

  // Player dot
  const px = cx(playerX);
  const pz = cz(playerZ);

  // Direction cone
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

  // Dot
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
