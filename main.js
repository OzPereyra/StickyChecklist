const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const Store = require('./store.js');
const crypto = require('crypto');

// Initialize store
const store = new Store({
    configName: 'sticky-checklist-preferences',
    defaults: {
        notes: {} // Object structure: { [id]: { id, x, y, color, content, type (text/list) } }
    }
});

let windows = {}; // Track open windows by ID

function createNoteWindow(noteId, options = {}) {
    // Default config if new
    const defaults = {
        width: 320, // Slightly wider for new toolbar
        height: 350,
        x: undefined,
        y: undefined,
        color: 'theme-yellow',
        content: '',
        title: 'Sticky Checklist',
        type: 'text', // or 'checklist'
        fontSettings: {
            family: "'Outfit', sans-serif",
            size: 16,
            bold: false,
            italic: false,
            underline: false
        }
    };

    const noteData = store.get('notes')[noteId] || { ...defaults, id: noteId, ...options };
    // Merge defaults if existing note is missing new fields
    if (store.get('notes')[noteId]) {
        noteData.fontSettings = { ...defaults.fontSettings, ...(noteData.fontSettings || {}) };
        if (!noteData.title) noteData.title = defaults.title;
    }

    // Save initial state if it's new
    if (!store.get('notes')[noteId]) {
        const currentNotes = store.get('notes');
        currentNotes[noteId] = noteData;
        store.set('notes', currentNotes);
    }

    const win = new BrowserWindow({
        width: 320,
        height: 350,
        x: noteData.x,
        y: noteData.y,
        minWidth: 250,
        minHeight: 200,
        frame: false,
        transparent: true,
        resizable: true,
        alwaysOnTop: true,
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
        const nodes = store.get('notes');
        if (nodes[noteId]) {
            nodes[noteId].x = bounds.x;
            nodes[noteId].y = bounds.y;
            nodes[noteId].width = bounds.width;
            nodes[noteId].height = bounds.height;
            store.set('notes', nodes);
        }
    };

    win.on('moved', saveBounds);
    win.on('resized', saveBounds);

    // Cleanup on close
    win.on('closed', () => {
        delete windows[noteId];
    });
}

app.whenReady().then(() => {
    const notes = store.get('notes');
    const noteIds = Object.keys(notes);

    if (noteIds.length === 0) {
        // Create first default note
        createNoteWindow(crypto.randomUUID());
    } else {
        // Restore all notes
        noteIds.forEach(id => createNoteWindow(id));
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            const notes = store.get('notes');
            if (Object.keys(notes).length === 0) {
                createNoteWindow(crypto.randomUUID());
            } else {
                // Re-open them? Usually they stay open. 
                // If app was closed and re-opened, "whenReady" handles it.
            }
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// --- IPC Handlers ---

// Create new note
ipcMain.on('create-new-note', (event, fromNoteId) => {
    // Offset the new note slightly from the creator
    let x, y;
    if (fromNoteId && windows[fromNoteId]) {
        const bounds = windows[fromNoteId].getBounds();
        x = bounds.x + 30;
        y = bounds.y + 30;
    }

    // Get previous note's color to avoid repetition if possible
    const colors = ['theme-yellow', 'theme-blue', 'theme-pink', 'theme-green'];
    let availableColors = colors;

    if (fromNoteId) {
        const notes = store.get('notes');
        if (notes[fromNoteId] && notes[fromNoteId].color) {
            availableColors = colors.filter(c => c !== notes[fromNoteId].color);
        }
    }

    const randomColor = availableColors[Math.floor(Math.random() * availableColors.length)];

    createNoteWindow(crypto.randomUUID(), { x, y, color: randomColor });
});

// Close/Delete note
ipcMain.on('delete-note', (event, noteId) => {
    if (windows[noteId]) {
        windows[noteId].close();
    }
    // Remove from store
    const notes = store.get('notes');
    delete notes[noteId];
    store.set('notes', notes);
});

// Update note data (content, color, type, title, fontSettings)
ipcMain.on('update-note-data', (event, { id, content, color, type, title, fontSettings }) => {
    const notes = store.get('notes');
    if (notes[id]) {
        if (content !== undefined) notes[id].content = content;
        if (color !== undefined) notes[id].color = color;
        if (type !== undefined) notes[id].type = type;
        if (title !== undefined) notes[id].title = title;
        if (fontSettings !== undefined) notes[id].fontSettings = fontSettings;
        store.set('notes', notes);
    }
});

// Get note data (for initialization)
ipcMain.handle('get-note-data', (event, noteId) => {
    return store.get('notes')[noteId];
});
