const { ipcRenderer, clipboard } = require('electron');

const noteIdArg = process.argv.find(arg => arg.startsWith('--noteId='));
// Advanced Inputs (Native Menu used)
/*
const pathDisplay = document.getElementById('path-display');
const btnChangeFolder = document.getElementById('btn-change-folder');
const chkStartup = document.getElementById('chk-startup');
*/
const noteId = noteIdArg ? noteIdArg.split('=')[1] : 'default';

const colors = ['theme-yellow', 'theme-blue', 'theme-pink', 'theme-green'];
const noteContainer = document.getElementById('sticky-note');
const noteTitleInput = document.getElementById('note-title');
const textarea = document.getElementById('note-text');
const checklistContainer = document.getElementById('note-checklist');
const btnClose = document.getElementById('btn-close');
const btnAdd = document.getElementById('btn-add');
const btnToggle = document.getElementById('btn-toggle-mode');

const btnSettings = document.getElementById('btn-settings');
const settingsMenu = document.getElementById('settings-menu');

// Settings Inputs (Native Menu used now)
/* 
const fontSelect = document.getElementById('font-family');
const fontSizeInput = document.getElementById('font-size');
const btnBold = document.getElementById('btn-bold');
const btnItalic = document.getElementById('btn-italic');
const btnUnderline = document.getElementById('btn-underline');
*/


let currentMode = 'checklist'; // 'text' or 'checklist'
let noteData = {
    content: '',
    color: 'theme-yellow',
    type: 'checklist',
    title: 'Sticky Checklist',
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
        opacity: 100,
        colorType: 'style-gradient'
    }
};

// Initialize
(async () => {
    // Load Note Data
    const data = await ipcRenderer.invoke('get-note-data', noteId);
    const globalSettings = await ipcRenderer.invoke('get-global-settings');

    if (data) {
        noteData = { ...noteData, ...data };
    }

    // Always merge global appearance for sync
    noteData.appearance = { ...globalSettings.appearance, ...(noteData.appearance || {}) };

    if (!noteData.fontSettings) noteData.fontSettings = { family: "'Outfit', sans-serif", size: 16 };
    if (noteData.alwaysOnTop === undefined) noteData.alwaysOnTop = true;

    // Load custom fonts
    loadCustomFonts(globalSettings.customFonts || []);

    applyState();

    // Notify Main that we are ready to be shown
    ipcRenderer.send('note-ready', noteId);
})();

function loadCustomFonts(fonts) {
    let styleTag = document.getElementById('custom-fonts-style');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'custom-fonts-style';
        document.head.appendChild(styleTag);
    }

    const cssRules = fonts.map(f => {
        // Clean path for URL and encode it
        const safePath = f.path.replace(/\\/g, '/');
        return `
            @font-face {
                font-family: '${f.name}';
                src: url('sticky-font://${encodeURIComponent(safePath)}');
            }
        `;
    }).join('\n');

    styleTag.innerHTML = cssRules;
}

function applyState() {
    // Set Color
    noteContainer.classList.remove(...colors);
    noteContainer.classList.add(noteData.color);

    // Set Style (Flat or Gradient)
    noteContainer.classList.remove('style-flat', 'style-gradient');
    noteContainer.classList.add(noteData.appearance.colorType || 'style-gradient');

    // Set Title
    noteTitleInput.value = noteData.title || 'Sticky Checklist';

    // Set Font & Appearance
    applyFontSettings();
    applyAppearance();


    // Set Content & Mode
    currentMode = noteData.type || 'checklist';

    if (currentMode === 'text') {
        textarea.value = noteData.content;
        textarea.classList.remove('hidden');
        checklistContainer.classList.add('hidden');
    } else {
        renderChecklist(noteData.content);
        checklistContainer.classList.remove('hidden');
        textarea.classList.add('hidden');
    }
}

function applyAppearance() {
    const a = noteData.appearance;
    noteContainer.style.borderRadius = (a.borderRadius || 12) + 'px';
    noteContainer.style.opacity = (a.opacity || 100) / 100;

    // Apply Style Class
    noteContainer.classList.remove('style-flat', 'style-gradient');
    noteContainer.classList.add(a.colorType || 'style-gradient');

    // Apply Zoom (Scale)
    noteContainer.style.setProperty('--zoom', a.scale || 1.0);
}

