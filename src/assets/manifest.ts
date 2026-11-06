import { AbstractMesh, AnimationGroup, Scene, SceneLoader, Vector3 } from "@babylonjs/core";

/**
 * Optional real assets. Drop files into public/assets/ to upgrade visuals —
 * the game falls back to procedural stand-ins when a file is missing.
 * See scripts/fetch-assets.md for free NASA sources.
 */
export const OPTIONAL_ASSETS = {
  astronaut: "assets/models/astronaut.glb",
  // SpaceX Falcon 9 (Sketchfab CC-BY, artemycz) — used when present
  falcon9: "assets/models/falcon9/scene.gltf",
  // NASA Saturn V — fallback
  ship: "assets/models/ship.glb",
  moonColor: "assets/textures/moon_color.jpg",
  moonHeight: "assets/textures/moon_height.png",
  earthColor: "assets/textures/earth_color.jpg",
  starMap: "assets/textures/starmap.jpg"
} as const;

export interface LoadedModel {
  meshes: AbstractMesh[];
  animationGroups: AnimationGroup[];
}

/** Try to load a glTF/GLB model; returns null when the file isn't present. */
export async function tryLoadModel(
  url: string,
  scene: Scene
): Promise<LoadedModel | null> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    if (!res.ok) return null;
    const idx = url.lastIndexOf("/");
    const result = await SceneLoader.ImportMeshAsync(
      "",
      url.slice(0, idx + 1),
      url.slice(idx + 1),
      scene
    );
    return { meshes: result.meshes, animationGroups: result.animationGroups };
  } catch {
    return null;
  }
}

/** Load a texture if present, else null. */
export async function textureExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

export function vec(x: number, y: number, z: number): Vector3 {
  return new Vector3(x, y, z);
}
