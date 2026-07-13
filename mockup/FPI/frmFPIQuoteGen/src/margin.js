/* margin.js — the sticky footer strip + the alert stack above the charge grid.
   Informational only: the real gate lives at Confirm Booking (D1). */
window.QG = window.QG || {};
window.QG.margin = (function () {
    'use strict';

    const { $, el, esc, money } = QG.utils;
    const { state } = QG.state;

    const VERDICT = {
        PASS:    { cls: 'pill-ok',     text: '✓ ผ่านเกณฑ์ (ประมาณการ)' },
        BELOW:   { cls: 'pill-warn',   text: '▲ ต่ำกว่าเกณฑ์ — จะเข้า Wait ตอน Confirm Booking' },
        BLOCKED: { cls: 'pill-danger', text: '■ BLOCKED — Confirm Booking ไม่ได้' }
    };

    /* ---------------- alerts ---------------- */

    function alertsFor(lane, opt, rule) {
        const out = [];
        const ship = state.shipment;

        if (!opt) return out;
        const m = opt.margin;

        if (m.badFxLines) {
            out.push({ lvl: 'danger', icon: '■', html:
                '<b>BadFx — ' + m.badFxLines + ' บรรทัด</b> มีสกุลต่างประเทศแต่ FX = 0. ' +
                'ระบบเดิมคูณด้วย 0 แล้วเงินหายเงียบ ๆ; FPI ตี <b>BLOCKED</b> ตั้งแต่ตอนเสนอราคา (§6.2)' });
        }

        if (rule._outOfValidity) {
            out.push({ lvl: 'warn', icon: '⚠', html:
                'ไม่มี <b>FPI_MarginRule</b> ใดอยู่ในช่วง Validity ณ ' + esc(ship.asOf) +
                ' — ใช้ <b>MR-DEFAULT</b> เป็นตัวสำรอง เกณฑ์ที่แสดงอาจไม่ใช่ของลูกค้ารายนี้' });
        }

        // The AF/EX/FRT = PASS trap (inherited ITEMTYPE='ADV') — a whole air quote sells at cost.
        const passFreight = opt.lines.filter(l => l.category === 'FREIGHT' && l.pricingMode === 'PASS');
        if (passFreight.length) {
            out.push({ lvl: 'warn', icon: '⚠', html:
                '<b>Freight เป็น PricingMode = PASS</b> (' +
                passFreight.map(l => esc(l.subSysName + '/' + l.jobClass + '/' + l.expCode)).join(', ') +
                ') → ขายเท่าทุน. ค่านี้ Seed มาจาก <code>ITEMTYPE = \'ADV\'</code> (เงินทดรองจ่าย) ' +
                'ซึ่งผิดบริบทสำหรับค่าระวาง — <b>ทีม Pricing ต้องทบทวน FPI_ChargePolicy</b>' });
        }

        const noPolicy = opt.lines.filter(l => l.policyMissing);
        if (noPolicy.length) {
            out.push({ lvl: 'danger', icon: '■', html:
                noPolicy.length + ' บรรทัดไม่มีแถวใน <b>FPI_ChargePolicy</b> (' +
                noPolicy.map(l => esc(l.expCode)).join(', ') + ') — FK บังคับว่าต้องมีนโยบายราคากำกับเสมอ (§2)' });
        }

        if (!opt.active) {
            const label = QG.options.INACTIVE_LABEL[opt.inactiveReason] || opt.inactiveReason;
            out.push({ lvl: 'warn', icon: '⚠', html:
                'Rate <b class="font-mono">' + esc(opt.rate.rateNo) + '</b> อยู่ในสถานะ <b>' + esc(label) +
                '</b> ณ ' + esc(ship.asOf) + ' — เลือกได้แต่ต้องบันทึกเหตุผล (D6) และ Booking จะเดิน Superseded chain (§4.3)' });
        }

        if (opt.rank === 4) {
            out.push({ lvl: 'warn', icon: '⚠', html:
                'Rate นี้เป็น <b>Contract ของ ' + esc(opt.rate.customerNo) + '</b> แต่ใบเสนอราคานี้ออกให้ <b>' +
                esc(ship.customerNo) + '</b> — ข้ามอันดับตาม §5.1 ต้องมี <b>ManualReason</b>' });
        }

        if (lane.recommendedRateId && opt.rateId !== lane.recommendedRateId) {
            const rec = lane.candidates.find(o => o.rateId === lane.recommendedRateId);
            const delta = opt.margin.cost - rec.margin.cost;
            out.push({ lvl: 'info', icon: 'ⓘ', html:
                'เลือกข้ามตัวที่ระบบแนะนำ (<b class="font-mono">' + esc(rec.rate.rateNo) + '</b> · ' + esc(rec.rankLabel) + ') — ' +
                'ทุนต่างกัน <b>' + (delta >= 0 ? '+' : '') + money(delta, 0) + ' THB</b>' });
        }

        (opt.notes || []).forEach(n => out.push({ lvl: n.level === 'info' ? 'info' : 'warn', icon: 'ⓘ', html: esc(n.text) }));

        if (opt.historyOption) {
            const hr = state.historyReason[lane.pod];
            const noCost = opt.lines.filter(l => l.historyBased && !l.costTHB).map(l => esc(l.expCode));
            out.push({ lvl: 'warn', icon: 'ⓘ', html:
                '<b>ใบเสนอราคานี้อิงประวัติ (Tier 2 · D11)</b> — ราคาเป็น Indicative ห้าม Auto-fill เป็น Cost ยืนยัน. ' +
                'ธง “อิงประวัติ” + เหตุผล (<b>' + esc(hr || '—') + '</b>) จะติดไปถึง Booking' +
                (noCost.length ? '<br><b>' + noCost.length + ' บรรทัดไม่มีคู่ต้นทุน</b> (' + noCost.join(', ') + ') → Margin ที่แสดงสูงเกินจริง' : '') });
        }

        const reason = state.rateReason[lane.pod + '|' + opt.rateId];
        if (reason && !opt.historyOption) {
            out.push({ lvl: 'info', icon: '✎', html: 'เหตุผลที่บันทึกไว้: <b>' + esc(reason) + '</b>' });
        }

        return out;
    }

    function renderAlerts(lane, opt, rule) {
        const box = $('#alertBox');
        box.innerHTML = '';
        alertsFor(lane, opt, rule).forEach(a => {
            const d = el('div', 'alert alert-' + a.lvl);
            d.innerHTML = '<span class="shrink-0">' + a.icon + '</span><span>' + a.html + '</span>';
            box.appendChild(d);
        });
    }

    /* ---------------- strip ---------------- */

    /** Totals across every lane in the quotation (this is what the customer sees). */
    function quoteTotals() {
        const lines = [];
        state.lanes.forEach(lane => {
            const opt = lane.candidates.find(o => o.rateId === lane.selectedRateId);
            if (opt) lines.push.apply(lines, opt.lines);
        });
        return lines;
    }

    function render(rule) {
        const lines = quoteTotals();
        const m = QG.engine.margin(lines, rule);

        // Under BadFx the foreign-currency lines contribute 0 THB — the totals are not just
        // "low", they are wrong. Show them struck through rather than letting a plausible
        // number stand in for money the old system silently dropped.
        const unreliable = m.badFxLines > 0;
        [['#mSold', m.sold], ['#mCost', m.cost], ['#mKb', m.kb], ['#mMargin', m.margin]].forEach(([sel, v]) => {
            const n = $(sel);
            n.textContent = money(v, 2);
            n.className = 'font-mono tabular-nums' + (unreliable ? ' line-through text-rose-400' : '');
        });

        const pctEl = $('#mPct');
        // never print a Margin% next to BLOCKED — it reads as a real figure
        pctEl.textContent = (m.verdict === 'BLOCKED' || m.pct == null) ? '—' : money(m.pct, 2) + '%';
        pctEl.className = 'px-2 py-0.5 rounded-full font-semibold tabular-nums ' +
            (m.verdict === 'PASS' ? 'bg-emerald-100 text-emerald-800'
             : m.verdict === 'BELOW' ? 'bg-amber-100 text-amber-800'
             : 'bg-rose-100 text-rose-800');

        $('#mRule').innerHTML = '<span class="text-slate-400">เกณฑ์</span> <b class="font-mono">' + esc(rule.ruleId) +
            '</b> ≥ ' + rule.minMarginPct + '% และ ≥ ' + rule.minProfitTHB.toLocaleString() + ' THB' +
            (rule._overriddenBy ? ' <span class="pill pill-override">override</span>' : '') +
            (rule._outOfValidity ? ' <span class="pill pill-danger">นอก Validity</span>' : '');

        const v = VERDICT[m.verdict];
        $('#mVerdict').innerHTML = '<span class="pill ' + v.cls + '">' + v.text + '</span>' +
            ' <span class="text-slate-400 text-[11px] ml-1">' + esc(m.why) + '</span>';

        return m;
    }

    return { render, renderAlerts, quoteTotals, alertsFor };
})();
