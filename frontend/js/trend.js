'use strict';

// ===== トレンドタブ =====

const trendFieldSelect = document.getElementById('trend-field-select');
const trendStartInput  = document.getElementById('trend-start');
const trendEndInput    = document.getElementById('trend-end');
const trendSearchBtn   = document.getElementById('trend-search-btn');
const trendNoData      = document.getElementById('trend-no-data');
const trendListEl      = document.getElementById('trend-list');

let trendChart       = null;
let trendInitialized = false;

// VITAL_GROUPS は app.js で定義済み（app.js の後に読み込まれる）
const VITAL_ITEMS_FLAT = VITAL_GROUPS.flatMap(g => g.items);

// ===== 項目セレクタ初期化 =====

function initTrendFieldSelect() {
    VITAL_GROUPS.forEach(({ title, items }) => {
        const og = document.createElement('optgroup');
        og.label = title;
        items.forEach(({ key, label, unit }) => {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = `${label}（${unit}）`;
            og.appendChild(opt);
        });
        trendFieldSelect.appendChild(og);
    });
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

    // 今日の記録を取得して最初の計測時刻を開始時刻に設定
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
    if (!trendStartInput.value || !trendEndInput.value) return;

    const key  = trendFieldSelect.value;
    const item = VITAL_ITEMS_FLAT.find(i => i.key === key);
    if (!item) return;

    const startISO = localToISO(trendStartInput.value);
    const endISO   = localToISO(trendEndInput.value);

    trendListEl.innerHTML = '<p class="trend-loading">読み込み中...</p>';
    trendNoData.classList.add('hidden');

    try {
        const records = await fetchRecords('', 500, startISO, endISO);

        // 選択項目に値があるもの（ASC順で返る）
        const filtered = records.filter(r => r[key] !== null && r[key] !== undefined);

        if (filtered.length === 0) {
            trendListEl.innerHTML = '';
            trendNoData.classList.remove('hidden');
            clearChart();
            return;
        }

        renderTrendChart(filtered, item);
        renderTrendList(filtered, item);
    } catch {
        trendListEl.innerHTML = '<p class="trend-loading">読み込みに失敗しました</p>';
    }
}

// ===== グラフ =====

function renderTrendChart(records, item) {
    const first    = new Date(records[0].recorded_at);
    const last     = new Date(records[records.length - 1].recorded_at);
    const multiDay = first.toDateString() !== last.toDateString();

    const labels = records.map(r => {
        const dt = new Date(r.recorded_at);
        return multiDay
            ? dt.toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
            : dt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    });
    const data = records.map(r => r[item.key]);

    if (trendChart) {
        trendChart.data.labels                   = labels;
        trendChart.data.datasets[0].data         = data;
        trendChart.data.datasets[0].label        = `${item.label}（${item.unit}）`;
        trendChart.options.plugins.tooltip.callbacks.label = ctx => `${ctx.parsed.y} ${item.unit}`;
        trendChart.update();
        return;
    }

    const ctx = document.getElementById('trend-chart').getContext('2d');
    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: `${item.label}（${item.unit}）`,
                data,
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.07)',
                borderWidth: 2.5,
                tension: 0.35,
                pointRadius: 5,
                pointHoverRadius: 7,
                fill: true,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => `${ctx.parsed.y} ${item.unit}`,
                    },
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

function renderTrendList(records, item) {
    trendListEl.innerHTML = '';
    [...records].reverse().forEach(r => {
        const val     = r[item.key];
        const dt      = new Date(r.recorded_at);
        const timeStr = dt.toLocaleString('ja-JP', {
            month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit',
        });
        const el = document.createElement('div');
        el.className = 'trend-list-item';
        el.innerHTML = `
            <span class="trend-list-time">${timeStr}</span>
            <span class="trend-list-value">${formatValue(val)}</span>
            <span class="trend-list-unit">${item.unit}</span>`;
        trendListEl.appendChild(el);
    });
}

// ===== イベントリスナー =====

trendSearchBtn.addEventListener('click', loadTrend);
trendFieldSelect.addEventListener('change', loadTrend);

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
initTrendFieldSelect();
