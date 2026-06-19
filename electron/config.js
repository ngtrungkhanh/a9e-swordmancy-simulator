/**
 * config.js
 * Cấu hình tọa độ quét màn hình game Arknights: Endfield cho các độ phân giải khác nhau.
 * Hỗ trợ tự động co dãn tọa độ (Auto-scaling) đối với các màn hình tỷ lệ 16:9 từ cấu hình chuẩn 2K.
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

            // Tọa độ vùng quét chữ số trên mặt thẻ bài (tính tương đối từ góc trên bên trái lá bài)
            cardNumberRelative: {
                xOffset: 295,
                yOffset: 0,
                width: 75,
                height: 90
            },

            // Tọa độ dải màu đen ở góc trên của thẻ bài dùng để check thẻ bài lật (tính tương đối từ góc trên bên trái lá bài)
            cardFaceStripRelative: {
                xOffset: 0,
                yOffset: 10,
                width: 300,
                height: 50
            },

            // Tọa độ 5 ô đếm số lượng bài còn lại trong túi (cột bên phải)
            deckCounts: [
                { x: 2437, y: 245, width: 60, height: 40, label: '1 BP' },
                { x: 2437, y: 343, width: 60, height: 40, label: '2 BP' },
                { x: 2437, y: 440, width: 60, height: 40, label: '3 BP' },
                { x: 2437, y: 538, width: 60, height: 40, label: '4 BP' },
                { x: 2437, y: 636, width: 60, height: 40, label: '5 BP' }
            ],

            // Tọa độ vùng quét nút Nhân Đôi (Double Switch Box) ở bảng điểm dưới
            doubleSwitch: {
                x: 1100,
                y: 1150,
                width: 300,
                height: 25
            },

            // Tọa độ vùng quét chữ Double active capsule
            doubleSwitchCapsule: {
                x: 1100,
                y: 1158,
                width: 300,
                height: 20
            },

            // Tọa độ dấu ngoặc vuông chứa số lượt attempts còn lại
            bracket: {
                x: 1040,
                y: 114,
                width: 15,
                height: 18
            },

            // Tọa độ vùng chứa chữ số lượt đấu thưởng (Attempts remaining)
            attemptsRegion: {
                xStart: 1190,
                yStart: 114,
                xEnd: 1215,
                yEnd: 134
            },

            // Tọa độ vùng chứa chữ số lượt nhân đôi còn lại (Doubles remaining)
            doublesRegion: {
                xStart: 1480,
                yStart: 1155,
                xEnd: 1505,
                yEnd: 1180
            }
        }
    }
};

/**
 * Co dãn cấu hình tọa độ theo tỷ lệ nhất định
 */
function scaleConfig(baseConfig, scale, targetW, targetH) {
    const scaleVal = (val) => Math.round(val * scale);
    
    const scaledCards = baseConfig.cards.map(c => ({
        x: scaleVal(c.x),
        y: scaleVal(c.y),
        width: scaleVal(c.width),
        height: scaleVal(c.height)
    }));
    
    const scaledCardNumberRelative = {
        xOffset: scaleVal(baseConfig.cardNumberRelative.xOffset),
        yOffset: scaleVal(baseConfig.cardNumberRelative.yOffset),
        width: scaleVal(baseConfig.cardNumberRelative.width),
        height: scaleVal(baseConfig.cardNumberRelative.height)
    };

    const scaledCardFaceStripRelative = {
        xOffset: scaleVal(baseConfig.cardFaceStripRelative.xOffset),
        yOffset: scaleVal(baseConfig.cardFaceStripRelative.yOffset),
        width: scaleVal(baseConfig.cardFaceStripRelative.width),
        height: scaleVal(baseConfig.cardFaceStripRelative.height)
    };
    
    const scaledDeckCounts = baseConfig.deckCounts.map(dc => ({
        x: scaleVal(dc.x),
        y: scaleVal(dc.y),
        width: scaleVal(dc.width),
        height: scaleVal(dc.height),
        label: dc.label
    }));
    
    const scaledDoubleSwitch = {
        x: scaleVal(baseConfig.doubleSwitch.x),
        y: scaleVal(baseConfig.doubleSwitch.y),
        width: scaleVal(baseConfig.doubleSwitch.width),
        height: scaleVal(baseConfig.doubleSwitch.height)
    };

    const scaledDoubleSwitchCapsule = {
        x: scaleVal(baseConfig.doubleSwitchCapsule.x),
        y: scaleVal(baseConfig.doubleSwitchCapsule.y),
        width: scaleVal(baseConfig.doubleSwitchCapsule.width),
        height: scaleVal(baseConfig.doubleSwitchCapsule.height)
    };

    const scaledBracket = {
        x: scaleVal(baseConfig.bracket.x),
        y: scaleVal(baseConfig.bracket.y),
        width: scaleVal(baseConfig.bracket.width),
        height: scaleVal(baseConfig.bracket.height)
    };

    const scaledAttemptsRegion = {
        xStart: scaleVal(baseConfig.attemptsRegion.xStart),
        yStart: scaleVal(baseConfig.attemptsRegion.yStart),
        xEnd: scaleVal(baseConfig.attemptsRegion.xEnd),
        yEnd: scaleVal(baseConfig.attemptsRegion.yEnd)
    };

    const scaledDoublesRegion = {
        xStart: scaleVal(baseConfig.doublesRegion.xStart),
        yStart: scaleVal(baseConfig.doublesRegion.yStart),
        xEnd: scaleVal(baseConfig.doublesRegion.xEnd),
        yEnd: scaleVal(baseConfig.doublesRegion.yEnd)
    };
    
    return {
        width: targetW,
        height: targetH,
        cards: scaledCards,
        cardNumberRelative: scaledCardNumberRelative,
        cardFaceStripRelative: scaledCardFaceStripRelative,
        deckCounts: scaledDeckCounts,
        doubleSwitch: scaledDoubleSwitch,
        doubleSwitchCapsule: scaledDoubleSwitchCapsule,
        bracket: scaledBracket,
        attemptsRegion: scaledAttemptsRegion,
        doublesRegion: scaledDoublesRegion
    };
}

/**
 * Lấy cấu hình cho độ phân giải hiện tại.
 * Nếu có truyền vào kích thước màn hình chụp thực tế, hỗ trợ tính năng co dãn tự động.
 */
function getActiveConfig(width, height) {
    if (!width || !height) {
        return CONFIG.resolutions[CONFIG.activeResolution];
    }
    
    const key = `${width}x${height}`;
    // 1. Ưu tiên cấu hình khai báo cứng (nếu khớp độ phân giải)
    if (CONFIG.resolutions[key]) {
        return CONFIG.resolutions[key];
    }
    
    // 2. Dự phòng: Tự động co dãn nếu là tỷ lệ màn hình 16:9
    const ratio = width / height;
    if (Math.abs(ratio - (16 / 9)) < 0.02) {
        const scale = width / 2560;
        return scaleConfig(CONFIG.resolutions['2K'], scale, width, height);
    }
    
    // 3. Fallback mặc định về cấu hình 2K
    return CONFIG.resolutions[CONFIG.activeResolution];
}

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = { CONFIG, getActiveConfig, scaleConfig };
} else {
    window.CONFIG = CONFIG;
    window.getActiveConfig = getActiveConfig;
}
