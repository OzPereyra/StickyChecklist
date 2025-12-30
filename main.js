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
        type: 'checklist',
        isOpen: true,
        alwaysOnTop: true,
        fontSettings: {
            family: "'Outfit', sans-serif",
            size: 16,
            bold: false,
            italic: false,
            underline: false
        },
        appearance: {
            borderRadius: 12,
            opacity: 100
        }
    };

    const allNotes = storage.getAllNotes();
    const noteData = allNotes[noteId] || { ...defaults, id: noteId, ...options };

    // Ensure isOpen is true when we are creating the window
    noteData.isOpen = true;

    // Merge defaults
    if (allNotes[noteId]) {
        noteData.fontSettings = { ...defaults.fontSettings, ...(noteData.fontSettings || {}) };
        noteData.appearance = { ...defaults.appearance, ...(noteData.appearance || {}) };
        if (noteData.alwaysOnTop === undefined) noteData.alwaysOnTop = defaults.alwaysOnTop;
        if (!noteData.title) noteData.title = defaults.title;
    }

    // Save state
    storage.saveNote(noteData);

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
        alwaysOnTop: noteData.alwaysOnTop,
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
        const noteList = Object.values(notes);
        const openNotes = noteList.filter(n => n.isOpen);

        if (openNotes.length === 0) {
            if (noteList.length === 0) {
                // Fresh start: no notes at all
                createNoteWindow(crypto.randomUUID());
            } else {
                // Notes exist but all are closed: open the most recent one instead of manager
                const mostRecent = noteList.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0))[0];
                createNoteWindow(mostRecent.id);
            }
        } else {
            openNotes.forEach(n => createNoteWindow(n.id));
        }

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                const notes = storage.getAllNotes();
                const noteList = Object.values(notes);
                const openNotes = noteList.filter(n => n.isOpen);
                if (openNotes.length === 0) {
                    if (noteList.length === 0) {
                        createNoteWindow(crypto.randomUUID());
                    } else {
                        const mostRecent = noteList.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0))[0];
                        createNoteWindow(mostRecent.id);
                    }
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

// Note Manager Window
let managerWin = null;

function notifyManagerRefresh() {
    if (managerWin) {
        managerWin.webContents.send('refresh-manager');
    }
}

