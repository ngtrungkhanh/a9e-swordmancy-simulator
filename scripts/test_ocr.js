const { app, nativeImage } = require('electron');
const path = require('path');

// Mock getActiveConfig since we don't run in browser
const CONFIG = {
    resolutions: {
        '2K': {
            width: 2560,
            height: 1440,
            cards: [
                { x: 100, y: 300, width: 370, height: 570 },
                { x: 490, y: 300, width: 370, height: 570 },
                { x: 880, y: 300, width: 370, height: 570 },
                { x: 1270, y: 300, width: 370, height: 570 },
                { x: 1660, y: 300, width: 370, height: 570 }
            ],
            cardNumberRelative: {
                xOffset: 295,
                yOffset: 0,
                width: 75,
                height: 90
            },
            deckCounts: [
                { x: 2437, y: 245, width: 60, height: 40, label: '1 BP' },
                { x: 2437, y: 343, width: 60, height: 40, label: '2 BP' },
                { x: 2437, y: 440, width: 60, height: 40, label: '3 BP' },
                { x: 2437, y: 538, width: 60, height: 40, label: '4 BP' },
                { x: 2437, y: 636, width: 60, height: 40, label: '5 BP' }
            ]
        }
    }
};

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

app.whenReady().then(() => {
    console.log('--- STARTING OCR TEST ON LOCAL SCREENSHOTS ---');
    const projectDir = path.join(__dirname, '..');
    const images = ['1.png', '2.png', '3.png', '4.png'];

    const config = CONFIG.resolutions['2K'];

    images.forEach(imgName => {
        const imgPath = path.join(projectDir, 'Screenshoot', imgName);
        console.log(`\nAnalyzing ${imgName}...`);
        const img = nativeImage.createFromPath(imgPath);
        if (img.isEmpty()) {
            console.error(`Failed to load ${imgName}`);
            return;
        }

        const size = img.getSize();
        console.log(`Resolution: ${size.width}x${size.height}`);

        const bitmap = img.toBitmap(); // RGBA buffer

        // Scan double switch presence
        console.log('--- Double active switch & capsule test ---');
        let whitePixels = 0;
        const dsX = 1100, dsY = 1150, dsW = 300, dsH = 25;
        for (let cy = 0; cy < dsH; cy++) {
            for (let cx = 0; cx < dsW; cx++) {
                const pixelIdx = ((dsY + cy) * size.width + (dsX + cx)) * 4;
                const r = bitmap[pixelIdx];
                const g = bitmap[pixelIdx + 1];
                const b = bitmap[pixelIdx + 2];
                if (r > 220 && g > 220 && b > 220) {
                    whitePixels++;
                }
            }
        }
        const isDoubled = whitePixels > 200;

        // Scan capsule text presence
        const capsuleX = 1100, capsuleY = 1158, capsuleW = 300, capsuleH = 20;
        let darkCap = 0;
        for (let cy = 0; cy < capsuleH; cy++) {
            for (let cx = 0; cx < capsuleW; cx++) {
                const idx = ((capsuleY + cy) * size.width + (capsuleX + cx)) * 4;
                const val = (bitmap[idx] + bitmap[idx+1] + bitmap[idx+2]) / 3;
                if (val < 110) darkCap++;
            }
        }
        const isDoubleSwitchPresent = darkCap > 50;

        // Scan brackets presence
        const bracketX = 1040, bracketY = 114, bracketW = 15, bracketH = 18;
        let darkBr = 0;
        for (let cy = 0; cy < bracketH; cy++) {
            for (let cx = 0; cx < bracketW; cx++) {
                const idx = ((bracketY + cy) * size.width + (bracketX + cx)) * 4;
                const val = (bitmap[idx] + bitmap[idx+1] + bitmap[idx+2]) / 3;
                if (val < 110) darkBr++;
            }
        }
        const isBracketPresent = darkBr > 20;
        const hasDouble = isDoubleSwitchPresent || isDoubled;
        const isFreeTrial = !hasDouble || !isBracketPresent;

        console.log(`Double switch active: ${isDoubled} (${whitePixels} white px)`);
        console.log(`Double switch capsule present: ${isDoubleSwitchPresent} (${darkCap} dark px)`);
        console.log(`Bracket present: ${isBracketPresent} (${darkBr} dark px)`);
        console.log(`Mode detected: ${isFreeTrial ? 'FREE TRIAL' : 'REWARDED'}`);

        // Scan attempts digit if present
        if (!isFreeTrial) {
            console.log('--- Attempts and Doubles OCR test ---');
            
            // Helper function to scan digits in region
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

            const attemptsVal = testScanDigit(1190, 114, 1215, 134);
            console.log(`Scanned Attempts remaining: ${attemptsVal}`);

            if (isDoubleSwitchPresent) {
                const doublesVal = testScanDigit(1480, 1155, 1505, 1180);
                console.log(`Scanned Doubles remaining: ${doublesVal}`);
            }
        }

        // Scan each of the 5 card slots
        console.log('--- Card Slots scan ---');
        config.cards.forEach((cardPos, cardIdx) => {
            const cropX = cardPos.x + config.cardNumberRelative.xOffset;
            const cropY = cardPos.y + config.cardNumberRelative.yOffset;
            const cropW = config.cardNumberRelative.width;
            const cropH = config.cardNumberRelative.height;

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
                console.log(`Slot ${cardIdx + 1}: Empty (darkPixels = ${darkPixels})`);
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
            console.log(`Slot ${cardIdx + 1}: Detected Digit ${digit} (w=${w}, h=${h}, darkPixels=${darkPixels})`);
        });

        // Scan remaining deck from right panel
        console.log('--- Right panel remaining deck scan ---');
        config.deckCounts.forEach((dc, idx) => {
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
        });
    });

    app.quit();
});
