/** Main-menu overlay shown after the first scene loads. */
export class MainMenu {
  private el: HTMLDivElement;

  constructor(onStart: () => void) {
    const style = document.createElement("style");
    style.textContent = `
      #mainMenu { position:absolute; inset:0; z-index:8; display:flex;
        flex-direction:column; align-items:center; justify-content:center;
        background:rgba(0,0,0,0.45); font-family:'Segoe UI',system-ui,sans-serif;
        color:#e8eef5; transition:opacity .5s; }
      #mainMenu h1 { font-weight:200; letter-spacing:.5em; text-transform:uppercase;
        font-size:3rem; margin:0 0 .4rem; text-shadow:0 0 40px rgba(100,160,255,.5); }
      #mainMenu p { opacity:.55; letter-spacing:.2em; font-size:.8rem; margin-bottom:3rem; }
      #mainMenu button { pointer-events:auto; cursor:pointer; padding:14px 54px;
        font-size:1rem; letter-spacing:.35em; color:#dfe9f5; background:transparent;
        border:1px solid rgba(130,180,255,.5); border-radius:4px; transition:all .25s;
        font-family:inherit; }
      #mainMenu button:hover { background:rgba(80,140,220,.25); letter-spacing:.45em; }
      #mainMenu .controls { margin-top:3rem; font-size:.72rem; letter-spacing:.15em;
        opacity:.4; line-height:1.9; text-align:center; }
    `;
    document.head.appendChild(style);

    this.el = document.createElement("div");
    this.el.id = "mainMenu";
    this.el.innerHTML = `
      <h1>Into Universe</h1>
      <p>TRÁI ĐẤT → MẶT TRĂNG</p>
      <button id="startBtn">BẮT ĐẦU</button>
      <div class="controls">
        WASD di chuyển · SHIFT chạy · SPACE nhảy · E tương tác<br/>
        Click vào màn hình để khóa chuột, ESC để thoát
      </div>
    `;
    document.body.appendChild(this.el);
    this.el.querySelector<HTMLButtonElement>("#startBtn")!.addEventListener("click", () => {
      onStart();
      this.hide();
    });
  }

  hide(): void {
    this.el.style.opacity = "0";
    setTimeout(() => this.el.remove(), 550);
  }
}
