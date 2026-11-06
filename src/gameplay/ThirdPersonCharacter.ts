import {
  AbstractMesh,
  AnimationGroup,
  Color3,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Ray,
  Scene,
  TransformNode,
  UniversalCamera,
  Vector3
} from "@babylonjs/core";
import { Input } from "../core/Input";
import { OPTIONAL_ASSETS, tryLoadModel } from "../assets/manifest";
import { normalizeModel, reparent } from "./Ship";

export interface CharacterOptions {
  walkSpeed?: number;
  runSpeed?: number;
  jumpHeight?: number;
  gravity?: number;
  cameraDistance?: number;
}

const CAPSULE_H = 1.8;
const CAPSULE_R = 0.32;
const STEP_UP_MAX = 0.55;
const MIN_CAM_DIST = 1.6;
const MAX_CAM_DIST = 60;

/**
 * Third-person astronaut with a kinematic, raycast-based controller.
 * Robust across flat pads and displaced heightfield terrain, no physics engine
 * required — gravity and ground/wall collision are resolved via raycasts.
 */
export class ThirdPersonCharacter {
  readonly root: Mesh; // invisible capsule; position = center of body
  readonly camera: UniversalCamera;
  private visual: TransformNode;
  private limbs: { armL: TransformNode; armR: TransformNode; legL: TransformNode; legR: TransformNode };
  private input: Input;
  private scene: Scene;
  private opts: Required<CharacterOptions>;

  private yaw = 0;
  private pitch = 0.25;
  private camDist: number;
  private walkPhase = 0;
  private grounded = false;
  private vy = 0;
  private enabled = true;
  private facingYaw = 0;
  private suitNodes: TransformNode[] = [];
  private hasSuitModel = false;
  private anims = new Map<string, AnimationGroup>();
  private currentAnim: AnimationGroup | null = null;
  /** When true the character stops driving the camera (cutscenes take over). */
  cameraFrozen = false;

  constructor(scene: Scene, input: Input, spawn: Vector3, opts: CharacterOptions = {}) {
    this.scene = scene;
    this.input = input;
    this.opts = {
      walkSpeed: opts.walkSpeed ?? 2.6,
      runSpeed: opts.runSpeed ?? 4.5,
      jumpHeight: opts.jumpHeight ?? 1.1,
      gravity: opts.gravity ?? 9.81,
      cameraDistance: opts.cameraDistance ?? 4.2
    };
    this.camDist = this.opts.cameraDistance;

    this.root = MeshBuilder.CreateCapsule(
      "player",
      { height: CAPSULE_H, radius: CAPSULE_R },
      scene
    );
    this.root.position.copyFrom(spawn);
    this.root.isVisible = false;
    this.root.isPickable = false;

    this.visual = new TransformNode("astro", scene);
    this.visual.parent = this.root;
    this.visual.position.y = -CAPSULE_H / 2; // capsule center → feet
    this.limbs = this.buildSuit();

    this.camera = new UniversalCamera("tpCam", spawn.add(new Vector3(0, 1.6, -4)), scene);
    this.camera.fov = 0.9;
    this.camera.minZ = 0.15;
    this.camera.maxZ = 8000;

    scene.onBeforeRenderObservable.add(() => this.update());
  }

