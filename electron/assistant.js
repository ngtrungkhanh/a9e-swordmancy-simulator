/**
 * assistant.js
 * Logic trợ lý quét màn hình và tính toán tối ưu nước đi live.
 */

// Starting Deck Presets
const DECK_PRESETS = {
    '1': {1: 3, 2: 7, 3: 7, 4: 7, 5: 4},
    '2': {1: 3, 2: 6, 3: 6, 4: 6, 5: 6},
    '3': {1: 3, 2: 6, 3: 6, 4: 6, 5: 5},
    '4': {1: 3, 2: 7, 3: 7, 4: 7, 5: 5},
    '5': {1: 3, 2: 7, 3: 7, 4: 7, 5: 4},
    '6': {1: 3, 2: 6, 3: 6, 4: 6, 5: 6},
    '7': {1: 3, 2: 6, 3: 6, 4: 6, 5: 6}
};

const ACTION_LABELS = {
    'Draw': 'RÚT BÀI (DRAW)',
    'Stop': 'DỪNG LẠI (STOP)',
    'Double': 'NHÂN ĐÔI (DOUBLE)',
    'Abandon': 'BỎ BÀI (ABANDON)',
    'None': 'HÃY QUÉT GAME'
};

const ACTION_REASONS = {
    'Draw': 'Giá trị kỳ vọng khi rút tiếp lớn hơn việc dừng lại hoặc bỏ bài. Hãy bấm RÚT BÀI.',
    'Stop': 'Bạn đã đạt điểm số an toàn hoặc kỳ vọng rút tiếp quá rủi ro (dễ bị tràn điểm). Hãy bấm DỪNG LẠI.',
    'Double': 'Bạn đang cầm 2 lá bài và giá trị kỳ vọng của việc Nhân Đôi điểm là tối ưu. Hãy bấm NHÂN ĐÔI.',
    'Abandon': 'Bộ bài còn lại quá xấu hoặc điểm hiện tại không thể cứu vãn. Bỏ bài miễn phí là tối ưu. Hãy bấm BỎ BÀI.',
    'None': 'Chưa quét lần nào. Nhấn F4 hoặc nút SCAN bên trái để chụp màn hình và tự động nhận diện.'
};

const ACTION_CLASSES = {
    'Draw': 'draw-action',
    'Stop': 'stop-action',
    'Double': 'double-action',
    'Abandon': 'abandon-action',
    'None': ''
};

// State
let attemptsLeft = 3;
let freeAbandonsLeft = 3;
let doublesLeft = 2;
let selectedPreset = '4';
let autoScanInterval = null;
let lastScannedRemaining = null;

// Digit classifier function (3x3 grid density)
function classifyDigit(w, h, normGrid) {
    if (w < 13) return 1;

    // 7: grid[3] === 0 && grid[8] === 0
    if (normGrid[3] < 0.02 && normGrid[8] < 0.02) {
        return 7;
    }

    // 6: grid[2] < 0.02 && grid[3] > 0.15
    if (normGrid[2] < 0.02 && normGrid[3] > 0.15) {
        return 6;
    }

    // 3 or 2: grid[3] < 0.02
    if (normGrid[3] < 0.02) {
        if (normGrid[6] > normGrid[8]) {
            return 2;
        } else {
            return 3;
        }
    }

    // 5: grid[8] > 0.10 && grid[3] > 0.08
    if (normGrid[8] > 0.10 && normGrid[3] > 0.08) {
        return 5;
    }

    // 4: top-center (grid[1]) is small, top-left and top-right are present
    if (normGrid[1] < 0.05 && normGrid[0] > 0.05 && normGrid[2] > 0.05) {
        return 4;
    }

    // 0: middle hole
    if (normGrid[4] < 0.08) {
        return 0;
    }

    return 8;
}

// Log helper to send logs back to Electron main process
function log(msg) {
    if (window.electronAPI) {
        window.electronAPI.log(msg);
    } else {
        console.log(msg);
    }
}

