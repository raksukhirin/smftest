/* grids/detail.js — Generic detail-grid renderer (LCL / Shipping / Transport).
 * Each cfg entry in `GRIDS` routes to the same painter, row factory, and capture. */
window.SFQ = window.SFQ || {};
window.SFQ.gridDetail = (function () {
    'use strict';
    const { $, $$, escapeHtml } = SFQ.utils;
    const { current }           = SFQ.state;
    const { GRIDS, gridByKind } = SFQ.factories;

    function paintDetail(cfg) {
        const q = current();
        const tbody = $(`#${cfg.tbodyId}`);
        if (!tbody) return;
        tbody.innerHTML = '';
        if (q && !Array.isArray(q[cfg.arrayKey])) q[cfg.arrayKey] = [];
        const rows = q?.[cfg.arrayKey] ?? [];
        rows.forEach((r, i) => tbody.appendChild(detailRowEl(cfg, r, i)));
        if (rows.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="12" class="text-center text-slate-400 py-4 text-sm">No charges — click "+ Add Charge" to start.</td>`;
            tbody.appendChild(tr);
        }
        recalcDetailTotal(cfg);
    }

    function detailRowEl(cfg, row, idx) {
        const tr = document.createElement('tr');
        tr.dataset.detid = row.DETID;
        tr.dataset.idx = String(idx);
        tr.dataset.kind = cfg.kind;
        const uomList = cfg.kind === 'transport'
            ? ["SET", "20'", "40'", "40'HC", "45'", 'CBM', 'KG', 'CTN', 'BL', 'SHPMT', 'TON']
            : ['SET', 'CBM', 'KG', 'CTN', 'BL', 'SHPMT', 'TON'];
        const uomOptions = (uomList.includes(row.Uom) ? uomList : [row.Uom, ...uomList])
            .map(u => `<option ${u === row.Uom ? 'selected' : ''}>${escapeHtml(u)}</option>`).join('');
        const total = (Number(row.Qty) || 0) * (Number(row.UnitPrice) || 0);
        tr.innerHTML = `
            <td class="px-2 py-1 text-slate-400 text-xs">${idx + 1}</td>
            <td class="px-2 py-1"><input class="cell-input font-mono" data-col="ExpCode" value="${escapeHtml(row.ExpCode ?? '')}"></td>
            <td class="px-2 py-1"><input class="cell-input" data-col="ExpDesc1" value="${escapeHtml(row.ExpDesc1 ?? '')}"></td>
            <td class="px-2 py-1">
                <select class="cell-input" data-col="PcType">
                    ${['CC', 'PP'].map(p => `<option ${p === row.PcType ? 'selected' : ''}>${p}</option>`).join('')}
                </select>
            </td>
            <td class="px-2 py-1">
                <select class="cell-input" data-col="ItemCurr">
                    ${['THB', 'USD', 'EUR', 'CNY', 'SGD', 'JPY'].map(c => `<option ${c === row.ItemCurr ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
            </td>
            <td class="px-2 py-1"><input type="number" step="0.0001" class="cell-input text-right tabular-nums" data-col="ItemRate" value="${row.ItemRate ?? 1}"></td>
            <td class="px-2 py-1">
                <select class="cell-input" data-col="Uom">${uomOptions}</select>
            </td>
            <td class="px-2 py-1"><input type="number" step="0.01" class="cell-input text-right tabular-nums" data-col="Qty" value="${row.Qty ?? 0}"></td>
            <td class="px-2 py-1"><input type="number" step="0.01" class="cell-input text-right tabular-nums" data-col="UnitPrice" value="${row.UnitPrice ?? 0}"></td>
            <td class="px-2 py-1 text-right tabular-nums font-medium" data-col="SrcAmt">${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td class="px-2 py-1"><input class="cell-input" data-col="Remark" value="${escapeHtml(row.Remark ?? '')}"></td>
            <td class="px-2 py-1 text-center"><button type="button" class="row-del" title="Delete">✕</button></td>
        `;
        return tr;
    }

    function recalcDetailTotal(cfg) {
        const q = current();
        const sum = (q?.[cfg.arrayKey] ?? []).reduce(
            (s, r) => s + (Number(r.Qty) || 0) * (Number(r.UnitPrice) || 0),
            0,
        );
        const el = $(`#${cfg.totalId}`);
        if (el) el.textContent = sum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function captureGridRow(tr) {
        const q = current();
        if (!q) return;
        const idx = +tr.dataset.idx;
        const kind = tr.dataset.kind;
        const cfg = gridByKind(kind);
        const collection = kind === 'fcl' ? q.freightRates : (cfg ? q[cfg.arrayKey] : null);
        if (!collection) return;
        const row = collection[idx];
        if (!row) return;
        $$('[data-col]', tr).forEach(el => {
            const col = el.dataset.col;
            if (col === 'SrcAmt') return;
            if (el.type === 'number') row[col] = el.value === '' ? 0 : Number(el.value);
            else row[col] = el.value;
        });
        if (cfg) {
            row.SrcAmt = (Number(row.Qty) || 0) * (Number(row.UnitPrice) || 0);
            const cell = tr.querySelector('[data-col="SrcAmt"]');
            if (cell) cell.textContent = row.SrcAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            recalcDetailTotal(cfg);
        }
    }

    function captureAllGrids() {
        $$('#fclTbody tr[data-idx]').forEach(captureGridRow);
        Object.values(GRIDS).forEach(cfg => {
            $$(`#${cfg.tbodyId} tr[data-idx]`).forEach(captureGridRow);
        });
    }

    return { paintDetail, detailRowEl, recalcDetailTotal, captureGridRow, captureAllGrids };
}());
