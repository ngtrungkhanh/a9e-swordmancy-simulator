# Trial of Swordmancy Simulator - Developer & Agent Guide

Du an nay la cong cu gia lap va toi uu hoa loi choi cho che do **Trial of Swordmancy** trong game Arknights: Endfield. Du an gom hai phan chinh: **Web Simulator** (chay tren trinh duyet) va **Electron Live Assistant** (chay duoi dang app desktop de quet game thuc te).

---

## Cong nghe su dung
- **Bundler:** Vite
- **Frontend:** Vanilla HTML, CSS va JavaScript (ES Modules).
- **Desktop Wrapper:** Electron (ho tro preload IPC, global shortcuts).
- **Thuat toan cot loi:** Quy hoach dong (Dynamic Programming - DP) phoi hop cung mo phong Monte Carlo de tim phuong an toi uu nhat.

---

## Cau truc thu muc chinh
- `index.html`, `app.js`, `styles.css`: Ma nguon giao dien gia lap nen Web.
- `solver.js`: Thuat toan tinh toan DP va Monte Carlo dung chung cho ca Web va Electron.
- `electron/main.cjs`: Main Process - quan ly cua so, phim tat F4/F5, chup man hinh, luu kich thuoc cua so (window-size.json).
- `electron/preload.cjs`: Cau noi IPC bao mat.
- `electron/assistant.html`, `electron/assistant.css`, `electron/assistant.js`: Giao dien va logic tro ly quet game.
- `electron/config.js`: Toa do quet man hinh (mac dinh 2K).

---

## Logic Quan Trong

### 1. Tai du lieu bo bai tu Wiki
- API: `https://endfield.wiki.gg/api.php?action=parse&page=Trial_of_Swordmancy&format=json&origin=*`
- Fallback qua Proxy: corsproxy.io -> allorigins.win
- Parser: Doc bang co caption "Dataplate deck [1-7]"

### 2. Solver (solver.js)
- **DP:** Tinh EV dua tren bai tren tay, deck con lai, so luot boc/reroll/x2.
- **Monte Carlo:** 10,000 ngay gia lap.
- **Xac suat bo sung:**
  - `overflowProb`: tran +1 (sum thuc te + la tiep > 21)
  - `prob10`: xac suat ra 10 BP hoac 21 BP (sum % 11 === 10). Mau vang kim.
  - `prob9Plus`: xac suat ra 9-10 BP hoac 20-21 BP (sum % 11 === 9 hoac 10). Mau xanh la. Khi da tran (sum > 11) chi tinh 20/21.

### 3. Tro ly chup man hinh (Electron Live Assistant)
- `win.setContentProtection(true)`: An cua so tro ly khoi desktopCapturer.
- **F4 (Toggle Auto-Scan):** Quet tu dong theo interval. Nut camera nhap nhay xanh la (.active-auto-scan).
- **F5 (Force Scan Now):** Quet ngay 1 lan. Nut camera nhap nhay xanh cyan (.scanning-flash) tu luc bat dau den khi du lieu moi render xong vao overlay.
- **OCR:** Hand = StartingDeck - ScannedRemainingDeck. Dung 3x3 Grid Density, nhi phan hoa nguong 110.
- **Phan biet che do:** Kiem tra bracket va double switch capsule de phan biet Free Trial / Rewarded.

### 4. Hai che do cua so
- **Normal Mode:** 1280x820 (luu/khoi phuc kich thuoc qua window-size.json trong userData). Focusable, AlwaysOnTop tat.
- **Overlay HUD Mode:** 640x220, AlwaysOnTop = screen-saver, KHONG focusable (khong cuop input game), 3 cot.

### 5. Che do Khao nghiem Mien phi (Free Trial)
- Tu dong phat hien qua OCR hoac khi attemptsLeft === 0.
- Khi vao Free Trial va chua rut the: reset ve 1 luot nhan thuong, 0 lan bo, 0 lan x2.
- Nguoi choi chinh duoc qua steppers tren HUD/sidebar.
- Hien thi day du bang EV. Chi an phan Accumulated Bills.

---

## Huong dan Chay

### Cai dat:
```bash
npm install
```

### Web:
```bash
npm run dev
```

### Electron (can quyen Admin de nhan F4/F5):
```powershell
npx electron .
```

### Dong goi .exe:
```bash
npm run dist:win
```

---

## Cau hinh toa do man hinh
File: `electron/config.js` - them profile resolution moi vao muc `resolutions`.

## Debug
- Screenshot debug: `d:\A9E App\debug_capture.png` (ghi de moi lan quet).
- DevTools: Tu dong mo khi chay npx electron . (isDev mode).

---

## Current OCR Handoff Status (2026-06-19)

- Card order bug root cause: compact hand OCR lost slot positions; `deducedHand` is sorted by BP and cannot represent draw order.
- Current fix keeps 5 fixed slots from OCR, for example `[2, 5, 1, null, null]`, then compacts only at render/solver boundary.
- `lastScannedSlots` is the raw scan state used when rerunning solver after preset/stepper/free-trial changes.
- `reconcileHandSlots(scannedSlots, deducedHand)` keeps valid OCR slot positions first, then fills missing slots from `deducedHand`.
- Current debug switch in `electron/assistant.js`: `DEBUG_SLOT_OCR_ONLY = true`.
- While that switch is true, display uses pure slot OCR to expose real OCR failures.
- Current card OCR still uses 3x3 grid-density plus temporary card-specific exceptions. This is fragile.
- Recommended next OCR direction: replace card-slot digit classification with template matching for digits `1..5`.
- Full handoff plan: `OCR_TEMPLATE_MATCHING_PLAN.md`.
