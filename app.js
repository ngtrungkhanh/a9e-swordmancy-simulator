/**
 * app.js
 * UI Logic & Events Bridge
 * Trial of Swordmancy Simulator & Optimizer
 */

// Global App State
let solver = null;
let currentHand = [];
let isDoubled = false;
let doubledAtIndex = -1; // Index of the card that was doubled
let accumulatedSessionReward = 0; // Cumulative reward of current simulator session
let stateHistory = []; // Stack for undo functionality
let trialCompletionTimer = null; // Reference to completion auto-advance timer

// Deck Presets mapping from the game rules
const DECK_PRESETS = {
    1: { 1: 5, 2: 5, 3: 5, 4: 8, 5: 6 },
    2: { 1: 4, 2: 5, 3: 6, 4: 6, 5: 7 },
    3: { 1: 7, 2: 3, 3: 7, 4: 3, 5: 7 },
    4: { 1: 3, 2: 7, 3: 7, 4: 7, 5: 5 },
    5: { 1: 6, 2: 6, 3: 9, 4: 4, 5: 3 },
    6: { 1: 4, 2: 5, 3: 4, 4: 8, 5: 7 },
    7: { 1: 8, 2: 5, 3: 2, 4: 5, 5: 8 }
};

const WIKI_DECK_CACHE_KEY = 'a9e_wiki_deck_cache_v1';

// DOM Elements
const levelSelect = document.getElementById('facility-level');
const deckPresetSelect = document.getElementById('deck-preset');
const inputDeck1 = document.getElementById('deck-c1');
const inputDeck2 = document.getElementById('deck-c2');
const inputDeck3 = document.getElementById('deck-c3');
const inputDeck4 = document.getElementById('deck-c4');
const inputDeck5 = document.getElementById('deck-c5');
const totalCardsText = document.getElementById('deck-total-cards');

const stateAttempts = document.getElementById('state-attempts');
const stateFreeAbandons = document.getElementById('state-free-abandons');
const stateDoubles = document.getElementById('state-doubles');

const statSum = document.getElementById('stat-sum');
const statHandSize = document.getElementById('stat-hand-size');
const statCurrentReward = document.getElementById('stat-current-reward');
const handContainer = document.getElementById('hand-container');
const tableBanner = document.getElementById('table-banner');

const btnDraw = document.getElementById('btn-draw');
const btnDrawRandom = document.getElementById('btn-draw-random');
const btnDouble = document.getElementById('btn-double');
const btnStop = document.getElementById('btn-stop');
const btnAbandon = document.getElementById('btn-abandon');
const btnUndo = document.getElementById('btn-undo');
const btnResetDeck = document.getElementById('btn-reset-deck');
const btnFetchWikiDeck = document.getElementById('btn-fetch-wiki-deck');
const btnResetDay = document.getElementById('btn-reset-day');
const btnRunMC = document.getElementById('btn-run-mc');

const suggestionBox = document.getElementById('suggestion-box');
const suggestionHeader = document.getElementById('suggestion-header');
const suggestionValue = document.getElementById('suggestion-value');
const suggestionReason = document.getElementById('suggestion-reason');

const statReward = document.getElementById('stat-reward');
const evValDraw = document.getElementById('ev-val-draw');
const evValStop = document.getElementById('ev-val-stop');
const evValAbandon = document.getElementById('ev-val-abandon');
const evValDouble = document.getElementById('ev-val-double');
const evRowDouble = document.getElementById('ev-row-double');

const mcDaysInput = document.getElementById('mc-days');
const mcResultsTbody = document.getElementById('mc-results-tbody');
const chartContainer = document.getElementById('chart-container');
const toastMessage = document.getElementById('toast-message');

// New Modal & Earnings Dashboard DOM Elements
const cardPickerModal = document.getElementById('card-picker-modal');
const btnClosePicker = document.getElementById('btn-close-picker');
const sessionEarningsText = document.getElementById('session-earnings');
const sessionEarningsProgress = document.getElementById('session-earnings-progress');

// Initialize
function init() {
    loadCachedWikiDecks();
    syncDeckPresetOptions();
    if (deckPresetSelect.value !== 'custom') {
        applyPreset(deckPresetSelect.value, false);
    } else {
        updateSolverFromUI();
    }
    resetHandState();
    setupEventListeners();
    updateUI();
    showToast("Đã khởi tạo Trợ Lý Đấu Trường!");
}

// Instantiate solver based on current UI config
function updateSolverFromUI() {
    const level = parseInt(levelSelect.value);
    const deck = {
        1: parseInt(inputDeck1.value) || 0,
        2: parseInt(inputDeck2.value) || 0,
        3: parseInt(inputDeck3.value) || 0,
        4: parseInt(inputDeck4.value) || 0,
        5: parseInt(inputDeck5.value) || 0
    };

    // Update total count
    const total = Object.values(deck).reduce((a, b) => a + b, 0);
    totalCardsText.innerText = total;

    solver = new SwordmancySolver(deck, level);
}

function getDeckTotal(deck) {
    return Object.values(normalizeDeck(deck)).reduce((sum, count) => sum + count, 0);
}

function syncDeckPresetOptions() {
    const selectedValue = deckPresetSelect.value;
    const customOption = deckPresetSelect.querySelector('option[value="custom"]');
    deckPresetSelect.innerHTML = '';
    if (customOption) {
        deckPresetSelect.appendChild(customOption);
    } else {
        const option = document.createElement('option');
        option.value = 'custom';
        option.textContent = '-- Tự cấu hình --';
        deckPresetSelect.appendChild(option);
    }

    Object.keys(DECK_PRESETS)
        .map(Number)
        .filter(deckId => Number.isInteger(deckId) && deckId > 0)
        .sort((a, b) => a - b)
        .forEach(deckId => {
            const option = document.createElement('option');
            option.value = String(deckId);
            option.textContent = `Bộ bài ${deckId} (Tổng ${getDeckTotal(DECK_PRESETS[deckId])} lá)`;
            deckPresetSelect.appendChild(option);
        });

    if ([...deckPresetSelect.options].some(option => option.value === selectedValue)) {
        deckPresetSelect.value = selectedValue;
    } else {
        deckPresetSelect.value = 'custom';
    }
}

// Applies a deck preset to the UI inputs and updates the solver
function applyPreset(presetVal, showNotification = true) {
    if (presetVal !== 'custom') {
        const preset = DECK_PRESETS[presetVal];
        if (preset) {
            inputDeck1.value = preset[1];
            inputDeck2.value = preset[2];
            inputDeck3.value = preset[3];
            inputDeck4.value = preset[4];
            inputDeck5.value = preset[5];
            updateSolverFromUI();
            resetHandState();
            updateUI();
            if (showNotification) {
                showToast(`Đã áp dụng mẫu Bộ bài ${presetVal}!`);
            }
        }
    }
}

function normalizeDeck(deck) {
    const normalized = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (let v = 1; v <= 5; v++) {
        normalized[v] = Number(deck?.[v]) || 0;
    }
    return normalized;
}

