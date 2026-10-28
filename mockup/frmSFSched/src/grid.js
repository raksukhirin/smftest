/* grid.js — Renders the schedule grid (SFVSED rows) and owns row selection.
 * Columns match the legacy form:
 *   Carrier | Depart | Day | Transit Times | Arrive | Day | Vessel | Voy | Origin | Destination
 *
 * An unsaved add/copy record (state.draft) is rendered as a highlighted row at
 * the top so the user can see the new entry in context. Arrow Up/Down move the
 * selection like a click; Enter opens the detail panel.
 */
window.VS = window.VS || {};
window.VS.grid = (function () {
    'use strict';
    const { $, $$, escapeHtml, fmtDate } = VS.utils;
    const { state } = VS.state;

    let handlers = { onDblClick: () => {}, onSelect: () => {} };
    function setHandlers(h) { handlers = { ...handlers, ...h }; }

    function scroller() { return $('#schedTable').closest('.grid-scroll'); }

    /** Render `rows` (already filtered). state.draft, if present, sits on top. */
    function render(rows) {
        const tb = $('#schedTbody');
        const draft = state.draft;
        const display = draft ? [draft, ...rows.filter(r => r.DETID !== draft.DETID)] : rows;

        if (!display.length) {
            tb.innerHTML = `<tr><td class="row-empty" colspan="10">No schedule matches the current filter.</td></tr>`;
            $('#gridStatus').textContent = '0 rows';
            $('#recShown').textContent = '0';
            $('#recCount').textContent = String(state.data.schedules.length);
            return;
        }

        tb.innerHTML = display.map(r => {
            const isDraft = draft && r.DETID === draft.DETID;
            const sel     = r.DETID === state.currentDetId;
            return `<tr data-id="${escapeHtml(r.DETID)}"
                        class="${sel ? 'is-selected' : ''} ${isDraft ? 'is-add-new' : ''}">
                <td>${isDraft
                    ? `<span class="add-mode-tag">✨ NEW</span><span class="add-mode-hint">${r.LINERNAME ? escapeHtml(r.LINERNAME) : 'กำลังเพิ่ม Schedule ใหม่ — แก้ที่ panel ขวา →'}</span>`
                    : escapeHtml(r.LINERNAME)}</td>
                <td class="mono">${fmtDate(r.DEPDATE)}</td>
                <td>${r.DEPDAY ? `<span class="dow">${escapeHtml(r.DEPDAY)}</span>` : ''}</td>
                <td class="text-right tabular-nums">${escapeHtml(r.TRANSIT)}</td>
                <td class="mono">${fmtDate(r.ARRDATE)}</td>
                <td>${r.ARRDAY ? `<span class="dow">${escapeHtml(r.ARRDAY)}</span>` : ''}</td>
                <td>${escapeHtml(r.VESSEL)}</td>
                <td class="mono">${escapeHtml(r.V_VOY)}</td>
                <td class="mono">${escapeHtml(r.LOADPORT)}</td>
                <td class="mono">${escapeHtml(r.FINALPORT)}</td>
            </tr>`;
        }).join('');

        $$('#schedTbody tr[data-id]').forEach(tr => {
            tr.addEventListener('click', () => { select(tr.dataset.id); scroller().focus(); });
            tr.addEventListener('dblclick', () => handlers.onDblClick(tr.dataset.id));
        });

        $('#gridStatus').textContent = `${rows.length} row${rows.length === 1 ? '' : 's'}` + (draft ? ' · +1 new' : '');
        $('#recShown').textContent = String(rows.length);
        $('#recCount').textContent = String(state.data.schedules.length);
    }

    function select(detId) {
        state.currentDetId = detId;
        $$('#schedTbody tr[data-id]').forEach(tr =>
            tr.classList.toggle('is-selected', tr.dataset.id === detId));
        scrollTo(detId);
        handlers.onSelect(detId);
    }

    function highlight(detId) {
        $$('#schedTbody tr[data-id]').forEach(tr =>
            tr.classList.toggle('is-selected', tr.dataset.id === detId));
    }

    function scrollTo(detId) {
        const row = $$('#schedTbody tr[data-id]').find(tr => tr.dataset.id === detId);
        if (row) row.scrollIntoView({ block: 'nearest' });
    }

    /** Give the grid keyboard focus so Arrow keys work without a click. */
    function focusList() { scroller().focus(); }

    /** Arrow Up/Down = move selection like a click; Enter = open detail. */
    function initKeyboardNav() {
        const el = scroller();
        el.setAttribute('tabindex', '0');
        el.addEventListener('keydown', e => {
            if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) return;
            const ids = $$('#schedTbody tr[data-id]').map(tr => tr.dataset.id);
            if (!ids.length) return;
            e.preventDefault();
            if (e.key === 'Enter') { if (state.currentDetId) handlers.onDblClick(state.currentDetId); return; }
            let i = ids.indexOf(state.currentDetId);
            if (i < 0) i = (e.key === 'ArrowDown') ? -1 : 1;
            i = (e.key === 'ArrowDown') ? Math.min(i + 1, ids.length - 1) : Math.max(i - 1, 0);
            select(ids[i]);
        });
    }

    return { setHandlers, render, select, highlight, scrollTo, focusList, initKeyboardNav };
}());
