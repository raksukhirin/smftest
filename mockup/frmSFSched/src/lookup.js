/* lookup.js — Modal master lookup (Carrier / Vessel / Port), mirroring the
 * VB6 xLookUp + frmSYResults pattern. Wires the 🔍 buttons in the detail panel.
 */
window.VS = window.VS || {};
window.VS.lookup = (function () {
    'use strict';
    const { $, $$, escapeHtml } = VS.utils;
    const { state } = VS.state;
    const D = () => VS.detail;

    let active = null;   // { type, target }

    const SOURCES = {
        CARRIER: {
            title: 'Lookup Carrier',
            cols: ['Code', 'Carrier Name'],
            rows: () => state.data.masters.carriers.map(c => [c.LinerNo, c.LinerName]),
            apply: (row) => { D().fld('LINERNO').value = row[0]; D().fld('LINERNAME').value = row[1]; }
        },
        VESSEL: {
            title: 'Lookup Vessel',
            cols: ['Vessel', 'Callsign', 'Type'],
            rows: () => state.data.masters.vessels.map(v => [v.Vessel, v.Callsign, v.VslType === 'F' ? 'Feeder' : 'Vessel']),
            apply: (row) => { D().fld('VESSEL').value = row[0]; }
        },
        PORT: {
            title: 'Lookup Port',
            cols: ['Code', 'Port Name', 'Country'],
            rows: () => state.data.masters.ports.map(p => [p.PortCode, p.PortName, p.Country]),
            apply: (row, target) => {
                if (target === 'LOAD') { D().fld('LOADPORT').value = row[0]; D().fld('LOADPORTNAME').value = row[1]; }
                else                  { D().fld('FINALPORT').value = row[0]; D().fld('FINALPORTNAME').value = row[1]; }
            }
        }
    };

    function init() {
        $$('#detailPane [data-lookup]').forEach(btn => {
            btn.addEventListener('click', () =>
                openModal(btn.dataset.lookup, btn.dataset.target));
        });
        $('#lookupClose').onclick = close;
        $('#lookupModal').addEventListener('click', e => { if (e.target.id === 'lookupModal') close(); });
        $('#lookupSearch').addEventListener('input', e => filter(e.target.value));
    }

    function openModal(type, target) {
        active = { type, target };
        const src = SOURCES[type];
        $('#lookupTitle').textContent = src.title;
        $('#lookupThead').innerHTML = `<tr>${src.cols.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr>`;
        renderRows(src.rows());
        const m = $('#lookupModal');
        m.classList.remove('hidden'); m.classList.add('flex');
        $('#lookupSearch').value = '';
        $('#lookupSearch').focus();
    }

    function renderRows(rows) {
        $('#lookupTbody').innerHTML = rows.map(r =>
            `<tr>${r.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('') ||
            `<tr><td class="row-empty" colspan="9">No match</td></tr>`;
        $$('#lookupTbody tr').forEach((tr, i) => {
            tr.addEventListener('dblclick', () => pick(rows[i]));
            tr.addEventListener('click', () => {
                $$('#lookupTbody tr').forEach(t => t.classList.remove('is-selected'));
                tr.classList.add('is-selected');
            });
        });
    }

    function filter(q) {
        const all = SOURCES[active.type].rows();
        const needle = q.trim().toUpperCase();
        renderRows(!needle ? all : all.filter(r => r.join(' ').toUpperCase().includes(needle)));
    }

    function pick(row) {
        SOURCES[active.type].apply(row, active.target);
        VS.state.setDirty(true);
        close();
    }

    function close() {
        const m = $('#lookupModal');
        m.classList.add('hidden'); m.classList.remove('flex');
        active = null;
    }

    return { init, openModal };
}());
