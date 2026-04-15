'use strict';

// ===== バイタル項目定義 =====
const VITAL_GROUPS = [
    {
        title: '基本バイタル',
        items: [
            { key: 'heart_rate',       label: '心拍数',        unit: 'bpm'    },
            { key: 'bp_systolic',      label: '血圧（収縮期）', unit: 'mmHg'  },
            { key: 'bp_mean',          label: '血圧（平均）',   unit: 'mmHg'  },
            { key: 'bp_diastolic',     label: '血圧（拡張期）', unit: 'mmHg'  },
            { key: 'respiratory_rate', label: '呼吸数',        unit: '回/分'  },
            { key: 'spo2',             label: 'SpO2',          unit: '%'      },
            { key: 'etco2',            label: 'EtCO2',         unit: 'mmHg'  },
            { key: 'body_temperature', label: '体温',          unit: '°C'    },
        ],
    },
    {
        title: '呼吸器・麻酔器',
        items: [
            { key: 'tidal_volume',         label: '1回換気量',     unit: 'mL'     },
            { key: 'minute_ventilation',   label: '分時換気量',    unit: 'L/min'  },
            { key: 'peak_airway_pressure', label: '最高気道内圧',  unit: 'cmH2O'  },
            { key: 'iso_dial',             label: 'ISOダイヤル',   unit: '%'      },
            { key: 'iso_inspired',         label: 'ISO In（吸気）',unit: '%'      },
            { key: 'iso_expired',          label: 'ISO Et（呼気）',unit: '%'      },
            { key: 'gas_flow_o2',          label: 'ガス流量 O2',   unit: 'L/min'  },
            { key: 'gas_flow_air',         label: 'ガス流量 Air',  unit: 'L/min'  },
            { key: 'fio2',                 label: 'FiO2',          unit: '%'      },
        ],
    },
];

// ===== DOM 参照 =====
const captureBtn        = document.getElementById('capture-btn');
const errorBanner       = document.getElementById('error-banner');
const captureTime       = document.getElementById('capture-time');
const detectedMonitor   = document.getElementById('detected-monitor');
const notesCard         = document.getElementById('notes-card');
const notesText         = document.getElementById('notes-text');
const modal             = document.getElementById('camera-modal');
const modalBackdrop     = document.getElementById('modal-backdrop');
const modalClose        = document.getElementById('modal-close');
const shutterBtn        = document.getElementById('shutter-btn');
const video             = document.getElementById('video');
const canvas            = document.getElementById('canvas');
const cameraErrorEl     = document.getElementById('camera-error');
const analyzingOverlay  = document.getElementById('analyzing-overlay');

const camera = new Camera(video, canvas);

// ===== 初期化 =====
buildVitalGrid();
initMonitorSelect();

// ===== モニター種別セレクタ初期化 =====
const monitorSelect = document.getElementById('monitor-select');
let monitorOptions = [];  // 自動検出ラベルの解決に使用

async function initMonitorSelect() {
    monitorOptions = await fetchMonitorOptions();
    monitorOptions.forEach(({ id, label }) => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = label;
        monitorSelect.appendChild(opt);
    });
}

// ===== バイタルグリッド構築（常時表示） =====
function buildVitalGrid() {
    const container = document.getElementById('vital-groups');

    VITAL_GROUPS.forEach(({ title, items }) => {
        const group = document.createElement('div');
        group.className = 'vital-group';

        const heading = document.createElement('h2');
        heading.className = 'group-title';
        heading.textContent = title;
        group.appendChild(heading);

        const grid = document.createElement('div');
        grid.className = 'vital-grid';

        items.forEach(({ key, label, unit }) => {
            const card = document.createElement('div');
            card.className = 'vital-card';
            card.dataset.key = key;
            card.innerHTML = `
                <span class="vital-label">${label}</span>
                <div class="vital-value-row">
                    <span class="vital-value">---</span>
                    <span class="vital-unit">${unit}</span>
                </div>`;
            grid.appendChild(card);
        });

        group.appendChild(grid);
        container.appendChild(group);
    });
}

// ===== モーダル制御 =====
function openModal() {
    hideError();
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    cameraErrorEl.classList.add('hidden');
    analyzingOverlay.classList.add('hidden');
    shutterBtn.disabled = false;

    camera.start().catch((err) => {
        let msg = 'カメラにアクセスできませんでした。';
        if (err.name === 'NotAllowedError') {
            msg += 'ブラウザの設定でカメラの許可を有効にしてください。';
        } else if (err.name === 'NotFoundError') {
            msg += 'カメラが見つかりません。';
        } else {
            msg += err.message;
        }
        cameraErrorEl.querySelector('p').textContent = msg;
        cameraErrorEl.classList.remove('hidden');
        shutterBtn.disabled = true;
    });
}

function closeModal() {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
    camera.stop();
}

captureBtn.addEventListener('click', openModal);
modalClose.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', closeModal);

// ===== 撮影・解析 =====
shutterBtn.addEventListener('click', async () => {
    shutterBtn.disabled = true;
    analyzingOverlay.classList.remove('hidden');

    try {
        const blob = await camera.capture();
        const monitorType = monitorSelect.value || '';
        const result = await analyzeImage(blob, monitorType);
        closeModal();
        renderResults(result.data);
        captureTime.textContent = `最終撮影: ${new Date().toLocaleTimeString('ja-JP')}`;
        renderDetectedMonitor(result.auto_detected, result.monitor_type);
    } catch (err) {
        closeModal();
        showError(err.message || '解析中にエラーが発生しました');
    }
    // finally は不要（closeModal 後はモーダルが非表示のため）
});

// ===== 結果レンダリング =====
function renderResults(data) {
    if (!data) return;

    VITAL_GROUPS.forEach(({ items }) => {
        items.forEach(({ key }) => {
            const card = document.querySelector(`.vital-card[data-key="${key}"]`);
            if (!card) return;
            const valueEl = card.querySelector('.vital-value');
            const val = data[key];

            if (val === null || val === undefined) {
                valueEl.textContent = '---';
                valueEl.className = 'vital-value is-null';
            } else {
                valueEl.textContent = formatValue(val);
                valueEl.className = 'vital-value has-value';
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

// ===== 自動検出バッジ =====
function renderDetectedMonitor(autoDetected, monitorTypeId) {
    if (!autoDetected || !monitorTypeId) {
        detectedMonitor.classList.add('hidden');
        return;
    }
    const option = monitorOptions.find(o => o.id === monitorTypeId);
    const label = option ? option.label : monitorTypeId;
    detectedMonitor.textContent = `自動検出: ${label}`;
    detectedMonitor.classList.remove('hidden');
}

// ===== エラー表示 =====
function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.classList.remove('hidden');
}

function hideError() {
    errorBanner.classList.add('hidden');
}
