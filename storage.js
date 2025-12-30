const fs = require('fs');
const path = require('path');

class StorageManager {
    constructor() {
        this.baseDir = null;
    }

    _initPaths() {
        if (!this.baseDir) {
            const { app } = require('electron');
            this.baseDir = path.join(app.getPath('documents'), 'StickyChecklist');
            this.ensureDirectoryExists(this.baseDir);
        }
    }

    _getBaseDir() {
        this._initPaths();
        return this.baseDir;
    }

    getDirectory() {
        return this._getBaseDir();
    }

    ensureDirectoryExists(dirPath) {
        if (!fs.existsSync(dirPath)) {
            try {
                fs.mkdirSync(dirPath, { recursive: true });
            } catch (error) {
                console.error('Failed to create directory:', error);
            }
        }
    }

    // Get all notes as object { id: data }
    getAllNotes() {
        const notes = {};
        const base = this._getBaseDir();
        if (!fs.existsSync(base)) return notes;

        const files = fs.readdirSync(base);
        files.forEach(file => {
            if (path.extname(file) === '.json') {
                try {
                    const filePath = path.join(base, file);
                    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    if (data.id) {
                        notes[data.id] = data;
                    }
                } catch (err) {
                    console.error('Error reading note file:', file, err);
                }
            }
        });
        return notes;
    }

    saveNote(noteData) {
        if (!noteData.id) return;
        const base = this._getBaseDir();
        this.ensureDirectoryExists(base);

        noteData.lastModified = Date.now();

        // Clean title for filename
        const safeTitle = (noteData.title || 'Sin Titulo')
            .replace(/[<>:"/\\|?*]/g, '') // Remove invalid chars
            .substring(0, 50)             // Limit length
            .trim();

        // Filename format: SafeTitle_id.json
        const filename = `${safeTitle}_${noteData.id}.json`;
        const filePath = path.join(base, filename);

        // Check if there's an existing file with a different name for this ID and delete it (Rename simulation)
        const oldFiles = fs.readdirSync(base);
        for (const file of oldFiles) {
            if (file.endsWith(`${noteData.id}.json`) && file !== filename) {
                try { fs.unlinkSync(path.join(base, file)); } catch (e) { }
            }
        }

        try {
            fs.writeFileSync(filePath, JSON.stringify(noteData, null, 2), 'utf8');
        } catch (err) {
            console.error('Error saving note:', err);
        }
    }

    deleteNote(noteId) {
        const base = this._getBaseDir();
        if (!fs.existsSync(base)) return;
        const files = fs.readdirSync(base);
        for (const file of files) {
            if (file.endsWith(`${noteId}.json`)) {
                try {
                    fs.unlinkSync(path.join(base, file));
                } catch (err) {
                    console.error('Error deleting note:', err);
                }
            }
        }
    }

    getGlobalSettings() {
        const base = this._getBaseDir();
        const configPath = path.join(base, 'app_settings.json');
        const defaults = {
            appearance: {
                borderRadius: 12,
                opacity: 100,
                colorType: 'style-gradient',
                scale: 1.0
            },
            fontSettings: {
                family: "'Outfit', sans-serif",
                size: 16
            }
        };

        if (fs.existsSync(configPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                return { ...defaults, ...data };
            } catch (e) {
                return defaults;
            }
        }
        return defaults;
    }

    saveGlobalSettings(settings) {
        const base = this._getBaseDir();
        this.ensureDirectoryExists(base);
        const configPath = path.join(base, 'app_settings.json');
        try {
            fs.writeFileSync(configPath, JSON.stringify(settings, null, 2), 'utf8');
        } catch (err) {
            console.error('Error saving global settings:', err);
        }
    }
}

module.exports = new StorageManager();
