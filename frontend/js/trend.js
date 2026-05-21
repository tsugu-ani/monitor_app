'use strict';

// ===== トレンドタブ =====

const trendDateInput    = document.getElementById('trend-date');
const trendDatePrevBtn  = document.getElementById('trend-date-prev');
const trendDateNextBtn  = document.getElementById('trend-date-next');
const trendStartTimeEl  = document.getElementById('trend-start-time');
const trendEndTimeEl    = document.getElementById('trend-end-time');
const trendSearchBtn    = document.getElementById('trend-search-btn');
const trendNoData       = document.getElementById('trend-no-data');
const trendListEl       = document.getElementById('trend-list');
const trendFieldPanel   = document.getElementById('trend-field-panel');
const trendLabelToggle  = document.getElementById('trend-label-toggle');

let trendChart          = null;
let trendInitialized    = false;
let trendRecordsCache   = null;
let showDataLabels      = false;

// ===== データラベルプラグイン（Chart.js 組み込み） =====
const dataLabelsPlugin = {
    id: 'customDataLabels',
    afterDatasetsDraw(chart) {
        if (!showDataLabels) return;
        const ctx = chart.ctx;
        chart.data.datasets.forEach((dataset, i) => {
            const meta = chart.getDatasetMeta(i);
            if (meta.hidden) return;
            ctx.save();
            ctx.font = 'bold 10px -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            meta.data.forEach((point, j) => {
                const value = dataset.data[j];
                if (value === null || value === undefined) return;
                const text = Number.isInteger(value) ? String(value) : value.toFixed(1);
                const x = point.x;
                const y = point.y - 5;
                const w = ctx.measureText(text).width;
                ctx.fillStyle = 'rgba(255,255,255,0.82)';
                ctx.fillRect(x - w / 2 - 2, y - 12, w + 4, 13);
                ctx.fillStyle = dataset.borderColor;
                ctx.fillText(text, x, y);
            });
            ctx.restore();
        });
    },
};

const TREND_ITEMS = [
    { key: 'heart_rate',       label: '心拍数',      unit: 'bpm',   defaultOn: true  },
    { key: 'bp_mean',          label: '血圧（平均）', unit: 'mmHg',  defaultOn: true  },
    { key: 'respiratory_rate', label: '呼吸数',       unit: '回/分', defaultOn: true  },
    { key: 'body_temperature', label: '体温',         unit: '°C',   defaultOn: true  },
    { key: 'bp_systolic',      label: 'P1 (観血測定平均)', unit: 'mmHg', defaultOn: false },
    { key: 'bp_diastolic',     label: 'P2 (観血測定平均)', unit: 'mmHg', defaultOn: false },
    { key: 'spo2',             label: 'SpO2',         unit: '%',     defaultOn: false },
    { key: 'etco2',            label: 'EtCO2',        unit: 'mmHg',  defaultOn: false },
];

const CHART_COLORS = [
    '#2563eb', '#dc2626', '#16a34a', '#d97706',
    '#7c3aed', '#0891b2', '#db2777', '#059669',
];

// ===== 項目チップ初期化 =====

function initTrendFieldChips() {
    const chipRow = document.createElement('div');
    chipRow.className = 'trend-chip-row';

    TREND_ITEMS.forEach(({ key, label }, i) => {
        const color = CHART_COLORS[i];

        const chip = document.createElement('label');
        chip.className = 'trend-chip';
        chip.style.setProperty('--chip-color', color);

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = key;
        cb.dataset.color = color;
        cb.addEventListener('change', () => {
            chip.classList.toggle('is-checked', cb.checked);
            chip.style.backgroundColor = cb.checked ? `${color}18` : '';
            if (trendRecordsCache) {
                renderFromCache(getSelectedItems());
            } else {
                loadTrend();
            }
        });

        chip.appendChild(cb);
        chip.appendChild(document.createTextNode(label));
        chipRow.appendChild(chip);
    });

    trendFieldPanel.appendChild(chipRow);

    // デフォルト: defaultOn の項目のみ選択
    trendFieldPanel.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        const item = TREND_ITEMS.find(i => i.key === cb.value);
        if (!item?.defaultOn) return;
        cb.checked = true;
        const chip = cb.closest('.trend-chip');
        chip.classList.add('is-checked');
        chip.style.backgroundColor = `${cb.dataset.color}18`;
    });
}

function getSelectedItems() {
    return Array.from(trendFieldPanel.querySelectorAll('input[type="checkbox"]:checked'))
        .map(cb => {
            const item = TREND_ITEMS.find(i => i.key === cb.value);
            return item ? { ...item, color: cb.dataset.color } : null;
        })
        .filter(Boolean);
}

