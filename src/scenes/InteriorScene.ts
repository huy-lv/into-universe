import {
  Color3,
  Color4,
  DynamicTexture,
  HemisphericLight,
  Material,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  PointLight,
  Scene,
  StandardMaterial,
  Texture,
  TransformNode,
  UniversalCamera,
  Vector3
} from "@babylonjs/core";
import { GameAPI, SceneParams } from "../core/Game";
import { applyPipeline } from "../core/Engine";
import { GRAVITY } from "../gameplay/Gravity";
import { InteractableSystem, Interactable } from "../gameplay/Interactable";
import { ThirdPersonCharacter } from "../gameplay/ThirdPersonCharacter";
import { Cutscene } from "../gameplay/Cutscene";
import { makePanelTexture } from "../gameplay/ProceduralTextures";
import { GameScene } from "./GameScene";
import { Noise } from "../utils/Noise";

const CABIN_R = 3.0;
const CABIN_H = 3.4;

export class InteriorScene implements GameScene {
  readonly scene: Scene;
  readonly ready: Promise<void>;
  private player: ThirdPersonCharacter;
  private windowTex: DynamicTexture;
  private winMat: StandardMaterial;
  private extScene: Scene | null = null;
  private extCam: UniversalCamera | null = null;
  private launching = false;
  /** Exterior scene rendered behind this one (window views). */
  backdrop?: Scene;

