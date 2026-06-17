# Trial of Swordmancy Simulator & Optimizer (选剑演武)

Trình giả lập và tối ưu hóa toán học cho chế độ chơi **Trial of Swordmancy (选剑演武)** trong game **Arknights: Endfield (A9E)**.

Ứng dụng giúp bạn tối ưu hóa lượng **Wuling Stock Bills** kiếm được hàng ngày bằng cách tính toán chiến thuật hoàn hảo dựa trên toán học (Expected Value - EV) và chạy giả lập Monte Carlo 10,000 ngày để so sánh các phương án chơi.

## Các tính năng chính
1. **Interactive Simulator**: Giả lập rút bài thực tế, hiển thị xác suất lật bài, xác suất quá tải (overflow) và đặc biệt là **đề xuất nước đi tối ưu (Draw, Stop, Double, Abandon) theo thời gian thực** cùng với dự báo thu nhập trung bình (EV) của tay bài hiện tại.
2. **Monte Carlo Simulator**: Giả lập tự động 10,000 ngày cho 6 phương án chiến thuật khác nhau để so sánh doanh thu trung bình, độ lệch chuẩn, tỉ lệ quá tải và tỉ lệ bỏ bài, giúp kiểm chứng độ hiệu quả của thuật toán tối ưu so với các lối chơi thông thường.
3. **Custom Config**: Cho phép cấu hình cấp đấu trường (Level 1-4) và số lượng thẻ bài trong deck (1-5 BP) để thích ứng với mọi chu kỳ xoay tua thẻ bài.

## Công nghệ sử dụng
- Core: HTML5, Vanilla JavaScript.
- CSS: Custom CSS (Endfield Dark & Sci-Fi Theme, glassmorphism, 3D card flip).
- Dev Server: Vite.

## Hướng dẫn chạy local
1. Đảm bảo máy của bạn đã cài đặt **Node.js**.
2. Mở terminal tại thư mục dự án và chạy lệnh sau để cài đặt Vite:
   ```bash
   npm install
   ```
3. Khởi động máy chủ phát triển local:
   ```bash
   npm run dev
   ```
4. Trình duyệt sẽ tự động mở trang web tại địa chỉ `http://localhost:3000`.
