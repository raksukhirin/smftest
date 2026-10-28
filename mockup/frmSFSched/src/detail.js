/* detail.js — The right-hand edit panel for one SFVSED row.
 * Owns: populate (record → inputs), read (inputs → record), and the derived
 * ARRDATE / ARRDAY / DEPDAY recompute (ETA = ETD + TRANSIT), mirroring the
 * VB6 UpdateData() logic.
 */
window.VS = window.VS || {};
window.VS.detail = (function () {
    'use strict';
    const { $, $$ } = VS.utils;
    const U = VS.utils;
    const { state, setDirty } = VS.state;

    const FIELDS = [
        'LINERNO', 'LINERNAME', 'VESSEL', 'V_VOY', 'DEPDATE', 'DEPDAY',
        'TRANSIT', 'ARRDATE', 'ARRDAY', 'LOADPORT', 'LOADPORTNAME',
        'FINALPORT', 'FINALPORTNAME', 'USERID', 'LASTUPD', 'REMARK', 'DETID'
    ];

    function fld(name) { return $(`[data-field="${name}"]`); }

    function init() {
        $('#closeDetailBtn').onclick = hide;
        $('#hideBtn').onclick = hide;

        // Any edit marks the record dirty; date/transit edits recompute ETA.
        $$('#detailPane [data-field]').forEach(el => {
            if (el.readOnly) return;
            el.addEventListener('input', () => {
                if (['DEPDATE', 'TRANSIT'].includes(el.dataset.field)) recompute();
                if (el.dataset.field === 'DEPDATE') fld('DEPDAY').value = U.weekdayCode(el.value);
                setDirty(true);
            });
        });
    }

    /** Recompute ARRDATE / ARRDAY from DEPDATE + TRANSIT. */
    function recompute() {
        const dep = fld('DEPDATE').value;
        const tt  = fld('TRANSIT').value;
        const arr = U.addDays(dep, tt);
        fld('ARRDATE').value = arr;
        fld('ARRDAY').value  = U.weekdayCode(arr);
        fld('DEPDAY').value  = U.weekdayCode(dep);
    }

    /** Fill the panel from a record object. */
    function populate(rec) {
        FIELDS.forEach(name => {
            const el = fld(name);
            if (el) el.value = rec[name] ?? '';
        });
        clearErrors();
    }

    /** Read the panel back into a plain object (derived fields included). */
    function read() {
        const out = {};
        FIELDS.forEach(name => {
            const el = fld(name);
            if (!el) return;
            out[name] = el.value;
        });
        out.TRANSIT = parseInt(out.TRANSIT, 10) || 0;
        return out;
    }

    /** Open the panel for an existing row (EDIT) or the in-progress draft (ADD). */
    function open(detId) {
        // existing saved row?
        const rec = state.data.schedules.find(r => r.DETID === detId);
        if (rec) {
            // leaving an unsaved draft discards it
            if (state.draft) { state.draft = null; VS.grid.render(state.filtered); }
            state.currentDetId = detId;
            state.addMode = false;
            populate(rec);
            show('EDIT');
            VS.grid.highlight(detId);
            return;
        }
        // the draft row?
        if (state.draft && state.draft.DETID === detId) {
            state.currentDetId = detId;
            state.addMode = true;
            populate(state.draft);
            show('ADD');
            VS.grid.highlight(detId);
        }
    }

    function openBlank(rec) {
        state.addMode = true;
        populate(rec);
        show('ADD');
    }

    /** Focus the first editable field (used after New / Copy → "focus new row"). */
    function focusFirst() {
        const el = $('#detailPane [data-field]:not([readonly]):not([disabled])');
        if (el) { el.focus(); if (el.select) el.select(); }
    }

    /** Click / arrow-key selection: refresh the panel to the selected row, but
     *  only if it's already open (mirrors frmSFSeaRate onMasterRowSelected).
     *  Double-click is what opens a closed panel. */
    function onRowSelected(detId) {
        if (!$('#detailPane').classList.contains('is-open')) return;
        open(detId);
    }

    function show(mode) {
        const pane = $('#detailPane');
        pane.classList.remove('hidden');
        pane.classList.add('is-open');
        document.body.classList.add('detail-open');
        const pill = $('#detailMode');
        pill.textContent = mode;
        pill.className = 'status-pill ml-2 ' +
            (mode === 'ADD' ? 'status-add' : mode === 'EDIT' ? 'status-edit' : 'status-open');
        setDirty(mode === 'ADD');
    }

    function hide() {
        $('#detailPane').classList.add('hidden');
        $('#detailPane').classList.remove('is-open');
        document.body.classList.remove('detail-open');
        state.addMode = false;
        // cancelling an add discards the draft row
        if (state.draft) { state.draft = null; VS.grid.render(state.filtered); }
        setDirty(false);
    }

    function clearErrors() { $$('#detailPane .is-error').forEach(e => e.classList.remove('is-error')); }
    function markError(name) { const el = fld(name); if (el) el.classList.add('is-error'); }

    return { init, populate, read, open, openBlank, focusFirst, onRowSelected, recompute, hide, fld, markError, clearErrors };
}());
