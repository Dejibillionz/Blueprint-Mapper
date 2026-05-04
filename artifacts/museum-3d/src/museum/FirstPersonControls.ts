import * as THREE from "three";

const MOVE_SPEED = 8;
const EYE_HEIGHT = 1.7;
const MIN_PITCH = -Math.PI / 3;
const MAX_PITCH = Math.PI / 3;

export class FirstPersonControls {
  camera: THREE.PerspectiveCamera;
  domElement: HTMLElement;
  isLocked = false;

  private yaw = 0;
  private pitch = 0;
  private keys: Record<string, boolean> = {};
  private velocity = new THREE.Vector3();
  private direction = new THREE.Vector3();

  private onKeyDown = (e: KeyboardEvent) => { this.keys[e.code] = true; };
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

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.camera.position.set(41, EYE_HEIGHT, 42);
    this.yaw = 0;
    this.pitch = 0;

    domElement.addEventListener("click", () => domElement.requestPointerLock());
    document.addEventListener("pointerlockchange", this.onLockChange);
    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("mousemove", this.onMouseMove);
  }

  update(delta: number) {
    const forward = new THREE.Vector3(
      -Math.sin(this.yaw),
      0,
      -Math.cos(this.yaw)
    );
    const right = new THREE.Vector3(
      Math.cos(this.yaw),
      0,
      -Math.sin(this.yaw)
    );

    this.direction.set(0, 0, 0);
    if (this.keys["KeyW"] || this.keys["ArrowUp"]) this.direction.add(forward);
    if (this.keys["KeyS"] || this.keys["ArrowDown"]) this.direction.sub(forward);
    if (this.keys["KeyA"] || this.keys["ArrowLeft"]) this.direction.sub(right);
    if (this.keys["KeyD"] || this.keys["ArrowRight"]) this.direction.add(right);

    if (this.direction.length() > 0) this.direction.normalize();

    this.velocity.copy(this.direction).multiplyScalar(MOVE_SPEED * delta);
    this.camera.position.add(this.velocity);
    this.camera.position.y = EYE_HEIGHT;

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
