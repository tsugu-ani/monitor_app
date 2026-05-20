'use strict';

// ===== トレンドタブ =====

const trendStartInput   = document.getElementById('trend-start');
const trendEndInput     = document.getElementById('trend-end');
const trendSearchBtn    = document.getElementById('trend-search-btn');
const trendNoData       = document.getElementById('trend-no-data');
const trendListEl       = document.getElementById('trend-list');
const trendListUnitsEl  = document.getElementById('trend-list-units');
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

function setDatetimeInput(input, date) {
    const pad = n => String(n).padStart(2, '0');
    input.value = `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localToISO(datetimeLocalStr) {
    if (!datetimeLocalStr) return '';
    return new Date(datetimeLocalStr).toISOString();
}

// ===== デフォルト期間設定 =====

function initTrendDefaults() {
    const now = new Date();
    setDatetimeInput(trendEndInput, now);

    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    setDatetimeInput(trendStartInput, startOfDay);
}

// ===== データ取得・表示 =====

async function loadTrend() {
    const selectedItems = getSelectedItems();
    if (selectedItems.length === 0) {
        trendListEl.innerHTML = '<p class="trend-loading">項目を選択してください</p>';
        trendListUnitsEl.innerHTML = '';
        trendNoData.classList.add('hidden');
        clearChart();
        return;
    }

    if (!trendStartInput.value || !trendEndInput.value) return;

    const startISO = localToISO(trendStartInput.value);
    const endISO   = localToISO(trendEndInput.value);
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
        trendListUnitsEl.innerHTML = '';
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
    const first    = new Date(records[0].recorded_at);
    const last     = new Date(records[records.length - 1].recorded_at);
    const multiDay = first.toDateString() !== last.toDateString();

    const labels = records.map(r => {
        const dt = new Date(r.recorded_at);
        return multiDay
            ? dt.toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
            : dt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    });

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

// ===== 一覧（新しい順） =====

function renderTrendList(records, selectedItems) {
    trendListEl.innerHTML = '';
    const isSingle = selectedItems.length === 1;
    const singleItem = selectedItems[0];

    // ヘッダーに単位サマリーを表示
    trendListUnitsEl.innerHTML = selectedItems.map(si =>
        `<span class="trend-list-unit-tag">
            <span class="trend-list-unit-dot" style="background:${si.color}"></span>
            ${si.label} (${si.unit})
        </span>`
    ).join('');

    [...records].reverse().forEach(r => {
        const dt = new Date(r.recorded_at);
        const timeStr = dt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

        const el = document.createElement('div');

        if (isSingle) {
            const val = r[singleItem.key];
            if (val === null || val === undefined) return;
            el.className = 'trend-list-item';
            el.innerHTML = `
                <span class="trend-list-time">${timeStr}</span>
                <span class="trend-list-value" style="color:${singleItem.color}">${formatValue(val)}</span>`;
        } else {
            el.className = 'trend-list-item-multi';
            const valParts = selectedItems.map(si => {
                const v = r[si.key];
                if (v === null || v === undefined) return '';
                return `<span class="trend-list-multi-val">
                    <span class="trend-list-multi-label" style="color:${si.color}">${si.label}</span>
                    <span class="trend-list-multi-num">${formatValue(v)}</span>
                </span>`;
            }).filter(Boolean).join('');
            if (!valParts) return;
            el.innerHTML = `
                <div class="trend-list-multi-time">${timeStr}</div>
                <div class="trend-list-multi-values">${valParts}</div>`;
        }

        trendListEl.appendChild(el);
    });
}

// ===== イベントリスナー =====

trendSearchBtn.addEventListener('click', loadTrend);

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
    if (!trendStartInput.value || !trendEndInput.value) return;
    const patId = (typeof currentPatient !== 'undefined' && currentPatient) ? currentPatient.id : '';
    try {
        const records = await fetchRecords('', 500, localToISO(trendStartInput.value), localToISO(trendEndInput.value), patId);
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
    const start = trendStartInput.value ? new Date(trendStartInput.value) : null;
    if (start && new Date(record.recorded_at) < start) return;

    trendRecordsCache.push(record);
    trendRecordsCache.sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at));
    // 終了時刻を新しいレコードに合わせて延長（次回「更新」時に漏れなく取得するため）
    setDatetimeInput(trendEndInput, new Date(record.recorded_at));
}

// 初期化
initTrendFieldChips();
prefetchTrend();
