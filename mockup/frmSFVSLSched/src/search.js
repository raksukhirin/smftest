/* search.js — Sidebar: filter controls + voyage result list + selection. */
window.VSL = window.VSL || {};
window.VSL.search = (function () {
    'use strict';
    const U = VSL.utils, S = VSL.state;
    const { $, $$, escapeHtml } = U;
    let onSelect = () => {};

    function init(opts = {}) {
        onSelect = opts.onSelect || onSelect;
        buildFilterOptions();

        const f = S.state.filters;
        // Carrier / POL / POD are searchable typeaheads (datalist) → resolve to id.
        $('#fText').addEventListener('input',  e => { f.text = e.target.value; render(); });
        $('#fCarrier').addEventListener('input', e => { f.carrier = resolveCarrierId(e.target.value); render(); });
        $('#fSchedule').addEventListener('change', e => { f.schedule = e.target.value; render(); });
        $('#fPol').addEventListener('input', e => { f.pol = resolvePortId(e.target.value); render(); });
        $('#fPod').addEventListener('input', e => { f.pod = resolvePortId(e.target.value); render(); });
        $('#fEtdFrom').addEventListener('change', e => { f.etdFrom = e.target.value; render(); });
        $('#fEtdTo').addEventListener('change', e => { f.etdTo = e.target.value; render(); });
        $('#btnClear').addEventListener('click', clearFilters);
    }

    function buildFilterOptions() {
        const d = S.state.data;
        const opt = t => `<option value="${escapeHtml(t)}">`;
        $('#carrierFilterDL').innerHTML = (d.carriers || []).map(c => opt(`${c.carrierCode} — ${c.carrierName}`)).join('');
        $('#portFilterDL').innerHTML    = (d.ports || []).map(p => opt(`${p.portCode} — ${p.portName}`)).join('');
    }

    // strict resolve (exact label or exact code) → empty until a real match, so
    // partial typing doesn't filter prematurely.
    function resolveCarrierId(text) {
        const t = (text || '').trim(); if (!t) return '';
        const d = S.state.data;
        let c = (d.carriers||[]).find(x => `${x.carrierCode} — ${x.carrierName}` === t);
        if (!c) { const code = t.split('—')[0].trim().toUpperCase(); c = (d.carriers||[]).find(x => (x.carrierCode||'').toUpperCase() === code); }
        return c ? c.carrierId : '';
    }
    function resolvePortId(text) {
        const t = (text || '').trim(); if (!t) return '';
        const d = S.state.data;
        let p = (d.ports||[]).find(x => `${x.portCode} — ${x.portName}` === t);
        if (!p) { const code = t.split('—')[0].trim().toUpperCase(); p = (d.ports||[]).find(x => (x.portCode||'').toUpperCase() === code); }
        return p ? p.portId : '';
    }

    function applyFilters(vms) {
        const f = S.state.filters;
        const needle = f.text.trim().toLowerCase();
        return vms.filter(v => {
            if (f.carrier && S.getVoyage(v.voyageId).carrierId !== f.carrier) return false;
            if (f.schedule && v.scheduleStatus !== f.schedule) return false;
            if (f.pol && S.getVoyage(v.voyageId).polPortId !== f.pol) return false;
            if (f.pod && S.getVoyage(v.voyageId).podPortId !== f.pod) return false;
            if (f.etdFrom && U.dateOnly(v.etd) < f.etdFrom) return false;
            if (f.etdTo   && U.dateOnly(v.etd) > f.etdTo)   return false;
            if (needle) {
                const hay = [v.vesselName, v.voyageNo, v.carrierCode, v.carrierName,
                             v.serviceName, v.serviceCode, v.polCode, v.podCode].join(' ').toLowerCase();
                if (!hay.includes(needle)) return false;
            }
            return true;
        });
    }

    function render() {
        const vms = applyFilters(S.allVoyageVMs())
            .sort((a, b) => U.epoch(a.etd) - U.epoch(b.etd));
        $('#resultCount').textContent = String(vms.length);

        const list = $('#voyageList');
        if (!vms.length) {
            list.innerHTML = `<div class="list-empty">No voyage matches the filters.</div>`;
            return;
        }
        list.innerHTML = vms.map(v => {
            const active = v.voyageId === S.state.selectedVoyageId ? ' active' : '';
            const delayed = v.scheduleStatus === 'Delayed';
            return `<div class="vessel-card${active}" data-id="${escapeHtml(v.voyageId)}">
                <div class="vc-top">
                    <strong>${escapeHtml(v.vesselName)}</strong>
                    <span class="pill ${delayed ? 'pill-warn' : 'pill-ok'}">${escapeHtml(v.scheduleStatus)}</span>
                </div>
                <small>Voyage: ${escapeHtml(v.voyageNo)} | Carrier: ${escapeHtml(v.carrierCode)} | ${escapeHtml(v.direction)}</small>
                <div class="route">${escapeHtml(v.polCode)} → ${escapeHtml(v.podCode)} · ${escapeHtml(v.transitDays)}d</div>
                <div class="vc-etd">ETD ${escapeHtml(U.fmtDateShort(v.etd))} · ${escapeHtml(v.bookingCount)} booking(s)</div>
            </div>`;
        }).join('');

        $$('#voyageList .vessel-card').forEach(card =>
            card.addEventListener('click', () => select(card.dataset.id)));
    }

    function select(voyageId) {
        S.state.selectedVoyageId = voyageId;
        $$('#voyageList .vessel-card').forEach(c =>
            c.classList.toggle('active', c.dataset.id === voyageId));
        onSelect(voyageId);
    }

    function clearFilters() {
        // mutate in place — handlers captured this object reference at init()
        Object.assign(S.state.filters, { text:'', carrier:'', schedule:'', pol:'', pod:'', etdFrom:'', etdTo:'' });
        $('#fText').value = ''; $('#fCarrier').value = ''; $('#fSchedule').value = '';
        $('#fPol').value = ''; $('#fPod').value = ''; $('#fEtdFrom').value = ''; $('#fEtdTo').value = '';
        render();
    }

    function selectFirst() {
        const first = $('#voyageList .vessel-card');
        if (first) select(first.dataset.id);
    }

    return { init, render, select, selectFirst };
}());
