/* crud.js — Create / Copy / Save / Delete actions.
 *
 * Mirrors VB6 SaveData / cmdDelete_Click / cmdCopy_Click / AddNewBlank.
 * Persists to localStorage via `state.persist()`; no real backend.
 */

import { $, newRateId } from './utils.js';
import { state, getCurrentRate, persist, setDirty } from './state.js';
import { showToast, confirmDialog } from './ui.js';
import { runSearch } from './search.js';
import { scrollToLastRow } from './master-grid.js';
import { open as openDetail, close as closeDetail, populate as populateDetailForm } from './detail.js';
import { render as renderCostGrid } from './sub-rate.js';

/** Add a fresh blank rate → push, set add-mode flag, open detail pane. */
export function addNewRate() {
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
    runSearch();
    openDetail(blank.RATEID);
    scrollToLastRow();
    setDirty(true);
}

/** Duplicate the current rate as a new RATEID, marking it as Add. */
export function copyDetail() {
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
    runSearch();
    populateDetailForm();
    renderCostGrid();
    scrollToLastRow();
    showToast('Copied — Save to confirm', '📋');
}

/** Validate & persist the current rate. Single required field = FINAL PORT. */
export async function saveDetail() {
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
    runSearch();
    populateDetailForm();
    showToast(wasAdd ? 'Added' : 'Saved');
}

/** Confirm + delete; focus the row above (mirrors VB6 behavior). */
export async function deleteDetail() {
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
    runSearch();

    if (aboveRateId) openDetail(aboveRateId);
    else             closeDetail();

    showToast('Deleted', '🗑');
}
