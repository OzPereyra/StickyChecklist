const { app, BrowserWindow, ipcMain, screen, dialog } = require('electron');
const path = require('path');
const storage = require('./storage.js');
const crypto = require('crypto');

let windows = {}; // Track open windows by ID

function createNoteWindow(noteId, options = {}) {
    // Default config if new
    const defaults = {
        width: 320,
        height: 350,
        x: undefined,
        y: undefined,
        color: 'theme-yellow',
        content: '',
        title: 'Sticky Checklist',
        type: 'text',
        fontSettings: {
            family: "'Outfit', sans-serif",
            size: 16,
            bold: false,
            italic: false,
            underline: false
        }
    };

    const allNotes = storage.getAllNotes();
    const noteData = allNotes[noteId] || { ...defaults, id: noteId, ...options };

    // Merge defaults
    if (allNotes[noteId]) {
        noteData.fontSettings = { ...defaults.fontSettings, ...(noteData.fontSettings || {}) };
        if (!noteData.title) noteData.title = defaults.title;
    }

    // Save initial state if it's new
    if (!allNotes[noteId]) {
        storage.saveNote(noteData);
    }

    const win = new BrowserWindow({
        width: noteData.width || 320,
        height: noteData.height || 350,
        x: noteData.x,
        y: noteData.y,
        minWidth: 250,
        minHeight: 200,
        frame: false,
        transparent: true,
        resizable: true,
        alwaysOnTop: true,
        skipTaskbar: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            additionalArguments: [`--noteId=${noteId}`]
        }
    });

    win.loadFile('index.html');

    // Track window
    windows[noteId] = win;

    // Save bounds on move/resize
    const saveBounds = () => {
        const bounds = win.getBounds();
        const currentData = storage.getAllNotes()[noteId];
        if (currentData) {
            currentData.x = bounds.x;
            currentData.y = bounds.y;
            currentData.width = bounds.width;
            currentData.height = bounds.height;
            storage.saveNote(currentData);
        }
    };

    win.on('moved', saveBounds);
    win.on('resized', saveBounds);

    // Cleanup on close
    win.on('closed', () => {
        delete windows[noteId];
    });
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance, we should focus our windows.
        // Maybe focus the last active one?
        const winIds = Object.keys(windows);
        if (winIds.length > 0) {
            const win = windows[winIds[0]];
            if (win) {
                if (win.isMinimized()) win.restore();
                win.focus();
            }
        }
    });

    app.whenReady().then(() => {
        // Configuration for Startup
        app.setLoginItemSettings({
            openAtLogin: app.getLoginItemSettings().openAtLogin,
            path: app.getPath('exe')
        });

        const notes = storage.getAllNotes();
        const noteIds = Object.keys(notes);

        if (noteIds.length === 0) {
            createNoteWindow(crypto.randomUUID());
        } else {
            noteIds.forEach(id => createNoteWindow(id));
        }

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                const notes = storage.getAllNotes();
                if (Object.keys(notes).length === 0) {
                    createNoteWindow(crypto.randomUUID());
                }
            }
        });
    });
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// --- IPC Handlers ---

ipcMain.on('create-new-note', (event, fromNoteId) => {
    let x, y;
    if (fromNoteId && windows[fromNoteId]) {
        const bounds = windows[fromNoteId].getBounds();
        x = bounds.x + 30;
        y = bounds.y + 30;
    }

    const colors = ['theme-yellow', 'theme-blue', 'theme-pink', 'theme-green'];
    let availableColors = colors;
    const randomColor = availableColors[Math.floor(Math.random() * availableColors.length)];

    createNoteWindow(crypto.randomUUID(), { x, y, color: randomColor });
});

ipcMain.on('delete-note', (event, noteId) => {
    // Try to find window by ID, or fallback to event.sender
    let win = windows[noteId];
    if (!win) {
        win = BrowserWindow.fromWebContents(event.sender);
    }

    if (win) {
        win.close();
    }
    // Ensure persistence removal
    storage.deleteNote(noteId);
});

ipcMain.on('update-note-data', (event, data) => {
    const allNotes = storage.getAllNotes();
    if (allNotes[data.id]) {
        const updated = { ...allNotes[data.id], ...data };
        storage.saveNote(updated);
    }
});

