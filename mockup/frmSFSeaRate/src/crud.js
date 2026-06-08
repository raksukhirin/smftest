/* crud.js — Create / Copy / Save / Delete actions. */
window.RC = window.RC || {};
window.RC.crud = (function () {
    'use strict';
    const { $, newRateId } = RC.utils;
    const { state, getCurrentRate, persist, setDirty } = RC.state;
    const { showToast, confirmDialog } = RC.ui;

    function addNewRate() {
        const blank = {
            RATEID: newRateId(state.data.rates),
            JOBCLASS: $('#jobclassFilter').value,
            AGENTNO: '', AGENTNAME: '', CTCNAME: '',
            LINERNO: '', LINERNAME: '',
            DEPT: '', ARRV: '',
            VALIDITY: new Date().toISOString().slice(0, 10),
            LASTUPD: null, TRANSIT: 0,
            LOADPORT: '', LOADPORTNAME: '',
            DISPORT: '', DISPORTNAME: '',
            FINALPORT: '', FINALPORTNAME: '',
            TRANPORT: '', TRANPORTNAME: '',
            COUNTRY: '', USERID: 'DEMO', GROUPID: 'OP',
            REMFCL: '', REMLCL: '',
            XCTNTYPE: 'Dry',
            XCTN20: '', XCTN40: '', XCTN40HC: '', XCTN45: '', XLCL: '',
            CYTERM: '', LOCK: Date.now(),
            costs: [], sellings: [],
            __addMode: true
        };
        state.data.rates.push(blank);
        state.currentRateId = blank.RATEID;
        state.addMode = true;
        RC.search.runSearch();
        RC.detail.open(blank.RATEID);
        RC.masterGrid.scrollToLastRow();
        setDirty(true);
    }

    function copyDetail() {
        const rate = getCurrentRate();
        if (!rate) return;
        const dup = structuredClone(rate);
        dup.RATEID  = newRateId(state.data.rates);
        dup.LOCK    = Date.now();
        dup.LASTUPD = null;
        dup.__addMode = true;
        (dup.costs || []).forEach((c, i) => { c.PMKEY = 9000 + i; });

        state.data.rates.push(dup);
        state.currentRateId = dup.RATEID;
        state.addMode = true;
        setDirty(true);
        RC.search.runSearch();
        RC.detail.populate();
        RC.subRate.render();
        RC.masterGrid.scrollToLastRow();
        showToast('Copied — Save to confirm', '📋');
    }

    async function saveDetail() {
        const rate = getCurrentRate();
        if (!rate) return;
        if (!rate.FINALPORT) {
            showToast('FINAL PORT required', '⚠');
            $('#detailPane [data-field="FINALPORT"]').classList.add('is-error');
            return;
        }
        document.querySelectorAll('#detailPane .is-error').forEach(el => el.classList.remove('is-error'));

        rate.LASTUPD = new Date().toISOString().slice(0, 10);
        rate.LOCK    = Date.now();
        const wasAdd = !!rate.__addMode;
        delete rate.__addMode;
        state.addMode = false;
        persist();
        setDirty(false);
        RC.search.runSearch();
        RC.detail.populate();
        showToast(wasAdd ? 'Added' : 'Saved');
    }

    async function deleteDetail() {
        const rate = getCurrentRate();
        if (!rate) return;
        if (!await confirmDialog({ title: 'Delete this rate?', msg: `RATEID ${rate.RATEID} จะถูกลบถาวร` })) return;

        const visible = Array.from(document.querySelectorAll('#masterTbody tr[data-rateid]'))
                             .map(tr => tr.dataset.rateid);
        const currentIdx = visible.indexOf(rate.RATEID);
        const aboveRateId = currentIdx > 0 ? visible[currentIdx - 1] : null;

        state.data.rates = state.data.rates.filter(r => r.RATEID !== rate.RATEID);
        state.currentRateId = null;
        persist();
        RC.search.runSearch();

        if (aboveRateId) RC.detail.open(aboveRateId);
        else             RC.detail.close();

        showToast('Deleted', '🗑');
    }

    return { addNewRate, copyDetail, saveDetail, deleteDetail };
}());
