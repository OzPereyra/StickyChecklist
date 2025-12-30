const { ipcRenderer } = require('electron');

const scaleSlider = document.getElementById('scale-slider');
const scaleVal = document.getElementById('scale-val');
const opacitySlider = document.getElementById('opacity-slider');
const opacityVal = document.getElementById('opacity-val');
const radiusSlider = document.getElementById('radius-slider');
const radiusVal = document.getElementById('radius-val');
const styleBtns = document.querySelectorAll('.style-btn');
const closeBtn = document.getElementById('close-btn');

let currentSettings = {};

// Load initial settings
(async () => {
    currentSettings = await ipcRenderer.invoke('get-global-settings');
    updateUI();
})();

function updateUI() {
    const { appearance } = currentSettings;

    scaleSlider.value = appearance.scale || 1.0;
    scaleVal.innerText = (appearance.scale || 1.0).toFixed(1);

    opacitySlider.value = appearance.opacity || 100;
    opacityVal.innerText = (appearance.opacity || 100) + '%';

    radiusSlider.value = appearance.borderRadius || 12;
    radiusVal.innerText = (appearance.borderRadius || 12) + 'px';

    setActiveBtn(styleBtns, appearance.colorType || 'style-gradient');
}

function setActiveBtn(btns, value) {
    btns.forEach(btn => {
        if (btn.dataset.val == value) btn.classList.add('active');
        else btn.classList.remove('active');
    });
}

function notifyChange() {
    ipcRenderer.send('update-global-settings', currentSettings);
}

scaleSlider.addEventListener('input', () => {
    currentSettings.appearance.scale = parseFloat(scaleSlider.value);
    scaleVal.innerText = currentSettings.appearance.scale.toFixed(1);
    notifyChange();
});

opacitySlider.addEventListener('input', () => {
    currentSettings.appearance.opacity = parseInt(opacitySlider.value);
    opacityVal.innerText = currentSettings.appearance.opacity + '%';
    notifyChange();
});

radiusSlider.addEventListener('input', () => {
    currentSettings.appearance.borderRadius = parseInt(radiusSlider.value);
    radiusVal.innerText = currentSettings.appearance.borderRadius + 'px';
    notifyChange();
});

styleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        currentSettings.appearance.colorType = btn.dataset.val;
        setActiveBtn(styleBtns, currentSettings.appearance.colorType);
        notifyChange();
    });
});

closeBtn.addEventListener('click', () => {
    ipcRenderer.send('close-appearance-settings');
});
