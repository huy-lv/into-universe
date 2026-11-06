import { DynamicTexture, Scene, Texture } from "@babylonjs/core";
import { Noise } from "../utils/Noise";

/** Procedural textures so the game runs without downloaded NASA assets.
 *  Real NASA maps can replace these — see scripts/fetch-assets.md. */

export function makeStarTexture(scene: Scene, size = 2048): DynamicTexture {
  const tex = new DynamicTexture("stars", size, scene, true);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = d[i + 1] = d[i + 2] = 0;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const rand = Noise.mulberry(42);
  // ~6000 stars of varying brightness
  for (let i = 0; i < 6000; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const b = rand();
    const r = b > 0.97 ? 2.2 : b > 0.85 ? 1.4 : 0.8;
    const alpha = 0.35 + b * 0.65;
    const tint = rand();
    const col =
      tint > 0.9 ? "255,220,190" : tint > 0.75 ? "190,210,255" : "255,255,255";
    ctx.fillStyle = `rgba(${col},${alpha.toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  tex.update();
  tex.wrapU = tex.wrapV = Texture.WRAP_ADDRESSMODE;
  return tex;
}

/** Rough Earth-like equirectangular map: oceans, continents, ice caps, clouds baked in. */
export function makeEarthTexture(scene: Scene, w = 1024, h = 512): DynamicTexture {
  const tex = new DynamicTexture("earth", { width: w, height: h }, scene, true);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const noise = new Noise(7);
  const noise2 = new Noise(99);
  for (let y = 0; y < h; y++) {
    const lat = (y / h - 0.5) * Math.PI; // -pi/2..pi/2
    for (let x = 0; x < w; x++) {
      // sample noise on a torus so the map wraps seamlessly in x
      const a = (x / w) * Math.PI * 2;
      const nx = Math.cos(a) * 1.6;
      const ny = Math.sin(a) * 1.6;
      const cont = noise.fbm2(nx + 13.7, ny + lat * 3.2 + 41.0, 5);
      const detail = noise.fbm2(nx * 3.1 + 90, ny * 3.1 + lat * 7.5, 4);
      const cloud = noise2.fbm2(nx * 2.0 + 300, ny * 2.0 + lat * 9.0, 4);
      const i = (y * w + x) * 4;
      const ice = Math.abs(lat) > 1.25 - detail * 0.08;
      let r: number, g: number, b: number;
      if (ice) {
        r = 235; g = 242; b = 248;
      } else if (cont + detail * 0.25 > 0.16) {
        // land: mix green/brown
        const dry = detail * 0.5 + 0.5;
        r = 70 + dry * 120;
        g = 95 + dry * 55;
        b = 45 + dry * 30;
      } else {
        // ocean: depth shading
        const depth = 0.5 + cont;
        r = 10 + depth * 20;
        g = 40 + depth * 45;
        b = 90 + depth * 80;
      }
      if (cloud > 0.28) {
        const c = Math.min(1, (cloud - 0.28) * 3.2);
        r = r + (255 - r) * c;
        g = g + (255 - g) * c;
        b = b + (255 - b) * c;
      }
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.update();
  return tex;
}

export interface MoonHeightField {
  size: number;          // vertices per side
  heights: Float32Array; // row-major, meters
  minH: number;
  maxH: number;
}

/** Lunar-like heightfield: fbm plains + randomized craters with raised rims. */
export function makeMoonHeightField(size = 256, extent = 4000, seed = 2024): MoonHeightField {
  const noise = new Noise(seed);
  const rand = Noise.mulberry(seed * 31 + 7);
  const heights = new Float32Array(size * size);

  // craters: [cx, cy, radius, depth] in world units
  const craters: [number, number, number, number][] = [];
  for (let i = 0; i < 90; i++) {
    const r = 15 + rand() * rand() * 380;
    craters.push([
      (rand() - 0.5) * extent * 1.4,
      (rand() - 0.5) * extent * 1.4,
      r,
      r * (0.10 + rand() * 0.12)
    ]);
  }
  // guarantee a flat-ish landing zone near origin
  craters.push([0, 0, 300, 0]);

  let minH = Infinity, maxH = -Infinity;
  for (let iz = 0; iz < size; iz++) {
    for (let ix = 0; ix < size; ix++) {
      const wx = (ix / (size - 1) - 0.5) * extent;
      const wz = (iz / (size - 1) - 0.5) * extent;
      let hgt = noise.fbm2(wx * 0.0009, wz * 0.0009, 5) * 55;
      hgt += noise.fbm2(wx * 0.008, wz * 0.008, 3) * 4; // small roughness
      for (const [cx, cy, cr, cd] of craters) {
        const dx = wx - cx, dz = wz - cy;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (cd === 0) {
          // flat pad: smooth the terrain inside
          if (dist < cr) {
            const t = smoothstep(dist / cr);
            hgt *= t;
          }
          continue;
        }
        const rr = dist / cr;
        if (rr < 1) {
          // bowl
          hgt -= cd * (1 - rr * rr);
        } else if (rr < 1.35) {
          // rim
          const rim = 1 - (rr - 1) / 0.35;
          hgt += cd * 0.35 * rim * rim;
        }
      }
      heights[iz * size + ix] = hgt;
      if (hgt < minH) minH = hgt;
      if (hgt > maxH) maxH = hgt;
    }
  }
  return { size, heights, minH, maxH };
}

function smoothstep(t: number): number {
  t = Math.min(1, Math.max(0, t));
  return t * t * (3 - 2 * t);
}

/** Regolith albedo generated from the same field-ish noise (not slope-shaded;
 * the material lighting does that). */
export function makeMoonTexture(scene: Scene, w = 1024, h = 1024): DynamicTexture {
  const tex = new DynamicTexture("moon", { width: w, height: h }, scene, true);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const noise = new Noise(555);
  const rand = Noise.mulberry(777);
  // dark maria patches
  const maria: [number, number, number][] = [];
  for (let i = 0; i < 14; i++) maria.push([rand() * w, rand() * h, 60 + rand() * 240]);
  // sprinkle small craters into the texture
  const pocks: [number, number, number][] = [];
  for (let i = 0; i < 900; i++) pocks.push([rand() * w, rand() * h, 1 + rand() * rand() * 22]);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = noise.fbm2(x * 0.012, y * 0.012, 5) * 0.5 + 0.5;
      const n2 = noise.fbm2(x * 0.06 + 400, y * 0.06, 3) * 0.5 + 0.5;
      let v = 148 + n * 55 + n2 * 28 - 14;
      for (const [mx, my, mr] of maria) {
        const dx = x - mx, dy = y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < mr) {
          const t = smoothstep(1 - dist / mr);
          v -= t * 55;
        }
      }
      const i = (y * w + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = Math.max(60, Math.min(230, v));
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // overlay small bright-rim craters
  for (const [px, py, pr] of pocks) {
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = Math.max(1, pr * 0.12);
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,0.10)";
    ctx.beginPath();
    ctx.arc(px, py, pr * 0.85, 0, Math.PI * 2);
    ctx.fill();
  }
  tex.update();
  tex.wrapU = tex.wrapV = Texture.WRAP_ADDRESSMODE;
  return tex;
}

/** Concrete/asphalt texture for the launch site. */
export function makeConcreteTexture(scene: Scene, size = 512, seed = 11, base = 128): DynamicTexture {
  const tex = new DynamicTexture("concrete", size, scene, true);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const noise = new Noise(seed);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = noise.fbm2(x * 0.02, y * 0.02, 4) * 0.5 + 0.5;
      const grain = noise.fbm2(x * 0.35 + 90, y * 0.35, 2) * 0.5 + 0.5;
      const v = base + (n - 0.5) * 40 + (grain - 0.5) * 26;
      const i = (y * size + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, v));
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.update();
  tex.wrapU = tex.wrapV = Texture.WRAP_ADDRESSMODE;
  return tex;
}

/** Spacecraft instrument panel texture: dark panels, screens, indicator lights. */
export function makePanelTexture(scene: Scene, w = 1024, h = 512): DynamicTexture {
  const tex = new DynamicTexture("panel", { width: w, height: h }, scene, true);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  // light-gray cabin walls (Dragon/ISS style), darker instrument faces
  ctx.fillStyle = "#8f97a3";
  ctx.fillRect(0, 0, w, h);
  const rand = Noise.mulberry(31);
  const cols = 8, rows = 4;
  const cw = w / cols, ch = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cw + 6, y = r * ch + 6, pw = cw - 12, ph = ch - 12;
      ctx.fillStyle = "#6d7580";
      ctx.fillRect(x, y, pw, ph);
      ctx.strokeStyle = "#4a5160";
      ctx.strokeRect(x, y, pw, ph);
      const kind = rand();
      if (kind > 0.55) {
        // screen
        const g = ctx.createLinearGradient(x, y, x, y + ph);
        g.addColorStop(0, "#123048");
        g.addColorStop(1, "#0a1826");
        ctx.fillStyle = g;
        ctx.fillRect(x + 6, y + 6, pw - 12, ph - 26);
        ctx.strokeStyle = "rgba(90,180,255,0.5)";
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const yy = y + 10 + ((ph - 40) * i) / 5;
          ctx.moveTo(x + 8, yy);
          ctx.lineTo(x + pw - 8, yy);
        }
        ctx.stroke();
      } else {
        // buttons / indicators
        for (let i = 0; i < 12; i++) {
          const bx = x + 10 + (i % 4) * ((pw - 20) / 3.5);
          const by = y + 12 + Math.floor(i / 4) * ((ph - 24) / 2.5);
          const on = rand() > 0.5;
          ctx.fillStyle = on
            ? ["#4ade80", "#fbbf24", "#60a5fa", "#f87171"][Math.floor(rand() * 4)]
            : "#22262e";
          ctx.beginPath();
          ctx.arc(bx, by, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
  tex.update();
  return tex;
}

/** Soft radial particle sprite. */
export function makeParticleTexture(scene: Scene, size = 64): DynamicTexture {
  const tex = new DynamicTexture("particle", size, scene, true);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,220,160,0.6)");
  g.addColorStop(1, "rgba(255,180,80,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  tex.update();
  return tex;
}

/** Streak sprite for warp lines. */
export function makeStreakTexture(scene: Scene, w = 16, h = 128): DynamicTexture {
  const tex = new DynamicTexture("streak", { width: w, height: h }, scene, true);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "rgba(150,200,255,0)");
  g.addColorStop(0.5, "rgba(200,230,255,0.9)");
  g.addColorStop(1, "rgba(150,200,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  tex.update();
  return tex;
}
