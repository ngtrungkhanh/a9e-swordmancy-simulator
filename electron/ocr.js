/**
 * ocr.js
 * Module hỗ trợ nhận diện chữ số thẻ bài bằng phương pháp khớp mẫu (Template Matching).
 * Hỗ trợ chạy trong cả Renderer Process (HTML script tag) và Main Process (CommonJS require).
 */

const OCR_TEMPLATES = {
    '1': [
        // Mẫu A (num_0.png)
        [
            0x00000000, 0x00000000, 0x00000000, 0x00003fc0, 0x0000ffc0, 0x0003ffc0, 0x0007ffc0, 0x001fffc0,
            0x003fffc0, 0x00ffffc0, 0x03ffffc0, 0x03ffffc0, 0x01ffffc0, 0x01ffffc0, 0x01ffffc0, 0x01ffffc0,
            0x00ffffc0, 0x00f9ffc0, 0x0061ffc0, 0x0001ffc0, 0x0001ffc0, 0x0001ffc0, 0x0001ffc0, 0x0001ffc0,
            0x0001ffc0, 0x0001ffc0, 0x0001ffc0, 0x0001ffc0, 0x0001ffc0, 0x0001ffc0, 0x0001ffc0, 0x0001ffc0,
            0x0001ffc0, 0x0001ffc0, 0x0001ffc0, 0x0001ffc0, 0x0001ffc0, 0x0001ffc0, 0x0001ffc0, 0x0001ffc0,
            0x0001ffc0, 0x0001ffc0, 0x0001ffc0, 0x0001ffc0, 0x0001ffc0, 0x00000000, 0x00000000, 0x00000000
        ],
        // Mẫu B (num_4.png)
        [
            0x00000000, 0x00000000, 0x00000000, 0x00003fc0, 0x00007fc0, 0x0001ffc0, 0x0007ffc0, 0x001fffc0,
            0x003fffc0, 0x00ffffc0, 0x03ffffc0, 0x03ffffc0, 0x01ffffc0, 0x01ffffc0, 0x01ffffc0, 0x00ffffc0,
            0x00ffffc0, 0x0079ffc0, 0x0071ffc0, 0x0001ffc0, 0x0001ffc0, 0x0001ffc0, 0x0001ffc0, 0x0001ffc0,
            0x0001ffc0, 0x0001ffc0, 0x0000ffc0, 0x0000ffc0, 0x0000ffc0, 0x0000ffc0, 0x0000ffc0, 0x0000ffc0,
            0x0000ffc0, 0x0000ffc0, 0x0000ffc0, 0x0000ffc0, 0x0000ffc0, 0x0000ffc0, 0x0000ffc0, 0x0000ffc0,
            0x0000ffc0, 0x0000ffc0, 0x0001ffc0, 0x0001ffc0, 0x0000ffc0, 0x00000000, 0x00000000, 0x00000000
        ]
    ],
    '2': [
        // Mẫu (num_2.png)
        [
            0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x0007e000,
            0x001ff800, 0x007ffe00, 0x01ffff80, 0x03ffff80, 0x07ffffc0, 0x0fffffe0, 0x1fffffe0, 0x1ff87fe0,
            0x0fe03fe0, 0x03e01fe0, 0x00c01fe0, 0x00003fe0, 0x00003fe0, 0x00007fe0, 0x0000ffe0, 0x0001ff80,
            0x0003ff80, 0x000fff00, 0x000ffe00, 0x003ffc00, 0x003ff800, 0x00ffe000, 0x01ffe000, 0x07ff0000,
            0x0fff0000, 0x1ffffff8, 0x1ffffff8, 0x1ffffff8, 0x1ffffff8, 0x1ffffff8, 0x1ffffff8, 0x1ffffff8,
            0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000
        ]
    ],
    '3': [
        // Mẫu (num_1.png)
        [
            0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x000ff800,
            0x003ffc00, 0x007ffe00, 0x01ffff80, 0x03ffffc0, 0x07ffffe0, 0x0fffffe0, 0x0ffffff0, 0x1ff03ff0,
            0x03e01ff0, 0x00c01ff0, 0x00001ff0, 0x00003fe0, 0x000fffe0, 0x000fffc0, 0x000fff80, 0x000fff00,
            0x000fff80, 0x000fffe0, 0x000fffe0, 0x00001ff8, 0x00001ff8, 0x00400ff8, 0x00c00ff8, 0x07e00ff8,
            0x1ff01ff8, 0x1ffffff8, 0x0ffffff8, 0x0ffffff0, 0x03ffffe0, 0x03ffffe0, 0x00ffff80, 0x007fff00,
            0x00030000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000
        ]
    ],
    '4': [
        // Mẫu giả lập (synthetic 4)
        [
            0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000,
            0x00001f00, 0x00003f00, 0x00003f00, 0x00007f00, 0x0000ef00, 0x0000ef00, 0x0001cf00, 0x00038f00,
            0x00070f00, 0x00070f00, 0x000e0f00, 0x001c0f00, 0x001c0f00, 0x00380f00, 0x00700f00, 0x00700f00,
            0x00e00f00, 0x01c00f00, 0x03800f00, 0x03800f00, 0x07ffffe0, 0x03ffffe0, 0x03ffffe0, 0x03ffffe0,
            0x00000f00, 0x00000f00, 0x00000f00, 0x00000f00, 0x00000f00, 0x00000f00, 0x00000f00, 0x00000f00,
            0x00000f00, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000
        ]
    ],
    '5': [
        // Mẫu (num_3.png)
        [
            0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x01ffffe0, 0x03fffff0,
            0x03fffff0, 0x03fffff0, 0x03ffffe0, 0x03fffff0, 0x03fffff0, 0x03fffff0, 0x03fffff0, 0x07fc0000,
            0x07fc0000, 0x07fc0000, 0x07ffff00, 0x07ffff00, 0x07ffff80, 0x07ffffe0, 0x0fffffe0, 0x0ffffff0,
            0x0ffffff8, 0x07fffff8, 0x03f83ff8, 0x00601ff8, 0x00000ff8, 0x00000ff8, 0x00600ff8, 0x00600ff8,
            0x03f01ff8, 0x0ff83ff8, 0x1ffdfff8, 0x0ffffff8, 0x07fffff0, 0x07ffffe0, 0x03ffffc0, 0x01ffff80,
            0x007fff00, 0x000fe000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000, 0x00000000
        ]
    ]
};

