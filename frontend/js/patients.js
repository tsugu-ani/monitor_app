'use strict';

// ===== 患者管理タブ & 患者選択モーダル =====

const patientsList        = document.getElementById('patients-list');
const newPatientBtn       = document.getElementById('new-patient-btn');

// 患者選択モーダル
const patientSelectModal  = document.getElementById('patient-select-modal');
const patientSelectClose  = document.getElementById('patient-select-close');
const patientSelectBdrop  = document.getElementById('patient-select-backdrop');
const patientClearBtn     = document.getElementById('patient-clear-btn');
const patientSelectList   = document.getElementById('patient-select-list');

// 患者編集モーダル
const patientEditModal    = document.getElementById('patient-edit-modal');
const patientEditClose    = document.getElementById('patient-edit-close');
const patientEditBdrop    = document.getElementById('patient-edit-backdrop');
const patientEditTitle    = document.getElementById('patient-edit-title');
const patientEditBody     = document.getElementById('patient-edit-body');
const patientEditSaveBtn  = document.getElementById('patient-edit-save');
const patientEditDeleteBtn = document.getElementById('patient-edit-delete');
const patientEditCancelBtn = document.getElementById('patient-edit-cancel');

const SPECIES_OPTIONS = ['犬', '猫', 'その他'];

let editingPatient = null;   // null = 新規
let patientsCache  = [];     // 最後に取得した患者リスト

// ===== 患者管理タブ =====

async function loadPatients() {
    patientsList.innerHTML = '<p class="patients-loading">読み込み中...</p>';
    patientsCache = await fetchPatients();
    renderPatientList();
}

function renderPatientList() {
    if (!patientsCache.length) {
        patientsList.innerHTML = '<p class="patients-empty">登録された患者はいません</p>';
        return;
    }
    patientsList.innerHTML = '';
    patientsCache.forEach(p => patientsList.appendChild(buildPatientCard(p)));
}

function buildPatientCard(patient) {
    const card = document.createElement('div');
    card.className = 'patient-card' + (currentPatient?.id === patient.id ? ' is-selected' : '');
    card.dataset.patientId = patient.id;

    const speciesLabel = patient.species ? `<span class="patient-species-tag">${patient.species}</span>` : '';
    const chartNum  = patient.chart_number != null ? `<span class="patient-meta-item">#${patient.chart_number}</span>` : '';
    const weight    = patient.body_weight  != null ? `<span class="patient-meta-item">${patient.body_weight} kg</span>` : '';
    const selectedBadge = currentPatient?.id === patient.id
        ? '<span class="patient-selected-badge">選択中</span>' : '';

    card.innerHTML = `
        <div class="patient-card-main">
            <div class="patient-card-name-row">
                ${speciesLabel}
                <span class="patient-card-name">${patient.name}</span>
                ${selectedBadge}
            </div>
            <div class="patient-card-meta">${chartNum}${weight}</div>
        </div>
        <div class="patient-card-actions">
            <button class="patient-select-card-btn" data-patient-id="${patient.id}" type="button">選択</button>
            <button class="patient-edit-card-btn" data-patient-id="${patient.id}" type="button" aria-label="編集">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
            </button>
        </div>`;
    return card;
}

// イベント委任で患者カードのボタンを処理
patientsList.addEventListener('click', e => {
    const selBtn  = e.target.closest('.patient-select-card-btn');
    const editBtn = e.target.closest('.patient-edit-card-btn');

    if (selBtn) {
        const p = patientsCache.find(x => x.id === selBtn.dataset.patientId);
        if (p) { setCurrentPatient(p); renderPatientList(); }
    } else if (editBtn) {
        const p = patientsCache.find(x => x.id === editBtn.dataset.patientId);
        if (p) openPatientEditModal(p);
    }
});

newPatientBtn.addEventListener('click', () => openPatientEditModal(null));

// ===== 患者選択モーダル（ヘッダーから呼ばれる） =====