  constructor(private game: GameAPI, params: SceneParams) {
    const s = (this.scene = new Scene(game.engine));
    s.clearColor = new Color4(0.02, 0.02, 0.03, 1);

    // ---------- lighting ----------
    const lamp = new PointLight("lamp", new Vector3(0, CABIN_H - 0.4, 0), s);
    lamp.intensity = 3.2;
    lamp.diffuse = new Color3(1, 0.92, 0.78);
    const lamp2 = new PointLight("lamp2", new Vector3(0, 1.2, 0), s);
    lamp2.intensity = 1.1;
    lamp2.diffuse = new Color3(0.55, 0.72, 1);
    const lamp3 = new PointLight("lamp3", new Vector3(0, 0.4, 0), s);
    lamp3.intensity = 0.6;
    lamp3.diffuse = new Color3(1, 0.75, 0.55);
    // ambient fill so no surface falls to pure black
    const ambient = new HemisphericLight("amb", new Vector3(0, 1, 0), s);
    ambient.intensity = 0.55;
    ambient.diffuse = new Color3(0.85, 0.9, 1);
    ambient.groundColor = new Color3(0.5, 0.45, 0.4);

    // ---------- cabin shell: octagonal walls, 3 panels have REAL window holes ----------
    const panelMat = new StandardMaterial("panelMat", s);
    const panelTex = makePanelTexture(s, 1024, 512);
    panelTex.uScale = 4;
    panelMat.diffuseTexture = panelTex;
    panelMat.emissiveTexture = panelTex;
    panelMat.emissiveColor = new Color3(0.22, 0.22, 0.22);
    panelMat.specularColor = new Color3(0.05, 0.05, 0.05);

    const WALL_R = 3.1;
    const PANEL_W = 2 * WALL_R * Math.tan(Math.PI / 8); // ~2.57
    const WIN_W = 1.5, WIN_Y0 = 1.45, WIN_Y1 = 2.55;
    const WIN_PANELS = new Set([0, 3, 5]); // octagon faces at 0°, 135°, 225°
    for (let i = 0; i < 8; i++) {
      const ang = i * (Math.PI / 4);
      const holder = new TransformNode("wall" + i, s);
      holder.position.set(Math.sin(ang) * WALL_R, 0, Math.cos(ang) * WALL_R);
      holder.rotation.y = ang;
      const piece = (name: string, w: number, h: number, x: number, y: number) => {
        const b = MeshBuilder.CreateBox(name, { width: w, height: h, depth: 0.12 }, s);
        b.material = panelMat;
        b.parent = holder;
        b.position.set(x, y, 0);
      };
      if (!WIN_PANELS.has(i)) {
        piece("wp", PANEL_W, CABIN_H, 0, CABIN_H / 2);
      } else {
        const jambW = (PANEL_W - WIN_W) / 2;
        piece("wpBot", PANEL_W, WIN_Y0, 0, WIN_Y0 / 2);
        piece("wpTop", PANEL_W, CABIN_H - WIN_Y1, 0, (CABIN_H + WIN_Y1) / 2);
        piece("wpL", jambW, WIN_Y1 - WIN_Y0, -(WIN_W + jambW) / 2, (WIN_Y0 + WIN_Y1) / 2);
        piece("wpR", jambW, WIN_Y1 - WIN_Y0, (WIN_W + jambW) / 2, (WIN_Y0 + WIN_Y1) / 2);
      }
    }

    const metal = new PBRMaterial("metal", s);
    metal.albedoColor = new Color3(0.35, 0.37, 0.4);
    metal.metallic = 0.8;
    metal.roughness = 0.45;
    const floor = MeshBuilder.CreateDisc("floor", { radius: CABIN_R, tessellation: 48 }, s);
    floor.rotation.x = Math.PI / 2;
    floor.material = metal;
    const ceil = MeshBuilder.CreateDisc("ceil", { radius: CABIN_R, tessellation: 48 }, s);
    ceil.rotation.x = -Math.PI / 2;
    ceil.position.y = CABIN_H;
    ceil.material = metal;

    // central console column
    const console_ = MeshBuilder.CreateBox("console", { width: 1.6, height: 1.0, depth: 0.7 }, s);
    console_.position.set(0, 0.5, CABIN_R - 0.9);
    console_.rotation.x = -0.35;
    const consoleMat = new StandardMaterial("consoleMat", s);
    const cTex = makePanelTexture(s, 512, 256);
    consoleMat.diffuseTexture = cTex;
    consoleMat.emissiveTexture = cTex;
    consoleMat.emissiveColor = new Color3(0.85, 0.85, 0.85);
    console_.material = consoleMat;

    // ---------- windows: REAL holes in the wall — the exterior scene renders
    // behind this scene (backdrop), visible through the openings. A "glass"
    // plane sits in each hole, alpha ramping 0→1 during ascent so the outside
    // crossfades into a space view. ----------
    this.windowTex = new DynamicTexture("windowView", { width: 256, height: 192 }, s, false);
    this.drawWindow(0);
    const winMat = new StandardMaterial("winMat", s);
    this.winMat = winMat;
    winMat.diffuseColor = new Color3(0, 0, 0);
    winMat.specularColor = new Color3(0, 0, 0);
    winMat.emissiveColor = new Color3(1, 1, 1);
    winMat.emissiveTexture = this.windowTex;
    winMat.disableLighting = true;
    winMat.transparencyMode = Material.MATERIAL_ALPHABLEND;
    winMat.alpha = 0; // fully transparent on the pad → real outside view

    const exterior = params["prevScene"] as Scene | undefined;
    if (exterior) {
      this.extScene = exterior;
      this.backdrop = exterior;
      s.autoClear = false; // keep the exterior frame — cabin draws on top
      // hide the astronaut left standing on the pad
      const prevObj = params["prevSceneObj"] as
        | { player?: ThirdPersonCharacter }
        | undefined;
      prevObj?.player?.setEnabled(false);
      prevObj?.player?.root.getChildMeshes().forEach((m) => (m.isVisible = false));

      // camera riding at the rocket NOSE (~65 m for the real-scale F9) —
      // it renders the whole exterior scene behind the cabin
      this.extCam = new UniversalCamera("extCam", new Vector3(0, 66, 2.8), exterior);
      this.extCam.minZ = 0.5;
      this.extCam.maxZ = 8000;
      this.extCam.fov = 1.05;
      exterior.activeCamera = this.extCam;
      // keep the exterior view tracking the interior look direction —
      // tilted down so windows frame pad + ground + horizon, not just sky
      s.onBeforeRenderObservable.add(() => {
        if (this.extCam && !this.launching) {
          const dir = this.player.camera.getTarget().subtract(this.player.camera.position).normalize();
          dir.y -= 0.42;
          dir.normalize();
          this.extCam.setTarget(this.extCam.position.add(dir.scale(200)));
        }
      });
    } else {
      winMat.alpha = 1; // no exterior — glass shows the drawn view
    }

    const frameMat = new PBRMaterial("winFrame", s);
    frameMat.albedoColor = new Color3(0.15, 0.16, 0.19);
    frameMat.metallic = 0.85;
    frameMat.roughness = 0.35;
    for (const i of [0, 3, 5]) {
      const ang = i * (Math.PI / 4);
      // dark bezel behind each opening
      const bezel = MeshBuilder.CreatePlane("bezel", { width: 1.75, height: 1.3 }, s);
      bezel.position.set(Math.sin(ang) * (WALL_R - 0.02), (WIN_Y0 + WIN_Y1) / 2, Math.cos(ang) * (WALL_R - 0.02));
      bezel.rotation.y = ang + Math.PI;
      bezel.material = frameMat;
      bezel.isPickable = false;
      // glass pane inside the opening
      const win = MeshBuilder.CreatePlane("win", { width: WIN_W - 0.04, height: WIN_Y1 - WIN_Y0 - 0.04 }, s);
      win.position.set(Math.sin(ang) * WALL_R, (WIN_Y0 + WIN_Y1) / 2, Math.cos(ang) * WALL_R);
      win.rotation.y = ang + Math.PI;
      win.material = winMat;
      win.isPickable = false;
    }

    // ---------- pilot seat ----------
    const seatMat = new PBRMaterial("seatMat", s);
    seatMat.albedoColor = new Color3(0.25, 0.28, 0.32);
    seatMat.roughness = 0.8;
    const seatBase = MeshBuilder.CreateBox("seatBase", { width: 0.7, height: 0.45, depth: 0.65 }, s);
    seatBase.material = seatMat;
    seatBase.position.set(0, 0.22, 0.4);
    const seatBack = MeshBuilder.CreateBox("seatBack", { width: 0.7, height: 1.1, depth: 0.18 }, s);
    seatBack.material = seatMat;
    seatBack.position.set(0, 0.9, 0.05);
    seatBack.rotation.x = 0.12;
    const headrest = MeshBuilder.CreateBox("headrest", { width: 0.4, height: 0.25, depth: 0.15 }, s);
    headrest.material = seatMat;
    headrest.position.set(0, 1.55, 0.0);

    // ---------- player ----------
    this.player = new ThirdPersonCharacter(s, game.input, new Vector3(-1.6, 1.6, -1.2), {
      gravity: GRAVITY.EARTH,
      cameraDistance: 3.2
    });
    game.hud.setHint("WASD di chuyển · E tương tác");

    // ---------- interactions ----------
    const inter = new InteractableSystem(s, game.hud, game.input, () => this.player.position);
    const seatItem: Interactable = {
      getPosition: () => new Vector3(0, 0.6, 0.4),
      radius: 1.6,
      prompt: "Nhấn <b>E</b> — Ngồi vào ghế, bắt đầu đếm ngược",
      enabled: true,
      onTrigger: () => this.startLaunch()
    };
    const doorItem: Interactable = {
      getPosition: () => new Vector3(-1.8, 1.0, 1.8),
      radius: 1.4,
      prompt: "Nhấn <b>E</b> — Quay lại bãi phóng",
      enabled: true,
      onTrigger: () => {
        game.audio.beep(520);
        game.goTo("launch");
      }
    };
    inter.add(seatItem);
    inter.add(doorItem);
    // visual door marker — on the solid 315° wall panel
    const door = MeshBuilder.CreateBox("door", { width: 0.9, height: 1.9, depth: 0.08 }, s);
    door.position.set(-1.85, 0.95, 1.85);
    door.rotation.y = -Math.PI / 4;
    const doorMat = new PBRMaterial("doorMat2", s);
    doorMat.albedoColor = new Color3(0.8, 0.4, 0.1);
    doorMat.metallic = 0.5;
    doorMat.roughness = 0.5;
    door.material = doorMat;

    applyPipeline(s, this.player.camera);
    s.activeCamera = this.player.camera;
    s.onPointerObservable.add(() => game.input.requestPointerLock());

    this.ready = this.player.loadSuitModel();
  }

