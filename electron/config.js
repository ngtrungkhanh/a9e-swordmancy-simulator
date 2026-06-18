/**
 * config.js
 * Cấu hình tọa độ quét màn hình game Arknights: Endfield cho các độ phân giải khác nhau.
 * Mặc định hỗ trợ độ phân giải 2K (2560x1440).
 */

const CONFIG = {
    // Độ phân giải mặc định
    activeResolution: '2K',

    resolutions: {
        '2K': {
            width: 2560,
            height: 1440,

            // Tọa độ 5 lá bài ở giữa sân
            cards: [
                { x: 100, y: 300, width: 370, height: 570 },
                { x: 490, y: 300, width: 370, height: 570 },
                { x: 880, y: 300, width: 370, height: 570 },
                { x: 1270, y: 300, width: 370, height: 570 },
                { x: 1660, y: 300, width: 370, height: 570 }
            ],

            // Tọa độ vùng chứa số BP ở góc trên bên phải lá bài (tính tương đối từ góc trên bên trái lá bài)
            cardNumberRelative: {
                xOffset: 295,
                yOffset: 0,
                width: 75,
                height: 90
            },

            // Tọa độ 5 ô đếm số lượng bài còn lại trong túi (cột bên phải)
            deckCounts: [
                { x: 2437, y: 245, width: 60, height: 40, label: '1 BP' },
                { x: 2437, y: 343, width: 60, height: 40, label: '2 BP' },
                { x: 2437, y: 440, width: 60, height: 40, label: '3 BP' },
                { x: 2437, y: 538, width: 60, height: 40, label: '4 BP' },
                { x: 2437, y: 636, width: 60, height: 40, label: '5 BP' }
            ],

            // Tọa độ vùng quét chữ Đôi (Double Active Capsule) ở bảng điểm dưới
            doubleSwitch: {
                x: 1100,
                y: 1150,
                width: 300,
                height: 25
            }
        }
    }
};

/**
 * Lấy cấu hình cho độ phân giải hiện tại
 */
function getActiveConfig() {
    return CONFIG.resolutions[CONFIG.activeResolution];
}

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = { CONFIG, getActiveConfig };
} else {
    window.CONFIG = CONFIG;
    window.getActiveConfig = getActiveConfig;
}