function isValidDeck(deck) {
    const normalized = normalizeDeck(deck);
    return Object.values(normalized).reduce((sum, count) => sum + count, 0) > 0;
}

function applyDeckPresets(decks) {
    let appliedCount = 0;
    Object.keys(decks || {}).forEach(deckId => {
        const numericDeckId = parseInt(deckId, 10);
        if (!Number.isInteger(numericDeckId) || numericDeckId <= 0) return;

        const deck = normalizeDeck(decks[deckId]);
        if (isValidDeck(deck)) {
            DECK_PRESETS[numericDeckId] = deck;
            appliedCount++;
        }
    });
    syncDeckPresetOptions();
    return appliedCount;
}

function loadCachedWikiDecks() {
    try {
        const cached = JSON.parse(localStorage.getItem(WIKI_DECK_CACHE_KEY) || 'null');
        if (!cached || !cached.decks) return false;
        return applyDeckPresets(cached.decks) > 0;
    } catch (error) {
        console.warn("[Wiki] Failed to load deck cache:", error);
        return false;
    }
}

function saveWikiDeckCache(decks, source) {
    const payload = {
        version: 1,
        source,
        fetchedAt: new Date().toISOString(),
        decks
    };
    localStorage.setItem(WIKI_DECK_CACHE_KEY, JSON.stringify(payload));
}

// Reset hand state (between trials)
function resetHandState() {
    currentHand = [];
    isDoubled = false;
    doubledAtIndex = -1;
    stateHistory = []; // Clear undo history for new trial
    if (btnUndo) btnUndo.disabled = true;
    renderHand();
}

// Push current state onto history stack before making changes
function pushStateToHistory() {
    stateHistory.push({
        hand: [...currentHand],
        isDoubled: isDoubled,
        doubledAtIndex: doubledAtIndex,
        attempts: stateAttempts.value,
        freeAbandons: stateFreeAbandons.value,
        doubles: stateDoubles.value,
        reward: accumulatedSessionReward,
        bannerText: tableBanner.innerText,
        bannerColor: tableBanner.style.color
    });
    if (btnUndo) btnUndo.disabled = false;
}

// Undo the last action
function undoLastAction() {
    if (stateHistory.length === 0) {
        showToast("Không có hành động nào để quay lại!");
        return;
    }

    // Cancel any active auto-completion timeout
    if (trialCompletionTimer) {
        clearTimeout(trialCompletionTimer);
        trialCompletionTimer = null;
    }

    const previousState = stateHistory.pop();
    currentHand = previousState.hand;
    isDoubled = previousState.isDoubled;
    doubledAtIndex = previousState.doubledAtIndex !== undefined ? previousState.doubledAtIndex : -1;
    stateAttempts.value = previousState.attempts;
    stateFreeAbandons.value = previousState.freeAbandons;
    stateDoubles.value = previousState.doubles;
    accumulatedSessionReward = previousState.reward;
    tableBanner.innerText = previousState.bannerText;
    tableBanner.style.color = previousState.bannerColor;

    renderHand();
    updateUI();

    if (stateHistory.length === 0) {
        btnUndo.disabled = true;
    }
    showToast("Đã hoàn tác hành động!");
}

// Setup all event listeners
function setupEventListeners() {
    // Arena level changes
    levelSelect.addEventListener('change', () => {
        const level = parseInt(levelSelect.value);
        // Update doubles limits based on level
        stateDoubles.max = DOUBLE_LIMITS[level];
        stateDoubles.value = DOUBLE_LIMITS[level];
        updateSolverFromUI();
        resetHandState();
        updateUI();
        showToast("Đã cập nhật cấp Đấu trường!");
    });

// Legacy nested preset helper kept unused; event handlers use the global applyPreset.
function applyPresetLegacy(presetVal, showNotification = true) {
    if (presetVal !== 'custom') {
        const preset = DECK_PRESETS[presetVal];
        if (preset) {
            inputDeck1.value = preset[1];
            inputDeck2.value = preset[2];
            inputDeck3.value = preset[3];
            inputDeck4.value = preset[4];
            inputDeck5.value = preset[5];
            updateSolverFromUI();
            resetHandState();
            updateUI();
            if (showNotification) {
                showToast(`Đã áp dụng mẫu Bộ bài ${presetVal}!`);
            }
        }
    }
}

    // Preset dropdown changes
    deckPresetSelect.addEventListener('change', () => {
        applyPreset(deckPresetSelect.value, true);
    });

    // Individual card count input changes
    [inputDeck1, inputDeck2, inputDeck3, inputDeck4, inputDeck5].forEach(input => {
        input.addEventListener('change', () => {
            deckPresetSelect.value = 'custom';
            updateSolverFromUI();
            resetHandState();
            updateUI();
            showToast("Đã cập nhật bộ bài tự chọn!");
        });
    });

    // Reset Buttons
    btnResetDeck.addEventListener('click', () => {
        deckPresetSelect.value = '4'; // default is deck 4
        const preset = DECK_PRESETS['4'];
        inputDeck1.value = preset[1];
        inputDeck2.value = preset[2];
        inputDeck3.value = preset[3];
        inputDeck4.value = preset[4];
        inputDeck5.value = preset[5];
        updateSolverFromUI();
        resetHandState();
        updateUI();
        showToast("Đã khôi phục bộ bài mẫu 4!");
    });

    btnFetchWikiDeck.addEventListener('click', fetchDecksFromWikiCached);

    btnResetDay.addEventListener('click', () => {
        const level = parseInt(levelSelect.value);
        stateAttempts.value = 3;
        stateFreeAbandons.value = 3;
        stateDoubles.value = DOUBLE_LIMITS[level];
        accumulatedSessionReward = 0;
        resetHandState();
        updateUI();
        showToast("Đã reset ngày mới!");
    });

    // Inputs for daily state
    [stateAttempts, stateFreeAbandons, stateDoubles].forEach(input => {
        input.addEventListener('change', () => {
            updateUI();
        });
    });

    // Stepper buttons event delegation
    document.querySelectorAll('.stepper-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const action = btn.getAttribute('data-action');
            const input = document.getElementById(targetId);
            let val = parseInt(input.value) || 0;
            const min = parseInt(input.min) || 0;
            const max = parseInt(input.max) || 0;

            if (action === 'plus') {
                val = Math.min(max, val + 1);
            } else if (action === 'minus') {
                val = Math.max(min, val - 1);
            }

            input.value = val;
            // Dispatch change event to update the solver state
            input.dispatchEvent(new Event('change'));
        });
    });

    // Tab Navigation switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            
            // Activate button
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Activate content
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');
            
            showToast(`Chuyển sang: ${btn.innerText.trim()}`);
        });
    });

    // Modal click events
    btnClosePicker.addEventListener('click', closeCardPicker);
    
    // Clicking picker cards
    document.querySelectorAll('.picker-card-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const val = parseInt(btn.getAttribute('data-value'));
            selectCard(val);
        });
    });

    // Click outside modal content to close
    cardPickerModal.addEventListener('click', (e) => {
        if (e.target === cardPickerModal) {
            closeCardPicker();
        }
    });

    // Simulator Game Actions
    btnDraw.addEventListener('click', openCardPicker);
    btnDrawRandom.addEventListener('click', performDrawRandom);
    btnDouble.addEventListener('click', performDouble);
    btnStop.addEventListener('click', performStop);
    btnAbandon.addEventListener('click', performAbandon);
    btnUndo.addEventListener('click', undoLastAction);

    // Run Monte Carlo Simulation
    btnRunMC.addEventListener('click', runMonteCarloSimulation);

    // Keyboard Shortcuts (Hotkeys)
    window.addEventListener('keydown', (e) => {
        // Prevent key triggers when focusing input fields
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'SELECT' || activeEl.tagName === 'TEXTAREA')) {
            return;
        }

        const key = e.key.toLowerCase();

        // ESC key closes picker modal
        if (e.key === 'Escape') {
            if (cardPickerModal.classList.contains('show')) {
                closeCardPicker();
            }
            return;
        }

        // 1-5 keys to pick a card
        if (key >= '1' && key <= '5') {
            const val = parseInt(key);
            if (cardPickerModal.classList.contains('show')) {
                selectCard(val);
            } else {
                // Direct insert if possible
                const a = parseInt(stateAttempts.value);
                if (a > 0 && currentHand.length < 5) {
                    const remaining = solver.getRemainingDeck(currentHand);
                    if ((remaining[val] || 0) > 0) {
                        selectCard(val);
                    }
                }
            }
            return;
        }

        // Space triggers active recommendations or opens modal
        if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault(); // Prevent page scroll
            if (cardPickerModal.classList.contains('show')) return;

            const a = parseInt(stateAttempts.value);
            if (a <= 0 && currentHand.length === 0) return;

            const advice = solver.getBestAction(a, parseInt(stateFreeAbandons.value), parseInt(stateDoubles.value), currentHand, isDoubled);
            if (advice && advice.action !== 'None') {
                if (advice.action === 'Draw') {
                    openCardPicker();
                } else if (advice.action === 'Double') {
                    performDouble();
                } else if (advice.action === 'Stop') {
                    performStop();
                } else if (advice.action === 'Abandon') {
                    performAbandon();
                }
            } else if (a > 0 && currentHand.length === 0) {
                openCardPicker();
            }
            return;
        }

        // Gameplay buttons mapping
        if (key === 'd') {
            if (!btnDouble.disabled) performDouble();
        } else if (key === 's') {
            if (!btnStop.disabled) performStop();
        } else if (key === 'a') {
            if (!btnAbandon.disabled) performAbandon();
        } else if (key === 'x') {
            if (!btnDrawRandom.disabled) performDrawRandom();
        } else if (key === 'z' || e.key === 'Backspace') {
            if (!btnUndo.disabled) undoLastAction();
        } else if (key === 'r') {
            btnResetDay.click();
        }
    });
}

