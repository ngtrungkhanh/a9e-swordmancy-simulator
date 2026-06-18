const { app, BrowserWindow, shell, globalShortcut, ipcMain, desktopCapturer, screen } = require('electron');
const fs = require('fs');
const path = require('path');

const isDev = !app.isPackaged;
let logFile = null;
let win = null;

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
        
        log('Starting screen capture...');
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width, height } = primaryDisplay.size;
        log(`Capture resolution: ${width}x${height}`);

        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width, height }
        });

        if (sources.length > 0) {
            const thumbnail = sources[0].thumbnail;
            log(`Screenshot taken successfully.`);
            const dataUrl = thumbnail.toDataURL();
            win.webContents.send('screenshot-captured', dataUrl);
        } else {
            log('No screen sources found for capture.');
        }
    } catch (err) {
        log(`Error capturing screenshot: ${err.stack || err.message}`);
    }
}

function createWindow() {
    log(`createWindow packaged=${app.isPackaged} dirname=${__dirname}`);

    win = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 1024,
        minHeight: 700,
        title: 'Swordmancy Live Assistant',
        backgroundColor: '#080b12',
        autoHideMenuBar: true,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: path.join(__dirname, 'preload.cjs')
        }
    });

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
    createWindow();

    // Register F4 Global Hotkey
    const registered = globalShortcut.register('F4', () => {
        log('F4 global hotkey pressed');
        if (win && !win.isDestroyed()) {
            win.webContents.send('scan-hotkey');
            captureAndSendScreenshot();
        }
    });

    if (registered) {
        log('F4 hotkey registered successfully.');
    } else {
        log('Failed to register F4 hotkey.');
    }

    // IPC Handlers
    ipcMain.on('request-screenshot', () => {
        log('Manual scan request received from renderer.');
        captureAndSendScreenshot();
    });

    ipcMain.on('log-from-renderer', (event, msg) => {
        log(`[Renderer] ${msg}`);
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