// Initialize UI
document.addEventListener('DOMContentLoaded', () => {
    log('assistant.js: DOM Content Loaded');

    // Load saved settings if any
    const savedAttempts = localStorage.getItem('attemptsLeft');
    if (savedAttempts !== null) {
        attemptsLeft = parseInt(savedAttempts);
        document.getElementById('state-attempts').value = attemptsLeft;
    }
    const savedAbandons = localStorage.getItem('freeAbandonsLeft');
    if (savedAbandons !== null) {
        freeAbandonsLeft = parseInt(savedAbandons);
        document.getElementById('state-free-abandons').value = freeAbandonsLeft;
    }
    const savedDoubles = localStorage.getItem('doublesLeft');
    if (savedDoubles !== null) {
        doublesLeft = parseInt(savedDoubles);
        document.getElementById('state-doubles').value = doublesLeft;
    }
    const savedPreset = localStorage.getItem('selectedPreset');
    if (savedPreset !== null) {
        selectedPreset = savedPreset;
        document.getElementById('deck-preset').value = selectedPreset;
    }

    // Setup Event Listeners
    setupEventListeners();

    // Setup IPC Callbacks
    if (window.electronAPI) {
        log('Registering IPC listeners...');
        window.electronAPI.onScanHotkey(() => {
            log('Scan hotkey received in renderer');
            updateBadgeStatus('ĐANG QUÉT...', 'scanning');
        });

        window.electronAPI.onScreenshotCaptured((dataUrl) => {
            log('Screenshot captured dataUrl received');
            processScreenshot(dataUrl);
        });
    } else {
        log('electronAPI is not available. Live scanning disabled.');
    }
});

function updateBadgeStatus(text, statusClass) {
    const badge = document.getElementById('app-status');
    badge.innerText = text;
    badge.className = 'status-badge';
    if (statusClass) {
        badge.classList.add(statusClass);
    }
}

function setupEventListeners() {
    // Steppers
    document.getElementById('btn-attempts-minus').onclick = () => updateStepper('attempts', -1);
    document.getElementById('btn-attempts-plus').onclick = () => updateStepper('attempts', 1);
    document.getElementById('btn-abandons-minus').onclick = () => updateStepper('abandons', -1);
    document.getElementById('btn-abandons-plus').onclick = () => updateStepper('abandons', 1);
    document.getElementById('btn-doubles-minus').onclick = () => updateStepper('doubles', -1);
    document.getElementById('btn-doubles-plus').onclick = () => updateStepper('doubles', 1);

    // Preset selection
    document.getElementById('deck-preset').onchange = (e) => {
        selectedPreset = e.target.value;
        localStorage.setItem('selectedPreset', selectedPreset);
        log(`Selected preset changed to ${selectedPreset}`);
        // If we have scanned before, re-run solver immediately with the new preset
        if (lastScannedRemaining) {
            runSolver(lastScannedRemaining.remainingDeck, lastScannedRemaining.isDoubled);
        }
    };

    // Reset Day
    document.getElementById('btn-reset-day').onclick = () => {
        attemptsLeft = 3;
        freeAbandonsLeft = 3;
        doublesLeft = 2;
        localStorage.setItem('attemptsLeft', attemptsLeft);
        localStorage.setItem('freeAbandonsLeft', freeAbandonsLeft);
        localStorage.setItem('doublesLeft', doublesLeft);
        
        document.getElementById('state-attempts').value = attemptsLeft;
        document.getElementById('state-free-abandons').value = freeAbandonsLeft;
        document.getElementById('state-doubles').value = doublesLeft;
        log('Reset Day clicked: states set to 3, 3, 2');
        
        if (lastScannedRemaining) {
            runSolver(lastScannedRemaining.remainingDeck, lastScannedRemaining.isDoubled);
        }
    };

    // Scan Button
    document.getElementById('btn-scan').onclick = () => {
        log('QUÉT GAME button clicked');
        updateBadgeStatus('ĐANG QUÉT...', 'scanning');
        if (window.electronAPI) {
            window.electronAPI.requestScreenshot();
        } else {
            alert('Lỗi: electronAPI không khả dụng. Chỉ chạy được trên Electron.');
        }
    };

    // Auto-scan checkbox
    document.getElementById('chk-auto-scan').onchange = (e) => {
        const isChecked = e.target.checked;
        log(`Auto-scan checkbox changed: ${isChecked}`);
        if (isChecked) {
            autoScanInterval = setInterval(() => {
                if (window.electronAPI) {
                    window.electronAPI.requestScreenshot();
                }
            }, 1000);
        } else {
            if (autoScanInterval) {
                clearInterval(autoScanInterval);
                autoScanInterval = null;
            }
        }
    };
}