// Modal card picker functions
function openCardPicker() {
    const attempts = parseInt(stateAttempts.value);
    if (attempts <= 0) {
        showToast("Bạn đã hết lượt đấu nhận thưởng hàng ngày!");
        return;
    }
    if (currentHand.length >= 5) {
        showToast("Tay bài đã đầy 5 lá!");
        return;
    }
    
    updateModalPickerState();
    cardPickerModal.classList.add('show');
}

function performDrawRandom() {
    const attempts = parseInt(stateAttempts.value);
    if (attempts <= 0) {
        showToast("Bạn đã hết lượt đấu nhận thưởng hàng ngày!");
        return;
    }
    if (currentHand.length >= 5) {
        showToast("Tay bài đã đầy 5 lá!");
        return;
    }
    const card = solver.drawCard(currentHand);
    if (card === null) {
        showToast("Bộ bài đã cạn!");
        return;
    }
    selectCard(card);
    showToast(`Đã tự động bốc lá ${card} BP!`);
}

function closeCardPicker() {
    cardPickerModal.classList.remove('show');
}

// Update counts and disabled states in the Modal Grid
function updateModalPickerState() {
    const remaining = solver.getRemainingDeck(currentHand);
    const totalRemaining = Object.values(remaining).reduce((a, b) => a + b, 0);
    
    for (let v = 1; v <= 5; v++) {
        const btn = document.querySelector(`.picker-card-btn[data-value="${v}"]`);
        const infoSpan = document.getElementById(`picker-info-${v}`);
        const count = remaining[v] || 0;
        const initialCount = solver.deck[v] || 0;
        const prob = totalRemaining > 0 ? (count / totalRemaining) * 100 : 0;
        
        infoSpan.innerText = `Còn ${count}/${initialCount} lá\n(${prob.toFixed(1)}%)`;
        
        if (count <= 0) {
            btn.disabled = true;
        } else {
            btn.disabled = false;
        }
    }
}

// Selects the drawn card value manually
function selectCard(val) {
    const remaining = solver.getRemainingDeck(currentHand);
    if ((remaining[val] || 0) <= 0) {
        showToast(`Thẻ ${val} BP đã hết trong bộ bài!`);
        return;
    }

    pushStateToHistory();
    currentHand.push(val);
    renderHand();
    closeCardPicker();

    const { score, overflows } = solver.getHandScore(currentHand);

    // Verify game conditions
    if (currentHand.length === 5) {
        if (overflows > 0) {
            tableBanner.innerText = `Tay bài đã đủ 5 lá, đạt ${score} BP (Quá tải x${overflows}). Hãy chọn Dừng hoặc Bỏ bài.`;
            tableBanner.style.color = '#ff9800';
        } else {
            tableBanner.innerText = `Tay bài đã đủ 5 lá, đạt ${score} BP. Hãy chọn Dừng hoặc Bỏ bài.`;
            tableBanner.style.color = 'var(--text-secondary)';
        }
        updateUI();
    } else {
        if (overflows > 0) {
            tableBanner.innerText = `⚠️ QUÁ TẢI! Vừa vượt quá 10 BP (Quá tải x${overflows}). Điểm quay về ${score} BP.`;
            tableBanner.style.color = '#ff9800';
        } else {
            tableBanner.innerText = `Đang thi đấu... Đã bốc thẻ ${val} BP. Điểm tích lũy: ${score} BP.`;
            tableBanner.style.color = 'var(--text-secondary)';
        }
        updateUI();
    }
}

// Perform reward doubling
function performDouble() {
    const doubles = parseInt(stateDoubles.value);
    if (doubles <= 0 || isDoubled || currentHand.length < 1 || currentHand.length > 2) return;

    pushStateToHistory();
    stateDoubles.value = doubles - 1;
    isDoubled = true;
    doubledAtIndex = currentHand.length - 1;
    showToast("Kích hoạt nhân đôi thành công!");
    
    // Rerender last card to show multiplier
    renderHand();
    updateUI();
}

