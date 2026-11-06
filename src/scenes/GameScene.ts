import { Scene } from "@babylonjs/core";

/** A playable scene. Implementations build everything in the constructor/init
 *  and clean up in dispose. `ready` resolves when the scene can be shown. */
export interface GameScene {
  readonly scene: Scene;
  readonly ready: Promise<void>;
  /** Optional scene rendered full-frame *behind* this one (e.g. the exterior
   *  world visible through cockpit windows). The foreground scene must keep
   *  `scene.autoClear = false`. */
  backdrop?: Scene;
  dispose(): void;
}
