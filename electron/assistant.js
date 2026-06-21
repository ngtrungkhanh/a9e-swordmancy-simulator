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

// Live Stream and Watch Loop State
let mediaStream = null;
let watchTimeout = null;
let prevHashes = {};
let isAnimating = false;
let stableTicks = 0;
let retryCount = 0;
let inTrial = false;
let streamVideo = null;

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

    // Load last window mode on startup
    const startMode = localStorage.getItem('currentWindowMode') || 'normal';
    setWindowMode(startMode);

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
            log('Force scan F5 hotkey received in renderer (legacy)');
        });

        window.electronAPI.onWindowModeChanged((mode) => {
            log(`Renderer: Window mode changed notification from main process: ${mode}`);
            setWindowMode(mode, true);
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
    if (text === 'LIVE') {
        badge.innerHTML = `
            <span style="display: inline-flex; align-items: center; gap: 4px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="animation: hud-blink 1s infinite;"><path d="M23 6.07a1 1 0 0 0-.37-.77 1 1 0 0 0-.78-.23l-5.69 1.42a1 1 0 0 0-.73.97v9.12a1 1 0 0 0 .73.97l5.69 1.42a1 1 0 0 0 .78-.23 1 1 0 0 0 .37-.77zM2 5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/></svg>
                <span style="animation: hud-blink 1s infinite; font-weight: bold;">LIVE</span>
            </span>
        `;
    } else {
        badge.innerText = text;
    }
    badge.className = 'status-badge';
    if (statusClass) {
        badge.classList.add(statusClass);
    }
}

let currentWindowMode = 'normal';
function setWindowMode(mode, fromMain = false) {
    currentWindowMode = mode;
    log(`Setting window mode to: ${mode} (fromMain: ${fromMain})`);
    if (!fromMain && window.electronAPI) {
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
            runSolver(lastScannedRemaining.remainingDeck, lastScannedRemaining.isDoubled, lastScannedRemaining.isFreeTrial, lastScannedSlots, lastScannedRemaining.gameScore);
        }
    };

    // Custom deck input changes
    for (let v = 1; v <= 5; v++) {
        document.getElementById(`custom-deck-${v}`).onchange = (e) => {
            DECK_PRESETS['custom'][v] = parseInt(e.target.value) || 0;
            localStorage.setItem('customDeckPreset', JSON.stringify(DECK_PRESETS['custom']));
            log(`Custom deck ${v} BP updated to ${DECK_PRESETS['custom'][v]}`);
            if (lastScannedRemaining) {
                runSolver(lastScannedRemaining.remainingDeck, lastScannedRemaining.isDoubled, lastScannedRemaining.isFreeTrial, lastScannedSlots, lastScannedRemaining.gameScore);
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
            runSolver(lastScannedRemaining.remainingDeck, lastScannedRemaining.isDoubled, lastScannedRemaining.isFreeTrial, lastScannedSlots, lastScannedRemaining.gameScore);
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
            runSolver(lastScannedRemaining.remainingDeck, lastScannedRemaining.isDoubled, isFree, lastScannedSlots, lastScannedRemaining.gameScore);
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
            runSolver(lastScannedRemaining.remainingDeck, lastScannedRemaining.isDoubled, lastScannedRemaining.isFreeTrial, lastScannedSlots, lastScannedRemaining.gameScore);
        }
    };

    // Scan Buttons (Normal & HUD)
    document.getElementById('btn-scan').onclick = () => {
        log('btn-scan clicked, toggling Live Detect');
        const chk = document.getElementById('chk-auto-scan');
        chk.checked = !chk.checked;
        scanStarted = true;
        triggerAutoScanStateChange();
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
    
    if (window.electronAPI) {
        window.electronAPI.requestScreenshot();
    }
}

function removeScanningFlash() {
    // Legacy support
}

function updateAutoScanVisualState() {
    const isAutoActive = (mediaStream !== null);
    log(`updateAutoScanVisualState: isAutoActive=${isAutoActive}`);
    
    const btnScan = document.getElementById('btn-scan');
    const hudLive = document.getElementById('hud-live-indicator');
    
    if (isAutoActive) {
        if (btnScan) {
            btnScan.classList.add('active-auto-scan');
            btnScan.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 8px;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                TẮT LIVE DETECT (F4)
            `;
        }
        if (hudLive) hudLive.style.display = 'inline-flex';
    } else {
        if (btnScan) {
            btnScan.classList.remove('active-auto-scan');
            btnScan.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 8px;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                BẬT LIVE DETECT (F4)
            `;
        }
        if (hudLive) hudLive.style.display = 'none';
    }
}

function triggerAutoScanStateChange() {
    const isChecked = document.getElementById('chk-auto-scan').checked;
    log(`triggerAutoScanStateChange: checked=${isChecked}`);
    
    stopLiveDetect();
    
    if (isChecked) {
        updateBadgeStatus('ĐANG KHỞI TẠO...', 'scanning');
        startLiveDetect().then(success => {
            if (success) {
                updateBadgeStatus('LIVE', 'success');
                updateAutoScanVisualState();
            } else {
                updateBadgeStatus('LỖI KẾT NỐI STREAM', 'error');
                document.getElementById('chk-auto-scan').checked = false;
                updateAutoScanVisualState();
            }
        });
    } else {
        updateBadgeStatus('LIVE DETECT TẮT');
        updateAutoScanVisualState();
    }
}

async function startLiveDetect(forceScreen = false) {
    try {
        if (!window.electronAPI || !window.electronAPI.resolveCaptureSource) {
            log('startLiveDetect: electronAPI.resolveCaptureSource is not available.');
            return false;
        }
        
        log(`startLiveDetect: Resolving capture source (forceScreen=${forceScreen})...`);
        const sourceId = await window.electronAPI.resolveCaptureSource(forceScreen);
        if (!sourceId) {
            log('startLiveDetect: Failed to resolve game capture source ID.');
            return false;
        }
        
        log(`startLiveDetect: Resolved source ID: ${sourceId}. Creating MediaStream...`);
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: sourceId
                }
            }
        });
        
        mediaStream = stream;
        
        streamVideo = document.createElement('video');
        streamVideo.srcObject = stream;
        
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.onended = () => {
                log('MediaStream track ended. Reconnecting...');
                handleStreamEnded();
            };
        }
        
        await new Promise((resolve) => {
            streamVideo.onloadedmetadata = () => {
                streamVideo.play();
                resolve();
            };
        });
        
        log('startLiveDetect: MediaStream playing. Starting watch loop...');
        scanStarted = true;
        inTrial = true;
        prevHashes = {};
        isAnimating = false;
        stableTicks = 0;
        retryCount = 0;
        
        updateAutoScanVisualState();
        scheduleNextWatchTick(90);
        return true;
    } catch (err) {
        log(`startLiveDetect error: ${err.message}`);
        if (!forceScreen) {
            log('startLiveDetect: Failed with window source. Retrying with primary screen fallback...');
            return await startLiveDetect(true);
        }
        return false;
    }
}

