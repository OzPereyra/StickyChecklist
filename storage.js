const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class StorageManager {
    constructor() {
        // Default path: Documents/StickyChecklist
        this.baseDir = path.join(app.getPath('documents'), 'StickyChecklist');
        this.ensureDirectoryExists(this.baseDir);
    }

    ensureDirectoryExists(dirPath) {
        if (!fs.existsSync(dirPath)) {
            try {
                fs.mkdirSync(dirPath, { recursive: true });
            } catch (error) {
                console.error('Failed to create directory:', error);
                // Fallback to userdata if permission denied?
            }
        }
    }

    setDirectory(newPath) {
        if (newPath && fs.existsSync(newPath)) {
            this.baseDir = newPath;
            // Optionally migrate files? For now, we just switch pointer.
            return true;
        }
        return false;
    }

    getDirectory() {
        return this.baseDir;
    }

    // Get all notes as object { id: data }
    getAllNotes() {
        const notes = {};
        if (!fs.existsSync(this.baseDir)) return notes;

        const files = fs.readdirSync(this.baseDir);
        files.forEach(file => {
            if (path.extname(file) === '.json') {
                try {
                    const filePath = path.join(this.baseDir, file);
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
        this.ensureDirectoryExists(this.baseDir);
        const filePath = path.join(this.baseDir, `${noteData.id}.json`);
        try {
            fs.writeFileSync(filePath, JSON.stringify(noteData, null, 2), 'utf8');
        } catch (err) {
            console.error('Error saving note:', err);
        }
    }

    deleteNote(noteId) {
        const filePath = path.join(this.baseDir, `${noteId}.json`);
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
            } catch (err) {
                console.error('Error deleting note:', err);
            }
        }
    }
}

module.exports = new StorageManager();