  private buildSuit() {
    const s = this.scene;
    const white = new PBRMaterial("suit", s);
    white.albedoColor = new Color3(0.88, 0.88, 0.9);
    white.roughness = 0.75;
    white.metallic = 0.05;
    const orange = new PBRMaterial("suitAccent", s);
    orange.albedoColor = new Color3(0.9, 0.45, 0.1);
    orange.roughness = 0.6;
    const visor = new PBRMaterial("visor", s);
    visor.albedoColor = new Color3(0.9, 0.65, 0.15);
    visor.metallic = 1;
    visor.roughness = 0.15;
    const pack = new PBRMaterial("pack", s);
    pack.albedoColor = new Color3(0.75, 0.78, 0.8);
    pack.roughness = 0.5;
    pack.metallic = 0.4;

    const part = (name: string, mesh: Mesh, mat: PBRMaterial, parent: TransformNode, x: number, y: number, z: number) => {
      mesh.name = name;
      mesh.material = mat;
      mesh.parent = parent;
      mesh.position.set(x, y, z);
      mesh.isPickable = false;
      this.suitNodes.push(mesh);
      return mesh;
    };

    const torso = part("torso", MeshBuilder.CreateCapsule("t", { height: 0.62, radius: 0.2 }, s), white, this.visual, 0, 0.95, 0);
    torso.scaling.z = 0.8;
    const stripe = part("stripe", MeshBuilder.CreateBox("st", { width: 0.3, height: 0.08, depth: 0.12 }, s), orange, this.visual, 0, 1.05, 0.17);
    stripe.rotation.x = 0.15;
    part("helmet", MeshBuilder.CreateSphere("h", { diameter: 0.34, segments: 12 }, s), white, this.visual, 0, 1.5, 0);
    const v = part("visor", MeshBuilder.CreateSphere("v", { diameter: 0.28, segments: 12 }, s), visor, this.visual, 0, 1.5, 0.06);
    v.scaling.set(0.85, 0.7, 0.6);
    part("backpack", MeshBuilder.CreateBox("bp", { width: 0.4, height: 0.5, depth: 0.2 }, s), pack, this.visual, 0, 1.05, -0.24);

    const mkLimb = (name: string, x: number, y: number, len: number, mat: PBRMaterial): TransformNode => {
      const pivot = new TransformNode(name + "Pivot", s);
      pivot.parent = this.visual;
      pivot.position.set(x, y, 0);
      this.suitNodes.push(pivot);
      const limb = MeshBuilder.CreateCapsule(name, { height: len, radius: 0.075 }, s);
      limb.material = mat;
      limb.parent = pivot;
      limb.position.y = -len / 2;
      limb.isPickable = false;
      return pivot;
    };
    const armL = mkLimb("armL", -0.3, 1.28, 0.55, white);
    const armR = mkLimb("armR", 0.3, 1.28, 0.55, white);
    const legL = mkLimb("legL", -0.11, 0.68, 0.66, white);
    const legR = mkLimb("legR", 0.11, 0.68, 0.66, white);
    for (const leg of [legL, legR]) {
      const boot = MeshBuilder.CreateBox("boot", { width: 0.14, height: 0.08, depth: 0.24 }, s);
      boot.material = pack;
      boot.parent = leg;
      boot.position.set(0, -0.62, 0.05);
      boot.isPickable = false;
    }
    return { armL, armR, legL, legR };
  }

  get position(): Vector3 {
    return this.root.position;
  }

  /** Feet-level position. */
  get feet(): Vector3 {
    return this.root.position.subtract(new Vector3(0, CAPSULE_H / 2, 0));
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
    if (!v) this.vy = 0;
  }

  teleport(feetPos: Vector3): void {
    this.root.position.copyFrom(feetPos.add(new Vector3(0, CAPSULE_H / 2, 0)));
    this.vy = 0;
  }

  setCameraDistance(d: number): void {
    this.camDist = d;
  }

  /** Force the suit to face a direction (cutscenes, sitting). */
  setFacing(yaw: number): void {
    this.facingYaw = yaw;
    this.visual.rotation.y = yaw;
  }

  /** Replace the procedural suit with the rigged astronaut.glb when present. */
  async loadSuitModel(): Promise<void> {
    const model = await tryLoadModel(OPTIONAL_ASSETS.astronaut, this.scene);
    if (!model || this.hasSuitModel) return;
    const holder = new TransformNode("suitModel", this.scene);
    holder.parent = this.visual;
    reparent(model.meshes, holder);
    // Quaternius astronaut is already Y-up — scale + face only, no axis fix
    normalizeModel(holder, 1.78, 0, false);
    // re-run normalize once bind-pose bounds are final AND once after the
    // idle animation is playing — animation root motion shifts the mesh and
    // would otherwise leave the astronaut floating
    this.scene.onAfterRenderObservable.addOnce(() =>
      normalizeModel(holder, 1.78, 0, false)
    );
    setTimeout(() => normalizeModel(holder, 1.78, 0, false), 800);
    for (const g of model.animationGroups) {
      const short = g.name.includes("|") ? g.name.split("|")[1] : g.name;
      this.anims.set(short, g);
      g.stop();
    }
    for (const n of this.suitNodes) n.setEnabled(false);
    this.hasSuitModel = true;
  }

  /** Fuzzy anim lookup — works with any naming (Quaternius "Walk",
   *  Mixamo "mixamo.com|walking", "Human|Run", etc.). */
  private findAnim(keyword: string): AnimationGroup | undefined {
    const k = keyword.toLowerCase();
    // exact match first, then substring, prefer shortest name
    let best: AnimationGroup | undefined;
    for (const [name, g] of this.anims) {
      const n = name.toLowerCase();
      if (n === k) return g;
      if (n.includes(k) && (!best || name.length < best.name.length)) best = g;
    }
    return best;
  }

