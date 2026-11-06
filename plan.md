# Into Universe — Game 3D du hành vũ trụ trên web (Babylon.js)

Game 3D photorealistic trên trình duyệt: phi hành gia góc nhìn thứ 3 đi bộ ở bãi phóng Trái Đất, vào tàu vũ trụ, xem cảnh cất cánh, du hành đến Mặt Trăng, hạ cánh và đi bộ trên bề mặt dựng từ heightmap NASA. MVP: Earth → Moon, toàn bộ asset miễn phí.

## Vòng gameplay MVP

1. **Bãi phóng (Trái Đất)** — đi bộ góc nhìn thứ 3, tiến đến tàu, nhấn E để vào tàu
2. **Bên trong tàu** — cabin/buồng lái, ngồi vào ghế → chuỗi cất cánh cinematic (rung camera, particle, âm thanh)
3. **Không gian** — tàu rời Trái Đất, cảnh quỹ đạo, warp đến Mặt Trăng
4. **Mặt Trăng** — hạ cánh, ra khỏi tàu, đi bộ trên terrain NASA (gravity 1.62 m/s²), quay lại tàu để về Trái Đất (loop)

## Công nghệ

- **Babylon.js** (`@babylonjs/core`) + **Vite** + **TypeScript**
- **Havok Physics** (`@babylonjs/havok`, WASM) — character controller + va chạm terrain
- **DefaultRenderingPipeline**: bloom, SSAO, FXAA, vignette, tone mapping → photorealistic
- Asset miễn phí, không cần API key:
  - `nasa/NASA-3D-Resources`: tàu vũ trụ, texture panel buồng lái
  - NASA SVS **CGI Moon Kit**: color map + displacement/heightmap Mặt Trăng (LRO)
  - NASA **Blue Marble** + Hipparcos/Tycho star map
  - Bãi phóng: terrain procedural + PBR texture miễn phí (PolyHaven/ambientCG)
  - Model phi hành gia rigged: GLB miễn phí (Mixamo/Quaternius/NASA); fallback capsule
  - **Không** dùng Google Photorealistic 3D Tiles (trả phí)

## Cấu trúc dự án

```
into-universe/
├── index.html
├── package.json, tsconfig.json, vite.config.ts
├── public/assets/
│   ├── models/      # astronaut.glb, ship.glb
│   ├── textures/    # moon_color.jpg, moon_height.png, earth_*.jpg, starmap.jpg
│   └── audio/       # engine, ambience, ui
├── src/
│   ├── main.ts                  # bootstrap
│   ├── core/
│   │   ├── Engine.ts            # Babylon engine + pipeline
│   │   ├── Game.ts              # state machine các scene
│   │   ├── SceneLoader.ts       # chuyển scene + loading screen
│   │   └── Input.ts             # keyboard/mouse + pointer lock
│   ├── scenes/
│   │   ├── LaunchSiteScene.ts   # bãi phóng Trái Đất
│   │   ├── InteriorScene.ts     # trong tàu + cất cánh
│   │   ├── SpaceScene.ts        # quỹ đạo + warp
│   │   └── MoonScene.ts         # bề mặt Mặt Trăng
│   ├── gameplay/
│   │   ├── ThirdPersonCharacter.ts  # controller + camera quay quanh
│   │   ├── Interactable.ts          # hệ thống "nhấn E"
│   │   ├── Cutscene.ts              # timeline animation, camera rails
│   │   └── Gravity.ts               # g theo thiên thể
│   ├── ui/
│   │   ├── HUD.ts               # prompt, subtitle cutscene
│   │   └── MainMenu.ts
│   └── assets/
│       └── manifest.ts          # danh sách asset + loader
├── scripts/
│   └── fetch-assets.md          # hướng dẫn/link tải asset NASA
└── plan.md
```

## Các bước triển khai

### Giai đoạn 1 — Nền tảng
1. Scaffold Vite + TS, cài `@babylonjs/core`, `@babylonjs/havok`, `@babylonjs/loaders`, `@babylonjs/gui`
2. Engine setup + DefaultRenderingPipeline (bloom, FXAA, vignette)
3. `Game.ts` state machine + `SceneLoader` với loading screen
4. Input: WASD, orbit camera, pointer lock, phím E

### Giai đoạn 2 — Character controller
5. `ThirdPersonCharacter`: capsule physics (Havok), di chuyển theo hướng camera, jump, gravity config được
6. Camera follow-orbit, collision-aware

### Giai đoạn 3 — Bãi phóng Trái Đất
7. Ground terrain + PBR, launch pad, tàu vũ trụ, directional light + sky
8. Interactable: prompt "Nhấn E để vào tàu" → InteriorScene

### Giai đoạn 4 — Trong tàu + cất cánh
9. InteriorScene: cabin đơn giản + texture panel NASA
10. Ngồi ghế → cutscene đếm ngược, rung lắc, particle động cơ, camera rails → fade sang SpaceScene

### Giai đoạn 5 — Không gian
11. SpaceScene: Earth sphere (Blue Marble + atmosphere glow), Moon, starfield skybox, tàu bay theo spline
12. Warp effect → đến Moon → fade sang MoonScene

### Giai đoạn 6 — Bề mặt Mặt Trăng
13. Ground patch ~4km² từ heightmap NASA + moon color texture; skybox đen + Earth lơ lửng
14. Gravity 1.62 m/s², ship hạ cánh sẵn
15. Ra/vào tàu → loop về SpaceScene → hạ cánh Trái Đất

### Giai đoạn 7 — Polish
16. Âm thanh: ambience, bước chân, rocket (nguồn miễn phí)
17. HUD: prompt tương tác, subtitle, main menu + loading
18. Build production + README

## Verification

- [ ] `npm run dev` chạy được trên browser
- [ ] Đi bộ quanh bãi phóng, vào tàu bằng phím E
- [ ] Cất cánh → không gian → hạ cánh Mặt Trăng
- [ ] Đi bộ trên terrain Mặt Trăng, gravity thấp, quay lại tàu
- [ ] `npm run build` không lỗi, FPS ≥ 30–60

## Rủi ro / Quyết định thiết kế

- **Du hành không gian là cinematic theo spline** (không lái tự do) — giữ MVP gọn
- Texture NASA TIFF/EXR cần convert sang PNG/JPG
- Model phi hành gia rigged là rủi ro lớn nhất — có fallback model đơn giản
- Heightmap Mặt Trăng chỉ vùng hạ cánh ~4km² + sphere nền
- Havok WASM ~1–2MB — load lazy
