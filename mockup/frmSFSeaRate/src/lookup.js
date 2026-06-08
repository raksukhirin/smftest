/* lookup.js — Lookup modal for Agent / Carrier / Port code.
 * Replaces VB6 `frmSMBusiness.ShowPaste` / `frmOPPort.ShowPaste`.
 */

import { $ } from './utils.js';
import { state, getCurrentRate, setDirty } from './state.js';
import { populate as populateDetailForm } from './detail.js';

const _state = { kind: null, target: null, rows: [], cols: [] };

export function init() {
    $('#lookupClose').onclick = closeModal;
    $('#lookupSearch').addEventListener('input', renderRows);

    // Wire lookup buttons inside the detail pane
    document.querySelectorAll('#detailPane .lookup-btn').forEach(b => {
        b.onclick = () => open(b.dataset.lookup, b.dataset.target);
    });
}

export function open(kind, target) {
    _state.kind   = kind;
    _state.target = target;

    let title = '', rows = [], cols = [];
    if (kind === 'PORT') {
        title = 'Lookup Port (PortType = SF)';
        rows = state.data.masters.ports;
        cols = [['PortCode', 'Code', 100], ['PortName', 'Name', 220], ['Country', 'Country', 160]];
    } else if (kind === 'AGENT') {
        title = 'Lookup Agent (Forwarder / Sealine)';
        rows = state.data.masters.businesses;
        cols = [['ComNo', 'Code', 100], ['ComName', 'Name', 280], ['VendClass', 'Class', 120]];
    } else if (kind === 'LINER') {
        title = 'Lookup Carrier (Sealine)';
        rows = state.data.masters.businesses.filter(b => b.VendClass === 'SEALINE');
        cols = [['ComNo', 'Code', 100], ['ComName', 'Name', 280], ['VendClass', 'Class', 120]];
    }
    _state.rows = rows;
    _state.cols = cols;

    $('#lookupTitle').textContent = title;
    $('#lookupSearch').value = '';
    $('#lookupThead').innerHTML =
        `<tr>${cols.map(c => `<th style="width:${c[2]}px">${c[1]}</th>`).join('')}</tr>`;
    renderRows();
    const m = $('#lookupModal');
    m.classList.remove('hidden');
    m.classList.add('flex');
    setTimeout(() => $('#lookupSearch').focus(), 50);
}

function renderRows() {
    const q = $('#lookupSearch').value.toLowerCase();
    const tbody = $('#lookupTbody');
    const cols = _state.cols;
    const rows = _state.rows.filter(r =>
        cols.some(c => String(r[c[0]] || '').toLowerCase().includes(q))
    );
    tbody.innerHTML = rows.map(r =>
        `<tr data-pick='${JSON.stringify(r).replace(/'/g, '&#39;')}'>${cols.map(c => `<td>${r[c[0]] || ''}</td>`).join('')}</tr>`
    ).join('') || `<tr><td colspan="${cols.length}" class="row-empty">No matches</td></tr>`;

    tbody.querySelectorAll('tr[data-pick]').forEach(tr => {
        tr.ondblclick = tr.onclick = () => pick(JSON.parse(tr.dataset.pick));
    });
}

function pick(row) {
    const rate = getCurrentRate();
    if (!rate) return;
    const { kind, target } = _state;
    if (kind === 'PORT') {
        rate[target + 'PORT']     = row.PortCode;
        rate[target + 'PORTNAME'] = row.PortName;
    } else if (kind === 'AGENT') {
        rate.AGENTNO   = row.ComNo;
        rate.AGENTNAME = row.ComName;
    } else if (kind === 'LINER') {
        rate.LINERNO   = row.ComNo;
        rate.LINERNAME = row.ComName;
    }
    populateDetailForm();
    setDirty(true);
    closeModal();
}

function closeModal() {
    $('#lookupModal').classList.add('hidden');
}
