import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import HavokPhysics from "@babylonjs/havok";
import { Scene, Vector3 } from "@babylonjs/core";

let havokPromise: Promise<unknown> | null = null;

function getHavok(): Promise<unknown> {
  if (!havokPromise) {
    havokPromise = (HavokPhysics as unknown as (opts: {
      locateFile: () => string;
    }) => Promise<unknown>)({ locateFile: () => "/HavokPhysics.wasm" });
  }
  return havokPromise;
}

/** Enable Havok physics on a scene; WASM is fetched once and cached. */
export async function enablePhysics(scene: Scene, gravity: Vector3): Promise<void> {
  const havok = await getHavok();
  scene.enablePhysics(gravity, new HavokPlugin(true, havok));
}
