# Trial of Swordmancy Simulator - Developer & Agent Guide

Dự án này là công cụ giả lập và tối ưu hóa lối chơi cho chế độ **Trial of Swordmancy** trong game Arknights: Endfield. Dự án gồm hai phần chính: **Web Simulator** (chạy trên trình duyệt) và **Electron Live Assistant** (chạy dưới dạng app desktop để quét game thực tế).

---

## 🛠 Công nghệ sử dụng
- **Bundler:** Vite
- **Frontend:** Vanilla HTML, CSS và JavaScript (ES Modules).
- **Desktop Wrapper:** Electron (hỗ trợ preload IPC, global shortcuts).
- **Thuật toán cốt lõi:** Quy hoạch động (Dynamic Programming - DP) phối hợp cùng mô phỏng Monte Carlo để tìm phương án tối ưu nhất.

---

## 📂 Cấu trúc thư mục chính
- `index.html`, `app.js`, `styles.css`: Mã nguồn giao diện giả lập nền Web.
- `solver.js`: Thuật toán tính toán Quy hoạch động (DP) và giả lập Monte Carlo dùng chung cho cả Web và Electron.
- `electron/main.cjs`: Tiến trình chính (Main Process) của Electron. Quản lý cửa sổ ứng dụng, đăng ký phím tắt F4 toàn cục, chụp màn hình thông qua `desktopCapturer`.
- `electron/preload.cjs`: Cầu nối IPC bảo mật giữa Main Process và Renderer Process.
- `electron/assistant.html`, `electron/assistant.css`, `electron/assistant.js`: Giao diện và logic của cửa sổ trợ lý quét game thực tế.
- `electron/config.js`: File cấu hình tọa độ quét màn hình game (mặc định hỗ trợ màn hình 2K).

---

## 💡 Các Logic Quan Trọng

### 1. Tải dữ liệu bộ bài từ Wiki (Dynamic Fetching)
- Nguồn dữ liệu: [Trial of Swordmancy Wiki](https://endfield.wiki.gg/wiki/Trial_of_Swordmancy).
- API sử dụng: `https://endfield.wiki.gg/api.php?action=parse&page=Trial_of_Swordmancy&format=json&origin=*`
- **Fallback & Proxy:** Sử dụng tải trực tiếp, nếu thất bại thử qua các Proxy: `corsproxy.io` -> `allorigins.win`.
- **Parser:** Bóc tách bảng có caption dạng `Dataplate deck [1-7]` để lưu trữ số lượng bài theo Battle Points (1 đến 5).

### 2. Thuật toán giải quyết (Solver - solver.js)
- **Quy hoạch động (DP):** Tính toán EV (Expected Value) dựa trên các lá bài trên tay, các lá còn lại trong deck, số lượt bốc/reroll/x2 còn lại.
- **Monte Carlo Simulation:** Chạy giả lập 10,000 ngày để chứng minh hiệu quả thuật toán.

### 3. Trợ lý chụp màn hình & Nhận diện (Electron Live Assistant)
- **Phím tắt F4:** Đăng ký phím tắt toàn cục. Khi bấm F4, Main Process chụp ảnh toàn màn hình dưới dạng Base64 DataURL và gửi xuống Renderer.
- **Nhận diện bài trên tay bằng Phép Trừ:** Thay vì quét các lá bài nghiêng lệch trên bàn chơi (dễ bị nhiễu), hệ thống:
  1. Cho người dùng chọn Preset bộ bài xuất phát (hoặc dùng Preset mặc định).
  2. Quét số lượng bài còn lại trong túi ở bảng thông số bên phải (5 dòng tương ứng 1 BP -> 5 BP).
  3. Tính toán chính xác: `Hand = StartingDeck - ScannedRemainingDeck`.
- **Thuật toán quét số lượng bài còn lại:**
  - Cắt 5 vùng ảnh tại tọa độ cấu hình sẵn trong `config.js`.
  - Nhị phân hóa ảnh với ngưỡng cứng `110` (trên 110 là pixel trắng của chữ số, dưới 110 là nền tối).
  - Sử dụng **3x3 Grid Density** (chia nhỏ vùng chữ số thành lưới 3x3 và đếm mật độ điểm sáng) để phân loại chữ số từ `0-9` siêu nhẹ, không cần template matching hay thư viện OCR nặng nề.
- **Nhận diện trạng thái Nhân đôi (x2):**
  - Quét vùng chữ "BẬT/ON" tại tọa độ Double switch.
  - Đếm số pixel có màu sáng trắng (`RGB > 220`). Nếu số lượng pixel trắng > 200 thì tính trạng thái là BẬT, ngược lại là TẮT (vô cùng chính xác và không bị nhiễu nền trong suốt).
- **Hiển thị đề xuất:** Gợi ý tối ưu được hiển thị trực tiếp trên giao diện và giữ nguyên cho đến lần quét tiếp theo. Không phát âm thanh thông báo làm phiền người chơi.

---

## 🚀 Hướng dẫn Chạy & Phát triển

### Cài đặt thư viện:
```bash
npm install
```

### Chạy phiên bản Web:
```bash
npm run dev
```

### Chạy phiên bản Desktop (Electron Dev):
```bash
npm run electron:dev
```

### Đóng gói ứng dụng (.exe) cho Windows:
```bash
npm run dist:win
```
File `.exe` dạng portable và bộ cài đặt sẽ được tạo ra tại thư mục `release/`.

---

## 📍 Cấu hình tọa độ màn hình
Tất cả các thông số tọa độ nằm tại [electron/config.js](file:///d:/A9E%20sword/electron/config.js). Khi đổi độ phân giải màn hình (Ví dụ từ 2K sang Full HD hay 4K), lập trình viên chỉ cần thêm profile cấu hình cho độ phân giải đó vào mục `resolutions` của file này.

