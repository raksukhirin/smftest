/* app.js — bootstrap + evaluate pipeline + workflow actions. */
window.BG = window.BG || {};
window.BG.app = (function () {
    'use strict';

    const { $, esc, round, todayISO } = BG.utils;
    const { state } = BG.state;

    let _cur = null;   // { booking, profit, rule, af, verdict }

    /* ---------------- reason modal ---------------- */

    function askReason(title, desc, optional) {
        return new Promise(resolve => {
            const m = $('#reasonModal');
            $('#reasonTitle').textContent = title;
            $('#reasonDesc').innerHTML = desc;
            $('#reasonText').value = '';
            $('#reasonErr').classList.add('hidden');
            m.classList.remove('hidden');
            setTimeout(() => $('#reasonText').focus(), 0);
            const done = val => {
                m.classList.add('hidden');
                $('#reasonOk').onclick = null; $('#reasonCancel').onclick = null;
                resolve(val);
            };
            $('#reasonOk').onclick = () => {
                const v = $('#reasonText').value.trim();
                if (!optional && v.length < 5) { $('#reasonErr').classList.remove('hidden'); return; }
                done(v || '(ไม่ระบุ)');
            };
            $('#reasonCancel').onclick = () => done(null);
        });
    }

    function stamp(docNo, action, note) {
        const w = BG.state.wf(docNo);
        w.log.push({ action, note: note || '', at: todayISO() });
        BG.state.saveWorkflow();
    }

    /* ---------------- evaluate ---------------- */

    function prevContext() {
        return state.prevSim.on ? { isApproved: true, marginPct: state.prevSim.pct } : null;
    }

    function evaluate() {
        const b = _cur.booking;
        _cur.profit = BG.profit.bookProfit(b);
        _cur.rule = BG.state.marginRule(b);
        _cur.af = BG.autofill.analyze(b, _cur.profit);

        // Tolerance (§6.2 PASS-Tol) compares against a *prior* approval cycle. Within this
        // booking's own workflow, approving Profit must NOT flip the verdict to PASS — it is
        // a step in the NEED_APPROVE flow, not a previous cycle. Only the simulator stands in
        // for "this booking was approved before at X% and is being re-evaluated now".
        _cur.verdict = BG.profit.evaluate(_cur.profit, _cur.rule, prevContext());
    }

    function rerender() {
        BG.grid.renderHeader(_cur.booking, _cur.rule);
        BG.grid.renderLines(_cur.profit);
        BG.grid.renderAutofill(_cur.af, _cur.booking);
        BG.gate.render(_cur.booking, _cur.profit, _cur.verdict, _cur.af, _cur.rule, handlers);
        BG.grid.renderList();   // refresh status pills
    }

    function select(docNo) {
        state.activeDocNo = docNo;
        _cur = { booking: BG.state.booking(docNo) };
        evaluate();
        rerender();
    }

    /* ---------------- workflow handlers ---------------- */

    const handlers = {
        onTolSim(on, pct) {
            state.prevSim.on = on;
            if (isFinite(pct)) state.prevSim.pct = pct;
            evaluate();
            rerender();
        },
        async onConfirm() {
            const w = BG.state.wf(_cur.booking.docNo);
            w.docStat = 'Confirmed';
            w.marginPct = _cur.verdict.marginPct;
            stamp(_cur.booking.docNo, 'Confirm Booking', 'MARGINPCN = ' + round(_cur.verdict.marginPct, 2) + '%');
            BG.state.saveWorkflow();
            rerender();
        },
        async onWait() {
            const w = BG.state.wf(_cur.booking.docNo);
            w.docStat = 'Wait';
            stamp(_cur.booking.docNo, 'ส่งเข้าอนุมัติ (DOCSTAT = Wait)');
            rerender();
        },
        async onProfit() {
            const reason = await askReason(
                'Approve Profit (Manager) — ระบุเหตุผล',
                'Margin <b>' + round(_cur.verdict.marginPct, 2) + '%</b> ต่ำกว่าเกณฑ์ ' + _cur.rule.minMarginPct + '%.' +
                (_cur.af && _cur.af.alert ? ' ต้นทุนขึ้น <b>+' + BG.utils.money(_cur.af.totalDelta, 0) + ' THB</b> จากตลาด (Superseded Chain).' : '') +
                ' บันทึกเหตุผลที่อนุมัติให้ผ่านทั้งที่ต่ำกว่าเกณฑ์',
                false);
            if (!reason) return;
            const w = BG.state.wf(_cur.booking.docNo);
            w.isProApp = true;
            w.marginPct = _cur.verdict.marginPct;      // baseline for future Tolerance checks
            stamp(_cur.booking.docNo, 'Approve Profit', reason);
            evaluate(); rerender();
        },
        async onCredit() {
            const reason = await askReason(
                'Approve Credit — ระบุเหตุผล',
                'อนุมัติเครดิตลูกค้า <b>' + esc(_cur.booking.shipper) + '</b> สำหรับ booking นี้',
                true);
            if (reason === null) return;
            const w = BG.state.wf(_cur.booking.docNo);
            w.isCreditApp = true;
            stamp(_cur.booking.docNo, 'Approve Credit', reason);
            rerender();
        }
    };

    /* ---------------- boot ---------------- */

    async function boot() {
        await BG.state.load();
        $('#statBookings').textContent = BG.state.db.bookings.length;
        $('#statSource').textContent = state.source;

        BG.grid.renderList(select);

        $('#resetBtn').onclick = () => {
            BG.state.resetAllWorkflow();
            state.prevSim = { on: false, pct: 8.0 };
            if (_cur) { evaluate(); rerender(); }
            else BG.grid.renderList();
        };

        // auto-select the most instructive scenario
        select('BSE26090004');
    }

    return { boot, select };
})();

document.addEventListener('DOMContentLoaded', () => BG.app.boot());