function stopLiveDetect() {
    log('stopLiveDetect called.');
    if (watchTimeout) {
        clearTimeout(watchTimeout);
        watchTimeout = null;
    }
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    if (streamVideo) {
        streamVideo.pause();
        streamVideo.srcObject = null;
        streamVideo = null;
    }
    scanStarted = false;
    removeScanningFlash();
}

function handleStreamEnded() {
    log('handleStreamEnded: Stream track ended.');
    const isChecked = document.getElementById('chk-auto-scan').checked;
    stopLiveDetect();
    if (isChecked) {
        updateBadgeStatus('MẤT KẾT NỐI, ĐANG THỬ LẠI...', 'scanning');
        setTimeout(async () => {
            const stillChecked = document.getElementById('chk-auto-scan').checked;
            if (stillChecked) {
                const success = await startLiveDetect();
                if (success) {
                    updateBadgeStatus('LIVE', 'success');
                } else {
                    updateBadgeStatus('LỖI KẾT NỐI STREAM', 'error');
                }
            }
        }, 2000);
    }
}

function scheduleNextWatchTick(ms) {
    if (watchTimeout) clearTimeout(watchTimeout);
    watchTimeout = setTimeout(watchTick, ms);
}

function calculateRegionHash(imgData) {
    const data = imgData.data;
    let rSum = 0, gSum = 0, bSum = 0;
    let count = 0;
    const stride = 16;
    for (let i = 0; i < data.length; i += stride * 4) {
        rSum += data[i];
        gSum += data[i+1];
        bSum += data[i+2];
        count++;
    }
    return {
        r: Math.round(rSum / count),
        g: Math.round(gSum / count),
        b: Math.round(bSum / count)
    };
}