  /** Natural ground speed (m/s at speedRatio 1) per animation name —
   *  used to sync stride to actual velocity and avoid foot sliding. */
  private naturalSpeedOf(name: string): number {
    const n = name.toLowerCase();
    if (n.includes("moon_walk")) return 1.1;
    if (n.includes("run") || n.includes("jog") || n.includes("sprint")) return 5.0;
    if (n.includes("walk")) return 1.5;
    return 2.0;
  }

  private playAnim(keywords: string | string[], moveSpeed = 0): void {
    const list = Array.isArray(keywords) ? keywords : [keywords];
    const g = list.map((k) => this.findAnim(k)).find(Boolean) ??
      (this.anims.size === 1 ? this.anims.values().next().value : undefined);
    if (!g) return;
    const speedRatio = moveSpeed > 0
      ? Math.max(0.5, Math.min(5, moveSpeed / this.naturalSpeedOf(g.name)))
      : 1;
    if (this.currentAnim === g) {
      g.speedRatio = speedRatio;
      return;
    }
    this.currentAnim?.stop();
    g.start(true, speedRatio);
    this.currentAnim = g;
  }

  /** Sit pose: legs bent forward. */
  setSeated(seated: boolean): void {
    this.limbs.legL.rotation.x = seated ? -1.5 : 0;
    this.limbs.legR.rotation.x = seated ? -1.5 : 0;
    this.limbs.armL.rotation.x = seated ? -0.7 : 0;
    this.limbs.armR.rotation.x = seated ? -0.7 : 0;
  }

  private pickable = (m: AbstractMesh): boolean =>
    m.isPickable && m !== this.root && !m.isDescendantOf(this.root);

  /** Height of the surface just past a wall hit — used for step-up detection. */
  private stepHeightAt(hitPoint: Vector3, moveDir: Vector3): number {
    const from = hitPoint.add(moveDir.scale(0.3)).add(new Vector3(0, 1.5, 0));
    const ray = new Ray(from, Vector3.Down(), 3);
    const hit = this.scene.pickWithRay(ray, this.pickable);
    return hit?.hit && hit.pickedPoint ? hit.pickedPoint.y : Infinity;
  }

  private groundInfo(): { y: number; hit: boolean } {
    const from = this.root.position.add(new Vector3(0, 0.4, 0));
    const ray = new Ray(from, Vector3.Down(), CAPSULE_H);
    const hit = this.scene.pickWithRay(ray, this.pickable);
    if (hit?.hit && hit.pickedPoint) return { y: hit.pickedPoint.y, hit: true };
    return { y: -Infinity, hit: false };
  }

