const { app, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// Import OCR logic, Solver and Configuration
const { classifyCardDigitFromCrop } = require('../electron/ocr.js');
const { getActiveConfig } = require('../electron/config.js');
const { SwordmancySolver } = require('../solver.js');

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

function isFaceCardSlot(bitmap, size, cardPos, activeConfig) {
    const rel = activeConfig.cardFaceStripRelative || { xOffset: 0, yOffset: 10, width: 300, height: 50 };
    const stripX = cardPos.x + rel.xOffset;
    const stripY = cardPos.y + rel.yOffset;
    const stripW = rel.width;
    const stripH = rel.height;
    let stripPixels = 0;

    for (let cy = 0; cy < stripH; cy++) {
        for (let cx = 0; cx < stripW; cx++) {
            const idx = ((stripY + cy) * size.width + (stripX + cx)) * 4;
            const val = (bitmap[idx] + bitmap[idx + 1] + bitmap[idx + 2]) / 3;
            if (val < 85) {
                stripPixels++;
            }
        }
    }

    const minStripPixels = Math.max(10, Math.round(stripW * stripH * 0.00533));
    return { isFace: stripPixels > minStripPixels, stripPixels };
}

app.whenReady().then(() => {
    console.log('--- STARTING OCR TEMPLATE MATCHING & AUTO-SCALING TEST ---');
    const projectDir = path.join(__dirname, '..');
    
    const testCases = [
        { file: '1.png', expected: [null, null, null, null, null] },
        { file: '2.png', expected: [1, 3, null, null, null] },
        { file: '3.png', expected: [1, 3, 2, 5, 1] },
        { file: '4.png', expected: [null, null, null, null, null] }
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
        let solveAttempts = 3;
        let solveAbandons = 3;
        let solveDoubles = 2;
        const remainingDeck = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };


        // Scan double switch presence
        console.log('--- Double active switch & capsule test ---');
        let whitePixels = 0;
        const dsConfig = activeConfig.doubleSwitch;
        for (let cy = 0; cy < dsConfig.height; cy++) {
            for (let cx = 0; cx < dsConfig.width; cx++) {
                const pixelIdx = ((dsConfig.y + cy) * size.width + (dsConfig.x + cx)) * 4;
                const r = bitmap[pixelIdx];
                const g = bitmap[pixelIdx + 1];
                const b = bitmap[pixelIdx + 2];
                if (r > 220 && g > 220 && b > 220) {
                    whitePixels++;
                }
            }
        }
        const isDoubled = whitePixels > Math.max(20, Math.round(dsConfig.width * dsConfig.height * 0.026));

        // Scan capsule text presence
        const capConfig = activeConfig.doubleSwitchCapsule;
        let darkCap = 0;
        for (let cy = 0; cy < capConfig.height; cy++) {
            for (let cx = 0; cx < capConfig.width; cx++) {
                const idx = ((capConfig.y + cy) * size.width + (capConfig.x + cx)) * 4;
                const val = (bitmap[idx] + bitmap[idx+1] + bitmap[idx+2]) / 3;
                if (val < 110) darkCap++;
            }
        }
        const isDoubleSwitchPresent = darkCap > Math.max(10, Math.round(capConfig.width * capConfig.height * 0.0083));

        // Scan brackets presence
        const brConfig = activeConfig.bracket;
        let darkBr = 0;
        for (let cy = 0; cy < brConfig.height; cy++) {
            for (let cx = 0; cx < brConfig.width; cx++) {
                const idx = ((brConfig.y + cy) * size.width + (brConfig.x + cx)) * 4;
                const val = (bitmap[idx] + bitmap[idx+1] + bitmap[idx+2]) / 3;
                if (val < 110) darkBr++;
            }
        }
        const isBracketPresent = darkBr > Math.max(5, Math.round(brConfig.width * brConfig.height * 0.074));
        const hasDouble = isDoubleSwitchPresent || isDoubled;
        const isFreeTrial = !hasDouble || !isBracketPresent;

        console.log(`Double switch active: ${isDoubled} (${whitePixels} white px)`);
        console.log(`Double switch capsule present: ${isDoubleSwitchPresent} (${darkCap} dark px)`);
        console.log(`Bracket present: ${isBracketPresent} (${darkBr} dark px)`);
        console.log(`Mode detected: ${isFreeTrial ? 'FREE TRIAL' : 'REWARDED'}`);

        // Scan attempts digit if present
        if (!isFreeTrial) {
            console.log('--- Attempts and Doubles OCR test ---');
            
            function testScanDigit(xStart, yStart, xEnd, yEnd) {
                const w = xEnd - xStart;
                const h = yEnd - yStart;
                let visited = Array(w * h).fill(false);
                let digitCluster = null;

                function isDark(cx, cy) {
                    const idx = ((yStart + cy) * size.width + (xStart + cx)) * 4;
                    const val = (bitmap[idx] + bitmap[idx+1] + bitmap[idx+2]) / 3;
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
                
                // Classify header digit
                if (cw < 6) return 1;
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

            const attReg = activeConfig.attemptsRegion;
            const attemptsVal = testScanDigit(attReg.xStart, attReg.yStart, attReg.xEnd, attReg.yEnd);
            console.log(`Scanned Attempts remaining: ${attemptsVal}`);
            if (attemptsVal !== null) solveAttempts = attemptsVal;

            if (isDoubleSwitchPresent) {
                const dblReg = activeConfig.doublesRegion;
                const doublesVal = testScanDigit(dblReg.xStart, dblReg.yStart, dblReg.xEnd, dblReg.yEnd);
                console.log(`Scanned Doubles remaining: ${doublesVal}`);
                if (doublesVal !== null) solveDoubles = doublesVal;
            }
        }

        const scannedSlots = Array(5).fill(null);

        // Scan each of the 5 card slots
        console.log('--- Card Slots scan ---');
        activeConfig.cards.forEach((cardPos, cardIdx) => {
            const faceCheck = isFaceCardSlot(bitmap, size, cardPos, activeConfig);
            if (!faceCheck.isFace) {
                console.log(`Slot ${cardIdx + 1}: Skip (empty/card-back, strip=${faceCheck.stripPixels})`);
                return;
            }

            const cropX = cardPos.x + activeConfig.cardNumberRelative.xOffset;
            const cropY = cardPos.y + activeConfig.cardNumberRelative.yOffset;
            const cropW = activeConfig.cardNumberRelative.width;
            const cropH = activeConfig.cardNumberRelative.height;

            const cropPixels = new Uint8Array(cropW * cropH * 4);
            for (let cy = 0; cy < cropH; cy++) {
                for (let cx = 0; cx < cropW; cx++) {
                    const srcIdx = ((cropY + cy) * size.width + (cropX + cx)) * 4;
                    const destIdx = (cy * cropW + cx) * 4;
                    cropPixels[destIdx] = bitmap[srcIdx];
                    cropPixels[destIdx+1] = bitmap[srcIdx+1];
                    cropPixels[destIdx+2] = bitmap[srcIdx+2];
                    cropPixels[destIdx+3] = bitmap[srcIdx+3];
                }
            }

            const result = classifyCardDigitFromCrop(cropPixels, cropW, cropH);
            if (result.digit !== null) {
                scannedSlots[cardIdx] = result.digit;
            }

            const scoresStr = result.scores ? `scores={${Object.entries(result.scores).map(([d, s]) => `${d}:${s}`).join(',')}}` : 'n/a';
            console.log(`Slot ${cardIdx + 1}: Detected Digit ${result.digit === null ? 'null' : result.digit} (w=${result.w}, h=${result.h}, confidence=${result.confidence ? result.confidence.toFixed(4) : 'n/a'}, margin=${result.margin ? result.margin.toFixed(4) : 'n/a'}, ${scoresStr}, thresh=${result.threshold}${result.adaptive ? '(adapt)' : ''})`);
        });

        // Scan remaining deck from right panel
        console.log('--- Right panel remaining deck scan ---');
        activeConfig.deckCounts.forEach((dc, idx) => {
            const cropW = dc.width;
            const cropH = dc.height;
            const cropX = dc.x;
            const cropY = dc.y;

            let darkPixels = 0;
            let minX = cropW, maxX = 0, minY = cropH, maxY = 0;
            const cropBuffer = new Uint8Array(cropW * cropH);

            for (let cy = 0; cy < cropH; cy++) {
                for (let cx = 0; cx < cropW; cx++) {
                    const pixelIdx = ((cropY + cy) * size.width + (cropX + cx)) * 4;
                    const r = bitmap[pixelIdx];
                    const g = bitmap[pixelIdx + 1];
                    const b = bitmap[pixelIdx + 2];
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
                console.log(`${dc.label}: 0 (darkPixels = ${darkPixels})`);
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
            const digit = classifyDigit(w, h, normGrid);
            console.log(`${dc.label}: Detected Digit ${digit} (w=${w}, h=${h}, darkPixels=${darkPixels})`);
            const bp = parseInt(dc.label);
            if (!isNaN(bp) && bp >= 1 && bp <= 5) {
                remainingDeck[bp] = digit;
            }

        });

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

        const solver = new SwordmancySolver(solverDeck, 4);
        const advice = solver.getBestAction(effectiveAttempts, effectiveAbandons, effectiveDoubles, hand, isDoubled);
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
        console.log(`Expected: ${expectedStr}`);
        console.log(`Actual:   ${actualStr}`);
        
        if (expectedStr === actualStr) {
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
