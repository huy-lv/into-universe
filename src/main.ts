import "@babylonjs/loaders/glTF";
import { Game } from "./core/Game";
import { LaunchSiteScene } from "./scenes/LaunchSiteScene";
import { InteriorScene } from "./scenes/InteriorScene";
import { SpaceScene } from "./scenes/SpaceScene";
import { MoonScene } from "./scenes/MoonScene";
import { MainMenu } from "./ui/MainMenu";
import { wait } from "./ui/HUD";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const loadingEl = document.getElementById("loadingScreen")!;
const loadingFill = document.getElementById("loadingBarFill")!;
const loadingText = document.getElementById("loadingText")!;

async function boot(): Promise<void> {
  const setProgress = (p: number, label: string) => {
    loadingFill.style.width = `${(p * 100).toFixed(0)}%`;
    loadingText.textContent = label;
  };

  setProgress(0.1, "KHỞI TẠO ENGINE...");
  const game = new Game(canvas);

  game.register("launch", (g) => new LaunchSiteScene(g));
  game.register("interior", (g, p) => new InteriorScene(g, p));
  game.register("space", (g, p) => new SpaceScene(g, p));
  game.register("moon", (g) => new MoonScene(g));

  setProgress(0.4, "DỰNG BÃI PHÓNG...");
  await game.start("launch");

  setProgress(0.9, "HOÀN TẤT");
  await wait(350);
  loadingEl.classList.add("hidden");

  new MainMenu(() => {
    game.audio.unlock();
    game.audio.beep(740);
    game.hud.setBlack(false);
    game.input.requestPointerLock();
  });
}

void boot();
