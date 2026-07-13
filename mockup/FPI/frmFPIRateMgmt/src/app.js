/* app.js — Rate Management: filters → search → detail/compare + Confirm/Cancel. */
window.RM = window.RM || {};
window.RM.app = (function () {
    'use strict';

    const { $, $$, esc, todayISO } = RM.utils;
    const { state } = RM.state;

    let cmpContainer = '40HQ';

    /* ---------------- master option lists ---------------- */

    function fillSelect(id, values, placeholder) {
        const s = $(id);
        s.innerHTML = '<option value="">' + placeholder + '</option>' +
            values.map(v => '<option>' + esc(v) + '</option>').join('');
    }

    function uniq(arr) { return Array.from(new Set(arr.filter(Boolean))).sort(); }

    /* ---------------- search pipeline ---------------- */

    function readFilters() {
        return {
            mode: $('#fMode').value, jobClass: $('#fClass').value,
            pol: $('#fPol').value, pod: $('#fPod').value,
            carrier: $('#fCarrier').value, source: $('#fSource').value,
            status: $('#fStatus').value, text: $('#fText').value.trim().toUpperCase(),
            activeOnly: $('#fActiveOnly').checked,
            alert: state.filters.alert || null
        };
    }

    function search() {
        const f = readFilters();
        state.filters = f;
        const asOf = state.asOf;

        const rows = RM.state.rates().map(rate => {
            const alert = RM.alerts.alertOf(rate, asOf);
            const active = RM.alerts.isActive(rate, asOf);
            const d2exp = active ? RM.alerts.daysToExpiry(rate, asOf) : null;
            return { rate, alert, active, d2exp };
        }).filter(({ rate, alert, active }) => {
            if (f.mode && rate.mode !== f.mode) return false;
            if (f.jobClass && rate.jobClass !== f.jobClass) return false;
            if (f.pol && rate.pol !== f.pol) return false;
            if (f.pod && rate.pod !== f.pod) return false;
            if (f.carrier && rate.carrierName !== f.carrier) return false;
            if (f.source && rate.rateSource !== f.source) return false;
            if (f.status && rate.status !== f.status) return false;
            if (f.text && rate.rateNo.toUpperCase().indexOf(f.text) === -1) return false;
            if (f.activeOnly && !active) return false;
            if (f.alert && (!alert || alert.type !== f.alert)) return false;
            return true;
        });

        // sort: alerts first (expired > expiring), then by lane
        rows.sort((a, b) => {
            const w = x => x.alert ? ({ EXPIRED: 0, EXPIRING_7D: 1, STALE_DRAFT_30D: 2, NO_SOURCE_REF: 3 }[x.alert.type]) : 9;
            if (w(a) !== w(b)) return w(a) - w(b);
            return (a.rate.pol + a.rate.pod + a.rate.rateNo).localeCompare(b.rate.pol + b.rate.pod + b.rate.rateNo);
        });

        RM.ui.renderResults(rows, asOf);
        renderCompare();
        $('#statActive').textContent = RM.state.rates().filter(r => RM.alerts.isActive(r, asOf)).length;
    }

    function refreshAlerts() {
        const scan = RM.alerts.scan(RM.state.rates(), state.asOf);
        RM.ui.renderAlerts(scan);
    }

    /* ---------------- detail ---------------- */

    function selectRate(rateId) {
        state.activeRateId = rateId;
        renderDetail();
        search();   // re-render list to highlight
    }

    function renderDetail() {
        const rate = state.activeRateId ? RM.state.rate(state.activeRateId) : null;
        if (!rate) { RM.ui.renderDetail(null); return; }
        const charges = RM.state.chargesOf(rate.rateId);
        const alert = RM.alerts.alertOf(rate, state.asOf);
        const active = RM.alerts.isActive(rate, state.asOf);
        const d2exp = active ? RM.alerts.daysToExpiry(rate, state.asOf) : null;
        RM.ui.renderDetail(rate, charges, alert, active, d2exp, buildChain(rate));
    }

    /** Walk supersededBy forward from the earliest ancestor for a full chain view. */
    function buildChain(rate) {
        // find ancestors (rates whose supersededBy leads here) — simple forward walk from this node
        const seen = {};
        // walk back to the head
        let head = rate;
        for (let i = 0; i < 10; i++) {
            const prev = RM.state.rates().find(r => r.supersededBy === head.rateId);
            if (!prev || seen[prev.rateId]) break;
            seen[prev.rateId] = 1; head = prev;
        }
        // walk forward collecting the chain
        const chain = []; let cur = head; const guard = {};
        for (let i = 0; i < 10 && cur; i++) {
            if (guard[cur.rateId]) break; guard[cur.rateId] = 1;
            chain.push(cur);
            cur = cur.supersededBy ? RM.state.rate(cur.supersededBy) : null;
        }
        return chain.length > 1 ? chain : [rate];
    }

    /* ---------------- compare ---------------- */

    function renderCompare() {
        const items = Array.from(state.selected).map(id => ({
            rate: RM.state.rate(id), charges: RM.state.chargesOf(id)
        })).filter(x => x.rate);
        // container options from selected rates' charges
        const cts = uniq([].concat.apply([], items.map(it => it.charges.map(c => c.containerType))));
        if (cts.indexOf(cmpContainer) === -1 && cts.length) cmpContainer = cts[0];
        RM.ui.renderCompare(items, cmpContainer, cts.length ? cts : ['40HQ']);
    }

    function toggleSelect(rateId) {
        state.selected.has(rateId) ? state.selected.delete(rateId) : state.selected.add(rateId);
        search();
    }

    /* ---------------- confirm / cancel ---------------- */

    function modal(title, desc, noSourceWarn) {
        return new Promise(resolve => {
            const m = $('#confirmModal');
            $('#cfTitle').textContent = title;
            $('#cfDesc').innerHTML = desc;
            const ns = $('#cfNoSource');
            if (noSourceWarn) { ns.classList.remove('hidden'); ns.innerHTML = noSourceWarn; }
            else ns.classList.add('hidden');
            m.classList.remove('hidden');
            const done = v => { m.classList.add('hidden'); $('#cfOk').onclick = null; $('#cfCancel').onclick = null; resolve(v); };
            $('#cfOk').onclick = () => done(true);
            $('#cfCancel').onclick = () => done(false);
        });
    }

    async function confirmRate(rateId) {
        const r = RM.state.rate(rateId);
        const noSrc = (r.sourceRef == null || r.sourceRef === '');
        const ok = await modal('Confirm Rate ' + r.rateNo,
            'เปลี่ยนสถานะ <b>DRAFT → CONFIRMED</b> — rate จะพร้อมใช้ใน Quotation/Booking. ' +
            'บันทึก ConfirmedBy + ConfirmedAt (CHECK ใน DDL บังคับ)',
            noSrc ? '⚠ rate นี้ไม่มี <b>SourceRef</b> — Confirm ได้แต่จะติด Alert NO_SOURCE_REF จนกว่าจะเติมที่มา' : null);
        if (!ok) return;
        RM.state.confirm(rateId, 'PRICING_MGR');
        refreshAlerts(); search(); renderDetail();
    }

    async function cancelRate(rateId) {
        const r = RM.state.rate(rateId);
        const ok = await modal('Cancel Rate ' + r.rateNo,
            'เปลี่ยนสถานะเป็น <b>CANCELLED</b> — rate จะไม่ถูกใช้และไม่ขึ้น Active', null);
        if (!ok) return;
        RM.state.cancel(rateId);
        refreshAlerts(); search(); renderDetail();
    }

    /* ---------------- boot ---------------- */

    async function boot() {
        await RM.state.load();
        state.asOf = '2026-07-13';   // demo "today" so Expiry/Stale alerts have data
        $('#asOf').value = state.asOf;
        $('#statRates').textContent = RM.state.db.rateHeaders.length;
        $('#statSource').textContent = state.source;

        const rs = RM.state.rates();
        fillSelect('#fPol', uniq(rs.map(r => r.pol)), 'ทั้งหมด');
        fillSelect('#fPod', uniq(rs.map(r => r.pod)), 'ทั้งหมด');
        fillSelect('#fCarrier', uniq(rs.map(r => r.carrierName)), 'ทั้งหมด');

        RM.ui.init({
            onAlertFilter: type => { state.filters.alert = type; search(); refreshAlerts(); },
            onSelectRate: selectRate,
            onToggleSelect: toggleSelect,
            onConfirm: confirmRate,
            onCancel: cancelRate
        });

        // wire filters
        ['#fMode', '#fClass', '#fPol', '#fPod', '#fCarrier', '#fSource', '#fStatus', '#fActiveOnly'].forEach(id => $(id).onchange = search);
        $('#fText').oninput = search;
        $('#asOf').onchange = e => { state.asOf = e.target.value || todayISO(); refreshAlerts(); search(); renderDetail(); };
        $('#clearBtn').onclick = () => {
            ['#fMode', '#fClass', '#fPol', '#fPod', '#fCarrier', '#fSource', '#fStatus'].forEach(id => $(id).value = '');
            $('#fText').value = ''; $('#fActiveOnly').checked = false; state.filters.alert = null;
            search(); refreshAlerts();
        };
        $('#cmpCntr').onchange = e => { cmpContainer = e.target.value; renderCompare(); };
        $('#cmpClear').onclick = () => { state.selected.clear(); search(); };
        $('#resetBtn').onclick = () => { RM.state.resetOverrides(); refreshAlerts(); search(); renderDetail(); };
        $('#uploadBtn').onclick = () => alert('Upload (Excel Template + AI Parse) — ยังไม่ทำในเฟส mockup (§8)');

        refreshAlerts();
        search();
    }

    return { boot };
})();

document.addEventListener('DOMContentLoaded', () => RM.app.boot());
