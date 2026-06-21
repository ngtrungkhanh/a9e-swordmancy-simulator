const { app, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// Import OCR logic, Solver and Configuration
const { scanFullState } = require('../electron/ocr.js');
const { getActiveConfig } = require('../electron/config.js');
const { SwordmancySolver } = require('../solver.js');


app.whenReady().then(() => {
    console.log('--- STARTING OCR TEMPLATE MATCHING & AUTO-SCALING TEST ---');
    const projectDir = path.join(__dirname, '..');
    
    const testCases = [
        { file: '1.png', expected: [null, null, null, null, null], expectedAttempts: 3, expectedDoubles: 2, expectedFreeTrial: false },
        { file: '2.png', expected: [1, 3, null, null, null], expectedAttempts: 2, expectedDoubles: 2, expectedFreeTrial: false },
        { file: '3.png', expected: [1, 3, 2, 5, 1], expectedAttempts: 2, expectedDoubles: 2, expectedFreeTrial: false },
        { file: '4.png', expected: [null, null, null, null, null], expectedAttempts: 1, expectedDoubles: 2, expectedFreeTrial: true },
        { file: '5.png', expected: [1, 1, 3, 4, 3], expectedAttempts: 2, expectedDoubles: 2, expectedFreeTrial: false },
        { file: '6.png', expected: [3, 4, null, null, null], expectedAttempts: 2, expectedDoubles: 2, expectedFreeTrial: false }
    ];

    let totalFailed = 0;

    testCases.forEach(testCase => {
        const imgName = testCase.file;
        const imgPath = path.join(projectDir, 'Screenshoot', imgName);
        console.log(`\n=================== ANALYZING: ${imgName} ===================`);
        
        const img = nativeImage.createFromPath(imgPath);
        if (img.isEmpty()) {
            console.error(`Failed to load ${imgName}`);
            totalFailed++;
            return;
        }

        const size = img.getSize();
        console.log(`Resolution: ${size.width}x${size.height}`);
        
        // Retrieve config using screen size to trigger dynamic auto-scaling
        const activeConfig = getActiveConfig(size.width, size.height);
        console.log(`Active config target dimensions: ${activeConfig.width}x${activeConfig.height}`);
        
        const bitmap = img.toBitmap(); // RGBA buffer
        
        const imageSource = {
            getCrop: (x, y, w, h) => {
                const cropPixels = new Uint8Array(w * h * 4);
                for (let cy = 0; cy < h; cy++) {
                    for (let cx = 0; cx < w; cx++) {
                        const srcIdx = ((y + cy) * size.width + (x + cx)) * 4;
                        const destIdx = (cy * w + cx) * 4;
                        cropPixels[destIdx] = bitmap[srcIdx];
                        cropPixels[destIdx+1] = bitmap[srcIdx+1];
                        cropPixels[destIdx+2] = bitmap[srcIdx+2];
                        cropPixels[destIdx+3] = bitmap[srcIdx+3];
                    }
                }
                return cropPixels;
            }
        };

        const state = scanFullState(imageSource, activeConfig);

        const solveAttempts = state.attemptsLeft;
        const solveAbandons = 3;
        const solveDoubles = state.doublesLeft;
        const remainingDeck = state.remainingDeck;
        const isDoubled = state.isDoubled;
        const isFreeTrial = state.isFreeTrial;
        const isDoubleSwitchPresent = state.isDoubleSwitchPresent;
        const isBracketPresent = state.isBracketPresent;
        const scannedSlots = state.scannedSlots;

        console.log(`Double switch active: ${isDoubled}`);
        console.log(`Double switch capsule present: ${isDoubleSwitchPresent}`);
        console.log(`Bracket present: ${isBracketPresent}`);
        console.log(`Mode detected: ${isFreeTrial ? 'FREE TRIAL' : 'REWARDED'}`);
        console.log(`Scanned Attempts remaining: ${solveAttempts}`);
        console.log(`Scanned Doubles remaining: ${solveDoubles}`);
        console.log(`Scanned Slots Raw: [${scannedSlots.join(', ')}]`);
        console.log(`Scanned Deck: [${Object.values(remainingDeck).join(', ')}]`);

        // Build solver deck
        const hand = scannedSlots.filter(v => v !== null);
        const handCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        hand.forEach(v => handCounts[v]++);
        const solverDeck = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        for (let bp = 1; bp <= 5; bp++) {
            solverDeck[bp] = (remainingDeck[bp] || 0) + (handCounts[bp] || 0);
        }

        console.log('--- Running Solver for this scanned state ---');
        const effectiveAttempts = isFreeTrial ? 3 : (solveAttempts || 3);
        const effectiveAbandons = isFreeTrial ? 3 : solveAbandons;
        const effectiveDoubles = isFreeTrial ? 2 : solveDoubles;
        const effectiveIsDoubled = isFreeTrial ? false : isDoubled;

        const solver = new SwordmancySolver(solverDeck, 4);
        const advice = solver.getBestAction(effectiveAttempts, effectiveAbandons, effectiveDoubles, hand, effectiveIsDoubled);
        console.log(`Advice Action: ${advice.action}, EV: ${advice.ev.toFixed(1)}`);
        console.log(`EV Stop: ${advice.details.evStop !== null ? advice.details.evStop.toFixed(1) : 'null'}`);
        console.log(`EV Draw: ${advice.details.evDraw !== null ? advice.details.evDraw.toFixed(1) : 'null'}`);
        console.log(`EV Abandon: ${advice.details.evAbandon !== null ? advice.details.evAbandon.toFixed(1) : 'null'}`);
        const sum = hand.reduce((acc, val) => acc + val, 0);
        const label = sum < 10 ? '>10' : '>21';
        console.log(`Overflow Prob (${label}): ${(advice.details.overflowProb * 100).toFixed(1)}%`);
        console.log(`Prob 10 (overall): ${(advice.details.prob10 * 100).toFixed(1)}%`);
        console.log(`Prob 9-10 (overall): ${(advice.details.prob9Plus * 100).toFixed(1)}%`);




        // Verify result
        const expectedStr = JSON.stringify(testCase.expected);
        const actualStr = JSON.stringify(scannedSlots);
        
        let isPass = (expectedStr === actualStr) &&
                     (isFreeTrial === testCase.expectedFreeTrial);
        
        if (!isFreeTrial) {
            isPass = isPass && (solveAttempts === testCase.expectedAttempts);
            // Xác nhận chéo thêm số lượt Doubles nếu double switch hiển thị
            if (isDoubleSwitchPresent) {
                isPass = isPass && (solveDoubles === testCase.expectedDoubles);
            }
        }
        
        console.log(`Expected Hand: ${expectedStr}, Mode: ${testCase.expectedFreeTrial ? 'FREE' : 'REWARDED'}, Attempts: ${testCase.expectedAttempts}`);
        console.log(`Actual Hand:   ${actualStr}, Mode: ${isFreeTrial ? 'FREE' : 'REWARDED'}, Attempts: ${solveAttempts}`);
        
        if (isPass) {
            console.log(`RESULT: PASS`);
        } else {
            console.log(`RESULT: FAIL (mismatch)`);
            totalFailed++;
        }
    });

    console.log(`\n=================== TEST RUNNER SUMMARY ===================`);
    console.log(`Total test cases: ${testCases.length}`);
    console.log(`Failed test cases: ${totalFailed}`);
    
    if (totalFailed > 0) {
        console.log('--- TEST FAILED ---');
        app.exit(1);
    } else {
        console.log('--- TEST PASSED ---');
        app.exit(0);
    }
});
