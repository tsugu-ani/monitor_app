'use strict';

async function analyzeImage(blob) {
    const formData = new FormData();
    formData.append('file', blob, 'capture.jpg');

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
