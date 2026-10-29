/* inbox.js — the manager's approval queue: a different VIEW over the same engine
   and workflow state as the Booking Margin Gate (BG.profit / BG.autofill / BG.state).
   Approving/rejecting here writes the same localStorage the Gate reads. */
window.IB = window.IB || {};
window.IB.inbox = (function () {
    'use strict';

    const { $, el, esc, money, round } = BG.utils;

    /* ---------------- build one evaluated item ---------------- */

    function build(booking) {
        const profit = BG.profit.bookProfit(booking);
        const rule = BG.state.marginRule(booking);
        const verdict = BG.profit.evaluate(profit, rule, null);
        const af = BG.autofill.analyze(booking, profit);
        const w = BG.state.wf(booking.docNo);

        const base = profit.rtSold + profit.rtKB;
        const marginAtQuote = base
            ? round((profit.rtSold - (profit.rtCost - af.totalDelta) + profit.rtKB) * 100 / base, 2)
            : 0;
        const shortfall = round(rule.minMarginPct - verdict.marginPct, 2);

        return {
            booking, profit, rule, verdict, af, w,
            reason: classify(verdict, af, rule),
            marginAtQuote, shortfall,
            // lifecycle: what queue does this belong to?
            queue: queueOf(verdict, w)
        };
    }

    /** Reason the booking is below the floor — drives the manager's recommendation. */
    function classify(verdict, af, rule) {
        if (verdict.result !== 'NEED_APPROVE') return { key: 'other', label: verdict.result, cls: 'muted', lean: null };
        if (verdict.margin < 0) {
            return { key: 'loss', label: 'ขาดทุน', cls: 'danger', lean: 'reject',
                     hint: 'ราคาขายต่ำกว่าทุน — ควรตีกลับให้ Sales แก้ก่อน' };
        }
        if (af.alert && af.supersededLines.length) {
            return { key: 'market', label: 'ต้นทุนตลาดขึ้น', cls: 'info', lean: 'approve',
                     hint: 'Rate ถูกแทนที่ ต้นทุนขึ้นจากตลาด ราคาขาย Lock ตามใบเสนอ — ไม่ใช่ Sales ตั้งราคาต่ำ' };
        }
        const shortfall = rule.minMarginPct - verdict.marginPct;
        if (shortfall <= 1.0) {
            return { key: 'near', label: 'ใกล้เกณฑ์', cls: 'warn', lean: 'approve',
                     hint: 'ต่ำกว่าเกณฑ์เล็กน้อย' };
        }
        return { key: 'underpriced', label: 'ราคาขายต่ำ', cls: 'warn', lean: 'review',
                 hint: 'ต้นทุนปกติ (Rate ยัง Active) แต่ราคาขายต่ำ — ทบทวน/Revise ใบเสนอราคา' };
    }

    function queueOf(verdict, w) {
        if (w.rejected) return 'rejected';
        if (w.isProApp) return 'approved';
        if (verdict.result === 'NEED_APPROVE') return 'pending';
        return 'other';
    }

    function buildAll() {
        return BG.state.db.bookings.map(build);
    }

    /* ---------------- summary ---------------- */

    function renderSummary(items) {
        const pending = items.filter(i => i.queue === 'pending');
        const totalValue = pending.reduce((s, i) => s + i.profit.rtSold, 0);
        const marketDriven = pending.filter(i => i.reason.key === 'market').length;
        const losses = pending.filter(i => i.reason.key === 'loss').length;

        const box = $('#summary');
        box.innerHTML =
            stat('รออนุมัติ', pending.length, 'text-indigo-700') +
            stat('มูลค่าดีลรวม (Sold)', money(totalValue, 0) + ' ฿', 'text-slate-800') +
            stat('ต้นทุนตลาดขึ้น', marketDriven, marketDriven ? 'text-sky-700' : 'text-slate-400') +
            stat('ขาดทุน', losses, losses ? 'text-rose-700' : 'text-slate-400');
    }

    function stat(lbl, val, cls) {
        return '<div class="stat"><div class="lbl">' + esc(lbl) + '</div><div class="val ' + (cls || '') + '">' + val + '</div></div>';
    }

    /* ---------------- list ---------------- */

    function sortItems(items, mode) {
        const by = {
            worst: (a, b) => a.verdict.marginPct - b.verdict.marginPct,
            value: (a, b) => b.profit.rtSold - a.profit.rtSold,
            shortfall: (a, b) => b.shortfall - a.shortfall
        }[mode] || ((a, b) => a.verdict.marginPct - b.verdict.marginPct);
        return items.slice().sort(by);
    }

    function renderList(items, opts) {
        const list = $('#list');
        const empty = $('#empty');
        list.innerHTML = '';
        if (!items.length) {
            empty.classList.remove('hidden');
            empty.textContent = opts.emptyText || 'ไม่มีรายการ';
            return;
        }
        empty.classList.add('hidden');
        items.forEach(it => list.appendChild(card(it, opts)));
    }

    function card(it, opts) {
        const b = it.booking, v = it.verdict, r = it.reason;
        const c = el('div', 'appr ' + r.key + (opts.selected.has(b.docNo) ? ' sel' : '') +
            (it.queue !== 'pending' ? ' done' : ''));

        const body = el('div', 'appr-body');

        /* row 1: checkbox + docno + reason + lean */
        const top = el('div', 'flex items-center gap-2');
        if (it.queue === 'pending' && opts.batch) {
            const cb = el('input', 'accent-indigo-600');
            cb.type = 'checkbox';
            cb.checked = opts.selected.has(b.docNo);
            cb.onclick = e => { e.stopPropagation(); opts.onToggleSel(b.docNo); };
            top.appendChild(cb);
        }
        top.appendChild(el('span', 'font-mono font-semibold text-[13px] text-slate-800', esc(b.docNo)));
        top.appendChild(el('span', 'pill pill-' + r.cls, esc(r.label)));
        if (r.lean) top.appendChild(el('span', 'pill lean-' + r.lean,
            r.lean === 'approve' ? 'แนะนำ: อนุมัติ' : r.lean === 'reject' ? 'แนะนำ: ตีกลับ' : 'แนะนำ: ทบทวน'));
        if (it.queue === 'approved') top.appendChild(el('span', 'pill pill-ok ml-auto', '✓ อนุมัติแล้ว'));
        if (it.queue === 'rejected') top.appendChild(el('span', 'pill pill-danger ml-auto', '✕ ตีกลับ'));
        body.appendChild(top);

        /* row 2: lane / customer / date */
        body.appendChild(el('div', 'text-[11px] text-slate-500 mt-0.5',
            esc(b.loadPort + ' → ' + b.finalPort) + ' · ' + esc(b.shipper) +
            ' <span class="pill pill-tier">Tier ' + esc(it.rule._cust ? it.rule._cust.tier : '—') + '</span>' +
            ' · ' + esc(b.docDate) + ' · อ้าง ' + esc(b.refQtNo || '—')));

        /* row 3: metrics */
        const metrics = el('div', 'grid grid-cols-4 gap-2 mt-2');
        metrics.appendChild(metric('Sold', money(it.profit.rtSold, 0)));
        metrics.appendChild(metric('Cost', money(it.profit.rtCost, 0)));
        metrics.appendChild(metric('Margin', money(v.margin, 0), v.margin < 0 ? 'm-loss' : 'm-warn'));
        metrics.appendChild(metric('Margin%', round(v.marginPct, 2) + '%',
            v.margin < 0 ? 'm-loss' : 'm-warn', 'เกณฑ์ ≥ ' + it.rule.minMarginPct + '% · ขาด ' + it.shortfall + ' จุด'));
        body.appendChild(metrics);

        /* row 4: hint + actions */
        const foot = el('div', 'flex items-center gap-2 mt-2');
        foot.appendChild(el('div', 'text-[11px] text-slate-500 flex-1', esc(r.hint || '')));
        const detailBtn = el('button', 'btn-ghost text-[11px]', 'รายละเอียด');
        foot.appendChild(detailBtn);
        if (it.queue === 'pending') {
            const rej = el('button', 'btn-reject text-[11px]', '✕ ตีกลับ');
            rej.onclick = e => { e.stopPropagation(); opts.onReject(it); };
            foot.appendChild(rej);
            const app = el('button', 'btn-approve text-[11px]', '✓ Approve Profit');
            app.onclick = e => { e.stopPropagation(); opts.onApprove(it); };
            foot.appendChild(app);
        }
        body.appendChild(foot);
        c.appendChild(body);

        /* detail (collapsed) */
        const detail = el('div', 'appr-detail hidden');
        detail.innerHTML = detailHtml(it);
        c.appendChild(detail);
        detailBtn.onclick = e => {
            e.stopPropagation();
            detail.classList.toggle('hidden');
            detailBtn.textContent = detail.classList.contains('hidden') ? 'รายละเอียด' : 'ซ่อน';
        };

        return c;
    }

    function metric(lbl, val, cls, title) {
        const d = el('div', 'metric');
        d.appendChild(el('div', 'm-lbl', lbl));
        const v = el('div', 'm-val ' + (cls || ''), val);
        if (title) v.title = title;
        d.appendChild(v);
        return d;
    }

    function detailHtml(it) {
        const p = it.profit;
        let html = '';

        if (it.reason.key === 'market') {
            html += '<div class="alert alert-info mb-2"><span>ⓘ</span><span>' +
                'Margin ณ วันเสนอราคา <b>' + it.marginAtQuote + '%</b> (' +
                (it.marginAtQuote >= it.rule.minMarginPct ? 'ผ่าน' : 'ต่ำกว่า') + 'เกณฑ์) → วันจอง <b>' +
                round(it.verdict.marginPct, 2) + '%</b> เพราะต้นทุนขึ้น <b>+' + money(it.af.totalDelta, 0) +
                ' THB (+' + it.af.deltaPct + '%)</b> ผ่าน Superseded Chain (' +
                esc(it.af.supersededLines[0].chain.join(' → ')) + ')</span></div>';
        } else if (it.reason.key === 'loss') {
            html += '<div class="alert mb-2" style="background:#fef2f2;border-color:#fecaca;color:#991b1b"><span>■</span><span>' +
                '<b>ขาดทุน ' + money(it.verdict.margin, 0) + ' THB</b> — ราคาขายรวมต่ำกว่าต้นทุนรวม</span></div>';
        }

        html += '<table class="mini"><thead><tr><th>Type</th><th>Charge</th><th class="num">Qty</th>' +
            '<th class="num">Unit</th><th>Cur</th><th class="num">THB</th></tr></thead><tbody>';
        p.lines.forEach(l => {
            html += '<tr><td><span class="pill ' + (l.transType === 'Bill' ? 'pill-info' : 'pill-warn') + '">' + esc(l.transType) + '</span></td>' +
                '<td class="font-mono">' + esc(l.expCode) + '</td><td class="num">' + l.qty + '</td>' +
                '<td class="num">' + money(l.unitPrice, 2) + '</td><td>' + esc(l.itemCurr) + '</td>' +
                '<td class="num">' + money(l.thb, 0) + '</td></tr>';
        });
        html += '</tbody></table>';
        return html;
    }

    return { build, buildAll, classify, renderSummary, renderList, sortItems };
})();