  private update(): void {
    const dt = Math.min(0.05, this.scene.getEngine().getDeltaTime() / 1000);
    const g = this.opts.gravity;

    if (this.enabled) {
      const sens = 0.0026;
      this.yaw += this.input.mouseDX * sens;
      this.pitch += this.input.mouseDY * sens;
      this.pitch = Math.max(-0.9, Math.min(1.35, this.pitch));
      // wheel zoom — generous max so the whole rocket/pad can be framed
      this.camDist = Math.max(
        MIN_CAM_DIST,
        Math.min(MAX_CAM_DIST, this.camDist + this.input.wheelDelta * 0.01)
      );
    }

    // --- desired horizontal motion ---
    const fwd = new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new Vector3(fwd.z, 0, -fwd.x);
    let move = Vector3.Zero();
    let speed = 0;
    if (this.enabled) {
      if (this.input.isDown("KeyW")) move = move.add(fwd);
      if (this.input.isDown("KeyS")) move = move.subtract(fwd);
      if (this.input.isDown("KeyD")) move = move.add(right);
      if (this.input.isDown("KeyA")) move = move.subtract(right);
      const running = this.input.isDown("ShiftLeft") || this.input.isDown("ShiftRight");
      speed = move.lengthSquared() > 0 ? (running ? this.opts.runSpeed : this.opts.walkSpeed) : 0;
      if (speed > 0) move = move.normalize();
    }

    if (speed > 0) {
      // wall check at knee + chest height; slide along hit normal.
      // Walkable slopes (steep-Y normals) and small steps are allowed through.
      let step = move.scale(speed * dt);
      for (const h of [0.25, 0.9, 1.6]) {
        const origin = this.feet.add(new Vector3(0, h, 0));
        const ray = new Ray(origin, move, CAPSULE_R + step.length() + 0.15);
        const hit = this.scene.pickWithRay(ray, this.pickable);
        if (hit?.hit && hit.getNormal(true)) {
          const n = hit.getNormal(true)!;
          if (Math.abs(n.y) > 0.5) continue; // ramp/floor slope — walkable
          if (h <= 0.3 && this.stepHeightAt(hit.pickedPoint!, move) - this.feet.y <= STEP_UP_MAX) {
            continue; // low step — the ground clamp below lifts us onto it
          }
          n.y = 0;
          if (n.lengthSquared() > 1e-4) {
            n.normalize();
            step = step.subtract(n.scale(Vector3.Dot(step, n))); // slide
          }
        }
      }
      this.root.position.x += step.x;
      this.root.position.z += step.z;
    }

    // --- gravity + ground clamp ---
    const ground = this.groundInfo();
    const feetY = this.feet.y;
    const stepDelta = ground.y - feetY;
    if (ground.hit && this.vy <= 0 && stepDelta <= STEP_UP_MAX && stepDelta >= -0.35) {
      // snap to ground (covers walking up small steps too)
      this.root.position.y += stepDelta;
      this.vy = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
      this.vy -= g * dt;
      this.root.position.y += this.vy * dt;
      // landed this frame?
      const g2 = this.groundInfo();
      if (g2.hit && this.feet.y <= g2.y && this.vy <= 0) {
        this.root.position.y += g2.y - this.feet.y;
        this.vy = 0;
        this.grounded = true;
      }
    }
    if (this.enabled && this.grounded && this.input.wasPressed("Space")) {
      this.vy = Math.sqrt(2 * g * this.opts.jumpHeight);
      this.grounded = false;
    }

    // --- facing + walk cycle ---
    if (speed > 0.1 && this.grounded) {
      const targetYaw = Math.atan2(move.x, move.z);
      let d = targetYaw - this.facingYaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.facingYaw += d * Math.min(1, 14 * dt);
      this.visual.rotation.y = this.facingYaw;
      this.walkPhase += dt * speed * 2.2;
      const sw = Math.sin(this.walkPhase) * Math.min(0.65, speed * 0.11);
      this.limbs.armL.rotation.x = sw;
      this.limbs.armR.rotation.x = -sw;
      this.limbs.legL.rotation.x = -sw;
      this.limbs.legR.rotation.x = sw;
      // rigid GLB suit gets a gentle walk bob instead of limb swing
      if (this.hasSuitModel) {
        this.visual.position.y = -CAPSULE_H / 2 + Math.abs(Math.sin(this.walkPhase)) * 0.05;
      }
    } else if (speed > 0.1) {
      // airborne: keep facing move dir, limbs drift
      const targetYaw = Math.atan2(move.x, move.z);
      let d = targetYaw - this.facingYaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.facingYaw += d * Math.min(1, 6 * dt);
      this.visual.rotation.y = this.facingYaw;
      this.limbs.legL.rotation.x += (-0.35 - this.limbs.legL.rotation.x) * 0.06;
      this.limbs.legR.rotation.x += (0.25 - this.limbs.legR.rotation.x) * 0.06;
    } else if (this.grounded) {
      for (const l of Object.values(this.limbs)) l.rotation.x *= 0.85;
      this.visual.position.y += (-CAPSULE_H / 2 - this.visual.position.y) * 0.2;
    }
    this.visual.rotation.x = this.grounded ? 0 : Math.max(-0.2, this.vy * -0.012);

    // --- animation state (rigged GLB suit) ---
    if (this.hasSuitModel) {
      if (!this.enabled || (this.grounded && speed < 0.1)) {
        this.playAnim(["idle", "stand", "breathing"]);
      } else if (!this.grounded) {
        this.playAnim(["floating", "jump", "idle"]);
      } else if (speed > this.opts.walkSpeed + 0.5) {
        this.playAnim(["run", "walk"], speed);
      } else {
        this.playAnim(["walk", "run", "idle"], speed);
      }
    }

    // --- third-person camera ---
    if (this.cameraFrozen) return;
    const head = this.root.position.add(new Vector3(0, CAPSULE_H / 2 - 0.25, 0));
    const back = new Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    ).normalize();
    let dist = this.camDist;
    const ray = new Ray(head, back, dist + 0.4);
    const hit = this.scene.pickWithRay(ray, this.pickable);
    if (hit?.hit && hit.pickedPoint) {
      dist = Math.max(0.6, Vector3.Distance(head, hit.pickedPoint) - 0.35);
    }
    this.camera.position.copyFrom(head.add(back.scale(dist)));
    this.camera.setTarget(head.add(fwd.scale(1.2)));
  }

  get cameraYaw(): number {
    return this.yaw;
  }

  dispose(): void {
    this.camera.dispose();
    this.root.dispose(false, true);
  }
}
