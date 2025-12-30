const { ipcRenderer, clipboard } = require('electron');

const noteIdArg = process.argv.find(arg => arg.startsWith('--noteId='));
const noteId = noteIdArg ? noteIdArg.split('=')[1] : 'default';

const colors = ['theme-yellow', 'theme-blue', 'theme-pink', 'theme-green'];
const noteContainer = document.getElementById('sticky-note');
const noteTitleInput = document.getElementById('note-title');
const textarea = document.getElementById('note-text');
const checklistContainer = document.getElementById('note-checklist');
const btnClose = document.getElementById('btn-close');
const btnAdd = document.getElementById('btn-add');
const btnToggle = document.getElementById('btn-toggle-mode');

// New Controls
const btnCopy = document.getElementById('btn-copy');
const btnPaste = document.getElementById('btn-paste');
const btnSettings = document.getElementById('btn-settings');
const settingsMenu = document.getElementById('settings-menu');

// Settings Inputs
const fontSelect = document.getElementById('font-family');
const fontSizeInput = document.getElementById('font-size');
const btnBold = document.getElementById('btn-bold');
const btnItalic = document.getElementById('btn-italic');
const btnUnderline = document.getElementById('btn-underline');


let currentMode = 'text'; // 'text' or 'checklist'
let noteData = {
    content: '',
    color: 'theme-yellow',
    type: 'text',
    title: 'Sticky Checklist',
    fontSettings: {
        family: "'Outfit', sans-serif",
        size: 16,
        bold: false,
        italic: false,
        underline: false
    }
};

// Initialize
(async () => {
    const data = await ipcRenderer.invoke('get-note-data', noteId);
    if (data) {
        // Merge defaults if missing (just in case)
        noteData = { ...noteData, ...data };
        if (!noteData.fontSettings) noteData.fontSettings = { family: "'Outfit', sans-serif", size: 16 };
        applyState();
    }
})();

function applyState() {
    // Set Color
    noteContainer.classList.remove(...colors);
    noteContainer.classList.add(noteData.color);

    // Set Title
    noteTitleInput.value = noteData.title || 'Sticky Checklist';

    // Set Font Settings
    applyFontSettings();

    // Set Settings Menu Values
    fontSelect.value = noteData.fontSettings.family;
    fontSizeInput.value = noteData.fontSettings.size;
    if (noteData.fontSettings.bold) btnBold.classList.add('active');
    if (noteData.fontSettings.italic) btnItalic.classList.add('active');
    if (noteData.fontSettings.underline) btnUnderline.classList.add('active');


    // Set Content & Mode
    currentMode = noteData.type || 'text';

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
            // Debounce logic could go here, but frequent small saves are okay for local file
            updateContentFromChecklist(items);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                items.splice(index + 1, 0, { text: '', checked: false });
                updateContentFromChecklist(items);
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

// Copy
btnCopy.addEventListener('click', () => {
    const selectedText = window.getSelection().toString();
    if (selectedText) {
        clipboard.writeText(selectedText);
    } else {
        clipboard.writeText(noteData.content); // Copy all content
    }
});

// Paste
btnPaste.addEventListener('click', () => {
    const text = clipboard.readText();
    if (!text) return;

    if (currentMode === 'text') {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;

        // If cursor not focused or active, maybe append? 
        // User asked "pegar en donde este el puntero o en caso de no tener el puntero... pegar en una nueva linea".
        // Note: textarea.selectionStart works even if not focused, usually 0 or last pos.
        // We will insert at selection.

        const currentVal = textarea.value;
        const newVal = currentVal.substring(0, start) + text + currentVal.substring(end);

        // If selection start/end are 0 and length is 0, append new line? 
        // Just standard paste behavior satisfies "at pointer". 
        // "Si no tener el puntero en alguna parte... nueva linea".
        // If we want to simulate "new line" if not focused? Hard to tell if "not focused".
        // Let's assume standard insert is fine, maybe ensure focus.
        textarea.focus();

        // Executing insert
        // document.execCommand('insertText') is better for history but deprecated. 
        // Direct value manipulation modifies history. 
        // Let's simple value mod:
        textarea.value = newVal;
        textarea.selectionStart = textarea.selectionEnd = start + text.length;

        noteData.content = textarea.value;
        save();
    } else {
        // Checklist Paste
        // Add new items from text
        const newItems = textToChecklist(text);
        // Append? Or Insert? 
        // Simpler to append for now or map to current list.
        const currentText = noteData.content + (noteData.content.endsWith('\n') ? '' : '\n') + text;
        noteData.content = currentText;
        renderChecklist(noteData.content);
        save();
    }
});

// Settings Toggle
btnSettings.addEventListener('click', (e) => {
    e.stopPropagation();
    settingsMenu.classList.toggle('hidden');
});

// Close settings if clicked outside
document.addEventListener('click', (e) => {
    if (!settingsMenu.contains(e.target) && e.target !== btnSettings) {
        settingsMenu.classList.add('hidden');
    }
});

// Font Settings Listeners
function updateFontSettings(key, value) {
    noteData.fontSettings[key] = value;
    applyFontSettings();
    save();
}

fontSelect.addEventListener('change', (e) => updateFontSettings('family', e.target.value));
fontSizeInput.addEventListener('change', (e) => updateFontSettings('size', e.target.value));

btnBold.addEventListener('click', () => {
    noteData.fontSettings.bold = !noteData.fontSettings.bold;
    btnBold.classList.toggle('active');
    updateFontSettings('bold', noteData.fontSettings.bold);
});
btnItalic.addEventListener('click', () => {
    noteData.fontSettings.italic = !noteData.fontSettings.italic;
    btnItalic.classList.toggle('active');
    updateFontSettings('italic', noteData.fontSettings.italic);
});
btnUnderline.addEventListener('click', () => {
    noteData.fontSettings.underline = !noteData.fontSettings.underline;
    btnUnderline.classList.toggle('active');
    updateFontSettings('underline', noteData.fontSettings.underline);
});

// Event Listeners (Existing)
textarea.addEventListener('input', () => {
    noteData.content = textarea.value;
    save();
});

// Color Change (Double click on drag handle) -> User asked to drag using button. 
// Color change was convenience. Let's keep it on the handle button? 
// Or general header? Header is no longer a drag region. 
// New drag handle is `#btn-drag`.
// Let's attach double click to the general header background?
document.querySelector('.note-header').addEventListener('dblclick', (e) => {
    // Avoid double clicking buttons triggers color change
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
    ipcRenderer.send('create-new-note', noteId);
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
        fontSettings: noteData.fontSettings
    });
}