function openPatientSelectModal() {
    renderPatientSelectList();
    patientSelectModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closePatientSelectModal() {
    patientSelectModal.classList.add('hidden');
    document.body.style.overflow = '';
}

function renderPatientSelectList() {
    patientSelectList.innerHTML = '';
    if (!patientsCache.length) {
        patientSelectList.innerHTML = '<p class="patients-loading">患者が登録されていません</p>';
        return;
    }
    patientsCache.forEach(p => {
        const item = document.createElement('button');
        item.className = 'patient-select-item' + (currentPatient?.id === p.id ? ' is-selected' : '');
        item.type = 'button';

        const speciesTag = p.species ? `<span class="patient-species-tag">${p.species}</span>` : '';
        const sub = [
            p.chart_number != null ? `#${p.chart_number}` : null,
            p.body_weight  != null ? `${p.body_weight} kg` : null,
        ].filter(Boolean).join(' · ');

        item.innerHTML = `
            <div class="patient-select-item-inner">
                <div class="patient-select-name-row">${speciesTag}<span class="patient-select-name">${p.name}</span></div>
                ${sub ? `<div class="patient-select-sub">${sub}</div>` : ''}
            </div>
            ${currentPatient?.id === p.id ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}`;

        item.addEventListener('click', () => {
            setCurrentPatient(p);
            renderPatientList();
            closePatientSelectModal();
        });
        patientSelectList.appendChild(item);
    });
}

patientSelectClose.addEventListener('click', closePatientSelectModal);
patientSelectBdrop.addEventListener('click', closePatientSelectModal);

patientClearBtn.addEventListener('click', () => {
    setCurrentPatient(null);
    renderPatientList();
    closePatientSelectModal();
});

// ===== 患者編集モーダル =====

function openPatientEditModal(patient) {
    editingPatient = patient;
    patientEditTitle.textContent = patient ? '患者情報を編集' : '患者を登録';
    patientEditDeleteBtn.classList.toggle('hidden', !patient);
    buildPatientEditForm(patient);
    patientEditModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closePatientEditModal() {
    patientEditModal.classList.add('hidden');
    document.body.style.overflow = '';
    editingPatient = null;
}

function buildPatientEditForm(patient) {
    patientEditBody.innerHTML = '';

    const group = document.createElement('div');
    group.className = 'edit-group';

    const fields = [
        { key: 'name',         label: '名前',     inputType: 'text',   required: true  },
        { key: 'chart_number', label: 'カルテ番号', inputType: 'number', step: '1'       },
        { key: 'body_weight',  label: '体重',     inputType: 'number', step: 'any', unit: 'kg' },
    ];

    fields.forEach(({ key, label, inputType, step, unit, required }) => {
        const val = patient ? patient[key] : null;
        const inputVal = (val !== null && val !== undefined) ? String(val) : '';

        const field = document.createElement('div');
        field.className = 'edit-field';

        const labelEl = document.createElement('span');
        labelEl.className = 'edit-field-label';
        labelEl.textContent = label + (required ? ' *' : '');

        const rowEl = document.createElement('div');
        rowEl.className = 'edit-field-row';

        const input = document.createElement('input');
        input.className = 'edit-field-input';
        input.type = inputType;
        if (step) input.step = step;
        input.dataset.key = key;
        input.value = inputVal;
        input.placeholder = '---';
        if (required) input.required = true;

        const unitEl = document.createElement('span');
        unitEl.className = 'edit-field-unit';
        unitEl.textContent = unit || '';

        rowEl.appendChild(input);
        rowEl.appendChild(unitEl);
        field.appendChild(labelEl);
        field.appendChild(rowEl);
        group.appendChild(field);
    });

    // 種別セレクト
    const speciesField = document.createElement('div');
    speciesField.className = 'edit-field';
    const speciesLabel = document.createElement('span');
    speciesLabel.className = 'edit-field-label';
    speciesLabel.textContent = '種別';
    const speciesRow = document.createElement('div');
    speciesRow.className = 'edit-field-row';
    const speciesSelect = document.createElement('select');
    speciesSelect.className = 'patient-species-select';
    speciesSelect.dataset.key = 'species';
    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = '---';
    speciesSelect.appendChild(emptyOpt);
    SPECIES_OPTIONS.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        if (patient?.species === s) opt.selected = true;
        speciesSelect.appendChild(opt);
    });
    speciesRow.appendChild(speciesSelect);
    speciesField.appendChild(speciesLabel);
    speciesField.appendChild(speciesRow);
    group.appendChild(speciesField);

    patientEditBody.appendChild(group);
}

patientEditClose.addEventListener('click', closePatientEditModal);
patientEditBdrop.addEventListener('click', closePatientEditModal);
patientEditCancelBtn.addEventListener('click', closePatientEditModal);

patientEditSaveBtn.addEventListener('click', async () => {
    patientEditSaveBtn.disabled = true;
    patientEditSaveBtn.textContent = '保存中...';

    const data = {};
    patientEditBody.querySelectorAll('[data-key]').forEach(el => {
        const key = el.dataset.key;
        if (el.tagName === 'SELECT') {
            data[key] = el.value || null;
        } else if (el.type === 'text') {
            data[key] = el.value.trim() || null;
        } else {
            const v = el.value.trim();
            data[key] = v === '' ? null : Number(v);
        }
    });

    if (!data.name) {
        alert('名前は必須です');
        patientEditSaveBtn.disabled = false;
        patientEditSaveBtn.textContent = '保存';
        return;
    }

    try {
        let saved;
        if (editingPatient) {
            saved = await updatePatient(editingPatient.id, data);
            const idx = patientsCache.findIndex(p => p.id === editingPatient.id);
            if (idx >= 0) patientsCache[idx] = saved;
            // 現在選択中の患者が更新された場合は状態も更新
            if (currentPatient?.id === saved.id) {
                currentPatient = saved;
                localStorage.setItem(PATIENT_STORAGE_KEY, JSON.stringify(saved));
                renderPatientSelector();
            }
        } else {
            saved = await createPatient(data);
            patientsCache.push(saved);
            patientsCache.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
        }
        renderPatientList();
        closePatientEditModal();
    } catch (err) {
        alert(err.message || '保存に失敗しました');
    } finally {
        patientEditSaveBtn.disabled = false;
        patientEditSaveBtn.textContent = '保存';
    }
});

patientEditDeleteBtn.addEventListener('click', async () => {
    if (!editingPatient) return;
    if (!confirm(`「${editingPatient.name}」を削除しますか？\n関連する撮影記録のリンクは解除されますが、記録自体は残ります。`)) return;

    patientEditDeleteBtn.disabled = true;
    patientEditDeleteBtn.textContent = '削除中...';

    try {
        await deletePatient(editingPatient.id);
        patientsCache = patientsCache.filter(p => p.id !== editingPatient.id);
        // 選択中の患者を削除した場合はクリア
        if (currentPatient?.id === editingPatient.id) {
            setCurrentPatient(null);
        }
        renderPatientList();
        closePatientEditModal();
    } catch (err) {
        alert(err.message || '削除に失敗しました');
    } finally {
        patientEditDeleteBtn.disabled = false;
        patientEditDeleteBtn.textContent = '削除';
    }
});

// ===== 初期化 =====
// ページ読み込み時にバックグラウンドで患者一覧をプリフェッチ
(async () => {
    patientsCache = await fetchPatients();
    // 患者管理タブが表示中なら描画
    if (!document.getElementById('tab-patients').classList.contains('hidden')) {
        renderPatientList();
    }
})();
