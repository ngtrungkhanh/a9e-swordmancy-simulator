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
let currentMode = 'REWARDED';
let uiScale = 1.0;
const scrWidth = window.screen.width;
if (scrWidth < 2560) {
    uiScale = scrWidth / 2560;
    if (uiScale < 0.75) uiScale = 0.75;
}

// Stateful Round Tracking
let currentRoundState = {
    isActive: false,              // Khởi tạo ván đấu đã hoạt động hay chưa
    estimatedStartingDeck: null,  // Bộ bài xuất phát tính toán được {1:x, 2:x, 3:x, 4:x, 5:x}
    matchedPreset: 'none',        // Tên preset khớp được ('1'-'7', 'custom', hoặc 'none')
    isHighTrust: false,           // True nếu bộ bài xuất phát khớp chính xác với một preset mẫu
    lastTotalRemaining: 0,        // Tổng số bài còn lại ở lượt quét trước
    lastAttempts: 3,
    lastFreeAbandons: 3,
    lastHand: []
};

// Debug switch: true = ignore deck-diff/reconcile and display hand from slot OCR only.
const DEBUG_SLOT_OCR_ONLY = false;



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
    const savedMode = localStorage.getItem('currentMode');
    if (savedMode !== null) {
        currentMode = savedMode;
    }
    const chkFreeTrial = document.getElementById('chk-free-trial');
    if (chkFreeTrial) {
        chkFreeTrial.checked = (currentMode === 'FREE_TRIAL');
    }

    if (currentMode === 'REWARDED') {
        const att = localStorage.getItem('rewardedAttemptsLeft') || localStorage.getItem('attemptsLeft');
        attemptsLeft = att !== null ? parseInt(att) : 3;
        const ab = localStorage.getItem('rewardedFreeAbandonsLeft') || localStorage.getItem('freeAbandonsLeft');
        freeAbandonsLeft = ab !== null ? parseInt(ab) : 3;
        const dbl = localStorage.getItem('rewardedDoublesLeft') || localStorage.getItem('doublesLeft');
        doublesLeft = dbl !== null ? parseInt(dbl) : 2;
    } else {
        const att = localStorage.getItem('freeTrialAttemptsLeft') || localStorage.getItem('attemptsLeft');
        attemptsLeft = att !== null ? parseInt(att) : 1;
        const ab = localStorage.getItem('freeTrialFreeAbandonsLeft') || localStorage.getItem('freeAbandonsLeft');
        freeAbandonsLeft = ab !== null ? parseInt(ab) : 0;
        const dbl = localStorage.getItem('freeTrialDoublesLeft') || localStorage.getItem('doublesLeft');
        doublesLeft = dbl !== null ? parseInt(dbl) : 0;
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
        switchMode(isFree ? 'FREE_TRIAL' : 'REWARDED');
        if (isFree && lastScannedSlots.every(card => card === null)) {
            attemptsLeft = 1;
            freeAbandonsLeft = 0;
            doublesLeft = 0;
            localStorage.setItem('attemptsLeft', 1);
            localStorage.setItem('freeAbandonsLeft', 0);
            localStorage.setItem('doublesLeft', 0);
            localStorage.setItem('freeTrialAttemptsLeft', 1);
            localStorage.setItem('freeTrialFreeAbandonsLeft', 0);
            localStorage.setItem('freeTrialDoublesLeft', 0);
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
        
        // Reset mode-specific values
        localStorage.setItem('rewardedAttemptsLeft', attemptsLeft);
        localStorage.setItem('rewardedFreeAbandonsLeft', freeAbandonsLeft);
        localStorage.setItem('rewardedDoublesLeft', doublesLeft);
        localStorage.setItem('freeTrialAttemptsLeft', 1);
        localStorage.setItem('freeTrialFreeAbandonsLeft', 0);
        localStorage.setItem('freeTrialDoublesLeft', 0);
        
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

function switchMode(newMode) {
    if (newMode === currentMode) return;
    
    // Save current values to old mode's keys
    if (currentMode === 'REWARDED') {
        localStorage.setItem('rewardedAttemptsLeft', attemptsLeft);
        localStorage.setItem('rewardedFreeAbandonsLeft', freeAbandonsLeft);
        localStorage.setItem('rewardedDoublesLeft', doublesLeft);
    } else {
        localStorage.setItem('freeTrialAttemptsLeft', attemptsLeft);
        localStorage.setItem('freeTrialFreeAbandonsLeft', freeAbandonsLeft);
        localStorage.setItem('freeTrialDoublesLeft', doublesLeft);
    }
    
    // Load values for new mode
    currentMode = newMode;
    if (newMode === 'REWARDED') {
        const att = localStorage.getItem('rewardedAttemptsLeft');
        attemptsLeft = att !== null ? parseInt(att) : 3;
        const ab = localStorage.getItem('rewardedFreeAbandonsLeft');
        freeAbandonsLeft = ab !== null ? parseInt(ab) : 3;
        const dbl = localStorage.getItem('rewardedDoublesLeft');
        doublesLeft = dbl !== null ? parseInt(dbl) : 2;
    } else {
        const att = localStorage.getItem('freeTrialAttemptsLeft');
        attemptsLeft = att !== null ? parseInt(att) : 1;
        const ab = localStorage.getItem('freeTrialFreeAbandonsLeft');
        freeAbandonsLeft = ab !== null ? parseInt(ab) : 0;
        const dbl = localStorage.getItem('freeTrialDoublesLeft');
        doublesLeft = dbl !== null ? parseInt(dbl) : 0;
    }
    
    // Save current active keys for compatibility
    localStorage.setItem('attemptsLeft', attemptsLeft);
    localStorage.setItem('freeAbandonsLeft', freeAbandonsLeft);
    localStorage.setItem('doublesLeft', doublesLeft);
    localStorage.setItem('currentMode', currentMode);
    
    const chk = document.getElementById('chk-free-trial');
    if (chk) {
        chk.checked = (currentMode === 'FREE_TRIAL');
    }
    syncStepperUI();
    log(`Switched mode to ${newMode}. Attempts: ${attemptsLeft}, Abandons: ${freeAbandonsLeft}, Doubles: ${doublesLeft}`);
}

function updateStepper(type, delta) {
    if (type === 'attempts') {
        attemptsLeft = Math.max(0, Math.min(3, attemptsLeft + delta));
        localStorage.setItem('attemptsLeft', attemptsLeft);
        if (currentMode === 'REWARDED') {
            localStorage.setItem('rewardedAttemptsLeft', attemptsLeft);
        } else {
            localStorage.setItem('freeTrialAttemptsLeft', attemptsLeft);
        }
        if (attemptsLeft === 0) {
            switchMode('FREE_TRIAL');
        }
    } else if (type === 'abandons') {
        freeAbandonsLeft = Math.max(0, Math.min(3, freeAbandonsLeft + delta));
        localStorage.setItem('freeAbandonsLeft', freeAbandonsLeft);
        if (currentMode === 'REWARDED') {
            localStorage.setItem('rewardedFreeAbandonsLeft', freeAbandonsLeft);
        } else {
            localStorage.setItem('freeTrialFreeAbandonsLeft', freeAbandonsLeft);
        }
    } else if (type === 'doubles') {
        doublesLeft = Math.max(0, Math.min(2, doublesLeft + delta));
        localStorage.setItem('doublesLeft', doublesLeft);
        if (currentMode === 'REWARDED') {
            localStorage.setItem('rewardedDoublesLeft', doublesLeft);
        } else {
            localStorage.setItem('freeTrialDoublesLeft', doublesLeft);
        }
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
    const cropPixels = ctx.getImageData(xStart, yStart, w, h).data;
    const result = classifySmallUiDigitFromCrop(cropPixels, w, h);
    return result.digit; // Trả về chữ số nhận diện hoặc null
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
            const result = classifySmallUiDigitFromCrop(cropPixels, cropW, cropH);
            remainingDeck[idx+1] = result.digit !== null ? result.digit : 0;
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

        // Determine if Free Trial Mode is active from visual elements
        let isFreeTrial = false;
        const manualFreeTrial = document.getElementById('chk-free-trial').checked;
        if (manualFreeTrial) {
            isFreeTrial = true;
        } else {
            const hasDouble = isDoubleSwitchPresent || isDoubled;
            if (!hasDouble || !isBracketPresent) {
                isFreeTrial = true;
            }
        }
        
        // Switch state & UI to target mode
        switchMode(isFreeTrial ? 'FREE_TRIAL' : 'REWARDED');
        log(`Mode detected: ${isFreeTrial ? 'FREE TRIAL' : 'REWARDED'} (DoublePresent=${isDoubleSwitchPresent}, BracketPresent=${isBracketPresent})`);

        // If in Free Trial mode and hand is empty, reset to defaults
        if (isFreeTrial && scannedSlots.every(card => card === null)) {
            attemptsLeft = 1;
            freeAbandonsLeft = 0;
            doublesLeft = 0;
            localStorage.setItem('attemptsLeft', attemptsLeft);
            localStorage.setItem('freeAbandonsLeft', freeAbandonsLeft);
            localStorage.setItem('doublesLeft', doublesLeft);
            localStorage.setItem('freeTrialAttemptsLeft', attemptsLeft);
            localStorage.setItem('freeTrialFreeAbandonsLeft', freeAbandonsLeft);
            localStorage.setItem('freeTrialDoublesLeft', doublesLeft);
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
                localStorage.setItem('rewardedAttemptsLeft', attemptsLeft);
                log(`OCR Detected Attempts remaining: ${attemptsLeft}`);
                if (attemptsLeft === 0) {
                    switchMode('FREE_TRIAL');
                }
            }

            // Doubles Count
            if (isDoubleSwitchPresent) {
                const dblReg = activeConfig.doublesRegion;
                const scannedDoubles = scanDigitInRegion(ctx, dblReg.xStart, dblReg.yStart, dblReg.xEnd, dblReg.yEnd);
                if (scannedDoubles !== null && scannedDoubles >= 0 && scannedDoubles <= 2) {
                    doublesLeft = scannedDoubles;
                    localStorage.setItem('doublesLeft', doublesLeft);
                    localStorage.setItem('rewardedDoublesLeft', doublesLeft);
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
                    localStorage.setItem('freeTrialAttemptsLeft', 1);
                    localStorage.setItem('freeTrialFreeAbandonsLeft', 0);
                    localStorage.setItem('freeTrialDoublesLeft', 0);
                    syncStepperUI();
                    log(`Free Trial round reset: Reset steppers to 1 attempt, 0 abandons, 0 doubles.`);
                } else {
                    const prevAttempts = lastScannedRemaining.attemptsLeft;
                    const currAttempts = attemptsLeft;
                    if (prevAttempts !== null && currAttempts !== null && currAttempts >= prevAttempts) {
                        log(`Attempts did not decrease on deck reset (Prev: ${prevAttempts}, Curr: ${currAttempts}). Counting as an ABANDON.`);
                        freeAbandonsLeft = Math.max(0, freeAbandonsLeft - 1);
                        localStorage.setItem('freeAbandonsLeft', freeAbandonsLeft);
                        localStorage.setItem('rewardedFreeAbandonsLeft', freeAbandonsLeft);
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
    const activeConfig = window.getActiveConfig();
    const normalizedSlots = normalizeScannedSlots(scannedSlots);
    const scannedHand = compactSlots(normalizedSlots);
    
    const currSum = Object.values(remainingDeck).reduce((a, b) => a + b, 0);
    
    // 1. Detect Round Reset & Reset Triggers
    let shouldReset = false;
    
    if (!currentRoundState.isActive) {
        shouldReset = true; // Not active yet, initialize
    } else {
        // Trigger 1: Attempts decreased
        if (attemptsLeft < currentRoundState.lastAttempts) {
            log(`Round Reset Trigger: Attempts decreased from ${currentRoundState.lastAttempts} to ${attemptsLeft}`);
            shouldReset = true;
        }
        // Trigger 2: Free Abandons decreased
        else if (freeAbandonsLeft < currentRoundState.lastFreeAbandons) {
            log(`Round Reset Trigger: Free Abandons decreased from ${currentRoundState.lastFreeAbandons} to ${freeAbandonsLeft}`);
            shouldReset = true;
        }
        // Trigger 3: Hand is empty
        else if (scannedHand.length === 0 && currentRoundState.lastHand.length > 0) {
            log(`Round Reset Trigger: Hand became empty`);
            shouldReset = true;
        }
        // Trigger 4: Remaining deck sum increased significantly
        else if (currSum > currentRoundState.lastTotalRemaining + 2) {
            log(`Round Reset Trigger: Deck count sum increased from ${currentRoundState.lastTotalRemaining} to ${currSum}`);
            shouldReset = true;
        }
        // Trigger 5: Hand mismatch (at least 2 cards changed and not a subset)
        else if (currentRoundState.lastHand.length > 0 && scannedHand.length > 0) {
            let isContinuation = true;
            let lastHandCopy = [...currentRoundState.lastHand];
            for (const card of lastHandCopy) {
                const idx = scannedHand.indexOf(card);
                if (idx === -1) {
                    isContinuation = false;
                    break;
                }
            }
            
            if (!isContinuation) {
                let mismatchCount = 0;
                for (let i = 0; i < 5; i++) {
                    const prevVal = lastScannedSlots ? lastScannedSlots[i] : null;
                    const newVal = normalizedSlots[i];
                    if (prevVal !== newVal && prevVal !== null && newVal !== null) {
                        mismatchCount++;
                    }
                }
                if (mismatchCount >= 2) {
                    log(`Round Reset Trigger: Hand mismatch detected (mismatch count: ${mismatchCount})`);
                    shouldReset = true;
                }
            }
        }
    }
    
    if (shouldReset) {
        log(`Initializing / Resetting round state.`);
        currentRoundState.isActive = false;
        currentRoundState.estimatedStartingDeck = null;
        currentRoundState.matchedPreset = 'none';
        currentRoundState.isHighTrust = false;
    }
    
    // 2. Dynamic Starting Deck Estimation
    if (!currentRoundState.isActive && scannedHand.length > 0) {
        const handCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        scannedHand.forEach(card => {
            if (card >= 1 && card <= 5) handCounts[card]++;
        });
        
        const estimatedStarting = {};
        for (let bp = 1; bp <= 5; bp++) {
            estimatedStarting[bp] = (remainingDeck[bp] || 0) + handCounts[bp];
        }
        
        log(`Dynamically estimated starting deck: ${JSON.stringify(estimatedStarting)}`);
        
        let matchedKey = 'none';
        for (const [key, presetDeck] of Object.entries(DECK_PRESETS)) {
            if (key === 'custom') continue;
            let isMatch = true;
            for (let bp = 1; bp <= 5; bp++) {
                if (presetDeck[bp] !== estimatedStarting[bp]) {
                    isMatch = false;
                    break;
                }
            }
            if (isMatch) {
                matchedKey = key;
                break;
            }
        }
        
        currentRoundState.isActive = true;
        currentRoundState.lastTotalRemaining = currSum;
        currentRoundState.lastAttempts = attemptsLeft;
        currentRoundState.lastFreeAbandons = freeAbandonsLeft;
        currentRoundState.lastHand = [...scannedHand];
        
        if (matchedKey !== 'none') {
            currentRoundState.estimatedStartingDeck = { ...DECK_PRESETS[matchedKey] };
            currentRoundState.matchedPreset = matchedKey;
            currentRoundState.isHighTrust = true;
            log(`Dynamic Deck Match: Preset ${matchedKey} (High Trust)`);
            
            // Auto-update select preset in UI
            const selectEl = document.getElementById('deck-preset');
            if (selectEl) {
                selectEl.value = matchedKey;
                selectedPreset = matchedKey;
                localStorage.setItem('selectedPreset', matchedKey);
            }
        } else {
            currentRoundState.estimatedStartingDeck = estimatedStarting;
            currentRoundState.matchedPreset = 'none';
            currentRoundState.isHighTrust = false;
            log(`Dynamic Deck Match: No preset matches. Using raw estimate (Low Trust)`);
        }
    } else if (currentRoundState.isActive) {
        currentRoundState.lastTotalRemaining = currSum;
        currentRoundState.lastAttempts = attemptsLeft;
        currentRoundState.lastFreeAbandons = freeAbandonsLeft;
        currentRoundState.lastHand = [...scannedHand];
    }
    
    // Choose starting deck based on trust
    const startingDeck = currentRoundState.isHighTrust
        ? currentRoundState.estimatedStartingDeck
        : DECK_PRESETS[selectedPreset]; // Fallback to manual selection if not in high trust
        
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
    
    if (hasNegativeError && currentRoundState.isHighTrust) {
        log(`Warning: Scanned deck counts exceed auto-detected preset.`);
        currentRoundState.isHighTrust = false;
        log(`Degrading to Low Trust due to negative error.`);
    }
    
    lastScannedSlots = normalizedSlots;
    log(`Deduced Hand: [${deducedHand.join(', ')}]`);
    
    const canUseDeducedHand = !DEBUG_SLOT_OCR_ONLY && currentRoundState.isHighTrust && !hasNegativeError && (
        scannedHand.length === 0 ||
        deducedHand.length >= scannedHand.length
    );
    
    const hand = canUseDeducedHand
        ? reconcileHandSlots(normalizedSlots, deducedHand)
        : scannedHand;
        
    const solverDeck = canUseDeducedHand
        ? startingDeck
        : buildEffectiveDeck(remainingDeck, hand);
        
    log(`Hand Source: ${canUseDeducedHand ? 'slots+deduced' : 'slot-only fallback (Low Trust)'}`);
    log(`Solver Deck Source: ${canUseDeducedHand ? 'auto-detected preset' : 'effective remaining+hand'} [${Object.values(solverDeck).join(', ')}]`);
    log(`Reconciled Hand: [${hand.join(', ')}]`);
    lastScannedHand = hand;
    
    // Render Preset info in scan-meta if active
    const scanMetaEl = document.getElementById('scan-meta');
    if (scanMetaEl) {
        const scanTime = new Date().toLocaleTimeString();
        let presetText = "";
        if (currentRoundState.isActive) {
            if (currentRoundState.isHighTrust) {
                presetText = ` | Tự động: Preset ${currentRoundState.matchedPreset} (Tin cậy cao)`;
            } else {
                presetText = ` | Tự động: Không xác định (Tin cậy thấp)`;
            }
        } else {
            presetText = ` | Chờ ván mới...`;
        }
        const currentMeta = scanMetaEl.innerText;
        const timeMatch = currentMeta.match(/Quét xong lúc \d+:\d+:\d+/);
        const timeStr = timeMatch ? timeMatch[0] : `Quét lúc ${scanTime}`;
        scanMetaEl.innerText = `${timeStr}. Nhân đôi: ${isDoubled ? 'BẬT' : 'TẮT'}${presetText}`;
    }

    // Render Hand
    renderHandCards(hand);
    
    // Format hand for Overlay HUD
    document.getElementById('hud-hand-display').innerText = `[ ${hand.join(' | ') || '-'} ]`;

    // Auto-detect Free Trial if attempts is 0
    if (attemptsLeft === 0) {
        isFreeTrial = true;
    }

    if (isFreeTrial) {
        isDoubled = false;
    }

    // Calculate BP sum and score mod 11
    const sum = hand.reduce((acc, val) => acc + val, 0);
    const score = sum % 11;
    document.getElementById('stat-sum').innerText = score;
    document.getElementById('stat-double').innerText = isDoubled ? 'BẬT' : 'TẮT';
    document.getElementById('stat-double').className = isDoubled ? 'stat-num gold-glow' : 'stat-num text-muted';

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
