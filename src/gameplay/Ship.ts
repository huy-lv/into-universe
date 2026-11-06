import {
  AbstractMesh,
  Color3,
  Matrix,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  TransformNode,
  Vector3
} from "@babylonjs/core";
import { OPTIONAL_ASSETS, tryLoadModel } from "../assets/manifest";

/**
 * Auto-orient/scale a loaded model: tallest axis → +Y, uniform scale to
 * targetH, XZ centered on the node's origin, feet/base resting at local y=0.
 * Works regardless of the node's parent (bounds are evaluated in world space
 * then converted back to parent space).
 */
export function normalizeModel(
  node: TransformNode,
  targetH: number,
  yaw = 0,
  fixUpAxis = true
): void {
  const bounds = () => {
    node.getChildMeshes(false).forEach((m) => {
      m.computeWorldMatrix(true);
      if (m.skeleton) m.refreshBoundingInfo({ applySkeleton: true });
    });
    return node.getHierarchyBoundingVectors();
  };
  node.rotation.y = yaw;
  let { min, max } = bounds();
  let size = max.subtract(min);
  if (fixUpAxis && size.z > size.y && size.z > size.x) {
    node.rotation.x = -Math.PI / 2; // Z-up → Y-up
  } else if (fixUpAxis && size.x > size.y && size.x > size.z) {
    node.rotation.z = Math.PI / 2; // X-up → Y-up
  }
  ({ min, max } = bounds());
  size = max.subtract(min);
  node.scaling.scaleInPlace(targetH / Math.max(size.y, 1e-6));
  ({ min, max } = bounds());
  const parent = node.parent as TransformNode | null;
  const inv = parent ? parent.getWorldMatrix().clone().invert() : Matrix.Identity();
  const c = Vector3.TransformCoordinates(Vector3.Center(min, max), inv);
  const base = Vector3.TransformCoordinates(new Vector3(0, min.y, 0), inv);
  node.position.subtractInPlace(new Vector3(c.x, base.y, c.z));
}

/** Parent loose top-level loaded meshes under a single root node. */
export function reparent(meshes: AbstractMesh[], root: TransformNode): void {
  for (const m of meshes) if (!m.parent) m.parent = root;
}

export const SHIP_HEIGHT = 70;

/** Scenery nodes baked into the Sketchfab Falcon 9 scene (drone-ship deck,
 *  backdrop boards) — dropped so only the rocket remains. */
const FALCON9_SCENERY = /^(Plane\.010|Cube)/;

/** Real-world heights (m): Falcon 9 ≈ 70 m, Saturn V ≈ 110 m. */
const FALCON9_HEIGHT = 70;
const SATURN_V_HEIGHT = 110;

/** Load a real ship model — prefers SpaceX Falcon 9, falls back to NASA
 *  Saturn V, then to the procedural rocket. Scaled to true size so the
 *  ~1.8 m astronaut reads correctly next to it. */
export async function loadShip(scene: Scene): Promise<TransformNode> {
  let model = await tryLoadModel(OPTIONAL_ASSETS.falcon9, scene);
  if (model) {
    for (const m of model.meshes) if (FALCON9_SCENERY.test(m.name)) m.dispose();
    const root = new TransformNode("ship", scene);
    reparent(model.meshes.filter((m) => !m.isDisposed()), root);
    normalizeModel(root, FALCON9_HEIGHT);
    return root;
  }
  model = await tryLoadModel(OPTIONAL_ASSETS.ship, scene);
  if (!model) return buildShip(scene);
  const root = new TransformNode("ship", scene);
  reparent(model.meshes, root);
  normalizeModel(root, SATURN_V_HEIGHT);
  return root;
}

/** Procedural rocket/spacecraft used at the pad, in space, and on the Moon. */
export function buildShip(scene: Scene): TransformNode {
  const root = new TransformNode("ship", scene);

  const hull = new PBRMaterial("hull", scene);
  hull.albedoColor = new Color3(0.92, 0.92, 0.94);
  hull.metallic = 0.55;
  hull.roughness = 0.35;

  const dark = new PBRMaterial("hullDark", scene);
  dark.albedoColor = new Color3(0.12, 0.12, 0.14);
  dark.metallic = 0.7;
  dark.roughness = 0.4;

  const glass = new PBRMaterial("shipGlass", scene);
  glass.albedoColor = new Color3(0.1, 0.15, 0.22);
  glass.metallic = 1;
  glass.roughness = 0.08;

  const attach = (m: Mesh, mat: PBRMaterial, x: number, y: number, z: number): Mesh => {
    m.material = mat;
    m.parent = root;
    m.position.set(x, y, z);
    return m;
  };

  // main body
  attach(MeshBuilder.CreateCylinder("body", { height: 16, diameter: 3.4, tessellation: 32 }, scene), hull, 0, 8, 0);
  // capsule nose
  attach(MeshBuilder.CreateCylinder("nose", { height: 4, diameterTop: 0.4, diameterBottom: 3.4, tessellation: 32 }, scene), hull, 0, 18, 0);
  const tip = attach(MeshBuilder.CreateSphere("tip", { diameter: 0.7 }, scene), hull, 0, 20, 0);
  tip.scaling.y = 1.4;
  // window band
  attach(MeshBuilder.CreateCylinder("windows", { height: 0.9, diameter: 3.45, tessellation: 32 }, scene), glass, 0, 16.4, 0);
  // black service band
  attach(MeshBuilder.CreateCylinder("band", { height: 1.6, diameter: 3.42, tessellation: 32 }, scene), dark, 0, 2.2, 0);
  // engine bell cluster
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const noz = attach(
      MeshBuilder.CreateCylinder("noz" + i, { height: 1.6, diameterTop: 0.5, diameterBottom: 1.1, tessellation: 16 }, scene),
      dark,
      Math.cos(a) * (i === 0 ? 0 : 1.0),
      -0.6,
      Math.sin(a) * (i === 0 ? 0 : 1.0)
    );
    noz.rotation.x = i === 0 ? 0 : Math.sin(a) * 0.08;
    noz.rotation.z = i === 0 ? 0 : -Math.cos(a) * 0.08;
  }
  // fins
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const fin = MeshBuilder.CreateBox("fin" + i, { width: 0.18, height: 5, depth: 2.4 }, scene);
    fin.material = dark;
    fin.parent = root;
    fin.position.set(Math.cos(a) * 2.1, 2.2, Math.sin(a) * 2.1);
    fin.rotation.y = -a;
  }
  // hatch door marker (orange ring + door)
  const doorMat = new PBRMaterial("doorMat", scene);
  doorMat.albedoColor = new Color3(0.85, 0.4, 0.1);
  doorMat.metallic = 0.4;
  doorMat.roughness = 0.5;
  attach(MeshBuilder.CreateBox("door", { width: 0.9, height: 1.4, depth: 0.1 }, scene), doorMat, 0, 4.2, 1.72);

  return root;
}

/** Simple landed pose helper: place ship so nozzle base sits at ground. */
export function groundShip(ship: TransformNode, groundY: number): void {
  ship.position.y = groundY + 1.4;
}