function watchTick() {
    if (!mediaStream || !streamVideo) return;
    
    const canvas = document.getElementById('proc-canvas');
    const ctx = canvas.getContext('2d');
    
    const w = streamVideo.videoWidth;
    const h = streamVideo.videoHeight;
    if (w === 0 || h === 0) {
        scheduleNextWatchTick(90);
        return;
    }
    
    if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
    }
    
    ctx.drawImage(streamVideo, 0, 0, w, h);
    
    const activeConfig = window.getActiveConfig(w, h);
    if (!activeConfig) {
        scheduleNextWatchTick(90);
        return;
    }
    
    if (!inTrial) {
        // Quick bracket check
        const brConfig = activeConfig.bracket;
        const brPixels = ctx.getImageData(brConfig.x, brConfig.y, brConfig.width, brConfig.height);
        let darkBr = 0;
        for (let i = 0; i < brConfig.width * brConfig.height; i++) {
            if ((brPixels.data[i*4] + brPixels.data[i*4+1] + brPixels.data[i*4+2]) / 3 < 110) {
                darkBr++;
            }
        }
        const minDarkBr = Math.max(5, Math.round(brConfig.width * brConfig.height * 0.074));
        const isBracketPresent = darkBr > minDarkBr;

        if (isBracketPresent) {
            log('watchTick: Trial UI detected via bracket. Speeding up to 90ms.');
            inTrial = true;
            prevHashes = {};
            isAnimating = false;
            stableTicks = 0;
            scheduleNextWatchTick(90);
            return;
        }

        let deckSum = 0;
        const imageSource = {
            getCrop: (cx, cy, cw, ch) => ctx.getImageData(cx, cy, cw, ch).data
        };
        activeConfig.deckCounts.forEach((dc) => {
            const cropPixels = imageSource.getCrop(dc.x, dc.y, dc.width, dc.height);
            const result = classifySmallUiDigitFromCrop(cropPixels, dc.width, dc.height);
            if (result.digit !== null) {
                deckSum += result.digit;
            }
        });

        if (deckSum > 10) {
            log('watchTick: Trial UI detected via deck counts. Speeding up to 90ms.');
            inTrial = true;
            prevHashes = {};
            isAnimating = false;
            stableTicks = 0;
            scheduleNextWatchTick(90);
            return;
        }

        scheduleNextWatchTick(500);
        return;
    }
    
    // In Trial UI
    let anyChange = false;
    const currentHashes = {};
    const regions = {
        trialAnchor: activeConfig.trialAnchor,
        scoreRewardBand: activeConfig.scoreRewardBand,
        controlBand: activeConfig.controlBand,
        deckPanel: activeConfig.deckPanel
    };
    
    for (const [name, rect] of Object.entries(regions)) {
        if (!rect) continue;
        const imgData = ctx.getImageData(rect.x, rect.y, rect.width, rect.height);
        const hash = calculateRegionHash(imgData);
        currentHashes[name] = hash;
        
        const prev = prevHashes[name];
        if (prev) {
            const diff = Math.abs(hash.r - prev.r) + Math.abs(hash.g - prev.g) + Math.abs(hash.b - prev.b);
            if (diff > 15) {
                anyChange = true;
            }
        } else {
            anyChange = true;
        }
    }
    
    prevHashes = currentHashes;
    
    if (anyChange) {
        isAnimating = true;
        stableTicks = 0;
    } else {
        if (isAnimating) {
            stableTicks++;
            if (stableTicks >= 2) {
                isAnimating = false;
                log('watchTick: UI stabilized. Triggering scan...');
                triggerLiveScan(ctx, w, h);
            }
        }
    }
    
    scheduleNextWatchTick(90);
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
        runSolver(lastScannedRemaining.remainingDeck, lastScannedRemaining.isDoubled, lastScannedRemaining.isFreeTrial, lastScannedSlots, lastScannedRemaining.gameScore);
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

