/**
 * assistant.js
 * Logic trợ lý quét màn hình và tính toán tối ưu nước đi live.
 */

// Starting Deck Presets (synchronized with app.js / Wiki)
const DECK_PRESETS = {
    '1': { 1: 5, 2: 5, 3: 5, 4: 8, 5: 6 },
    '2': { 1: 4, 2: 5, 3: 6, 4: 6, 5: 7 },
    '3': { 1: 7, 2: 3, 3: 7, 4: 3, 5: 7 },
    '4': { 1: 3, 2: 7, 3: 7, 4: 7, 5: 5 },
    '5': { 1: 6, 2: 6, 3: 9, 4: 4, 5: 3 },
    '6': { 1: 4, 2: 5, 3: 4, 4: 8, 5: 7 },
    '7': { 1: 8, 2: 5, 3: 2, 4: 5, 5: 8 },
    'custom': { 1: 3, 2: 7, 3: 7, 4: 7, 5: 5 } // Default to Preset 4
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
let lastScannedHand = [];
let lastScannedSlots = Array(5).fill(null);
let accumulatedBills = 0;
let scanStarted = false;
let uiScale = 1.0;
const scrWidth = window.screen.width;
if (scrWidth < 2560) {
    uiScale = scrWidth / 2560;
    if (uiScale < 0.75) uiScale = 0.75;
}

// Debug switch: true = ignore deck-diff/reconcile and display hand from slot OCR only.
const DEBUG_SLOT_OCR_ONLY = true;

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

function formatSlots(slots) {
    return `[${slots.map(v => (v === null || v === undefined) ? '?' : v).join(', ')}]`;
}

function toggleCustomDeckConfig() {
    const configPanel = document.getElementById('custom-deck-config');
    if (selectedPreset === 'custom') {
        configPanel.style.display = 'block';
    } else {
        configPanel.style.display = 'none';
    }
}

// Initialize UI
document.addEventListener('DOMContentLoaded', () => {
    log(`assistant.js: DOM Content Loaded. Applying UI scale zoom: ${uiScale}`);
    document.body.style.zoom = uiScale;
    document.body.style.width = `${100 / uiScale}vw`;
    document.body.style.height = `${100 / uiScale}vh`;

    // Custom Window Control Listeners
    document.getElementById('win-btn-minimize').onclick = () => {
        if (window.electronAPI) window.electronAPI.minimizeWindow();
    };
    document.getElementById('win-btn-close').onclick = () => {
        if (window.electronAPI) window.electronAPI.closeWindow();
    };
    document.getElementById('hud-btn-close').onclick = () => {
        if (window.electronAPI) window.electronAPI.closeWindow();
    };
    const winBtnScan = document.getElementById('win-btn-scan');
    if (winBtnScan) {
        winBtnScan.onclick = () => {
            log('Header win-btn-scan clicked');
            forceScanNow();
        };
    }

    // Load saved settings if any
    const savedAttempts = localStorage.getItem('attemptsLeft');
    if (savedAttempts !== null) {
        attemptsLeft = parseInt(savedAttempts);
    }
    const savedAbandons = localStorage.getItem('freeAbandonsLeft');
    if (savedAbandons !== null) {
        freeAbandonsLeft = parseInt(savedAbandons);
    }
    const savedDoubles = localStorage.getItem('doublesLeft');
    if (savedDoubles !== null) {
        doublesLeft = parseInt(savedDoubles);
    }
    const savedAccumulated = localStorage.getItem('accumulatedBills');
    if (savedAccumulated !== null) {
        accumulatedBills = parseInt(savedAccumulated);
    }
    syncStepperUI();
    updateAccumulatedBillsUI();

    const savedPreset = localStorage.getItem('selectedPreset');
    if (savedPreset !== null) {
        selectedPreset = savedPreset;
        document.getElementById('deck-preset').value = selectedPreset;
    }

    const savedCustomDeck = localStorage.getItem('customDeckPreset');
    if (savedCustomDeck !== null) {
        try {
            DECK_PRESETS['custom'] = JSON.parse(savedCustomDeck);
            for (let v = 1; v <= 5; v++) {
                document.getElementById(`custom-deck-${v}`).value = DECK_PRESETS['custom'][v];
            }
        } catch (e) {
            log(`Failed to parse saved custom deck: ${e.message}`);
        }
    }
    toggleCustomDeckConfig();

    // Default to normal mode on startup as requested
    setWindowMode('normal');

    // Setup Event Listeners
    setupEventListeners();

    // Init auto scan visual state
    updateAutoScanVisualState();

    // Setup IPC Callbacks
    if (window.electronAPI) {
        log('Registering IPC listeners...');
        window.electronAPI.onScanHotkey(() => {
            log('Scan hotkey F4 received in renderer');
            const chk = document.getElementById('chk-auto-scan');
            chk.checked = !chk.checked;
            scanStarted = true;
            triggerAutoScanStateChange();
        });

        window.electronAPI.onToggleAutoScan(() => {
            log('Toggle auto-scan F4 hotkey received in renderer');
            const chk = document.getElementById('chk-auto-scan');
            chk.checked = !chk.checked;
            scanStarted = true;
            triggerAutoScanStateChange();
        });

        window.electronAPI.onForceScan(() => {
            log('Force scan F5 hotkey received in renderer');
            forceScanNow();
        });

        window.electronAPI.onScreenshotCaptured((dataUrl) => {
            log('Screenshot captured dataUrl received');
            processScreenshot(dataUrl);
        });

        // Setup manual drag resize handle
        const resizeHandle = document.getElementById('win-resize-handle');
        if (resizeHandle) {
            resizeHandle.onmousedown = (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const startX = e.screenX;
                const startY = e.screenY;
                const startWidth = window.outerWidth || window.innerWidth;
                const startHeight = window.outerHeight || window.innerHeight;
                
                const onMouseMove = (moveEvent) => {
                    const deltaX = moveEvent.screenX - startX;
                    const deltaY = moveEvent.screenY - startY;
                    
                    // Min dimensions based on mode, scaled by uiScale to match physical pixels
                    const baseMinW = currentWindowMode === 'overlay' ? 400 : 1024;
                    const baseMinH = currentWindowMode === 'overlay' ? 150 : 700;
                    
                    const minW = Math.round(baseMinW * uiScale);
                    const minH = Math.round(baseMinH * uiScale);
                    
                    const newWidth = Math.max(minW, startWidth + deltaX);
                    const newHeight = Math.max(minH, startHeight + deltaY);
                    
                    window.electronAPI.resizeWindow(newWidth, newHeight);
                };
                
                const onMouseUp = () => {
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                };
                
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            };
        }
    } else {
        log('electronAPI is not available. Live scanning disabled.');
    }

    // Fallback file picker for offline testing (in case UAC UIPI blocks drag-and-drop)
    const lnkSelectFile = document.getElementById('lnk-select-file');
    if (lnkSelectFile) {
        lnkSelectFile.onclick = async (e) => {
            e.preventDefault();
            log('lnk-select-file clicked, invoking select-file IPC');
            
            if (window.electronAPI && window.electronAPI.selectFile) {
                try {
                    updateBadgeStatus('ĐANG CHỌN FILE...', 'scanning');
                    const dataUrl = await window.electronAPI.selectFile();
                    if (dataUrl) {
                        log('File selected and loaded successfully via native dialog.');
                        updateBadgeStatus('ĐANG ĐỌC FILE...', 'scanning');
                        processScreenshot(dataUrl);
                    } else {
                        log('File selection canceled or returned empty.');
                        updateBadgeStatus('ĐÃ HỦY CHỌN FILE');
                        setTimeout(() => {
                            const currentStatus = document.getElementById('app-status').innerText;
                            if (currentStatus === 'ĐÃ HỦY CHỌN FILE') {
                                updateBadgeStatus('SẴN SÀNG QUÉT (F4)');
                            }
                        }, 2000);
                    }
                } catch (err) {
                    log(`Error opening native file dialog: ${err.message}`);
                    updateBadgeStatus('LỖI CHỌN FILE');
                }
            } else {
                // Fallback to browser file input click in case electronAPI is not available
                const fileInput = document.getElementById('file-input');
                if (fileInput) {
                    fileInput.click();
                }
            }
        };
        
        const fileInput = document.getElementById('file-input');
        if (fileInput) {
            fileInput.onchange = (e) => {
                const files = e.target.files;
                if (files && files.length > 0) {
                    const file = files[0];
                    log(`File selected via picker fallback: ${file.name} (type: "${file.type || 'unknown'}")`);
                    updateBadgeStatus('ĐANG ĐỌC FILE...', 'scanning');
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        processScreenshot(event.target.result);
                    };
                    reader.readAsDataURL(file);
                }
            };
        }
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

let currentWindowMode = 'normal';
function setWindowMode(mode) {
    currentWindowMode = mode;
    log(`Setting window mode to: ${mode}`);
    if (window.electronAPI) {
        window.electronAPI.setWindowMode(mode);
    }
    if (mode === 'overlay') {
        document.body.classList.add('mode-overlay');
        document.getElementById('overlay-hud').style.display = 'flex';
    } else {
        document.body.classList.remove('mode-overlay');
        document.getElementById('overlay-hud').style.display = 'none';
    }
    localStorage.setItem('currentWindowMode', mode);
}

function setupEventListeners() {
    // Steppers Sidebar
    document.getElementById('btn-attempts-minus').onclick = () => updateStepper('attempts', -1);
    document.getElementById('btn-attempts-plus').onclick = () => updateStepper('attempts', 1);
    document.getElementById('btn-abandons-minus').onclick = () => updateStepper('abandons', -1);
    document.getElementById('btn-abandons-plus').onclick = () => updateStepper('abandons', 1);
    document.getElementById('btn-doubles-minus').onclick = () => updateStepper('doubles', -1);
    document.getElementById('btn-doubles-plus').onclick = () => updateStepper('doubles', 1);

    // Steppers HUD
    document.getElementById('hud-btn-attempts-minus').onclick = () => updateStepper('attempts', -1);
    document.getElementById('hud-btn-attempts-plus').onclick = () => updateStepper('attempts', 1);
    document.getElementById('hud-btn-abandons-minus').onclick = () => updateStepper('abandons', -1);
    document.getElementById('hud-btn-abandons-plus').onclick = () => updateStepper('abandons', 1);
    document.getElementById('hud-btn-doubles-minus').onclick = () => updateStepper('doubles', -1);
    document.getElementById('hud-btn-doubles-plus').onclick = () => updateStepper('doubles', 1);

    // Overlay Toggles
    document.getElementById('btn-toggle-overlay').onclick = () => setWindowMode('overlay');
    document.getElementById('hud-btn-normal').onclick = () => setWindowMode('normal');

    // Preset selection
    document.getElementById('deck-preset').onchange = (e) => {
        selectedPreset = e.target.value;
        localStorage.setItem('selectedPreset', selectedPreset);
        log(`Selected preset changed to ${selectedPreset}`);
        toggleCustomDeckConfig();
        if (lastScannedRemaining) {
            runSolver(lastScannedRemaining.remainingDeck, lastScannedRemaining.isDoubled, lastScannedRemaining.isFreeTrial, lastScannedSlots);
        }
    };

    // Custom deck input changes
    for (let v = 1; v <= 5; v++) {
        document.getElementById(`custom-deck-${v}`).onchange = (e) => {
            DECK_PRESETS['custom'][v] = parseInt(e.target.value) || 0;
            localStorage.setItem('customDeckPreset', JSON.stringify(DECK_PRESETS['custom']));
            log(`Custom deck ${v} BP updated to ${DECK_PRESETS['custom'][v]}`);
            if (lastScannedRemaining) {
                runSolver(lastScannedRemaining.remainingDeck, lastScannedRemaining.isDoubled, lastScannedRemaining.isFreeTrial, lastScannedSlots);
            }
        };
    }

    // Set starting deck from scan button
    document.getElementById('btn-set-starting').onclick = () => {
        if (lastScannedRemaining && lastScannedRemaining.remainingDeck) {
            DECK_PRESETS['custom'] = { ...lastScannedRemaining.remainingDeck };
            for (let v = 1; v <= 5; v++) {
                document.getElementById(`custom-deck-${v}`).value = DECK_PRESETS['custom'][v];
            }
            selectedPreset = 'custom';
            document.getElementById('deck-preset').value = 'custom';
            localStorage.setItem('selectedPreset', 'custom');
            localStorage.setItem('customDeckPreset', JSON.stringify(DECK_PRESETS['custom']));
            toggleCustomDeckConfig();
            runSolver(lastScannedRemaining.remainingDeck, lastScannedRemaining.isDoubled, lastScannedRemaining.isFreeTrial, lastScannedSlots);
            log(`Custom starting deck set from scan: ${JSON.stringify(DECK_PRESETS['custom'])}`);
        } else {
            alert('Vui lòng bấm quét màn hình (F4 hoặc nút SCAN) trước khi chọn lấy bộ bài gốc!');
        }
    };

    // Manual Free Trial Checkbox override
    document.getElementById('chk-free-trial').onchange = (e) => {
        const isFree = e.target.checked;
        log(`Manual Free Trial checkbox changed: ${isFree}`);
        if (isFree && lastScannedSlots.every(card => card === null)) {
            attemptsLeft = 1;
            freeAbandonsLeft = 0;
            doublesLeft = 0;
            localStorage.setItem('attemptsLeft', 1);
            localStorage.setItem('freeAbandonsLeft', 0);
            localStorage.setItem('doublesLeft', 0);
            syncStepperUI();
        }
        if (lastScannedRemaining) {
            lastScannedRemaining.isFreeTrial = isFree;
            runSolver(lastScannedRemaining.remainingDeck, lastScannedRemaining.isDoubled, isFree, lastScannedSlots);
        } else {
            runSolver({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, false, isFree, Array(5).fill(null));
        }
    };

    // Reset Day
    document.getElementById('btn-reset-day').onclick = () => {
        attemptsLeft = 3;
        freeAbandonsLeft = 3;
        doublesLeft = 2;
        accumulatedBills = 0;
        localStorage.setItem('attemptsLeft', attemptsLeft);
        localStorage.setItem('freeAbandonsLeft', freeAbandonsLeft);
        localStorage.setItem('doublesLeft', doublesLeft);
        localStorage.setItem('accumulatedBills', accumulatedBills);
        
        syncStepperUI();
        updateAccumulatedBillsUI();
        log('Reset Day clicked: states set to 3, 3, 2, bills set to 0');
        
        if (lastScannedRemaining) {
            runSolver(lastScannedRemaining.remainingDeck, lastScannedRemaining.isDoubled, lastScannedRemaining.isFreeTrial, lastScannedSlots);
        }
    };

    // Scan Buttons (Normal & HUD)
    document.getElementById('btn-scan').onclick = () => {
        log('QUÉT GAME button clicked');
        forceScanNow();
    };

    document.getElementById('hud-btn-scan').onclick = () => {
        log('HUD Quét Lại button clicked');
        forceScanNow();
    };

    // Auto-scan checkbox & interval
    document.getElementById('chk-auto-scan').onchange = () => {
        triggerAutoScanStateChange();
    };
    document.getElementById('num-scan-interval').onchange = () => {
        triggerAutoScanStateChange();
    };

    // Drag and drop test screenshot support for easy offline verification
    window.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
    window.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
    window.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            const file = files[0];
            const isImage = (file.type && file.type.startsWith('image/')) || 
                            (file.name && file.name.match(/\.(png|jpe?g|gif|webp|bmp)$/i));
            if (isImage) {
                log(`File dropped: ${file.name} (type: "${file.type || 'unknown'}")`);
                updateBadgeStatus('ĐANG ĐỌC FILE...', 'scanning');
                const reader = new FileReader();
                reader.onload = (event) => {
                    processScreenshot(event.target.result);
                };
                reader.readAsDataURL(file);
            } else {
                log(`Dropped file ignored (not an image): ${file.name} (type: "${file.type || 'unknown'}")`);
            }
        }
    });

}

function forceScanNow() {
    log('forceScanNow() called');
    updateBadgeStatus('ĐANG QUÉT...', 'scanning');
    scanStarted = true;
    
    // Add visual glow feedback
    const winBtnScan = document.getElementById('win-btn-scan');
    const hudBtnScan = document.getElementById('hud-btn-scan');
    if (winBtnScan) winBtnScan.classList.add('scanning-flash');
    if (hudBtnScan) hudBtnScan.classList.add('scanning-flash');
    
    if (window.electronAPI) {
        window.electronAPI.requestScreenshot();
    }
    
    restartAutoScanTimerIfEnabled();
}

function removeScanningFlash() {
    const winBtnScan = document.getElementById('win-btn-scan');
    const hudBtnScan = document.getElementById('hud-btn-scan');
    if (winBtnScan) winBtnScan.classList.remove('scanning-flash');
    if (hudBtnScan) hudBtnScan.classList.remove('scanning-flash');
}

function updateAutoScanVisualState() {
    const isAutoActive = (autoScanInterval !== null);
    log(`updateAutoScanVisualState: isAutoActive=${isAutoActive}`);
    
    const btnScan = document.getElementById('btn-scan');
    const winBtnScan = document.getElementById('win-btn-scan');
    const hudBtnScan = document.getElementById('hud-btn-scan');
    
    if (isAutoActive) {
        if (btnScan) {
            btnScan.classList.add('active-auto-scan');
            btnScan.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 8px;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                AUTO-SCANNING (F4)
            `;
        }
        if (winBtnScan) winBtnScan.classList.add('active-auto-scan');
        if (hudBtnScan) hudBtnScan.classList.add('active-auto-scan');
    } else {
        if (btnScan) {
            btnScan.classList.remove('active-auto-scan');
            btnScan.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 8px;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                QUÉT GAME (SCAN)
            `;
        }
        if (winBtnScan) winBtnScan.classList.remove('active-auto-scan');
        if (hudBtnScan) hudBtnScan.classList.remove('active-auto-scan');
    }
}

function triggerAutoScanStateChange() {
    const isChecked = document.getElementById('chk-auto-scan').checked;
    log(`triggerAutoScanStateChange: checked=${isChecked}, scanStarted=${scanStarted}`);
    
    if (autoScanInterval) {
        clearInterval(autoScanInterval);
        autoScanInterval = null;
    }
    
    if (isChecked) {
        if (!scanStarted) {
            scanStarted = true;
            if (window.electronAPI) {
                window.electronAPI.requestScreenshot();
            }
        }
        const seconds = parseFloat(document.getElementById('num-scan-interval').value) || 2;
        log(`Starting auto-scan interval: ${seconds}s`);
        autoScanInterval = setInterval(() => {
            if (window.electronAPI) {
                window.electronAPI.requestScreenshot();
            }
        }, seconds * 1000);
        updateBadgeStatus('TỰ ĐỘNG QUÉT ĐANG BẬT', 'scanning');
    } else {
        updateBadgeStatus('TỰ ĐỘNG QUÉT ĐÃ TẮT');
    }
    updateAutoScanVisualState();
}

function restartAutoScanTimerIfEnabled() {
    const isChecked = document.getElementById('chk-auto-scan').checked;
    if (isChecked && scanStarted) {
        if (autoScanInterval) {
            clearInterval(autoScanInterval);
        }
        const seconds = parseFloat(document.getElementById('num-scan-interval').value) || 2;
        autoScanInterval = setInterval(() => {
            if (window.electronAPI) {
                window.electronAPI.requestScreenshot();
            }
        }, seconds * 1000);
        updateBadgeStatus('TỰ ĐỘNG QUÉT ĐANG BẬT', 'scanning');
    }
    updateAutoScanVisualState();
}

function updateAccumulatedBillsUI() {
    const formatted = accumulatedBills.toLocaleString() + ' Bills';
    const statEl = document.getElementById('stat-accumulated');
    if (statEl) statEl.innerText = formatted;
    const hudEl = document.getElementById('hud-accumulated-val');
    if (hudEl) hudEl.innerText = formatted;
}

function updateStepper(type, delta) {
    if (type === 'attempts') {
        attemptsLeft = Math.max(0, Math.min(3, attemptsLeft + delta));
        localStorage.setItem('attemptsLeft', attemptsLeft);
        if (attemptsLeft === 0) {
            document.getElementById('chk-free-trial').checked = true;
        }
    } else if (type === 'abandons') {
        freeAbandonsLeft = Math.max(0, Math.min(3, freeAbandonsLeft + delta));
        localStorage.setItem('freeAbandonsLeft', freeAbandonsLeft);
    } else if (type === 'doubles') {
        doublesLeft = Math.max(0, Math.min(2, doublesLeft + delta));
        localStorage.setItem('doublesLeft', doublesLeft);
    }
    
    syncStepperUI();
    
    if (lastScannedRemaining) {
        runSolver(lastScannedRemaining.remainingDeck, lastScannedRemaining.isDoubled, lastScannedRemaining.isFreeTrial, lastScannedSlots);
    }
}

function syncStepperUI() {
    document.getElementById('state-attempts').value = attemptsLeft;
    document.getElementById('hud-attempts-val').innerText = attemptsLeft;

    document.getElementById('state-free-abandons').value = freeAbandonsLeft;
    document.getElementById('hud-abandons-val').innerText = freeAbandonsLeft;

    document.getElementById('state-doubles').value = doublesLeft;
    document.getElementById('hud-doubles-val').innerText = doublesLeft;
}

// Optimized helper to retrieve a small rectangular crop from canvas
function getCropBuffer(ctx, x, y, w, h) {
    return ctx.getImageData(x, y, w, h).data; // Uint8ClampedArray of size w * h * 4
}

// Bounded BFS Digit Classifier for attempts/doubles counts
function scanDigitInRegion(ctx, xStart, yStart, xEnd, yEnd) {
    const w = xEnd - xStart;
    const h = yEnd - yStart;
    const pixels = ctx.getImageData(xStart, yStart, w, h).data;
    
    let visited = Array(w * h).fill(false);
    let digitCluster = null;
    
    function isDark(cx, cy) {
        const idx = (cy * w + cx) * 4;
        const val = (pixels[idx] + pixels[idx+1] + pixels[idx+2]) / 3;
        return val < 110;
    }
    
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const flatIdx = y * w + x;
            if (visited[flatIdx]) continue;
            
            if (isDark(x, y)) {
                let queue = [{x, y}];
                visited[flatIdx] = true;
                let minCX = x, maxCX = x, minCY = y, maxCY = y;
                let clusterPixels = [];
                
                while (queue.length > 0) {
                    const curr = queue.shift();
                    clusterPixels.push(curr);
                    
                    if (curr.x < minCX) minCX = curr.x;
                    if (curr.x > maxCX) maxCX = curr.x;
                    if (curr.y < minCY) minCY = curr.y;
                    if (curr.y > maxCY) maxCY = curr.y;
                    
                    const neighbors = [
                        {x: curr.x + 1, y: curr.y},
                        {x: curr.x - 1, y: curr.y},
                        {x: curr.x, y: curr.y + 1},
                        {x: curr.x, y: curr.y - 1}
                    ];
                    
                    neighbors.forEach(n => {
                        if (n.x >= 0 && n.x < w && n.y >= 0 && n.y < h) {
                            const nFlatIdx = n.y * w + n.x;
                            if (!visited[nFlatIdx]) {
                                visited[nFlatIdx] = true;
                                if (isDark(n.x, n.y)) {
                                    queue.push(n);
                                }
                            }
                        }
                    });
                }
                
                const cw = maxCX - minCX + 1;
                const ch = maxCY - minCY + 1;
                if (cw >= 4 && ch >= 10 && cw < 20 && ch < 22) {
                    digitCluster = { minX: minCX, maxX: maxCX, minY: minCY, maxY: maxCY, cw, ch, pixels: clusterPixels };
                }
            } else {
                visited[flatIdx] = true;
            }
        }
    }
    
    if (!digitCluster) return null;
    
    // Normalized 3x3 Grid
    const cw = digitCluster.cw;
    const ch = digitCluster.ch;
    const darkPixels = digitCluster.pixels.length;
    const cellW = cw / 3;
    const cellH = ch / 3;
    const grid = Array(9).fill(0);
    
    let cropBuffer = Array(ch).fill(0).map(() => Array(cw).fill(0));
    digitCluster.pixels.forEach(p => {
        cropBuffer[p.y - digitCluster.minY][p.x - digitCluster.minX] = 1;
    });
    
    for (let cy = 0; cy < ch; cy++) {
        for (let cx = 0; cx < cw; cx++) {
            if (cropBuffer[cy][cx] === 1) {
                const cellX = Math.min(2, Math.floor(cx / cellW));
                const cellY = Math.min(2, Math.floor(cy / cellH));
                grid[cellY * 3 + cellX]++;
            }
        }
    }
    
    const normGrid = grid.map(v => Number((v / darkPixels).toFixed(3)));
    return classifyHeaderDigit(cw, ch, normGrid);
}

