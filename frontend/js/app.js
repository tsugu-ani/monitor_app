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

// ===== タブ切り替え =====
const tabBtns   = document.querySelectorAll('.tab-btn');
const tabPanels = {
    capture: document.getElementById('tab-capture'),
    history: document.getElementById('tab-history'),
    trend:   document.getElementById('tab-trend'),
};

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        tabBtns.forEach(b => {
            b.classList.toggle('active', b === btn);
            b.setAttribute('aria-selected', b === btn);
        });
        Object.entries(tabPanels).forEach(([key, panel]) => {
            panel.classList.toggle('hidden', key !== tab);
        });
    });
});

// ===== 初期化 =====
buildVitalGrid();
initMonitorSelect();
loadHistory();

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
        if (result.record_saved_at) {
            prependRecord({
                id: result.record_id || null,
                ...result.data,
                recorded_at: result.record_saved_at,
                monitor_type: result.monitor_type || null,
            });
        }
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

// ===== 編集モーダル =====
const editModal         = document.getElementById('edit-modal');
const editModalBackdrop = document.getElementById('edit-modal-backdrop');
const editModalClose    = document.getElementById('edit-modal-close');
const editModalBody     = document.getElementById('edit-modal-body');
const editSaveBtn       = document.getElementById('edit-save-btn');
const editCancelBtn     = document.getElementById('edit-cancel-btn');

let editingRecord = null;
let editingCard   = null;

const recordsMap = new Map(); // id -> record

