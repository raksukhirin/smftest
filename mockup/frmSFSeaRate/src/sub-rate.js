/* sub-rate.js — SUB-RATE detail grid (SFRATED cost lines). */
window.RC = window.RC || {};
window.RC.subRate = (function () {
    'use strict';
    const { $, escapeHtml, num, nextPmKey } = RC.utils;
    const { state, getCurrentRate, setDirty } = RC.state;
    const { showToast } = RC.ui;

    const NUMERIC_FIELDS = ['CTN20', 'CTN40', 'CTN40HC', 'CTN45', 'LCL', 'VATRATE', 'VATINOUT', 'WTRATE'];

    function render() {
        const tbody = $('#costTbody');
        tbody.innerHTML = '';
        const rate = getCurrentRate();
        const editable = $('#detailPane').classList.contains('is-open');

        if (!rate) {
            tbody.innerHTML = `<tr><td colspan="14" class="row-empty">เลือก rate จากรายการด้านบนเพื่อดู Sub-Rate</td></tr>`;
            return;
        }
        const costs = rate.costs || [];
        if (!costs.length) {
            tbody.innerHTML = `<tr><td colspan="14" class="row-empty">ไม่มีรายการ — กด "+ Add Line" เพื่อเพิ่ม</td></tr>`;
            return;
        }
        const svc = state.data.masters.services;
        const cur = state.data.masters.currencies;
        const ctn = state.data.masters.containerTypes;

        costs.forEach((c, idx) => {
            const tr = document.createElement('tr');
            tr.style.cursor = 'default';
            tr.innerHTML = editable ? renderEditableRow(c, idx, svc, cur, ctn) : renderReadOnlyRow(c);
            tbody.appendChild(tr);
        });

        if (editable) wireCostInputs(rate);
    }

    function renderReadOnlyRow(c) {
        return `
            <td></td>
            <td>${escapeHtml(c.EXPCODE || '')}</td>
            <td>${escapeHtml(c.EXPDESC1 || '')}</td>
            <td>${escapeHtml(c.ITEMCURR || '')}</td>
            <td>${escapeHtml(c.UOM || '')}</td>
            <td>${escapeHtml(c.CTNTYPE || '')}</td>
            <td class="text-right">${c.CTN20 || ''}</td>
            <td class="text-right">${c.CTN40 || ''}</td>
            <td class="text-right">${c.CTN40HC || ''}</td>
            <td class="text-right">${c.CTN45 || ''}</td>
            <td class="text-right">${c.LCL || ''}</td>
            <td class="text-right">${c.VATRATE || ''}</td>
            <td class="text-right">${c.VATINOUT || ''}</td>
            <td class="text-right">${c.WTRATE || ''}</td>
        `;
    }

    function renderEditableRow(c, idx, svc, cur, ctn) {
        const trashIcon = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
                <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
            </svg>`;
        return `
            <td><button class="row-del" data-action="del-cost" data-idx="${idx}" title="Delete row" aria-label="Delete row">${trashIcon}</button></td>
            <td>${selectCell('EXPCODE',  c.EXPCODE,  svc.map(s => ({ v: s.Code, t: s.Code })), idx)}</td>
            <td>${textCell  ('EXPDESC1', c.EXPDESC1, idx)}</td>
            <td>${selectCell('ITEMCURR', c.ITEMCURR, cur.map(v => ({ v, t: v })), idx)}</td>
            <td>${textCell  ('UOM',      c.UOM,      idx)}</td>
            <td>${selectCell('CTNTYPE',  c.CTNTYPE,  ctn.map(v => ({ v, t: v })), idx)}</td>
            <td>${numCell('CTN20',    c.CTN20,    idx)}</td>
            <td>${numCell('CTN40',    c.CTN40,    idx)}</td>
            <td>${numCell('CTN40HC',  c.CTN40HC,  idx)}</td>
            <td>${numCell('CTN45',    c.CTN45,    idx)}</td>
            <td>${numCell('LCL',      c.LCL,      idx)}</td>
            <td>${numCell('VATRATE',  c.VATRATE,  idx)}</td>
            <td>${numCell('VATINOUT', c.VATINOUT, idx)}</td>
            <td>${numCell('WTRATE',   c.WTRATE,   idx)}</td>
        `;
    }

    function wireCostInputs(rate) {
        const tbody = $('#costTbody');
        tbody.querySelectorAll('[data-cost-field]').forEach(el => {
            el.onchange = () => {
                const idx = +el.dataset.idx;
                const field = el.dataset.costField;
                let val = el.value;
                if (NUMERIC_FIELDS.includes(field)) val = num(val);
                rate.costs[idx][field] = val;

                if (field === 'EXPCODE') {
                    const s = state.data.masters.services.find(x => x.Code === val);
                    if (s) rate.costs[idx].EXPDESC1 = s.Desc;
                    render();
                }
                setDirty(true);
            };
        });
        tbody.querySelectorAll('[data-action="del-cost"]').forEach(b => {
            b.onclick = () => {
                rate.costs.splice(+b.dataset.idx, 1);
                render();
                setDirty(true);
            };
        });
    }

    function textCell(field, val, idx) {
        return `<input class="cell-input" data-cost-field="${field}" data-idx="${idx}" value="${escapeHtml(val || '')}">`;
    }
    function numCell(field, val, idx) {
        return `<input class="cell-input text-right" type="number" data-cost-field="${field}" data-idx="${idx}" value="${val ?? ''}">`;
    }
    function selectCell(field, val, opts, idx) {
        const options = opts.map(o => `<option value="${o.v}" ${o.v === val ? 'selected' : ''}>${o.t}</option>`).join('');
        return `<select class="cell-input" data-cost-field="${field}" data-idx="${idx}"><option value=""></option>${options}</select>`;
    }

    function addCostLine() {
        const rate = getCurrentRate();
        if (!rate) return;
        rate.costs = rate.costs || [];
        rate.costs.push({
            PMKEY: nextPmKey(rate.costs),
            SEQNO: rate.costs.length + 1,
            EXPCODE: '', EXPDESC1: '',
            ITEMCURR: 'USD', UOM: 'CTN',
            CTNTYPE: rate.XCTNTYPE || 'Dry',
            CTN20: 0, CTN40: 0, CTN40HC: 0, CTN45: 0, LCL: 0,
            VATRATE: 0, VATINOUT: 0, WTRATE: 0
        });
        render();
        setDirty(true);
    }

    function applyToTotal(populateDetailForm) {
        const rate = getCurrentRate();
        if (!rate) return;
        const sum = { CTN20: 0, CTN40: 0, CTN40HC: 0, CTN45: 0, LCL: 0 };
        rate.costs.forEach(c => {
            sum.CTN20   += num(c.CTN20);
            sum.CTN40   += num(c.CTN40);
            sum.CTN40HC += num(c.CTN40HC);
            sum.CTN45   += num(c.CTN45);
            sum.LCL     += num(c.LCL);
        });
        rate.XCTN20   = sum.CTN20   ? String(sum.CTN20)   : '';
        rate.XCTN40   = sum.CTN40   ? String(sum.CTN40)   : '';
        rate.XCTN40HC = sum.CTN40HC ? String(sum.CTN40HC) : '';
        rate.XCTN45   = sum.CTN45   ? String(sum.CTN45)   : '';
        rate.XLCL     = sum.LCL     ? String(sum.LCL)     : '';
        if (populateDetailForm) populateDetailForm();
        setDirty(true);
        showToast('Totals applied');
    }

    function loadCode() {
        render();
        showToast('Loaded service codes');
    }

    return { render, addCostLine, applyToTotal, loadCode };
}());