ipcMain.on('create-new-note', (event, fromNoteId) => {
    let x, y;
    if (fromNoteId && windows[fromNoteId]) {
        const bounds = windows[fromNoteId].getBounds();
        x = bounds.x + 30;
        y = bounds.y + 30;
    }

    const colors = ['theme-yellow', 'theme-blue', 'theme-pink', 'theme-green'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    createNoteWindow(crypto.randomUUID(), { x, y, color: randomColor });
    notifyManagerRefresh();
});

ipcMain.on('delete-note', (event, noteId) => {
    let win = windows[noteId];
    if (!win) win = BrowserWindow.fromWebContents(event.sender);

    if (win) {
        win.close();
    }

    const allNotes = storage.getAllNotes();
    if (allNotes[noteId]) {
        allNotes[noteId].isOpen = false;
        storage.saveNote(allNotes[noteId]);
    }
    notifyManagerRefresh();
});

ipcMain.on('delete-note-permanent', (event, noteId) => {
    // This will be called from the Note Manager
    if (windows[noteId]) {
        windows[noteId].close();
    }
    storage.deleteNote(noteId);
});

ipcMain.on('update-note-data', (event, data) => {
    const allNotes = storage.getAllNotes();
    if (allNotes[data.id]) {
        const updated = { ...allNotes[data.id], ...data };
        storage.saveNote(updated);
    }
});

function openNoteManager() {
    if (managerWin) {
        managerWin.focus();
        return;
    }

    managerWin = new BrowserWindow({
        width: 700,
        height: 600,
        title: 'Administrador de Notas',
        frame: false,
        transparent: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    managerWin.setMenu(null);
    managerWin.loadFile('manager.html');
    managerWin.on('closed', () => { managerWin = null; });
}

ipcMain.on('open-manager', () => {
    openNoteManager();
});

ipcMain.on('manager-close', () => {
    if (managerWin) managerWin.close();
});

ipcMain.on('manager-minimize', () => {
    if (managerWin) managerWin.minimize();
});

ipcMain.on('show-settings-menu', (event, { noteId, fontSettings, currentColor, alwaysOnTop, appearance }) => {
    const { Menu, MenuItem } = require('electron');
    const win = windows[noteId] || BrowserWindow.fromWebContents(event.sender);
    if (!win) return;

    const menu = new Menu();

    // --- SIEMPRE ARRIBA ---
    menu.append(new MenuItem({
        label: 'Siempre Arriba',
        type: 'checkbox',
        checked: alwaysOnTop,
        click: (item) => {
            win.setAlwaysOnTop(item.checked);
            win.webContents.send('settings-changed', { key: 'alwaysOnTop', value: item.checked });
        }
    }));

    menu.append(new MenuItem({ type: 'separator' }));

    // --- FUENTE SUBMENU ---
    const fontMainSubmenu = new Menu();

    // Submenu: Tipo de Fuente
    const familyMenu = new Menu();
    [
        { label: 'Outfit', value: "'Outfit', sans-serif" },
        { label: 'Arial', value: "Arial, sans-serif" },
        { label: 'Courier New', value: "'Courier New', monospace" },
        { label: 'Times New Roman', value: "'Times New Roman', serif" },
        { label: 'Verdana', value: "Verdana, sans-serif" }
    ].forEach(f => {
        familyMenu.append(new MenuItem({
            label: f.label,
            type: 'radio',
            checked: fontSettings.family === f.value,
            click: () => win.webContents.send('settings-changed', { key: 'family', value: f.value })
        }));
    });
    fontMainSubmenu.append(new MenuItem({ label: 'Tipo de Letra', submenu: familyMenu }));

    // Submenu: Tamaño
    const sizeMenu = new Menu();
    [12, 14, 16, 18, 20, 24, 30].forEach(size => {
        sizeMenu.append(new MenuItem({
            label: `${size}px`,
            type: 'radio',
            checked: parseInt(fontSettings.size) === size,
            click: () => win.webContents.send('settings-changed', { key: 'size', value: size })
        }));
    });
    fontMainSubmenu.append(new MenuItem({ label: 'Tamaño', submenu: sizeMenu }));

    // Submenu: Estilo
    const styleMenu = new Menu();
    styleMenu.append(new MenuItem({
        label: 'Negrita',
        type: 'checkbox',
        checked: fontSettings.bold,
        click: (item) => win.webContents.send('settings-changed', { key: 'bold', value: item.checked })
    }));
    styleMenu.append(new MenuItem({
        label: 'Cursiva',
        type: 'checkbox',
        checked: fontSettings.italic,
        click: (item) => win.webContents.send('settings-changed', { key: 'italic', value: item.checked })
    }));
    styleMenu.append(new MenuItem({
        label: 'Subrayado',
        type: 'checkbox',
        checked: fontSettings.underline,
        click: (item) => win.webContents.send('settings-changed', { key: 'underline', value: item.checked })
    }));
    fontMainSubmenu.append(new MenuItem({ label: 'Estilo', submenu: styleMenu }));

    menu.append(new MenuItem({ label: 'Fuente', submenu: fontMainSubmenu }));

    // --- COLOR SUBMENU ---
    const colorMenu = new Menu();
    [
        { label: 'Amarillo', value: 'theme-yellow' },
        { label: 'Azul', value: 'theme-blue' },
        { label: 'Rosa', value: 'theme-pink' },
        { label: 'Verde', value: 'theme-green' }
    ].forEach(c => {
        colorMenu.append(new MenuItem({
            label: c.label,
            type: 'radio',
            checked: currentColor === c.value,
            click: () => win.webContents.send('color-changed', c.value)
        }));
    });
    menu.append(new MenuItem({ label: 'Color', submenu: colorMenu }));

    // --- APARIENCIA SUBMENU ---
    const appearMenu = new Menu();

    // Bordes
    const radiusMenu = new Menu();
    [
        { label: 'Cuadrado', value: 0 },
        { label: 'Suave', value: 8 },
        { label: 'Redondeado', value: 16 },
        { label: 'Muy Redondeado', value: 24 },
        { label: 'Cápsula', value: 40 }
    ].forEach(r => {
        radiusMenu.append(new MenuItem({
            label: r.label,
            type: 'radio',
            checked: appearance.borderRadius === r.value,
            click: () => win.webContents.send('appearance-changed', { key: 'borderRadius', value: r.value })
        }));
    });
    appearMenu.append(new MenuItem({ label: 'Redondeado de Bordes', submenu: radiusMenu }));

    // Opacidad
    const opacityMenu = new Menu();
    [100, 95, 90, 80, 70, 60].forEach(o => {
        opacityMenu.append(new MenuItem({
            label: `${o}%`,
            type: 'radio',
            checked: appearance.opacity === o,
            click: () => win.webContents.send('appearance-changed', { key: 'opacity', value: o })
        }));
    });
    appearMenu.append(new MenuItem({ label: 'Opacidad', submenu: opacityMenu }));

    menu.append(new MenuItem({ label: 'Apariencia', submenu: appearMenu }));

    menu.append(new MenuItem({ type: 'separator' }));

    // --- ADMINISTRADOR ---
    menu.append(new MenuItem({
        label: 'Administrador de Notas',
        click: () => {
            win.webContents.send('force-save');
            setTimeout(() => ipcMain.emit('open-manager'), 200);
        }
    }));

    menu.append(new MenuItem({ type: 'separator' }));

    // --- CONFIGURACIÓN ---
    const configMenu = new Menu();

    // Startup Check
    const openAtLogin = app.getLoginItemSettings().openAtLogin;
    configMenu.append(new MenuItem({
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

    menu.append(new MenuItem({ label: 'Configuración', submenu: configMenu }));

    menu.popup({ window: win });
});

// Manager IPCs
ipcMain.handle('get-all-notes-data', () => {
    const allNotes = storage.getAllNotes();
    // Ensure currently open windows are marked as open in the manager view
    Object.keys(windows).forEach(noteId => {
        if (allNotes[noteId]) {
            allNotes[noteId].isOpen = true;
        }
    });
    return allNotes;
});

ipcMain.on('reopen-note', (event, noteId) => {
    if (windows[noteId]) {
        windows[noteId].focus();
    } else {
        createNoteWindow(noteId);
    }
});

// Get note data
ipcMain.handle('get-note-data', (event, noteId) => {
    return storage.getAllNotes()[noteId];
});

// --- Settings IPC ---

ipcMain.handle('get-app-settings', () => {
    return {
        openAtLogin: app.getLoginItemSettings().openAtLogin
    };
});

ipcMain.on('set-startup', (event, enable) => {
    app.setLoginItemSettings({
        openAtLogin: enable,
        path: app.getPath('exe')
    });
});
