const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    requestScreenshot: () => ipcRenderer.send('request-screenshot'),
    onScreenshotCaptured: (callback) => {
        ipcRenderer.on('screenshot-captured', (event, data) => callback(data));
    },
    onScanHotkey: (callback) => {
        ipcRenderer.on('scan-hotkey', () => callback());
    },
    log: (msg) => ipcRenderer.send('log-from-renderer', msg)
});
