# Tải asset NASA miễn phí

Tất cả nguồn dưới đây miễn phí/không bản quyền hạn chế (đọc kỹ NASA Media Usage Guidelines). Đặt file vào `public/assets/` theo đúng tên trong `src/assets/manifest.ts`.

## Mặt Trăng — NASA SVS CGI Moon Kit

<https://svs.gsfc.nasa.gov/4720/>

- **Color map** (LROC WAC mosaic): tải bản TIFF 8-bit, convert sang JPG:
  → `public/assets/textures/moon_color.jpg`
- **Displacement/elevation map**: tải bản 16-bit TIFF, convert sang PNG (giữ bit depth nếu có thể):
  → `public/assets/textures/moon_height.png`

Convert nhanh bằng ImageMagick:

```bash
magick lroc_color_poles_8k.tif -quality 90 moon_color.jpg
magick ldem_16.tif -depth 16 moon_height.png
```

## Trái Đất — NASA Blue Marble (Visible Earth)

<https://visibleearth.nasa.gov/collection/1484/blue-marble>

- Tải ảnh equirectangular (ví dụ `world.200404.3x5400x2700`), resize còn 2048×1024:
  → `public/assets/textures/earth_color.jpg`

## Bầu trời sao — NASA star maps

- Hipparcos/Tycho star map trong repo NASA-3D-Resources, thư mục `Images and Textures`:
  <https://github.com/nasa/NASA-3D-Resources/tree/master/Images%20and%20Textures>
  → `public/assets/textures/starmap.jpg`

## SpaceX Falcon 9 — Sketchfab (CC-BY 4.0)

Đang dùng trong game (`public/assets/models/falcon9/`).

- Source: https://sketchfab.com/3d-models/falcon-9-spacex-rocket-58784d6b55ad47d2985f353459759f06
- Tác giả: **artemycz** (https://sketchfab.com/artemycz)
- License: CC-BY-4.0 — phải ghi credit khi phát hành.

Credit cần chèn:

> This work is based on "Falcon 9 SpaceX rocket" by artemycz (sketchfab.com/artemycz), licensed under CC-BY-4.0.

## Model 3D — NASA-3D-Resources

<https://github.com/nasa/NASA-3D-Resources> (thư mục `3D Models`) hoặc <https://science.nasa.gov/3d-resources/>

- Tàu vũ trụ (Orion MPCV, Apollo CSM, lunar lander...): convert sang GLB (Blender import OBJ/STL → export glTF):
  → `public/assets/models/ship.glb`
- Phi hành gia (EMU spacesuit): tương tự → `public/assets/models/astronaut.glb`

## Texture panel buồng lái

`Images and Textures/Discovery Flight Deck Panels` trong repo NASA-3D-Resources — dùng thay cho panel procedural trong `InteriorScene`.

## Ghi chú tích hợp

`manifest.ts` đã có helper `tryLoadModel()` / `textureExists()` — hiện các scene đang dùng asset procedural; để dùng file thật, thay lệnh gọi texture/model tương ứng bằng helper này với fallback giữ nguyên.