function processRawScreenshot(width, height, buffer) {
    const canvas = document.getElementById('proc-canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = width;
    canvas.height = height;
    
    const imageData = ctx.createImageData(width, height);
    imageData.data.set(buffer);
    ctx.putImageData(imageData, 0, 0);
    
    log(`Raw screenshot loaded. Dims: ${width}x${height}`);
    
    const activeConfig = window.getActiveConfig(width, height);
    if (!activeConfig) return;
    
    const imageSource = {
        getCrop: (x, y, w, h) => ctx.getImageData(x, y, w, h).data
    };
    
    const state = window.scanFullState(imageSource, activeConfig);
    const validation = validateScanState(state);
    
    if (validation.status === 'inactive') {
        log('processRawScreenshot: UI determined to be inactive.');
        inTrial = false;
        updateBadgeStatus('SẴN SÀNG (F4)');
        return;
    }
    
    if (validation.status === 'retry') {
        log(`processRawScreenshot: Validation failed (status: retry). Keeping previous state. Warnings: ${validation.warnings.join(', ')}`);
        updateBadgeStatus('OCR CHƯA CHẮC', 'scanning');
        return;
    }
    
    commitScanState(state, validation.status === 'warning' ? validation.warnings : null);
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
        
        const activeConfig = window.getActiveConfig(img.width, img.height);
        if (!activeConfig) return;
        
        const imageSource = {
            getCrop: (x, y, w, h) => ctx.getImageData(x, y, w, h).data
        };
        
        const state = window.scanFullState(imageSource, activeConfig);
        const validation = validateScanState(state);
        
        if (validation.status === 'inactive') {
            log('processScreenshot: UI determined to be inactive.');
            inTrial = false;
            updateBadgeStatus('SẴN SÀNG (F4)');
            removeScanningFlash();
            return;
        }
        
        if (validation.status === 'retry') {
            log(`processScreenshot: Validation failed (status: retry). Keeping previous state. Warnings: ${validation.warnings.join(', ')}`);
            updateBadgeStatus('OCR CHƯA CHẮC', 'scanning');
            removeScanningFlash();
            return;
        }
        
        commitScanState(state, validation.status === 'warning' ? validation.warnings : null);
        
        removeScanningFlash();
    };
}

function triggerLiveScan(ctx, w, h) {
    retryCount = 0;
    runScanPipeline(ctx, w, h);
}

function runScanPipeline(ctx, w, h) {
    try {
        const activeConfig = window.getActiveConfig(w, h);
        if (!activeConfig) return;
        
        const imageSource = {
            getCrop: (x, y, w, h) => ctx.getImageData(x, y, w, h).data
        };
        
        const state = window.scanFullState(imageSource, activeConfig);
        const validation = validateScanState(state);
        
        if (validation.status === 'retry') {
            if (retryCount < 3) {
                retryCount++;
                log(`runScanPipeline: Validation failed (retry ${retryCount}/3). Warnings: ${validation.warnings.join(', ')}`);
                updateBadgeStatus(`ĐANG XÁC MINH ${retryCount}/3...`, 'scanning');
                setTimeout(() => {
                    if (!mediaStream || !streamVideo) return;
                    const canvas = document.getElementById('proc-canvas');
                    const cleanCtx = canvas.getContext('2d');
                    cleanCtx.drawImage(streamVideo, 0, 0, w, h);
                    runScanPipeline(cleanCtx, w, h);
                }, 100);
                return;
            } else {
                log(`runScanPipeline: Validation failed after 3 retries. Keeping previous state. Warnings: ${validation.warnings.join(', ')}`);
                updateBadgeStatus('OCR CHƯA CHẮC', 'scanning');
                return;
            }
        }
        
        if (validation.status === 'inactive') {
            log('runScanPipeline: UI determined to be inactive.');
            inTrial = false;
            updateBadgeStatus('SẴN SÀNG (F4)');
            return;
        }
        
        commitScanState(state, validation.status === 'warning' ? validation.warnings : null);
        
    } catch (err) {
        log(`Error in runScanPipeline: ${err.stack || err.message}`);
        updateBadgeStatus('LỖI QUÉT', 'error');
    }
}

