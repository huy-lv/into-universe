import {
  Color3,
  DirectionalLight,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Vector3
} from "@babylonjs/core";
import { SkyMaterial } from "@babylonjs/materials";
import { GameAPI } from "../core/Game";
import { applyPipeline } from "../core/Engine";
import { GRAVITY } from "../gameplay/Gravity";
import { InteractableSystem } from "../gameplay/Interactable";
import { ThirdPersonCharacter } from "../gameplay/ThirdPersonCharacter";
import { loadShip } from "../gameplay/Ship";
import { makeConcreteTexture } from "../gameplay/ProceduralTextures";
import { GameScene } from "./GameScene";
import { Noise } from "../utils/Noise";

const PAD_Y = 1.5;

export class LaunchSiteScene implements GameScene {
  readonly scene: Scene;
  readonly ready: Promise<void>;
  readonly player: ThirdPersonCharacter;

  constructor(private game: GameAPI) {
    const s = (this.scene = new Scene(game.engine));
    s.clearColor.set(0.5, 0.65, 0.85, 1);
    s.fogMode = Scene.FOGMODE_EXP2;
    s.fogDensity = 0.0012;
    s.fogColor = new Color3(0.65, 0.75, 0.88);

    // ---------- lighting ----------
    const sun = new DirectionalLight("sun", new Vector3(-0.45, -0.9, 0.35), s);
    sun.position = new Vector3(120, 200, -90);
    sun.intensity = 2.4;
    sun.diffuse = new Color3(1, 0.97, 0.9);
    const fill = new HemisphericLight("fill", new Vector3(0, 1, 0), s);
    fill.intensity = 0.55;
    fill.diffuse = new Color3(0.75, 0.85, 1);
    fill.groundColor = new Color3(0.35, 0.32, 0.28);

    // ---------- sky ----------
    const skyMat = new SkyMaterial("sky", s);
    skyMat.luminance = 1.0;
    skyMat.turbidity = 6;
    skyMat.rayleigh = 1.8;
    skyMat.mieCoefficient = 0.004;
    const skybox = MeshBuilder.CreateBox("skybox", { size: 8000 }, s);
    skybox.material = skyMat;
    skybox.infiniteDistance = true;
    skybox.isPickable = false;

    // ---------- ground ----------
    const ground = MeshBuilder.CreateGround("ground", { width: 1200, height: 1200, subdivisions: 64 }, s);
    ground.position.y = 0.05; // lift slightly so nothing coplanar sits below it
    const gmat = new StandardMaterial("gmat", s);
    const concrete = makeConcreteTexture(s, 512, 11, 120);
    concrete.uScale = concrete.vScale = 60;
    concrete.anisotropicFilteringLevel = 8;
    gmat.diffuseTexture = concrete;
    gmat.specularColor = new Color3(0.04, 0.04, 0.04);
    // tint outer terrain greenish-grey via diffuse color mix is not possible with
    // texture alone; keep the spaceport-concrete look uniformly.
    ground.material = gmat;
    ground.receiveShadows = true;

    // gentle distant dunes so the horizon isn't a razor edge
    const noise = new Noise(4);
    const dunes = MeshBuilder.CreateGround("dunes", { width: 2400, height: 2400, subdivisions: 48 }, s);
    const pos = dunes.getVerticesData("position")!;
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i], z = pos[i + 2];
      const r = Math.sqrt(x * x + z * z);
      // stay below the flat ground everywhere inside its square footprint —
      // corner distance is ~849m, so dunes only rise beyond 870m (no z-fight)
      pos[i + 1] = -0.6 + (r > 870 ? noise.fbm2(x * 0.004, z * 0.004, 4) * Math.min(40, (r - 870) * 0.07) : 0);
    }
    dunes.updateVerticesData("position", pos);
    dunes.refreshBoundingInfo();
    const dmat = new StandardMaterial("dmat", s);
    dmat.diffuseColor = new Color3(0.42, 0.44, 0.4);
    dunes.material = dmat;

    // ---------- launch pad ----------
    const pad = MeshBuilder.CreateCylinder("pad", { height: PAD_Y, diameter: 26, tessellation: 48 }, s);
    pad.position.y = PAD_Y / 2;
    const padMat = new StandardMaterial("padMat", s);
    const padTex = makeConcreteTexture(s, 512, 77, 96);
    padTex.uScale = padTex.vScale = 8;
    padMat.diffuseTexture = padTex;
    pad.material = padMat;
    pad.receiveShadows = true;
    // hazard ring
    const ring = MeshBuilder.CreateTorus("ring", { diameter: 22, thickness: 0.25, tessellation: 64 }, s);
    ring.position.y = PAD_Y + 0.05;
    const ringMat = new StandardMaterial("ringMat", s);
    ringMat.diffuseColor = new Color3(0.9, 0.55, 0.1);
    ring.material = ringMat;

    // access ramp up to the pad (player walks up this)
    const rampLen = 8.2;
    const ramp = MeshBuilder.CreateBox("ramp", { width: 5, height: 0.3, depth: rampLen }, s);
    ramp.material = padMat;
    ramp.position.set(0, 0.6, 17);
    ramp.rotation.x = Math.atan2(PAD_Y, rampLen);

    // ---------- support structures ----------
    const struct = new PBRMaterial("struct", s);
    struct.albedoColor = new Color3(0.55, 0.28, 0.18);
    struct.metallic = 0.6;
    struct.roughness = 0.6;
    // umbilical tower — scaled near real height for a ~70 m rocket
    const tower = MeshBuilder.CreateBox("tower", { width: 2.4, height: 62, depth: 2.4 }, s);
    tower.material = struct;
    tower.position.set(-4.6, PAD_Y + 31 - 0.06, -3.6); // sink 6cm into pad, no coplanar contact
    for (let i = 0; i < 6; i++) {
      const arm = MeshBuilder.CreateBox("arm" + i, { width: 3.6, height: 0.4, depth: 1.4 }, s);
      arm.material = struct;
      arm.position.set(-2.8, PAD_Y + 8 + i * 10.5, -3.6 + 1.8);
    }
    // distant hangar blocks for scale
    for (const [x, z, w, h, d] of [
      [60, -45, 30, 8, 14],
      [-70, 40, 24, 6, 18],
      [90, 60, 40, 10, 20]
    ] as const) {
      const b = MeshBuilder.CreateBox("hangar", { width: w, height: h, depth: d }, s);
      const bm = new StandardMaterial("hangarMat", s);
      bm.diffuseColor = new Color3(0.5, 0.52, 0.55);
      b.material = bm;
      b.position.set(x, h / 2, z);
    }

    // ---------- ship (real NASA Saturn V when ship.glb is present) ----------
    const shipReady = loadShip(s).then((ship) => {
      ship.position.set(0, PAD_Y - 0.06, 0); // base embeds slightly into the pad top
      ship.getChildMeshes().forEach((m) => shadows.addShadowCaster(m));
    });

    // ---------- player ----------
    this.player = new ThirdPersonCharacter(s, game.input, new Vector3(12, 3.5, 18), {
      gravity: GRAVITY.EARTH
    });
    game.hud.setHint("WASD di chuyển · SHIFT chạy · SPACE nhảy · E tương tác · Click để khóa chuột");

    // ---------- interactions ----------
    const inter = new InteractableSystem(s, game.hud, game.input, () => this.player.position);
    inter.add({
      getPosition: () => new Vector3(0, PAD_Y + 2.5, 3),
      radius: 5,
      prompt: "Nhấn <b>E</b> để vào tàu vũ trụ",
      enabled: true,
      onTrigger: () => {
        game.audio.beep(660);
        // keep this scene alive — the cabin windows render its real view
        game.goTo("interior", { keepPrevScene: true });
      }
    });

    // ---------- shadows ----------
    const shadows = new ShadowGenerator(2048, sun);
    shadows.useBlurExponentialShadowMap = true;
    shadows.bias = 0.0004;
    shadows.normalBias = 0.02;
    shadows.darkness = 0.25;
    for (const m of s.meshes) {
      if (m !== ground && m !== dunes && m !== skybox && !m.name.includes("sky")) {
        shadows.addShadowCaster(m);
      }
    }

    applyPipeline(s, this.player.camera);
    s.activeCamera = this.player.camera;
    s.onPointerObservable.add(() => game.input.requestPointerLock());

    this.ready = Promise.all([shipReady, this.player.loadSuitModel()]).then(() => undefined);
  }

  dispose(): void {
    this.scene.dispose();
  }
}
