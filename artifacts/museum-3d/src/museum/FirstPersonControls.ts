import * as THREE from "three";
import { PLAYER_RADIUS } from "../data/floorplan";
import { WallBox, collidesWithWalls } from "./collision";

const MOVE_SPEED = 7;
const EYE_HEIGHT = 1.7;
const MIN_PITCH = -Math.PI / 3;
const MAX_PITCH = Math.PI / 3;

export class FirstPersonControls {
  camera: THREE.PerspectiveCamera;
  domElement: HTMLElement;
  isLocked = false;
  collisionBoxes: WallBox[] = [];

  private yaw = 0;
  private pitch = 0;
  private keys: Record<string, boolean> = {};

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys[e.code] = true;
    e.preventDefault();
  };
  private onKeyUp = (e: KeyboardEvent) => { this.keys[e.code] = false; };
  private onMouseMove = (e: MouseEvent) => {
    if (!this.isLocked) return;
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

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement, collisionBoxes: WallBox[]) {
    this.camera = camera;
    this.domElement = domElement;
    this.collisionBoxes = collisionBoxes;

    // Start at the museum entrance, facing north into the building
    this.camera.position.set(41, EYE_HEIGHT, 43);
    this.yaw = 0; // facing north (-Z) toward the museum
    this.pitch = 0;

    document.addEventListener("pointerlockchange", this.onLockChange);
    document.addEventListener("keydown", this.onKeyDown, { passive: false });
    document.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("mousemove", this.onMouseMove);
  }

  requestLock() {
    this.domElement.requestPointerLock();
  }

  update(delta: number) {
    if (!this.isLocked) return;

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const dir = new THREE.Vector3();
    if (this.keys["KeyW"] || this.keys["ArrowUp"]) dir.add(forward);
    if (this.keys["KeyS"] || this.keys["ArrowDown"]) dir.sub(forward);
    if (this.keys["KeyA"] || this.keys["ArrowLeft"]) dir.sub(right);
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
    document.removeEventListener("pointerlockchange", this.onLockChange);
    document.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("mousemove", this.onMouseMove);
  }
}