function validateScanState(state) {
    const warnings = [];
    const deckSum = Object.values(state.remainingDeck).reduce((a, b) => a + b, 0);
    const rawHand = state.scannedSlots.filter(v => v !== null);
    
    const totalScannedCards = deckSum + rawHand.length;
    if (!state.isBracketPresent && totalScannedCards < 15) {
        return { status: 'inactive', warnings: ['Outside Trial UI (low card count)'] };
    }
    
    for (let i = 0; i < 5; i++) {
        const det = state.slotDetections[i];
        if (det && det.digit === null && det.darkPixels !== undefined) {
            warnings.push(`Slot ${i+1}: Có lá bài nhưng nhận dạng chữ số thất bại.`);
        }
    }
    
    // Mốc đối chiếu xuất phát: Ưu tiên bộ bài tự động nhận diện tin cậy cao,
    // nếu chưa có thì dùng bộ bài của Preset được chọn trên giao diện UI
    const startingDeck = (currentRoundState.isActive && currentRoundState.isHighTrust)
        ? currentRoundState.estimatedStartingDeck
        : DECK_PRESETS[selectedPreset];
        
    const deducedHand = [];
    if (startingDeck) {
        for (let bp = 1; bp <= 5; bp++) {
            const diff = startingDeck[bp] - state.remainingDeck[bp];
            if (diff >= 0) {
                for (let i = 0; i < diff; i++) {
                    deducedHand.push(bp);
                }
            }
        }
    }
    
    const useDeduced = shouldUseDeducedHand(startingDeck, state.remainingDeck, rawHand, state.gameScore);
    const hand = useDeduced
        ? reconcileHandSlots(state.scannedSlots, deducedHand)
        : rawHand;
        
    if (useDeduced) {
        log(`validateScanState: Using reconciled hand [${hand.join(', ')}] based on deduced hand [${deducedHand.join(', ')}]`);
    }
    
    if (startingDeck) {
        const totalStarting = Object.values(startingDeck).reduce((a, b) => a + b, 0);
        const handCounts = countCards(hand);
        let sumMismatch = false;
        
        // 1. Kiểm tra xem số lượng từng loại bài quét được có vượt quá số lượng ban đầu của preset không
        for (let bp = 1; bp <= 5; bp++) {
            const currentTotal = (state.remainingDeck[bp] || 0) + (handCounts[bp] || 0);
            if (currentTotal > startingDeck[bp]) {
                warnings.push(`Lá ${bp} BP: Tổng quét ${currentTotal} vượt quá số lượng ban đầu ${startingDeck[bp]} của preset.`);
                sumMismatch = true;
            }
        }
        
        // 2. Kiểm tra tổng số bài quét được có khớp với tổng số bài của preset không
        const currentSum = deckSum + hand.length;
        if (currentSum !== totalStarting) {
            warnings.push(`Tổng số lá bài lệch: Quét được ${currentSum}, Preset yêu cầu ${totalStarting}.`);
            sumMismatch = true;
        }
        
        if (sumMismatch) {
            return { status: 'retry', warnings };
        }
    }
    
    // 3. Kiểm tra chéo giữa điểm tự tính từ bài trên tay và điểm quét được từ game
    if (state.gameScore !== null && state.gameScore !== undefined) {
        const calculatedScore = hand.reduce((acc, val) => acc + val, 0) % 11;
        if (calculatedScore !== state.gameScore) {
            warnings.push(`Điểm số lệch: Tự tính ${calculatedScore}, Quét trên game ${state.gameScore}.`);
            return { status: 'retry', warnings };
        }
    }
    
    if (warnings.length > 0) {
        return { status: 'warning', warnings };
    }
    
    return { status: 'accepted', warnings };
}