  /** t: 0 = on pad (daylight), →1 = space. */
  private drawWindow(t: number): void {
    const ctx = this.windowTex.getContext() as unknown as CanvasRenderingContext2D;
    const w = 256, h = 192;
    // sky: light blue → orange glow → black
    let top: [number, number, number], bottom: [number, number, number];
    if (t < 0.35) {
      const k = t / 0.35;
      top = lerp3([90, 140, 210], [40, 40, 60], k * 0.5);
      bottom = lerp3([160, 200, 235], [255, 140, 40], k);
    } else {
      const k = (t - 0.35) / 0.65;
      top = lerp3([40, 40, 60], [2, 2, 6], k);
      bottom = lerp3([255, 140, 40], [10, 10, 20], Math.min(1, k * 1.4));
    }
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, `rgb(${top[0] | 0},${top[1] | 0},${top[2] | 0})`);
    g.addColorStop(1, `rgb(${bottom[0] | 0},${bottom[1] | 0},${bottom[2] | 0})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    if (t > 0.5) {
      // stars
      const rand = Noise.mulberry(999);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      const n = Math.floor(80 * (t - 0.5));
      for (let i = 0; i < n; i++) {
        ctx.fillRect(rand() * w, rand() * h, 1.3, 1.3);
      }
      // speed streaks
      ctx.strokeStyle = "rgba(180,220,255,0.5)";
      for (let i = 0; i < 14; i++) {
        const x = rand() * w;
        const y = rand() * h;
        const len = 15 + rand() * 45 * t;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + len);
        ctx.stroke();
      }
    }
    // vibration flicker
    ctx.fillStyle = `rgba(255,255,255,${(Math.random() * 0.04 * Math.min(1, t * 3)).toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
    this.windowTex.update();
  }

  private startLaunch(): void {
    if (this.launching) return;
    this.launching = true;
    const s = this.scene;
    const game = this.game;
    const cam = this.player.camera;

    // seat the player
    this.player.setEnabled(false);
    this.player.cameraFrozen = true;
    this.player.teleport(new Vector3(0, 0.5, 0.35));
    this.player.setFacing(Math.PI); // face +z? seat faces console at +z
    this.player.setSeated(true);
    this.player.root.getChildMeshes().forEach((m) => (m.isVisible = false));

    const camBase = new Vector3(0, 1.85, -0.55);
    const camTarget = new Vector3(0, 1.8, CABIN_R);
    cam.position.copyFrom(camBase);
    cam.setTarget(camTarget);
    cam.fov = 0.75;

    game.audio.unlock();
    game.audio.startRumble();
    game.hud.hidePrompt();

    const cut = new Cutscene(s);
    const shakeRng = Noise.mulberry(5);
    let tPower = 0;

    cut
      .at(0.2, () => game.hud.showSubtitle("Kiểm tra hệ thống... tất cả sẵn sàng."))
      .at(2.2, () => game.hud.showSubtitle("Bắt đầu đếm ngược."))
      .at(3.0, () => { game.hud.bigText("3"); game.audio.beep(600, 0.15); })
      .at(4.0, () => { game.hud.bigText("2"); game.audio.beep(600, 0.15); })
      .at(5.0, () => { game.hud.bigText("1"); game.audio.beep(600, 0.15); })
      .at(6.0, () => {
        game.hud.bigText("PHÓNG!");
        game.audio.beep(980, 0.4);
        game.hud.showSubtitle("Động cơ chính đánh lửa — rời bệ phóng!");
      })
      .at(9.5, () => game.hud.showSubtitle("Vượt qua tầng đối lưu..."))
      .at(13.0, () => game.hud.showSubtitle("Tách tầng một. Tiếp tục lên quỹ đạo."))
      .at(16.5, () => game.hud.showSubtitle("Đã vào quỹ đạo Trái Đất."))
      .onUpdate((t) => {
        // engine power ramps up at liftoff (t=6), stays high through ascent
        const target = t < 6 ? 0.15 : t < 16 ? 0.55 + Math.min(0.4, (t - 6) * 0.12) : 0.25;
        tPower += (target - tPower) * 0.04;
        game.audio.setRumble(tPower);

        // windows: the nose camera climbs after liftoff → the ground visibly
        // shrinks away; glass fades in as a space view once we're high
        if (this.extCam) {
          const asc = Math.max(0, t - 6);
          this.extCam.position.y = 66 + asc * asc * 14;
          // look progressively more downward at the receding pad
          this.extCam.setTarget(
            Vector3.Lerp(new Vector3(0, 30, -200), new Vector3(0, 0, 0), Math.min(1, asc / 8))
          );
        }
        const glassA = Math.max(0, Math.min(1, (t - 12) / 4));
        this.winMat.alpha = this.extCam ? glassA : 1;
        this.drawWindow(Math.max(0, Math.min(1, (t - 12) / 4)));
        // camera shake
        const amp = tPower * 0.06;
        cam.position.set(
          camBase.x + (shakeRng() - 0.5) * amp,
          camBase.y + (shakeRng() - 0.5) * amp,
          camBase.z + (shakeRng() - 0.5) * amp * 0.5
        );
        // altitude ticker
        if (t > 6) {
          const km = Math.min(400, (t - 6) * (t - 6) * 4.2);
          game.hud.setHint(`ĐỘ CAO: ${km.toFixed(0)} km`);
        }
      });

    void cut.play(18).then(() => {
      game.audio.stopRumble();
      game.hud.hideBigText();
      game.goTo("space", { dir: "toMoon" });
    });
  }

  dispose(): void {
    this.scene.dispose();
  }
}

function lerp3(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
