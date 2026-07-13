/* profit.js — the Margin Gate engine (no DOM).
   Ports two database objects from FPI_DDL_v1.0.sql verbatim:
     vFPI_BookProfit           §6.1 — per-line FX + RTSold / RTCost / RTKB / BadFxLines
     FPI_EvaluateBookingMargin §6.2 — PASS / PASS(Tol) / NEED_APPROVE / BLOCKED

   Verified against data/bookings.json: BSE26070010 → PASS (10.09%),
   BSE26090004 → NEED_APPROVE (3.99%, cost +9,125), BSE26070015 → BLOCKED (BadFx). */
window.BG = window.BG || {};
window.BG.profit = (function () {
    'use strict';

    const { round } = BG.utils;

    /**
     * Per-line FX (vFPI_BookProfit):
     *   THB                       → 1
     *   foreign & ItemRate = 1    → DocRate   (line inherited the document rate)
     *   foreign & ItemRate > 0    → ItemRate
     *   foreign & ItemRate = 0    → BadFx (returned separately; FX here is 0)
     */
    function lineFx(line, booking) {
        const cur = (line.itemCurr || 'THB').toUpperCase();
        if (cur === 'THB') return 1;
        if ((line.itemRate || 0) === 1) return booking.docRate || 1;
        return line.itemRate || 0;
    }

    function isBadFx(line) {
        const cur = (line.itemCurr || 'THB').toUpperCase();
        return cur !== 'THB' && (line.itemRate || 0) === 0;
    }

    /** SRCAMT — the source-currency amount of one line before FX. */
    function srcAmt(line) {
        return (line.qty || 0) * (line.unitPrice || 0);
    }

    /**
     * vFPI_BookProfit for one booking. Returns per-line detail (for the grid) plus the
     * aggregate RTSold / RTCost / RTKB / BadFxLines.
     */
    function bookProfit(booking) {
        const lines = booking.lines.map(l => {
            const fx = lineFx(l, booking);
            const bad = isBadFx(l);
            const src = srcAmt(l);
            const thb = bad ? 0 : src * fx;
            const rebate = l.transType === 'Cost' && BG.state.isRebateCharge(booking.jobClass, l.expCode);
            let fxVia;
            if ((l.itemCurr || 'THB').toUpperCase() === 'THB') fxVia = 'THB = 1';
            else if (bad) fxVia = 'FX = 0 (BadFx)';
            else if ((l.itemRate || 0) === 1) fxVia = 'DocRate ' + (booking.docRate || 1);
            else fxVia = 'ItemRate ' + l.itemRate;
            return Object.assign({}, l, { fx, badFx: bad, srcAmt: src, thb, rebate, fxVia });
        });

        const bills = lines.filter(l => l.transType === 'Bill');
        const costs = lines.filter(l => l.transType === 'Cost');

        return {
            lines, bills, costs,
            hasLines: lines.length > 0,
            rtSold: bills.reduce((s, l) => s + l.thb, 0),
            rtCost: costs.reduce((s, l) => s + l.thb, 0),
            rtKB: costs.filter(l => l.rebate).reduce((s, l) => s + l.thb, 0),
            badFxLines: lines.filter(l => l.badFx).length
        };
    }

    /**
     * FPI_EvaluateBookingMargin. `prev` is the previously-approved context
     * { isApproved, marginPct } used for the tolerance branch (§6.2 PASS-Tol);
     * pass null when the booking was never approved.
     */
    function evaluate(profit, rule, prev) {
        if (!rule) {
            return blocked('ไม่พบ Margin Rule ที่ใช้ได้ — ตรวจสอบ FPI_MarginRule');
        }
        if (!profit.hasLines || profit.rtSold == null && profit.rtCost == null) {
            // no Bill/Cost lines at all
        }
        if (!profit.hasLines) {
            return rule.failOpenIfNoData
                ? { result: 'PASS', marginPct: 0, margin: 0, detail: 'ไม่มีข้อมูล (FailOpen เปิดอยู่)', failOpen: true }
                : blocked('ไม่มีบรรทัด Bill/Cost — กรุณากรอกก่อน Confirm');
        }
        if (profit.badFxLines > 0) {
            return blocked('มีบรรทัดสกุลต่างประเทศที่ FX Rate = 0 จำนวน ' + profit.badFxLines +
                ' บรรทัด — แก้ไขก่อน Confirm', { badFx: true });
        }

        const margin = profit.rtSold - profit.rtCost + profit.rtKB;      // D3
        const base = profit.rtSold + profit.rtKB;
        const marginPct = base === 0 ? 0 : round(margin * 100 / base, 2);

        const passFloor = marginPct >= rule.minMarginPct && margin >= rule.minProfitTHB;
        if (passFloor) {
            return { result: 'PASS', marginPct, margin, detail: 'ผ่านเกณฑ์: ' + rule.ruleName };
        }

        // PASS(Tol): previously approved and the drop from that approval is within TolerancePP
        if (prev && prev.isApproved && (marginPct - prev.marginPct) > -rule.tolerancePP) {
            return {
                result: 'PASS', marginPct, margin, tolerance: true,
                detail: 'ต่ำกว่าเกณฑ์ แต่เปลี่ยนจากที่อนุมัติไว้ (' + prev.marginPct +
                        '%) ไม่เกิน ' + rule.tolerancePP + ' จุด'
            };
        }

        const reasons = ['Margin ' + marginPct + '% ต่ำกว่าเกณฑ์ ' + rule.minMarginPct + '% (' + rule.ruleName + ')'];
        if (margin < rule.minProfitTHB) {
            reasons.push('กำไร ' + round(margin, 2).toLocaleString() + ' < ขั้นต่ำ ' + rule.minProfitTHB.toLocaleString() + ' บาท');
        }
        return { result: 'NEED_APPROVE', marginPct, margin, detail: reasons.join(' และ '), reasons };
    }

    function blocked(detail, extra) {
        return Object.assign({ result: 'BLOCKED', marginPct: 0, margin: 0, detail }, extra || {});
    }

    return { lineFx, isBadFx, srcAmt, bookProfit, evaluate };
})();