function updateStepper(type, delta) {
    if (type === 'attempts') {
        attemptsLeft = Math.max(0, Math.min(3, attemptsLeft + delta));
        document.getElementById('state-attempts').value = attemptsLeft;
        localStorage.setItem('attemptsLeft', attemptsLeft);
    } else if (type === 'abandons') {
        freeAbandonsLeft = Math.max(0, Math.min(3, freeAbandonsLeft + delta));
        document.getElementById('state-free-abandons').value = freeAbandonsLeft;
        localStorage.setItem('freeAbandonsLeft', freeAbandonsLeft);
    } else if (type === 'doubles') {
        doublesLeft = Math.max(0, Math.min(2, doublesLeft + delta));
        document.getElementById('state-doubles').value = doublesLeft;
        localStorage.setItem('doublesLeft', doublesLeft);
    }
    
    if (lastScannedRemaining) {
        runSolver(lastScannedRemaining.remainingDeck, lastScannedRemaining.isDoubled);
    }
}

function processScreenshot(dataUrl) {
    const img = new Image();
    img.src = dataUrl;
    img.onload = () => {
        const canvas = document.getElementById('proc-canvas');
        const ctx = canvas.getContext('2d');
        
        // Force canvas size to match the screenshot resolution
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        
        log(`Screenshot image loaded on canvas. Dims: ${img.width}x${img.height}`);

        try {
            // Get active coordinates configuration from config.js
            const activeConfig = window.getActiveConfig();
            const deckCounts = activeConfig.deckCounts;
            const doubleSwitch = activeConfig.doubleSwitch;

            const remainingDeck = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
            const imgData = ctx.getImageData(0, 0, img.width, img.height);
            const pixels = imgData.data;

            // 1. Scan Deck Count Columns
            deckCounts.forEach((dc, idx) => {
                const cropW = dc.width;
                const cropH = dc.height;
                const cropX = dc.x;
                const cropY = dc.y;

                let darkPixels = 0;
                let minX = cropW, maxX = 0, minY = cropH, maxY = 0;
                const cropBuffer = new Uint8Array(cropW * cropH);

                for (let cy = 0; cy < cropH; cy++) {
                    for (let cx = 0; cx < cropW; cx++) {
                        const srcIdx = ((cropY + cy) * img.width + (cropX + cx)) * 4;
                        const r = pixels[srcIdx];
                        const g = pixels[srcIdx+1];
                        const b = pixels[srcIdx+2];
                        const val = (r + g + b) / 3;

                        // Fixed threshold 110 for deck digits
                        if (val <= 110) {
                            darkPixels++;
                            if (cx < minX) minX = cx;
                            if (cx > maxX) maxX = cx;
                            if (cy < minY) minY = cy;
                            if (cy > maxY) maxY = cy;
                            cropBuffer[cy * cropW + cx] = 1;
                        }
                    }
                }

                if (darkPixels < 30) {
                    remainingDeck[idx+1] = 0;
                    return;
                }

                const w = maxX - minX + 1;
                const h = maxY - minY + 1;

                // Calculate 3x3 grid density
                const cellW = w / 3;
                const cellH = h / 3;
                const grid = Array(9).fill(0);

                for (let cy = minY; cy <= maxY; cy++) {
                    for (let cx = minX; cx <= maxX; cx++) {
                        if (cropBuffer[cy * cropW + cx] === 1) {
                            const cellX = Math.min(2, Math.floor((cx - minX) / cellW));
                            const cellY = Math.min(2, Math.floor((cy - minY) / cellH));
                            grid[cellY * 3 + cellX]++;
                        }
                    }
                }

                const normGrid = grid.map(v => Number((v / darkPixels).toFixed(3)));
                const digit = classifyDigit(w, h, normGrid);
                remainingDeck[idx+1] = digit;
            });

            log(`Scanned Remaining Deck: [${Object.values(remainingDeck).join(', ')}]`);

            // 2. Scan Double active capsule (count white pixels)
            let whitePixels = 0;
            const dsX = doubleSwitch.x;
            const dsY = doubleSwitch.y;
            const dsW = doubleSwitch.width;
            const dsH = doubleSwitch.height;

            for (let cy = 0; cy < dsH; cy++) {
                for (let cx = 0; cx < dsW; cx++) {
                    const srcIdx = ((dsY + cy) * img.width + (dsX + cx)) * 4;
                    const r = pixels[srcIdx];
                    const g = pixels[srcIdx+1];
                    const b = pixels[srcIdx+2];

                    if (r > 220 && g > 220 && b > 220) {
                        whitePixels++;
                    }
                }
            }

            const isDoubled = whitePixels > 200;
            log(`Scanned Double active: ${isDoubled} (white pixels = ${whitePixels})`);

            // Save results to trigger Solver
            lastScannedRemaining = { remainingDeck, isDoubled };
            updateBadgeStatus('QUÉT THÀNH CÔNG', 'success');
            
            const scanTime = new Date().toLocaleTimeString();
            document.getElementById('scan-meta').innerText = `Quét xong lúc ${scanTime}. Nhân đôi: ${isDoubled ? 'BẬT' : 'TẮT'}`;

            runSolver(remainingDeck, isDoubled);

        } catch (err) {
            log(`Error parsing screenshot buffer: ${err.stack || err.message}`);
            updateBadgeStatus('LỖI QUÉT', 'error');
        }
    };
}

