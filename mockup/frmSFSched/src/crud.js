/* crud.js — Add / Save / Delete / Copy for schedule rows.
 * Validation mirrors the VB6 ChkValidate(): required carrier, vessel, ports,
 * departure date and a non-negative transit. Save recomputes ARR* from
 * DEPDATE + TRANSIT (parity with UpdateData()).
 */
window.VS = window.VS || {};
window.VS.crud = (function () {
    'use strict';
    const { $ } = VS.utils;
    const U = VS.utils;
    const { state, persist, setDirty } = VS.state;
    const D = () => VS.detail;

    function todayIso() {
        // Demo anchor: seed lives in June 2026. Use the latest LASTUPD so the
        // mockup stays deterministic without Date.now().
        return state.data.schedules.reduce((m, r) => r.LASTUPD > m ? r.LASTUPD : m, '2026-06-01');
    }

    function blankRow() {
        return {
            DETID: U.newDetId(state.data.schedules),
            LINERNO: '', LINERNAME: '', VESSEL: '', V_VOY: '',
            DEPDATE: '', DEPDAY: '', TRANSIT: 0, ARRDATE: '', ARRDAY: '',
            LOADPORT: '', LOADPORTNAME: '', FINALPORT: '', FINALPORTNAME: '',
            REMARK: '', USERID: 'ADMIN', GROUPID: 'OP', LASTUPD: todayIso(), LOCK: 1
        };
    }

    /** Begin a new entry: a draft row appears in the grid (selected) and the
     *  detail panel opens in ADD mode with the first field focused. */
    function startDraft(rec) {
        state.draft = rec;
        state.currentDetId = rec.DETID;
        state.addMode = true;
        VS.grid.render(state.filtered);   // draft now shows as the top row
        D().openBlank(rec);
        VS.grid.select(rec.DETID);        // highlight + scroll the new row
        D().focusFirst();                 // focus the new row's first field
    }

    function addNew() { startDraft(blankRow()); }

    function validate(rec) {
        D().clearErrors();
        const errors = [];
        if (!rec.LINERNAME.trim()) { errors.push('Carrier is required'); D().markError('LINERNAME'); }
        if (!rec.VESSEL.trim())    { errors.push('Vessel is required');  D().markError('VESSEL'); }
        if (!rec.DEPDATE)          { errors.push('Departure date is required'); D().markError('DEPDATE'); }
        if (!(rec.TRANSIT >= 0))   { errors.push('Transit must be ≥ 0'); D().markError('TRANSIT'); }
        if (!rec.LOADPORT.trim())  { errors.push('Load port is required');  D().markError('LOADPORT'); }
        if (!rec.FINALPORT.trim()) { errors.push('Final port is required'); D().markError('FINALPORT'); }
        return errors;
    }

    function save() {
        const rec = D().read();
        const errs = validate(rec);
        if (errs.length) { VS.ui.showToast(errs[0], '⚠'); return; }

        // derive ARR* + DAY fields (UpdateData parity)
        rec.DEPDAY  = U.weekdayCode(rec.DEPDATE);
        rec.ARRDATE = U.addDays(rec.DEPDATE, rec.TRANSIT);
        rec.ARRDAY  = U.weekdayCode(rec.ARRDATE);
        rec.LASTUPD = rec.LASTUPD || todayIso();
        rec.LOCK    = Date.parse(rec.LASTUPD) || 1;
        rec.GROUPID = rec.GROUPID || 'OP';

        const list = state.data.schedules;
        const idx = list.findIndex(r => r.DETID === rec.DETID);
        if (idx >= 0) list[idx] = { ...list[idx], ...rec };
        else          list.unshift(rec);

        state.draft = null;
        state.addMode = false;
        state.currentDetId = rec.DETID;
        persist();
        setDirty(false);
        VS.search.refreshMasters();
        VS.search.runSearch();
        D().open(rec.DETID);
        VS.ui.showToast(idx >= 0 ? 'Schedule updated' : 'Schedule added');
    }

    /** Select the row above `pos` in the displayed list (or, if it was the top
     *  row, the new first row). Panel stays open → detail refreshes via the
     *  grid's onSelect handler. Hides only when nothing is left. */
    function focusAfterDelete(aboveId) {
        const remaining = state.filtered;
        let focusId = null;
        if (aboveId && remaining.some(r => r.DETID === aboveId)) focusId = aboveId;     // row above
        else if (remaining.length) focusId = remaining[0].DETID;                         // new top row
        if (focusId) { VS.grid.select(focusId); VS.grid.focusList(); }
        else D().hide();
    }

    async function remove() {
        const rec = D().read();
        const idx = state.data.schedules.findIndex(r => r.DETID === rec.DETID);
        // deleting an unsaved draft = cancel the add → drop it, focus first row
        if (idx < 0) {
            state.draft = null;
            VS.search.runSearch();
            focusAfterDelete(null);
            return;
        }
        const ok = await VS.ui.confirmDialog({
            title: 'Delete schedule?',
            msg: `ลบเที่ยวเรือ ${rec.VESSEL || rec.DETID} (${rec.LOADPORT} → ${rec.FINALPORT}) ?`
        });
        if (!ok) return;
        // remember the displayed row directly above the one being deleted
        const dispIds = state.filtered.map(r => r.DETID);
        const pos = dispIds.indexOf(rec.DETID);
        const aboveId = pos > 0 ? dispIds[pos - 1] : null;

        state.data.schedules.splice(idx, 1);
        state.currentDetId = null;
        persist();
        VS.search.refreshMasters();
        VS.search.runSearch();
        // keep the Schedule Detail panel open → focus the row above (if any)
        focusAfterDelete(aboveId);
        VS.ui.showToast('Schedule deleted', '🗑');
    }

    function copy() {
        const rec = D().read();
        const clone = {
            ...rec,
            DETID: U.newDetId(state.data.schedules),
            TRANSIT: parseInt(rec.TRANSIT, 10) || 0,
            LASTUPD: todayIso(), LOCK: 1, USERID: 'ADMIN', GROUPID: 'OP'
        };
        startDraft(clone);   // draft row appears + first field focused
        VS.ui.showToast('Copied — edit & Save to create');
    }

    return { addNew, save, remove, copy };
}());
