const { app, BrowserWindow, shell, globalShortcut, ipcMain, desktopCapturer, screen, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

// Disable sandboxing to resolve GPU/capture issues when running as Administrator
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('enable-features', 'WebRTC-WgcWindowCapturer');
// Disable CalculateWindowOcclusion to prevent renderer freezing/throttling when overlay loses focus
app.commandLine.appendSwitch('disable-features', 'CalculateWindowOcclusion');

const isDev = !app.isPackaged;
let logFile = null;
let win = null;
let isExpanded = false;
let currentMode = 'normal';
let uiScale = 1.0;

function log(message) {
    try {
        if (!logFile) {
            logFile = path.join(app.getPath('userData'), 'main.log');
        }
        fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
    } catch (error) {
        console.error(error);
    }
}

process.on('uncaughtException', (error) => {
    log(`uncaughtException: ${error.stack || error.message}`);
});

process.on('unhandledRejection', (error) => {
    log(`unhandledRejection: ${error.stack || error}`);
});

async function captureAndSendScreenshot() {
    try {
        if (!win || win.isDestroyed()) return;
        
        // Support mocking screenshots for offline/automated testing
        const mockEnv = process.env.MOCK_SCREENSHOT;
        if (mockEnv) {
            const mockPath = path.isAbsolute(mockEnv) ? mockEnv : path.join(app.getAppPath(), mockEnv);
            if (fs.existsSync(mockPath)) {
                log(`MOCK SCREENSHOT ACTIVE: Loading from ${mockPath}`);
                const nativeImg = nativeImage.createFromPath(mockPath);
                if (!nativeImg.isEmpty()) {
                    const dataUrl = nativeImg.toDataURL();
                    win.webContents.send('screenshot-captured', dataUrl);
                    return;
                } else {
                    log(`MOCK SCREENSHOT: nativeImage loaded empty from ${mockPath}`);
                }
            } else {
                log(`MOCK SCREENSHOT: File not found at ${mockPath}`);
            }
        }
        
        log('Starting window/screen capture...');
        
        // Query both windows and screens
        const sources = await desktopCapturer.getSources({
            types: ['window', 'screen'],
            thumbnailSize: { width: 2560, height: 1440 } // Native 2K upscaling by Chromium
        });
        
        log('--- LIST OF ALL DETECTED SOURCES ---');
        for (const source of sources) {
            log(`- [${source.id.startsWith('screen') ? 'SCREEN' : 'WINDOW'}] Name: "${source.name}" | ID: "${source.id}"`);
        }
        log('------------------------------------');

        let targetSource = null;
        const keywords = ['endfield', 'swordmancy', 'arknights', '明日方舟', '终末地'];
        const exactGameTitles = ['endfield', 'arknights: endfield', 'arknights endfield', '明日方舟：终末地', '明日方舟 终末地'];
        
        const ignoredPatterns = [
            'trợ lý', 'live assistant', 'assistant', 'a9e', // App itself
            'live testing', 'antigravity',                  // Agent chat window
            'visual studio', 'vscode', 'code',              // VS Code
            'chrome', 'edge', 'firefox', 'opera', 'brave',  // Browsers
            'discord', 'messenger', 'slack', 'telegram',    // Chat apps
            'cmd.exe', 'powershell', 'terminal', 'cmd',     // Terminals
            'explorer', 'tập tin', 'thư mục', 'folder',     // File Explorer
            'git', 'github'                                 // Version control
        ];
        
        let ownSourceId = null;
        try {
            ownSourceId = win.getMediaSourceId();
        } catch (e) {
            log(`Failed to get own media source ID: ${e.message}`);
        }
        
        // Filter out non-game windows
        const windowSources = sources.filter(source => {
            if (ownSourceId && source.id === ownSourceId) return false;
            
            const nameLower = source.name.toLowerCase();
            // Check if title contains any ignored process/window patterns
            if (ignoredPatterns.some(pat => nameLower.includes(pat))) {
                log(`Ignoring source matching system/dev pattern: "${source.name}" (ID: ${source.id})`);
                return false;
            }
            return true;
        });

        // Pass 1: Try to find an EXACT match for game window titles
        for (const source of windowSources) {
            const nameLower = source.name.toLowerCase().trim();
            if (exactGameTitles.includes(nameLower)) {
                targetSource = source;
                log(`Pass 1: Found exact game window match: "${source.name}" (ID: ${source.id})`);
                break;
            }
        }

        // Pass 2: Fallback to keyword match if no exact match found
        if (!targetSource) {
            for (const source of windowSources) {
                const nameLower = source.name.toLowerCase();
                if (keywords.some(kw => nameLower.includes(kw))) {
                    targetSource = source;
                    log(`Pass 2: Found partial match with keywords: "${source.name}" (ID: ${source.id})`);
                    break;
                }
            }
        }

        // Fallback to screen if no game window found
        if (!targetSource) {
            log('No game window found. Falling back to primary screen capture.');
            targetSource = sources.find(s => s.id.startsWith('screen'));
        }

        if (targetSource) {
            const thumbnail = targetSource.thumbnail;
            log(`Captured target source: "${targetSource.name || targetSource.id}" (ID: ${targetSource.id})`);
            
            // Save debug capture to project root for user inspection
            try {
                const imagePng = thumbnail.toPNG();
                const debugPath = path.join(app.getAppPath(), 'debug_capture.png');
                fs.writeFileSync(debugPath, imagePng);
                log(`Saved debug screenshot to: ${debugPath}`);
            } catch (saveErr) {
                log(`Failed to save debug screenshot: ${saveErr.message}`);
            }
            
            const dataUrl = thumbnail.toDataURL();
            win.webContents.send('screenshot-captured', dataUrl);
        } else {
            log('No window or screen source found for capture.');
        }
    } catch (err) {
        log(`Error capturing screenshot: ${err.stack || err.message}`);
    }
}

const sizeFilePath = path.join(app.getPath('userData'), 'window-size.json');
const overlaySizeFilePath = path.join(app.getPath('userData'), 'overlay-size.json');
const modeFilePath = path.join(app.getPath('userData'), 'window-mode.json');

function saveWindowSize(width, height) {
    try {
        fs.writeFileSync(sizeFilePath, JSON.stringify({ width, height }));
        log(`Saved window size: ${width}x${height}`);
    } catch (e) {
        log(`Failed to save window size: ${e.message}`);
    }
}

function loadWindowSize() {
    try {
        if (fs.existsSync(sizeFilePath)) {
            const data = JSON.parse(fs.readFileSync(sizeFilePath, 'utf8'));
            if (data.width && data.height) {
                log(`Loaded saved window size: ${data.width}x${data.height}`);
                return data;
            }
        }
    } catch (e) {
        log(`Failed to load window size: ${e.message}`);
    }
    return { width: 1280, height: 820 }; // default
}

function saveOverlaySize(width, height) {
    try {
        fs.writeFileSync(overlaySizeFilePath, JSON.stringify({ width, height }));
        log(`Saved overlay window size: ${width}x${height}`);
    } catch (e) {
        log(`Failed to save overlay window size: ${e.message}`);
    }
}

function loadOverlaySize() {
    try {
        if (fs.existsSync(overlaySizeFilePath)) {
            const data = JSON.parse(fs.readFileSync(overlaySizeFilePath, 'utf8'));
            if (data.width && data.height) {
                log(`Loaded saved overlay window size: ${data.width}x${data.height}`);
                return data;
            }
        }
    } catch (e) {
        log(`Failed to load overlay window size: ${e.message}`);
    }
    return { width: Math.round(640 * uiScale), height: Math.round(220 * uiScale) }; // default overlay size
}

function saveWindowMode(mode) {
    try {
        fs.writeFileSync(modeFilePath, JSON.stringify({ mode }));
        log(`Saved window mode: ${mode}`);
    } catch (e) {
        log(`Failed to save window mode: ${e.message}`);
    }
}

function loadWindowMode() {
    try {
        if (fs.existsSync(modeFilePath)) {
            const data = JSON.parse(fs.readFileSync(modeFilePath, 'utf8'));
            if (data.mode) {
                log(`Loaded saved window mode: ${data.mode}`);
                return data.mode;
            }
        }
    } catch (e) {
        log(`Failed to load window mode: ${e.message}`);
    }
    return 'normal'; // default
}

function createWindow() {
    log(`createWindow packaged=${app.isPackaged} dirname=${__dirname}`);

    const savedMode = loadWindowMode();
    currentMode = savedMode;

    let initialWidth, initialHeight;
    let minW, minH;
    if (currentMode === 'overlay') {
        const savedOverlay = loadOverlaySize();
        initialWidth = savedOverlay.width;
        initialHeight = savedOverlay.height;
        minW = Math.round(400 * uiScale);
        minH = Math.round(150 * uiScale);
    } else {
        const savedSize = loadWindowSize();
        initialWidth = savedSize.width;
        initialHeight = savedSize.height;
        
        // Scale default dimensions if first run or unmodified
        const isDefaultSize = (savedSize.width === 1280 && savedSize.height === 820);
        if (isDefaultSize || !fs.existsSync(sizeFilePath)) {
            initialWidth = Math.round(1280 * uiScale);
            initialHeight = Math.round(820 * uiScale);
        }
        minW = Math.round(1024 * uiScale);
        minH = Math.round(700 * uiScale);
    }
    
    // Safety cap to prevent window exceeding screen dimensions
    try {
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width: scrW, height: scrH } = primaryDisplay.workAreaSize;
        if (initialWidth > scrW) initialWidth = Math.round(scrW * 0.9);
        if (initialHeight > scrH) initialHeight = Math.round(scrH * 0.9);
    } catch (e) {
        log(`Failed to cap window size against display workArea: ${e.message}`);
    }

    win = new BrowserWindow({
        width: initialWidth,
        height: initialHeight,
        minWidth: minW,
        minHeight: minH,
        title: 'Swordmancy Live Assistant',
        transparent: true,
        frame: false,
        hasShadow: false,
        backgroundColor: '#00000000',
        autoHideMenuBar: true,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: path.join(__dirname, 'preload.cjs'),
            backgroundThrottling: false
        }
    });

    if (currentMode === 'overlay') {
        win.setAlwaysOnTop(true, 'screen-saver');
    }

    // Save size on resize
    win.on('resize', () => {
        const [width, height] = win.getSize();
        if (currentMode === 'overlay') {
            saveOverlaySize(width, height);
        } else {
            saveWindowSize(width, height);
        }
    });

    // Enable content protection on the window instance to make it invisible to screenshots
    try {
        win.setContentProtection(true);
        log('Content protection enabled successfully on window instance.');
    } catch (cpErr) {
        log(`Failed to enable content protection: ${cpErr.message}`);
    }

    const assistantPath = path.join(__dirname, 'assistant.html');
    log(`loading file ${assistantPath}`);
    win.loadFile(assistantPath);

    if (isDev) {
        win.webContents.openDevTools({ mode: 'detach' });
    }

    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
        log(`did-fail-load ${errorCode} ${errorDescription} ${validatedURL}`);
    });

    win.webContents.on('render-process-gone', (_event, details) => {
        log(`render-process-gone ${JSON.stringify(details)}`);
    });

    win.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });
}

