/* master-grid.js — Rate List rendering + selection + keyboard navigation.
 *
 * Owns visual selection of rows. Does NOT directly open the detail pane —
 * that's done by the dblclick callback registered by app.js (avoids a
 * master-grid ↔ detail circular import).
 */

import { $, $$, escapeHtml, fmtDate } from './utils.js';
import { state } from './state.js';
import { render as renderCostGrid } from './sub-rate.js';

let _onDblClick = () => {};   // injected by app.js
let _onSelect   = () => {};   // injected by app.js (e.g. populate detail form)

/** Wire row callbacks (called once from app.js after all modules load). */
export function setHandlers({ onDblClick, onSelect }) {
    if (onDblClick) _onDblClick = onDblClick;
    if (onSelect)   _onSelect   = onSelect;
}

/* Render the master list. `rows` is the filtered set (search.js does filtering). */
export function render(rows) {
    const tbody = $('#masterTbody');
    tbody.innerHTML = '';
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="18" class="row-empty">ไม่พบข้อมูล — กด SEARCH หรือ CLEAR SCR</td></tr>`;
        return;
    }
    rows.forEach(r => {
        const tr = document.createElement('tr');
        tr.dataset.rateid = r.RATEID;
        if (r.RATEID === state.currentRateId) tr.classList.add('is-selected');
        if (r.__addMode) tr.classList.add('is-add-new');

        const agentCell = r.__addMode
            ? `<span class="add-mode-tag">✨ NEW</span><span class="add-mode-hint">${r.AGENTNAME ? escapeHtml(r.AGENTNAME) : 'กำลังเพิ่ม Rate ใหม่ — แก้ที่ panel ขวา →'}</span>`
            : escapeHtml(r.AGENTNAME || '');

        tr.innerHTML = `
            <td>${agentCell}</td>
            <td>${escapeHtml(r.CTCNAME || '')}</td>
            <td>${escapeHtml(r.LINERNAME || '')}</td>
            <td class="hide-when-detail">${escapeHtml(r.CYTERM || '')}</td>
            <td>${escapeHtml(r.LOADPORT || '')}</td>
            <td>${escapeHtml(r.DISPORT || '')}</td>
            <td>${escapeHtml(r.TRANPORT || '')}</td>
            <td>${escapeHtml(r.FINALPORT || '')}</td>
            <td class="hide-when-detail">${escapeHtml(r.FINALPORTNAME || '')}</td>
            <td class="hide-when-detail">${fmtDate(r.VALIDITY)}</td>
            <td class="hide-when-detail">${escapeHtml(r.DEPT || '')}</td>
            <td class="hide-when-detail">${escapeHtml(r.ARRV || '')}</td>
            <td class="hide-when-detail text-right">${r.TRANSIT ?? ''}</td>
            <td class="hide-when-detail text-right">${escapeHtml(r.XCTN20 || '')}</td>
            <td class="hide-when-detail text-right">${escapeHtml(r.XCTN40 || '')}</td>
            <td class="hide-when-detail text-right">${escapeHtml(r.XCTN40HC || '')}</td>
            <td class="hide-when-detail text-right">${escapeHtml(r.XCTN45 || '')}</td>
            <td class="hide-when-detail text-right">${escapeHtml(r.XLCL || '')}</td>
        `;
        tr.onclick    = () => selectRate(r.RATEID);
        tr.ondblclick = () => _onDblClick(r.RATEID);
        tbody.appendChild(tr);
    });
}

export function selectRate(rateId) {
    state.currentRateId = rateId;
    $$('#masterTbody tr').forEach(tr => {
        tr.classList.toggle('is-selected', tr.dataset.rateid === rateId);
    });
    renderCostGrid();
    $('#recActive').textContent = rateId;
    _onSelect(rateId);  // detail.js listens to update form if pane is open
}

/** Scroll the last row of the master grid into full view (used after
 *  Add New / Copy / CLEAR SCR). Waits one frame so newly inserted tr's
 *  bounding box is finalized before scrolling. */
export function scrollToLastRow() {
    requestAnimationFrame(() => {
        const tbody = $('#masterTbody');
        const last = tbody.lastElementChild;
        if (last) last.scrollIntoView({ block: 'end', behavior: 'smooth' });
    });
}

/** Arrow Up/Down on the document → move selection in master grid.
 *  Skipped when focus is in any form control or a modal is open. */
export function initKeyboardNav() {
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        const t = e.target;
        if (t.matches && t.matches('input, textarea, select')) return;
        if (!$('#lookupModal').classList.contains('hidden')) return;

        const rows = $$('#masterTbody tr[data-rateid]');
        if (!rows.length) return;

        let idx = rows.findIndex(tr => tr.dataset.rateid === state.currentRateId);
        if (idx === -1)                idx = 0;
        else if (e.key === 'ArrowUp')  idx = Math.max(0, idx - 1);
        else                           idx = Math.min(rows.length - 1, idx + 1);

        e.preventDefault();
        const target = rows[idx];
        selectRate(target.dataset.rateid);
        target.scrollIntoView({ block: 'nearest' });
    });
}
