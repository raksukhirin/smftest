/* ui.js — Reusable UI primitives (toast + confirm dialog).
 * Mirrors MsgBox / MsgBoxXP from the VB6 form.
 */
window.VS = window.VS || {};
window.VS.ui = (function () {
    'use strict';
    const { $ } = VS.utils;

    let _toastTimer;

    function showToast(msg, icon = '✓') {
        const t = $('#toast');
        $('#toastIcon').textContent = icon;
        $('#toastMsg').textContent  = msg;
        t.classList.remove('hidden');
        clearTimeout(_toastTimer);
        _toastTimer = setTimeout(() => t.classList.add('hidden'), 1800);
    }

    /** Yes/No confirm dialog → Promise<boolean>. */
    function confirmDialog({ title, msg }) {
        return new Promise(resolve => {
            const dlg = $('#dialog');
            $('#dlgTitle').textContent = title;
            $('#dlgMsg').textContent   = msg;
            dlg.classList.remove('hidden');
            dlg.classList.add('flex');
            const cleanup = () => {
                dlg.classList.add('hidden');
                dlg.classList.remove('flex');
                $('#dlgConfirm').onclick = null;
                $('#dlgCancel').onclick  = null;
            };
            $('#dlgConfirm').onclick = () => { cleanup(); resolve(true);  };
            $('#dlgCancel').onclick  = () => { cleanup(); resolve(false); };
        });
    }

    return { showToast, confirmDialog };
}());