function commitScanState(state, warnings) {
    switchMode(state.isFreeTrial ? 'FREE_TRIAL' : 'REWARDED');
    
    if (state.isFreeTrial && state.scannedSlots.every(card => card === null)) {
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
        log('commitScanState: Free Trial round start detected, reset steppers.');
    }
    
    if (!state.isFreeTrial) {
        attemptsLeft = state.attemptsLeft;
        doublesLeft = state.doublesLeft;
        localStorage.setItem('attemptsLeft', attemptsLeft);
        localStorage.setItem('rewardedAttemptsLeft', attemptsLeft);
        localStorage.setItem('doublesLeft', doublesLeft);
        localStorage.setItem('rewardedDoublesLeft', doublesLeft);
        syncStepperUI();
    }
    
    if (lastScannedRemaining) {
        const prevSum = Object.values(lastScannedRemaining.remainingDeck).reduce((a, b) => a + b, 0);
        const currSum = Object.values(state.remainingDeck).reduce((a, b) => a + b, 0);
        const startingDeck = DECK_PRESETS[selectedPreset];
        const startingSum = Object.values(startingDeck).reduce((a, b) => a + b, 0);
        
        if (prevSum < startingSum && currSum > prevSum) {
            log(`commitScanState: Round reset detected. prevSum: ${prevSum}, currSum: ${currSum}`);
            if (state.isFreeTrial) {
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
            } else {
                const prevAttempts = lastScannedRemaining.attemptsLeft;
                const currAttempts = state.attemptsLeft;
                if (prevAttempts !== null && currAttempts !== null && currAttempts >= prevAttempts) {
                    log('commitScanState: Attempts did not decrease, counting as ABANDON.');
                    freeAbandonsLeft = Math.max(0, freeAbandonsLeft - 1);
                    localStorage.setItem('freeAbandonsLeft', freeAbandonsLeft);
                    localStorage.setItem('rewardedFreeAbandonsLeft', freeAbandonsLeft);
                    syncStepperUI();
                } else {
                    log('commitScanState: Normal round completion. Adding rewards.');
                    if (lastScannedHand && lastScannedHand.length > 0) {
                        const sumHand = lastScannedHand.reduce((acc, val) => acc + val, 0);
                        const scoreHand = sumHand % 11;
                        const levelRewards = REWARDS[4];
                        const reward = levelRewards[scoreHand] || 0;
                        const prevIsDoubled = lastScannedRemaining.isDoubled;
                        const roundReward = reward * (prevIsDoubled ? 2 : 1);
                        
                        accumulatedBills += roundReward;
                        localStorage.setItem('accumulatedBills', accumulatedBills);
                        updateAccumulatedBillsUI();
                    }
                }
            }
        }
    }
    
    lastScannedRemaining = { 
        remainingDeck: state.remainingDeck, 
        isDoubled: state.isDoubled, 
        isFreeTrial: state.isFreeTrial, 
        attemptsLeft: state.attemptsLeft,
        gameScore: state.gameScore
    };
    
    if (warnings) {
        log(`commitScanState completed with warning: ${warnings.join(', ')}`);
        updateBadgeStatus('OCR CHƯA CHẮC', 'scanning');
    } else {
        updateBadgeStatus('LIVE', 'success');
    }
    
    const scanTime = new Date().toLocaleTimeString();
    document.getElementById('scan-meta').innerText = `Cập nhật lúc ${scanTime}. Nhân đôi: ${state.isDoubled ? 'BẬT' : 'TẮT'}`;
    
    runSolver(state.remainingDeck, state.isDoubled, state.isFreeTrial, state.scannedSlots, state.gameScore);
}