// Perform Stop and Battle
function performStop() {
    const attempts = parseInt(stateAttempts.value);
    const { score, overflows } = solver.getHandScore(currentHand);
    if (attempts <= 0 || currentHand.length === 0) return;

    pushStateToHistory();
    const reward = solver.rewards[score] || 0;
    const totalReward = reward * (isDoubled ? 2 : 1);
    accumulatedSessionReward += totalReward;

    if (overflows > 0) {
        tableBanner.innerText = `✓ DỪNG ĐẤU! Đạt ${score} BP (Quá tải x${overflows}). Thưởng nhận được: +${totalReward.toLocaleString()} Bills.`;
        tableBanner.style.color = 'var(--color-gold)';
    } else {
        tableBanner.innerText = `✓ DỪNG ĐẤU! Đạt ${score} BP. Thưởng nhận được: +${totalReward.toLocaleString()} Bills.`;
        tableBanner.style.color = 'var(--color-gold)';
    }

    disableControls();
    
    if (trialCompletionTimer) clearTimeout(trialCompletionTimer);
    trialCompletionTimer = setTimeout(() => {
        stateAttempts.value = Math.max(0, attempts - 1);
        resetHandState();
        updateUI();
        trialCompletionTimer = null;
    }, 2000);
}

// Perform Abandon
function performAbandon() {
    const attempts = parseInt(stateAttempts.value);
    const freeAbandons = parseInt(stateFreeAbandons.value);
    if (attempts <= 0 || currentHand.length === 0) return;

    pushStateToHistory();

    // Refund double if it was activated in this trial
    if (isDoubled) {
        const level = parseInt(levelSelect.value);
        const maxD = DOUBLE_LIMITS[level] || 0;
        stateDoubles.value = Math.min(maxD, (parseInt(stateDoubles.value) || 0) + 1);
        showToast("Đã hoàn lại lượt Nhân đôi do bỏ bài!");
    }

    if (freeAbandons > 0) {
        stateFreeAbandons.value = freeAbandons - 1;
        tableBanner.innerText = `✗ BỎ LƯỢT (Miễn phí)! Lượt đấu được hủy bỏ.`;
        tableBanner.style.color = '#f44336';
    } else {
        stateAttempts.value = Math.max(0, attempts - 1);
        tableBanner.innerText = `✗ BỎ LƯỢT (Tốn phí)! Mất 1 lượt đấu nhận thưởng hàng ngày.`;
        tableBanner.style.color = '#f44336';
    }

    disableControls();
    
    if (trialCompletionTimer) clearTimeout(trialCompletionTimer);
    trialCompletionTimer = setTimeout(() => {
        resetHandState();
        updateUI();
        trialCompletionTimer = null;
    }, 1800);
}

// Disable all gameplay controls during animation transition
function disableControls() {
    btnDraw.disabled = true;
    btnDrawRandom.disabled = true;
    btnDouble.disabled = true;
    btnStop.disabled = true;
    btnAbandon.disabled = true;
}

// Render cards on play table
function renderHand() {
    handContainer.innerHTML = '';
    
    currentHand.forEach((val, idx) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'card-wrapper';
        
        // Custom color classes for card designs
        const frontColorClass = `bp-${val}`;

        // Create card HTML structure
        wrapper.innerHTML = `
            <div class="dataplate-card">
                <div class="card-face card-back"></div>
                <div class="card-face card-front ${frontColorClass}">
                    <div class="card-header">
                        <span class="card-bp">${val}</span>
                        <span class="card-label">PLATE</span>
                    </div>
                    <div class="card-body">
                        <!-- Hexagonal grid representation of BP strength -->
                        <svg viewBox="0 0 24 24">
                            <path d="M12 2L2 22h20L12 2zM12 6.5L18.5 18H5.5L12 6.5z"/>
                        </svg>
                    </div>
                    <div class="card-footer">
                        <span class="card-index">#0${idx + 1}</span>
                        <span class="card-multiplier">${isDoubled && idx === doubledAtIndex ? 'x2' : ''}</span>
                    </div>
                </div>
            </div>
        `;
        
        handContainer.appendChild(wrapper);
        
        // Timeout for flipping animation
        setTimeout(() => {
            wrapper.classList.add('flipped');
        }, 50 * idx);
    });
}

// Core function to refresh calculations and UI components
function updateUI() {
    const a = parseInt(stateAttempts.value);
    const f = parseInt(stateFreeAbandons.value);
    const d = parseInt(stateDoubles.value);
    
    const { score, overflows } = solver.getHandScore(currentHand);

    // Update Stats
    if (overflows > 0) {
        statSum.innerHTML = `${score} <span style="color: #f44336; font-size: 0.85rem;">(Quá tải x${overflows})</span>`;
    } else {
        statSum.innerText = score;
    }
    
    statHandSize.innerText = `${currentHand.length} / 5`;
    
    // Update Reward representation
    const baseReward = solver.rewards[score] || 0;
    const curReward = baseReward * (isDoubled ? 2 : 1);
    statCurrentReward.innerText = `${curReward.toLocaleString()} Bills`;

    // Handle button disabled rules
    btnDraw.disabled = (a <= 0 || currentHand.length >= 5);
    btnDrawRandom.disabled = (a <= 0 || currentHand.length >= 5);
    btnDouble.disabled = (a <= 0 || currentHand.length < 1 || currentHand.length > 2 || isDoubled || d <= 0);
    btnStop.disabled = (a <= 0 || currentHand.length === 0);
    btnAbandon.disabled = (a <= 0 || currentHand.length === 0);
    btnUndo.disabled = (stateHistory.length === 0);

    // Adjust button double visual state
    if (isDoubled) {
        btnDouble.classList.add('active');
    } else {
        btnDouble.classList.remove('active');
    }

    if (a <= 0 && currentHand.length === 0) {
        tableBanner.innerText = `Bấm "Reset Ngày Mới" để bắt đầu ngày giả lập khác.`;
        tableBanner.style.color = 'var(--text-muted)';
    }

    // Update session earnings display
    if (sessionEarningsText) {
        sessionEarningsText.innerText = accumulatedSessionReward.toLocaleString();
    }
    if (sessionEarningsProgress) {
        const progressPct = Math.min(100, (accumulatedSessionReward / 480000) * 100);
        sessionEarningsProgress.style.width = `${progressPct}%`;
    }

    // Update remaining card counts in UI
    const remaining = solver.getRemainingDeck(currentHand);
    for (let v = 1; v <= 5; v++) {
        const countLabel = document.getElementById(`prob-count-${v}`);
        if (countLabel) {
            const count = remaining[v] || 0;
            const initialCount = solver.deck[v] || 0;
            countLabel.innerText = `${count}/${initialCount} lá`;
        }
    }

    // Call mathematical solver
    if (a > 0) {
        const advice = solver.getBestAction(a, f, d, currentHand, isDoubled);
        renderAdvice(advice, a, f, d);
    } else {
        // No attempts left
        renderAdvice({
            action: 'None',
            ev: accumulatedSessionReward,
            details: {
                evStop: null,
                evDraw: null,
                evAbandon: null,
                evDouble: null,
                drawProbs: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
                overflowProb: 0,
                totalRemaining: 0
            }
        });
    }
}

