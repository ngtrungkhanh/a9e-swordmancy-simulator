# Trial of Swordmancy Simulator & Optimizer (选剑演武)

Trình giả lập và tối ưu hóa toán học cho chế độ chơi **Trial of Swordmancy (选剑演武)** trong game **Arknights: Endfield (A9E)**.

Ứng dụng giúp bạn tối ưu hóa lượng **Wuling Stock Bills** kiếm được hàng ngày bằng cách tính toán chiến thuật hoàn hảo dựa trên toán học (Expected Value - EV) và chạy giả lập Monte Carlo 10,000 ngày để so sánh các phương án chơi.

Hiện tại ứng dụng đã được phát triển thêm phiên bản **Desktop App (Electron Assistant)** giúp tự động chụp màn hình và phân tích bài trực tiếp trong lúc chơi game ở chế độ Không Viền (Borderless Fullscreen).

---

## Các tính năng chính

1. **Desktop Live Assistant (Electron App)**: 
   - Hoạt động độc lập dưới dạng cửa sổ trợ lý song song với game.
   - **Phím tắt F4**: Bấm F4 tại bất cứ đâu (kể cả khi đang trong game) để tự động chụp màn hình, nhận diện số lượng bài còn lại trong Deck và trạng thái Nhân đôi (x2).
   - **Nhận diện tự động**: Thuật toán xử lý ảnh thông minh phân tích lưới đặc trưng 3x3 Grid Density để nhận diện chính xác số lượng bài còn lại, sau đó dùng phép trừ so với Preset để tính toán các lá bài bạn đang cầm trên tay (`Hand = StartingDeck - ScannedRemainingDeck`), đảm bảo chính xác 100% kể cả khi mở app giữa trận.
   - **Giao diện tối ưu**: Hiển thị ngay đề xuất nước đi (Rút, Dừng, Nhân đôi, Bỏ bài) cùng EV tối ưu trực quan, duy trì gợi ý cho tới khi quét lần tiếp theo.
2. **Interactive Simulator**: Giả lập rút bài thực tế trực quan trên nền Web, hiển thị xác suất lật bài, xác suất quá tải (overflow) và đề xuất nước đi tối ưu theo thời gian thực.
3. **Monte Carlo Simulator**: Giả lập tự động 10,000 ngày cho 6 phương án chiến thuật khác nhau để so sánh doanh thu trung bình, độ lệch chuẩn, tỉ lệ quá tải và tỉ lệ bỏ bài.
4. **Custom Config**: Cho phép cấu hình cấp đấu trường (Level 1-4) và số lượng thẻ bài trong deck (1-5 BP).

---

## Hướng dẫn chạy & Phát triển trên máy ở nhà

### 1. Chuẩn bị môi trường
- Đảm bảo máy đã cài đặt **Node.js** (Khuyên dùng v18 hoặc v20+).
- Cài đặt tất cả các dependencies cần thiết bằng lệnh:
  ```bash
  npm install
  ```

### 2. Chạy ứng dụng

#### Chạy phiên bản Web:
```bash
npm run dev
```
Trình duyệt sẽ mở tại `http://localhost:3000`.

#### Chạy phiên bản Desktop (Electron Dev):
```bash
npm run electron:dev
```
Lệnh này sẽ khởi động server Vite trước, sau đó mở cửa sổ Electron kết nối với Vite kèm DevTools (để bạn dễ debug các thông số quét).

### 3. Đóng gói ứng dụng (.exe)
Để đóng gói thành file cài đặt hoặc file chạy portable cho Windows (output sẽ nằm trong thư mục `release/`):
```bash
npm run dist:win
```

---

## Cấu hình Tọa độ & Độ phân giải màn hình

Toàn bộ tọa độ quét màn hình được quản lý tập trung trong file [electron/config.js](file:///d:/A9E%20sword/electron/config.js). 

Mặc định ứng dụng đang được cấu hình tối ưu cho độ phân giải **2K (2560x1440)**. 
Nếu bạn chơi game ở độ phân giải khác (ví dụ: Full HD `1920x1080` hoặc 4K `3840x2160`), bạn có thể thêm cấu hình mới vào mục `resolutions` trong file `config.js` với các thông số:
- `deckCounts`: Mảng chứa tọa độ của 5 ô hiển thị số bài còn lại (X, Y, Width, Height) tương ứng với 5 dòng bài (1 BP -> 5 BP).
- `doubleSwitch`: Tọa độ vùng quét chữ màu trắng của ô Nhân Đôi ở phía dưới màn hình (X, Y, Width, Height).

*Thuật toán phân tích Double Switch đếm số lượng pixel có giá trị màu sáng trắng (RGB > 220). Nếu số lượng pixel trắng vượt quá 200, hệ thống coi như Nhân Đôi đang được BẬT.*