app.whenReady().then(() => {
    log('app ready');
    
    // Calculate UI scale based on primary display width (standard is 2560)
    try {
        const primaryDisplay = screen.getPrimaryDisplay();
        const scrWidth = primaryDisplay.bounds.width;
        if (scrWidth < 2560) {
            uiScale = scrWidth / 2560;
            if (uiScale < 0.75) uiScale = 0.75;
        }
        log(`Main process: calculated uiScale = ${uiScale} (screen width: ${scrWidth})`);
    } catch (err) {
        log(`Failed to get primary display for scaling: ${err.message}`);
    }
    
    // Register permission handlers to allow WebRTC getUserMedia for desktop capturing
    const { session } = require('electron');
    session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
        if (permission === 'media') return true;
        return false;
    });
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        if (permission === 'media') {
            callback(true);
        } else {
            callback(false);
        }
    });

    createWindow();

    // Register F4 (Toggle Auto-Scan) and F5 (Force Scan) Global Hotkeys
    const regF4 = globalShortcut.register('F4', () => {
        log('F4 global hotkey pressed (Toggle Auto-Scan)');
        if (win && !win.isDestroyed()) {
            win.webContents.send('toggle-auto-scan');
        }
    });

    const regF5 = globalShortcut.register('F5', () => {
        log('F5 global hotkey pressed (Toggle Window Mode)');
        if (win && !win.isDestroyed()) {
            const nextMode = currentMode === 'normal' ? 'overlay' : 'normal';
            applyWindowMode(nextMode);
            win.webContents.send('window-mode-changed', nextMode);
        }
    });

    if (regF4) log('F4 (Toggle Auto-Scan) hotkey registered successfully.');
    else log('Failed to register F4 hotkey.');

    if (regF5) log('F5 (Toggle Window Mode) hotkey registered successfully.');
    else log('Failed to register F5 hotkey.');

    // IPC Handlers
    ipcMain.on('request-screenshot', () => {
        log('Manual scan request received from renderer.');
        captureAndSendScreenshot();
    });

    ipcMain.handle('resolve-capture-source', async (event, forceScreen = false) => {
        log(`resolve-capture-source IPC handler invoked. forceScreen: ${forceScreen}`);
        try {
            const sources = await desktopCapturer.getSources({
                types: ['window', 'screen'],
                thumbnailSize: { width: 1, height: 1 } // Low res to save CPU since we only want source IDs
            });
            
            let targetSource = null;
            if (forceScreen) {
                log('resolve-capture-source: forceScreen is true. Resolving directly to primary screen.');
                targetSource = sources.find(s => s.id.startsWith('screen'));
            } else {
                const keywords = ['endfield', 'swordmancy', 'arknights', '明日方舟', '终末地'];
                const exactGameTitles = ['endfield', 'arknights: endfield', 'arknights endfield', '明日方舟：终末地', '明日方舟 终末地'];
                
                const ignoredPatterns = [
                    'trợ lý', 'live assistant', 'assistant', 'a9e',
                    'live testing', 'antigravity',
                    'visual studio', 'vscode', 'code',
                    'chrome', 'edge', 'firefox', 'opera', 'brave',
                    'discord', 'messenger', 'slack', 'telegram',
                    'cmd.exe', 'powershell', 'terminal', 'cmd',
                    'explorer', 'tập tin', 'thư mục', 'folder',
                    'git', 'github'
                ];
                
                let ownSourceId = null;
                try {
                    if (win) {
                        ownSourceId = win.getMediaSourceId();
                    }
                } catch (e) {
                    log(`Failed to get own media source ID: ${e.message}`);
                }
                
                const windowSources = sources.filter(source => {
                    if (ownSourceId && source.id === ownSourceId) return false;
                    const nameLower = source.name.toLowerCase();
                    if (ignoredPatterns.some(pat => nameLower.includes(pat))) return false;
                    return true;
                });

                // Pass 1: Exact match
                for (const source of windowSources) {
                    const nameLower = source.name.toLowerCase().trim();
                    if (exactGameTitles.includes(nameLower)) {
                        targetSource = source;
                        log(`resolve-capture-source: Found exact match window: "${source.name}" (ID: ${source.id})`);
                        break;
                    }
                }

                // Pass 2: Keyword match
                if (!targetSource) {
                    for (const source of windowSources) {
                        const nameLower = source.name.toLowerCase();
                        if (keywords.some(kw => nameLower.includes(kw))) {
                            targetSource = source;
                            log(`resolve-capture-source: Found keyword match window: "${source.name}" (ID: ${source.id})`);
                            break;
                        }
                    }
                }

                // Fallback: Primary screen
                if (!targetSource) {
                    log('resolve-capture-source: No matching game window found. Falling back to primary screen.');
                    targetSource = sources.find(s => s.id.startsWith('screen'));
                }
            }

            if (targetSource) {
                log(`resolve-capture-source: Resolved to ID: ${targetSource.id} (${targetSource.name})`);
                return targetSource.id;
            }
            return null;
        } catch (err) {
            log(`Error in resolve-capture-source: ${err.message}`);
            return null;
        }
    });

    ipcMain.handle('select-file', async () => {
        log('select-file IPC invoked.');
        try {
            const result = await dialog.showOpenDialog(win, {
                title: 'Chọn ảnh chụp màn hình game',
                properties: ['openFile'],
                filters: [
                    { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }
                ]
            });
            if (result.canceled || result.filePaths.length === 0) {
                log('File dialog canceled by user.');
                return null;
            }
            const filePath = result.filePaths[0];
            log(`Selected file: ${filePath}`);
            const buffer = fs.readFileSync(filePath);
            const ext = path.extname(filePath).toLowerCase().replace('.', '');
            let mimeType = 'image/png';
            if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
            else if (ext === 'gif') mimeType = 'image/gif';
            else if (ext === 'webp') mimeType = 'image/webp';
            else if (ext === 'bmp') mimeType = 'image/bmp';
            
            return `data:${mimeType};base64,${buffer.toString('base64')}`;
        } catch (err) {
            log(`Error in select-file handler: ${err.stack || err.message}`);
            return null;
        }
    });

    ipcMain.on('log-from-renderer', (event, msg) => {
        log(`[Renderer] ${msg}`);
    });