function openEditModal(record, card) {
    editingRecord = { ...record };
    editingCard   = card;
    buildEditForm(record);
    editModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeEditModal() {
    editModal.classList.add('hidden');
    document.body.style.overflow = '';
    editingRecord = null;
    editingCard   = null;
}

editModalClose.addEventListener('click', closeEditModal);
editModalBackdrop.addEventListener('click', closeEditModal);
editCancelBtn.addEventListener('click', closeEditModal);

function buildEditForm(record) {
    editModalBody.innerHTML = '';

    VITAL_GROUPS.forEach(({ title, items }) => {
        const group = document.createElement('div');
        group.className = 'edit-group';

        const groupTitle = document.createElement('div');
        groupTitle.className = 'edit-group-title';
        groupTitle.textContent = title;
        group.appendChild(groupTitle);

        const grid = document.createElement('div');
        grid.className = 'edit-grid';

        items.forEach(({ key, label, unit }) => {
            const val = record[key];
            const inputVal = (val !== null && val !== undefined) ? formatValue(val) : '';

            const field = document.createElement('div');
            field.className = 'edit-field';
            field.innerHTML = `
                <span class="edit-field-label">${label}</span>
                <div class="edit-field-row">
                    <input class="edit-field-input" type="number" step="any"
                           data-key="${key}" value="${inputVal}" placeholder="---">
                    <span class="edit-field-unit">${unit}</span>
                </div>`;
            grid.appendChild(field);
        });

        group.appendChild(grid);
        editModalBody.appendChild(group);
    });

    // notes は DOM 操作でセット（XSS 対策）
    const notesGroup = document.createElement('div');
    notesGroup.className = 'edit-group';

    const notesTitle = document.createElement('div');
    notesTitle.className = 'edit-group-title';
    notesTitle.textContent = '補足情報';

    const notesArea = document.createElement('textarea');
    notesArea.className = 'edit-notes-area';
    notesArea.dataset.key = 'notes';
    notesArea.placeholder = '補足情報を入力...';
    notesArea.rows = 3;
    notesArea.value = record.notes || '';

    notesGroup.appendChild(notesTitle);
    notesGroup.appendChild(notesArea);
    editModalBody.appendChild(notesGroup);
}

editSaveBtn.addEventListener('click', async () => {
    if (!editingRecord) return;

    editSaveBtn.disabled = true;
    editSaveBtn.textContent = '保存中...';

    const updates = {};
    editModalBody.querySelectorAll('[data-key]').forEach(el => {
        const key = el.dataset.key;
        if (el.tagName === 'TEXTAREA') {
            updates[key] = el.value.trim() || null;
        } else {
            const v = el.value.trim();
            updates[key] = v === '' ? null : parseFloat(v);
        }
    });

    try {
        await updateRecord(editingRecord.id, updates);
        const updatedRecord = { ...editingRecord, ...updates };
        recordsMap.set(editingRecord.id, updatedRecord);
        const newCard = buildHistoryCard(updatedRecord);
        editingCard.replaceWith(newCard);
        closeEditModal();
    } catch (err) {
        alert(err.message || '保存に失敗しました');
    } finally {
        editSaveBtn.disabled = false;
        editSaveBtn.textContent = '保存';
    }
});

// ===== 撮影記録 =====
const historyList   = document.getElementById('history-list');
const historyDateEl = document.getElementById('history-date');
const datePrevBtn   = document.getElementById('date-prev');
const dateNextBtn   = document.getElementById('date-next');

// 今日の日付を YYYY-MM-DD 形式で返す（ローカル時刻）
function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// 日付ピッカーを今日で初期化
historyDateEl.value = todayStr();

// 前日・翌日ボタン
datePrevBtn.addEventListener('click', () => shiftDate(-1));
dateNextBtn.addEventListener('click', () => shiftDate(+1));

function shiftDate(delta) {
    const d = new Date(historyDateEl.value);
    d.setDate(d.getDate() + delta);
    historyDateEl.value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    loadHistory();
}

// 日付変更時に再読み込み
historyDateEl.addEventListener('change', loadHistory);

// 編集ボタンのイベント委任
historyList.addEventListener('click', e => {
    const btn = e.target.closest('.history-edit-btn');
    if (!btn) return;
    const id = btn.dataset.recordId;
    const record = recordsMap.get(id);
    if (record) openEditModal(record, btn.closest('.history-card'));
});

async function loadHistory() {
    historyList.innerHTML = '<p class="history-loading">読み込み中...</p>';
    const records = await fetchRecords(historyDateEl.value);
    if (!records.length) {
        historyList.innerHTML = '<p class="history-empty">この日の記録はありません</p>';
        return;
    }
    historyList.innerHTML = '';

    // 時間単位でグループ化（DESC 順を維持）
    const hourGroups = new Map();
    records.forEach(r => {
        const hour = new Date(r.recorded_at).getHours();
        if (!hourGroups.has(hour)) hourGroups.set(hour, []);
        hourGroups.get(hour).push(r);
    });
    hourGroups.forEach((recs, hour) => historyList.appendChild(buildHourBlock(hour, recs)));
}

function prependRecord(record) {
    if (historyDateEl.value !== todayStr()) return;
    const empty = historyList.querySelector('.history-empty, .history-loading');
    if (empty) empty.remove();

    const hour = new Date(record.recorded_at).getHours();
    const existingBlock = historyList.querySelector(`.history-hour-block[data-hour="${hour}"]`);
    if (existingBlock) {
        const cardsWrapper = existingBlock.querySelector('.history-hour-cards');
        const firstCard = cardsWrapper.querySelector('.history-card');
        cardsWrapper.insertBefore(buildHistoryCard(record), firstCard || null);
    } else {
        historyList.insertBefore(buildHourBlock(hour, [record]), historyList.firstChild);
    }
}

function buildHourBlock(hour, records) {
    const block = document.createElement('div');
    block.className = 'history-hour-block';
    block.dataset.hour = String(hour);

    const header = document.createElement('div');
    header.className = 'history-hour-header';
    header.textContent = `${String(hour).padStart(2, '0')}時台`;
    block.appendChild(header);

    const cardsWrapper = document.createElement('div');
    cardsWrapper.className = 'history-hour-cards';
    records.forEach(r => cardsWrapper.appendChild(buildHistoryCard(r)));
    block.appendChild(cardsWrapper);
    return block;
}

function buildHistoryCard(record) {
    if (record.id) recordsMap.set(record.id, record);

    const card = document.createElement('div');
    card.className = 'history-card';

    const dt = new Date(record.recorded_at);
    const timeStr = dt.toLocaleString('ja-JP', {
        month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
    });

    const label = getMonitorLabel(record.monitor_type);
    const badgeHtml = label ? `<span class="history-badge">${label}</span>` : '';

    const editBtnHtml = record.id ? `
        <button class="history-edit-btn" data-record-id="${record.id}" type="button" aria-label="修正">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
        </button>` : '';

    const gridHtml = VITAL_GROUPS.map(({ title, items }) => {
        const itemsHtml = items.map(({ key, label, unit }) => {
            const val = record[key];
            const hasValue = val !== null && val !== undefined;
            const display = hasValue
                ? `${formatValue(val)}<span class="hav-unit">${unit}</span>`
                : '---';
            return `<div class="hav-item">
                <span class="hav-label">${label}</span>
                <span class="hav-value${hasValue ? '' : ' is-null'}">${display}</span>
            </div>`;
        }).join('');
        return `<div class="hav-group-title">${title}</div>${itemsHtml}`;
    }).join('');

    card.innerHTML = `
        <div class="history-meta">
            <span class="history-time">${timeStr}</span>
            ${badgeHtml}
            ${editBtnHtml}
        </div>
        <div class="history-all-vitals">${gridHtml}</div>`;
    return card;
}

function getMonitorLabel(id) {
    if (!id) return null;
    const opt = monitorOptions.find(o => o.id === id);
    if (opt) return opt.label;
    const fallback = { fukuda_am140: 'Bio-Scope AM140', drager_vista300: 'Vista 300 + Atlan A100' };
    return fallback[id] ?? id;
}

// ===== エラー表示 =====
function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.classList.remove('hidden');
}

function hideError() {
    errorBanner.classList.add('hidden');
}
