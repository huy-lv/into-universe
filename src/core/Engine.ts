import {
  Camera,
  DefaultRenderingPipeline,
  Engine,
  ImageProcessingConfiguration,
  Scene
} from "@babylonjs/core";

export function createEngine(canvas: HTMLCanvasElement): Engine {
  const engine = new Engine(canvas, true, {
    stencil: true,
    antialias: true,
    adaptToDeviceRatio: true
  });
  window.addEventListener("resize", () => engine.resize());
  return engine;
}

/** Photorealistic-ish post pipeline: ACES tone mapping + bloom + FXAA + vignette. */
export function applyPipeline(scene: Scene, camera: Camera): DefaultRenderingPipeline {
  const rp = new DefaultRenderingPipeline("rp", true, scene, [camera]);
  rp.fxaaEnabled = true;
  rp.bloomEnabled = true;
  rp.bloomThreshold = 0.72;
  rp.bloomWeight = 0.28;
  rp.bloomScale = 0.5;
  rp.imageProcessingEnabled = true;
  rp.imageProcessing.toneMappingEnabled = true;
  rp.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  rp.imageProcessing.exposure = 1.05;
  rp.imageProcessing.contrast = 1.15;
  rp.imageProcessing.vignetteEnabled = true;
  rp.imageProcessing.vignetteWeight = 1.6;
  rp.imageProcessing.vignetteColor.r = 0;
  rp.imageProcessing.vignetteColor.g = 0;
  rp.imageProcessing.vignetteColor.b = 0;
  return rp;
}
