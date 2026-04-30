'use strict';

async function fetchMonitorOptions() {
    const res = await fetch('/api/monitors');
    if (!res.ok) return [];
    const json = await res.json();
    return json.monitors || [];
}

async function fetchRecords(date = '', limit = 200, start = '', end = '') {
    const params = new URLSearchParams({ limit });
    if (date)  params.set('date', date);
    if (start) params.set('start', start);
    if (end)   params.set('end', end);
    const res = await fetch(`/api/records?${params}`);
    if (!res.ok) return [];
    return res.json();
}

async function updateRecord(id, data) {
    const res = await fetch(`/api/records/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.detail || `更新エラー (${res.status})`);
    return json;
}

async function analyzeImage(blob, monitorType = '') {
    const formData = new FormData();
    formData.append('file', blob, 'capture.jpg');
    formData.append('monitor_type', monitorType);

    const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
    });

    const json = await response.json();

    if (!response.ok) {
        throw new Error(json.detail || `サーバーエラー (${response.status})`);
    }

    if (!json.success) {
        throw new Error(json.error || '解析に失敗しました');
    }

    return json;
}
