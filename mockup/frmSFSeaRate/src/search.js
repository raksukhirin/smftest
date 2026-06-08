/* search.js — Top search bar (filters + Search/Clear buttons).
 *
 * Mirrors `cmdSearch_Click` + `cmdCLR_Click` + `TabStrip2_Click` from the
 * VB6 form. Three tabs (Carrier / Agent / Destination) drive what the main
 * filter input means. Destination shows a second row for PORT (code|name).
 */

import { $, $$ } from './utils.js';
import { state } from './state.js';
import { render as renderMasterGrid } from './master-grid.js';
import { render as renderCostGrid } from './sub-rate.js';
import { close as closeDetailPane } from './detail.js';

let _onAddNew = () => {};   // injected by app.js (CRUD's addNewRate)

export function init({ onAddNew }) {
    if (onAddNew) _onAddNew = onAddNew;

    $$('.tab').forEach(t => t.onclick = () => switchTab(t.dataset.tab));
    $('#searchBtn').onclick  = runSearch;
    $('#clearBtn').onclick   = clearSearch;
    $('#reloadFilter').onclick = populateFilterList;
    $('#reloadPort').onclick = populatePortList;
    $('#validFromChk').onchange = e => { $('#validFrom').disabled = !e.target.checked; };
    $('#validToChk').onchange   = e => { $('#validTo').disabled   = !e.target.checked; };
    $('#jobclassFilter').onchange = runSearch;

    $('#filterValue').addEventListener('keydown', e => { if (e.key === 'Enter') runSearch(); });
    $('#filterValue').addEventListener('input', () => {
        if (state.activeTab === 'Destination') populatePortList();
    });
    $('#filterPort').addEventListener('keydown', e => { if (e.key === 'Enter') runSearch(); });
    $('#rateIdSearch').addEventListener('keydown', e => { if (e.key === 'Enter') runSearch(); });

    populateFilterList();
}

function switchTab(name) {
    state.activeTab = name;
    $$('.tab').forEach(t => t.classList.toggle('is-active', t.dataset.tab === name));
    const labels = { Carrier: 'CARRIER', Agent: 'AGENT', Destination: 'COUNTRY' };
    $('#tabLabel').textContent = labels[name];
    $('#filterValue').value = '';
    $('#filterPort').value  = '';
    const row2 = $('#filterRow2');
    if (name === 'Destination') {
        row2.classList.remove('hidden');
        row2.classList.add('flex');
    } else {
        row2.classList.add('hidden');
        row2.classList.remove('flex');
    }
    populateFilterList();
}

function populateFilterList() {
    const list = $('#filterList');
    list.innerHTML = '<option value="ALL">';
    const set = new Set();
    if (state.activeTab === 'Carrier') {
        state.data.rates.forEach(r => set.add(r.LINERNAME));
    } else if (state.activeTab === 'Agent') {
        state.data.rates.forEach(r => set.add(r.AGENTNAME));
    } else if (state.activeTab === 'Destination') {
        state.data.masters.ports.forEach(p => set.add(p.Country));
    }
    [...set].sort().forEach(v => {
        if (!v) return;
        const opt = document.createElement('option');
        opt.value = v;
        list.appendChild(opt);
    });
    if (state.activeTab === 'Destination') populatePortList();
}

function populatePortList() {
    const list = $('#portList');
    if (!list) return;
    list.innerHTML = '';
    const country = $('#filterValue').value.trim().toUpperCase();
    let ports = state.data.masters.ports;
    if (country && country !== 'ALL') {
        ports = ports.filter(p => (p.Country || '').toUpperCase() === country);
    }
    ports.forEach(p => {
        const opt = document.createElement('option');
        opt.value = `${p.PortCode} | ${p.PortName}`;
        list.appendChild(opt);
    });
}

export function runSearch() {
    state.cleared = false;
    const jc = $('#jobclassFilter').value;
    const vfChk = $('#validFromChk').checked;
    const vtChk = $('#validToChk').checked;
    const vf = vfChk ? $('#validFrom').value : '';
    const vt = vtChk ? $('#validTo').value   : '';
    const filterVal = $('#filterValue').value.trim().toUpperCase();
    const rateId    = $('#rateIdSearch').value.trim();

    let rows = state.data.rates.filter(r => r.JOBCLASS === jc);
    if (vf) rows = rows.filter(r => (r.VALIDITY || '') >= vf);
    if (vt) rows = rows.filter(r => (r.VALIDITY || '') <= vt);
    if (rateId) rows = rows.filter(r => r.RATEID.includes(rateId));

    if (filterVal && filterVal !== 'ALL') {
        if (state.activeTab === 'Carrier') {
            rows = rows.filter(r => (r.LINERNAME || '').toUpperCase().includes(filterVal));
        } else if (state.activeTab === 'Agent') {
            rows = rows.filter(r => (r.AGENTNAME || '').toUpperCase().startsWith(filterVal));
        } else if (state.activeTab === 'Destination') {
            const codes = state.data.masters.ports
                .filter(p => (p.Country || '').toUpperCase() === filterVal)
                .map(p => p.PortCode);
            rows = rows.filter(r => codes.includes(r.FINALPORT));
        }
    }
    if (state.activeTab === 'Destination') {
        const portRaw = $('#filterPort').value.trim();
        if (portRaw) {
            const code = portRaw.split('|')[0].trim().toUpperCase();
            if (code) rows = rows.filter(r => (r.FINALPORT || '').toUpperCase() === code);
        }
    }

    renderMasterGrid(rows);
    $('#recCount').textContent = state.data.rates.length;
    $('#gridStatus').textContent = `${rows.length} rate(s) found`;
}

/** Mirrors VB6 cmdCLR_Click: hide detail, reset filters, render 1 blank add row. */
export function clearSearch() {
    $('#validFromChk').checked = false; $('#validFrom').disabled = true; $('#validFrom').value = '';
    $('#validToChk').checked   = false; $('#validTo').disabled   = true; $('#validTo').value   = '';
    $('#filterValue').value = '';
    $('#filterPort').value  = '';
    $('#rateIdSearch').value = '';
    $('#jobclassFilter').value = 'EX';
    switchTab('Carrier');
    closeDetailPane();
    state.currentRateId = null;
    state.cleared = true;

    const tbody = $('#masterTbody');
    tbody.innerHTML = `
        <tr class="add-new-row" data-action="add-new">
            <td colspan="18">
                <span class="add-new-icon">＋</span>
                <span class="add-new-text">Double-click here to add a new rate</span>
            </td>
        </tr>`;
    tbody.querySelector('.add-new-row').ondblclick = () => _onAddNew();

    $('#gridStatus').textContent = 'Screen cleared — Double-click the blank row to add new';
    $('#recActive').textContent = '—';
    renderCostGrid();

    // Scroll the placeholder fully into view
    requestAnimationFrame(() => {
        const last = tbody.lastElementChild;
        if (last) last.scrollIntoView({ block: 'end', behavior: 'smooth' });
    });
}
