import { Scene, Vector3 } from "@babylonjs/core";
import { HUD } from "../ui/HUD";
import { Input } from "../core/Input";

export interface Interactable {
  /** World position to measure distance from (can be dynamic). */
  getPosition(): Vector3;
  radius: number;
  prompt: string;
  enabled: boolean;
  onTrigger(): void;
}

/** Proximity-based "press E" interaction system. */
export class InteractableSystem {
  private items: Interactable[] = [];
  private current: Interactable | null = null;

  constructor(
    private scene: Scene,
    private hud: HUD,
    private input: Input,
    private getPlayerPos: () => Vector3
  ) {
    scene.onBeforeRenderObservable.add(() => this.update());
  }

  add(item: Interactable): void {
    this.items.push(item);
  }

  private update(): void {
    const p = this.getPlayerPos();
    let best: Interactable | null = null;
    let bestD = Infinity;
    for (const it of this.items) {
      if (!it.enabled) continue;
      const d = Vector3.Distance(p, it.getPosition());
      if (d < it.radius && d < bestD) {
        best = it;
        bestD = d;
      }
    }
    if (best !== this.current) {
      this.current = best;
      if (best) this.hud.showPrompt(best.prompt);
      else this.hud.hidePrompt();
    }
    if (best && this.input.wasPressed("KeyE")) {
      best.onTrigger();
    }
  }
}