ipcMain.on('show-settings-menu', (event, { noteId, fontSettings }) => {
    const { Menu, MenuItem } = require('electron');
    const win = windows[noteId] || BrowserWindow.fromWebContents(event.sender);
    if (!win) return;

    const fontFamilies = [
        { label: 'Outfit', value: "'Outfit', sans-serif" },
        { label: 'Arial', value: "Arial, sans-serif" },
        { label: 'Courier New', value: "'Courier New', monospace" },
        { label: 'Times New Roman', value: "'Times New Roman', serif" },
        { label: 'Verdana', value: "Verdana, sans-serif" }
    ];

    const fontSizes = [12, 14, 16, 18, 20, 24, 30];

    const menu = new Menu();

    // Fonts Submenu
    const fontMenu = new Menu();
    fontFamilies.forEach(f => {
        fontMenu.append(new MenuItem({
            label: f.label,
            type: 'radio',
            checked: fontSettings.family === f.value,
            click: () => win.webContents.send('settings-changed', { key: 'family', value: f.value })
        }));
    });
    menu.append(new MenuItem({ label: 'Fuente', submenu: fontMenu }));

    // Size Submenu
    const sizeMenu = new Menu();
    fontSizes.forEach(size => {
        sizeMenu.append(new MenuItem({
            label: `${size}px`,
            type: 'radio',
            checked: parseInt(fontSettings.size) === size,
            click: () => win.webContents.send('settings-changed', { key: 'size', value: size })
        }));
    });
    menu.append(new MenuItem({ label: 'Tamaño', submenu: sizeMenu }));

    menu.append(new MenuItem({ type: 'separator' }));

    // Styles
    menu.append(new MenuItem({
        label: 'Negrita',
        type: 'checkbox',
        checked: fontSettings.bold,
        click: (menuItem) => win.webContents.send('settings-changed', { key: 'bold', value: menuItem.checked })
    }));
    menu.append(new MenuItem({
        label: 'Cursiva',
        type: 'checkbox',
        checked: fontSettings.italic,
        click: (menuItem) => win.webContents.send('settings-changed', { key: 'italic', value: menuItem.checked })
    }));
    menu.append(new MenuItem({
        label: 'Subrayado',
        type: 'checkbox',
        checked: fontSettings.underline,
        click: (menuItem) => win.webContents.send('settings-changed', { key: 'underline', value: menuItem.checked })
    }));

    menu.append(new MenuItem({ type: 'separator' }));

    // Advanced Submenu
    const advancedMenu = new Menu();
    advancedMenu.append(new MenuItem({
        label: 'Cambiar Carpeta de Datos...',
        click: async () => {
            const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
            if (!result.canceled && result.filePaths.length > 0) {
                const newPath = result.filePaths[0];
                if (storage.setDirectory(newPath)) {
                    // Notify renderer to show alert
                    win.webContents.send('storage-changed', newPath);
                }
            }
        }
    }));

    // Startup Check
    const openAtLogin = app.getLoginItemSettings().openAtLogin;
    advancedMenu.append(new MenuItem({
        label: 'Iniciar con Windows',
        type: 'checkbox',
        checked: openAtLogin,
        click: (item) => {
            app.setLoginItemSettings({
                openAtLogin: item.checked,
                path: app.getPath('exe')
            });
        }
    }));

    menu.append(new MenuItem({ label: 'Opciones Avanzadas', submenu: advancedMenu }));

    menu.popup({ window: win });
});

// Get note data
ipcMain.handle('get-note-data', (event, noteId) => {
    return storage.getAllNotes()[noteId];
});

// --- Settings IPC ---

ipcMain.handle('get-app-settings', () => {
    return {
        storagePath: storage.getDirectory(),
        openAtLogin: app.getLoginItemSettings().openAtLogin
    };
});

ipcMain.on('set-startup', (event, enable) => {
    app.setLoginItemSettings({
        openAtLogin: enable,
        path: app.getPath('exe')
    });
});

ipcMain.handle('select-storage-folder', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths.length > 0) {
        const newPath = result.filePaths[0];
        if (storage.setDirectory(newPath)) {
            return newPath;
        }
    }
    return null;
});
