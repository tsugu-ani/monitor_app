'use strict';

// ===== トレンドタブ =====

const trendStartInput  = document.getElementById('trend-start');
const trendEndInput    = document.getElementById('trend-end');
const trendSearchBtn   = document.getElementById('trend-search-btn');
const trendNoData      = document.getElementById('trend-no-data');
const trendListEl      = document.getElementById('trend-list');
const trendFieldPanel  = document.getElementById('trend-field-panel');

let trendChart       = null;
let trendInitialized = false;

// VITAL_GROUPS は app.js で定義済み
const VITAL_ITEMS_FLAT = VITAL_GROUPS.flatMap(g => g.items);

const CHART_COLORS = [
    '#2563eb', '#dc2626', '#16a34a', '#d97706',
    '#7c3aed', '#0891b2', '#db2777', '#65a30d',
    '#ea580c', '#0284c7',
];

// ===== 項目チップ初期化 =====

function initTrendFieldChips() {
    let colorIndex = 0;
    VITAL_GROUPS.forEach(({ title, items }) => {
        const group = document.createElement('div');
        group.className = 'trend-chip-group';

        const groupLabel = document.createElement('div');
        groupLabel.className = 'trend-chip-group-label';
        groupLabel.textContent = title;
        group.appendChild(groupLabel);

        const chipRow = document.createElement('div');
        chipRow.className = 'trend-chip-row';

        items.forEach(({ key, label }) => {
            const color = CHART_COLORS[colorIndex % CHART_COLORS.length];
            colorIndex++;

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
                loadTrend();
            });

            chip.appendChild(cb);
            chip.appendChild(document.createTextNode(label));
            chipRow.appendChild(chip);
        });

        group.appendChild(chipRow);
        trendFieldPanel.appendChild(group);
    });

    // デフォルト: 心拍数を選択
    const firstCb = trendFieldPanel.querySelector('input[type="checkbox"]');
    if (firstCb) {
        firstCb.checked = true;
        const chip = firstCb.closest('.trend-chip');
        const color = firstCb.dataset.color;
        chip.classList.add('is-checked');
        chip.style.backgroundColor = `${color}18`;
    }
}

function getSelectedItems() {
    return Array.from(trendFieldPanel.querySelectorAll('input[type="checkbox"]:checked'))
        .map(cb => {
            const item = VITAL_ITEMS_FLAT.find(i => i.key === cb.value);
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

async function initTrendDefaults() {
    const now = new Date();
    setDatetimeInput(trendEndInput, now);

    const pad = n => String(n).padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;

    try {
        const records = await fetchRecords(todayStr, 500);
        if (records.length > 0) {
            // DESC 順で返るので末尾が最古
            const oldest = new Date(records[records.length - 1].recorded_at);
            setDatetimeInput(trendStartInput, oldest);
        } else {
            const startOfDay = new Date(now);
            startOfDay.setHours(0, 0, 0, 0);
            setDatetimeInput(trendStartInput, startOfDay);
        }
    } catch {
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);
        setDatetimeInput(trendStartInput, startOfDay);
    }
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

    if (!trendStartInput.value || !trendEndInput.value) return;

    const startISO = localToISO(trendStartInput.value);
    const endISO   = localToISO(trendEndInput.value);

    trendListEl.innerHTML = '<p class="trend-loading">読み込み中...</p>';
    trendNoData.classList.add('hidden');

    try {
        const records = await fetchRecords('', 500, startISO, endISO);

        // 少なくとも1つの選択項目に値があるレコードのみ
        const filtered = records.filter(r =>
            selectedItems.some(item => r[item.key] !== null && r[item.key] !== undefined)
        );

        if (filtered.length === 0) {
            trendListEl.innerHTML = '';
            trendNoData.classList.remove('hidden');
            clearChart();
            return;
        }

        renderTrendChart(filtered, selectedItems);
        renderTrendList(filtered, selectedItems);
    } catch {
        trendListEl.innerHTML = '<p class="trend-loading">読み込みに失敗しました</p>';
    }
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

    [...records].reverse().forEach(r => {
        const dt      = new Date(r.recorded_at);
        const timeStr = dt.toLocaleString('ja-JP', {
            month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit',
        });

        const el = document.createElement('div');

        if (isSingle) {
            const val = r[singleItem.key];
            if (val === null || val === undefined) return;
            el.className = 'trend-list-item';
            el.innerHTML = `
                <span class="trend-list-time">${timeStr}</span>
                <span class="trend-list-value" style="color:${singleItem.color}">${formatValue(val)}</span>
                <span class="trend-list-unit">${singleItem.unit}</span>`;
        } else {
            el.className = 'trend-list-item-multi';
            const valParts = selectedItems.map(si => {
                const v = r[si.key];
                if (v === null || v === undefined) return '';
                return `<span class="trend-list-multi-val">
                    <span class="trend-list-multi-label" style="color:${si.color}">${si.label}</span>
                    <span class="trend-list-multi-num">${formatValue(v)}</span>
                    <span class="trend-list-multi-unit">${si.unit}</span>
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

// トレンドタブが初めてクリックされたときに初期化
document.querySelectorAll('.tab-btn[data-tab="trend"]').forEach(btn => {
    btn.addEventListener('click', () => {
        if (!trendInitialized) {
            trendInitialized = true;
            initTrendDefaults().then(loadTrend);
        }
    });
});

// 初期化
initTrendFieldChips();