function applyFontSettings() {
    const s = noteData.fontSettings;
    const styleString = `
        font-family: ${s.family};
        font-size: ${s.size}px;
        font-weight: ${s.bold ? '700' : '400'};
        font-style: ${s.italic ? 'italic' : 'normal'};
        text-decoration: ${s.underline ? 'underline' : 'none'};
    `;

    textarea.style.cssText = styleString;
    // For title: 1pt bigger (approx 1.33px bigger or just +2px for simplicity?)
    noteTitleInput.style.fontFamily = s.family;
    noteTitleInput.style.fontSize = (parseInt(s.size) + 2) + 'px';
    noteTitleInput.style.fontWeight = '500'; // Title always slightly bold/distinct? Or follow settings? Request said "1 punto de tamaño mayor al contenido".

    // Checklist inputs also need styles
    const checklistInputs = checklistContainer.querySelectorAll('input[type="text"]');
    checklistInputs.forEach(input => {
        input.style.cssText = styleString;
        // Ensure line-through persists for completed
        if (input.parentElement.classList.contains('completed')) {
            input.style.textDecoration = 'line-through';
            if (s.underline) input.style.textDecoration += ' underline';
        }
    });

    // Re-render checklist to apply styles to new items easily? 
    // Actually simpler to apply to container or separate CSS var.
    // CSS Vars would be cleaner but direct style is robust for now.
    checklistContainer.style.setProperty('--font-fam', s.family); // Helper if needed
}

// --- Toggle Logic ---

function textToChecklist(text) {
    if (!text) return [];
    return text.split('\n').map(line => {
        let checked = false;
        let content = line;
        if (line.trim().startsWith('- [x]')) {
            checked = true;
            content = line.replace('- [x]', '').trim();
        } else if (line.trim().startsWith('- [ ]')) {
            content = line.replace('- [ ]', '').trim();
        }
        return { text: content, checked };
    });
}

function checklistToText(items) {
    return items.map(item => `- [${item.checked ? 'x' : ' '}] ${item.text}`).join('\n');
}


function renderChecklist(contentString) {
    checklistContainer.innerHTML = '';
    const items = textToChecklist(contentString);

    if (items.length === 0) items.push({ text: '', checked: false });

    items.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = `checklist-item ${item.checked ? 'completed' : ''}`;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = item.checked;
        checkbox.addEventListener('change', () => {
            items[index].checked = checkbox.checked;
            updateContentFromChecklist(items);
            if (checkbox.checked) {
                row.classList.add('completed');
                input.style.textDecoration = 'line-through';
                if (noteData.fontSettings.underline) input.style.textDecoration += ' underline';
            }
            else {
                row.classList.remove('completed');
                input.style.textDecoration = noteData.fontSettings.underline ? 'underline' : 'none';
            }
        });

        const input = document.createElement('input');
        input.type = 'text';
        input.value = item.text;
        input.placeholder = '...';

        // Apply current styles
        const s = noteData.fontSettings;
        input.style.fontFamily = s.family;
        input.style.fontSize = s.size + 'px';
        input.style.fontWeight = s.bold ? '700' : '400';
        input.style.fontStyle = s.italic ? 'italic' : 'normal';
        input.style.textDecoration = s.underline ? 'underline' : 'none';

        if (item.checked) {
            input.style.textDecoration = 'line-through';
            if (s.underline) input.style.textDecoration += ' underline';
        }

        input.addEventListener('input', () => {
            items[index].text = input.value;
        });
        attachChecklistSaveListener(input, items);

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                items.splice(index + 1, 0, { text: '', checked: false });
                updateContentFromChecklist(items); // Instant save on Enter
                renderChecklist(checklistToText(items));
                setTimeout(() => {
                    const inputs = checklistContainer.querySelectorAll('input[type="text"]');
                    if (inputs[index + 1]) inputs[index + 1].focus();
                }, 0);
            } else if (e.key === 'Backspace' && input.value === '') {
                if (items.length > 1) {
                    e.preventDefault();
                    items.splice(index, 1);
                    updateContentFromChecklist(items);
                    renderChecklist(checklistToText(items));
                    setTimeout(() => {
                        const inputs = checklistContainer.querySelectorAll('input[type="text"]');
                        if (inputs[index - 1]) inputs[index - 1].focus();
                    }, 0);
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const inputs = checklistContainer.querySelectorAll('input[type="text"]');
                if (inputs[index - 1]) inputs[index - 1].focus();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                const inputs = checklistContainer.querySelectorAll('input[type="text"]');
                if (inputs[index + 1]) inputs[index + 1].focus();
            }
        });

        row.appendChild(checkbox);
        row.appendChild(input);
        checklistContainer.appendChild(row);
    });
}

function updateContentFromChecklist(items) {
    const text = checklistToText(items);
    noteData.content = text;
    save();
}

// --- Menu Actions ---

btnToggle.addEventListener('click', () => {
    if (currentMode === 'text') {
        currentMode = 'checklist';
        noteData.content = textarea.value;
        renderChecklist(noteData.content);
        textarea.classList.add('hidden');
        checklistContainer.classList.remove('hidden');
    } else {
        currentMode = 'text';
        textarea.value = noteData.content;
        checklistContainer.classList.add('hidden');
        textarea.classList.remove('hidden');
    }
    noteData.type = currentMode;
    save();
});

// Title
noteTitleInput.addEventListener('input', () => {
    noteData.title = noteTitleInput.value;
    save();
});

