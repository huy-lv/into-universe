import {
  Color3,
  Color4,
  Curve3,
  DirectionalLight,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  Scene,
  StandardMaterial,
  TransformNode,
  UniversalCamera,
  Vector3
} from "@babylonjs/core";
import { GameAPI } from "../core/Game";
import { applyPipeline } from "../core/Engine";
import { Cutscene } from "../gameplay/Cutscene";
import { loadShip } from "../gameplay/Ship";
import {
  makeEarthTexture,
  makeMoonTexture,
  makeParticleTexture,
  makeStarTexture
} from "../gameplay/ProceduralTextures";
import { GameScene } from "./GameScene";
import { Noise } from "../utils/Noise";

const EARTH_POS = new Vector3(-380, -60, -80);
const EARTH_R = 110;
const MOON_POS = new Vector3(380, -30, 80);
const MOON_R = 30;
const FLIGHT_TIME = 22;

export class SpaceScene implements GameScene {
  readonly scene: Scene;
  readonly ready: Promise<void>;

  constructor(private game: GameAPI, params: Record<string, unknown>) {
    const s = (this.scene = new Scene(game.engine));
    s.clearColor = new Color4(0.005, 0.005, 0.012, 1);
    const toMoon = params["dir"] !== "toEarth";

    // ---------- starfield ----------
    const starMat = new StandardMaterial("starMat", s);
    starMat.emissiveTexture = makeStarTexture(s, 2048);
    starMat.diffuseColor = new Color3(0, 0, 0);
    starMat.specularColor = new Color3(0, 0, 0);
    starMat.backFaceCulling = false;
    const stars = MeshBuilder.CreateSphere("stars", { diameter: 9000, segments: 16 }, s);
    stars.material = starMat;
    stars.infiniteDistance = true;
    stars.isPickable = false;

    // ---------- sun light ----------
    const sunDir = new Vector3(-0.7, -0.25, -0.55).normalize();
    const sun = new DirectionalLight("sun", sunDir, s);
    sun.intensity = 3.2;
    const sunBall = MeshBuilder.CreateSphere("sunBall", { diameter: 60, segments: 8 }, s);
    sunBall.position = sunDir.scale(-4000);
    const sunMat = new StandardMaterial("sunMat", s);
    sunMat.emissiveColor = new Color3(1, 0.95, 0.85);
    sunMat.disableLighting = true;
    sunBall.material = sunMat;
    sunBall.isPickable = false;

    // ---------- Earth ----------
    const earth = MeshBuilder.CreateSphere("earth", { diameter: EARTH_R * 2, segments: 48 }, s);
    earth.position = EARTH_POS;
    const eMat = new StandardMaterial("eMat", s);
    eMat.diffuseTexture = makeEarthTexture(s);
    eMat.specularColor = new Color3(0.15, 0.2, 0.3);
    earth.material = eMat;
    earth.isPickable = false;
    // atmosphere shell
    const atmo = MeshBuilder.CreateSphere("atmo", { diameter: EARTH_R * 2 + 8, segments: 48 }, s);
    atmo.position = EARTH_POS;
    const aMat = new StandardMaterial("aMat", s);
    aMat.emissiveColor = new Color3(0.25, 0.45, 0.9);
    aMat.alpha = 0.14;
    aMat.disableLighting = true;
    aMat.backFaceCulling = false;
    atmo.material = aMat;
    atmo.isPickable = false;

    // ---------- Moon ----------
    const moon = MeshBuilder.CreateSphere("moon", { diameter: MOON_R * 2, segments: 40 }, s);
    moon.position = MOON_POS;
    const mMat = new StandardMaterial("mMat", s);
    mMat.diffuseTexture = makeMoonTexture(s, 512, 256);
    mMat.specularColor = new Color3(0.02, 0.02, 0.02);
    moon.material = mMat;
    moon.isPickable = false;

    // ---------- ship + flight path (real Saturn V when available) ----------
    const shipHolder = new TransformNode("shipHolder", s);
    shipHolder.scaling = new Vector3(0.4, 0.4, 0.4); // ~28 m on screen vs 110 m Earth
    const shipReady = loadShip(s).then((ship) => {
      ship.parent = shipHolder;
      ship.getChildMeshes().forEach((m) => (m.isPickable = false));
    });

    const earthSide = EARTH_POS.add(new Vector3(90, 45, 40));
    const moonSide = MOON_POS.add(new Vector3(-55, 15, -20));
    const p0 = toMoon ? earthSide : moonSide;
    const p3 = toMoon ? moonSide : earthSide;
    const p1 = p0.add(p3.subtract(p0).scale(0.3)).add(new Vector3(0, 60, 80));
    const p2 = p0.add(p3.subtract(p0).scale(0.7)).add(new Vector3(0, -30, -60));
    const path = Curve3.CreateCatmullRomSpline([p0, p1, p2, p3], 60, false);
    const pathPts = path.getPoints();
    const pathAt = (k: number): Vector3 => {
      const f = Math.max(0, Math.min(1, k)) * (pathPts.length - 1);
      const i = Math.min(pathPts.length - 2, Math.floor(f));
      return Vector3.Lerp(pathPts[i], pathPts[i + 1], f - i);
    };

    const cam = new UniversalCamera("spaceCam", p0, s);
    cam.fov = 0.85;
    cam.minZ = 0.5;
    cam.maxZ = 20000;
    applyPipeline(s, cam);
    s.activeCamera = cam;

    // ---------- warp streak particles ----------
    const streaks = new ParticleSystem("streaks", 400, s);
    streaks.particleTexture = makeParticleTexture(s);
    streaks.emitter = cam.position.clone();
    streaks.minEmitBox = new Vector3(-60, -40, 60);
    streaks.maxEmitBox = new Vector3(60, 40, 120);
    streaks.direction1 = new Vector3(0, 0, -400);
    streaks.direction2 = new Vector3(0, 0, -800);
    streaks.minSize = 0.4;
    streaks.maxSize = 0.7;
    streaks.minScaleX = 0.15;
    streaks.maxScaleX = 0.3;
    streaks.minScaleY = 8;
    streaks.maxScaleY = 16;
    streaks.minLifeTime = 0.1;
    streaks.maxLifeTime = 0.4;
    streaks.emitRate = 0;
    streaks.blendMode = ParticleSystem.BLENDMODE_ADD;

    // engine exhaust glow (always on, subtle)
    const exhaust = new ParticleSystem("exhaust", 200, s);
    exhaust.particleTexture = makeParticleTexture(s);
    exhaust.minEmitBox = new Vector3(-0.4, 0, -0.4);
    exhaust.maxEmitBox = new Vector3(0.4, 0, 0.4);
    exhaust.direction1 = new Vector3(-0.5, -12, -0.5);
    exhaust.direction2 = new Vector3(0.5, -18, 0.5);
    exhaust.minSize = 1.2;
    exhaust.maxSize = 2.5;
    exhaust.minLifeTime = 0.15;
    exhaust.maxLifeTime = 0.5;
    exhaust.emitRate = 120;
    exhaust.blendMode = ParticleSystem.BLENDMODE_ADD;
    exhaust.emitter = new Vector3(0, 0, 0);

    // ---------- flight cutscene ----------
    game.audio.unlock();
    game.audio.startRumble();
    game.hud.setHint("");

    const rng = Noise.mulberry(8);
    let warp = 0;
    const destName = toMoon ? "Mặt Trăng" : "Trái Đất";
    const cut = new Cutscene(s);
    cut
      .at(0.5, () =>
        game.hud.showSubtitle(toMoon ? "Đốt phóng quỹ đạo — đặt hướng đến Mặt Trăng." : "Bắt đầu hành trình quay về Trái Đất.")
      )
      .at(6.0, () => game.hud.showSubtitle("Kích hoạt chế độ tăng tốc — WARP."))
      .at(6.3, () => (streaks.emitRate = 500))
      .at(15.5, () => {
        streaks.emitRate = 0;
        game.hud.showSubtitle(`Đang tiếp cận ${destName}...`);
      })
      .at(19.0, () => game.hud.showSubtitle(`Chuẩn bị hạ cánh xuống ${destName}.`))
      .onUpdate((t) => {
        const k = easeInOut(Math.min(1, t / FLIGHT_TIME));
        const pos = pathAt(k);
        const posAhead = pathAt(k + 0.005);
        shipHolder.position.copyFrom(pos);
        // orient ship along path (+Y up)
        const dir = posAhead.subtract(pos).normalize();
        const yaw = Math.atan2(dir.x, dir.z);
        const pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
        shipHolder.rotation.set(0, yaw, 0);
        shipHolder.rotation.x = -pitch;
        // exhaust under engine nozzles (local -Y → world)
        const world = shipHolder.getWorldMatrix();
        exhaust.emitter = Vector3.TransformCoordinates(new Vector3(0, -1.4, 0), world);

        // chase camera
        const camOffset = pos.add(dir.scale(-13)).add(new Vector3(0, 4.5, 0));
        cam.position.copyFrom(camOffset);
        cam.setTarget(pos.add(dir.scale(30)));

        // warp intensity curve
        const inWarp = t > 6.3 && t < 15.5;
        warp += ((inWarp ? 1 : 0) - warp) * 0.03;
        game.audio.setRumble(0.3 + warp * 0.55);
        cam.fov = 0.85 + warp * 0.12;
        streaks.emitter = cam.position.add(dir.scale(50));
        // subtle ship shake
        shipHolder.position.addInPlace(new Vector3((rng() - 0.5) * 0.15 * (0.4 + warp), (rng() - 0.5) * 0.15 * (0.4 + warp), 0));

        if (toMoon) {
          game.hud.setHint(`ĐỊCH: MẶT TRĂNG — ${(384400 * (1 - k)).toFixed(0)} km`);
        } else {
          game.hud.setHint(`ĐỊCH: TRÁI ĐẤT — ${(384400 * (1 - k)).toFixed(0)} km`);
        }
      });

    void cut.play(FLIGHT_TIME + 1).then(() => {
      game.audio.stopRumble();
      game.hud.hideSubtitle();
      game.goTo(toMoon ? "moon" : "launch");
    });

    this.ready = shipReady;
  }

  dispose(): void {
    this.scene.dispose();
  }
}

function easeInOut(t: number): number {
  return t * t * (3 - 2 * t);
}
