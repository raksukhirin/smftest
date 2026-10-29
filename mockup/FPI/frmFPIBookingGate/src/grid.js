/* grid.js — left booking list, header, Bill/Cost line grid, Cost Auto-fill panel. */
window.BG = window.BG || {};
window.BG.grid = (function () {
    'use strict';

    const { $, el, esc, money, qty } = BG.utils;
    const { state } = BG.state;

    const SCEN_DOT = { PASS: 'dot-pass', NEED_APPROVE: 'dot-need', BLOCKED: 'dot-blocked' };

    let _onSelect = () => {};

    /* ---------------- booking list ---------------- */

    function renderList(onSelect) {
        if (onSelect) _onSelect = onSelect;
        const box = $('#bookingList');
        box.innerHTML = '';
        BG.state.db.bookings.forEach(b => {
            const w = BG.state.wf(b.docNo);
            const item = el('div', 'bk' + (state.activeDocNo === b.docNo ? ' sel' : ''));
            const head = el('div', 'flex items-center gap-2');
            head.appendChild(el('span', 'dot ' + (SCEN_DOT[b.expectedScenario] || 'dot-open')));
            head.appendChild(el('span', 'font-mono font-semibold text-[13px] text-slate-800', esc(b.docNo)));
            if (w.docStat !== 'Open') {
                head.appendChild(el('span', 'pill ' + (w.docStat === 'Confirmed' ? 'pill-ok' : 'pill-wait') + ' ml-auto', esc(w.docStat)));
            }
            item.appendChild(head);
            item.appendChild(el('div', 'text-[11px] text-slate-500 mt-0.5',
                esc(b.loadPort + ' → ' + b.finalPort) + ' · ' + esc(b.shipper) + ' · ' + esc(b.docDate)));
            item.appendChild(el('div', 'text-[10px] text-slate-400 mt-0.5 truncate', esc(b.note || '')));
            item.onclick = () => _onSelect(b.docNo);
            box.appendChild(item);
        });
    }

    /* ---------------- header ---------------- */

    function renderHeader(b, rule) {
        const box = $('#headerBox');
        if (!b) { box.innerHTML = '<span class="text-slate-400 text-xs">— เลือก booking —</span>'; return; }
        const cust = rule && rule._cust;
        const row = (k, v) => '<div class="flex justify-between gap-2 py-0.5"><span class="text-slate-400">' + k +
            '</span><span class="text-slate-700 text-right">' + v + '</span></div>';
        box.innerHTML = '<div class="text-xs space-y-0">' +
            row('DocNo', '<span class="font-mono font-semibold">' + esc(b.docNo) + '</span>') +
            row('วันที่จอง', '<span class="font-mono">' + esc(b.docDate) + '</span>') +
            row('อ้างใบเสนอราคา', '<span class="font-mono">' + esc(b.refQtNo || '—') +
                (b.quoteRevNo != null ? ' rev' + b.quoteRevNo : '') + '</span>') +
            row('Lane', esc(b.loadPort + ' → ' + b.finalPort)) +
            row('ลูกค้า', esc(b.shipper) + (cust ? ' · <span class="pill pill-muted">Tier ' + esc(cust.tier) + '</span>' : '')) +
            row('สกุล/เรท', esc(b.docCurr) + ' @ ' + money(b.docRate, 4)) +
            row('เกณฑ์', rule ? '<span class="font-mono">' + esc(rule.ruleId || rule.ruleName) + '</span> ≥ ' +
                rule.minMarginPct + '% · ≥ ' + rule.minProfitTHB.toLocaleString() +
                (rule._overriddenBy ? ' <span class="pill pill-info">override</span>' : '') +
                (rule._outOfValidity ? ' <span class="pill pill-danger">นอก Validity</span>' : '') : '—') +
            '</div>';
    }

    /* ---------------- Bill / Cost line grid ---------------- */

    function renderLines(profit) {
        const body = $('#lineBody');
        body.innerHTML = '';
        if (!profit) {
            body.innerHTML = '<tr><td colspan="7" class="py-8 text-center text-slate-400">—</td></tr>';
            return;
        }

        const section = (title, rows, cls) => {
            if (!rows.length) return;
            const hdr = el('tr');
            hdr.innerHTML = '<td colspan="7" class="pt-2 pb-1 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">' + title + '</td>';
            body.appendChild(hdr);
            rows.forEach(l => body.appendChild(lineRow(l, cls)));
        };

        section('Bill (ราคาขาย)', profit.bills, '');
        section('Cost (ต้นทุน)', profit.costs, 'cost-row');

        // totals
        const sum = el('tr', 'rowsum');
        sum.innerHTML =
            '<td colspan="6" class="text-right pr-2 py-1.5 text-slate-500">Sold − Cost + KB</td>' +
            '<td class="num py-1.5">' +
            '<span class="text-blue-700">' + money(profit.rtSold, 0) + '</span>' +
            ' − <span class="text-amber-700">' + money(profit.rtCost, 0) + '</span>' +
            (profit.rtKB ? ' + <span class="text-amber-600">' + money(profit.rtKB, 0) + '</span>' : '') +
            '</td>';
        body.appendChild(sum);
    }

    function lineRow(l, cls) {
        const tr = el('tr', (l.badFx ? 'badfx-row' : cls));
        const td = (c, h) => { const d = el('td', c, h); tr.appendChild(d); return d; };
        td('', '<span class="pill ' + (l.transType === 'Bill' ? 'pill-bill' : 'pill-cost') + '">' + esc(l.transType) + '</span>' +
            (l.rebate ? ' <span class="pill pill-rebate">KB</span>' : ''));
        td('', '<span class="font-mono text-slate-700">' + esc(l.expCode) + '</span>');
        td('num', qty(l.qty));
        td('num', money(l.unitPrice, 2));
        td('', '<span class="text-slate-500">' + esc(l.itemCurr) + '</span>');
        td('text-[10px] ' + (l.badFx ? 'text-rose-600 font-semibold' : 'text-slate-400'), esc(l.fxVia));
        td('num font-medium ' + (l.badFx ? 'text-rose-600' : 'text-slate-800'),
            l.badFx ? '<span title="FX = 0 → เงินหาย">0.00 ⚠</span>' : money(l.thb, 2));
        return tr;
    }

    /* ---------------- Cost Auto-fill panel ---------------- */

    function renderAutofill(af, booking) {
        const card = $('#autofillCard');
        const box = $('#autofillBody');
        if (!af || !af.perLine.length) { card.classList.add('hidden'); return; }
        card.classList.remove('hidden');

        let html = '';

        // delta alert (D8)
        if (af.alert) {
            html += '<div class="alert alert-warn mb-2"><span>⚠</span><span>ต้นทุนเปลี่ยนจากวันเสนอราคา <b>' +
                (af.totalDelta >= 0 ? '+' : '') + money(af.totalDelta, 0) + ' THB (' +
                (af.deltaPct >= 0 ? '+' : '') + af.deltaPct + '%)</b> — เกินเกณฑ์เตือน (≥ ' +
                af.thresholds.pct + '% หรือ ≥ ' + af.thresholds.thb.toLocaleString() + ' THB) · D8</span></div>';
        } else if (af.totalDelta === 0) {
            html += '<div class="alert alert-ok mb-2"><span>✓</span><span>ต้นทุนตรงกับวันเสนอราคา — Rate ที่จองยัง Active ณ วันจอง</span></div>';
        }

        html += '<table class="w-full text-[11px]"><thead><tr class="text-slate-400 text-left border-b border-slate-100">' +
            '<th class="py-1 font-medium">Charge</th><th class="font-medium">ที่มา (Rate KB)</th>' +
            '<th class="font-medium text-right">ทุนวันเสนอ</th><th class="font-medium text-right">ทุนวันจอง</th>' +
            '<th class="font-medium text-right">Δ THB</th></tr></thead><tbody>';
        af.perLine.forEach(p => {
            const chainHtml = p.superseded
                ? p.chain.map(esc).join(' <span class="chain-arrow">→</span> ')
                : '<span class="font-mono">' + esc(p.sourceRateNo) + '</span>';
            html += '<tr class="border-b border-slate-50"><td class="py-1 font-mono">' + esc(p.line.expCode) + '</td>' +
                '<td class="chain-step">' + chainHtml +
                (p.superseded ? '<br><span class="text-slate-400">→ ใช้ <b>' + esc(p.currentRateNo) + '</b></span>' : '') + '</td>' +
                '<td class="text-right tabular text-slate-500">' + money(p.quoteCostTHB, 0) + '</td>' +
                '<td class="text-right tabular font-medium">' + money(p.currentCostTHB, 0) + '</td>' +
                '<td class="text-right tabular ' + (p.deltaTHB > 0 ? 'text-rose-600' : p.deltaTHB < 0 ? 'text-emerald-600' : 'text-slate-400') +
                ' font-semibold">' + (p.deltaTHB > 0 ? '+' : '') + money(p.deltaTHB, 0) + '</td></tr>';
        });
        html += '</tbody></table>';

        if (af.supersededLines.length) {
            html += '<div class="mt-2 text-[10px] text-slate-400">⛓ ' + af.supersededLines.length +
                ' บรรทัดเดิน Superseded Chain (§4.3): Rate ที่เสนอถูกแทนที่ ระบบดึงทุน ณ วันจองอัตโนมัติ</div>';
        }
        box.innerHTML = html;
    }

    return { renderList, renderHeader, renderLines, renderAutofill };
})();
