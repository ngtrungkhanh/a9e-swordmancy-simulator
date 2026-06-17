# Luật chơi chuẩn: Trial of Swordmancy (选剑演武) - Arknights: Endfield

**Trial of Swordmancy (选剑演武)** là một chế độ chơi chiến đấu vĩnh viễn trong game *Arknights: Endfield (A9E)*. Người chơi tham gia thử thách hàng ngày bằng cách rút các thẻ dữ liệu (Dataplates) để triệu hồi và chiến đấu với các đợt quái vật nhằm kiếm **Wuling Stock Bills**.

---

## 1. Cơ chế rút thẻ Dataplate & Luật tính điểm

1.  **Lượt đấu (Trials)**: Trước mỗi lượt đấu, người chơi có thể rút tối đa **5 lá bài (Dataplates)** từ một bộ bài (deck) cố định.
2.  **Điểm chiến đấu (Battle Points - BP)**: Mỗi lá bài có điểm BP từ 1 đến 5 đại diện cho sức mạnh của quái vật trên lá bài đó.
3.  **Hành động của người chơi**:
    *   **Rút bài (Draw)**: Rút thêm 1 lá bài từ bộ bài còn lại (rút không hoàn lại).
    *   **Dừng lại (Stop & Battle)**: Chấp nhận tay bài hiện tại, bắt đầu chiến đấu. Điểm số cuối cùng của tay bài xác định phần thưởng nhận được nếu thắng.
    *   **Bỏ bài (Abandon)**: Từ bỏ tay bài hiện tại để rút lại từ đầu.
    *   **Nhân đôi (Reward Doubling)**: Kích hoạt trước khi rút lá thứ 3 (khi đang có đúng 2 lá trên tay). Nếu thắng sẽ nhân đôi số tiền thưởng.
4.  **Cơ chế Quá tải dữ liệu (Data Overflow - Rất quan trọng)**:
    *   Điểm quá tải xảy ra khi tổng số điểm BP trên tay vượt quá 10 (tức là $\ge 11$ BP).
    *   **Khác với Blackjack, khi quá tải, lượt đấu không kết thúc ngay lập tức**. Thay vào đó, **điểm số (counter) sẽ được reset về 0** (ở mức 11, 22 BP) và các lá bài rút thêm sau đó sẽ tiếp tục được cộng dồn từ các mức này (tương đương với $\text{Sum} \pmod{11}$).
    *   Mỗi lần quá tải tăng cấp độ quái vật lên 30 cấp, làm tăng độ khó của ải đấu. **Tuy nhiên, phần thưởng nhận được vẫn phụ thuộc hoàn toàn vào điểm số cuối cùng ($\text{Sum} \pmod{11}$)**, không bị reset về 0 Bills kể cả trong chế độ đấu nhận thưởng (Rewarded Trial Mode).
    *   Nếu tổng điểm BP vượt quá 21, Quá tải xảy ra lần 2 (Double Overflow). Lúc này quái vật tăng cấp thêm và thời gian giới hạn trận đấu giảm xuống còn 180 giây.

---

## 2. Đấu trường thử thách (Trial Arena)

Đấu trường thử thách là một công trình có thể nâng cấp. Cấp độ của Đấu trường quyết định giới hạn phần thưởng tối đa mỗi lượt đấu và số lượt Nhân đôi hàng ngày:

| Cấp Đấu Trường | Chi Phí Nâng Cấp (Bills) | Giới Hạn Thưởng/Trial | Lượt Nhân Đôi/Ngày |
|:---:|:---:|:---:|:---:|
| **Level 0** | 0 | 0 | 0 |
| **Level 1** | 10,000 | 30,000 | 0 |
| **Level 2** | 150,000 | 60,000 | 1 |
| **Level 3** | 600,000 | 100,000 | 2 |
| **Level 4** | 1,600,000 | 160,000 | 2 |