// Render dynamic mathematical advice
function renderAdvice(advice, a = 0, f = 0, d = 0) {
    const action = advice.action;
    const ev = advice.ev;
    const details = advice.details;

    // Reset suggestion styles
    suggestionBox.className = 'suggestion-box';
    
    if (action === 'None') {
        suggestionHeader.innerText = "Trạng thái";
        suggestionValue.innerText = "HẾT LƯỢT ĐẤU";
        suggestionReason.innerText = `Hôm nay bạn đã hoàn thành việc cày tiền. Tổng cộng thu hoạch: ${accumulatedSessionReward.toLocaleString()} Wuling Stock Bills.`;
        
        if (statReward) statReward.innerText = "-";
        evValDraw.innerText = "-";
        evValStop.innerText = "-";
        evValAbandon.innerText = "-";
        if (evValDouble) evValDouble.innerText = "-";
        if (evRowDouble) evRowDouble.style.display = 'none';
        
        resetProbBars();
        return;
    }

    // Calculate baseline S for Net EV
    const S = a > 0 ? solver.solve(a - 1, f, d, [], false) : 0;

    // Render EV values
    if (statReward) statReward.innerText = `${Math.round(ev).toLocaleString()} Bills`;
    evValDraw.innerText = (details.evDraw !== null && details.evDraw !== undefined) ? `${Math.round(details.evDraw - S).toLocaleString()} Bills` : "Không khả thi";
    evValStop.innerText = (details.evStop !== null && details.evStop !== undefined) ? `${Math.round(details.evStop - S).toLocaleString()} Bills` : "Không khả thi";
    evValAbandon.innerText = (details.evAbandon !== null && details.evAbandon !== undefined) ? `${Math.round(details.evAbandon - S).toLocaleString()} Bills` : "Không khả thi";

    // EV Double (x2)
    const isDoubleAvailable = (currentHand.length >= 1 && currentHand.length <= 2 && !isDoubled && d > 0);
    evValDouble.innerText = (isDoubleAvailable && details.evDouble !== null && details.evDouble !== undefined) 
        ? `${Math.round(details.evDouble - S).toLocaleString()} Bills` 
        : "Không khả thi";

    // Set row visual highlights
    document.getElementById('ev-row-draw').className = 'ev-row' + (action === 'Draw' ? ' best-action' : '');
    document.getElementById('ev-row-stop').className = 'ev-row' + (action === 'Stop' ? ' best-action stop-action' : '');
    document.getElementById('ev-row-abandon').className = 'ev-row' + (action === 'Abandon' ? ' best-action abandon-action' : '');
    document.getElementById('ev-row-double').className = 'ev-row' + (action === 'Double' ? ' best-action' : '');

    // Render suggestions text and box class
    if (action === 'Draw') {
        suggestionValue.innerText = "RÚT TIẾP (DRAW)";
        suggestionBox.classList.add('suggest-draw'); // uses default border

        let reason = `Thuật toán khuyên bạn nên <strong>BỐC BÀI</strong>. Kỳ vọng thu nhập của việc rút là <strong>${Math.round(details.evDraw - S).toLocaleString()} Bills</strong>`;
        if (details.evStop) {
            reason += `, cao hơn dừng lại (${Math.round(details.evStop - S).toLocaleString()} Bills)`;
        }
        if (details.evAbandon) {
            reason += ` và bỏ bài (${Math.round(details.evAbandon - S).toLocaleString()} Bills)`;
        }
        reason += `.`;
        suggestionReason.innerHTML = reason;

    } else if (action === 'Stop') {
        suggestionValue.innerText = "DỪNG LẠI (STOP)";
        suggestionBox.classList.add('suggest-stop');

        let reason = `Thuật toán khuyên bạn nên <strong>DỪNG LẠI</strong> in-game để chiến đấu. Kỳ vọng dừng là <strong>${Math.round(details.evStop - S).toLocaleString()} Bills</strong>`;
        if (details.evDraw) {
            reason += `, cao hơn tiếp tục rút (${Math.round(details.evDraw - S).toLocaleString()} Bills)`;
        }
        reason += `. Tránh mạo hiểm vì bạn đang ở điểm tối ưu.`;
        suggestionReason.innerHTML = reason;

    } else if (action === 'Abandon') {
        suggestionValue.innerText = "TỪ BỎ (ABANDON)";
        suggestionBox.classList.add('suggest-abandon');

        let reason = `Tay bài hiện tại có giá trị kỳ vọng quá thấp. Bạn nên chọn <strong>TỪ BỎ (ABANDON)</strong> in-game để reset bộ bài và chơi tay mới. EV của tay mới là <strong>${Math.round(details.evAbandon - S).toLocaleString()} Bills</strong>`;
        suggestionReason.innerHTML = reason;

    } else if (action === 'Double') {
        suggestionValue.innerText = "BẬT NHÂN ĐÔI (DOUBLE)";
        suggestionBox.classList.add('suggest-double');

        let reason = `Bạn nên kích hoạt <strong>NHÂN ĐÔI (DOUBLE)</strong> in-game trước khi làm hành động tiếp theo. Kỳ vọng EV khi nhân đôi tăng vọt lên <strong>${Math.round(details.evDouble - S).toLocaleString()} Bills</strong>.`;
        suggestionReason.innerHTML = reason;
    }

    // Render Probabilities
    if (details.drawProbs) {
        for (let v = 1; v <= 5; v++) {
            const prob = (details.drawProbs[v] || 0) * 100;
            const bar = document.getElementById(`prob-bar-${v}`);
            const valText = document.getElementById(`prob-val-${v}`);
            
            bar.style.width = `${prob}%`;
            valText.innerText = `${prob.toFixed(1)}%`;
        }

        const overflowProb = (details.overflowProb || 0) * 100;
        const barOverflow = document.getElementById('prob-bar-overflow');
        const valTextOverflow = document.getElementById('prob-val-overflow');
        barOverflow.style.width = `${overflowProb}%`;
        valTextOverflow.innerText = `${overflowProb.toFixed(1)}%`;
    } else {
        resetProbBars();
    }
}

// Resets probability bar visualizations to 0
function resetProbBars() {
    for (let v = 1; v <= 5; v++) {
        document.getElementById(`prob-bar-${v}`).style.width = "0%";
        document.getElementById(`prob-val-${v}`).innerText = "0.0%";
    }
    document.getElementById('prob-bar-overflow').style.width = "0%";
    document.getElementById('prob-val-overflow').innerText = "0.0%";
}

