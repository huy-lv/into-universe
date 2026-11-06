import { Engine } from "@babylonjs/core";
import { AudioFX } from "./AudioFX";
import { Input } from "./Input";
import { HUD } from "../ui/HUD";
import { GameScene } from "../scenes/GameScene";

export type GameState = "launch" | "interior" | "space" | "moon";

export interface SceneParams {
  [key: string]: unknown;
}

export interface GameAPI {
  readonly engine: Engine;
  readonly input: Input;
  readonly hud: HUD;
  readonly audio: AudioFX;
  goTo(state: GameState, params?: SceneParams): void;
}

type SceneFactory = (game: GameAPI, params: SceneParams) => GameScene;

/** Owns the render loop and switches between GameScenes with a fade. */
export class Game implements GameAPI {
  readonly engine: Engine;
  readonly input: Input;
  readonly hud: HUD;
  readonly audio: AudioFX;

  private factories = new Map<GameState, SceneFactory>();
  private active: GameScene | null = null;
  private switching = false;
  /** A previous scene kept alive for render-target views (ship windows). */
  private carriedScene: import("@babylonjs/core").Scene | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, {
      stencil: true,
      adaptToDeviceRatio: true
    });
    this.input = new Input(canvas);
    this.hud = new HUD();
    this.audio = new AudioFX();
    window.addEventListener("resize", () => this.engine.resize());

    this.engine.runRenderLoop(() => {
      if (this.active) {
        this.active.backdrop?.render();
        this.active.scene.render();
      }
      this.input.endFrame();
    });
  }

  register(state: GameState, factory: SceneFactory): void {
    this.factories.set(state, factory);
  }

  goTo(state: GameState, params: SceneParams = {}): void {
    if (this.switching) return;
    const factory = this.factories.get(state);
    if (!factory) throw new Error(`No scene registered for state "${state}"`);
    this.switching = true;
    void this.hud
      .transition(async () => {
        this.hud.hidePrompt();
        this.hud.hideSubtitle();
        const prev = this.active;
        // drop a stale carried scene (it's never the one we're leaving)
        if (this.carriedScene && this.carriedScene !== prev?.scene) {
          this.carriedScene.dispose();
          this.carriedScene = null;
        }
        if (params["keepPrevScene"] && prev) {
          this.carriedScene = prev.scene;
          params["prevScene"] = prev.scene;
          params["prevSceneObj"] = prev;
        } else {
          prev?.dispose();
        }
        this.active = null;
        const next = factory(this, params);
        await next.ready;
        this.active = next;
      })
      .finally(() => {
        this.switching = false;
      });
  }

  /** First load (no fade-in-from-scene needed; HTML loader handles it). */
  async start(state: GameState, params: SceneParams = {}): Promise<void> {
    const factory = this.factories.get(state);
    if (!factory) throw new Error(`No scene registered for state "${state}"`);
    const next = factory(this, params);
    await next.ready;
    this.active = next;
    this.hud.setBlack(false);
  }
}
