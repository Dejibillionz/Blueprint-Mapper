import * as THREE from "three";
import { PLAYER_RADIUS } from "../data/floorplan";
import { WallBox, collidesWithWalls } from "./collision";

const MOVE_SPEED = 7;
const EYE_HEIGHT = 1.7;
const MIN_PITCH = -Math.PI / 3;
const MAX_PITCH = Math.PI / 3;
const TOUCH_LOOK_SENS = 0.0022;

export class FirstPersonControls {
  camera: THREE.PerspectiveCamera;
  domElement: HTMLElement;
  isLocked = false;
  isTouch: boolean;
  /** When true, movement and look inputs are ignored (e.g. receptionist panel is open). */
  suspended = false;
  collisionBoxes: WallBox[] = [];

  private yaw = 0;
  private pitch = 0;
  private keys: Record<string, boolean> = {};

  // Touch movement — set each frame by the virtual joystick
  private touchMoveX = 0;
  private touchMoveZ = 0;

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (this.suspended) return;
    this.keys[e.code] = true;
    e.preventDefault();
  };
  private onKeyUp = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    this.keys[e.code] = false;
  };
  private onMouseMove = (e: MouseEvent) => {
    if (!this.isLocked || this.suspended) return;
    const sens = 0.002;
    this.yaw -= e.movementX * sens;
    this.pitch -= e.movementY * sens;
    this.pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, this.pitch));
  };
  private onLockChange = () => {
    this.isLocked = document.pointerLockElement === this.domElement;
  };

  getYaw(): number { return this.yaw; }
  getPitch(): number { return this.pitch; }
  setYaw(v: number) { this.yaw = v; }
  setPitch(v: number) { this.pitch = v; }

  /** Set joystick movement direction each frame. dx = strafe [-1,1], dz = screen-up/down [-1,1]. */
  setTouchMove(dx: number, dz: number) {
    this.touchMoveX = dx;
    this.touchMoveZ = dz;
  }

  /** Apply a look delta from a touch drag. dx/dy are raw pixel deltas. */
  setTouchLook(dx: number, dy: number) {
    if (this.suspended) return;
    this.yaw   -= dx * TOUCH_LOOK_SENS;
    this.pitch -= dy * TOUCH_LOOK_SENS;
    this.pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, this.pitch));
  }

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement, collisionBoxes: WallBox[]) {
    this.camera = camera;
    this.domElement = domElement;
    this.collisionBoxes = collisionBoxes;
    this.isTouch = "ontouchstart" in window;

    // Start on the plaza outside, facing north toward the museum entrance
    this.camera.position.set(41, EYE_HEIGHT, 68);
    this.yaw = 0; // facing north (-Z) — museum facade straight ahead
    this.pitch = 0;

    document.addEventListener("keydown", this.onKeyDown, { passive: false });
    document.addEventListener("keyup", this.onKeyUp);

    if (this.isTouch) {
      // Touch mode: always active, no pointer lock needed
      this.isLocked = true;
    } else {
      document.addEventListener("pointerlockchange", this.onLockChange);
      document.addEventListener("mousemove", this.onMouseMove);
    }
  }

  requestLock() {
    if (this.isTouch) return; // no-op on touch devices
    this.domElement.requestPointerLock();
  }

  update(delta: number) {
    if (this.suspended) return;

    if (this.isTouch) {
      // Touch movement via virtual joystick
      const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const right   = new THREE.Vector3( Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const dir = new THREE.Vector3();
      dir.addScaledVector(right, this.touchMoveX);
      dir.addScaledVector(forward, -this.touchMoveZ); // joystick up (negative screen y) = forward
      if (dir.length() > 0) dir.normalize();

      const step = dir.clone().multiplyScalar(MOVE_SPEED * delta);
      const cur = this.camera.position;
      const nx = cur.x + step.x;
      if (!collidesWithWalls(nx, cur.z, PLAYER_RADIUS, this.collisionBoxes)) cur.x = nx;
      const nz = cur.z + step.z;
      if (!collidesWithWalls(cur.x, nz, PLAYER_RADIUS, this.collisionBoxes)) cur.z = nz;
      cur.y = EYE_HEIGHT;
      this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, "YXZ"));
      return;
    }

    // Desktop pointer-lock movement
    if (!this.isLocked) return;

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const dir = new THREE.Vector3();
    if (this.keys["KeyW"] || this.keys["ArrowUp"])    dir.add(forward);
    if (this.keys["KeyS"] || this.keys["ArrowDown"])  dir.sub(forward);
    if (this.keys["KeyA"] || this.keys["ArrowLeft"])  dir.sub(right);
    if (this.keys["KeyD"] || this.keys["ArrowRight"]) dir.add(right);

    if (dir.length() > 0) dir.normalize();

    const step = dir.clone().multiplyScalar(MOVE_SPEED * delta);
    const cur = this.camera.position;

    // Try X axis
    const nx = cur.x + step.x;
    if (!collidesWithWalls(nx, cur.z, PLAYER_RADIUS, this.collisionBoxes)) {
      cur.x = nx;
    }

    // Try Z axis
    const nz = cur.z + step.z;
    if (!collidesWithWalls(cur.x, nz, PLAYER_RADIUS, this.collisionBoxes)) {
      cur.z = nz;
    }

    cur.y = EYE_HEIGHT;

    const euler = new THREE.Euler(this.pitch, this.yaw, 0, "YXZ");
    this.camera.quaternion.setFromEuler(euler);
  }

  dispose() {
    document.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("keyup", this.onKeyUp);
    if (!this.isTouch) {
      document.removeEventListener("pointerlockchange", this.onLockChange);
      document.removeEventListener("mousemove", this.onMouseMove);
    }
  }
}