// Runs Monte Carlo Simulation for all 6 strategies
function runMonteCarloSimulation() {
    const days = parseInt(mcDaysInput.value) || 10000;
    
    // Show loading state
    mcResultsTbody.innerHTML = `
        <tr>
            <td colspan="6" style="text-align: center; color: var(--color-orange); padding: 3rem;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="loading-spin" style="animation: spin 1s linear infinite; vertical-align: middle; margin-right: 0.5rem;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path></svg>
                Đang chạy mô phỏng ${days.toLocaleString()} ngày cho 6 chiến thuật...
            </td>
        </tr>
    `;
    chartContainer.innerHTML = `<div class="chart-axis-label" style="left: 0; bottom: auto; top: -15px;">Doanh thu trung bình ngày (Bills)</div>`;

    // Spin animation class style helper
    if (!document.getElementById('loading-spin-style')) {
        const style = document.createElement('style');
        style.id = 'loading-spin-style';
        style.innerHTML = `@keyframes spin { 100% { transform: rotate(-360deg); } }`;
        document.head.appendChild(style);
    }

    // Run solver DP calculations in browser main thread, defer with setTimeout to prevent UI freeze
    setTimeout(() => {
        // Refresh solver cache first
        solver.resetCache();
        
        // Prefill memo cache by solving root state
        const maxDoubles = DOUBLE_LIMITS[solver.level] || 0;
        solver.solve(3, 3, maxDoubles, [], false);

        // Retrieve deck values for unique cache key
        const d1 = parseInt(inputDeck1.value) || 0;
        const d2 = parseInt(inputDeck2.value) || 0;
        const d3 = parseInt(inputDeck3.value) || 0;
        const d4 = parseInt(inputDeck4.value) || 0;
        const d5 = parseInt(inputDeck5.value) || 0;
        const deckKey = `${d1},${d2},${d3},${d4},${d5}`;
        const level = parseInt(levelSelect.value);

        // Run simulations
        const strategies = [
            { key: 'optimal', name: 'Chiến thuật Tối ưu (DP)', desc: 'Quyết định hoàn hảo dựa trên toán học (EV ~640k). Đưa ra hành động tối ưu động sau mỗi lá bài rút dựa trên bộ bài còn lại.' },
            { key: 'reddit_improved_621k', name: 'Reddit Cải tiến (621k)', desc: 'Bản nâng cấp tối ưu số lá bài: Dừng ở 10 khi còn Reroll (nhưng ở 4 lá thì 9 cũng dừng). Dừng ở 9 khi hết Reroll (nhưng ở 4 lá thì 8 cũng dừng).' },
            { key: 'reddit_simple_618k', name: 'Reddit Simple (618k)', desc: 'Bản gốc Reddit: Dừng ở 10 khi còn Reroll. Dừng ở 9 hoặc 10 khi hết Reroll (không phân biệt số lượng lá bài đang cầm).' },
            { key: 'simple_max_8', name: 'Simple Max 8 (605k)', desc: 'Luôn dừng khi điểm >= 9 (Rút khi <= 8), bất kể còn Reroll hay không.' },
            { key: 'no_rerolls', name: 'Không Bỏ Bài (Baseline)', desc: 'Chạy tối ưu toán học DP nhưng khóa hoàn toàn tính năng Bỏ bài (Reroll = 0).' },
            { key: 'no_doubles', name: 'Không Nhân Đôi (Baseline)', desc: 'Chạy tối ưu toán học DP nhưng khóa hoàn toàn tính năng Nhân đôi (Double = 0).' }
        ];

        const results = {};
        let loadedFromCacheCount = 0;

        strategies.forEach(strat => {
            const cacheKey = `mc_cache_lvl${level}_deck[${deckKey}]_days${days}_strat${strat.key}`;
            const cachedData = localStorage.getItem(cacheKey);

            if (cachedData) {
                try {
                    results[strat.key] = JSON.parse(cachedData);
                    loadedFromCacheCount++;
                } catch (e) {
                    console.error("Lỗi parse cache local:", e);
                    results[strat.key] = solver.runMonteCarlo(days, strat.key);
                    localStorage.setItem(cacheKey, JSON.stringify(results[strat.key]));
                }
            } else {
                results[strat.key] = solver.runMonteCarlo(days, strat.key);
                localStorage.setItem(cacheKey, JSON.stringify(results[strat.key]));
            }
        });

        if (loadedFromCacheCount === strategies.length) {
            showToast("Đã tải kết quả giả lập từ bộ nhớ đệm (Cache)!");
        } else if (loadedFromCacheCount > 0) {
            showToast(`Đã tải ${loadedFromCacheCount} kết quả từ bộ nhớ đệm!`);
        } else {
            showToast("Đã hoàn thành giả lập Monte Carlo mới!");
        }

        // Render Results Table
        mcResultsTbody.innerHTML = '';
        const optimalAvg = results['optimal'].avgEarnings;

        strategies.forEach(strat => {
            const res = results[strat.key];
            const tr = document.createElement('tr');
            
            const efficiency = (res.avgEarnings / optimalAvg) * 100;
            
            // Highlight optimal or highlight based on class
            let avgClass = 'strategy-val';
            if (strat.key === 'optimal') {
                avgClass += ' highlight-val';
            } else if (strat.key.startsWith('no_')) {
                avgClass += ' baseline-val';
            }

            // Resolve min and max daily earnings (including fallback for older cache data)
            let minEarnings = res.minEarnings;
            let maxEarnings = res.maxEarnings;
            if (minEarnings === undefined || maxEarnings === undefined) {
                if (res.rawList && res.rawList.length > 0) {
                    minEarnings = res.rawList.reduce((min, val) => val < min ? val : min, Infinity);
                    maxEarnings = res.rawList.reduce((max, val) => val > max ? val : max, -Infinity);
                } else {
                    minEarnings = 0;
                    maxEarnings = 0;
                }
            }

            tr.innerHTML = `
                <td class="has-tooltip" data-tooltip="${strat.desc}">
                    <span class="strategy-name">${strat.name}</span>
                </td>
                <td><span class="${avgClass}">${Math.round(res.avgEarnings).toLocaleString()}</span></td>
                <td><span style="font-weight: 600; color: ${efficiency >= 95 ? 'var(--color-blue)' : 'var(--text-secondary)'}">${efficiency.toFixed(1)}%</span></td>
                <td style="color: var(--text-secondary); font-size: 0.8rem;">±${Math.round(res.stdDev).toLocaleString()}</td>
                <td style="color: var(--text-secondary); font-family: var(--font-tech);">${Math.round(minEarnings).toLocaleString()}</td>
                <td style="color: var(--text-secondary); font-family: var(--font-tech);">${Math.round(maxEarnings).toLocaleString()}</td>
                <td>${res.totalOverflows.toFixed(2)}</td>
                <td>${res.totalAbandons.toFixed(2)}</td>
            `;
            mcResultsTbody.appendChild(tr);
        });

        // Draw Chart
        renderChart(results, strategies);
        showToast("Đã hoàn thành giả lập Monte Carlo!");
    }, 100);
}

// Renders the visual bar chart comparison of Monte Carlo simulation results
function renderChart(results, strategies) {
    chartContainer.innerHTML = `<div class="chart-axis-label" style="left: 0; bottom: auto; top: -15px;">Doanh thu trung bình ngày (Bills)</div>`;
    
    // Find max earning to scale height
    let maxEarnings = 0;
    strategies.forEach(strat => {
        if (results[strat.key].avgEarnings > maxEarnings) {
            maxEarnings = results[strat.key].avgEarnings;
        }
    });

    // Draw bars
    strategies.forEach(strat => {
        const val = results[strat.key].avgEarnings;
        const heightPercent = maxEarnings > 0 ? (val / maxEarnings) * 90 : 0; // Scale to max 90% of container height

        const barWrapper = document.createElement('div');
        barWrapper.className = 'chart-bar-wrapper';

        let barClass = 'chart-bar';
        if (strat.key === 'optimal') {
            barClass += ' optimal-bar';
        } else if (strat.key.startsWith('no_')) {
            barClass += ' baseline';
        }

        const abbreviateValue = Math.round(val).toLocaleString();

        barWrapper.innerHTML = `
            <div class="${barClass}" style="height: ${heightPercent}%;" data-value="${abbreviateValue}"></div>
            <div class="chart-label" title="${strat.name}">${strat.name.split(' ')[0]}</div>
        `;

        chartContainer.appendChild(barWrapper);
    });
}

