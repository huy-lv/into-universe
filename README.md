# Into Universe

Game 3D trên trình duyệt: bạn là phi hành gia, đi bộ quanh bãi phóng, lên tàu vũ trụ, chứng kiến cảnh cất cánh, du hành đến Mặt Trăng và đi bộ trên bề mặt với trọng lực thấp.

## Chạy

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build → dist/
```

## Điều khiển

| Phím | Hành động |
|------|-----------|
| WASD | Di chuyển |
| Chuột | Xoay camera (click để khóa chuột) |
| Shift | Chạy |
| Space | Nhảy (nhảy cao hơn nhiều trên Mặt Trăng!) |
| E | Tương tác (vào tàu, ngồi ghế, về Trái Đất) |

## Vòng chơi

1. **Bãi phóng (Trái Đất)** — đi theo đường dốc lên bệ phóng, nhấn E ở cửa tàu
2. **Trong tàu** — ngồi vào ghế phi công → chuỗi đếm ngược & cất cánh cinematic
3. **Không gian** — hành trình Earth → Moon với hiệu ứng warp
4. **Mặt Trăng** — hạ cánh tại vùng đồng bằng, đi bộ trên terrain có miệng hố, quay lại tàu để về Trái Đất (và lặp lại)

## Kiến trúc

- **Babylon.js** + TypeScript + Vite
- Character controller kinematic dựa trên raycast (`src/gameplay/ThirdPersonCharacter.ts`) — hoạt động ổn định trên cả terrain heightfield và bệ phóng, hỗ trợ bước lên bậc thang ≤ 0.55m và trượt theo tường
- State machine scene: `launch → interior → space → moon` (`src/core/Game.ts`)
- Toàn bộ texture/terrain được sinh procedural lúc runtime (`src/gameplay/ProceduralTextures.ts`) — không cần file asset nào để chạy
- `src/core/Physics.ts` có sẵn helper Havok nếu muốn bật physics thật sau này (WASM đã copy vào `public/`)

## Nâng cấp asset thật

Game chạy được với asset procedural, nhưng bạn có thể thả file thật vào `public/assets/` để nâng cấp đồ họa — xem `scripts/fetch-assets.md` (nguồn NASA miễn phí: CGI Moon Kit, Blue Marble, NASA-3D-Resources).
