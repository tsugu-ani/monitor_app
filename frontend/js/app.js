'use strict';

// ===== バイタル項目定義 =====
const VITAL_GROUPS = [
    {
        id: 'group-vitals',
        title: '基本バイタル',
        items: [
            { key: 'heart_rate',        label: '心拍数',        unit: 'bpm'    },
            { key: 'bp_systolic',       label: '血圧（収縮期）', unit: 'mmHg'  },
            { key: 'bp_mean',           label: '血圧（平均）',   unit: 'mmHg'  },
            { key: 'bp_diastolic',      label: '血圧（拡張期）', unit: 'mmHg'  },
            { key: 'respiratory_rate',  label: '呼吸数',        unit: '回/分'  },
            { key: 'spo2',              label: 'SpO2',          unit: '%'      },
            { key: 'etco2',             label: 'EtCO2',         unit: 'mmHg'  },
            { key: 'body_temperature',  label: '体温',          unit: '°C'    },
        ],
    },
    {
        id: 'group-respiratory',
        title: '呼吸器・麻酔器',
        items: [
            { key: 'tidal_volume',          label: '1回換気量',     unit: 'mL'      },
            { key: 'minute_ventilation',    label: '分時換気量',     unit: 'L/min'   },
            { key: 'peak_airway_pressure',  label: '最高気道内圧',   unit: 'cmH2O'   },
            { key: 'iso_dial',              label: 'ISOダイヤル',    unit: '%'       },
            { key: 'iso_inspired',          label: 'ISO In（吸気）', unit: '%'       },
            { key: 'iso_expired',           label: 'ISO Et（呼気）', unit: '%'       },
            { key: 'gas_flow_o2',           label: 'ガス流量 O2',    unit: 'L/min'   },
            { key: 'gas_flow_air',          label: 'ガス流量 Air',   unit: 'L/min'   },
            { key: 'fio2',                  label: 'FiO2',          unit: '%'       },
        ],
    },
];

// ===== DOM 参照 =====
const video        = document.getElementById('video');
const canvas       = document.getElementById('canvas');
const captureBtn   = document.getElementById('capture-btn');
const cameraError  = document.getElementById('camera-error');
const overlay      = document.getElementById('analyzing-overlay');
const errorBanner  = document.getElementById('error-banner');
const resultsEl    = document.getElementById('results');
const captureTime  = document.getElementById('capture-time');
const notesCard    = document.getElementById('notes-card');
const notesText    = document.getElementById('notes-text');

const camera = new Camera(video, canvas);

// ===== 初期化 =====
async function init() {
    buildResultsDOM();
    await startCamera();
}

async function startCamera() {
    try {
        await camera.start();
    } catch (err) {
        showCameraError(err);
    }
}

// ===== 結果表示 DOM 構築 =====
function buildResultsDOM() {
    const container = document.getElementById('vital-groups');
    VITAL_GROUPS.forEach(({ id, title, items }) => {
        const group = document.createElement('div');
        group.className = 'vital-group';
        group.innerHTML = `<h2 class="group-title">${title}</h2>`;

        const list = document.createElement('ul');
        list.className = 'vital-list';

        items.forEach(({ key, label, unit }) => {
            const li = document.createElement('li');
            li.className = 'vital-item';
            li.dataset.key = key;
            li.innerHTML = `
                <span class="vital-label">${label}</span>
                <span class="vital-reading">
                    <span class="vital-value is-null">---</span>
                    <span class="vital-unit">${unit}</span>
                </span>`;
            list.appendChild(li);
        });

        group.appendChild(list);
        container.appendChild(group);
    });
}

// ===== 撮影・解析 =====
captureBtn.addEventListener('click', async () => {
    if (!camera.isActive) return;

    setAnalyzing(true);
    hideError();

    try {
        const blob = await camera.capture();
        const result = await analyzeImage(blob);
        renderResults(result.data);
        captureTime.textContent = `撮影: ${new Date().toLocaleTimeString('ja-JP')}`;
        resultsEl.classList.remove('hidden');
        resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
        showError(err.message || '解析中にエラーが発生しました');
    } finally {
        setAnalyzing(false);
    }
});

// ===== 結果レンダリング =====
function renderResults(data) {
    if (!data) return;

    VITAL_GROUPS.forEach(({ items }) => {
        items.forEach(({ key }) => {
            const li = resultsEl.querySelector(`[data-key="${key}"]`);
            if (!li) return;
            const valueEl = li.querySelector('.vital-value');
            const val = data[key];
            if (val === null || val === undefined) {
                valueEl.textContent = '---';
                valueEl.classList.add('is-null');
            } else {
                valueEl.textContent = formatValue(val);
                valueEl.classList.remove('is-null');
            }
        });
    });

    if (data.notes) {
        notesText.textContent = data.notes;
        notesCard.classList.remove('hidden');
    } else {
        notesCard.classList.add('hidden');
    }
}

function formatValue(val) {
    if (typeof val !== 'number') return String(val);
    return Number.isInteger(val) ? String(val) : val.toFixed(1);
}

// ===== UI 状態管理 =====
function setAnalyzing(active) {
    captureBtn.disabled = active;
    overlay.classList.toggle('hidden', !active);
}

function showCameraError(err) {
    let msg = 'カメラにアクセスできませんでした。';
    if (err.name === 'NotAllowedError') {
        msg += 'ブラウザの設定でカメラの許可を有効にしてください。';
    } else if (err.name === 'NotFoundError') {
        msg += 'カメラが見つかりません。';
    } else {
        msg += err.message;
    }
    cameraError.querySelector('p').textContent = msg;
    cameraError.classList.remove('hidden');
    captureBtn.disabled = true;
}

function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.classList.remove('hidden');
}

function hideError() {
    errorBanner.classList.add('hidden');
}

// ===== 起動 =====
init();
