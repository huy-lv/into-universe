import { Scene } from "@babylonjs/core";

export interface CutsceneEvent {
  /** Seconds since cutscene start. */
  at: number;
  run(): void;
}

/** Simple timeline cutscene: fires events at timestamps, ticks an update callback,
 * finishes via promise. Optionally skippable (jumps to end state via onSkip). */
export class Cutscene {
  private events: CutsceneEvent[] = [];
  private elapsed = 0;
  private idx = 0;
  private updateFn: ((t: number, dt: number) => void) | null = null;
  private donePromise: Promise<void>;
  private resolveDone!: () => void;
  private finished = false;
  private onSkip: (() => void) | null = null;

  constructor(private scene: Scene) {
    this.donePromise = new Promise((r) => (this.resolveDone = r));
  }

  at(t: number, run: () => void): this {
    this.events.push({ at: t, run });
    this.events.sort((a, b) => a.at - b.at);
    return this;
  }

  onUpdate(fn: (t: number, dt: number) => void): this {
    this.updateFn = fn;
    return this;
  }

  skippable(onSkip: () => void): this {
    this.onSkip = onSkip;
    return this;
  }

  /** Duration = last event time. */
  play(duration?: number): Promise<void> {
    const total = duration ?? (this.events.length ? this.events[this.events.length - 1].at + 0.01 : 0);
    const obs = this.scene.onBeforeRenderObservable.add(() => {
      if (this.finished) return;
      const dt = this.scene.getEngine().getDeltaTime() / 1000;
      this.elapsed += dt;
      while (this.idx < this.events.length && this.events[this.idx].at <= this.elapsed) {
        this.events[this.idx].run();
        this.idx++;
      }
      this.updateFn?.(this.elapsed, dt);
      if (this.elapsed >= total) {
        this.finished = true;
        this.scene.onBeforeRenderObservable.remove(obs);
        this.resolveDone();
      }
    });
    return this.donePromise;
  }

  /** Immediately fire all remaining events (used when skipping). */
  fastForward(): void {
    while (this.idx < this.events.length) {
      this.events[this.idx].run();
      this.idx++;
    }
    this.onSkip?.();
  }
}