// Toast manager helper
let toastTimeoutId = null;
function showToast(message, duration = 3000) {
    if (toastTimeoutId) {
        clearTimeout(toastTimeoutId);
        toastTimeoutId = null;
    }
    toastMessage.innerText = message;
    toastMessage.classList.add('show');
    
    if (duration > 0) {
        toastTimeoutId = setTimeout(() => {
            toastMessage.classList.remove('show');
            toastTimeoutId = null;
        }, duration);
    }
}

// Fetch deck presets dynamically from the game wiki via a fallback proxy mechanism
async function fetchDecksFromWikiLegacy() {
    // MediaWiki parse API — returns JSON with HTML content of the page
    const apiUrl = 'https://endfield.wiki.gg/api.php?action=parse&page=Trial_of_Swordmancy&format=json&origin=*';
    
    btnFetchWikiDeck.disabled = true;
    showToast("Đang tải danh sách bộ bài từ Wiki...", 0);
    
    let html = null;
    
    // Helper: extract HTML fragment from MediaWiki JSON response
    function extractHtml(data) {
        if (data && data.parse && data.parse.text && data.parse.text['*']) {
            return data.parse.text['*'];
        }
        return null;
    }
    
    // --- Strategy 1: Direct fetch (works if wiki.gg honors CORS via origin=*) ---
    try {
        console.log("[Wiki] Trying direct API fetch...");
        const res = await fetch(apiUrl);
        console.log("[Wiki] Direct response status:", res.status);
        if (res.ok) {
            const data = await res.json();
            html = extractHtml(data);
            if (html) console.log("[Wiki] Direct fetch OK, HTML length:", html.length);
            else console.warn("[Wiki] Direct fetch: JSON OK but missing parse.text['*']", JSON.stringify(data).substring(0, 300));
        }
    } catch (e) {
        console.warn("[Wiki] Direct fetch failed:", e.message);
    }
    
    // --- Strategy 2: Proxy the API URL (server→API, bypasses Cloudflare browser challenge) ---
    // corsproxy.io returns the raw response content
    if (!html) {
        try {
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(apiUrl)}`;
            console.log("[Wiki] Trying corsproxy.io...");
            const res = await fetch(proxyUrl);
            console.log("[Wiki] corsproxy.io status:", res.status);
            if (res.ok) {
                const text = await res.text();
                console.log("[Wiki] corsproxy.io response length:", text.length, "preview:", text.substring(0, 100));
                const data = JSON.parse(text);
                html = extractHtml(data);
                if (html) console.log("[Wiki] corsproxy.io OK, HTML length:", html.length);
                else console.warn("[Wiki] corsproxy.io: JSON OK but missing parse.text['*']");
            }
        } catch (e) {
            console.warn("[Wiki] corsproxy.io failed:", e.message);
        }
    }
    
    // --- Strategy 3: allorigins.win wraps response in { status, contents } ---
    if (!html) {
        try {
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(apiUrl)}`;
            console.log("[Wiki] Trying allorigins.win...");
            const res = await fetch(proxyUrl);
            console.log("[Wiki] allorigins status:", res.status);
            if (res.ok) {
                const wrapper = await res.json();
                console.log("[Wiki] allorigins wrapper keys:", Object.keys(wrapper), "contents length:", wrapper.contents ? wrapper.contents.length : 0);
                // allorigins wraps the response in { status: {...}, contents: "<raw response>" }
                const data = JSON.parse(wrapper.contents);
                html = extractHtml(data);
                if (html) console.log("[Wiki] allorigins OK, HTML length:", html.length);
                else console.warn("[Wiki] allorigins: JSON OK but missing parse.text['*']");
            }
        } catch (e) {
            console.warn("[Wiki] allorigins failed:", e.message);
        }
    }
    
    if (!html) {
        showToast("Tải bài từ Wiki thất bại. Vui lòng kiểm tra kết nối!", 3000);
        btnFetchWikiDeck.disabled = false;
        return;
    }
    
    try {
        // Parse HTML fragment from MediaWiki API
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        const tables = doc.querySelectorAll('table.wikitable');
        console.log("[Wiki] Tables found:", tables.length);
        let parsedCount = 0;
        
        tables.forEach((table, tableIdx) => {
            const caption = table.querySelector('caption');
            if (!caption) return;
            
            const captionText = caption.textContent.trim();
            const match = captionText.match(/Dataplate deck\s+(\d+)/i);
            if (!match) {
                console.log(`[Wiki] Table ${tableIdx}: caption="${captionText}" - no match`);
                return;
            }
            
            const deckId = parseInt(match[1]);
            if (deckId < 1 || deckId > 7) return;
            
            console.log(`[Wiki] Processing Deck ${deckId}...`);
            const parsedDeck = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
            
            // Find header row to detect column positions
            let bpColIdx = -1, countColIdx = -1;
            const headerRow = table.querySelector('tr');
            if (headerRow) {
                const headers = headerRow.querySelectorAll('th');
                headers.forEach((th, idx) => {
                    const text = th.textContent.toLowerCase().trim();
                    if (text.includes('battle') || text.includes('bp') || text.includes('point')) {
                        bpColIdx = idx;
                    }
                    if (text.includes('dataplate') || text.includes('quantity') || text.includes('count') || text.includes('deck')) {
                        countColIdx = idx;
                    }
                });
                console.log(`[Wiki] Deck ${deckId} - Header detected: BP column=${bpColIdx}, Count column=${countColIdx}`);
            }
            
            // If column detection failed, use defaults
            if (bpColIdx === -1) bpColIdx = 1;
            if (countColIdx === -1) countColIdx = 2;
            
            let rowCount = 0;
            table.querySelectorAll('tr').forEach((row, rowIdx) => {
                if (row.querySelector('th')) return; // skip header rows
                const cells = row.querySelectorAll('td');
                if (cells.length <= Math.max(bpColIdx, countColIdx)) return;
                
                const bpText = cells[bpColIdx]?.textContent.trim() || '';
                const countText = cells[countColIdx]?.textContent.trim() || '';
                
                const bp = parseInt(bpText);
                const count = parseInt(countText.replace(/[^0-9]/g, ''));
                
                if (bp >= 1 && bp <= 5 && !isNaN(count) && count > 0) {
                    parsedDeck[bp] += count;
                    rowCount++;
                    console.log(`[Wiki] Deck ${deckId} Row ${rowIdx}: BP=${bp}, Count=${count}`);
                }
            });
            
            const totalCards = Object.values(parsedDeck).reduce((a, b) => a + b, 0);
            if (totalCards > 0) {
                DECK_PRESETS[deckId] = parsedDeck;
                console.log(`[Wiki] Deck ${deckId} parsed: ${JSON.stringify(parsedDeck)} (${totalCards} cards, ${rowCount} rows)`);
                parsedCount++;
            } else {
                console.warn(`[Wiki] Deck ${deckId}: parsedDeck empty (0 total cards)`);
            }
        });
        
        if (parsedCount > 0) {
            const presetVal = deckPresetSelect.value;
            if (presetVal !== 'custom') {
                // Refresh current preset to reflect wiki updates
                setTimeout(() => applyPreset(presetVal, false), 0);
            }
            showToast(`✅ Đã tải ${parsedCount} bộ bài từ Wiki!`, 3000);
        } else {
            console.error("[Wiki] parsedCount = 0. HTML snippet:", html.substring(0, 500));
            throw new Error("Không tìm thấy bảng bộ bài nào hợp lệ.");
        }
    } catch (error) {
        console.error("[Wiki] Parse error:", error);
        showToast("Lỗi xử lý dữ liệu từ Wiki!", 3000);
    } finally {
        btnFetchWikiDeck.disabled = false;
    }
}