function runSolver(remainingDeck, isDoubled, isFreeTrial, scannedSlots, gameScore = null) {
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
    
    const canUseDeducedHand = shouldUseDeducedHand(startingDeck, remainingDeck, scannedHand, gameScore);
    
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

    // Calculate baseline S for Net EV
    const S = solveAttempts > 0 ? solver.solve(solveAttempts - 1, solveAbandons, solveDoubles, [], false) : 0;

    // Expected Value (EV) as requested by user replacing expected reward (Total EV)
    const evValue = Math.round(advice.ev).toLocaleString() + ' Bills';
    document.getElementById('stat-reward').innerText = evValue;
    document.getElementById('hud-reward-val').innerText = evValue;

    // Ev details normal UI
    document.getElementById('ev-val-draw').innerText = advice.details.evDraw !== null ? Math.round(advice.details.evDraw - S).toLocaleString() + ' Bills' : '-';
    document.getElementById('ev-val-stop').innerText = advice.details.evStop !== null ? Math.round(advice.details.evStop - S).toLocaleString() + ' Bills' : '-';
    document.getElementById('ev-val-abandon').innerText = advice.details.evAbandon !== null ? Math.round(advice.details.evAbandon - S).toLocaleString() + ' Bills' : '-';

    // Ev details HUD UI
    document.getElementById('hud-ev-val-draw').innerText = advice.details.evDraw !== null ? Math.round(advice.details.evDraw - S).toLocaleString() + ' Bills' : '-';
    document.getElementById('hud-ev-val-stop').innerText = advice.details.evStop !== null ? Math.round(advice.details.evStop - S).toLocaleString() + ' Bills' : '-';
    document.getElementById('hud-ev-val-abandon').innerText = advice.details.evAbandon !== null ? Math.round(advice.details.evAbandon - S).toLocaleString() + ' Bills' : '-';

    // Render Double EV values (always visible)
    const isDoubleAvailable = (hand.length >= 1 && hand.length <= 2 && !isDoubled && solveDoubles > 0);
    const doubleRow = document.getElementById('ev-row-double');
    const doubleVal = document.getElementById('ev-val-double');
    const hudDoubleVal = document.getElementById('hud-ev-val-double');
    
    const evDoubleStr = (isDoubleAvailable && advice.details.evDouble !== null && advice.details.evDouble !== undefined)
        ? Math.round(advice.details.evDouble - S).toLocaleString() + ' Bills'
        : '-';
        
    if (doubleVal) doubleVal.innerText = evDoubleStr;
    if (hudDoubleVal) hudDoubleVal.innerText = evDoubleStr;

    // Set highlights for normal UI rows
    document.getElementById('ev-row-draw').className = 'ev-row' + (advice.action === 'Draw' ? ' best-action' : '');
    document.getElementById('ev-row-stop').className = 'ev-row' + (advice.action === 'Stop' ? ' best-action stop-action' : '');
    document.getElementById('ev-row-abandon').className = 'ev-row' + (advice.action === 'Abandon' ? ' best-action abandon-action' : '');
    if (doubleRow) doubleRow.className = 'ev-row' + (advice.action === 'Double' ? ' best-action' : '');

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

// Helper functions for OCR and Solver handoff logic

function normalizeScannedSlots(slots) {
    if (!slots || !Array.isArray(slots)) return Array(5).fill(null);
    return slots.map(v => (typeof v === 'number' && v >= 1 && v <= 5) ? v : null);
}

function compactSlots(slots) {
    if (!slots) return [];
    return slots.filter(v => v !== null && v !== undefined);
}

function countCards(hand) {
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    if (hand && Array.isArray(hand)) {
        hand.forEach(v => {
            if (v >= 1 && v <= 5) {
                counts[v]++;
            }
        });
    }
    return counts;
}

function shouldUseDeducedHand(startingDeck, remainingDeck, scannedHand, gameScore) {
    if (DEBUG_SLOT_OCR_ONLY) return false;
    
    const isTrustworthy = currentRoundState.isHighTrust || (selectedPreset && selectedPreset !== 'custom');
    if (!isTrustworthy) return false;
    if (!startingDeck) return false;
    
    // Check for negative error
    let hasNegativeError = false;
    const deducedHand = [];
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
    
    if (hasNegativeError) return false;
    
    if (gameScore !== null && gameScore !== undefined) {
        const deducedScore = deducedHand.reduce((a, b) => a + b, 0) % 11;
        const scannedScore = scannedHand.reduce((a, b) => a + b, 0) % 11;
        
        if (deducedScore === gameScore) {
            return true;
        } else if (scannedScore === gameScore) {
            return false;
        }
    }
    
    return (scannedHand.length === 0 || deducedHand.length >= scannedHand.length);
}

function reconcileHandSlots(slots, deducedHand) {
    const reconciled = Array(5).fill(null);
    const remainingDeduced = [...deducedHand];
    
    // First pass: match slot cards that exist in deducedHand
    for (let i = 0; i < slots.length; i++) {
        const card = slots[i];
        if (card !== null) {
            const idx = remainingDeduced.indexOf(card);
            if (idx !== -1) {
                reconciled[i] = card;
                remainingDeduced.splice(idx, 1);
            }
        }
    }
    
    // Second pass: fill empty slots with remaining deduced cards
    for (let i = 0; i < reconciled.length; i++) {
        if (reconciled[i] === null && remainingDeduced.length > 0) {
            reconciled[i] = remainingDeduced.shift();
        }
    }
    
    return reconciled.filter(v => v !== null);
}

function buildEffectiveDeck(remainingDeck, hand) {
    const deck = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (let bp = 1; bp <= 5; bp++) {
        deck[bp] = remainingDeck[bp] || 0;
    }
    if (hand && Array.isArray(hand)) {
        hand.forEach(v => {
            if (v >= 1 && v <= 5) {
                deck[v]++;
            }
        });
    }
    return deck;
}
