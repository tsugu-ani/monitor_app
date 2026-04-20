'use strict';

async function fetchMonitorOptions() {
    const res = await fetch('/api/monitors');
    if (!res.ok) return [];
    const json = await res.json();
    return json.monitors || [];
}

async function fetchRecords(date = '', limit = 200) {
    const params = new URLSearchParams({ limit });
    if (date) params.set('date', date);
    const res = await fetch(`/api/records?${params}`);
    if (!res.ok) return [];
    return res.json();
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
