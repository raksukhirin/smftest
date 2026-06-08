/* actions.js — User actions: Save, Delete, Approve, New, Reset, Print, Navigate, switch class. */
window.SFQ = window.SFQ || {};
window.SFQ.actions = (function () {
    'use strict';
    const { $$ }                                  = SFQ.utils;
    const { state, current, persist, setDirty }   = SFQ.state;
    const { blankQuotation, GRIDS }               = SFQ.factories;
    const { showToast, confirmDialog }            = SFQ.toast;

    function captureForm() {
        const q = current();
        if (!q) return;
        $$('[name]').forEach(el => {
            const key = el.name;
            let v;
            if (el.type === 'checkbox') v = el.checked;
            else if (el.type === 'number') v = el.value === '' ? null : Number(el.value);
            else if (el.type === 'date') v = el.value || null;
            else if (el.tagName === 'SELECT' && el.name === 'IsCreditApp') v = el.value === 'true';
            else v = el.value === '' ? '' : el.value;
            q[key] = v;
        });
    }

    function doSave() {
        if (!current()) return;
        const q0 = current();
        if (q0.DocStat === 'Approved' || q0.DocStat === 'Deleted') {
            showToast(`Cannot save — quotation is ${q0.DocStat}`, '🔒', 'warn');
            return;
        }
        captureForm();
        SFQ.gridDetail.captureAllGrids();

        const errors = SFQ.validation.validate();
        if (errors.length > 0) {
            SFQ.errors.applyErrors(errors);
            showToast(`${errors.length} validation error(s)`, '⚠', 'error');
            return;
        }
        SFQ.errors.clearErrors();

        const q = current();
        q.freightRates.forEach((r, i) => { r.SeqNo = i + 1; });
        Object.values(GRIDS).forEach(cfg => {
            (q[cfg.arrayKey] || []).forEach((r, i) => { r.SeqNo = i + 1; });
        });
        q.lock = Date.now();
        q.EditBy = q.EditBy || 'PHUPOOM_MK';
        q.EditDate = new Date().toISOString().slice(0, 19).replace('T', ' ');
        delete q._isNew;
        persist();
        setDirty(false);
        SFQ.paint.paintBanner();
        showToast(`Saved ${q.DocNo}`, '💾');
    }

    async function doDelete() {
        const q = current();
        if (!q) return;
        if (q.DocStat === 'Deleted') {
            showToast('Already deleted', '🔒', 'warn');
            return;
        }
        const ok = await confirmDialog({
            title: `Delete quotation ${q.DocNo}?`,
            message: `DOCSTAT will be set to 'Deleted' (soft delete).`,
            confirmLabel: 'Delete',
            danger: true,
        });
        if (!ok) return;
        if (q._isNew) {
            state.quotations.splice(state.currentIndex, 1);
            state.currentIndex = Math.max(0, state.currentIndex - 1);
            if (state.quotations.length === 0) state.quotations.push(blankQuotation('IM'));
            persist();
            SFQ.paint.paintAll();
            showToast('Unsaved quotation discarded', '🗑');
            return;
        }
        q.DocStat = 'Deleted';
        q.lock = Date.now();
        q.EditDate = new Date().toISOString().slice(0, 19).replace('T', ' ');
        persist();
        SFQ.paint.paintAll();
        showToast(`Quotation ${q.DocNo} deleted`, '🗑', 'error');
    }

    async function doApprove() {
        const q = current();
        if (!q || q.DocStat === 'Deleted') return;
        const isApproved = q.DocStat === 'Approved';
        const ok = await confirmDialog({
            title: isApproved ? `Un-Approve ${q.DocNo}?` : `Approve ${q.DocNo}?`,
            message: isApproved
                ? `DOCSTAT will revert to 'Open'.`
                : `DOCSTAT will be set to 'Approved'. APPDATE/APPBY will be stamped.`,
            confirmLabel: isApproved ? 'Un-Approve' : 'Approve',
        });
        if (!ok) return;
        if (isApproved) {
            q.DocStat = 'Open';
            q.AppDate = null;
            q.AppBy = null;
        } else {
            q.DocStat = 'Approved';
            q.AppDate = new Date().toISOString().slice(0, 19).replace('T', ' ');
            q.AppBy = q.AppByNo || q.IssueBy || 'SYSTEM';
        }
        q.lock = Date.now();
        persist();
        SFQ.paint.paintAll();
        showToast(isApproved ? 'Reverted to Open' : `Approved ${q.DocNo}`, '✓');
    }

    async function doNew(forcedClass) {
        if (state.quotations.length > 0) {
            const flag = document.getElementById('dirtyFlag');
            const isDirty = flag && !flag.classList.contains('hidden');
            if (isDirty) {
                const ok = await confirmDialog({
                    title: 'Discard unsaved changes?',
                    message: 'You have unsaved changes. Continue and create a new quotation?',
                    confirmLabel: 'Discard & New',
                    danger: true,
                });
                if (!ok) return;
            }
        }
        const cls = forcedClass || (current()?.DocClass || 'IM');
        state.quotations.push(blankQuotation(cls));
        state.currentIndex = state.quotations.length - 1;
        persist();
        SFQ.paint.paintAll();
        showToast(`New ${cls === 'IM' ? 'Import' : 'Export'} quotation`, '＋');
    }

    async function navigateTo(target) {
        if (target < 0 || target >= state.quotations.length) return;
        if (target === state.currentIndex) return;
        const flag = document.getElementById('dirtyFlag');
        const isDirty = flag && !flag.classList.contains('hidden');
        if (isDirty) {
            const ok = await confirmDialog({
                title: 'Unsaved changes',
                message: 'Switch and discard unsaved edits?',
                confirmLabel: 'Discard & Switch',
                danger: true,
            });
            if (!ok) return;
        }
        state.currentIndex = target;
        persist();
        SFQ.paint.paintAll();
    }

    async function switchClass(cls) {
        const q = current();
        if (!q) return;
        if (q.DocClass === cls) return;
        const ok = await confirmDialog({
            title: `Change class to ${cls}?`,
            message: 'This changes JOBCLASS on the current quotation. (In production this would normally only be set on creation.)',
            confirmLabel: 'Change',
        });
        if (!ok) {
            SFQ.paint.paintClassToggle();
            return;
        }
        q.DocClass = cls;
        if (q._isNew && q.DocNo.startsWith('QS')) {
            q.DocNo = 'QS' + (cls === 'IM' ? 'I' : 'E') + q.DocNo.slice(3);
        }
        setDirty(true);
        SFQ.paint.paintAll();
        showToast(`Class changed to ${cls === 'IM' ? 'IMPORT' : 'EXPORT'}`, '↹');
    }

    async function doReset() {
        const ok = await confirmDialog({
            title: 'Reset to seed data?',
            message: 'Wipe localStorage and reload original sample quotations from data.json.',
            confirmLabel: 'Reset',
            danger: true,
        });
        if (!ok) return;
        localStorage.removeItem('sf_quotation_v1');
        SFQ.state.setState({ quotations: [], currentIndex: 0, company: null, masters: null });
        await SFQ.masters.loadInitial();
        SFQ.paint.paintAll();
        showToast('Reset complete', '↺');
    }

    function doPrint() {
        const q = current();
        if (!q) return;
        captureForm();
        SFQ.gridDetail.captureAllGrids();
        persist();
        const url = `print.html?doc=${encodeURIComponent(q.DocNo)}`;
        window.open(url, '_blank', 'width=900,height=1100');
    }

    return {
        captureForm,
        doSave, doDelete, doApprove, doNew, navigateTo, switchClass, doReset, doPrint,
    };
}());
