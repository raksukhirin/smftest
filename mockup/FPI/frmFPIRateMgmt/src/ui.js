/* ui.js — alert strip, results table, rate detail, compare (rendering only). */
window.RM = window.RM || {};
window.RM.ui = (function () {
    'use strict';

    const { $, el, esc, money } = RM.utils;
    const { state } = RM.state;

    const ALERT_META = {
        EXPIRING_7D:     { label: 'ใกล้หมดอายุ ≤7 วัน', cls: 'warn' },
        EXPIRED:         { label: 'หมดอายุแล้ว',        cls: 'danger' },
        STALE_DRAFT_30D: { label: 'Draft ค้าง >30 วัน',  cls: 'warn' },
        NO_SOURCE_REF:   { label: 'ไม่มีแหล่งอ้างอิง',    cls: 'info' }
    };

    let _h = {};

    /* ---------------- alert strip ---------------- */

    function renderAlerts(scan) {
        const box = $('#alertStrip');
        box.innerHTML = '';
        const order = ['EXPIRED', 'EXPIRING_7D', 'STALE_DRAFT_30D', 'NO_SOURCE_REF'];
        order.forEach(type => {
            const meta = ALERT_META[type];
            const n = scan[type] ? scan[type].length : 0;
            const card = el('div', 'alertcard ac-' + (n ? meta.cls : 'ok') + (state.filters.alert === type ? ' on' : ''));
            card.innerHTML = '<div class="flex items-center justify-between">' +
                '<div class="ac-n">' + n + '</div>' +
                (n ? '<span class="pill pill-' + meta.cls + '">' + type + '</span>' : '<span class="text-emerald-600 text-lg">✓</span>') +
                '</div><div class="ac-l mt-0.5">' + esc(meta.label) + '</div>';
            card.onclick = () => _h.onAlertFilter(state.filters.alert === type ? null : type);
            box.appendChild(card);
        });
    }

    /* ---------------- results ---------------- */

    function renderResults(rows, asOf) {
        const body = $('#resBody');
        body.innerHTML = '';
        $('#resCount').textContent = rows.length;
        if (!rows.length) {
            body.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-slate-400">ไม่พบ rate ตามเงื่อนไข</td></tr>';
            return;
        }
        rows.forEach(({ rate, alert, active, d2exp }) => {
            const tr = el('tr', state.activeRateId === rate.rateId ? 'sel' : '');
            // checkbox
            const cbTd = el('td');
            const cb = el('input', 'accent-cyan-700 mt-0.5');
            cb.type = 'checkbox';
            cb.checked = state.selected.has(rate.rateId);
            cb.onclick = e => { e.stopPropagation(); _h.onToggleSelect(rate.rateId); };
            cbTd.appendChild(cb);
            tr.appendChild(cbTd);

            // rate no + source
            const c1 = el('td');
            c1.innerHTML = '<div class="font-mono font-semibold text-slate-800">' + esc(rate.rateNo) + '</div>' +
                '<div class="text-[10px] text-slate-400">' + esc(rate.rateSource) +
                (rate.customerNo ? ' · ' + esc(rate.customerNo) : '') + '</div>';
            tr.appendChild(c1);

            // lane + carrier
            const c2 = el('td');
            c2.innerHTML = '<div>' + esc(rate.pol + ' → ' + rate.pod) + '</div>' +
                '<div class="text-[10px] text-slate-400">' + esc(rate.carrierName) + ' · ' + esc(rate.mode + '/' + rate.serviceType) + '</div>';
            tr.appendChild(c2);

            // validity + d2exp
            const c3 = el('td');
            const dcls = d2exp == null ? 'ok' : d2exp < 0 ? 'danger' : d2exp <= 7 ? 'warn' : 'ok';
            c3.innerHTML = '<div class="font-mono text-[11px]">' + esc(rate.validFrom.slice(5)) + '→' + esc(rate.validTo.slice(5)) + '</div>' +
                (active ? '<div class="d2exp ' + dcls + '">' + (d2exp < 0 ? 'หมด ' + (-d2exp) + 'ว.' : 'เหลือ ' + d2exp + 'ว.') + '</div>' : '');
            tr.appendChild(c3);

            // status + alert
            const c4 = el('td');
            c4.innerHTML = '<span class="pill st-' + esc(rate.status) + '">' + esc(rate.status) + '</span>' +
                (alert ? '<div class="mt-0.5"><span class="pill pill-' + alert.cls + '" title="' + esc(alert.label) + '">⚠ ' + esc(alert.type) + '</span></div>' : '');
            tr.appendChild(c4);

            tr.onclick = () => _h.onSelectRate(rate.rateId);
            body.appendChild(tr);
        });
    }

    /* ---------------- detail ---------------- */

    function renderDetail(rate, charges, alert, active, d2exp, chain) {
        const box = $('#detailBody');
        if (!rate) { box.innerHTML = '<span class="text-slate-400 text-xs">— เลือก rate จากรายการ —</span>'; return; }
        const cust = rate.customerNo ? RM.state.customer(rate.customerNo) : null;

        let html = '<div class="flex items-start justify-between gap-2">' +
            '<div><div class="font-mono font-bold text-base text-slate-800">' + esc(rate.rateNo) + '</div>' +
            '<div class="text-xs text-slate-500">' + esc(rate.carrierName) + ' · ' + esc(rate.pol + ' → ' + rate.pod) +
            (rate.routing ? ' · ' + esc(rate.routing) : '') + '</div></div>' +
            '<span class="pill st-' + esc(rate.status) + '">' + esc(rate.status) + '</span></div>';

        // alerts on this rate
        if (alert) {
            html += '<div class="alert alert-' + (alert.cls === 'danger' ? 'warn' : alert.cls) + ' mt-2"><span>⚠</span><span><b>' +
                esc(alert.label) + '</b> (' + esc(alert.type) + ')' +
                (alert.type === 'NO_SOURCE_REF' ? ' — Confirm แล้วแต่ไม่บันทึกที่มา ควรเติม SourceRef' : '') + '</span></div>';
        }

        // key/value header
        html += '<div class="kv mt-3">' +
            kv('Mode / Service', esc(rate.mode + ' / ' + rate.serviceType + ' / ' + rate.jobClass)) +
            kv('Transit', (rate.transitDaysMin || '?') + '–' + (rate.transitDaysMax || '?') + ' วัน' +
                (rate.freeTimeDest ? ' · Free time ' + rate.freeTimeDest + 'ว.' : '')) +
            kv('Validity', '<span class="font-mono">' + esc(rate.validFrom) + ' → ' + esc(rate.validTo) + '</span>' +
                (active ? ' <span class="pill pill-ok">Active</span>' : '') +
                (active && d2exp != null ? ' <span class="text-[10px] text-slate-400">(' + (d2exp < 0 ? 'หมด ' + (-d2exp) : 'เหลือ ' + d2exp) + ' วัน)</span>' : '')) +
            kv('Source', esc(rate.rateSource) + (rate.sourceRef ? ' · ' + esc(rate.sourceRef) : ' · <span class="text-rose-600">— ไม่มี SourceRef —</span>')) +
            (rate.contractNo ? kv('Contract', esc(rate.contractNo) + (cust ? ' · ' + esc(cust.customerName) : '')) : '') +
            kv('Take-lower', rate.takeLowerEnabled ? 'เปิด (D7)' : 'ปิด') +
            kv('Created', esc((rate.createdAtUtc || '').slice(0, 10) || '—') + ' · ' + esc(rate.createdBy || '—')) +
            (rate.confirmedBy ? kv('Confirmed', esc((rate.confirmedAtUtc || '').slice(0, 10)) + ' · ' + esc(rate.confirmedBy)) : '') +
            '</div>';

        // superseded chain
        if (chain && chain.length > 1) {
            html += '<div class="mt-3"><div class="lbl">Superseded chain (§4.3)</div><div class="chain">' +
                chain.map((c, i) => (i ? '<span class="arrow">→</span>' : '') +
                    '<span class="node' + (c.rateId === rate.rateId ? ' cur' : '') + '" title="' + esc(c.status) + '">' + esc(c.rateNo) + '</span>').join('') +
                '</div></div>';
        }

        // charges
        html += '<div class="mt-3"><div class="lbl">Charges (' + charges.length + ')</div>' +
            '<table id="chgTable"><thead><tr><th>#</th><th>Charge</th><th>Basis</th><th>Cntr</th><th class="num">Amount</th><th>Cur</th></tr></thead><tbody>';
        charges.forEach(c => {
            html += '<tr><td class="text-slate-400">' + c.seqNo + '</td>' +
                '<td><span class="cat-' + esc(c.category) + '">' + esc(c.chargeName) + '</span>' +
                ' <span class="text-[9px] text-slate-400 font-mono">' + esc(c.expCode) + '</span></td>' +
                '<td class="text-slate-500">' + esc(c.basis.replace('PER_', '')) + (c.weightBreakKg != null ? ' +' + c.weightBreakKg : '') + '</td>' +
                '<td class="text-slate-500">' + esc(c.containerType || '—') + '</td>' +
                '<td class="num font-medium">' + money(c.amount, 2) + '</td>' +
                '<td class="text-slate-500">' + esc(c.currencyCode) + '</td></tr>';
        });
        html += '</tbody></table></div>';

        // actions
        html += '<div class="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100">';
        if (rate.status === 'DRAFT') {
            html += '<button id="actConfirm" class="btn-primary text-xs">✓ Confirm Rate</button>';
        }
        if (rate.status === 'CONFIRMED' && (rate.sourceRef == null || rate.sourceRef === '')) {
            html += '<span class="text-[11px] text-rose-600 self-center">⚠ Confirm แล้วแต่ไม่มี SourceRef</span>';
        }
        if (rate.status !== 'CANCELLED' && rate.status !== 'SUPERSEDED') {
            html += '<button id="actCancel" class="btn-danger text-xs ml-auto">Cancel</button>';
        }
        if (RM.state.hasOverride(rate.rateId)) {
            html += '<span class="pill pill-cyan self-center">มีการแก้ (localStorage)</span>';
        }
        html += '</div>';

        box.innerHTML = html;

        const c = $('#actConfirm'); if (c) c.onclick = () => _h.onConfirm(rate.rateId);
        const x = $('#actCancel'); if (x) x.onclick = () => _h.onCancel(rate.rateId);
    }

    function kv(k, v) { return '<dt>' + k + '</dt><dd>' + v + '</dd>'; }

    /* ---------------- compare ---------------- */

    function renderCompare(items, containerType, containerOptions) {
        const panel = $('#comparePanel');
        if (items.length < 2) { panel.classList.add('hidden'); return; }
        panel.classList.remove('hidden');

        // container selector
        const sel = $('#cmpCntr');
        sel.innerHTML = containerOptions.map(ct => '<option' + (ct === containerType ? ' selected' : '') + '>' + esc(ct) + '</option>').join('');

        // cheapest freight (in THB-ish: assume USD×36.5 for compare display only)
        const fx = cur => cur === 'THB' ? 1 : 36.5;
        const cost = it => {
            const f = RM.alerts.freightFor(it.charges, containerType);
            return f ? f.amount * fx(f.currency) : Infinity;
        };
        const min = Math.min.apply(null, items.map(cost));

        const body = $('#compareBody');
        body.innerHTML = '<div class="flex gap-3">' + items.map(it => {
            const r = it.rate;
            const f = RM.alerts.freightFor(it.charges, containerType);
            const isBest = cost(it) === min && isFinite(min);
            const surcharge = it.charges.filter(c => c.category === 'SURCHARGE' && (!c.containerType || c.containerType === containerType));
            return '<div class="cmp-col' + (isBest ? ' best' : '') + '">' +
                '<div class="font-mono font-semibold text-slate-800">' + esc(r.rateNo) + (isBest ? ' <span class="pill pill-ok">ถูกสุด</span>' : '') + '</div>' +
                '<div class="text-[11px] text-slate-500 mb-1">' + esc(r.carrierName) + '</div>' +
                cmpRow('Freight ' + containerType, f ? money(f.amount, 0) + ' ' + f.currency : '—') +
                cmpRow('Surcharge', surcharge.length ? surcharge.map(s => money(s.amount, 0) + s.currencyCode).join(' + ') : '—') +
                cmpRow('Transit', (r.transitDaysMin || '?') + '–' + (r.transitDaysMax || '?') + ' ว.') +
                cmpRow('Free time', r.freeTimeDest ? r.freeTimeDest + ' ว.' : '—') +
                cmpRow('Source', esc(r.rateSource)) +
                cmpRow('Valid ถึง', '<span class="font-mono">' + esc(r.validTo) + '</span>') +
                cmpRow('Status', '<span class="pill st-' + esc(r.status) + '">' + esc(r.status) + '</span>') +
                '</div>';
        }).join('') + '</div>' +
        '<div class="text-[10px] text-slate-400 mt-2">* เทียบ freight เป็น THB โดยสมมติ USD×36.5 เพื่อจัดอันดับเท่านั้น — ราคาจริงใช้ FX ณ วันจอง</div>';
    }

    function cmpRow(k, v) { return '<div class="cmp-metric"><span class="text-slate-400">' + k + '</span><span class="tabular">' + v + '</span></div>'; }

    function init(handlers) { _h = handlers; }

    return { init, renderAlerts, renderResults, renderDetail, renderCompare, ALERT_META };
})();
