import {
  Color3,
  Color4,
  DirectionalLight,
  DynamicTexture,
  HemisphericLight,
  MeshBuilder,
  PBRMaterial,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Texture,
  Vector3,
  VertexBuffer,
  VertexData
} from "@babylonjs/core";
import { GameAPI } from "../core/Game";
import { applyPipeline } from "../core/Engine";
import { GRAVITY } from "../gameplay/Gravity";
import { InteractableSystem } from "../gameplay/Interactable";
import { ThirdPersonCharacter } from "../gameplay/ThirdPersonCharacter";
import { loadShip } from "../gameplay/Ship";
import {
  makeEarthTexture,
  makeMoonHeightField,
  makeMoonTexture,
  makeStarTexture
} from "../gameplay/ProceduralTextures";
import { GameScene } from "./GameScene";

const GROUND_EXTENT = 4000;
const GROUND_SUBDIV = 200;

export class MoonScene implements GameScene {
  readonly scene: Scene;
  readonly ready: Promise<void>;
  private player: ThirdPersonCharacter;

  constructor(private game: GameAPI) {
    const s = (this.scene = new Scene(game.engine));
    s.clearColor = new Color4(0, 0, 0, 1);

    // ---------- lighting: hard sunlight, no atmosphere ----------
    const sun = new DirectionalLight("sun", new Vector3(-0.55, -0.75, -0.3), s);
    sun.position = new Vector3(300, 400, 160);
    sun.intensity = 3.4;
    const fill = new HemisphericLight("fill", new Vector3(0, 1, 0), s);
    fill.intensity = 0.06; // almost no bounce light on the Moon

    // ---------- starfield + Earth in the sky ----------
    const starMat = new StandardMaterial("starMat", s);
    starMat.emissiveTexture = makeStarTexture(s, 2048);
    starMat.diffuseColor = new Color3(0, 0, 0);
    starMat.specularColor = new Color3(0, 0, 0);
    starMat.backFaceCulling = false;
    const stars = MeshBuilder.CreateSphere("stars", { diameter: 8000, segments: 16 }, s);
    stars.material = starMat;
    stars.infiniteDistance = true;
    stars.isPickable = false;

    const earth = MeshBuilder.CreateSphere("earth", { diameter: 55, segments: 32 }, s);
    earth.position = new Vector3(-900, 700, -1400);
    const eMat = new StandardMaterial("eMat", s);
    eMat.diffuseTexture = makeEarthTexture(s, 512, 256);
    eMat.emissiveTexture = eMat.diffuseTexture;
    eMat.emissiveColor = new Color3(0.6, 0.6, 0.6);
    eMat.specularColor = new Color3(0, 0, 0);
    earth.material = eMat;
    earth.isPickable = false;

    // ---------- terrain from heightfield ----------
    const field = makeMoonHeightField(GROUND_SUBDIV, GROUND_EXTENT, 2024);
    const ground = MeshBuilder.CreateGround(
      "moonGround",
      { width: GROUND_EXTENT, height: GROUND_EXTENT, subdivisions: GROUND_SUBDIV - 1, updatable: true },
      s
    );
    const pos = ground.getVerticesData("position")!;
    for (let i = 0; i < pos.length; i += 3) {
      pos[i + 1] = sampleField(field, pos[i], pos[i + 2]);
    }
    ground.updateVerticesData("position", pos);
    const normals: number[] = [];
    VertexData.ComputeNormals(pos, ground.getIndices(), normals);
    ground.updateVerticesData(VertexBuffer.NormalKind, normals);
    ground.refreshBoundingInfo();

    const mMat = new StandardMaterial("moonGround", s);
    const moonTex = makeMoonTexture(s, 1024, 1024);
    moonTex.uScale = moonTex.vScale = 6;
    mMat.diffuseTexture = moonTex;
    mMat.specularColor = new Color3(0.02, 0.02, 0.02);
    // bump map straight from the heightfield
    const bump = new DynamicTexture("moonBump", { width: 512, height: 512 }, s, true);
    {
      const ctx = bump.getContext() as unknown as CanvasRenderingContext2D;
      const img = ctx.createImageData(512, 512);
      for (let i = 0; i < 512 * 512; i++) {
        const fi = Math.floor((i / 512) * (GROUND_SUBDIV / 512)) * GROUND_SUBDIV +
          Math.floor((i % 512) * (GROUND_SUBDIV / 512));
        const v = Math.floor(((field.heights[fi] - field.minH) / (field.maxH - field.minH)) * 255);
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      bump.update();
      bump.wrapU = bump.wrapV = Texture.WRAP_ADDRESSMODE;
      bump.uScale = bump.vScale = 1;
      mMat.bumpTexture = bump;
      mMat.invertNormalMapX = true;
    }
    ground.material = mMat;
    ground.receiveShadows = true;

    // ---------- find a flat landing spot near origin ----------
    const padX = 0, padZ = 0;
    const padY = sampleField(field, padX, padZ);

    // landing pad
    const pad = MeshBuilder.CreateCylinder("pad", { height: 0.5, diameter: 18, tessellation: 32 }, s);
    pad.position.set(padX, padY + 0.2, padZ);
    const padMat = new StandardMaterial("padMat", s);
    padMat.diffuseColor = new Color3(0.35, 0.35, 0.38);
    pad.material = padMat;

    // ---------- landed ship (real NASA Saturn V when available) ----------
    const shipReady = loadShip(s).then((ship) => {
      ship.position.set(0, padY + 0.4, 0);
      ship.getChildMeshes().forEach((m) => shadows.addShadowCaster(m));
    });

    // flag for flavor
    const pole = MeshBuilder.CreateCylinder("pole", { height: 2.4, diameter: 0.05 }, s);
    pole.position.set(6, padY + 1.2, 3);
    const poleMat = new StandardMaterial("poleMat", s);
    poleMat.diffuseColor = new Color3(0.8, 0.8, 0.8);
    pole.material = poleMat;
    const flag = MeshBuilder.CreatePlane("flag", { width: 1.1, height: 0.7 }, s);
    flag.position.set(6.58, padY + 2.0, 3);
    const flagMat = new StandardMaterial("flagMat", s);
    flagMat.diffuseColor = new Color3(0.15, 0.3, 0.8);
    flagMat.emissiveColor = new Color3(0.08, 0.15, 0.4);
    flagMat.backFaceCulling = false;
    flag.material = flagMat;

    // ---------- player (low gravity!) ----------
    this.player = new ThirdPersonCharacter(s, game.input, new Vector3(8, padY + 4, 10), {
      gravity: GRAVITY.MOON,
      walkSpeed: 2.2,
      runSpeed: 3.5,
      jumpHeight: 2.2,
      cameraDistance: 4.5
    });
    game.hud.setHint("WASD di chuyển · SPACE nhảy (trọng lực thấp!) · E tương tác");
    game.hud.showSubtitle("Mare Tranquillitatis — Bề mặt Mặt Trăng. G = 1.62 m/s²", 6);

    // ---------- interactions ----------
    const inter = new InteractableSystem(s, game.hud, game.input, () => this.player.position);
    inter.add({
      getPosition: () => new Vector3(0, padY + 2.5, 3),
      radius: 5.5,
      prompt: "Nhấn <b>E</b> — Lên tàu, quay về Trái Đất",
      enabled: true,
      onTrigger: () => {
        game.audio.beep(660);
        game.goTo("space", { dir: "toEarth" });
      }
    });

    // ---------- shadows ----------
    const shadows = new ShadowGenerator(2048, sun);
    shadows.useBlurExponentialShadowMap = true;
    shadows.bias = 0.0004;
    shadows.normalBias = 0.02;
    shadows.darkness = 0.4;
    for (const m of s.meshes) {
      if (m !== ground && m !== stars && m !== earth) shadows.addShadowCaster(m);
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

/** Bilinear height sample from the field in world coords. */
function sampleField(
  field: { size: number; heights: Float32Array },
  x: number,
  z: number
): number {
  const n = field.size;
  const fx = ((x / GROUND_EXTENT) + 0.5) * (n - 1);
  const fz = ((z / GROUND_EXTENT) + 0.5) * (n - 1);
  const x0 = Math.max(0, Math.min(n - 2, Math.floor(fx)));
  const z0 = Math.max(0, Math.min(n - 2, Math.floor(fz)));
  const tx = Math.max(0, Math.min(1, fx - x0));
  const tz = Math.max(0, Math.min(1, fz - z0));
  const h = field.heights;
  const h00 = h[z0 * n + x0];
  const h10 = h[z0 * n + x0 + 1];
  const h01 = h[(z0 + 1) * n + x0];
  const h11 = h[(z0 + 1) * n + x0 + 1];
  return h00 * (1 - tx) * (1 - tz) + h10 * tx * (1 - tz) + h01 * (1 - tx) * tz + h11 * tx * tz;
}
