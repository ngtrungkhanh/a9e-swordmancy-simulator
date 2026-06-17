const { app, BrowserWindow, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const isDev = !app.isPackaged;
let logFile = null;

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

function createWindow() {
    log(`createWindow packaged=${app.isPackaged} dirname=${__dirname}`);

    const win = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 1024,
        minHeight: 700,
        title: 'Swordmancy Optimizer',
        backgroundColor: '#080b12',
        autoHideMenuBar: true,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    if (isDev) {
        log('loading dev URL http://localhost:3000');
        win.loadURL('http://localhost:3000');
        win.webContents.openDevTools({ mode: 'detach' });
    } else {
        const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
        log(`loading file ${indexPath}`);
        win.loadFile(indexPath);
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

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
