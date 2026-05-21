'use strict';

// ===== マニュアルモーダル =====

const manualBtn      = document.getElementById('manual-btn');
const manualModal    = document.getElementById('manual-modal');
const manualBackdrop = document.getElementById('manual-modal-backdrop');
const manualClose    = document.getElementById('manual-close');
const manualBody     = manualModal.querySelector('.manual-body');

function openManual() {
    manualModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    // 開く度に先頭から表示
    manualBody.scrollTop = 0;
}

function closeManual() {
    manualModal.classList.add('hidden');
    document.body.style.overflow = '';
}

manualBtn.addEventListener('click', openManual);
manualClose.addEventListener('click', closeManual);
manualBackdrop.addEventListener('click', closeManual);

// TOC のアンカーリンクをスムーススクロール（モーダル内でのスクロール）
manualModal.querySelectorAll('.manual-toc a').forEach(a => {
    a.addEventListener('click', e => {
        e.preventDefault();
        const target = document.querySelector(a.getAttribute('href'));
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
});