function applyWindowMode(mode) {
    if (!win || win.isDestroyed()) return;
    currentMode = mode;
    saveWindowMode(mode);
    if (mode === 'overlay') {
        win.setResizable(true);
        const minW = Math.round(400 * uiScale);
        const minH = Math.round(150 * uiScale);
        win.setMinimumSize(minW, minH);
        const savedOverlay = loadOverlaySize();
        win.setSize(savedOverlay.width, savedOverlay.height);
        win.setAlwaysOnTop(true, 'screen-saver');
        win.setFocusable(true); // Keep HUD controls clickable when the user intentionally interacts with it.
        log(`Switched window to Overlay Mode (${savedOverlay.width}x${savedOverlay.height}, AlwaysOnTop, focusable=true)`);
    } else {
        win.setResizable(true);
        const minW = Math.round(1024 * uiScale);
        const minH = Math.round(700 * uiScale);
        win.setMinimumSize(minW, minH);
        const savedSize = loadWindowSize();
        let targetW = savedSize.width;
        let targetH = savedSize.height;
        // If the saved size is default size and hasn't been changed, scale it
        if (savedSize.width === 1280 && savedSize.height === 820) {
            targetW = Math.round(1280 * uiScale);
            targetH = Math.round(820 * uiScale);
        }
        win.setSize(targetW, targetH);
        win.setAlwaysOnTop(false);
        win.setFocusable(true); // Re-enable focus for normal mode!
        log(`Switched window to Normal Mode (${targetW}x${targetH}, focusable=true)`);
    }
}

    ipcMain.on('set-window-mode', (event, mode) => {
        applyWindowMode(mode);
    });

    ipcMain.on('resize-window', (event, width, height) => {
        if (win && !win.isDestroyed()) {
            win.setSize(width, height);
        }
    });

    ipcMain.on('minimize-window', () => {
        if (win && !win.isDestroyed()) {
            win.minimize();
        }
    });

    ipcMain.on('close-window', () => {
        if (win && !win.isDestroyed()) {
            win.close();
        }
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    log('Unregistered all global shortcuts.');
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
