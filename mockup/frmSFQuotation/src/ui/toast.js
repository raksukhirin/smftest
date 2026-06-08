/* ui/toast.js — Toast notification + confirm dialog. */
window.SFQ = window.SFQ || {};
window.SFQ.toast = (function () {
    'use strict';
    const { $ } = SFQ.utils;

    let toastTimer = null;

    function showToast(message, icon = '✓', kind = 'success') {
        $('#toastMsg').textContent = message;
        $('#toastIcon').textContent = icon;
        const inner = $('#toast').firstElementChild;
        inner.className = 'px-4 py-3 rounded-lg shadow-lg text-sm flex items-center gap-2 ' + ({
            success: 'bg-slate-900 text-white',
            warn:    'bg-amber-500 text-white',
            error:   'bg-red-600 text-white',
        }[kind] || 'bg-slate-900 text-white');
        $('#toast').classList.remove('hidden');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => $('#toast').classList.add('hidden'), 2500);
    }

    function confirmDialog({ title, message, confirmLabel = 'OK', danger = false }) {
        return new Promise(resolve => {
            $('#dlgTitle').textContent = title;
            $('#dlgMsg').textContent   = message;
            const btn = $('#dlgConfirm');
            btn.textContent = confirmLabel;
            btn.className = danger ? 'btn-danger' : 'btn-primary';
            const dlg = $('#dialog');
            dlg.classList.remove('hidden');
            dlg.classList.add('flex');
            const cleanup = (val) => {
                dlg.classList.add('hidden');
                dlg.classList.remove('flex');
                btn.onclick = null;
                $('#dlgCancel').onclick = null;
                resolve(val);
            };
            btn.onclick = () => cleanup(true);
            $('#dlgCancel').onclick = () => cleanup(false);
        });
    }

    return { showToast, confirmDialog };
}());