/**
 * Đếm số bit 1 trong số nguyên 32-bit (popcount)
 */
function popcount(v) {
    v = v - ((v >> 1) & 0x55555555);
    v = (v & 0x33333333) + ((v >> 2) & 0x33333333);
    return ((v + (v >> 4) & 0x0F0F0F0F) * 0x01010101) >> 24;
}

/**
 * Trích xuất thành phần liên thông chữ số lớn nhất từ ảnh nhị phân
 */
function getLargestDigitComponent(cropBuffer, cropW, cropH) {
    const visited = new Uint8Array(cropW * cropH);
    let best = null;

    for (let y = 0; y < cropH; y++) {
        for (let x = 0; x < cropW; x++) {
            const startIdx = y * cropW + x;
            if (visited[startIdx] || cropBuffer[startIdx] !== 1) continue;

            const stack = [startIdx];
            visited[startIdx] = 1;
            const pixels = [];
            let minX = x, maxX = x, minY = y, maxY = y;

            while (stack.length > 0) {
                const idx = stack.pop();
                const cx = idx % cropW;
                const cy = Math.floor(idx / cropW);
                pixels.push(idx);

                if (cx < minX) minX = cx;
                if (cx > maxX) maxX = cx;
                if (cy < minY) minY = cy;
                if (cy > maxY) maxY = cy;

                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const nx = cx + dx;
                        const ny = cy + dy;
                        if (nx < 0 || nx >= cropW || ny < 0 || ny >= cropH) continue;
                        const nextIdx = ny * cropW + nx;
                        if (!visited[nextIdx] && cropBuffer[nextIdx] === 1) {
                            visited[nextIdx] = 1;
                            stack.push(nextIdx);
                        }
                    }
                }
            }

            const w = maxX - minX + 1;
            const h = maxY - minY + 1;
            const count = pixels.length;
            
            // Giới hạn chữ số: tối thiểu 30px sáng, kích thước phù hợp chữ số card
            const looksLikeDigit = count >= 30 && w >= 4 && h >= 12 && w <= 65 && h <= 80;
            if (!looksLikeDigit) continue;

            // Chữ số thẻ bài nằm gần trung tâm vùng crop hơn là phần chân viền dưới
            const centerY = (minY + maxY) / 2;
            const score = count - Math.max(0, centerY - cropH * 0.65) * 4;
            if (!best || score > best.score) {
                best = { pixels, minX, maxX, minY, maxY, w, h, count, score };
            }
        }
    }

    if (!best) return null;

    const componentBuffer = new Uint8Array(cropW * cropH);
    best.pixels.forEach(idx => {
        componentBuffer[idx] = 1;
    });
    return { buffer: componentBuffer, details: best };
}

