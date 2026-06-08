/* detail.js — Rate Detail edit pane (right side, slides in on DblClick). */
window.RC = window.RC || {};
window.RC.detail = (function () {
    'use strict';
    const { $, $$, num } = RC.utils;
    const { state, getCurrentRate, setDirty } = RC.state;

    function init() {
        const ctn = $('#xCtnType');
        ctn.innerHTML = '<option value=""></option>' +
            state.data.masters.containerTypes
                .map(t => `<option value="${t}">${t}</option>`).join('');

        $$('#detailPane [data-field]').forEach(el => {
            el.addEventListener('input', () => onFieldChange(el));
        });

        $('#closeDetailBtn').onclick = close;
        $('#hideBtn').onclick        = close;
    }

    function onFieldChange(el) {
        if (!state.currentRateId) return;
        const rate = getCurrentRate();
        if (!rate) return;
        const f = el.dataset.field;
        let v = el.value;
        if (f === 'TRANSIT') v = num(v);
        rate[f] = v;
        setDirty(true);

        if (['LOADPORT', 'DISPORT', 'FINALPORT', 'TRANPORT'].includes(f)) {
            const port = state.data.masters.ports.find(p => p.PortCode.toUpperCase() === v.toUpperCase());
            if (port) {
                rate[f + 'NAME'] = port.PortName;
                $(`#detailPane [data-field="${f}NAME"]`).value = port.PortName;
            }
        }
        if (['AGENTNO', 'LINERNO'].includes(f)) {
            const b = state.data.masters.businesses.find(x => x.ComNo === v);
            if (b) {
                const target = f === 'AGENTNO' ? 'AGENTNAME' : 'LINERNAME';
                rate[target] = b.ComName;
                $(`#detailPane [data-field="${target}"]`).value = b.ComName;
            }
        }
    }

    function open(rateId) {
        RC.masterGrid.selectRate(rateId);
        $('#detailPane').classList.remove('hidden');
        $('#detailPane').classList.add('is-open');
        document.body.classList.add('detail-open');
        populate();
        RC.subRate.render();
        $('#addCostBtn').disabled    = false;
        $('#loadCodeBtn').disabled   = false;
        $('#applyTotalBtn').disabled = false;
        const tr = document.querySelector(`#masterTbody tr[data-rateid="${rateId}"]`);
        if (tr) tr.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function close() {
        $('#detailPane').classList.add('hidden');
        $('#detailPane').classList.remove('is-open');
        document.body.classList.remove('detail-open');
        $('#addCostBtn').disabled    = true;
        $('#loadCodeBtn').disabled   = true;
        $('#applyTotalBtn').disabled = true;
        RC.subRate.render();
    }

    function populate() {
        const rate = getCurrentRate();
        if (!rate) return;
        $$('#detailPane [data-field]').forEach(el => {
            const f = el.dataset.field;
            el.value = rate[f] ?? '';
        });
        const isAdd = !!rate.__addMode;
        $('#detailMode').textContent = isAdd ? 'ADD' : 'VIEW';
        $('#detailMode').className   = 'status-pill ml-2 ' + (isAdd ? 'status-add' : 'status-open');
        setDirty(isAdd);
    }

    function onMasterRowSelected() {
        if ($('#detailPane').classList.contains('is-open')) populate();
    }

    function isOpen() {
        return $('#detailPane').classList.contains('is-open');
    }

    return { init, open, close, populate, onMasterRowSelected, isOpen };
}());
