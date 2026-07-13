/* app.js — KB Dashboard rendering + boot. Pure read-only view over KB.dashboard.build(). */
window.KB = window.KB || {};
window.KB.app = (function () {
    'use strict';

    // reuse BG.utils formatting (loaded from the Booking Gate module)
    const { $, el, esc, money } = BG.utils;
    const round = (v, n) => BG.utils.round(v, n);

    let asOf = '2026-09-15';   // default: shows the R-0001→R-0003 cost-delta D2 case

    /* ---------------- KPIs ---------------- */

    function kpi(lbl, val, sub, tone) {
        return '<div class="kpi kpi-' + tone + '"><div class="k-lbl">' + esc(lbl) + '</div>' +
            '<div class="k-val">' + val + '</div><div class="k-sub">' + (sub || '') + '</div></div>';
    }

    function renderKpis(d) {
        const m = d.margin, r = d.rate;
        const marginTone = m.avgPct == null ? 'neutral' : m.avgPct >= 8 ? 'ok' : m.avgPct >= 0 ? 'warn' : 'risk';
        $('#kpis').innerHTML =
            kpi('Active Rates', r.active, r.total + ' ทั้งหมด', r.active ? 'ok' : 'neutral') +
            kpi('ใกล้หมดอายุ ≤7ว.', r.expiring, r.expired + ' หมดแล้ว', r.expiring || r.expired ? 'warn' : 'ok') +
            kpi('Quotes at Risk', d.atRisk.length, 'Rate ต้นทางตาย (D2)', d.atRisk.length ? 'risk' : 'ok') +
            kpi('Avg Booking Margin', m.avgPct == null ? '—' : m.avgPct + '%', 'min ' + m.minPct + '% · max ' + m.maxPct + '%', marginTone) +
            kpi('รออนุมัติ', m.pending, 'NEED_APPROVE', m.pending ? 'warn' : 'ok') +
            kpi('Win Rate', d.win.pct + '%', d.win.won + '/' + d.win.total + ' quotes', 'info');
    }

    /* ---------------- Rate health ---------------- */

    function renderRateHealth(d) {
        const r = d.rate;
        const order = [['CONFIRMED', 'seg-ok'], ['DRAFT', 'seg-draft'], ['SUPERSEDED', 'seg-super'], ['EXPIRED', 'seg-risk'], ['CANCELLED', 'seg-draft']];
        const total = r.total || 1;
        let bar = '', legend = '';
        order.forEach(([st, seg]) => {
            const n = r.byStatus[st] || 0;
            if (!n) return;
            bar += '<div class="bar-seg ' + seg + '" style="width:' + (n * 100 / total) + '%"></div>';
            legend += '<span><span class="dot ' + seg + '"></span>' + st + ' ' + n + '</span>';
        });
        // alert chips
        const chip = (n, label, cls) => '<div class="flex items-center justify-between py-0.5">' +
            '<span class="text-slate-600">' + label + '</span>' +
            '<span class="pill pill-' + (n ? cls : 'ok') + '">' + n + '</span></div>';

        $('#rateHealth').innerHTML =
            '<div class="flex items-baseline justify-between mb-1"><span class="mini-lbl">สถานะ Rate</span>' +
            '<span class="text-xs text-slate-500"><b>' + r.active + '</b> active ณ ' + esc(asOf) + '</span></div>' +
            '<div class="bar-track">' + bar + '</div><div class="legend">' + legend + '</div>' +
            '<div class="mt-3 mini-lbl mb-1">Alerts (vFPI_RateAlert)</div>' +
            chip(r.expired, 'หมดอายุแล้ว (EXPIRED)', 'danger') +
            chip(r.expiring, 'ใกล้หมดอายุ ≤7 วัน', 'warn') +
            chip(r.staleDraft, 'Draft ค้าง >30 วัน', 'warn') +
            chip(r.noSource, 'ไม่มี SourceRef', 'info');
    }

    /* ---------------- Quotes at risk (D2) ---------------- */

    function renderAtRisk(d) {
        $('#atRiskCount').textContent = d.atRisk.length + ' option';
        const box = $('#atRisk');
        if (!d.atRisk.length) {
            box.innerHTML = '<div class="alert alert-ok"><span>✓</span><span>ไม่มี Quotation Active ที่ Rate ต้นทางตาย ณ ' + esc(asOf) + '</span></div>';
            return;
        }
        let html = '<table class="tbl"><thead><tr><th>Quotation</th><th>Lane</th><th>Rate ที่เสนอ</th>' +
            '<th>Rate ปัจจุบัน</th><th class="num">Δ ทุน/ตู้</th><th class="num">Quote เหลือ</th></tr></thead><tbody>';
        d.atRisk.forEach(x => {
            const noRepl = !x.currentRate;
            html += '<tr class="risk-row' + (noRepl ? ' norepl' : '') + '">' +
                '<td><span class="font-mono font-semibold">' + esc(x.quote.docNo) + '</span>' +
                '<div class="text-[10px] text-slate-400">' + esc(x.quote.customerNo) + ' · opt ' + x.option.optionNo + '</div></td>' +
                '<td>' + esc(x.option.pol + '→' + x.option.pod) + '</td>' +
                '<td><span class="font-mono">' + esc(x.rate.rateNo) + '</span> <span class="pill st-' + esc(x.rate.status) + '">' + esc(x.reason) + '</span></td>' +
                '<td>' + (noRepl
                    ? '<span class="pill pill-danger">ไม่มีตัวแทน</span><div class="text-[10px] text-rose-600">Confirm Booking ไม่ได้ (§4.3)</div>'
                    : '<span class="chain">' + esc(x.chain.join(' ')) + '</span><br><span class="font-mono text-emerald-700">→ ' + esc(x.currentRate.rateNo) + '</span>') + '</td>' +
                '<td class="num">' + (x.deltaNative != null
                    ? '<span class="delta-up">+' + money(x.deltaNative, 0) + ' ' + esc(x.deltaCurrency) + '</span>' +
                      '<div class="text-[10px] text-slate-400">+' + money(x.deltaTHB, 0) + ' THB</div>'
                    : '<span class="text-slate-400">—</span>') + '</td>' +
                '<td class="num ' + (x.daysQuoteLeft <= 14 ? 'text-amber-700 font-semibold' : 'text-slate-500') + '">' + x.daysQuoteLeft + ' ว.</td>' +
                '</tr>';
        });
        html += '</tbody></table>' +
            '<div class="text-[10px] text-slate-400 mt-2">ราคาขาย Lock ตามใบเสนอราคา — ถ้า Δ ทุนเป็นบวก Margin จะถูกบีบตอน Booking · "ไม่มีตัวแทน" = เดิน Superseded Chain ไม่เจอตัว Valid → Booking BLOCKED (§4.3)</div>';
        box.innerHTML = html;
    }

    /* ---------------- Margin health ---------------- */

    function renderMarginHealth(d) {
        const m = d.margin;
        const total = m.count || 1;
        const seg = (n, cls) => n ? '<div class="bar-seg ' + cls + '" style="width:' + (n * 100 / total) + '%"></div>' : '';
        const bar = seg(m.byVerdict.PASS, 'seg-ok') + seg(m.byVerdict.NEED_APPROVE, 'seg-warn') + seg(m.byVerdict.BLOCKED, 'seg-risk');
        $('#marginHealth').innerHTML =
            '<div class="flex items-baseline justify-between mb-1"><span class="mini-lbl">ผล Gate ของ ' + m.count + ' booking</span>' +
            '<span class="text-xs">Avg <b class="' + (m.avgPct >= 8 ? 'text-emerald-700' : 'text-amber-700') + '">' + (m.avgPct == null ? '—' : m.avgPct + '%') + '</b></span></div>' +
            '<div class="bar-track">' + bar + '</div>' +
            '<div class="legend">' +
            '<span><span class="dot seg-ok"></span>PASS ' + m.byVerdict.PASS + '</span>' +
            '<span><span class="dot seg-warn"></span>NEED_APPROVE ' + m.byVerdict.NEED_APPROVE + '</span>' +
            '<span><span class="dot seg-risk"></span>BLOCKED ' + m.byVerdict.BLOCKED + '</span>' +
            '</div>' +
            '<div class="mt-2 text-[11px] text-slate-500">ช่วง Margin: <b>' + m.minPct + '%</b> ถึง <b>' + m.maxPct + '%</b>' +
            (m.byVerdict.NEED_APPROVE ? ' · <a class="text-indigo-600">' + m.byVerdict.NEED_APPROVE + ' รออนุมัติใน Approval Inbox</a>' : '') + '</div>';
    }

    /* ---------------- Top lanes ---------------- */

    function renderTopLanes(d) {
        let html = '<table class="tbl"><thead><tr><th>Lane</th><th class="num">Rates</th><th class="num">Active</th><th class="num">Bookings</th></tr></thead><tbody>';
        d.lanes.slice(0, 6).forEach(l => {
            html += '<tr><td class="font-medium">' + esc(l.lane) + '</td>' +
                '<td class="num">' + l.rates + '</td>' +
                '<td class="num ' + (l.active ? 'text-emerald-700' : 'text-slate-300') + '">' + l.active + '</td>' +
                '<td class="num font-semibold">' + l.bookings + '</td></tr>';
        });
        html += '</tbody></table>';
        $('#topLanes').innerHTML = html;
    }

    /* ---------------- render + boot ---------------- */

    function render() {
        const d = KB.dashboard.build(asOf);
        renderKpis(d);
        renderRateHealth(d);
        renderAtRisk(d);
        renderMarginHealth(d);
        renderTopLanes(d);
    }

    async function boot() {
        await BG.state.load();
        $('#statSource').textContent = BG.state.state.source;
        $('#asOf').value = asOf;
        $('#asOf').onchange = e => { asOf = e.target.value || asOf; render(); };
        render();
    }

    return { boot, render };
})();

document.addEventListener('DOMContentLoaded', () => KB.app.boot());