// Settings Toggle -> Now invokes Native Menu
btnSettings.addEventListener('click', (e) => {
    e.stopPropagation();
    // Send current state to main to populate menu
    ipcRenderer.send('show-settings-menu', {
        noteId,
        fontSettings: noteData.fontSettings,
        currentColor: noteData.color,
        alwaysOnTop: noteData.alwaysOnTop,
        appearance: noteData.appearance
    });
});

// Remove old HTML menu listener if exists (clean up logic)
// Listen for updates from Native Menu
ipcRenderer.on('settings-changed', (event, { key, value }) => {
    if (key === 'alwaysOnTop') {
        noteData.alwaysOnTop = value;
        save();
    } else {
        updateFontSettings(key, value);
    }
});

// Font update listener
ipcRenderer.on('fonts-updated', (event, fonts) => {
    loadCustomFonts(fonts);
});

ipcRenderer.on('appearance-changed', (event, { key, value }) => {
    noteData.appearance[key] = value;
    applyAppearance();
    save();
});

ipcRenderer.on('global-settings-changed', (event, settings) => {
    noteData.appearance = { ...noteData.appearance, ...settings.appearance };
    applyAppearance();
});

ipcRenderer.on('color-changed', (event, newColor) => {
    noteContainer.classList.remove(...colors);
    noteContainer.classList.add(newColor);
    noteData.color = newColor;
    if (noteData.appearance.opacity < 100) applyAppearance(); // Re-apply opacity if needed
    save();
});

ipcRenderer.on('force-save', () => {
    save();
});

ipcRenderer.on('storage-changed', (event, newPath) => {
    alert('Carpeta cambiada a: ' + newPath + '\nLos cambios se aplicarán en el próximo inicio o nota.');
});


// Font Settings Helper
function updateFontSettings(key, value) {
    noteData.fontSettings[key] = value;
    applyFontSettings();
    save();
}

// (Removed old HTML input listeners as they are replaced by native menu)
// fontSelect... btnBold... etc. no longer needed for INPUT, but their VARIABLES might be missing if I deleted them from HTML.
// I should remove the HTML elements from index.html first, then this code.
// For now, these listeners will just fail silently or simply likely not fire since elements might be hidden/removed.
// I will just remove the explicit listeners for the HTML elements.

// --- Smarter Save Logic ---
let lastSavedContent = '';

function shouldTriggerSave(current) {
    if (current === lastSavedContent) return false;
    if (current.length === 0) return true;

    const lastChar = current.slice(-1);

    // Condition: Enter / New Line
    if (lastChar === '\n') return true;

    // Condition: Two spaces
    if (current.endsWith('  ')) return true;

    // Condition: Special characters or punctuation
    if (/[.,!?;:()=+-]/.test(lastChar)) return true;

    // Condition: Space after word, save every 2 words approximately
    if (lastChar === ' ') {
        const wordsCount = current.trim().split(/\s+/).length;
        if (wordsCount % 2 === 0) return true;
    }

    return false;
}

// Event Listeners (Refined)
textarea.addEventListener('input', () => {
    const content = textarea.value;
    if (shouldTriggerSave(content)) {
        noteData.content = content;
        save();
        lastSavedContent = content;
    }
});

// For Checklist, we apply similar logic to each input
function attachChecklistSaveListener(input, items) {
    input.addEventListener('input', () => {
        const content = input.value;
        if (shouldTriggerSave(content)) {
            updateContentFromChecklist(items);
            lastSavedContent = content; // Approximate
        }
    });
}

// (We need to update renderChecklist to use this helper)

// Color Change (Double click on drag handle)
document.querySelector('.note-header').addEventListener('dblclick', (e) => {
    if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') {
        const currentColor = noteData.color;
        let nextIndex = (colors.indexOf(currentColor) + 1) % colors.length;
        const nextColor = colors[nextIndex];

        noteContainer.classList.remove(...colors);
        noteContainer.classList.add(nextColor);
        noteData.color = nextColor;
        save();
    }
});

btnAdd.addEventListener('click', () => {
    ipcRenderer.send('create-new-note', {
        fromNoteId: noteId,
        fontSettings: noteData.fontSettings
    });
});

btnClose.addEventListener('click', () => {
    ipcRenderer.send('delete-note', noteId);
});

function save() {
    ipcRenderer.send('update-note-data', {
        id: noteId,
        content: noteData.content,
        color: noteData.color,
        type: noteData.type,
        title: noteData.title,
        fontSettings: noteData.fontSettings,
        alwaysOnTop: noteData.alwaysOnTop,
        appearance: noteData.appearance
    });
}

// Trigger initial save on load as requested
setTimeout(() => {
    save();
    lastSavedContent = noteData.content;
}, 1000);
// Context Menu
window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    ipcRenderer.send('show-context-menu', {
        noteId,
        fontSettings: noteData.fontSettings
    });
});
