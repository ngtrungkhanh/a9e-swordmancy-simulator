# Trial of Swordmancy Simulator & Optimizer (选剑演武)

Trình giả lập và tối ưu hóa toán học cho chế độ chơi **Trial of Swordmancy (选剑演武)** trong game **Arknights: Endfield (A9E)**.

Ứng dụng giúp bạn tối ưu hóa lượng **Wuling Stock Bills** kiếm được hàng ngày bằng cách tính toán chiến thuật hoàn hảo dựa trên toán học (Expected Value - EV) và chạy giả lập Monte Carlo 10,000 ngày để so sánh các phương án chơi.

Hiện tại ứng dụng đã được phát triển thêm phiên bản **Desktop App (Electron Assistant)** giúp tự động chụp màn hình và phân tích bài trực tiếp trong lúc chơi game ở chế độ Không Viền (Borderless Fullscreen).

---

## Các tính năng chính

1. **Desktop Live Assistant (Electron App)**: 
   - Hoạt động độc lập dưới dạng cửa sổ trợ lý song song với game, hỗ trợ cả giao diện lớn (Normal) và giao diện HUD thu nhỏ (Overlay).
   - **Tự động co dãn giao diện (UI Auto-Scaling)**: Tự động điều chỉnh kích thước cửa sổ Electron và áp dụng CSS Zoom (ví dụ: `zoom: 0.75` cho màn hình Full HD `1920x1080`) để giao diện hiển thị sắc nét, khít hoàn hảo với mọi độ phân giải.
   - **Phím tắt F4 & F5**: Bấm F4 để tự động quét game (hoặc bật/tắt Auto-Scan), F5 để ép quét nhanh.
   - **Nhận diện OCR khớp mẫu (OCR Template Matching)**: Đọc trực tiếp các chữ số trên mặt lá bài đang có trên tay bằng giải pháp khớp mẫu ảnh nhị phân `32x48` (sử dụng toán tử bitwise IoU cực nhanh trên CPU). Hỗ trợ cơ chế ngưỡng động thích ứng (Adaptive Threshold) đề phòng sự thay đổi độ sáng trong game.
   - **Tự động co dãn tọa độ quét (Resolution Auto-Scaling)**: Tự động nhân tỷ lệ co dãn các vùng quét tọa độ (attempts, doubles, cards, deck counts...) dựa trên tỷ lệ màn hình thực tế so với cấu hình gốc 2K (chỉ cần là tỷ lệ 16:9).
   - **Tự động hiệu chỉnh & Xác thực chéo (Cross-check & Auto-correction)**: Sử dụng điểm số hiển thị trên game (`gameScore`) làm checksum để kiểm tra tay bài nhận diện được. Nếu phát hiện lệch, tự động hiệu chỉnh chính xác tay bài dựa trên hiệu số của Deck gốc, loại bỏ hoàn toàn các lá bài "ma" (phantom scans).
   - **Cam kết trạng thái an toàn (Guarded OCR Commits)**: Ngăn chặn triệt để việc ghi đè dữ liệu rác khi thoát game hoặc Alt-Tab ra màn hình desktop bằng cơ chế từ chối cập nhật trạng thái nếu kết quả quét là `inactive` hoặc `retry` thất bại liên tục, giữ nguyên đề xuất tối ưu trước đó và hiển thị trạng thái `OCR CHƯA CHẮC`.
   - **Bộ lọc nhiễu thích ứng theo độ phân giải (Resolution-quadratic Noise Filtering)**: Loại bỏ hoàn toàn nhiễu hạt nhỏ trên desktop ở các độ phân giải thấp (1080p) bằng thuật toán lọc điểm thành phần tối thiểu co dãn theo hàm bậc hai của tỷ lệ màn hình.
   - **Chỉ số xác suất mạo hiểm (Draw-to-Target Policy)**: Hiển thị trực quan xác suất đạt điểm 10 (`prob10`), điểm 9-10 (`prob9Plus`) và xác suất tràn điểm vòng chu kỳ hiện tại (`overflowProb` tự động chuyển đổi nhãn `>10 BP` hoặc `>21 BP` theo số điểm trên tay) khi người chơi quyết định mạo hiểm rút tiếp liên tục.
   - **Giá trị kỳ vọng (Expected Value - EV)**: Tính toán chính xác theo Mô hình Quyết định Tối ưu (Optimal Policy) bao gồm các hành vi dừng lại, rút tiếp, nhân đôi hay bỏ bài miễn phí.
2. **Interactive Simulator**: Giả lập rút bài thực tế trực quan trên nền Web, hiển thị xác suất lật bài, xác suất quá tải (overflow) và đề xuất nước đi tối ưu theo thời gian thực.
3. **Monte Carlo Simulator**: Giả lập tự động 10,000 ngày cho 6 phương án chiến thuật khác nhau để so sánh doanh thu trung bình, độ lệch chuẩn, tỉ lệ quá tải và tỉ lệ bỏ bài.
4. **Custom Config**: Cho phép cấu hình bộ bài xuất phát và lưu cấu hình tuỳ chỉnh.

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
Lệnh này sẽ khởi động server Vite trước, sau đó mở cửa sổ Electron kết nối với Vite kèm DevTools.

### 3. Đóng gói ứng dụng (.exe)
Để đóng gói thành file cài đặt hoặc file chạy portable cho Windows (output sẽ nằm trong thư mục `release/`):
```bash
npm run dist:win
```

---

## Cấu hình Tọa độ & Độ phân giải màn hình

Toàn bộ tọa độ quét màn hình gốc được quản lý tập trung trong file [config.js](file:///d:/A9E%20App/electron/config.js). 

Mặc định ứng dụng được cấu hình tối ưu cho độ phân giải **2K (2560x1440)**. 
Khi chạy game ở các độ phân giải 16:9 khác như Full HD `1920x1080` hoặc 4K `3840x2160`, ứng dụng sẽ **tự động co dãn tỷ lệ tọa độ** tương ứng thông qua hàm `getActiveConfig(width, height)`.

Bạn không cần cấu hình thủ công tọa độ cho từng màn hình nữa trừ khi tỷ lệ màn hình game của bạn khác 16:9. Trong trường hợp đó, bạn có thể bổ sung độ phân giải mới vào cấu hình `resolutions` của `config.js`.