// ===== 日時ユーティリティ =====

const pad2 = n => String(n).padStart(2, '0');

function dateToYMD(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}

function dateToHM(d) {
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// 日付（YYYY-MM-DD）と時刻（HH:MM）を ISO 文字列へ
function dateTimeToISO(dateStr, timeStr) {
    if (!dateStr || !timeStr) return '';
    return new Date(`${dateStr}T${timeStr}:00`).toISOString();
}

// ===== デフォルト期間設定 =====

function initTrendDefaults() {
    const now = new Date();
    trendDateInput.value    = dateToYMD(now);
    trendStartTimeEl.value  = '00:00';
    trendEndTimeEl.value    = '23:59';
}

// 前日・翌日ボタン
function shiftTrendDate(delta) {
    const d = new Date(trendDateInput.value);
    d.setDate(d.getDate() + delta);
    trendDateInput.value = dateToYMD(d);
    loadTrend();
}

// ===== データ取得・表示 =====

async function loadTrend() {
    const selectedItems = getSelectedItems();
    if (selectedItems.length === 0) {
        trendListEl.innerHTML = '<p class="trend-loading">項目を選択してください</p>';
        trendNoData.classList.add('hidden');
        clearChart();
        return;
    }

    if (!trendDateInput.value || !trendStartTimeEl.value || !trendEndTimeEl.value) return;

    const startISO = dateTimeToISO(trendDateInput.value, trendStartTimeEl.value);
    const endISO   = dateTimeToISO(trendDateInput.value, trendEndTimeEl.value);
    const patId    = (typeof currentPatient !== 'undefined' && currentPatient) ? currentPatient.id : '';

    trendListEl.innerHTML = '<p class="trend-loading">読み込み中...</p>';
    trendNoData.classList.add('hidden');

    try {
        const records = await fetchRecords('', 500, startISO, endISO, patId);
        trendRecordsCache = records;
        renderFromCache(selectedItems);
    } catch {
        trendListEl.innerHTML = '<p class="trend-loading">読み込みに失敗しました</p>';
    }
}

function renderFromCache(selectedItems) {
    if (!trendRecordsCache) return;

    // 少なくとも1つの選択項目に値があるレコードのみ
    const filtered = trendRecordsCache.filter(r =>
        selectedItems.some(item => r[item.key] !== null && r[item.key] !== undefined)
    );

    if (filtered.length === 0) {
        trendListEl.innerHTML = '';
        trendNoData.classList.remove('hidden');
        clearChart();
        return;
    }

    trendNoData.classList.add('hidden');
    renderTrendChart(filtered, selectedItems);
    renderTrendList(filtered, selectedItems);
}

// ===== グラフ =====

function renderTrendChart(records, selectedItems) {
    const labels = records.map(r =>
        new Date(r.recorded_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
    );

    const datasets = selectedItems.map(item => ({
        label: `${item.label}（${item.unit}）`,
        data: records.map(r => {
            const v = r[item.key];
            return (v !== null && v !== undefined) ? v : null;
        }),
        borderColor: item.color,
        backgroundColor: `${item.color}12`,
        borderWidth: 2,
        tension: 0.3,
        pointRadius: records.length > 30 ? 2 : 4,
        pointHoverRadius: 6,
        fill: selectedItems.length === 1,
        spanGaps: true,
    }));

    const tooltipLabelCb = ctx => {
        const si = selectedItems[ctx.datasetIndex];
        const v = ctx.parsed.y;
        return v === null ? null : `${si.label}: ${v} ${si.unit}`;
    };

    if (trendChart) {
        trendChart.data.labels   = labels;
        trendChart.data.datasets = datasets;
        trendChart.options.plugins.legend.display = selectedItems.length > 1;
        trendChart.options.plugins.tooltip.callbacks.label = tooltipLabelCb;
        trendChart.update();
        return;
    }

    const ctx = document.getElementById('trend-chart').getContext('2d');
    trendChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        plugins: [dataLabelsPlugin],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: selectedItems.length > 1,
                    labels: { font: { size: 11 }, boxWidth: 14, padding: 10 },
                },
                tooltip: {
                    callbacks: { label: tooltipLabelCb },
                },
            },
            scales: {
                x: {
                    ticks: { maxTicksLimit: 6, font: { size: 11 }, color: '#64748b' },
                    grid:  { color: 'rgba(0,0,0,0.05)' },
                },
                y: {
                    beginAtZero: false,
                    ticks: { font: { size: 11 }, color: '#64748b' },
                    grid:  { color: 'rgba(0,0,0,0.05)' },
                },
            },
        },
    });
}

function clearChart() {
    if (trendChart) {
        trendChart.destroy();
        trendChart = null;
    }
}

