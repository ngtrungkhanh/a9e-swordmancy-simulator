const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    requestScreenshot: () => ipcRenderer.send('request-screenshot'),
    selectFile: () => ipcRenderer.invoke('select-file'),
    resolveCaptureSource: (forceScreen) => ipcRenderer.invoke('resolve-capture-source', forceScreen),
    onScreenshotCaptured: (callback) => {
        ipcRenderer.on('screenshot-captured', (event, data) => callback(data));
    },
    onScreenshotSourceId: (callback) => {
        ipcRenderer.on('screenshot-source-id', (event, sourceId) => callback(sourceId));
    },
    onScanHotkey: (callback) => {
        ipcRenderer.on('scan-hotkey', () => callback());
    },
    onToggleAutoScan: (callback) => {
        ipcRenderer.on('toggle-auto-scan', () => callback());
    },
    onForceScan: (callback) => {
        ipcRenderer.on('force-scan', () => callback());
    },
    onWindowModeChanged: (callback) => {
        ipcRenderer.on('window-mode-changed', (event, mode) => callback(mode));
    },
    log: (msg) => ipcRenderer.send('log-from-renderer', msg),
    setWindowMode: (mode) => ipcRenderer.send('set-window-mode', mode),
    minimizeWindow: () => ipcRenderer.send('minimize-window'),
    closeWindow: () => ipcRenderer.send('close-window'),
    resizeWindow: (width, height) => ipcRenderer.send('resize-window', width, height)
});