### Bảng thưởng cơ bản theo điểm số (BP cuối cùng) và Cấp đấu trường:

| Cấp | 0 BP | 1 BP | 2 BP | 3 BP | 4 BP | 5 BP | 6 BP | 7 BP | 8 BP | 9 BP | 10 BP |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Lvl 1** | 0 | 500 | 800 | 1,200 | 2,000 | 3,000 | 5,000 | 8,000 | 12,000 | 20,000 | 30,000 |
| **Lvl 2** | 0 | 750 | 1,500 | 2,400 | 3,600 | 6,000 | 10,000 | 16,000 | 24,000 | 40,000 | 60,000 |
| **Lvl 3** | 0 | 1,000 | 2,000 | 4,000 | 6,000 | 10,000 | 15,000 | 25,000 | 40,000 | 60,000 | 100,000 |
| **Lvl 4** | 0 | 1,000 | 2,000 | 4,000 | 7,500 | 12,000 | 20,000 | 36,000 | 60,000 | 100,000 | 160,000 |

---

## 3. Lượt đấu nhận thưởng & Luật bỏ bài (Abandon)

*   Mỗi ngày người chơi có tối đa **3 lượt đấu nhận thưởng (Rewarded Trial attempts)**.
*   Nếu không hài lòng với tay bài, người chơi có thể chọn **Abandon**:
    *   **3 lần đầu tiên** bỏ bài trong ngày là **miễn phí** (không mất lượt đấu hàng ngày).
    *   **Từ lần thứ 4 trở đi**, mỗi lần bỏ bài sẽ tiêu tốn 1 lượt đấu nhận thưởng hàng ngày (và nhận về 0 Wuling Stock Bills cho lượt đó).
*   Người chơi có thể thoát ra khỏi menu Trial of Swordmancy mà không mất bài hay lượt đấu, miễn là chưa nhấn Abandon hoặc bắt đầu chiến đấu.

---

## 4. Danh sách các Bộ bài (Dataplate Decks)

Bộ bài Dataplate thay đổi mỗi **3 ngày máy chủ** một lần. Có tổng cộng **7 bộ bài mẫu** xoay tua trong game:

| Bộ Bài | Thẻ 1 BP | Thẻ 2 BP | Thẻ 3 BP | Thẻ 4 BP | Thẻ 5 BP | Tổng số lá |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Deck 1** | 5 | 5 | 5 | 8 | 5 | 28 |
| **Deck 2** | 4 | 5 | 6 | 6 | 6 | 27 |
| **Deck 3** | 7 | 3 | 7 | 3 | 6 | 26 |
| **Deck 4** | 3 | 7 | 7 | 7 | 5 | 29 |
| **Deck 5** | 6 | 6 | 9 | 4 | 3 | 28 |
| **Deck 6** | 4 | 5 | 4 | 8 | 6 | 27 |
| **Deck 7** | 8 | 5 | 2 | 5 | 7 | 27 |

---

## 5. Huy chương vinh quang (Path of Glory Medals)

Có hai huy chương chính liên quan đến chế độ chơi này:
1.  **Huy chương thường "Zenith of the Trials"**: Hoàn thành 1 lượt đấu với tổng điểm đạt đúng **10 Battle Points** (không quá tải).
2.  **Huy chương mạ vàng (Trimmed Medal) "Zenith of the Trials"**: 
    *   Yêu cầu người chơi đạt tổng cộng **21 Battle Points** trong một lượt đấu duy nhất.
    *   *Giải thích*: Do quá tải xảy ra ở 11 BP làm reset điểm về 0, để kết thúc lượt đấu với 10 điểm trong trạng thái quá tải một lần, tổng số điểm của 5 lá bài phải đạt chính xác là $11 + 10 = 21$ BP.
    *   Huy chương này có thể đạt được trong chế độ **Free Trial Mode** (nơi quá tải không bị phạt mất lượt).