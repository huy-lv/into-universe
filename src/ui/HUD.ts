/** DOM-based HUD: interaction prompt, subtitles, countdown, fade transitions. */
export class HUD {
  private root: HTMLDivElement;
  private promptEl: HTMLDivElement;
  private subtitleEl: HTMLDivElement;
  private bigTextEl: HTMLDivElement;
  private fadeEl: HTMLDivElement;
  private hintEl: HTMLDivElement;

  constructor() {
    const style = document.createElement("style");
    style.textContent = `
      #hud { position:absolute; inset:0; pointer-events:none; z-index:5;
             font-family:'Segoe UI',system-ui,sans-serif; color:#e8eef5; }
      #hud .prompt { position:absolute; left:50%; bottom:22%; transform:translateX(-50%);
        padding:10px 22px; background:rgba(8,12,20,0.72); border:1px solid rgba(120,180,255,0.4);
        border-radius:8px; font-size:15px; letter-spacing:0.05em; opacity:0; transition:opacity .2s; }
      #hud .prompt b { color:#7db8ff; }
      #hud .subtitle { position:absolute; left:50%; bottom:9%; transform:translateX(-50%);
        max-width:70%; text-align:center; font-size:17px; text-shadow:0 1px 4px #000;
        opacity:0; transition:opacity .3s; }
      #hud .big { position:absolute; left:50%; top:38%; transform:translate(-50%,-50%);
        font-size:84px; font-weight:200; letter-spacing:0.15em; text-shadow:0 0 30px rgba(120,180,255,.6);
        opacity:0; transition:opacity .15s; }
      #hud .fade { position:absolute; inset:0; background:#000; opacity:1; transition:opacity .8s; }
      #hud .hint { position:absolute; top:14px; left:50%; transform:translateX(-50%);
        font-size:12px; letter-spacing:.15em; opacity:.45; }
      #hud .dot { position:absolute; left:50%; top:50%; width:4px; height:4px;
        transform:translate(-50%,-50%); border-radius:50%; background:rgba(255,255,255,.5); }
    `;
    document.head.appendChild(style);

    this.root = document.createElement("div");
    this.root.id = "hud";
    this.promptEl = document.createElement("div");
    this.promptEl.className = "prompt";
    this.subtitleEl = document.createElement("div");
    this.subtitleEl.className = "subtitle";
    this.bigTextEl = document.createElement("div");
    this.bigTextEl.className = "big";
    this.fadeEl = document.createElement("div");
    this.fadeEl.className = "fade";
    this.hintEl = document.createElement("div");
    this.hintEl.className = "hint";
    const dot = document.createElement("div");
    dot.className = "dot";

    this.root.append(this.promptEl, this.subtitleEl, this.bigTextEl, this.hintEl, dot, this.fadeEl);
    document.body.appendChild(this.root);
  }

  showPrompt(text: string): void {
    this.promptEl.innerHTML = text;
    this.promptEl.style.opacity = "1";
  }

  hidePrompt(): void {
    this.promptEl.style.opacity = "0";
  }

  showSubtitle(text: string, _seconds = 4): void {
    this.subtitleEl.textContent = text;
    this.subtitleEl.style.opacity = "1";
  }

  hideSubtitle(): void {
    this.subtitleEl.style.opacity = "0";
  }

  bigText(text: string): void {
    this.bigTextEl.textContent = text;
    this.bigTextEl.style.opacity = "1";
  }

  hideBigText(): void {
    this.bigTextEl.style.opacity = "0";
  }

  setHint(text: string): void {
    this.hintEl.textContent = text;
  }

  /** Fade to black, run callback mid-fade, then fade back in. */
  async transition(mid: () => void | Promise<void>, fadeMs = 800): Promise<void> {
    this.fadeEl.style.transition = `opacity ${fadeMs}ms`;
    this.fadeEl.style.opacity = "1";
    await wait(fadeMs + 60);
    await mid();
    this.fadeEl.style.opacity = "0";
    await wait(fadeMs + 60);
  }

  setBlack(v: boolean): void {
    this.fadeEl.style.opacity = v ? "1" : "0";
  }

  dispose(): void {
    this.root.remove();
  }
}

export function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