function runSolver(remainingDeck, isDoubled) {
    const startingDeck = DECK_PRESETS[selectedPreset];
    
    // Calculate fanned hand by subtraction
    const hand = [];
    const simulatedDeckCounts = { ...startingDeck };
    let hasNegativeError = false;

    for (let bp = 1; bp <= 5; bp++) {
        const diff = startingDeck[bp] - remainingDeck[bp];
        if (diff < 0) {
            hasNegativeError = true;
        } else {
            for (let i = 0; i < diff; i++) {
                hand.push(bp);
            }
        }
    }

    // If subtraction fanned hand is invalid, print warning
    if (hasNegativeError) {
        log(`Warning: Negative cards difference. Scanned remaining [${Object.values(remainingDeck).join(', ')}] is greater than starting preset [${Object.values(startingDeck).join(', ')}]`);
        document.getElementById('suggestion-value').innerText = 'SAI BỘ BÀI GỐC';
        document.getElementById('suggestion-reason').innerHTML = `<span style="color: var(--color-red); font-weight: bold;">LỖI QUÉT:</span> Bộ bài còn lại quét được lớn hơn bộ bài gốc của Preset ${selectedPreset}.<br>Vui lòng chọn đúng <strong>Bộ bài xuất phát</strong> đang sử dụng ở panel bên trái.`;
        document.getElementById('suggestion-box').className = 'suggestion-box assistant-suggestion abandon-action';
        return;
    }

    // Show hand cards in UI
    renderHandCards(hand);

    // Calculate score
    const sum = hand.reduce((acc, val) => acc + val, 0);
    const score = sum % 11;
    document.getElementById('stat-sum').innerText = score;
    document.getElementById('stat-double').innerText = isDoubled ? 'BẬT' : 'TẮT';
    document.getElementById('stat-double').className = isDoubled ? 'stat-num gold-glow' : 'stat-num text-muted';

    // Solve DP EV
    const solver = new SwordmancySolver(startingDeck, 4); // level 4 default
    const advice = solver.getBestAction(attemptsLeft, freeAbandonsLeft, doublesLeft, hand, isDoubled);

    log(`Solver advice action: ${advice.action}, EV: ${advice.ev.toFixed(2)}`);

    // Render suggestion
    const sBox = document.getElementById('suggestion-box');
    sBox.className = 'suggestion-box assistant-suggestion ' + ACTION_CLASSES[advice.action];
    
    document.getElementById('suggestion-value').innerText = ACTION_LABELS[advice.action];
    document.getElementById('suggestion-reason').innerText = ACTION_REASONS[advice.action];

    // Expected value displays
    document.getElementById('stat-reward').innerText = (solver.rewards[score] || 0) * (isDoubled ? 2 : 1) + ' Bills';

    document.getElementById('ev-val-state').innerText = advice.ev.toFixed(1) + ' Bills';
    document.getElementById('ev-val-draw').innerText = advice.details.evDraw !== null ? advice.details.evDraw.toFixed(1) + ' Bills' : '-';
    document.getElementById('ev-val-stop').innerText = advice.details.evStop !== null ? advice.details.evStop.toFixed(1) + ' Bills' : '-';
    document.getElementById('ev-val-abandon').innerText = advice.details.evAbandon !== null ? advice.details.evAbandon.toFixed(1) + ' Bills' : '-';

    // Remaining Deck Probabilities list
    const probList = document.getElementById('prob-list');
    probList.innerHTML = '';

    const remainingCounts = solver.getRemainingDeck(hand);
    const totalRemaining = advice.details.totalRemaining;

    for (let bp = 1; bp <= 5; bp++) {
        const count = remainingCounts[bp] || 0;
        const prob = totalRemaining > 0 ? (count / totalRemaining * 100).toFixed(0) + '%' : '0%';

        const row = document.createElement('div');
        row.className = 'ev-row';
        row.innerHTML = `
            <span class="ev-label">Lá bài ${bp} BP (${count} lá):</span>
            <span class="ev-val">${prob}</span>
        `;
        probList.appendChild(row);
    }

    // Add overflow row
    const overflowRow = document.createElement('div');
    overflowRow.className = 'ev-row';
    overflowRow.style.borderTop = '1px dashed rgba(255, 255, 255, 0.05)';
    overflowRow.style.paddingTop = '0.5rem';
    overflowRow.style.marginTop = '0.5rem';
    overflowRow.innerHTML = `
        <span class="ev-label" style="color: var(--color-red);">Xác suất tràn điểm (>10 BP):</span>
        <span class="ev-val" style="color: var(--color-red); font-weight: bold;">${(advice.details.overflowProb * 100).toFixed(0)}%</span>
    `;
    probList.appendChild(overflowRow);
}

function renderHandCards(hand) {
    const handContainer = document.getElementById('hand-container');
    handContainer.innerHTML = '';

    // Show up to 5 fanned cards or empty slots
    for (let i = 0; i < 5; i++) {
        const cardDiv = document.createElement('div');
        if (i < hand.length) {
            const bp = hand[i];
            cardDiv.className = `sim-card card-${bp}`;
            cardDiv.innerHTML = `
                <span class="sim-card-num">${bp}</span>
                <span class="sim-card-lbl">BP</span>
            `;
        } else {
            cardDiv.className = 'sim-card empty';
            cardDiv.innerHTML = `
                <span class="sim-card-num" style="font-size: 1.2rem;">-</span>
                <span class="sim-card-lbl">Trống</span>
            `;
        }
        handContainer.appendChild(cardDiv);
    }
}
