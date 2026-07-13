/* gate.js — right column: verdict banner, margin math, "why margin moved"
   narrative, and the approval workflow (Confirm / Wait → Approve Profit →
   Approve Credit) that mirrors the SFBOOK state machine after §6.2. */
window.BG = window.BG || {};
window.BG.gate = (function () {
    'use strict';

    const { $, el, esc, money, round } = BG.utils;
    const { state } = BG.state;

    const VERDICT = {
        PASS:         { cls: 'pass',    tag: 'v-pass',    label: 'PASS',         icon: '✓' },
        NEED_APPROVE: { cls: 'need',    tag: 'v-need',    label: 'NEED APPROVE', icon: '▲' },
        BLOCKED:      { cls: 'blocked', tag: 'v-blocked', label: 'BLOCKED',      icon: '■' }
    };

    let _h = {};

    /* ---------------- verdict + margin math ---------------- */

    function renderVerdict(verdict, profit, rule, booking) {
        $('#verdictCard').classList.remove('hidden');
        const v = VERDICT[verdict.result];
        const banner = $('#verdictBanner');
        banner.innerHTML =
            '<div class="verdict verdict-' + v.cls + ' ' + v.tag + '">' +
            '<div class="flex items-center gap-2"><span class="text-2xl">' + v.icon + '</span>' +
            '<h2>' + v.label + '</h2>' +
            (verdict.tolerance ? '<span class="pill pill-ok ml-2">ผ่านด้วย Tolerance</span>' : '') +
            (verdict.failOpen ? '<span class="pill pill-warn ml-2">FailOpen</span>' : '') +
            '</div>' +
            '<div class="text-[11px] mt-1 text-slate-600">' + esc(verdict.detail) + '</div>' +
            '</div>';

        // margin math
        const math = $('#marginMath');
        if (verdict.result === 'BLOCKED' && verdict.badFx) {
            math.innerHTML = '<div class="alert alert-danger mt-3"><span>■</span><span>' + esc(verdict.detail) +
                '<br>ระบบเดิมคูณด้วย 0 แล้วเงินหายเงียบ — FPI หยุดไว้ที่จุดนี้ (§6.2)</span></div>';
            return;
        }
        if (verdict.result === 'BLOCKED') {
            math.innerHTML = '<div class="alert alert-danger mt-3"><span>■</span><span>' + esc(verdict.detail) + '</span></div>';
            return;
        }

        const base = profit.rtSold + profit.rtKB;
        math.innerHTML = '<table class="mm mt-3">' +
            mmRow('Sold (Σ Bill × FX)', money(profit.rtSold, 2), 'text-blue-700') +
            mmRow('Cost (Σ Cost × FX)', '− ' + money(profit.rtCost, 2), 'text-amber-700') +
            (profit.rtKB ? mmRow('KB (Rebate บวกกลับ)', '+ ' + money(profit.rtKB, 2), 'text-amber-600') : '') +
            '<tr class="total"><td>Margin</td><td>' + money(verdict.margin, 2) + '</td></tr>' +
            '<tr><td class="text-slate-400">Margin% = Margin × 100 / (Sold' + (profit.rtKB ? '+KB' : '') + ')</td>' +
            '<td class="' + (verdict.result === 'PASS' ? 'text-emerald-700' : 'text-amber-700') + '">' +
            round(verdict.marginPct, 2) + '%</td></tr>' +
            '<tr><td class="text-slate-400 text-[11px]">เกณฑ์ ' + esc(rule.ruleName) + '</td>' +
            '<td class="text-slate-400 text-[11px]">≥ ' + rule.minMarginPct + '% · ≥ ' + rule.minProfitTHB.toLocaleString() + '</td></tr>' +
            '</table>';
    }

    function mmRow(label, val, cls) {
        return '<tr><td class="text-slate-500">' + label + '</td><td class="' + (cls || '') + '">' + val + '</td></tr>';
    }

    /* ---------------- why margin moved (the manager's key view) ---------------- */

    function renderWhy(af, profit, verdict, rule) {
        const card = $('#whyCard');
        // only meaningful when a cost delta pushed the margin down
        if (!af || !af.alert || !af.supersededLines.length || verdict.result === 'PASS') {
            card.classList.add('hidden');
            return;
        }
        card.classList.remove('hidden');
        const base = profit.rtSold + profit.rtKB;
        const marginAtQuote = base ? round((profit.rtSold - (profit.rtCost - af.totalDelta) + profit.rtKB) * 100 / base, 2) : 0;
        const passedAtQuote = marginAtQuote >= rule.minMarginPct;

        $('#whyBody').innerHTML =
            '<div class="alert alert-info"><span>ⓘ</span><span>' +
            'ราคาขาย <b>Lock ตามใบเสนอราคา</b> ไม่เปลี่ยน แต่ต้นทุนตลาดขึ้น ' +
            '<b>+' + money(af.totalDelta, 0) + ' THB (+' + af.deltaPct + '%)</b> ผ่าน Superseded Chain' +
            '</span></div>' +
            '<div class="mt-2 grid grid-cols-2 gap-2 text-center">' +
            '<div class="rounded-md border border-slate-200 p-2">' +
            '<div class="text-[10px] text-slate-400">ณ วันเสนอราคา</div>' +
            '<div class="text-lg font-bold ' + (passedAtQuote ? 'text-emerald-700' : 'text-amber-700') + '">' + marginAtQuote + '%</div>' +
            '<div class="text-[10px] ' + (passedAtQuote ? 'text-emerald-600' : 'text-amber-600') + '">' +
            (passedAtQuote ? 'ผ่านเกณฑ์' : 'ต่ำกว่าเกณฑ์') + '</div></div>' +
            '<div class="rounded-md border border-amber-200 bg-amber-50 p-2">' +
            '<div class="text-[10px] text-slate-400">ณ วันจอง</div>' +
            '<div class="text-lg font-bold text-amber-700">' + round(verdict.marginPct, 2) + '%</div>' +
            '<div class="text-[10px] text-amber-600">ต่ำกว่าเกณฑ์</div></div>' +
            '</div>' +
            '<div class="mt-2 text-[11px] text-slate-600 leading-relaxed">' +
            '<b>Margin ตกเพราะตลาดขึ้น ไม่ใช่ Sales ตั้งราคาต่ำ</b> — ' +
            (passedAtQuote
                ? 'ณ วันเสนอราคา margin ผ่านเกณฑ์ (' + marginAtQuote + '% ≥ ' + rule.minMarginPct + '%). '
                : '') +
            'ตัวเลือก: อนุมัติตามนี้ หรือสั่ง Revise Quotation ก่อนรอบจองถัดไป' +
            '</div>';
    }

    /* ---------------- workflow ---------------- */

    function renderWorkflow(booking, verdict, wf, rule) {
        $('#workflowCard').classList.remove('hidden');
        const pill = $('#docStatPill');
        const pillCls = wf.docStat === 'Confirmed' ? 'pill-ok' : wf.docStat === 'Wait' ? 'pill-wait' : 'pill-muted';
        pill.innerHTML = '<span class="pill ' + pillCls + '">DOCSTAT: ' + esc(wf.docStat) + '</span>';

        const box = $('#workflowBody');

        // tolerance simulator (§6.2 PASS-Tol) — only relevant when below floor
        let sim = '';
        if (verdict.result === 'NEED_APPROVE' || (verdict.tolerance)) {
            sim = '<div class="rounded-md bg-slate-50 border border-slate-200 p-2 text-[11px]">' +
                '<label class="flex items-center gap-2 cursor-pointer select-none">' +
                '<input type="checkbox" id="tolSim" class="accent-amber-600" ' + (state.prevSim.on ? 'checked' : '') + '>' +
                '<span>จำลอง: เคยอนุมัติ booking นี้ไว้ที่</span>' +
                '<input type="number" id="tolPct" step="0.1" value="' + state.prevSim.pct + '" class="inp w-16 py-0.5" ' +
                (state.prevSim.on ? '' : 'disabled') + '>' +
                '<span>%</span></label>' +
                '<div class="text-[10px] text-slate-400 mt-1">Tolerance ' + rule.tolerancePP +
                ' จุด — ถ้า margin ปัจจุบันลดจากที่อนุมัติไม่เกินนี้ จะผ่านโดยไม่ต้องอนุมัติซ้ำ (D3)</div>' +
                '</div>';
        }

        // step tracker
        const confirmed = wf.docStat === 'Confirmed';
        let steps = '';
        if (verdict.result === 'BLOCKED') {
            steps = '<div class="alert alert-danger"><span>■</span><span>แก้ไขสาเหตุ BLOCKED ก่อนจึงจะ Confirm ได้</span></div>';
        } else if (verdict.result === 'PASS') {
            steps =
                stepRow(1, 'ประเมิน Margin', 'done', 'PASS ' + round(verdict.marginPct, 2) + '%') +
                stepRow(2, 'Confirm Booking', confirmed ? 'done' : 'active',
                    confirmed ? 'ยืนยันแล้ว · MARGINPCN = ' + round(wf.marginPct, 2) + '%' : '') +
                (confirmed ? '' :
                    '<button id="btnConfirm" class="btn-primary w-full mt-1">Confirm Booking</button>');
        } else {
            // NEED_APPROVE flow
            const wait = wf.docStat === 'Wait' || confirmed;
            steps =
                stepRow(1, 'ประเมิน Margin', 'done', round(verdict.marginPct, 2) + '% < ' + rule.minMarginPct + '%') +
                stepRow(2, 'ส่งเข้าอนุมัติ (DOCSTAT = Wait)', wait ? 'done' : 'active', '') +
                stepRow(3, 'Approve Profit (Manager)', wf.isProApp ? 'done' : (wait ? 'active' : 'todo'),
                    wf.isProApp ? 'อนุมัติแล้ว' : '') +
                stepRow(4, 'Approve Credit', wf.isCreditApp ? 'done' : (wf.isProApp ? 'active' : 'todo'),
                    wf.isCreditApp ? 'อนุมัติแล้ว' : '') +
                stepRow(5, 'Confirm Booking', confirmed ? 'done' : (wf.isCreditApp ? 'active' : 'todo'),
                    confirmed ? 'ยืนยันแล้ว' : '');
            steps += '<div class="flex flex-wrap gap-2 mt-1">';
            if (!wait) steps += '<button id="btnWait" class="btn-primary flex-1">ส่งเข้าอนุมัติ</button>';
            if (wait && !wf.isProApp) steps += '<button id="btnProfit" class="btn-approve flex-1">Approve Profit</button>';
            if (wf.isProApp && !wf.isCreditApp) steps += '<button id="btnCredit" class="btn-approve flex-1">Approve Credit</button>';
            if (wf.isCreditApp && !confirmed) steps += '<button id="btnConfirm" class="btn-primary flex-1">Confirm Booking</button>';
            steps += '</div>';
        }

        let logHtml = '';
        if (wf.log && wf.log.length) {
            logHtml = '<div class="mt-2 border-t border-slate-100 pt-2 space-y-0.5">' +
                wf.log.map(e => '<div class="text-[10px] text-slate-400"><span class="font-mono">' + esc(e.at) +
                    '</span> · ' + esc(e.action) + (e.note ? ' — ' + esc(e.note) : '') + '</div>').join('') +
                '</div>';
        }

        box.innerHTML = sim + '<div class="space-y-1.5">' + steps + '</div>' + logHtml;
        wireWorkflow();
    }

    function stepRow(n, label, kind, sub) {
        return '<div class="wf-step"><span class="wf-num wf-' + kind + '">' + (kind === 'done' ? '✓' : n) + '</span>' +
            '<span class="flex-1 ' + (kind === 'todo' ? 'text-slate-400' : 'text-slate-700') + '">' + esc(label) +
            (sub ? ' <span class="text-[10px] text-slate-400">— ' + esc(sub) + '</span>' : '') + '</span></div>';
    }

    function wireWorkflow() {
        const tol = $('#tolSim');
        if (tol) tol.onchange = () => { $('#tolPct').disabled = !tol.checked; _h.onTolSim(tol.checked, parseFloat($('#tolPct').value)); };
        const tolp = $('#tolPct');
        if (tolp) tolp.onchange = () => _h.onTolSim(true, parseFloat(tolp.value));
        const map = { btnConfirm: 'onConfirm', btnWait: 'onWait', btnProfit: 'onProfit', btnCredit: 'onCredit' };
        Object.keys(map).forEach(id => { const b = $('#' + id); if (b) b.onclick = () => _h[map[id]](); });
    }

    function render(booking, profit, verdict, af, rule, handlers) {
        _h = handlers || {};
        renderVerdict(verdict, profit, rule, booking);
        renderWhy(af, profit, verdict, rule);
        renderWorkflow(booking, verdict, BG.state.wf(booking.docNo), rule);
    }

    function clear() {
        ['verdictCard', 'whyCard', 'workflowCard'].forEach(id => $('#' + id).classList.add('hidden'));
    }

    return { render, clear };
})();
