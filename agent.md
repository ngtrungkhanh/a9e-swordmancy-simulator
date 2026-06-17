# Trial of Swordmancy Simulator - Developer & Agent Guide

Dự án này là công cụ giả lập và tối ưu hóa lối chơi cho chế độ **Trial of Swordmancy** trong game Arknights: Endfield. 

## 🛠 Công nghệ sử dụng
- **Bundler:** Vite
- **Frontend:** Vanilla HTML, CSS và JavaScript (ES Modules).
- **Thuật toán cốt lõi:** Quy hoạch động (Dynamic Programming - DP) phối hợp cùng mô phỏng Monte Carlo để tìm phương án tối ưu nhất.

## 📂 Cấu trúc thư mục chính
- `index.html`: Giao diện chính của ứng dụng.
- `app.js`: Quản lý logic giao diện, xử lý các sự kiện UI, lưu trữ dữ liệu giả lập (`localStorage`), và tải dữ liệu bộ bài từ Wiki.
- `solver.js`: Chứa thuật toán tính toán Dynamic Programming và giả lập Monte Carlo.
- `styles.css`: CSS giao diện ứng dụng (giao diện tối, hiện đại, tối ưu hiển thị).

## 💡 Các Logic Quan Trọng

### 1. Tải dữ liệu bộ bài từ Wiki (Dynamic Fetching)
- Nguồn dữ liệu: [Trial of Swordmancy Wiki](https://endfield.wiki.gg/wiki/Trial_of_Swordmancy).
- API sử dụng: `https://endfield.wiki.gg/api.php?action=parse&page=Trial_of_Swordmancy&format=json&origin=*`
- **Cơ chế Fallback & Proxy:** Để vượt qua giới hạn CORS và Cloudflare của trình duyệt, hệ thống sử dụng cơ chế tải trực tiếp, nếu thất bại sẽ lần lượt thử qua các Proxy:
  1. `corsproxy.io` (Proxy trực tiếp API URL)
  2. `allorigins.win` (Nhận dữ liệu dạng JSON wrapper)
- **Parser:** Phân tích HTML trả về để tìm các bảng có caption dạng `Dataplate deck [1-7]` và bóc tách số lượng thẻ bài tương ứng theo Battle Points (1 đến 5).

### 2. Thuật toán giải quyết (Solver)
- **Quy hoạch động (DP):** Dùng để tính toán số tiền kỳ vọng tối đa có thể nhận được dựa trên trạng thái bài hiện tại trên tay, số lượt rút còn lại và cấu trúc bộ bài.
- **Monte Carlo Simulation:** Chạy giả lập hàng ngàn lượt chơi ngẫu nhiên để so sánh hiệu quả giữa các chiến thuật (DP tối ưu vs Rút bài ngẫu nhiên). Tính toán số tiền trung bình thu được, tỷ lệ thắng, cũng như số tiền thấp nhất/cao nhất có thể đạt được.
- **Cache Local:** Kết quả tính toán Monte Carlo được lưu lại trong `localStorage` theo khóa tham số đầu vào để tránh việc phải tính toán lại các kịch bản trùng lặp gây giật lag UI.

## 🚀 Hướng dẫn Chạy & Phát triển

### Cài đặt thư viện:
```bash
npm install
```

### Chạy môi trường thử nghiệm (Local Development):
```bash
npm run dev
```

### Build sản phẩm hoàn chỉnh (Production):
```bash
npm run build
```
Sản phẩm sau khi build sẽ nằm trong thư mục `dist/`.