function parseDecksFromMarkdown(markdown) {
    const decks = {};
    const deckRegex = /Dataplate deck\s+(\d+)\s*\n([\s\S]*?)(?=\nDataplate deck\s+\d+\s*\n|\n##\s+|$)/gi;
    let match;

    while ((match = deckRegex.exec(markdown)) !== null) {
        const deckId = parseInt(match[1], 10);
        if (deckId < 1) continue;

        const deck = normalizeDeck({});
        const lines = match[2].split('\n');

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('|')) continue;
            if (/^\|\s*-+/.test(trimmed) || /Battle Points/i.test(trimmed)) continue;

            const cells = trimmed.split('|').slice(1, -1).map(cell => cell.trim());
            if (cells.length < 3) continue;

            const bp = parseInt(cells[1].replace(/[^0-9]/g, ''), 10);
            const count = parseInt(cells[2].replace(/[^0-9]/g, ''), 10);
            if (bp >= 1 && bp <= 5 && count > 0) {
                deck[bp] += count;
            }
        }

        if (isValidDeck(deck)) {
            decks[deckId] = deck;
        }
    }

    return decks;
}

function parseDecksFromHtml(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const decks = {};

    doc.querySelectorAll('table').forEach(table => {
        const captionText = table.querySelector('caption')?.textContent.trim() || '';
        const captionMatch = captionText.match(/Dataplate deck\s+(\d+)/i);
        if (!captionMatch) return;

        const deckId = parseInt(captionMatch[1], 10);
        if (deckId < 1) return;

        const headers = [...table.querySelectorAll('tr:first-child th, tr:first-child td')]
            .map(cell => cell.textContent.toLowerCase().trim());
        let bpColIdx = headers.findIndex(text => text.includes('battle') || text.includes('bp') || text.includes('point'));
        let countColIdx = headers.findIndex(text => text.includes('dataplate') || text.includes('quantity') || text.includes('count') || text.includes('deck'));
        if (bpColIdx === -1) bpColIdx = 1;
        if (countColIdx === -1) countColIdx = 2;

        const deck = normalizeDeck({});
        table.querySelectorAll('tr').forEach(row => {
            if (row.querySelector('th')) return;
            const cells = row.querySelectorAll('td');
            if (cells.length <= Math.max(bpColIdx, countColIdx)) return;

            const bp = parseInt(cells[bpColIdx].textContent.replace(/[^0-9]/g, ''), 10);
            const count = parseInt(cells[countColIdx].textContent.replace(/[^0-9]/g, ''), 10);
            if (bp >= 1 && bp <= 5 && count > 0) {
                deck[bp] += count;
            }
        });

        if (isValidDeck(deck)) {
            decks[deckId] = deck;
        }
    });

    return decks;
}

function parseDecksFromWikiText(text) {
    const trimmed = text.trim();

    try {
        const data = JSON.parse(trimmed);
        const html = data?.parse?.text?.['*'] || (data?.contents ? JSON.parse(data.contents)?.parse?.text?.['*'] : null);
        if (html) {
            return parseDecksFromHtml(html);
        }
    } catch (error) {
        // Not JSON; continue with text parsers.
    }

    const markdownDecks = parseDecksFromMarkdown(text);
    if (Object.keys(markdownDecks).length > 0) {
        return markdownDecks;
    }

    return parseDecksFromHtml(text);
}

async function fetchTextWithTimeout(url, timeoutMs = 15000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal });
        const text = await response.text();
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return text;
    } finally {
        clearTimeout(timeoutId);
    }
}

// New wiki loader. Overrides the legacy implementation above.
async function fetchDecksFromWikiCached() {
    const apiUrl = 'https://endfield.wiki.gg/api.php?action=parse&page=Trial_of_Swordmancy&format=json&origin=*';
    const pageUrl = 'endfield.wiki.gg/wiki/Trial_of_Swordmancy';
    const sources = [
        { name: 'wiki.gg API', url: apiUrl },
        { name: 'Jina wiki mirror', url: `https://r.jina.ai/http://${pageUrl}` },
        { name: 'AllOrigins API', url: `https://api.allorigins.win/get?url=${encodeURIComponent(apiUrl)}` }
    ];

    btnFetchWikiDeck.disabled = true;
    showToast("Đang tải danh sách bộ bài từ Wiki...", 0);

    try {
        let lastError = null;

        for (const source of sources) {
            try {
                console.log(`[Wiki] Trying ${source.name}...`);
                const text = await fetchTextWithTimeout(source.url);
                const decks = parseDecksFromWikiText(text);
                const parsedCount = applyDeckPresets(decks);

                if (parsedCount > 0) {
                    saveWikiDeckCache(decks, source.name);
                    if (deckPresetSelect.value !== 'custom') {
                        applyPreset(deckPresetSelect.value, false);
                    }
                    showToast(`Đã tải và lưu cache ${parsedCount} bộ bài từ Wiki!`, 3000);
                    return;
                }

                throw new Error('No valid deck tables found');
            } catch (error) {
                lastError = error;
                console.warn(`[Wiki] ${source.name} failed:`, error);
            }
        }

        if (loadCachedWikiDecks()) {
            if (deckPresetSelect.value !== 'custom') {
                applyPreset(deckPresetSelect.value, false);
            }
            showToast("Wiki đang lỗi, đã dùng dữ liệu cache local.", 3000);
            return;
        }

        throw lastError || new Error('All wiki sources failed');
    } catch (error) {
        console.error("[Wiki] Fetch failed:", error);
        showToast("Tải Wiki thất bại. Đang giữ bộ bài hiện tại.", 3000);
    } finally {
        btnFetchWikiDeck.disabled = false;
    }
}

// Start Application on load
window.addEventListener('DOMContentLoaded', init);
