const { ipcRenderer } = require('electron');

// Get note ID from query args
// Electron passes arguments as process.argv in some configs, or we can parse window.location
// In this case, I passed `additionalArguments: ['--noteId=...']`
const noteIdArg = process.argv.find(arg => arg.startsWith('--noteId='));
const noteId = noteIdArg ? noteIdArg.split('=')[1] : 'default';

const colors = ['theme-yellow', 'theme-blue', 'theme-pink', 'theme-green'];
const noteContainer = document.getElementById('sticky-note');
const textarea = document.getElementById('note-text');
const checklistContainer = document.getElementById('note-checklist');
const btnClose = document.getElementById('btn-close');
const btnAdd = document.getElementById('btn-add');
const btnToggle = document.getElementById('btn-toggle-mode');

let currentMode = 'text'; // 'text' or 'checklist'
let noteData = { content: '', color: 'theme-yellow', type: 'text' };

// Initialize
(async () => {
    // Fetch initial data from Main
    const data = await ipcRenderer.invoke('get-note-data', noteId);
    if (data) {
        noteData = data;
        applyState();
    }
})();

function applyState() {
    // Set Color
    noteContainer.classList.remove(...colors);
    noteContainer.classList.add(noteData.color);

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

// --- Toggle Logic ---

function textToChecklist(text) {
    // Converts "Line 1\nLine 2" -> [{text: "Line 1", checked: false}, ...]
    // If line starts with " - [x] ", it is checked.
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
    // Converts internal array -> String with markdown-ish format
    return items.map(item => {
        return `- [${item.checked ? 'x' : ' '}] ${item.text}`;
    }).join('\n');
}


function renderChecklist(contentString) {
    checklistContainer.innerHTML = '';
    const items = textToChecklist(contentString);

    // Always ensure at least one empty item if list is empty, so user can start typing
    if (items.length === 0) {
        items.push({ text: '', checked: false });
    }

    items.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = `checklist-item ${item.checked ? 'completed' : ''}`;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = item.checked;
        checkbox.addEventListener('change', () => {
            items[index].checked = checkbox.checked;
            updateContentFromChecklist(items);
            if (checkbox.checked) row.classList.add('completed');
            else row.classList.remove('completed');
        });

        const input = document.createElement('input');
        input.type = 'text';
        input.value = item.text;
        input.placeholder = '...';

        // Update model on input
        input.addEventListener('input', () => {
            items[index].text = input.value;
            // Don't save on every keystroke to avoid perf issues? 
            // Actually, we need to save to keep 'content' sync
            // updateContentFromChecklist(items); -> Let's debounce or just save
            // Just updating the local 'items' array is enough, we save on blur or specific actions?
            // User requested "no funciona", maybe it was losing focus. 
            // We will save only on blur or mode switch? No, we need persistence.
            // Let's rely on a delayed save.
            updateContentFromChecklist(items);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                // Add new item below
                items.splice(index + 1, 0, { text: '', checked: false });
                updateContentFromChecklist(items);
                renderChecklist(checklistToText(items));

                // Focus the next input
                setTimeout(() => {
                    const inputs = checklistContainer.querySelectorAll('input[type="text"]');
                    if (inputs[index + 1]) inputs[index + 1].focus();
                }, 0);
            }
            else if (e.key === 'Backspace' && input.value === '') {
                // Remove item if empty and backspace pressed (unless it's the only one)
                if (items.length > 1) {
                    e.preventDefault();
                    items.splice(index, 1);
                    updateContentFromChecklist(items);
                    renderChecklist(checklistToText(items));

                    // Focus previous input
                    setTimeout(() => {
                        const inputs = checklistContainer.querySelectorAll('input[type="text"]');
                        const prevIdx = index - 1;
                        if (inputs[prevIdx]) {
                            inputs[prevIdx].focus();
                            // Optional: Move cursor to end
                        }
                    }, 0);
                }
            }
            else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const inputs = checklistContainer.querySelectorAll('input[type="text"]');
                if (inputs[index - 1]) inputs[index - 1].focus();
            }
            else if (e.key === 'ArrowDown') {
                e.preventDefault();
                const inputs = checklistContainer.querySelectorAll('input[type="text"]');
                if (inputs[index + 1]) inputs[index + 1].focus();
            }
        });

        row.appendChild(checkbox);
        row.appendChild(input);
        checklistContainer.appendChild(row);
    });

    // Add a click listener to the container background to focus the last empty item or create new one?
    // Actually, sticky note style, usually you just click and verify.
}

function updateContentFromChecklist(items) {
    const text = checklistToText(items);
    noteData.content = text;
    save();
}

btnToggle.addEventListener('click', () => {
    if (currentMode === 'text') {
        // Switch to Checklist
        currentMode = 'checklist';
        noteData.content = textarea.value;
        renderChecklist(noteData.content);
        textarea.classList.add('hidden');
        checklistContainer.classList.remove('hidden');
    } else {
        // Switch to Text
        currentMode = 'text';
        // Content is already up to date via updateContentFromChecklist
        textarea.value = noteData.content;
        checklistContainer.classList.add('hidden');
        textarea.classList.remove('hidden');
    }
    noteData.type = currentMode;
    save();
});

// --- Event Listeners ---

// Text Input
textarea.addEventListener('input', () => {
    noteData.content = textarea.value;
    save();
});

// Color Change (Double click header)
document.querySelector('.drag-handle').addEventListener('dblclick', () => {
    const currentColor = noteData.color;
    let nextIndex = (colors.indexOf(currentColor) + 1) % colors.length;
    const nextColor = colors[nextIndex];

    noteContainer.classList.remove(...colors);
    noteContainer.classList.add(nextColor);
    noteData.color = nextColor;
    save();
});

// Add Button
btnAdd.addEventListener('click', () => {
    ipcRenderer.send('create-new-note', noteId);
});

// Close Button
btnClose.addEventListener('click', () => {
    ipcRenderer.send('delete-note', noteId);
});

function save() {
    ipcRenderer.send('update-note-data', {
        id: noteId,
        content: noteData.content,
        color: noteData.color,
        type: noteData.type
    });
}