/**
 * Co dãn giữ nguyên tỷ lệ và căn giữa chữ số về khung 32x48
 */
function normalizeComponent(bestComponent, cropW, cropH) {
    const { pixels, minX, maxX, minY, maxY, w, h } = bestComponent;
    
    // Tạo mặt nạ khít bounding box của chữ số
    const bbMask = new Uint8Array(w * h);
    pixels.forEach(idx => {
        const cx = idx % cropW;
        const cy = Math.floor(idx / cropW);
        const bx = cx - minX;
        const by = cy - minY;
        bbMask[by * w + bx] = 1;
    });

    const targetW = 32;
    const targetH = 48;
    const padding = 3; // Lề an toàn xung quanh
    
    const destMask = new Uint32Array(targetH); // Lưu trữ dưới dạng mảng 48 dòng, mỗi dòng 1 số nguyên 32-bit
    
    const innerW = targetW - 2 * padding;
    const innerH = targetH - 2 * padding;
    
    const scaleX = innerW / w;
    const scaleY = innerH / h;
    const scale = Math.min(scaleX, scaleY);
    
    const scaledW = Math.round(w * scale);
    const scaledH = Math.round(h * scale);
    
    const startX = Math.floor((targetW - scaledW) / 2);
    const startY = Math.floor((targetH - scaledH) / 2);
    
    for (let dy = 0; dy < scaledH; dy++) {
        let rowVal = 0;
        for (let dx = 0; dx < scaledW; dx++) {
            const sx = Math.min(w - 1, Math.floor(dx / scale));
            const sy = Math.min(h - 1, Math.floor(dy / scale));
            if (bbMask[sy * w + sx] === 1) {
                const posX = startX + dx;
                rowVal |= (1 << (31 - posX));
            }
        }
        destMask[startY + dy] = rowVal >>> 0;
    }
    
    return destMask;
}

/**
 * Thuật toán so khớp mẫu chính thức dùng IoU
 */
function matchTemplate(inputMask) {
    const results = {};
    let bestDigit = null;
    let bestScore = -1;
    
    Object.keys(OCR_TEMPLATES).forEach(digitStr => {
        const templates = OCR_TEMPLATES[digitStr];
        let maxIoUForDigit = 0;
        
        templates.forEach(templateRows => {
            let intersection = 0;
            let union = 0;
            
            for (let y = 0; y < 48; y++) {
                const inputRow = inputMask[y];
                const templateRow = templateRows[y];
                
                const inter = inputRow & templateRow;
                const uni = inputRow | templateRow;
                
                intersection += popcount(inter);
                union += popcount(uni);
            }
            
            const iou = union > 0 ? intersection / union : 0;
            if (iou > maxIoUForDigit) {
                maxIoUForDigit = iou;
            }
        });
        
        results[digitStr] = Number(maxIoUForDigit.toFixed(4));
        if (maxIoUForDigit > bestScore) {
            bestScore = maxIoUForDigit;
            bestDigit = parseInt(digitStr);
        }
    });
    
    // Tính margin (khoảng cách điểm của số tốt nhất so với số tốt nhì)
    const sortedScores = Object.values(results).sort((a, b) => b - a);
    const margin = sortedScores.length > 1 ? sortedScores[0] - sortedScores[1] : sortedScores[0];
    
    return {
        digit: bestDigit,
        confidence: bestScore,
        margin: margin,
        scores: results
    };
}

