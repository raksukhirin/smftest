/* search.js — Search bar behaviour + the filter pipeline that feeds the grid.
 *
 * Filters (all AND-combined), mirroring the legacy form:
 *   • Search mode: BY LOCATION (origin/destination port + country) or BY VESSEL
 *   • ID (DETID) exact-ish contains
 *   • Date window: Search By Departure|Arrival, Start Date + Weeks Out
 *   • Date tab: day-of-week checkboxes for DEPART and ARRIVE
 *   • Port tab: checklist — keep rows whose LOADPORT or FINALPORT is checked
 *   • Carrier tab: checklist — keep rows whose carrier is checked
 */
window.VS = window.VS || {};
window.VS.search = (function () {
    'use strict';
    const { $, $$, escapeHtml } = VS.utils;
    const U = VS.utils;
    const { state } = VS.state;

    let onAddNew = () => {};

    function init(opts = {}) {
        onAddNew = opts.onAddNew || onAddNew;

        // ----- mode toggle -----
        $$('.mode-toggle').forEach(btn => btn.addEventListener('click', () => setMode(btn.dataset.mode)));

        // ----- filter tabs -----
        $$('.filter-tab').forEach(t => t.addEventListener('click', () => setFilterTab(t.dataset.ftab)));

        // ----- start-date checkbox enables the date input + defaults to today,
        //       so ticking it immediately activates the date-window condition --
        $('#startDateChk').addEventListener('change', e => {
            const dt = $('#startDate');
            dt.disabled = !e.target.checked;
            if (e.target.checked) {
                if (!dt.value) dt.value = U.toIso(new Date());
                dt.focus();
            }
        });

        // ----- port code → name autofill (origin/destination) -----
        bindPortAutofill('origPortCode', 'origPortName');
        bindPortAutofill('destPortCode', 'destPortName');

        // ----- buttons -----
        $('#searchBtn').onclick = doSearch;
        $('#clearBtn').onclick  = clearScreen;
        $('#addRowBtn').onclick = () => onAddNew();
        $('#reloadVessel').onclick = () => { buildVesselList(); VS.ui.showToast('Vessel list reloaded'); };

        // toggle-all in checklists
        $$('[data-checkall]').forEach(b => b.addEventListener('click', () => toggleAll(b.dataset.checkall)));

        // Enter key triggers search from any criteria input
        $$('#paneLocation input, #paneVessel input, #idSearch').forEach(el =>
            el.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); }));

        buildCountrySelects();
        buildPortDatalist();
        buildVesselList();
        buildChecklist('port', 'portChecklist', portOptions());
        buildChecklist('carrier', 'carrierChecklist', carrierOptions());
    }

    /* ---------------- mode + tabs ---------------- */
    function setMode(mode) {
        state.searchMode = mode;
        $$('.mode-toggle').forEach(b => b.classList.toggle('is-active', b.dataset.mode === mode));
        $('#paneLocation').classList.toggle('hidden', mode !== 'LOCATION');
        $('#paneVessel').classList.toggle('hidden', mode !== 'VESSEL');
    }

    function setFilterTab(tab) {
        state.activeFilterTab = tab;
        $$('.filter-tab').forEach(t => t.classList.toggle('is-active', t.dataset.ftab === tab));
        $$('.filter-panel').forEach(p => p.classList.toggle('hidden', p.dataset.fpanel !== tab));
    }

    /* ---------------- master-driven widgets ---------------- */
    function buildCountrySelects() {
        const countries = ['ALL', ...new Set(state.data.masters.ports.map(p => p.Country))];
        ['origCountry', 'destCountry'].forEach(id => {
            $('#' + id).innerHTML = countries.map(c =>
                `<option value="${c === 'ALL' ? '' : escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
        });
    }

    function buildPortDatalist() {
        $('#portCodeList').innerHTML = state.data.masters.ports.map(p =>
            `<option value="${escapeHtml(p.PortCode)}">${escapeHtml(p.PortName)}</option>`).join('');
    }

    function buildVesselList() {
        $('#vesselList').innerHTML = state.data.masters.vessels.map(v =>
            `<option value="${escapeHtml(v.Vessel)}">`).join('');
    }

    function bindPortAutofill(codeId, nameId) {
        $('#' + codeId).addEventListener('input', e => {
            const p = state.data.masters.ports.find(x => x.PortCode === e.target.value.toUpperCase());
            $('#' + nameId).value = p ? p.PortName : '';
        });
    }

    function portOptions() {
        // distinct ports that actually appear in schedules (load or final)
        const used = new Set();
        state.data.schedules.forEach(r => { used.add(r.LOADPORT); used.add(r.FINALPORT); });
        return state.data.masters.ports
            .filter(p => used.has(p.PortCode))
            .map(p => ({ value: p.PortCode, label: p.PortName }));
    }

    function carrierOptions() {
        const seen = new Map();
        state.data.schedules.forEach(r => { if (r.LINERNAME) seen.set(r.LINERNAME, r.LINERNAME); });
        return [...seen.keys()].map(name => ({ value: name, label: name }));
    }

    function buildChecklist(key, containerId, options) {
        $('#' + containerId).innerHTML = options.map(o => `
            <label>
                <input type="checkbox" data-${key} value="${escapeHtml(o.value)}" checked>
                <span class="code">${escapeHtml(o.value)}</span>
                <span class="text-slate-600">${escapeHtml(o.label === o.value ? '' : o.label)}</span>
            </label>`).join('') || `<div class="text-xs text-slate-400 italic px-1">none</div>`;
    }

    function toggleAll(which) {
        const id = which === 'Port' ? 'portChecklist' : 'carrierChecklist';
        const boxes = $$(`#${id} input[type=checkbox]`);
        const allOn = boxes.every(b => b.checked);
        boxes.forEach(b => b.checked = !allOn);
    }

    /* ---------------- the filter pipeline ---------------- */
    function checkedValues(containerId) {
        return new Set($$(`#${containerId} input:checked`).map(b => b.value));
    }
    function uncheckedExist(containerId) {
        return $$(`#${containerId} input`).some(b => !b.checked);
    }
    function checkedDows(scope) {
        // scope: 'DEP' | 'ARR'
        return new Set($$(`tr[data-dow="${scope}"] input:checked`).map(b => b.dataset.d));
    }

    /** User-initiated search (SEARCH button / Enter): hide the detail panel,
     *  then run the query. Internal callers use runSearch() directly so they
     *  can keep the panel open (e.g. after Save / Delete). */
    function doSearch() {
        VS.detail.hide();
        runSearch();
    }

    function runSearch() {
        state.draft = null;   // a real search discards any in-progress add
        let rows = state.data.schedules.slice();

        // mode-specific criteria
        if (state.searchMode === 'LOCATION') {
            const oc = $('#origCountry').value, op = $('#origPortCode').value.trim().toUpperCase();
            const dc = $('#destCountry').value, dp = $('#destPortCode').value.trim().toUpperCase();
            if (oc) rows = rows.filter(r => portCountry(r.LOADPORT) === oc);
            if (op) rows = rows.filter(r => r.LOADPORT === op);
            if (dc) rows = rows.filter(r => portCountry(r.FINALPORT) === dc);
            if (dp) rows = rows.filter(r => r.FINALPORT === dp);
        } else {
            const v = $('#vesselSearch').value.trim().toUpperCase();
            if (v && v !== 'ALL') rows = rows.filter(r => (r.VESSEL || '').toUpperCase().includes(v));
        }

        // ID
        const id = $('#idSearch').value.trim();
        if (id) rows = rows.filter(r => r.DETID.includes(id));

        // date window (Search By dep/arr + Start Date + Weeks Out)
        if ($('#startDateChk').checked && $('#startDate').value) {
            const start = $('#startDate').value;
            const end = U.addDays(start, parseInt($('#weeksOut').value, 10) * 7);
            const key = $('#searchBy').value === 'ARR' ? 'ARRDATE' : 'DEPDATE';
            rows = rows.filter(r => r[key] >= start && r[key] <= end);
        }

        // day-of-week (Date tab)
        const depDows = checkedDows('DEP'), arrDows = checkedDows('ARR');
        if (depDows.size < 7) rows = rows.filter(r => depDows.has(r.DEPDAY));
        if (arrDows.size < 7) rows = rows.filter(r => arrDows.has(r.ARRDAY));

        // Port tab checklist
        if (uncheckedExist('portChecklist')) {
            const keep = checkedValues('portChecklist');
            rows = rows.filter(r => keep.has(r.LOADPORT) || keep.has(r.FINALPORT));
        }

        // Carrier tab checklist
        if (uncheckedExist('carrierChecklist')) {
            const keep = checkedValues('carrierChecklist');
            rows = rows.filter(r => keep.has(r.LINERNAME));
        }

        // sort by the active date key
        const sortKey = $('#searchBy').value === 'ARR' ? 'ARRDATE' : 'DEPDATE';
        rows.sort((a, b) => (a[sortKey] < b[sortKey] ? -1 : a[sortKey] > b[sortKey] ? 1 : 0));

        state.filtered = rows;
        VS.grid.render(rows);
    }

    function portCountry(code) {
        const p = state.data.masters.ports.find(x => x.PortCode === code);
        return p ? p.Country : '';
    }

    function clearScreen() {
        $('#origCountry').value = ''; $('#origPortCode').value = ''; $('#origPortName').value = '';
        $('#destCountry').value = ''; $('#destPortCode').value = ''; $('#destPortName').value = '';
        $('#vesselSearch').value = ''; $('#idSearch').value = '';
        $('#startDateChk').checked = false; $('#startDate').value = ''; $('#startDate').disabled = true;
        $('#weeksOut').value = '4'; $('#searchBy').value = 'DEP';
        $$('tr[data-dow] input, #portChecklist input, #carrierChecklist input').forEach(b => b.checked = true);
        // empty the grid, then show a single Add-New row ready for entry
        state.filtered = [];
        state.draft = null;
        VS.grid.render([]);
        VS.crud.addNew();
        VS.ui.showToast('Screen cleared — add new');
    }

    // refresh checklists when seed data changes (after CRUD / reset)
    function refreshMasters() {
        buildChecklist('port', 'portChecklist', portOptions());
        buildChecklist('carrier', 'carrierChecklist', carrierOptions());
        buildVesselList();
    }

    return { init, runSearch, clearScreen, setMode, refreshMasters };
}());
