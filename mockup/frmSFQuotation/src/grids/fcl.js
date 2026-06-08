/* FCL (Freight & Charges) grid — bound to SFQRATE.
 *
 * Layout matches legacy `Sub ReloadDetail`: 21 visible columns + index + delete.
 * All rate columns are text inputs because SFQRATE is VARCHAR — accepts
 * "FREE", "20-24", numbers, etc.
 */

import { $, $$, escapeHtml } from '../core/utils.js';
import { current } from '../core/state.js';

export function paintFcl() {
    const q = current();
    const tbody = $('#fclTbody');
    tbody.innerHTML = '';
    const rows = q?.freightRates ?? [];
    rows.forEach((r, i) => tbody.appendChild(fclRowEl(r, i)));
    if (rows.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="26" class="text-center text-slate-400 py-4 text-sm">No freight rates — click "+ Add Route" to start.</td>`;
        tbody.appendChild(tr);
    }
}

export function fclRowEl(row, idx) {
    const tr = document.createElement('tr');
    tr.dataset.detid = row.DETID;
    tr.dataset.idx = String(idx);
    tr.dataset.kind = 'fcl';
    const v = (k) => escapeHtml(String(row[k] ?? ''));
    const currList = ['', 'USD', 'THB', 'EUR', 'CNY', 'SGD', 'JPY'];
    const cur = row.ItemCurr ?? '';
    const currOptions = (currList.includes(cur) ? currList : [cur, ...currList])
        .map(c => `<option ${c === cur ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
    tr.innerHTML = `
        <td class="px-2 py-1 text-slate-400 text-xs">${idx + 1}</td>
        <td class="px-2 py-1"><input class="cell-input" data-col="LoadPort" value="${v('LoadPort')}"></td>
        <td class="px-2 py-1"><input class="cell-input font-mono" data-col="LoadPortCode" value="${v('LoadPortCode')}"></td>
        <td class="px-2 py-1"><input class="cell-input" data-col="DisPort" value="${v('DisPort')}"></td>
        <td class="px-2 py-1"><input class="cell-input" data-col="TranPort" value="${v('TranPort')}"></td>
        <td class="px-2 py-1"><input class="cell-input" data-col="FinalPort" value="${v('FinalPort')}"></td>
        <td class="px-2 py-1"><input class="cell-input font-mono" data-col="FinalPortCode" value="${v('FinalPortCode')}"></td>
        <td class="px-2 py-1"><input class="cell-input font-mono" data-col="ExpCode" value="${v('ExpCode')}"></td>
        <td class="px-2 py-1"><input class="cell-input" data-col="ExpDesc" value="${v('ExpDesc')}"></td>
        <td class="px-2 py-1">
            <select class="cell-input" data-col="ItemCurr">${currOptions}</select>
        </td>
        <td class="px-2 py-1"><input class="cell-input" data-col="Uom" value="${v('Uom')}"></td>
        <td class="px-2 py-1"><input class="cell-input text-right tabular-nums" data-col="XPrice" value="${v('XPrice')}"></td>
        <td class="px-2 py-1"><input class="cell-input" data-col="XCtnType" value="${v('XCtnType')}"></td>
        <td class="px-2 py-1"><input class="cell-input text-right tabular-nums" data-col="XCtn20" value="${v('XCtn20')}"></td>
        <td class="px-2 py-1"><input class="cell-input text-right tabular-nums" data-col="XCtn40" value="${v('XCtn40')}"></td>
        <td class="px-2 py-1"><input class="cell-input text-right tabular-nums" data-col="XCtn40HC" value="${v('XCtn40HC')}"></td>
        <td class="px-2 py-1"><input class="cell-input text-right tabular-nums" data-col="XCtn45" value="${v('XCtn45')}"></td>
        <td class="px-2 py-1"><input class="cell-input text-right tabular-nums" data-col="XLcl" value="${v('XLcl')}"></td>
        <td class="px-2 py-1"><input class="cell-input" data-col="Dept" value="${v('Dept')}"></td>
        <td class="px-2 py-1"><input class="cell-input" data-col="Arrv" value="${v('Arrv')}"></td>
        <td class="px-2 py-1"><input class="cell-input text-center" data-col="Transit" value="${v('Transit')}"></td>
        <td class="px-2 py-1"><input class="cell-input" data-col="Etd" value="${v('Etd')}"></td>
        <td class="px-2 py-1"><input class="cell-input" data-col="LinerName" value="${v('LinerName')}"></td>
        <td class="px-2 py-1"><input class="cell-input" data-col="AgentName" value="${v('AgentName')}"></td>
        <td class="px-2 py-1"><input class="cell-input" data-col="Remark" value="${v('Remark')}"></td>
        <td class="px-2 py-1 text-center sticky right-0 bg-white"><button type="button" class="row-del" title="Delete">✕</button></td>
    `;
    return tr;
}
