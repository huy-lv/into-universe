/** Keyboard + pointer-lock mouse input shared across scenes. */
export class Input {
  private keys = new Set<string>();
  private pressedOnce = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheelDelta = 0;
  locked = false;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => {
      if (!e.repeat) {
        this.keys.add(e.code);
        this.pressedOnce.add(e.code);
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());

    document.addEventListener("mousemove", (e) => {
      if (this.locked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    window.addEventListener("wheel", (e) => {
      this.wheelDelta += e.deltaY;
    }, { passive: true });

    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === this.canvas;
    });
    // click anywhere re-locks the mouse (pointer observables need attachControl)
    this.canvas.addEventListener("click", () => this.requestPointerLock());
  }

  requestPointerLock(): void {
    if (!this.locked) this.canvas.requestPointerLock();
  }

  exitPointerLock(): void {
    if (this.locked) document.exitPointerLock();
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** True only on the frame the key went down. */
  wasPressed(code: string): boolean {
    return this.pressedOnce.has(code);
  }

  /** Call at end of each frame. */
  endFrame(): void {
    this.pressedOnce.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheelDelta = 0;
  }
}
