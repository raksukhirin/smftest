/* detail.js — Renders the main detail view for the selected voyage:
 * header, summary cards, route timeline, voyage ports, cut-offs and bookings.
 */
window.VSL = window.VSL || {};
window.VSL.detail = (function () {
    'use strict';
    const U = VSL.utils, S = VSL.state;
    const { $, escapeHtml } = U;

    const schedPill  = s => s === 'Delayed' ? 'pill-warn' : 'pill-ok';
    const cutPill    = s => s === 'Closed' ? 'pill-danger' : s === 'Today' ? 'pill-warn' : 'pill-ok';
    function bookPill(s) {
        if (/confirm/i.test(s)) return 'pill-ok';
        if (/pending/i.test(s)) return 'pill-warn';
        if (/draft|not started/i.test(s)) return 'pill-muted';
        return 'pill-info';
    }

    function show(voyageId) {
        const v = S.getVoyage(voyageId);
        if (!v) return;
        const vm = S.voyageVM(v);
        const root = $('#detailRoot');
        root.innerHTML = headerHtml(vm) + summaryHtml(vm) + timelineHtml(voyageId)
            + `<div class="grid2">${voyagePortsHtml(voyageId)}${cutOffsHtml(voyageId)}</div>`
            + bookingsHtml(voyageId);
        root.scrollTop = 0;
    }

    function headerHtml(vm) {
        return `<div class="header">
            <h1>${escapeHtml(vm.vesselName)} / Voyage ${escapeHtml(vm.voyageNo)}</h1>
            <div class="badges">
                <span>Carrier: ${escapeHtml(vm.carrierCode)} — ${escapeHtml(vm.carrierName)}</span>
                <span>Direction: ${escapeHtml(vm.direction)}</span>
                <span>Service: ${escapeHtml(vm.polCode)} → ${escapeHtml(vm.podCode)} (${escapeHtml(vm.serviceCode)})</span>
                <span>IMO: ${escapeHtml(vm.imoNo)}</span>
                <span class="pill ${schedPill(vm.scheduleStatus)}">${escapeHtml(vm.scheduleStatus)}</span>
                <span class="pill pill-info">Booking ${escapeHtml(vm.bookingStatus)}</span>
            </div>
        </div>`;
    }

    function summaryHtml(vm) {
        const nc = vm.nextCutOffDateTime
            ? `${U.fmtDateShort(vm.nextCutOffDateTime)} ${U.fmtTime(vm.nextCutOffDateTime)}`
            : '—';
        const card = (lbl, val, hint='') =>
            `<div class="summary-card"><small>${lbl}</small><strong>${escapeHtml(val)}</strong>${hint?`<div class="hint">${escapeHtml(hint)}</div>`:''}</div>`;
        return `<section class="summary">
            ${card('POL (Origin)', vm.polCode, vm.polName)}
            ${card('POD (Destination)', vm.podCode, vm.podName)}
            ${card('Transit Time', vm.transitDays + ' Days', `ETD ${U.fmtDateShort(vm.etd)} → ETA ${U.fmtDateShort(vm.eta)}`)}
            ${card('Next Closing', nc, vm.nextCutOffType || 'No open cut-off')}
        </section>`;
    }

    function timelineHtml(voyageId) {
        const vps = S.voyagePortsOf(voyageId);
        const cells = vps.map((vp, i) => {
            const p = S.port(vp.portId);
            const cls = vp.moveType === 'Load' ? 'is-pol' : vp.moveType === 'Discharge' ? 'is-pod' : '';
            const when = vp.etd ? `ETD ${U.fmtDateShort(vp.etd)} ${U.fmtTime(vp.etd)}`
                       : vp.eta ? `ETA ${U.fmtDateShort(vp.eta)} ${U.fmtTime(vp.eta)}` : '';
            const arrow = i < vps.length - 1 ? '<div class="arrow">→</div>' : '';
            return `<div class="port ${cls}">
                <div class="pcode">${escapeHtml(p.portCode || '?')}</div>
                <div class="pname">${escapeHtml(p.portName || '')}</div>
                <div class="pmove">${escapeHtml(vp.moveType)}</div>
                <div class="ptime">${escapeHtml(when)}</div>
            </div>${arrow}`;
        }).join('');
        return `<section class="panel"><h3>🗺️ Route Timeline</h3><div class="timeline">${cells}</div></section>`;
    }

    function voyagePortsHtml(voyageId) {
        const vps = S.voyagePortsOf(voyageId);
        const rows = vps.map(vp => {
            const p = S.port(vp.portId);
            return `<tr>
                <td>${escapeHtml(vp.sequenceNo)}</td>
                <td><strong>${escapeHtml(p.portCode || '')}</strong> <span class="muted">${escapeHtml(p.portName || '')}</span></td>
                <td>${escapeHtml(vp.eta ? U.fmtDateTime(vp.eta) : '—')}</td>
                <td>${escapeHtml(vp.etd ? U.fmtDateTime(vp.etd) : '—')}</td>
                <td>${escapeHtml(vp.moveType)}</td>
                <td><span class="pill ${vp.status==='Delayed'?'pill-warn':'pill-muted'}">${escapeHtml(vp.status)}</span></td>
            </tr>`;
        }).join('');
        return `<section class="panel">
            <h3>📍 VoyagePort / Schedule <span class="count">${vps.length}</span></h3>
            <table>
                <thead><tr><th>Seq</th><th>Port</th><th>ETA</th><th>ETD</th><th>Move</th><th>Status</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="6" class="muted">No port calls</td></tr>'}</tbody>
            </table>
            <div class="muted" style="font-size:11px;margin-top:8px">Terminal/berth available per call in source data.</div>
        </section>`;
    }

    function cutOffsHtml(voyageId) {
        const cos = S.cutOffsOf(voyageId);
        const nextId = (S.nextCutOff(voyageId) || {}).cutOffId;
        const rows = cos.map(c => `<tr class="${c.cutOffId===nextId?'cut-next':''}">
            <td>${escapeHtml(c.cutOffType)}</td>
            <td class="mono">${escapeHtml(U.fmtDateTime(c.cutOffDateTime))}</td>
            <td><span class="pill ${cutPill(c.status)}">${escapeHtml(c.status)}</span></td>
            <td class="muted">${escapeHtml(c.remark || '')}</td>
        </tr>`).join('');
        return `<section class="panel">
            <h3>⏱️ CutOff Control <span class="count">${cos.length}</span></h3>
            <table>
                <thead><tr><th>CutOff Type</th><th>Date / Time</th><th>Status</th><th>Remark</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="4" class="muted">No cut-offs</td></tr>'}</tbody>
            </table>
        </section>`;
    }

    function bookingsHtml(voyageId) {
        const bks = S.bookingsOf(voyageId);
        let cbm = 0, kg = 0;
        const rows = bks.map(b => {
            cbm += (+b.cbm || 0); kg += (+b.grossWeightKg || 0);
            const mode = b.shipmentMode === 'FCL'
                ? `FCL ${escapeHtml(b.containerQty || '')}×${escapeHtml(b.containerType || '')}`
                : escapeHtml(b.shipmentMode);
            return `<tr>
                <td class="mono">${escapeHtml(b.bookingNo)}</td>
                <td>${escapeHtml(b.customerName)}</td>
                <td>${mode}</td>
                <td>${escapeHtml(S.port(b.polPortId).portCode || '')}</td>
                <td>${escapeHtml(S.port(b.podPortId).portCode || '')}</td>
                <td class="text-right">${(+b.cbm||0).toFixed(2)}</td>
                <td class="text-right">${(+b.grossWeightKg||0).toLocaleString()}</td>
                <td><span class="pill ${bookPill(b.status)}">${escapeHtml(b.status)}</span></td>
                <td><span class="pill ${bookPill(b.siStatus)}">${escapeHtml(b.siStatus)}</span></td>
                <td><span class="pill ${bookPill(b.customsStatus)}">${escapeHtml(b.customsStatus)}</span></td>
            </tr>`;
        }).join('');
        const foot = bks.length ? `<tfoot><tr>
            <td colspan="5">Total — ${bks.length} booking(s)</td>
            <td class="text-right">${cbm.toFixed(2)}</td>
            <td class="text-right">${kg.toLocaleString()}</td>
            <td colspan="3"></td></tr></tfoot>` : '';
        return `<section class="panel">
            <h3>📦 Booking Usage / Console Planning <span class="count">${bks.length}</span></h3>
            <table>
                <thead><tr>
                    <th>Booking No</th><th>Customer</th><th>Mode</th><th>POL</th><th>POD</th>
                    <th class="text-right">CBM</th><th class="text-right">Gross (kg)</th>
                    <th>Status</th><th>SI</th><th>Customs</th>
                </tr></thead>
                <tbody>${rows || '<tr><td colspan="10" class="muted">No bookings on this voyage</td></tr>'}</tbody>
                ${foot}
            </table>
        </section>`;
    }

    return { show };
}());