// ===== 一覧（時刻昇順） =====
// 行が項目、列が時刻のテーブル形式で表示する。
// 1列目に「項目名 (単位)」を表示し、各列ヘッダーに時刻を表示する。
// 1列目はスティッキーで横スクロール時もラベルが見えるようにする。

function renderTrendList(records, selectedItems) {
    trendListEl.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'trend-list-table-wrapper';

    const table = document.createElement('table');
    table.className = 'trend-list-table';

    // ヘッダー行: 左上コーナー + 各時刻
    const timeHeaders = records.map(r => {
        const t = new Date(r.recorded_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        return `<th class="trend-th-time">${t}</th>`;
    }).join('');
    const thead = document.createElement('thead');
    thead.innerHTML = `<tr><th class="trend-th-corner"></th>${timeHeaders}</tr>`;
    table.appendChild(thead);

    // データ行: 項目ごとに横方向の値リスト
    const tbody = document.createElement('tbody');
    selectedItems.forEach(si => {
        const cells = records.map(r => {
            const v = r[si.key];
            if (v === null || v === undefined) return '<td class="trend-td-null">---</td>';
            return `<td class="trend-td-num">${formatValue(v)}</td>`;
        }).join('');
        const tr = document.createElement('tr');
        tr.innerHTML = `<th class="trend-th-item" style="color:${si.color}">${si.label} (${si.unit})</th>${cells}`;
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    wrapper.appendChild(table);
    trendListEl.appendChild(wrapper);
}

// ===== イベントリスナー =====

trendSearchBtn.addEventListener('click', loadTrend);
trendDatePrevBtn.addEventListener('click', () => shiftTrendDate(-1));
trendDateNextBtn.addEventListener('click', () => shiftTrendDate(+1));
trendDateInput.addEventListener('change', loadTrend);

trendLabelToggle.addEventListener('click', () => {
    showDataLabels = !showDataLabels;
    trendLabelToggle.classList.toggle('is-on', showDataLabels);
    if (trendChart) trendChart.update();
});

// トレンドタブが開かれたときの描画
document.querySelectorAll('.tab-btn[data-tab="trend"]').forEach(btn => {
    btn.addEventListener('click', () => {
        if (trendRecordsCache !== null) {
            // プリフェッチ済み → 即座に描画（API 呼び出しなし）
            renderFromCache(getSelectedItems());
        } else if (!trendInitialized) {
            // プリフェッチ未開始（通常は起きない）
            trendInitialized = true;
            initTrendDefaults();
            loadTrend();
        } else {
            // プリフェッチ進行中 → ローディング表示（完了時に自動描画）
            trendListEl.innerHTML = '<p class="trend-loading">読み込み中...</p>';
        }
    });
});

// ===== バックグラウンドプリフェッチ =====
// ページ読み込み直後にデータ取得を開始し、タブを開いたときのレイテンシをゼロにする

async function prefetchTrend() {
    initTrendDefaults();
    trendInitialized = true;
    const startISO = dateTimeToISO(trendDateInput.value, trendStartTimeEl.value);
    const endISO   = dateTimeToISO(trendDateInput.value, trendEndTimeEl.value);
    if (!startISO || !endISO) return;
    const patId = (typeof currentPatient !== 'undefined' && currentPatient) ? currentPatient.id : '';
    try {
        const records = await fetchRecords('', 500, startISO, endISO, patId);
        trendRecordsCache = records;
        // タブが既に表示中なら即座に描画
        if (!document.getElementById('tab-trend').classList.contains('hidden')) {
            renderFromCache(getSelectedItems());
        }
    } catch { /* 失敗時はタブを開いたときに loadTrend() で再試行 */ }
}

// ===== 撮影後のリアルタイム反映 =====
// app.js から呼び出す: 新規レコードをキャッシュに追記して再 fetch を不要にする

function trendPushRecord(record) {
    if (!trendRecordsCache) return;
    // 選択中の日付と異なる日のレコードは反映しない
    const recDate = new Date(record.recorded_at);
    if (dateToYMD(recDate) !== trendDateInput.value) return;
    // 開始時刻より前のレコードは無視
    if (trendStartTimeEl.value && dateToHM(recDate) < trendStartTimeEl.value) return;

    trendRecordsCache.push(record);
    trendRecordsCache.sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at));
    // 終了時刻を新しいレコードに合わせて延長（短縮はしない。次回「更新」時に漏れなく取得するため）
    const recHM = dateToHM(recDate);
    if (recHM > trendEndTimeEl.value) trendEndTimeEl.value = recHM;
}

// 初期化
initTrendFieldChips();
prefetchTrend();