/**
 * Phân loại chữ số thẻ bài từ vùng cắt
 */
function classifyCardDigitFromCrop(cropPixels, cropW, cropH) {
    // 1. Chạy nhị phân hóa với ngưỡng cứng 110 trước
    let cropBuffer = new Uint8Array(cropW * cropH);
    let totalLuminance = 0;
    
    for (let cy = 0; cy < cropH; cy++) {
        for (let cx = 0; cx < cropW; cx++) {
            const srcIdx = (cy * cropW + cx) * 4;
            const r = cropPixels[srcIdx];
            const g = cropPixels[srcIdx+1];
            const b = cropPixels[srcIdx+2];
            const val = (r + g + b) / 3;
            totalLuminance += val;
            
            if (val <= 110) {
                cropBuffer[cy * cropW + cx] = 1;
            }
        }
    }
    
    let comp = getLargestDigitComponent(cropBuffer, cropW, cropH);
    let usedAdaptive = false;
    let thresholdUsed = 110;
    
    // 2. Dự phòng: Nếu không trích xuất được khối liên thông phù hợp, thử ngưỡng động thích ứng
    if (!comp) {
        const mean = totalLuminance / (cropW * cropH);
        let sqSum = 0;
        for (let cy = 0; cy < cropH; cy++) {
            for (let cx = 0; cx < cropW; cx++) {
                const srcIdx = (cy * cropW + cx) * 4;
                const val = (cropPixels[srcIdx] + cropPixels[srcIdx+1] + cropPixels[srcIdx+2]) / 3;
                sqSum += (val - mean) ** 2;
            }
        }
        const stdDev = Math.sqrt(sqSum / (cropW * cropH));
        thresholdUsed = Math.round(Math.min(130, mean - 0.55 * stdDev));
        
        cropBuffer = new Uint8Array(cropW * cropH);
        for (let cy = 0; cy < cropH; cy++) {
            for (let cx = 0; cx < cropW; cx++) {
                const srcIdx = (cy * cropW + cx) * 4;
                const val = (cropPixels[srcIdx] + cropPixels[srcIdx+1] + cropPixels[srcIdx+2]) / 3;
                if (val <= thresholdUsed) {
                    cropBuffer[cy * cropW + cx] = 1;
                }
            }
        }
        comp = getLargestDigitComponent(cropBuffer, cropW, cropH);
        usedAdaptive = true;
    }
    
    if (!comp) {
        return { digit: null, reason: 'no digit component found' };
    }
    
    // 3. Chuẩn hóa hình dạng về 32x48
    const normMask = normalizeComponent(comp.details, cropW, cropH);
    
    // 4. Khớp mẫu theo thuật toán IoU
    const match = matchTemplate(normMask);
    
    // Ngưỡng lọc độ tin cậy và khoảng cách điểm chênh lệch
    const minConfidence = 0.45;
    const minMargin = 0.06;
    
    const isAccepted = match.confidence >= minConfidence && match.margin >= minMargin;
    
    const resultObj = {
        digit: isAccepted ? match.digit : null,
        darkPixels: comp.details.count,
        minX: comp.details.minX,
        maxX: comp.details.maxX,
        minY: comp.details.minY,
        maxY: comp.details.maxY,
        w: comp.details.w,
        h: comp.details.h,
        confidence: match.confidence,
        margin: match.margin,
        scores: match.scores,
        threshold: thresholdUsed,
        adaptive: usedAdaptive
    };
    
    if (!isAccepted) {
        resultObj.reason = `rejected bestScore=${match.confidence.toFixed(2)} margin=${match.margin.toFixed(2)}`;
    }
    
    return resultObj;
}

// Xuất module cho cả môi trường Node (CommonJS) và Web (window)
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = {
        OCR_TEMPLATES,
        popcount,
        getLargestDigitComponent,
        normalizeComponent,
        classifyCardDigitFromCrop
    };
} else {
    window.classifyCardDigitFromCrop = classifyCardDigitFromCrop;
}
