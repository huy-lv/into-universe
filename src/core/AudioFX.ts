/** Procedural WebAudio SFX — no audio assets required. */
export class AudioFX {
  private ctx: AudioContext | null = null;
  private rumbleNodes: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;

  private ensure(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  /** Call on a user gesture so the context may start. */
  unlock(): void {
    this.ensure();
  }

  /** Looping low-frequency rumble for the rocket engines. intensity 0..1 */
  startRumble(): void {
    const ctx = this.ensure();
    this.stopRumble();
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 120;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
    this.rumbleNodes = { src, gain, filter };
  }

  setRumble(intensity: number): void {
    if (!this.rumbleNodes || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.rumbleNodes.gain.gain.linearRampToValueAtTime(
      Math.min(1, Math.max(0, intensity)) * 0.55,
      t + 0.1
    );
    this.rumbleNodes.filter.frequency.linearRampToValueAtTime(100 + intensity * 260, t + 0.1);
  }

  stopRumble(): void {
    if (!this.rumbleNodes || !this.ctx) {
      this.rumbleNodes = null;
      return;
    }
    const { src, gain } = this.rumbleNodes;
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.4);
    setTimeout(() => {
      try { src.stop(); } catch { /* already stopped */ }
    }, 500);
    this.rumbleNodes = null;
  }

  /** Short UI beep. */
  beep(freq = 880, dur = 0.08): void {
    const ctx = this.ensure();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  dispose(): void {
    this.stopRumble();
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
  }
}