function classifyHeaderDigit(w, h, normGrid) {
    if (w < 6) return 1;
    if (normGrid[3] < 0.02) {
        if (normGrid[6] > normGrid[8]) {
            return 2;
        } else {
            return 3;
        }
    }
    if (normGrid[4] < 0.08) {
        return 0;
    }
    return 0;
}

function processRawScreenshot(width, height, buffer) {
    const canvas = document.getElementById('proc-canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = width;
    canvas.height = height;
    
    const imageData = ctx.createImageData(width, height);
    imageData.data.set(buffer);
    ctx.putImageData(imageData, 0, 0);
    
    log(`Raw screenshot loaded. Dims: ${width}x${height}`);
    analyzeCanvas(ctx, width, height);
}

function processScreenshot(dataUrl) {
    const img = new Image();
    img.src = dataUrl;
    img.onload = () => {
        const canvas = document.getElementById('proc-canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        
        log(`File/Data URL screenshot loaded. Dims: ${img.width}x${img.height}`);
        analyzeCanvas(ctx, img.width, img.height);
    };
}
// Card digit classification helper functions are now loaded from ocr.js


function isFaceCardSlot(ctx, cardPos, activeConfig) {
    // Face cards have a dark "ACCESS POINT" strip immediately left of the BP digit.
    // Empty/card-back slots keep this area as pale cyan/white and should not be OCR'ed.
    const rel = activeConfig.cardFaceStripRelative || { xOffset: 0, yOffset: 10, width: 300, height: 50 };
    const stripX = cardPos.x + rel.xOffset;
    const stripY = cardPos.y + rel.yOffset;
    const stripW = rel.width;
    const stripH = rel.height;
    const pixels = getCropBuffer(ctx, stripX, stripY, stripW, stripH);
    let stripPixels = 0;

    for (let i = 0; i < stripW * stripH; i++) {
        const idx = i * 4;
        const val = (pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) / 3;
        if (val < 85) {
            stripPixels++;
        }
    }

    const minStripPixels = Math.max(10, Math.round(stripW * stripH * 0.00533));
    return { isFace: stripPixels > minStripPixels, stripPixels };
}

function scanHandFromSlots(ctx, activeConfig) {
    const scannedSlots = Array(5).fill(null);
    if (!activeConfig || !activeConfig.cards) return scannedSlots;
    
    activeConfig.cards.forEach((cardPos, cardIdx) => {
        const faceCheck = isFaceCardSlot(ctx, cardPos, activeConfig);
        if (!faceCheck.isFace) {
            log(`Slot ${cardIdx + 1} OCR: skipped card-back/empty accessStrip=${faceCheck.stripPixels}`);
            return;
        }

        const cropX = cardPos.x + activeConfig.cardNumberRelative.xOffset;
        const cropY = cardPos.y + activeConfig.cardNumberRelative.yOffset;
        const cropW = activeConfig.cardNumberRelative.width;
        const cropH = activeConfig.cardNumberRelative.height;

        const cropPixels = getCropBuffer(ctx, cropX, cropY, cropW, cropH);
        const result = classifyCardDigitFromCrop(cropPixels, cropW, cropH);

        if (result.digit !== null) {
            scannedSlots[cardIdx] = result.digit;
        }

        const bbox = result.w ? `bbox=(${result.minX},${result.minY})-(${result.maxX},${result.maxY}) w=${result.w} h=${result.h}` : 'bbox=n/a';
        const scoresStr = result.scores ? ` scores={${Object.entries(result.scores).map(([d, s]) => `${d}:${s}`).join(',')}}` : '';
        const metrics = result.confidence !== undefined ? ` conf=${result.confidence.toFixed(2)} margin=${result.margin.toFixed(2)} thresh=${result.threshold}${result.adaptive ? '(adapt)' : ''}` : '';
        
        log(`Slot ${cardIdx + 1} OCR: ${result.digit === null ? 'miss' : result.digit} dark=${result.darkPixels || 0} ${bbox}${scoresStr}${metrics}${result.reason ? ` reason=${result.reason}` : ''}`);
    });
    return scannedSlots;
}

function normalizeScannedSlots(scannedSlots) {
    const slots = Array(5).fill(null);
    if (!Array.isArray(scannedSlots)) return slots;

    if (scannedSlots.length === 5) {
        scannedSlots.forEach((card, idx) => {
            slots[idx] = card >= 1 && card <= 5 ? card : null;
        });
        return slots;
    }

    scannedSlots.slice(0, 5).forEach((card, idx) => {
        slots[idx] = card >= 1 && card <= 5 ? card : null;
    });
    return slots;
}

function compactSlots(scannedSlots) {
    return normalizeScannedSlots(scannedSlots).filter(card => card !== null);
}

function countCards(cards) {
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    cards.forEach(card => {
        if (card >= 1 && card <= 5) {
            counts[card]++;
        }
    });
    return counts;
}

function buildEffectiveDeck(remainingDeck, hand) {
    const handCounts = countCards(hand);
    const effectiveDeck = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (let bp = 1; bp <= 5; bp++) {
        effectiveDeck[bp] = (remainingDeck[bp] || 0) + (handCounts[bp] || 0);
    }
    return effectiveDeck;
}

function reconcileHandSlots(scannedSlots, deducedHand) {
    const slots = normalizeScannedSlots(scannedSlots);
    const pool = [...deducedHand];
    const resolvedSlots = Array(5).fill(null);

    slots.forEach((card, idx) => {
        if (card === null) return;
        const poolIdx = pool.indexOf(card);
        if (poolIdx !== -1) {
            resolvedSlots[idx] = card;
            pool.splice(poolIdx, 1);
        } else {
            log(`Slot reconcile warning: OCR card ${card} at slot ${idx + 1} not found in deduced hand [${deducedHand.join(', ')}]; treating slot as empty.`);
        }
    });

    for (let idx = 0; idx < resolvedSlots.length && pool.length > 0; idx++) {
        if (resolvedSlots[idx] === null) {
            resolvedSlots[idx] = pool.shift();
        }
    }

    if (pool.length > 0) {
        resolvedSlots.push(...pool);
    }

    return resolvedSlots.filter(card => card !== null);
}

function analyzeCanvas(ctx, width, height) {
    try {
        const activeConfig = window.getActiveConfig(width, height);
        const deckCounts = activeConfig.deckCounts;
        const doubleSwitch = activeConfig.doubleSwitch;

        const remainingDeck = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

        // 1. Scan remaining deck counts in right panel (optimized crops)
        deckCounts.forEach((dc, idx) => {
            const cropW = dc.width;
            const cropH = dc.height;
            const cropX = dc.x;
            const cropY = dc.y;

            const cropPixels = getCropBuffer(ctx, cropX, cropY, cropW, cropH);
            let darkPixels = 0;
            let minX = cropW, maxX = 0, minY = cropH, maxY = 0;
            const cropBuffer = new Uint8Array(cropW * cropH);

            for (let cy = 0; cy < cropH; cy++) {
                for (let cx = 0; cx < cropW; cx++) {
                    const srcIdx = (cy * cropW + cx) * 4;
                    const r = cropPixels[srcIdx];
                    const g = cropPixels[srcIdx+1];
                    const b = cropPixels[srcIdx+2];
                    const val = (r + g + b) / 3;

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
            remainingDeck[idx+1] = classifyDigit(w, h, normGrid);
        });

        log(`Scanned Deck: [${Object.values(remainingDeck).join(', ')}]`);

        // Scan the 5 card slots to know the exact draw order!
        const scannedSlots = scanHandFromSlots(ctx, activeConfig);
        lastScannedSlots = scannedSlots;
        log(`Scanned Slots Raw: ${formatSlots(scannedSlots)}`);

        // 2. Scan Double active switch box (count bright pixels)
        const dsPixels = getCropBuffer(ctx, doubleSwitch.x, doubleSwitch.y, doubleSwitch.width, doubleSwitch.height);
        let whitePixels = 0;
        for (let i = 0; i < doubleSwitch.width * doubleSwitch.height; i++) {
            if (dsPixels[i*4] > 220 && dsPixels[i*4+1] > 220 && dsPixels[i*4+2] > 220) {
                whitePixels++;
            }
        }
        const isDoubled = whitePixels > Math.max(20, Math.round(doubleSwitch.width * doubleSwitch.height * 0.026)); // 200 out of 7500 is ~2.6%
        log(`Double active state: ${isDoubled} (${whitePixels} white pixels)`);

        // Detect capsule elements presence to identify mode
        const capConfig = activeConfig.doubleSwitchCapsule;
        const capPixels = getCropBuffer(ctx, capConfig.x, capConfig.y, capConfig.width, capConfig.height);
        let darkCap = 0;
        for (let i = 0; i < capConfig.width * capConfig.height; i++) {
            if ((capPixels[i*4] + capPixels[i*4+1] + capPixels[i*4+2]) / 3 < 110) {
                darkCap++;
            }
        }
        const minDarkCap = Math.max(10, Math.round(capConfig.width * capConfig.height * 0.0083));
        const isDoubleSwitchPresent = darkCap > minDarkCap;

        const brConfig = activeConfig.bracket;
        const brPixels = getCropBuffer(ctx, brConfig.x, brConfig.y, brConfig.width, brConfig.height);
        let darkBr = 0;
        for (let i = 0; i < brConfig.width * brConfig.height; i++) {
            if ((brPixels[i*4] + brPixels[i*4+1] + brPixels[i*4+2]) / 3 < 110) {
                darkBr++;
            }
        }
        const minDarkBr = Math.max(5, Math.round(brConfig.width * brConfig.height * 0.074));
        const isBracketPresent = darkBr > minDarkBr;

        // Determine if Free Trial Mode is active
        let isFreeTrial = false;
        const manualFreeTrial = document.getElementById('chk-free-trial').checked;
        if (manualFreeTrial || attemptsLeft === 0) {
            isFreeTrial = true;
        } else {
            const hasDouble = isDoubleSwitchPresent || isDoubled;
            if (!hasDouble || !isBracketPresent) {
                isFreeTrial = true;
            }
        }
        log(`Mode detected: ${isFreeTrial ? 'FREE TRIAL' : 'REWARDED'} (DoublePresent=${isDoubleSwitchPresent}, BracketPresent=${isBracketPresent})`);

        // If in Free Trial mode and hand is empty, reset to defaults
        if (isFreeTrial && scannedSlots.every(card => card === null)) {
            attemptsLeft = 1;
            freeAbandonsLeft = 0;
            doublesLeft = 0;
            localStorage.setItem('attemptsLeft', attemptsLeft);
            localStorage.setItem('freeAbandonsLeft', freeAbandonsLeft);
            localStorage.setItem('doublesLeft', doublesLeft);
            syncStepperUI();
            log(`Free Trial round start: Reset steppers to 1 attempt, 0 abandons, 0 doubles.`);
        }

        // 3. Scan Remaining attempts & doubles counts if in rewarded mode
        if (!isFreeTrial) {
            // Attempts Count
            const attReg = activeConfig.attemptsRegion;
            const scannedAttempts = scanDigitInRegion(ctx, attReg.xStart, attReg.yStart, attReg.xEnd, attReg.yEnd);
            if (scannedAttempts !== null && scannedAttempts >= 0 && scannedAttempts <= 3) {
                attemptsLeft = scannedAttempts;
                localStorage.setItem('attemptsLeft', attemptsLeft);
                log(`OCR Detected Attempts remaining: ${attemptsLeft}`);
                if (attemptsLeft === 0) {
                    isFreeTrial = true;
                }
            }

            // Doubles Count
            if (isDoubleSwitchPresent) {
                const dblReg = activeConfig.doublesRegion;
                const scannedDoubles = scanDigitInRegion(ctx, dblReg.xStart, dblReg.yStart, dblReg.xEnd, dblReg.yEnd);
                if (scannedDoubles !== null && scannedDoubles >= 0 && scannedDoubles <= 2) {
                    doublesLeft = scannedDoubles;
                    localStorage.setItem('doublesLeft', doublesLeft);
                    log(`OCR Detected Doubles remaining: ${doublesLeft}`);
                }
            }
            syncStepperUI();
        }

        // Detect round reset and handle free abandons & accumulated rewards statefully
        if (lastScannedRemaining) {
            const prevSum = Object.values(lastScannedRemaining.remainingDeck).reduce((a, b) => a + b, 0);
            const currSum = Object.values(remainingDeck).reduce((a, b) => a + b, 0);
            const startingDeck = DECK_PRESETS[selectedPreset];
            const startingSum = Object.values(startingDeck).reduce((a, b) => a + b, 0);
            
            // Reset to full deck (e.g. deck size increases)
            if (prevSum < startingSum && currSum > prevSum) {
                log(`Round reset detected in game. Remaining deck restored. prevSum: ${prevSum}, currSum: ${currSum}`);
                if (isFreeTrial) {
                    attemptsLeft = 1;
                    freeAbandonsLeft = 0;
                    doublesLeft = 0;
                    localStorage.setItem('attemptsLeft', 1);
                    localStorage.setItem('freeAbandonsLeft', 0);
                    localStorage.setItem('doublesLeft', 0);
                    syncStepperUI();
                    log(`Free Trial round reset: Reset steppers to 1 attempt, 0 abandons, 0 doubles.`);
                } else {
                    const prevAttempts = lastScannedRemaining.attemptsLeft;
                    const currAttempts = attemptsLeft;
                    if (prevAttempts !== null && currAttempts !== null && currAttempts >= prevAttempts) {
                        log(`Attempts did not decrease on deck reset (Prev: ${prevAttempts}, Curr: ${currAttempts}). Counting as an ABANDON.`);
                        freeAbandonsLeft = Math.max(0, freeAbandonsLeft - 1);
                        localStorage.setItem('freeAbandonsLeft', freeAbandonsLeft);
                        syncStepperUI();
                    } else {
                        log(`Attempts decreased or status unclear (Prev: ${prevAttempts}, Curr: ${currAttempts}). Normal round completion.`);
                        // CALCULATE REWARD OF PREVIOUS HAND!
                        if (lastScannedHand && lastScannedHand.length > 0) {
                            const sumHand = lastScannedHand.reduce((acc, val) => acc + val, 0);
                            const scoreHand = sumHand % 11;
                            const levelRewards = REWARDS[activeConfig.level || 4] || REWARDS[4];
                            const reward = levelRewards[scoreHand] || 0;
                            const prevIsDoubled = lastScannedRemaining.isDoubled;
                            const roundReward = reward * (prevIsDoubled ? 2 : 1);
                            
                            accumulatedBills += roundReward;
                            localStorage.setItem('accumulatedBills', accumulatedBills);
                            updateAccumulatedBillsUI();
                            log(`Accumulated Reward added: ${roundReward} Bills (Hand: ${lastScannedHand.join(',')}, Score: ${scoreHand}, Doubled: ${prevIsDoubled}). Total: ${accumulatedBills}`);
                        }
                    }
                }
            }
        }

        lastScannedRemaining = { remainingDeck, isDoubled, isFreeTrial, attemptsLeft };
        updateBadgeStatus('QUÉT THÀNH CÔNG', 'success');
        
        const scanTime = new Date().toLocaleTimeString();
        document.getElementById('scan-meta').innerText = `Quét xong lúc ${scanTime}. Nhân đôi: ${isDoubled ? 'BẬT' : 'TẮT'}`;

        runSolver(remainingDeck, isDoubled, isFreeTrial, scannedSlots);

        // Remove scanning glow
        removeScanningFlash();

    } catch (err) {
        log(`Error analyzing canvas: ${err.stack || err.message}`);
        updateBadgeStatus('LỖI QUÉT', 'error');
        removeScanningFlash();
    }
}

function runSolver(remainingDeck, isDoubled, isFreeTrial, scannedSlots) {
    const startingDeck = DECK_PRESETS[selectedPreset];
    const activeConfig = window.getActiveConfig();
    const normalizedSlots = normalizeScannedSlots(scannedSlots);
    const scannedHand = compactSlots(normalizedSlots);
    
    // Calculate cards on hand (deducedHand)
    const deducedHand = [];
    let hasNegativeError = false;

    for (let bp = 1; bp <= 5; bp++) {
        const diff = startingDeck[bp] - remainingDeck[bp];
        if (diff < 0) {
            hasNegativeError = true;
        } else {
            for (let i = 0; i < diff; i++) {
                deducedHand.push(bp);
            }
        }
    }

    if (hasNegativeError) {
        log(`Warning: Scanned deck counts exceed preset.`);
        document.getElementById('suggestion-value').innerText = 'SAI BỘ BÀI GỐC';
        document.getElementById('suggestion-reason').innerHTML = `LỖI: Số bài quét được lớn hơn preset xuất phát.<br>Hãy chọn đúng <strong>Bộ bài xuất phát</strong> ở cột trái.`;
        document.getElementById('suggestion-box').className = 'suggestion-box assistant-suggestion abandon-action';
        
        // HUD Error
        document.getElementById('hud-hand-display').innerText = '[ LỖI PRESET ]';
        document.getElementById('hud-action-val').innerText = 'SAI PRESET';
        document.getElementById('hud-reward-val').innerText = '0 Bills';
        log(`Continuing with slot OCR fallback because selected preset is not reliable.`);
    }

    lastScannedSlots = normalizedSlots;
    if (DEBUG_SLOT_OCR_ONLY) {
        log(`DEBUG_SLOT_OCR_ONLY enabled: ignoring deduced hand for display/reconcile.`);
    }
    log(`Deduced Hand: [${deducedHand.join(', ')}]`);

    const canUseDeducedHand = !DEBUG_SLOT_OCR_ONLY && !hasNegativeError && (
        scannedHand.length === 0 ||
        deducedHand.length >= scannedHand.length
    );

    // Reconcile only when deck-diff is plausible; otherwise trust slot OCR for mid-round scans.
    const hand = canUseDeducedHand
        ? reconcileHandSlots(normalizedSlots, deducedHand)
        : scannedHand;
    const solverDeck = canUseDeducedHand
        ? startingDeck
        : buildEffectiveDeck(remainingDeck, hand);

    log(`Hand Source: ${canUseDeducedHand ? 'slots+deduced' : 'slot-only fallback'}`);
    log(`Solver Deck Source: ${canUseDeducedHand ? 'selected preset' : 'effective remaining+hand'} [${Object.values(solverDeck).join(', ')}]`);
    log(`Reconciled Hand: [${hand.join(', ')}]`);
    lastScannedHand = hand;

    // Render Hand
    renderHandCards(hand);
    
    // Format hand for Overlay HUD
    document.getElementById('hud-hand-display').innerText = `[ ${hand.join(' | ') || '-'} ]`;

    // Calculate BP sum and score mod 11
    const sum = hand.reduce((acc, val) => acc + val, 0);
    const score = sum % 11;
    document.getElementById('stat-sum').innerText = score;
    document.getElementById('stat-double').innerText = isDoubled ? 'BẬT' : 'TẮT';
    document.getElementById('stat-double').className = isDoubled ? 'stat-num gold-glow' : 'stat-num text-muted';

    // Auto-detect Free Trial if attempts is 0
    if (attemptsLeft === 0) {
        isFreeTrial = true;
    }

    // Set parameters based on mode
    let solveAttempts = attemptsLeft;
    let solveAbandons = freeAbandonsLeft;
    let solveDoubles = doublesLeft;

    if (isFreeTrial) {
        // Show Steppers UI
        document.getElementById('sidebar-steppers').style.display = 'block';
        document.getElementById('hud-steppers-container').style.display = 'flex';
        document.getElementById('card-stat-double').style.display = 'block';
        document.getElementById('card-stat-reward').style.display = 'block';
        document.getElementById('hud-reward-val').parentElement.style.display = 'block';
        document.getElementById('hud-col-ev-details').style.display = 'flex';
        document.getElementById('hud-divider-2').style.display = 'block';
        
        // Hide accumulated bills
        document.getElementById('hud-stat-accumulated-box').style.display = 'none';
        document.getElementById('card-stat-accumulated').style.display = 'none';
        
        document.getElementById('mode-badge').style.display = 'inline-block';
        document.getElementById('chk-free-trial').checked = true;
    } else {
        // Show Steppers UI
        document.getElementById('sidebar-steppers').style.display = 'block';
        document.getElementById('hud-steppers-container').style.display = 'flex';
        document.getElementById('card-stat-double').style.display = 'block';
        document.getElementById('card-stat-reward').style.display = 'block';
        document.getElementById('hud-stat-accumulated-box').style.display = 'block';
        document.getElementById('card-stat-accumulated').style.display = 'block';
        document.getElementById('hud-reward-val').parentElement.style.display = 'block';
        document.getElementById('hud-col-ev-details').style.display = 'flex';
        document.getElementById('hud-divider-2').style.display = 'block';
        document.getElementById('mode-badge').style.display = 'none';
        document.getElementById('chk-free-trial').checked = false;
    }

    // Solve using DP solver
    const solver = new SwordmancySolver(solverDeck, 4); // lvl 4
    const advice = solver.getBestAction(solveAttempts, solveAbandons, solveDoubles, hand, isDoubled);

    log(`Solver Action: ${advice.action}, EV: ${advice.ev.toFixed(1)}`);

    // Render Suggestion on normal UI
    const sBox = document.getElementById('suggestion-box');
    sBox.className = 'suggestion-box assistant-suggestion ' + ACTION_CLASSES[advice.action];
    document.getElementById('suggestion-value').innerText = ACTION_LABELS[advice.action];
    document.getElementById('suggestion-reason').innerText = ACTION_REASONS[advice.action];

    // Render Suggestion on HUD
    const hudContainer = document.getElementById('overlay-hud');
    hudContainer.className = 'overlay-hud-container';
    if (advice.action === 'Draw') hudContainer.classList.add('hud-draw');
    else if (advice.action === 'Stop') hudContainer.classList.add('hud-stop');
    else if (advice.action === 'Double') hudContainer.classList.add('hud-double');
    else if (advice.action === 'Abandon') hudContainer.classList.add('hud-abandon');

    document.getElementById('hud-action-val').innerText = ACTION_LABELS[advice.action];

    // Expected Value (EV) as requested by user replacing expected reward
    const evValue = Math.round(advice.ev).toLocaleString() + ' Bills';
    document.getElementById('stat-reward').innerText = evValue;
    document.getElementById('hud-reward-val').innerText = evValue;

    // Ev details normal UI
    document.getElementById('ev-val-state').innerText = evValue;
    document.getElementById('ev-val-draw').innerText = advice.details.evDraw !== null ? Math.round(advice.details.evDraw).toLocaleString() + ' Bills' : '-';
    document.getElementById('ev-val-stop').innerText = advice.details.evStop !== null ? Math.round(advice.details.evStop).toLocaleString() + ' Bills' : '-';
    document.getElementById('ev-val-abandon').innerText = advice.details.evAbandon !== null ? Math.round(advice.details.evAbandon).toLocaleString() + ' Bills' : '-';

    // Ev details HUD UI
    document.getElementById('hud-ev-val-state').innerText = evValue;
    document.getElementById('hud-ev-val-draw').innerText = advice.details.evDraw !== null ? Math.round(advice.details.evDraw).toLocaleString() + ' Bills' : '-';
    document.getElementById('hud-ev-val-stop').innerText = advice.details.evStop !== null ? Math.round(advice.details.evStop).toLocaleString() + ' Bills' : '-';
    document.getElementById('hud-ev-val-abandon').innerText = advice.details.evAbandon !== null ? Math.round(advice.details.evAbandon).toLocaleString() + ' Bills' : '-';

    // Remaining probabilities normal UI
    const probList = document.getElementById('prob-list');
    probList.innerHTML = '';
    const remainingCounts = solver.getRemainingDeck(hand);
    const totalRemaining = advice.details.totalRemaining;

    for (let bp = 1; bp <= 5; bp++) {
        const count = remainingCounts[bp] || 0;
        const prob = totalRemaining > 0 ? (count / totalRemaining * 100).toFixed(0) + '%' : '0%';
        const row = document.createElement('div');
        row.className = 'ev-row';
        row.innerHTML = `<span class="ev-label">Lá bài ${bp} BP (${count} lá):</span><span class="ev-val">${prob}</span>`;
        probList.appendChild(row);
    }

    const overflowRow = document.createElement('div');
    overflowRow.className = 'ev-row';
    overflowRow.style.borderTop = '1px dashed rgba(255, 255, 255, 0.05)';
    overflowRow.style.paddingTop = '0.5rem';
    overflowRow.style.marginTop = '0.5rem';
    const overflowLabel = sum < 10 ? 'Xác suất tràn (>10 BP):' : 'Xác suất tràn (>21 BP):';
    overflowRow.innerHTML = `<span class="ev-label" style="color: var(--color-red);">${overflowLabel}</span><span class="ev-val" style="color: var(--color-red); font-weight: bold;">${(advice.details.overflowProb * 100).toFixed(0)}%</span>`;
    probList.appendChild(overflowRow);

    const prob10Row = document.createElement('div');
    prob10Row.className = 'ev-row';
    prob10Row.innerHTML = `<span class="ev-label" style="color: var(--color-gold);">Xác suất ra điểm 10:</span><span class="ev-val" style="color: var(--color-gold); font-weight: bold;">${(advice.details.prob10 * 100).toFixed(0)}%</span>`;
    probList.appendChild(prob10Row);

    const prob9PlusRow = document.createElement('div');
    prob9PlusRow.className = 'ev-row';
    prob9PlusRow.innerHTML = `<span class="ev-label" style="color: #10b981;">Xác suất ra điểm 9-10:</span><span class="ev-val" style="color: #10b981; font-weight: bold;">${(advice.details.prob9Plus * 100).toFixed(0)}%</span>`;
    probList.appendChild(prob9PlusRow);


    // Remaining probabilities HUD UI
    const hudProbList = document.getElementById('hud-prob-list');
    hudProbList.innerHTML = '';

    for (let bp = 1; bp <= 5; bp++) {
        const count = remainingCounts[bp] || 0;
        const prob = totalRemaining > 0 ? (count / totalRemaining * 100).toFixed(0) + '%' : '0%';
        const row = document.createElement('div');
        row.className = 'hud-ev-row';
        row.innerHTML = `<span class="hud-ev-lbl">Lá ${bp} (${count} lá):</span><span class="hud-ev-val">${prob}</span>`;
        hudProbList.appendChild(row);
    }

    const hudOverflowRow = document.createElement('div');
    hudOverflowRow.className = 'hud-ev-row';
    hudOverflowRow.style.borderTop = '1px dashed rgba(255, 255, 255, 0.05)';
    hudOverflowRow.style.paddingTop = '2px';
    hudOverflowRow.style.marginTop = '2px';
    const hudOverflowLabel = sum < 10 ? 'Tràn (>10):' : 'Tràn (>21):';
    hudOverflowRow.innerHTML = `<span class="hud-ev-lbl" style="color: var(--color-red);">${hudOverflowLabel}</span><span class="hud-ev-val" style="color: var(--color-red);">${(advice.details.overflowProb * 100).toFixed(0)}%</span>`;
    hudProbList.appendChild(hudOverflowRow);

    const hudProb10Row = document.createElement('div');
    hudProb10Row.className = 'hud-ev-row';
    hudProb10Row.innerHTML = `<span class="hud-ev-lbl" style="color: var(--color-gold);">Tỷ lệ ra điểm 10:</span><span class="hud-ev-val" style="color: var(--color-gold);">${(advice.details.prob10 * 100).toFixed(0)}%</span>`;
    hudProbList.appendChild(hudProb10Row);

    const hudProb9PlusRow = document.createElement('div');
    hudProb9PlusRow.className = 'hud-ev-row';
    hudProb9PlusRow.innerHTML = `<span class="hud-ev-lbl" style="color: #10b981;">Tỷ lệ ra điểm 9-10:</span><span class="hud-ev-val" style="color: #10b981;">${(advice.details.prob9Plus * 100).toFixed(0)}%</span>`;
    hudProbList.appendChild(hudProb9PlusRow);


}

function renderHandCards(hand) {
    const handContainer = document.getElementById('hand-container');
    handContainer.innerHTML = '';

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
